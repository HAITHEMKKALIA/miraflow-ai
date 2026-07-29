/**
 * S1 — En-tête de la page Agents IA : titre, actions (toggle global de mode
 * avec ConfirmDialog pédagogique, ancres Base de connaissances / Tester),
 * bandeau de stats vivantes (suggestions en attente, conversations, confiance).
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Database, MessageSquareWarning, Sparkles } from "lucide-react";
import { useAgents, usePendingSuggestions } from "@/lib/sim/store";
import { ConfirmDialog, TickNumber } from "@/components/ui-shared";
import { Toggle } from "./controls";
import { useAgentsPage } from "./context";
import { EASE, fmtNum } from "./motion";

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export default function Header() {
  const agents = useAgents();
  const pending = usePendingSuggestions();
  const { autonomousCount, setAllModes, chatRef, kbRef, queueRef, scrollTo, journal } = useAgentsPage();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const globalAuto = autonomousCount === agents.length;
  const avgConfidence = Math.round(agents.reduce((a, x) => a + x.confidence, 0) / agents.length);
  const weekHandled = 412 + Math.max(0, journal.length - 12);

  const onGlobalToggle = (v: boolean) => {
    if (v) setConfirmOpen(true);
    else setAllModes("suggestion");
  };

  return (
    <motion.section
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.07 } } }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <motion.div variants={item}>
          <h2 className="font-display text-[32px] leading-[38px] font-semibold tracking-[-0.02em] text-hi">
            Agents IA
          </h2>
          <p className="mt-1 max-w-[60ch] text-[14px] leading-[22px] text-mid">
            Vos agents locaux répondent, suggèrent et escaladent — toujours sous votre contrôle.
          </p>
        </motion.div>

        <motion.div variants={item} className="flex flex-wrap items-center gap-3">
          {/* Toggle global Suggestion ⇄ Autonome */}
          <div className="flex items-center gap-2.5 rounded-full border border-line bg-surface-1 px-4 py-2">
            <span className="label-micro text-low">Mode global</span>
            <span className={globalAuto ? "label-micro text-low" : "label-micro text-amber"}>Suggestion</span>
            <Toggle
              checked={globalAuto}
              onChange={onGlobalToggle}
              tone={globalAuto ? "mint" : "amber"}
              label="Basculer tous les agents en mode Autonome / Suggestion"
            />
            <span className={globalAuto ? "label-micro text-mint" : "label-micro text-low"}>Autonome</span>
          </div>

          <button
            type="button"
            onClick={() => scrollTo(kbRef)}
            className="glass flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium text-mid transition-colors hover:text-hi"
          >
            <Database className="size-4" />
            Base de connaissances
          </button>
          <button
            type="button"
            onClick={() => scrollTo(chatRef)}
            className="gradient-signature flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow-iris active:scale-[.97]"
          >
            <Sparkles className="size-4" />
            Tester un agent
          </button>
        </motion.div>
      </div>

      {/* Bandeau stats */}
      <motion.div variants={item} className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => scrollTo(queueRef)}
          className="flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3.5 py-1.5 text-[12px] font-medium text-amber transition-colors hover:bg-amber/15"
        >
          <MessageSquareWarning className="size-3.5" />
          <TickNumber value={pending.length} className="tabular" />
          {` suggestion${pending.length > 1 ? "s" : ""} en attente`}
          <ArrowRight className="size-3.5 rtl:-scale-x-100" />
        </button>
        <span className="flex items-center gap-2 rounded-full border border-line bg-surface-1 px-3.5 py-1.5 text-[12px] text-mid">
          <Bot className="size-3.5 text-iris" />
          <TickNumber value={weekHandled} /> conversations traitées cette semaine
        </span>
        <span className="flex items-center gap-2 rounded-full border border-line bg-surface-1 px-3.5 py-1.5 text-[12px] text-mid">
          <Sparkles className="size-3.5 text-mint" />
          confiance moyenne <TickNumber value={avgConfidence} format={(v) => `${fmtNum(Math.round(v))} %`} />
        </span>
      </motion.div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => setAllModes("autonomous")}
        title="Passer tous les agents en mode Autonome ?"
        description="En mode Autonome, les agents répondent sans validation si la confiance est ≥ 85 %. En dessous, ils escaladent à un humain. Vous gardez la main à tout moment depuis le journal IA."
        confirmLabel="Activer le mode Autonome"
        icon={<Bot className="size-5" />}
      />
    </motion.section>
  );
}
