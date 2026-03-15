import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API_BASE, getJSON } from "../api";
import { normalizeCar } from "../utils/normalizeCar";
import { resolveListingDealership } from "../utils/dealerships";
import { useToast } from "../ToastContext";
import FreakStatsInsights from "./FreakStatsInsights";
import { fetchFreakStatsInsights } from "../grok";
import { SettingsContext } from "../App";
import FreakStatsIcon from "../assets/freakstats.svg";

const MIN_INSIGHTS_LOADING_DURATION_MS = 2000;

export default function FreakStatsModal({ carId, onClose }) {
  const [car, setCar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  const { addToast } = useToast();
  const settings = useContext(SettingsContext);
  const closeButtonRef = useRef(null);
  const modalOpenedAtRef = useRef(Date.now());
  const dialogTitleId = useMemo(() => "freakstats-modal-title", []);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, []);

  useEffect(() => {
    modalOpenedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setCar(null);
        const data = await getJSON(`/cars/${encodeURIComponent(carId)}`);
        const normalized = normalizeCar(data);
        const dealership = resolveListingDealership(normalized, {
          rawDealership: data?.dealership || null,
        });
        if (!active) return;
        const carPayload = {
          ...normalized,
          dealership,
        };
        setCar(carPayload);
        setInsights(null);
        setInsightsError(null);
      } catch (error) {
        if (active) {
          addToast(String(error), "error");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [carId, addToast]);

  useEffect(() => {
    if (!car?.url) return undefined;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      const startedAt = Date.now();
      try {
        setInsightsLoading(true);
        setInsights(null);
        setInsightsError(null);
        const result = await fetchFreakStatsInsights(car, {
          signal: controller.signal,
        });
        if (!cancelled) {
          setInsights(result || null);
        }
      } catch (error) {
        if (!cancelled && (error?.name !== "AbortError" || !controller.signal.aborted)) {
          const message = error?.message || String(error);
          setInsightsError(message);
          addToast(message, "error");
        }
      } finally {
        if (!cancelled) {
          const elapsed = Date.now() - startedAt;
          const remaining = Math.max(0, MIN_INSIGHTS_LOADING_DURATION_MS - elapsed);
          if (remaining > 0) {
            await new Promise((resolve) => setTimeout(resolve, remaining));
          }
          if (!cancelled) {
            setInsightsLoading(false);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [car, addToast]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (typeof onClose === "function") {
          onClose();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!loading && closeButtonRef.current) {
      closeButtonRef.current.focus({ preventScroll: true });
    }
  }, [loading]);

  const handleBackdropClick = useCallback(
    (event) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      const nativeEvent = event.nativeEvent || event;
      const pointerType = nativeEvent?.pointerType;
      const detail = nativeEvent?.detail;
      const elapsedSinceOpen = Date.now() - modalOpenedAtRef.current;
      const pointerIsTouchLike = pointerType === "touch" || pointerType === "pen";
      const shouldIgnoreEvent =
        elapsedSinceOpen < 300 ||
        detail === 0 ||
        (pointerIsTouchLike && elapsedSinceOpen < 400);

      if (shouldIgnoreEvent) {
        return;
      }

      if (typeof onClose === "function") {
        onClose();
      }
    },
    [onClose]
  );

  const handleClose = useCallback(() => {
    if (typeof onClose === "function") {
      onClose();
    }
  }, [onClose]);

  const carTitle =
    car?.__title ||
    car?.title ||
    [car?.year, car?.make, car?.model, car?.trim].filter(Boolean).join(" ") ||
    "Vehicle";
  const primaryImage = car?.__image || car?.__images?.[0] || null;
  const listingUrl = useMemo(() => {
    if (!car?.url || typeof car.url !== "string") {
      return null;
    }
    const trimmed = car.url.trim();
    return trimmed ? trimmed : null;
  }, [car?.url]);

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
  const listingDealershipLabel = dealershipName || "Dealership";

  const locationLabel = useMemo(() => {
    if (!car) return "";
    const candidates = [
      car?.__location,
      car?.location,
      [car?.city, car?.state].filter(Boolean).join(", "),
      car?.location_address,
      car?.dealership?.location,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (typeof candidate === "string") {
        const trimmed = candidate.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return "";
  }, [car]);

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

  const iconStyle = useMemo(() => {
    const style = {};
    const widthValue = Number(settings?.freakstats_icon_width);
    const heightValue = Number(settings?.freakstats_icon_height);
    if (Number.isFinite(widthValue) && widthValue > 0) {
      style.width = `${widthValue}px`;
    }
    if (Number.isFinite(heightValue) && heightValue > 0) {
      style.height = `${heightValue}px`;
    }
    if (style.width || style.height) {
      style.objectFit = "contain";
      style.flexShrink = 0;
    }
    return Object.keys(style).length ? style : undefined;
  }, [settings?.freakstats_icon_height, settings?.freakstats_icon_width]);

  const content = (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <div
        className="modal-panel glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id={dialogTitleId} className="freakstats-modal-title">
            <span className="sr-only">FREAKSTATS</span>
            <span className="freakstats-modal-title__visual" aria-hidden="true">
              <span className="freakstats-modal-title__text">FRESH INSIGHTS</span>
              <span className="freakstats-card__powered">
                Powered by FREAKSTATS
                {configuredIconSrc ? (
                  <img
                    src={configuredIconSrc}
                    alt=""
                    aria-hidden="true"
                    className="freakstats-modal-title__icon"
                    style={iconStyle}
                  />
                ) : null}
              </span>
            </span>
          </h2>
          <div className="modal-header-actions">
            <button type="button" className="btn ghost" onClick={handleClose}>
              Back to list
            </button>
            <button
              type="button"
              className="modal-close"
              onClick={handleClose}
              ref={closeButtonRef}
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
        </header>
        <div className="modal-body">
          {loading && <div className="modal-loading">Loading…</div>}
          {!loading && car && (
            <>
              <section className="glass section freakstats-card">
                <div className="freakstats-card__header">
                  <h3 className="freakstats-card__title">{carTitle}</h3>
                  {locationLabel && (
                    <div className="freakstats-card__meta">
                      <div className="freakstats-card__meta-item">
                        <span className="freakstats-card__meta-value">{locationLabel}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="freakstats-card__grid">
                  <div className="freakstats-card__media">
                    {primaryImage ? (
                      <img src={primaryImage} alt={carTitle || "Vehicle"} />
                    ) : (
                      <div className="freakstats-card__media-placeholder">No image</div>
                    )}
                  </div>
                  <div
                    className="freakstats-card__insights"
                    aria-live="polite"
                    aria-busy={insightsLoading}
                  >
                    {insightsLoading ? (
                      <div className="freakstats-card__loading">
                        <span className="freakstats-card__spinner" aria-hidden="true" />
                        <span className="freakstats-card__loading-text">Loading fresh insights</span>
                      </div>
                    ) : insights ? (
                      <div className="freakstats-card__insights-content">
                        <FreakStatsInsights
                          text={insights}
                          iconSrc={configuredIconSrc}
                          iconStyle={iconStyle}
                        />
                      </div>
                    ) : insightsError ? (
                      <div className="modal-error freakstats-card__error">{insightsError}</div>
                    ) : null}
                  </div>
                </div>
                {listingUrl && (
                  <div className="freakstats-card__actions">
                    <a
                      href={listingUrl}
                      className="btn dealership freakstats-card__action"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View directly on ${listingDealershipLabel}`}
                    >
                      <span className="eyebrow">View directly on</span>
                      <span className="dealership-name">
                        {listingDealershipLabel}
                      </span>
                    </a>
                  </div>
                )}
              </section>
            </>
          )}
          {!loading && !car && <div className="modal-error">Unable to load listing.</div>}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
