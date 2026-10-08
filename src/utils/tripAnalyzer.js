/* ============================================================================
   EMPLOYEE TRIP ANALYZER & GPS TRACKER UTILITIES
   Derived from Claude's Employee Trip Tracking Algorithm
   ============================================================================ */

export const CONFIG = {
  maxAccuracy: 30,          // m - ignore GPS points with accuracy > 30m
  minMove: 8,               // m - minimum distance move to ignore jitter
  maxSpeedKmh: 150,         // km/h - speed threshold above which points are discarded as GPS jumps
  idleRadius: 30,           // m - radius to consider stationary/idle point
  idleMinMs: 5 * 60 * 1000, // 5 minutes threshold for idle point
  returnMatchRadius: 25,    // m - check if point matches already traversed path (return path)
  minBackDist: 150,         // m - minimum cumulative distance back along route before checking return
};

const EARTH_RADIUS_METERS = 6371000;
const toRad = d => (d * Math.PI) / 180;

/**
 * Calculates Haversine distance in meters between two lat/lng points
 */
export function haversine(a, b) {
  if (!a || !b || a.lat === undefined || b.lat === undefined) return 0;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(x));
}

/**
 * Format timestamp to 12-hour AM/PM string in Indian timezone format
 */
export const fmtTime = t => {
  if (!t) return '-';
  const d = new Date(t);
  return isNaN(d.getTime()) ? '-' : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

/**
 * Format duration milliseconds into readable minutes / hours
 */
export const fmtDur = ms => {
  if (!ms || ms < 0) return '0 min';
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`;
};

/**
 * Filter raw GPS points to remove jitter (< minMove) and teleport jumps (> maxSpeedKmh)
 */
export function cleanPoints(raw) {
  if (!raw || !raw.length) return [];
  // Standardize point objects to { lat, lng, time, accuracy }
  const normalized = raw.map(p => ({
    lat: p.lat !== undefined ? Number(p.lat) : Number(p.latitude),
    lng: p.lng !== undefined ? Number(p.lng) : Number(p.longitude),
    accuracy: p.accuracy !== undefined ? Number(p.accuracy) : 10,
    time: p.time !== undefined ? new Date(p.time).getTime() : (p.timestamp ? new Date(p.timestamp).getTime() : Date.now())
  })).filter(p => !isNaN(p.lat) && !isNaN(p.lng) && p.accuracy <= CONFIG.maxAccuracy);

  if (!normalized.length) return [];

  const out = [normalized[0]];
  for (let i = 1; i < normalized.length; i++) {
    const prev = out[out.length - 1];
    const cur = normalized[i];
    const d = haversine(prev, cur);
    const dt = (cur.time - prev.time) / 1000;

    if (d < CONFIG.minMove) continue; // Skip jitter
    if (dt > 0 && (d / dt) * 3.6 > CONFIG.maxSpeedKmh) continue; // Skip speed jumps

    out.push(cur);
  }
  return out;
}

/**
 * Detect idle points (stationary clusters within idleRadius for >= idleMinMs)
 */
export function detectIdle(raw) {
  if (!raw || !raw.length) return [];
  const pts = raw.map(p => ({
    lat: p.lat !== undefined ? Number(p.lat) : Number(p.latitude),
    lng: p.lng !== undefined ? Number(p.lng) : Number(p.longitude),
    time: p.time !== undefined ? new Date(p.time).getTime() : (p.timestamp ? new Date(p.timestamp).getTime() : Date.now())
  })).filter(p => !isNaN(p.lat) && !isNaN(p.lng));

  const idles = [];
  let i = 0;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && haversine(pts[i], pts[j + 1]) <= CONFIG.idleRadius) {
      j++;
    }
    const dur = pts[j].time - pts[i].time;
    if (dur >= CONFIG.idleMinMs) {
      const g = pts.slice(i, j + 1);
      idles.push({
        lat: g.reduce((s, p) => s + p.lat, 0) / g.length,
        lng: g.reduce((s, p) => s + p.lng, 0) / g.length,
        start: pts[i].time,
        end: pts[j].time,
        durationMs: dur,
      });
      i = j + 1;
    } else {
      i++;
    }
  }
  return idles;
}

/**
 * Split route points into Outbound (blue) and Return (red) segments
 */
export function splitRoute(points) {
  if (!points || points.length < 2) {
    return { outbound: [], ret: [], outDist: 0, retDist: 0, totalDist: 0 };
  }

  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversine(points[i - 1], points[i]));
  }

  const isReturn = points.map(() => false);
  let returning = false;

  for (let i = 1; i < points.length; i++) {
    if (!returning) {
      for (let k = 0; k < i; k++) {
        if (cum[i] - cum[k] < CONFIG.minBackDist) break;
        if (haversine(points[i], points[k]) <= CONFIG.returnMatchRadius) {
          returning = true;
          break;
        }
      }
    }
    isReturn[i] = returning;
  }

  const outbound = [];
  const ret = [];
  let outDist = 0;
  let retDist = 0;

  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]);
    const seg = [points[i - 1], points[i]];
    if (isReturn[i]) {
      ret.push(seg);
      retDist += d;
    } else {
      outbound.push(seg);
      outDist += d;
    }
  }

  return { outbound, ret, outDist, retDist, totalDist: outDist + retDist };
}

/**
 * Analyze complete trip given raw GPS points, checkIn, checkOut
 */
export function analyzeTrip(raw, checkIn, checkOut) {
  const points = cleanPoints(raw);
  const idles = detectIdle(raw);
  const route = splitRoute(points);

  const startPt = checkIn || (raw && raw[0]) || { time: Date.now() };
  const endPt = checkOut || (raw && raw[raw.length - 1]) || { time: Date.now() };

  const checkInTime = new Date(startPt.time || startPt.timestamp || Date.now()).getTime();
  const checkOutTime = new Date(endPt.time || endPt.timestamp || Date.now()).getTime();

  return {
    checkIn: startPt,
    checkOut: endPt,
    points,
    idles,
    ...route,
    outKm: (route.outDist / 1000).toFixed(2),
    returnKm: (route.retDist / 1000).toFixed(2),
    totalKm: (route.totalDist / 1000).toFixed(2),
    totalTimeMs: Math.max(0, checkOutTime - checkInTime),
  };
}

/**
 * Compute total distance across multiple daily trips
 */
export function dailyTotalKm(trips) {
  if (!trips || !trips.length) return "0.00";
  return (trips.reduce((s, t) => s + (t.totalDist || 0), 0) / 1000).toFixed(2);
}

/**
 * Generate simulated Demo trip coordinates (for testing without live GPS)
 */
export function generateDemoTrip() {
  const start = { lat: 13.0827, lng: 80.2707 };
  const mid   = { lat: 13.0900, lng: 80.2850 };
  const far   = { lat: 13.1000, lng: 80.2900 };
  const pts = [];
  let t = Date.now() - 2 * 3600 * 1000;

  const lerp = (a, b, f) => ({
    lat: a.lat + (b.lat - a.lat) * f,
    lng: a.lng + (b.lng - a.lng) * f
  });
  const noise = () => (Math.random() - 0.5) * 0.00004;

  const addLeg = (a, b, n) => {
    for (let i = 0; i <= n; i++) {
      const p = lerp(a, b, i / n);
      t += 20000;
      pts.push({ lat: p.lat + noise(), lng: p.lng + noise(), accuracy: 10, time: t, timestamp: new Date(t).toISOString() });
    }
  };

  const idleAt = (p, minutes) => {
    for (let i = 0; i < minutes * 2; i++) {
      t += 30000;
      pts.push({ lat: p.lat + noise(), lng: p.lng + noise(), accuracy: 10, time: t, timestamp: new Date(t).toISOString() });
    }
  };

  addLeg(start, mid, 40);  // Outbound segment 1
  idleAt(mid, 8);          // Idle point 1 (8 mins)
  addLeg(mid, far, 30);    // Outbound segment 2
  idleAt(far, 12);         // Idle point 2 (12 mins)
  addLeg(far, mid, 30);    // Return leg 1 along same path
  addLeg(mid, start, 40);   // Return leg 2 to start

  return pts;
}
