/**
 * S0. Preloader — home.md.
 * Plein écran bg-void : Core 64px + compteur mono 000→100 (1.4s) + barre
 * dégradé signature ; label mono qui change. À 100 : rideau « soie » qui
 * glisse vers le haut (800ms ease-out-expo). Masqué si visite répétée
 * (sessionStorage « mf:seen »).
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_OUT_EXPO } from "./shared";

const LABELS = ["Initialisation des sessions…", "Chiffrement…", "Orbites synchronisées"];

export default function Preloader({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 1400);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // power2.inOut
      setCount(Math.round(eased * 100));
      if (p < 1) raf = requestAnimationFrame(step);
      else {
        try {
          sessionStorage.setItem("mf:seen", "1");
        } catch {
          /* noop */
        }
        setTimeout(() => setLeaving(true), 200);
        setTimeout(onDone, 1000);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  const label = count < 45 ? LABELS[0] : count < 85 ? LABELS[1] : LABELS[2];

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-void"
      animate={leaving ? { y: "-100%" } : { y: 0 }}
      transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
      aria-hidden
    >
      {/* halo derrière le Core */}
      <div className="absolute size-[320px] rounded-full bg-iris/15 blur-[100px]" />
      <motion.img
        src="/logo.svg"
        alt=""
        className="relative size-16"
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <p className="mt-8 font-mono text-[28px] tabular text-hi">
        {String(count).padStart(3, "0")}
      </p>
      <div className="mt-4 h-[2px] w-[200px] overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full gradient-signature transition-transform duration-100 ease-linear"
          style={{ transform: `scaleX(${count / 100})`, transformOrigin: "left" }}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          className="label-micro mt-4 text-low"
        >
          {label}
        </motion.p>
      </AnimatePresence>
    </motion.div>
  );
}
