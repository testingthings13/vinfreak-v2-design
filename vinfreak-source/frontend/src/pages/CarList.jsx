import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getDealerships, fetchListings } from "../api";
import { normalizeCar } from "../utils/normalizeCar";
import useDebounce from "../utils/useDebounce";
import SearchBar from "../components/SearchBar";
import SortFilterBar from "../components/SortFilterBar";
import Pagination from "../components/Pagination";
import CarCard from "../components/CarCard";
import CarSkeletonGrid from "../components/CarSkeletonGrid";
import LoadingOverlay from "../components/LoadingOverlay";
import { useToast } from "../ToastContext";
import { sortCars } from "../utils/sortCars";

const PAGE_SIZE = 12;

export default function CarList() {
  const location = useLocation();
  const [raw, setRaw] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const { addToast } = useToast();
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 300);

  const [sort, setSort] = useState("recent");
  const [minYear, setMinYear] = useState(null);
  const [maxYear, setMaxYear] = useState(null);
  const [dealershipId, setDealershipId] = useState("");
  const [transmission, setTransmission] = useState("");
  const [dealerships, setDealerships] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");

  const [page, setPage] = useState(1);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const geoCache = useRef({ coords: null, key: null });
  const queryParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );
  const queryQ = queryParams.get("q") || "";
  const queryStatus = queryParams.get("status") || "";

  const trimmedQ = useMemo(() => dq.trim(), [dq]);

  const saleType = useMemo(() => {
    if (statusFilter === "live") return "auction";
    if (statusFilter === "nonauction") return "dealer";
    return null;
  }, [statusFilter]);
  const effectiveTransmission = sort === "manual_first" ? "Manual" : transmission;

  const geoSignature = useMemo(() => {
    if (sort !== "nearest") return null;
    return JSON.stringify({
      q: trimmedQ || null,
      minYear: minYear ?? null,
      maxYear: maxYear ?? null,
      transmission: transmission || null,
      dealershipId: dealershipId || null,
      saleType,
    });
  }, [sort, trimmedQ, minYear, maxYear, transmission, dealershipId, saleType]);

  useEffect(() => {
    if (sort !== "nearest") {
      geoCache.current = { coords: null, key: null };
    }
  }, [sort]);

  useEffect(() => {
    if (!queryQ) {
      setQ("");
      return;
    }
    setQ(queryQ);
  }, [queryQ]);

  useEffect(() => {
    if (!queryStatus) return;
    if (!["all", "live", "nonauction"].includes(queryStatus)) return;
    setStatusFilter(queryStatus);
  }, [queryStatus]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setHasError(false);

        const baseFilters = {};
        if (trimmedQ) baseFilters.q = trimmedQ;
        if (minYear != null) baseFilters.year_min = minYear;
        if (maxYear != null) baseFilters.year_max = maxYear;
        if (effectiveTransmission) baseFilters.transmission = effectiveTransmission;
        if (dealershipId) baseFilters.dealership_id = dealershipId;
        if (statusFilter === "live") baseFilters.status = "live";

        const dealerData = await getDealerships();
        if (!active) return;

        const dealerList = Array.isArray(dealerData)
          ? dealerData
          : dealerData?.items || dealerData?.results || [];
        const normalizedDealers = Array.isArray(dealerList)
          ? dealerList.filter((d) => d && typeof d === "object")
          : [];
        setDealerships(normalizedDealers);

        let coords = null;
        if (sort === "nearest") {
          const desiredKey = geoSignature || "__nearest__";
          if (
            geoCache.current.coords &&
            geoCache.current.key === desiredKey
          ) {
            coords = geoCache.current.coords;
          } else {
            try {
              const position = await new Promise((resolve, reject) => {
                if (typeof navigator === "undefined" || !navigator.geolocation) {
                  reject(new Error("Geolocation unavailable"));
                  return;
                }
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                  enableHighAccuracy: true,
                  timeout: 8000,
                });
              });
              if (!active) return;
              const nextCoords = {
                lat: Number(position.coords.latitude),
                lon: Number(position.coords.longitude),
              };
              coords = nextCoords;
              geoCache.current = { coords: nextCoords, key: desiredKey };
            } catch (geoError) {
              if (!active) return;
              setHasError(true);
              setRaw([]);
              setTotal(0);
              setPageSize(PAGE_SIZE);
              addToast(
                "Unable to access your location. Enable location permissions to use Nearest First.",
                "error"
              );
              return;
            }
          }
        }

        const params = { ...baseFilters };
        if (coords) {
          params.lat = coords.lat;
          params.lon = coords.lon;
        }

        const requestOffset = Math.max(page - 1, 0) * PAGE_SIZE;

        const requestSort = sort === "manual_first" ? "recent" : sort;
        const carData = await fetchListings({
          sort: requestSort,
          saleType,
          limit: PAGE_SIZE,
          offset: requestOffset,
          params,
        });
        if (!active) return;

        const dealerMap = Object.fromEntries(
          normalizedDealers
            .filter((d) => d && d.id != null)
            .map((d) => [d.id, d])
        );

        const items = Array.isArray(carData?.items)
          ? carData.items
          : Array.isArray(carData)
            ? carData
            : carData?.results || [];
        const normalized = items
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const base = normalizeCar(item);
            const resolvedDealership =
              dealerMap[item.dealership_id] ||
              base.dealership ||
              item.dealership ||
              null;
            return {
              ...base,
              dealership: resolvedDealership,
            };
          });
        setRaw(normalized);

        const totalValue =
          typeof carData?.total === "number" ? carData.total : normalized.length;
        setTotal(totalValue);

        const serverSize =
          carData?.page_size ?? carData?.pageSize ?? PAGE_SIZE;
        setPageSize(serverSize || PAGE_SIZE);
        setHasLoadedOnce(true);
      } catch (error) {
        if (!active) return;
        setHasError(true);
        setRaw([]);
        setTotal(0);
        addToast(String(error), "error");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    dealershipId,
    sort,
    trimmedQ,
    minYear,
    maxYear,
    effectiveTransmission,
    page,
    statusFilter,
    saleType,
    geoSignature,
    addToast,
  ]);

  const pageItems = useMemo(() => {
    const source = sort === "manual_first"
      ? raw.filter((car) => {
          const tag = String(car?.__transmission ?? "").trim().toLowerCase();
          if (tag === "manual") return true;
          const value = String(car?.transmission ?? "").trim().toLowerCase();
          return (
            value.includes("manual") ||
            value.includes("stick") ||
            value.includes("m/t") ||
            /\bmt\b/.test(value)
          );
        })
      : raw;
    return sortCars(source, sort);
  }, [raw, sort]);
  const visibleCount = pageItems.length;
  const serverCount = typeof total === "number" ? total : Number(total) || 0;
  const totalLabel = serverCount;
  const pageSizeToUse = pageSize || PAGE_SIZE;
  const paginationTotal = serverCount;
  const showPagination = paginationTotal > pageSizeToUse;

  useEffect(() => {
    setPage(1);
  }, [dq, minYear, maxYear, sort, dealershipId, transmission, statusFilter]);

  if (hasError && !hasLoadedOnce)
    return (
      <div className="state error">
        Unable to load cars right now. Please try again soon.
      </div>
    );

  if (hasError)
    return (
      <div className="state error">
        Unable to load cars right now. Please try again soon.
      </div>
    );

  return (
    <div className="wrap">
      {loading && hasLoadedOnce && <LoadingOverlay />}
      <div className="topbar">
        <SearchBar value={q} onChange={setQ} />
        <SortFilterBar
          sort={sort}
          setSort={setSort}
          minYear={minYear}
          setMinYear={setMinYear}
          maxYear={maxYear}
          setMaxYear={setMaxYear}
          transmission={transmission}
          setTransmission={setTransmission}
          dealershipId={dealershipId}
          setDealershipId={setDealershipId}
          dealerships={dealerships}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
      </div>

      <div className="meta">
        Showing {visibleCount} of {totalLabel} result{visibleCount === 1 ? "" : "s"}
      </div>

      <div className="results-area">
        {loading && !hasLoadedOnce ? (
          <CarSkeletonGrid count={pageSizeToUse} />
        ) : pageItems.length === 0 ? (
          <div className="state">No cars match your filters yet.</div>
        ) : (
          <>
            <div className="grid">
              {pageItems.map((car) => (
                <CarCard key={car.__id || car.id || car.vin} car={car} />
              ))}
            </div>
            {showPagination && (
              <Pagination
                page={page}
                setPage={setPage}
                total={paginationTotal}
                pageSize={pageSizeToUse}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
