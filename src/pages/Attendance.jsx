import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import axios from 'axios';
import Skeleton from '../components/Skeleton';
import { format } from 'date-fns';
import { LogIn, LogOut, CheckCircle, Clock, MapPin, Search, X } from 'lucide-react';
import RouteTrackingModal from '../components/RouteTrackingModal';

const Attendance = memo(function Attendance({ records: globalRecords, refreshRecords }) {
  const [records, setRecords] = useState(globalRecords || []);
  const [todayRecord, setTodayRecord] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [workDetails, setWorkDetails] = useState(Array(10).fill(''));
  const [distanceTraveled, setDistanceTraveled] = useState('');
  const [foodExpense, setFoodExpense] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [viewingDetailsFor, setViewingDetailsFor] = useState(null);
  const [viewingMapFor, setViewingMapFor] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  
  const user = JSON.parse(localStorage.getItem('user'));
  const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
  const todayStr = format(nowIST, 'yyyy-MM-dd');


  useEffect(() => {
    if (globalRecords) {
      setRecords(globalRecords);
      setPage(1);
      setHasMore(globalRecords.length >= 20);
      const userTodayRecord = globalRecords.find(r => r.employeeId === user.id && r.date === todayStr);
      setTodayRecord(userTodayRecord || null);
      
      if (userTodayRecord) {
        setDistanceTraveled(userTodayRecord.distanceTraveled !== undefined ? userTodayRecord.distanceTraveled.toString() : '');
        setFoodExpense(userTodayRecord.foodExpense !== undefined ? userTodayRecord.foodExpense.toString() : '');
        
        if (userTodayRecord.workDetails && userTodayRecord.workDetails.length > 0) {
            const loaded = [...userTodayRecord.workDetails];
            while (loaded.length < 10) loaded.push('');
            setWorkDetails(loaded.slice(0, 10));
        } else {
            setWorkDetails(Array(10).fill(''));
        }
      } else {
        setWorkDetails(Array(10).fill(''));
        setDistanceTraveled('');
        setFoodExpense('');
      }
    }
  }, [globalRecords, user.id, todayStr]);

  useEffect(() => {
    // Silently refresh global records in background on mount
    if (refreshRecords) refreshRecords();
  }, []);

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
      return res.data?.address?.city || res.data?.address?.town || res.data?.address?.county || res.data?.address?.village || 'Local Area';
    } catch {
      return '';
    }
  };

  const getExactLocation = () => {
    return new Promise((resolve, reject) => {
      let watchId;
      let timeoutId;
      let bestPos = null;

      const finishOpts = () => {
         if (timeoutId) clearTimeout(timeoutId);
         if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      };

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          bestPos = pos;
          if (pos.coords.accuracy <= 20) {
            finishOpts();
            resolve(pos);
          }
        },
        (error) => {
           if (!bestPos) {
              finishOpts();
              reject(error);
           }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );

      // Force resolve with best position after 10 seconds if <20m not achieved
      timeoutId = setTimeout(() => {
        finishOpts();
        if (bestPos) resolve(bestPos);
        else reject(new Error('Location timeout'));
      }, 10000);
    });
  };

  const handleCheckIn = async () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setActionLoading(true);
    try {
      const position = await getExactLocation();
      const { latitude, longitude } = position.coords;
      const checkInTimeStr = new Date().toISOString();
      
      localStorage.setItem(`checkIn_${user.id}_${todayStr}`, JSON.stringify({
        checkInTime: checkInTimeStr,
        latitude,
        longitude
      }));

      const locationName = await fetchLocationName(latitude, longitude);
      const res = await axios.post('/api/attendance/check-in', { 
        employeeId: user.id,
        latitude,
        longitude,
        locationName
      });

      // Wait implicitly by using await for route start
      try {
         await axios.post('/api/location/start', {
            employeeId: user.id, latitude, longitude, city: locationName
         });
      } catch (trackErr) {
         console.error("Failed to start tracking", trackErr);
      }

      // Update todayRecord directly for instant UI update
      setTodayRecord(res.data);
      localStorage.setItem('isCheckedIn', 'true');
      
      // Re-fetch global state to ensure history table is updated
      if (refreshRecords) refreshRecords();
      
      // Auto-scroll to work details section after check-in
      setTimeout(() => {
        const el = document.getElementById('work-details-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);

    } catch (err) {
      console.error(err);
      if (err.message === 'Location timeout' || err.code === 1 || err.code === 2 || err.code === 3) {
         alert('Please allow location access and ensure GPS is enabled to check in.');
      } else {
         alert(err.response?.data?.message || 'Failed to check-in');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);

    let finalLat = null;
    let finalLng = null;
    
    try {
      const position = await getExactLocation();
      finalLat = position.coords.latitude;
      finalLng = position.coords.longitude;
    } catch (e) {
      console.warn("Exact location failed on checkout, falling back if possible", e);
      const locStr = localStorage.getItem(`currentLoc_${user.id}`);
      if (locStr) {
         try {
           const locObj = JSON.parse(locStr);
           finalLat = locObj.lat;
           finalLng = locObj.lng;
         } catch (err) {}
      }
    }

    const checkOutTimeDate = new Date();
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
      distance: distanceTraveled || 0,
      travelExpense: (Number(distanceTraveled) * 2.5).toFixed(2),
      foodExpense: foodExpense || 0,
      status
    });

    try {
      let locationName = '';
      if (finalLat && finalLng) {
        locationName = await fetchLocationName(finalLat, finalLng);
      }
      const res = await axios.post('/api/attendance/check-out', { 
        employeeId: user.id,
        latitude: finalLat,
        longitude: finalLng,
        status: status,
        locationName,
        distanceTraveled: Number(distanceTraveled) || 0,
        foodExpense: Number(foodExpense) || 0,
        workDetails
      });

      // Stop route tracking
      try {
         await axios.post('/api/location/stop', {
            employeeId: user.id, latitude: finalLat, longitude: finalLng, city: locationName
         });
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
    const filledCount = workDetails.filter(w => w.trim()).length;
    if (filledCount < 10) {
      const proceed = window.confirm(`Important: You have only filled ${filledCount} out of 10 required work points. Do you want to save anyway?`);
      if (!proceed) return;
    }

    setSavingDetails(true);
    try {
      await axios.post('/api/attendance/work-details', {
        employeeId: user.id,
        workDetails,
        distanceTraveled: Number(distanceTraveled),
        foodExpense: Number(foodExpense)
      });
      alert('Success! Your 10-point work details have been saved and sent to the admin.');
      if (refreshRecords) refreshRecords();
      // Optional: scroll back to top after saving
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      alert('Failed to save work details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const handleShowMap = (record) => {
    let formattedDate = record.date;
    try {
      formattedDate = format(new Date(record.date), 'yyyy-MM-dd');
    } catch (e) { console.error("Date error", e); }
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 text-left m-0">Attendance</h1>
        <p className="text-gray-500 mt-1 text-left">Track daily check-ins and check-outs</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[var(--accent-border)] p-6 mb-8 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Today's Attendance</h2>
          <p className="text-sm text-gray-500 mt-1">{format(new Date(), 'EEEE, MMMM do yyyy')}</p>
          <div className="mt-4 flex items-center gap-3 justify-center sm:justify-start">
            {todayRecord ? (
                <div className="flex gap-4">
                   <div className="flex flex-col items-center sm:items-start text-sm bg-green-50 px-4 py-2 rounded-lg border border-green-100">
                     <span className="text-gray-500 flex items-center gap-1"><LogIn className="w-4 h-4 text-green-600"/> Check-in</span>
                     <span className="font-bold text-gray-900">{todayRecord.checkIn}</span>
                   </div>
                   {todayRecord.checkOut ? (
                      <div className="flex flex-col items-center sm:items-start text-sm bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
                        <span className="text-gray-500 flex items-center gap-1"><LogOut className="w-4 h-4 text-blue-600"/> Check-out</span>
                        <span className="font-bold text-gray-900">{todayRecord.checkOut}</span>
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
          {todayRecord && !todayRecord.checkOut && (
             <div className="mt-3 flex items-center gap-2 justify-center sm:justify-start pt-3 border-t border-gray-100">
               <span className="relative flex h-3 w-3">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
               </span>
               <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Live Location Tracking Active</span>
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

      {todayRecord && !todayRecord.checkOut && (
        <div id="work-details-section" className="bg-white rounded-xl shadow-md border-2 border-indigo-200 p-6 mb-8 ring-4 ring-indigo-50 ring-opacity-50">
          <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Clock className="text-indigo-600" />
            Shift Action Required: Today's Work Details
          </h2>
          <p className="text-sm text-gray-600 mb-6 font-medium">Please list exactly 10 points describing your work tasks for today below.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {workDetails.map((detail, idx) => (
              <div key={idx} className="flex flex-col">
                 <label className="text-xs font-semibold text-gray-600 mb-1 ml-1">Point {idx + 1}</label>
                 <input 
                   type="text" 
                   value={detail} 
                   onChange={(e) => {
                     const newDetails = [...workDetails];
                     newDetails[idx] = e.target.value;
                     setWorkDetails(newDetails);
                   }}
                   className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition text-sm"
                   placeholder={`Enter detail ${idx + 1}...`}
                 />
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Travel Distance (Kilometers)</label>
              <input type="number" min="0" value={distanceTraveled} onChange={e => setDistanceTraveled(e.target.value)} placeholder="e.g. 15" className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 mb-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              <p className="text-xs text-gray-500">Travel Expense (Auto-calculated): <span className="font-bold text-green-600">₹{(Number(distanceTraveled) * 2.5).toFixed(2)}</span> at ₹2.5/km</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Food Expense (₹)</label>
              <input type="number" min="0" value={foodExpense} onChange={e => setFoodExpense(e.target.value)} placeholder="e.g. 150" className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
             <button 
               onClick={handleSaveWorkDetails} 
               disabled={savingDetails}
               className="bg-[var(--accent)] text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition shadow-sm disabled:opacity-70 flex items-center gap-2"
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
          </div>
        </div>
      )}

      {sessionSummary && (
        <div className="bg-white rounded-xl shadow-sm border border-[var(--accent-border)] p-6 mb-8 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Session Summary</h2>
            <div className="mt-4 flex flex-wrap gap-4">
              <div className="flex flex-col text-sm bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                <span className="text-gray-500">Check In</span>
                <span className="font-bold text-gray-900">{sessionSummary.checkInTime}</span>
              </div>
              <div className="flex flex-col text-sm bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                <span className="text-gray-500">Check Out</span>
                <span className="font-bold text-gray-900">{sessionSummary.checkOutTime}</span>
              </div>
              <div className="flex flex-col text-sm bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                <span className="text-blue-800">Total Hours</span>
                <span className="font-bold text-blue-900">{sessionSummary.workingHours} hrs</span>
              </div>
              <div className="flex flex-col text-sm bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                <span className="text-green-800">Travel Expense</span>
                <span className="font-bold text-green-900">₹{sessionSummary.travelExpense} ({sessionSummary.distance} km)</span>
              </div>
              <div className="flex flex-col text-sm bg-orange-50 px-4 py-2 rounded-lg border border-orange-200">
                <span className="text-orange-800">Food Expense</span>
                <span className="font-bold text-orange-900">₹{sessionSummary.foodExpense}</span>
              </div>
              <div className={`flex flex-col text-sm px-4 py-2 rounded-lg border font-bold justify-center items-center ${
                sessionSummary.status === 'Present' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200'
              }`}>
                {sessionSummary.status}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="text-lg font-medium text-gray-900 text-left">Attendance History</h3>
        </div>
        {!globalRecords ? (
          <div className="p-8 text-center text-gray-500">Loading records...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  {user.role === 'Admin' && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check In</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check Out</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dist / Exp</th>
                  {user.role === 'Admin' && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Work Details</th>}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {useMemo(() => (
                  records.length > 0 ? records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-gray-900">
                      {record.date}
                    </td>
                    {user.role === 'Admin' && (
                       <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-gray-900 font-medium">
                        {record.employeeName}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-gray-500">
                      {record.checkIn || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-gray-500">
                      {record.checkOut || '-'}
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
                        {record.currentLocation && !record.checkOut ? <a href={`https://www.google.com/maps?q=${record.currentLocation.lat},${record.currentLocation.lng}`} target="_blank" rel="noreferrer" className="text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 animate-pulse"><MapPin className="w-4 h-4" /> LIVE</a> : null}
                        
                        {record.checkInLocation && record.checkOutLocation && (
                           <div className="flex flex-col gap-2 mt-1.5">
                            <button 
                              onClick={() => handleShowMap(record)} 
                              className="bg-indigo-600 text-white px-2 py-1.5 rounded-lg border border-indigo-700 font-bold text-center hover:bg-indigo-700 transition flex items-center justify-center gap-1 shadow-sm text-[10px] uppercase tracking-tighter"
                            >
                                <Search className="w-3 h-3"/>
                                Route Tracking
                            </button>
                            <a href={`https://www.google.com/maps/dir/?api=1&origin=${record.checkInLocation.lat},${record.checkInLocation.lng}&destination=${record.checkOutLocation.lat},${record.checkOutLocation.lng}&travelmode=driving`} target="_blank" rel="noreferrer" className="bg-white text-indigo-700 px-2 py-1 rounded border border-indigo-200 font-semibold text-center hover:bg-indigo-50 transition flex items-center justify-center gap-1 text-[10px]">
                                <MapPin className="w-3 h-3"/> Google Route
                            </a>
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
                    {user.role === 'Admin' && (
                      <td className="px-6 py-4 whitespace-nowrap text-left text-sm text-gray-500">
                        {record.workDetails && record.workDetails.some(w => w.trim()) ? (
                           <button onClick={() => setViewingDetailsFor(record)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors">
                             View Details
                           </button>
                        ) : '-'}
                      </td>
                    )}
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
                )) : (
                  <tr>
                    <td colSpan={user.role === 'Admin' ? "8" : "6"} className="px-6 py-8 text-center text-gray-500">
                      No attendance records found.
                    </td>
                  </tr>
                )
                ), [records, user.role])}
              </tbody>
            </table>
            
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
            
          </div>
        )}
      </div>

      {viewingDetailsFor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col relative z-[101]">
            <div className="px-6 py-4 flex justify-between items-center border-b border-gray-100 bg-gray-50/50">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Work Details</h3>
                <p className="text-sm text-gray-500">For {viewingDetailsFor.employeeName} on {viewingDetailsFor.date}</p>
              </div>
              <button onClick={() => setViewingDetailsFor(null)} className="text-gray-400 hover:text-gray-600 bg-white hover:bg-gray-100 rounded-full p-2 transition-colors border border-gray-200">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <ul className="space-y-4">
                {viewingDetailsFor.workDetails.filter(w => w.trim()).map((detail, idx) => (
                   <li key={idx} className="flex gap-4 text-sm text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100">
                     <span className="font-extrabold text-[#9d4edd] mt-0.5 tracking-wider font-mono">{(idx + 1).toString().padStart(2, '0')}.</span>
                     <span className="leading-relaxed whitespace-pre-wrap">{detail}</span>
                   </li>
                ))}
              </ul>
              {viewingDetailsFor.workDetails.filter(w => w.trim()).length === 0 && (
                 <p className="text-center text-gray-500">No specific points were written.</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
               <button onClick={() => setViewingDetailsFor(null)} className="px-5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 transition">
                  Close Review
               </button>
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

export default Attendance;
