import assert from "assert";

const cars = [
  { __price: 10000 },
  { __price: 20000 },
  { __price: 30000 },
  { __price: null },
];

function filterByPrice(list, minPrice, maxPrice) {
  return list.filter(c => {
    const price = c.__price == null ? null : Number(c.__price);
    const lowerOk = minPrice ? (price ?? 0) >= minPrice : true;
    const upperOk = maxPrice ? (price ?? Infinity) <= maxPrice : true;
    return lowerOk && upperOk;
  });
}

assert.deepStrictEqual(
  filterByPrice(cars, 15000, null).map(c => c.__price),
  [20000, 30000]
);
assert.deepStrictEqual(
  filterByPrice(cars, null, 25000).map(c => c.__price),
  [10000, 20000]
);
assert.deepStrictEqual(
  filterByPrice(cars, 15000, 25000).map(c => c.__price),
  [20000]
);

console.log("Price filter tests passed");

