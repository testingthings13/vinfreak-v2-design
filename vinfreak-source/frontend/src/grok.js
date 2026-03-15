import { postJSON } from "./api";

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const SOURCE_EMAIL_MAP = {
  bringatrailer: "info@bringatrailer.com",
  "bring a trailer": "info@bringatrailer.com",
  carsandbids: "support@carsandbids.com",
  "cars & bids": "support@carsandbids.com",
};

const HOST_EMAIL_MAP = {
  "bringatrailer.com": "info@bringatrailer.com",
  "carsandbids.com": "support@carsandbids.com",
};

function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

function safePick(value) {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    return value;
  }
  if (value === 0) {
    return value;
  }
  return isBlank(value) ? undefined : value;
}

function getDealershipName(dealership) {
  if (!dealership) return undefined;
  if (typeof dealership === "string") return dealership.trim() || undefined;
  if (typeof dealership === "object") {
    const fields = ["display_name", "short_name", "name", "title"];
    for (const field of fields) {
      const candidate = dealership[field];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return undefined;
}

function extractEmail(value) {
  if (!value) return undefined;
  if (typeof value === "string") {
    const match = value.match(EMAIL_REGEX);
    return match ? match[0] : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const email = extractEmail(item);
      if (email) return email;
    }
    return undefined;
  }
  if (typeof value === "object") {
    for (const key of Object.keys(value)) {
      const email = extractEmail(value[key]);
      if (email) return email;
    }
  }
  return undefined;
}

function inferEmailFromSource(car) {
  const sources = [car?.__source, car?.source];
  for (const source of sources) {
    if (!source || typeof source !== "string") continue;
    const normalized = source.trim().toLowerCase();
    if (normalized && SOURCE_EMAIL_MAP[normalized]) {
      return SOURCE_EMAIL_MAP[normalized];
    }
  }

  const urlValue = car?.url || car?.__url;
  if (typeof urlValue === "string" && urlValue) {
    try {
      const host = new URL(urlValue).hostname.replace(/^www\./, "");
      if (host && HOST_EMAIL_MAP[host]) {
        return HOST_EMAIL_MAP[host];
      }
    } catch (error) {
      // Ignore malformed URLs and continue to other heuristics
    }
  }

  return undefined;
}

function inferFallbackRecipient(car) {
  if (!car || typeof car !== "object") return undefined;

  const candidates = [
    car.recipient_email,
    car.recipientEmail,
    car.contact_email,
    car.__contact_email,
    car.seller_email,
    car.__seller_email,
    car.email,
    car.__email,
  ];

  const dealership = car.dealership;
  if (dealership) {
    candidates.push(
      dealership.contact_email,
      dealership.email,
      dealership.sales_email,
      dealership.support_email,
      dealership.info_email
    );
  }

  for (const candidate of candidates) {
    const email = extractEmail(candidate);
    if (email) {
      return email;
    }
  }

  if (dealership && typeof dealership === "object") {
    const deepEmail = extractEmail(dealership);
    if (deepEmail) {
      return deepEmail;
    }
  }

  const descriptionEmail = extractEmail(car.description || car.__description);
  if (descriptionEmail) {
    return descriptionEmail;
  }

  return inferEmailFromSource(car);
}

function buildCarPayload(car) {
  const highlights = safePick(car?.highlights);
  const payload = {
    __title: safePick(car?.__title),
    title: safePick(car?.title),
    year: safePick(car?.year ?? car?.__year),
    make: safePick(car?.make ?? car?.__make),
    model: safePick(car?.model ?? car?.__model),
    trim: safePick(car?.trim ?? car?.__trim),
    __price: safePick(car?.__price),
    price: safePick(car?.price),
    currency: safePick(car?.currency),
    __mileage: safePick(car?.__mileage),
    mileage: safePick(car?.mileage),
    __location: safePick(car?.__location),
    location: safePick(car?.location),
    auction_status: safePick(
      car?.auction_status ?? car?.__auction_status ?? car?.status ?? car?.__status
    ),
    __auction_status: safePick(
      car?.__auction_status ?? car?.auction_status ?? car?.__status ?? car?.status
    ),
    status: safePick(car?.status ?? car?.__status ?? car?.auction_status),
    __status: safePick(car?.__status ?? car?.status ?? car?.auction_status),
    source: safePick(car?.source ?? car?.__source),
    __source: safePick(car?.__source ?? car?.source),
    url: safePick(car?.url),
    __url: safePick(car?.__url),
    highlights,
    dealership: getDealershipName(car?.dealership),
    vin: safePick(car?.vin),
  };

  return Object.keys(payload).reduce((acc, key) => {
    const value = payload[key];
    if (value !== undefined && !isBlank(value)) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

export async function fetchFreakStatsInsights(car, { signal } = {}) {
  const url = car?.url;
  if (!url) {
    throw new Error("Car does not include a source URL for insights");
  }

  const payload = {
    url,
    car: buildCarPayload(car),
  };

  let response;
  try {
    response = await postJSON("/freakstats/insights", payload, {
      // Give the backend enough time to exhaust its Grok retry logic.
      // The server waits up to ~45s per attempt and can retry once, so
      // we align the client timeout with that upper bound to avoid
      // aborting the request prematurely.
      timeoutMs: 120000,
      signal,
    });
  } catch (error) {
    const message = error?.message || String(error);
    const transient =
      /Request timed out/i.test(message) ||
      /\s50[0-9]\s/.test(message) ||
      message.includes("Unable to contact Grok");
    if (transient) {
      const friendlyError = new Error(
        "FREAKStats insights are taking longer than expected. Please try again shortly."
      );
      friendlyError.cause = error;
      throw friendlyError;
    }
    throw error;
  }

  const content = response?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Invalid insights response from server");
  }

  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Insights response was empty");
  }

  return trimmed;
}

export async function generateAskSellerEmail(car, { signal } = {}) {
  const url = car?.url;
  if (!url) {
    throw new Error("Car does not include a source URL for contacting the seller");
  }

  const payload = {
    url,
    car: buildCarPayload(car),
  };

  const response = await postJSON("/grok/ask-seller", payload, {
    timeoutMs: 120000,
    signal,
  });

  if (!response || typeof response !== "object") {
    throw new Error("Invalid response from Ask the Seller");
  }

  const subject = typeof response.subject === "string" ? response.subject.trim() : "";
  const body = typeof response.body === "string" ? response.body.trim() : "";
  const recipientEmail =
    typeof response.recipient_email === "string"
      ? response.recipient_email.trim()
      : "";

  const fallbackRecipient = recipientEmail || inferFallbackRecipient(car) || "";

  if (!subject || !body) {
    throw new Error("Ask the Seller response was missing email content");
  }

  return { subject, body, recipientEmail: fallbackRecipient };
}
