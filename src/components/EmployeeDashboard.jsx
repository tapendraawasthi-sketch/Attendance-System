import { useState, useEffect, useRef } from 'react';
import { Clock, CheckCircle, XCircle, Calendar, Send, MapPin, Loader2, FastForward, AlertTriangle, Bell, Wifi, WifiOff } from 'lucide-react';
import { useApp, api } from '../context/AppContext';

export default function EmployeeDashboard() {
  const { 
    officeTime, 
    officeEndTime,
    officeLat, 
    officeLng, 
    geofenceRadius,
    employeeHistory, 
    setEmployeeHistory, 
    currentEmployeeDetails, 
    sendAutomatedMessage, 
    leaveRequests,
    setLeaveRequests,
    user,
    holidays
  } = useApp();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [isPunchedIn, setIsPunchedIn] = useState(false);
  const [lastActionTime, setLastActionTime] = useState(null);
  
  // GPS State
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [hasProvidedGPS, setHasProvidedGPS] = useState(false);
  const watchIdRef = useRef(null);
  
  // Offline Sync State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineCache, setOfflineCache] = useState([]);
  
  // Alert State
  const [alertSent, setAlertSent] = useState(false);
  const [showReminderToast, setShowReminderToast] = useState(false);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  
  // Simulation offsets
  const [timeOffsetMinutes, setTimeOffsetMinutes] = useState(0);

  // Leave Application State
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveData, setLeaveData] = useState({ type: 'Casual', startDate: '', endDate: '', reason: '' });

  // Network Status Listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Process Offline Cache when returning online
  useEffect(() => {
    if (isOnline && offlineCache.length > 0) {
      // Sync cached records
      setEmployeeHistory(prev => {
        const syncedRecords = offlineCache.map(record => ({
          ...record,
          action: 'Offline GPS Sync',
        }));
        return [...syncedRecords, ...prev];
      });
      setOfflineCache([]);
      alert("Internet restored! Offline GPS logs have been synced to the server.");
    }
  }, [isOnline, offlineCache, setEmployeeHistory]);

  // Timer loop taking offset into account
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      now.setMinutes(now.getMinutes() + timeOffsetMinutes);
      setCurrentTime(now);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeOffsetMinutes]);

  // Automated Alert Checking Logic
  useEffect(() => {
    // Check if employee is currently on an approved leave
    const isOnApprovedLeave = () => {
      const today = currentTime.toISOString().split('T')[0];
      return leaveRequests.some(req => {
        if (req.status !== 'Approved' || req.employee !== currentEmployeeDetails.name) return false;
        const start = req.startDate || req.date;
        const end = req.endDate || req.date;
        return today >= start && today <= end;
      });
    };

    const isLeaveDay = isOnApprovedLeave();
    
    // Check if today is a company holiday
    const isHolidayDay = () => {
      const today = currentTime.toISOString().split('T')[0];
      return holidays?.some(h => h.date === today);
    };
    
    const isHoliday = isHolidayDay();

    const [officeHours, officeMinutes] = officeTime.split(':').map(Number);
    const officeDateObj = new Date(currentTime);
    officeDateObj.setHours(officeHours, officeMinutes, 0, 0);

    const diffMinutes = (currentTime - officeDateObj) / (1000 * 60);

    if (diffMinutes >= 0 && diffMinutes < 10 && !isPunchedIn && !reminderDismissed && !isLeaveDay && !isHoliday) {
      if (!showReminderToast) {
        setShowReminderToast(true);
      }
    } else if (diffMinutes >= 10 || isPunchedIn || isLeaveDay || isHoliday) {
      setShowReminderToast(false);
    }

    if (alertSent || isLeaveDay || isHoliday) return;

    if (diffMinutes >= 10 && !isPunchedIn && !lastActionTime) {
      sendAutomatedMessage("I am not able to Share My location. (System: Did not punch in by office time)");
      setAlertSent(true);
      setShowReminderToast(false);
      return;
    }

    if (isPunchedIn && lastActionTime && !hasProvidedGPS) {
      const diffSincePunch = (currentTime - lastActionTime) / (1000 * 60);
      if (diffSincePunch >= 15) {
        sendAutomatedMessage("I am not able to Share My location. (System: Did not provide GPS within 15m of punch-in)");
        setAlertSent(true);
      }
    }
  }, [currentTime, officeTime, isPunchedIn, lastActionTime, hasProvidedGPS, alertSent, sendAutomatedMessage, showReminderToast, reminderDismissed, leaveRequests, holidays, currentEmployeeDetails.name]);

  // Haversine formula to calculate distance between two coordinates in meters
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp/2) * Math.sin(dp/2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const executePunch = async (now, action, locationData = null) => {
    const newIsPunchedIn = action === 'Punch In';
    
    // Geofence Validation for Punch In
    if (newIsPunchedIn && locationData && officeLat && officeLng && geofenceRadius) {
      const dist = calculateDistance(locationData.lat, locationData.lng, parseFloat(officeLat), parseFloat(officeLng));
      if (dist > parseFloat(geofenceRadius)) {
        alert(`Geofence Block: You are ${Math.round(dist)} meters away from the office. You must be within ${geofenceRadius} meters to punch in.`);
        return; // Block the punch
      }
    }

    setIsPunchedIn(newIsPunchedIn);
    setLastActionTime(now);
    
    if (newIsPunchedIn) {
      setShowReminderToast(false);
      if (locationData) setHasProvidedGPS(true);
    } else {
      // If punching out, stop watching position
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }
    
    let isOvertime = false;
    if (!newIsPunchedIn && officeEndTime) {
      const [endHours, endMinutes] = officeEndTime.split(':').map(Number);
      const endObj = new Date(now);
      endObj.setHours(endHours, endMinutes, 0, 0);
      const diffMinutes = (now - endObj) / (1000 * 60);
      if (diffMinutes >= 60) {
        isOvertime = true;
      }
    }

    try {
      const pingTime = new Date();
      pingTime.setMinutes(pingTime.getMinutes() + timeOffsetMinutes);

      if (isOnline) {
        // Send to backend
        const res = await api.post('/attendance', {
          action,
          time: pingTime.toISOString(),
          lat: locationData?.lat || null,
          lng: locationData?.lng || null,
          address: locationData?.address || null,
          isOvertime
        });
        
        setEmployeeHistory(prev => [
          { id: res.data.id, action, time: pingTime, location: locationData, isOvertime },
          ...prev
        ]);
      } else {
        // Offline Cache Logic
        setOfflineCache(prev => [
          { id: Date.now(), action, time: pingTime, location: locationData, isOvertime },
          ...prev
        ]);
      }
    } catch (err) {
      console.error("Failed to record punch", err);
    }
  };

  const fetchAddress = async (lat, lng) => {
    try {
      if (!isOnline) return "Offline Location"; // Don't try to fetch address if offline
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await response.json();
      return data.display_name;
    } catch (error) {
      console.error("Error fetching reverse geocoding:", error);
      return null;
    }
  };

  const handlePunch = () => {
    const action = isPunchedIn ? 'Punch Out' : 'Punch In';
    
    if (action === 'Punch In') {
      setIsFetchingLocation(true);
      if ("geolocation" in navigator) {
        // Start watching position continuously
        watchIdRef.current = navigator.geolocation.watchPosition(
          async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const address = await fetchAddress(lat, lng);
            const locationData = { lat, lng, address: address || `${lat.toFixed(4)}, ${lng.toFixed(4)} (GPS Ping)` };
            
            // If it's the very first punch-in location ping
            if (!isPunchedIn && watchIdRef.current) {
              setIsFetchingLocation(false);
              executePunch(currentTime, action, locationData);
            } else {
              // It's a subsequent background update
              const pingTime = new Date();
              pingTime.setMinutes(pingTime.getMinutes() + timeOffsetMinutes);
              
              if (navigator.onLine) {
                // Online: Update history directly
                setEmployeeHistory(prev => [
                  { id: Date.now(), action: 'GPS Update', time: pingTime, location: locationData },
                  ...prev
                ]);
              } else {
                // Offline: Cache it locally
                setOfflineCache(prev => [
                  { id: Date.now(), action: 'Offline GPS Ping', time: pingTime, location: locationData },
                  ...prev
                ]);
              }
            }
          },
          (error) => {
            console.error("Error fetching location:", error);
            if (!isPunchedIn) {
              setIsFetchingLocation(false);
              alert("Could not fetch GPS location. Ensure location permissions are enabled.");
              executePunch(currentTime, action, null);
            }
          },
          { enableHighAccuracy: true, maximumAge: 30000, timeout: 27000 }
        );
      } else {
        setIsFetchingLocation(false);
        alert("Geolocation is not supported by your browser.");
        executePunch(currentTime, action, null);
      }
    } else {
      executePunch(currentTime, action, null);
    }
  };

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const handleLeaveSubmit = async (e) => {
    e.preventDefault();
    if (!leaveData.startDate || !leaveData.endDate || !leaveData.reason) return;
    
    // Calculate days requested
    const start = new Date(leaveData.startDate);
    const end = new Date(leaveData.endDate);
    const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    if (leaveData.type === 'Sick' && user?.sickLeaveBalance < diffDays) {
      alert(`Insufficient Sick Leave balance. You have ${user.sickLeaveBalance} days left, but requested ${diffDays}.`);
      return;
    }
    if (leaveData.type === 'Casual' && user?.casualLeaveBalance < diffDays) {
      alert(`Insufficient Casual Leave balance. You have ${user.casualLeaveBalance} days left, but requested ${diffDays}.`);
      return;
    }
    
    try {
      const res = await api.post('/leaves', {
        type: leaveData.type,
        startDate: leaveData.startDate,
        endDate: leaveData.endDate,
        reason: leaveData.reason
      });

      const letterContent = `LEAVE APPLICATION
Name: ${currentEmployeeDetails.name}
ID: ${currentEmployeeDetails.idNumber}
Designation: ${currentEmployeeDetails.designation}
Duration: ${leaveData.startDate} to ${leaveData.endDate}
Reason: ${leaveData.reason}

Kindly review and approve my leave request.`;

      sendAutomatedMessage(letterContent);
      
      setLeaveRequests([
        res.data,
        ...leaveRequests
      ]);
      setLeaveData({ type: 'Casual', startDate: '', endDate: '', reason: '' });
      setShowLeaveForm(false);

    } catch (err) {
      console.error("Failed to submit leave", err);
      alert("Failed to submit leave request.");
    }
  };

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="container animate-fade-in" style={{ position: 'relative' }}>
      
      {/* Network Status Indicator */}
      <div style={{ position: 'fixed', top: '100px', left: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: isOnline ? '#dcfce7' : '#fee2e2', color: isOnline ? '#166534' : '#991b1b', padding: '0.5rem 1rem', borderRadius: '50px', fontWeight: '500', fontSize: '0.9rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', zIndex: 50, transition: 'all 0.3s' }}>
        {isOnline ? <><Wifi size={16} /> Online</> : <><WifiOff size={16} /> Offline - Syncing Paused</>}
        {!isOnline && offlineCache.length > 0 && (
          <span style={{ marginLeft: '0.5rem', background: '#991b1b', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '10px', fontSize: '0.75rem' }}>
            {offlineCache.length} pending
          </span>
        )}
      </div>

      {/* Reminder Toast Notification */}
      {showReminderToast && (
        <div className="animate-fade-in" style={{
          position: 'fixed', top: '80px', right: '2rem', background: 'var(--primary)', color: 'white', padding: '1rem 1.5rem', borderRadius: '12px', boxShadow: '0 10px 25px rgba(37, 99, 235, 0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '1rem', maxWidth: '400px'
        }}>
          <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.5rem', borderRadius: '50%', display: 'flex' }}>
            <Bell size={24} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>Office Time Started</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.9 }}>Don't forget to punch in for attendance!</p>
          </div>
          <button 
            onClick={() => { setShowReminderToast(false); setReminderDismissed(true); }}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0.25rem', marginLeft: 'auto' }}
          >
            <XCircle size={20} />
          </button>
        </div>
      )}

      {/* Developer Testing Controls */}
      <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong style={{ color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} /> Developer Testing Tools
          </strong>
          <p style={{ fontSize: '0.85rem', color: '#92400e', marginTop: '0.25rem' }}>
            Office time: <strong>{officeTime}</strong>. 
            <br />Use browser DevTools Network tab to simulate Offline mode.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className="btn btn-warning" 
            style={{ background: '#d97706', color: 'white', border: 'none' }}
            onClick={() => {
              setReminderDismissed(false);
              const [h, m] = officeTime.split(':').map(Number);
              const target = new Date(currentTime);
              target.setHours(h, m, 0, 0);
              let diff = (target - currentTime) / (1000 * 60);
              setTimeOffsetMinutes(prev => prev + diff);
            }}
          >
            <Clock size={16} /> Jump to Office Time
          </button>
          <button 
            className="btn btn-warning" 
            style={{ background: '#f59e0b', color: 'white', border: 'none' }}
            onClick={() => setTimeOffsetMinutes(prev => prev + 15)}
          >
            <FastForward size={16} /> Skip +15 Mins
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        
        {/* Attendance Card */}
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>Attendance</h2>
          <p style={{ marginBottom: '2rem' }}>{formattedDate}</p>
          
          <div style={{ marginBottom: '3rem' }}>
            <div style={{ fontSize: 'clamp(2.5rem, 8vw, 3.5rem)', fontWeight: '700', color: 'var(--text-main)', letterSpacing: '-0.05em', lineHeight: '1' }}>
              {formattedTime}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <button 
              className={`btn ${isPunchedIn ? 'btn-danger' : 'btn-success'}`}
              onClick={handlePunch}
              disabled={isFetchingLocation}
              style={{ padding: '1rem 3rem', fontSize: '1.1rem', borderRadius: '50px', width: '100%', maxWidth: '280px', opacity: isFetchingLocation ? 0.7 : 1 }}
            >
              {isFetchingLocation ? (
                <><Loader2 size={20} className="animate-spin" /> Fetching GPS...</>
              ) : isPunchedIn ? (
                <><XCircle size={20} /> Punch Out</>
              ) : (
                <><CheckCircle size={20} /> Punch In</>
              )}
            </button>

            {lastActionTime && (
              <p style={{ fontSize: '0.9rem', marginTop: '1rem', color: 'var(--text-muted)' }}>
                Last action: <strong>{isPunchedIn ? 'Punched In' : 'Punched Out'}</strong> at {lastActionTime.toLocaleTimeString()}
              </p>
            )}
            {isPunchedIn && watchIdRef.current && (
              <p style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span className="typing-dot" style={{ background: 'var(--primary)' }}></span>
                GPS is continuously tracking...
              </p>
            )}
          </div>
        </div>

        {/* Right Column: History & Leave */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* History Card */}
          <div className="card">
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={20} /> Today's Activity
            </h3>
            {employeeHistory.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {employeeHistory.map((record) => (
                  <div key={record.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ fontWeight: '500' }}>
                        <span className={`badge ${record.action.includes('Punch In') ? 'badge-success' : record.action.includes('Punch Out') ? 'badge-danger' : 'badge-neutral'}`} style={{ marginRight: '0.75rem' }}>
                          {record.action}
                        </span>
                      </span>
                      {record.location && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', gap: '0.4rem', maxWidth: '300px' }}>
                          <MapPin size={14} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--primary)' }} /> 
                          <span style={{ lineHeight: '1.4' }}>
                            {record.location.address || `${record.location.lat.toFixed(4)}, ${record.location.lng.toFixed(4)}`}
                          </span>
                        </div>
                      )}
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', flexShrink: 0 }}>{record.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', padding: '2rem', background: 'var(--background)', borderRadius: '8px', border: '1px dashed var(--surface-border)' }}>
                No activity yet today.
              </p>
            )}
          </div>

          {/* Leave Applications Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Calendar size={20} /> Leave Applications
              </h3>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {user && (
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <span className="badge badge-neutral">Sick: {user.sickLeaveBalance}/12</span>
                    <span className="badge badge-neutral">Casual: {user.casualLeaveBalance}/12</span>
                  </div>
                )}
                <button className="btn btn-outline" onClick={() => setShowLeaveForm(!showLeaveForm)}>
                  {showLeaveForm ? 'Cancel' : 'Request Leave'}
                </button>
              </div>
            </div>

            {showLeaveForm && (
              <form onSubmit={handleLeaveSubmit} className="animate-fade-in" style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Leave Type</label>
                  <select className="form-input" value={leaveData.type} onChange={(e) => setLeaveData({...leaveData, type: e.target.value})}>
                    <option value="Casual">Casual Leave</option>
                    <option value="Sick">Sick Leave</option>
                    <option value="Unpaid">Unpaid Leave</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Start Date</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={leaveData.startDate}
                      onChange={(e) => setLeaveData({...leaveData, startDate: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">End Date</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={leaveData.endDate}
                      onChange={(e) => setLeaveData({...leaveData, endDate: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Reason</label>
                  <textarea 
                    className="form-textarea" 
                    rows="3" 
                    placeholder="Provide a brief reason for your leave..."
                    value={leaveData.reason}
                    onChange={(e) => setLeaveData({...leaveData, reason: e.target.value})}
                    required
                  ></textarea>
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  <Send size={16} /> Submit Request
                </button>
              </form>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {leaveRequests.filter(r => r.employee === currentEmployeeDetails.name).map((req) => (
                <div key={req.id} style={{ padding: '1rem', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '600' }}>
                      <span style={{ color: 'var(--primary)', marginRight: '0.5rem' }}>[{req.type || 'Casual'}]</span>
                      {new Date(req.startDate || req.date).toLocaleDateString()} 
                      {req.endDate && req.endDate !== (req.startDate || req.date) ? ` to ${new Date(req.endDate).toLocaleDateString()}` : ''}
                    </span>
                    <span className={`badge ${req.status === 'Approved' ? 'badge-success' : req.status === 'Rejected' ? 'badge-danger' : 'badge-warning'}`}>
                      {req.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{req.reason}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Upcoming Holidays Card */}
          <div className="card">
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={20} /> Upcoming Holidays
            </h3>
            {holidays && holidays.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {holidays.filter(h => new Date(h.date) >= new Date(currentTime.toISOString().split('T')[0])).slice(0, 5).map(h => (
                  <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                    <span style={{ fontWeight: '500' }}>{h.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(h.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>No upcoming holidays.</p>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}
