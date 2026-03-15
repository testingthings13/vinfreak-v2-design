import { resolveTarget, parseEndTime } from "./time.js";
import { haversineMiles } from "./geo.js";
import { extractCityState, normalizeLocationText, normalizeState } from "./normalizeCar.js";

// Sort a list of cars, always prioritizing auctions that end soon.
// Cars that are SOLD or REMOVED, or without a valid countdown, are pushed to the end.
export function sortCars(list, sort, options = {}) {
  const arr = [...list];
  const {
    userLat = null,
    userLng = null,
    preferredState = null,
    preferredCity = null,
    preferredPostalCode = null,
  } = options ?? {};

  const canonicalState = normalizeState;
  const canonicalCity = (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  };
  const canonicalPostal = (value) => {
    if (typeof value !== "string") return null;
    const match = value.match(/\b\d{5}(?:-\d{4})?\b/);
    if (match) return match[0].slice(0, 5);
    const trimmed = value.replace(/[^0-9]/g, "");
    if (trimmed.length >= 5) return trimmed.slice(0, 5);
    return null;
  };

  const preferredStateNorm = canonicalState(preferredState);
  const preferredCityNorm = canonicalCity(preferredCity);
  const preferredPostalNorm = preferredPostalCode
    ? canonicalPostal(String(preferredPostalCode))
    : null;

  const carRegionDetails = (car) => {
    const postalCandidates = [];
    const pushPostal = (value) => {
      if (value == null) return;
      const parsed = canonicalPostal(String(value));
      if (parsed) postalCandidates.push(parsed);
    };

    pushPostal(car.postal_code);
    pushPostal(car.location_postal_code);
    pushPostal(car.postalCode);
    pushPostal(car.location_postalCode);
    pushPostal(car.location_address);
    pushPostal(car.__location);
    pushPostal(car.dealership?.location);

    const postal = postalCandidates.find(Boolean) || null;

    const stateCandidates = [];
    const pushState = (value) => {
      if (value == null) return;
      const parsed = canonicalState(value);
      if (parsed) stateCandidates.push(parsed);
    };
    pushState(car.state);
    pushState(car.location_state);
    pushState(car.locationState);
    pushState(car.location?.state);
    pushState(car.dealership?.state);
    pushState(car.dealership?.location_state);
    pushState(canonicalState(postal));
    pushState(extractCityState(car.location_address ?? "").state);
    pushState(extractCityState(car.__location ?? "").state);
    pushState(extractCityState(car.dealership?.location ?? "").state);

    const state = stateCandidates.find(Boolean) || null;

    const cityCandidates = [];
    const pushCity = (value) => {
      if (value == null) return;
      const parsed = canonicalCity(value);
      if (parsed) cityCandidates.push(parsed);
    };
    pushCity(car.city);
    pushCity(car.location_city);
    pushCity(car.locationCity);
    pushCity(car.location?.city);
    pushCity(car.dealership?.city);
    const fromAddress = extractCityState(car.location_address ?? "");
    if (fromAddress.city) pushCity(fromAddress.city);
    const fromDisplay = extractCityState(car.__location ?? "");
    if (fromDisplay.city) pushCity(fromDisplay.city);
    const fromDealer = extractCityState(car.dealership?.location ?? "");
    if (fromDealer.city) pushCity(fromDealer.city);

    const city = cityCandidates.find(Boolean) || null;

    return { state, city, postal };
  };

  const preferenceRank = (car) => {
    if (!preferredStateNorm && !preferredCityNorm && !preferredPostalNorm) {
      return { score: Infinity, stateMatch: false };
    }
    const { state, city, postal } = carRegionDetails(car);
    if (preferredPostalNorm && postal === preferredPostalNorm) {
      return { score: 0, stateMatch: true };
    }
    if (preferredCityNorm && city === preferredCityNorm) {
      return { score: 1, stateMatch: preferredStateNorm ? state === preferredStateNorm : true };
    }
    if (preferredStateNorm && state === preferredStateNorm) {
      return { score: 2, stateMatch: true };
    }
    if (preferredStateNorm && !state) {
      return { score: 4, stateMatch: false };
    }
    return { score: 3, stateMatch: false };
  };

  const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? Infinity : Number(v));
  const numNullLast = (v) => (v == null || v === "" || isNaN(Number(v)) ? -Infinity : Number(v));
  const transmissionRank = (car) => {
    const normalizedTag = String(car?.__transmission ?? "").trim().toLowerCase();
    if (normalizedTag === "manual") return 0;
    if (normalizedTag === "automatic") return 1;

    const rawTransmission = String(car?.transmission ?? "").trim().toLowerCase();
    if (!rawTransmission) return 2;
    if (
      rawTransmission.includes("manual") ||
      rawTransmission.includes("stick") ||
      rawTransmission.includes("m/t") ||
      /\bmt\b/.test(rawTransmission)
    ) {
      return 0;
    }
    if (rawTransmission.includes("auto")) return 1;
    return 2;
  };
  const distanceValue = (car) => {
    const raw =
      car.distance_miles ??
      car.distance ??
      car.__distance ??
      (car.stats ? car.stats.distance : undefined);
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    if (userLat != null && userLng != null) {
      const coordinatePairs = [];
      const visitedObjects = new Set();
      const isLat = (value) => Number.isFinite(value) && Math.abs(value) <= 90;
      const isLng = (value) => Number.isFinite(value) && Math.abs(value) <= 180;
      const toNum = (value) => {
        if (value == null || value === "") return null;
        if (typeof value === "number") return Number.isFinite(value) ? value : null;
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (!trimmed) return null;
          const num = Number(trimmed);
          return Number.isFinite(num) ? num : null;
        }
        return null;
      };
      const pushPair = (latValue, lngValue) => {
        const latNum = toNum(latValue);
        const lngNum = toNum(lngValue);
        if (latNum == null || lngNum == null) return;
        if (isLat(latNum) && isLng(lngNum)) {
          coordinatePairs.push([latNum, lngNum]);
          return;
        }
        if (isLat(lngNum) && isLng(latNum)) {
          coordinatePairs.push([lngNum, latNum]);
        }
      };
      const parseTupleString = (value) => {
        if (typeof value !== "string") return;
        if (!/[0-9]/.test(value)) return;
        const parts = value.split(/[\s,|/]+/).filter(Boolean);
        if (parts.length < 2) return;
        pushPair(parts[0], parts[1]);
      };
      const probeValue = (value) => {
        if (value == null) return;
        if (typeof value === "object") {
          if (visitedObjects.has(value)) return;
          visitedObjects.add(value);
        }
        if (Array.isArray(value)) {
          if (value.length >= 2) {
            pushPair(value[0], value[1]);
          }
          if (value.length >= 2) {
            pushPair(value[1], value[0]);
          }
          return;
        }
        if (typeof value === "string") {
          parseTupleString(value);
          return;
        }
        if (typeof value === "object") {
          const latCandidate =
            value.latitude ??
            value.lat ??
            value.y ??
            value.northing ??
            null;
          const lngCandidate =
            value.longitude ??
            value.lng ??
            value.lon ??
            value.long ??
            value.x ??
            value.easting ??
            null;
          if (latCandidate != null && lngCandidate != null) {
            pushPair(latCandidate, lngCandidate);
          }
          const nested =
            value.coordinates ??
            value.coord ??
            value.location ??
            value.point ??
            value.center ??
            value.geo ??
            value.latLng ??
            value.lonLat ??
            null;
          if (nested != null) {
            probeValue(nested);
          }
        }
      };

      const addPair = (latValue, lngValue) => {
        pushPair(latValue, lngValue);
      };

      addPair(car.latitude, car.longitude);
      addPair(car.latitude, car.lng);
      addPair(car.lat, car.lng);
      addPair(car.lat, car.longitude);
      addPair(car.__latitude, car.__longitude);
      addPair(car.location?.lat, car.location?.lng);
      addPair(car.location?.lat, car.location?.lon);
      addPair(car.location?.latitude, car.location?.longitude);
      addPair(car.location?.geo?.lat, car.location?.geo?.lng);
      addPair(car.location?.geo?.latitude, car.location?.geo?.longitude);
      addPair(car.location_lat, car.location_lng);
      addPair(car.locationLatitude, car.locationLongitude);
      addPair(car.location_latitude, car.location_longitude);
      addPair(car.geo?.lat, car.geo?.lng);
      addPair(car.geo?.latitude, car.geo?.longitude);
      addPair(car.dealership?.latitude, car.dealership?.longitude);
      addPair(car.dealership?.latitude, car.dealership?.lng);
      addPair(car.dealership?.lat, car.dealership?.lng);
      addPair(car.dealership?.lat, car.dealership?.longitude);
      addPair(car.dealership_latitude, car.dealership_longitude);
      addPair(car.dealership?.location?.lat, car.dealership?.location?.lng);
      addPair(car.dealership?.location?.lat, car.dealership?.location?.lon);
      addPair(car.dealership?.location?.latitude, car.dealership?.location?.longitude);

      probeValue(car.coordinates);
      probeValue(car.coordinate);
      probeValue(car.location_coordinates);
      probeValue(car.locationCoordinate);
      probeValue(car.location_coordinate);
      probeValue(car.location?.coordinates);
      probeValue(car.location?.coordinate);
      probeValue(car.location?.point);
      probeValue(car.location?.point?.coordinates);
      probeValue(car.location?.center);
      probeValue(car.location?.center?.coordinates);
      probeValue(car.location?.geometry);
      probeValue(car.location?.geometry?.coordinates);
      probeValue(car.location?.geo);
      probeValue(car.location?.geo?.coordinates);
      probeValue(car.geo);
      probeValue(car.geo?.coordinates);
      probeValue(car.geo_point);
      probeValue(car.geoPoint);
      probeValue(car.geoJson);
      probeValue(car.geoJson?.coordinates);
      probeValue(car.geometry);
      probeValue(car.geometry?.coordinates);
      probeValue(car.position);
      probeValue(car.position?.coordinates);
      probeValue(car.dealership?.coordinates);
      probeValue(car.dealership?.coordinate);
      probeValue(car.dealership?.location?.coordinates);
      probeValue(car.dealership?.location?.coordinate);
      probeValue(car.dealership?.location?.point);
      probeValue(car.dealership?.location?.point?.coordinates);
      probeValue(car.dealership?.location?.geometry);
      probeValue(car.dealership?.location?.geometry?.coordinates);

      for (const [latCandidate, lngCandidate] of coordinatePairs) {
        if (latCandidate == null || lngCandidate == null) continue;
        if (!Number.isFinite(latCandidate) || !Number.isFinite(lngCandidate)) continue;
        return haversineMiles(userLat, userLng, latCandidate, lngCandidate);
      }
    }
    return Infinity;
  };

  const prioritizeCountdown = sort === "relevance";
  arr.sort((a, b) => {
    const aEnded = ["SOLD", "REMOVED"].includes(a.__status);
    const bEnded = ["SOLD", "REMOVED"].includes(b.__status);
    if (aEnded !== bEnded) return aEnded ? 1 : -1;

    if (sort === "end_time_asc") {
      const aT = parseEndTime(a.end_time);
      const bT = parseEndTime(b.end_time);
      const aTime = isNaN(aT) ? Infinity : aT;
      const bTime = isNaN(bT) ? Infinity : bT;
      if (aTime !== bTime) return aTime - bTime;
      return 0;
    }

    if (prioritizeCountdown) {
      const aTarget = resolveTarget(a.end_time, a.time_left);
      const bTarget = resolveTarget(b.end_time, b.time_left);
      const aT = isNaN(aTarget) || aTarget <= Date.now() ? Infinity : aTarget;
      const bT = isNaN(bTarget) || bTarget <= Date.now() ? Infinity : bTarget;
      if (aT !== bT) return aT - bT;
    }

    switch (sort) {
      case "manual_first": {
        const aRank = transmissionRank(a);
        const bRank = transmissionRank(b);
        if (aRank !== bRank) return aRank - bRank;
        return 0;
      }
      case "price_asc":
        return num(a.__price) - num(b.__price);
      case "price_desc":
        return numNullLast(b.__price) - numNullLast(a.__price);
      case "year_desc":
        return numNullLast(b.__year) - numNullLast(a.__year);
      case "year_asc":
        return num(a.__year) - num(b.__year);
      case "mileage_asc":
        return num(a.__mileage) - num(b.__mileage);
      case "mileage_desc":
        return numNullLast(b.__mileage) - numNullLast(a.__mileage);
      case "nearest":
      case "distance": {
        const aDist = distanceValue(a);
        const bDist = distanceValue(b);
        const aFinite = Number.isFinite(aDist);
        const bFinite = Number.isFinite(bDist);
        if (aFinite && bFinite && aDist !== bDist) return aDist - bDist;
        if (aFinite && !bFinite) return -1;
        if (!aFinite && bFinite) return 1;
        const aPref = preferenceRank(a);
        const bPref = preferenceRank(b);
        if (aPref.score !== bPref.score) return aPref.score - bPref.score;
        if (aPref.stateMatch !== bPref.stateMatch) {
          return aPref.stateMatch ? -1 : 1;
        }
        const aLoc = normalizeLocationText(a.__location ?? a.location_address ?? "") || "";
        const bLoc = normalizeLocationText(b.__location ?? b.location_address ?? "") || "";
        if (aLoc && bLoc && aLoc !== bLoc) return aLoc.localeCompare(bLoc);
        return 0;
      }
      case "relevance":
      default:
        return 0;
    }
  });

  return arr;
}

export default sortCars;

