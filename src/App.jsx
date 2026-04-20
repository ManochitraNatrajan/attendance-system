import { useEffect, useState, lazy, Suspense } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import LoadingScreen from './components/LoadingScreen';
import { initTimeSync } from './utils/timeSync';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const Employees = lazy(() => import('./pages/Employees'));
const Attendance = lazy(() => import('./pages/Attendance'));

function App() {
  const user = JSON.parse(localStorage.getItem('user'));
  const [appLoading, setAppLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState(null);
  const [employeeList, setEmployeeList] = useState(null);
  const [timerDone, setTimerDone] = useState(false);

  const fetchGlobalData = async () => {
    try {
      if (!user) {
        setDashboardStats({});
        setAttendanceRecords([]);
        setEmployeeList([]);
        return;
      }
      const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
      const todayStr = format(nowIST, 'yyyy-MM-dd');
      
      const attEndpoint = user.role === 'Admin' 
        ? '/api/attendance?limit=20'
        : `/api/attendance?employeeId=${user.id}&limit=20`;

      // Fetch dashboard critical stats first, delay heavy records list
      const [empRes, attStatsRes] = await Promise.all([
        axios.get('/api/employees'),
        axios.get(`/api/attendance?date=${todayStr}`)
      ]);
      
      const attRecRes = await axios.get(attEndpoint);

      setDashboardStats({
        total: empRes.data.length,
        present: attStatsRes.data.length,
        absent: empRes.data.length - attStatsRes.data.length,
        lastUpdated: Date.now()
      });

      setAttendanceRecords(attRecRes.data.sort((a, b) => {
        if (a.date === b.date) return b.checkIn.localeCompare(a.checkIn);
        return new Date(b.date) - new Date(a.date);
      }));

      setEmployeeList(empRes.data);

    } catch (error) {
      console.error('Global data fetch failure:', error);
      setDashboardStats({});
      setAttendanceRecords([]);
      setEmployeeList([]);
    }
  };

  useEffect(() => {
    initTimeSync();
    fetchGlobalData();
    
    // 1.5s branding duration
    const timer = setTimeout(() => setTimerDone(true), 1500);
    // 5s fail-safe timeout
    const failSafe = setTimeout(() => setAppLoading(false), 5000);

    // Keep-alive ping for Render free tier (every 14 mins)
    const pingServer = () => {
      if (document.visibilityState === 'visible') {
        axios.get('/api/ping').catch(() => {});
      }
    };
    
    pingServer();
    const interval = setInterval(pingServer, 14 * 60 * 1000);
    
    return () => {
      clearTimeout(timer);
      clearTimeout(failSafe);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    // Both branding time and ALL data must be ready
    if (timerDone && dashboardStats !== null && attendanceRecords !== null && employeeList !== null) {
      console.log('All data ready, transitioning to dashboard...');
      setAppLoading(false);
    }
  }, [timerDone, dashboardStats, attendanceRecords, employeeList]);

  if (appLoading) return <LoadingScreen />;

  return (
    <Router>
      {user && <Navbar />}
        <div className="flex-1 overflow-auto bg-[var(--bg)] w-full h-full text-[var(--text)]">
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
              <Route path="/" element={user ? <Dashboard stats={dashboardStats} refreshStats={fetchGlobalData} /> : <Navigate to="/login" />} />
              <Route path="/employees" element={user ? <Employees employees={employeeList} refreshEmployees={fetchGlobalData} /> : <Navigate to="/login" />} />
              <Route path="/attendance" element={user ? <Attendance records={attendanceRecords} refreshRecords={fetchGlobalData} /> : <Navigate to="/login" />} />
            </Routes>
          </Suspense>
        </div>
    </Router>
  );
}

export default App;
