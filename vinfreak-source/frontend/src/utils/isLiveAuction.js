import { parseEndTime, parseTimeLeft } from "./time";

/**
 * Determine whether a car is in a live auction with an active countdown.
 * A car is considered live when its auction hasn't ended, it isn't sold/ended,
 * and we can resolve either an end time or a remaining duration that is in the future.
 */
const AUCTION_SOURCES = ["bringatrailer", "carsandbids"];
const FINAL_STATUSES = new Set(["SOLD", "REMOVED"]);

export function getListingSource(car) {
  if (!car || typeof car !== "object") return "";
  const raw = car.__source ?? car.source ?? "";
  return typeof raw === "string" ? raw.toLowerCase() : "";
}

const DEALERSHIP_SOURCE_FIELDS = [
  "slug",
  "name",
  "short_name",
  "display_name",
  "label",
];

function includesAuctionSlug(value) {
  if (!value) return false;
  const source = String(value).toLowerCase();
  if (!source) return false;
  return AUCTION_SOURCES.some((slug) => source.includes(slug));
}

export function isAuctionSource(car) {
  const source = getListingSource(car);
  if (includesAuctionSlug(source)) {
    return true;
  }

  if (car && typeof car === "object" && car.dealership && typeof car.dealership === "object") {
    for (const field of DEALERSHIP_SOURCE_FIELDS) {
      if (includesAuctionSlug(car.dealership[field])) {
        return true;
      }
    }
  }

  return false;
}

export function isLiveAuction(car) {
  if (!car || typeof car !== "object") return false;
  const status = (car.__status || car.status || "").toUpperCase();
  if (FINAL_STATUSES.has(status)) return false;

  const end = parseEndTime(car.end_time ?? car.endTime, { rollForward: false });
  if (!Number.isNaN(end)) {
    return end > Date.now();
  }

  const left = parseTimeLeft(car.time_left ?? car.timeLeft);
  if (!Number.isNaN(left)) {
    return left > 0;
  }

  return false;
}

export function isForSale(car) {
  if (!car || typeof car !== "object") return false;
  const status = (car.__status || car.status || "").toUpperCase();
  if (!status) return true;
  return !FINAL_STATUSES.has(status);
}

export function isAuctionListing(car) {
  if (!car || typeof car !== "object") return false;
  if (!isForSale(car)) return false;
  if (isLiveAuction(car)) return true;
  return isAuctionSource(car);
}

export function isNonAuctionListing(car) {
  if (!car || typeof car !== "object") return false;
  if (!isForSale(car)) return false;
  if (isLiveAuction(car)) return false;
  return !isAuctionSource(car);
}

export default isLiveAuction;
