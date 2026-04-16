import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { io } from 'socket.io-client';
import axios from 'axios';
import { MapPin, Users, Activity, X, Info, Navigation, History } from 'lucide-react';
import Skeleton from './Skeleton';
import { fetchRoadRoute, fetchFullHistoryRoute } from '../services/routingService';

// Fix for default Leaflet marker icons in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Premium Pulsing Marker Icon
const createPulsingIcon = (color) => L.divIcon({
  className: 'custom-pulsing-marker',
  html: `
    <div style="position: relative; width: 24px; height: 24px;">
      <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background-color: ${color}; opacity: 0.6; animation: pulse 1.5s infinite;"></div>
      <div style="position: absolute; width: 12px; height: 12px; border-radius: 50%; background-color: ${color}; top: 50%; left: 50%; transform: translate(-50%, -50%); border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.3);"></div>
    </div>
    <style>
      @keyframes pulse {
        0% { transform: scale(0.5); opacity: 0.8; }
        100% { transform: scale(3); opacity: 0; }
      }
    </style>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

// Map Component to handle bounds auto-fit
function MapAutoBounds({ employees }) {
  const map = useMap();
  useEffect(() => {
    if (Object.keys(employees).length > 0) {
      const bounds = L.latLngBounds(Object.values(employees).map(e => [e.lat, e.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
    
    // Fix Leaflet container size issues on mobile
    const timeoutId = setTimeout(() => {
       map.invalidateSize();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [employees, map]);
  return null;
}

export default function AdminLiveMap({ onClose }) {
  const [activeEmployees, setActiveEmployees] = useState({});
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);

  const selectedEmployee = activeEmployees[selectedEmployeeId] || null;

  useEffect(() => {
    const fetchActiveSessions = async () => {
      try {
        const todayStr = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"})).toISOString().split('T')[0];
        const res = await axios.get('/api/attendance');
        const active = res.data.filter(r => r.date === todayStr && !r.checkOut && r.currentLocation);
        
        const initialLocs = {};
        for (const emp of active) {
           try {
             const routeRes = await axios.get(`/api/location/history/${emp.employeeId}/${todayStr}`);
             const rawHistory = routeRes.data.locations || [];
             
             let snappedSegments = [];
             if (rawHistory.length >= 2) {
                // Split history into color-coded segments first
                const tempSegments = [];
                let currentSeg = { color: rawHistory[0].isRepeat ? 'red' : '#3b82f6', points: [[rawHistory[0].latitude, rawHistory[0].longitude]] };
                
                for (let i = 1; i < rawHistory.length; i++) {
                   const p = rawHistory[i];
                   const color = p.isRepeat ? 'red' : '#3b82f6';
                   if (color === currentSeg.color) {
                      currentSeg.points.push([p.latitude, p.longitude]);
                   } else {
                      currentSeg.points.push([p.latitude, p.longitude]);
                      tempSegments.push(currentSeg);
                      currentSeg = { color, points: [[p.latitude, p.longitude]] };
                   }
                }
                tempSegments.push(currentSeg);

                // Snap each segment to roads
                snappedSegments = await Promise.all(tempSegments.map(async (s) => {
                   if (s.points.length < 2) return s;
                   const snapped = await fetchFullHistoryRoute(s.points);
                   return { ...s, points: snapped };
                }));
             }

             initialLocs[emp.employeeId] = {
                id: emp.employeeId,
                name: emp.employeeName,
                lat: emp.currentLocation.lat,
                lng: emp.currentLocation.lng,
                timestamp: emp.currentLocation.timestamp,
                checkIn: emp.checkIn,
                history: rawHistory,
                snappedHistory: snappedSegments,
                totalDistanceKm: routeRes.data.totalDistanceKm || 0
             };
           } catch (e) {
             console.warn("Failed to fetch route for", emp.employeeName);
             initialLocs[emp.employeeId] = {
                id: emp.employeeId,
                name: emp.employeeName,
                lat: emp.currentLocation.lat,
                lng: emp.currentLocation.lng,
                timestamp: emp.currentLocation.timestamp,
                history: [],
                snappedHistory: [],
                totalDistanceKm: 0
             };
           }
        }
        setActiveEmployees(initialLocs);
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch active sessions", err);
        setLoading(false);
      }
    };

    fetchActiveSessions();

    const host = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
    socketRef.current = io(host);

    socketRef.current.on('live-route-update', async (data) => {
       const newPoint = data.location;
       
       setActiveEmployees(prev => {
         const existing = prev[data.employeeId];
         if (!existing) return prev;
         
         const lastRaw = existing.history.length > 0 ? existing.history[existing.history.length - 1] : null;
         
         // Immediately update raw marker position
         // Update marker position immediately
         const updatedEmp = {
            ...existing,
            lat: newPoint.latitude,
            lng: newPoint.longitude,
            timestamp: newPoint.timestamp,
            totalDistanceKm: data.totalDistanceKm
         };

         // Only growth history/polyline if it's a real movement
         if (!data.noMove) {
            updatedEmp.history = [...existing.history, newPoint];
         }

         // Background road snapping for the new segment
         if (lastRaw) {
            fetchRoadRoute([[lastRaw.latitude, lastRaw.longitude], [newPoint.latitude, newPoint.longitude]])
              .then(result => {
                 setActiveEmployees(current => {
                    const empToUpdate = current[data.employeeId];
                    if (!empToUpdate) return current;
                    
                    const segmentColor = newPoint.isRepeat ? 'red' : '#3b82f6';
                    const newPoints = result.coordinates;
                    
                    // Check if we can append to the last segment of the same color
                    const prevSnapped = [...(empToUpdate.snappedHistory || [])];
                    if (prevSnapped.length > 0 && prevSnapped[prevSnapped.length - 1].color === segmentColor) {
                       const lastSeg = prevSnapped[prevSnapped.length - 1];
                       prevSnapped[prevSnapped.length - 1] = {
                          ...lastSeg,
                          points: [...lastSeg.points, ...newPoints.slice(1)]
                       };
                    } else {
                       prevSnapped.push({ color: segmentColor, points: newPoints });
                    }
                    
                    return {
                       ...current,
                       [data.employeeId]: { ...empToUpdate, snappedHistory: prevSnapped }
                    };
                 });
              });
         }

         return {
            ...prev,
            [data.employeeId]: updatedEmp
         };
       });
    });

    socketRef.current.on('employee-check-in', (data) => {
       setActiveEmployees(prev => ({
          ...prev,
          [data.employeeId]: {
             id: data.employeeId,
             name: data.employeeName,
             lat: data.latitude,
             lng: data.longitude,
             timestamp: data.timestamp,
             checkIn: data.checkIn,
             history: [],
             totalDistanceKm: 0
          }
       }));
    });

    socketRef.current.on('employee-check-out', (data) => {
       setActiveEmployees(prev => {
          const newState = { ...prev };
          delete newState[data.employeeId];
          return newState;
       });
       if (selectedEmployeeId === data.employeeId) {
          setSelectedEmployeeId(null);
       }
    });

    return () => {
       if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // Helper to split history into colored segments
  const coloredPaths = useMemo(() => {
    const paths = {};
    Object.values(activeEmployees).forEach(emp => {
      // If we have snapped history (from live updates or initial fetch), use it
      if (emp.snappedHistory && emp.snappedHistory.length > 0) {
        // If it's the new segment-based structure
        if (typeof emp.snappedHistory[0] === 'object' && !Array.isArray(emp.snappedHistory[0])) {
           paths[emp.id] = emp.snappedHistory;
           return;
        }
        
        // If it's just a flat array of points (from initial fetch), we need to color it
        // Note: For initial fetch, we might just color it all blue for now, 
        // or split it if we want to be fancy. But history from initial fetch in AdminLiveMap 
        // is usually just the path so far.
        paths[emp.id] = [{ color: '#3b82f6', points: emp.snappedHistory }];
        return;
      }

      // Fallback to straight lines logic if no snapped history yet
      if (emp.history.length < 2) return;
      
      const segments = [];
      let currentSegment = { color: emp.history[0].isRepeat ? 'red' : '#3b82f6', points: [[emp.history[0].latitude, emp.history[0].longitude]] };
      
      for (let i = 1; i < emp.history.length; i++) {
        const p = emp.history[i];
        const nextColor = p.isRepeat ? 'red' : '#3b82f6';
        
        if (nextColor === currentSegment.color) {
          currentSegment.points.push([p.latitude, p.longitude]);
        } else {
          currentSegment.points.push([p.latitude, p.longitude]);
          segments.push(currentSegment);
          currentSegment = { color: nextColor, points: [[p.latitude, p.longitude]] };
        }
      }
      segments.push(currentSegment);
      paths[emp.id] = segments;
    });
    return paths;
  }, [activeEmployees]);

  return (
    <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-gray-900/40 backdrop-blur-md p-4 overflow-hidden">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col relative z-[99999] border border-white/20 animate-in fade-in zoom-in duration-300">
        
        {/* Header - Premium Glassmorphism Look */}
        <div className="px-8 py-5 border-b border-gray-100 bg-gray-50/80 backdrop-blur-sm flex justify-between items-center shrink-0 rounded-t-3xl">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-100">
              <Activity className="text-white w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                Live Employee Tracking
              </h3>
              <p className="text-sm text-gray-500 font-medium">Real-time movement analysis & route history</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-indigo-600 bg-white hover:bg-gray-50 rounded-2xl p-3 transition-all border border-gray-100 shadow-sm"
          >
            <X className="w-6 h-6"/>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white">
           
           {/* Sidebar - Enhanced */}
           <div className="w-full md:w-80 border-r border-gray-100 bg-white flex flex-col shrink-0 overflow-y-auto">
              <div className="p-6 border-b border-gray-50 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-20">
                 <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-500 font-bold"/>
                    <h4 className="font-black text-gray-900 text-sm uppercase tracking-widest">Active Fleet</h4>
                 </div>
                 <span className="bg-indigo-50 text-indigo-600 text-xs font-black px-2.5 py-1 rounded-full border border-indigo-100">
                    {Object.keys(activeEmployees).length}
                 </span>
              </div>
              <div className="p-4 space-y-3">
                 {loading && <div className="p-8 text-center text-gray-400 font-medium">Loading fleet data...</div>}
                 {!loading && Object.keys(activeEmployees).length === 0 && (
                    <div className="p-8 text-center">
                       <div className="bg-gray-50 p-4 rounded-3xl inline-block mb-3">
                         <Navigation className="w-8 h-8 text-gray-300" />
                       </div>
                       <p className="text-sm text-gray-500 font-medium">No employees are currently active on route.</p>
                    </div>
                 )}
                 {Object.values(activeEmployees).map(emp => (
                    <div 
                      key={emp.id} 
                      className={`group p-4 rounded-3xl border transition-all duration-300 ${selectedEmployeeId === emp.id ? 'border-indigo-600 bg-indigo-50/50 shadow-xl shadow-indigo-100/30' : 'border-gray-50 hover:border-indigo-100 hover:bg-gray-50/50'}`}
                      onClick={() => setSelectedEmployeeId(emp.id)}
                    >
                       <div className="flex justify-between items-center">
                          <h5 className="font-extrabold text-gray-900 group-hover:text-indigo-600 transition-colors">{emp.name}</h5>
                          <span className="flex h-2.5 w-2.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                          </span>
                       </div>
                       <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="bg-white/60 p-2 rounded-2xl border border-white flex flex-col items-center justify-center">
                             <span className="text-[9px] text-gray-400 font-black uppercase tracking-tighter">Distance</span>
                             <span className="text-xs font-black text-indigo-600">{(emp.totalDistanceKm || 0).toFixed(2)} km</span>
                          </div>
                          <div className="bg-white/60 p-2 rounded-2xl border border-white flex flex-col items-center justify-center">
                             <span className="text-[9px] text-gray-400 font-black uppercase tracking-tighter">Last Seen</span>
                             <span className="text-xs font-extrabold text-gray-700">{new Date(emp.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                          </div>
                       </div>
                    </div>
                 ))}
              </div>

              {/* Legend - New Premium Addition */}
              <div className="mt-auto p-6 bg-gray-50/50 border-t border-gray-100">
                <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Info className="w-3.5 h-3.5" /> Map Legend
                </h5>
                <div className="space-y-2.5">
                   <div className="flex items-center gap-2.5 group">
                      <div className="w-6 h-1 rounded-full bg-blue-500 shadow-sm shadow-blue-200"></div>
                      <span className="text-xs font-bold text-gray-600 group-hover:text-gray-900 transition-colors">Primary Route Path</span>
                   </div>
                   <div className="flex items-center gap-2.5 group">
                      <div className="w-6 h-1 rounded-full bg-red-500 shadow-sm shadow-red-200"></div>
                      <span className="text-xs font-bold text-gray-600 group-hover:text-gray-900 transition-colors">Return / Repeated Path</span>
                   </div>
                </div>
              </div>
           </div>

           {/* Leaflet Map Area */}
           <div className="flex-1 h-full w-full min-h-[300px] relative">
              <div className="w-full h-full min-h-[300px] relative z-10">
                 {!loading && (
                    <MapContainer
                      center={[20.5937, 78.9629]}
                      zoom={5}
                      style={{ height: '100%', width: '100%', minHeight: '300px' }}
                      scrollWheelZoom={true}
                      zoomControl={false}
                    >
                       <TileLayer
                         attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                         url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                         // url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" // For a more premium cleaner look
                       />
                       
                       <MapAutoBounds employees={activeEmployees} />

                       {/* Render all moving markers & paths */}
                       {Object.values(activeEmployees).map(emp => (
                          <React.Fragment key={emp.id}>
                             {/* Path History */}
                             {coloredPaths[emp.id]?.map((seg, i) => (
                               <Polyline 
                                 key={`${emp.id}-seg-${i}`}
                                 positions={seg.points}
                                 pathOptions={{ 
                                   color: seg.color, 
                                   weight: 4, 
                                   opacity: 0.8,
                                   lineCap: 'round',
                                   lineJoin: 'round',
                                   dashArray: seg.color === 'red' ? '10, 10' : null // Optional: dash for repeat path
                                 }}
                               >
                                 <Tooltip sticky>
                                   <div className="font-bold">{emp.name}</div>
                                   <div className="text-xs">{seg.color === 'red' ? 'Return Path' : 'New Path'}</div>
                                 </Tooltip>
                               </Polyline>
                             ))}

                             {/* Live Marker */}
                             {emp.lat && emp.lng && (
                               <Marker 
                                  position={[emp.lat, emp.lng]}
                                  icon={createPulsingIcon(selectedEmployeeId === emp.id ? '#4f46e5' : '#3b82f6')}
                                  eventHandlers={{
                                    click: () => setSelectedEmployeeId(emp.id)
                                  }}
                               >
                                  <Popup className="premium-popup">
                                     <div className="p-1 min-w-[150px]">
                                        <div className="flex items-center gap-2 mb-2">
                                           <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xs uppercase">
                                              {emp.name.charAt(0)}
                                           </div>
                                           <h4 className="font-black text-gray-900 text-sm tracking-tight">{emp.name}</h4>
                                        </div>
                                        <div className="space-y-1.5 border-t border-gray-100 pt-2">
                                           <p className="text-[10px] text-gray-500 font-bold uppercase flex justify-between">
                                              <span>Status</span>
                                              <span className="text-green-600 animate-pulse">● Active</span>
                                           </p>
                                           <p className="text-[10px] text-gray-500 font-bold uppercase flex justify-between">
                                              <span>Check-in</span>
                                              <span className="text-gray-900">{emp.checkIn || '-'}</span>
                                           </p>
                                           <p className="text-[10px] text-gray-500 font-bold uppercase flex justify-between">
                                              <span>Distance</span>
                                              <span className="text-gray-900">{(emp.totalDistanceKm || 0).toFixed(2)} km</span>
                                           </p>
                                           <p className="text-[10px] text-gray-500 font-bold uppercase flex justify-between">
                                              <span>Current Loc</span>
                                              <span className="text-gray-900 font-mono">{emp.lat.toFixed(4)}, {emp.lng.toFixed(4)}</span>
                                           </p>
                                        </div>
                                     </div>
                                  </Popup>
                                  <Tooltip direction="top" offset={[0, -10]} permanent={selectedEmployeeId === emp.id} opacity={0.9}>
                                     <span className="text-xs font-black px-1 uppercase tracking-tighter">{emp.name}</span>
                                  </Tooltip>
                               </Marker>
                             )}
                          </React.Fragment>
                       ))}
                    </MapContainer>
                 )}
              </div>
           </div>
        </div>

      </div>
      <style>{`
        .leaflet-container { font-family: inherit; }
        .premium-popup .leaflet-popup-content-wrapper { border-radius: 1.5rem; padding: 0.25rem; }
        .premium-popup .leaflet-popup-tip { box-shadow: none; }
      `}</style>
    </div>
  );
}
