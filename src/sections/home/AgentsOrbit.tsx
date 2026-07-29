/**
 * S5. Agents IA — orbite (home.md).
 * Centre : Core 160px (« Mira »). 6 cartes agents sur une orbite (rayon
 * ~340px desktop) reliées par des signal lines ; rotation lente 60s/tour,
 * pause au hover. Hover carte : scale 1.06 + anneau de confiance ; la
 * pastille mode bascule au clic. Mobile : grille 2 col, rotation off.
 */
import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight, Briefcase, CalendarCheck, ChartLine, Headset, LifeBuoy, Wrench,
} from "lucide-react";
import { SectionHead, Reveal } from "./shared";
import { cn } from "@/lib/utils";

interface AgentDef {
  id: string;
  name: string;
  line: string;
  mode: "Suggestion" | "Autonome";
  confidence: number;
  icon: typeof Briefcase;
}

const AGENTS: AgentDef[] = [
  { id: "sales", name: "Commercial", line: "Qualifie, relance et propose au bon moment.", mode: "Suggestion", confidence: 91, icon: Briefcase },
  { id: "support", name: "Support", line: "Répond en citant votre base de connaissances.", mode: "Suggestion", confidence: 93, icon: Headset },
  { id: "tech", name: "Technique", line: "Diagnostique et guide pas à pas.", mode: "Suggestion", confidence: 88, icon: Wrench },
  { id: "rdv", name: "Rendez-vous", line: "Propose des créneaux et confirme.", mode: "Autonome", confidence: 94, icon: CalendarCheck },
  { id: "supervisor", name: "Superviseur", line: "Veille sur la qualité et route vers un humain.", mode: "Autonome", confidence: 96, icon: LifeBuoy },
  { id: "analyst", name: "Analyste", line: "Lit vos chiffres et résume la semaine.", mode: "Suggestion", confidence: 90, icon: ChartLine },
];

const RADIUS = 340;
const ORBIT_SIZE = RADIUS * 2 + 180;

function AgentCard({ agent, className, style }: { agent: AgentDef; className?: string; style?: React.CSSProperties }) {
  const [mode, setMode] = useState(agent.mode);
  const Icon = agent.icon;
  const autonome = mode === "Autonome";
  return (
    <motion.div
      whileHover={{ scale: 1.06 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className={cn(
        "group relative w-[190px] rounded-r-md border border-line bg-surface-1/90 p-4 text-center shadow-card backdrop-blur",
        className,
      )}
      style={style}
    >
      {/* anneau de confiance au hover */}
      <svg viewBox="0 0 40 40" className="absolute -right-2.5 -top-2.5 size-10 -rotate-90 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <circle cx="20" cy="20" r="16" fill="var(--surface-1)" stroke="var(--line)" strokeWidth="2" />
        <motion.circle
          cx="20" cy="20" r="16" fill="none" stroke="var(--mint)" strokeWidth="2"
          strokeLinecap="round" strokeDasharray="100.5"
          initial={{ strokeDashoffset: 100.5 }}
          whileInView={{ strokeDashoffset: 100.5 * (1 - agent.confidence / 100) }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
        <text x="20" y="24" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-hi)" transform="rotate(90 20 20)">
          {agent.confidence}
        </text>
      </svg>
      <span className="mx-auto flex size-10 items-center justify-center rounded-full border border-iris/30 bg-iris/10 text-iris">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-2.5 font-display text-[15px] font-semibold text-hi">{agent.name}</h3>
      <p className="mt-1 text-[11px] leading-[16px] text-mid">{agent.line}</p>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMode((m) => (m === "Suggestion" ? "Autonome" : "Suggestion"));
        }}
        className={cn(
          "label-micro mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors",
          autonome ? "border-mint/40 bg-mint/10 text-mint" : "border-amber/40 bg-amber/10 text-amber",
        )}
      >
        <span className={cn("size-1.5 rounded-full", autonome ? "bg-mint" : "bg-amber")} />
        {mode}
      </button>
    </motion.div>
  );
}

export default function AgentsOrbit() {
  return (
    <section id="agents" className="relative overflow-hidden bg-base py-24 md:py-40">
      {/* fond radial */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, var(--surface-1) 0%, transparent 62%)" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-[1240px] px-6">
        <SectionHead
          overline="AGENTS IA"
          title="Six agents en orbite autour de vos conversations"
          accent="orbite"
          after="Chaque agent propose, cite ses sources et laisse l'humain valider. Rien ne part sans votre feu vert."
        />

        {/* ── Desktop : orbite ── */}
        <Reveal className="mt-10 hidden md:block" y={60}>
          <div className="relative mx-auto" style={{ width: ORBIT_SIZE, height: ORBIT_SIZE }}>
            {/* signal lines (tournent avec l'orbite, pause au hover) */}
            <div className="group/orbit absolute inset-0 animate-[spin_60s_linear_infinite] motion-reduce:animate-none hover:[animation-play-state:paused]">
              <svg viewBox={`0 0 ${ORBIT_SIZE} ${ORBIT_SIZE}`} className="absolute inset-0 size-full" aria-hidden>
                <circle
                  cx={ORBIT_SIZE / 2} cy={ORBIT_SIZE / 2} r={RADIUS}
                  fill="none" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 8"
                />
                {AGENTS.map((a, i) => {
                  const angle = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
                  const x = ORBIT_SIZE / 2 + Math.cos(angle) * RADIUS;
                  const y = ORBIT_SIZE / 2 + Math.sin(angle) * RADIUS;
                  return (
                    <line
                      key={a.id}
                      x1={ORBIT_SIZE / 2} y1={ORBIT_SIZE / 2} x2={x} y2={y}
                      stroke="var(--pulse)" strokeWidth="1" opacity="0.35" className="signal-line"
                    />
                  );
                })}
              </svg>
              {/* cartes sur l'orbite */}
              {AGENTS.map((a, i) => {
                const angle = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
                const x = ORBIT_SIZE / 2 + Math.cos(angle) * RADIUS;
                const y = ORBIT_SIZE / 2 + Math.sin(angle) * RADIUS;
                return (
                  <div
                    key={a.id}
                    className="absolute"
                    style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
                  >
                    {/* contre-rotation pour garder la carte droite */}
                    <div className="animate-[spin_60s_linear_infinite_reverse] motion-reduce:animate-none group-hover/orbit:[animation-play-state:paused]">
                      <AgentCard agent={a} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Core central « Mira » (fixe, ne tourne pas) */}
            <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="relative mx-auto size-[160px]">
                <div className="absolute inset-0 animate-core-breathe rounded-full bg-iris/30 blur-[60px]" aria-hidden />
                <img src="/logo.svg" alt="Mira, le noyau IA de MiraFlow" className="relative size-[160px] animate-spin-slow motion-reduce:animate-none" />
              </div>
              <p className="label-micro mt-4 text-mid">MIRA · NOYAU IA</p>
              <p className="mt-1 font-mono text-[11px] text-mint tabular">6 agents · 99,2% dispo</p>
            </div>
          </div>
        </Reveal>

        {/* ── Mobile : grille 2 col ── */}
        <div className="mt-10 grid grid-cols-2 gap-3 md:hidden">
          {AGENTS.map((a, i) => (
            <Reveal key={a.id} delay={i * 0.05}>
              <AgentCard agent={a} className="w-full" />
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-14 text-center">
          <Link
            to="/app/agents"
            className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface-1 px-6 py-3 text-[14px] font-semibold text-hi transition-all hover:-translate-y-0.5 hover:border-iris/50 hover:shadow-glow-iris"
          >
            Tester un agent dans la démo
            <ArrowRight className="size-4 text-pulse transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
