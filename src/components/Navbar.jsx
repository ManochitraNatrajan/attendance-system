import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Droplets, Users, CheckSquare, BarChart3, LogOut, LayoutDashboard, Folder } from 'lucide-react';
import clsx from 'clsx';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user'));

  const handleLogout = () => {
    localStorage.removeItem('user');
    // Clear any residual check-in or tracking states
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('checkIn_') || key === 'isCheckedIn') {
        localStorage.removeItem(key);
      }
    });
    window.location.href = '/login';
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Attendance', path: '/attendance', icon: CheckSquare },
    { name: 'Employees', path: '/employees', icon: Users, adminOnly: true },
    { name: 'Records', path: '/records', icon: Folder, adminOnly: true },
  ];

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-[9999]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center gap-2">
              <img src="/logo.png" alt="Logo" className="h-8 sm:h-10 w-auto object-contain drop-shadow-sm" />
              <span className="font-bold text-lg lg:text-xl text-gray-900 tracking-tight hidden lg:block">Sri Krishna Milk Dairy</span>
            </div>
            <div className="hidden sm:ml-2 md:ml-6 sm:flex sm:space-x-1 md:space-x-4 h-full">
              {navItems.map((item) => {
                if (item.adminOnly && user?.role !== 'Admin') return null;
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={clsx(
                      "inline-flex items-center px-2 md:px-3 gap-1 md:gap-2 h-full text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                      active ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 lg:gap-4 shrink-0 pl-2">
            <div className="hidden md:flex flex-col items-end justify-center pr-3 border-r border-gray-100 h-10">
              <span className="font-semibold text-gray-900 text-sm leading-none truncate max-w-[120px]">{user?.name}</span>
              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold leading-none mt-1 tracking-wide uppercase">{user?.role}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-full text-gray-400 hover:text-gray-500 hover:bg-gray-100 transition-colors"
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile nav */}
      <div className="sm:hidden border-t border-gray-100 bg-white/95 backdrop-blur-md flex justify-around w-full fixed bottom-0 left-0 pb-safe pt-2 z-[9999] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          if (item.adminOnly && user?.role !== 'Admin') return null;
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={clsx(
                "flex flex-col items-center justify-center w-full py-1 gap-1 text-[10px] font-bold uppercase tracking-widest transition-all active:scale-90",
                active ? "text-indigo-600" : "text-gray-400"
              )}
            >
              <div className={clsx(
                "p-2 rounded-2xl transition-all",
                active ? "bg-indigo-50" : "bg-transparent"
              )}>
                <item.icon className={clsx("w-5 h-5", active ? "stroke-[2.5px]" : "stroke-[2px]")} />
              </div>
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
