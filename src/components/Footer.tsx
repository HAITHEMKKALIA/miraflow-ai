/**
 * Footer — pied de page marketing (design.md §6 / home.md S10).
 * 4 colonnes (Produit / Ressources / Entreprise / Légal), newsletter,
 * sélecteur langue + toggle thème, puis barre légale avec le disclaimer
 * WhatsApp/Meta.
 */
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LangSwitch, ThemeToggle } from "./Navbar";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Produit",
    links: [
      { label: "Fonctionnalités", href: "/#fonctionnalites" },
      { label: "Tarifs", href: "/#tarifs" },
      { label: "Sécurité", href: "/#fonctionnalites" },
      { label: "Feuille de route", href: "/#produit" },
    ],
  },
  {
    title: "Ressources",
    links: [
      { label: "Guide de démarrage", href: "/#produit" },
      { label: "Centre d'aide", href: "/#faq" },
      { label: "API", href: "/#fonctionnalites" },
      { label: "Statut", href: "/#fonctionnalites" },
    ],
  },
  {
    title: "Entreprise",
    links: [
      { label: "À propos", href: "/#temoignages" },
      { label: "Revendeurs", href: "/#tarifs" },
      { label: "Contact", href: "/#faq" },
    ],
  },
  {
    title: "Légal",
    links: [
      { label: "CGU", href: "/#faq" },
      { label: "Confidentialité", href: "/#faq" },
      { label: "Cookies", href: "/#faq" },
    ],
  },
];

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-line bg-void">
      <div className="mx-auto max-w-[1240px] px-6 pb-10 pt-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_repeat(4,1fr)]">
          {/* Marque + newsletter */}
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="" className="size-7" />
              <span className="font-display text-[17px] font-semibold text-hi">
                MiraFlow <span className="text-gradient">AI</span>
              </span>
            </Link>
            <p className="mt-4 max-w-[34ch] text-[14px] leading-[22px] text-mid">
              Connecter. Automatiser. <span className="font-serif italic text-hi">Vendre.</span> Superviser.
            </p>
            <form
              className="mt-6 flex max-w-[320px] items-center gap-2"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                required
                placeholder="Votre email pro"
                aria-label="Votre email pro"
                className="h-10 w-full rounded-r-sm border border-line bg-surface-1 px-3 text-[13px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
              />
              <button
                type="submit"
                aria-label="S'inscrire à la newsletter"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-r-sm gradient-signature text-white transition-transform hover:scale-105 active:scale-95"
              >
                <ArrowRight className="size-4" />
              </button>
            </form>
            <div className="mt-6 flex items-center gap-2">
              <LangSwitch />
              <ThemeToggle />
            </div>
          </div>

          {/* Colonnes de liens */}
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="label-micro text-low">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="group relative text-[14px] text-mid transition-colors hover:text-hi"
                    >
                      {l.label}
                      <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-iris transition-transform duration-250 group-hover:scale-x-100" />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Barre légale */}
        <div className="mt-14 border-t border-line pt-6">
          <p className="max-w-[72ch] text-[12px] leading-[18px] text-low">
            MiraFlow AI est un produit indépendant, non affilié, non autorisé et non approuvé par
            WhatsApp ou Meta.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-low">
            <span>© 2025 MiraFlow AI. {t("nav.cta")} — 14 jours, sans carte bancaire.</span>
            <span className="flex gap-4">
              <a href="/#faq" className="hover:text-mid">CGU</a>
              <a href="/#faq" className="hover:text-mid">Confidentialité</a>
              <a href="/#faq" className="hover:text-mid">Cookies</a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
