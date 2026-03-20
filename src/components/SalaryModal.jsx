import { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { X, Save, DollarSign, Edit, Check, Mail, Download, MessageCircle } from 'lucide-react';

export default function SalaryModal({ employee, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(null); // track sending id
  const [editingHistory, setEditingHistory] = useState(null); // id of history being edited
  const [currentBonus, setCurrentBonus] = useState('');
  const [currentAdvance, setCurrentAdvance] = useState('');

  const fetchSalaryDetails = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/salary/${employee.id}`);
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaryDetails();
  }, [employee]);

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
        deductions: Number(currentAdvance) || 0
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative z-[101]">
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

        <div className="p-6 overflow-y-auto w-full flex-1">
          {loading ? (
            <div className="text-center p-8 text-gray-500 animate-pulse">Loading salary information...</div>
          ) : data ? (
            <div className="space-y-8">
              {/* CURRENT MONTH CARD */}
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-6 shadow-sm">
                <h4 className="text-lg font-bold text-indigo-900 mb-4 border-b border-indigo-200/50 pb-2">
                  Current Month Estimation ({format(new Date(data.currentMonth.month + '-01'), 'MMMM yyyy')})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50/50">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider tooltip" title="Days physically present">Present Days</span>
                    <div className="text-2xl font-bold text-gray-900 mt-1">{data.currentMonth.totalDaysWorked} <span className="text-sm font-medium text-gray-400">/ {data.currentMonth.expectedWorkingDays}</span></div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50/50">
                    <span className="text-xs text-indigo-500 font-semibold uppercase tracking-wider tooltip" title="Includes Free Sundays + Present Days">Paid Days</span>
                    <div className="text-2xl font-bold text-indigo-700 mt-1">{data.currentMonth.totalPaidDays} <span className="text-sm font-medium text-indigo-300">/ {data.currentMonth.daysInMonth}</span></div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50/50">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Base Monthly</span>
                    <div className="text-2xl font-bold text-gray-900 mt-1">₹{data.currentMonth.monthlySalary}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50/50">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Bonus (+)</span>
                    <div className="flex items-center mt-1">
                      <span className="text-xl font-bold text-green-600 mr-1">₹</span>
                      <input
                        type="number"
                        className="w-full text-xl font-bold text-gray-900 border-b border-gray-200 focus:border-indigo-500 outline-none pb-1 bg-transparent"
                        value={currentBonus}
                        onChange={(e) => setCurrentBonus(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50/50">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Advance / Deductions (-)</span>
                    <div className="flex items-center mt-1">
                      <span className="text-xl font-bold text-red-500 mr-1">₹</span>
                      <input
                        type="number"
                        className="w-full text-xl font-bold text-gray-900 border-b border-gray-200 focus:border-red-500 outline-none pb-1 bg-transparent"
                        value={currentAdvance}
                        onChange={(e) => setCurrentAdvance(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 rounded-xl shadow-md text-white flex flex-col justify-center border border-indigo-500">
                    <span className="text-xs text-indigo-100 font-semibold uppercase tracking-wider">Total Net Pay</span>
                    <div className="text-3xl font-extrabold mt-1">
                      ₹{((data.currentMonth.estimatedSalary || 0) + (Number(currentBonus) || 0) - (Number(currentAdvance) || 0)).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveMonth}
                    disabled={saving}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Finalize & Save Month'}
                  </button>
                </div>
              </div>

              {/* HISTORY TABLE */}
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-4">Salary History</h4>
                {data.history && data.history.length > 0 ? (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Month</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Days</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Base</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Bonus</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Advance (-)</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Net Pay</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {data.history.map(record => {
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
            </div>
          ) : (
            <div className="text-center p-8 text-red-500">Failed to load salary data.</div>
          )}
        </div>
      </div>
    </div>
  );
}
