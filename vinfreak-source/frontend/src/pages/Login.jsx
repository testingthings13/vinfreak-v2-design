import { useEffect, useId, useRef, useState } from "react";
import VinfreakLogo from "../components/VinfreakLogo";
import { verifySitePassword } from "../api";
import { useSeo } from "../utils/seo";

export default function Login({ onSuccess }) {
  useSeo({
    title: "VINFREAK Access",
    description: "Secure access page for VINFREAK.",
    canonicalPath: "/",
    noindex: true,
    ogType: "website",
    image: "https://cdn.vinfreak.com/branding/QtLmCMtkDhlgVV20aMm8rA.jpg",
    imageAlt: "VINFREAK logo",
    siteName: "VINFREAK",
  });

  const gradientId = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isTouchDevice = (() => {
      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      if (window.matchMedia) {
        try {
          if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
            return true;
          }
        } catch {
          // Ignore matchMedia errors and fall back to touch heuristics below.
        }
      }
      return Boolean(
        (nav && typeof nav.maxTouchPoints === "number" && nav.maxTouchPoints > 0) ||
        "ontouchstart" in window
      );
    })();

    if (!isTouchDevice && inputRef.current) {
      try {
        inputRef.current.focus({ preventScroll: true });
      } catch {
        inputRef.current.focus();
      }
    }
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const candidate = password;
    if (!candidate.trim()) {
      setError("Password is required.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await verifySitePassword(candidate);
      if (result && result.ok) {
        setError("");
        setPassword("");
        if (typeof onSuccess === "function") {
          onSuccess(result.version || "");
        }
        return;
      }
      if (result && result.enabled === false) {
        if (typeof onSuccess === "function") {
          onSuccess(result.version || "");
        }
        return;
      }
      setError(result?.error || "Incorrect password. Please try again.");
    } catch (err) {
      const message = err && typeof err.message === "string"
        ? err.message
        : "Unable to verify password. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="password-gate">
      <div className="gate-card">
        <div className="gate-logo" aria-hidden="true">
          <VinfreakLogo className="gate-logo-icon" idPrefix={gradientId} />
        </div>
        <h1 className="gate-title">VINFREAK</h1>
        <p className="gate-subtitle">Coming Soon</p>
        <form className="gate-form" onSubmit={handleSubmit}>
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <div className="gate-input-wrap">
            <input
              id="password"
              type="password"
              placeholder="Enter password"
              value={password}
              ref={inputRef}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError("");
              }}
              autoComplete="current-password"
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "password-error" : undefined}
            />
            <button type="submit" disabled={submitting}>
              {submitting ? "Unlocking…" : "Unlock"}
            </button>
          </div>
          {error && (
            <div id="password-error" role="alert" className="gate-error">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
