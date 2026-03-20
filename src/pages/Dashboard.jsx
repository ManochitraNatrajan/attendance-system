import { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { Users, UserCheck, UserX, Clock } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0 });
  const [loading, setLoading] = useState(true);
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const [empRes, attRes] = await Promise.all([
          axios.get('/api/employees'),
          axios.get(`/api/attendance?date=${todayStr}`)
        ]);

        const totalEmployees = empRes.data.length;
        const presentToday = attRes.data.length;

        setStats({
          total: totalEmployees,
          present: presentToday,
          absent: totalEmployees - presentToday
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 bg-gray-200 rounded-full mb-4"></div>
          <div className="h-4 w-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 text-left m-0">Dashboard</h1>
        <p className="text-gray-500 mt-1 text-left">Overview of today's attendance metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Employees"
          value={stats.total}
          icon={Users}
          color="bg-blue-500"
          bgColor="bg-blue-50"
        />
        <StatCard
          title="Present Today"
          value={stats.present}
          icon={UserCheck}
          color="bg-green-500"
          bgColor="bg-green-50"
        />
        <StatCard
          title="Absent Today"
          value={stats.absent}
          icon={UserX}
          color="bg-red-500"
          bgColor="bg-red-50"
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
          <a href="/attendance" className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-purple-700 transition font-medium text-sm">
            Mark Attendance
          </a>
          {user?.role === 'Admin' && (
            <a href="/employees" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium text-sm">
              Manage Employees
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bgColor, isText }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col relative overflow-hidden group">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${bgColor}`}>
          <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
        </div>
      </div>
      <h3 className="text-gray-500 text-sm font-medium text-left">{title}</h3>
      <p className={`text-3xl font-bold text-gray-900 text-left mt-1 ${isText ? 'text-xl' : ''}`}>
        {value}
      </p>
      <div className={`absolute bottom-0 left-0 h-1 w-full ${color} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
    </div>
  );
}
