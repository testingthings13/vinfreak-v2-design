import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE, getJSON } from "../api";
import { normalizeCar } from "../utils/normalizeCar";
import { resolveListingDealership } from "../utils/dealerships";
import CarCard from "../components/CarCard";
import { SettingsContext } from "../App";
import { useToast } from "../ToastContext";
import { useSeo, toAbsoluteUrl } from "../utils/seo";
import { fmtMileage } from "../utils/text";
import Home from "./Home";

const cleanText = (value) => {
  if (value == null) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text;
};

const stripZip = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/\s*\d{5}(?:-\d{4})?$/, "").trim();
};

const formatPrice = (value) => {
  if (value == null || value === "") return "";
  const number = Number(String(value).replace(/[^0-9.\-]/g, ""));
  if (Number.isFinite(number)) {
    const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return `$${number.toLocaleString(undefined, options)}`;
  }
  return cleanText(value);
};

const formatMileage = (value) => {
  if (value == null || value === "") return "";
  const formatted = fmtMileage(value);
  return formatted === "\u2014" ? cleanText(value) : formatted;
};

const truncate = (value, limit = 200) => {
  if (!value) return "";
  if (value.length <= limit) return value;
  const shortened = value.slice(0, limit - 3).trimEnd();
  return `${shortened}...`;
};

const getPrimaryImage = (car) => {
  const candidates = [
    car?.__image,
    car?.image_url,
    car?.image,
    car?.thumbnail,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  if (Array.isArray(car?.__images)) {
    const match = car.__images.find((item) => typeof item === "string" && item.trim());
    if (match) return match.trim();
  }
  if (Array.isArray(car?.images)) {
    const match = car.images.find((item) => typeof item === "string" && item.trim());
    if (match) return match.trim();
  }
  return "";
};

const buildSharePayload = (car, siteTitle) => {
  const unavailableDescription = truncate(
    `This listing is no longer available on ${siteTitle}.`,
    180,
  );

  if (!car) {
    return {
      available: false,
      title: "Listing unavailable",
      summary: unavailableDescription,
      imageUrl: "",
      imageAlt: "",
      detailUrl: null,
      sourceUrl: null,
    };
  }

  const titleCandidates = [
    cleanText(car.__title),
    cleanText(
      [car.__year, car.__make, car.__model, car.__trim]
        .filter(Boolean)
        .join(" "),
    ),
    cleanText(car.title),
    cleanText(car.name),
    car.__id ? `Listing #${car.__id}` : "",
  ];
  const title = titleCandidates.find((candidate) => candidate) || "Featured vehicle";

  const priceDisplay = formatPrice(car.__price ?? car.price);
  const mileageDisplay = formatMileage(car.__mileage ?? car.mileage);
  const transmission = cleanText(car.transmission ?? car.__transmission);
  const drivetrain = cleanText(
    car.drivetrain ?? car.drivetrain_type ?? car.drivetrainType ?? car.drive_train,
  );
  const fuel = cleanText(car.fuel_type ?? car.fuelType ?? car.engine_type);
  const locationCandidates = [
    cleanText(car.__location),
    cleanText(car.location),
    cleanText([car.city, car.state].filter(Boolean).join(", ")),
  ];
  const locationRaw = locationCandidates.find((candidate) => candidate) || "";
  const location = locationRaw ? stripZip(locationRaw) : "";

  const summaryValues = [priceDisplay, mileageDisplay, transmission, drivetrain, fuel, location]
    .filter(Boolean);
  let summary = summaryValues.join(" - ");
  if (!summary) {
    const fallback = [
      car.highlights,
      car.description,
      car.equipment,
      car.notes,
    ]
      .map(cleanText)
      .find((value) => value);
    summary = fallback || `Discover this vehicle on ${siteTitle}.`;
  }
  summary = truncate(summary, 200);

  const imageUrl = getPrimaryImage(car);
  const detailUrl = car.__id ? `/car/${encodeURIComponent(car.__id)}` : null;
  const sourceCandidates = [car.source_url, car.url, car.listing_url, car.link];
  const sourceUrl = sourceCandidates
    .map((candidate) => cleanText(candidate))
    .find((candidate) => candidate) || null;

  return {
    available: true,
    title,
    summary,
    imageUrl,
    imageAlt: title,
    detailUrl,
    sourceUrl,
  };
};

export default function Share() {
  const { id } = useParams();
  const settings = useContext(SettingsContext);
  const { addToast } = useToast();
  const pageHandoffTriggeredRef = useRef(false);
  const [car, setCar] = useState(null);
  const [loadingCar, setLoadingCar] = useState(true);

  const siteTitle = settings?.site_title || "VINFREAK";
  const shareLogoSrc = useMemo(() => {
    const raw = typeof settings?.logo_url === "string" ? settings.logo_url.trim() : "";
    if (!raw) return "";
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
      return raw;
    }
    return `${API_BASE}${raw}`;
  }, [settings?.logo_url]);
  const shareLogoWidth = Number(settings?.logo_width) || 64;
  const shareLogoHeight = Number(settings?.logo_height) || 64;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoadingCar(true);
        const data = await getJSON(`/cars/${encodeURIComponent(id)}`);
        if (!active) return;
        const normalized = normalizeCar(data);
        const dealership = resolveListingDealership(normalized, {
          rawDealership: data?.dealership || null,
        });
        setCar({
          ...normalized,
          dealership,
        });
      } catch (error) {
        if (!active) return;
        console.error("Failed to load shared car", error);
        addToast("Unable to load shared car", "error");
        setCar(null);
      } finally {
        if (active) setLoadingCar(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, addToast]);

  const handleHomePageChange = useCallback((nextPage) => {
    if (typeof window === "undefined") return;
    if (pageHandoffTriggeredRef.current) return;
    const parsed = Number(nextPage);
    if (!Number.isFinite(parsed) || parsed <= 1) return;
    const safePage = Math.max(2, Math.floor(parsed));
    pageHandoffTriggeredRef.current = true;
    window.location.assign(`/?page=${encodeURIComponent(String(safePage))}`);
  }, []);

  const sharePayload = useMemo(
    () => buildSharePayload(car, siteTitle),
    [car, siteTitle],
  );

  const shareSeoSchema = useMemo(() => {
    if (!sharePayload.available) return null;
    return {
      "@context": "https://schema.org",
      "@type": "Vehicle",
      name: sharePayload.title,
      description: sharePayload.summary,
      image: sharePayload.imageUrl ? [toAbsoluteUrl(sharePayload.imageUrl, "https://vinfreak.com")] : undefined,
      url: sharePayload.detailUrl
        ? `https://vinfreak.com${sharePayload.detailUrl}`
        : `https://vinfreak.com/share/${encodeURIComponent(String(id || ""))}`,
    };
  }, [sharePayload, id]);

  useSeo({
    title: loadingCar ? `Loading share | ${siteTitle}` : `${sharePayload.title} | ${siteTitle}`,
    description: sharePayload.summary || `Shared listing on ${siteTitle}.`,
    canonicalPath: sharePayload.detailUrl || `/share/${encodeURIComponent(String(id || ""))}`,
    ogType: "article",
    image: sharePayload.imageUrl || "https://cdn.vinfreak.com/branding/QtLmCMtkDhlgVV20aMm8rA.jpg",
    imageAlt: sharePayload.imageAlt || sharePayload.title,
    siteName: siteTitle,
    noindex: true,
    structuredData: shareSeoSchema,
  });

  return (
    <div className="share-page">
      <section className="share-featured">
        {loadingCar ? (
          <div className="share-featured__loading" role="status" aria-live="polite">
            Loading listing...
          </div>
        ) : car ? (
          <div className="share-featured__card-wrap">
            <div className="share-featured__card">
              <CarCard car={car} />
            </div>
          </div>
        ) : (
          <div className="share-featured__empty">
            This listing is currently unavailable.
          </div>
        )}
      </section>

      <section className="share-site-shell" aria-label="Marketplace">
        <Home
          onPageChange={handleHomePageChange}
          beforeSort={shareLogoSrc ? (
            <div className="logo-banner">
              <a
                className="logo-banner-link"
                href="https://vinfreak.com"
                aria-label={`Go to ${siteTitle} homepage`}
              >
                <img
                  src={shareLogoSrc}
                  alt={siteTitle}
                  style={{
                    width: shareLogoWidth,
                    height: shareLogoHeight,
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              </a>
            </div>
          ) : null}
        />
      </section>
    </div>
  );
}
