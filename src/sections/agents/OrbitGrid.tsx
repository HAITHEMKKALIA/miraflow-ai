/**
 * S2 — Orbite des agents : grille des 8 agents (6 du SimEngine + 2 locaux :
 * Traduction, Analyse d'images) avec Core décoratif 400px (opacity .15) et
 * signal lines pointillées vers les cartes (desktop).
 * Carte : orbe glyphe respirant, statut, toggle de mode inline, métriques
 * mono, sparkline 7 j, actions Configurer / Tester, badge « mis à jour ».
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { Pause, Play, Settings2, Sparkles } from "lucide-react";
import type { AiAgent } from "@/lib/sim/store";
import { Sparkline, StatusDot, TickNumber } from "@/components/ui-shared";
import { cn } from "@/lib/utils";
import { AGENT_META, COLOR_STYLES, EXTRA_AGENTS } from "./data";
import { useAgentsPage } from "./context";
import { EASE } from "./motion";

/* ── Core décoratif + signal lines (desktop uniquement) ────────────────── */
const DecorativeCore = memo(function DecorativeCore() {
  const targets: [number, number][] = [
    [200, 130], [600, 130], [1000, 130],
    [200, 430], [600, 430], [1000, 430],
  ];
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
      <svg viewBox="0 0 1200 560" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-30">
        {targets.map(([x, y], i) => (
          <path
            key={i}
            d={`M 600 280 Q ${(600 + x) / 2} ${y < 280 ? y + 60 : y - 60}, ${x} ${y}`}
            fill="none"
            stroke={i % 2 ? "var(--iris)" : "var(--pulse)"}
            strokeOpacity="0.35"
            strokeWidth="1.2"
            className="signal-line"
          />
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-15">
        <div className="absolute left-1/2 top-1/2 size-[380px] -translate-x-1/2 -translate-y-1/2 animate-core-breathe rounded-full bg-iris/40 blur-[80px] motion-reduce:animate-none" />
        <img src="/logo.svg" alt="" className="relative size-[400px] animate-spin-slow motion-reduce:animate-none" />
      </div>
    </div>
  );
});

/* ── Carte agent ───────────────────────────────────────────────────────── */
const AgentCard = memo(function AgentCard({
  agent,
  index,
}: {
  agent: AiAgent;
  index: number;
}) {
  const meta = AGENT_META[agent.id];
  const styles = COLOR_STYLES[meta.color];
  const { modes, paused, toggleMode, togglePaused, openConfig, testAgent, updatedAt } = useAgentsPage();
  const mode = modes[agent.id] ?? agent.mode;
  const isPaused = !!paused[agent.id];
  const isUpdated = !!updatedAt[agent.id];
  const Icon = meta.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.55, ease: EASE, delay: index * 0.09 }}
      whileHover={{ y: -4 }}
      className={cn(
        "group relative overflow-hidden rounded-r-lg border bg-surface-1 p-5 transition-[border-color,box-shadow] duration-300 hover:shadow-card",
        isUpdated ? "border-gradient" : "border-line",
        isPaused && "opacity-70",
      )}
    >
      {/* filet couleur agent en haut */}
      <span className={cn("absolute inset-x-0 top-0 h-[2px] opacity-60 transition-opacity group-hover:opacity-100", styles.bar)} />

      <div className="flex items-start justify-between gap-3">
        {/* Orbe glyphe respirant */}
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: index * 0.8 }}
          className={cn("flex size-12 shrink-0 items-center justify-center rounded-full border", styles.orb)}
        >
          <Icon className={cn("size-5", styles.text)} />
        </motion.div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={() => togglePaused(agent.id)}
            title={isPaused ? "Réactiver l'agent" : "Mettre en pause"}
            className="flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-[11px] text-mid transition-colors hover:text-hi"
          >
            <StatusDot tone={isPaused ? "low" : "mint"} ping={!isPaused} size={6} />
            {isPaused ? "Pause" : "Actif"}
            {isPaused ? <Play className="size-3" /> : <Pause className="size-3" />}
          </button>
          {isUpdated && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="label-micro rounded-full bg-mint/10 px-2 py-0.5 text-mint"
            >
              mis à jour
            </motion.span>
          )}
        </div>
      </div>

      <h3 className="mt-3 font-display text-[18px] leading-[26px] font-semibold text-hi">{agent.name}</h3>
      <p className="mt-1 min-h-[40px] text-[12.5px] leading-[18px] text-mid">{meta.role}</p>

      {/* Pill mode (toggle inline) */}
      <button
        type="button"
        onClick={() => toggleMode(agent.id)}
        disabled={isPaused}
        title="Basculer Suggestion ⇄ Autonome"
        className={cn(
          "mt-3 flex w-full items-center justify-between rounded-full border px-3 py-1.5 transition-colors",
          mode === "autonomous" ? "border-mint/30 bg-mint/10" : "border-amber/30 bg-amber/10",
          isPaused && "cursor-not-allowed",
        )}
      >
        <span className="label-micro text-low">Mode</span>
        <span className={cn("label-micro", mode === "autonomous" ? "text-mint" : "text-amber")}>
          {mode === "autonomous" ? "Autonome" : "Suggestion"}
        </span>
      </button>

      {/* Métriques mono */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
        <div>
          <p className="label-micro text-low">Convers.</p>
          <p className="mt-1 font-mono text-[15px] font-medium text-hi tabular">
            <TickNumber value={agent.handled} />
          </p>
        </div>
        <div>
          <p className="label-micro text-low">Confiance</p>
          <p className="mt-1 font-mono text-[15px] font-medium text-hi tabular">{agent.confidence} %</p>
        </div>
        <div>
          <p className="label-micro text-low">Escalades</p>
          <p className="mt-1 font-mono text-[15px] font-medium text-hi tabular">{meta.escalations}</p>
        </div>
      </div>

      {/* Sparkline 7 j */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="label-micro text-low">7 jours</span>
        <Sparkline data={meta.spark} width={120} height={30} className="transition-transform duration-500 group-hover:scale-x-105" />
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => openConfig(agent.id)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[12.5px] font-medium text-mid transition-colors hover:bg-surface-3 hover:text-hi"
        >
          <Settings2 className="size-3.5" />
          Configurer
        </button>
        <button
          type="button"
          onClick={() => testAgent(agent.id)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-r-sm px-3 py-2 text-[12.5px] font-semibold transition-all active:scale-[.97]",
            styles.bg, styles.text, "hover:brightness-125",
          )}
        >
          <Sparkles className="size-3.5" />
          Tester
        </button>
      </div>
    </motion.div>
  );
});

/* ── Grille ────────────────────────────────────────────────────────────── */
export default function OrbitGrid({ agents }: { agents: AiAgent[] }) {
  /* 6 agents du SimEngine + 2 agents locaux (Traduction, Analyse d'images) */
  const all = [...agents, ...EXTRA_AGENTS];
  return (
    <section className="relative">
      <DecorativeCore />
      <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {all.map((a, i) => (
          <AgentCard key={a.id} agent={a} index={i} />
        ))}
      </div>
    </section>
  );
}
