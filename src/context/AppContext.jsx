import { createContext, useState, useContext, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const AppContext = createContext();

// Create an axios instance for the API
export const api = axios.create({
  baseURL: '/api'
});

export function AppProvider({ children }) {
  // Authentication State
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Global Data States
  const [officeTime, setOfficeTime] = useState('09:00'); // This could be fetched from backend settings
  const [officeEndTime, setOfficeEndTime] = useState('17:00');
  const [officeLat, setOfficeLat] = useState('27.7172');
  const [officeLng, setOfficeLng] = useState('85.3240');
  const [geofenceRadius, setGeofenceRadius] = useState('500');
  const [holidays, setHolidays] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [employeeHistory, setEmployeeHistory] = useState([]); // Specifically for the current employee's dashboard
  const [contacts, setContacts] = useState([]);
  const [users, setUsers] = useState([]);
  const [chatMessages, setChatMessages] = useState({});
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const socketRef = useRef(null);
  
  // Backwards compatibility for prototype UI
  const currentEmployeeId = user?.id || 1;
  const currentEmployeeDetails = user ? {
    name: user.name,
    idNumber: user.idNumber,
    designation: user.designation
  } : null;

  // Setup Axios Interceptor for auth token
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use(config => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    const responseInterceptor = api.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          logout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  // Initial Auth Check
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data.user);
        } catch (err) {
          console.error("Auth check failed:", err);
          logout();
        }
      }
      setIsLoadingAuth(false);
    };
    checkAuth();
  }, []);

  // Theme Effect
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Fetch Data when user is authenticated
  useEffect(() => {
    if (!user) return;
    
    const fetchData = async () => {
      try {
        // Fetch Settings
        const settingsRes = await api.get('/settings');
        if (settingsRes.data.officeTime) setOfficeTime(settingsRes.data.officeTime);
        if (settingsRes.data.officeEndTime) setOfficeEndTime(settingsRes.data.officeEndTime);
        if (settingsRes.data.officeLat) setOfficeLat(settingsRes.data.officeLat);
        if (settingsRes.data.officeLng) setOfficeLng(settingsRes.data.officeLng);
        if (settingsRes.data.geofenceRadius) setGeofenceRadius(settingsRes.data.geofenceRadius);
        if (settingsRes.data.holidays) setHolidays(JSON.parse(settingsRes.data.holidays));

        // Fetch Attendance
        const attRes = await api.get('/attendance');
        if (user.role === 'admin') {
          // Format for admin table
          const formatted = attRes.data.map(r => ({
            id: r.id, name: r.name, role: r.role, date: r.time.split(',')[0], 
            punchIn: r.action === 'Punch In' ? new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:-- PM',
            punchOut: r.action === 'Punch Out' ? new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:-- PM',
            status: 'Working', location: { lat: r.lat, lng: r.lng, address: r.address }
          }));
          // For simplicity in prototype, just keeping raw records or basic format
          setAttendanceRecords(formatted);
        } else {
          // Format for employee history
          const formatted = attRes.data.map(r => ({
            id: r.id, action: r.action, time: new Date(r.time), location: { lat: r.lat, lng: r.lng, address: r.address }
          }));
          setEmployeeHistory(formatted);
        }

        // Fetch Leaves
        const leaveRes = await api.get('/leaves');
        setLeaveRequests(leaveRes.data);

        // Fetch Chat/Contacts
        // Very basic mock of transforming raw messages into the contacts/messages maps
        const msgRes = await api.get('/messages');
        const msgs = msgRes.data;
        
        const usersRes = await api.get('/users');
        const rawUsers = usersRes.data;
        setUsers(rawUsers);
        const allUsers = rawUsers.filter(u => u.id !== user.id); // Everyone except me
        
        // Build contacts
        const mappedContacts = allUsers.map(u => ({
          id: u.id, name: u.name, lastMessage: '', time: '', unread: 0
        }));
        setContacts(mappedContacts);
        
        // Build message map (grouped by the OTHER person)
        const messagesMap = {};
        msgs.forEach(m => {
          const otherId = m.senderId === user.id ? m.receiverId : m.senderId;
          if (!messagesMap[otherId]) messagesMap[otherId] = [];
          
          messagesMap[otherId].push({
            id: m.id,
            text: m.text,
            time: m.time,
            sender: m.senderId === user.id ? (user.role==='admin'?'manager':'employee') : (m.senderRole==='admin'?'manager':'employee'),
            isAuto: m.isAuto
          });
        });
        setChatMessages(messagesMap);

      } catch (err) {
        console.error("Failed to fetch initial data:", err);
      }
    };

    fetchData();

    // Initialize Socket.io
    const socket = io(window.location.origin);
    socketRef.current = socket;

    // Request Notification Permissions
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    socket.on('new_message', (msg) => {
      // Don't duplicate if we just sent it
      if (msg.senderId === user.id) return;
      
      const otherId = msg.senderId;
      const formattedMsg = {
        id: msg.id,
        text: msg.text,
        time: msg.time,
        sender: msg.senderRole === 'admin' ? 'manager' : 'employee',
        isAuto: msg.isAuto
      };

      setChatMessages(prev => ({
        ...prev,
        [otherId]: [...(prev[otherId] || []), formattedMsg]
      }));

      // Update contact unread count & last message if Admin
      if (user.role === 'admin') {
        setContacts(prev => prev.map(c => 
          c.id === otherId ? { ...c, lastMessage: msg.text, time: msg.time, unread: c.unread + 1 } : c
        ));
      }

      // Trigger Desktop Push Notification if backgrounded
      if ("Notification" in window && Notification.permission === "granted") {
        if (document.hidden) {
          const notificationTitle = msg.isAuto ? "Automated Alert" : `New Message from ${formattedMsg.sender}`;
          const n = new Notification(notificationTitle, {
            body: msg.text,
            icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' // generic avatar icon
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        }
      }
    });

    socket.on('new_attendance', (record) => {
      if (user.role === 'admin') {
        const formatted = {
          id: record.id, name: record.name, role: record.role, date: record.time.split(',')[0], 
          punchIn: record.action === 'Punch In' ? new Date(record.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:-- PM',
          punchOut: record.action === 'Punch Out' ? new Date(record.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:-- PM',
          status: 'Working', location: { lat: record.lat, lng: record.lng, address: record.address }
        };
        // Add to top of list
        setAttendanceRecords(prev => [formatted, ...prev]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  const login = (userData) => {
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const sendAutomatedMessage = async (text) => {
    if (!user) return;
    try {
      const targetId = user.role === 'admin' ? 2 /* assume emp */ : 1 /* assume admin */;
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      await api.post('/messages', {
        receiverId: targetId,
        text,
        time: nowStr,
        isAuto: true
      });
      
      // Update local state instantly
      const newMessage = { id: Date.now(), text, sender: 'employee', time: nowStr, isAuto: true };
      setChatMessages(prev => ({
        ...prev,
        [targetId]: [...(prev[targetId] || []), newMessage]
      }));

    } catch (err) {
      console.error("Failed to send auto message", err);
    }
  };

  return (
    <AppContext.Provider value={{
      user, login, logout, isLoadingAuth,
      officeTime, setOfficeTime,
      officeEndTime, setOfficeEndTime,
      officeLat, setOfficeLat,
      officeLng, setOfficeLng,
      geofenceRadius, setGeofenceRadius,
      holidays, setHolidays,
      attendanceRecords, setAttendanceRecords,
      employeeHistory, setEmployeeHistory,
      contacts, setContacts,
      users, setUsers,
      chatMessages, setChatMessages,
      leaveRequests, setLeaveRequests,
      currentEmployeeId,
      currentEmployeeDetails,
      sendAutomatedMessage,
      theme, toggleTheme
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
