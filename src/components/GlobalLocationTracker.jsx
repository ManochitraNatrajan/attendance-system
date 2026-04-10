import { useEffect, useRef } from 'react';
import axios from 'axios';

// Haversine formula to calculate distance between two points in meters
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const f1 = (lat1 * Math.PI) / 180;
  const f2 = (lat2 * Math.PI) / 180;
  const df = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(df / 2) * Math.sin(df / 2) +
            Math.cos(f1) * Math.cos(f2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export default function GlobalLocationTracker() {
  const watchIdRef = useRef(null);
  const lastSyncRef = useRef({ lat: 0, lng: 0, time: 0 });

  useEffect(() => {
    let checkInterval;

    const syncLocation = async (user, lat, lng) => {
      try {
        await axios.post('/api/attendance/live-location', {
          employeeId: user.id, lat, lng
        });
        lastSyncRef.current = { lat, lng, time: Date.now() };
      } catch (e) {
        // Silently fail on network drop
      }
    };

    const runTrackerLogic = () => {
      const userStr = localStorage.getItem('user');
      const isCheckedIn = localStorage.getItem('isCheckedIn') === 'true';
      if (!userStr || !isCheckedIn) {
        // Cleanup if not checked in
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        return;
      }

      const user = JSON.parse(userStr);

      // 1. Start watching if not already
      if (watchIdRef.current === null && navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            const now = Date.now();
            
            // Update local storage for immediate UI needs
            localStorage.setItem(`currentLoc_${user.id}`, JSON.stringify({
              lat: latitude, lng: longitude, timestamp: new Date().toISOString()
            }));

            // SMART SYNC LOGIC:
            const dist = getDistance(latitude, longitude, lastSyncRef.current.lat, lastSyncRef.current.lng);
            const timeDiff = now - lastSyncRef.current.time;

            if (accuracy > 40 && timeDiff < 60000) return;

            if (dist > 20 || timeDiff > 15000) {
              syncLocation(user, latitude, longitude);
            }
          },
          (err) => console.error("Location error:", err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    };

    // Run check every 10 seconds to ensure tracker is alive during active shift
    checkInterval = setInterval(runTrackerLogic, 10000);
    runTrackerLogic();

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return null;
}
