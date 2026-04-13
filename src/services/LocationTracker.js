import { registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import axios from 'axios';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

const STORAGE_KEY = 'offline_locations';

export class LocationTracker {
  constructor(employeeId) {
    this.employeeId = employeeId;
    this.watcherId = null;
    this.geofences = [];
    this.insideZones = new Set();
    this.isOnline = navigator.onLine;

    window.addEventListener('online', () => {
       this.isOnline = true;
       this.syncOfflineLocations();
    });
    window.addEventListener('offline', () => {
       this.isOnline = false;
    });
  }

  async fetchGeofences() {
    try {
      const res = await axios.get('/api/geofence');
      this.geofences = res.data || [];
    } catch (e) {
      console.warn("Failed to fetch geofences", e);
    }
  }

  getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
  }

  async checkGeofences(lat, lng) {
    for (const zone of this.geofences) {
      const distance = this.getDistanceMeters(lat, lng, zone.latitude, zone.longitude);
      const isInside = distance <= (zone.radius || 100);

      if (isInside && !this.insideZones.has(zone.id)) {
         this.insideZones.add(zone.id);
         this.logGeofenceEvent(zone.name, 'ENTER');
      } else if (!isInside && this.insideZones.has(zone.id)) {
         this.insideZones.delete(zone.id);
         this.logGeofenceEvent(zone.name, 'EXIT');
      }
    }
  }

  async logGeofenceEvent(zoneName, action) {
    if (this.isOnline) {
       try {
         await axios.post('/api/geofence/event', {
           employeeId: this.employeeId,
           zoneName,
           action,
           timestamp: new Date()
         });
       } catch (e) { console.error("Geofence event failed", e); }
    } else {
       // Optional: cache geofence events for offline sync
    }
  }

  async cacheLocation(location) {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    const locations = value ? JSON.parse(value) : [];
    locations.push(location);
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(locations) });
  }

  async syncOfflineLocations() {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (!value) return;

    const locations = JSON.parse(value);
    if (locations.length === 0) return;

    try {
      await axios.post('/api/location/sync', {
        employeeId: this.employeeId,
        locations
      });
      // Clear after successful sync
      await Preferences.remove({ key: STORAGE_KEY });
      console.log(`Synced ${locations.length} offline points.`);
    } catch (e) {
      console.error("Offline sync failed, keeping cache", e);
    }
  }

  async getCityName(lat, lng) {
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const address = res.data?.address;
      if (!address) return '';
      return address.sublocality || address.locality || address.neighborhood || address.neighbourhood || address.village || address.hamlet || address.suburb || address.area || address.route || address.town || address.county || '';
    } catch {
      return '';
    }
  }

  async startTracking() {
    await this.fetchGeofences();
    await this.syncOfflineLocations();

    try {
      // Configuration for plugin
      this.watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: "Tracking Active.",
          backgroundTitle: "Krishna Dairy route tracking.",
          requestPermissions: true,
          stale: false,
          distanceFilter: 20 // 20 meters
        },
        async (location, error) => {
          if (error) {
            console.error("BGL Error: ", error);
            if (error.code === "NOT_AUTHORIZED") {
                if (window.confirm("App needs location tracking. Open Settings?")) {
                    BackgroundGeolocation.openSettings();
                }
            }
            return;
          }

          if (location && location.accuracy <= 50) {
            const locData = {
              latitude: location.latitude,
              longitude: location.longitude,
              timestamp: new Date().toISOString()
            };

            // Check geofences silently
            this.checkGeofences(locData.latitude, locData.longitude);

            if (this.isOnline) {
                // Determine city name optionally or leave it for server
                // To avoid rate-limiting Nominatim, we'll only send lat/lng for continuous tracking
                try {
                  await axios.post('/api/location/update', {
                    employeeId: this.employeeId,
                    latitude: locData.latitude,
                    longitude: locData.longitude,
                    city: ''
                  });
                } catch (e) {
                  // Network error despite isOnline=true
                  await this.cacheLocation(locData);
                }
            } else {
                await this.cacheLocation(locData);
            }
          }
        }
      );
      console.log("Background tracking started", this.watcherId);
    } catch (err) {
      console.error("Failed to start BackgroundGeolocation. Are you on web?", err);
      // Fallback for Web/Browser
      this.startWebFallback();
    }
  }

  startWebFallback() {
      console.warn("Starting web geolocation fallback");
      this.watcherId = navigator.geolocation.watchPosition(
          async (pos) => {
              if (pos.coords.accuracy <= 50) {
                  const locData = { 
                      latitude: pos.coords.latitude, 
                      longitude: pos.coords.longitude, 
                      timestamp: new Date().toISOString()
                  };
                  if (this.isOnline) {
                      axios.post('/api/location/update', {
                          employeeId: this.employeeId,
                          latitude: locData.latitude,
                          longitude: locData.longitude
                      }).catch(() => this.cacheLocation(locData));
                  } else {
                      this.cacheLocation(locData);
                  }
              }
          },
          (err) => console.error("Web Fallback Error", err),
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
  }

  async stopTracking() {
    if (this.watcherId !== null) {
      try {
         await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
      } catch (e) {
         if (navigator.geolocation) {
             navigator.geolocation.clearWatch(this.watcherId);
         }
      }
      this.watcherId = null;
    }
  }
}
