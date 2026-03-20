import { useState } from 'react';
import axios from 'axios';
import { Droplets } from 'lucide-react';

export default function Login() {
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!contact.trim()) return;
    
    setLoading(true);
    setError('');

    try {
      const dbResponse = await axios.post('/api/login', { contact, password });
      if (dbResponse.data.success) {
        localStorage.setItem('user', JSON.stringify(dbResponse.data.user));
        // Force hard redirect to reload state completely
        window.location.replace('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative background blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-white opacity-10 rounded-full mix-blend-overlay filter blur-3xl transform -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-white opacity-10 rounded-full mix-blend-overlay filter blur-3xl transform translate-x-1/2 translate-y-1/2"></div>

      <div className="max-w-md w-full space-y-8 bg-white/95 backdrop-blur-sm p-10 rounded-3xl shadow-2xl border border-white/20 relative z-10">
        <div className="text-center flex flex-col items-center">
          <div className="mb-4">
            <img src="/logo.png" alt="Sri Krishna Dairy" className="h-28 w-auto object-contain mx-auto drop-shadow-md" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Sri Krishna Milk Dairy</h2>
          <p className="mt-2 text-sm text-gray-500 font-medium">Sign in to manage attendance</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm bg-opacity-80 border border-red-100 flex items-center gap-2">
              <span className="block">{error}</span>
            </div>
          )}
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="contact" className="block text-sm font-medium text-gray-700 mb-1">Contact Number / Email</label>
              <input
                id="contact"
                name="contact"
                type="text"
                required
                className="appearance-none rounded-xl relative block w-full px-4 py-3.5 border border-gray-200 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all shadow-sm bg-gray-50 hover:bg-white focus:bg-white"
                placeholder="e.g., admin@dairy.com"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-xl relative block w-full px-4 py-3.5 border border-gray-200 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all shadow-sm bg-gray-50 hover:bg-white focus:bg-white"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:transform-none"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
              )}
              {loading ? 'Signing in...' : 'Sign In to Dashboard'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
