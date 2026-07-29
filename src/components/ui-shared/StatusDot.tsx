/**
 * StatusDot — point de statut 8px + anneau « ping » animé (design.md §5/§6).
 * Couleurs sémantiques : mint (connecté/succès), amber (attente/instable),
 * rose (danger/déconnecté), pulse (info), iris (ouvert), low (inactif).
 */
import { cn } from "@/lib/utils";

export type StatusTone = "mint" | "amber" | "rose" | "pulse" | "iris" | "low";

const COLORS: Record<StatusTone, string> = {
  mint: "var(--mint)",
  amber: "var(--amber)",
  rose: "var(--rose)",
  pulse: "var(--pulse)",
  iris: "var(--iris)",
  low: "var(--text-low)",
};

export default function StatusDot({
  tone = "mint",
  ping = true,
  size = 8,
  className,
}: {
  tone?: StatusTone;
  /** Anneau ping en boucle (1.8s). Désactivé pour les statuts inactifs. */
  ping?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {ping && (
        <span
          className="absolute inset-0 rounded-full animate-ping-ring motion-reduce:hidden"
          style={{ backgroundColor: COLORS[tone] }}
        />
      )}
      <span className="relative rounded-full" style={{ width: size, height: size, backgroundColor: COLORS[tone] }} />
    </span>
  );
}
