/**
 * S7 — Journal d'activité IA : table dense (heure mono, agent, conversation,
 * action, confiance, décision humaine, latence), filtres par agent / décision.
 * Nouvelles lignes (SimEngine, chat de test, validations) entrées par le haut
 * avec highlight. role="log" pour l'accessibilité.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAgents } from "@/lib/sim/store";
import { cn } from "@/lib/utils";
import { AGENT_META, COLOR_STYLES, timeAgo } from "./data";
import { SectionHead } from "./controls";
import { useAgentsPage } from "./hooks";

const DECISIONS = ["Toutes", "Approuvée", "Modifiée", "Rejetée", "En attente", "—"] as const;

const ACTION_STYLE: Record<string, string> = {
  "Suggestion": "bg-amber/10 text-amber",
  "Réponse auto": "bg-mint/10 text-mint",
  "Escalade": "bg-rose/10 text-rose",
};
const DECISION_STYLE: Record<string, string> = {
  "Approuvée": "text-mint",
  "Modifiée": "text-pulse",
  "Rejetée": "text-rose",
  "En attente": "text-amber",
  "—": "text-low",
};

export default function JournalLog() {
  const agents = useAgents();
  const { journal } = useAgentsPage();
  const [agentFilter, setAgentFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState<(typeof DECISIONS)[number]>("Toutes");

  const rows = useMemo(
    () =>
      journal.filter(
        (j) =>
          (agentFilter === "all" || j.agentId === agentFilter) &&
          (decisionFilter === "Toutes" || j.decision === decisionFilter),
      ),
    [journal, agentFilter, decisionFilter],
  );

  const selectCls =
    "rounded-r-sm border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] text-mid focus:border-iris focus:outline-none";

  return (
    <section>
      <SectionHead
        title="Journal d'activité IA"
        counter={`${rows.length} événements`}
        action={
          <div className="flex gap-2">
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className={selectCls} aria-label="Filtrer par agent">
              <option value="all">Tous les agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value as (typeof DECISIONS)[number])} className={selectCls} aria-label="Filtrer par décision">
              {DECISIONS.map((d) => (
                <option key={d} value={d}>{d === "Toutes" ? "Toutes décisions" : d}</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="overflow-hidden rounded-r-lg border border-line bg-surface-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]" role="log" aria-live="polite">
            <thead>
              <tr className="border-b border-line">
                {["Heure", "Agent", "Conversation", "Action", "Confiance", "Décision", "Latence"].map((h) => (
                  <th key={h} className="label-micro px-4 py-3 text-start font-normal text-low">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const meta = AGENT_META[j.agentId];
                const styles = meta ? COLOR_STYLES[meta.color] : null;
                return (
                  <motion.tr
                    key={j.id}
                    initial={{ opacity: 0, y: -10, backgroundColor: "rgba(255,90,78,.10)" }}
                    animate={{ opacity: 1, y: 0, backgroundColor: "rgba(255,90,78,0)" }}
                    transition={{ duration: 0.6 }}
                    className="border-b border-line/60 last:border-0 hover:bg-surface-2/40"
                  >
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-low" title={timeAgo(j.at)}>
                      {new Date(j.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", styles?.bg, styles?.text)}>
                        {meta && <meta.icon className="size-3" />}
                        {j.agentName}
                      </span>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2.5 text-[12.5px] text-mid">{j.conversation}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", ACTION_STYLE[j.action])}>
                        {j.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-hi tabular">
                      {j.confidence > 0 ? `${j.confidence} %` : "—"}
                    </td>
                    <td className={cn("px-4 py-2.5 text-[12.5px] font-medium", DECISION_STYLE[j.decision])}>{j.decision}</td>
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-low tabular">
                      {j.latencyS.toLocaleString("fr-FR", { minimumFractionDigits: 1 })} s
                    </td>
                  </motion.tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-low">
                    Aucun événement pour ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
