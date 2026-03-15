import { useEffect } from "react";

const DEFAULT_BASE_URL = "https://vinfreak.com";
const DEFAULT_SITE_NAME = "VINFREAK";
const DEFAULT_DESCRIPTION =
  "VINFREAK indexes enthusiast cars and live auctions in one place.";
const MANAGED_ATTR = "data-vf-seo-managed";
const JSON_LD_ATTR = "data-vf-seo-jsonld";

function inferBaseUrl() {
  if (
    typeof window !== "undefined" &&
    window.location &&
    typeof window.location.origin === "string" &&
    window.location.origin
  ) {
    return window.location.origin;
  }
  return DEFAULT_BASE_URL;
}

export function toAbsoluteUrl(value, baseUrl = inferBaseUrl()) {
  if (!value) return "";
  const candidate = String(value).trim();
  if (!candidate) return "";
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (candidate.startsWith("//")) {
    const baseProtocol = baseUrl.startsWith("http://") ? "http:" : "https:";
    return `${baseProtocol}${candidate}`;
  }
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return candidate;
  }
}

function upsertMetaByName(name, content) {
  const head = document.head;
  if (!head || !name) return;
  let node = head.querySelector(`meta[name="${name}"]`);
  if (!content) {
    if (node && node.getAttribute(MANAGED_ATTR) === "true") {
      node.remove();
    }
    return;
  }
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute("name", name);
    head.appendChild(node);
  }
  node.setAttribute("content", content);
  node.setAttribute(MANAGED_ATTR, "true");
}

function upsertMetaByProperty(property, content) {
  const head = document.head;
  if (!head || !property) return;
  let node = head.querySelector(`meta[property="${property}"]`);
  if (!content) {
    if (node && node.getAttribute(MANAGED_ATTR) === "true") {
      node.remove();
    }
    return;
  }
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute("property", property);
    head.appendChild(node);
  }
  node.setAttribute("content", content);
  node.setAttribute(MANAGED_ATTR, "true");
}

function upsertCanonical(href) {
  const head = document.head;
  if (!head) return;
  let node = head.querySelector('link[rel="canonical"]');
  if (!href) {
    if (node && node.getAttribute(MANAGED_ATTR) === "true") {
      node.remove();
    }
    return;
  }
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", "canonical");
    head.appendChild(node);
  }
  node.setAttribute("href", href);
  node.setAttribute(MANAGED_ATTR, "true");
}

function replaceJsonLdEntries(entries) {
  const head = document.head;
  if (!head) return;
  const existing = head.querySelectorAll(`script[${JSON_LD_ATTR}="true"]`);
  existing.forEach((node) => node.remove());
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.setAttribute(JSON_LD_ATTR, "true");
    script.textContent = JSON.stringify(entry);
    head.appendChild(script);
  }
}

function normalizeJsonLd(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((entry) => entry && typeof entry === "object");
  }
  if (typeof value === "object") return [value];
  return [];
}

export function useSeo({
  title,
  description,
  canonicalPath,
  canonicalUrl,
  robots,
  noindex = false,
  ogType = "website",
  image,
  imageAlt,
  siteName = DEFAULT_SITE_NAME,
  structuredData,
  twitterCard,
} = {}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const baseUrl = inferBaseUrl();
    const safeSiteName = String(siteName || DEFAULT_SITE_NAME).trim() || DEFAULT_SITE_NAME;
    const resolvedTitle = String(title || safeSiteName).trim() || safeSiteName;
    const resolvedDescription =
      String(description || DEFAULT_DESCRIPTION).trim() || DEFAULT_DESCRIPTION;

    const resolvedCanonical = toAbsoluteUrl(
      canonicalUrl || canonicalPath || window.location.pathname || "/",
      baseUrl
    );
    const resolvedImage = toAbsoluteUrl(image, baseUrl);
    const resolvedRobots =
      noindex
        ? "noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
        : String(
            robots ||
              "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
          );
    const resolvedTwitterCard =
      twitterCard || (resolvedImage ? "summary_large_image" : "summary");

    document.title = resolvedTitle;

    upsertCanonical(resolvedCanonical);
    upsertMetaByName("description", resolvedDescription);
    upsertMetaByName("robots", resolvedRobots);

    upsertMetaByProperty("og:type", ogType);
    upsertMetaByProperty("og:site_name", safeSiteName);
    upsertMetaByProperty("og:title", resolvedTitle);
    upsertMetaByProperty("og:description", resolvedDescription);
    upsertMetaByProperty("og:url", resolvedCanonical);
    upsertMetaByProperty("og:image", resolvedImage || null);
    upsertMetaByProperty("og:image:alt", imageAlt || resolvedTitle);

    upsertMetaByName("twitter:card", resolvedTwitterCard);
    upsertMetaByName("twitter:title", resolvedTitle);
    upsertMetaByName("twitter:description", resolvedDescription);
    upsertMetaByName("twitter:image", resolvedImage || null);
    upsertMetaByName("twitter:image:alt", imageAlt || resolvedTitle);

    replaceJsonLdEntries(normalizeJsonLd(structuredData));
  }, [
    title,
    description,
    canonicalPath,
    canonicalUrl,
    robots,
    noindex,
    ogType,
    image,
    imageAlt,
    siteName,
    structuredData,
    twitterCard,
  ]);
}
