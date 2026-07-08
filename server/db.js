const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Create Tables
    db.serialize(() => {
      // Users Table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        idNumber TEXT UNIQUE NOT NULL,
        designation TEXT,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        department TEXT DEFAULT 'General',
        sickLeaveBalance INTEGER DEFAULT 12,
        casualLeaveBalance INTEGER DEFAULT 12
      )`);
      
      // Auto-migrate columns if missing
      db.run(`ALTER TABLE users ADD COLUMN sickLeaveBalance INTEGER DEFAULT 12`, (err) => {});
      db.run(`ALTER TABLE users ADD COLUMN casualLeaveBalance INTEGER DEFAULT 12`, (err) => {});
      db.run(`ALTER TABLE users ADD COLUMN department TEXT DEFAULT 'General'`, (err) => {});

      // Seed Initial Admin & Employee if not exists
      db.get("SELECT count(*) as count FROM users", [], (err, row) => {
        if (row && row.count === 0) {
          const salt = bcrypt.genSaltSync(10);
          const adminPassword = bcrypt.hashSync('admin123', salt);
          const employeePassword = bcrypt.hashSync('emp123', salt);
          
          db.run(`INSERT INTO users (name, idNumber, designation, password, role) VALUES (?, ?, ?, ?, ?)`, 
            ['System Admin', 'ADMIN-001', 'Manager', adminPassword, 'admin']);
            
          db.run(`INSERT INTO users (name, idNumber, designation, password, role) VALUES (?, ?, ?, ?, ?)`, 
            ['John Doe', 'EMP-001', 'Frontend Developer', employeePassword, 'employee']);
          
          console.log('Seeded initial users.');
        }
      });

      // Attendance Table
      db.run(`CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        action TEXT NOT NULL,
        time TEXT NOT NULL,
        lat REAL,
        lng REAL,
        address TEXT,
        isOvertime BOOLEAN DEFAULT 0,
        FOREIGN KEY(userId) REFERENCES users(id)
      )`);
      
      // Auto-migrate columns if missing
      db.run(`ALTER TABLE attendance ADD COLUMN isOvertime BOOLEAN DEFAULT 0`, (err) => {});

      // Leave Requests Table
      db.run(`CREATE TABLE IF NOT EXISTS leave_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        type TEXT DEFAULT 'Casual',
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'Pending',
        FOREIGN KEY(userId) REFERENCES users(id)
      )`);
      
      // Auto-migrate columns if missing
      db.run(`ALTER TABLE leave_requests ADD COLUMN type TEXT DEFAULT 'Casual'`, (err) => {});

      // Messages Table
      db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senderId INTEGER,
        receiverId INTEGER,
        text TEXT NOT NULL,
        time TEXT NOT NULL,
        isAuto BOOLEAN DEFAULT 0,
        FOREIGN KEY(senderId) REFERENCES users(id),
        FOREIGN KEY(receiverId) REFERENCES users(id)
      )`);

      // Settings Table (Key-Value)
      db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )`);
      
      db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('officeTime', '09:00')`);
      db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('officeEndTime', '17:00')`);
      db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('officeLat', '27.7172')`);
      db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('officeLng', '85.3240')`);
      db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('geofenceRadius', '500')`);
      db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('holidays', '[]')`);
    });
  }
});

module.exports = db;
