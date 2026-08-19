/**
 * AiSuggestionBanner — panneau « Suggestion IA » (inbox.md S4).
 * Bordure iris 1px, fond glass iris/8. En-tête : icône, nom, confidence ring
 * 28px (% dessiné 600ms, mint ≥85 / amber <85) + temps relatif. Corps :
 * réponse générée (bulle blanche, 1-3 lignes)
 * (icône doc + nom + fragment), boutons Réviser / Envoyer / Ignorer.
 * Envoyer : bulle insérée, bannière morphée en toast « envoyé » (200ms).
 * Ignorer : confirmation discrète (« Masquer la suggestion ? »).
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, PencilLine, Send, X } from "lucide-react";
import type { AiSuggestion } from "@/lib/sim/store";
import { useAgents } from "@/lib/sim/store";
import { ConfidenceRing } from "@/sections/agents/controls";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function relTime(at: number): string {
  const s = Math.max(1, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}

export default function AiSuggestionBanner({
  suggestion,
  onSend,
  onEdit,
  onDismiss,
}: {
  suggestion: AiSuggestion;
  onSend: (id: string) => void;
  onEdit: (id: string, newText: string) => void;
  onDismiss: (id: string) => void;
}) {
  const agents = useAgents();
  const agent = agents.find((a) => a.id === suggestion.agentId);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [sentState, setSentState] = useState<"idle" | "sending" | "sent">("idle");

  const handleSend = () => {
    if (sentState !== "idle") return;
    setSentState("sending");
    setTimeout(() => {
      setSentState("sent");
      setTimeout(() => onSend(suggestion.id), 650);
    }, 420);
  };

  return (
    <AnimatePresence mode="wait">
      {sentState === "sent" ? (
        <motion.div
          key="toast"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-center gap-2 rounded-r-md border border-mint/40 bg-mint/10 px-4 py-3"
          role="status"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-mint text-void">
            <Check className="size-3" />
          </span>
          <p className="text-[13px] font-medium text-mint">Réponse envoyée</p>
        </motion.div>
      ) : (
        <motion.aside
          key="banner"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          aria-label="Suggestion IA en attente"
          className="rounded-r-md border border-iris/60 bg-iris/[.08] p-4 backdrop-blur-sm"
        >
          {/* En-tête */}
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-iris/15">
              <img src="/logo.svg" alt="" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-hi">
                Suggestion de {agent?.name ?? "Mira"}
              </p>
              <p className="font-mono text-[10px] text-low tabular">{relTime(suggestion.at)}</p>
            </div>
            <ConfidenceRing value={suggestion.confidence} size={30} stroke={3} />
          </div>

          {/* Corps : réponse proposée */}
          <p className="mt-3 rounded-r-md bg-white/95 px-3.5 py-2.5 text-[13px] leading-[20px] text-ink shadow-sm">
            {suggestion.text}
          </p>

          {/* Actions */}
          <AnimatePresence mode="wait">
            {confirmDismiss ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="mt-3 flex items-center gap-2"
              >
                <p className="flex-1 text-[12px] text-mid">Masquer cette suggestion ?</p>
                <button
                  type="button"
                  onClick={() => onDismiss(suggestion.id)}
                  className="rounded-r-sm bg-rose/15 px-3 py-1.5 text-[12px] font-semibold text-rose transition-colors hover:bg-rose/25"
                >
                  Oui, ignorer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDismiss(false)}
                  className="rounded-r-sm px-3 py-1.5 text-[12px] font-medium text-mid transition-colors hover:bg-surface-2 hover:text-hi"
                >
                  Non
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  onClick={() => onEdit(suggestion.id, suggestion.text)}
                  className="flex items-center gap-1.5 rounded-r-sm border border-line bg-surface-1/70 px-3.5 py-2 text-[12px] font-semibold text-mid transition-colors hover:border-iris/50 hover:text-iris"
                >
                  <PencilLine className="size-3.5" />
                  Réviser
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sentState !== "idle"}
                  className={cn(
                    "flex items-center gap-1.5 rounded-r-sm gradient-signature px-4 py-2 text-[12px] font-semibold text-white transition-all",
                    sentState === "idle" && "hover:-translate-y-px hover:shadow-glow-iris active:scale-[.98]",
                  )}
                >
                  {sentState === "sending" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  Envoyer
                </button>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => setConfirmDismiss(true)}
                  aria-label="Ignorer la suggestion"
                  className="flex size-8 items-center justify-center rounded-full text-low transition-colors hover:bg-surface-2 hover:text-rose"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Regénérer */}
          <button
            type="button"
            onClick={() => toast.info("Régénération indisponible dans ce stub Inbox")}
            className="mt-2 text-[11px] font-medium text-iris/80 underline decoration-iris/40 underline-offset-2 transition-colors hover:text-iris"
          >
            Régénérer une autre proposition
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
