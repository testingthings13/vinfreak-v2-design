import assert from "assert";
import { toParams, API_BASE } from "./api.js";

assert.strictEqual(API_BASE, "https://vinfreak.onrender.com");

const params = toParams({ bodyType: "SUV", drivetrain: "AWD", exteriorColor: "Red", transmission: "Manual" });
assert.strictEqual(params.get("body_type"), "SUV");
assert.strictEqual(params.get("drivetrain"), "AWD");
assert.strictEqual(params.get("exterior_color"), "Red");
assert.strictEqual(params.get("transmission"), "Manual");

const locParams = toParams({ sort: "nearest", lat: 40.7128, lng: -74.006, maxDistance: 50 });
assert.strictEqual(locParams.get("sort"), "nearest");
assert.strictEqual(locParams.get("lat"), "40.7128");
assert.strictEqual(locParams.get("lng"), "-74.006");
assert.strictEqual(locParams.get("max_distance"), "50");
console.log("API helper tests passed");
