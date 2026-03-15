import assert from "assert";
import { sortCars } from "./sortCars.js";

const cars = [
  { __id: "lambo", __status: "ACTIVE", time_left: "16h" },
  { __id: "viper", __status: "ACTIVE", time_left: "10m" },
  { __id: "sold", __status: "SOLD", time_left: "1h" },
];

const sorted = sortCars(cars, "relevance");
assert.deepStrictEqual(sorted.map(c => c.__id), ["viper", "lambo", "sold"]);

const endCars = [
  { __id: "c1", __status: "ACTIVE", end_time: "2025-01-01T00:00:00Z" },
  { __id: "c2", __status: "ACTIVE", end_time: "2024-01-01T00:00:00Z" },
  { __id: "c3", __status: "ACTIVE" },
];
const sortedEnd = sortCars(endCars, "end_time_asc");
assert.deepStrictEqual(sortedEnd.map(c => c.__id), ["c2", "c1", "c3"]);

const distanceCars = [
  { __id: "near", __status: "ACTIVE", latitude: 30.27, longitude: -97.74, time_left: "1d" },
  { __id: "far", __status: "ACTIVE", latitude: 34.05, longitude: -118.24, time_left: "10m" },
  { __id: "unknown", __status: "ACTIVE" },
];
const sortedDistance = sortCars(distanceCars, "distance", { userLat: 30.267153, userLng: -97.743057 });
assert.deepStrictEqual(sortedDistance.map((c) => c.__id), ["near", "far", "unknown"]);

const nearestCars = [
  { __id: "far", __status: "ACTIVE", distance_miles: 30 },
  { __id: "mid", __status: "ACTIVE", distance_miles: 12 },
  { __id: "near", __status: "ACTIVE", distance_miles: 6 },
  { __id: "unknown", __status: "ACTIVE" },
];
const sortedNearest = sortCars(nearestCars, "nearest", { userLat: 0, userLng: 0 });
assert.deepStrictEqual(sortedNearest.map((c) => c.__id), ["near", "mid", "far", "unknown"]);

const geoFallbackCars = [
  {
    __id: "string",
    __status: "ACTIVE",
    coordinates: "34.052235,-118.243683",
  },
  {
    __id: "array",
    __status: "ACTIVE",
    location: { coordinates: [-118.243683, 34.052235] },
  },
  {
    __id: "object",
    __status: "ACTIVE",
    geoJson: { coordinates: [34.052235, -118.243683] },
  },
];
const sortedGeoFallback = sortCars(geoFallbackCars, "distance", {
  userLat: 34.05,
  userLng: -118.25,
});
assert.deepStrictEqual(sortedGeoFallback.map((c) => c.__id), ["string", "array", "object"]);

const fallbackCars = [
  { __id: "ca1", __status: "ACTIVE", state: "CA", __location: "San Diego, CA" },
  { __id: "oh", __status: "ACTIVE", state: "OH", __location: "Columbus, OH" },
  { __id: "ca2", __status: "ACTIVE", state: "CA", __location: "Sacramento, CA" },
];
const sortedFallback = sortCars(fallbackCars, "distance", {
  preferredState: "CA",
  preferredCity: "San Diego",
});
assert.deepStrictEqual(sortedFallback.map((c) => c.__id), ["ca1", "ca2", "oh"]);

const priceCars = [
  { __id: "cheap", __status: "ACTIVE", __price: 10000, time_left: "5m" },
  { __id: "expensive", __status: "ACTIVE", __price: 50000, time_left: "1m" },
  { __id: "sold", __status: "SOLD", __price: 30000, time_left: "1m" },
];
const sortedPriceAsc = sortCars(priceCars, "price_asc");
assert.deepStrictEqual(sortedPriceAsc.map((c) => c.__id), ["cheap", "expensive", "sold"]);

const manualPriorityCars = [
  { __id: "auto", __status: "ACTIVE", __transmission: "Automatic" },
  { __id: "manualTagged", __status: "ACTIVE", __transmission: "Manual" },
  { __id: "manualRaw", __status: "ACTIVE", transmission: "6-Speed Manual" },
  { __id: "unknown", __status: "ACTIVE" },
  { __id: "soldManual", __status: "SOLD", __transmission: "Manual" },
];
const sortedManualFirst = sortCars(manualPriorityCars, "manual_first");
assert.deepStrictEqual(sortedManualFirst.map((c) => c.__id), [
  "manualTagged",
  "manualRaw",
  "auto",
  "unknown",
  "soldManual",
]);

console.log("sortCars tests passed");

