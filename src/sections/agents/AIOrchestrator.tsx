/**
 * AIOrchestrator — Moteur global de traitement des messages IA (design.md §7).
 * 
 * Composant invisible monté dans AppShell qui surveille les messages entrants
 * toutes les 1.8s (tick haute performance) et orchestre le routage vers les 
 * 8 agents spécialisés.
 */
import { useEffect, useRef } from "react";
import { useSim, type Conversation, type Message, type JournalEntry } from "@/lib/sim/store";
import { craftAnswer } from "./data";
import { routeAgentForText } from "./routing";
import { toast } from "sonner";

/** Seuil de confiance minimal pour l'envoi autonome via WhatsApp */
const AUTO_REPLY_THRESHOLD = 85;

export default function AIOrchestrator() {
  const processedMsgIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tick = setInterval(() => {
      const {
        conversations,
        agents,
        addSuggestion,
        sendMessage,
        setConversationStatus,
        addActivity,
        pushJournal,
      } = useSim.getState();

      // 1. Trouver les nouveaux messages entrants non traités
      const pendingMessages: { msg: Message; conv: Conversation }[] = [];
      
      conversations.forEach((conv) => {
        const lastMsg = conv.thread[conv.thread.length - 1];
        if (lastMsg && lastMsg.direction === "in" && !processedMsgIds.current.has(lastMsg.id)) {
          pendingMessages.push({ msg: lastMsg, conv });
        }
      });

      if (pendingMessages.length === 0) return;

      pendingMessages.forEach(({ msg, conv }) => {
        processedMsgIds.current.add(msg.id);

        // 2. Routage vers l'agent pertinent
        const agentId = routeAgentForText(msg.body);
        const agent = agents.find((a) => a.id === agentId) ?? agents[0];
        if (!agent) return;

        // 3. Génération de la réponse
        const answer = craftAnswer(agentId, msg.body, "nouveau", true);

        // 4. Décision : Suggestion ou Réponse Auto
        const isAutonomous = agent.mode === "autonomous" && answer.confidence >= AUTO_REPLY_THRESHOLD;

        if (isAutonomous) {
          // Envoi automatique
          sendMessage(conv.id, answer.text);
          setConversationStatus(conv.id, "resolved");
          
          if (addActivity) {
            addActivity({
              kind: "ai",
              text: `Réponse auto envoyée par ${agent.name} (Confiance ${answer.confidence}%)`,
            });
          }
        } else {
          // Suggestion à valider
          if (addSuggestion) {
            addSuggestion({
              agentId: agent.id,
              conversationId: conv.id,
              text: answer.text,
              confidence: answer.confidence,
            });
          }

          toast.info(`Nouvelle suggestion IA`, {
            description: `${agent.name} a préparé une réponse pour ${conv.id}.`
          });
        }

        // 5. Journalisation (via store + localStorage mf:agent-journal-v1)
        const journalPayload = {
          agentId: agent.id,
          agentName: agent.name,
          conversation: conv.id,
          action: (isAutonomous ? "Réponse auto" : "Suggestion") as "Réponse auto" | "Suggestion",
          confidence: answer.confidence,
          decision: (isAutonomous ? "—" : "En attente") as "—" | "En attente",
          latencyS: 1.2,
        };

        if (pushJournal) pushJournal(journalPayload);

        try {
          const raw = localStorage.getItem("mf:agent-journal-v1") || "[]";
          const journal = JSON.parse(raw) as (JournalEntry & { id: string; at: number })[];
          journal.unshift({ ...journalPayload, id: `j_${Date.now()}`, at: Date.now() });
          localStorage.setItem("mf:agent-journal-v1", JSON.stringify(journal.slice(0, 100)));
        } catch (e) {
          console.error("Erreur journalisation agent", e);
        }
      });

    }, 1800);

    return () => clearInterval(tick);
  }, []);

  return null;
}
