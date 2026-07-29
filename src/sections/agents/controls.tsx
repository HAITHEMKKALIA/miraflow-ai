/**
 * Petits contrôles UI du périmètre Agents IA (style « Orbital Silk ») :
 * Toggle (switch), Slider de seuil avec jauge, ConfidenceRing (anneau %),
 * SectionHead (titre h3 + compteur). Aucune dépendance externe au design system.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/* ── Toggle (switch 36×20) ─────────────────────────────────────────────── */
export function Toggle({
  checked,
  onChange,
  label,
  tone = "iris",
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  tone?: "iris" | "mint" | "amber";
  disabled?: boolean;
}) {
  const onBg = tone === "mint" ? "bg-mint/80" : tone === "amber" ? "bg-amber/80" : "bg-iris/80";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? "Basculer"}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200",
        checked ? onBg : "bg-surface-3",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn(
          "absolute size-4 rounded-full bg-white shadow",
          checked ? "end-0.5" : "start-0.5",
        )}
      />
    </button>
  );
}

/* ── Slider de seuil 50–99 % avec jauge dégradée ───────────────────────── */
export function ThresholdSlider({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  id?: string;
}) {
  const pct = ((value - 50) / 49) * 100;
  return (
    <div className="w-full" dir="ltr">
      <div className="relative">
        <div className="h-1.5 w-full rounded-full bg-surface-3" />
        <div
          className="absolute inset-y-0 start-0 rounded-full bg-[linear-gradient(90deg,var(--iris),var(--pulse))]"
          style={{ width: `${pct}%` }}
        />
        <input
          id={id}
          type="range"
          min={50}
          max={99}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Seuil de confiance"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <div
          className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-white bg-iris shadow"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between label-micro text-low">
        <span>50 %</span>
        <span className="text-hi tabular">{value} %</span>
        <span>99 %</span>
      </div>
    </div>
  );
}

/* ── ConfidenceRing — anneau 28px + % (dessiné 600ms) ──────────────────── */
export const ConfidenceRing = memo(function ConfidenceRing({
  value,
  size = 28,
  stroke = 3,
}: {
  value: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 85 ? "var(--mint)" : value >= 70 ? "var(--amber)" : "var(--rose)";
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span
        className="absolute font-mono tabular"
        style={{ fontSize: size * 0.3, color }}
      >
        {value}
      </span>
    </span>
  );
});

/* ── En-tête de section (h3 + compteur + action) ───────────────────────── */
export function SectionHead({
  title,
  counter,
  action,
}: {
  title: string;
  counter?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-3">
        <h3 className="font-display text-[24px] leading-[30px] font-semibold text-hi">{title}</h3>
        {counter && <span className="label-micro text-low">{counter}</span>}
      </div>
      {action}
    </div>
  );
}
