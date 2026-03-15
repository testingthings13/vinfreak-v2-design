import { API_BASE } from "../api";

export default function DealershipLogo({ dealership }) {
  if (!dealership || !dealership.logo_url) return null;
  let url = dealership.logo_url;
  if (url.startsWith("http") || url.startsWith("data:")) {
    // use as-is
  } else if (url.startsWith("/")) {
    url = `${API_BASE}${url}`;
  } else {
    url = `/logos/${url}`;
  }
  return (
    <img
      className="dealership-logo"
      src={url}
      alt={dealership.name || "dealership"}
      title={dealership.name || ""}
    />
  );
}
