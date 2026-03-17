/**
 * Simple browser fingerprint for anonymous poll voting.
 * Not cryptographically secure — just enough to deter casual double-voting.
 */
export function getFingerprint(): string {
  const cached = sessionStorage.getItem("vf_fp");
  if (cached) return cached;

  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Date().getTimezoneOffset(),
  ].join("|");

  // Simple hash (djb2)
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  }
  const fp = hash.toString(36);
  sessionStorage.setItem("vf_fp", fp);
  return fp;
}
