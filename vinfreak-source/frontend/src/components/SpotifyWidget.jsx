import { useEffect, useMemo, useState } from "react";

const PRESET_TRACKS = [
  {
    key: "todays-top-hits",
    label: "Spotify - Today's Top Hits",
    type: "playlist",
    id: "37i9dQZF1DXcBWIGoYBM5M",
  },
  {
    key: "top-50-global",
    label: "Spotify - Top 50 Global",
    type: "playlist",
    id: "37i9dQZEVXbMDoHDwVN2tF",
  },
  {
    key: "viral-hits",
    label: "Spotify - Viral Hits",
    type: "playlist",
    id: "37i9dQZF1DX9oh43oAzkyx",
  },
  {
    key: "mint",
    label: "Spotify - mint",
    type: "playlist",
    id: "37i9dQZF1DX4dyzvuaRJ0n",
  },
  {
    key: "rapcaviar",
    label: "Spotify - RapCaviar",
    type: "playlist",
    id: "37i9dQZF1DX0XUsuxWHRQd",
  },
  {
    key: "all-out-2010s",
    label: "Spotify - All Out 2010s",
    type: "playlist",
    id: "37i9dQZF1DX5Ejj0EkURtP",
  },
];

const CUSTOM_OPTION = "custom";
const STORAGE_OPTION_KEY = "vinfreak:spotify-option";
const STORAGE_CUSTOM_URL_KEY = "vinfreak:spotify-custom-url";

function parseSpotifyResource(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(
    /spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)(?:\?|$)/i
  );
  if (urlMatch) {
    return { type: urlMatch[1].toLowerCase(), id: urlMatch[2] };
  }

  const uriMatch = trimmed.match(
    /^spotify:(track|album|playlist|episode|show):([a-zA-Z0-9]+)$/i
  );
  if (uriMatch) {
    return { type: uriMatch[1].toLowerCase(), id: uriMatch[2] };
  }

  return null;
}

function getPresetByKey(key) {
  return PRESET_TRACKS.find((item) => item.key === key) || PRESET_TRACKS[0];
}

function makeEmbedUrl(resource) {
  if (!resource?.type || !resource?.id) return "";
  const query = new URLSearchParams({
    utm_source: "generator",
    autoplay: "1",
  });
  return `https://open.spotify.com/embed/${resource.type}/${resource.id}?${query.toString()}`;
}

function getEmbedHeight(type) {
  return type === "track" || type === "episode" ? 152 : 352;
}

export default function SpotifyWidget() {
  const isBrowser = typeof window !== "undefined";
  const [selectedKey, setSelectedKey] = useState(() => {
    if (!isBrowser) return PRESET_TRACKS[0].key;
    const saved = window.localStorage.getItem(STORAGE_OPTION_KEY);
    if (saved === CUSTOM_OPTION || PRESET_TRACKS.some((item) => item.key === saved)) {
      return saved;
    }
    return PRESET_TRACKS[0].key;
  });
  const [customUrl, setCustomUrl] = useState(() => {
    if (!isBrowser) return "";
    return window.localStorage.getItem(STORAGE_CUSTOM_URL_KEY) || "";
  });

  useEffect(() => {
    if (!isBrowser) return;
    window.localStorage.setItem(STORAGE_OPTION_KEY, selectedKey);
  }, [isBrowser, selectedKey]);

  useEffect(() => {
    if (!isBrowser) return;
    if (customUrl) {
      window.localStorage.setItem(STORAGE_CUSTOM_URL_KEY, customUrl);
      return;
    }
    window.localStorage.removeItem(STORAGE_CUSTOM_URL_KEY);
  }, [customUrl, isBrowser]);

  const customResource = useMemo(() => parseSpotifyResource(customUrl), [customUrl]);
  const activePresetIndex = PRESET_TRACKS.findIndex((item) => item.key === selectedKey);

  const activeResource = useMemo(() => {
    if (selectedKey === CUSTOM_OPTION) return customResource;
    return getPresetByKey(selectedKey);
  }, [customResource, selectedKey]);

  const embedUrl = useMemo(() => makeEmbedUrl(activeResource), [activeResource]);
  const openUrl = useMemo(() => {
    if (!activeResource?.type || !activeResource?.id) return "";
    return `https://open.spotify.com/${activeResource.type}/${activeResource.id}`;
  }, [activeResource]);
  const embedHeight = getEmbedHeight(activeResource?.type);

  function shiftPreset(delta) {
    if (!PRESET_TRACKS.length) return;
    if (activePresetIndex < 0) {
      setSelectedKey(delta > 0 ? PRESET_TRACKS[0].key : PRESET_TRACKS[PRESET_TRACKS.length - 1].key);
      return;
    }
    const nextIndex =
      (activePresetIndex + delta + PRESET_TRACKS.length) % PRESET_TRACKS.length;
    setSelectedKey(PRESET_TRACKS[nextIndex].key);
  }

  return (
    <section className="spotify-widget" aria-label="Spotify player">
      <div className="spotify-widget-card">
        <div className="spotify-widget-header">
          <div className="spotify-widget-copy">
            <p className="spotify-widget-eyebrow">Popular On Spotify</p>
            <h2>Autoplay the latest Spotify hits while you browse</h2>
          </div>
          <div className="spotify-widget-controls">
            <div className="spotify-widget-picker">
              <label className="spotify-widget-label" htmlFor="spotify-track-select">
                Playlist
              </label>
              <select
                id="spotify-track-select"
                className="spotify-widget-select"
                value={selectedKey}
                onChange={(event) => setSelectedKey(event.target.value)}
              >
                {PRESET_TRACKS.map((track) => (
                  <option key={track.key} value={track.key}>
                    {track.label}
                  </option>
                ))}
                <option value={CUSTOM_OPTION}>Custom Spotify Link</option>
              </select>
            </div>
            <div className="spotify-widget-nav" role="group" aria-label="Playlist navigation">
              <button
                type="button"
                className="spotify-widget-nav-btn"
                onClick={() => shiftPreset(-1)}
                aria-label="Previous playlist"
              >
                Prev
              </button>
              <button
                type="button"
                className="spotify-widget-nav-btn"
                onClick={() => shiftPreset(1)}
                aria-label="Next playlist"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {selectedKey === CUSTOM_OPTION && (
          <div className="spotify-widget-custom">
            <label className="spotify-widget-label" htmlFor="spotify-custom-input">
              Spotify URL
            </label>
            <input
              id="spotify-custom-input"
              className="spotify-widget-input"
              type="text"
              inputMode="url"
              placeholder="Paste a Spotify track/playlist/album URL"
              value={customUrl}
              onChange={(event) => setCustomUrl(event.target.value)}
            />
            {!customResource && customUrl.trim() && (
              <p className="spotify-widget-error">
                That link is not recognized. Use a full Spotify URL or URI.
              </p>
            )}
          </div>
        )}

        {embedUrl && (
          <div className="spotify-widget-player">
            <iframe
              className="spotify-widget-frame"
              src={embedUrl}
              height={embedHeight}
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              title="Spotify player"
            />
            {openUrl && (
              <a
                className="spotify-widget-link"
                href={openUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in Spotify
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
