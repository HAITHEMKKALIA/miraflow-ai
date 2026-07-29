/**
 * LiveChart — graphique temps réel « Activité des messages » (dashboard.md S4a).
 * Area chart Recharts double série (Entrants pulse · Sortants iris), remplis-
 * sage dégradé 15%→0, grille pointillée, axe X mono 11px. Live : nouveau point
 * toutes les 3 s (chartTick du SimEngine), glissement 600ms, point tête avec
 * halo ping (SMIL). Skeleton shimmer 1.6s pendant 700ms au 1er chargement.
 * Accessibilité : tableau récapitulatif sr-only. RTL : axe X inversé.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { motion } from "framer-motion";
import { useChartSeries } from "@/lib/sim/store";
import { useI18n } from "@/lib/i18n";
import type { Period } from "./DashboardHeader";
import { Card, EASE, SegmentedControl } from "./shared";

type Granularity = "hour" | "day";

interface Point {
  label: string;
  in: number;
  out: number;
}

/** Variation déterministe (courbe sortants ≈ 55–78 % des entrants) */
const ratio = (i: number) => 0.55 + (((i * 37) % 10) / 10) * 0.23;

function buildHourData(series: number[]): Point[] {
  const h = new Date().getHours();
  return series.map((v, i) => ({
    label: `${String((h - series.length + 1 + i + 48) % 24).padStart(2, "0")}:00`,
    in: v,
    out: Math.max(2, Math.round(v * ratio(i))),
  }));
}

function buildDayData(): Point[] {
  const out: Point[] = [];
  const df = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  for (let d = 13; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86_400_000);
    const seed = (date.getDate() * 7 + date.getMonth() * 31) % 100;
    const v = 780 + Math.round(420 * (0.5 + 0.5 * Math.sin(seed))) + (seed % 3) * 40;
    out.push({ label: df.format(date), in: v, out: Math.round(v * 0.62) });
  }
  return out;
}

/** Tooltip glass : heure, valeurs, delta entrants vs point précédent */
function ChartTip({
  active,
  payload,
  data,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | string; payload?: Point }[];
  data: Point[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const idx = data.findIndex((p) => p.label === point.label && p.in === point.in);
  const prev = idx > 0 ? data[idx - 1] : undefined;
  const delta = prev ? point.in - prev.in : 0;
  return (
    <div className="rounded-r-sm border border-line bg-surface-3/95 px-3 py-2 shadow-card backdrop-blur-md">
      <p className="label-micro text-low">{point.label}</p>
      <p className="mt-1.5 flex items-center gap-2 text-[12px]">
        <span className="size-2 rounded-full bg-pulse" />
        <span className="text-mid">Entrants</span>
        <span className="ms-auto font-mono font-medium text-hi tabular">{point.in}</span>
      </p>
      <p className="mt-1 flex items-center gap-2 text-[12px]">
        <span className="size-2 rounded-full bg-iris" />
        <span className="text-mid">Sortants</span>
        <span className="ms-auto font-mono font-medium text-hi tabular">{point.out}</span>
      </p>
      {prev && (
        <p className="mt-1.5 border-t border-line pt-1.5 text-right font-mono text-[11px]">
          <span className={delta >= 0 ? "text-mint" : "text-rose"}>
            {delta >= 0 ? "▲ +" : "▼ "}
            {delta} vs précédent
          </span>
        </p>
      )}
    </div>
  );
}

/** Point tête avec halo ping (SMIL — boucle native SVG) */
function headDot(color: string, lastIndex: number) {
  const Dot = (props: { cx?: number; cy?: number; index?: number }) => {
    const { cx = 0, cy = 0, index = -1 } = props;
    if (index !== lastIndex) return <g key={`d-${index}`} />;
    return (
      <g key={`d-${index}`}>
        <circle cx={cx} cy={cy} r="4" fill={color} stroke="var(--surface-1)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="4" fill={color} className="motion-reduce:hidden">
          <animate attributeName="r" values="4;13" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.55;0" dur="1.8s" repeatCount="indefinite" />
        </circle>
      </g>
    );
  };
  return Dot;
}

/** Courbe fantôme shimmer (skeleton 700ms) */
function ChartSkeleton() {
  return (
    <div className="relative h-[240px] w-full overflow-hidden" aria-hidden>
      <svg viewBox="0 0 600 240" className="size-full animate-pulse" preserveAspectRatio="none">
        <path
          d="M0,190 C60,170 90,120 150,130 C210,140 240,80 300,90 C360,100 390,60 450,75 C510,90 560,50 600,55 L600,240 L0,240 Z"
          fill="var(--surface-2)"
        />
        <path
          d="M0,190 C60,170 90,120 150,130 C210,140 240,80 300,90 C360,100 390,60 450,75 C510,90 560,50 600,55"
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth="2.5"
        />
      </svg>
      <motion.div
        className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[.06] to-transparent"
        initial={{ x: "-100%" }}
        animate={{ x: "300%" }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

export default function LiveChart({ period = "today" }: { period?: Period }) {
  const { dir } = useI18n();
  const series = useChartSeries();
  const [granularity, setGranularity] = useState<Granularity>("hour");
  const [loading, setLoading] = useState(true);

  // Skeleton 700ms au premier chargement (état de chargement réel)
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  // Le SegmentedControl de période (en-tête) morphe aussi la granularité
  useEffect(() => {
    setGranularity(period === "today" ? "hour" : "day");
  }, [period]);

  const data = useMemo(
    () => (granularity === "hour" ? buildHourData(series) : buildDayData()),
    [series, granularity],
  );
  const max = Math.max(...data.map((d) => d.in), 10);

  return (
    <Card
      title="Activité des messages"
      className="col-span-12 xl:col-span-7"
      bodyClassName="pt-4"
      action={
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-3 sm:flex" aria-hidden>
            <span className="flex items-center gap-1.5 text-[11px] text-mid">
              <span className="size-2 rounded-full bg-pulse" /> Entrants
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-mid">
              <span className="size-2 rounded-full bg-iris" /> Sortants
            </span>
          </span>
          <SegmentedControl
            options={[
              { value: "hour" as Granularity, label: "Heure" },
              { value: "day" as Granularity, label: "Jour" },
            ]}
            value={granularity}
            onChange={setGranularity}
          />
        </div>
      }
    >
      {loading ? (
        <ChartSkeleton />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="h-[240px] w-full"
          role="img"
          aria-label={`Graphique : ${data.length} points, dernière valeur ${data[data.length - 1]?.in ?? 0} messages entrants.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
              <defs>
                <linearGradient id="lc-in" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--pulse)" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="var(--pulse)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="lc-out" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--iris)" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="var(--iris)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 6" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={3}
                dy={8}
                reversed={dir === "rtl"}
                tick={{ fontSize: 11, fill: "var(--text-low)", fontFamily: "IBM Plex Mono, monospace" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                domain={[0, Math.ceil(max * 1.15)]}
                tick={{ fontSize: 10, fill: "var(--text-low)", fontFamily: "IBM Plex Mono, monospace" }}
              />
              <Tooltip
                content={<ChartTip data={data} />}
                cursor={{ stroke: "var(--line-strong)", strokeDasharray: "4 4" }}
              />
              <Area
                type="monotone"
                dataKey="in"
                name="Entrants"
                stroke="var(--pulse)"
                strokeWidth={2}
                fill="url(#lc-in)"
                dot={headDot("var(--pulse)", data.length - 1)}
                activeDot={{ r: 4, fill: "var(--pulse)", stroke: "var(--surface-1)", strokeWidth: 2 }}
                animationDuration={600}
                animationEasing="ease-out"
              />
              <Area
                type="monotone"
                dataKey="out"
                name="Sortants"
                stroke="var(--iris)"
                strokeWidth={2}
                fill="url(#lc-out)"
                dot={false}
                activeDot={{ r: 4, fill: "var(--iris)", stroke: "var(--surface-1)", strokeWidth: 2 }}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Tableau récapitulatif masqué (accessibilité) */}
      <table className="sr-only">
        <caption>Messages entrants et sortants par {granularity === "hour" ? "heure" : "jour"}</caption>
        <thead>
          <tr>
            <th>{granularity === "hour" ? "Heure" : "Jour"}</th>
            <th>Entrants</th>
            <th>Sortants</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>{d.in}</td>
              <td>{d.out}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
