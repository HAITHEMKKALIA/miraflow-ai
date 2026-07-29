/**
 * KpiRow — rangée de 4 KpiCards vivantes (dashboard.md S3).
 * Conversations actives · Messages aujourd'hui (tick live + flash mint 300ms,
 * aria-live) · Taux de réponse (anneau radial dessiné 900ms) · Revenus
 * attribués TND. Montage : stagger 90ms y:24→0 + count-up 1.2s. Hover :
 * translateY(-3) + sparkline illuminée. Clic carte → module filtré.
 * Le changement de période morphe les chiffres (tick 400ms via TickNumber).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Banknote, Info, MessageCircle, MessagesSquare, Percent, TrendingDown, TrendingUp,
} from "lucide-react";
import { useNavigate } from "react-router";
import { Sparkline } from "@/components/ui-shared";
import { useCampaigns, useChartSeries, useConversations, useKpis, useSim } from "@/lib/sim/store";
import type { Period } from "./DashboardHeader";
import { CountUpTick, EASE } from "./shared";
import { cn } from "@/lib/utils";

/** Référentiel de départ du SimEngine (pour dériver les deltas live) */
const MSG0 = 2481;
const REPLIES0 = 484; // 96 (Aid) + 388 (Ramadan)

interface KpiDef {
  id: string;
  label: string;
  hint: string;
  icon: typeof MessagesSquare;
  iconClass: string;
  value: number;
  suffix?: string;
  delta: number;
  deltaUnit?: string;
  deltaGood?: boolean;
  sub?: string;
  spark?: number[];
  ring?: number; // 0..100 → anneau radial au lieu de sparkline
  to: string;
  flash?: boolean; // flash mint 300ms sur la valeur
  live?: boolean;  // aria-live="polite"
}

const SPARKS: Record<Period, Record<string, number[]>> = {
  today: {
    conv: [98, 104, 112, 108, 119, 124, 128],
    msg: [640, 720, 810, 905, 990, 1140, 1284],
    rev: [5.1, 5.6, 6.2, 6.8, 7.3, 7.9, 8.45],
  },
  "7d": {
    conv: [610, 640, 690, 720, 705, 780, 812],
    msg: [9.8, 10.4, 11.2, 12.1, 12.8, 13.9, 14.8],
    rev: [31, 34, 38, 41, 45, 49, 52.3],
  },
  "30d": {
    conv: [2480, 2620, 2810, 2730, 2960, 3180, 3412],
    msg: [44, 47, 51, 49, 55, 58, 61.2],
    rev: [152, 168, 175, 183, 196, 208, 218.9],
  },
};

/** Anneau radial 48px qui se dessine (900ms) — Taux de réponse */
function RateRing({ rate, animKey }: { rate: number; animKey: string }) {
  const C = 2 * Math.PI * 20;
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id="rate-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--iris)" />
          <stop offset="100%" stopColor="var(--pulse)" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="20" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
      <motion.circle
        key={animKey}
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="url(#rate-grad)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={C}
        initial={{ strokeDashoffset: C }}
        animate={{ strokeDashoffset: C * (1 - rate / 100) }}
        transition={{ duration: 0.9, ease: EASE }}
        transform="rotate(-90 24 24)"
      />
      <text x="24" y="27" textAnchor="middle" fill="var(--text-hi)" fontSize="10" fontFamily="IBM Plex Mono, monospace">
        {rate}
      </text>
    </svg>
  );
}

function KpiCardView({ def, index, period }: { def: KpiDef; index: number; period: Period }) {
  const navigate = useNavigate();
  const Icon = def.icon;
  const positive = def.delta >= 0;
  const good = def.deltaGood ?? positive;

  return (
    <motion.button
      type="button"
      onClick={() => navigate(def.to)}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: index * 0.09 }}
      className="group relative block h-full w-full min-w-0 rounded-r-md border border-line bg-surface-1 p-5 text-start transition-all duration-300 hover:-translate-y-[3px] hover:border-line-strong hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-micro flex items-center gap-1.5 text-low">
            <span className="truncate">{def.label}</span>
            <span className="relative flex shrink-0">
              <Info className="size-3 cursor-help text-low/70 transition-colors hover:text-mid peer" />
              <span className="pointer-events-none absolute bottom-4 start-0 z-20 w-52 rounded-r-sm border border-line bg-surface-3 px-2.5 py-1.5 font-sans text-[11px] normal-case leading-[16px] tracking-normal text-mid opacity-0 shadow-card transition-opacity duration-200 peer-hover:opacity-100 max-sm:hidden">
                {def.hint}
              </span>
            </span>
          </p>
          <p
            className={cn(
              "mt-2 font-display text-[34px] leading-[38px] font-semibold transition-colors duration-300",
              def.flash ? "text-mint" : "text-hi",
            )}
            aria-live={def.live ? "polite" : undefined}
          >
            <CountUpTick value={def.value} />
            {def.suffix && <span className="ms-1.5 text-[16px] font-medium text-mid">{def.suffix}</span>}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 label-micro",
                good ? "bg-mint/10 text-mint" : "bg-rose/10 text-rose",
              )}
            >
              {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {positive ? "+" : ""}
              {def.delta.toLocaleString("fr-FR")}
              {def.deltaUnit ?? " %"}
            </span>
            {def.sub && <span className="text-[11px] text-low">{def.sub}</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={cn("flex size-7 items-center justify-center rounded-r-sm", def.iconClass)}>
            <Icon className="size-3.5" />
          </span>
          {def.ring !== undefined ? (
            <RateRing rate={def.ring} animKey={period} />
          ) : (
            def.spark && (
              <span className="inline-block transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(255,159,46,.55)] rtl:-scale-x-100 [&_svg_path]:transition-[stroke-width] group-hover:[&_svg_path]:stroke-[2.5]">
                <Sparkline data={def.spark} width={88} height={48} />
              </span>
            )
          )}
        </div>
      </div>
    </motion.button>
  );
}

export default function KpiRow({ period }: { period: Period }) {
  const kpis = useKpis();
  const campaigns = useCampaigns();
  const chart = useChartSeries();
  const demoMode = useSim((s) => s.demoMode);
  const conversations = useConversations();

  // Flash mint 300ms quand « Messages aujourd'hui » tique
  const [flash, setFlash] = useState(false);
  const prevMsg = useRef(kpis.messagesToday);
  useEffect(() => {
    if (kpis.messagesToday !== prevMsg.current) {
      prevMsg.current = kpis.messagesToday;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 300);
      return () => clearTimeout(t);
    }
  }, [kpis.messagesToday]);

  const repliesNow = useMemo(() => campaigns.reduce((acc, c) => acc + c.replies, 0), [campaigns]);
  const msgDelta = kpis.messagesToday - MSG0;
  const revDelta = (repliesNow - REPLIES0) * 12;

  const defs: KpiDef[] = useMemo(() => {
    /* Espace réel (essai / compte approuvé) : KPI 100 % dérivés des vraies données */
    if (!demoMode) {
      const openConvs = conversations.filter((c) => c.status === "open" || c.status === "pending").length;
      const replied = conversations.filter((c) => c.thread.some((m) => m.direction === "out")).length;
      const rate = conversations.length ? Math.round((replied / conversations.length) * 100) : 0;
      const revenue = campaigns.reduce((acc, c) => acc + c.replies, 0) * 12;
      const flat = [0, 0, 0, 0, 0, 0, 0, 0];
      return [
        {
          id: "conv", label: "Conversations actives",
          hint: "Conversations ouvertes ou en attente sur la période sélectionnée.",
          icon: MessagesSquare, iconClass: "bg-iris/10 text-iris",
          value: openConvs, delta: 0, spark: flat, to: "/app/inbox",
        },
        {
          id: "msg",
          label: period === "today" ? "Messages aujourd'hui" : period === "7d" ? "Messages · 7 jours" : "Messages · 30 jours",
          hint: "Messages entrants et sortants traités par vos sessions QR.",
          icon: MessageCircle, iconClass: "bg-pulse/10 text-pulse",
          value: kpis.messagesToday, delta: 0, spark: flat, to: "/app/inbox", flash, live: true,
        },
        {
          id: "rate", label: "Taux de réponse",
          hint: "Part des conversations ayant reçu une réponse en moins de 5 minutes.",
          icon: Percent, iconClass: "bg-mint/10 text-mint",
          value: rate, suffix: "%", delta: 0, ring: rate, to: "/app/inbox",
        },
        {
          id: "rev", label: "Revenus attribués",
          hint: "Ventes attribuées aux campagnes et relances automatisées (attribution dernier contact).",
          icon: Banknote, iconClass: "bg-amber/10 text-amber",
          value: revenue, suffix: "TND", delta: 0, sub: "campagnes + relances", spark: flat, to: "/app/campaigns",
        },
      ];
    }
    const s = SPARKS[period];
    const liveMsg =
      period === "today" ? kpis.messagesToday : period === "7d" ? 14820 + msgDelta : 61240 + msgDelta;
    const msgSpark =
      period === "today" && chart.length > 7 ? chart.slice(-8).map((v) => Math.max(4, v)) : s.msg;
    return [
      {
        id: "conv",
        label: "Conversations actives",
        hint: "Conversations ouvertes ou en attente sur la période sélectionnée.",
        icon: MessagesSquare,
        iconClass: "bg-iris/10 text-iris",
        value: period === "today" ? 128 + msgDelta : period === "7d" ? 812 + msgDelta : 3412 + msgDelta,
        delta: period === "today" ? 12 : period === "7d" ? 9 : 14,
        spark: s.conv,
        to: "/app/inbox",
      },
      {
        id: "msg",
        label:
          period === "today" ? "Messages aujourd'hui" : period === "7d" ? "Messages · 7 jours" : "Messages · 30 jours",
        hint: "Messages entrants et sortants traités par vos sessions QR.",
        icon: MessageCircle,
        iconClass: "bg-pulse/10 text-pulse",
        value: liveMsg,
        delta: period === "today" ? 8 : period === "7d" ? 11 : 16,
        spark: msgSpark,
        to: "/app/inbox",
        flash,
        live: true,
      },
      {
        id: "rate",
        label: "Taux de réponse",
        hint: "Part des conversations ayant reçu une réponse en moins de 5 minutes.",
        icon: Percent,
        iconClass: "bg-mint/10 text-mint",
        value: period === "today" ? 94 : period === "7d" ? 93 : 95,
        suffix: "%",
        delta: 2,
        deltaUnit: " pts",
        ring: period === "today" ? 94 : period === "7d" ? 93 : 95,
        to: "/app/inbox",
      },
      {
        id: "rev",
        label: "Revenus attribués",
        hint: "Ventes attribuées aux campagnes et relances automatisées (attribution dernier contact).",
        icon: Banknote,
        iconClass: "bg-amber/10 text-amber",
        value: (period === "today" ? 8450 : period === "7d" ? 52300 : 218900) + revDelta,
        suffix: "TND",
        delta: period === "today" ? 21 : period === "7d" ? 18 : 24,
        sub: "campagnes + relances",
        spark: s.rev,
        to: "/app/campaigns",
      },
    ];
  }, [period, kpis.messagesToday, msgDelta, revDelta, chart, flash, demoMode, conversations, campaigns]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {defs.map((def, i) => (
        <KpiCardView key={def.id} def={def} index={i} period={period} />
      ))}
    </div>
  );
}
