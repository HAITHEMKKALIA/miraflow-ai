/**
 * EmptyState — état vide pédagogique (design.md §6).
 * Illustration empty-orbit.svg (Core + messages en orbite) + titre Grotesk +
 * texte muted + CTA optionnel.
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  /** Bouton / lien d'action (ex. « Nouvelle campagne ») */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}
    >
      <motion.img
        src="/empty-orbit.svg"
        alt=""
        width={200}
        height={150}
        className="h-auto w-[200px] opacity-90"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <h3 className="mt-6 font-display text-[18px] leading-[26px] font-semibold text-hi">{title}</h3>
      {description && <p className="mt-2 max-w-[42ch] text-[14px] leading-[22px] text-mid">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}
