import axios from 'axios';

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

/**
 * Fetches road-snapped route geometry between points using OSRM.
 * @param {Array<[number, number]>} coordinates - Array of [lat, lng]
 * @returns {Promise<{coordinates: Array<[number, number]>, distance: number, duration: number}>}
 */
export const fetchRoadRoute = async (coordinates) => {
  if (!coordinates || coordinates.length < 2) {
    return { coordinates: coordinates, distance: 0, duration: 0 };
  }

  try {
    // OSRM expects [lng, lat] format strings separated by semicolons
    const coordsString = coordinates
      .map(coord => `${coord[1]},${coord[0]}`)
      .join(';');

    const url = `${OSRM_BASE_URL}/${coordsString}?overview=full&geometries=geojson&steps=false`;
    
    const response = await axios.get(url);
    
    if (response.data.code !== 'Ok' || !response.data.routes || response.data.routes.length === 0) {
      throw new Error(`OSRM Error: ${response.data.code}`);
    }

    const route = response.data.routes[0];
    // OSRM returns GeoJSON coordinates as [lng, lat], we need [lat, lng] for Leaflet
    const snappedCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);

    return {
      coordinates: snappedCoords,
      distance: route.distance, // in meters
      duration: route.duration // in seconds
    };
  } catch (error) {
    console.error('Failed to fetch OSRM route:', error);
    // Fallback to straight lines if API fails
    return {
      coordinates: coordinates,
      distance: 0,
      duration: 0,
      isFallback: true
    };
  }
};

/**
 * Batches multiple coordinates and fetches a continuous road-snapped path.
 * OSRM has a limit (usually 100 points). This helper splits the requests.
 * @param {Array<[number, number]>} coordinates - Array of [lat, lng]
 * @returns {Promise<Array<[number, number]>>}
 */
export const fetchFullHistoryRoute = async (coordinates) => {
  if (!coordinates || coordinates.length < 2) return coordinates;

  const BATCH_SIZE = 40; // Conservative batch size for stability
  let fullSnappedPath = [];

  for (let i = 0; i < coordinates.length; i += (BATCH_SIZE - 1)) {
    const batch = coordinates.slice(i, i + BATCH_SIZE);
    if (batch.length < 2) break;

    const result = await fetchRoadRoute(batch);
    
    // To avoid duplicating points at batch boundaries
    if (fullSnappedPath.length > 0) {
      fullSnappedPath = [...fullSnappedPath, ...result.coordinates.slice(1)];
    } else {
      fullSnappedPath = result.coordinates;
    }

    // Small delay to respect public API rate limits if many batches
    if (coordinates.length > BATCH_SIZE) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return fullSnappedPath;
};
