/**
 * Haversine formula — calculates great-circle distance between two GPS points.
 * Returns distance in metres. Used server-side; cannot be bypassed by client.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeofenceResult {
  allowed: boolean;
  distanceMeters: number;
  locationName: string;
  locationId: number;
  radiusMeters: number;
}

export interface Location {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radius_meters: number;
}

/**
 * Given a member's GPS coordinates and a list of active locations,
 * returns the closest matching location within its geofence radius.
 * If locationId is provided, checks only that specific location.
 */
export function checkGeofence(
  memberLat: number,
  memberLng: number,
  locations: Location[],
  preferredLocationId?: number
): GeofenceResult | null {
  const targets = preferredLocationId
    ? locations.filter((l) => l.id === preferredLocationId)
    : locations;

  if (targets.length === 0) return null;

  // Find closest location
  let best: GeofenceResult | null = null;

  for (const loc of targets) {
    const dist = Math.round(haversineDistance(memberLat, memberLng, loc.lat, loc.lng));
    const allowed = dist <= loc.radius_meters;

    if (!best || dist < best.distanceMeters) {
      best = {
        allowed,
        distanceMeters: dist,
        locationName: loc.name,
        locationId: loc.id,
        radiusMeters: loc.radius_meters,
      };
    }
  }

  return best;
}
