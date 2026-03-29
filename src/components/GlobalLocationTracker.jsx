import { useEffect, useRef } from 'react';
import axios from 'axios';

export default function GlobalLocationTracker() {
  const watchIdRef = useRef(null);

  useEffect(() => {
    let syncInterval;
    let localCheckInterval;

    const checkAndTrack = () => {
      const userStr = localStorage.getItem('user');
      if (!userStr) return;
      const user = JSON.parse(userStr);
      const isCheckedIn = localStorage.getItem('isCheckedIn') === 'true';

      if (isCheckedIn) {
        if (watchIdRef.current === null && navigator.geolocation) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              localStorage.setItem(`currentLoc_${user.id}`, JSON.stringify({
                lat: latitude,
                lng: longitude,
                timestamp: new Date().toISOString()
              }));
            },
            (err) => console.error("Error watching position:", err),
            { enableHighAccuracy: true }
          );
        }

        if (!syncInterval) {
          syncInterval = setInterval(async () => {
            const locStr = localStorage.getItem(`currentLoc_${user.id}`);
            if (locStr) {
              try {
                const { lat, lng } = JSON.parse(locStr);
                await axios.post('/api/attendance/live-location', {
                  employeeId: user.id, lat, lng
                });
              } catch (e) {
                // Silently fail network drop
              }
            }
          }, 60000); // 60 seconds
        }

      } else {
        if (watchIdRef.current !== null && navigator.geolocation) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        if (syncInterval) {
          clearInterval(syncInterval);
          syncInterval = null;
        }
      }
    };

    localCheckInterval = setInterval(checkAndTrack, 30000);
    checkAndTrack();

    return () => {
      if (localCheckInterval) clearInterval(localCheckInterval);
      if (syncInterval) clearInterval(syncInterval);
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return null;
}
