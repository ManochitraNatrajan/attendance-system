import { registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import axios from 'axios';
import { io } from 'socket.io-client';
import { getSyncedTime, getSyncedTimeNow } from '../utils/timeSync';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

const STORAGE_KEY = 'offline_locations';

export class LocationTracker {
  constructor(employeeId) {
    this.employeeId = employeeId;
    this.watcherId = null;
    this.retryTimer = null;
    this.geofences = [];
    this.insideZones = new Set();
    this.isOnline = navigator.onLine;
    this.lastSendTime = 0;
    this.lastSentLat = null;
    this.lastSentLng = null;
    
    const host = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
    this.socket = io(host, { autoConnect: false });

    window.addEventListener('online', () => {
       console.log("[GPS] Device online - resuming sync");
       this.isOnline = true;
       this.socket.connect();
       this.syncOfflineLocations();
    });
    window.addEventListener('offline', () => {
       console.log("[GPS] Device offline - caching enabled");
       this.isOnline = false;
       this.socket.disconnect();
    });
  }

  async fetchGeofences() {
    try {
      const res = await axios.get('/api/geofence');
      this.geofences = res.data || [];
    } catch (e) {
      console.warn("[GPS] Geofence fetch failed", e);
    }
  }

  getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  async cacheLocation(location) {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      const locations = value ? JSON.parse(value) : [];
      locations.push(location);
      await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(locations) });
      console.log(`[GPS] Location cached (Total: ${locations.length})`);
    } catch (e) { console.error("[GPS] Cache failed", e); }
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
      await Preferences.remove({ key: STORAGE_KEY });
      console.log(`[GPS] Synced ${locations.length} points.`);
    } catch (e) {
      console.error("[GPS] Sync failed", e);
    }
  }

  async startTracking() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    
    console.log("[GPS] Starting Unified Tracking (Extreme Accuracy Mode)...");
    await this.fetchGeofences();
    await this.syncOfflineLocations();
    if (this.isOnline) this.socket.connect();

    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        alert("CRITICAL: GPS tracking requires HTTPS. Please check your connection.");
    }

    try {
      this.watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: "Tracking your shift movement with high precision.",
          backgroundTitle: "Sri Krishna Dairy Live Tracking",
          requestPermissions: true,
          stale: false,
          distanceFilter: 2 // Ultra-sensitive to motion
        },
        async (location, error) => {
          if (error) {
            this.handleError(error);
            return;
          }
          // Discard inaccurate points (> 50m) to fix 'Salem issue'
          if (location && (location.accuracy <= 50)) {
            console.log(`[GPS] Lock: ${location.latitude}, ${location.longitude} (+/- ${location.accuracy}m)`);
            this.processLocationUpdate(location.latitude, location.longitude);
          } else {
             console.warn(`[GPS] Discarded low accuracy fix: ${location?.accuracy || 'Unknown'}m`);
          }
        }
      );
    } catch (err) {
      console.warn("[GPS] Native tracking failed, trying Web Geolocation...");
      this.startWebFallback();
    }
  }

  startWebFallback() {
    if (!navigator.geolocation) {
        alert("This device does not support GPS tracking.");
        return;
    }

    this.watcherId = navigator.geolocation.watchPosition(
        (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            // Strict discard > 50m
            if (accuracy <= 50) {
                console.log(`[GPS] Web Lock: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (+/- ${accuracy.toFixed(1)}m)`);
                this.processLocationUpdate(latitude, longitude);
            } else {
                console.warn(`[GPS] Inaccurate point discarded: ${accuracy.toFixed(1)}m`);
            }
        },
        (err) => this.handleError(err),
        { 
            enableHighAccuracy: true, 
            timeout: 15000, // User requested 15s
            maximumAge: 0  // No cached data allowed
        }
    );
  }

  handleError(error) {
    console.error("[GPS] ERROR:", error);
    
    // Case 1: Permission Denied
    if (error.code === 1 || error.code === "NOT_AUTHORIZED") {
        alert("GPS ERROR: Permission denied. You MUST enable 'Precise Location' and 'Allow All The Time' in settings for tracking to work.");
        if (BackgroundGeolocation.openSettings) BackgroundGeolocation.openSettings();
        return;
    } 
    
    // Case 2 & 3: Position Unavailable / Timeout
    if (error.code === 2 || error.code === 3) {
        console.warn("[GPS] Signal lost. Retrying in 5 seconds...");
        this.scheduleRetry();
    }
  }

  scheduleRetry() {
     if (this.retryTimer) return;
     this.retryTimer = setTimeout(async () => {
        this.retryTimer = null;
        console.log("[GPS] Retrying tracking acquisition...");
        await this.stopTracking();
        this.startTracking();
     }, 5000);
  }

  processLocationUpdate(lat, lng) {
    const now = getSyncedTimeNow();
    let distanceMoved = 0;
    
    if (this.lastSentLat && this.lastSentLng) {
       distanceMoved = this.getDistanceMeters(this.lastSentLat, this.lastSentLng, lat, lng);
    } else {
       distanceMoved = 50; 
    }

    localStorage.setItem(`currentLoc_${this.employeeId}`, JSON.stringify({
        lat, lng, timestamp: getSyncedTime().toISOString()
    }));

    const isMoving = distanceMoved >= 5;
    const sendInterval = isMoving ? 10000 : 30000;

    if (now - this.lastSendTime >= sendInterval || distanceMoved >= 20) {
       this.lastSendTime = now;
       this.lastSentLat = lat;
       this.lastSentLng = lng;

       const locData = { latitude: lat, longitude: lng, timestamp: getSyncedTime().toISOString() };
       
       if (this.isOnline) {
           axios.post('/api/location/update', { 
             employeeId: this.employeeId, latitude: lat, longitude: lng 
           }).catch(err => {
               if (err.response && err.response.status === 404) {
                   console.log("[GPS] Session ended. Auto-stopping tracker.");
                   this.stopTracking();
               } else {
                   this.cacheLocation(locData);
               }
           });

           axios.post('/api/attendance/live-location', { 
             employeeId: this.employeeId, lat, lng 
           }).catch(() => {});
        } else {
          this.cacheLocation(locData);
       }
    }
  }

  async stopTracking() {
    if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }
    if (this.watcherId !== null) {
      console.log("[GPS] Stopping Tracker...");
      if (this.socket) this.socket.disconnect();
      try {
         await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
      } catch {
         if (navigator.geolocation) navigator.geolocation.clearWatch(this.watcherId);
      }
      this.watcherId = null;
    }
  }

  static getExactPosition() {
    return new Promise((resolve, reject) => {
        let watchId;
        let timeoutId;
        let bestPos = null;

        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
        };

        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                bestPos = pos;
                console.log(`[GPS] Precision search: ${pos.coords.accuracy.toFixed(1)}m`);
                // Use strict 50m but resolve immediately if < 20m
                if (pos.coords.accuracy <= 20) {
                    cleanup();
                    resolve(pos);
                }
            },
            (error) => {
                if (!bestPos) {
                    cleanup();
                    reject(error);
                }
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );

        timeoutId = setTimeout(() => {
            cleanup();
            if (bestPos && bestPos.coords.accuracy <= 50) {
                console.log(`[GPS] Fresh search complete. Accuracy: ${bestPos.coords.accuracy.toFixed(1)}m`);
                resolve(bestPos);
            } else {
                const currentAcc = bestPos ? `${bestPos.coords.accuracy.toFixed(1)}m` : 'No Signal';
                reject(new Error(`Location too inaccurate (${currentAcc}) or timed out. Accuracy must be < 50m. Please move to an open area.`));
            }
        }, 16000);
    });
  }
}
