/**
 * S3. Démo produit épinglée — « Un produit, quatre super-pouvoirs » (home.md).
 * Desktop : section épinglée 220vh (GSAP ScrollTrigger) ; la progression du
 * scroll pilote l'étape active ; le PhoneMock (420×820) transitionne vers
 * l'écran correspondant (crossfade + y:24, 450ms). Panneau dashboard en
 * arrière-plan avec parallax. Mobile (<768px) : pas de pin, cartes empilées.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { CheckCheck, Sparkles } from "lucide-react";
import PhoneMock, { MiniBubble, PhoneStatusBar } from "@/components/ui-shared/PhoneMock";
import { Reveal } from "./shared";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const STEPS = [
  {
    num: "01",
    title: "Inbox d'équipe",
    text: "Toute l'équipe sur une seule inbox. Attribution, réponses enregistrées, statuts en temps réel.",
  },
  {
    num: "02",
    title: "Campagnes qui vendent",
    text: "Variables, carrousels produits, planification fuseau horaire.",
  },
  {
    num: "03",
    title: "Workflows visuels",
    text: "Déclencheurs, conditions, délais — glissés sur un canvas.",
  },
  {
    num: "04",
    title: "Agents IA locaux",
    text: "Suggestions avec sources et score de confiance, validation humaine.",
  },
];

/* ── Écrans du téléphone ──────────────────────────────────────────────── */
function ScreenInbox() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c >= 3 ? 1 : c + 1)), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex h-full flex-col">
      <PhoneStatusBar />
      <div className="border-b border-line px-4 py-2.5">
        <p className="text-[12px] font-semibold text-hi">Sami Ben Ali</p>
        <p className="text-[10px] text-mint">en ligne · Boutique Principale</p>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-hidden p-3">
        <MiniBubble>Bonjour, les coffrets Aid sont dispo ?</MiniBubble>
        {count >= 2 && (
          <MiniBubble out>
            Oui ! Il en reste 12 — je vous en réserve un ?
          </MiniBubble>
        )}
        {count >= 3 && (
          <>
            <MiniBubble>Parfait, avec carte personnalisée svp</MiniBubble>
            <span className="self-end text-[9px] text-mid">
              <CheckCheck className="inline size-3 text-mint" /> lu · 14:02
            </span>
          </>
        )}
      </div>
      <div className="m-3 flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-2">
        <span className="flex-1 text-[10px] text-low">Répondre…</span>
        <span className="size-5 rounded-full gradient-signature" />
      </div>
    </div>
  );
}

function ScreenCampaign() {
  return (
    <div className="flex h-full flex-col">
      <PhoneStatusBar />
      <div className="border-b border-line px-4 py-2.5">
        <p className="text-[12px] font-semibold text-hi">Campagne · Offre Aid</p>
        <p className="text-[10px] text-mid">envoyée à 1 240 contacts</p>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <MiniBubble className="w-full max-w-[88%] !p-0 overflow-hidden">
          <img src="/product-pastry.png" alt="Coffret pâtisseries orientales" className="aspect-square w-full object-cover" />
          <span className="block p-2.5">
            <span className="block text-[11px] font-semibold text-hi">Coffret Découverte — Aid</span>
            <span className="mt-0.5 block text-[10px] leading-[14px] text-mid">
              Baklava pistache, makroudh, samsa. -20% cette semaine avec le code AID20.
            </span>
          </span>
        </MiniBubble>
        <div className="mt-1 flex gap-1.5">
          <span className="rounded-full border border-iris/40 bg-iris/10 px-2.5 py-1 text-[9px] font-medium text-iris">Je commande</span>
          <span className="rounded-full border border-line px-2.5 py-1 text-[9px] font-medium text-mid">Voir le menu</span>
        </div>
      </div>
      <div className="px-3 pb-4">
        <div className="flex justify-between text-[9px] text-low">
          <span>Livrés 690/742</span>
          <span className="text-mint">96 réponses</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-[62%] rounded-full gradient-signature" />
        </div>
      </div>
    </div>
  );
}

function ScreenWorkflow() {
  const nodes = [
    { label: "Panier abandonné", tone: "text-pulse border-pulse/40" },
    { label: "Attendre 24 h", tone: "text-mid border-line" },
    { label: "Si non commandé", tone: "text-amber border-amber/40" },
    { label: "Relance -10%", tone: "text-mint border-mint/40" },
  ];
  return (
    <div className="flex h-full flex-col">
      <PhoneStatusBar />
      <div className="border-b border-line px-4 py-2.5">
        <p className="text-[12px] font-semibold text-hi">Workflow · Panier J+1</p>
        <p className="text-[10px] text-mint">actif · 862 exécutions</p>
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center gap-1 p-4">
        {nodes.map((n, i) => (
          <div key={n.label} className="flex flex-col items-center">
            {i > 0 && (
              <svg width="2" height="26" className="my-0.5">
                <line x1="1" y1="0" x2="1" y2="26" stroke="var(--pulse)" strokeWidth="2" className="signal-line" />
              </svg>
            )}
            <span className={cn("rounded-full border bg-surface-2 px-3 py-1.5 text-[10px] font-medium", n.tone)}>
              {n.label}
            </span>
          </div>
        ))}
      </div>
      <p className="px-4 pb-5 text-center text-[9px] text-low">signal en direct · 97,1% de succès</p>
    </div>
  );
}

function ScreenAgent() {
  return (
    <div className="flex h-full flex-col">
      <PhoneStatusBar />
      <div className="border-b border-line px-4 py-2.5">
        <p className="text-[12px] font-semibold text-hi">Agent Commercial</p>
        <p className="text-[10px] text-iris">mode suggestion</p>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <MiniBubble>Mon colis est annoncé livré mais je n'ai rien reçu…</MiniBubble>
        <div className="rounded-xl border border-iris/30 bg-iris/10 p-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-iris">
            <Sparkles className="size-3" /> Suggestion de Mira
            <span className="ms-auto rounded-full bg-mint/15 px-1.5 py-0.5 text-[9px] text-mint">
              confiance 92%
            </span>
          </p>
          <p className="mt-1.5 text-[10px] leading-[15px] text-hi">
            Je suis vraiment désolée ! J'ouvre une réclamation transporteur et je vous
            renvoie le coffret aujourd'hui. Source : politique SAV §2.
          </p>
        </div>
      </div>
      <div className="flex gap-2 px-3 pb-5">
        <span className="flex-1 rounded-full gradient-signature py-2 text-center text-[10px] font-semibold text-white">
          Valider & envoyer
        </span>
        <span className="flex-1 rounded-full border border-line py-2 text-center text-[10px] font-medium text-mid">
          Modifier
        </span>
      </div>
    </div>
  );
}

const SCREENS = [ScreenInbox, ScreenCampaign, ScreenWorkflow, ScreenAgent];

/* ── Section ────────────────────────────────────────────────────────────── */
export default function ProductDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [step, setStep] = useState(0);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 768px)", () => {
        const st = ScrollTrigger.create({
          trigger: sectionRef.current!,
          start: "top top",
          end: "+=220%",
          pin: true,
          onUpdate: (self) => {
            const p = self.progress * STEPS.length;
            const idx = Math.min(STEPS.length - 1, Math.floor(p));
            setStep(idx);
            barRefs.current.forEach((bar, i) => {
              if (!bar) return;
              const local = Math.max(0, Math.min(1, p - i));
              bar.style.transform = `scaleX(${local})`;
            });
          },
        });
        const tween = gsap.to(panelRef.current, {
          yPercent: -6,
          ease: "none",
          scrollTrigger: { trigger: sectionRef.current, start: "top top", end: "+=220%", scrub: true },
        });
        return () => {
          st.kill();
          tween.scrollTrigger?.kill();
          tween.kill();
        };
      });
      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  const ActiveScreen = SCREENS[step];

  return (
    <section id="produit" ref={sectionRef} className="relative overflow-hidden bg-base">
      <div className="aurora" aria-hidden>
        <span /><span /><span />
      </div>

      {/* ── Desktop : section épinglée ── */}
      <div className="relative mx-auto hidden min-h-[100dvh] max-w-[1240px] grid-cols-12 items-center gap-8 px-6 md:grid">
        {/* Étapes (col 1–5) */}
        <div className="col-span-5">
          <p className="label-micro text-pulse">LE PRODUIT</p>
          <h2 className="mt-4 font-display text-[clamp(2rem,3.4vw,3.2rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-hi">
            Un produit, quatre <span className="font-serif italic font-normal text-gradient">super-pouvoirs</span>
          </h2>
          <div className="mt-10 space-y-2">
            {STEPS.map((s, i) => (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(i)}
                className="block w-full py-4 text-start"
              >
                <div className="flex items-baseline gap-4">
                  <span
                    className={cn(
                      "font-mono text-[13px] transition-colors duration-300",
                      i === step ? "text-pulse" : "text-low",
                    )}
                  >
                    {s.num}
                  </span>
                  <div className="flex-1">
                    <h3
                      className={cn(
                        "font-display text-[24px] font-semibold transition-colors duration-300 md:text-[28px]",
                        i === step ? "text-hi" : "text-low",
                      )}
                    >
                      {s.title}
                    </h3>
                    <p
                      className={cn(
                        "mt-1 max-w-[44ch] text-[14px] leading-[22px] transition-opacity duration-300",
                        i === step ? "text-mid opacity-100" : "text-low opacity-50",
                      )}
                    >
                      {s.text}
                    </p>
                    <div className="mt-3 h-px w-full bg-line">
                      <div
                        ref={(el) => {
                          barRefs.current[i] = el;
                        }}
                        className="h-px origin-left scale-x-0 gradient-signature"
                      />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* PhoneMock + dashboard flottant (col 6–12) */}
        <div className="relative col-span-7 flex items-center justify-center">
          {/* panneau dashboard flottant avec parallax */}
          <div
            ref={panelRef}
            className="glass absolute -left-6 top-1/2 z-0 hidden w-[300px] -translate-y-[58%] rounded-r-md p-4 lg:block"
            aria-hidden
          >
            <p className="label-micro text-mid">Activité · aujourd'hui</p>
            <div className="mt-3 flex h-16 items-end gap-1">
              {[38, 55, 42, 68, 60, 82, 74, 95, 88, 100, 92, 78].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm gradient-signature opacity-70"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[11px] text-mid">
              <span>2 481 messages</span>
              <span className="text-mint">+8%</span>
            </div>
          </div>

          {/* PhoneMock avec screens qui transitionnent */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="relative z-10"
          >
            <PhoneMock className="scale-[.82] origin-center lg:scale-90">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full"
                >
                  <ActiveScreen />
                </motion.div>
              </AnimatePresence>
            </PhoneMock>
          </motion.div>
        </div>
      </div>

      {/* ── Mobile : cartes empilées, pas de pin ── */}
      <div className="relative mx-auto max-w-[1240px] px-6 py-20 md:hidden">
        <Reveal>
          <p className="label-micro text-pulse">LE PRODUIT</p>
          <h2 className="mt-4 font-display text-[2rem] font-semibold leading-[1.04] tracking-[-0.03em] text-hi">
            Un produit, quatre <span className="font-serif italic font-normal text-gradient">super-pouvoirs</span>
          </h2>
        </Reveal>
        <div className="mt-10 space-y-10">
          {STEPS.map((s, i) => {
            const Screen = SCREENS[i];
            return (
              <Reveal key={s.num} delay={0.05}>
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-[13px] text-pulse">{s.num}</span>
                    <h3 className="font-display text-[22px] font-semibold text-hi">{s.title}</h3>
                  </div>
                  <p className="mt-2 text-[14px] leading-[22px] text-mid">{s.text}</p>
                  <div className="mt-5 flex justify-center">
                    <PhoneMock className="scale-[.68] origin-top -mb-[34%]">
                      <Screen />
                    </PhoneMock>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
