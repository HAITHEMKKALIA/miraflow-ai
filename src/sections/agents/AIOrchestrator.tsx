/**
 * AIOrchestrator — Moteur global de traitement des messages IA (design.md §7).
 *
 * Composant invisible monté dans AppShell qui surveille les messages entrants
 * toutes les 1.8s et orchestre le routage vers les agents spécialisés.
 * Pipeline 100 % réel : Router JSON → confiance → réponse générée par le LLM
 * (réponse auto / suggestion) ou escalade humaine. Aucune réponse simulée :
 * si le fournisseur IA est indisponible, une notification « IA indisponible »
 * est créée et la conversation est transférée à un humain (handoff).
 */
import { useEffect, useRef } from "react";
import { useSim, type Conversation, type Message, type AiAgent } from "@/lib/sim/store";
import { routeAgentForText } from "./routing";
import { chatCompletion, extractJsonObject, resolveAgentEngine } from "@/lib/ai";
import { DERJA_ROUTER_ADDON, DERJA_SYSTEM_PROMPT, DERJA_REPLY_RULE } from "@/lib/derja";
import { toast } from "sonner";

/** System prompt du Router — JSON strict, adapté au dialecte tunisien / arabizi. */
const ROUTER_SYSTEM_PROMPT = `Tu es le Router de MiraFlow AI, assistant pour des commerces tunisiens sur WhatsApp.
Analyse le message client et réponds UNIQUEMENT avec un objet JSON strict (aucun texte autour) :
{
  "langue": "fr" | "ar" | "ar-tn" | "arabizi" | "mixte",
  "intent": "commande" | "prix" | "livraison" | "reclamation" | "horaires" | "stock" | "salutation" | "autre",
  "department": "ventes" | "support" | "livraison" | "facturation" | "general",
  "confidence": <nombre entre 0 et 1>,
  "sentiment": "positif" | "neutre" | "negatif",
  "urgency": "basse" | "moyenne" | "haute",
  "entities": { "produit"?: string, "quantite"?: number, "ville"?: string, "telephone"?: string }
}
Le client peut écrire en français, en arabe tunisien (دارجة), ou en arabizi/chiffres :
3 = ع, 5 = خ, 7 = ح, 9 = ق (ex. "chnowa" = "qu'est-ce que", "behi" = "bien", "7aja" = حاجة).
Baisse "confidence" si le message est ambigu, hors sujet ou nécessite un humain.`;

/** System prompt Router final : prompt métier + addon derja + couche langue complète. */
const ROUTER_FULL_SYSTEM_PROMPT = `${ROUTER_SYSTEM_PROMPT}\n\n${DERJA_ROUTER_ADDON}\n\n${DERJA_SYSTEM_PROMPT}`;

interface RouterAnalysis {
  language?: string;
  langue?: string;
  intent?: string;
  department?: string;
  confidence?: number;
  sentiment?: string;
  urgency?: string;
  entities?: Record<string, unknown>;
}

/** Analyse Router via le LLM : retourne null si indisponible. */
async function analyzeWithRouter(text: string, routerAgent?: AiAgent): Promise<RouterAnalysis | null> {
  // Le Router utilise le fournisseur global, sauf si l'agent « Router » a un
  // provider/model configuré (override par agent).
  const engine = routerAgent ? resolveAgentEngine(routerAgent) : null;
  const res = await chatCompletion({
    messages: [
      { role: "system", content: ROUTER_FULL_SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    temperature: routerAgent?.temperature ?? 0.1,
    ...(engine?.overridden ? { provider: engine.provider, model: engine.model } : {}),
    json: true,
  });
  if (!res.ok) {
    console.warn("Router LLM indisponible :", res.error);
    return null;
  }
  // Tolère un préambule éventuel (raisonnement résiduel, texte libre) avant le JSON.
  const parsed = extractJsonObject<RouterAnalysis>(res.text);
  if (!parsed) {
    console.warn("Router : JSON invalide renvoyé par le modèle.");
    return null;
  }
  return parsed;
}

/** Génère la réponse de l'agent via le LLM (system prompt dédié). null si échec. */
async function generateReply(agent: AiAgent, text: string, conv?: Conversation): Promise<string | null> {
  // Règle 8 de la couche derja : jamais traiter un message isolément —
  // on injecte les derniers messages de la conversation dans le contexte.
  const engine = resolveAgentEngine(agent);
  const history = (conv?.thread ?? [])
    .slice(-8, -1)
    .map((m) => `${m.direction === "in" ? "Client" : "Agent"}: ${m.body}`)
    .join("\n");
  const res = await chatCompletion({
    messages: [
      {
        role: "system",
        content:
          (agent.systemPrompt ??
            `Tu es l'agent ${agent.name} de MiraFlow AI. Réponds dans la langue du client, de façon concise et professionnelle.`) +
          `\n\n${DERJA_SYSTEM_PROMPT}\n\n${DERJA_REPLY_RULE}`,
      },
      ...(history
        ? [{ role: "user" as const, content: `Contexte de la conversation (messages récents) :\n${history}` }]
        : []),
      { role: "user", content: text },
    ],
    // Override par agent uniquement si provider explicite (sinon réglages globaux).
    ...(engine.overridden ? { provider: engine.provider, model: engine.model } : {}),
    temperature: agent.temperature ?? 0.2,
  });
  if (!res.ok || !res.text.trim()) {
    console.warn(`Réponse LLM indisponible (${agent.name}) :`, res.ok ? "vide" : res.error);
    return null;
  }
  return res.text.trim();
}

/** IA indisponible : notification + handoff humain, jamais de fausse réponse. */
function aiUnavailableHandoff(agent: AiAgent, conv: Conversation, reason: string) {
  const { setConversationStatus, addActivity, addNotification, pushJournal } = useSim.getState();
  setConversationStatus(conv.id, "pending");
  addNotification?.({
    kind: "ai",
    title: "IA indisponible",
    body: `${agent.name} n'a pas pu répondre (${reason}). Conversation transférée à un humain.`,
  });
  addActivity?.({
    kind: "ai",
    text: `IA indisponible (${reason}) — conversation ${conv.id} transférée à un humain.`,
  });
  pushJournal?.({
    agentId: agent.id,
    agentName: agent.name,
    conversation: conv.id,
    action: "Escalade",
    confidence: 0,
    decision: "En attente",
    latencyS: 0,
  });
  toast.warning("IA indisponible", {
    description: `Le fournisseur IA n'a pas répondu. La conversation reste entre vos mains.`,
  });
}

/** Pipeline LLM : Router JSON → confiance → réponse auto / suggestion / handoff. */
async function processWithLLM(msg: Message, conv: Conversation) {
  const {
    agents,
    aiSettings,
    addSuggestion,
    sendMessage,
    setConversationStatus,
    addActivity,
    pushJournal,
  } = useSim.getState();

  const agentId = routeAgentForText(msg.body);
  const agent = agents.find((a) => a.id === agentId) ?? agents[0];
  if (!agent) return;

  // 1. Analyse Router (JSON strict). Échec → handoff humain + notification.
  const routerAgent = agents.find((a) => a.agentType === "router" || a.id === "ag_router");
  const analysis = await analyzeWithRouter(msg.body, routerAgent);
  if (!analysis) {
    aiUnavailableHandoff(agent, conv, "analyse Router impossible");
    return;
  }

  // 2. Confiance (0..1) ramenée en % ; seuils globaux §46.
  const confidencePct = Math.round(Math.min(1, Math.max(0, analysis.confidence ?? 0)) * 100);
  const humanThreshold = Math.round(aiSettings.thresholds.supervisor * 100);
  const autoThreshold = Math.round(aiSettings.thresholds.auto * 100);

  const journal = (action: "Réponse auto" | "Suggestion" | "Escalade", decision: "—" | "En attente") => {
    pushJournal?.({
      agentId: agent.id,
      agentName: agent.name,
      conversation: conv.id,
      action,
      confidence: confidencePct,
      decision,
      latencyS: 1.2,
    });
  };

  // 3. Confiance < seuil humain → handoff (escalade, pas de réponse auto).
  if (confidencePct < humanThreshold) {
    setConversationStatus(conv.id, "pending");
    addActivity?.({
      kind: "ai",
      text: `Escalade humaine : confiance Router ${confidencePct}% < ${humanThreshold}% (intent ${analysis.intent ?? "?"}, urgence ${analysis.urgency ?? "?"})`,
    });
    journal("Escalade", "En attente");
    toast.warning("Handoff humain requis", {
      description: `${agent.name} : confiance ${confidencePct}% sous le seuil superviseur.`,
    });
    return;
  }

  // 4. Génération de la réponse par le LLM. Échec → handoff + notification.
  const replyText = await generateReply(agent, msg.body, conv);
  if (!replyText) {
    aiUnavailableHandoff(agent, conv, "génération de réponse impossible");
    return;
  }

  // 5. Réponse auto si agent autonome et confiance ≥ seuil auto, sinon suggestion.
  const isAutonomous = agent.mode === "autonomous" && confidencePct >= autoThreshold;
  if (isAutonomous) {
    sendMessage(conv.id, replyText);
    setConversationStatus(conv.id, "resolved");
    addActivity?.({
      kind: "ai",
      text: `Réponse auto envoyée par ${agent.name} (LLM, confiance ${confidencePct}%)`,
    });
    journal("Réponse auto", "—");
  } else {
    addSuggestion?.({
      agentId: agent.id,
      conversationId: conv.id,
      text: replyText,
      confidence: confidencePct,
    });
    journal("Suggestion", "En attente");
    toast.info("Nouvelle suggestion IA", {
      description: `${agent.name} a préparé une réponse pour ${conv.id}.`,
    });
  }
}

export default function AIOrchestrator() {
  const processedMsgIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tick = setInterval(() => {
      const { conversations } = useSim.getState();

      // Nouveaux messages entrants non traités
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
        void processWithLLM(msg, conv);
      });
    }, 1800);

    return () => clearInterval(tick);
  }, []);

  return null;
}
