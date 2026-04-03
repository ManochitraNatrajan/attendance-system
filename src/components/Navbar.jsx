import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Droplets, Users, CheckSquare, BarChart3, LogOut, LayoutDashboard } from 'lucide-react';
import clsx from 'clsx';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user'));

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Attendance', path: '/attendance', icon: CheckSquare },
    { name: 'Employees', path: '/employees', icon: Users, adminOnly: true },
  ];

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-[9999]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center gap-2">
              <img src="/logo.png" alt="Logo" className="h-8 sm:h-10 w-auto object-contain drop-shadow-sm" />
              <span className="font-bold text-base sm:text-xl text-gray-900 tracking-tight">Sri Krishna Milk Dairy</span>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-4 h-full">
              {navItems.map((item) => {
                if (item.adminOnly && user?.role !== 'Admin') return null;
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={clsx(
                      "inline-flex items-center px-3 gap-2 h-full text-sm font-medium border-b-2 transition-colors",
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
          <div className="flex items-center gap-4">
            <div className="text-sm hidden sm:block">
              <span className="text-gray-500">Welcome, </span>
              <span className="font-medium text-gray-900">{user?.name}</span>
              <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs">{user?.role}</span>
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
      <div className="sm:hidden border-t border-gray-200 bg-white flex justify-around w-full fixed bottom-0 left-0 pb-safe">
        {navItems.map((item) => {
          if (item.adminOnly && user?.role !== 'Admin') return null;
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={clsx(
                "flex flex-col items-center justify-center w-full py-2 gap-1 text-xs font-medium transition-colors",
                active ? "text-[var(--accent)]" : "text-gray-500"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
