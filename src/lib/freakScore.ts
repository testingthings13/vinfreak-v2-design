import type { NormalizedCar } from "./normalizeCar";

/**
 * Computes a 1-100 FREAK Score for a car listing.
 * Higher = better deal / more desirable.
 *
 * Factors (weighted):
 * - Price vs estimated value (40%)
 * - Mileage relative to age (25%)
 * - Engagement (likes + comments) (15%)
 * - Completeness of listing (10%)
 * - Days listed freshness (10%)
 */
export function computeFreakScore(car: NormalizedCar): number | null {
  // Need at minimum a price to compute
  if (car.price == null || car.price <= 0) return null;

  let score = 50; // baseline

  // 1. Value deal: price vs estimated value (±20 points)
  if (car.estimatedValueNumber && car.estimatedValueNumber > 0) {
    const ratio = car.price / car.estimatedValueNumber;
    if (ratio < 0.8) score += 20;       // great deal
    else if (ratio < 0.95) score += 12; // good deal
    else if (ratio < 1.05) score += 4;  // fair
    else if (ratio < 1.2) score -= 5;   // above market
    else score -= 12;                    // overpriced
  }

  // 2. Mileage vs age (±12 points)
  if (car.mileage != null && car.year) {
    const age = Math.max(1, new Date().getFullYear() - car.year);
    const avgMilesPerYear = car.mileage / age;
    if (avgMilesPerYear < 5000) score += 12;       // low mileage
    else if (avgMilesPerYear < 10000) score += 6;  // below average
    else if (avgMilesPerYear < 15000) score += 0;  // average
    else if (avgMilesPerYear < 25000) score -= 4;
    else score -= 8;
  }

  // 3. Engagement (up to +8 points)
  const engagement = (car.likes || 0) + (car.commentCount || 0);
  if (engagement >= 20) score += 8;
  else if (engagement >= 10) score += 5;
  else if (engagement >= 3) score += 2;

  // 4. Listing completeness (+5 points max)
  let completeness = 0;
  if (car.images.length > 3) completeness++;
  if (car.description && car.description.length > 50) completeness++;
  if (car.vin) completeness++;
  if (car.location) completeness++;
  if (car.transmission) completeness++;
  score += Math.min(completeness, 5);

  // 5. Freshness (+5 max)
  if (car.createdAt || car.postedAt) {
    const days = Math.floor(
      (Date.now() - new Date(car.createdAt || car.postedAt!).getTime()) / 86400000
    );
    if (days <= 1) score += 5;
    else if (days <= 3) score += 3;
    else if (days <= 7) score += 1;
    else if (days > 30) score -= 3;
  }

  // Clamp
  return Math.max(1, Math.min(100, Math.round(score)));
}

export function getScoreLabel(score: number): string {
  if (score >= 85) return "Exceptional";
  if (score >= 70) return "Great";
  if (score >= 55) return "Good";
  if (score >= 40) return "Fair";
  return "Below Avg";
}

export function getScoreColor(score: number): string {
  if (score >= 85) return "freak-score--exceptional";
  if (score >= 70) return "freak-score--great";
  if (score >= 55) return "freak-score--good";
  if (score >= 40) return "freak-score--fair";
  return "freak-score--low";
}
