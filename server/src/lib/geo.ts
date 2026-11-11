const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A rectangle that fully contains the circle. Cheap index-friendly prefilter before exact distance. */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const cosLat = Math.max(0.01, Math.cos(toRad(lat)));
  const dLng = dLat / cosLat;
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** ~11 km grid cell key, used to remember which areas were imported from OpenStreetMap. */
export function cellOf(lat: number, lng: number) {
  const cLat = Math.round(lat * 10) / 10;
  const cLng = Math.round(lng * 10) / 10;
  return { key: `${cLat.toFixed(1)}:${cLng.toFixed(1)}`, lat: cLat, lng: cLng };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
