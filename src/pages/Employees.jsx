import { useState, useEffect, useRef, memo } from 'react';
import axios from 'axios';
import { Search, Plus, Edit2, Trash2, X, DollarSign } from 'lucide-react';
import SalaryModal from '../components/SalaryModal';

const Employees = memo(function Employees({ employees: globalEmployees, refreshEmployees }) {
  const [employees, setEmployees] = useState(globalEmployees || []);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchTimeoutRef = useRef(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  
  const [otpStep, setOtpStep] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [sendingLoading, setSendingLoading] = useState(false);

  const [viewingSalaryEmployee, setViewingSalaryEmployee] = useState(null);

  const initialFormState = { name: '', role: 'Employee', contact: '', password: '', monthlySalary: '' };
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    if (globalEmployees) {
      setEmployees(globalEmployees);
    }
  }, [globalEmployees]);

  useEffect(() => {
    // Silently refresh in background
    if (refreshEmployees) refreshEmployees();
  }, []);

  const handleSearch = (e) => {
    const val = e.target.value;
    setSearchInput(val);
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearch(val.toLowerCase());
    }, 300);
  };

  const filteredEmployees = employees.filter(emp => {
    const searchLower = search.toLowerCase();
    const name = (emp.name || '').toLowerCase();
    const contact = (emp.contact || '').toLowerCase();
    const role = (emp.role || '').toLowerCase();
    
    return name.includes(searchLower) || 
           contact.includes(searchLower) || 
           role.includes(searchLower);
  });

  const handleOpenModal = (employee = null) => {
    if (employee) {
      setCurrentEmployee(employee);
      setFormData({ name: employee.name, role: employee.role, contact: employee.contact, password: '', monthlySalary: employee.monthlySalary || '' });
    } else {
      setCurrentEmployee(null);
      setFormData(initialFormState);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentEmployee(null);
    setFormData(initialFormState);
    setOtpStep(false);
    setEnteredOtp('');
    setOtpError('');
    setSendingLoading(false);
  };

  const handleBeginSave = async (e) => {
    e.preventDefault();
    setSendingLoading(true);
    try {
      if (currentEmployee) {
        await axios.put(`/api/employees/${currentEmployee.id}`, formData);
      } else {
        await axios.post('/api/employees', formData);
        alert('Employee added successfully!');
      }
      if (refreshEmployees) refreshEmployees();
      handleCloseModal();
    } catch (err) {
      console.error(err);
      alert('Failed to save employee data.');
    } finally {
      setSendingLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    try {
      await axios.delete(`/api/employees/${id}`);
      if (refreshEmployees) refreshEmployees();
    } catch (err) {
      console.error(err);
      alert('Failed to delete employee');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-300 ease-in-out">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 text-left m-0">Employees</h1>
          <p className="text-gray-500 mt-1 text-left">Manage your workforce</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-[var(--accent)] text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition"
        >
          <Plus className="w-5 h-5" />
          Add Employee
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center bg-gray-50">
          <div className="relative w-full max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search employees..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)] sm:text-sm transition"
              value={searchInput}
              onChange={handleSearch}
            />
          </div>
        </div>

        {!globalEmployees ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-gray-500 font-medium">Loading employees...</p>
          </div>
        ) : (
          <div className="w-full">
            {/* Mobile Card View */}
            <div className="md:hidden space-y-4 px-2 p-4">
              {filteredEmployees.length > 0 ? filteredEmployees.map((emp) => (
                <div key={emp.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm active:scale-95 transition-all">
                  <div className="flex justify-between items-start mb-3">
                    <button 
                      onClick={() => setViewingSalaryEmployee(emp)}
                      className="text-left"
                    >
                      <h4 className="font-black text-indigo-600 text-lg">{emp.name}</h4>
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{emp.contact}</p>
                    </button>
                    <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${emp.role === 'Admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                      {emp.role}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                    <div className="flex flex-col">
                       <span className="text-[9px] text-gray-400 uppercase font-black">Monthly Salary</span>
                       <span className="font-bold text-gray-900 text-sm">₹{emp.monthlySalary?.toLocaleString() || '0'}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleOpenModal(emp)} className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(emp.id)} className="p-2 bg-red-50 text-red-600 rounded-xl">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-dashed">No employees found.</div>
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredEmployees.length > 0 ? filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-left">
                        <button 
                          onClick={() => setViewingSalaryEmployee(emp)}
                          className="font-bold text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 underline-offset-2 flex items-center gap-1"
                          title="View Salary Details"
                        >
                          {emp.name}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-gray-500">
                        {emp.contact}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-left">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${emp.role === 'Admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                          {emp.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => handleOpenModal(emp)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(emp.id)} className="text-red-600 hover:text-red-900">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                        No employees found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center bg-gray-900/60 backdrop-blur-md p-4 pt-24 pb-20 sm:pt-32 sm:pb-24 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col relative z-[1001] my-auto animate-in zoom-in-95 slide-in-from-top-8 duration-300">
            <div className="px-6 py-5 flex justify-between items-center border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10">
              <h3 className="text-xl font-black text-gray-900 tracking-tight">
                {currentEmployee ? 'Edit Employee' : 'Add Employee'}
              </h3>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 bg-white hover:bg-gray-100 rounded-xl p-2 transition-all border border-gray-200 shadow-sm active:scale-90">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto custom-scrollbar max-h-[60vh] sm:max-h-[70vh]">
              <form onSubmit={handleBeginSave} className="p-6">
                <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
                      <input
                        type="text"
                        required
                        className="block w-full border border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all font-medium"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Contact / Email</label>
                      <input
                        type="text"
                        required
                        className="block w-full border border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all font-medium"
                        value={formData.contact}
                        onChange={e => setFormData({...formData, contact: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Role</label>
                        <select
                          className="block w-full border border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all font-bold text-gray-700 bg-gray-50/50"
                          value={formData.role}
                          onChange={e => setFormData({...formData, role: e.target.value})}
                        >
                          <option value="Employee">Employee</option>
                          <option value="Admin">Admin</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Monthly Salary (₹)</label>
                        <input
                          type="number"
                          required
                          className="block w-full border border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all font-bold text-indigo-600"
                          value={formData.monthlySalary}
                          onChange={e => setFormData({...formData, monthlySalary: e.target.value})}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">
                         Password {currentEmployee && <span className="text-gray-400 font-normal lowercase">(Blank to keep)</span>}
                      </label>
                      <input
                        type="password"
                        required={!currentEmployee}
                        placeholder={currentEmployee ? "••••••••" : "Enter new password"}
                        className="block w-full border border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all font-medium"
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                      />
                    </div>
                  </div>
                <div className="mt-8 flex flex-row justify-end gap-3 pt-5 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-6 py-3 rounded-xl border border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-50 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sendingLoading}
                    className={`px-6 py-3 rounded-xl border border-transparent text-white font-bold shadow-lg transition-all active:scale-95 ${sendingLoading ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}
                  >
                    {sendingLoading ? 'Saving...' : 'Save Employee'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {viewingSalaryEmployee && (
         <SalaryModal 
           employee={viewingSalaryEmployee} 
           onClose={() => setViewingSalaryEmployee(null)} 
         />
      )}
    </div>
  );
});

export default Employees;
