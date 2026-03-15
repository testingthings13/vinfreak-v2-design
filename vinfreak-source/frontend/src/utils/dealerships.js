export function resolveListingDealership(
  car = null,
  { mappedDealership = null, rawDealership = null } = {}
) {
  const normalizedDealership =
    car && typeof car === "object" ? car.dealership || null : null;
  return mappedDealership || normalizedDealership || rawDealership || null;
}
