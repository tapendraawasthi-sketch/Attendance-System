const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT"]
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'supersecret_attendance_key_2026';

app.use(cors());
app.use(express.json());

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ==========================================
// AUTHENTICATION
// ==========================================

// Rate Limiter for Login (prevents brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per `window`
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { idNumber, password } = req.body;
  
  db.get(`SELECT * FROM users WHERE idNumber = ?`, [idNumber], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'Invalid ID or password' });
    
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid ID or password' });
    
    // Create token
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name, designation: user.designation, department: user.department }, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        idNumber: user.idNumber,
        designation: user.designation,
        department: user.department,
        role: user.role
      }
    });
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get(`SELECT id, name, idNumber, designation, department, role, sickLeaveBalance, casualLeaveBalance FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  });
});

// ==========================================
// ATTENDANCE ROUTES
// ==========================================

app.get('/api/attendance', authenticateToken, (req, res) => {
  let query = `SELECT a.*, u.name, u.role FROM attendance a JOIN users u ON a.userId = u.id ORDER BY a.id DESC`;
  let params = [];
  
  // If employee, only show their own history
  if (req.user.role === 'employee') {
    query = `SELECT * FROM attendance WHERE userId = ? ORDER BY id DESC`;
    params = [req.user.id];
  }
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/attendance', authenticateToken, (req, res) => {
  const { action, lat, lng, address, time, isOvertime } = req.body;
  const userId = req.user.id;
  
  db.run(`INSERT INTO attendance (userId, action, time, lat, lng, address, isOvertime) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
    [userId, action, time, lat, lng, address, isOvertime ? 1 : 0], 
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Fetch user details for real-time notification
      db.get(`SELECT name, role, department FROM users WHERE id = ?`, [userId], (err, user) => {
        const record = { id: this.lastID, userId, name: user.name, role: user.role, action, time, lat, lng, address, isOvertime: isOvertime ? 1 : 0 };
        io.emit('new_attendance', record);
        res.json(record);
      });
    }
  );
});

// ==========================================
// LEAVE ROUTES
// ==========================================

app.get('/api/leaves', authenticateToken, (req, res) => {
  let query = `SELECT l.*, u.name as employee FROM leave_requests l JOIN users u ON l.userId = u.id ORDER BY l.id DESC`;
  let params = [];
  
  // If employee, only show their own leaves
  if (req.user.role === 'employee') {
    query = `SELECT l.*, u.name as employee FROM leave_requests l JOIN users u ON l.userId = u.id WHERE userId = ? ORDER BY l.id DESC`;
    params = [req.user.id];
  }
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/leaves', authenticateToken, (req, res) => {
  const { type, startDate, endDate, reason } = req.body;
  const leaveType = type || 'Casual';
  db.run(`INSERT INTO leave_requests (userId, type, startDate, endDate, reason) VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, leaveType, startDate, endDate, reason],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, employee: req.user.name, type: leaveType, startDate, endDate, reason, status: 'Pending' });
    }
  );
});

app.put('/api/leaves/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  const { status } = req.body;
  
  if (status === 'Approved') {
    // We need to find the leave request, calculate days, and deduct from user balance
    db.get(`SELECT * FROM leave_requests WHERE id = ?`, [req.params.id], (err, leaveReq) => {
      if (err || !leaveReq) return res.status(404).json({ error: 'Leave not found' });
      
      const start = new Date(leaveReq.startDate);
      const end = new Date(leaveReq.endDate);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
      
      const columnToUpdate = leaveReq.type === 'Sick' ? 'sickLeaveBalance' : (leaveReq.type === 'Casual' ? 'casualLeaveBalance' : null);
      
      if (columnToUpdate) {
        db.run(`UPDATE users SET ${columnToUpdate} = ${columnToUpdate} - ? WHERE id = ?`, [diffDays, leaveReq.userId]);
      }
      
      db.run(`UPDATE leave_requests SET status = ? WHERE id = ?`, [status, req.params.id], function(updateErr) {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        res.json({ success: true });
      });
    });
  } else {
    // Just update status (e.g. Rejected)
    db.run(`UPDATE leave_requests SET status = ? WHERE id = ?`, [status, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  }
});

// ==========================================
// MESSAGE ROUTES
// ==========================================

// For prototype simplicity, all messages are between Admin and Employee (ID 1 = admin, others = employee)
// Admin fetches all messages grouped by employee, Employee fetches messages with admin

app.get('/api/messages', authenticateToken, (req, res) => {
  db.all(`SELECT m.*, s.name as senderName, s.role as senderRole FROM messages m JOIN users s ON m.senderId = s.id ORDER BY m.id ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/messages', authenticateToken, (req, res) => {
  const { receiverId, text, time, isAuto } = req.body;
  
  // Basic routing: if employee sends, it goes to admin (assume id 1). If admin sends, it goes to employee
  const targetId = receiverId || 1; 

  db.run(`INSERT INTO messages (senderId, receiverId, text, time, isAuto) VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, targetId, text, time, isAuto ? 1 : 0],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const msg = { id: this.lastID, senderId: req.user.id, receiverId: targetId, text, time, isAuto, senderRole: req.user.role };
      io.emit('new_message', msg);
      res.json(msg);
    }
  );
});

// ==========================================
// SETTINGS ROUTES
// ==========================================

app.get('/api/settings', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM settings`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  });
});

app.put('/api/settings', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  const { key, value } = req.body;
  
  db.run(`INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`, 
    [key, value], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ==========================================
// USERS / CONTACTS
// ==========================================
app.get('/api/users', authenticateToken, (req, res) => {
  db.all(`SELECT id, name, idNumber, designation, department, role, sickLeaveBalance, casualLeaveBalance FROM users`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  const { name, idNumber, password, designation, department, role } = req.body;
  const hash = bcrypt.hashSync(password, 8);
  const userRole = role || 'employee';
  const userDept = department || 'General';

  db.run(`INSERT INTO users (name, idNumber, password, designation, department, role) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, idNumber, hash, designation, userDept, userRole],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, name, idNumber, designation, department: userDept, role: userRole });
    }
  );
});

app.put('/api/users/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  const { name, idNumber, designation, department, role, password } = req.body;
  const userDept = department || 'General';
  
  if (password) {
    const hash = bcrypt.hashSync(password, 8);
    db.run(`UPDATE users SET name = ?, idNumber = ?, designation = ?, department = ?, role = ?, password = ? WHERE id = ?`,
      [name, idNumber, designation, userDept, role, hash, req.params.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  } else {
    db.run(`UPDATE users SET name = ?, idNumber = ?, designation = ?, department = ?, role = ? WHERE id = ?`,
      [name, idNumber, designation, userDept, role, req.params.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  }
});

app.delete('/api/users/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  // Cannot delete yourself
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

  db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// ==========================================
// DAILY SUMMARY EMAIL LOGIC
// ==========================================

let transporter;
nodemailer.createTestAccount((err, account) => {
  if (err) {
    console.error('Failed to create a testing account. ' + err.message);
    return;
  }
  transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass }
  });
});

const generateAndSendSummary = async () => {
  if (!transporter) return;
  const today = new Date().toISOString().split('T')[0];

  db.all(`SELECT count(*) as total FROM users WHERE role = 'employee'`, [], (err1, totalRes) => {
    db.all(`SELECT count(DISTINCT userId) as present FROM attendance WHERE action = 'Punch In' AND time LIKE '${today}%'`, [], (err2, presentRes) => {
      db.all(`SELECT count(*) as onLeave FROM leave_requests WHERE status = 'Approved' AND '${today}' BETWEEN startDate AND endDate`, [], (err3, leaveRes) => {
        const total = totalRes[0].total || 0;
        const present = presentRes[0].present || 0;
        const onLeave = leaveRes[0].onLeave || 0;
        const absent = Math.max(0, total - present - onLeave);

        const mailOptions = {
          from: '"Attendance System" <no-reply@attendance.local>',
          to: 'admin@attendance.local',
          subject: `Daily Attendance Summary - ${today}`,
          html: `
            <h2>Daily Attendance Summary</h2>
            <p><strong>Date:</strong> ${today}</p>
            <ul>
              <li><strong>Total Employees:</strong> ${total}</li>
              <li><strong>Present Today:</strong> ${present}</li>
              <li><strong>On Leave Today:</strong> ${onLeave}</li>
              <li><strong>Absent (No Leave):</strong> ${absent}</li>
            </ul>
            <p>This is an automated report.</p>
          `
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            return console.log('Error sending email:', error);
          }
          console.log('Daily Summary Email sent! Preview URL: %s', nodemailer.getTestMessageUrl(info));
        });
      });
    });
  });
};

// Schedule for 5:00 PM (17:00) every day
cron.schedule('0 17 * * *', () => {
  console.log('Running daily summary email cron job...');
  generateAndSendSummary();
});

// Manual trigger for testing
app.post('/api/admin/trigger-summary', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  generateAndSendSummary();
  res.json({ success: true, message: 'Summary email triggered. Check server logs for Preview URL.' });
});

server.listen(PORT, () => {
  console.log(`Backend server with Socket.io running on http://localhost:${PORT}`);
});
