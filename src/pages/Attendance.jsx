import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import axios from 'axios';
import Skeleton from '../components/Skeleton';
import { format } from 'date-fns';
import { LogIn, LogOut, CheckCircle, Clock, MapPin, Search, X, Activity, ChevronDown, AlertTriangle } from 'lucide-react';
import RouteTrackingModal from '../components/RouteTrackingModal';
import { LocationTracker } from '../services/LocationTracker';
import { getSyncedTime } from '../utils/timeSync';

let activeLocationTracker = null;

const formatTimeStr = (timeStr) => {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr;
  try {
    // If it's an ISO string (contains T or -)
    if (timeStr.includes('T') || timeStr.includes('-')) {
      return format(new Date(timeStr), 'hh:mm a');
    }
    // If it's already in HH:mm format
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      let h = parseInt(parts[0], 10);
      const m = parts[1].split(' ')[0]; // ignore existing AM/PM if any
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${m} ${ampm}`;
    }
    return timeStr;
  } catch (e) {
    return timeStr;
  }
};

const hasWorkDetails = (record) => {
  if (!record) return false;
  // Check individual points first (new storage)
  for (let i = 1; i <= 10; i++) {
    if (record[`workPoint${i}`]?.trim()) return true;
  }
  // Check workDetails array (legacy storage)
  if (record.workDetails && Array.isArray(record.workDetails)) {
    return record.workDetails.some(w => w && typeof w === 'string' && w.trim());
  }
  return false;
};

const Attendance = memo(function Attendance({ records: globalRecords, refreshRecords }) {
  const [records, setRecords] = useState(globalRecords || []);
  const [todayRecord, setTodayRecord] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [workDetails, setWorkDetails] = useState(Array(10).fill(''));
  const [viewingDetailsFor, setViewingDetailsFor] = useState(null);
  const [travelExpenseAmount, setTravelExpenseAmount] = useState('');
  const [travelDistance, setTravelDistance] = useState('');
  const [foodExpenseAmount, setFoodExpenseAmount] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [viewingMapFor, setViewingMapFor] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const user = JSON.parse(localStorage.getItem('user')) || {};
  const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
  const todayStr = format(nowIST, 'yyyy-MM-dd');
  const currentMonthStr = format(nowIST, 'yyyy-MM');

  const [availableMonths, setAvailableMonths] = useState([{ value: currentMonthStr, display: format(nowIST, 'MMMM yyyy') }]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const [employeeList, setEmployeeList] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');

  useEffect(() => {
    const fetchAvailableMonths = async () => {
      try {
        const userObj = JSON.parse(localStorage.getItem('user'));
        if (!userObj || !userObj.id) return;
        const endpoint = userObj.role === 'Admin' 
          ? '/api/attendance/available-months' 
          : `/api/attendance/available-months?employeeId=${userObj.id}`;
        const res = await axios.get(endpoint);
        let fetchedMonths = Array.isArray(res.data) ? res.data : [];
        if (!fetchedMonths.some(m => m.value === currentMonthStr)) {
          fetchedMonths = [{ value: currentMonthStr, display: format(nowIST, 'MMMM yyyy') }, ...fetchedMonths];
        }
        // Ensure they are sorted descending (latest first)
        fetchedMonths.sort((a, b) => b.value.localeCompare(a.value));
        
        setAvailableMonths(fetchedMonths);
        
        if (fetchedMonths.length > 0 && !selectedMonth) {
          setSelectedMonth(fetchedMonths[0].value);
        }
        if (userObj.role === 'Admin') {
           const empRes = await axios.get('/api/employees');
           setEmployeeList(empRes.data);
        }
      } catch (err) {
        console.error("Failed to fetch available months or employees", err);
      }
    };
    fetchAvailableMonths();
  }, [user.role, user.id]);
  const [locationError, setLocationError] = useState(true);

  useEffect(() => {
     const handleGpsStatus = (e) => {
         setLocationError(e.detail.error);
     };
     window.addEventListener('gps-status', handleGpsStatus);
     
     if (navigator.geolocation) {
         navigator.geolocation.getCurrentPosition(
             () => setLocationError(false),
             () => setLocationError(true),
             { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 }
         );
     }
     
     return () => window.removeEventListener('gps-status', handleGpsStatus);
  }, []);

  // availableMonths handled by the fetchAvailableMonths useEffect above

  const filteredRecords = useMemo(() => {
    const safeRecords = Array.isArray(records) ? records : [];
    let filtered = safeRecords;
    if (selectedMonth) {
      filtered = filtered.filter(r => r && r.date && r.date.startsWith(selectedMonth));
    }
    if (selectedEmployee && selectedEmployee !== 'All') {
      filtered = filtered.filter(r => r && (r.employeeId === selectedEmployee || r.employeeId?.toString() === selectedEmployee.toString()));
    }
    return filtered;
  }, [records, selectedMonth, selectedEmployee]);

  // user and dates moved up for default state



  useEffect(() => {
    if (globalRecords && Array.isArray(globalRecords)) {
      // Only overwrite records from globalRecords if we are viewing the current month
      const isCurrentMonth = !selectedMonth || (availableMonths?.length > 0 && selectedMonth === availableMonths[0].value);
      
      if (isCurrentMonth) {
          setRecords(globalRecords);
          setPage(1);
          setHasMore(globalRecords.length >= 20);
      }
      
      const userTodayRecord = globalRecords.find(r => r && r.employeeId === user.id && r.date === todayStr);
      setTodayRecord(userTodayRecord || null);
      
      if (userTodayRecord) {
        setTravelDistance(userTodayRecord.distanceTraveled !== undefined ? userTodayRecord.distanceTraveled.toString() : '');
        setFoodExpenseAmount(userTodayRecord.foodExpense !== undefined ? userTodayRecord.foodExpense.toString() : '');
        
        // Set work details state from individual points
        const points = [];
        for (let i = 1; i <= 10; i++) {
          points.push(userTodayRecord[`workPoint${i}`] || '');
        }
        setWorkDetails(points);
        
        // Start tracking if checked in but not checked out (resume session)
        if (!userTodayRecord.checkOut && !userTodayRecord.isCheckedOut && !activeLocationTracker) {
             activeLocationTracker = new LocationTracker(user.id);
             activeLocationTracker.startTracking();
        }
        
        // Disable tracking if checked out
        if ((userTodayRecord.checkOut || userTodayRecord.isCheckedOut) && activeLocationTracker) {
             activeLocationTracker.stopTracking();
             activeLocationTracker = null;
        }
        
      } else {
        setWorkDetails(Array(10).fill(''));
        setTravelDistance('');
        setTravelExpenseAmount('');
        setFoodExpenseAmount('');
      }
    }
  }, [globalRecords, user.id, todayStr, selectedMonth, availableMonths]);

  useEffect(() => {
    // Silently refresh global records in background on mount
    if (refreshRecords) refreshRecords();
  }, []);

  useEffect(() => {
    if (!selectedMonth) return;
    const fetchMonthData = async () => {
       setRecords([]);
       const endpoint = user.role === 'Admin' 
         ? `/api/attendance?date=${selectedMonth}`
         : `/api/attendance?employeeId=${user.id}&date=${selectedMonth}`;
         
       try {
         const res = await axios.get(endpoint);
         setRecords(Array.isArray(res.data) ? res.data : []);
         setPage(1);
         setHasMore(false); // Monthly view shows all for that month, pagination disabled
       } catch (err) {
         console.error("Failed to fetch month data", err);
       }
    };
    fetchMonthData();
  }, [selectedMonth, user.role, user.id]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const endpoint = user.role === 'Admin' 
         ? `/api/attendance?page=${nextPage}&limit=20`
         : `/api/attendance?employeeId=${user.id}&page=${nextPage}&limit=20`;
      
      const res = await axios.get(endpoint);
      if (res.data.length < 20) setHasMore(false);
      
      setRecords(prev => {
         // Deduplicate records just in case
         const existingIds = new Set(prev.map(r => r.id));
         const newRecords = res.data.filter(r => !existingIds.has(r.id));
         return [...prev, ...newRecords];
      });
      setPage(nextPage);
    } catch (e) {
      console.error("Failed to load more records", e);
    } finally {
      setLoadingMore(false);
    }
  }, [page, hasMore, loadingMore, user.id, user.role]);



  useEffect(() => {
    // Left empty since RouteTrackingModal handles Leaflet now
  }, [viewingMapFor]);



  const fetchLocationName = async (lat, lng) => {
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const address = res.data?.address;
      if (!address) return 'Local Area';
      return address.sublocality || address.locality || address.neighborhood || address.neighbourhood || address.village || address.hamlet || address.suburb || address.area || address.route || address.town || address.county || 'Local Area';
    } catch {
      return '';
    }
  };

  const getExactLocation = async () => {
    return await LocationTracker.getExactPosition();
  };

  const handleCheckIn = async () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
    }

    setActionLoading(true);
    let latitude = null;
    let longitude = null;
    let locationName = 'Unknown Location (GPS Failed)';

    try {
      const position = await getExactLocation();
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
      locationName = await fetchLocationName(latitude, longitude);
    } catch (err) {
      console.error("GPS Check-in error:", err);
      if (err.message?.includes('accuracy') || err.message?.includes('timeout') || err.code === 2 || err.code === 3) {
         alert('GPS WARNING: Could not get an accurate location within the time limit. Checking in without location.');
      } else if (err.code === 1 || err.message?.includes('denied')) {
         alert('PERMISSION WARNING: Location access is denied. Please enable location permissions. Checking in without location.');
      } else {
         alert('Failed to get location. Checking in without location.');
      }
    }

    try {
      const checkInTimeStr = getSyncedTime().toISOString();
      
      if (latitude && longitude) {
        localStorage.setItem(`checkIn_${user.id}_${todayStr}`, JSON.stringify({
          checkInTime: checkInTimeStr,
          latitude,
          longitude
        }));
      }

      const res = await axios.post('/api/attendance/check-in', { 
        employeeId: user.id,
        latitude,
        longitude,
        locationName
      });

      if (latitude && longitude) {
        try {
           await axios.post('/api/location/start', {
              employeeId: user.id, latitude, longitude, city: locationName
           });
           
           activeLocationTracker = new LocationTracker(user.id);
           await activeLocationTracker.startTracking();
        } catch (trackErr) {
           console.error("Failed to start tracking", trackErr);
        }
      }

      setTodayRecord(res.data);
      localStorage.setItem('isCheckedIn', 'true');
      
      if (refreshRecords) refreshRecords();
      
      setTimeout(() => {
        const el = document.getElementById('work-details-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);

    } catch (err) {
      console.error("Check-in API error:", err);
      alert(err.response?.data?.message || 'Failed to check-in. Please check your connection.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);

    let finalLat = null;
    let finalLng = null;
    let locationName = 'Unknown Location (GPS Failed)';
    
    try {
      const position = await getExactLocation();
      finalLat = position.coords.latitude;
      finalLng = position.coords.longitude;
      locationName = await fetchLocationName(finalLat, finalLng);
    } catch (e) {
      console.error("GPS lock failed on checkout:", e);
      if (e.message?.includes('accuracy') || e.message?.includes('timeout') || e.code === 2 || e.code === 3) {
         alert('GPS WARNING: Could not get an accurate location. Checking out without location.');
      } else if (e.code === 1 || e.message?.includes('denied')) {
         alert('PERMISSION WARNING: Location access is denied. Checking out without location.');
      } else {
         alert('Failed to get location. Checking out without location.');
      }
    }

    const checkOutTimeDate = getSyncedTime();
    const checkInDataStr = localStorage.getItem(`checkIn_${user.id}_${todayStr}`);
    
    let diffHrs = 0;
    if (checkInDataStr) {
      try {
        const checkInData = JSON.parse(checkInDataStr);
        if (checkInData.checkInTime) {
          const checkInDate = new Date(checkInData.checkInTime);
          const diffMs = checkOutTimeDate - checkInDate;
          diffHrs = diffMs / (1000 * 60 * 60);
        }
      } catch (e) {
        console.error("Error parsing check-in info", e);
      }
    }

    const status = diffHrs >= 4 ? "Full Day Present" : "Half Day Present";
    
    setSessionSummary({
      checkInTime: todayRecord?.checkIn || "-",
      checkOutTime: format(checkOutTimeDate, 'hh:mm a'),
      workingHours: diffHrs.toFixed(2),
      distance: Number(travelDistance) || 0,
      travelExpense: (Number(travelDistance) || 0) * 2.5,
      foodExpense: foodExpenseAmount || 0,
      status,
      workDetails: [...workDetails]
    });

    try {
      if (!locationName && finalLat && finalLng) {
        locationName = await fetchLocationName(finalLat, finalLng);
      }

      const res = await axios.post('/api/attendance/check-out', { 
        employeeId: user.id,
        latitude: finalLat,
        longitude: finalLng,
        status: status,
        locationName,
        distanceTraveled: Number(travelDistance) || 0,
        foodExpense: Number(foodExpenseAmount) || 0,
        workDetails: workDetails
      });

      // Stop route tracking
      try {
         await axios.post('/api/location/stop', {
            employeeId: user.id, latitude: finalLat, longitude: finalLng, city: locationName
         });
         
         if (activeLocationTracker) {
            await activeLocationTracker.stopTracking();
            activeLocationTracker = null;
         }
      } catch (trackErr) {
         console.error("Failed to stop tracking", trackErr);
      }

      // Clear todayRecord or update it to reflect check-out for the button logic
      setTodayRecord(res.data);
      localStorage.removeItem('isCheckedIn');
      if (refreshRecords) refreshRecords();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to check-out');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveWorkDetails = async () => {
    try {
      setSavingDetails(true);
      const distance = Number(travelDistance) || 0;
      const foodAmount = Number(foodExpenseAmount) || 0;

      // Explicitly construct the 10-point payload to ensure consistency
      const pointsPayload = {};
      for (let i = 0; i < 10; i++) {
        pointsPayload[`workPoint${i + 1}`] = workDetails[i] || '';
      }

      const response = await axios.post('/api/attendance/work-details', {
        employeeId: user.id,
        distanceTraveled: distance,
        foodExpense: foodAmount,
        workDetails: workDetails, // Keep array for backward compatibility
        ...pointsPayload
      });
      
      const updatedRecord = response.data;
      
      // Update local records state immediately with robust matching
      setRecords(prev => prev.map(r => {
        const isMatch = (r.id && updatedRecord.id && r.id === updatedRecord.id) || 
                        (r._id && updatedRecord._id && r._id === updatedRecord._id) ||
                        (r.date === updatedRecord.date && (r.employeeId?.toString() === updatedRecord.employeeId?.toString()));
        
        if (isMatch) {
          return { ...r, ...updatedRecord, employeeName: r.employeeName }; // preserve name
        }
        return r;
      }));
      
      // Update today record
      setTodayRecord(prev => prev ? ({ ...prev, ...updatedRecord }) : updatedRecord);
      
      // Sync work details state from individual points
      const points = [];
      for (let i = 1; i <= 10; i++) {
        points.push(updatedRecord[`workPoint${i}`] || '');
      }
      setWorkDetails(points);

      alert('Work Details Saved Successfully!');
      if (refreshRecords) refreshRecords();
    } catch (err) {
      console.error(err);
      alert('Failed to save work details. Please try again.');
    } finally {
      setSavingDetails(false);
    }
  };

  const handleShowMap = (record) => {
    if (!record) return;
    
    // Robust date parsing
    let formattedDate = '';
    try {
      if (typeof record.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
        formattedDate = record.date;
      } else {
        formattedDate = format(new Date(record.date), 'yyyy-MM-dd');
      }
    } catch (e) { 
      console.error("Date error in handleShowMap:", e);
      formattedDate = todayStr; // Fallback to today
    }

    console.log(`[UI] Opening map for ${record.employeeName || user.name} on ${formattedDate}`);
    
    setViewingMapFor({ 
       employeeId: record.employeeId || user.id, 
       date: formattedDate,
       employeeName: record.employeeName || user.name
    });
  };

  const handleAction = async (type) => {
    if (type === 'check-in') {
      await handleCheckIn();
    } else {
      await handleCheckOut();
    }
  };

  if (!globalRecords) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-8 text-left">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl mb-8" />
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
             <Skeleton className="h-6 w-32" />
          </div>
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-300 ease-in-out">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 text-left m-0">Attendance</h1>
        <p className="text-gray-500 mt-1 text-left">Track daily check-ins and check-outs</p>
      </div>

      {locationError && todayRecord && !todayRecord.isCheckedOut && !todayRecord.checkOut && (
         <div className="bg-red-50 border border-red-200 p-4 rounded-xl mb-8 flex items-center gap-3 animate-in fade-in zoom-in duration-300">
           <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
           <p className="text-red-700 font-bold text-lg m-0">Location is not recognizable</p>
         </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-[var(--accent-border)] p-6 mb-8 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Today's Attendance</h2>
          <p className="text-sm text-gray-500 mt-1">{format(new Date(), 'EEEE, MMMM do yyyy')}</p>
          <div className="mt-4 flex items-center gap-3 justify-center sm:justify-start">
            {todayRecord ? (
                <div className="flex gap-4">
                   <div className="flex flex-col items-center sm:items-start text-sm bg-green-50 px-4 py-2 rounded-lg border border-green-100">
                     <span className="text-gray-500 flex items-center gap-1"><LogIn className="w-4 h-4 text-green-600"/> Check-in</span>
                     <span className="font-bold text-gray-900">{formatTimeStr(todayRecord.checkIn)}</span>
                   </div>
                   {todayRecord.checkOut ? (
                      <div className="flex flex-col items-center sm:items-start text-sm bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
                        <span className="text-gray-500 flex items-center gap-1"><LogOut className="w-4 h-4 text-blue-600"/> Check-out</span>
                        <span className="font-bold text-gray-900">{formatTimeStr(todayRecord.checkOut)}</span>
                      </div>
                   ) : (
                      <div className="flex flex-col items-center sm:items-start text-sm bg-yellow-50 px-4 py-2 rounded-lg border border-yellow-100">
                        <span className="text-yellow-700 flex items-center gap-1"><Clock className="w-4 h-4 text-yellow-600"/> Missing</span>
                        <span className="font-bold text-gray-500">Not checked out</span>
                      </div>
                   )}
                </div>
            ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                  Not marked yet
                </span>
            )}
          </div>
          
          {/* Tracking indicator display */}
          {todayRecord && !todayRecord.isCheckedOut && !todayRecord.checkOut && (
             <div className="mt-3 flex items-center gap-2 justify-center sm:justify-start pt-3 border-t border-gray-100">
               {locationError ? (
                 <>
                   <AlertTriangle className="w-4 h-4 text-red-500" />
                   <span className="text-xs font-bold text-red-600 uppercase tracking-widest">Location is not recognizable</span>
                 </>
               ) : (
                 <>
                   <span className="relative flex h-3 w-3">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                   </span>
                   <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Live Location Tracking Active</span>
                 </>
               )}
             </div>
          )}
        </div>
        
        <div className="flex gap-4 w-full sm:w-auto">
          {!todayRecord ? (
            <button
              onClick={() => handleAction('check-in')}
              disabled={actionLoading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-medium shadow-sm disabled:opacity-70"
            >
              <LogIn className="w-5 h-5" />
              Check In
            </button>
          ) : !todayRecord.checkOut ? (
            <button
              onClick={() => handleAction('check-out')}
              disabled={actionLoading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium shadow-sm disabled:opacity-70"
            >
              <LogOut className="w-5 h-5" />
              Check Out
            </button>
          ) : (
             <div className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gray-100 text-gray-500 px-6 py-3 rounded-lg font-medium border border-gray-200 cursor-not-allowed">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Completed for Today
            </div>
          )}
        </div>
      </div>

      {todayRecord && (
        <div id="work-details-section" className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-6 mb-8 relative transition-all hover:shadow-md">
          <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Clock className="text-indigo-600 w-5 h-5" />
            Work Details & Expenses
          </h2>
          <p className="text-sm text-gray-500 mb-6 font-medium">Log your daily summary and valid expenses here.</p>
          
          <div className="mb-6">
            <label className="text-sm font-bold text-gray-700 mb-4 block flex items-center gap-2">
              Daily Work Points (10 Points)
              <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase tracking-tighter font-black">Fill any or all</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((idx) => (
                <div key={idx} className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400 font-black text-xs group-focus-within:text-indigo-600 transition-colors">
                    #{idx + 1}
                  </span>
                  <input 
                    type="text"
                    value={workDetails[idx] || ''} 
                    onChange={e => {
                      const newDetails = [...workDetails];
                      newDetails[idx] = e.target.value;
                      setWorkDetails(newDetails);
                    }}
                    disabled={todayRecord?.isCheckedOut || todayRecord?.checkOut}
                    placeholder={`Enter work point ${idx + 1}...`} 
                    className="w-full border border-gray-200 bg-gray-50/50 rounded-xl shadow-sm py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed group-hover:border-indigo-200"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 bg-gradient-to-br from-gray-50 to-indigo-50/30 rounded-xl border border-gray-100 mb-6">
            <div>
              <label className="text-sm font-bold text-gray-700 mb-2 block">Travel Distance (KM)</label>
              <input 
                type="number" 
                min="0" 
                step="0.1"
                value={travelDistance} 
                onChange={e => setTravelDistance(e.target.value)} 
                disabled={todayRecord.isCheckedOut || todayRecord.checkOut}
                placeholder="e.g. 20" 
                className="w-full border border-gray-200 bg-white rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed" 
              />
            </div>
            <div>
              <label className="text-sm font-bold text-gray-700 mb-2 block">Travel Expense (₹)</label>
              <div className="w-full border border-gray-200 bg-gray-50 rounded-xl shadow-sm py-3 px-4 text-indigo-700 font-bold">
                ₹{(Number(travelDistance) * 2.5).toFixed(2)}
              </div>
            </div>
            <div>
              <label className="text-sm font-bold text-gray-700 mb-2 block">Food Expense (₹)</label>
              <input 
                type="number" 
                min="0" 
                value={foodExpenseAmount} 
                onChange={e => setFoodExpenseAmount(e.target.value)} 
                disabled={todayRecord.isCheckedOut || todayRecord.checkOut}
                placeholder="e.g. 150" 
                className="w-full border border-gray-200 bg-white rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed" 
              />
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4 border-t border-gray-100 pt-6">
             {(!todayRecord.isCheckedOut && !todayRecord.checkOut) && (
                 <button 
                   onClick={handleSaveWorkDetails} 
                   disabled={savingDetails}
                   className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 hover:shadow-lg transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                 >
                   {savingDetails ? (
                     <span className="flex items-center gap-2">
                       <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                       Saving...
                     </span>
                   ) : (
                     <>
                       <CheckCircle className="w-4 h-4" /> Save Details
                     </>
                   )}
                 </button>
             )}
          </div>
        </div>
      )}

      {sessionSummary && (
        <div className="bg-white rounded-xl shadow-sm border border-[var(--accent-border)] p-6 mb-8 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="w-full">
            <h2 className="text-xl font-semibold text-gray-900">Session Summary</h2>
            <div className="mt-4 flex flex-row overflow-x-auto pb-2 gap-4 snap-x whitespace-nowrap">
              <div className="flex flex-col text-sm bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 shrink-0 snap-start">
                <span className="text-gray-500">Check In</span>
                <span className="font-bold text-gray-900">{sessionSummary.checkInTime}</span>
              </div>
              <div className="flex flex-col text-sm bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 shrink-0 snap-start">
                <span className="text-gray-500">Check Out</span>
                <span className="font-bold text-gray-900">{sessionSummary.checkOutTime}</span>
              </div>
              <div className="flex flex-col text-sm bg-blue-50 px-4 py-2 rounded-lg border border-blue-200 shrink-0 snap-start">
                <span className="text-blue-800">Total Hours</span>
                <span className="font-bold text-blue-900">{sessionSummary.workingHours} hrs</span>
              </div>
              <div className="flex flex-col text-sm bg-green-50 px-4 py-2 rounded-lg border border-green-200 shrink-0 snap-start">
                <span className="text-green-800">Travel Expense</span>
                <span className="font-bold text-green-900">₹{sessionSummary.travelExpense} ({sessionSummary.distance} km)</span>
              </div>
              <div className="flex flex-col text-sm bg-orange-50 px-4 py-2 rounded-lg border border-orange-200 shrink-0 snap-start">
                <span className="text-orange-800">Food Expense</span>
                <span className="font-bold text-orange-900">₹{sessionSummary.foodExpense}</span>
              </div>
              <div className={`flex flex-col text-sm px-4 py-2 rounded-lg border font-bold justify-center items-center shrink-0 snap-start ${
                sessionSummary.status === 'Present' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200'
              }`}>
                {sessionSummary.status}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-8 transition-all hover:shadow-md">
        <div className="px-6 py-5 border-b border-blue-100/50 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative rounded-t-2xl">
          <h3 className="text-lg font-bold text-indigo-950 text-left">Attendance History</h3>
          <div className="relative z-50 flex items-center gap-2">
                {user?.role === 'Admin' && (
                  <div className="relative">
                    <button 
                      onClick={() => {
                        setIsEmployeeDropdownOpen(!isEmployeeDropdownOpen);
                        setEmployeeSearchTerm('');
                      }}
                      className="flex items-center justify-between w-full sm:w-56 px-4 py-2.5 bg-white border border-indigo-200 rounded-xl shadow-sm text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-indigo-300 transition-all focus:ring-2 focus:ring-indigo-100 outline-none"
                    >
                      <span className="truncate pr-2">{employeeList.find(e => e.id === selectedEmployee)?.name || (selectedEmployee === 'All' ? 'All Employees' : 'Select Employee')}</span>
                      <ChevronDown className={`w-4 h-4 text-indigo-500 shrink-0 transition-transform duration-200 ${isEmployeeDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isEmployeeDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsEmployeeDropdownOpen(false)}></div>
                        <div className="absolute left-0 sm:right-0 mt-2 w-full sm:w-64 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 py-3 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                          <div className="px-3 pb-3 mb-2 border-b border-gray-50">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                              <input 
                                type="text"
                                placeholder="Search employee..."
                                autoFocus
                                value={employeeSearchTerm}
                                onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition-all font-medium"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          
                          <div className="max-h-60 overflow-y-auto px-1 custom-scrollbar">
                            <button
                              onClick={() => { setSelectedEmployee('All'); setIsEmployeeDropdownOpen(false); }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-all rounded-lg mb-0.5 ${selectedEmployee === 'All' ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-100' : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'}`}
                            >
                               All Employees
                            </button>
                            
                            {employeeList
                              .filter(emp => emp.name.toLowerCase().includes(employeeSearchTerm.toLowerCase()))
                              .map(emp => (
                               <button 
                                 key={emp.id}
                                 onClick={() => { setSelectedEmployee(emp.id); setIsEmployeeDropdownOpen(false); }}
                                 className={`w-full text-left px-4 py-2.5 text-sm transition-all rounded-lg mb-0.5 ${selectedEmployee === emp.id ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-100' : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'}`}
                               >
                                  <span className="truncate block">{emp.name}</span>
                               </button>
                            ))}

                            {employeeList.filter(emp => emp.name.toLowerCase().includes(employeeSearchTerm.toLowerCase())).length === 0 && (
                              <div className="py-8 text-center text-gray-400 text-sm italic">
                                No employee found
                              </div>
                            )}
                          </div>
                         </div>
                      </>
                    )}
                  </div>
                )}
                <div className="relative">
                <button 
                  onClick={() => setIsMonthDropdownOpen(!isMonthDropdownOpen)}
                  className="flex items-center justify-between w-full sm:w-48 px-4 py-2 bg-white border border-blue-200 rounded-xl shadow-sm text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-blue-300 transition-all"
                >
                  {availableMonths.find(m => m.value === selectedMonth)?.display || format(nowIST, 'MMMM yyyy')}
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isMonthDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isMonthDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsMonthDropdownOpen(false)}></div>
                    <div className="absolute right-0 sm:right-0 mt-2 w-full sm:w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="max-h-60 overflow-y-auto">
                        {availableMonths.map(m => (
                           <button 
                             key={m.value}
                             onClick={() => {
                               setSelectedMonth(m.value);
                               setIsMonthDropdownOpen(false);
                             }}
                             className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                selectedMonth === m.value ? 'bg-indigo-50 text-indigo-700 font-bold border-l-4 border-indigo-600' : 'text-gray-700 hover:bg-gray-50 font-medium border-l-4 border-transparent'
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
          </div>
        </div>
        {!globalRecords ? (
          <div className="p-8 text-center text-gray-500">Loading records...</div>
        ) : (
          <>
            <div className="md:hidden">
            {(filteredRecords || []).length > 0 ? (filteredRecords || []).map((record) => (
              <div key={record.id} className="p-4 border-b border-gray-100 last:border-0 bg-white hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-900">{record.date || '-'}</p>
                    {user?.role === 'Admin' && <p className="text-xs text-indigo-600 font-semibold mt-0.5">{record.employeeName || 'Unknown'}</p>}
                  </div>
                  <span className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-black rounded-full shadow-sm ${
                    record.status?.includes('Full') ? 'bg-green-500 text-white' : 
                    record.status?.includes('Half') ? 'bg-orange-400 text-white' : 
                    'bg-gray-400 text-white'
                  }`}>
                    {record.status || 'Present'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                   <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 uppercase font-black mb-1">Check In</p>
                      <p className="text-sm font-bold text-gray-700">{formatTimeStr(record.checkIn) || '--:--'}</p>
                   </div>
                   <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 uppercase font-black mb-1">Check Out</p>
                      <p className="text-sm font-bold text-gray-700">{formatTimeStr(record.checkOut) || '--:--'}</p>
                   </div>
                </div>

                <div className="space-y-3 mb-4">
                   <div className="flex flex-col gap-2">
                     {record.checkInLocation && (
                        <a href={`https://www.google.com/maps?q=${record.checkInLocation.lat},${record.checkInLocation.lng}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-2 rounded-lg bg-blue-50/50 border border-blue-100/50">
                           <div className="bg-blue-500 p-2 rounded-lg"><MapPin className="w-4 h-4 text-white"/></div>
                           <div className="flex flex-col text-left">
                              <span className="text-xs font-bold text-blue-700 truncate">IN: {record.checkInLocationName || 'Start Loc'}</span>
                              <span className="text-[10px] text-blue-400 font-mono italic">View on Google Maps</span>
                           </div>
                        </a>
                     )}
                     {record.checkOutLocation && (
                        <a href={`https://www.google.com/maps?q=${record.checkOutLocation.lat},${record.checkOutLocation.lng}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-2 rounded-lg bg-emerald-50/50 border border-emerald-100/50">
                           <div className="bg-emerald-500 p-2 rounded-lg"><MapPin className="w-4 h-4 text-white"/></div>
                           <div className="flex flex-col text-left">
                              <span className="text-xs font-bold text-emerald-700 truncate">OUT: {record.checkOutLocationName || 'Final Loc'}</span>
                              <span className="text-[10px] text-emerald-400 font-mono italic">View on Google Maps</span>
                           </div>
                        </a>
                     )}
                     {record.currentLocation && !record.isCheckedOut && (!record.checkOut || record.checkOut === '-') && (
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-red-50 border border-red-100 animate-pulse">
                           <div className="bg-red-500 p-2 rounded-lg"><Activity className="w-4 h-4 text-white"/></div>
                           <div className="text-left"><span className="text-xs font-black text-red-600 uppercase tracking-widest">Employee is Live</span></div>
                        </div>
                     )}
                   </div>

                   <div className="flex flex-wrap gap-2">
                      <div className="bg-gray-100 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-gray-200">
                         <span className="text-[10px] font-black text-gray-400 uppercase">Dist:</span>
                         <span className="text-xs font-extrabold text-gray-700">{record.distanceTraveled || 0} km</span>
                      </div>
                      <div className="bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-indigo-100">
                         <span className="text-[10px] font-black text-indigo-400 uppercase">Travel:</span>
                         <span className="text-xs font-extrabold text-indigo-700">₹{record.travelExpense || 0}</span>
                      </div>
                      <div className="bg-orange-50 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-orange-100">
                         <span className="text-[10px] font-black text-orange-400 uppercase">Food:</span>
                         <span className="text-xs font-extrabold text-orange-700">₹{record.foodExpense || 0}</span>
                      </div>
                   </div>
                </div>

                <div className="flex flex-col gap-2">
                   <div className="flex gap-2 w-full">
                       {record?.checkInLocation && (
                          <button 
                            onClick={() => handleShowMap(record)} 
                            className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm shadow-md shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                          >
                            <Search className="w-4 h-4"/> ROUTE TRACKING
                          </button>
                       )}
                       <div className="flex-1">
                          {record.workDetails?.some(w => w?.trim()) ? (
                            <button 
                              onClick={() => setViewingDetailsFor(record)}
                              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                              Work Details
                            </button>
                          ) : (
                            <div className="text-center py-2 text-gray-400 font-black text-xs uppercase tracking-tighter">*</div>
                          )}
                       </div>
                   </div>
                   {record?.checkOutLocation && record?.checkInLocation && (
                      <a 
                        href={`https://www.google.com/maps/dir/?api=1&origin=${record.checkInLocation.lat},${record.checkInLocation.lng}&destination=${record.checkOutLocation.lat},${record.checkOutLocation.lng}&travelmode=driving`} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-3 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                         <MapPin className="w-4 h-4"/> GET GOOGLE ROUTE
                      </a>
                   )}
                </div>
              </div>
            )) : (
              <div className="p-8 text-center text-gray-500">No records found.</div>
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  {user.role === 'Admin' && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px] md:min-w-[200px]">Employee</th>}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check In</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check Out</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dist / Exp</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Work Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(filteredRecords || []).length > 0 ? (filteredRecords || []).map((record) => (
                  <React.Fragment key={record.id}>
                   <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-gray-900 font-bold">
                      {record.date}
                    </td>
                    {user.role === 'Admin' && (
                       <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-indigo-600 font-bold">
                        {record.employeeName}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-gray-500">
                      {formatTimeStr(record.checkIn) || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-gray-500">
                      {formatTimeStr(record.checkOut) || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-gray-500">
                      <div className="flex flex-col gap-1 text-xs">
                        {record.checkInLocation && (
                           <div className="mb-1">
                             <a href={`https://www.google.com/maps?q=${record.checkInLocation.lat},${record.checkInLocation.lng}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 font-medium whitespace-normal flex flex-col">
                               <span><MapPin className="w-3 h-3 inline mr-1"/>IN: {record.checkInLocationName || 'Start Loc'}</span>
                               <span className="text-[9px] text-gray-400 font-mono mt-0.5">({record.checkInLocation.lat.toFixed(6)}, {record.checkInLocation.lng.toFixed(6)})</span>
                             </a>
                           </div>
                        )}
                        {record.checkOutLocation && (
                           <div className="mb-1">
                             <a href={`https://www.google.com/maps?q=${record.checkOutLocation.lat},${record.checkOutLocation.lng}`} target="_blank" rel="noreferrer" className="text-green-600 hover:text-green-800 font-medium whitespace-normal flex flex-col">
                               <span><MapPin className="w-3 h-3 inline mr-1"/>OUT: {record.checkOutLocationName || 'Final Loc'}</span>
                               <span className="text-[9px] text-gray-400 font-mono mt-0.5">({record.checkOutLocation.lat.toFixed(6)}, {record.checkOutLocation.lng.toFixed(6)})</span>
                             </a>
                           </div>
                        )}
                        {record.currentLocation && !record.isCheckedOut && (!record.checkOut || record.checkOut === '-') ? <a href={`https://www.google.com/maps?q=${record.currentLocation.lat},${record.currentLocation.lng}`} target="_blank" rel="noreferrer" className="text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 animate-pulse"><MapPin className="w-4 h-4" /> LIVE</a> : null}
                        
                        {record.checkInLocation && (
                           <div className="flex flex-col gap-2 mt-1.5">
                            <button 
                               onClick={() => handleShowMap(record)} 
                               className="bg-indigo-600 text-white px-3 py-2 rounded-lg border border-indigo-700 font-bold text-center hover:bg-indigo-700 transition flex items-center justify-center gap-1 shadow-sm text-[11px] uppercase tracking-wider min-w-[140px]"
                            >
                                <Search className="w-3.5 h-3.5"/>
                                Route Tracking
                            </button>
                            {record.checkOutLocation && (
                              <a href={`https://www.google.com/maps/dir/?api=1&origin=${record.checkInLocation.lat},${record.checkInLocation.lng}&destination=${record.checkOutLocation.lat},${record.checkOutLocation.lng}&travelmode=driving`} target="_blank" rel="noreferrer" className="bg-white text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-200 font-semibold text-center hover:bg-indigo-50 transition flex items-center justify-center gap-1 text-[10px] min-w-[140px]">
                                  <MapPin className="w-3 h-3"/> Google Route
                              </a>
                            )}
                           </div>
                        )}

                        {!record.checkInLocation && !record.checkOutLocation && !record.currentLocation && '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 text-gray-900 font-bold bg-gray-50 px-2 py-1 rounded border border-gray-100 w-fit">
                            <span className="text-[10px] text-gray-400 uppercase">Dist:</span>
                            <span>{record.distanceTraveled || 0} km</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-green-700 font-extrabold bg-green-50 px-2 py-1 rounded border border-green-100 w-fit">
                            <span className="text-[10px] text-green-500 uppercase">Travel:</span>
                            <span>₹{record.travelExpense || 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-orange-700 font-extrabold bg-orange-50 px-2 py-1 rounded border border-orange-100 w-fit">
                            <span className="text-[10px] text-orange-500 uppercase">Food:</span>
                            <span>₹{record.foodExpense || 0}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-left text-sm text-gray-500 w-48">
                      {hasWorkDetails(record) ? (
                         <button 
                            onClick={() => setViewingDetailsFor(record)}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 w-full"
                         >
                            Show Work Details
                         </button>
                      ) : (
                         <div className="text-center w-full font-black text-gray-300">*</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-left">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        record.status === 'Present' ? 'bg-green-100 text-green-800' : 
                        record.status === 'Half Day Present' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-red-100 text-red-800'
                      }`}>
                        {record.status}
                      </span>
                    </td>
                  </tr>
                </React.Fragment>
               )) : (
               <tr>
                 <td colSpan={user.role === 'Admin' ? "8" : "6"} className="px-6 py-8 text-center text-gray-500">
                   {selectedMonth ? `No records exist for ${availableMonths.find(m => m.value === selectedMonth)?.display || selectedMonth}.` : "No attendance records found."}
                 </td>
               </tr>
             )}
              </tbody>
            </table>
          </div>
            
            {hasMore && (
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-white text-indigo-600 border border-indigo-200 rounded-full text-sm font-semibold hover:bg-indigo-50 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {loadingMore ? (
                    <><span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span> Loading...</>
                  ) : "Load More Records"}
                </button>
              </div>
            )}
            
          </>
        )}
      </div>

      {viewingDetailsFor && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-gray-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300 pt-24 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col relative z-[10000] animate-in zoom-in-95 slide-in-from-top-8 duration-500 ease-out my-auto">
            <div className="px-8 py-6 flex justify-between items-center border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10">
              <div>
                <h3 className="text-2xl font-black text-indigo-900 tracking-tight">Work Details</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">For {viewingDetailsFor.employeeName} • {viewingDetailsFor.date}</p>
              </div>
              <button onClick={() => setViewingDetailsFor(null)} className="text-gray-400 hover:text-gray-600 bg-white hover:bg-gray-100 rounded-2xl p-3 transition-all border border-gray-200 shadow-sm active:scale-90">
                <X className="w-6 h-6"/>
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto max-h-[60vh] space-y-6 scrollbar-hide">
              <div className="flex items-center gap-2 mb-2">
                 <div className="w-1.5 h-5 bg-indigo-500 rounded-full"></div>
                 <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Employee Notes</h4>
              </div>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {/* 1. Show Individual Points (New Format) */}
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => {
                  const pointText = viewingDetailsFor[`workPoint${i}`];
                  if (!pointText || !pointText.trim()) return null;
                  return (
                    <div key={`point-${i}`} className="flex gap-4 group">
                      <div className="flex-1 bg-gray-50/50 p-4 rounded-2xl border border-gray-100 group-hover:border-indigo-200 transition-colors">
                        <p className="text-gray-700 leading-relaxed text-sm font-medium">
                          <span className="font-black text-indigo-600 mr-2">Point {i}:</span>
                          {pointText}
                        </p>
                      </div>
                    </div>
                  );
                })}
                
                {/* 2. Show Legacy Array Details (If any and not redundant) */}
                {viewingDetailsFor.workDetails?.map((detail, idx) => {
                  if (!detail || !detail.trim()) return null;
                  // If this detail is identical to any of the workPoint fields, skip to avoid double display
                  const isRedundant = [1,2,3,4,5,6,7,8,9,10].some(i => viewingDetailsFor[`workPoint${i}`] === detail);
                  if (isRedundant) return null;
                  
                  return (
                    <div key={`legacy-${idx}`} className="flex gap-4 group">
                      <div className="flex-1 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 group-hover:border-indigo-300 transition-colors">
                        <p className="text-indigo-900 leading-relaxed text-sm font-medium">
                          <span className="font-black text-indigo-400 mr-2">Note {idx + 1}:</span>
                          {detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
                
                {!hasWorkDetails(viewingDetailsFor) && (
                  <div className="py-12 text-center bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
                    <p className="text-gray-400 font-medium italic">No work details recorded for this shift.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingMapFor && (
        <RouteTrackingModal 
           employeeId={viewingMapFor.employeeId}
           date={viewingMapFor.date}
           employeeName={viewingMapFor.employeeName}
           onClose={() => setViewingMapFor(null)}
        />
      )}

    </div>
  );
});

class AttendanceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Attendance Render Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
           <div className="bg-red-50 p-8 rounded-xl border border-red-200 inline-block">
               <h2 className="text-xl font-bold text-red-700 mb-2">Attendance data could not be loaded</h2>
               <p className="text-red-500 mb-4">A rendering error occurred. Please refresh the page.</p>
               <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 transition-colors text-white rounded-lg font-bold">Refresh Page</button>
           </div>
        </div>
      );
    }
    return this.props.children; 
  }
}

export default function AttendanceWrapper(props) {
  return (
    <AttendanceErrorBoundary>
      <Attendance {...props} />
    </AttendanceErrorBoundary>
  );
}
