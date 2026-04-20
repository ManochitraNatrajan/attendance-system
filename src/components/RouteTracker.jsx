import { useEffect, useRef } from 'react';
import axios from 'axios';
import { getSyncedTimeNow } from '../utils/timeSync';

export default function RouteTracker() {
  const watchIdRef = useRef(null);
  const lastSyncRef = useRef({ time: 0, lat: 0, lng: 0 });

  const fetchLocationName = async (lat, lng) => {
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      return res.data?.address?.city || res.data?.address?.town || res.data?.address?.county || res.data?.address?.village || 'Local Area';
    } catch {
      return '';
    }
  };

  useEffect(() => {
    let checkInterval;

    const syncLocation = async (user, lat, lng) => {
      try {
        const city = await fetchLocationName(lat, lng);
        await axios.post('/api/location/update', {
          employeeId: user.id, lat, lng, city
        });
        lastSyncRef.current = { time: getSyncedTimeNow(), lat, lng };
      } catch (e) {
        // Silently fail on network drop to prevent alerting the user
      }
    };

    const getDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371e3;
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

    const runTrackerLogic = () => {
      const userStr = localStorage.getItem('user');
      const isCheckedIn = localStorage.getItem('isCheckedIn') === 'true';
      
      if (!userStr || !isCheckedIn) {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        return;
      }

      const user = JSON.parse(userStr);

      if (watchIdRef.current === null && navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            const now = getSyncedTimeNow();
            
            const timeDiff = now - lastSyncRef.current.time;
            const dist = getDistance(latitude, longitude, lastSyncRef.current.lat, lastSyncRef.current.lng);

            // Ignore low accuracy jumps unless it's been a minute
            if (accuracy > 40 && timeDiff < 60000) return;

            // Sync minimally every 10-15 seconds or 20 meters
            if (dist > 20 || timeDiff > 15000) {
               syncLocation(user, latitude, longitude);
            }
          },
          (err) => console.error("RouteTracker location error:", err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    };

    checkInterval = setInterval(runTrackerLogic, 10000); // verify tracker is active
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
