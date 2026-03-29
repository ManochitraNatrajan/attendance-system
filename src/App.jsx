import { lazy, Suspense, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import GlobalLocationTracker from './components/GlobalLocationTracker';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const Employees = lazy(() => import('./pages/Employees'));
const Attendance = lazy(() => import('./pages/Attendance'));

function App() {
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    // Keep-alive ping for Render free tier (every 14 mins)
    const pingServer = () => axios.get('/api/ping').catch(() => {});
    pingServer();
    const interval = setInterval(pingServer, 14 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Router>
      <GlobalLocationTracker />
      {user && <Navbar />}
      <div className="flex-1 overflow-auto bg-[var(--bg)] w-full h-full text-[var(--text)]">
        <Suspense fallback={
          <div className="flex items-center justify-center p-12">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        }>
          <Routes>
            <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
            <Route path="/" element={user ? <Dashboard /> : <Navigate to="/login" />} />
            <Route path="/employees" element={user ? <Employees /> : <Navigate to="/login" />} />
            <Route path="/attendance" element={user ? <Attendance /> : <Navigate to="/login" />} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;
