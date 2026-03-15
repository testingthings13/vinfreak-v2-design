import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Menu, X, Moon, Sun } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const LOGO_URL = "https://cdn.vinfreak.com/branding/VCzgNThhX13rCP1Yu8pTwg.png";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("vinfreak-theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("vinfreak-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border/50">
        <div className="container flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={LOGO_URL}
              alt="VINFREAK"
              className="h-12 w-auto object-contain"
            />
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className={`hidden sm:inline-flex px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === "/" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Browse
            </Link>
            <button
              onClick={() => setDark(!dark)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              Sign In
            </button>
            <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden border-t border-border"
            >
              <div className="container py-3 space-y-2">
                <Link to="/" onClick={() => setMobileOpen(false)} className="block px-3 py-2 text-sm font-medium rounded-lg hover:bg-muted">Home</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
