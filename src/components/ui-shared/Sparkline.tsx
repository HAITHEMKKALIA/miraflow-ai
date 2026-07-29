/**
 * Sparkline — mini courbe SVG (design.md §6 KpiCard).
 * Trait `pulse` rempli à 10%, lissage par courbes de Bézier.
 */
import { useId } from "react";
import { cn } from "@/lib/utils";

function smoothPath(values: number[], w: number, h: number, pad = 2): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)] as const);
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

export default function Sparkline({
  data,
  width = 96,
  height = 32,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const id = useId();
  const line = smoothPath(data, width, height);
  const area = line ? `${line} L ${width - 2},${height} L 2,${height} Z` : "";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pulse)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--pulse)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#spark-${id})`} />}
      {line && (
        <path
          d={line}
          fill="none"
          stroke="var(--pulse)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
