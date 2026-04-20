import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Activity, X, Info, Navigation, Clock, ShieldCheck, Flag, History } from 'lucide-react';
import Skeleton from './Skeleton';
import { fetchRoadRoute } from '../services/googleRoutingService';

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
    
    // Fix Leaflet container size issues on mobile modals
    const timeoutId = setTimeout(() => {
       map.invalidateSize();
    }, 500);
    return () => clearTimeout(timeoutId);
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

  // Format "HH:mm:ss" cleanly without timezone shifts
  const formatShiftTime = (timeData) => {
    if (!timeData || timeData === '-') return null;
    let h, m;
    if (typeof timeData === 'string' && timeData.includes('T')) {
      const d = new Date(timeData);
      h = d.getHours();
      m = d.getMinutes().toString().padStart(2, '0');
    } else if (typeof timeData === 'number' || timeData instanceof Date) {
      const d = new Date(timeData);
      h = d.getHours();
      m = d.getMinutes().toString().padStart(2, '0');
    } else if (typeof timeData === 'string' && timeData.includes(':')) {
      const parts = timeData.split(':');
      h = parseInt(parts[0], 10);
      m = parts[1];
    } else {
      return null;
    }
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  };

  const getDistanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const formatDurationReadable = (mins) => {
    const val = Math.max(0, Math.round(mins));
    if (val < 60) return `${val} mins`;
    const h = Math.floor(val / 60);
    const m = val % 60;
    return `${h} hrs ${m} mins`;
  };

  const parseTimeStrToDate = (timeStr, baseDateStr) => {
    if (!timeStr) return null;
    if (timeStr.includes('T')) return timeStr;

    let h = 0, m = 0, s = 0;
    const cleanStr = timeStr.trim().toLowerCase();
    const isPM = cleanStr.includes('pm');
    const isAM = cleanStr.includes('am');
    
    // Remove AM/PM texts
    const timePart = cleanStr.replace(/[a-z]/g, '').trim();
    const parts = timePart.split(':');
    
    h = parseInt(parts[0] || 0, 10);
    m = parseInt(parts[1] || 0, 10);
    s = parseInt(parts[2] || 0, 10);

    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
    
    let y, mo, dStr;
    if (baseDateStr) {
        [y, mo, dStr] = baseDateStr.split('-');
    } else {
        const todayStr = new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}).split(',')[0];
        const tdObj = new Date(todayStr);
        y = tdObj.getFullYear();
        mo = tdObj.getMonth() + 1;
        dStr = tdObj.getDate();
    }
    
    const dObj = new Date(parseInt(y), parseInt(mo) - 1, parseInt(dStr), h, m, s);
    return dObj.toISOString();
  };

  const timelineData = useMemo(() => {
    if (!routeData) return { finalTimeline: [], totalMins: 0 };
    
    let locs = routeData.locations || [];
    const startLoc = routeData.startLocation || (locs.length > 0 ? locs[0] : null);
    const routeDateStr = routeData.date || new Date().toISOString().split('T')[0];
    const startT = routeData.checkIn ? parseTimeStrToDate(routeData.checkIn, routeDateStr) : (startLoc ? startLoc.timestamp : null);

    if (!startT) return { finalTimeline: [], totalMins: 0 };

    const checkInTimeMs = new Date(startT).getTime();

    let sessionState = 'ACTIVE';
    if (routeData.isCheckedOut || routeData.checkOut || routeData.endedAt) {
        if (routeData.checkoutType === 'manual') {
            sessionState = 'MANUAL_DONE';
        } else if (routeData.checkoutType === 'auto') {
            sessionState = 'AUTO_DONE';
        } else {
            // Strong fallback if type is missing but checkout exists
            if (routeData.checkOut === '23:59:00' || routeData.checkOut === '23:59:59' || routeData.status === 'Auto Closed' || !routeData.checkOut) {
                sessionState = 'AUTO_DONE';
            } else {
                sessionState = 'MANUAL_DONE';
            }
        }
    }
    
    let finalStatus = sessionState === 'ACTIVE' ? 'Active' : (sessionState === 'MANUAL_DONE' ? 'Checked Out' : 'Auto Closed');
    const endLoc = routeData.endLocation || routeData.routeTracking?.endLocation || (locs.length > 0 ? locs[locs.length - 1] : startLoc);
    let endT = (routeData.checkOut && routeData.checkOut !== '23:59:00' && routeData.checkOut !== '23:59:59') ? parseTimeStrToDate(routeData.checkOut, routeDateStr) : null;
    // Force checkOut to ALWAYS exist strictly on the exact same day string as checkIn
    let checkOutTimeMs;
    // Same day extraction 
    let baseDObj = new Date(checkInTimeMs);
    let endH = 23, endM = 59, endS = 0;
    
    if (endT) {
       let ed = new Date(endT);
       endH = ed.getHours();
       endM = ed.getMinutes();
       endS = ed.getSeconds();
    }
    
    // We STRICTLY lock checkout to the exact same year, month, date as checkIn
    let cleanEndDObj = new Date(baseDObj.getFullYear(), baseDObj.getMonth(), baseDObj.getDate(), endH, endM, endS);
    checkOutTimeMs = cleanEndDObj.getTime();

    // STRICT RULE: DO NOT add +1 day under any condition.
    if (checkOutTimeMs < checkInTimeMs) {
       // Clamp negative durations
    }
    
    if (sessionState !== 'ACTIVE') {
        locs = locs.filter(loc => new Date(loc.timestamp).getTime() <= checkOutTimeMs);
    }

    // FORCE SEGMENT CREATION
    let rawSegments = [];
    if (locs.length > 0) {
        // Iterate every 2 GPS points
        let i = 0;
        while (i < locs.length - 1) {
            let j = i + 1;
            let currentDist = getDistanceKm(locs[i].latitude, locs[i].longitude, locs[j].latitude, locs[j].longitude) * 1000;
            let currentDur = (new Date(locs[j].timestamp).getTime() - new Date(locs[i].timestamp).getTime()) / 60000;

            if (currentDist > 40) {
                // MARK as TRANSIT
                rawSegments.push({ type: 'transit', startIdx: i, endIdx: j, distance: currentDist, duration: currentDur });
                i++;
            } else {
                // Peek ahead for stationary duration > 5 mins
                let stopEnd = i;
                let lookAhead = i + 1;
                while (lookAhead < locs.length) {
                    let d = getDistanceKm(locs[i].latitude, locs[i].longitude, locs[lookAhead].latitude, locs[lookAhead].longitude) * 1000;
                    if (d < 30) {
                        stopEnd = lookAhead;
                        lookAhead++;
                    } else {
                        break;
                    }
                }
                let totalStopDur = (new Date(locs[stopEnd].timestamp).getTime() - new Date(locs[i].timestamp).getTime()) / 60000;
                
                if (totalStopDur > 5) {
                    // MARK as STOP
                    rawSegments.push({ type: 'stop', startIdx: i, endIdx: stopEnd, duration: totalStopDur });
                    i = stopEnd; 
                } else {
                    // Moving slowly or paused briefly < 5 mins -> group into Transit
                    rawSegments.push({ type: 'transit', startIdx: i, endIdx: i+1, duration: (new Date(locs[i+1].timestamp).getTime() - new Date(locs[i].timestamp).getTime()) / 60000, distance: getDistanceKm(locs[i].latitude, locs[i].longitude, locs[i+1].latitude, locs[i+1].longitude) * 1000 });
                    i++;
                }
            }
        }
    }

    // Merge adjacent segments
    let mergedSegments = [];
    for (let seg of rawSegments) {
        if (mergedSegments.length === 0) {
            mergedSegments.push({...seg});
            continue;
        }
        let last = mergedSegments[mergedSegments.length - 1];
        if (last.type === seg.type && last.type === 'transit') {
            last.endIdx = seg.endIdx;
            last.duration += seg.duration;
            last.distance += seg.distance;
        } else {
            mergedSegments.push({...seg});
        }
    }

    const finalTimeline = [];
    let totalMins = 0;

    finalTimeline.push({
         type: 'start',
         title: 'Start Location',
         subtitle: startLoc?.city || 'Origin Node',
         timeStr: formatShiftTime(checkInTimeMs),
         timestamp: checkInTimeMs,
    });
    
    let lastTime = checkInTimeMs;

    if (mergedSegments.length > 0) {
        let firstStart = new Date(locs[mergedSegments[0].startIdx].timestamp).getTime();
        let gap = (firstStart - lastTime) / 60000;
        if (gap >= 1) {
            mergedSegments.unshift({ type: 'transit_gap', startTime: lastTime, endTime: firstStart, duration: gap });
        }
    } else if (checkOutTimeMs > lastTime) {
        let gap = (checkOutTimeMs - lastTime) / 60000;
        let d = endLoc ? getDistanceKm(startLoc.latitude, startLoc.longitude, endLoc.latitude, endLoc.longitude) * 1000 : 0;
        mergedSegments.push({ type: (d > 40 ? 'transit_gap' : 'stop_gap'), lat: startLoc.latitude, lng: startLoc.longitude, city: startLoc.city, startTime: lastTime, endTime: checkOutTimeMs, duration: gap });
    }

    for (let seg of mergedSegments) {
        let segStart = seg.startTime || new Date(locs[seg.startIdx].timestamp).getTime();
        let segEnd = seg.endTime || new Date(locs[seg.endIdx].timestamp).getTime();
        
        if (segStart > lastTime) {
            let gap = (segStart - lastTime) / 60000;
            if (gap >= 1) {
                totalMins += gap;
                finalTimeline.push({
                   type: 'transit',
                   durationMins: gap,
                   timeRange: `${formatShiftTime(lastTime)} – ${formatShiftTime(segStart)}`,
                   timestamp: lastTime + 1
                });
            }
        }
        
        totalMins += seg.duration;
        if (seg.type.includes('transit')) {
            finalTimeline.push({
               type: 'transit',
               durationMins: seg.duration,
               timeRange: `${formatShiftTime(segStart)} – ${formatShiftTime(segEnd)}`,
               timestamp: segStart
            });
        } else {
            let pL = seg.startIdx !== undefined ? locs[seg.startIdx] : {latitude: seg.lat, longitude: seg.lng, city: seg.city};
            finalTimeline.push({
               type: 'stop',
               title: 'Stopped',
               subtitle: pL?.city || 'Stationary Location',
               durationMins: seg.duration,
               timeRange: `${formatShiftTime(segStart)} – ${formatShiftTime(segEnd)}`,
               timestamp: segStart,
               lat: pL?.latitude,
               lng: pL?.longitude
            });
        }
        lastTime = segEnd;
    }

    if (checkOutTimeMs > lastTime) {
         let gapMins = (checkOutTimeMs - lastTime) / 60000;
         if (gapMins >= 1) {
              let lastL = locs.length > 0 ? locs[locs.length - 1] : startLoc;
              let isStationary = lastL && endLoc ? (getDistanceKm(lastL.latitude, lastL.longitude, endLoc.latitude, endLoc.longitude) * 1000 < 30) : false;
              
              totalMins += gapMins;
              if (isStationary) {
                  finalTimeline.push({
                     type: 'stop',
                     title: 'Stopped',
                     subtitle: lastL?.city || 'Stationary Location',
                     durationMins: gapMins,
                     timeRange: `${formatShiftTime(lastTime)} – ${formatShiftTime(checkOutTimeMs)}`,
                     timestamp: lastTime + 1,
                     lat: lastL.latitude,
                     lng: lastL.longitude
                  });
              } else {
                  finalTimeline.push({
                     type: 'transit',
                     durationMins: gapMins,
                     timeRange: `${formatShiftTime(lastTime)} – ${formatShiftTime(checkOutTimeMs)}`,
                     timestamp: lastTime + 1
                  });
              }
         }
    }
    
    // 4. FINAL NODE: ALWAYS SHOW END LOCATION / CURRENT LOCATION
    let finalTitle = '';
    
    if (sessionState === "ACTIVE") {
        finalTitle = "Current Location";
    } else if (sessionState === "MANUAL_DONE") {
        finalTitle = "End Location";
    } else if (sessionState === "AUTO_DONE") {
        finalTitle = "End Location";
    }

    let finalSub = endLoc?.city || 'Location Unknown';
    if (sessionState !== "ACTIVE") {
        finalSub = `${finalSub} • ${finalStatus}`;
    }
    
    // Force rule: remove last 'stop' if checkout exists (to replace it with Checked Out)
    if (sessionState !== "ACTIVE") {
        if (finalTimeline.length > 0 && finalTimeline[finalTimeline.length - 1].type === 'stop') {
            finalTimeline.pop();
        }
    }
    
    finalTimeline.push({
        type: 'end',
        title: finalTitle,
        subtitle: finalSub,
        timeStr: finalStatus === 'Active' ? 'Live' : `${formatShiftTime(checkOutTimeMs)}`,
        timestamp: finalStatus === 'Active' ? Date.now() : checkOutTimeMs
    });
    let processedFinalTimeline = finalTimeline;
    if (sessionState !== "ACTIVE") {
        processedFinalTimeline = processedFinalTimeline.filter(item => item.title !== "Current Location");
    }
    
    return { finalTimeline: processedFinalTimeline, totalMins, finalStatus };
  }, [routeData]);
  
  const { finalTimeline: processedTimeline, totalMins, finalStatus } = timelineData;
  const idleCount = processedTimeline.filter(item => item.type === 'stop').length;

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
      console.log("[DEBUG] Final Route Data loaded:", res.data);
      console.log("[DEBUG] GPS Raw Coords count:", res.data.locations ? res.data.locations.length : 0);
      
      // After fetching data, start road snapping
      let allLocs = [];
      if (res.data.startLocation) allLocs.push(res.data.startLocation);
      if (res.data.locations) allLocs = allLocs.concat(res.data.locations);
      if (res.data.endLocation) allLocs.push(res.data.endLocation);
      
      const uniqueLocs = [];
      const seen = new Set();
      allLocs.forEach(loc => {
          if (!seen.has(loc.timestamp)) {
             seen.add(loc.timestamp);
             uniqueLocs.push(loc);
          }
      });
      allLocs = uniqueLocs.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (allLocs.length >= 2) {
         processRoadSnapping(allLocs);
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
       // Identify farthest point from start location to detect Return Route
       const start = locs[0];
       let maxDist = 0;
       let farthestIdx = 0;
       for (let i = 1; i < locs.length; i++) {
           let d = getDistanceKm(start.latitude, start.longitude, locs[i].latitude, locs[i].longitude);
           if (d > maxDist) {
               maxDist = d;
               farthestIdx = i;
           }
       }

       // Split route into two types
       const onwardCoords = locs.slice(0, farthestIdx + 1);
       const returnCoords = locs.slice(farthestIdx);

       let segments = [];
       if (onwardCoords.length > 1) {
           segments.push({ color: '#3b82f6', points: onwardCoords.map(p => [p.latitude, p.longitude]) });
       }
       if (returnCoords.length > 1) { 
           segments.push({ color: 'red', points: returnCoords.map(p => [p.latitude, p.longitude]) });
       }

       let cumulativeRoadDistance = 0;
       
       // Snap each segment to roads or fallback to tight raw points (which draws route but without perfectly snapped roads)
       const snapped = await Promise.all(segments.map(async (seg) => {
          if (seg.points.length < 2) return seg;
          const BATCH_SIZE = 80;
          let allPoints = [];
          for (let i = 0; i < seg.points.length; i += (BATCH_SIZE - 1)) {
             const batch = seg.points.slice(i, i + BATCH_SIZE);
             if (batch.length < 2) break;
             const res = await fetchRoadRoute(batch);
             
             if (res.coordinates && res.coordinates.length > 0) {
                 if (!res.fallback && res.distance) {
                     cumulativeRoadDistance += res.distance;
                 }
                 
                 // Accumulate EXACTLY the Google string returned (road-snapped)
                 // Use these snappedPoints to draw route
                 if (allPoints.length > 0) {
                     allPoints = [...allPoints, ...res.coordinates.slice(1)];
                 } else {
                     allPoints = res.coordinates;
                 }
             } else {
                 console.error("Routing API returned empty.", res);
             }
             
             if (seg.points.length > BATCH_SIZE) await new Promise(r => setTimeout(r, 100));
          }
          
          return { ...seg, points: allPoints };
       }));
       
       // Filter out segments where Google API completely failed to return snapped points
       const validSnapped = snapped.filter(s => s.points && s.points.length >= 2);
       setSnappedSegments(validSnapped);
       if (cumulativeRoadDistance > 0) {
           setRouteData(prev => ({ ...prev, totalDistanceKm: cumulativeRoadDistance }));
       }
    } catch (e) {
       console.error("Road snapping failed:", e);
    } finally {
       setSnapping(false);
    }
  };

  const coloredPaths = useMemo(() => {
    return snappedSegments;
  }, [snappedSegments]);

  const generateGoogleMapsUrl = useCallback(() => {
    if (!routeData) return '#';
    
    // Fallback if no locations exist
    if (!routeData.locations || routeData.locations.length === 0) {
       if (routeData.startLocation) {
          return `https://www.google.com/maps?q=${routeData.startLocation.latitude},${routeData.startLocation.longitude}`;
       }
       return '#';
    }

    const locs = routeData.locations;
    const startLoc = routeData.startLocation || locs[0];
    const endLoc = routeData.endLocation || locs[locs.length - 1];

    const origin = `${startLoc.latitude},${startLoc.longitude}`;
    const destination = `${endLoc.latitude},${endLoc.longitude}`;

    // Sample waypoints if there are many points to avoid URL length issues (Google limit is around 10)
    const waypoints = [];
    const maxWaypoints = 10;
    
    // Only sample if we have more than 2 points to act as waypoints between start and end
    if (locs.length > 2) {
        const step = Math.ceil((locs.length - 2) / maxWaypoints);
        for (let i = 1; i < locs.length - 1; i += step) {
            waypoints.push(`${locs[i].latitude},${locs[i].longitude}`);
        }
    }

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (waypoints.length > 0) {
        url += `&waypoints=${waypoints.join('|')}`;
    }
    return url;
  }, [routeData]);

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
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden min-h-[300px] flex-1 relative flex flex-col">
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
                   
                   <div className="w-full flex-1 min-h-[300px] relative z-0">
                      <MapContainer
                        center={[20.5937, 78.9629]}
                        zoom={5}
                        style={{ height: '100%', width: '100%', minHeight: '300px' }}
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

                         {processedTimeline.filter(item => item.type === 'stop').map((stop, i) => (
                           <Marker key={`stop-calc-${i}`} position={[stop.lat, stop.lng]} icon={stopIcon}>
                             <Popup className="premium-popup">
                               <div className="p-1">
                                 <h5 className="font-black text-red-600 uppercase text-[10px] mb-1">Stop Detected</h5>
                                 <p className="font-bold text-sm text-gray-900">{stop.subtitle || 'Location Unknown'}</p>
                                 <p className="text-xs text-gray-700 mt-1 font-bold">Duration: {stop.durationText}</p>
                                 <p className="text-[10px] text-gray-400 mt-1">{new Date(stop.timestamp).toLocaleTimeString()} - {new Date(stop.endTimestamp).toLocaleTimeString()}</p>
                               </div>
                             </Popup>
                           </Marker>
                         ))}

                         {(() => {
                            const endLocToUse = routeData.endLocation || routeData.routeTracking?.endLocation || (routeData.locations?.length > 0 ? routeData.locations[routeData.locations.length - 1] : routeData.startLocation);
                            if (!endLocToUse) return null;
                            return (
                               <Marker position={[endLocToUse.latitude, endLocToUse.longitude]} icon={endIcon}>
                                 <Popup className="premium-popup">
                                   <div className="p-1">
                                     <h5 className="font-black text-gray-700 uppercase text-[10px] mb-1">{finalStatus === 'Active' ? 'Current Point' : 'Check-out Point'}</h5>
                                     <p className="font-bold text-sm text-gray-900">{finalStatus}</p>
                                     <p className="text-xs text-gray-500 mt-1">{finalStatus === 'Active' ? new Date(endLocToUse.timestamp || Date.now()).toLocaleTimeString() : new Date((timelineData && timelineData.finalTimeline && timelineData.finalTimeline.length > 0) ? timelineData.finalTimeline[timelineData.finalTimeline.length - 1].timestamp : endLocToUse.timestamp).toLocaleTimeString()}</p>
                                   </div>
                                 </Popup>
                               </Marker>
                            );
                         })()}
                      </MapContainer>
                   </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
                   <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col justify-center">
                     <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest block mb-2 px-1">Active Time</span>
                     <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-50 rounded-xl">
                          <Clock className="w-4 h-4 text-indigo-500" />
                        </div>
                        <span className="text-gray-900 font-black text-sm">
                           {formatDurationReadable(totalMins)}
                        </span>
                     </div>
                   </div>
                   <div className="bg-indigo-50/50 p-5 rounded-[2rem] border border-indigo-100/50 shadow-sm flex flex-col justify-center">
                     <span className="text-indigo-400 text-[10px] font-black uppercase tracking-widest block mb-1 px-1">Distance Covered</span>
                     <span className="text-indigo-900 font-black text-2xl tracking-tighter">{(routeData.totalDistanceKm || 0).toFixed(2)} <span className="text-sm">km</span></span>
                   </div>
                   <div className="bg-orange-50/50 p-5 rounded-[2rem] border border-orange-100/50 shadow-sm flex flex-col justify-center">
                     <span className="text-orange-400 text-[10px] font-black uppercase tracking-widest block mb-1 px-1">Idle Points</span>
                     <span className="text-orange-900 font-black text-2xl tracking-tighter">{idleCount} <span className="text-xs uppercase opacity-40">stops</span></span>
                   </div>
                   <div className="bg-green-50/50 p-5 rounded-[2rem] border border-green-100/50 shadow-sm flex flex-col justify-center">
                     <span className="text-green-400 text-[10px] font-black uppercase tracking-widest block mb-1 px-1">Session Health</span>
                     <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                        <span className="text-green-900 font-black text-sm uppercase tracking-tighter">Verified</span>
                     </div>
                   </div>
                </div>

                <div className="mt-2 shrink-0">
                   <button 
                     onClick={() => window.open(generateGoogleMapsUrl(), '_blank')}
                     className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 transition-colors flex items-center justify-center gap-2"
                   >
                     <MapPin className="w-5 h-5"/> Open Full Route in Google Maps
                   </button>
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
                   
                    <div className="space-y-6 relative ml-6">
                       <div className="absolute left-[7px] top-4 bottom-4 w-0.5 bg-gray-200/60 z-0"></div>
                       
                       {processedTimeline.map((item, i) => {
                          if (item.type === 'start') {
                             return (
                               <div key={i} className="relative z-10">
                                 <div className="flex items-start gap-4">
                                    <div className="w-4 h-4 rounded-full border-4 border-indigo-600 bg-white mt-1 shadow-sm shrink-0"></div>
                                    <div>
                                       <h4 className="font-bold text-gray-900 text-sm">{item.title}</h4>
                                       <p className="text-sm text-gray-600 leading-tight mt-0.5">{item.subtitle}</p>
                                       <p className="text-xs text-indigo-600 font-semibold mt-1">{item.timeStr}</p>
                                    </div>
                                 </div>
                               </div>
                             );
                          } else if (item.type === 'end') {
                             return (
                               <div key={i} className="relative z-10">
                                 <div className="flex items-start gap-4">
                                    <div className="w-4 h-4 rounded-full border-4 border-gray-600 bg-white mt-1 shadow-sm shrink-0"></div>
                                    <div>
                                       <h4 className="font-bold text-gray-900 text-sm">{item.title}</h4>
                                       <p className="text-sm text-gray-600 leading-tight mt-0.5">{item.subtitle}</p>
                                       <p className="text-xs text-gray-500 font-semibold mt-1">{item.timeStr || '-'}</p>
                                    </div>
                                 </div>
                               </div>
                             );
                          } else if (item.type === 'stop') {
                             return (
                               <div key={i} className="relative z-10">
                                 <div className="flex items-start gap-4">
                                    <div className="w-4 h-4 rounded-full border-4 border-orange-500 bg-orange-500 mt-1 shadow-sm shrink-0"></div>
                                    <div>
                                       <h4 className="font-bold text-gray-900 text-sm">{item.title}</h4>
                                       <p className="text-sm text-gray-600 leading-tight mt-0.5">{item.subtitle}</p>
                                       <p className="text-xs text-orange-600 font-semibold mt-1">{item.timeRange} ({formatDurationReadable(item.durationMins)})</p>
                                    </div>
                                 </div>
                               </div>
                             );
                          } else if (item.type === 'transit') {
                             return (
                               <div key={i} className="relative z-0">
                                 <div className="flex items-center gap-3 py-2">
                                    <div className="w-6 flex justify-center shrink-0 text-green-500 font-bold opacity-80">
                                       ↓
                                    </div>
                                    <div className="flex flex-col bg-green-50/50 px-3 py-1.5 rounded-lg border border-green-100">
                                       <h4 className="font-bold text-green-700 text-xs flex items-center gap-1.5"><span className="text-[10px]">🟢</span> In Transit</h4>
                                       <p className="text-xs text-green-600 font-medium opacity-80 mt-0.5">{item.timeRange} ({formatDurationReadable(item.durationMins)})</p>
                                    </div>
                                 </div>
                               </div>
                             );
                          }
                          return null;
                       })}
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
