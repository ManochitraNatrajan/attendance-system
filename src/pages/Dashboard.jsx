import { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { Users, UserCheck, UserX, Clock, X, Download } from 'lucide-react';

import { MapPin } from 'lucide-react';

import Skeleton from '../components/Skeleton';
import AdminLiveMap from '../components/AdminLiveMap';

const Dashboard = memo(function Dashboard({ stats, refreshStats, employeeList = [], todayRecords = [] }) {
  const user = JSON.parse(localStorage.getItem('user'));
  const [showLiveMap, setShowLiveMap] = useState(false);
  const [activePopup, setActivePopup] = useState(null); // 'present' or 'absent'
  const [isDownloadingApp, setIsDownloadingApp] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // Silently refresh stats in the background on mount
    if (refreshStats) refreshStats();

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // Use empty defaults if still null for some reason (fail-safe)
  const currentStats = stats || { total: 0, present: 0, absent: 0 };

  const handleStatClick = (type) => {
    if (user?.role === 'Admin') {
      setActivePopup(type);
    }
  };

  const handleDownloadApp = async () => {
    if (deferredPrompt) {
      // Trigger the PWA install prompt instead of downloading the APK
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      return;
    }

    setIsDownloadingApp(true);
    setDownloadError('');
    setDownloadSuccess('');
    try {
      const res = await axios.get('/api/config/apk-url');
      if (res.data && res.data.url) {
        setDownloadSuccess('Download starting shortly...');
        window.open(res.data.url, '_blank');
        setTimeout(() => setDownloadSuccess(''), 5000);
      } else {
        setDownloadError('App download link is currently unavailable.');
        setTimeout(() => setDownloadError(''), 5000);
      }
    } catch (err) {
      console.error('Download app error:', err);
      setDownloadError('Failed to fetch download link. Please try again.');
      setTimeout(() => setDownloadError(''), 5000);
    } finally {
      setIsDownloadingApp(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-300 ease-in-out">
      {downloadError && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg border border-red-200 text-sm animate-in fade-in zoom-in duration-200">
          {downloadError}
        </div>
      )}
      {downloadSuccess && (
        <div className="mb-4 p-3 bg-green-50 text-green-600 rounded-lg border border-green-200 text-sm animate-in fade-in zoom-in duration-200">
          {downloadSuccess}
        </div>
      )}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 text-left m-0">Dashboard</h1>
          <p className="text-gray-500 mt-1 text-left">Overview of today's attendance metrics</p>
        </div>
        <div>
          <button 
            onClick={handleDownloadApp} 
            disabled={isDownloadingApp}
            className={`px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium text-sm flex items-center gap-2 shadow-sm ${isDownloadingApp ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            <Download className={`w-4 h-4 ${isDownloadingApp ? 'animate-bounce' : ''}`} />
            {isDownloadingApp ? 'Fetching Link...' : (deferredPrompt ? 'Install App' : 'Download App')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Employees"
          value={currentStats.total}
          icon={Users}
          color="bg-blue-500"
          bgColor="bg-blue-50"
        />
        <StatCard
          title="Present Today"
          value={currentStats.present}
          icon={UserCheck}
          color="bg-green-500"
          bgColor="bg-green-50"
          onClick={() => handleStatClick('present')}
          isClickable={user?.role === 'Admin'}
        />
        <StatCard
          title="Absent Today"
          value={currentStats.absent}
          icon={UserX}
          color="bg-red-500"
          bgColor="bg-red-50"
          onClick={() => handleStatClick('absent')}
          isClickable={user?.role === 'Admin'}
        />
        <StatCard
          title="Date"
          value={format(new Date(), 'MMM dd, yyyy')}
          icon={Clock}
          color="bg-purple-500"
          bgColor="bg-purple-50"
          isText
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-semibold mb-4 text-left">Quick Actions</h2>
        <div className="flex gap-4 flex-wrap">
          <Link to="/attendance" className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-purple-700 transition font-medium text-sm">
            Mark Attendance
          </Link>
          {user?.role === 'Admin' && (
            <Link to="/employees" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium text-sm">
              Manage Employees
            </Link>
          )}
          {user?.role === 'Admin' && (
             <button
                onClick={() => setShowLiveMap(true)}
                className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition font-medium text-sm flex items-center gap-2"
             >
                <MapPin className="w-4 h-4 animate-bounce" /> Live Employee Tracking
             </button>
          )}
        </div>
      </div>
      
      {showLiveMap && <AdminLiveMap onClose={() => setShowLiveMap(false)} />}
      
      {activePopup && (
        <PresentAbsentPopup 
          type={activePopup} 
          onClose={() => setActivePopup(null)} 
          employeeList={employeeList}
          todayRecords={todayRecords}
        />
      )}
    </div>
  );
});

export default Dashboard;

function StatCard({ title, value, icon: Icon, color, bgColor, isText, onClick, isClickable }) {
  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col relative overflow-hidden group ${isClickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${bgColor}`}>
          <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
        </div>
      </div>
      <h3 className="text-gray-500 text-sm font-medium text-left">{title}</h3>
      <p className={`text-3xl font-bold text-gray-900 text-left mt-1 ${isText ? 'text-xl' : ''}`}>
        {value}
      </p>
      <div className={`absolute bottom-0 left-0 h-1 w-full ${color} ${isClickable ? 'opacity-50' : 'opacity-0'} group-hover:opacity-100 transition-opacity`}></div>
    </div>
  );
}

function PresentAbsentPopup({ type, onClose, employeeList, todayRecords }) {
  const isPresentMode = type === 'present';
  
  const presentEmployees = todayRecords.map(record => {
    const emp = employeeList.find(e => e.id === record.employeeId || e._id === record.employeeId);
    return {
      name: emp?.name || 'Unknown',
      checkIn: record.checkIn,
      status: record.status
    };
  });

  const presentIds = todayRecords.map(r => r.employeeId);
  const absentEmployees = employeeList.filter(emp => !presentIds.includes(emp.id) && !presentIds.includes(emp._id));

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h3 className="text-lg font-bold text-gray-800">
            {isPresentMode ? 'Present Employees Today' : 'Absent Employees Today'}
          </h3>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {isPresentMode ? (
            presentEmployees.length > 0 ? (
              <ul className="space-y-4">
                {presentEmployees.map((emp, i) => (
                  <li key={i} className="flex flex-col border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900">{emp.name}</span>
                      <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        {emp.status || 'Present'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <Clock className="w-3 h-3" />
                      <span>{emp.checkIn || '-'}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No employees present today
              </div>
            )
          ) : (
            absentEmployees.length > 0 ? (
              <ul className="space-y-3">
                {absentEmployees.map((emp, i) => (
                  <li key={i} className="flex items-center justify-between border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                    <span className="font-bold text-gray-900">{emp.name}</span>
                    <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      Absent
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-8 text-gray-500 font-bold">
                All employees are present
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
