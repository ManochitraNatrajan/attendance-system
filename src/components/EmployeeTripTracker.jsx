import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  CONFIG, 
  cleanPoints, 
  detectIdle, 
  splitRoute, 
  analyzeTrip, 
  fmtTime, 
  fmtDur, 
  generateDemoTrip 
} from '../utils/tripAnalyzer';

// Leaflet map auto bounds helper
function AutoFitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points && points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [30, 30] });
    }
    const timer = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(timer);
  }, [points, map]);
  return null;
}

// Markers
const checkInIcon = L.divIcon({
  html: `<div style="background:#1f8f4e; color:white; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:11px; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3); white-space:nowrap;">Check-in</div>`,
  className: '',
  iconSize: [60, 24],
  iconAnchor: [30, 12]
});

const checkOutIcon = L.divIcon({
  html: `<div style="background:#c0392b; color:white; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:11px; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3); white-space:nowrap;">Check-out</div>`,
  className: '',
  iconSize: [65, 24],
  iconAnchor: [32, 12]
});

export default function EmployeeTripTracker({ initialPoints = null, title = "Employee Trip Tracker" }) {
  const [tracking, setTracking] = useState(false);
  const [rawPoints, setRawPoints] = useState([]);
  const [tripResult, setTripResult] = useState(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (initialPoints && initialPoints.length > 0) {
      processTrip(initialPoints);
    }
  }, [initialPoints]);

  const startTracking = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setRawPoints([]);
    setTripResult(null);
    setTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const p = { 
          lat: pos.coords.latitude, 
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy, 
          time: pos.timestamp 
        };
        if (p.accuracy > CONFIG.maxAccuracy) return;
        setRawPoints(prev => [...prev, p]);
      },
      err => alert("Location error: " + err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
    if (rawPoints.length > 0) {
      processTrip(rawPoints);
    }
  };

  const processTrip = (pts) => {
    if (!pts || pts.length < 2) {
      setTripResult({ error: "Podhumana GPS data illa." });
      return;
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    const checkIn = { lat: first.lat || first.latitude, lng: first.lng || first.longitude, time: first.time || first.timestamp };
    const checkOut = { lat: last.lat || last.latitude, lng: last.lng || last.longitude, time: last.time || last.timestamp };
    
    const analysis = analyzeTrip(pts, checkIn, checkOut);
    setTripResult(analysis);
  };

  const handleDemoTrip = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
    const demoPts = generateDemoTrip();
    setRawPoints(demoPts);
    processTrip(demoPts);
  };

  return (
    <div className="w-full bg-[#f4f6f8] text-[#1c2430] font-sans rounded-2xl overflow-hidden shadow-lg border border-gray-200 my-4">
      {/* Header */}
      <header className="px-4 py-3 bg-[#1c2430] text-white font-semibold text-lg flex items-center justify-between">
        <span>{title}</span>
        {tracking && (
          <span className="flex items-center gap-2 text-xs bg-green-500/20 text-green-300 px-3 py-1 rounded-full border border-green-500/30 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            Tracking Nadakkudhu...
          </span>
        )}
      </header>

      {/* Button Controls */}
      <div className="flex gap-2 p-4 flex-wrap bg-white border-b border-gray-200">
        <button
          id="btnIn"
          onClick={startTracking}
          disabled={tracking}
          className="bg-[#1f8f4e] hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-md text-sm transition-all"
        >
          Check-in
        </button>
        <button
          id="btnOut"
          onClick={stopTracking}
          disabled={!tracking}
          className="bg-[#c0392b] hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-md text-sm transition-all"
        >
          Check-out
        </button>
        <button
          id="btnDemo"
          onClick={handleDemoTrip}
          className="bg-[#555] hover:bg-gray-700 text-white font-medium px-4 py-2 rounded-md text-sm transition-all"
        >
          Demo trip
        </button>
      </div>

      {/* Path Legend */}
      <div className="flex gap-4 p-3 px-4 bg-gray-50 border-b border-gray-200 text-xs font-medium flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-600 inline-block"></span>
          Poga path (blue)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-600 inline-block"></span>
          Thirumba vandha path (red)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
          Idle point (5 min+)
        </span>
      </div>

      {/* Map Container */}
      <div className="h-[55vh] min-h-[340px] w-full relative bg-gray-100">
        <MapContainer
          center={[13.0827, 80.2707]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {tripResult && tripResult.points && (
            <AutoFitBounds points={tripResult.points} />
          )}

          {/* Outbound Blue Polylines */}
          {tripResult && tripResult.outbound && tripResult.outbound.map((seg, idx) => (
            <Polyline
              key={`outbound-${idx}`}
              positions={seg.map(p => [p.lat, p.lng])}
              pathOptions={{ color: 'blue', weight: 6, opacity: 0.85 }}
            />
          ))}

          {/* Return Red Dashed Polylines */}
          {tripResult && tripResult.ret && tripResult.ret.map((seg, idx) => (
            <Polyline
              key={`return-${idx}`}
              positions={seg.map(p => [p.lat, p.lng])}
              pathOptions={{ color: 'red', weight: 4, dashArray: '8,8' }}
            />
          ))}

          {/* Check-in Marker */}
          {tripResult && tripResult.checkIn && (
            <Marker
              position={[tripResult.checkIn.lat, tripResult.checkIn.lng]}
              icon={checkInIcon}
            >
              <Popup>
                <b>Check-in</b><br />{fmtTime(tripResult.checkIn.time)}
              </Popup>
            </Marker>
          )}

          {/* Check-out Marker */}
          {tripResult && tripResult.checkOut && (
            <Marker
              position={[tripResult.checkOut.lat, tripResult.checkOut.lng]}
              icon={checkOutIcon}
            >
              <Popup>
                <b>Check-out</b><br />{fmtTime(tripResult.checkOut.time)}
              </Popup>
            </Marker>
          )}

          {/* Idle Circle Markers (Orange) */}
          {tripResult && tripResult.idles && tripResult.idles.map((idle, i) => (
            <CircleMarker
              key={`idle-${i}`}
              center={[idle.lat, idle.lng]}
              radius={11}
              pathOptions={{ color: '#b35c00', fillColor: 'orange', fillOpacity: 0.9 }}
            >
              <Popup>
                <b>Idle Point {i + 1}</b><br />
                {fmtTime(idle.start)} - {fmtTime(idle.end)}<br />
                Idle: {fmtDur(idle.durationMs)}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Summary Box */}
      <div id="summary" className="p-4 leading-relaxed bg-white border-t border-gray-200">
        {!tripResult ? (
          <div className="text-gray-500 font-medium">
            Check-in pannunga, illa Demo trip click pannunga.
          </div>
        ) : tripResult.error ? (
          <div className="text-red-500 font-medium">{tripResult.error}</div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="font-semibold text-gray-900 pb-1 border-b border-gray-100">
              Check-in: <b>{fmtTime(tripResult.checkIn.time)}</b> | Check-out: <b>{fmtTime(tripResult.checkOut.time)}</b> | Total time: <b>{fmtDur(tripResult.totalTimeMs)}</b>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-600 inline-block"></span>
              <span>Poga distance: <b>{tripResult.outKm} km</b></span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-600 inline-block"></span>
              <span>Thirumba vandha distance: <b>{tripResult.returnKm} km</b></span>
            </div>

            <div className="font-bold text-indigo-900 pt-1">
              Total distance (blue + red): <b>{tripResult.totalKm} km</b>
            </div>

            <div className="pt-2">
              <span className="font-semibold">Idle points: <b>{tripResult.idles.length}</b></span>
              {tripResult.idles.length > 0 ? (
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-xs text-left border-collapse border border-gray-200">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-3 py-2 border-b border-gray-200 font-semibold">Point</th>
                        <th className="px-3 py-2 border-b border-gray-200 font-semibold">Time</th>
                        <th className="px-3 py-2 border-b border-gray-200 font-semibold">Idle time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tripResult.idles.map((x, i) => (
                        <tr key={`idle-row-${i}`} className="hover:bg-gray-50 border-b border-gray-100">
                          <td className="px-3 py-2 font-medium">Idle {i + 1}</td>
                          <td className="px-3 py-2">{fmtTime(x.start)} - {fmtTime(x.end)}</td>
                          <td className="px-3 py-2 font-semibold text-amber-700">{fmtDur(x.durationMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <span className="text-gray-500 ml-2">Idle point illa.</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
