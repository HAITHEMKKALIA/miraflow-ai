/**
 * MiraFlow Bridge — module IA : Groq (cloud, clé env) ou Ollama/Qwen (local).
 * Routage d'agents, contexte client, génération de réponses.
 * (Extrait de index.js pour contourner la limite de taille des push API.)
 */
import {
  SUPABASE_SERVICE_ROLE_KEY,
  bridgeIdFromSessionRow,
  logger,
  normalizeDigits,
  sessions,
  supabaseRest,
} from "./shared.js";

// Injection de dépendance depuis index.js (évite un cycle de modules ESM) :
// startSession est définie dans index.js et utilisée par autoWakeSessions.
export let startSession = null;
export function initAi(deps) {
  startSession = deps.startSession;
}

// ==== IA : Groq (cloud, clé env) ou Ollama/Qwen (local) — Moonshot/Kimi supprimé ====
// Config via variables d'environnement :
//   AI_PROVIDER=groq|ollama   (défaut: groq si GROQ_API_KEY présente, sinon ollama)
//   GROQ_API_KEY=gsk_...      (gratuite : https://console.groq.com/keys)
//   AI_MODEL=llama-3.3-70b-versatile | qwen3:8b ...
//   OLLAMA_BASE_URL=http://localhost:11434
export const GROQ_API_KEY = String(process.env.GROQ_API_KEY || "").trim();
const OLLAMA_BASE_URL = String(process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
export const AI_PROVIDER = String(process.env.AI_PROVIDER || (GROQ_API_KEY ? "groq" : "ollama")).toLowerCase();
const AI_MODEL = String(process.env.AI_MODEL || (AI_PROVIDER === "ollama" ? "qwen3:8b" : "llama-3.3-70b-versatile"));
const AI_ENDPOINT = AI_PROVIDER === "ollama"
  ? OLLAMA_BASE_URL + "/v1/chat/completions"
  : "https://api.groq.com/openai/v1/chat/completions";
const AI_KEY = AI_PROVIDER === "ollama" ? "" : GROQ_API_KEY;
const AI_ENABLED = AI_PROVIDER === "ollama" || AI_KEY.length > 0;

// Retire le raisonnement privé (<think>…</think>) des réponses — jamais exposé au client.
function stripReasoning(text) {
  return String(text ?? "")
    .replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "")
    .trim();
}

// Appel IA générique (compatible OpenAI : Groq ou Ollama)
async function aiChat({ messages, temperature = 0.2, json = false }) {
  if (!AI_ENABLED) return null;
  const headers = { "Content-Type": "application/json" };
  if (AI_KEY) headers["Authorization"] = "Bearer " + AI_KEY;
  const body = { model: AI_MODEL, temperature, messages };
  if (json) body.response_format = { type: "json_object" };
  if (AI_PROVIDER === "ollama") body.think = false;
  const out = await fetch(AI_ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
  if (!out.ok) throw new Error("AI HTTP " + out.status);
  const data = await out.json();
  return stripReasoning(data?.choices?.[0]?.message?.content || "");
}

// ==== BACKGROUND WORKER: AUTO-WAKE SESSIONS ====
export async function autoWakeSessions() {
  if (!SUPABASE_SERVICE_ROLE_KEY || !startSession) return;
  try {
    const rows = await supabaseRest("/sessions_qr?status=eq.connected&select=device");
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const bridgeId = bridgeIdFromSessionRow(row);
        if (bridgeId && !sessions.has(bridgeId)) {
          logger.info({ bridgeId }, "Auto-waking connected session on boot");
          await startSession(bridgeId).catch(() => { });
        }
      }
    }
  } catch (e) {
    logger.error({ err: e }, "autoWakeSessions failed");
  }
}

const ROUTER_DEPARTMENTS = {
  commercial: {
    label: "Commercial",
    prompt: "Tu es l'agent Commercial. Tu gères les prospects, les devis, les remises sur volume, les demandes B2B et la negociation tarifaire."
  },
  vente: {
    label: "Vente",
    prompt: "Tu es l'agent Vente. Tu aides le client a choisir, tu expliques clairement l'offre et tu fais avancer la commande sans inventer d'informations."
  },
  achat: {
    label: "Achat",
    prompt: "Tu es l'agent Achat. Tu traites les questions fournisseurs, disponibilites d'approvisionnement et demandes d'achat internes."
  },
  livraison: {
    label: "Livraison",
    prompt: "Tu es l'agent Livraison. Tu aides sur le suivi de commande, l'adresse, les retards et les questions de distribution."
  },
  logistique: {
    label: "Logistique",
    prompt: "Tu es l'agent Logistique. Tu traites le stock, la disponibilite, la preparation et la coordination operationnelle."
  },
  paiement: {
    label: "Paiement",
    prompt: "Tu es l'agent Paiement. Tu geres facture, paiement, confirmation et points financiers sans jamais confirmer une operation sans preuve."
  },
  sav: {
    label: "SAV",
    prompt: "Tu es l'agent SAV. Tu traites les reclamations avec empathie, tu qualifies le probleme et tu proposes la prochaine etape la plus utile."
  },
  information: {
    label: "Information",
    prompt: "Tu es l'agent Information. Tu reponds aux questions generales sur l'entreprise, les horaires et les informations non sensibles."
  },
  human_support: {
    label: "Support humain",
    prompt: "Tu es l'agent de Support humain. Tu n'essaies pas de resoudre toi-meme un cas ambigu ou sensible: tu qualifies et tu transfers proprement."
  }
};

function containsArabicScript(text) {
  return /[؀-ۿ]/.test(String(text ?? ""));
}

function detectReplyLanguage(text, preferredLanguage) {
  const preferred = String(preferredLanguage ?? "").trim();
  if (preferred) return preferred;

  const raw = String(text ?? "");
  const t = raw.toLowerCase();
  const tunisianLatin = /(aslema|slm|salam|salem|brabi|chnowa|chnowa|ch7al|n7eb|mte3i|mt3i|win|weslet|waktach|wa9tach|ya3mlouli|ena|mazel|mazel ma|livreur)/i;
  const german = /\b(ich|möchte|moechte|stück|stueck|preis|angebot|lieferung|rechnung|zahlung|bestellen|haben sie)\b/i;
  const english = /\b(hello|hi|price|order|delivery|invoice|payment|stock|support|quote|pieces)\b/i;

  if (containsArabicScript(raw)) return "ar-TN";
  if (tunisianLatin.test(t)) return "ar-TN";
  if (german.test(t)) return "de";
  if (english.test(t)) return "en";
  return "fr";
}

function extractRoutingEntities(text) {
  const raw = String(text ?? "");
  const quantityMatch = raw.match(/\b(\d+)\s*(pieces?|pi[eè]ces?|pcs?|units?|unit[eé]s?|stück|stueck)\b/i) || raw.match(/\b(\d+)\b/);
  const orderMatch = raw.match(/\b(?:cmd|commande|order|bestellung)[-:\s#]*([a-z0-9-]{3,})\b/i) || raw.match(/\b\d{4,}\b/);
  const productMatch = raw.match(/\b(?:modele|model|produit|product|article|ref)[-:\s#]*([a-z0-9][a-z0-9 _-]{1,40})\b/i);

  return {
    order_number: orderMatch ? String(orderMatch[1] ?? orderMatch[0]).trim() : null,
    quantity: quantityMatch ? Number(quantityMatch[1]) : null,
    product_hint: productMatch ? String(productMatch[1] ?? "").trim() : null,
  };
}

function detectUrgencyAndSentiment(text) {
  const t = String(text ?? "").toLowerCase();
  const urgent = /(urgent|vite|rapidement|aujourd'hui|today|asap|responsable|plainte|complaint|reclamation|chauffeur|retard|problem|probl[eè]me|mazel ma|waktach|wa9tach)/i.test(t);
  const negative = /(probl[eè]me|panne|cass[eé]|retard|reclamation|remboursement|angry|not happy|livreur|mazel ma|mech mawsel|mouch mawsel)/i.test(t);
  const positive = /(merci|thanks|perfect|parfait|top|good|super)/i.test(t);

  return {
    urgency: urgent ? "high" : "normal",
    sentiment: negative ? "negative" : (positive ? "positive" : "neutral"),
  };
}

function fallbackRouteAgentForText(text, context = {}) {
  const t = String(text ?? "").toLowerCase();
  const entities = extractRoutingEntities(text);
  const { urgency, sentiment } = detectUrgencyAndSentiment(text);
  const language = detectReplyLanguage(text, context?.state?.preferredLanguage || context?.customer?.preferredLanguage);

  let department = "information";
  let intent = "general_information";
  let confidence = 0.72;
  let humanRequired = false;

  if (/(human|humain|agent|conseiller|responsable|operator|support humain)/i.test(t)) {
    department = "human_support";
    intent = "human_handoff";
    confidence = 0.95;
    humanRequired = true;
  } else if (/(devis|quote|quotation|angebot|grossiste|gros|wholesale|meilleur prix|better price|remise|discount|50 stück|50 stueck|50 pieces)/i.test(t)) {
    department = "commercial";
    intent = "quote_negotiation";
    confidence = 0.9;
  } else if (/(livraison|delivery|colis|commande|order|bestellung|suivi|track|retard|livreur|weslet|waktach|wa9tach)/i.test(t)) {
    department = "livraison";
    intent = entities.order_number ? "delivery_tracking" : "delivery_question";
    confidence = entities.order_number ? 0.9 : 0.82;
  } else if (/(prix|price|combien|tarif|catalogue|catalog|acheter|buy|promo|promotion)/i.test(t)) {
    department = "vente";
    intent = "sales_inquiry";
    confidence = 0.84;
  } else if (/(stock|dispo|disponible|availability|available|preparation|logistique|warehouse)/i.test(t)) {
    department = "logistique";
    intent = "stock_check";
    confidence = 0.84;
  } else if (/(fournisseur|supplier|approvisionnement|procurement|achat)/i.test(t)) {
    department = "achat";
    intent = "procurement_request";
    confidence = 0.84;
  } else if (/(paiement|payment|facture|invoice|virement|versement|reglement|paid)/i.test(t)) {
    department = "paiement";
    intent = "payment_question";
    confidence = 0.86;
  } else if (/(sav|support|panne|cass[eé]|broken|retour|return|refund|remboursement|problem|probl[eè]me|reclamation)/i.test(t)) {
    department = "sav";
    intent = "support_request";
    confidence = 0.88;
    if (sentiment === "negative" && urgency === "high") humanRequired = true;
  }

  return {
    language,
    reply_language: language,
    intent,
    department,
    entities,
    urgency,
    sentiment,
    confidence,
    human_required: humanRequired,
  };
}

function sanitizeRouteAnalysis(candidate, fallback) {
  const department = String(candidate?.department ?? fallback.department).toLowerCase();
  const safeDepartment = ROUTER_DEPARTMENTS[department] ? department : fallback.department;
  const confidence = Number(candidate?.confidence);
  const language = detectReplyLanguage(candidate?.language || fallback.language, fallback.reply_language);
  const replyLanguage = detectReplyLanguage(candidate?.reply_language || language, fallback.reply_language);

  return {
    language,
    reply_language: replyLanguage,
    intent: String(candidate?.intent ?? fallback.intent),
    department: safeDepartment,
    entities: {
      ...fallback.entities,
      ...(candidate?.entities && typeof candidate.entities === "object" ? candidate.entities : {}),
    },
    urgency: String(candidate?.urgency ?? fallback.urgency) === "high" ? "high" : "normal",
    sentiment: ["positive", "negative", "neutral"].includes(String(candidate?.sentiment ?? "")) ? String(candidate.sentiment) : fallback.sentiment,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : fallback.confidence,
    human_required: Boolean(candidate?.human_required ?? fallback.human_required),
  };
}

export async function routeAgentForText(text, context = {}) {
  const fallback = fallbackRouteAgentForText(text, context);

  if (!AI_ENABLED) {
    return fallback;
  }

  try {
    const rawContent = await aiChat({
      temperature: 0.1,
      json: true,
      messages: [
          {
            role: "system",
            content: [
              "You are the central router for a multilingual WhatsApp CRM.",
              "Understand mixed French, English, German, Arabic, Tunisian Arabic, Latin Tunisian, and Arabizi.",
              "Return JSON only with keys: language, reply_language, intent, department, entities, urgency, sentiment, confidence, human_required.",
              "Valid department values: commercial, vente, achat, livraison, logistique, paiement, sav, information, human_support.",
              "Never answer the customer. Only classify and extract."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              text,
              customer: context?.customer ?? null,
              state: context?.state ?? null,
              recentMessages: Array.isArray(context?.recentMessages) ? context.recentMessages.slice(-8) : [],
            })
          }
        ]
    });
    const parsed = JSON.parse(rawContent || "{}");
    return sanitizeRouteAnalysis(parsed, fallback);
  } catch (e) {
    logger.error({ err: e }, "AI Routing failed, using fallback");
    return fallback;
  }
}

export async function buildCustomerAiContext(orgId, contactRow) {
  const context = {
    customer: {
      id: contactRow?.id ?? null,
      name: contactRow?.name ?? null,
      phone: contactRow?.phone ?? null,
      stage: contactRow?.stage ?? null,
      tags: Array.isArray(contactRow?.tags) ? contactRow.tags : [],
      preferredLanguage: null,
      score: 0,
      segment: null,
      consent_marketing: null,
      unsubscribed: false,
      notes: null,
      created_at: null,
    },
    state: {},
    recentMessages: [],
    conversation: null,
    extended: null,
  };

  if (!orgId || !contactRow?.id) return context;

  try {
    const conversations = await supabaseRest(
      `/conversations?org_id=eq.${orgId}&contact_id=eq.${contactRow.id}&select=id,last_message_at,created_at,status,unread_count,assignee_id&order=last_message_at.desc&limit=1`,
    );
    const conversationId = Array.isArray(conversations) && conversations[0]?.id ? conversations[0].id : null;
    const convRow = Array.isArray(conversations) ? (conversations[0] ?? null) : null;
    if (convRow) {
      context.conversation = {
        id: convRow.id,
        status: convRow.status ?? null,
        unread_count: Number(convRow.unread_count ?? 0),
        last_message_at: convRow.last_message_at ?? null,
        created_at: convRow.created_at ?? null,
        assignee_id: convRow.assignee_id ?? null,
      };
      context.state.conversation_id = convRow.id;
    }

    const extended = await lookupContactExtendedData(orgId, contactRow);
    if (extended) {
      context.extended = extended;
      context.customer.stage = extended.stage ?? context.customer.stage;
      context.customer.tags = Array.isArray(extended.tags) ? extended.tags : context.customer.tags;
      context.customer.score = extended.score;
      context.customer.segment = extended.segment;
      context.customer.consent_marketing = extended.consent_marketing;
      context.customer.unsubscribed = extended.unsubscribed;
      context.customer.notes = extended.notes;
      context.customer.created_at = extended.created_at;
    }

    if (!conversationId) return context;

    const recentMessages = await supabaseRest(
      `/messages?conversation_id=eq.${conversationId}&select=direction,body,created_at,status&order=created_at.desc&limit=12`,
    );
    const orderedMessages = Array.isArray(recentMessages) ? [...recentMessages].reverse() : [];
    context.recentMessages = orderedMessages.map((row) => ({
      direction: row.direction === "out" ? "out" : "in",
      body: String(row.body ?? "").trim(),
      created_at: row.created_at ?? null,
      status: row.status ?? null,
    })).filter((row) => row.body);

    const inboundText = context.recentMessages
      .filter((row) => row.direction === "in")
      .map((row) => row.body)
      .join(" ");
    const combined = `${inboundText} ${contactRow?.name ?? ""}`.trim();
    const entities = extractRoutingEntities(combined);

    context.customer.preferredLanguage = detectReplyLanguage(inboundText || contactRow?.name || "");
    context.state = {
      ...context.state,
      preferredLanguage: context.customer.preferredLanguage,
      order_number: entities.order_number ?? null,
      quantity: entities.quantity ?? null,
      product_hint: entities.product_hint ?? null,
      last_customer_message: context.recentMessages.length > 0 ? context.recentMessages[context.recentMessages.length - 1].body : null,
    };
  } catch (err) {
    logger.warn({ err, contactId: contactRow?.id }, "Failed to build customer AI context");
  }

  return context;
}

function departmentToAgentKey(department) {
  const d = String(department ?? "").toLowerCase();
  if (d === "commercial" || d === "vente") return "sales";
  if (d === "sav") return "support";
  if (d === "human_support") return "supervisor";
  if (d === "information") return "analyst";
  if (d === "paiement") return "support";
  if (d === "livraison" || d === "logistique") return "support";
  return "analyst";
}

async function findActiveAiAgent(orgId, department) {
  if (!orgId) return null;
  const key = departmentToAgentKey(department);
  const rows = await supabaseRest(
    `/ai_agents?org_id=eq.${orgId}&active=eq.true&key=eq.${encodeURIComponent(key)}&select=id,key,name,mode,threshold,config&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) ? (rows[0] ?? null) : null;
}

function extractLookupTokens(text, route, context) {
  const bag = new Set();
  const push = (value) => {
    const s = String(value ?? "").trim();
    if (!s) return;
    if (s.length < 3) return;
    bag.add(s);
  };

  push(route?.entities?.order_number);
  push(route?.entities?.product_hint);
  push(context?.state?.order_number);
  push(context?.state?.product_hint);

  for (const match of String(text ?? "").matchAll(/\b[a-z0-9-]{3,}\b/gi)) {
    const token = String(match[0] ?? "").trim();
    if (/^\d{1,2}$/.test(token)) continue;
    push(token);
    if (bag.size >= 8) break;
  }

  return Array.from(bag);
}

async function lookupInvoicesForRoute(orgId, text, route, context) {
  if (!orgId) return [];
  const candidates = extractLookupTokens(text, route, context);
  const hits = [];
  const seen = new Set();

  for (const token of candidates) {
    const rows = await supabaseRest(
      `/invoices?org_id=eq.${orgId}&number=ilike.${encodeURIComponent(`*${token}*`)}&select=id,number,amount,currency,status,created_at&period_start,period_end&order=created_at.desc&limit=3`
    ).catch(() => []);
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      hits.push(row);
      if (hits.length >= 5) return hits;
    }
  }

  return hits;
}

async function searchKnowledgeDocsForRoute(orgId, text, route, context) {
  if (!orgId) return [];
  const candidates = extractLookupTokens(text, route, context)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 4)
    .slice(0, 4);
  const hits = [];
  const seen = new Set();

  for (const token of candidates) {
    const rows = await supabaseRest(
      `/knowledge_docs?org_id=eq.${orgId}&title=ilike.${encodeURIComponent(`*${token}*`)}&select=id,title,type,status,version,chunks,created_at&order=created_at.desc&limit=5`
    ).catch(() => []);
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      hits.push(row);
      if (hits.length >= 5) return hits;
    }
  }

  return hits;
}

async function lookupContactExtendedData(orgId, contactRow) {
  if (!orgId || !contactRow?.id) return null;
  try {
    const rows = await supabaseRest(
      `/contacts?id=eq.${contactRow.id}&org_id=eq.${orgId}&select=id,org_id,phone,name,stage,score,tags,segment,consent_marketing,unsubscribed,notes,created_at&limit=1`
    ).catch(() => []);
    if (!Array.isArray(rows) || !rows[0]) return null;
    const c = rows[0];
    return {
      id: c.id,
      stage: c.stage ?? null,
      score: Number(c.score ?? 0),
      segment: c.segment ?? null,
      consent_marketing: Boolean(c.consent_marketing),
      unsubscribed: Boolean(c.unsubscribed),
      notes: String(c.notes ?? "").trim(),
      tags: Array.isArray(c.tags) ? c.tags : [],
      created_at: c.created_at ?? null,
    };
  } catch (err) {
    logger.warn({ err, contactId: contactRow?.id }, "lookupContactExtendedData failed");
    return null;
  }
}

async function lookupCustomerInvoicesByContact(orgId, contactRow, text, route, context) {
  if (!orgId || !contactRow?.id) return [];
  const direct = await lookupInvoicesForRoute(orgId, text, route, context);
  if (Array.isArray(direct) && direct.length > 0) return direct;
  const tokens = new Set();
  const nameWords = String(contactRow?.name ?? "").split(/\s+/).filter(w => w.length >= 3);
  for (const w of nameWords) tokens.add(w);
  const phoneTail = normalizeDigits(contactRow?.phone ?? "").slice(-4);
  if (phoneTail) tokens.add(phoneTail);
  if (tokens.size === 0) return [];
  const hits = [];
  const seen = new Set();
  for (const token of tokens) {
    const rows = await supabaseRest(
      `/invoices?org_id=eq.${orgId}&number=ilike.${encodeURIComponent(`*${token}*`)}&select=id,number,plan,amount,currency,status,period_start,period_end,created_at&order=created_at.desc&limit=3`
    ).catch(() => []);
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      hits.push(row);
      if (hits.length >= 5) return hits;
    }
  }
  return hits;
}

async function lookupCustomerCampaigns(orgId, contactRow) {
  if (!orgId || !contactRow?.id) return [];
  try {
    const contactIdStr = String(contactRow.id);
    const rows = await supabaseRest(
      `/campaigns?org_id=eq.${orgId}&status=in.(running,done,paused,stopped)&select=id,name,goal,status,stop_on_reply,stats,created_at,scheduled_at&order=created_at.desc&limit=20`
    ).catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const involved = [];
    for (const c of rows) {
      const audience = (c.audience && typeof c.audience === "object") ? c.audience : {};
      const recipientIdsRaw = Array.isArray(audience.recipientIds) ? audience.recipientIds : [];
      const recipientStrings = recipientIdsRaw.map(x => String(x));
      const stats = (c.stats && typeof c.stats === "object") ? c.stats : {};
      const repliedIds = Array.isArray(stats.replied_contact_ids) ? stats.replied_contact_ids.map(x => String(x)) : [];
      if (!recipientStrings.includes(contactIdStr) && !repliedIds.includes(contactIdStr)) continue;
      involved.push({
        id: c.id,
        name: c.name,
        goal: c.goal ?? null,
        status: c.status,
        scheduled_at: c.scheduled_at ?? null,
        created_at: c.created_at ?? null,
        repliesCount: Number(stats.replies ?? 0),
        contactReplied: repliedIds.includes(contactIdStr),
        stop_on_reply: Boolean(c.stop_on_reply),
      });
      if (involved.length >= 8) break;
    }
    return involved;
  } catch (err) {
    logger.warn({ err, contactId: contactRow?.id }, "lookupCustomerCampaigns failed");
    return [];
  }
}

async function lookupConversationStats(orgId, contactRow) {
  if (!orgId || !contactRow?.id) return null;
  try {
    const convs = await supabaseRest(
      `/conversations?org_id=eq.${orgId}&contact_id=eq.${contactRow.id}&select=id,status,unread_count,last_message_at,created_at,assignee_id&order=last_message_at.desc&limit=5`
    ).catch(() => []);
    if (!Array.isArray(convs) || convs.length === 0) return null;
    const primary = convs[0];
    let totalMessages = 0;
    let outCount = 0;
    let inCount = 0;
    const msgRows = await supabaseRest(
      `/messages?conversation_id=eq.${primary.id}&select=direction&limit=500`
    ).catch(() => []);
    if (Array.isArray(msgRows)) {
      totalMessages = msgRows.length;
      outCount = msgRows.filter(m => m.direction === "out").length;
      inCount = msgRows.filter(m => m.direction === "in").length;
    }
    return {
      conversation_id: primary.id,
      conversation_status: primary.status,
      unread_count: Number(primary.unread_count ?? 0),
      last_message_at: primary.last_message_at ?? null,
      conversation_created_at: primary.created_at ?? null,
      assignee_id: primary.assignee_id ?? null,
      total_conversations: convs.length,
      total_messages: totalMessages,
      messages_in: inCount,
      messages_out: outCount,
    };
  } catch (err) {
    logger.warn({ err, contactId: contactRow?.id }, "lookupConversationStats failed");
    return null;
  }
}

async function lookupRecentAiSuggestions(orgId, contactRow, conversationStats) {
  if (!orgId) return [];
  const convId = conversationStats?.conversation_id;
  try {
    const endpoint = convId
      ? `/ai_suggestions?org_id=eq.${orgId}&conversation_id=eq.${convId}&select=id,body,confidence,status,created_at,agent_id&order=created_at.desc&limit=5`
      : `/ai_suggestions?org_id=eq.${orgId}&select=id,body,confidence,status,created_at,agent_id&order=created_at.desc&limit=5`;
    const rows = await supabaseRest(endpoint).catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn({ err }, "lookupRecentAiSuggestions failed");
    return [];
  }
}

async function listActiveAiAgents(orgId) {
  if (!orgId) return [];
  try {
    const rows = await supabaseRest(
      `/ai_agents?org_id=eq.${orgId}&active=eq.true&select=id,key,name,mode,threshold,config`
    ).catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn({ err }, "listActiveAiAgents failed");
    return [];
  }
}

export async function buildRouterToolsContext(orgId, contactRow, text, route, context) {
  const activeAgent = await findActiveAiAgent(orgId, route?.department);
  const invoices = await lookupCustomerInvoicesByContact(orgId, contactRow, text, route, context);
  const knowledgeDocs = ["information", "commercial", "vente", "logistique", "achat"].includes(String(route?.department ?? ""))
    ? await searchKnowledgeDocsForRoute(orgId, text, route, context)
    : [];
  const extendedContact = await lookupContactExtendedData(orgId, contactRow);
  const customerCampaigns = await lookupCustomerCampaigns(orgId, contactRow);
  const conversationStats = await lookupConversationStats(orgId, contactRow);
  const recentSuggestions = await lookupRecentAiSuggestions(orgId, contactRow, conversationStats);
  const allActiveAgents = await listActiveAiAgents(orgId);

  return {
    activeAgent: activeAgent ? {
      id: activeAgent.id,
      key: activeAgent.key,
      name: activeAgent.name,
      mode: activeAgent.mode,
      threshold: Number(activeAgent.threshold ?? 85),
      config: activeAgent.config ?? {},
    } : null,
    allActiveAgents: Array.isArray(allActiveAgents) ? allActiveAgents.map(a => ({
      id: a.id, key: a.key, name: a.name, mode: a.mode, threshold: Number(a.threshold ?? 85),
    })) : [],
    customerProfile: {
      id: contactRow?.id ?? null,
      name: contactRow?.name ?? null,
      phone: contactRow?.phone ?? null,
      tags: Array.isArray(contactRow?.tags) ? contactRow.tags : [],
      lastKnownLanguage: context?.customer?.preferredLanguage ?? null,
      recentMessageCount: Array.isArray(context?.recentMessages) ? context.recentMessages.length : 0,
      stage: extendedContact?.stage ?? contactRow?.stage ?? null,
      score: extendedContact?.score ?? 0,
      segment: extendedContact?.segment ?? null,
      consent_marketing: extendedContact?.consent_marketing ?? null,
      unsubscribed: extendedContact?.unsubscribed ?? false,
      notes: extendedContact?.notes ?? null,
      contact_created_at: extendedContact?.created_at ?? null,
    },
    invoices: Array.isArray(invoices) ? invoices : [],
    knowledgeDocs: Array.isArray(knowledgeDocs) ? knowledgeDocs : [],
    campaigns: Array.isArray(customerCampaigns) ? customerCampaigns : [],
    conversation: conversationStats ? {
      id: conversationStats.conversation_id,
      status: conversationStats.conversation_status,
      unread_count: conversationStats.unread_count,
      last_message_at: conversationStats.last_message_at,
      created_at: conversationStats.conversation_created_at,
      assignee_id: conversationStats.assignee_id,
      total_conversations: conversationStats.total_conversations,
      total_messages: conversationStats.total_messages,
      messages_in: conversationStats.messages_in,
      messages_out: conversationStats.messages_out,
    } : null,
    recentSuggestions: Array.isArray(recentSuggestions) ? recentSuggestions.map(s => ({
      id: s.id,
      status: s.status,
      confidence: Number(s.confidence ?? 0),
      created_at: s.created_at,
      agent_id: s.agent_id,
      preview: String(s.body ?? "").slice(0, 160),
    })) : [],
  };
}

export async function persistAiSuggestionForRoute(orgId, route, context, toolsContext, answer, text) {
  if (!orgId || !route) return null;

  const threshold = Number(toolsContext?.activeAgent?.threshold ?? 85);
  const confidencePct = Number(route.confidence ?? 0) * 100;
  const needsHuman = Boolean(route.human_required) || confidencePct < threshold;

  const conversationId = context?.conversation?.id ?? context?.state?.conversation_id ?? toolsContext?.conversation?.id ?? null;
  const agentId = toolsContext?.activeAgent?.id ?? null;
  const department = String(route.department ?? "information").toLowerCase();

  const summaryBody = needsHuman
    ? buildTransferReply(route.reply_language || "fr")
    : String(answer ?? "").trim();

  const meta = {
    department,
    intent: route.intent ?? null,
    urgency: route.urgency ?? null,
    sentiment: route.sentiment ?? null,
    confidence_pct: confidencePct,
    threshold_agent: threshold,
    human_required: needsHuman,
    human_reason: route.human_required
      ? "flagged_by_router"
      : (confidencePct < threshold ? `below_agent_threshold_${threshold}` : null),
    entities: route.entities ?? null,
    customer_id: toolsContext?.customerProfile?.id ?? null,
    conversation_id: conversationId,
    matched_campaigns: Array.isArray(toolsContext?.campaigns) ? toolsContext.campaigns.map(c => c.id) : [],
    matched_invoices: Array.isArray(toolsContext?.invoices) ? toolsContext.invoices.map(i => i.id) : [],
    recent_suggestions_count: Array.isArray(toolsContext?.recentSuggestions) ? toolsContext.recentSuggestions.length : 0,
    incoming_preview: String(text ?? "").slice(0, 400),
  };

  try {
    const created = await supabaseRest("/ai_suggestions", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        org_id: orgId,
        conversation_id: conversationId,
        agent_id: agentId,
        body: summaryBody,
        confidence: Number(route.confidence ?? 0),
        status: needsHuman ? "pending" : "pending",
      }),
    }).catch((err) => {
      logger.warn({ err, orgId, department }, "Failed to persist AI suggestion");
      return [];
    });
    const suggestionId = Array.isArray(created) && created[0]?.id ? created[0].id : null;
    logger.info(
      { suggestionId, orgId, department, needsHuman, confidencePct, threshold, conversationId, agentId },
      needsHuman ? "AI handoff suggestion persisted" : "AI suggestion persisted for review"
    );
    return { suggestionId, needsHuman, threshold, confidencePct, meta };
  } catch (e) {
    logger.warn({ err: e, orgId, department }, "persistAiSuggestionForRoute crashed");
    return null;
  }
}

export function buildTransferReply(replyLanguage) {
  if (replyLanguage === "ar-TN" || replyLanguage === "ar") {
    return "عسلامة. باش نحوّل طلبك لمستشار بش يتابع معاك بطريقة أدق، خاطر نحب نعطيك معلومة صحيحة ومؤكدة.";
  }
  if (replyLanguage === "de") {
    return "Gerne. Ich leite Ihre Anfrage an einen Berater weiter, damit Sie eine sichere und genaue Antwort bekommen.";
  }
  if (replyLanguage === "en") {
    return "Sure. I am forwarding your request to a human advisor so you get a precise and reliable answer.";
  }
  return "Bien reçu. Je transfere votre demande a un conseiller humain pour vous donner une reponse fiable et precise.";
}

function buildFallbackAnswer(text, route, context = {}) {
  const lang = route?.reply_language || "fr";
  const intent = route?.intent || "general_information";
  const invoice = Array.isArray(context?.tools?.invoices) ? context.tools.invoices[0] : null;

  if (route?.human_required || Number(route?.confidence ?? 0) < 0.6) {
    return buildTransferReply(lang);
  }

  if (lang === "ar-TN" || lang === "ar") {
    if (intent === "payment_question" && invoice?.number) {
      return `تثبتّلك الفاتورة ${invoice.number}. الحالة متاعها ${invoice.status ?? "غير مؤكدة"} والمبلغ ${invoice.amount ?? "غير متوفر"} ${invoice.currency ?? "TND"}.`;
    }
    if (intent === "delivery_tracking") return "عسلامة. ابعثلي رقم الطلب متاعك ونثبتلك وضعية التوصيل متاعها كي نتأكد من المعطيات.";
    if (intent === "sales_inquiry" || intent === "quote_negotiation") return "عسلامة. نجم نعاونك، اما ما نجمش نأكد سعر ولا stock من غير معطيات محدثة. ابعثلي اسم المنتج والكمية المطلوبة.";
    if (intent === "payment_question") return "عسلامة. نجّم نعاونك في موضوع الخلاص، اما يلزمني رقم الطلب ولا رقم الفاتورة باش نتحقق.";
    if (intent === "support_request") return "عسلامة. نحب نعاونك. ابعثلي رقم الطلب ووصف صغير للمشكل باش نوجّهك بالطريقة الصحيحة.";
    return "عسلامة. وضّحلي طلبك شوية، واذا فيه طلب ولا منتج ابعثلي المرجع متاعو باش نجاوبك بشكل صحيح.";
  }

  if (lang === "de") {
    if (intent === "payment_question" && invoice?.number) {
      return `Ich habe die Rechnung ${invoice.number} gefunden. Status: ${invoice.status ?? "unbestaetigt"}, Betrag: ${invoice.amount ?? "n/a"} ${invoice.currency ?? "TND"}.`;
    }
    if (intent === "delivery_tracking") return "Gerne. Senden Sie mir bitte Ihre Bestellnummer, damit ich den Lieferstatus korrekt pruefen kann.";
    if (intent === "sales_inquiry" || intent === "quote_negotiation") return "Gerne. Ich kann Ihnen helfen, aber ich bestaetige keinen Preis ohne aktuelle Daten. Bitte senden Sie Produkt und Menge.";
    if (intent === "payment_question") return "Bitte senden Sie mir die Bestell- oder Rechnungsnummer, damit ich den Zahlungspunkt sauber pruefen kann.";
    if (intent === "support_request") return "Beschreiben Sie mir bitte kurz das Problem und senden Sie wenn moeglich die Bestellnummer.";
    return "Gerne. Praezisieren Sie bitte kurz Ihre Anfrage, damit ich Sie richtig weiterleiten oder beantworten kann.";
  }

  if (lang === "en") {
    if (intent === "payment_question" && invoice?.number) {
      return `I found invoice ${invoice.number}. Status: ${invoice.status ?? "unconfirmed"}, amount: ${invoice.amount ?? "n/a"} ${invoice.currency ?? "TND"}.`;
    }
    if (intent === "delivery_tracking") return "Sure. Please send me your order number so I can check the delivery status properly.";
    if (intent === "sales_inquiry" || intent === "quote_negotiation") return "Sure. I can help, but I should not confirm price or stock without live data. Please send the product and quantity.";
    if (intent === "payment_question") return "Please send your order or invoice number so I can clarify the payment topic correctly.";
    if (intent === "support_request") return "Please share a short description of the issue and, if possible, your order number.";
    return "Sure. Please give me a bit more detail so I can help you correctly.";
  }

  if (intent === "payment_question" && invoice?.number) {
    return `J'ai retrouve la facture ${invoice.number}. Statut: ${invoice.status ?? "non confirme"}, montant: ${invoice.amount ?? "n/a"} ${invoice.currency ?? "TND"}.`;
  }
  if (intent === "delivery_tracking") return "Bien recu. Envoyez-moi votre numero de commande pour que je puisse verifier le suivi correctement.";
  if (intent === "sales_inquiry" || intent === "quote_negotiation") return "Je peux vous aider, mais je ne dois pas confirmer un prix ou un stock sans donnees a jour. Envoyez-moi le produit et la quantite souhaitee.";
  if (intent === "payment_question") return "Envoyez-moi le numero de commande ou de facture, et je clarifierai le point de paiement avec des informations fiables.";
  if (intent === "support_request") return "Je suis la pour vous aider. Decrivez-moi brievement le probleme et ajoutez si possible le numero de commande.";
  return `J'ai bien recu votre message. Precisez-moi juste le besoin principal pour que je vous reponde correctement: ${String(text ?? "").slice(0, 80)}`;
}

function buildAgentPrompt(route, context) {
  const specialist = ROUTER_DEPARTMENTS[route.department] || ROUTER_DEPARTMENTS.information;
  const tools = context?.tools ?? {};
  const toolsBrief = [];

  if (Array.isArray(tools.invoices) && tools.invoices.length > 0) {
    toolsBrief.push(`FACTURES TROUVEES (${tools.invoices.length}): ${JSON.stringify(tools.invoices.slice(0, 3))}`);
  }
  if (Array.isArray(tools.campaigns) && tools.campaigns.length > 0) {
    toolsBrief.push(`CAMPAGNES CLIENT (${tools.campaigns.length}): ${JSON.stringify(tools.campaigns.slice(0, 3))}`);
  }
  if (tools.conversation) {
    toolsBrief.push(`RESUME_CONVERSATION: ${JSON.stringify(tools.conversation)}`);
  }
  if (Array.isArray(tools.recentSuggestions) && tools.recentSuggestions.length > 0) {
    toolsBrief.push(`SUGGESTIONS_RECENTES (${tools.recentSuggestions.length})`);
  }
  if (Array.isArray(tools.knowledgeDocs) && tools.knowledgeDocs.length > 0) {
    toolsBrief.push(`DOCS_BASE_CONNAISSANCE (${tools.knowledgeDocs.length}): ${JSON.stringify(tools.knowledgeDocs.slice(0, 2))}`);
  }
  if (tools.activeAgent) {
    toolsBrief.push(`AGENT_ACTIF: ${JSON.stringify({ key: tools.activeAgent.key, name: tools.activeAgent.name, mode: tools.activeAgent.mode, threshold: tools.activeAgent.threshold })}`);
  }

  return [
    "Tu es un agent intelligent de service client utilisé dans une application de communication WhatsApp professionnelle.",
    "",
    "## Objectif",
    "Comprendre précisément le besoin du client et l'orienter vers le service approprié :",
    "* commercial ;",
    "* vente ;",
    "* achat ;",
    "* logistique ;",
    "* livraison ;",
    "* paiement ;",
    "* service après-vente ;",
    "* support ;",
    "* information générale.",
    "",
    "## Directives Spécifiques",
    specialist.prompt,
    "",
    "## Langues",
    "Tu dois comprendre et utiliser naturellement :",
    "* français ;",
    "* anglais ;",
    "* allemand ;",
    "* arabe standard ;",
    "* arabe tunisien ;",
    "* tunisien écrit avec l'alphabet latin ;",
    "* Arabizi utilisant notamment 2, 3, 5, 7 et 9 ;",
    "* les messages mélangeant plusieurs langues.",
    "",
    "Ne corrige pas inutilement la langue du client.",
    "Réponds normalement dans la langue ou le dialecte principalement utilisé par le client, sauf demande contraire.",
    `Langue principale détectée du client : ${route.reply_language || "fr"}`,
    "",
    "## Règles fondamentales",
    "Ne jamais inventer :",
    "* un prix ;",
    "* une promotion ;",
    "* un stock ;",
    "* une disponibilité ;",
    "* un délai ;",
    "* un état de commande ;",
    "* une livraison ;",
    "* une facture ;",
    "* un paiement ;",
    "* une garantie ;",
    "* une politique commerciale ;",
    "* une information concernant un client.",
    "",
    "Pour toutes les informations dynamiques, utilise obligatoirement les outils ou données mis à ta disposition.",
    "Si l'information n'est pas disponible, indique clairement que tu ne peux pas la confirmer.",
    "",
    "## Compréhension du contexte",
    "Analyse les messages précédents afin de comprendre les références telles que :",
    "* celui-ci ;",
    "* le même ;",
    "* en noir ;",
    "* deux autres ;",
    "* la commande ;",
    "* mon produit ;",
    "* combien pour cinq ;",
    "* وقتاش توصل ;",
    "* موجودة ;",
    "* نفس السلعة.",
    "",
    "Ne demande pas au client une information qu'il a déjà donnée dans la conversation.",
    "",
    "## Style",
    "Sois professionnel, naturel, concis et serviable.",
    "Évite les réponses robotiques.",
    "Adapte le niveau de langage au client.",
    "Pour le tunisien, utilise un tunisien naturel et compréhensible.",
    "",
    "## Outils",
    "Lorsque la demande concerne des données réelles de l'entreprise, utilise les fonctions disponibles avant de répondre.",
    "Exemples : recherche produit ; prix ; stock ; client ; commande ; paiement ; livraison ; devis ; support.",
    "",
    toolsBrief.length > 0 ? `RESULTATS DES OUTILS METIER EN BASE REELS (fiables, utilise-les d'abord) : ${toolsBrief.join(" | ")}` : "Aucun résultat d'outil métier attaché.",
    "",
    "## Sécurité commerciale",
    "Ne confirme jamais une opération importante uniquement à partir d'une supposition.",
    "Avant une opération sensible telle qu'une annulation, une modification d'adresse, un remboursement ou une modification importante de commande, vérifie les informations nécessaires.",
    "",
    "## Transfert humain",
    "Transfère la conversation à un opérateur humain lorsque :",
    "* le client le demande ;",
    "* le niveau de confiance est insuffisant ;",
    "* une réclamation importante est détectée ;",
    "* une autorisation humaine est nécessaire ;",
    "* aucune information fiable n'est disponible ;",
    "* la situation sort de ton périmètre.",
    "",
    "L'objectif n'est pas de répondre à tout prix.",
    "L'objectif est de donner une réponse correcte et utile.",
    "",
    route.human_required || route.confidence < 0.6
      ? "🚨 ALERTE : Le cas doit être transféré à un humain. Réponds en annonçant ce transfert calmement au client."
      : "Si l'information manque, pose uniquement la question minimale nécessaire, après avoir vérifié les outils.",
    "",
    "## État actuel du système",
    `Routage courant : ${JSON.stringify(route)}`,
    `Contexte client : ${JSON.stringify(context ?? {})}`,
  ].join("\n");
}

export async function craftAnswer(text, route, context) {
  if (!AI_ENABLED) {
    return buildFallbackAnswer(text, route, context);
  }

  const tools = context?.tools ?? {};
  const hasAnyToolHit = (
    (Array.isArray(tools.invoices) && tools.invoices.length > 0)
    || (Array.isArray(tools.campaigns) && tools.campaigns.length > 0)
    || (Array.isArray(tools.knowledgeDocs) && tools.knowledgeDocs.length > 0)
    || Boolean(tools.conversation)
    || (Array.isArray(tools.recentSuggestions) && tools.recentSuggestions.length > 0)
  );

  try {
    const content = await aiChat({
      temperature: route?.human_required ? 0.2 : 0.4,
      messages: [
          { role: "system", content: buildAgentPrompt(route, context) },
          {
            role: "user",
            content: JSON.stringify({
              message: text,
              instruction: hasAnyToolHit
                ? "Des resultats d'outils metier reels (factures, campagnes, conversation, docs connaissance) sont joints dans le contexte systeme. Base ta reponse exclusivement sur ces donnees reelles. Si une info manque malgre les outils, pose uniquement la question minimale."
                : "Aucun resultat d'outil metier n'est attache a cette requete. Si la reponse depend de donnees metier dynamiques (factures, livraison, stock, campagnes), dis que tu ne peux pas confirmer et pose uniquement la question minimale.",
              tools_attached: hasAnyToolHit ? {
                invoices_count: Array.isArray(tools.invoices) ? tools.invoices.length : 0,
                campaigns_count: Array.isArray(tools.campaigns) ? tools.campaigns.length : 0,
                knowledge_count: Array.isArray(tools.knowledgeDocs) ? tools.knowledgeDocs.length : 0,
                has_conversation: Boolean(tools.conversation),
                suggestions_count: Array.isArray(tools.recentSuggestions) ? tools.recentSuggestions.length : 0,
              } : null,
            })
          }
        ]
    });
    return content || buildFallbackAnswer(text, route, context);
  } catch (e) {
    logger.warn({ err: e }, "AI answer generation failed, using fallback");
    return buildFallbackAnswer(text, route, context);
  }
}
