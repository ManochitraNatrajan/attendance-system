import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Download, ChevronDown, ChevronUp, Search, Calendar, User, FileSpreadsheet } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import clsx from 'clsx';

export default function Records({ employees }) {
  const [activeTab, setActiveTab] = useState('daily');
  const user = JSON.parse(localStorage.getItem('user'));
  
  if (!user || user.role !== 'Admin') {
    return <div className="p-8 text-center text-red-500">Access Denied</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-64px)] overflow-y-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Records</h1>
          <p className="text-sm text-gray-500 mt-1">View and export historical attendance data</p>
        </div>
        
        <div className="flex p-1 bg-gray-100/80 backdrop-blur-md rounded-xl border border-gray-200/50 shadow-sm self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('daily')}
            className={clsx(
              "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2",
              activeTab === 'daily' ? "bg-white text-indigo-600 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            )}
          >
            <Calendar className="w-4 h-4" />
            Daily Records
          </button>
          <button
            onClick={() => setActiveTab('employee')}
            className={clsx(
              "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2",
              activeTab === 'employee' ? "bg-white text-indigo-600 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            )}
          >
            <User className="w-4 h-4" />
            Employee Records
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {activeTab === 'daily' ? <DailyRecords user={user} /> : <EmployeeRecords user={user} employees={employees} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// DAILY RECORDS COMPONENT
// ---------------------------------------------------------
function DailyRecords({ user }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedDates, setExpandedDates] = useState({});
  const [totalEmployees, setTotalEmployees] = useState(0);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchName, setSearchName] = useState('');
  const [monthYear, setMonthYear] = useState(''); // YYYY-MM
  const [availableMonths, setAvailableMonths] = useState([]);

  useEffect(() => {
    // Fetch available months
    axios.get('/api/attendance/available-months').then(res => {
      setAvailableMonths(res.data);
      if (res.data.length > 0 && !monthYear && !startDate) {
        setMonthYear(res.data[0].value);
      }
    }).catch(console.error);
    
    // Fetch total active employees for counts
    axios.get('/api/employees').then(res => {
        setTotalEmployees(res.data.length);
    }).catch(console.error);
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      let params = { adminId: user.id, limit: 10000 };
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      } else if (monthYear) {
        params.monthYear = monthYear;
      }

      const res = await axios.get('/api/admin/records/daily', { params });
      setRecords(res.data.records || []);
    } catch (err) {
      console.error(err);
      alert('Failed to fetch records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (monthYear || (startDate && endDate)) {
      fetchRecords();
    }
  }, [monthYear, startDate, endDate]);

  // Group records by date
  const groupedRecords = useMemo(() => {
    const groups = {};
    const lowerSearch = searchName.toLowerCase().trim();
    
    // Filter records by searchName if provided
    const filteredRecords = lowerSearch 
      ? records.filter(r => r.employeeName && r.employeeName.toLowerCase().includes(lowerSearch))
      : records;

    filteredRecords.forEach(r => {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    // Sort dates descending
    return Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)).map(date => ({
      date,
      data: groups[date]
    }));
  }, [records, searchName]);

  const toggleExpand = (date) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const calculateHours = (inTime, outTime, date) => {
    if (!inTime || !outTime || inTime === '-' || outTime === '-') return 0;
    try {
      const start = new Date(`${date}T${inTime}Z`);
      const end = new Date(`${date}T${outTime}Z`);
      return Math.max(0, (end - start) / (1000 * 60 * 60)).toFixed(2);
    } catch(e) { return 0; }
  };

  const exportExcel = (date, dateRecords) => {
    const data = dateRecords.map(r => {
      const workingHours = calculateHours(r.checkIn, r.checkOut, r.date);
      const otherExp = 0; // Not explicitly defined in schema, keep 0 or compute if exists
      const totalExp = (r.travelExpense || 0) + (r.foodExpense || 0) + otherExp;
      
      return {
        'Date': r.date,
        'Employee Name': r.employeeName,
        'Employee ID': r.employeeId,
        'Check In': r.checkIn || '-',
        'Check Out': r.checkOut || '-',
        'Working Hours': workingHours,
        'Work Details': r.workDetails && r.workDetails.length ? r.workDetails.join(', ') : '-',
        'Travel KM': r.distanceTraveled || 0,
        'Travel Expense': r.travelExpense || 0,
        'Food Expense': r.foodExpense || 0,
        'Other Expense': otherExp,
        'Total Expense': totalExp,
        'Attendance Status': r.status || '-',
        'Location': r.checkInLocationName || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    
    // Auto fit columns
    const keys = Object.keys(data[0] || {});
    const wscols = keys.map(k => ({ wch: Math.max(k.length, 15) }));
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `Attendance_${date}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by Name..." 
            value={searchName} 
            onChange={(e) => setSearchName(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
          />
        </div>
        
        <select 
          value={monthYear} 
          onChange={(e) => { setMonthYear(e.target.value); setStartDate(''); setEndDate(''); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
        >
          <option value="">-- Select Month --</option>
          {availableMonths.map(m => (
            <option key={m.value} value={m.value}>{m.display}</option>
          ))}
        </select>

        <span className="text-gray-400 text-sm">OR</span>

        <div className="flex items-center gap-2">
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => { setStartDate(e.target.value); setMonthYear(''); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
          <span className="text-gray-500 text-sm">to</span>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => { setEndDate(e.target.value); setMonthYear(''); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center p-8"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
        ) : groupedRecords.length === 0 ? (
          <div className="text-center p-8 text-gray-500">No records found for the selected filters.</div>
        ) : (
          groupedRecords.map(group => {
            const isExpanded = expandedDates[group.date];
            const presentCount = group.data.length;
            const absentCount = Math.max(0, totalEmployees - presentCount); // Approximate based on total

            return (
              <div key={group.date} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm transition-all">
                {/* Header */}
                <div 
                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(group.date)}
                >
                  <div className="flex items-center gap-4">
                    <button className="text-gray-400 hover:text-gray-600">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{format(parseISO(group.date), 'dd-MM-yyyy')}</h3>
                      <div className="flex gap-4 mt-1 text-sm text-gray-500">
                        <span>Total Employees: <span className="font-medium text-gray-700">{totalEmployees}</span></span>
                        <span>Present: <span className="font-medium text-green-600">{presentCount}</span></span>
                        <span>Absent: <span className="font-medium text-red-500">{absentCount}</span></span>
                      </div>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); exportExcel(group.date, group.data); }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Download Excel
                    </button>
                  )}
                </div>

                {/* Table */}
                {isExpanded && (
                  <div className="border-t border-gray-200 overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 font-medium">Employee Name</th>
                          <th className="px-4 py-3 font-medium">Employee ID</th>
                          <th className="px-4 py-3 font-medium">Check In</th>
                          <th className="px-4 py-3 font-medium">Check Out</th>
                          <th className="px-4 py-3 font-medium">Working Hrs</th>
                          <th className="px-4 py-3 font-medium">Work Details</th>
                          <th className="px-4 py-3 font-medium">Travel (KM)</th>
                          <th className="px-4 py-3 font-medium">Travel Exp</th>
                          <th className="px-4 py-3 font-medium">Food Exp</th>
                          <th className="px-4 py-3 font-medium">Total Exp</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Location</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.data.map(r => {
                          const hrs = calculateHours(r.checkIn, r.checkOut, r.date);
                          const totExp = (r.travelExpense || 0) + (r.foodExpense || 0);
                          return (
                            <tr key={r.id} className="hover:bg-gray-50/50">
                              <td className="px-4 py-3 font-medium text-gray-900">{r.employeeName}</td>
                              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.employeeId.slice(-6)}</td>
                              <td className="px-4 py-3 text-gray-600">{r.checkIn || '-'}</td>
                              <td className="px-4 py-3 text-gray-600">{r.checkOut || '-'}</td>
                              <td className="px-4 py-3 text-gray-900 font-medium">{hrs}</td>
                              <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={r.workDetails?.join(', ')}>{r.workDetails?.length ? r.workDetails.join(', ') : '-'}</td>
                              <td className="px-4 py-3 text-gray-600">{r.distanceTraveled?.toFixed(2) || '0.00'}</td>
                              <td className="px-4 py-3 text-gray-600">₹{r.travelExpense || 0}</td>
                              <td className="px-4 py-3 text-gray-600">₹{r.foodExpense || 0}</td>
                              <td className="px-4 py-3 text-indigo-600 font-medium">₹{totExp}</td>
                              <td className="px-4 py-3">
                                <span className={clsx(
                                  "px-2 py-1 text-xs rounded-full font-medium",
                                  r.status?.includes('Absent') ? "bg-red-50 text-red-700 border border-red-200" :
                                  r.status?.includes('Half') ? "bg-orange-50 text-orange-700 border border-orange-200" :
                                  "bg-green-50 text-green-700 border border-green-200"
                                )}>
                                  {r.status || '-'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-500 max-w-[150px] truncate" title={r.checkInLocationName}>{r.checkInLocationName || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// EMPLOYEE RECORDS COMPONENT
// ---------------------------------------------------------
function EmployeeRecords({ user, employees }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState('');
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [monthYear, setMonthYear] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);

  useEffect(() => {
    // Only fetch months specific to employee if one is selected, else general
    const url = selectedEmp ? `/api/attendance/available-months?employeeId=${selectedEmp}` : `/api/attendance/available-months`;
    axios.get(url).then(res => {
      setAvailableMonths(res.data);
    }).catch(console.error);
  }, [selectedEmp]);

  const fetchRecords = async () => {
    if (!selectedEmp) {
      setRecords([]);
      return;
    }
    
    setLoading(true);
    try {
      let params = { adminId: user.id, employeeId: selectedEmp, limit: 10000 };
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      } else if (monthYear) {
        params.monthYear = monthYear;
      }

      const res = await axios.get('/api/admin/records/employee', { params });
      setRecords(res.data.records || []);
    } catch (err) {
      console.error(err);
      alert('Failed to fetch employee records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEmp && (monthYear || (startDate && endDate))) {
      fetchRecords();
    } else if (!selectedEmp) {
      setRecords([]);
    }
  }, [selectedEmp, monthYear, startDate, endDate]);

  const calculateHours = (inTime, outTime, date) => {
    if (!inTime || !outTime || inTime === '-' || outTime === '-') return 0;
    try {
      const start = new Date(`${date}T${inTime}Z`);
      const end = new Date(`${date}T${outTime}Z`);
      return Math.max(0, (end - start) / (1000 * 60 * 60)).toFixed(2);
    } catch(e) { return 0; }
  };

  const exportExcel = () => {
    if (!records.length) return;
    
    const empName = records[0]?.employeeName || 'Employee';
    const data = records.map(r => {
      const workingHours = calculateHours(r.checkIn, r.checkOut, r.date);
      const otherExp = 0; 
      const totalExp = (r.travelExpense || 0) + (r.foodExpense || 0) + otherExp;
      
      return {
        'Date': r.date,
        'Check In': r.checkIn || '-',
        'Check Out': r.checkOut || '-',
        'Working Hours': workingHours,
        'Work Details': r.workDetails && r.workDetails.length ? r.workDetails.join(', ') : '-',
        'Travel KM': r.distanceTraveled || 0,
        'Travel Expense': r.travelExpense || 0,
        'Food Expense': r.foodExpense || 0,
        'Other Expense': otherExp,
        'Total Expense': totalExp,
        'Status': r.status || '-',
        'Location': r.checkInLocationName || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const keys = Object.keys(data[0] || {});
    const wscols = keys.map(k => ({ wch: Math.max(k.length, 15) }));
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "History");
    XLSX.writeFile(wb, `${empName.replace(/\s+/g, '_')}_Attendance_Report.xlsx`);
  };

  return (
    <div className="flex flex-col h-full min-h-[500px]">
      {/* Filters */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4 items-center">
          <select 
            value={selectedEmp} 
            onChange={(e) => setSelectedEmp(e.target.value)}
            className="border border-indigo-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-indigo-50 text-indigo-900 min-w-[200px]"
          >
            <option value="">-- Select Employee --</option>
            {employees?.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
            ))}
          </select>
          
          <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>
          
          <select 
            value={monthYear} 
            onChange={(e) => { setMonthYear(e.target.value); setStartDate(''); setEndDate(''); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
          >
            <option value="">-- All Months --</option>
            {availableMonths.map(m => (
              <option key={m.value} value={m.value}>{m.display}</option>
            ))}
          </select>

          <span className="text-gray-400 text-sm">OR</span>

          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => { setStartDate(e.target.value); setMonthYear(''); }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <span className="text-gray-500 text-sm">to</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => { setEndDate(e.target.value); setMonthYear(''); }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
        </div>
        
        {records.length > 0 && (
          <button 
            onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm hover:shadow-md"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Download Employee Excel
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto bg-white">
        {!selectedEmp ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-gray-400">
            <User className="w-16 h-16 mb-4 text-gray-200" />
            <p>Select an employee to view their records.</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center p-8"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
        ) : records.length === 0 ? (
          <div className="text-center p-8 text-gray-500">No attendance records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Check In</th>
                  <th className="px-6 py-4 font-medium">Check Out</th>
                  <th className="px-6 py-4 font-medium">Working Hrs</th>
                  <th className="px-6 py-4 font-medium">Work Details</th>
                  <th className="px-6 py-4 font-medium">Travel (KM)</th>
                  <th className="px-6 py-4 font-medium">Travel Exp</th>
                  <th className="px-6 py-4 font-medium">Food Exp</th>
                  <th className="px-6 py-4 font-medium">Total Exp</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map(r => {
                  const hrs = calculateHours(r.checkIn, r.checkOut, r.date);
                  const totExp = (r.travelExpense || 0) + (r.foodExpense || 0);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4 font-medium text-gray-900">{format(parseISO(r.date), 'dd-MM-yyyy')}</td>
                      <td className="px-6 py-4 text-gray-600">{r.checkIn || '-'}</td>
                      <td className="px-6 py-4 text-gray-600">{r.checkOut || '-'}</td>
                      <td className="px-6 py-4 text-gray-900 font-medium">{hrs}</td>
                      <td className="px-6 py-4 text-gray-500 max-w-[200px] truncate" title={r.workDetails?.join(', ')}>{r.workDetails?.length ? r.workDetails.join(', ') : '-'}</td>
                      <td className="px-6 py-4 text-gray-600">{r.distanceTraveled?.toFixed(2) || '0.00'}</td>
                      <td className="px-6 py-4 text-gray-600">₹{r.travelExpense || 0}</td>
                      <td className="px-6 py-4 text-gray-600">₹{r.foodExpense || 0}</td>
                      <td className="px-6 py-4 text-indigo-600 font-medium">₹{totExp}</td>
                      <td className="px-6 py-4">
                        <span className={clsx(
                          "px-2.5 py-1 text-xs rounded-full font-medium",
                          r.status?.includes('Absent') ? "bg-red-50 text-red-700 border border-red-200" :
                          r.status?.includes('Half') ? "bg-orange-50 text-orange-700 border border-orange-200" :
                          "bg-green-50 text-green-700 border border-green-200"
                        )}>
                          {r.status || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 max-w-[200px] truncate" title={r.checkInLocationName}>{r.checkInLocationName || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
