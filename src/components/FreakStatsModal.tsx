import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Sparkles, Loader2, AlertTriangle, TrendingUp, Shield,
  AlertCircle, Target, BarChart3, DollarSign, ChevronRight,
} from "lucide-react";
import { postJSON } from "@/lib/api";
import type { NormalizedCar } from "@/lib/normalizeCar";

interface FreakStatsModalProps {
  car: NormalizedCar;
  onClose: () => void;
}

/* ── Markdown → structured sections parser ── */

interface ParsedSection {
  icon: "value" | "analysis" | "strength" | "concern" | "recommendation" | "comparable" | "generic";
  title: string;
  items: string[];       // bullet points
  paragraphs: string[];  // free text paragraphs
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")   // bold
    .replace(/\*(.+?)\*/g, "$1")        // italic
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/^#{1,4}\s*/gm, "")        // headings
    .replace(/^\s*[-*•]\s+/gm, "")      // bullets (handled separately)
    .trim();
}

function classifySection(title: string): ParsedSection["icon"] {
  const t = title.toLowerCase();
  if (/estimat|value|price|worth/i.test(t)) return "value";
  if (/market|overview|summary|analysis/i.test(t)) return "analysis";
  if (/strength|pro|positive|advantage|highlight/i.test(t)) return "strength";
  if (/concern|con|negative|risk|caveat|flaw|weak/i.test(t)) return "concern";
  if (/recommend|verdict|conclusion|bottom line/i.test(t)) return "recommendation";
  if (/comparable|similar|comp|recent sale/i.test(t)) return "comparable";
  return "generic";
}

function parseInsightsMarkdown(raw: string): ParsedSection[] {
  const lines = raw.split("\n");
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  const flush = () => {
    if (current && (current.items.length > 0 || current.paragraphs.length > 0)) {
      sections.push(current);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Heading line (# or ## or **Title**)
    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)/) || trimmed.match(/^\*\*([^*]+)\*\*$/);
    if (headingMatch) {
      flush();
      const title = stripMarkdown(headingMatch[1]);
      current = { icon: classifySection(title), title, items: [], paragraphs: [] };
      continue;
    }

    // Bullet line
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/);
    if (bulletMatch && current) {
      current.items.push(stripMarkdown(bulletMatch[1]));
      continue;
    }

    // Regular paragraph
    if (!current) {
      current = { icon: "analysis", title: "Overview", items: [], paragraphs: [] };
    }
    current.paragraphs.push(stripMarkdown(trimmed));
  }
  flush();

  return sections;
}

/* ── Section icons ── */

const SECTION_ICONS: Record<ParsedSection["icon"], { icon: typeof Sparkles; color: string; bg: string }> = {
  value:          { icon: DollarSign,  color: "text-primary",            bg: "bg-primary/10" },
  analysis:       { icon: BarChart3,   color: "text-blue-500",           bg: "bg-blue-500/10" },
  strength:       { icon: Shield,      color: "text-emerald-500",        bg: "bg-emerald-500/10" },
  concern:        { icon: AlertCircle, color: "text-amber-500",          bg: "bg-amber-500/10" },
  recommendation: { icon: Target,      color: "text-primary",            bg: "bg-primary/10" },
  comparable:     { icon: TrendingUp,  color: "text-violet-500",         bg: "bg-violet-500/10" },
  generic:        { icon: ChevronRight, color: "text-muted-foreground",  bg: "bg-muted" },
};

/* ── Component ── */

export default function FreakStatsModal({ car, onClose }: FreakStatsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sourceUrl = String(car.url || "").trim();
      if (!/^https?:\/\//i.test(sourceUrl)) {
        throw new Error("This listing does not have a source URL for AI analysis.");
      }

      const payload = {
        url: sourceUrl,
        car: {
          id: car.id,
          title: car.title,
          make: car.make,
          model: car.model,
          year: car.year,
          price: car.price,
          mileage: car.mileage,
          transmission: car.transmission,
          exterior_color: car.exteriorColor,
          engine: car.engine,
          vin: car.vin,
          source: car.source,
          location: car.location,
          auction_status: car.auctionStatus,
          description: car.description?.slice(0, 1000),
          url: sourceUrl,
        },
      };
      const res = await postJSON("/freakstats/insights", payload, 120000);

      // The API returns { content: "markdown string" } or sometimes a raw string
      const raw =
        typeof res === "string"
          ? res
          : res?.content ?? res?.text ?? res?.analysis ?? "";

      if (!raw || typeof raw !== "string" || !raw.trim()) {
        throw new Error("No insights returned. Please try again.");
      }

      setSections(parseInsightsMarkdown(raw));
    } catch (err: any) {
      setError(err?.message || "Unable to generate FREAKStats insights.");
    } finally {
      setLoading(false);
    }
  }, [car.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchInsights(); }, [car.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 p-4 border-b border-border flex-shrink-0">
          <div className="p-2 rounded-lg bg-primary/10">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">AI-Powered Analysis</p>
            <h2 className="text-sm font-bold text-foreground truncate">FREAKStats — {car.title}</h2>
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
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Analyzing this listing with AI…</p>
              <p className="text-xs text-muted-foreground/60">This may take 15–30 seconds</p>
            </div>
          )}

          {error && (
            <div className="py-12 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-warning mx-auto" />
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={fetchInsights}
                className="text-sm text-primary hover:text-primary/80 font-medium"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && sections.length > 0 && (
            <>
              {sections.map((section, idx) => {
                const meta = SECTION_ICONS[section.icon];
                const Icon = meta.icon;
                const isValue = section.icon === "value";
                const isRecommendation = section.icon === "recommendation";

                return (
                  <div
                    key={idx}
                    className={`rounded-xl border overflow-hidden ${
                      isValue
                        ? "border-primary/20 bg-primary/5"
                        : isRecommendation
                        ? "border-primary/15 bg-gradient-to-br from-primary/5 to-transparent"
                        : "border-border bg-card"
                    }`}
                  >
                    {/* Section header */}
                    <div className={`flex items-center gap-2.5 px-4 py-3 ${
                      isValue ? "" : "border-b border-border/50"
                    }`}>
                      <div className={`p-1.5 rounded-md ${meta.bg}`}>
                        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      </div>
                      <h3 className={`text-sm font-semibold ${
                        isValue ? "text-primary" : "text-foreground"
                      }`}>
                        {section.title}
                      </h3>
                    </div>

                    {/* Section content */}
                    <div className={`px-4 pb-4 ${isValue ? "pt-0" : "pt-3"} space-y-2`}>
                      {section.paragraphs.map((p, i) => (
                        <p key={i} className={`text-sm leading-relaxed ${
                          isValue
                            ? "text-lg font-bold text-primary"
                            : "text-muted-foreground"
                        }`}>
                          {p}
                        </p>
                      ))}

                      {section.items.length > 0 && (
                        <ul className="space-y-2 mt-1">
                          {section.items.map((item, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                section.icon === "strength"
                                  ? "bg-emerald-500"
                                  : section.icon === "concern"
                                  ? "bg-amber-500"
                                  : "bg-primary"
                              }`} />
                              <span className="leading-relaxed">{item}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                onClick={fetchInsights}
                className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors py-1"
              >
                ↻ Regenerate analysis
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="p-4 border-t border-border flex-shrink-0 text-center">
          <p className="text-[10px] text-muted-foreground">
            Powered by VINFREAK AI · Analysis is for informational purposes only
          </p>
        </footer>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
