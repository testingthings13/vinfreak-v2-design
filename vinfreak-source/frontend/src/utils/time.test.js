import assert from "assert";
import { parseEndTime, parseTimeLeft, daysSince, parseTimestamp } from "./time.js";

const input1 = "September 2nd at 5:25 PM UTC";
const base1 = Date.parse(
  `September 2 5:25 PM UTC ${new Date().getUTCFullYear()}`
);
let expected1 = base1;
if (expected1 < Date.now()) {
  const d = new Date(expected1);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  expected1 = d.getTime();
}
assert.strictEqual(parseEndTime(input1), expected1);
assert.strictEqual(parseEndTime(input1, { rollForward: false }), base1);

const input2 = "September 3rd 2024 at 5:38 PM UTC";
const expected2 = Date.parse("September 3 2024 5:38 PM UTC");
assert.strictEqual(parseEndTime(input2), expected2);

assert.strictEqual(parseTimeLeft("1h 30m"), 5400000);
assert.strictEqual(parseTimeLeft(45), 45000);
assert.strictEqual(parseTimeLeft("6:12:18"), (6 * 3600 + 12 * 60 + 18) * 1000);
assert.strictEqual(parseTimeLeft("Ending in 6:12:18 left"), (6 * 3600 + 12 * 60 + 18) * 1000);
assert.strictEqual(parseTimeLeft("12:34"), (12 * 60 + 34) * 1000);
assert.strictEqual(
  parseTimeLeft("19:34:3119:39:3119:44:3119:49:3119:54:3119:59:3120:04:3120:09:31"),
  (19 * 3600 + 34 * 60 + 31) * 1000
);

const reference = new Date("2024-01-05T00:00:00Z");
assert.strictEqual(daysSince("2024-01-04T00:00:00Z", reference), 1);
assert.strictEqual(daysSince("2024-01-05T00:00:00Z", reference), 0);
assert.strictEqual(daysSince("2024-01-06T00:00:00Z", reference), 0);
assert.strictEqual(daysSince(null, reference), null);

const fancy = "Listed on September 3rd 2024 at 5:38 PM UTC";
const plain = "September 3rd 2024 at 5:38 PM UTC";
const fancyTs = parseTimestamp(fancy);
assert.ok(Number.isFinite(fancyTs));
assert.strictEqual(fancyTs, parseTimestamp(plain));
assert.strictEqual(daysSince(fancy, fancyTs + 86400000), 1);

const weirdTz = "2024-09-27T08:00:00.123456+00:00Z";
const normalizedTz = parseTimestamp("2024-09-27T08:00:00.123456+00:00");
assert.strictEqual(parseTimestamp(weirdTz), normalizedTz);
assert.strictEqual(daysSince(weirdTz, normalizedTz + 86400000), 1);

const now = Date.now();
const listedWeeks = parseTimestamp("Listed 8 weeks ago in West Hollywood, CA");
assert.ok(Number.isFinite(listedWeeks));
const minEightWeekAgo = now - 57 * 24 * 60 * 60 * 1000;
const maxEightWeekAgo = now - 55 * 24 * 60 * 60 * 1000;
assert.ok(listedWeeks <= maxEightWeekAgo);
assert.ok(listedWeeks >= minEightWeekAgo);

const listedMonth = parseTimestamp("about a month ago");
assert.ok(Number.isFinite(listedMonth));
const minMonthAgo = now - 31 * 24 * 60 * 60 * 1000;
const maxMonthAgo = now - 29 * 24 * 60 * 60 * 1000;
assert.ok(listedMonth <= maxMonthAgo);
assert.ok(listedMonth >= minMonthAgo);

console.log("time tests passed");
