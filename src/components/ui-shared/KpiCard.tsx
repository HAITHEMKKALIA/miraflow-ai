/**
 * KpiCard — carte KPI cockpit (design.md §6).
 * surface-1 r-md, label mono uppercase, valeur qui tique, delta pill
 * (▲ mint / ▼ rose), sparkline 48px `pulse` remplie à 10%.
 */
import { TrendingDown, TrendingUp } from "lucide-react";
import TickNumber from "./TickNumber";
import Sparkline from "./Sparkline";
import { cn } from "@/lib/utils";

export default function KpiCard({
  label,
  value,
  suffix,
  delta,
  deltaLabel,
  spark,
  className,
}: {
  label: string;
  value: number;
  suffix?: string;
  /** Variation en % ; positif = pill mint ▲, négatif = pill rose ▼ */
  delta?: number;
  deltaLabel?: string;
  spark?: number[];
  className?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div
      className={cn(
        "rounded-r-md border border-line bg-surface-1 p-5 transition-shadow duration-300 hover:shadow-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-micro text-low truncate">{label}</p>
          <p className="mt-2 font-display text-[34px] leading-[38px] font-semibold text-hi">
            <TickNumber value={value} />
            {suffix && <span className="ml-1 text-[18px] text-mid">{suffix}</span>}
          </p>
          {delta !== undefined && (
            <p className="mt-2 flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 label-micro",
                  positive ? "bg-mint/10 text-mint" : "bg-rose/10 text-rose",
                )}
              >
                {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {positive ? "+" : ""}
                {delta.toLocaleString("fr-FR")}%
              </span>
              {deltaLabel && <span className="text-[12px] text-low">{deltaLabel}</span>}
            </p>
          )}
        </div>
        {spark && spark.length > 1 && <Sparkline data={spark} width={88} height={48} className="shrink-0" />}
      </div>
    </div>
  );
}
