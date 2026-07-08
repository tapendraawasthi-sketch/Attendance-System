import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import EmployeeDashboard from './components/EmployeeDashboard';
import AdminDashboard from './components/AdminDashboard';
import ChatWidget from './components/ChatWidget';
import Login from './components/Login';
import { AppProvider, useApp } from './context/AppContext';
import './styles/main.css';
import { Loader2, LogOut, Sun, Moon } from 'lucide-react';

function Navigation() {
  const location = useLocation();
  const { user, logout, theme, toggleTheme } = useApp();
  
  if (!user) return null; // No nav if not logged in

  return (
    <nav className="navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
          A
        </div>
        <span style={{ fontSize: '1.25rem', fontWeight: '600', letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
          Attendify
        </span>
      </div>
      
      <div className="nav-links">
        {user.role === 'employee' && (
          <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
            Employee Dashboard
          </Link>
        )}
        {user.role === 'admin' && (
          <Link to="/admin" className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}>
            Admin Dashboard
          </Link>
        )}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button 
          className="btn btn-outline" 
          style={{ padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
          onClick={toggleTheme}
          title="Toggle Dark Mode"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          {user.name} ({user.role})
        </span>
        <button className="btn btn-outline" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={logout}>
          <LogOut size={16} /> Logout
        </button>
      </div>
    </nav>
  );
}

// Protected Route Wrapper
function ProtectedRoute({ children, allowedRole }) {
  const { user, isLoadingAuth } = useApp();

  if (isLoadingAuth) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Loader2 size={40} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    // If they try to access wrong role dashboard, bounce them to their correct one
    return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  }

  return children;
}

function MainAppRoutes() {
  const { user } = useApp();
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <Navigation />
      <main style={{ flex: 1, padding: '2rem 0' }}>
        <Routes>
          <Route path="/login" element={
            user ? <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace /> : <Login />
          } />
          
          <Route path="/" element={
            <ProtectedRoute allowedRole="employee">
              <EmployeeDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/admin" element={
            <ProtectedRoute allowedRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          } />
        </Routes>
      </main>
      {user && <ChatWidget />}
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <Router>
        <MainAppRoutes />
      </Router>
    </AppProvider>
  );
}

export default App;
