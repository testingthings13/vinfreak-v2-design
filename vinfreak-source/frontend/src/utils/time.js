export function parseEndTime(val, { rollForward = true } = {}) {
  if (val == null) return NaN;
  if (val instanceof Date) return val.getTime();
  let n;
  if (typeof val === "number") {
    n = val;
  } else {
    n = Number(val);
  }
  if (!isNaN(n) && n > 0) {
    // treat values < 1e12 as seconds
    return n < 1e12 ? n * 1000 : n;
  }
  if (typeof val === "string") {
    let s = val.trim();
    if (!s) return NaN;
    // remove ordinal suffixes (e.g. "1st", "2nd") and replace " at " with space
    s = s
      .replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1")
      .replace(/\sat\s/gi, " ");
    const hasYear = /\d{4}/.test(s);
    // handle "YYYY-MM-DD HH:MM:SS" by replacing space with T
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
      s = s.replace(" ", "T");
      // append Z only if timezone is missing
      if (!/[+-]\d{2}:?\d{2}|Z$/i.test(s)) {
        s += "Z";
      }
    } else if (!hasYear) {
      // add current year if none provided
      s += ` ${new Date().getUTCFullYear()}`;
    }
    let t = Date.parse(s);
    if (!isNaN(t)) {
      if (rollForward && !hasYear && t < Date.now()) {
        const d = new Date(t);
        d.setUTCFullYear(d.getUTCFullYear() + 1);
        t = d.getTime();
      }
      return t;
    }
  }
  return NaN;
}

export function parseTimeLeft(val) {
  if (val == null) return NaN;
  if (typeof val === "number") {
    return val < 1e12 ? val * 1000 : val;
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return NaN;
    let total = 0;
    const re = /(\d+)\s*(d|day|days|h|hour|hours|m|min|minute|minutes|s|sec|second|seconds)/gi;
    let m;
    while ((m = re.exec(s)) !== null) {
      const num = Number(m[1]);
      const unit = m[2][0].toLowerCase();
      if (unit === "d") total += num * 86400;
      else if (unit === "h") total += num * 3600;
      else if (unit === "m") total += num * 60;
      else if (unit === "s") total += num;
    }
    if (total > 0) return total * 1000;
    const colonPattern = /\d{1,3}(?::\d{2}){1,3}/g;
    const colonMatches = s.match(colonPattern);
    if (colonMatches && colonMatches.length > 0) {
      const parts = colonMatches[0].split(":").map(Number);
      if (parts.every((n) => Number.isFinite(n))) {
        let seconds = 0;
        let multiplier = 1;
        for (let i = parts.length - 1; i >= 0; i -= 1) {
          seconds += parts[i] * multiplier;
          if (multiplier === 1) multiplier = 60;
          else if (multiplier === 60) multiplier = 3600;
          else if (multiplier === 3600) multiplier = 86400;
          else {
            multiplier *= 24; // support additional higher units conservatively
          }
        }
        if (seconds > 0) return seconds * 1000;
      }
    }
    const n = Number(s);
    if (!isNaN(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  }
  return NaN;
}

export function resolveTarget(endTime, timeLeft) {
  let t = parseEndTime(endTime, { rollForward: false });
  if (isNaN(t)) {
    const left = parseTimeLeft(timeLeft);
    if (!isNaN(left)) t = Date.now() + left;
  }
  return t;
}

const cleanTimezoneArtifacts = (input) => {
  if (typeof input !== "string") return input;
  let s = input;
  // Remove redundant trailing or leading "Z" when an explicit offset is present
  s = s.replace(/([+-]\d{2})(\d{2})\s*Z\b/gi, "$1:$2");
  s = s.replace(/Z\s*([+-]\d{2})(\d{2})\b/gi, "$1:$2");
  s = s.replace(/([+-]\d{2}:?\d{2})\s*Z\b/gi, "$1");
  s = s.replace(/Z\s*([+-]\d{2}:?\d{2})\b/gi, "$1");
  return s;
};

const RELATIVE_NUMBER_WORDS = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const RELATIVE_POSTED_PATTERN =
  /(?:listed|posted|created|published)?\s*(?:about|around|approximately|approx|almost|over|more than|less than)?\s*(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?)\s+ago/i;

const parseRelativeTimestamp = (input, nowTs = Date.now()) => {
  if (typeof input !== "string") return NaN;
  const normalized = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return NaN;
  if (normalized.includes("just now") || normalized.startsWith("now")) return nowTs;
  if (normalized.includes("today")) return nowTs;
  if (normalized.includes("yesterday")) return nowTs - 24 * 60 * 60 * 1000;

  const match = normalized.match(RELATIVE_POSTED_PATTERN);
  if (!match) return NaN;
  const amountRaw = match[1];
  const unitRaw = String(match[2] || "").toLowerCase();

  let amount = Number(amountRaw);
  if (!Number.isFinite(amount)) {
    amount = RELATIVE_NUMBER_WORDS[amountRaw] ?? NaN;
  }
  if (!Number.isFinite(amount) || amount < 0) return NaN;

  let unitMs = NaN;
  if (unitRaw.startsWith("sec")) unitMs = 1000;
  else if (unitRaw.startsWith("min")) unitMs = 60 * 1000;
  else if (unitRaw.startsWith("h")) unitMs = 60 * 60 * 1000;
  else if (unitRaw.startsWith("d")) unitMs = 24 * 60 * 60 * 1000;
  else if (unitRaw.startsWith("w")) unitMs = 7 * 24 * 60 * 60 * 1000;
  else if (unitRaw.startsWith("mo")) unitMs = 30 * 24 * 60 * 60 * 1000;
  else if (unitRaw.startsWith("y")) unitMs = 365 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(unitMs)) return NaN;
  return nowTs - amount * unitMs;
};

export function parseTimestamp(val) {
  if (val == null) return NaN;
  if (val instanceof Date) return val.getTime();
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return NaN;
    return val < 1e12 ? val * 1000 : val;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return NaN;
    const relativeDirect = parseRelativeTimestamp(trimmed);
    if (!Number.isNaN(relativeDirect)) return relativeDirect;
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }

    const findDateStart = (input) => {
      const monthIndex = input.search(
        /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i,
      );
      const digitIndex = input.search(/\d/);
      if (monthIndex === -1) return digitIndex;
      if (digitIndex === -1) return monthIndex;
      return Math.min(monthIndex, digitIndex);
    };

    const sanitizeDateString = (input) => {
      let s = input;
      const startIndex = findDateStart(s);
      if (typeof startIndex === "number" && startIndex > 0) {
        s = s.slice(startIndex);
      }
      s = s
        .replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1")
        .replace(/\sat\s/gi, " ")
        .replace(/\b(on|listed|posted|published|updated)\b[:\s,]*/gi, "")
        .trim();
      return cleanTimezoneArtifacts(s);
    };

    const candidates = [];
    candidates.push(trimmed);
    const sanitized = sanitizeDateString(trimmed);
    if (sanitized && sanitized !== trimmed) {
      candidates.push(sanitized);
    }

    for (const candidate of candidates) {
      if (!candidate) continue;
      const relative = parseRelativeTimestamp(candidate);
      if (!Number.isNaN(relative)) return relative;
      const direct = Date.parse(candidate);
      if (!Number.isNaN(direct)) return direct;
      const parsed = parseEndTime(candidate, { rollForward: false });
      if (!Number.isNaN(parsed)) return parsed;
      const withoutCommas = candidate.replace(/,\s*/g, " ");
      if (withoutCommas !== candidate) {
        const parsedNoComma = Date.parse(withoutCommas);
        if (!Number.isNaN(parsedNoComma)) return parsedNoComma;
        const alt = parseEndTime(withoutCommas, { rollForward: false });
        if (!Number.isNaN(alt)) return alt;
      }
    }
  }
  return NaN;
}

export function daysSince(value, now = Date.now()) {
  const ts = parseTimestamp(value);
  if (Number.isNaN(ts)) return null;
  let nowTs;
  if (now instanceof Date) {
    nowTs = now.getTime();
  } else if (typeof now === "number") {
    nowTs = now;
  } else {
    nowTs = parseTimestamp(now);
  }
  if (!Number.isFinite(nowTs)) return null;
  const diff = nowTs - ts;
  if (!Number.isFinite(diff)) return null;
  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
