/**
 * shared.tsx — primitives communes des sections marketing (home.md §2).
 * SectionHead, Reveal, CountUp + constantes d'easing.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";

export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** En-tête de section : overline mono + titre serif mixte + paragraphe */
export function SectionHead({
  overline,
  title,
  accent,
  after,
  align = "center",
}: {
  overline: string;
  title: string;
  /** mot mis en italic serif + dégradé (doit figurer dans `title`) */
  accent?: string;
  after?: string;
  align?: "center" | "start";
}) {
  const parts = accent ? title.split(accent) : [title];
  return (
    <div className={cn("max-w-[720px]", align === "center" ? "mx-auto text-center" : "text-start")}>
      <Reveal>
        <p className="label-micro text-pulse">{overline}</p>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 className="mt-4 font-display text-[clamp(2.25rem,4.5vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-hi">
          {parts[0]}
          {accent && (
            <span className="font-serif italic font-normal text-gradient">{accent}</span>
          )}
          {parts[1]}
        </h2>
      </Reveal>
      {after && (
        <Reveal delay={0.16}>
          <p className="mt-5 text-[15px] leading-[24px] text-mid md:text-[16px] md:leading-[26px]">
            {after}
          </p>
        </Reveal>
      )}
    </div>
  );
}

/** Reveal on scroll : y:40→0, 700ms ease-out-expo, trigger 15% */
export function Reveal({
  children,
  delay = 0,
  className,
  y = 40,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 0.7, ease: EASE_OUT_EXPO, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Count-up au scroll (requestAnimationFrame, 1.2s power2.out) */
export function CountUp({
  value,
  format = (v: number) => Math.round(v).toLocaleString("fr-FR"),
  className,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 1200);
      const e = 1 - Math.pow(1 - p, 2);
      setDisplay(value * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {format(display)}
    </span>
  );
}
