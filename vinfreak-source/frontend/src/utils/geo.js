const EARTH_RADIUS_MILES = 3958.7613;

export function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a = sinLat * sinLat + Math.cos(rLat1) * Math.cos(rLat2) * sinLng * sinLng;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, a))));
  return EARTH_RADIUS_MILES * c;
}

export default { haversineMiles };
