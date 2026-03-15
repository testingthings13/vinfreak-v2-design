import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DealershipLogo from "./DealershipLogo";
import Badge from "./Badge";
import CountdownTimer from "./CountdownTimer";
import FreakStatsModal from "./FreakStatsModal";
import CommentsBadge from "./CommentsBadge";
import { fmtMileage, fmtMoney, fmtNum } from "../utils/text";
import { daysSince } from "../utils/time";
import isLiveAuction, {
  isAuctionSource,
  isNonAuctionListing,
} from "../utils/isLiveAuction";
import FreakStatsIcon from "../assets/freakstats.svg";
import { SettingsContext } from "../App";
import { adminDeleteCar, adminSetCarMainImage, API_BASE, postJSON } from "../api";
import usePriceHighlight from "../utils/usePriceHighlight";
import useCarLike from "../utils/useCarLike";
import useLikeBurst from "../utils/useLikeBurst";
import { useToast } from "../ToastContext";

function ShareIcon() {
  return (
    <svg
      className="share-glyph"
      viewBox="0 0 24 24"
      role="presentation"
      focusable="false"
      aria-hidden="true"
    >
      <path
        d="M12 3l4 4h-3v6h-2V7H8l4-4zm-7 8h2v7h10v-7h2v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7z"
        fill="currentColor"
      />
    </svg>
  );
}

const normalizeShareBase = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.replace(/\/share$/i, "");
};

const parseMoneyLikeValue = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^\d,.-]/g, "").replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function CarCard({
  car,
  isFreshListing = false,
  showNearestDistanceNote = false,
  nearestReferenceLabel = "",
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isDeletingAdmin, setIsDeletingAdmin] = useState(false);
  const [isMainImagePickerOpen, setIsMainImagePickerOpen] = useState(false);
  const [isSettingMainImage, setIsSettingMainImage] = useState(false);
  const [mainImageSelection, setMainImageSelection] = useState("");
  const [mainImageOverride, setMainImageOverride] = useState("");
  const [estimatedValueOverride, setEstimatedValueOverride] = useState(null);
  const settings = useContext(SettingsContext);
  const { addToast } = useToast();
  const id = car.__id;
  const transmissionTag = car.__transmission;
  const distanceMiles = (() => {
    const raw =
      car?.distance_miles ??
      car?.__distance ??
      (car?.stats ? car.stats.distance : undefined);
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    return num;
  })();
  const roundedDistanceMiles =
    distanceMiles == null ? null : Math.round(distanceMiles);
  const distanceLabel = (() => {
    if (roundedDistanceMiles == null) return "\u2014";
    const unit = roundedDistanceMiles === 1 ? "mile" : "miles";
    return `${fmtNum(roundedDistanceMiles)} ${unit}`;
  })();
  const resolvedNearestReferenceLabel =
    typeof nearestReferenceLabel === "string" && nearestReferenceLabel.trim()
      ? nearestReferenceLabel.trim()
      : "your area";
  const distanceFromReferenceLabel = (() => {
    if (!showNearestDistanceNote || distanceMiles == null) return null;
    return `from ${resolvedNearestReferenceLabel}`;
  })();
  const distanceDisplayLabel = distanceFromReferenceLabel
    ? `${distanceLabel} ${distanceFromReferenceLabel}`
    : distanceLabel;
  const sourceKey = String(car?.__source ?? car?.source ?? "").toLowerCase();
  const isFacebookSource =
    sourceKey === "facebook_marketplace" || sourceKey.includes("facebook");
  const isPCAMartSource = sourceKey === "pca";
  const prefersSourceListedTime = isFacebookSource || isPCAMartSource;
  const listedDays = (() => {
    const sources = prefersSourceListedTime
      ? [
          car?.posted_at,
          car?.postedAt,
          car?.listed_at,
          car?.listedAt,
          car?.created_at,
          car?.createdAt,
        ]
      : [
          car?.created_at,
          car?.createdAt,
          car?.posted_at,
          car?.postedAt,
          car?.listed_at,
          car?.listedAt,
        ];
    const candidates = sources.filter((value) => value != null && value !== "");
    for (const candidate of candidates) {
      const result = daysSince(candidate);
      if (typeof result === "number" && Number.isFinite(result)) {
        return result;
      }
    }
    return null;
  })();
  const listedLabel = (() => {
    return `Days Listed: ${listedDays != null ? fmtNum(listedDays) : "\u2014"}`;
  })();
  const adminDeleteId = useMemo(() => {
    if (id == null) return null;
    const text = String(id).trim();
    if (!text || !/^\d+$/.test(text)) return null;
    return text;
  }, [id]);
  const canAdminDelete =
    Boolean(settings?.admin_can_delete_cars) &&
    Boolean(settings?.admin_delete_csrf_token) &&
    Boolean(adminDeleteId);
  const adminImageOptions = useMemo(() => {
    const seen = new Set();
    const values = [];
    const pushImage = (value) => {
      if (typeof value !== "string") return;
      const cleaned = value.trim();
      if (!cleaned || seen.has(cleaned)) return;
      seen.add(cleaned);
      values.push(cleaned);
    };
    pushImage(mainImageOverride || car.__image);
    if (Array.isArray(car?.__images)) {
      car.__images.forEach(pushImage);
    }
    return values;
  }, [car.__image, car?.__images, mainImageOverride]);
  const cardMainImage = adminImageOptions[0] || "";
  const canAdminSetMainImage = canAdminDelete && adminImageOptions.length > 1;
  const showCountdown = isLiveAuction(car);
  const listingUrl = car.url && typeof car.url === "string" ? car.url : null;
  const thumbClassName = "thumb";
  const ThumbComponent = listingUrl ? "a" : "div";
  const thumbProps = listingUrl
    ? { href: listingUrl, target: "_blank", rel: "noopener noreferrer" }
    : {};
  const auctionStatusRaw =
    car?.auction_status ??
    car?.__auction_status ??
    car?.status ??
    car?.__status ??
    null;
  const auctionStatus = useMemo(() => {
    if (typeof auctionStatusRaw !== "string") return null;
    const normalized = auctionStatusRaw.trim().toUpperCase();
    return normalized || null;
  }, [auctionStatusRaw]);
  const listingType = useMemo(() => {
    if (auctionStatus === "AUCTION_IN_PROGRESS") {
      return { key: "auction", label: "Auction" };
    }
    if (isAuctionSource(car)) {
      return { key: "auction", label: "Auction" };
    }
    if (isFacebookSource) {
      return { key: "facebook", label: "FB Marketplace" };
    }
    if (isPCAMartSource) {
      return { key: "dealership", label: "Private Seller" };
    }
    if (auctionStatus === "LIVE") {
      return { key: "dealership", label: "Dealership" };
    }
    if (isNonAuctionListing(car)) {
      return { key: "dealership", label: "Dealership" };
    }
    return null;
  }, [auctionStatus, car, isFacebookSource, isPCAMartSource]);
  const isAuctionInProgress = auctionStatus === "AUCTION_IN_PROGRESS";
  const priceLabel = isAuctionInProgress ? "Current Bid" : "Price";
  const priceHighlightActive = usePriceHighlight(car.__price);
  const priceClassName = priceHighlightActive
    ? "v price-value price-updated"
    : "v price-value";
  const estimatedValueLabel = useMemo(() => {
    const textCandidates = [
      car?.__freakstatsEstimatedValue,
      car?.freakstats_estimated_value,
      car?.estimated_sale_price,
    ];
    for (const candidate of textCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        const parsedCandidateValue = parseMoneyLikeValue(candidate);
        if (Number.isFinite(parsedCandidateValue) && parsedCandidateValue > 0) {
          return fmtMoney(parsedCandidateValue, car.currency || "USD");
        }
        return candidate.trim();
      }
    }

    const numericCandidate = Number(
      car?.__freakstatsEstimatedValueNumber ??
        car?.freakstats_estimated_value_number ??
        car?.estimated_sale_price_value
    );
    if (Number.isFinite(numericCandidate) && numericCandidate > 0) {
      return fmtMoney(numericCandidate, car.currency || "USD");
    }
    return "\u2014";
  }, [
    car?.__freakstatsEstimatedValue,
    car?.freakstats_estimated_value,
    car?.estimated_sale_price,
    car?.__freakstatsEstimatedValueNumber,
    car?.freakstats_estimated_value_number,
    car?.estimated_sale_price_value,
    car?.currency,
  ]);
  const estimatedValueDisplay = estimatedValueOverride || estimatedValueLabel;
  const shouldRerunEstimate = useMemo(() => {
    if (!isAuctionInProgress || !listingUrl) return false;
    const currentBid = Number(car?.__price ?? car?.price);
    if (!Number.isFinite(currentBid) || currentBid <= 0) return false;

    const numericCandidates = [
      Number(
        car?.__freakstatsEstimatedValueNumber ??
          car?.freakstats_estimated_value_number ??
          car?.estimated_sale_price_value
      ),
      parseMoneyLikeValue(car?.__freakstatsEstimatedValue),
      parseMoneyLikeValue(car?.freakstats_estimated_value),
      parseMoneyLikeValue(car?.estimated_sale_price),
    ];
    const estimateValue = numericCandidates.find(
      (value) => Number.isFinite(value) && value > 0
    );
    if (!Number.isFinite(estimateValue)) return false;

    return estimateValue < currentBid;
  }, [
    car?.__freakstatsEstimatedValue,
    car?.freakstats_estimated_value,
    car?.estimated_sale_price,
    car?.__freakstatsEstimatedValueNumber,
    car?.freakstats_estimated_value_number,
    car?.estimated_sale_price_value,
    car?.__price,
    car?.price,
    isAuctionInProgress,
    listingUrl,
  ]);
  const mileageValue = car?.__mileage ?? car?.mileage;
  const mileageLabel =
    mileageValue == null || mileageValue === ""
      ? "\u2014"
      : fmtMileage(mileageValue);
  const dealershipName = (() => {
    const { dealership } = car ?? {};
    if (!dealership) return "";
    const candidates = [
      dealership?.name,
      dealership?.display_name,
      dealership?.__name,
      dealership?.short_name,
      typeof dealership === "string" ? dealership : null,
    ];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim() !== "") {
        return value.trim();
      }
    }
    return "";
  })();
  const listingSourceLabel = isFacebookSource
    ? "FB Marketplace"
    : dealershipName || "Dealership";
  const showDealershipLogo = Boolean(car?.dealership);

  const handleOpenModal = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const configuredIconSrc = useMemo(() => {
    const raw = settings?.freakstats_icon_url;
    if (!raw) return FreakStatsIcon;
    const trimmed = String(raw).trim();
    if (!trimmed) return FreakStatsIcon;
    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("data:") ||
      trimmed.startsWith("blob:")
    ) {
      return trimmed;
    }
    if (trimmed.startsWith("/")) {
      return `${API_BASE}${trimmed}`;
    }
    return `${API_BASE}/${trimmed}`;
  }, [settings?.freakstats_icon_url]);

  const handleLikeError = useCallback(
    (error) => {
      if (error) console.error("Failed to update like", error);
      addToast("Unable to update like right now.", "error");
    },
    [addToast]
  );

  const likeTargetId = useMemo(() => {
    if (id == null) return null;
    const text = String(id).trim();
    if (!text) return null;
    return /^\d+$/.test(text) ? text : null;
  }, [id]);

  const {
    count: likeCount,
    liked: likeSelected,
    saving: likeSaving,
    addLike,
  } = useCarLike(
    likeTargetId,
    car.__likeCount ?? car.like_count,
    car.__liked ?? car.liked,
    { onError: handleLikeError }
  );

  const { bursting: likeBursting, variant: likeBurstVariant } = useLikeBurst(
    likeCount,
    likeSelected
  );
  const canLike = Boolean(likeTargetId);
  const likeCountLabel = `${likeCount} like${likeCount === 1 ? "" : "s"}`;
  const likeCountValue = fmtNum(likeCount);
  const likeButtonClassName = [
    "btn like-button like-button--chip",
    likeSelected ? "liked" : null,
    likeBursting ? "burst" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const [shareState, setShareState] = useState("idle");
  const shareResetRef = useRef(null);
  const shareBase = useMemo(() => {
    const normalizeAbsolute = (value) => {
      if (typeof value !== "string" || !value.trim()) return "";
      try {
        const url = new URL(value.trim());
        const path = url.pathname.replace(/\/+$/, "");
        return `${url.origin}${path}`;
      } catch {
        return "";
      }
    };

    const derivePublicFromApiHost = (value) => {
      if (typeof value !== "string" || !value.trim()) return "";
      try {
        const url = new URL(value.trim());
        const hostname = (url.hostname || "").trim();
        if (!hostname.toLowerCase().startsWith("api.")) return "";
        const publicHost = hostname.slice(4);
        if (!publicHost) return "";
        const port = url.port ? `:${url.port}` : "";
        const path = url.pathname.replace(/\/+$/, "");
        return `${url.protocol}//${publicHost}${port}${path}`;
      } catch {
        return "";
      }
    };

    const candidates = [];
    const seen = new Set();
    const pushCandidate = (value) => {
      const normalized = normalizeAbsolute(value);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        candidates.push(normalized);
      }
    };

    const rawSetting =
      typeof settings?.share_base_url === "string"
        ? settings.share_base_url.trim()
        : "";
    const publicSiteUrl =
      typeof settings?.public_site_url === "string"
        ? settings.public_site_url.trim()
        : "";
    const siteUrl =
      typeof settings?.site_url === "string" ? settings.site_url.trim() : "";
    const hasConfiguredShareBase = Boolean(rawSetting || publicSiteUrl || siteUrl);

    const windowOrigin =
      typeof window !== "undefined" && window?.location?.origin
        ? window.location.origin
        : "";

    if (rawSetting) {
      // Allow explicit absolute URLs to take precedence.
      pushCandidate(rawSetting);

      if (windowOrigin) {
        try {
          const viaWindow = new URL(rawSetting, windowOrigin);
          pushCandidate(viaWindow.toString());
        } catch {
          // ignore invalid combinations
        }
      }

      try {
        const viaApi = new URL(rawSetting, API_BASE);
        pushCandidate(viaApi.toString());
      } catch {
        // ignore invalid combinations
      }
    }

    pushCandidate(publicSiteUrl);
    pushCandidate(siteUrl);

    const normalizedApiBase = normalizeAbsolute(API_BASE);
    const normalizedWindowOrigin = normalizeAbsolute(windowOrigin);
    const splitHostDeployment =
      !hasConfiguredShareBase &&
      normalizedApiBase &&
      normalizedWindowOrigin &&
      (() => {
        try {
          return (
            new URL(normalizedApiBase).host.toLowerCase() !==
            new URL(normalizedWindowOrigin).host.toLowerCase()
          );
        } catch {
          return false;
        }
      })();

    if (splitHostDeployment) {
      // Split frontend/API deployments need the API host for SSR OG metadata.
      pushCandidate(normalizedApiBase);
    }

    if (windowOrigin) {
      pushCandidate(windowOrigin);
      pushCandidate(derivePublicFromApiHost(windowOrigin));
    }

    if (normalizedApiBase) {
      pushCandidate(derivePublicFromApiHost(normalizedApiBase));
      pushCandidate(normalizedApiBase);
    }

    return normalizeShareBase(candidates[0] || "");
  }, [settings?.public_site_url, settings?.share_base_url, settings?.site_url]);

  const shareUrl = useMemo(() => {
    if (!id || !shareBase) return "";
    const encodedId = encodeURIComponent(id);
    const base = shareBase.replace(/\/+$/, "");
    const versionSource =
      car?.updated_at ??
      car?.posted_at ??
      car?.created_at ??
      car?.end_time ??
      "";
    const versionToken = String(versionSource || "")
      .replace(/[^0-9A-Za-z]+/g, "")
      .slice(0, 16);
    if (!versionToken) {
      return `${base}/share/${encodedId}`;
    }
    return `${base}/share/${encodedId}/${versionToken}`;
  }, [car?.created_at, car?.end_time, car?.posted_at, car?.updated_at, id, shareBase]);

  const resetShareState = useCallback(() => {
    setShareState("idle");
    if (shareResetRef.current) {
      clearTimeout(shareResetRef.current);
      shareResetRef.current = null;
    }
  }, []);

  const scheduleShareReset = useCallback(() => {
    if (shareResetRef.current) {
      clearTimeout(shareResetRef.current);
    }
    shareResetRef.current = setTimeout(() => {
      setShareState("idle");
      shareResetRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => () => {
    if (shareResetRef.current) {
      clearTimeout(shareResetRef.current);
    }
  }, []);

  useEffect(() => {
    setEstimatedValueOverride(null);
    if (!shouldRerunEstimate || !listingUrl) return undefined;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const refreshPayload = await postJSON(
          "/freakstats/insights",
          {
            url: listingUrl,
            car: {
              __price: car?.__price,
              price: car?.price,
              auction_status:
                car?.auction_status ??
                car?.__auction_status ??
                car?.status ??
                car?.__status,
              __auction_status:
                car?.__auction_status ??
                car?.auction_status ??
                car?.__status ??
                car?.status,
              status: car?.status ?? car?.__status ?? car?.auction_status,
              __status: car?.__status ?? car?.status ?? car?.auction_status,
            },
          },
          {
            timeoutMs: 120000,
            signal: controller.signal,
          }
        );
        if (cancelled) return;

        const numericEstimate = Number(refreshPayload?.estimated_sale_price_value);
        if (Number.isFinite(numericEstimate) && numericEstimate > 0) {
          setEstimatedValueOverride(fmtMoney(numericEstimate, car.currency || "USD"));
          return;
        }

        const textEstimate =
          typeof refreshPayload?.estimated_sale_price === "string"
            ? refreshPayload.estimated_sale_price.trim()
            : "";
        if (!textEstimate) return;
        const parsedTextEstimate = parseMoneyLikeValue(textEstimate);
        if (Number.isFinite(parsedTextEstimate) && parsedTextEstimate > 0) {
          setEstimatedValueOverride(fmtMoney(parsedTextEstimate, car.currency || "USD"));
          return;
        }
        setEstimatedValueOverride(textEstimate);
      } catch (error) {
        if (!cancelled && error?.name !== "AbortError") {
          console.error("Failed to refresh estimated value", error);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    shouldRerunEstimate,
    listingUrl,
    car?.__price,
    car?.price,
    car?.auction_status,
    car?.__auction_status,
    car?.status,
    car?.__status,
    car?.currency,
    id,
  ]);

  const copyToClipboard = useCallback(async (value) => {
    if (!value) return false;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      const selection = document.getSelection();
      const previousRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
      textarea.select();
      const succeeded = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (previousRange && selection) {
        selection.removeAllRanges();
        selection.addRange(previousRange);
      }
      return succeeded;
    }
    return false;
  }, []);

  const handleShare = useCallback(async () => {
    if (!shareUrl) {
      addToast("Share link unavailable", "error");
      return;
    }
    try {
      if (navigator?.share) {
        await navigator.share({
          url: shareUrl,
        });
        setShareState("shared");
        addToast("Shared successfully!");
        scheduleShareReset();
        return;
      }
      const copied = await copyToClipboard(shareUrl);
      if (copied) {
        setShareState("copied");
        addToast("Share link copied");
        scheduleShareReset();
        return;
      }
      throw new Error("Copy not supported");
    } catch (error) {
      if (error?.name === "AbortError") {
        resetShareState();
        return;
      }
      if (error?.name === "NotAllowedError") {
        const copied = await copyToClipboard(shareUrl);
        if (copied) {
          setShareState("copied");
          addToast("Share link copied");
          scheduleShareReset();
          return;
        }
        resetShareState();
        return;
      }
      console.error("Share failed", error);
      addToast("Unable to share right now.", "error");
      resetShareState();
    }
  }, [
    addToast,
    copyToClipboard,
    resetShareState,
    scheduleShareReset,
    shareUrl,
  ]);

  const shareButtonClassName = [
    "btn share-button share-button--chip",
    shareState !== "idle" ? "share-button--active" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const handleAdminDelete = useCallback(async () => {
    if (!adminDeleteId || isDeletingAdmin) return;
    const confirmed = window.confirm(
      "Permanently delete this car? This cannot be undone."
    );
    if (!confirmed) return;

    setIsDeletingAdmin(true);
    try {
      await adminDeleteCar(
        adminDeleteId,
        settings?.admin_delete_csrf_token,
        settings?.admin_api_base
      );
      setIsDeleted(true);
      addToast("Car permanently deleted");
    } catch (error) {
      const fallback = "Unable to delete this car right now.";
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message
          : fallback;
      addToast(message, "error");
    } finally {
      setIsDeletingAdmin(false);
    }
  }, [
    addToast,
    adminDeleteId,
    isDeletingAdmin,
    settings?.admin_api_base,
    settings?.admin_delete_csrf_token,
  ]);

  const handleOpenMainImagePicker = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canAdminSetMainImage || isSettingMainImage) return;
      setMainImageSelection(cardMainImage || adminImageOptions[0] || "");
      setIsMainImagePickerOpen(true);
    },
    [adminImageOptions, canAdminSetMainImage, cardMainImage, isSettingMainImage]
  );

  const handleCloseMainImagePicker = useCallback(() => {
    if (isSettingMainImage) return;
    setIsMainImagePickerOpen(false);
  }, [isSettingMainImage]);

  const handleSetMainImage = useCallback(async () => {
    if (!adminDeleteId || isSettingMainImage) return;
    const selectedImage = String(mainImageSelection || "").trim();
    if (!selectedImage) {
      addToast("Select an image first.", "error");
      return;
    }
    setIsSettingMainImage(true);
    try {
      await adminSetCarMainImage(
        adminDeleteId,
        selectedImage,
        settings?.admin_delete_csrf_token,
        settings?.admin_api_base
      );
      setMainImageOverride(selectedImage);
      setIsMainImagePickerOpen(false);
      addToast("Main image updated");
    } catch (error) {
      const fallback = "Unable to update the main image right now.";
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message
          : fallback;
      addToast(message, "error");
    } finally {
      setIsSettingMainImage(false);
    }
  }, [
    addToast,
    adminDeleteId,
    isSettingMainImage,
    mainImageSelection,
    settings?.admin_api_base,
    settings?.admin_delete_csrf_token,
  ]);

  useEffect(() => {
    setIsMainImagePickerOpen(false);
    setIsSettingMainImage(false);
    setMainImageSelection("");
    setMainImageOverride("");
  }, [id, car.__image]);

  const detailPath = useMemo(() => {
    if (!id) return "/";
    return `/car/${encodeURIComponent(id)}`;
  }, [id]);
  const freakStatsInlineLabel = `Open FREAKStats AI insights for ${car.__title}`;
  const freakStatsLoadLabel = `Load FREAKStats estimate for ${car.__title}`;

  if (isDeleted) return null;

  return (
    <>
      <article className="card glass">
        <ThumbComponent className={thumbClassName} {...thumbProps}>
          {cardMainImage ? (
            <img src={cardMainImage} alt={car.__title} loading="lazy" />
          ) : (
            <div className="noimg">No Photo</div>
          )}
          {isFreshListing && <div className="ribbon ribbon-new">NEW</div>}
          {car.__status === "SOLD" && <div className="ribbon">SOLD</div>}
          {listingType && (
            <div className={`listing-type-badge ${listingType.key}`}>
              {listingType.label}
            </div>
          )}
          {showCountdown && (
            <div className="countdown-badge">
              Ending in: <CountdownTimer endTime={car.end_time} timeLeft={car.time_left} />
            </div>
          )}
        </ThumbComponent>

        <div className="card-body">
          <div className="card-head">
            {listingUrl ? (
              <a
                href={listingUrl}
                className="ctitle"
                target="_blank"
                rel="noopener noreferrer"
              >
                {car.__title}
              </a>
            ) : (
              <Link to={detailPath} className="ctitle">{car.__title}</Link>
            )}
            <div className="meta">
              {showDealershipLogo && (
                listingUrl ? (
                  <a
                    href={listingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dealership-link"
                    title={car.dealership?.name || ""}
                  >
                    <DealershipLogo dealership={car.dealership} />
                  </a>
                ) : (
                  <DealershipLogo dealership={car.dealership} />
                )
              )}
            </div>
          </div>

          <div className="brief card-chip-row card-chip-row--meta">
            <button
              type="button"
              className={likeButtonClassName}
              onClick={addLike}
              disabled={likeSaving || !canLike}
              aria-label={`Like ${car.__title} (${likeCountLabel})`}
            >
              <span
                className={[
                  "like-burst",
                  likeBurstVariant?.className || null,
                  likeBursting ? "visible" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden="true"
              >
                {likeBurstVariant?.label || "\u{1F697}\u{1F4A5} +1!"}
              </span>
              <span className="like-icon" aria-hidden="true">{"\u{1F44D}"}</span>
              <span className="sr-only">Thumbs up icon</span>
              <span className="like-count" aria-hidden="true">{likeCountValue}</span>
            </button>
              <CommentsBadge
                carId={id}
                carTitle={car.__title}
                carImage={cardMainImage}
                carMetaValue={car.__location || null}
              />
            {transmissionTag && (
              <span><Badge tone="muted">{transmissionTag}</Badge></span>
            )}
            <span className="listed-badge-wrap">
              <Badge tone="muted">{listedLabel}</Badge>
              {canAdminDelete && (
                <button
                  type="button"
                  className="btn admin-trash-button"
                  onClick={handleAdminDelete}
                  disabled={isDeletingAdmin}
                  title="Delete listing"
                  aria-label="Delete listing"
                >
                  &#128465;
                </button>
              )}
            </span>
            <span className="card-meta-right-actions">
              {canAdminSetMainImage && (
                <button
                  type="button"
                  className="btn admin-image-button"
                  onClick={handleOpenMainImagePicker}
                  disabled={isSettingMainImage}
                  title="Change main image"
                  aria-label="Change main image"
                >
                  IMG
                </button>
              )}
              <button
                type="button"
                className={shareButtonClassName}
                onClick={handleShare}
                aria-label={`Share ${car.__title}`}
                disabled={!shareUrl}
              >
                <span className="share-icon" aria-hidden="true">
                  <ShareIcon />
                </span>
                <span className="sr-only">Share icon</span>
              </button>
            </span>
          </div>

          <div className="specrow">
            <div>
              <span className="k">{priceLabel}</span>
              <span className={priceClassName}>
                {fmtMoney(car.__price, car.currency || "USD")}
              </span>
              {isAuctionInProgress && (
                <>
                  <span className="k">Estimated Value</span>
                  <span className="v spec-value-inline">
                    <span>{estimatedValueDisplay}</span>
                    <button
                      type="button"
                      className="freakstats-inline-trigger"
                      onClick={handleOpenModal}
                      aria-label={freakStatsInlineLabel}
                    >
                      <img
                        src={configuredIconSrc}
                        alt=""
                        aria-hidden="true"
                        className="freakstats-inline-trigger__icon"
                      />
                      <span className="sr-only">Open FREAKStats AI insights</span>
                    </button>
                  </span>
                </>
              )}
            </div>
            <div><span className="k">Mileage</span><span className="v">{mileageLabel}</span></div>
            <div><span className="k">Location</span><span className="v">{car.__location || "\u2014"}</span></div>
            {!isAuctionInProgress && (
              <div className="spec-item--estimated-load">
                <span className="k">Estimated Value</span>
                <span className="v spec-value-inline spec-value-inline--load">
                  <span className="freakstats-estimate-copy">View estimation with FREAKStats</span>
                  <button
                    type="button"
                    className="freakstats-inline-trigger freakstats-inline-trigger--estimate"
                    onClick={handleOpenModal}
                    aria-label={freakStatsLoadLabel}
                  >
                    <img
                      src={configuredIconSrc}
                      alt=""
                      aria-hidden="true"
                      className="freakstats-inline-trigger__icon"
                    />
                    <span className="sr-only">Open FREAKStats AI insights</span>
                  </button>
                </span>
              </div>
            )}
            {distanceMiles != null && (
              <div className="spec-item--distance">
                <span className="k">Distance</span>
                <span className="v">{distanceDisplayLabel}</span>
              </div>
            )}

          </div>

          {listingUrl && (
            <div className="actions">
              <div className="actions__primary card-chip-row card-chip-row--footer">
                <a
                  href={listingUrl}
                  className="btn listing-link-chip"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View directly on ${listingSourceLabel}`}
                >
                  <span>🔗 View directly on </span>
                  <strong className="listing-link-chip__source">{listingSourceLabel}</strong>
                </a>
              </div>
            </div>
          )}
        </div>
      </article>

      {isMainImagePickerOpen && (
        <div
          className="admin-main-image-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Choose main image for ${car.__title}`}
          onClick={handleCloseMainImagePicker}
        >
          <div
            className="admin-main-image-modal__dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="admin-main-image-modal__title">Set Main Image</h3>
            <p className="admin-main-image-modal__hint">
              Pick one of the available images for this listing.
            </p>
            <div className="admin-main-image-modal__actions">
              <button
                type="button"
                className="btn"
                onClick={handleCloseMainImagePicker}
                disabled={isSettingMainImage}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleSetMainImage}
                disabled={isSettingMainImage || !mainImageSelection}
              >
                {isSettingMainImage ? "Saving..." : "Set Main Image"}
              </button>
            </div>
            <div className="admin-main-image-modal__grid">
              {adminImageOptions.map((imageUrl, index) => (
                <label className="admin-main-image-modal__option" key={`${id}-img-${index}`}>
                  <input
                    type="radio"
                    name={`main-image-${id}`}
                    value={imageUrl}
                    checked={mainImageSelection === imageUrl}
                    onChange={() => setMainImageSelection(imageUrl)}
                    disabled={isSettingMainImage}
                  />
                  <img src={imageUrl} alt={`${car.__title} option ${index + 1}`} loading="lazy" />
                  <span>
                    {index + 1}
                    {imageUrl === cardMainImage ? " (Current)" : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && <FreakStatsModal carId={id} onClose={handleCloseModal} />}
    </>
  );
}
