import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Mail, Loader2, AlertTriangle, Copy, Check, ExternalLink } from "lucide-react";
import { postJSON } from "@/lib/api";
import type { NormalizedCar } from "@/lib/normalizeCar";

interface AskSellerModalProps {
  car: NormalizedCar;
  onClose: () => void;
}

interface EmailDraft {
  subject: string;
  body: string;
  recipientEmail: string;
}

export default function AskSellerModal({ car, onClose }: AskSellerModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | "all" | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        url: car.url || "",
        car: {
          title: car.title,
          year: car.year,
          make: car.make,
          model: car.model,
          price: car.price,
          mileage: car.mileage,
          transmission: car.transmission,
          engine: car.engine,
          vin: car.vin,
          source: car.source,
          location: car.location,
          auction_status: car.auctionStatus,
          url: car.url,
          dealership: car.dealershipName,
        },
      };
      const res = await postJSON("/grok/ask-seller", payload, 120000);
      const subject = typeof res?.subject === "string" ? res.subject.trim() : "";
      const body = typeof res?.body === "string" ? res.body.trim() : "";
      const recipientEmail = typeof res?.recipient_email === "string" ? res.recipient_email.trim() : "";
      if (!subject || !body) throw new Error("AI did not return email content. Please try again.");
      setDraft({ subject, body, recipientEmail });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (/timed? ?out/i.test(msg) || /50[0-9]/.test(msg)) {
        setError("The AI is taking longer than expected. Please try again shortly.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [car.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { generate(); }, [car.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.body.classList.add("overflow-hidden");
    closeRef.current?.focus({ preventScroll: true });
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.classList.remove("overflow-hidden");
      document.removeEventListener("keydown", handler);
    };
  }, [onClose]);

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const copyToClipboard = async (text: string, label: "subject" | "body" | "all") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* clipboard not available */ }
  };

  const openMailto = () => {
    if (!draft) return;
    const to = draft.recipientEmail || "";
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
    window.open(mailto, "_blank");
  };

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 p-4 border-b border-border flex-shrink-0">
          <div className="p-2 rounded-lg bg-accent/50">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">AI-Generated Email</p>
            <h2 className="text-sm font-bold text-foreground truncate">Ask the Seller — {car.title}</h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Drafting your inquiry email…</p>
              <p className="text-xs text-muted-foreground/60">This may take 15–30 seconds</p>
            </div>
          )}

          {error && (
            <div className="py-12 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-warning mx-auto" />
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={generate} className="text-sm text-primary hover:text-primary/80 font-medium">
                Try again
              </button>
            </div>
          )}

          {!loading && !error && draft && (
            <>
              {/* Recipient */}
              {draft.recipientEmail && (
                <div className="p-3 rounded-xl bg-muted/50 border border-border">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">To</p>
                  <p className="text-sm font-medium text-foreground">{draft.recipientEmail}</p>
                </div>
              )}

              {/* Subject */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Subject</p>
                  <button
                    onClick={() => copyToClipboard(draft.subject, "subject")}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied === "subject" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    {copied === "subject" ? "Copied" : "Copy"}
                  </button>
                </div>
                <input
                  type="text"
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Email Body</p>
                  <button
                    onClick={() => copyToClipboard(draft.body, "body")}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied === "body" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    {copied === "body" ? "Copied" : "Copy"}
                  </button>
                </div>
                <textarea
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  rows={10}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-sm text-foreground leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-primary min-h-[120px]"
                />
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={openMailto}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Email Client
                </button>
                <button
                  onClick={() => copyToClipboard(`Subject: ${draft.subject}\n\n${draft.body}`, "all")}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-muted text-foreground font-semibold text-sm hover:bg-muted/80 transition-colors border border-border"
                >
                  {copied === "all" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  {copied === "all" ? "Copied!" : "Copy All"}
                </button>
              </div>

              <button
                onClick={generate}
                className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors py-1"
              >
                ↻ Regenerate email
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="p-4 border-t border-border flex-shrink-0 text-center">
          <p className="text-[10px] text-muted-foreground">
            Powered by VINFREAK AI · Review before sending
          </p>
        </footer>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
