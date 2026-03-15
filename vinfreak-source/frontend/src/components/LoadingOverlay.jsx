import { useContext, useMemo } from "react";
import { SettingsContext } from "../App";
import { API_BASE } from "../api";
import freakstatsLogo from "../assets/freakstats.svg";

export default function LoadingOverlay({
  fullScreen = false,
  mainText = "FREAKISHLY COOL CARS",
  subText = "HOLD ON WHILE WE FIND YOU",
  showLogo = true,
}) {
  const settings = useContext(SettingsContext);
  const loaderUrl = settings?.freakstats_loader_url;
  const resolvedLoader = useMemo(() => {
    if (!loaderUrl) return "";
    if (loaderUrl.startsWith("http") || loaderUrl.startsWith("data:")) {
      return loaderUrl;
    }
    return `${API_BASE}${loaderUrl}`;
  }, [loaderUrl]);

  const classes = ["loading-overlay", fullScreen ? "fullscreen" : null]
    .filter(Boolean)
    .join(" ");

  const logoSrc = resolvedLoader || freakstatsLogo;
  const logoAlt = settings?.site_title
    ? `${settings.site_title} logo`
    : "Loading logo";

  return (
    <div className={classes} role="status" aria-live="polite">
      <div className="loading-header">
        {showLogo && (
          <div className="loading-logo">
            <img
              src={logoSrc}
              alt={logoAlt}
              className="loading-logo-image"
              fetchPriority="high"
              decoding="sync"
            />
          </div>
        )}
        <div className="loading-text">
          <span className="loading-sub">{subText}</span>
          <span className="loading-main glitch-text" data-text={mainText}>
            {mainText}
          </span>
        </div>
      </div>
    </div>
  );
}
