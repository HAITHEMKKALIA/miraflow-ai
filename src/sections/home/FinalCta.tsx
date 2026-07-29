/**
 * S9. CTA final (home.md).
 * Panneau géant surface-1 r-lg avec aurora interne + Core 200px flottant
 * au-dessus ; clip-path inset(8% 12%)→inset(0) au scroll (scrub) ; CTA
 * magnétique (translate vers le curseur ≤6px, lerp, desktop).
 */
import { useRef } from "react";
import { Link } from "react-router";
import { motion, useMotionValue, useSpring } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight, CalendarClock } from "lucide-react";
import { Reveal } from "./shared";

gsap.registerPlugin(ScrollTrigger, useGSAP);

function Magnetic({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 18 });
  const sy = useSpring(y, { stiffness: 200, damping: 18 });

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const r = el.getBoundingClientRect();
    x.set(Math.max(-6, Math.min(6, (e.clientX - r.left - r.width / 2) * 0.12)));
    y.set(Math.max(-6, Math.min(6, (e.clientY - r.top - r.height / 2) * 0.12)));
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} style={{ x: sx, y: sy }} className="inline-block">
      {children}
    </motion.div>
  );
}

export default function FinalCta() {
  const panelRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
      gsap.fromTo(
        panelRef.current,
        { clipPath: "inset(8% 12% round 20px)" },
        {
          clipPath: "inset(0% 0% round 20px)",
          ease: "none",
          scrollTrigger: {
            trigger: panelRef.current,
            start: "top 85%",
            end: "top 30%",
            scrub: 1,
          },
        },
      );
    },
    { scope: panelRef },
  );

  return (
    <section className="relative overflow-hidden bg-base py-28 md:py-44">
      {/* signal lines de fond qui convergent */}
      <svg viewBox="0 0 1200 400" className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-[120%] max-w-none -translate-y-1/2 opacity-40" aria-hidden>
        {["M0 60 C 400 60, 500 200, 600 200", "M0 340 C 400 340, 500 200, 600 200", "M1200 60 C 800 60, 700 200, 600 200", "M1200 340 C 800 340, 700 200, 600 200"].map((d) => (
          <path key={d} d={d} fill="none" stroke="var(--pulse)" strokeWidth="1" className="signal-line" opacity="0.5" />
        ))}
      </svg>

      <div className="relative mx-auto max-w-[1240px] px-6">
        <div
          ref={panelRef}
          className="relative overflow-hidden rounded-r-lg border border-line bg-surface-1 px-6 pb-20 pt-28 text-center md:pb-28 md:pt-32"
        >
          {/* aurora interne */}
          <div className="aurora" aria-hidden>
            <span /><span /><span />
          </div>

          {/* Core flottant au-dessus */}
          <motion.div
            className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[40%]"
            animate={{ y: ["-40%", "calc(-40% - 12px)", "-40%"] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          >
            <div className="absolute left-1/2 top-1/2 size-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-iris/30 blur-[70px]" />
            <img src="/logo.svg" alt="" className="relative size-[200px]" />
          </motion.div>

          <Reveal>
            <h2 className="relative mx-auto max-w-[18ch] font-display text-[clamp(2.25rem,5vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-hi">
              Prêt à faire <span className="font-serif italic font-normal text-gradient">décoller</span> vos conversations ?
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="relative mx-auto mt-5 max-w-[52ch] text-[16px] leading-[26px] text-mid">
              14 jours gratuits, sans carte bancaire. Votre première session connectée en 5 minutes.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="relative mt-9 flex flex-wrap items-center justify-center gap-4">
              <Magnetic>
                <Link
                  to="/onboarding"
                  className="group inline-flex items-center gap-2.5 rounded-full gradient-signature px-8 py-4 text-[15px] font-semibold text-white transition-shadow hover:shadow-glow-iris"
                >
                  Démarrer l'essai gratuit
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </Magnetic>
              <Magnetic>
                <Link
                  to="/app"
                  className="inline-flex items-center gap-2.5 rounded-full glass px-7 py-4 text-[15px] font-semibold text-hi transition-colors hover:border-line-strong"
                >
                  <CalendarClock className="size-4 text-pulse" />
                  Planifier une démo
                </Link>
              </Magnetic>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
