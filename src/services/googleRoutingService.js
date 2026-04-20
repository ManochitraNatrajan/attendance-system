import axios from 'axios';

/**
 * Fetches road-snapped route geometry between points using Google Maps Proxy.
 * @param {Array<[number, number]>} coordinates - Array of coordinates
 * @returns {Promise<{coordinates: Array<[number, number]>, distance: number, fallback: boolean}>}
 */
export const fetchRoadRoute = async (coordinates) => {
  if (!coordinates || coordinates.length < 2) {
    return { coordinates: coordinates, distance: 0, fallback: true };
  }

  try {
    const coordsMap = coordinates.map(c => ({ lat: c[0], lng: c[1] }));
    const response = await axios.post('/api/route/snap', { coordinates: coordsMap });
    
    if (response.data && response.data.snappedPoints) {
      const snappedCoords = response.data.snappedPoints.map(p => [p.lat, p.lng]);
      return {
        coordinates: snappedCoords,
        distance: response.data.distance,
        fallback: false
      };
    } else {
      throw new Error("No snapped points returned");
    }
  } catch (error) {
    console.error('Failed to fetch Google Roads route:', error);
    // Fallback deliberately disabled per requirements to firmly prevent straight lines
    return {
      coordinates: coordinates,
      distance: 0,
      fallback: true
    };
  }
};
