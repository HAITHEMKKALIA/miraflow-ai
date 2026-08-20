/**
 * S4. Bento fonctionnalités (home.md).
 * Grille 12 col × 2 rangées : A Inbox (7c), B Campagnes (5c), C Workflows (4c),
 * D Agents IA (4c), E Multilingue RTL (4c), F PWA + Sécurité (12c).
 * Chaque carte : micro-démo animée en boucle, bordure dégradé + lueur qui
 * suit le curseur au hover, clic → modale détail.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router";
import {
  ArrowRight, BellRing, Fingerprint, Languages, Lock, MessageSquare,
  Megaphone, ShieldCheck, Smartphone, Sparkles, Workflow, X,
} from "lucide-react";
import { MiniBubble } from "@/components/ui-shared/PhoneMock";
import { SectionHead, Reveal, EASE_OUT_EXPO } from "./shared";
import { cn } from "@/lib/utils";

/* ── Carte bento avec lueur suivant le curseur ──────────────────────────── */
function BentoCard({
  children,
  className,
  onOpen,
}: {
  children: ReactNode;
  className?: string;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--x", `${e.clientX - r.left}px`);
    el.style.setProperty("--y", `${e.clientY - r.top}px`);
  };
  return (
    <motion.div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onMouseMove={onMove}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-r-lg border border-line bg-surface-1 p-6 text-start transition-colors duration-300 hover:border-transparent",
        className,
      )}
      style={{
        backgroundImage:
          "radial-gradient(320px circle at var(--x, 50%) var(--y, 50%), rgba(255,90,78,.12), transparent 65%)",
      }}
    >
      {/* bordure dégradée au hover */}
      <span className="pointer-events-none absolute inset-0 rounded-r-lg opacity-0 transition-opacity duration-300 group-hover:opacity-100 gradient-signature [mask:linear-gradient(#fff,#fff)_content-box,linear-gradient(#fff,#fff)] [mask-composite:exclude] p-px" />
      {children}
    </motion.div>
  );
}

/* ── Micro-démos ────────────────────────────────────────────────────────── */
function DemoThread() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v >= 3 ? 1 : v + 1)), 2000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mt-5 flex h-[132px] flex-col justify-end gap-1.5 overflow-hidden" aria-hidden>
      <MiniBubble>Vous livrez ce soir ?</MiniBubble>
      {n >= 2 && <MiniBubble out>Oui, avant 19h sur Tunis !</MiniBubble>}
      {n >= 3 && (
        <p className="label-micro mt-1 flex items-center gap-1.5 text-mint">
          <BellRing className="size-3" /> résolu en 2 min 14 s
        </p>
      )}
    </div>
  );
}

function DemoFunnel() {
  const steps = [
    { label: "Envoyés", pct: 100, value: "1 240" },
    { label: "Livrés", pct: 93, value: "1 153" },
    { label: "Ouverts", pct: 74, value: "918" },
    { label: "Réponses", pct: 31, value: "384" },
  ];
  return (
    <div className="mt-5 space-y-2" aria-hidden>
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="w-16 text-[10px] text-low">{s.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full gradient-signature"
              initial={{ width: 0 }}
              whileInView={{ width: `${s.pct}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, delay: i * 0.12, ease: EASE_OUT_EXPO }}
            />
          </div>
          <span className="w-12 text-end font-mono text-[10px] text-mid tabular">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

function DemoSignals() {
  return (
    <svg viewBox="0 0 220 110" className="mt-5 h-[110px] w-full" aria-hidden>
      {[
        "M20 20 C 80 20, 90 55, 110 55",
        "M20 90 C 80 90, 90 55, 110 55",
        "M110 55 C 140 55, 150 35, 200 35",
        "M110 55 C 140 55, 150 80, 200 80",
      ].map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--pulse)" strokeWidth="1.5" className="signal-line" opacity="0.8" />
      ))}
      {[
        [20, 20], [20, 90], [110, 55], [200, 35], [200, 80],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="var(--surface-3)" stroke="var(--iris)" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function DemoAgent() {
  return (
    <div className="mt-5 rounded-r-md border border-iris/30 bg-iris/10 p-3" aria-hidden>
      <p className="flex items-center justify-between text-[11px] font-semibold text-iris">
        <span className="flex items-center gap-1.5"><Sparkles className="size-3" /> Suggestion</span>
        <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[10px] text-mint">92%</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full bg-mint"
          initial={{ width: "12%" }}
          whileInView={{ width: "92%" }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: EASE_OUT_EXPO }}
        />
      </div>
      <p className="mt-2 text-[11px] leading-[16px] text-mid">Réponse rédigée à partir de votre base de connaissances.</p>
    </div>
  );
}

function DemoRtl() {
  const [ar, setAr] = useState(false);
  return (
    <div className="mt-5" aria-hidden={false}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAr(false);
          }}
          className={cn("label-micro rounded-full px-2.5 py-1", !ar ? "bg-surface-3 text-hi" : "text-low")}
        >
          FR
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAr(true);
          }}
          className={cn("label-micro rounded-full px-2.5 py-1", ar ? "bg-surface-3 text-hi" : "text-low")}
        >
          AR
        </button>
        <Languages className="ms-auto size-4 text-low" />
      </div>
      <motion.div
        dir={ar ? "rtl" : "ltr"}
        animate={{ scaleX: [1, -1, 1].slice(0, 1)[0] }}
        className={cn("mt-3 space-y-1.5 transition-transform duration-500", ar && "font-arabic")}
      >
        <div className={cn("max-w-[85%] rounded-xl rounded-bl-md px-3 py-2 text-[11px]", ar ? "bg-bubble-in text-hi ms-auto rounded-br-md rounded-bl-xl" : "bg-bubble-in text-hi")}>
          {ar ? "مرحبا، هل التوصيل متاح اليوم؟" : "Bonjour, livraison possible aujourd'hui ?"}
        </div>
        <div className={cn("max-w-[85%] rounded-xl px-3 py-2 text-[11px] text-white bubble-out", ar ? "me-auto rounded-bl-md rounded-br-xl" : "ms-auto rounded-br-md")}>
          {ar ? "نعم، قبل الساعة 19:00 في تونس!" : "Oui, avant 19h sur Tunis !"}
        </div>
      </motion.div>
    </div>
  );
}

/* ── Modale détail ──────────────────────────────────────────────────────── */
interface FeatureDef {
  id: string;
  icon: typeof MessageSquare;
  title: string;
  desc: string;
  bullets: string[];
  demo: ReactNode;
  to: string;
}

export default function Bento() {
  const [openId, setOpenId] = useState<string | null>(null);

  const FEATURES: FeatureDef[] = [
    {
      id: "inbox",
      icon: MessageSquare,
      title: "Inbox d'équipe",
      desc: "Toutes les conversations centralisées, attribuées et résolues ensemble.",
      bullets: ["Attribution & statuts en temps réel", "Réponses enregistrées et variables", "Médias, notes internes, raccourcis clavier"],
      demo: <DemoThread />,
      to: "/app/inbox",
    },
    {
      id: "campagnes",
      icon: Megaphone,
      title: "Campagnes multimédias",
      desc: "Carrousels produits, variables et planification qui convertissent.",
      bullets: ["Carrousels images & boutons d'action", "Segments dynamiques du CRM", "Suivi livrés / réponses en direct"],
      demo: <DemoFunnel />,
      to: "/app/campaigns",
    },
    {
      id: "workflows",
      icon: Workflow,
      title: "Workflows visuels",
      desc: "Automatisez relances, bienvenues et escalades sur un canvas.",
      bullets: ["Déclencheurs, conditions, délais", "Journal d'exécution en direct", "Dead-letter queue & reprise"],
      demo: <DemoSignals />,
      to: "/app/workflows",
    },
    {
      id: "agents",
      icon: Sparkles,
      title: "Agents IA locaux",
      desc: "6 agents qui suggèrent des réponses sourcées, sous contrôle humain.",
      bullets: ["Score de confiance & sources citées", "Validation humaine systématique", "Mode autonome par agent"],
      demo: <DemoAgent />,
      to: "/app/agents",
    },
    {
      id: "rtl",
      icon: Languages,
      title: "Multilingue & RTL",
      desc: "FR, AR, EN — interface complète, miroir RTL natif inclus.",
      bullets: ["Traduction intégrale de l'interface", "RTL : sidebar, bulles, steppers", "Police arabe IBM Plex Sans Arabic"],
      demo: <DemoRtl />,
      to: "/app/settings",
    },
    {
      id: "pwa",
      icon: Smartphone,
      title: "PWA + Sécurité",
      desc: "Installable en 1 clic, chiffrée, auditée — pensée pour le terrain.",
      bullets: ["Installation 1 clic sur mobile & desktop", "Chiffrement des sessions", "MFA & audit log d'équipe"],
      demo: null,
      to: "/app/settings",
    },
  ];

  const open = FEATURES.find((f) => f.id === openId);

  return (
    <section id="fonctionnalites" className="relative bg-base py-24 md:py-40">
      <div className="mx-auto max-w-[1240px] px-6">
        <SectionHead
          overline="FONCTIONNALITÉS"
          title="Tout ce qu'il faut pour vendre dans la conversation"
          accent="vendre"
        />

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* A — Inbox (7 col) */}
          <Reveal className="md:col-span-7" delay={0}>
            <BentoCard className="h-full w-full" onOpen={() => setOpenId("inbox")}>
              <FeatureHead f={FEATURES[0]} />
              <DemoThread />
            </BentoCard>
          </Reveal>
          {/* B — Campagnes (5 col) */}
          <Reveal className="md:col-span-5" delay={0.09}>
            <BentoCard className="h-full w-full" onOpen={() => setOpenId("campagnes")}>
              <FeatureHead f={FEATURES[1]} />
              <DemoFunnel />
            </BentoCard>
          </Reveal>
          {/* C — Workflows (4 col) */}
          <Reveal className="md:col-span-4" delay={0.05}>
            <BentoCard className="h-full w-full" onOpen={() => setOpenId("workflows")}>
              <FeatureHead f={FEATURES[2]} />
              <DemoSignals />
            </BentoCard>
          </Reveal>
          {/* D — Agents IA (4 col) */}
          <Reveal className="md:col-span-4" delay={0.14}>
            <BentoCard className="h-full w-full" onOpen={() => setOpenId("agents")}>
              <FeatureHead f={FEATURES[3]} />
              <DemoAgent />
            </BentoCard>
          </Reveal>
          {/* E — RTL (4 col) */}
          <Reveal className="md:col-span-4" delay={0.23}>
            <BentoCard className="h-full w-full" onOpen={() => setOpenId("rtl")}>
              <FeatureHead f={FEATURES[4]} />
              <DemoRtl />
            </BentoCard>
          </Reveal>
          {/* F — PWA + Sécurité (12 col) */}
          <Reveal className="md:col-span-12" delay={0.1}>
            <BentoCard className="w-full" onOpen={() => setOpenId("pwa")}>
              <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
                <div className="min-w-[240px] flex-1">
                  <FeatureHead f={FEATURES[5]} />
                </div>
                <div className="flex flex-wrap gap-2.5" aria-hidden>
                  {[
                    { icon: Smartphone, label: "Installation 1 clic" },
                    { icon: Lock, label: "Chiffrement" },
                    { icon: Fingerprint, label: "MFA" },
                    { icon: ShieldCheck, label: "Audit log" },
                  ].map((c) => (
                    <span
                      key={c.label}
                      className="flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3.5 py-2 text-[12px] font-medium text-mid"
                    >
                      <c.icon className="size-3.5 text-pulse" />
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>
            </BentoCard>
          </Reveal>
        </div>
      </div>

      {/* Modale détail fonctionnalité */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[85] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={open.title}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" onClick={() => setOpenId(null)} />
            <motion.div
              initial={{ y: 32, scale: 0.97, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 16, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="relative w-full max-w-[480px] rounded-r-lg border border-line bg-surface-1 p-7 shadow-card"
            >
              <button
                type="button"
                onClick={() => setOpenId(null)}
                aria-label="Fermer"
                className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full text-mid hover:bg-surface-2 hover:text-hi"
              >
                <X className="size-4" />
              </button>
              <img src="/empty-orbit.svg" alt="" className="h-20 w-auto opacity-80" />
              <h3 className="mt-4 font-display text-[24px] font-semibold text-hi">{open.title}</h3>
              <p className="mt-2 text-[14px] leading-[22px] text-mid">{open.desc}</p>
              <ul className="mt-4 space-y-2">
                {open.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[13px] text-mid">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full gradient-signature" />
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                to="/onboarding"
                className="group mt-6 inline-flex items-center gap-2 rounded-full gradient-signature px-5 py-2.5 text-[14px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow-iris"
              >
                Essayer gratuitement
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function FeatureHead({ f }: { f: FeatureDef }) {
  const Icon = f.icon;
  return (
    <div>
      <span className="flex size-10 items-center justify-center rounded-r-md border border-line bg-surface-2 text-pulse">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 font-display text-[20px] font-semibold text-hi">{f.title}</h3>
      <p className="mt-1.5 text-[13px] leading-[20px] text-mid">{f.desc}</p>
    </div>
  );
}
