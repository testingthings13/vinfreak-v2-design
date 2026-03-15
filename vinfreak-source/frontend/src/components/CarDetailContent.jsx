import { Link } from "react-router-dom";
import useLikeBurst from "../utils/useLikeBurst";
import DealershipLogo from "./DealershipLogo";
import CountdownTimer from "./CountdownTimer";
import { fmtDate, fmtMileage, fmtMoney, toList } from "../utils/text";
import { parseEndTime } from "../utils/time";
import usePriceHighlight from "../utils/usePriceHighlight";
import { useToast } from "../ToastContext";
import useCarLike from "../utils/useCarLike";

const SHOW_KEYS = [
  ["Year", "year"],
  ["Make", "make"],
  ["Model", "model"],
  ["Trim", "trim"],
  ["Body", "body_type"],
  ["Engine", "engine"],
  ["Fuel", "fuel_type"],
  ["Transmission", "transmission"],
  ["Drivetrain", "drivetrain"],
  ["Exterior", "exterior_color"],
  ["Interior", "interior_color"],
  ["Mileage", "__mileage"],
  ["Price", "__price"],
  ["Currency", "currency"],
  ["Location", "__location"],
  ["City", "city"],
  ["State", "state"],
  ["Seller", "seller_name"],
  ["Seller Type", "seller_type"],
  ["Auction", "auction_status"],
  ["Lot #", "lot_number"],
  ["Views", "number_of_views"],
  ["Bids", "number_of_bids"],
  ["Ends", "end_time"],
  ["VIN", "vin"],
];

export default function CarDetailContent({
  car,
  showBackLink = true,
  showPrimaryAction = true,
  onCopyVin,
}) {
  const { addToast } = useToast();
  const backHref = "/";
  const images = car.__images || [];
  const title = car.__title || car.title || "";
  const heroPrice = car.__price ?? car.price;
  const priceCurrency = car.currency || "USD";
  const auctionStatus = car.auction_status?.toUpperCase();
  const priceLabel = auctionStatus === "AUCTION_IN_PROGRESS" ? "Current Bid" : "Price";
  const heroPriceHighlight = usePriceHighlight(heroPrice);
  const heroPriceClassName = heroPriceHighlight
    ? "v price-value price-updated"
    : "v price-value";
  const specPriceClassName = heroPriceHighlight
    ? "spec-value price-value price-updated"
    : "spec-value price-value";
  const mileageValue = car.__mileage ?? car.mileage;
  const mileageLabel =
    mileageValue == null || mileageValue === ""
      ? "\u2014"
      : fmtMileage(mileageValue);
  const showDealershipLogo = Boolean(car?.dealership);
  const showCountdown = (() => {
    if (auctionStatus !== "AUCTION_IN_PROGRESS") return false;
    const end = parseEndTime(car?.end_time, { rollForward: false });
    if (!isNaN(end)) {
      return end > Date.now();
    }
    const timeLeft = car?.time_left ?? car?.timeLeft;
    if (timeLeft == null) return false;
    const parsed = parseInt(timeLeft, 10);
    return Number.isFinite(parsed) ? parsed > 0 : Boolean(String(timeLeft).trim());
  })();

  const highlights = toList(car.highlights);
  const equipment = toList(car.equipment);
  const modifications = toList(car.modifications);
  const flaws = toList(car.known_flaws);
  const service = toList(car.service_history);
  const notes = toList(car.seller_notes || car.other_items || car.ownership_history);

  const handleCopyVin = async () => {
    if (typeof onCopyVin === "function") {
      await onCopyVin(car.vin);
      return;
    }

    try {
      await navigator.clipboard.writeText(String(car.vin || ""));
    } catch {
      // ignore clipboard errors when no handler is provided
    }
  };

  const likeTargetId = (() => {
    if (car?.id != null) return car.id;
    const rawId = car?.__id;
    if (rawId == null) return null;
    const text = String(rawId).trim();
    if (!text) return null;
    return /^\d+$/.test(text) ? text : null;
  })();

  const {
    count: likeCount,
    liked: likeSelected,
    saving: likeSaving,
    addLike,
  } = useCarLike(
    likeTargetId,
    car.__likeCount ?? car.like_count,
    car.__liked ?? car.liked,
    {
      onError: (error) => {
        if (error) console.error("Failed to update like", error);
        addToast("Unable to update like right now.", "error");
      },
    }
  );

  const { bursting: likeBursting, variant: likeBurstVariant } = useLikeBurst(
    likeCount,
    likeSelected
  );
  const canLike = Boolean(likeTargetId);
  const likeCountLabel = `${likeCount} like${likeCount === 1 ? "" : "s"}`;
  const likeButtonClassName = [
    "btn like-button",
    likeBursting ? "burst" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="detail-wrap">
      {showBackLink && (
        <nav className="bread">
          <Link to={backHref}>Back</Link>
        </nav>
      )}

      <header className="detail-hero glass">
        <div className="hero-top">
          <h1>{title}</h1>
          <div className="hero-meta">
            {car.auction_status?.toUpperCase() === "SOLD" && <span className="ribbon sm">SOLD</span>}
            {showDealershipLogo && <DealershipLogo dealership={car.dealership} />}
          </div>
        </div>

        {images.length ? (
          <div className="hero-img">
            <img src={images[0]} alt={title} />
            {showCountdown && (
              <div className="countdown-badge">
                Ending in: <CountdownTimer endTime={car.end_time} />
              </div>
            )}
          </div>
        ) : (
          <div className="hero-img noimg">No Image</div>
        )}

        <div className="hero-specs">
          <div className="spec">
            <span className="k">{priceLabel}</span>
            <span className={heroPriceClassName}>
              {heroPrice != null ? fmtMoney(heroPrice, priceCurrency) : "—"}
            </span>
          </div>
          <div className="spec">
            <span className="k">Mileage</span>
            <span className="v">
              {mileageLabel}
            </span>
          </div>
          <div className="spec">
            <span className="k">Location</span>
            <span className="v">
              {car.__location ||
                car.location ||
                [car.city, car.state].filter(Boolean).join(", ") ||
                "—"}
            </span>
          </div>
        </div>

        {showPrimaryAction && (
          <div className="hero-actions">
            <button
              type="button"
              className={likeButtonClassName}
              onClick={addLike}
              disabled={likeSaving || !canLike}
              aria-label={`Like ${title}`}
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
                  {likeBurstVariant?.label || "🚗💥 +1!"}
                </span>
              <span className="like-icon" aria-hidden="true">👍</span>
              <span className="like-copy">
                <span className="like-label">Like</span>
                <span className="like-count">{likeCountLabel}</span>
              </span>
            </button>
            {car.url && (
              <a className="btn primary" href={car.url} target="_blank" rel="noreferrer">
                Open source listing
              </a>
            )}
          </div>
        )}
      </header>

      <section className="glass section">
        <h2>Specifications</h2>
        <div className="spec-grid">
          {SHOW_KEYS.map(([label, key]) => {
            if (key === "end_time") {
              const end = car[key];
              const valueNode = showCountdown ? (
                <div className="spec-value countdown">
                  <CountdownTimer endTime={end} />
                </div>
              ) : (
                <div className="spec-value">{fmtDate(end)}</div>
              );
              const lbl = showCountdown ? "Ending in" : label;
              return (
                <div className="kv spec-card" key={key}>
                  <span className="spec-label">{lbl}</span>
                  {valueNode}
                </div>
              );
            }

            if (key === "__price") {
              if (heroPrice == null) return null;
              return (
                <div className="kv spec-card" key={key}>
                  <span className="spec-label">{priceLabel}</span>
                  <div className={specPriceClassName}>
                    {fmtMoney(heroPrice, priceCurrency)}
                  </div>
                </div>
              );
            }

            let val;
            if (key === "__mileage") {
              const miles = car.__mileage ?? car.mileage;
              val = miles == null || miles === "" ? null : fmtMileage(miles);
            } else if (key === "__location") {
              val = car.__location || car.location || [car.city, car.state].filter(Boolean).join(", ");
            } else {
              val = car[key];
            }

            if (!val || val === "null" || val === "None") return null;

            const content =
              key === "vin" ? (
                <div className="spec-value vin">
                  {String(val)}
                  <button className="vin-copy" onClick={handleCopyVin} title="Copy VIN">
                    📋
                  </button>
                </div>
              ) : (
                <div className="spec-value">{String(val)}</div>
              );

            return (
              <div className="kv spec-card" key={key}>
                <span className="spec-label">{label}</span>
                {content}
              </div>
            );
          })}
        </div>
      </section>

      {car.description && (
        <section className="glass section">
          <h2>Description</h2>
          <p className="prewrap">{car.description}</p>
        </section>
      )}

      {highlights.length > 0 && (
        <section className="glass section">
          <h2>Highlights</h2>
          <ul className="bullets">
            {highlights.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {equipment.length > 0 && (
        <section className="glass section">
          <h2>Equipment</h2>
          <ul className="bullets">
            {equipment.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {modifications.length > 0 && (
        <section className="glass section">
          <h2>Modifications</h2>
          <ul className="bullets">
            {modifications.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {flaws.length > 0 && (
        <section className="glass section">
          <h2>Known Flaws</h2>
          <ul className="bullets">
            {flaws.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {service.length > 0 && (
        <section className="glass section">
          <h2>Service History</h2>
          <ul className="bullets">
            {service.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section className="glass section">
          <h2>Additional Notes</h2>
          <ul className="bullets">
            {notes.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
