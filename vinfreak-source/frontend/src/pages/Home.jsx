import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getCars, getDealerships, getMakes, API_BASE, lookupZip, lookupIp } from "../api";
import { normalizeCar } from "../utils/normalizeCar";
import { fmtNum, fmtMoney, fmtDate } from "../utils/text";
import { parseTimestamp } from "../utils/time";
import SearchBar from "../components/SearchBar";
import Facets from "../components/Facets";
import LocationFacet from "../components/LocationFacet";
import Chip from "../components/Chip";
import Pagination from "../components/Pagination";
import CarCard from "../components/CarCard";
import CarSkeletonGrid from "../components/CarSkeletonGrid";
import { SettingsContext } from "../App";
import { useToast } from "../ToastContext";
import { sortCars } from "../utils/sortCars";
import { isAuctionSource } from "../utils/isLiveAuction";
import { resolveListingDealership } from "../utils/dealerships";
import { useSeo } from "../utils/seo";

const SHOW_DEV_STATS = Boolean(
  import.meta.env.DEV || import.meta.env.VITE_SITE === "dev"
);

const FEATURE_DISABLED_VALUES = new Set(["0", "false", "no", "off"]);

const DEFAULT_LOCATION_RADIUS = 100;
const FRESH_AUCTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const FRESH_AUCTION_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_FRESH_AUCTION_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

const AUCTION_PRIORITY_PATTERNS = [
  "bring a trailer",
  "cars & bids",
  "cars and bids",
  "collecting cars",
  "rad for sale",
  "shiftgate",
];

const getAuctionPriority = (dealer) => {
  const candidates = [
    dealer?.displayName,
    dealer?.display_name,
    dealer?.short_name,
    dealer?.name,
    dealer?.slug,
  ]
    .map((value) => (typeof value === "string" ? value.toLowerCase() : ""))
    .filter(Boolean);
  for (const [index, pattern] of AUCTION_PRIORITY_PATTERNS.entries()) {
    if (candidates.some((candidate) => candidate === pattern || candidate.includes(pattern))) {
      return index;
    }
  }
  return Number.POSITIVE_INFINITY;
};

const normalizeFeatureEnabled = (value, defaultValue = false) => {
  if (typeof value === "boolean") return value;
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return defaultValue;
  return !FEATURE_DISABLED_VALUES.has(normalized);
};

const slugifyMakeSegment = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const parsePageFromSearch = (search) => {
  if (typeof search !== "string" || !search) return 1;
  const params = new URLSearchParams(search);
  const rawPage = params.get("page");
  if (!rawPage) return 1;
  const parsed = Number.parseInt(rawPage, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
};

const isAbortError = (error) =>
  Boolean(error && typeof error === "object" && error.name === "AbortError");
const CURSOR_SORTS = new Set(["relevance", "recent", "end_time_asc"]);
const MANUAL_TRANSMISSION_TAGS = new Set(["manual", "automatic"]);

export default function Home({ makeSlug = "", onPageChange = null, beforeSort = null } = {}) {
  const location = useLocation();
  const initialPage = useMemo(
    () => parsePageFromSearch(location.search),
    [location.search]
  );
  const settings = useContext(SettingsContext);
  const siteTitle = settings?.site_title || "VINFREAK";
  const siteTagline = settings?.site_tagline || "Discover performance & provenance";
  const normalizedRouteMakeSlug = useMemo(() => slugifyMakeSegment(makeSlug), [makeSlug]);
  const isMakeLanding = Boolean(normalizedRouteMakeSlug);
  const PAGE_SIZE = Number(settings.default_page_size) || 12;
  const dealerApplyUrl = "/dealership/apply";
  const dealerLoginUrl = useMemo(() => {
    const configured = settings?.dealer_login_url;
    if (typeof configured === "string" && configured.trim()) {
      return configured.trim();
    }
    return "https://admin.vinfreak.com/dealership/login";
  }, [settings?.dealer_login_url]);
  const brandFilterMakeIds = useMemo(() => {
    const raw = settings?.brand_filter_make_ids;
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((id) => {
          if (typeof id === "number") return String(id);
          if (typeof id === "string") return id.trim();
          return "";
        })
        .filter(Boolean);
    }
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .map((id) => {
              if (typeof id === "number") return String(id);
              if (typeof id === "string") return id.trim();
              return "";
            })
            .filter(Boolean);
        }
      } catch {
        return raw
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
      }
    }
    return [];
  }, [settings?.brand_filter_make_ids]);
  const brandFilterSet = useMemo(() => {
    const set = new Set();
    for (const id of brandFilterMakeIds) {
      const str = String(id).trim();
      if (!str) continue;
      set.add(str);
      set.add(str.toLowerCase());
    }
    return set;
  }, [brandFilterMakeIds]);
  const topFiltersEnabled = normalizeFeatureEnabled(
    settings?.home_top_filters_enabled,
    false
  );
  const makeFilterEnabled = topFiltersEnabled && normalizeFeatureEnabled(
    settings?.home_make_filter_enabled,
    false
  );
  const dealershipFilterEnabled = topFiltersEnabled && normalizeFeatureEnabled(
    settings?.home_dealership_filter_enabled,
    false
  );
  const inventoryTypePillsEnabled = topFiltersEnabled && normalizeFeatureEnabled(
    settings?.home_inventory_type_pills_enabled,
    false
  );
  const sortLabelEnabled = normalizeFeatureEnabled(
    settings?.home_sort_label_enabled,
    false
  );
  const filterCountsEnabled = normalizeFeatureEnabled(
    settings?.home_filter_counts_enabled,
    false
  );
  const footerPanelsEnabled = normalizeFeatureEnabled(
    settings?.home_footer_panels_enabled,
    false
  );
  const freshAuctionRailEnabled = normalizeFeatureEnabled(
    settings?.home_new_listing_badge_enabled,
    true
  );

  const [raw, setRaw] = useState([]);
  const [freshAuctionSource, setFreshAuctionSource] = useState([]);
  const [total, setTotal] = useState(0);
  const [serverPageSize, setServerPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(true);
  const carsFetchSeqRef = useRef(0);
  const [hasError, setHasError] = useState(false);
  const { addToast } = useToast();

  const [q, setQ] = useState("");
  const [sort, setSort] = useState("relevance");
  const [transmission, setTransmission] = useState("");
  const [dealershipId, setDealershipId] = useState("");
  const [dealerships, setDealerships] = useState([]);
  const [makeLookup, setMakeLookup] = useState({});
  const [makes, setMakes] = useState([]);
  const [selectedMakeId, setSelectedMakeId] = useState("");
  const [isMakeDropdownOpen, setIsMakeDropdownOpen] = useState(false);
  const [isSourceDropdownOpen, setIsSourceDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef(null);
  const sourceDropdownRef = useRef(null);
  const makeDropdownRef = useRef(null);
  const prevSelectedMakeIdRef = useRef(selectedMakeId);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dealerCTAOpen, setDealerCTAOpen] = useState(false);
  const freshAuctionRailRef = useRef(null);
  const [freshRailCanScrollBack, setFreshRailCanScrollBack] = useState(false);
  const [freshRailCanScrollForward, setFreshRailCanScrollForward] = useState(false);

  const [zipInput, setZipInput] = useState("");
  const [locationFilter, setLocationFilter] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationError, setLocationError] = useState("");

  const [autoCoords, setAutoCoords] = useState(null);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const [geoStatus, setGeoStatus] = useState("idle");
  const [geoError, setGeoError] = useState("");
  const ipLookupRan = useRef(false);
  const hasUserCoordsRef = useRef(false);
  const locationFilterRef = useRef(null);

  const [page, setPage] = useState(initialPage);
  const [paginationStrategy, setPaginationStrategy] = useState(
    initialPage > 1 ? "offset" : "cursor"
  );
  const [pageCursors, setPageCursors] = useState([null]);
  const backgroundRefreshRef = useRef(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const hasMountedPageResetRef = useRef(false);

  const hasUserCoords =
    userCoords && userCoords.lat != null && userCoords.lng != null;
  const hasAutoCoords =
    autoCoords && autoCoords.lat != null && autoCoords.lng != null;
  const dealershipsRef = useRef(dealerships);
  const makeLookupRef = useRef(makeLookup);
  const resolvedDealershipFilterId = useMemo(() => {
    if (dealershipId != null && String(dealershipId).trim() !== "") {
      return String(dealershipId);
    }
    return "";
  }, [dealershipId]);
  const nearestStatusForFacets = useMemo(() => {
    if (locationFilter) return "manual";
    if (geoStatus === "ip_lookup") return "requesting";
    if (geoStatus === "ip") return "ip";
    return geoStatus;
  }, [locationFilter, geoStatus]);
  const canUseNearest = nearestStatusForFacets !== "unsupported";
  const nearestLabelOverride = useMemo(() => {
    if (locationFilter || autoCoords) {
      return "Nearest to me";
    }
    return undefined;
  }, [autoCoords, locationFilter]);
  const nearestLabel = useMemo(() => {
    if (nearestLabelOverride) return nearestLabelOverride;
    switch (nearestStatusForFacets) {
      case "requesting":
        return "Nearest to me (locating…)";
      case "denied":
        return "Nearest to me (enable location)";
      case "unsupported":
        return "Nearest to me (unsupported)";
      case "ip":
        return "Nearest to me (auto)";
      case "manual":
        return "Nearest to me (ZIP applied)";
      default:
        return "Nearest to me";
    }
  }, [nearestLabelOverride, nearestStatusForFacets]);
  const locationPreference = useMemo(() => {
    const source = locationFilter ?? autoCoords ?? null;
    if (!source) {
      return { state: null, city: null, postalCode: null };
    }
    const state =
      typeof source.state === "string" && source.state.trim()
        ? source.state.trim()
        : null;
    const city =
      typeof source.city === "string" && source.city.trim()
        ? source.city.trim()
        : null;
    const postalCode =
      typeof source.postalCode === "string" && source.postalCode.trim()
        ? source.postalCode.trim()
        : null;
    return { state, city, postalCode };
  }, [
    locationFilter?.state,
    locationFilter?.city,
    locationFilter?.postalCode,
    autoCoords?.state,
    autoCoords?.city,
    autoCoords?.postalCode,
    locationFilter,
    autoCoords,
  ]);
  const nearestDistanceReferenceLabel = useMemo(() => {
    const area = [locationPreference.city, locationPreference.state]
      .filter(Boolean)
      .join(", ");
    if (area) return area;
    if (locationPreference.postalCode) {
      return `ZIP ${locationPreference.postalCode}`;
    }
    return "your area";
  }, [
    locationPreference.city,
    locationPreference.state,
    locationPreference.postalCode,
  ]);
  const locationFocusPlaceholder = useMemo(() => {
    const baseZip = locationPreference.postalCode;
    if (baseZip) {
      return `${baseZip} or enter another ZIP code`;
    }
    return "92618 or enter another ZIP code";
  }, [locationPreference.postalCode]);
  const distanceSortDescription = useMemo(() => {
    if (nearestLabelOverride) {
      return "Cars closest to this area appear first.";
    }
    switch (nearestStatusForFacets) {
      case "requesting":
        return "Detecting your location to sort by distance.";
      case "denied":
        return "Enable location access to unlock distance sorting.";
      case "unsupported":
        return "Distance sorting is unavailable right now.";
      case "manual":
        return "Cars near your selected ZIP appear first.";
      case "ip":
        return "Cars closest to your detected location appear first.";
      default:
        return "Cars closest to you appear first.";
    }
  }, [nearestLabelOverride, nearestStatusForFacets]);
  const sortChoices = useMemo(
    () => [
      {
        value: "relevance",
        label: "Recommended",
        description: "Highlights listings that are trending and relevant to you.",
      },
      {
        value: "recent",
        label: "New listings",
        description: "Shows the newest inventory updates first.",
      },
      {
        value: "nearest",
        label: nearestLabel,
        description: distanceSortDescription,
        disabled: !canUseNearest && sort !== "nearest",
      },
      {
        value: "pca",
        label: "PCA",
        description: "Shows PCA listings only.",
      },
      {
        value: "fbm",
        label: "FB Marketplace",
        description: "Shows FB Marketplace listings only.",
      },
      {
        value: "manual_first",
        label: "Manual transmission",
        description: "Prioritizes listings with manual gearboxes.",
      },
      {
        value: "end_time_asc",
        label: "Auctions ending soonest",
        description: "Auctions with the least time remaining rise to the top.",
      },
      {
        value: "price_desc",
        label: "Price: High to low",
        description: "Start with the most premium builds on the market.",
      },
      {
        value: "price_asc",
        label: "Price: Low to high",
        description: "Great for spotting entry-level deals first.",
      },
      {
        value: "year_desc",
        label: "Year: Newest first",
        description: "Showcases the latest model years up top.",
      },
      {
        value: "year_asc",
        label: "Year: Oldest first",
        description: "Perfect when you're searching for classics.",
      },
      {
        value: "mileage_asc",
        label: "Mileage: Low to high",
        description: "Puts the lowest odometer readings front and center.",
      },
      {
        value: "mileage_desc",
        label: "Mileage: High to low",
        description: "Ideal for finding well-traveled drivers first.",
      },
    ],
    [canUseNearest, distanceSortDescription, nearestLabel, sort]
  );
  const sortChoiceMap = useMemo(
    () => Object.fromEntries(sortChoices.map((option) => [option.value, option])),
    [sortChoices]
  );
  const activeSortChoice = sortChoiceMap[sort] || {
    value: sort,
    label: "Custom order",
    description: undefined,
  };
  const locationButtonLabel =
    locationStatus === "loading"
      ? "Locating…"
      : locationFilter
        ? "Update ZIP code"
        : "Find nearby";
  const effectiveTransmission = sort === "manual_first" ? "Manual" : transmission;
  const cursorPaginationEligible = useMemo(() => {
    if (!CURSOR_SORTS.has(sort)) return false;
    const normalizedTransmission = String(effectiveTransmission || "")
      .trim()
      .toLowerCase();
    if (MANUAL_TRANSMISSION_TAGS.has(normalizedTransmission)) return false;
    return true;
  }, [sort, effectiveTransmission]);
  const isCursorPaginationActive =
    cursorPaginationEligible && paginationStrategy === "cursor";
  const currentCursorToken = isCursorPaginationActive
    ? page <= 1
      ? null
      : pageCursors[page - 1] ?? null
    : null;
  const nextPageCursorToken = isCursorPaginationActive
    ? pageCursors[page] ?? null
    : null;
  const canCursorGoPrev = isCursorPaginationActive && page > 1;
  const canCursorGoNext = isCursorPaginationActive && Boolean(nextPageCursorToken);

  useEffect(() => {
    hasUserCoordsRef.current = hasUserCoords;
  }, [hasUserCoords]);

  useEffect(() => {
    locationFilterRef.current = locationFilter;
  }, [locationFilter]);

  useEffect(() => {
    dealershipsRef.current = dealerships;
  }, [dealerships]);

  useEffect(() => {
    makeLookupRef.current = makeLookup;
  }, [makeLookup]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      backgroundRefreshRef.current = true;
      setRefreshTick((tick) => tick + 1);
    }, 30000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleFocus = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      backgroundRefreshRef.current = true;
      setRefreshTick((tick) => tick + 1);
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [dealerData, makeData] = await Promise.all([
          getDealerships(),
          getMakes(),
        ]);
        if (!active) return;
        const dealerList = Array.isArray(dealerData)
          ? dealerData
          : dealerData?.items || dealerData?.results || [];
        const toAbsolute = (url) => {
          if (typeof url !== "string" || !url) return url ?? null;
          if (url.startsWith("http") || url.startsWith("data:")) return url;
          return `${API_BASE}${url.startsWith("/") ? url : "/" + url}`;
        };
        const makeListRaw = Array.isArray(makeData)
          ? makeData
          : makeData?.items || makeData?.results || [];
        const makeList = (Array.isArray(makeListRaw) ? makeListRaw : [])
          .filter((m) => m && typeof m === "object")
          .map((m) => ({ ...m, logo_url: toAbsolute(m.logo_url) }));
        const makeMap = Object.fromEntries(
          makeList.map((m) => [m.id, m])
        );
        const dealerListNormalized = (Array.isArray(dealerList)
          ? dealerList
          : []
        )
          .filter((dealer) => dealer && typeof dealer === "object")
          .map((dealer) => {
            const logoCandidates = [
              dealer.logo_url,
              dealer.logo,
              dealer.icon_url,
              dealer.icon,
            ];
            let resolvedLogo = null;
            for (const candidate of logoCandidates) {
              if (typeof candidate !== "string") continue;
              const trimmed = candidate.trim();
              if (!trimmed) continue;
              resolvedLogo = toAbsolute(trimmed);
              break;
            }
            return {
              ...dealer,
              resolvedLogoUrl: resolvedLogo,
            };
          });
        setDealerships(dealerListNormalized);
        setMakeLookup(makeMap);
        setMakes(makeList);
      } catch (e) {
        if (!active) return;
        setHasError(true);
        addToast(String(e), "error");
      }
    })();
    return () => {
      active = false;
    };
  }, [addToast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ipLookupRan.current) return;
    if (locationFilter || hasUserCoords) return;
    ipLookupRan.current = true;
    let cancelled = false;
    (async () => {
      try {
        setGeoStatus((prev) => {
          if (["manual", "granted", "denied", "unsupported"].includes(prev)) {
            return prev;
          }
          return "ip_lookup";
        });
        const info = await lookupIp();
        if (cancelled) return;
        const lat = Number(info?.latitude ?? info?.lat ?? info?.location?.lat);
        const lng = Number(info?.longitude ?? info?.lng ?? info?.location?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error("IP lookup did not return coordinates");
        }
        const city =
          typeof info?.city === "string" ? info.city.trim() || null : null;
        const stateRaw =
          typeof info?.state === "string"
            ? info.state
            : typeof info?.region === "string"
              ? info.region
              : null;
        const stateValue =
          typeof stateRaw === "string" ? stateRaw.trim() || null : null;
        const postalRaw =
          typeof info?.postal_code === "string"
            ? info.postal_code
            : typeof info?.postal === "string"
              ? info.postal
              : null;
        const postalCode =
          typeof postalRaw === "string" ? postalRaw.trim() || null : null;
        const countryRaw =
          typeof info?.country === "string"
            ? info.country
            : typeof info?.country_name === "string"
              ? info.country_name
              : null;
        const countryValue =
          typeof countryRaw === "string" ? countryRaw.trim() || null : null;
        const normalized = {
          lat,
          lng,
          city,
          state: stateValue,
          postalCode,
          country: countryValue,
          source: typeof info?.source === "string" ? info.source : "ip",
        };
        setAutoCoords((prev) => {
          if (prev && typeof prev === "object" && prev.source === "geolocation") {
            return {
              ...prev,
              city: prev.city ?? normalized.city,
              state: prev.state ?? normalized.state,
              postalCode: prev.postalCode ?? normalized.postalCode,
              country: prev.country ?? normalized.country,
            };
          }
          return normalized;
        });
        if (locationFilterRef.current) return;
        if (!hasUserCoordsRef.current) {
          setUserCoords({ lat, lng });
          setGeoStatus("ip");
          setGeoError("");
        }
      } catch (err) {
        if (cancelled) return;
        setGeoStatus((prev) => (prev === "manual" ? prev : "idle"));
        if (err instanceof Error) {
          setGeoError(err.message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationFilter, hasUserCoords]);

  useEffect(() => {
    if (sort !== "nearest") return;
    if (hasUserCoords) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("unsupported");
      if (!geoError) setGeoError("Geolocation is not supported in this browser.");
      return;
    }
    let cancelled = false;
    setGeoStatus((prev) => (prev === "granted" ? prev : "requesting"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setGeoStatus("granted");
        setGeoError("");
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setAutoCoords((prev) => ({
          ...(prev && typeof prev === "object" ? prev : {}),
          lat,
          lng,
          source: "geolocation",
        }));
        setUserCoords({ lat, lng });
      },
      (err) => {
        if (cancelled) return;
        setGeoStatus("denied");
        setGeoError(err?.message || "Location access denied");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
    return () => {
      cancelled = true;
    };
  }, [sort, hasUserCoords]);

  const handleLocationSubmit = useCallback(
    async (event) => {
      event?.preventDefault?.();
      const trimmedZip = zipInput.trim();
      if (!trimmedZip) {
        setLocationError("Enter a ZIP code to find nearby cars.");
        setLocationStatus("error");
        return;
      }
      const safeRadius = DEFAULT_LOCATION_RADIUS;
      setLocationStatus("loading");
      setLocationError("");
      try {
        const lookup = await lookupZip(trimmedZip);
        const lat = Number(lookup?.latitude);
        const lng = Number(lookup?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error("ZIP code is missing coordinate data");
        }
        const normalizedZip = String(lookup?.postal_code || trimmedZip);
        const city = typeof lookup?.city === "string" ? lookup.city : "";
        const state = typeof lookup?.state === "string" ? lookup.state : "";
        setUserCoords({ lat, lng });
        setGeoStatus("manual");
        setGeoError("");
        setLocationFilter({
          postalCode: normalizedZip,
          city: city || null,
          state: state || null,
          lat,
          lng,
          radius: safeRadius,
        });
        setZipInput("");
        setLocationStatus("ready");
        setSort("nearest");
        setPage(1);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes("404")) {
          setLocationError("ZIP code not found");
        } else {
          setLocationError(message || "Unable to resolve ZIP code");
        }
        setLocationStatus("error");
      }
    },
    [zipInput]
  );

  const clearManualLocation = useCallback(() => {
    setLocationFilter(null);
    setLocationStatus("idle");
    setLocationError("");
    if (geoStatus === "manual") {
      if (hasAutoCoords) {
        setGeoStatus(autoCoords?.source === "geolocation" ? "granted" : "ip");
        setGeoError("");
        setUserCoords({ lat: autoCoords.lat, lng: autoCoords.lng });
        setZipInput("");
      } else {
        setGeoStatus("idle");
        setGeoError("");
        setUserCoords({ lat: null, lng: null });
        if (sort === "nearest") {
          setSort("relevance");
        }
      }
    } else if (!hasUserCoords && !hasAutoCoords && sort === "nearest") {
      setSort("relevance");
    }
    setPage(1);
  }, [geoStatus, sort, hasAutoCoords, autoCoords, hasUserCoords]);

  useEffect(() => {
    if (sort === "nearest" && nearestStatusForFacets === "unsupported" && !locationFilter) {
      setSort("relevance");
    }
  }, [sort, nearestStatusForFacets, locationFilter]);

  useEffect(() => {
    if (geoStatus === "denied" && geoError) {
      addToast(`Location unavailable: ${geoError}`, "error");
    }
  }, [geoStatus, geoError, addToast]);

  useEffect(() => {
    if (!isMakeDropdownOpen) return undefined;
    const handleClick = (event) => {
      if (!makeDropdownRef.current) return;
      if (makeDropdownRef.current.contains(event.target)) return;
      setIsMakeDropdownOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setIsMakeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isMakeDropdownOpen]);

  useEffect(() => {
    const prevSelectedMakeId = prevSelectedMakeIdRef.current;
    if (
      isMakeDropdownOpen &&
      prevSelectedMakeId !== selectedMakeId
    ) {
      setIsMakeDropdownOpen(false);
    }
    prevSelectedMakeIdRef.current = selectedMakeId;
  }, [selectedMakeId, isMakeDropdownOpen]);

  useEffect(() => {
    if (!isSourceDropdownOpen) return undefined;
    const handleClick = (event) => {
      if (!sourceDropdownRef.current) return;
      if (sourceDropdownRef.current.contains(event.target)) return;
      setIsSourceDropdownOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setIsSourceDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isSourceDropdownOpen]);

  useEffect(() => {
    if (!isSortDropdownOpen) return undefined;
    const handleClick = (event) => {
      if (!sortDropdownRef.current) return;
      if (sortDropdownRef.current.contains(event.target)) return;
      setIsSortDropdownOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setIsSortDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isSortDropdownOpen]);

  useEffect(() => {
    setIsSortDropdownOpen(false);
  }, [sort]);

  const kpis = useMemo(() => {
    if (!raw.length && !total) return null;
    const prices = raw
      .map(c => c.__price)
      .filter(x => x != null && !isNaN(Number(x)));
    const avg = prices.length ? (prices.reduce((a, b) => a + Number(b), 0) / prices.length) : null;
    let latestTs = 0;
    for (const car of raw) {
      const candidate = car?.posted_at ?? car?.created_at ?? car?.updated_at ?? null;
      if (!candidate) continue;
      let ts;
      if (typeof candidate === "number") {
        ts = candidate > 1e12 ? candidate : candidate * 1000;
      } else {
        ts = Date.parse(candidate);
      }
      if (!Number.isNaN(ts) && ts > latestTs) {
        latestTs = ts;
      }
    }
    const latest = latestTs ? new Date(latestTs).toISOString() : null;
    const makeCount = Object.keys(makeLookup || {}).length;
    const totalCars = typeof total === "number" ? total : raw.length;
    return { total: totalCars, avgPrice: avg, latest, makeCount };
  }, [raw, makeLookup, total]);

  const makeOptions = useMemo(() => {
    const list = Array.isArray(makes) ? makes : [];
    const restrictBrands = brandFilterMakeIds.length > 0;
    const orderMap = new Map();
    if (restrictBrands) {
      brandFilterMakeIds.forEach((rawId, index) => {
        const id = typeof rawId === "number" ? String(rawId) : String(rawId || "").trim();
        if (!id) return;
        const lower = id.toLowerCase();
        if (!orderMap.has(id)) orderMap.set(id, index);
        if (!orderMap.has(lower)) orderMap.set(lower, index);
      });
    }
    return list
      .filter((make) => make && typeof make === "object")
      .map((make, index) => {
        const name = typeof make.name === "string" ? make.name : "";
        const lowerName = name.toLowerCase();
        const initials = name
          .split(/\s+/)
          .map((part) => (part && part[0] ? part[0] : ""))
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase();
        let count = null;
        if (typeof make.car_count === "number") {
          count = Number.isFinite(make.car_count) ? make.car_count : null;
        } else if (typeof make.car_count === "string" && make.car_count.trim() !== "") {
          const parsed = Number(make.car_count);
          count = Number.isNaN(parsed) ? null : parsed;
        }
        const safeTotal = typeof count === "number" && Number.isFinite(count) ? count : 0;
        const idStr = make.id != null ? String(make.id) : (lowerName || `idx:${index}`);
        const orderIndex =
          restrictBrands
            ? orderMap.get(idStr) ?? orderMap.get(lowerName) ?? Number.POSITIVE_INFINITY
            : index;
        return {
          ...make,
          idStr,
          lowerName,
          car_count: safeTotal,
          initials: initials || "–",
          orderIndex,
        };
      })
      .filter((make) => make.car_count > 0)
      .filter((make) => {
        if (!restrictBrands) return true;
        if (make.idStr && brandFilterSet.has(make.idStr)) return true;
        if (make.lowerName && brandFilterSet.has(make.lowerName)) return true;
        return false;
      })
      .sort((a, b) => {
        if (restrictBrands) {
          if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
        } else if (b.car_count !== a.car_count) {
          return b.car_count - a.car_count;
        }
        if (b.car_count !== a.car_count) return b.car_count - a.car_count;
        return a.lowerName.localeCompare(b.lowerName);
      });
  }, [makes, brandFilterMakeIds, brandFilterSet]);

  const sourceOptions = useMemo(() => {
    const list = Array.isArray(dealerships) ? dealerships : [];
    const seen = new Set();
    return list
      .filter((dealer) => dealer && typeof dealer === "object" && dealer.id != null)
      .map((dealer) => {
        const idStr = String(dealer.id);
        const name =
          dealer.display_name ||
          dealer.short_name ||
          dealer.name ||
          dealer.slug ||
          "Unknown source";
        const initials = name
          .split(/\s+/)
          .map((part) => (part && part[0] ? part[0] : ""))
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase();
        const countCandidates = [
          dealer.inventory_count,
          dealer.car_count,
          dealer.listing_count,
        ];
        let count = null;
        for (const candidate of countCandidates) {
          if (candidate == null) continue;
          const numeric =
            typeof candidate === "number"
              ? candidate
              : typeof candidate === "string" && candidate.trim() !== ""
                ? Number(candidate)
                : null;
          if (numeric != null && Number.isFinite(numeric)) {
            count = numeric;
            break;
          }
        }
        const locationCandidates = [
          dealer.location,
          dealer.location_address,
          dealer.address,
          dealer.city && dealer.state ? `${dealer.city}, ${dealer.state}` : null,
          dealer.city,
          dealer.state,
        ];
        const displayLocation = locationCandidates
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .find((value) => value);
        return {
          ...dealer,
          idStr,
          displayName: name,
          listingCount: count,
          logoUrl:
            typeof dealer.resolvedLogoUrl === "string" && dealer.resolvedLogoUrl
              ? dealer.resolvedLogoUrl
              : null,
          initials,
          displayLocation: displayLocation || null,
          auctionPriority: getAuctionPriority({ ...dealer, displayName: name }),
        };
      })
      .filter((dealer) => {
        if (!dealer?.idStr) return false;
        if (seen.has(dealer.idStr)) return false;
        seen.add(dealer.idStr);
        return true;
      })
      .sort((a, b) => {
        if (a.auctionPriority !== b.auctionPriority) {
          return a.auctionPriority - b.auctionPriority;
        }
        if (a.listingCount != null && b.listingCount != null && b.listingCount !== a.listingCount) {
          return b.listingCount - a.listingCount;
        }
        return a.displayName.localeCompare(b.displayName);
      })
      .map(({ auctionPriority, ...dealer }) => dealer);
  }, [dealerships]);

  const selectedSource = useMemo(() => {
    if (!dealershipId) return null;
    const idStr = String(dealershipId);
    return sourceOptions.find((dealer) => dealer.idStr === idStr) || null;
  }, [dealershipId, sourceOptions]);

  const selectedMake = useMemo(() => {
    if (!selectedMakeId) return null;
    return makeOptions.find((m) => m.idStr === selectedMakeId) || null;
  }, [selectedMakeId, makeOptions]);

  const selectedMakeName = selectedMake?.name ?? "";
  const selectedMakeSlug = slugifyMakeSegment(selectedMakeName);
  const selectedMakeLowerName = selectedMakeName.toLowerCase();
  const selectedMakeNumericId = selectedMake?.id != null ? String(selectedMake.id) : "";
  const makeLandingResolved = !isMakeLanding || (
    Boolean(selectedMakeSlug) && selectedMakeSlug === normalizedRouteMakeSlug
  );

  useEffect(() => {
    if (!normalizedRouteMakeSlug) return;
    const matched = makeOptions.find((option) => {
      if (!option) return false;
      if (option.idStr === normalizedRouteMakeSlug) return true;
      return slugifyMakeSegment(option.name) === normalizedRouteMakeSlug;
    });
    if (matched) {
      if (matched.idStr !== selectedMakeId) {
        setSelectedMakeId(matched.idStr);
      }
      return;
    }
    if (selectedMakeId) {
      setSelectedMakeId("");
    }
  }, [normalizedRouteMakeSlug, makeOptions, selectedMakeId]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const requestSeq = carsFetchSeqRef.current + 1;
    carsFetchSeqRef.current = requestSeq;
    let disposed = false;
    const isBackgroundRefresh = backgroundRefreshRef.current;
    const startedWhileLoading = loadingRef.current;
    const shouldUseCursorPagination =
      isCursorPaginationActive && (page <= 1 || Boolean(currentCursorToken));
    backgroundRefreshRef.current = false;
    (async () => {
      try {
        if (!isBackgroundRefresh) {
          setLoading(true);
          setHasError(false);
        }
        const filters = {};
        const trimmedQ = q.trim();
        if (trimmedQ) filters.q = trimmedQ;
        if (effectiveTransmission) filters.transmission = effectiveTransmission;
        if (resolvedDealershipFilterId) {
          filters.dealershipId = resolvedDealershipFilterId;
        }
        if (selectedMake?.id != null) {
          filters.make = String(selectedMake.id);
        } else if (selectedMakeName) {
          filters.make = selectedMakeName;
        }
        if (sort) {
          filters.sort =
            sort === "fbm" || sort === "pca" || sort === "manual_first" ? "recent" : sort;
        }
        if (statusFilter === "live") {
          filters.status = "live";
          filters.saleType = "auction";
        } else if (statusFilter === "nonauction") {
          filters.status = "live";
          filters.saleType = "dealer";
        } else if (statusFilter === "fbm") {
          filters.source = "facebook_marketplace";
        }
        if (sort === "fbm") {
          filters.source = "facebook_marketplace";
        } else if (sort === "pca") {
          filters.source = "pca";
        }
        if (locationFilter) {
          filters.lat = locationFilter.lat;
          filters.lng = locationFilter.lng;
          if (locationFilter.radius != null) {
            filters.maxDistance = locationFilter.radius;
          }
        } else if (sort === "nearest" && hasUserCoords) {
          filters.lat = userCoords.lat;
          filters.lng = userCoords.lng;
        }
        const paging = shouldUseCursorPagination
          ? {
              limit: PAGE_SIZE,
              cursor: currentCursorToken || undefined,
              cursorMode: true,
            }
          : { page, pageSize: PAGE_SIZE };
        const response = await getCars(
          filters,
          paging
        );
        if (disposed || carsFetchSeqRef.current !== requestSeq) return;
        const items = Array.isArray(response?.items)
          ? response.items
          : Array.isArray(response)
            ? response
            : response?.results || [];
        const dealerMap = Object.fromEntries(
          (Array.isArray(dealershipsRef.current) ? dealershipsRef.current : []).map((d) => [d.id, d])
        );
        const normalized = items
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const base = normalizeCar(item, { makeLookup: makeLookupRef.current });
            const dealership = resolveListingDealership(base, {
              mappedDealership: dealerMap[item.dealership_id] || null,
              rawDealership: item?.dealership || null,
            });
            return {
              ...base,
              dealership,
            };
          });
        setRaw(normalized);
        if (shouldUseCursorPagination && response?.cursorMode) {
          const nextCursorToken = response?.nextCursor || null;
          setPaginationStrategy("cursor");
          setPageCursors((prev) => {
            const next = prev.slice(0, page);
            if (nextCursorToken) {
              next[page] = nextCursorToken;
            }
            return next;
          });
        } else if (isCursorPaginationActive) {
          setPaginationStrategy("offset");
          setPageCursors([null]);
        }
        const totalValue =
          typeof response?.total === "number"
            ? response.total
            : shouldUseCursorPagination && response?.cursorMode
              ? null
              : normalized.length;
        setTotal(totalValue);
        const serverSize = response?.pageSize ?? response?.page_size ?? PAGE_SIZE;
        setServerPageSize(serverSize || PAGE_SIZE);
      } catch (e) {
        if (
          disposed ||
          isAbortError(e) ||
          carsFetchSeqRef.current !== requestSeq
        ) {
          return;
        }
        if (!isBackgroundRefresh) {
          setHasError(true);
          setRaw([]);
          setTotal(0);
        }
        addToast(String(e), "error");
      } finally {
        if (disposed) return;
        if (
          carsFetchSeqRef.current === requestSeq &&
          (!isBackgroundRefresh || startedWhileLoading)
        ) {
          setLoading(false);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [
    page,
    q,
    effectiveTransmission,
    selectedMakeId,
    selectedMakeName,
    sort,
    statusFilter,
    resolvedDealershipFilterId,
    hasUserCoords,
    userCoords.lat,
    userCoords.lng,
    locationFilter?.lat,
    locationFilter?.lng,
    locationFilter?.radius,
    PAGE_SIZE,
    addToast,
    refreshTick,
    isCursorPaginationActive,
    currentCursorToken,
  ]);

  useEffect(() => {
    let active = true;
    if (!freshAuctionRailEnabled || statusFilter === "nonauction" || statusFilter === "fbm") {
      setFreshAuctionSource([]);
      return () => {
        active = false;
      };
    }

    (async () => {
      try {
        const filters = {
          sort: "recent",
          status: "live",
          saleType: "auction",
          freshHours: 24,
        };
        const trimmedQ = q.trim();
        if (trimmedQ) filters.q = trimmedQ;
        if (effectiveTransmission) filters.transmission = effectiveTransmission;
        if (resolvedDealershipFilterId) {
          filters.dealershipId = resolvedDealershipFilterId;
        }
        if (selectedMake?.id != null) {
          filters.make = String(selectedMake.id);
        } else if (selectedMakeName) {
          filters.make = selectedMakeName;
        }
        if (locationFilter) {
          filters.lat = locationFilter.lat;
          filters.lng = locationFilter.lng;
          if (locationFilter.radius != null) {
            filters.maxDistance = locationFilter.radius;
          }
        } else if (sort === "nearest" && hasUserCoords) {
          filters.lat = userCoords.lat;
          filters.lng = userCoords.lng;
        }

        const response = await getCars(filters, { page: 1, pageSize: 72 });
        if (!active) return;

        const items = Array.isArray(response?.items)
          ? response.items
          : Array.isArray(response)
            ? response
            : response?.results || [];
        const dealerMap = Object.fromEntries(
          (Array.isArray(dealershipsRef.current) ? dealershipsRef.current : []).map((d) => [d.id, d])
        );
        const normalized = items
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const base = normalizeCar(item, { makeLookup: makeLookupRef.current });
            const dealership = resolveListingDealership(base, {
              mappedDealership: dealerMap[item.dealership_id] || null,
              rawDealership: item?.dealership || null,
            });
            return {
              ...base,
              dealership,
            };
          });
        setFreshAuctionSource(normalized);
      } catch {
        if (!active) return;
        setFreshAuctionSource([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    q,
    effectiveTransmission,
    selectedMakeId,
    selectedMakeName,
    sort,
    statusFilter,
    resolvedDealershipFilterId,
    hasUserCoords,
    userCoords.lat,
    userCoords.lng,
    locationFilter?.lat,
    locationFilter?.lng,
    locationFilter?.radius,
    refreshTick,
    freshAuctionRailEnabled,
  ]);

  useEffect(() => {
    if (selectedMakeId && !makeOptions.some(m => m.idStr === selectedMakeId)) {
      setSelectedMakeId("");
    }
  }, [selectedMakeId, makeOptions]);

  useEffect(() => {
    if (!dealershipId) return;
    const exists = sourceOptions.some((dealer) => dealer.idStr === String(dealershipId));
    if (!exists) {
      setDealershipId("");
    }
  }, [dealershipId, sourceOptions]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    const byText = (c) => {
      if (!text) return true;
      const hay = [
        c.__title, c.__make, c.__model, c.__trim, c.__location, c.vin, c.lot_number, c.dealership?.name
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(text);
    };
    const byDealer = (c) =>
      resolvedDealershipFilterId
        ? String(c.dealership?.id ?? "") === resolvedDealershipFilterId
        : true;
    const byTransmission = (c) => {
      if (!effectiveTransmission) return true;
      return (c.__transmission ?? null) === effectiveTransmission;
    };
    const byMake = (c) => {
      if (!selectedMakeId) return true;
      const carMakeId = c?.make_rel?.id ?? c?.make_id ?? null;
      if (selectedMakeNumericId && carMakeId != null && String(carMakeId) === selectedMakeNumericId) {
        return true;
      }
      if (!selectedMakeLowerName) return false;
      const carName = (c?.make_rel?.name ?? c?.make ?? c?.__make ?? "").toLowerCase();
      return carName === selectedMakeLowerName;
    };
    // The backend already applies inventory type/status filters. Re-filtering
    // client-side caused valid paginated results to disappear on later pages.
    return raw.filter(c => byText(c) && byDealer(c) && byTransmission(c) && byMake(c));
  }, [
    raw,
    q,
    effectiveTransmission,
    resolvedDealershipFilterId,
    selectedMakeId,
    selectedMakeLowerName,
    selectedMakeNumericId,
  ]);

  const freshAuctionRailItems = useMemo(() => {
    const now = Date.now();
    const results = [];
    for (const car of freshAuctionSource) {
      if (!car || typeof car !== "object") continue;
      const status = String(car.__status ?? car.auction_status ?? "").toUpperCase();
      if (status === "SOLD" || status === "REMOVED") continue;

      const auctionStatus = String(
        car.auction_status ?? car.__auction_status ?? car.status ?? car.__status ?? ""
      ).toUpperCase();
      if (auctionStatus !== "AUCTION_IN_PROGRESS" && !isAuctionSource(car)) continue;

      const timestampCandidates = [
        car.created_at,
        car.createdAt,
        car.listed_at,
        car.listedAt,
        car.posted_at,
        car.postedAt,
        car.listing_date,
        car.listingDate,
        car.date_listed,
        car.dateListed,
        car.published_at,
        car.publishedAt,
        car.updated_at,
        car.updatedAt,
      ];
      let listedTs = NaN;
      for (const candidate of timestampCandidates) {
        const parsed = parseTimestamp(candidate);
        if (Number.isFinite(parsed)) {
          listedTs = parsed;
          break;
        }
      }
      if (!Number.isFinite(listedTs)) continue;

      const ageMs = now - listedTs;
      if (
        ageMs > FRESH_AUCTION_WINDOW_MS ||
        ageMs < -MAX_FRESH_AUCTION_FUTURE_SKEW_MS
      ) {
        continue;
      }

      const listedAgeMs = Math.max(0, ageMs);
      const listedAgeDays = Math.floor(listedAgeMs / FRESH_AUCTION_DAY_MS);
      results.push({ car, listedTs, listedAgeMs, listedAgeDays });
    }

    results.sort((a, b) => {
      if (a.listedTs !== b.listedTs) {
        return b.listedTs - a.listedTs;
      }
      return a.listedAgeMs - b.listedAgeMs;
    });
    return results;
  }, [freshAuctionSource]);

  const sorted = useMemo(
    () =>
      sortCars(filtered, sort, {
        userLat: userCoords.lat,
        userLng: userCoords.lng,
        preferredState: locationPreference.state,
        preferredCity: locationPreference.city,
        preferredPostalCode: locationPreference.postalCode,
      }),
    [
      filtered,
      sort,
      userCoords.lat,
      userCoords.lng,
      locationPreference.state,
      locationPreference.city,
      locationPreference.postalCode,
    ]
  );

  const updateFreshRailScrollState = useCallback(() => {
    const node = freshAuctionRailRef.current;
    if (!node) {
      setFreshRailCanScrollBack(false);
      setFreshRailCanScrollForward(false);
      return;
    }
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    const left = node.scrollLeft;
    setFreshRailCanScrollBack(left > 4);
    setFreshRailCanScrollForward(left < maxScrollLeft - 4);
  }, []);

  const scrollFreshRail = useCallback(
    (direction) => {
      const node = freshAuctionRailRef.current;
      if (!node) return;
      const travel = Math.max(260, Math.floor(node.clientWidth * 0.85));
      node.scrollBy({ left: direction * travel, behavior: "smooth" });
      if (typeof window !== "undefined") {
        window.setTimeout(updateFreshRailScrollState, 220);
      }
    },
    [updateFreshRailScrollState]
  );

  useEffect(() => {
    updateFreshRailScrollState();
  }, [
    freshAuctionRailItems.length,
    freshAuctionRailEnabled,
    loading,
    hasError,
    updateFreshRailScrollState,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => updateFreshRailScrollState();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [updateFreshRailScrollState]);

  const hasKnownTotal = typeof total === "number" && Number.isFinite(total);
  const totalPages = hasKnownTotal
    ? Math.max(1, Math.ceil((total || 0) / (serverPageSize || PAGE_SIZE)))
    : 1;
  const safePage = isCursorPaginationActive
    ? Math.max(page, 1)
    : Math.min(Math.max(page, 1), totalPages);
  const freshAuctionIdSet = useMemo(() => {
    if (!freshAuctionRailEnabled) return new Set();
    const ids = new Set();
    for (const item of freshAuctionRailItems) {
      const carId = item?.car?.__id;
      if (carId == null) continue;
      const normalizedId = String(carId).trim();
      if (!normalizedId) continue;
      ids.add(normalizedId);
    }
    return ids;
  }, [freshAuctionRailEnabled, freshAuctionRailItems]);
  const pageItems = sorted;
  const showFreshAuctionRail = (
    freshAuctionRailEnabled &&
    !loading &&
    !hasError &&
    freshAuctionRailItems.length > 0
  );
  const visibleCount = pageItems.length;
  const serverCount = hasKnownTotal ? total : visibleCount;
  const totalLabel = serverCount;
  const totalForPagination = hasKnownTotal ? serverCount : null;
  const seoTitle = useMemo(() => {
    if (isMakeLanding) {
      if (makeLandingResolved && selectedMakeName) {
        return `${selectedMakeName} Cars for Sale | ${siteTitle}`;
      }
      return `Make Not Found | ${siteTitle}`;
    }
    if (selectedMakeName) {
      return `${selectedMakeName} Cars for Sale | ${siteTitle}`;
    }
    return `${siteTitle} | Performance Cars and Auctions`;
  }, [isMakeLanding, makeLandingResolved, selectedMakeName, siteTitle]);
  const seoDescription = useMemo(() => {
    let primary = `${siteTitle} indexes enthusiast cars, live auctions, and dealership inventory in one place.`;
    if (isMakeLanding) {
      if (makeLandingResolved && selectedMakeName) {
        primary = `Browse ${selectedMakeName} listings, live auctions, and dealership inventory on ${siteTitle}.`;
      } else {
        primary = `The requested make page could not be found on ${siteTitle}.`;
      }
    } else if (selectedMakeName) {
      primary = `Browse ${selectedMakeName} listings, live auctions, and dealership inventory on ${siteTitle}.`;
    }
    const stats = serverCount > 0 ? `${fmtNum(serverCount)} active listings.` : "";
    return [primary, stats, siteTagline].filter(Boolean).join(" ");
  }, [
    isMakeLanding,
    makeLandingResolved,
    selectedMakeName,
    serverCount,
    siteTitle,
    siteTagline,
  ]);
  const seoCanonicalPath = useMemo(() => {
    if (isMakeLanding) {
      if (makeLandingResolved && selectedMakeSlug) {
        return `/make/${selectedMakeSlug}`;
      }
      return "/";
    }
    return "/";
  }, [isMakeLanding, makeLandingResolved, selectedMakeSlug]);
  const seoNoindex = isMakeLanding && !makeLandingResolved;
  const seoImage = useMemo(() => {
    const rawLogo = typeof settings?.logo_url === "string" ? settings.logo_url.trim() : "";
    if (rawLogo) {
      if (rawLogo.startsWith("http://") || rawLogo.startsWith("https://") || rawLogo.startsWith("data:")) {
        return rawLogo;
      }
      const normalized = rawLogo.startsWith("/") ? rawLogo : `/${rawLogo}`;
      return `${API_BASE}${normalized}`;
    }
    return "https://cdn.vinfreak.com/branding/QtLmCMtkDhlgVV20aMm8rA.jpg";
  }, [settings?.logo_url]);
  const homeSchema = useMemo(() => {
    const itemListElement = (pageItems || [])
      .slice(0, 12)
      .map((entry, index) => {
        const id = entry?.__id || entry?.id;
        if (!id) return null;
        return {
          "@type": "ListItem",
          position: index + 1,
          url: `https://vinfreak.com/car/${encodeURIComponent(String(id))}`,
          name: entry?.__title || entry?.title || `Listing #${id}`,
        };
      })
      .filter(Boolean);

    const data = [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": "https://vinfreak.com/#website",
        url: "https://vinfreak.com/",
        name: siteTitle,
        description: siteTagline,
        potentialAction: {
          "@type": "SearchAction",
          target: "https://vinfreak.com/?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": `https://vinfreak.com${seoCanonicalPath}#inventory`,
        url: `https://vinfreak.com${seoCanonicalPath}`,
        name: seoTitle,
        description: seoDescription,
      },
    ];

    if (itemListElement.length) {
      data.push({
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": "https://vinfreak.com/#inventory-list",
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: serverCount,
        itemListElement,
      });
    }
    return data;
  }, [
    pageItems,
    seoCanonicalPath,
    seoDescription,
    seoTitle,
    serverCount,
    siteTagline,
    siteTitle,
  ]);

  useSeo({
    title: seoTitle,
    description: seoDescription,
    canonicalPath: seoCanonicalPath,
    noindex: seoNoindex,
    ogType: "website",
    image: seoImage,
    imageAlt: `${siteTitle} logo`,
    siteName: siteTitle,
    structuredData: homeSchema,
  });

  useEffect(() => {
    setPage((prev) => {
      if (prev === initialPage) return prev;
      return initialPage;
    });
    if (initialPage > 1) {
      setPaginationStrategy("offset");
    } else {
      setPaginationStrategy(cursorPaginationEligible ? "cursor" : "offset");
    }
    setPageCursors([null]);
  }, [initialPage, cursorPaginationEligible]);

  useEffect(() => {
    if (!hasMountedPageResetRef.current) {
      hasMountedPageResetRef.current = true;
      return;
    }
    setPage(1);
    setPageCursors([null]);
    setPaginationStrategy(cursorPaginationEligible ? "cursor" : "offset");
  }, [
    q,
    transmission,
    dealershipId,
    sort,
    PAGE_SIZE,
    selectedMakeId,
    statusFilter,
    locationFilter?.postalCode,
    locationFilter?.radius,
    cursorPaginationEligible,
  ]);
  useEffect(() => {
    if (isCursorPaginationActive) return;
    setPage((prev) => {
      const next = Math.min(Math.max(1, prev), totalPages);
      return next === prev ? prev : next;
    });
  }, [totalPages, isCursorPaginationActive]);

  useEffect(() => {
    if (typeof onPageChange !== "function") return;
    onPageChange(page);
  }, [onPageChange, page]);

  const handleMakeSelect = (nextValue) => {
    setSelectedMakeId(nextValue);
    setIsMakeDropdownOpen(false);
  };

  const handleSortSelect = useCallback(
    (nextValue) => {
      if (!nextValue) {
        setIsSortDropdownOpen(false);
        return;
      }
      if (nextValue === "nearest" && !canUseNearest && sort !== "nearest") {
        setIsSortDropdownOpen(false);
        return;
      }
      setSort(nextValue);
      setIsSortDropdownOpen(false);
    },
    [canUseNearest, sort]
  );

  return (
    <div>
      {makeFilterEnabled && makeOptions.length > 0 && (
        <section className="brand-picker brand-picker--dropdown" aria-label="Filter inventory by make">
          <div className="brand-select-wrap">
            <label className="brand-select-label" id="make-select-label" htmlFor="make-select-button">
              BROWSE BY CAR BRAND
            </label>
            <div
              className={`source-select${isMakeDropdownOpen ? " open" : ""}`}
              ref={makeDropdownRef}
            >
              <button
                type="button"
                id="make-select-button"
                className="source-select-toggle"
                onClick={() => {
                  setIsSourceDropdownOpen(false);
                  setIsSortDropdownOpen(false);
                  setIsMakeDropdownOpen((prev) => !prev);
                }}
                aria-haspopup="listbox"
                aria-expanded={isMakeDropdownOpen}
                aria-labelledby="make-select-label make-select-button-text"
              >
                <span className="source-select-current" id="make-select-button-text">
                  {selectedMake ? (
                    <>
                      <span className="source-select-current-name">{selectedMake.name || "Unknown"}</span>
                      {filterCountsEnabled && typeof selectedMake.car_count === "number" ? (
                        <span className="source-select-current-count">
                          {fmtNum(selectedMake.car_count)} car
                          {selectedMake.car_count === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="source-select-current-name">All enthusiast car brands</span>
                      {filterCountsEnabled && (
                        <span className="source-select-current-count">
                          {fmtNum(totalLabel)} car{totalLabel === 1 ? "" : "s"}
                        </span>
                      )}
                    </>
                  )}
                </span>
                <span className="source-select-caret" aria-hidden="true" />
              </button>
              <ul
                className="source-select-menu"
                role="listbox"
                aria-labelledby="make-select-label"
                aria-hidden={isMakeDropdownOpen ? "false" : "true"}
              >
                <li>
                  <button
                    type="button"
                    className={`source-select-option${!selectedMakeId ? " active" : ""}`}
                    onClick={() => handleMakeSelect("")}
                    role="option"
                    aria-selected={!selectedMakeId}
                  >
                    <div className="source-option-avatar" aria-hidden="true">
                      <span>All</span>
                    </div>
                    <div className="source-option-meta">
                      <span className="source-option-name">All enthusiast car brands</span>
                      {filterCountsEnabled && (
                        <span className="source-option-count">
                          {fmtNum(totalLabel)} car{totalLabel === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
                {makeOptions.map((make) => {
                  const label = make.name || "Unknown";
                  const isActive = selectedMakeId === make.idStr;
                  return (
                    <li key={make.idStr}>
                      <button
                        type="button"
                        className={`source-select-option${isActive ? " active" : ""}`}
                        onClick={() => handleMakeSelect(make.idStr)}
                        role="option"
                        aria-selected={isActive}
                      >
                        <div className="source-option-avatar" aria-hidden="true">
                          {make.logo_url ? (
                            <img src={make.logo_url} alt="" />
                          ) : (
                            <span>{make.initials}</span>
                          )}
                        </div>
                        <div className="source-option-meta">
                          <span className="source-option-name">{label}</span>
                          {filterCountsEnabled && (
                            <span className="source-option-count">
                              {fmtNum(make.car_count)} car{make.car_count === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      )}

      {dealershipFilterEnabled && sourceOptions.length > 0 && (
        <section
          className="brand-picker brand-picker--dropdown source-picker--dropdown"
          aria-label="Filter inventory by source"
        >
          <div className="brand-select-wrap">
            <label
              className="brand-select-label"
              id="source-select-label"
              htmlFor="source-select-button"
            >
              BROWSE BY DEALERSHIP
            </label>
            <div
              className={`source-select${isSourceDropdownOpen ? " open" : ""}`}
              ref={sourceDropdownRef}
            >
              <button
                type="button"
                id="source-select-button"
                className="source-select-toggle"
                onClick={() => {
                  setIsMakeDropdownOpen(false);
                  setIsSortDropdownOpen(false);
                  setIsSourceDropdownOpen((prev) => !prev);
                }}
                aria-haspopup="listbox"
                aria-expanded={isSourceDropdownOpen}
                aria-labelledby="source-select-label source-select-button-text"
              >
                <span className="source-select-current" id="source-select-button-text">
                  {selectedSource ? (
                    <>
                      <span className="source-select-current-name">
                        {selectedSource.displayName}
                        {selectedSource.displayLocation ? (
                          <span className="source-select-current-address">
                            {" "}
                            &mdash; {selectedSource.displayLocation}
                          </span>
                        ) : null}
                      </span>
                      {filterCountsEnabled && selectedSource.listingCount != null && (
                        <span className="source-select-current-count">
                          {fmtNum(selectedSource.listingCount)} car
                          {selectedSource.listingCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="source-select-current-name">All enthusiast dealerships</span>
                      {filterCountsEnabled && (
                        <span className="source-select-current-count">
                          {fmtNum(totalLabel)} car{totalLabel === 1 ? "" : "s"}
                        </span>
                      )}
                    </>
                  )}
                </span>
                <span className="source-select-caret" aria-hidden="true" />
              </button>
              <ul
                className="source-select-menu"
                role="listbox"
                aria-labelledby="source-select-label"
                aria-hidden={isSourceDropdownOpen ? "false" : "true"}
              >
                <li>
                  <button
                    type="button"
                    className={`source-select-option${!dealershipId ? " active" : ""}`}
                    onClick={() => {
                      setDealershipId("");
                      setIsSourceDropdownOpen(false);
                    }}
                    role="option"
                    aria-selected={!dealershipId}
                  >
                    <div className="source-option-avatar" aria-hidden="true">
                      <span>All</span>
                    </div>
                    <div className="source-option-meta">
                      <span className="source-option-name">All dealerships</span>
                      {filterCountsEnabled && (
                        <span className="source-option-count">
                          {fmtNum(totalLabel)} car{totalLabel === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
                {sourceOptions.map((dealer) => {
                  const isActive = String(dealershipId || "") === dealer.idStr;
                  return (
                    <li key={dealer.idStr}>
                      <button
                        type="button"
                        className={`source-select-option${isActive ? " active" : ""}`}
                        onClick={() => {
                          setDealershipId((prev) =>
                            String(prev || "") === dealer.idStr ? "" : dealer.idStr
                          );
                          setIsSourceDropdownOpen(false);
                        }}
                        role="option"
                        aria-selected={isActive}
                      >
                        <div className="source-option-avatar" aria-hidden="true">
                          {dealer.logoUrl ? (
                            <img src={dealer.logoUrl} alt="" />
                          ) : (
                            <span>{dealer.initials || "–"}</span>
                          )}
                        </div>
                        <div className="source-option-meta">
                          <span className="source-option-name">
                            {dealer.displayName}
                            {dealer.displayLocation ? (
                              <span className="source-option-address">
                                {" "}
                                &mdash; {dealer.displayLocation}
                              </span>
                            ) : null}
                          </span>
                          {filterCountsEnabled && dealer.listingCount != null && (
                            <span className="source-option-count">
                              {fmtNum(dealer.listingCount)} car
                              {dealer.listingCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      )}

      {beforeSort ? <div className="home-before-sort">{beforeSort}</div> : null}

      <section className="brand-picker brand-picker--dropdown sort-picker" aria-label="Sort inventory">
        <div className="brand-select-wrap">
          <label
            className={sortLabelEnabled ? "brand-select-label" : "sr-only"}
            id="sort-select-label"
            htmlFor="sort-select-button"
          >
            SORT INVENTORY
          </label>
          <div
            className={`source-select sort-select${isSortDropdownOpen ? " open" : ""}`}
            ref={sortDropdownRef}
          >
            <button
              type="button"
              id="sort-select-button"
              className="source-select-toggle"
              onClick={() => {
                setIsMakeDropdownOpen(false);
                setIsSourceDropdownOpen(false);
                setIsSortDropdownOpen((prev) => !prev);
              }}
              aria-haspopup="listbox"
              aria-expanded={isSortDropdownOpen}
              aria-labelledby="sort-select-label sort-select-button-text"
            >
              <span className="source-select-current" id="sort-select-button-text">
                <span className="source-select-current-name">{`Sort by: ${activeSortChoice.label}`}</span>
                {activeSortChoice.description && (
                  <span className="sort-select-current-hint">{activeSortChoice.description}</span>
                )}
              </span>
              <span className="source-select-caret" aria-hidden="true" />
            </button>
            <ul
              className="source-select-menu"
              role="listbox"
              aria-labelledby="sort-select-label"
            >
              {sortChoices.map((option) => {
                const isActive = sort === option.value;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      className={`source-select-option sort-select-option${isActive ? " active" : ""}`}
                      onClick={() => handleSortSelect(option.value)}
                      role="option"
                      aria-selected={isActive}
                      disabled={option.disabled}
                    >
                      <span className="sort-option-label">{`Sort by: ${option.label}`}</span>
                      {option.description && (
                        <span className="sort-option-description">{option.description}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {sort === "nearest" && (
            <LocationFacet
              className="sort-location-card"
              inputId="sort-location-input"
              value={zipInput}
              onChange={setZipInput}
              onSubmit={handleLocationSubmit}
              status={locationStatus}
              error={locationError}
              label="Cars near you"
              idleButtonLabel="Update ZIP code"
              placeholder={locationFocusPlaceholder || "92618 or enter another ZIP code"}
            />
          )}
          {inventoryTypePillsEnabled && (
            <div className="sort-switch" role="group" aria-label="Show inventory type">
              <span className="sort-switch-label">Show:</span>
              <div className="sort-switch-group">
                <button
                  type="button"
                  className={`sort-pill${statusFilter === "all" ? " active" : ""}`}
                  onClick={() => setStatusFilter("all")}
                  aria-pressed={statusFilter === "all"}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`sort-pill${statusFilter === "live" ? " active" : ""}`}
                  onClick={() => setStatusFilter("live")}
                  aria-pressed={statusFilter === "live"}
                >
                  Auction Only
                </button>
                <button
                  type="button"
                  className={`sort-pill${statusFilter === "nonauction" ? " active" : ""}`}
                  onClick={() => setStatusFilter("nonauction")}
                  aria-pressed={statusFilter === "nonauction"}
                >
                  Dealership Only
                </button>
                <button
                  type="button"
                  className={`sort-pill${statusFilter === "fbm" ? " active" : ""}`}
                  onClick={() => setStatusFilter("fbm")}
                  aria-pressed={statusFilter === "fbm"}
                >
                  FBM
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Grid */}
      <section id="inventory" className={loading ? "grid-loading" : "grid"}>
        {loading ? (
          <CarSkeletonGrid count={serverPageSize || PAGE_SIZE} />
        ) : hasError ? (
          <div className="state error">Unable to load inventory right now. Please retry shortly.</div>
        ) : (
          <>
            {pageItems.map((c) => {
              const carId = c?.__id;
              const isFreshListing =
                carId != null && freshAuctionIdSet.has(String(carId).trim());
              return (
                <CarCard
                  key={c.__id}
                  car={c}
                  isFreshListing={isFreshListing}
                  showNearestDistanceNote={sort === "nearest"}
                  nearestReferenceLabel={nearestDistanceReferenceLabel}
                />
              );
            })}
            {pageItems.length === 0 && <div className="state">No cars match your filters.</div>}
          </>
        )}
      </section>

      {!loading &&
        !hasError &&
        (
          isCursorPaginationActive
            ? canCursorGoPrev || canCursorGoNext
            : (typeof totalForPagination === "number" &&
              totalForPagination > (serverPageSize || PAGE_SIZE))
        ) && (
        <Pagination
          page={safePage}
          setPage={setPage}
          total={typeof totalForPagination === "number" ? totalForPagination : null}
          pageSize={serverPageSize || PAGE_SIZE}
          mode={isCursorPaginationActive ? "cursor" : "page"}
          canPrev={canCursorGoPrev}
          canNext={canCursorGoNext}
          onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
          onNext={() => {
            if (!canCursorGoNext) return;
            setPage((prev) => prev + 1);
          }}
        />
      )}

      {SHOW_DEV_STATS && kpis && (
        <section className="dev-stats" aria-label="Developer marketplace statistics">
          <div className="dev-stats-header">
            <span className="hero-eyebrow">Dev statistics</span>
            <h2>Marketplace pulse</h2>
            <p className="dev-stats-sub">Realtime insight into the sandbox inventory powering the build.</p>
          </div>
          <div className="dev-stats-grid">
            <div className="dev-stat">
              <span className="dev-stat-k">Total cars</span>
              <span className="dev-stat-v">{fmtNum(kpis.total)}</span>
            </div>
            <div className="dev-stat">
              <span className="dev-stat-k">Avg price</span>
              <span className="dev-stat-v">{fmtMoney(kpis.avgPrice)}</span>
            </div>
            <div className="dev-stat">
              <span className="dev-stat-k">Makes tracked</span>
              <span className="dev-stat-v">{fmtNum(kpis.makeCount)}</span>
            </div>
            <div className="dev-stat">
              <span className="dev-stat-k">Latest import</span>
              <span className="dev-stat-v">{fmtDate(kpis.latest)}</span>
            </div>
          </div>
        </section>
      )}

      {footerPanelsEnabled && (
        <section className="toolbar-row toolbar-row--footer">
          <Facets
            sort={sort} setSort={setSort}
            transmission={transmission} setTransmission={setTransmission}
            dealershipId={dealershipId} setDealershipId={setDealershipId}
            dealerships={dealerships}
            canUseDistance={canUseNearest}
            nearestStatus={nearestStatusForFacets}
            nearestLabelOverride={nearestLabelOverride}
            locationFocusValue={zipInput}
            onLocationFocusChange={setZipInput}
            onLocationFocusSubmit={handleLocationSubmit}
            locationStatus={locationStatus}
            locationError={locationError}
            locationFocusPlaceholder={locationFocusPlaceholder}
          />
          <div className="chips">
            {q && <Chip label={`q: ${q}`} onClear={()=>setQ("")} />}
            {transmission && <Chip label={transmission} onClear={() => setTransmission("")} />}
            {dealershipId && (
              <Chip
                label={dealerships.find(d => String(d.id) === String(dealershipId))?.name || dealershipId}
                onClear={() => setDealershipId("")}
              />
            )}
            {statusFilter !== "all" && (
              <Chip
                label={
                  statusFilter === "live"
                    ? "Auction Only"
                    : statusFilter === "nonauction"
                      ? "Dealership Only"
                      : "FBM"
                }
                onClear={() => setStatusFilter("all")}
              />
            )}
            {locationFilter && (
              <Chip
                label={`Near ${(
                  [locationFilter.city, locationFilter.state]
                    .filter(Boolean)
                    .join(", ") || `ZIP ${locationFilter.postalCode}`
                )}`}
                onClear={clearManualLocation}
              />
            )}
            {selectedMake && (
              <Chip
                label={selectedMake.name || "Selected make"}
                onClear={() => setSelectedMakeId("")}
              />
            )}
          </div>
          <div className="results">{fmtNum(visibleCount)} result{visibleCount===1?"":"s"}</div>
        </section>
      )}

      {footerPanelsEnabled && (
        <section className="hero hero--footer">
          <div className="hero-inner">
            <div className="hero-copy">
              <span className="hero-eyebrow">VINFREAK Performance Cars For Sale</span>
              <h1>{settings.site_tagline || "Discover performance & provenance"}</h1>
            </div>
            <div className="hero-actions">
              <div className="hero-card hero-card--switch">
                <span className="hero-card-label">Inventory mode</span>
                <div className="auction-switch" role="group" aria-label="Auction status filter">
                  <button
                    type="button"
                    className={`auction-pill${statusFilter === "all" ? " active" : ""}`}
                    onClick={() => setStatusFilter("all")}
                    aria-pressed={statusFilter === "all"}
                  >
                    All Cars
                  </button>
                  <button
                    type="button"
                    className={`auction-pill${statusFilter === "live" ? " active" : ""}`}
                    onClick={() => setStatusFilter("live")}
                    aria-pressed={statusFilter === "live"}
                  >
                    Auction Only
                  </button>
                  <button
                    type="button"
                    className={`auction-pill${statusFilter === "nonauction" ? " active" : ""}`}
                    onClick={() => setStatusFilter("nonauction")}
                    aria-pressed={statusFilter === "nonauction"}
                  >
                    Dealership Only
                  </button>
                  <button
                    type="button"
                    className={`auction-pill${statusFilter === "fbm" ? " active" : ""}`}
                    onClick={() => setStatusFilter("fbm")}
                    aria-pressed={statusFilter === "fbm"}
                  >
                    FBM
                  </button>
                </div>
              </div>
              <div className="hero-card hero-card--search">
                <span className="hero-card-label">Quick search</span>
                <SearchBar value={q} onChange={setQ} />
                <p className="hero-search-hint">Type to surface VINs, trims, locations, and more.</p>
              </div>
            </div>

          </div>
        </section>
      )}

      {footerPanelsEnabled && (
        <section
          className={`dealer-partners${dealerCTAOpen ? " is-open" : ""}`}
          aria-label="Dealership partners"
        >
          <button
            type="button"
            className="dealer-partners__toggle"
            aria-expanded={dealerCTAOpen}
            aria-controls="dealer-partners-panel"
            onClick={() => setDealerCTAOpen((prev) => !prev)}
          >
            Dealership partners
          </button>
          <div
            id="dealer-partners-panel"
            className="dealer-partners__panel"
            aria-hidden={!dealerCTAOpen}
          >
            <div className="dealer-partners__actions">
              <a className="btn primary dealer-partners__action" href={dealerApplyUrl}>
                Apply for dealership
              </a>
              <a className="btn ghost dealer-partners__action" href={dealerLoginUrl}>
                Dealer login
              </a>
            </div>
          </div>
        </section>
      )}

      {footerPanelsEnabled && (
        <section
          className="toolbar-row toolbar-row--nearby toolbar-row--nearby-bottom"
          aria-label="Filter inventory by location"
        >
          <form className="nearby-form" onSubmit={handleLocationSubmit}>
            <div className="nearby-form-top">
              <div className="nearby-form-copy">
                <span className="hero-eyebrow nearby-eyebrow">Cars near you</span>
                <h2>Find cars near you</h2>
                <p className="nearby-form-sub">
                  Enter a ZIP code to surface inventory closest to you.
                </p>
              </div>
              <div className="nearby-grid">
                <label className="sr-only" htmlFor="zip-input">
                  ZIP code
                </label>
                <input
                  id="zip-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={locationFocusPlaceholder || "92618 or enter another ZIP code"}
                  value={zipInput}
                  onChange={(e) => setZipInput(e.target.value)}
                />
                <button type="submit" disabled={locationStatus === "loading"}>
                  {locationButtonLabel}
                </button>
              </div>
            </div>
            {locationError && (
              <p className="nearby-error" role="alert">
                {locationError}
              </p>
            )}
            {locationFilter && !locationError && (
              <p className="nearby-hint">
                Showing cars near {" "}
                <strong>
                  {(
                    [locationFilter.city, locationFilter.state]
                      .filter(Boolean)
                      .join(", ") || `ZIP ${locationFilter.postalCode}`
                  )}
                </strong>
              </p>
            )}
          </form>
        </section>
      )}

      {showFreshAuctionRail && (
        <section className="fresh-auctions" aria-label="Fresh auctions listed in the last 24 hours">
          <div className="fresh-auctions__header">
            <div>
              <span className="fresh-auctions__eyebrow">Just listed</span>
              <h2>Fresh Auctions</h2>
            </div>
            <div className="fresh-auctions__controls" aria-label="Scroll fresh auctions">
              <button
                type="button"
                className="fresh-auctions__control"
                onClick={() => scrollFreshRail(-1)}
                disabled={!freshRailCanScrollBack}
                aria-label="Scroll fresh auctions left"
              >
                &#8249;
              </button>
              <button
                type="button"
                className="fresh-auctions__control"
                onClick={() => scrollFreshRail(1)}
                disabled={!freshRailCanScrollForward}
                aria-label="Scroll fresh auctions right"
              >
                &#8250;
              </button>
            </div>
          </div>
          <div
            className="fresh-auctions__track"
            ref={freshAuctionRailRef}
            onScroll={updateFreshRailScrollState}
          >
            {freshAuctionRailItems.map(({ car, listedAgeDays }) => {
              const listingUrl = car?.url && typeof car.url === "string" ? car.url : null;
              const auctionStatus = String(
                car?.auction_status ?? car?.__auction_status ?? ""
              ).toUpperCase();
              const priceLabel =
                auctionStatus === "AUCTION_IN_PROGRESS" ? "Current Bid" : "Price";
              const listedLabel =
                listedAgeDays <= 0 ? "Listed today" : `Listed ${listedAgeDays}d ago`;
              const dealershipLabel = (() => {
                const dealership = car?.dealership;
                const candidates = [
                  dealership?.name,
                  dealership?.display_name,
                  dealership?.short_name,
                  typeof dealership === "string" ? dealership : null,
                ];
                for (const value of candidates) {
                  if (typeof value === "string" && value.trim()) {
                    return value.trim();
                  }
                }
                return "Auction source";
              })();
              const content = (
                <>
                  <div className="fresh-auctions__media">
                    {car?.__image ? (
                      <img src={car.__image} alt={car.__title} loading="lazy" />
                    ) : (
                      <div className="fresh-auctions__noimg">No Photo</div>
                    )}
                  </div>
                  <div className="fresh-auctions__body">
                    <p className="fresh-auctions__meta">
                      <span className="fresh-auctions__pill">NEW</span>
                      <span>{listedLabel}</span>
                    </p>
                    <h3>{car.__title}</h3>
                    <p className="fresh-auctions__source">{dealershipLabel}</p>
                    <div className="fresh-auctions__stats">
                      <span>{priceLabel}: {fmtMoney(car.__price, car.currency || "USD")}</span>
                      <span>{car.__location || "Location pending"}</span>
                    </div>
                  </div>
                </>
              );
              return (
                <article key={`fresh-${car.__id}`} className="fresh-auctions__card">
                  {listingUrl ? (
                    <a
                      className="fresh-auctions__link"
                      href={listingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {content}
                    </a>
                  ) : (
                    <div className="fresh-auctions__link">{content}</div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}
