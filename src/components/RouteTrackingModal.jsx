import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Activity, X, Info, Navigation, Clock, ShieldCheck, Flag, History } from 'lucide-react';
import Skeleton from './Skeleton';
import { fetchRoadRoute } from '../services/routingService';

// Map Component to handle bounds auto-fit
function MapAutoBounds({ data }) {
  const map = useMap();
  useEffect(() => {
    if (data) {
      const points = [];
      if (data.startLocation) points.push([data.startLocation.latitude, data.startLocation.longitude]);
      if (data.locations) data.locations.forEach(l => points.push([l.latitude, l.longitude]));
      if (data.endLocation) points.push([data.endLocation.latitude, data.endLocation.longitude]);
      
      if (points.length > 0) {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [data, map]);
  return null;
}

const startIcon = L.divIcon({
  html: `<div style="background-color: #10b981; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">S</div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const endIcon = L.divIcon({
  html: `<div style="background-color: #1f2937; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">E</div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const stopIcon = L.divIcon({
  html: `<div style="background-color: #ef4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const RouteTrackingModal = memo(function RouteTrackingModal({ employeeId, date, employeeName, onClose }) {
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [error, setError] = useState('');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [snappedSegments, setSnappedSegments] = useState([]);

  useEffect(() => {
    if (employeeId && date) {
      const abortController = new AbortController();
      fetchRouteHistory(abortController.signal);
      return () => abortController.abort();
    }
  }, [employeeId, date]);

  const fetchRouteHistory = async (signal) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`/api/location/history/${employeeId}/${date}`, { 
        signal,
        timeout: 10000 
      });
      setRouteData(res.data);
      setLoading(false);
      
      // After fetching data, start road snapping
      if (res.data.locations && res.data.locations.length >= 2) {
         processRoadSnapping(res.data.locations);
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      console.error("Route tracking fetch error:", err);
      if (err.response?.status === 404) {
        setError('No tracking data found for this session.');
      } else {
        setError(err.message || 'Failed to load tracking data.');
      }
      setLoading(false);
    }
  };

  const processRoadSnapping = async (locs) => {
    setSnapping(true);
    try {
       // Split into colored segments
       const segments = [];
       let currentSegment = { color: locs[0].isRepeat ? 'red' : '#3b82f6', points: [[locs[0].latitude, locs[0].longitude]] };
       
       for (let i = 1; i < locs.length; i++) {
           const p = locs[i];
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

       // Snap each segment to roads
       const snapped = await Promise.all(segments.map(async (seg) => {
          if (seg.points.length < 2) return seg;
          // Simple batching if segment is too long for OSRM
          const BATCH_SIZE = 40;
          let allPoints = [];
          for (let i = 0; i < seg.points.length; i += (BATCH_SIZE - 1)) {
             const batch = seg.points.slice(i, i + BATCH_SIZE);
             if (batch.length < 2) break;
             const res = await fetchRoadRoute(batch);
             if (allPoints.length > 0) {
               allPoints = [...allPoints, ...res.coordinates.slice(1)];
             } else {
               allPoints = res.coordinates;
             }
             if (seg.points.length > BATCH_SIZE) await new Promise(r => setTimeout(r, 100));
          }
          return { ...seg, points: allPoints };
       }));
       
       setSnappedSegments(snapped);
    } catch (e) {
       console.error("Road snapping failed:", e);
    } finally {
       setSnapping(false);
    }
  };

  const coloredPaths = useMemo(() => {
    if (snappedSegments.length > 0) return snappedSegments;
    if (!routeData || !routeData.locations || routeData.locations.length < 2) return [];
    
    const segments = [];
    const locs = routeData.locations;
    let currentSegment = { color: locs[0].isRepeat ? 'red' : '#3b82f6', points: [[locs[0].latitude, locs[0].longitude]] };
    
    for (let i = 1; i < locs.length; i++) {
        const p = locs[i];
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
    return segments;
  }, [routeData, snappedSegments]);

  return (
    <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-gray-900/40 backdrop-blur-md p-4 overflow-hidden">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col relative z-[99999] border border-white/20 animate-in fade-in zoom-in duration-300">
        
        {/* Header - Premium Theme */}
        <div className="px-8 py-6 border-b border-gray-100 bg-gray-50/80 backdrop-blur-sm flex justify-between items-center shrink-0 rounded-t-[2.5rem]">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-100">
              <History className="text-white w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                Route Analysis
              </h3>
              <p className="text-sm text-gray-500 font-medium">Employee: <span className="text-indigo-600 font-bold">{employeeName}</span> | Session: <span className="font-bold">{date}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-indigo-600 bg-white hover:bg-gray-50 rounded-2xl p-3 transition-all border border-gray-100 shadow-sm">
            <X className="w-6 h-6"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-white lg:flex lg:gap-8">
          {loading ? (
             <div className="w-full space-y-4">
                <Skeleton className="h-[400px] w-full rounded-3xl" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                   <Skeleton className="h-24 w-full rounded-2xl" />
                   <Skeleton className="h-24 w-full rounded-2xl" />
                   <Skeleton className="h-24 w-full rounded-2xl" />
                </div>
             </div>
          ) : error ? (
             <div className="bg-orange-50 rounded-[2rem] p-16 border border-orange-100 text-center mx-auto my-8 max-w-xl flex flex-col items-center">
                 <div className="bg-orange-100 p-6 rounded-full mb-6">
                    <MapPin className="w-12 h-12 text-orange-500" />
                 </div>
                 <h3 className="text-2xl font-black text-orange-900 mb-2">Session Map Unavailable</h3>
                 <p className="text-orange-600 font-medium">{error}</p>
                 <button onClick={onClose} className="mt-8 px-8 py-3 bg-orange-600 text-white rounded-2xl font-bold hover:bg-orange-700 transition-colors shadow-lg shadow-orange-100">Go Back</button>
             </div>
          ) : routeData ? (
            <div className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
              
              {/* Left Column: Map and Summary */}
              <div className="flex-1 flex flex-col gap-8 min-h-0">
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden min-h-[400px] relative flex-1">
                   <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center z-10 relative">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2"><Navigation className="w-5 h-5 text-indigo-500"/> Interactive Journey Map</h3>
                      <div className="flex gap-2">
                         {snapping && (
                           <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full shadow-sm">
                             <Activity className="w-3 h-3 text-indigo-500 animate-spin" />
                             <span className="text-[10px] font-black text-indigo-500 uppercase">Snapping...</span>
                           </div>
                         )}
                         <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-100 rounded-full shadow-sm">
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                            <span className="text-[10px] font-black text-gray-500 uppercase">Transit</span>
                         </div>
                         <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-100 rounded-full shadow-sm">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                            <span className="text-[10px] font-black text-gray-500 uppercase">Return</span>
                         </div>
                      </div>
                   </div>
                   
                   <div className="w-full h-[calc(100%-61px)] relative z-0">
                      <MapContainer
                        center={[20.5937, 78.9629]}
                        zoom={5}
                        style={{ height: '100%', width: '100%' }}
                        scrollWheelZoom={true}
                      >
                         <TileLayer
                           attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                           url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                         />
                         
                         <MapAutoBounds data={routeData} />

                         {coloredPaths.map((seg, i) => (
                           <Polyline 
                             key={`history-seg-${i}`}
                             positions={seg.points}
                             pathOptions={{ 
                               color: seg.color, 
                               weight: 5, 
                               opacity: 0.8,
                               lineCap: 'round',
                               lineJoin: 'round',
                               dashArray: seg.color === 'red' ? '10, 12' : null
                             }}
                           />
                         ))}

                         {routeData.startLocation && (
                           <Marker position={[routeData.startLocation.latitude, routeData.startLocation.longitude]} icon={startIcon}>
                             <Popup className="premium-popup">
                               <div className="p-1">
                                 <h5 className="font-black text-green-600 uppercase text-[10px] mb-1">Check-in Point</h5>
                                 <p className="font-bold text-sm text-gray-900">{routeData.startLocation.city || 'Start Location'}</p>
                                 <p className="text-xs text-gray-500 mt-1">{new Date(routeData.startLocation.timestamp).toLocaleTimeString()}</p>
                               </div>
                             </Popup>
                           </Marker>
                         )}

                         {routeData.stopPoints?.map((stop, i) => (
                           <Marker key={`stop-${i}`} position={[stop.latitude, stop.longitude]} icon={stopIcon}>
                             <Popup className="premium-popup">
                               <div className="p-1">
                                 <h5 className="font-black text-red-600 uppercase text-[10px] mb-1">Stop Detected</h5>
                                 <p className="font-bold text-sm text-gray-900">{stop.city || 'Location Unknown'}</p>
                                 <p className="text-xs text-gray-700 mt-1 font-bold">Duration: {Math.round(stop.durationMinutes)} minutes</p>
                                 <p className="text-[10px] text-gray-400 mt-1">{new Date(stop.startTime).toLocaleTimeString()} - {new Date(stop.endTime).toLocaleTimeString()}</p>
                               </div>
                             </Popup>
                           </Marker>
                         ))}

                         {routeData.endLocation && (
                           <Marker position={[routeData.endLocation.latitude, routeData.endLocation.longitude]} icon={endIcon}>
                             <Popup className="premium-popup">
                               <div className="p-1">
                                 <h5 className="font-black text-gray-700 uppercase text-[10px] mb-1">Check-out Point</h5>
                                 <p className="font-bold text-sm text-gray-900">{routeData.endLocation.city || 'End Location'}</p>
                                 <p className="text-xs text-gray-500 mt-1">{new Date(routeData.endLocation.timestamp).toLocaleTimeString()}</p>
                               </div>
                             </Popup>
                           </Marker>
                         )}
                      </MapContainer>
                   </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
                   <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-center">
                     <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest block mb-2 px-1">Active Hours</span>
                     <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-50 rounded-xl">
                          <Clock className="w-4 h-4 text-indigo-500" />
                        </div>
                        <span className="text-gray-900 font-black text-sm">
                           {routeData.startedAt ? new Date(routeData.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'} - {routeData.endedAt ? new Date(routeData.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
                        </span>
                     </div>
                   </div>
                   <div className="bg-indigo-50/50 p-5 rounded-[2rem] border border-indigo-100/50 shadow-sm flex flex-col justify-center">
                     <span className="text-indigo-400 text-[10px] font-black uppercase tracking-widest block mb-1 px-1">Distance Covered</span>
                     <span className="text-indigo-900 font-black text-2xl tracking-tighter">{(routeData.totalDistanceKm || 0).toFixed(2)} <span className="text-sm">km</span></span>
                   </div>
                   <div className="bg-orange-50/50 p-5 rounded-[2rem] border border-orange-100/50 shadow-sm flex flex-col justify-center">
                     <span className="text-orange-400 text-[10px] font-black uppercase tracking-widest block mb-1 px-1">Idle Points</span>
                     <span className="text-orange-900 font-black text-2xl tracking-tighter">{routeData.stopPoints?.length || 0} <span className="text-xs uppercase opacity-40">stops</span></span>
                   </div>
                   <div className="bg-green-50/50 p-5 rounded-[2rem] border border-green-100/50 shadow-sm flex flex-col justify-center">
                     <span className="text-green-400 text-[10px] font-black uppercase tracking-widest block mb-1 px-1">Session Health</span>
                     <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                        <span className="text-green-900 font-black text-sm uppercase tracking-tighter">Verified</span>
                     </div>
                   </div>
                </div>
              </div>

              {/* Right Column: Timeline */}
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col w-full lg:w-[400px] shrink-0 overflow-hidden">
                <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between shrink-0">
                   <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-indigo-500 font-black"/>
                      <h3 className="font-extrabold text-gray-900 uppercase tracking-widest text-sm">Trip Timeline</h3>
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto p-8 relative">
                   <div className="absolute left-[39px] top-8 bottom-8 w-0.5 bg-gray-100"></div>
                   
                   <div className="space-y-10 relative">
                      {(() => {
                         const timelineItems = [];

                         if (routeData.travelSessions) {
                            routeData.travelSessions.forEach((ts, i) => {
                               timelineItems.push({
                                  type: 'session',
                                  timeStr: `${new Date(ts.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                                  endTimeStr: ts.endTime ? new Date(ts.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live',
                                  title: `Transit Stage`,
                                  subtitle: `${ts.startCity || 'Starting Area'} → ${ts.endCity || 'Target Area'}`,
                                  value: `${(ts.distanceKm || 0).toFixed(2)} KM`,
                                  timestamp: new Date(ts.startTime).getTime()
                               });
                            });
                         }

                         if (routeData.stopPoints) {
                            routeData.stopPoints.forEach((sp, i) => {
                               timelineItems.push({
                                  type: 'stop',
                                  timeStr: `${new Date(sp.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                                  endTimeStr: new Date(sp.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                  title: `Stationary`,
                                  subtitle: sp.city || 'Unknown Location',
                                  value: `${Math.round(sp.durationMinutes)}m`,
                                  timestamp: new Date(sp.startTime).getTime()
                               });
                            });
                         }

                         timelineItems.sort((a, b) => a.timestamp - b.timestamp);

                         return (
                            <>
                              {routeData.startLocation && (
                                <div className="relative pl-12">
                                  <div className="absolute left-0 w-8 h-8 bg-green-500 rounded-2xl flex items-center justify-center border-4 border-green-50 shadow-lg shadow-green-100 z-10">
                                    <ShieldCheck className="w-4 h-4 text-white" />
                                  </div>
                                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">{new Date(routeData.startLocation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  <h4 className="font-black text-gray-900 text-sm">Shift Started</h4>
                                  <p className="text-xs text-gray-500 mt-1 font-medium">{routeData.startLocation.city || 'Initial Point'}</p>
                                </div>
                              )}

                              {timelineItems.map((item, i) => (
                                <div key={i} className="relative pl-12 group">
                                  <div className={`absolute left-1 w-6 h-6 rounded-xl flex items-center justify-center border-2 z-10 transition-transform group-hover:scale-110 ${
                                    item.type === 'stop' ? 'bg-white border-red-500' : 'bg-white border-indigo-500'
                                  }`}>
                                    {item.type === 'stop' ? <Flag className="w-3 h-3 text-red-500" /> : <Navigation className="w-3 h-3 text-indigo-500" />}
                                  </div>
                                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">{item.timeStr} – {item.endTimeStr}</p>
                                  <div className="flex justify-between items-start pr-2">
                                    <div>
                                      <h4 className={`font-black text-sm ${item.type === 'stop' ? 'text-red-600' : 'text-indigo-600'}`}>{item.title}</h4>
                                      <p className="text-xs text-gray-500 mt-1 font-medium leading-relaxed">{item.subtitle}</p>
                                    </div>
                                    <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${item.type === 'stop' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                      {item.value}
                                    </span>
                                  </div>
                                </div>
                              ))}

                              {routeData.endLocation && (
                                <div className="relative pl-12">
                                  <div className="absolute left-0 w-8 h-8 bg-gray-800 rounded-2xl flex items-center justify-center border-4 border-gray-100 shadow-lg shadow-gray-200 z-10">
                                    <LogOut className="w-4 h-4 text-white" />
                                  </div>
                                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">{new Date(routeData.endLocation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  <h4 className="font-black text-gray-800 text-sm">Shift Ended</h4>
                                  <p className="text-xs text-gray-500 mt-1 font-medium">{routeData.endLocation.city || 'Final Point'}</p>
                                </div>
                              )}
                            </>
                         )
                      })()}
                   </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <style>{`
        .leaflet-container { font-family: inherit; border-radius: 2rem; }
        .premium-popup .leaflet-popup-content-wrapper { border-radius: 1.5rem; padding: 0.5rem; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1); }
      `}</style>
    </div>
  );
});

export default RouteTrackingModal;

function LogOut(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
  );
}
