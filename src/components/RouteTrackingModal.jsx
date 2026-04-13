import { useState, useEffect, useRef, memo } from 'react';
import axios from 'axios';
import { MapPin, Activity, X } from 'lucide-react';
import Skeleton from './Skeleton';

const RouteTrackingModal = memo(function RouteTrackingModal({ employeeId, date, employeeName, onClose }) {
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

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
    setRouteData(null);
    try {
      const res = await axios.get(`/api/location/history/${employeeId}/${date}`, { 
        signal,
        timeout: 10000 // 10 seconds hard timeout
      });
      setRouteData(res.data);
      setLoading(false); // Make sure it is explicitly false immediately after success
    } catch (err) {
      if (axios.isCancel(err)) return; // Ignore cancellations
      console.error("Route tracking fetch error:", err);
      if (err.response?.status === 404) {
        setError('No tracking data found for this session.');
      } else {
        setError(err.message || 'Failed to load tracking data.');
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    if (routeData && mapRef.current) {
      if (typeof window.L === 'undefined') {
         console.warn("Leaflet window.L is not available! Map cannot be rendered.");
         return;
      }
      try {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
        }

        const map = window.L.map(mapRef.current);
        mapInstanceRef.current = map;

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      const points = [];
      const markers = [];

      if (routeData.startLocation) {
        points.push([routeData.startLocation.latitude, routeData.startLocation.longitude]);
        const startMarker = window.L.marker([routeData.startLocation.latitude, routeData.startLocation.longitude])
          .bindPopup(`<b>Start</b><br/>${routeData.startLocation.city}<br/>${new Date(routeData.startLocation.timestamp).toLocaleTimeString()}`);
        markers.push(startMarker);
      }

      if (routeData.locations && routeData.locations.length > 0) {
        routeData.locations.forEach(loc => {
          points.push([loc.latitude, loc.longitude]);
        });
      }

      if (routeData.stopPoints && routeData.stopPoints.length > 0) {
        const stopIcon = window.L.divIcon({
          className: 'custom-stop-icon',
          html: `<div style="background-color: #ef4444; border: 2px solid white; border-radius: 50%; width: 14px; height: 14px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

        routeData.stopPoints.forEach(stop => {
          const stopMarker = window.L.marker([stop.latitude, stop.longitude], { icon: stopIcon })
            .bindPopup(`<b>🛑 Stop Detected</b><br/>${stop.city}<br/>Duration: ${Math.round(stop.durationMinutes)} mins<br/>${new Date(stop.startTime).toLocaleTimeString()} - ${new Date(stop.endTime).toLocaleTimeString()}`);
          markers.push(stopMarker);
        });
      }

      if (routeData.endLocation) {
         points.push([routeData.endLocation.latitude, routeData.endLocation.longitude]);
         const endMarker = window.L.marker([routeData.endLocation.latitude, routeData.endLocation.longitude])
           .bindPopup(`<b>End</b><br/>${routeData.endLocation.city}<br/>${new Date(routeData.endLocation.timestamp).toLocaleTimeString()}`);
         markers.push(endMarker);
      } else if (routeData.locations && routeData.locations.length > 0) {
         const currentLoc = routeData.locations[routeData.locations.length - 1];
         const currentMarker = window.L.marker([currentLoc.latitude, currentLoc.longitude])
           .bindPopup(`<b>🔴 Current Location (Live)</b><br/>${currentLoc.city}`);
         markers.push(currentMarker);
      }

      if (points.length > 0) {
        window.L.polyline(points, { color: '#3b82f6', weight: 4, opacity: 0.8 }).addTo(map);
        window.L.layerGroup(markers).addTo(map);
        const bounds = window.L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        map.setView([20.5937, 78.9629], 5);
      }
      
      setTimeout(() => {
         try { map.invalidateSize(); } catch(e){}
      }, 200);
      } catch (err) {
        console.error("Error drawing map:", err);
      }
    }
  }, [routeData]);

  return (
    <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 overflow-hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col relative z-[99999]">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="text-indigo-600 w-6 h-6" />
              Route Tracking
            </h3>
            <p className="text-sm text-gray-500">Employee: {employeeName || 'Self'} | Date: {date}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-white hover:bg-gray-100 rounded-full p-2 transition-colors border border-gray-200">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50/50">
          {loading && (
             <div className="w-full h-full space-y-4 flex flex-col justify-center items-center">
                <p className="text-gray-500 font-bold mb-4 animate-pulse uppercase tracking-widest text-sm">Fetching Location Route...</p>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full w-full">
                  <Skeleton className="lg:col-span-2 min-h-[400px] w-full rounded-xl" />
                  <Skeleton className="min-h-[400px] w-full rounded-xl" />
                </div>
             </div>
          )}

          {!loading && error && (
             <div className="bg-orange-50 rounded-xl p-12 border border-orange-100 text-center mx-auto my-8 max-w-lg">
                 <MapPin className="w-12 h-12 text-orange-300 mx-auto mb-4" />
                 <h3 className="text-lg font-bold text-orange-800 mb-1">No Data Available</h3>
                 <p className="text-orange-600">{error}</p>
             </div>
          )}

          {!loading && routeData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
              <div className="lg:col-span-2 flex flex-col gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 min-h-[400px]">
                   <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                      <h3 className="font-semibold text-gray-800 flex items-center gap-2"><MapPin className="w-5 h-5 text-indigo-500"/> Interactive Map Route</h3>
                      {routeData.endedAt ? (
                         <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full font-bold">Session Ended</span>
                      ) : (
                         <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-bold animate-pulse flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/> LIVE</span>
                      )}
                   </div>
                   <div ref={mapRef} style={{ height: 'calc(100% - 49px)', minHeight: '400px', width: '100%' }}></div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 shrink-0">
                   <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center">
                     <span className="text-gray-400 text-[10px] font-bold uppercase block mb-1">Session</span>
                     <span className="text-gray-900 font-bold text-[11px] whitespace-nowrap">{routeData.startedAt ? new Date(routeData.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'} to {routeData.endedAt ? new Date(routeData.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}</span>
                   </div>
                   <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 shadow-sm text-center flex flex-col justify-center">
                     <span className="text-indigo-400 text-[10px] font-bold uppercase block mb-0.5">Total Distance</span>
                     <span className="text-indigo-900 font-bold text-lg leading-none">{(routeData.totalDistanceKm || 0).toFixed(2)} km</span>
                   </div>
                   <div className="bg-orange-50 p-3 rounded-xl border border-orange-100 shadow-sm text-center flex flex-col justify-center">
                     <span className="text-orange-400 text-[10px] font-bold uppercase block mb-0.5">Stop Points</span>
                     <span className="text-orange-900 font-bold text-lg leading-none">{routeData.stopPoints?.length || 0}</span>
                   </div>
                </div>

                {(() => {
                   if (!routeData.startedAt) return null;
                   const start = new Date(routeData.startedAt);
                   const end = routeData.endedAt ? new Date(routeData.endedAt) : new Date();
                   const diffMins = Math.floor((end - start) / (1000 * 60));
                   const stopMins = Math.floor((routeData.stopPoints || []).reduce((acc, stop) => acc + (stop.durationMinutes || 0), 0));
                   const travelMins = Math.max(0, diffMins - stopMins);
                   return (
                     <div className="grid grid-cols-3 gap-2 shrink-0 bg-gray-50 p-3 rounded-xl border border-gray-200">
                        <div className="text-center border-r border-gray-200">
                           <span className="text-[10px] text-gray-500 font-bold uppercase block">Login Time</span>
                           <span className="text-gray-900 font-bold text-sm">{Math.floor(diffMins/60)}h {diffMins%60}m</span>
                        </div>
                        <div className="text-center border-r border-gray-200">
                           <span className="text-[10px] text-gray-500 font-bold uppercase block">Travel Time</span>
                           <span className="text-blue-600 font-bold text-sm">{Math.floor(travelMins/60)}h {travelMins%60}m</span>
                        </div>
                        <div className="text-center">
                           <span className="text-[10px] text-gray-500 font-bold uppercase block">Stopped Time</span>
                           <span className="text-red-500 font-bold text-sm">{Math.floor(stopMins/60)}h {stopMins%60}m</span>
                        </div>
                     </div>
                   );
                })()}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col max-h-[600px] lg:max-h-full">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2 shrink-0">
                   <Activity className="w-5 h-5 text-indigo-500"/>
                   <h3 className="font-semibold text-gray-800">Timeline</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                   <div className="relative border-l-2 border-gray-200 ml-3 space-y-8">
                      {(() => {
                         const timelineItems = [];

                         if (routeData.travelSessions) {
                            routeData.travelSessions.forEach((ts, i) => {
                               timelineItems.push({
                                  type: 'session',
                                  timeStr: `${new Date(ts.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${ts.endTime ? new Date(ts.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}`,
                                  title: `Travel Session ${i + 1}`,
                                  subtitle: `${ts.startCity || 'Unknown'} → ${ts.endCity || 'Unknown'}`,
                                  valueLine: `${(ts.distanceKm || 0).toFixed(2)} KM`,
                                  timestamp: new Date(ts.startTime).getTime(),
                                  durationMins: ts.endTime ? Math.floor((new Date(ts.endTime) - new Date(ts.startTime))/60000) : null
                               });
                            });
                         }

                         if (routeData.stopPoints) {
                            routeData.stopPoints.forEach((sp, i) => {
                               timelineItems.push({
                                  type: 'stop',
                                  timeStr: `${new Date(sp.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(sp.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                                  title: `Stop Detected`,
                                  subtitle: sp.city || 'Unknown Location',
                                  valueLine: `${Math.round(sp.durationMinutes)} mins`,
                                  timestamp: new Date(sp.startTime).getTime()
                               });
                            });
                         }

                         if (routeData.geofenceEvents) {
                            routeData.geofenceEvents.forEach((ge) => {
                               timelineItems.push({
                                  type: 'geofence',
                                  timeStr: new Date(ge.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                  title: `Zone ${ge.action}`,
                                  subtitle: ge.zoneName,
                                  valueLine: ge.action,
                                  timestamp: new Date(ge.timestamp).getTime()
                               });
                            });
                         }
                         
                         timelineItems.sort((a, b) => a.timestamp - b.timestamp);

                         return (
                            <>
                              {routeData.startLocation && (
                                <div className="relative pl-6">
                                  <div className="absolute w-4 h-4 bg-green-500 rounded-full border-4 border-green-100 -left-[9px] top-1"></div>
                                  <p className="text-xs text-gray-400 font-bold uppercase mb-0.5">{new Date(routeData.startLocation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  <h4 className="font-bold text-gray-900 text-sm">Started Journey</h4>
                                  <p className="text-xs text-gray-600 mt-1">{routeData.startLocation.city}</p>
                                </div>
                              )}

                              {timelineItems.map((item, i) => (
                                <div key={i} className="relative pl-6">
                                  <div className={`absolute w-3 h-3 rounded-full border-2 -left-[7px] top-1.5 ${item.type === 'stop' ? 'bg-white border-red-500' : item.type === 'geofence' ? 'bg-purple-500 border-purple-200' : 'bg-white border-blue-500'}`}></div>
                                  <p className="text-[10px] tracking-wide text-gray-400 font-bold uppercase mb-0.5">{item.timeStr}</p>
                                  <h4 className={`font-bold text-sm flex gap-2 w-full pr-2 ${item.type === 'stop' ? 'text-red-700' : item.type === 'geofence' ? 'text-purple-700' : 'text-blue-700'}`}>
                                     {item.title} <span className={`text-[10px] ml-auto self-center px-1.5 py-0.5 rounded font-black tracking-tight ${item.type === 'stop' ? 'bg-red-50 text-red-600' : item.type === 'geofence' ? 'bg-purple-100 text-purple-800' : 'bg-blue-50 text-blue-700'}`}>{item.valueLine}</span>
                                  </h4>
                                  <p className="text-xs text-gray-600 mt-0.5">{item.subtitle}</p>
                                </div>
                              ))}

                              {routeData.endLocation ? (
                                <div className="relative pl-6">
                                  <div className="absolute w-4 h-4 bg-gray-600 rounded-full border-4 border-gray-200 -left-[9px] top-1"></div>
                                  <p className="text-xs text-gray-400 font-bold uppercase mb-0.5">{new Date(routeData.endLocation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  <h4 className="font-bold text-gray-900 text-sm">Ended Journey</h4>
                                  <p className="text-xs text-gray-600 mt-1">{routeData.endLocation.city}</p>
                                </div>
                              ) : routeData.locations?.length > 0 ? (
                                <div className="relative pl-6 opacity-75">
                                  <div className="absolute w-4 h-4 bg-blue-500 rounded-full border-4 border-blue-100 -left-[9px] top-1 animate-pulse"></div>
                                  <p className="text-xs text-blue-400 font-bold uppercase mb-0.5">{new Date(routeData.locations[routeData.locations.length-1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  <h4 className="font-bold text-blue-600 text-sm">Current Location</h4>
                                  <p className="text-xs text-gray-600 mt-1">{routeData.locations[routeData.locations.length-1].city}</p>
                                </div>
                              ) : null}
                            </>
                         )
                      })()}
                   </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default RouteTrackingModal;
