export const fmtNum = (v, d=0) => {
  if (v === null || v === undefined || v === "" || isNaN(Number(v))) return "—";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
};
export const fmtMoney = (v, cur="USD") => {
  if (v === null || v === undefined || v === "" || isNaN(Number(v))) return "—";
  const amount = Number(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${cur==="USD"?"$":""}${amount}`;
};
export const fmtMileage = (v) => {
  if (v === null || v === undefined || v === "" || isNaN(Number(v))) return "—";
  const value = Math.max(0, Math.round(Number(v)));
  if (value >= 1000) {
    const compact = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: value < 10000 ? 1 : 0,
    }).format(value);
    return `${compact.toLowerCase()} mi`;
  }
  return `${fmtNum(value)} mi`;
};
export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString();
};
// turn blobs of text or bullet points into list items
export function toList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(x => String(x)).filter(Boolean);
  const s = String(val).trim();
  const parts = s.split(/\n+|\r+|\u2022|•|\*/g).map(x => x.trim()).filter(Boolean);
  const seen = new Set(); const out = [];
  for (const p of parts) { const k = p.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(p); } }
  return out;
}
export const statusLabel = (s) => {
  const t = String(s || "").toUpperCase().replace(/\s+/g,"_");
  switch (t) {
    case "LIVE":
      return "Live";
    case "AUCTION_IN_PROGRESS":
      return "Auction in progress";
    case "SOLD":
      return "Sold";
    case "REMOVED":
      return "Removed";
    default:
      return s || "—";
  }
};
