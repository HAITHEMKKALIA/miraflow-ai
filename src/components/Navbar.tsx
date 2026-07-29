/**
 * Navbar — navigation marketing (design.md §6 / home.md S1).
 * sticky top-0 z-50 ; transparente en haut de page, glass + bordure `line`
 * après 40px de scroll (transition 300ms). Liens d'ancre vers les sections
 * de la landing + CTA « Essai gratuit » → /onboarding. Switch FR/EN/AR et
 * toggle thème. Menu mobile plein écran (liens stagger 60ms).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu, Moon, Sun, X } from "lucide-react";
import { LANGS, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LINKS = [
  { key: "nav.product", href: "/#produit" },
  { key: "nav.features", href: "/#fonctionnalites" },
  { key: "nav.pricing", href: "/#tarifs" },
  { key: "nav.faq", href: "/#faq" },
];

export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={cn("flex items-center rounded-full border border-line bg-surface-1/60 p-0.5", className)} role="group" aria-label="Langue">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={cn(
            "rounded-full px-2 py-1 label-micro transition-colors",
            lang === l.code ? "bg-surface-3 text-hi" : "text-low hover:text-mid",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
      className={cn(
        "flex size-9 items-center justify-center rounded-full border border-line bg-surface-1/60 text-mid transition-colors hover:text-hi",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export default function Navbar() {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 h-[72px] transition-all duration-300",
          scrolled ? "glass border-b border-line" : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-4 px-6">
          {/* Logo : Core 28px + wordmark */}
          <Link to="/" className="flex items-center gap-2.5" aria-label="MiraFlow AI — accueil">
            <img src="/logo.svg" alt="" className="size-7" />
            <span className="font-display text-[17px] font-semibold tracking-tight text-hi">
              MiraFlow <span className="text-gradient">AI</span>
            </span>
          </Link>

          {/* Liens desktop */}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
            {LINKS.map((l) => (
              <a
                key={l.key}
                href={l.href}
                className="rounded-full px-3.5 py-2 text-[14px] font-medium text-mid transition-colors hover:bg-surface-2 hover:text-hi"
              >
                {t(l.key)}
              </a>
            ))}
          </nav>

          {/* Actions droite */}
          <div className="flex items-center gap-2.5">
            <LangSwitch className="hidden md:flex" />
            <ThemeToggle className="hidden md:flex" />
            <Link
              to="/auth"
              className="hidden items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[13px] font-medium text-mid transition-all duration-200 hover:border-line-strong hover:text-hi md:inline-flex"
            >
              {t("nav.login")}
            </Link>
            <Link
              to="/onboarding"
              className="group hidden items-center gap-2 rounded-full gradient-signature px-5 py-2.5 text-[14px] font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:shadow-glow-iris md:inline-flex"
            >
              {t("nav.cta")}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Ouvrir le menu"
              className="flex size-10 items-center justify-center rounded-full border border-line text-hi lg:hidden"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Menu mobile plein écran */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[60] flex flex-col bg-void/95 backdrop-blur-xl lg:hidden"
          >
            <div className="flex h-[72px] items-center justify-between px-6">
              <span className="flex items-center gap-2.5">
                <img src="/logo.svg" alt="" className="size-7" />
                <span className="font-display text-[17px] font-semibold text-hi">MiraFlow AI</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le menu"
                className="flex size-10 items-center justify-center rounded-full border border-line text-hi"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col items-start justify-center gap-2 px-8" aria-label="Menu mobile">
              {LINKS.map((l, i) => (
                <motion.a
                  key={l.key}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="font-display text-[34px] font-semibold text-hi"
                >
                  {t(l.key)}
                </motion.a>
              ))}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="mt-6 flex flex-wrap items-center gap-3"
              >
                <Link
                  to="/auth"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-6 py-3 text-[15px] font-medium text-mid"
                >
                  {t("nav.login")}
                </Link>
                <Link
                  to="/onboarding"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full gradient-signature px-6 py-3 text-[16px] font-semibold text-white"
                >
                  {t("nav.cta")}
                  <ArrowRight className="size-4" />
                </Link>
                <LangSwitch />
                <ThemeToggle />
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
