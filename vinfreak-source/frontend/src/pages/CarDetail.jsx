import { useEffect, useState, useCallback, useContext, useMemo } from "react";
import { useParams } from "react-router-dom";
import { getJSON } from "../api";
import { useToast } from "../ToastContext";
import { normalizeCar } from "../utils/normalizeCar";
import { resolveListingDealership } from "../utils/dealerships";
import CarDetailContent from "../components/CarDetailContent";
import { SettingsContext } from "../App";
import { useSeo, toAbsoluteUrl } from "../utils/seo";

export default function CarDetail() {
  const { id } = useParams();
  const settings = useContext(SettingsContext);
  const siteTitle = settings?.site_title || "VINFREAK";
  const [car, setCar] = useState(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const seoConfig = useMemo(() => {
    if (loading) {
      return {
        title: `Loading listing | ${siteTitle}`,
        description: `Loading vehicle details on ${siteTitle}.`,
        canonicalPath: `/car/${encodeURIComponent(String(id || ""))}`,
        siteName: siteTitle,
      };
    }

    if (!car) {
      return {
        title: `Listing not found | ${siteTitle}`,
        description: `This vehicle listing is no longer available on ${siteTitle}.`,
        canonicalPath: `/car/${encodeURIComponent(String(id || ""))}`,
        siteName: siteTitle,
        noindex: true,
      };
    }

    const title = car.__title || car.title || "Vehicle listing";
    const price = Number(car.__price ?? car.price);
    const mileage = Number(car.__mileage ?? car.mileage);
    const currencyCode =
      typeof car.currency === "string" && /^[A-Za-z]{3}$/.test(car.currency)
        ? car.currency.toUpperCase()
        : "USD";
    const location =
      car.__location ||
      car.location ||
      [car.city, car.state].filter(Boolean).join(", ") ||
      "";
    const transmission = car.transmission || car.__transmission || "";
    const descriptionParts = [];
    if (Number.isFinite(price)) {
      descriptionParts.push(
        new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currencyCode,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(price)
      );
    }
    if (Number.isFinite(mileage)) {
      descriptionParts.push(`${Math.round(mileage).toLocaleString()} mi`);
    }
    if (transmission) descriptionParts.push(String(transmission));
    if (location) descriptionParts.push(String(location));

    let description = descriptionParts.join(" - ");
    if (!description) {
      description =
        car.description ||
        car.highlights ||
        `Discover this vehicle listing on ${siteTitle}.`;
    }
    description = String(description).replace(/\s+/g, " ").trim().slice(0, 200);

    const canonicalPath = `/car/${encodeURIComponent(String(car.__id || id))}`;
    const canonicalUrl = `https://vinfreak.com${canonicalPath}`;

    const images = Array.isArray(car.__images) ? car.__images : [];
    const firstImage = images.find((entry) => typeof entry === "string" && entry.trim())
      || (typeof car.__image === "string" ? car.__image : "")
      || (typeof car.image_url === "string" ? car.image_url : "");
    const imageUrl = toAbsoluteUrl(firstImage, "https://vinfreak.com");

    const vehicleSchema = {
      "@context": "https://schema.org",
      "@type": "Vehicle",
      name: title,
      description,
      url: canonicalUrl,
      image: images.length ? images : imageUrl ? [imageUrl] : undefined,
      brand: car.__make || car.make ? { "@type": "Brand", name: car.__make || car.make } : undefined,
      model: car.__model || car.model || undefined,
      vehicleModelDate: car.__year || car.year || undefined,
      vehicleIdentificationNumber: car.vin || undefined,
      mileageFromOdometer: Number.isFinite(mileage)
        ? {
            "@type": "QuantitativeValue",
            value: Math.round(mileage),
            unitCode: "SMI",
          }
        : undefined,
      offers: Number.isFinite(price)
        ? {
            "@type": "Offer",
            priceCurrency: currencyCode,
            price: Number(price.toFixed(2)),
            availability:
              String(car.auction_status || "").toUpperCase() === "SOLD"
                ? "https://schema.org/SoldOut"
                : "https://schema.org/InStock",
            url: car.url || canonicalUrl,
          }
        : undefined,
    };

    return {
      title: `${title} | ${siteTitle}`,
      description,
      canonicalPath,
      ogType: "product",
      image: imageUrl,
      imageAlt: title,
      siteName: siteTitle,
      structuredData: vehicleSchema,
    };
  }, [car, id, loading, siteTitle]);

  useSeo(seoConfig);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
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
      } catch (e) {
        if (!active) return;
        addToast(String(e), "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, addToast]);

  const handleCopyVin = useCallback(
    async (vin) => {
      try {
        await navigator.clipboard.writeText(String(vin || ""));
        addToast("VIN copied to clipboard");
      } catch (error) {
        addToast("Unable to copy VIN", "error");
      }
    },
    [addToast]
  );

  if (loading) return <div className="state">Loading...</div>;
  if (!car) return <div className="state">Not found.</div>;

  return <CarDetailContent car={car} onCopyVin={handleCopyVin} />;
}
