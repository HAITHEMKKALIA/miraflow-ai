/**
 * S6. Tarifs (home.md).
 * Toggles devise EUR⇄TND et période Mensuel⇄Annuel (-20%) ; 4 cartes
 * (Business mise en avant) ; les prix flippent (rotateX 90°→0, 350ms,
 * stagger 60ms) ; clic plan → /auth?plan=… ; Enterprise → modale contact.
 */
import { useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { SectionHead, Reveal } from "./shared";
import { cn } from "@/lib/utils";

type Currency = "EUR" | "TND";
type Period = "monthly" | "annual";

interface Plan {
  id: string;
  name: string;
  monthly: { EUR: number; TND: number } | null;
  tagline: string;
  features: string[];
  featured?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    monthly: { EUR: 29, TND: 99 },
    tagline: "Pour démarrer vite, en équipe réduite.",
    features: ["1 session QR", "2 utilisateurs", "2 000 messages/mois", "Inbox partagée", "Réponses enregistrées"],
  },
  {
    id: "business",
    name: "Business",
    monthly: { EUR: 79, TND: 269 },
    tagline: "La croissance sereine, tout inclus.",
    features: ["3 sessions QR", "10 utilisateurs", "15 000 messages/mois", "Campagnes multimédias", "Workflows", "CRM & segments"],
    featured: true,
  },
  {
    id: "agency",
    name: "Agency",
    monthly: { EUR: 199, TND: 679 },
    tagline: "Pour piloter plusieurs marques.",
    features: ["10 sessions QR", "Utilisateurs illimités", "50 000 messages/mois", "6 agents IA", "Marque blanche", "Sous-comptes clients"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: null,
    tagline: "Sur mesure, SLA et sécurité renforcée.",
    features: ["SSO / SAML", "SLA 99,9%", "Quotas dédiés", "Accompagnement", "API"],
  },
];

function Price({ plan, currency, period }: { plan: Plan; currency: Currency; period: Period }) {
  if (!plan.monthly) {
    return <span className="font-display text-[34px] font-semibold text-hi">Sur mesure</span>;
  }
  const base = plan.monthly[currency];
  const value = period === "annual" ? Math.round(base * 0.8) : base;
  const key = `${plan.id}-${currency}-${period}`;
  return (
    <span className="inline-block" style={{ perspective: 400 }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={key}
          initial={{ rotateX: 90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ rotateX: -90, opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="inline-block font-display text-[34px] font-semibold text-hi tabular"
        >
          {value.toLocaleString("fr-FR")}
          <span className="ms-1 text-[15px] font-medium text-mid">{currency === "EUR" ? "€" : "TND"}/mois</span>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default function Pricing() {
  const [currency, setCurrency] = useState<Currency>("TND");
  const [period, setPeriod] = useState<Period>("monthly");
  const [contactOpen, setContactOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <section id="tarifs" className="relative bg-void py-24 md:py-40">
      <div className="aurora" aria-hidden>
        <span /><span /><span />
      </div>
      <div className="relative mx-auto max-w-[1240px] px-6">
        <SectionHead
          overline="TARIFS"
          title="Un prix simple, qui grandit avec vous"
          accent="simple"
          after="14 jours gratuits, sans carte bancaire. Annulable à tout moment."
        />

        {/* Toggles */}
        <Reveal className="mt-10 flex flex-col items-center gap-3">
          <div className="flex items-center rounded-full border border-line bg-surface-1 p-1" role="group" aria-label="Devise">
            {(["TND", "EUR"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                aria-pressed={currency === c}
                className={cn(
                  "rounded-full px-4 py-1.5 label-micro transition-all",
                  currency === c ? "gradient-signature text-white" : "text-mid hover:text-hi",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-full border border-line bg-surface-1 p-1" role="group" aria-label="Période">
            {(
              [
                ["monthly", "Mensuel"],
                ["annual", "Annuel (-20%)"],
              ] as const
            ).map(([p, label]) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={cn(
                  "rounded-full px-4 py-1.5 label-micro transition-all",
                  period === p ? "gradient-signature text-white" : "text-mid hover:text-hi",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Cartes */}
        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 0.09} className="h-full">
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                className={cn(
                  "relative flex h-full flex-col rounded-r-lg p-6",
                  plan.featured
                    ? "border-gradient shadow-glow-iris"
                    : "border border-line bg-surface-1",
                )}
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-signature px-3 py-1 label-micro text-white">
                    Le plus choisi
                  </span>
                )}
                <h3 className="font-display text-[20px] font-semibold text-hi">{plan.name}</h3>
                <p className="mt-1 text-[13px] text-mid">{plan.tagline}</p>
                <div className="mt-5">
                  <Price plan={plan} currency={currency} period={period} />
                  {period === "annual" && plan.monthly && (
                    <p className="mt-1 text-[11px] text-mint">facturé annuellement</p>
                  )}
                </div>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] text-mid">
                      <Check className="mt-0.5 size-4 shrink-0 text-mint" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() =>
                    plan.monthly ? navigate(`/auth?plan=${plan.id}`) : setContactOpen(true)
                  }
                  className={cn(
                    "group mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold transition-all active:scale-[.97]",
                    plan.featured
                      ? "gradient-signature text-white hover:shadow-glow-iris"
                      : "border border-line bg-surface-2 text-hi hover:border-line-strong",
                  )}
                >
                  {plan.monthly ? "Choisir ce plan" : "Nous contacter"}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </motion.div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8 text-center">
          <p className="text-[13px] text-low">
            Tous les plans incluent : FR/AR/EN, mode clair/sombre, PWA, support en français.
          </p>
        </Reveal>
      </div>

      {/* Modale contact Enterprise */}
      <AnimatePresence>
        {contactOpen && (
          <motion.div
            className="fixed inset-0 z-[85] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Contact Enterprise"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" onClick={() => setContactOpen(false)} />
            <motion.form
              initial={{ y: 32, scale: 0.97, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 16, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              onSubmit={(e) => {
                e.preventDefault();
                setContactOpen(false);
              }}
              className="relative w-full max-w-[440px] rounded-r-lg border border-line bg-surface-1 p-7 shadow-card"
            >
              <h3 className="font-display text-[22px] font-semibold text-hi">Parlons de votre projet</h3>
              <p className="mt-1 text-[13px] text-mid">Un expert vous rappelle sous 24 h ouvrées.</p>
              <div className="mt-5 space-y-3">
                <input required placeholder="Nom complet" className="w-full rounded-r-sm border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] text-hi placeholder:text-low focus:border-iris focus:outline-none" />
                <input required type="email" placeholder="Email professionnel" className="w-full rounded-r-sm border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] text-hi placeholder:text-low focus:border-iris focus:outline-none" />
                <textarea placeholder="Votre besoin en quelques mots" rows={3} className="w-full resize-none rounded-r-sm border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] text-hi placeholder:text-low focus:border-iris focus:outline-none" />
              </div>
              <button
                type="submit"
                className="mt-5 w-full rounded-full gradient-signature py-3 text-[14px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow-iris"
              >
                Être rappelé
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
