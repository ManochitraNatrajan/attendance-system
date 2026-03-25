import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Employees from './pages/Employees';
import Attendance from './pages/Attendance';
import GlobalLocationTracker from './components/GlobalLocationTracker';

function App() {
  const user = JSON.parse(localStorage.getItem('user'));

  return (
    <Router>
      <GlobalLocationTracker />
      {user && <Navbar />}
      <div className="flex-1 overflow-auto bg-[var(--bg)] w-full h-full text-[var(--text)]">
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
          <Route path="/" element={user ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/employees" element={user ? <Employees /> : <Navigate to="/login" />} />
          <Route path="/attendance" element={user ? <Attendance /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
