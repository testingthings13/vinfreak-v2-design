import { useEffect, useState } from "react";
import useDebounce from "../utils/useDebounce.js";

export default function FilterBar({ initial = {}, dealerships = [], onChange }) {
  const [q, setQ] = useState(initial.q || "");
  const [vin, setVin] = useState(initial.vin || "");
  const [make, setMake] = useState(initial.make || "");
  const [model, setModel] = useState(initial.model || "");
  const [yearMin, setYearMin] = useState(initial.yearMin || "");
  const [yearMax, setYearMax] = useState(initial.yearMax || "");
  const [priceMin, setPriceMin] = useState(initial.priceMin || "");
  const [priceMax, setPriceMax] = useState(initial.priceMax || "");
  const [dealershipId, setDealershipId] = useState(initial.dealershipId || "");
  const [sort, setSort] = useState(initial.sort || "relevance");
  const [bodyType, setBodyType] = useState(initial.bodyType || "");
  const [drivetrain, setDrivetrain] = useState(initial.drivetrain || "");
  const [exteriorColor, setExteriorColor] = useState(initial.exteriorColor || "");

  const dq = useDebounce(q);
  const dvin = useDebounce(vin);
  const dmake = useDebounce(make);
  const dmodel = useDebounce(model);

  useEffect(() => {
    onChange({
      q: dq || undefined,
      vin: dvin || undefined,
      make: dmake || undefined,
      model: dmodel || undefined,
      yearMin: yearMin ? Number(yearMin) : undefined,
      yearMax: yearMax ? Number(yearMax) : undefined,
      priceMin: priceMin ? Number(priceMin) : undefined,
      priceMax: priceMax ? Number(priceMax) : undefined,
      dealershipId: dealershipId || undefined,
      bodyType: bodyType || undefined,
      drivetrain: drivetrain || undefined,
      exteriorColor: exteriorColor || undefined,
      sort: sort || undefined,
    });
    // eslint-disable-next-line
  }, [dq, dvin, dmake, dmodel, yearMin, yearMax, priceMin, priceMax, dealershipId, bodyType, drivetrain, exteriorColor, sort]);

  function clearAll() {
    setQ(""); setVin(""); setMake(""); setModel("");
    setYearMin(""); setYearMax(""); setPriceMin(""); setPriceMax(""); setDealershipId("");
    setBodyType(""); setDrivetrain(""); setExteriorColor("");
    setSort("relevance");
    onChange({});
  }

  return (
    <div className="filters">
      <input
        aria-label="Search"
        placeholder="Search…"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      <input
        aria-label="VIN"
        placeholder="VIN"
        value={vin}
        onChange={e => setVin(e.target.value)}
      />
      <input
        aria-label="Make"
        placeholder="Make"
        value={make}
        onChange={e => setMake(e.target.value)}
      />
      <input
        aria-label="Model"
        placeholder="Model"
        value={model}
        onChange={e => setModel(e.target.value)}
      />
      <input
        aria-label="Body type"
        placeholder="Body type"
        value={bodyType}
        onChange={e => setBodyType(e.target.value)}
      />
      <input
        aria-label="Drivetrain"
        placeholder="Drivetrain"
        value={drivetrain}
        onChange={e => setDrivetrain(e.target.value)}
      />
      <input
        aria-label="Exterior color"
        placeholder="Exterior color"
        value={exteriorColor}
        onChange={e => setExteriorColor(e.target.value)}
      />
      <input
        aria-label="Year min"
        placeholder="Year min"
        value={yearMin}
        onChange={e => setYearMin(e.target.value)}
      />
      <input
        aria-label="Year max"
        placeholder="Year max"
        value={yearMax}
        onChange={e => setYearMax(e.target.value)}
      />
      <input
        aria-label="Price min"
        placeholder="Price min"
        value={priceMin}
        onChange={e => setPriceMin(e.target.value)}
      />
      <input
        aria-label="Price max"
        placeholder="Price max"
        value={priceMax}
        onChange={e => setPriceMax(e.target.value)}
      />
      <select
        aria-label="Dealership"
        value={dealershipId}
        onChange={e => setDealershipId(e.target.value)}
      >
        <option value="">Any dealership</option>
        {dealerships.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <select
        aria-label="Sort"
        value={sort}
        onChange={e => setSort(e.target.value)}
      >
        <option value="relevance">Sort: Relevance</option>
        <option value="manual_first">Sort: Manual transmission</option>
        <option value="price_asc">Sort: Price ↑</option>
        <option value="price_desc">Sort: Price ↓</option>
        <option value="year_desc">Sort: Year ↓</option>
        <option value="year_asc">Sort: Year ↑</option>
        <option value="mileage_asc">Sort: Mileage ↑</option>
        <option value="mileage_desc">Sort: Mileage ↓</option>
      </select>
      <button onClick={clearAll}>Clear</button>
    </div>
  );
}
