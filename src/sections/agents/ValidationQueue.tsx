/**
 * S6 — File de validation humaine (mode Suggestion) : suggestions en attente
 * du SimEngine. Approuver (barre 400ms → coche → message réel dans l'Inbox),
 * Modifier (édition inline puis approbation), Rejeter (motif optionnel).
 * Nouvelle suggestion SimEngine : entrée y:-16 + badge compteur qui tique.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCheck, Pencil, Send, X } from "lucide-react";
import {
  useAgents, useContacts, useConversations, usePendingSuggestions, useSim,
} from "@/lib/sim/store";
import type { AiSuggestion } from "@/lib/sim/store";
import { EmptyState } from "@/components/ui-shared";
import { cn } from "@/lib/utils";
import { AGENT_META, COLOR_STYLES, timeAgo } from "./data";
import { ConfidenceRing, SectionHead } from "./controls";
import { useAgentsPage } from "./hooks";
import { EASE } from "./motion";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function SuggestionRow({ suggestion }: { suggestion: AiSuggestion }) {
  const agents = useAgents();
  const conversations = useConversations();
  const contacts = useContacts();
  const acceptSuggestion = useSim((s) => s.acceptSuggestion);
  const rejectSuggestion = useSim((s) => s.rejectSuggestion);
  const sendMessage = useSim((s) => s.sendMessage);
  const { pushJournal } = useAgentsPage();

  const [busy, setBusy] = useState<"idle" | "approving" | "done">("idle");
  const [editing, setEditing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [motif, setMotif] = useState("");

  const agent = agents.find((a) => a.id === suggestion.agentId);
  const meta = agent ? (AGENT_META[agent.key || agent.id] || AGENT_META["ag_support"]) : null;
  const styles = meta ? COLOR_STYLES[meta.color] : null;
  const conv = conversations.find((c) => c.id === suggestion.conversationId);
  const contact = contacts.find((c) => c.id === conv?.contactId);
  const contactName = contact?.name ?? "Contact";

  const journal = (decision: "Approuvée" | "Modifiée" | "Rejetée") =>
    pushJournal({
      agentId: suggestion.agentId,
      agentName: agent?.name ?? "Agent",
      conversation: contactName,
      action: "Suggestion",
      confidence: suggestion.confidence,
      decision,
      latencyS: 0.9,
    });

  const approve = (text?: string) => {
    setBusy("approving");
    setTimeout(() => setBusy("done"), 450);
    setTimeout(() => {
      if (text !== undefined && text !== suggestion.text) {
        sendMessage(suggestion.conversationId, text);
        rejectSuggestion(suggestion.id);
        journal("Modifiée");
      } else {
        acceptSuggestion(suggestion.id);
        journal("Approuvée");
      }
    }, 1000);
  };

  const reject = () => {
    rejectSuggestion(suggestion.id);
    journal("Rejetée");
  };

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 48, transition: { duration: 0.25 } }}
      transition={{ duration: 0.35, ease: EASE }}
      className="relative overflow-hidden rounded-r-md border border-line bg-surface-1 p-4"
    >
      {/* sweep mint à l'approbation */}
      <AnimatePresence>
        {busy !== "idle" && (
          <motion.span
            initial={{ x: "-100%" }}
            animate={{ x: busy === "done" ? "0%" : "-15%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: busy === "done" ? 0.25 : 0.45, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 bg-mint/10"
          />
        )}
      </AnimatePresence>

      <div className="relative flex flex-wrap items-start gap-3">
        {/* Avatar contact */}
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--pulse),var(--iris))] text-[12px] font-bold text-white">
          {initials(contactName)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold text-hi">{contactName}</span>
            <span className="label-micro text-low">{timeAgo(suggestion.at)}</span>
            {agent && styles && (
              <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium", styles.bg, styles.text)}>
                {meta && <meta.icon className="size-3" />}
                {agent.name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <ConfidenceRing value={suggestion.confidence} size={22} stroke={2.5} />
            </span>
          </div>

          {editing === null ? (
            <p className="mt-1.5 text-[13px] leading-[20px] text-mid">« {suggestion.text} »</p>
          ) : (
            <div className="mt-2">
              <textarea
                value={editing}
                onChange={(e) => setEditing(e.target.value)}
                rows={3}
                aria-label="Modifier la suggestion"
                className="w-full rounded-r-sm border border-iris/40 bg-surface-2 px-3 py-2 text-[13px] leading-[20px] text-hi focus:outline-none"
              />
            </div>
          )}

          {rejecting && (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Motif du rejet (optionnel)…"
                className="flex-1 rounded-r-sm border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] text-hi placeholder:text-low focus:border-rose focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {busy === "idle" && editing === null && !rejecting && (
            <>
              <button
                type="button"
                onClick={() => approve()}
                className="flex items-center gap-1.5 rounded-r-sm bg-mint px-3 py-1.5 text-[12.5px] font-semibold text-[#06281B] transition-all hover:brightness-110 active:scale-[.97]"
              >
                <Check className="size-3.5" /> Approuver
              </button>
              <button
                type="button"
                onClick={() => setEditing(suggestion.text)}
                className="flex items-center gap-1.5 rounded-r-sm border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-mid transition-colors hover:text-hi"
              >
                <Pencil className="size-3.5" /> Modifier
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="flex items-center gap-1.5 rounded-r-sm border border-rose/30 bg-rose/5 px-3 py-1.5 text-[12.5px] font-medium text-rose transition-colors hover:bg-rose/10"
              >
                <X className="size-3.5" /> Rejeter
              </button>
            </>
          )}
          {busy === "approving" && (
            <span className="flex items-center gap-2 text-[12.5px] text-mint">
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3">
                <motion.span className="block h-full bg-mint" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 0.45, ease: "easeOut" }} />
              </span>
              Envoi…
            </span>
          )}
          {busy === "done" && (
            <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-1.5 text-[12.5px] font-medium text-mint">
              <CheckCheck className="size-4" /> Envoyée dans l'Inbox
            </motion.span>
          )}
          {editing !== null && busy === "idle" && (
            <>
              <button
                type="button"
                onClick={() => approve(editing)}
                className="flex items-center gap-1.5 rounded-r-sm bg-mint px-3 py-1.5 text-[12.5px] font-semibold text-[#06281B] transition-all hover:brightness-110 active:scale-[.97]"
              >
                <Send className="size-3.5" /> Approuver la version modifiée
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-r-sm border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] text-mid hover:text-hi"
              >
                Annuler
              </button>
            </>
          )}
          {rejecting && (
            <>
              <button
                type="button"
                onClick={reject}
                className="rounded-r-sm bg-rose px-3 py-1.5 text-[12.5px] font-semibold text-white transition-all hover:brightness-110 active:scale-[.97]"
              >
                Confirmer le rejet
              </button>
              <button
                type="button"
                onClick={() => setRejecting(false)}
                className="rounded-r-sm border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] text-mid hover:text-hi"
              >
                Annuler
              </button>
            </>
          )}
        </div>
      </div>
    </motion.li>
  );
}

export default function ValidationQueue() {
  const pending = usePendingSuggestions();
  const acceptSuggestion = useSim((s) => s.acceptSuggestion);
  const { queueRef } = useAgentsPage();

  const approveAll = () => {
    pending.forEach((s, i) => setTimeout(() => acceptSuggestion(s.id), i * 220));
  };

  return (
    <section ref={queueRef} className="scroll-mt-24">
      <SectionHead
        title="Suggestions en attente"
        counter={`${pending.length} à valider`}
        action={
          pending.length > 1 ? (
            <button
              type="button"
              onClick={approveAll}
              className="flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint/10 px-3.5 py-1.5 text-[12px] font-medium text-mint transition-colors hover:bg-mint/15"
            >
              <CheckCheck className="size-3.5" /> Tout traiter
            </button>
          ) : undefined
        }
      />

      {pending.length === 0 ? (
        <div className="rounded-r-lg border border-line bg-surface-1">
          <EmptyState
            title="Aucune suggestion — vos agents observent."
            description="Quand un agent en mode Suggestion prépare une réponse, elle apparaîtra ici pour validation humaine."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {pending.map((s) => (
              <SuggestionRow key={s.id} suggestion={s} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
