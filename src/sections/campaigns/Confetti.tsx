/**
 * Confetti — pluie de confettis discrète (lancement de campagne, publication
 * de version). ~44 morceaux dégradé signature, 2,6 s, pointer-events none.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";

const COLORS = ["#FF5A4E", "#FF9F2E", "#0DBA9B", "#FFB84D", "#F2F5FF"];

export default function Confetti({ count = 44 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 2 + Math.random() * 1.2,
        size: 5 + Math.random() * 6,
        color: COLORS[i % COLORS.length],
        drift: (Math.random() - 0.5) * 120,
        rotate: Math.random() * 720 - 360,
        round: Math.random() > 0.6,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[95] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: "-6vh", opacity: 1, rotate: 0 }}
          animate={{ x: p.drift, y: "110vh", opacity: [1, 1, 0.9, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.3, 0.6, 0.6, 1] }}
          className="absolute top-0"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.5,
            backgroundColor: p.color,
            borderRadius: p.round ? "50%" : 1,
          }}
        />
      ))}
    </div>
  );
}
