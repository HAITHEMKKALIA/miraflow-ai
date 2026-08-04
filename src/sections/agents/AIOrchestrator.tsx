/**
 * AIOrchestrator — Moteur global de traitement des messages IA (design.md §7).
 * 
 * Composant invisible monté dans AppShell qui surveille les messages entrants
 * toutes les 1.8s (tick haute performance) et orchestre le routage vers les 
 * 8 agents spécialisés.
 */
import { useEffect, useRef } from "react";
import { useSim, type AiAgent, type Conversation, type Message } from "@/lib/sim/store";
import { craftAnswer } from "./data";
import { toast } from "sonner";

/** Seuil de confiance minimal pour l'envoi autonome via WhatsApp */
const AUTO_REPLY_THRESHOLD = 85;

/** 
 * Routage IA : Regex pondérées pour attribuer une conversation à l'agent pertinent.
 */
export function routeAgentForText(text: string): string {
  const t = text.toLowerCase();
  
  // Superviseur : détection de frustration ou réclamations (Priorité haute)
  if (/\b(honteux|arnaque|plainte|avocat|remboursement|inacceptable|honte|mauvais)\b/i.test(t)) return "ag_supervisor";
  
  // Technique : diagnostics, pannes, SAV matériel
  if (/\b(panne|casse|defaut|garantie|sav|reparer|marche pas|probleme technique)\b/i.test(t)) return "ag_tech";
  
  // Rendez-vous : créneaux, planning, réservations
  if (/\b(rdv|rendez-vous|reserver|creneau|disponible le|planning|visite)\b/i.test(t)) return "ag_rdv";
  
  // Commercial : prix, catalogue, produits, offres
  if (/\b(prix|tarif|combien|commander|achat|offre|promo|catalogue|produit|boutique)\b/i.test(t)) return "ag_sales";
  
  // Analyste : chiffres, tendances, stats
  if (/\b(chiffre|stat|tendance|performance|rapport|activite|bilan)\b/i.test(t)) return "ag_analyst";

  // Support : par défaut (FAQ, infos générales)
  return "ag_support";
}

export default function AIOrchestrator() {
  const { 
    conversations, 
    agents, 
    addSuggestion, 
    sendMessage, 
    setConversationStatus,
    addActivity,
    pushJournal
  } = useSim((s) => ({
    conversations: s.conversations,
    agents: s.agents,
    addSuggestion: s.addSuggestion,
    sendMessage: s.sendMessage,
    setConversationStatus: s.setConversationStatus,
    addActivity: s.addActivity,
    pushJournal: s.pushJournal
  }));

  const processedMsgIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tick = setInterval(() => {
      // 1. Trouver les nouveaux messages entrants non traités
      const pendingMessages: { msg: Message; conv: Conversation }[] = [];
      
      conversations.forEach(conv => {
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
        const agent = agents.find(a => a.id === agentId) || agents[0];

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
              id: `act_${Date.now()}`,
              at: Date.now(),
              kind: "ai",
              text: `Réponse auto envoyée par ${agent.name} (Confiance ${answer.confidence}%)`
            });
          }
        } else {
          // Suggestion à valider
          if (addSuggestion) {
            addSuggestion({
              id: `sug_${Date.now()}`,
              agentId: agent.id,
              conversationId: conv.id,
              text: answer.text,
              confidence: answer.confidence,
              at: Date.now(),
              status: "pending"
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
          action: (isAutonomous ? "Réponse auto" : "Suggestion") as any,
          confidence: answer.confidence,
          decision: (isAutonomous ? "—" : "En attente") as any,
          latencyS: 1.2
        };

        if (pushJournal) pushJournal(journalPayload);

        try {
          const raw = localStorage.getItem("mf:agent-journal-v1") || "[]";
          const journal = JSON.parse(raw);
          journal.unshift({ ...journalPayload, id: `j_${Date.now()}`, at: Date.now() });
          localStorage.setItem("mf:agent-journal-v1", JSON.stringify(journal.slice(0, 100)));
        } catch (e) {
          console.error("Erreur journalisation agent", e);
        }
      });

    }, 1800);

    return () => clearInterval(tick);
  }, [conversations, agents, sendMessage, setConversationStatus, addSuggestion, addActivity]);

  return null;
}
