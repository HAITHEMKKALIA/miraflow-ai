/**
 * Curseur custom marketing (design.md §5) — desktop uniquement.
 * Point 8px iris + anneau 36px qui traîne (lerp .15), mix-blend-mode:
 * difference, scale ×2.4 sur les éléments interactifs (a, button, [data-cursor]).
 * Désactivé sur mobile / prefers-reduced-motion.
 */
import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export default function Cursor() {
  const [enabled] = useState(
    () =>
      window.matchMedia("(pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [hovering, setHovering] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 150, damping: 20, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 150, damping: 20, mass: 0.6 });

  useEffect(() => {
    if (!enabled) return;
    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const target = e.target as HTMLElement | null;
      setHovering(!!target?.closest("a,button,[data-cursor]"));
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, [enabled, x, y]);

  if (!enabled) return null;

  return (
    <>
      <motion.div
        className="pointer-events-none fixed left-0 top-0 z-[95] size-2 rounded-full bg-iris mix-blend-difference"
        style={{ x, y, translateX: "-50%", translateY: "-50%" }}
      />
      <motion.div
        className="pointer-events-none fixed left-0 top-0 z-[95] size-9 rounded-full border border-iris/70 mix-blend-difference"
        style={{ x: ringX, y: ringY, translateX: "-50%", translateY: "-50%" }}
        animate={{ scale: hovering ? 2.4 : 1 }}
        transition={{ duration: 0.25 }}
      />
    </>
  );
}
