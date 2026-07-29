/**
 * S1. Hero — « La constellation de vos conversations » (home.md).
 * Fond WebGL (HeroCanvas) + contenu : sur-titre mono, titre cinétique split
 * caractères, sous-titre, 2 CTA, ligne de preuve, indicateur scroll,
 * bandeau « Démo live » alimenté par le SimEngine.
 */
import { Suspense, lazy } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { useKpis } from "@/lib/sim/store";
import StatusDot from "@/components/ui-shared/StatusDot";
import TickNumber from "@/components/ui-shared/TickNumber";
import { scrollToId } from "./lenis";
import { EASE_OUT_EXPO } from "./shared";

const HeroCanvas = lazy(() => import("./HeroCanvas"));

/** Titre cinétique : split caractères, y:110%→0, rotate 4°→0, stagger 18ms */
function KineticWord({
  word,
  delay,
  accent = false,
}: {
  word: string;
  delay: number;
  accent?: boolean;
}) {
  return (
    <span className="inline-flex overflow-hidden pb-[0.08em] -mb-[0.08em] align-bottom">
      {word.split("").map((ch, i) => (
        <motion.span
          key={`${ch}-${i}`}
          initial={{ y: "110%", rotate: 4, opacity: 0 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE_OUT_EXPO, delay: delay + i * 0.018 }}
          className={
            accent
              ? "inline-block font-serif italic font-normal text-gradient pe-[0.06em]"
              : "inline-block"
          }
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}

/** Bandeau « Démo live » (bas droite, glass, ~300px) — télémétrie SimEngine */
function DemoBanner() {
  const kpis = useKpis();
  return (
    <motion.button
      type="button"
      onClick={() => scrollToId("produit")}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 1.1, type: "spring", stiffness: 260, damping: 26 }}
      className="glass absolute bottom-8 right-6 z-20 hidden w-[300px] rounded-r-md p-4 text-start md:block lg:right-10"
    >
      <p className="label-micro flex items-center gap-2 text-mint">
        <StatusDot tone="mint" /> Démo live
      </p>
      <p className="mt-3 font-display text-[22px] font-semibold text-hi">
        <TickNumber value={kpis.messagesToday} />{" "}
        <span className="text-[13px] font-medium text-mid">messages aujourd'hui</span>
      </p>
      <div className="mt-2 flex items-center justify-between text-[12px] text-mid">
        <span className="flex items-center gap-1.5">
          <StatusDot tone="mint" size={6} ping={false} />
          {kpis.activeSessions} sessions connectées
        </span>
        <span className="tabular">taux de réponse {kpis.responseRate}%</span>
      </div>
    </motion.button>
  );
}

export default function Hero() {
  return (
    <section className="relative flex min-h-[max(720px,100dvh)] items-center overflow-hidden bg-void">
      {/* Fond WebGL (fallback poster intégré) */}
      <Suspense
        fallback={
          <div className="absolute inset-0" aria-hidden>
            <img src="/hero-fallback.png" alt="" className="h-full w-full object-cover opacity-60" />
          </div>
        }
      >
        <HeroCanvas />
      </Suspense>
      {/* voile pour la lisibilité */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-void/80 via-void/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-void to-transparent" />

      {/* Contenu */}
      <div className="relative z-10 mx-auto w-full max-w-[1240px] px-6 pb-28 pt-[120px] md:pb-24">
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE_OUT_EXPO, delay: 0.4 }}
          className="label-micro text-pulse"
        >
          ● Plateforme de messagerie conversationnelle — FR · AR · EN
        </motion.p>

        <h1 className="mt-6 max-w-[13ch] font-display text-[clamp(2.5rem,11vw,4rem)] font-semibold leading-[.95] tracking-[-0.035em] text-hi md:text-[clamp(3rem,7.5vw,7rem)]">
          <KineticWord word="Connecter." delay={0.55} />{" "}
          <KineticWord word="Automatiser." delay={0.75} />{" "}
          <KineticWord word="Vendre." delay={0.98} accent />{" "}
          <KineticWord word="Superviser." delay={1.18} />
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE_OUT_EXPO, delay: 0.55 }}
          className="mt-6 max-w-[56ch] text-[16px] leading-[26px] text-mid"
        >
          MiraFlow AI transforme vos conversations clients en revenus : inbox d'équipe,
          campagnes multimédias, workflows et agents IA — connectés par simple QR, sans
          API officielle.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT_EXPO, delay: 0.7 }}
          className="mt-9 flex flex-wrap items-center gap-4"
        >
          <Link
            to="/onboarding"
            className="group inline-flex items-center gap-2.5 rounded-full gradient-signature px-7 py-3.5 text-[15px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow-iris active:scale-[.97]"
          >
            Démarrer l'essai gratuit
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <button
            type="button"
            onClick={() => scrollToId("produit")}
            className="group inline-flex items-center gap-3 rounded-full glass px-6 py-3.5 text-[15px] font-semibold text-hi transition-all duration-200 hover:border-line-strong"
          >
            <span className="relative flex size-6 items-center justify-center">
              <svg viewBox="0 0 24 24" className="absolute inset-0 size-6 -rotate-90">
                <circle cx="12" cy="12" r="10" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
                <circle
                  cx="12" cy="12" r="10" fill="none" stroke="var(--pulse)" strokeWidth="1.5"
                  strokeDasharray="63" strokeLinecap="round"
                  className="origin-center animate-[spin_6s_linear_infinite]"
                  strokeDashoffset="20"
                />
              </svg>
              <Play className="size-2.5 fill-current text-pulse transition-transform group-hover:scale-125" />
            </span>
            Voir la démo live
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="mt-7 text-[13px] text-low"
        >
          ✓ 14 jours gratuits&nbsp;&nbsp;·&nbsp;&nbsp;✓ Sans carte bancaire&nbsp;&nbsp;·&nbsp;&nbsp;✓ 5 minutes pour connecter
        </motion.p>
      </div>

      {/* Indicateur scroll (bas gauche) */}
      <motion.button
        type="button"
        onClick={() => scrollToId("marquee")}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="absolute bottom-8 left-6 z-20 flex flex-col items-center gap-3 lg:left-10"
        aria-label="Faire défiler"
      >
        <span className="label-micro text-low [writing-mode:vertical-rl]">Défiler</span>
        <span className="relative block h-12 w-px overflow-hidden bg-line">
          <span className="absolute inset-x-0 h-full animate-scroll-drop bg-pulse" />
        </span>
      </motion.button>

      <DemoBanner />
    </section>
  );
}
