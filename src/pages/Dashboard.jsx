import { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { Users, UserCheck, UserX, Clock, X, Download, MapPin, Smartphone } from 'lucide-react';

import Skeleton from '../components/Skeleton';
import AdminLiveMap from '../components/AdminLiveMap';

const Dashboard = memo(function Dashboard({ stats, refreshStats, employeeList = [], todayRecords = [], deferredPrompt, setDeferredPrompt }) {
  const user = JSON.parse(localStorage.getItem('user'));
  const [showLiveMap, setShowLiveMap] = useState(false);
  const [activePopup, setActivePopup] = useState(null); // 'present' or 'absent'
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const [isStandalone, setIsStandalone] = useState(
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
  );

  useEffect(() => {
    // Silently refresh stats in the background on mount
    if (refreshStats) refreshStats();

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleChange = (e) => setIsStandalone(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [refreshStats]);

  // Use empty defaults if still null or empty for some reason (fail-safe)
  const currentStats = stats && Object.keys(stats).length > 0 ? stats : { total: 0, present: 0, absent: 0 };

  const handleStatClick = (type) => {
    if (user?.role === 'Admin') {
      setActivePopup(type);
    }
  };

  const handleDownloadApp = async () => {
    if (deferredPrompt) {
      // Trigger the PWA install prompt natively
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        if (setDeferredPrompt) setDeferredPrompt(null);
      }
      return;
    }

    // If no native prompt is available, show the manual install guide modal
    setShowInstallGuide(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-300 ease-in-out">

      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 text-left m-0">Dashboard</h1>
          <p className="text-gray-500 mt-1 text-left">Overview of today's attendance metrics</p>
        </div>
        {!isStandalone && (
          <div>
            <button 
              onClick={handleDownloadApp} 
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium text-sm flex items-center gap-2 shadow-sm"
            >
              <Download className="w-4 h-4" />
              {deferredPrompt ? 'Install App' : 'App Install Guide'}
            </button>
          </div>
        )}
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

      {showInstallGuide && <InstallGuidePopup onClose={() => setShowInstallGuide(false)} />}
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

function InstallGuidePopup({ onClose }) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-bold text-gray-800">Install App</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-gray-600 mb-6 text-sm">
            Install Sri Krishna Milk Dairy directly to your device for quick access and a native app experience.
          </p>
          
          {isIOS ? (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
              <h4 className="font-semibold text-blue-900 mb-2">iOS (iPhone/iPad)</h4>
              <ol className="list-decimal pl-5 text-blue-800 text-sm space-y-2 marker:font-bold">
                <li>Tap the <strong>Share</strong> button at the bottom of your screen (square with an up arrow).</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
                <li>Tap <strong>"Add"</strong> in the top right corner.</li>
              </ol>
            </div>
          ) : (
            <div className="bg-green-50 rounded-lg p-4 border border-green-100">
              <h4 className="font-semibold text-green-900 mb-2">Android / Desktop</h4>
              <ol className="list-decimal pl-5 text-green-800 text-sm space-y-2 marker:font-bold">
                <li>Tap the browser menu (usually three dots <strong className="text-xl leading-none">⋮</strong> in the top right).</li>
                <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                <li>Follow the on-screen prompts to complete installation.</li>
              </ol>
            </div>
          )}
          
          <div className="mt-6">
            <button 
              onClick={onClose}
              className="w-full py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
