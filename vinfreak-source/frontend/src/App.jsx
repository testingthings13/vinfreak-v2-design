import { Routes, Route, useLocation, useParams } from "react-router-dom";
import { createContext, useEffect, useState } from "react";
import Home from "./pages/Home";
import CarDetail from "./pages/CarDetail";
import Login from "./pages/Login";
import Share from "./pages/Share";
import DealerApply from "./pages/DealerApply";
import ErrorBoundary from "./components/ErrorBoundary";
import SpotifyWidget from "./components/SpotifyWidget";
import { getSettings, getAdminSessionStatus, API_BASE } from "./api";
import { useToast } from "./ToastContext";
import contactEmailImage from "./assets/contact-email.svg";

export const SettingsContext = createContext({
  site_title: "VINFREAK",
  site_tagline: "Discover performance & provenance",
  logo_url: "",
  logo_width: 64,
  logo_height: 64,
  favicon_url: "",
  theme: "dark",
  contact_email: "",
  share_base_url: "",
  default_page_size: 12,
  maintenance_banner: "",
  brand_filter_make_ids: [],
  home_top_filters_enabled: false,
  home_make_filter_enabled: false,
  home_dealership_filter_enabled: false,
  home_new_listing_badge_enabled: true,
  home_inventory_type_pills_enabled: false,
  home_sort_label_enabled: false,
  home_filter_counts_enabled: false,
  home_footer_panels_enabled: false,
  spotify_widget_enabled: true,
  admin_can_delete_cars: false,
  admin_delete_csrf_token: "",
  admin_api_base: "",
  freakstats_loader_url: "",
  freakstats_icon_url: "",
  freakstats_icon_width: "",
  freakstats_icon_height: "",
  password_gate_enabled: true,
  site_password_version: "default",
});

const GATE_DISABLED_VALUES = new Set(["0", "false", "no", "off"]);
const FEATURE_DISABLED_VALUES = new Set(["0", "false", "no", "off"]);

function normalizeGateEnabled(value) {
  if (typeof value === "boolean") return value;
  if (value == null) return true;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return true;
  return !GATE_DISABLED_VALUES.has(normalized);
}

function normalizeFeatureEnabled(value, defaultValue = false) {
  if (typeof value === "boolean") return value;
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return defaultValue;
  return !FEATURE_DISABLED_VALUES.has(normalized);
}

export default function App() {
  const location = useLocation();
  const isShareRoute = /^\/share(?:-ui)?(?:\/|$)/.test(location.pathname || "");
  const isBrowser = typeof window !== "undefined";
  const [settings, setSettings] = useState({
    site_title: "VINFREAK",
    site_tagline: "Discover performance & provenance",
    logo_url: "",
    logo_width: 64,
    logo_height: 64,
    favicon_url: "",
    theme: "dark",
    contact_email: "",
    share_base_url: "",
    default_page_size: 12,
    maintenance_banner: "",
    brand_filter_make_ids: [],
    home_top_filters_enabled: false,
    home_make_filter_enabled: false,
    home_dealership_filter_enabled: false,
    home_new_listing_badge_enabled: true,
    home_inventory_type_pills_enabled: false,
    home_sort_label_enabled: false,
    home_filter_counts_enabled: false,
    home_footer_panels_enabled: false,
    spotify_widget_enabled: true,
    admin_can_delete_cars: false,
    admin_delete_csrf_token: "",
    admin_api_base: "",
    freakstats_loader_url: "",
    freakstats_icon_url: "",
    freakstats_icon_width: "",
    freakstats_icon_height: "",
    password_gate_enabled: true,
    site_password_version: "default",
  });

  const [authed, setAuthed] = useState(() =>
    isBrowser ? localStorage.getItem("authed") === "true" : false
  );
  const [gateState, setGateState] = useState({
    enabled: true,
    version: "",
    loaded: false,
  });

  useEffect(() => {
    try {
      const fullPath = `${location.pathname}${location.search}${location.hash}`;
      sessionStorage.setItem("vinfreak:last-path", fullPath);
    } catch (error) {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("Failed to persist last route", error);
      }
    }
  }, [location]);

  const { addToast } = useToast();

  useEffect(() => {
    if (!gateState.loaded) return;
    if (!isBrowser) {
      setAuthed(true);
      return;
    }
    if (!gateState.enabled) {
      setAuthed(true);
      localStorage.setItem("authed", "true");
      if (gateState.version) {
        localStorage.setItem("authed_version", gateState.version);
      } else {
        localStorage.removeItem("authed_version");
      }
      return;
    }
    const stored = localStorage.getItem("authed") === "true";
    const storedVersion = localStorage.getItem("authed_version") || "";
    if (stored) {
      if (gateState.version && storedVersion === gateState.version) {
        setAuthed(true);
        return;
      }
      if (!gateState.version && !storedVersion) {
        setAuthed(true);
        return;
      }
    }
    setAuthed(false);
    if (stored) {
      localStorage.removeItem("authed");
    }
    if (storedVersion) {
      localStorage.removeItem("authed_version");
    }
  }, [gateState, isBrowser]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSettings();
        if (cancelled) return;
        let gateEnabled = true;
        let gateVersion = "default";
        if (s && typeof s === "object") {
          let brandFilter = [];
          const rawBrand = s.brand_filter_make_ids;
          if (Array.isArray(rawBrand)) {
            brandFilter = rawBrand.filter((id) => id !== null && id !== "");
          } else if (typeof rawBrand === "string") {
            try {
              const parsed = JSON.parse(rawBrand);
              if (Array.isArray(parsed)) {
                brandFilter = parsed.filter((id) => id !== null && id !== "");
              }
            } catch {
              brandFilter = rawBrand
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean);
            }
          }
          const enabledSource = Object.prototype.hasOwnProperty.call(
            s,
            "password_gate_enabled"
          )
            ? s.password_gate_enabled
            : s.site_password_enabled;
          gateEnabled = normalizeGateEnabled(enabledSource);
          const versionRaw = s.site_password_version;
          if (typeof versionRaw === "string" && versionRaw) {
            gateVersion = versionRaw;
          }
          setSettings((prev) => ({
            ...prev,
            ...s,
            brand_filter_make_ids: brandFilter,
            password_gate_enabled: gateEnabled,
            site_password_version: gateVersion,
          }));
        } else {
          setSettings((prev) => ({
            ...prev,
            password_gate_enabled: gateEnabled,
            site_password_version: gateVersion,
          }));
        }
        setGateState({ enabled: gateEnabled, version: gateVersion, loaded: true });
      } catch (e) {
        if (!cancelled) {
          addToast("Failed to load settings", "error");
          setGateState((prev) => ({ ...prev, loaded: true }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addToast]);

  useEffect(() => {
    if (!isBrowser) return undefined;
    let cancelled = false;

    const refreshAdminSession = async () => {
      try {
        const session = await getAdminSessionStatus();
        if (cancelled) return;
        setSettings((prev) => ({
          ...prev,
          admin_can_delete_cars: Boolean(
            session?.authenticated && session?.can_delete_cars
          ),
          admin_delete_csrf_token:
            typeof session?.csrf_token === "string" ? session.csrf_token : "",
          admin_api_base:
            typeof session?.admin_api_base === "string"
              ? session.admin_api_base
              : "",
        }));
      } catch {
        if (cancelled) return;
        setSettings((prev) => ({
          ...prev,
          admin_can_delete_cars: false,
          admin_delete_csrf_token: "",
          admin_api_base: "",
        }));
      }
    };

    refreshAdminSession();
    window.addEventListener("focus", refreshAdminSession);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshAdminSession);
    };
  }, [isBrowser]);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      settings.theme || "dark"
    );
  }, [settings.theme]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const rawFavicon =
      typeof settings?.favicon_url === "string" ? settings.favicon_url.trim() : "";
    const rawLogo =
      typeof settings?.logo_url === "string" ? settings.logo_url.trim() : "";
    const candidate = rawFavicon || rawLogo;
    if (!candidate) return;
    const iconHref =
      candidate.startsWith("http://") ||
      candidate.startsWith("https://") ||
      candidate.startsWith("data:")
        ? candidate
        : `${API_BASE}${candidate}`;

    const ensureIconLink = (rel, extraAttributes = {}) => {
      let node = document.querySelector(`link[rel="${rel}"]`);
      if (!node) {
        node = document.createElement("link");
        node.setAttribute("rel", rel);
        document.head.appendChild(node);
      }
      node.setAttribute("href", iconHref);
      for (const [key, value] of Object.entries(extraAttributes)) {
        if (value == null || value === "") continue;
        node.setAttribute(key, String(value));
      }
    };

    ensureIconLink("icon");
    ensureIconLink("shortcut icon");
    ensureIconLink("apple-touch-icon", { sizes: "180x180" });
  }, [settings?.favicon_url, settings?.logo_url]);

  if (!gateState.loaded) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        Loading…
      </div>
    );
  }
  if (gateState.enabled && !authed) {
    return (
      <Login
        onSuccess={(version) => {
          setAuthed(true);
          if (!isBrowser) return;
          localStorage.setItem("authed", "true");
          if (version) {
            localStorage.setItem("authed_version", version);
          } else {
            localStorage.removeItem("authed_version");
          }
        }}
      />
    );
  }
  const spotifyWidgetEnabled = normalizeFeatureEnabled(
    settings?.spotify_widget_enabled,
    true
  );

  return (
    <SettingsContext.Provider value={settings}>
      <div className="app">
        {settings.maintenance_banner && (
          <div className="banner">{settings.maintenance_banner}</div>
        )}
        {!isShareRoute && (() => {
          const u = settings.logo_url;
          if (!u) return null;
          const src =
            u.startsWith("http") || u.startsWith("data:")
              ? u
              : `${API_BASE}${u}`;
          const width = Number(settings.logo_width) || 64;
          const height = Number(settings.logo_height) || 64;
          return (
            <div className="logo-banner">
              <a
                className="logo-banner-link"
                href="https://vinfreak.com"
                aria-label={`Go to ${settings.site_title || "VINFREAK"} homepage`}
              >
                <img
                  src={src}
                  alt={settings.site_title}
                  style={{ width, height, borderRadius: "50%", objectFit: "cover" }}
                />
              </a>
            </div>
          );
        })()}
        <main className="app-main">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/v1" element={<Home />} />
              <Route path="/make/:makeSlug" element={<MakeLanding />} />
              <Route path="/brand/:makeSlug" element={<MakeLanding />} />
              <Route path="/car/:id/*" element={<CarDetail />} />
              <Route path="/share/:id" element={<Share />} />
              <Route path="/share/:id/:v" element={<Share />} />
              <Route path="/share-ui/:id" element={<Share />} />
              <Route path="/share-ui/:id/:v" element={<Share />} />
              <Route path="/dealership/apply" element={<DealerApply />} />
              <Route path="/dealer/signup" element={<DealerApply />} />
              <Route path="*" element={<Static404Redirect settings={settings} />} />
            </Routes>
          </ErrorBoundary>
        </main>
        {spotifyWidgetEnabled && <SpotifyWidget />}
        <footer className="app-footer">
          <img
            className="app-footer__contact"
            src={contactEmailImage}
            alt="Contact Vinfreak"
          />
        </footer>
      </div>
    </SettingsContext.Provider>
  );
}

function MakeLanding() {
  const { makeSlug } = useParams();
  return <Home makeSlug={makeSlug || ""} />;
}

function Static404Redirect({ settings }) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          "vinfreak:public-settings",
          JSON.stringify({
            site_title: settings?.site_title || "VINFREAK",
            logo_url: settings?.logo_url || "",
            logo_width: settings?.logo_width || 64,
            logo_height: settings?.logo_height || 64,
          })
        );
        sessionStorage.setItem("vinfreak:api-base", API_BASE);
      } catch (error) {
        if (typeof console !== "undefined" && typeof console.warn === "function") {
          console.warn("Failed to persist 404 branding settings", error);
        }
      }

      const attemptedPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const target = `/404.html?from=${encodeURIComponent(attemptedPath)}`;
      window.location.replace(target);
    }
  }, [settings]);

  return null;
}
