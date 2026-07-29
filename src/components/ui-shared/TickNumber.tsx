/**
 * TickNumber — chiffre qui « tique » (design.md §5).
 * À chaque changement de valeur : ancien chiffre y:-12 opacity 0,
 * nouveau y:12→0, 400ms, tabular-nums.
 */
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function TickNumber({
  value,
  format,
  className,
}: {
  value: number;
  /** Formatteur (défaut : fr-FR avec espaces milliers) */
  format?: (v: number) => string;
  className?: string;
}) {
  const fmt = format ?? ((v: number) => v.toLocaleString("fr-FR"));
  // clé stable : on ne re-rend l'animation que si la valeur change
  const prev = useRef(value);
  useEffect(() => {
    prev.current = value;
  }, [value]);

  return (
    <span className={cn("relative inline-block overflow-hidden tabular", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block"
        >
          {fmt(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
