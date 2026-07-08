import { useState, useRef, useEffect } from 'react';
import { Users, Settings, UserPlus, MapPin, Search, Trash2, Send, Download, CheckCircle, Calendar, XCircle, Clock, MessageSquare, MoreVertical, CheckCheck, Edit, FileDown, Check, X, AlertTriangle } from 'lucide-react';
import { useApp, api } from '../context/AppContext';
import { exportAttendanceToPDF, exportAttendanceToExcel } from '../utils/exportUtils';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from 'react-leaflet';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function AdminDashboard() {
  const { 
    officeTime, setOfficeTime, 
    officeEndTime, setOfficeEndTime,
    officeLat, setOfficeLat,
    officeLng, setOfficeLng,
    geofenceRadius, setGeofenceRadius,
    attendanceRecords, setAttendanceRecords, 
    contacts, setContacts, 
    chatMessages, setChatMessages,
    leaveRequests, setLeaveRequests,
    users, setUsers,
    holidays, setHolidays
  } = useApp();

  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance', 'leaves', 'messages', 'settings'
  const [searchTerm, setSearchTerm] = useState('');
  
  // WhatsApp Chat state
  const [activeContact, setActiveContact] = useState(contacts[0]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);
  
  // Settings State
  const [tempOfficeTime, setTempOfficeTime] = useState(officeTime);
  const [tempOfficeEndTime, setTempOfficeEndTime] = useState(officeEndTime);
  const [tempLat, setTempLat] = useState(officeLat);
  const [tempLng, setTempLng] = useState(officeLng);
  const [tempRadius, setTempRadius] = useState(geofenceRadius);
  
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  
  // User Modal State
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ name: '', idNumber: '', designation: '', department: 'General', password: '', role: 'employee' });
  const [filterDepartment, setFilterDepartment] = useState('All');

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeContact, isTyping]);
  
  // Ensure active contact stays in sync if global contacts update
  useEffect(() => {
    const updatedContact = contacts.find(c => c.id === activeContact.id);
    if (updatedContact) setActiveContact(updatedContact);
  }, [contacts, activeContact.id]);

  const handleApproveLeave = async (id) => {
    try {
      await api.put(`/leaves/${id}`, { status: 'Approved' });
      setLeaveRequests(leaveRequests.map(req => req.id === id ? { ...req, status: 'Approved' } : req));
    } catch (err) {
      console.error(err);
    }
  };
  
  const handleRejectLeave = async (id) => {
    try {
      await api.put(`/leaves/${id}`, { status: 'Rejected' });
      setLeaveRequests(leaveRequests.map(req => req.id === id ? { ...req, status: 'Rejected' } : req));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !activeContact) return;
    
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    try {
      const res = await api.post('/messages', {
        receiverId: activeContact.id,
        text: chatInput,
        time: nowStr,
        isAuto: false
      });

      const newMessage = { id: res.data.id, text: chatInput, sender: 'manager', time: nowStr, isAuto: false };
      
      setChatMessages(prev => ({
        ...prev,
        [activeContact.id]: [...(prev[activeContact.id] || []), newMessage]
      }));

      // Update contact preview
      setContacts(prev => prev.map(c => 
        c.id === activeContact.id ? { ...c, lastMessage: chatInput, time: nowStr } : c
      ));

      setChatInput('');
    } catch (err) {
      console.error(err);
    }
  };

  const selectContact = (contact) => {
    setActiveContact(contact);
    setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, unread: 0 } : c));
  };

  const saveSettings = async () => {
    try {
      await Promise.all([
        api.put('/settings', { key: 'officeTime', value: tempOfficeTime }),
        api.put('/settings', { key: 'officeEndTime', value: tempOfficeEndTime }),
        api.put('/settings', { key: 'officeLat', value: tempLat }),
        api.put('/settings', { key: 'officeLng', value: tempLng }),
        api.put('/settings', { key: 'geofenceRadius', value: tempRadius })
      ]);
      setOfficeTime(tempOfficeTime);
      setOfficeEndTime(tempOfficeEndTime);
      setOfficeLat(tempLat);
      setOfficeLng(tempLng);
      setGeofenceRadius(tempRadius);
      alert('Settings saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save settings');
    }
  };

  const handleAddHoliday = async () => {
    if (!holidayName || !holidayDate) return;
    const newHolidays = [...holidays, { id: Date.now(), name: holidayName, date: holidayDate }].sort((a,b) => new Date(a.date) - new Date(b.date));
    try {
      await api.put('/settings', { key: 'holidays', value: JSON.stringify(newHolidays) });
      setHolidays(newHolidays);
      setHolidayName('');
      setHolidayDate('');
    } catch (err) {
      console.error("Failed to add holiday", err);
    }
  };

  const handleRemoveHoliday = async (id) => {
    const newHolidays = holidays.filter(h => h.id !== id);
    try {
      await api.put('/settings', { key: 'holidays', value: JSON.stringify(newHolidays) });
      setHolidays(newHolidays);
    } catch (err) {
      console.error("Failed to remove holiday", err);
    }
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, userForm);
        setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...userForm } : u));
        alert('User updated successfully');
      } else {
        const res = await api.post('/users', userForm);
        setUsers([...users, res.data]);
        alert('User created successfully');
      }
      setShowUserModal(false);
      setEditingUser(null);
      setUserForm({ name: '', idNumber: '', designation: '', department: 'General', password: '', role: 'employee' });
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Operation failed');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!confirm('Are you sure you want to deactivate/delete this employee?')) return;
    try {
      await api.delete(`/users/${id}`);
      setUsers(users.filter(u => u.id !== id));
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Operation failed');
    }
  };

  // Add department to attendance records by matching userId
  const attendanceWithDept = attendanceRecords.map(record => {
    const u = users.find(u => u.name === record.name); // Using name as proxy since prototype attendance record might not have userId
    return { ...record, department: u ? (u.department || 'General') : 'General' };
  });

  const filteredAttendance = attendanceWithDept.filter(record => {
    const matchSearch = record.name.toLowerCase().includes(searchTerm.toLowerCase()) || record.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchDept = filterDepartment === 'All' || record.department === filterDepartment;
    return matchSearch && matchDept;
  });

  // Calculate Overview Stats
  const totalEmployees = users.filter(u => u.role !== 'admin').length;
  const presentToday = new Set(attendanceRecords.filter(r => r.action === 'Punch In').map(r => r.name)).size;
  const todayStr = new Date().toISOString().split('T')[0];
  const onLeaveToday = leaveRequests.filter(r => r.status === 'Approved' && r.startDate <= todayStr && r.endDate >= todayStr).length;
  const absentToday = Math.max(0, totalEmployees - presentToday - onLeaveToday);

  // Generate 7-Day Trend Data
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });
  
  const chartData = last7Days.map(dateStr => {
    const presentCount = new Set(attendanceRecords.filter(r => r.action === 'Punch In' && r.time.startsWith(dateStr)).map(r => r.name)).size;
    return { name: dateStr.split('-').slice(1).join('/'), Present: presentCount };
  });

  // Calculate Late Arrivals Leaderboard (Current Month)
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM
  const lateCounts = {};
  
  attendanceRecords.forEach(record => {
    if (record.action === 'Punch In' && record.time.startsWith(currentMonthStr)) {
      const officeDateObj = new Date(record.time);
      const [officeHours, officeMinutes] = officeTime.split(':').map(Number);
      officeDateObj.setHours(officeHours, officeMinutes, 0, 0);
      const diffMinutes = (new Date(record.time) - officeDateObj) / (1000 * 60);
      
      if (diffMinutes > 10) {
        lateCounts[record.name] = (lateCounts[record.name] || 0) + 1;
      }
    }
  });

  const lateLeaderboard = Object.entries(lateCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="container animate-fade-in" style={{ maxWidth: '1400px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Users size={28} color="var(--primary)" /> Admin Control Panel
          </h1>
          <p>Manage employees, attendance, and communications</p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className="btn btn-outline"
            onClick={() => exportAttendanceToPDF(filteredAttendance)}
            disabled={filteredAttendance.length === 0}
          >
            <Download size={18} /> Export PDF
          </button>
          <button 
            className="btn btn-outline"
            style={{ borderColor: '#107c41', color: '#107c41' }}
            onClick={() => exportAttendanceToExcel(filteredAttendance)}
            disabled={filteredAttendance.length === 0}
          >
            <FileDown size={18} /> Export Excel
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        
        {/* Tabs */}
        <div className="tabs" style={{ background: '#f8fafc', padding: '0 1rem', marginBottom: 0, borderBottom: '1px solid var(--surface-border)' }}>
          <button 
            className={`tab ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => setActiveTab('attendance')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', padding: '1rem', borderBottom: activeTab === 'attendance' ? '2px solid var(--primary)' : '2px solid transparent', fontSize: '0.95rem' }}
          >
            <Users size={18} /> Daily Attendance
          </button>
          <button 
            className={`tab ${activeTab === 'employees' ? 'active' : ''}`}
            onClick={() => setActiveTab('employees')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', padding: '1rem', borderBottom: activeTab === 'employees' ? '2px solid var(--primary)' : '2px solid transparent', fontSize: '0.95rem' }}
          >
            <UserPlus size={18} /> Employees
          </button>
          <button 
            className={`tab ${activeTab === 'leaves' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaves')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', padding: '1rem', borderBottom: activeTab === 'leaves' ? '2px solid var(--primary)' : '2px solid transparent', fontSize: '0.95rem' }}
          >
            <Calendar size={18} /> Leave Requests
            {leaveRequests.filter(l => l.status === 'Pending').length > 0 && (
              <span className="badge badge-danger" style={{ padding: '0.1rem 0.4rem', borderRadius: '10px' }}>
                {leaveRequests.filter(l => l.status === 'Pending').length}
              </span>
            )}
          </button>
          <button 
            className={`tab ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('messages')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', padding: '1rem', borderBottom: activeTab === 'messages' ? '2px solid var(--primary)' : '2px solid transparent', fontSize: '0.95rem' }}
          >
            <MessageSquare size={18} /> Employee Messages
            {contacts.reduce((acc, c) => acc + c.unread, 0) > 0 && (
               <span className="badge" style={{ background: '#25d366', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '10px' }}>
                {contacts.reduce((acc, c) => acc + c.unread, 0)}
              </span>
            )}
          </button>
          <button 
            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', padding: '1rem', borderBottom: activeTab === 'settings' ? '2px solid var(--primary)' : '2px solid transparent', fontSize: '0.95rem' }}
          >
            <Settings size={18} /> Settings
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: activeTab === 'messages' ? '0' : '1.5rem' }}>
          
          {activeTab === 'attendance' && (
              <div className="animate-fade-in">
                
                {/* Overview Stats Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                  <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
                    <div style={{ background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)', padding: '0.75rem', borderRadius: '12px' }}>
                      <Users size={24} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '500' }}>Total Employees</h4>
                      <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>{totalEmployees}</p>
                    </div>
                  </div>
                  <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '0.75rem', borderRadius: '12px' }}>
                      <CheckCircle size={24} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '500' }}>Present Today</h4>
                      <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>{presentToday}</p>
                    </div>
                  </div>
                  <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', padding: '0.75rem', borderRadius: '12px' }}>
                      <Calendar size={24} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '500' }}>On Leave</h4>
                      <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>{onLeaveToday}</p>
                    </div>
                  </div>
                  <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '0.75rem', borderRadius: '12px' }}>
                      <XCircle size={24} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: '500' }}>Absent</h4>
                      <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>{absentToday}</p>
                    </div>
                  </div>
                </div>

                {/* Analytics Grid: Trend Chart + Leaderboard */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                  {/* 7-Day Trend Chart */}
                  <div className="card" style={{ padding: '1.5rem', height: '100%' }}>
                    <h3 style={{ marginBottom: '1.5rem', marginTop: 0 }}>Attendance Trend (Last 7 Days)</h3>
                    <div style={{ height: '300px', width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} dy={10} />
                          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--surface-border)', color: 'var(--text-main)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                            cursor={{ fill: 'var(--surface-border)', opacity: 0.4 }}
                          />
                          <Bar dataKey="Present" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={50} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Late Arrivals Leaderboard */}
                  <div className="card" style={{ padding: '1.5rem', height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                      <AlertTriangle size={20} color="var(--warning)" />
                      <h3 style={{ margin: 0 }}>Late Arrivals (This Month)</h3>
                    </div>
                    {lateLeaderboard.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {lateLeaderboard.map((item, idx) => (
                          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--background)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                {idx + 1}
                              </div>
                              <span style={{ fontWeight: '500' }}>{item.name}</span>
                            </div>
                            <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{item.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center' }}>
                        <p>No late arrivals this month! 🎉</p>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <h3 style={{ margin: 0 }}>Today's Records</h3>
                  <div style={{ display: 'flex', gap: '1rem', width: '100%', maxWidth: '500px' }}>
                    <select 
                      className="form-input" 
                      style={{ width: '150px' }}
                      value={filterDepartment}
                      onChange={(e) => setFilterDepartment(e.target.value)}
                    >
                      <option value="All">All Departments</option>
                      <option value="General">General</option>
                      <option value="Sales">Sales</option>
                      <option value="IT">IT</option>
                      <option value="HR">HR</option>
                      <option value="Operations">Operations</option>
                    </select>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input 
                        type="text" 
                        placeholder="Search employee or role..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-input"
                        style={{ width: '100%', paddingLeft: '2.5rem' }} 
                      />
                    </div>
                  </div>
                </div>
              
              {/* Calculate paths for Location History Trail */}
              {(() => {
                const paths = {};
                filteredAttendance.forEach(record => {
                  if (record.location && record.location.lat && record.location.lng) {
                    if (!paths[record.name]) paths[record.name] = [];
                    // prepend because records are in descending order
                    paths[record.name].unshift([record.location.lat, record.location.lng]);
                  }
                });
                
                // Color generator based on name string
                const getColor = (str) => {
                  let hash = 0;
                  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
                  return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
                };

                return (
                  <div style={{ height: '400px', width: '100%', marginBottom: '2rem', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                    <MapContainer center={[parseFloat(officeLat), parseFloat(officeLng)]} zoom={13} style={{ height: '100%', width: '100%' }}>
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap contributors'
                      />
                      
                      {/* Office Geofence Visualizer */}
                      <Circle 
                        center={[parseFloat(officeLat), parseFloat(officeLng)]} 
                        pathOptions={{ fillColor: 'var(--primary)', color: 'var(--primary)' }} 
                        radius={parseFloat(geofenceRadius)} 
                      />
                      
                      {/* Employee History Trails (Polylines) */}
                      {Object.entries(paths).map(([name, coords]) => (
                        <Polyline 
                          key={`path-${name}`} 
                          positions={coords} 
                          pathOptions={{ color: getColor(name), weight: 3, opacity: 0.7, dashArray: '5, 10' }} 
                        />
                      ))}
                      
                      {/* Employee Markers */}
                      {attendanceRecords.map((record) => {
                        if (record.location && record.location.lat && record.location.lng) {
                          return (
                            <Marker key={`map-${record.id}`} position={[record.location.lat, record.location.lng]}>
                              <Popup>
                                <strong>{record.name}</strong><br/>
                                {record.role}<br/>
                                Punched In: {record.punchIn}<br/>
                                <span style={{ fontSize: '0.8rem', color: '#666' }}>{record.location.address}</span>
                              </Popup>
                            </Marker>
                          );
                        }
                        return null;
                      })}
                    </MapContainer>
                  </div>
                );
              })()}

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>Role</th>
                      <th>Punch In</th>
                      <th>Punch Out</th>
                      <th>Location</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttendance.length > 0 ? filteredAttendance.map((record, idx) => (
                      <tr key={record.id || idx}>
                        <td style={{ fontWeight: '500', color: 'var(--text-main)' }}>{record.name}</td>
                        <td>{record.role}</td>
                        <td>{record.punchIn}</td>
                        <td>{record.punchOut}</td>
                        <td style={{ maxWidth: '250px' }}>
                          {record.location ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {record.location.address && (
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={record.location.address}>
                                  {record.location.address}
                                </span>
                              )}
                              <a 
                                href={`https://www.google.com/maps?q=${record.location.lat},${record.location.lng}`}
                                target="_blank" 
                                rel="noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: '500' }}
                              >
                                <MapPin size={14} /> Open in Maps
                              </a>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>N/A</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span className={`badge ${record.status === 'Present' ? 'badge-success' : record.status === 'Late' ? 'badge-warning' : record.status === 'Absent' ? 'badge-danger' : 'badge-neutral'}`}>
                              {record.status}
                            </span>
                            {record.isOvertime && (
                              <span style={{ marginLeft: '0.5rem' }} className="badge badge-primary">Overtime</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No attendance records found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'employees' && (
            <div className="animate-fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3>Employee Management</h3>
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    setEditingUser(null);
                    setUserForm({ name: '', idNumber: '', designation: '', department: 'General', password: '', role: 'employee' });
                    setShowUserModal(true);
                  }}
                >
                  <UserPlus size={18} /> Add Employee
                </button>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>ID Number</th>
                      <th>Full Name</th>
                      <th>Designation</th>
                      <th>Department</th>
                      <th>Role</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td>{u.idNumber}</td>
                        <td style={{ fontWeight: '500' }}>{u.name}</td>
                        <td>{u.designation}</td>
                        <td><span className="badge badge-neutral">{u.department || 'General'}</span></td>
                        <td><span className={`badge ${u.role === 'admin' ? 'badge-neutral' : 'badge-success'}`}>{u.role}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                              className="btn btn-outline" 
                              style={{ padding: '0.4rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}
                              onClick={() => {
                                setEditingUser(u);
                                setUserForm({ name: u.name, idNumber: u.idNumber, designation: u.designation, department: u.department || 'General', password: '', role: u.role });
                                setShowUserModal(true);
                              }}
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              className="btn btn-outline" 
                              style={{ padding: '0.4rem', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                              onClick={() => handleDeleteUser(u.id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'leaves' && (
            <div className="animate-fade-in table-container">
              <table>
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Type</th>
                    <th>Requested Date</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveRequests.map(req => (
                    <tr key={req.id}>
                      <td style={{ fontWeight: '500', color: 'var(--text-main)' }}>{req.employee}</td>
                      <td>
                        <span className="badge badge-neutral">{req.type || 'Casual'}</span>
                      </td>
                      <td>
                        {new Date(req.startDate || req.date).toLocaleDateString()} 
                        {req.endDate && req.endDate !== (req.startDate || req.date) ? ` to ${new Date(req.endDate).toLocaleDateString()}` : ''}
                      </td>
                      <td style={{ maxWidth: '300px' }}>{req.reason}</td>
                      <td>
                        <span className={`badge ${req.status === 'Approved' ? 'badge-success' : req.status === 'Rejected' ? 'badge-danger' : 'badge-warning'}`}>
                          {req.status}
                        </span>
                      </td>
                      <td>
                        {req.status === 'Pending' && (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-success" style={{ padding: '0.4rem' }} onClick={() => handleApproveLeave(req.id)}>
                              <Check size={16} />
                            </button>
                            <button className="btn btn-danger" style={{ padding: '0.4rem' }} onClick={() => handleRejectLeave(req.id)}>
                              <X size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="animate-fade-in wa-container">
              
              {/* WhatsApp Sidebar */}
              <div className="wa-sidebar">
                <div className="wa-sidebar-header">
                  <div className="wa-avatar" style={{ width: '40px', height: '40px', background: 'var(--primary)' }}>A</div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', color: '#54656f' }}>
                    <MessageSquare size={20} />
                    <MoreVertical size={20} />
                  </div>
                </div>
                
                <div className="wa-search">
                  <input type="text" placeholder="Search or start new chat" />
                </div>
                
                <div className="wa-contact-list">
                  {contacts.map(contact => (
                    <div 
                      key={contact.id} 
                      className={`wa-contact ${activeContact.id === contact.id ? 'active' : ''}`}
                      onClick={() => selectContact(contact)}
                    >
                      <div className="wa-avatar">
                        {contact.name.charAt(0)}
                      </div>
                      <div className="wa-contact-info">
                        <div className="wa-contact-header">
                          <span className="wa-contact-name">{contact.name}</span>
                          <span className="wa-contact-time">{contact.time}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="wa-contact-lastmsg">{contact.lastMessage}</span>
                          {contact.unread > 0 && (
                            <div style={{ background: '#25d366', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>
                              {contact.unread}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* WhatsApp Main Chat Area */}
              <div className="wa-chat-area">
                <div className="wa-chat-header">
                  <div className="wa-avatar" style={{ width: '40px', height: '40px' }}>
                    {activeContact.name.charAt(0)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: '500', color: '#111b21' }}>{activeContact.name}</span>
                    {isTyping && <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>typing...</span>}
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '1.5rem', color: '#54656f' }}>
                    <Search size={20} />
                    <MoreVertical size={20} />
                  </div>
                </div>
                
                <div className="wa-chat-messages">
                  <div style={{ alignSelf: 'center', background: '#e1f5fe', padding: '0.3rem 0.8rem', borderRadius: '8px', fontSize: '0.8rem', color: '#54656f', marginBottom: '1rem' }}>
                    TODAY
                  </div>
                  
                  {(chatMessages[activeContact.id] || []).map(msg => (
                    <div key={msg.id} className={`wa-bubble ${msg.sender === 'admin' ? 'sent' : 'received'}`}>
                      {msg.text}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: '#8696a0', marginTop: '4px' }}>
                        {msg.time}
                        {msg.sender === 'admin' && <CheckCheck size={14} color="#53bdeb" />}
                      </div>
                    </div>
                  ))}
                  
                  {isTyping && (
                    <div className="wa-bubble received" style={{ padding: '0.8rem 1rem' }}>
                      <div className="typing-indicator">
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                
                <div className="wa-chat-input-area">
                  <input 
                    type="text" 
                    placeholder="Type a message" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <button 
                    style={{ background: 'none', border: 'none', color: chatInput.trim() ? 'var(--primary)' : '#54656f', cursor: 'pointer', transition: 'color 0.2s' }}
                    onClick={handleSendMessage}
                  >
                    <Send size={24} />
                  </button>
                </div>
              </div>
              
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="animate-fade-in" style={{ maxWidth: '600px' }}>
              <h2 style={{ marginBottom: '1.5rem' }}>General Settings</h2>
              
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.5rem' }}>Time Settings</h3>
                <div className="form-group">
                  <label className="form-label">Official Office Start Time</label>
                  <input 
                    type="time" 
                    className="form-input" 
                    value={tempOfficeTime}
                    onChange={(e) => setTempOfficeTime(e.target.value)}
                  />
                  <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                    Employees are expected to punch in by this time. If they fail to punch in within 10 minutes, or punch in without GPS within 15 minutes, an automated alert will be sent.
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Official Office End Time</label>
                  <input 
                    type="time" 
                    className="form-input" 
                    value={tempOfficeEndTime}
                    onChange={(e) => setTempOfficeEndTime(e.target.value)}
                  />
                  <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                    Employees punching out more than 1 hour after this time are marked as Overtime.
                  </p>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.5rem' }}>Geofence Settings</h3>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Office Latitude</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={tempLat}
                      onChange={(e) => setTempLat(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Office Longitude</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={tempLng}
                      onChange={(e) => setTempLng(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Geofence Radius (meters)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={tempRadius}
                    onChange={(e) => setTempRadius(e.target.value)}
                    min="10"
                    max="5000"
                  />
                  <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                    Employees will be physically blocked from punching in if they are outside this radius from the office coordinates.
                  </p>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.5rem' }}>Holiday Calendar</h3>
                
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ flex: 2 }}>
                    <label className="form-label">Holiday Name</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. New Year"
                      value={holidayName}
                      onChange={(e) => setHolidayName(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Date</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={holidayDate}
                      onChange={(e) => setHolidayDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={handleAddHoliday}>Add</button>
                  </div>
                </div>

                {holidays.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {holidays.map(h => (
                      <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--background)', border: '1px solid var(--surface-border)', borderRadius: '8px' }}>
                        <div>
                          <span style={{ fontWeight: '600' }}>{h.name}</span>
                          <span style={{ marginLeft: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(h.date).toLocaleDateString()}</span>
                        </div>
                        <button className="btn btn-outline" style={{ padding: '0.3rem', borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => handleRemoveHoliday(h.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No holidays configured.</p>
                )}
              </div>

              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.5rem' }}>Automated Reports</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  A daily attendance summary email is automatically sent to the admin every day at 5:00 PM.
                </p>
                <button 
                  className="btn btn-outline" 
                  onClick={async () => {
                    try {
                      const res = await api.post('/admin/trigger-summary');
                      alert(res.data.message);
                    } catch (err) {
                      alert('Failed to trigger summary email');
                    }
                  }}
                >
                  <Send size={16} /> Send Test Summary Email Now
                </button>
              </div>

              <button className="btn btn-primary" onClick={saveSettings} style={{ width: '100%', padding: '0.75rem' }}>
                Save All Settings
              </button>
            </div>
          )}

        </div>
      </div>
      
      {/* User Form Modal Overlay */}
      {showUserModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>{editingUser ? 'Edit Employee' : 'Add Employee'}</h3>
              <button onClick={() => setShowUserModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleUserSubmit}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input required type="text" className="form-input" value={userForm.name} onChange={(e) => setUserForm({...userForm, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">ID Number (Login ID)</label>
                <input required type="text" className="form-input" value={userForm.idNumber} onChange={(e) => setUserForm({...userForm, idNumber: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Designation (e.g. Software Engineer)</label>
                <input required type="text" className="form-input" value={userForm.designation} onChange={(e) => setUserForm({...userForm, designation: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Department</label>
                <select className="form-input" value={userForm.department} onChange={(e) => setUserForm({...userForm, department: e.target.value})}>
                  <option value="General">General</option>
                  <option value="Sales">Sales</option>
                  <option value="IT">IT</option>
                  <option value="HR">HR</option>
                  <option value="Operations">Operations</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-input" value={userForm.role} onChange={(e) => setUserForm({...userForm, role: e.target.value})}>
                  <option value="employee">Employee</option>
                  <option value="admin">Admin / Manager</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{editingUser ? 'New Password (leave blank to keep current)' : 'Password'}</label>
                <input type="password" required={!editingUser} className="form-input" value={userForm.password} onChange={(e) => setUserForm({...userForm, password: e.target.value})} />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowUserModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{editingUser ? 'Save Changes' : 'Create Employee'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
