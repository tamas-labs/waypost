// A place on a map. The database and the chain hold integers (lat_e7, lng_e7, accuracy_dm); these are for display only.

/** WGS 84 degrees. */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface Region extends Coordinate {
  latitudeDelta: number;
  longitudeDelta: number;
}

/** About 200 m: the map of one point (or of points close together) is not zoomed in further. */
const MIN_DELTA_DEGREES = 0.002;
/** Air around the outermost points. */
const REGION_MARGIN = 1.5;

/** Null when either value is missing. */
export function coordinateOfE7(lat_e7: number | null, lng_e7: number | null): Coordinate | null {
  return lat_e7 === null || lng_e7 === null ? null : { latitude: lat_e7 / 1e7, longitude: lng_e7 / 1e7 };
}

/** The smallest region showing all the coordinates; there must be at least one. */
export function regionAround(coordinates: readonly [Coordinate, ...Coordinate[]]): Region {
  const latitudes = coordinates.map((c) => c.latitude);
  const longitudes = coordinates.map((c) => c.longitude);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...latitudes), Math.max(...latitudes), Math.min(...longitudes), Math.max(...longitudes)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * REGION_MARGIN, MIN_DELTA_DEGREES),
    longitudeDelta: Math.max((maxLng - minLng) * REGION_MARGIN, MIN_DELTA_DEGREES),
  };
}
