import { useState, useEffect, useMemo, memo } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { X, Save, DollarSign, Edit, Check, Mail, Download, MessageCircle, ChevronDown } from 'lucide-react';

const SalaryModal = memo(function SalaryModal({ employee, onClose }) {
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(null); 
  const [editingHistory, setEditingHistory] = useState(null);
  const [currentBonus, setCurrentBonus] = useState('');
  const [currentAdvance, setCurrentAdvance] = useState('');
  const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
  const currentMonthStr = format(nowIST, 'yyyy-MM');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const [archiveData, setArchiveData] = useState([]);

  const [availableMonths, setAvailableMonths] = useState([{ value: currentMonthStr, display: format(nowIST, 'MMMM yyyy') }]);

  useEffect(() => {
    const fetchAvailableMonths = async () => {
      try {
        const targetId = employee?.id || employee?._id;
        if (!targetId) return;
        const res = await axios.get(`/api/attendance/available-months`);
        let fetchedMonths = Array.isArray(res.data) ? res.data : [];
        if (!fetchedMonths.some(m => m.value === currentMonthStr)) {
          fetchedMonths = [{ value: currentMonthStr, display: format(nowIST, 'MMMM yyyy') }, ...fetchedMonths];
        }
        fetchedMonths.sort((a, b) => b.value.localeCompare(a.value));
        
        setAvailableMonths(fetchedMonths);
        if (fetchedMonths.length > 0 && !selectedMonth) {
          setSelectedMonth(fetchedMonths[0].value);
        }
      } catch (err) {
        console.error("Failed to fetch available months for salary modal", err);
      }
    };
    fetchAvailableMonths();
  }, [employee]);
  
  // availableMonths handled by the fetchAvailableMonths useEffect above

  const filteredHistory = useMemo(() => {
    return data?.history ? data.history.filter(r => selectedMonth ? r.month === selectedMonth : true) : [];
  }, [data?.history, selectedMonth]);


  const fetchSalaryDetails = async () => {
    try {
      setLoading(true);
      setData(null);
      setError(null);
      const targetId = employee?.id || employee?._id;
      if (!targetId) throw new Error("Employee ID is completely missing from current data.");
      
      let url = `/api/salary/${targetId}`;
      const buster = `t=${Date.now()}`;
      if (selectedMonth) {
         url += `?month=${selectedMonth}&${buster}`;
      } else {
         url += `?${buster}`;
      }
      
      const res = await axios.get(url, { timeout: 5000 });
      setData(res.data);
      
      try {
        const archRes = await axios.get(`/api/salary/archive/${encodeURIComponent(employee.name)}`, { timeout: 3000 });
        setArchiveData(archRes.data);
      } catch(archErr) {
        console.error("Archive Fetch Error:", archErr);
      }
    } catch (err) {
      console.error("Salary Fetch Error:", err);
      setError(err.response?.data?.message || err.message || "Failed to load salary data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaryDetails();
  }, [employee?.id, selectedMonth]);

  const handleSaveMonth = async () => {
    if (!data || !data.currentMonth) return;
    setSaving(true);
    try {
      await axios.post('/api/salary/save', {
        employeeId: employee.id,
        month: data.currentMonth.month,
        totalDays: data.currentMonth.totalPaidDays,
        monthlySalary: data.currentMonth.monthlySalary,
        totalSalary: data.currentMonth.estimatedSalary,
        bonus: Number(currentBonus) || 0,
        deductions: Number(currentAdvance) || 0,
        travelExpense: data.currentMonth.totalTravelExpense || 0,
        foodExpense: data.currentMonth.totalFoodExpense || 0
      });
      alert('Salary month saved to history!');
      setCurrentBonus('');
      setCurrentAdvance('');
      fetchSalaryDetails();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save salary month.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateHistory = async (id, updates) => {
    try {
      await axios.put(`/api/salary/history/${id}`, updates);
      setEditingHistory(null);
      fetchSalaryDetails();
    } catch (err) {
      alert('Failed to update salary record.');
    }
  };

  const handleSendPayslip = async (recordId) => {
    setSendingEmail(recordId);
    try {
      await axios.post('/api/salary/send-payslip', { recordId });
      alert('Payslip successfully emailed to ' + employee.contact);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send payslip email.');
    } finally {
      setSendingEmail(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col relative z-[99999] animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-300 ease-out transform-gpu">
        <div className="px-6 py-4 flex justify-between items-center border-b border-gray-100 bg-gray-50/50">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="text-green-600" />
              Salary Slip
            </h3>
            <p className="text-sm text-gray-500 mt-1">For {employee.name} ({employee.role})</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-white hover:bg-gray-100 rounded-full p-2 transition-colors border border-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto w-full flex-1 scroll-smooth overscroll-contain will-change-scroll">
          {loading ? (
            <div className="space-y-6 w-full opacity-70 animate-pulse mt-2">
               <div className="h-28 bg-gray-100 rounded-2xl w-full border border-gray-200"></div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-24 bg-gray-100 rounded-xl border border-gray-200"></div>
                  <div className="h-24 bg-gray-100 rounded-xl border border-gray-200"></div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="h-28 bg-gray-100 rounded-xl border border-gray-200"></div>
                  <div className="h-28 bg-gray-100 rounded-xl border border-gray-200"></div>
                  <div className="h-28 bg-gray-100 rounded-xl border border-gray-200"></div>
                  <div className="h-28 bg-gray-100 rounded-xl border border-gray-200"></div>
                  <div className="h-28 bg-gray-100 rounded-xl border border-gray-200"></div>
               </div>
               <div className="h-64 bg-gray-100 rounded-2xl w-full mt-8 border border-gray-200"></div>
            </div>
          ) : data ? (
            <div className="space-y-8">
                <div className="bg-[#f8faff] border border-blue-100 rounded-3xl p-8 shadow-sm mb-8 relative transition-all">
                  <div className="text-center mb-8">
                    <h4 className="text-xl font-bold text-indigo-900 flex items-center justify-center gap-2">
                      Current Month Estimation ({format(new Date(selectedMonth + '-01'), 'MMMM yyyy')})
                      <div className="relative ml-4 inline-block text-left">
                        <button 
                          onClick={() => setIsMonthDropdownOpen(!isMonthDropdownOpen)}
                          className="flex items-center gap-2 px-3 py-1 bg-white border border-blue-200 rounded-lg shadow-sm text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
                        >
                          Change
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isMonthDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isMonthDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsMonthDropdownOpen(false)}></div>
                            <div className="absolute left-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="max-h-60 overflow-y-auto">
                                {availableMonths.map(m => (
                                   <button 
                                     key={m.value}
                                     onClick={() => {
                                       setSelectedMonth(m.value);
                                       setIsMonthDropdownOpen(false);
                                     }}
                                     className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                        selectedMonth === m.value ? 'bg-indigo-50 text-indigo-700 font-bold border-l-4 border-indigo-600' : 'text-gray-700 hover:bg-gray-50'
                                     }`}
                                   >
                                      {m.display}
                                   </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Present Days</span>
                      <div className="text-3xl font-black text-gray-800">
                        {data.currentMonth.totalDaysWorked} <span className="text-gray-300 text-xl">/ {data.currentMonth.expectedWorkingDays}</span>
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-2">Paid Days</span>
                      <div className="text-3xl font-black text-indigo-600">
                        {data.currentMonth.totalPaidDays} <span className="text-indigo-200 text-xl">/ {data.currentMonth.daysInMonth}</span>
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Base Monthly</span>
                      <div className="text-3xl font-black text-gray-800">₹{data.currentMonth.monthlySalary}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Bonus (+)</span>
                      <div className="flex items-center text-green-600 font-black text-xl">
                        <span>₹</span>
                        <input 
                          type="number" 
                          value={currentBonus} 
                          onChange={(e) => setCurrentBonus(e.target.value)}
                          placeholder="0"
                          className="w-full bg-transparent border-b border-gray-100 focus:border-green-400 outline-none text-center ml-1 py-1"
                        />
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Travel (+)</span>
                      <div className="text-xl font-black text-gray-800">₹{data.currentMonth.totalTravelExpense}</div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Food (+)</span>
                      <div className="text-xl font-black text-gray-800">₹{data.currentMonth.totalFoodExpense}</div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Advance / Deductions (-)</span>
                      <div className="flex items-center text-red-500 font-black text-xl">
                        <span>₹</span>
                        <input 
                          type="number" 
                          value={currentAdvance} 
                          onChange={(e) => setCurrentAdvance(e.target.value)}
                          placeholder="0"
                          className="w-full bg-transparent border-b border-gray-100 focus:border-red-400 outline-none text-center ml-1 py-1"
                        />
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-2xl shadow-lg flex flex-col items-center justify-center text-center text-white">
                      <span className="text-[10px] text-white/70 font-bold uppercase tracking-widest mb-2">Total Net Pay</span>
                      <div className="text-xl font-black">
                        ₹{Math.round((data.currentMonth.estimatedSalary || 0) + (Number(currentBonus) || 0) - (Number(currentAdvance) || 0) + (data.currentMonth.totalTravelExpense || 0) + (data.currentMonth.totalFoodExpense || 0)).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center mt-8">
                    <button
                      onClick={handleSaveMonth}
                      disabled={saving}
                      className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-200 active:scale-95 disabled:opacity-70"
                    >
                      <Save className="w-5 h-5" />
                      {saving ? 'Saving...' : 'Finalize & Save Month'}
                    </button>
                  </div>
                </div>
              {/* HISTORY TABLE */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 relative">
                  <h4 className="text-lg font-bold text-gray-900">Salary History</h4>
                </div>
                {filteredHistory && filteredHistory.length > 0 ? (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Month</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Days</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Base</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Bonus</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Travel</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Food</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Advance (-)</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Net Pay</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {filteredHistory.map(record => {
                          const isEditing = editingHistory === record.id;
                          return (
                            <tr key={record.id} className="hover:bg-gray-50">
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{record.month}</td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{record.totalDays ?? '-'}</td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">₹{record.baseSalary?.toLocaleString() ?? 0}</td>

                              <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    defaultValue={record.bonus}
                                    id={`bonus-${record.id}`}
                                    className="w-20 text-right border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 outline-none"
                                  />
                                ) : (
                                  <span className="text-green-600 font-medium">+₹{record.bonus?.toLocaleString() || 0}</span>
                                )}
                              </td>

                              <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                                <span className="text-green-600 font-medium">+₹{record.travelExpense?.toLocaleString() || 0}</span>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                                <span className="text-green-600 font-medium">+₹{record.foodExpense?.toLocaleString() || 0}</span>
                              </td>

                              <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    defaultValue={record.deductions}
                                    id={`deduction-${record.id}`}
                                    className="w-20 text-right border border-red-300 rounded px-2 py-1 focus:ring-1 focus:ring-red-500 outline-none"
                                  />
                                ) : (
                                  <span className="text-red-500 font-medium">-₹{record.deductions?.toLocaleString() || 0}</span>
                                )}
                              </td>

                              <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                                ₹{record.netSalary?.toLocaleString() ?? 0}
                              </td>

                              <td className="px-4 py-4 whitespace-nowrap text-center">
                                {record.isPaid ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <Check className="w-3 h-3" /> Paid
                                  </span>
                                ) : (
                                  <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    Pending
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                {isEditing ? (
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => {
                                        const bonus = document.getElementById(`bonus-${record.id}`).value;
                                        const deductions = document.getElementById(`deduction-${record.id}`).value;
                                        handleUpdateHistory(record.id, { bonus, deductions });
                                      }}
                                      className="text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded text-xs transition"
                                    >
                                      Save
                                    </button>
                                    <button onClick={() => setEditingHistory(null)} className="text-gray-500 hover:text-gray-700 bg-gray-100 px-3 py-1 rounded text-xs transition">
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex justify-end gap-2 items-center">

                                      <button
                                        onClick={() => {
                                          const base = axios.defaults.baseURL || window.location.origin;
                                          const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
                                          const downloadUrl = `${cleanBase}/api/salary/download-payslip/${record.id}`;
                                          console.log("Initiating download from:", downloadUrl);
                                          window.open(downloadUrl, '_blank');
                                        }}
                                        className="text-gray-600 hover:text-indigo-900 border-2 border-indigo-500 bg-indigo-50 hover:bg-indigo-100 p-1.5 rounded-lg flex items-center justify-center transition animate-pulse"
                                        title="Download PDF Payslip (UPDATE v0.0.1)"
                                      >
                                        <Download className="w-4 h-4" />
                                      </button>

                                    <button
                                      onClick={() => {
                                        const phone = (employee.contact || '').replace(/\D/g, '');
                                        const encodedMessage = encodeURIComponent(`Hello ${employee.name}, please find your payslip for ${record.month} attached. (Send PDF manually after downloading)`);
                                        const waUrl = phone ? `https://wa.me/${phone}?text=${encodedMessage}` : `https://wa.me/?text=${encodedMessage}`;
                                        window.open(waUrl, '_blank');
                                      }}
                                      className="text-green-600 hover:text-green-900 border border-green-200 bg-green-50 hover:bg-green-100 p-1.5 rounded-lg flex items-center justify-center transition"
                                      title="Share via WhatsApp"
                                    >
                                      <MessageCircle className="w-4 h-4" />
                                    </button>
                                    {!record.isPaid && (
                                      <button
                                        onClick={() => handleUpdateHistory(record.id, { isPaid: true })}
                                        className="text-green-600 hover:text-green-900 font-semibold text-xs py-1 border border-green-200 bg-green-50 hover:bg-green-100 px-2 rounded transition"
                                        title="Mark as Paid"
                                      >
                                        Pay
                                      </button>
                                    )}
                                    <button onClick={() => setEditingHistory(record.id)} className="text-gray-500 hover:text-gray-900 p-1">
                                      <Edit className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                  <div className="bg-gray-50 rounded-xl p-8 border border-gray-100 text-center text-gray-500 flex flex-col items-center">
                    <DollarSign className="w-12 h-12 text-gray-300 mb-2" />
                    <p>No salary history records found.</p>
                    <p className="text-sm mt-1">Save the current month to create a record.</p>
                  </div>
                )}
              </div>
              
              {/* ARCHIVED RECORDS TABLE */}
              {archiveData && archiveData.length > 0 && (
                <div className="mt-8">
                  <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Save className="w-5 h-5 text-gray-500" />
                    Archived Salary Summaries
                  </h4>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Month</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Days</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Hours</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Final Salary</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {archiveData.map(arch => (
                            <tr key={arch.id} className="hover:bg-gray-50">
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{arch.month}</td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{arch.totalWorkingDays}</td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{arch.totalWorkingHours}</td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">₹{arch.finalSalary.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center p-8 text-red-500 bg-red-50 rounded-xl m-4 border border-red-100 flex flex-col items-center gap-2">
              <X className="w-8 h-8"/>
              <p className="font-bold">{error || "Failed to load salary data."}</p>
              <button onClick={fetchSalaryDetails} className="mt-2 text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg">Retry</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default SalaryModal;
