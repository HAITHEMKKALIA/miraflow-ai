/**
 * Moteur IA MiraFlow — Groq (API compatible OpenAI) + fallback Gemini.
 *
 * chatCompletion() appelle https://api.groq.com/openai/v1/chat/completions
 * avec la clé du store (aiSettings.groqApiKey). En cas d'erreur 429 / quota
 * ET geminiApiKey configurée, fallback automatique sur Gemini generateContent.
 *
 * Jamais de throw non capturé : toujours { ok, text?, error? }.
 */
import { useSim, DEFAULT_AI_SETTINGS, type AiAgent, type AiProvider } from "./sim/store";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionArgs {
  messages: ChatMessage[];
  /** Override du fournisseur : 'default'/absent → aiSettings.provider. */
  provider?: "default" | AiProvider;
  model?: string;
  temperature?: number;
  /** true → response_format: json_object (le prompt doit demander du JSON). */
  json?: boolean;
  /** Limite de tokens de sortie (défaut : sans limite explicite). */
  maxTokens?: number;
}

export type ChatCompletionResult =
  | { ok: true; text: string; provider: "groq" | "gemini" | "ollama" }
  | { ok: false; error: string };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

function getSettings() {
  return useSim.getState().aiSettings ?? DEFAULT_AI_SETTINGS;
}

/**
 * Retire les blocs de raisonnement privé du modèle (`<think>…</think>`,
 * `<thinking>…</thinking>`), y compris un bloc non fermé en fin de chaîne,
 * puis trim. Garantit que le texte exposé ne contient jamais de raisonnement.
 */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .replace(/<think(?:ing)?>[\s\S]*$/gi, "")
    .trim();
}

/**
 * Extrait le premier objet JSON `{...}` équilibré d'une réponse LLM.
 * Tolère un préambule (raisonnement résiduel, texte libre) avant le JSON.
 * Retourne null si aucun objet JSON valide n'est trouvé.
 */
export function extractJsonObject<T = unknown>(text: string): T | null {
  const cleaned = stripReasoning(text);
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function isQuotaError(status: number, body: string): boolean {
  if (status === 429) return true;
  return /quota|rate.?limit|insufficient/i.test(body);
}

async function callGroq(args: ChatCompletionArgs): Promise<{ ok: boolean; text?: string; error?: string; quota?: boolean }> {
  const s = getSettings();
  const apiKey = s.groqApiKey?.trim();
  if (!apiKey) return { ok: false, error: "Clé API Groq manquante (Réglages → IA)." };
  const model = args.model?.trim() || s.groqModel || DEFAULT_AI_SETTINGS.groqModel;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: args.messages,
        temperature: args.temperature ?? 0.3,
        ...(args.maxTokens ? { max_tokens: args.maxTokens } : {}),
        ...(args.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Groq ${res.status}: ${raw.slice(0, 300)}`, quota: isQuotaError(res.status, raw) };
    }
    try {
      const data = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) return { ok: false, error: "Réponse Groq vide." };
      return { ok: true, text };
    } catch {
      return { ok: false, error: "Réponse Groq illisible (JSON invalide)." };
    }
  } catch (e) {
    return { ok: false, error: `Réseau Groq : ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Appel Ollama local via son endpoint compatible OpenAI (pas de clé requise). */
async function callOllama(args: ChatCompletionArgs): Promise<{ ok: boolean; text?: string; error?: string }> {
  const s = getSettings();
  const baseUrl = (s.ollamaBaseUrl?.trim() || DEFAULT_AI_SETTINGS.ollamaBaseUrl).replace(/\/+$/, "");
  const model = args.model?.trim() || s.ollamaModel || DEFAULT_AI_SETTINGS.ollamaModel;
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: args.messages,
        temperature: args.temperature ?? 0.3,
        stream: false,
        // Désactive le raisonnement des modèles « thinking » (ex. qwen3) sur
        // Ollama récent. Ignoré sans effet par les versions/modèles qui ne le
        // supportent pas — stripReasoning() reste la garantie côté client.
        think: false,
        ...(args.maxTokens ? { max_tokens: args.maxTokens } : {}),
        ...(args.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Ollama ${res.status}: ${raw.slice(0, 300)}` };
    }
    try {
      const data = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) return { ok: false, error: "Réponse Ollama vide." };
      return { ok: true, text };
    } catch {
      return { ok: false, error: "Réponse Ollama illisible (JSON invalide)." };
    }
  } catch (e) {
    return { ok: false, error: `Ollama injoignable sur ${baseUrl} : ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function callGemini(args: ChatCompletionArgs): Promise<{ ok: boolean; text?: string; error?: string }> {
  const s = getSettings();
  const apiKey = s.geminiApiKey?.trim();
  if (!apiKey) return { ok: false, error: "Clé API Gemini manquante." };
  const model = s.geminiModel?.trim() || DEFAULT_AI_SETTINGS.geminiModel;

  const system = args.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = args.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  try {
    const res = await fetch(GEMINI_URL(model, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: {
          temperature: args.temperature ?? 0.3,
          ...(args.maxTokens ? { maxOutputTokens: args.maxTokens } : {}),
          ...(args.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });

    const raw = await res.text();
    if (!res.ok) return { ok: false, error: `Gemini ${res.status}: ${raw.slice(0, 300)}` };
    try {
      const data = JSON.parse(raw) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) return { ok: false, error: "Réponse Gemini vide." };
      return { ok: true, text };
    } catch {
      return { ok: false, error: "Réponse Gemini illisible (JSON invalide)." };
    }
  } catch (e) {
    return { ok: false, error: `Réseau Gemini : ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function chatCompletion(args: ChatCompletionArgs): Promise<ChatCompletionResult> {
  const s = getSettings();
  const resolved: AiProvider = !args.provider || args.provider === "default" ? s.provider : args.provider;

  if (resolved === "ollama") {
    const ol = await callOllama(args);
    if (ol.ok) return { ok: true, text: stripReasoning(ol.text!), provider: "ollama" };
    return { ok: false, error: ol.error ?? "Erreur Ollama inconnue" };
  }

  const groq = await callGroq(args);
  if (groq.ok) return { ok: true, text: stripReasoning(groq.text!), provider: "groq" };

  // Fallback Gemini uniquement sur erreur quota/429 et si une clé est configurée.
  if (groq.quota && s.geminiApiKey?.trim()) {
    const gem = await callGemini(args);
    if (gem.ok) return { ok: true, text: stripReasoning(gem.text!), provider: "gemini" };
    return { ok: false, error: `${groq.error} · Fallback Gemini : ${gem.error}` };
  }
  return { ok: false, error: groq.error ?? "Erreur Groq inconnue" };
}

/** Moteur effectif d'un agent : provider résolu + modèle effectif. */
export interface AgentEngine {
  provider: AiProvider;
  model: string;
  /** true si l'agent a un provider explicite (groq/ollama), false = suit les réglages globaux. */
  overridden: boolean;
}

/** Résout le moteur effectif d'un agent à partir de son provider/model et des réglages globaux. */
export function resolveAgentEngine(agent: Pick<AiAgent, "provider" | "model">): AgentEngine {
  const s = getSettings();
  const overridden = agent.provider === "groq" || agent.provider === "ollama";
  const provider: AiProvider = overridden ? (agent.provider as AiProvider) : s.provider;
  const model =
    agent.model?.trim() ||
    (provider === "ollama"
      ? s.ollamaModel || DEFAULT_AI_SETTINGS.ollamaModel
      : s.groqModel || DEFAULT_AI_SETTINGS.groqModel);
  return { provider, model, overridden };
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  provider?: "groq" | "gemini" | "ollama";
}

/** Appel 1-token pour valider la clé Groq (et mesurer la latence). */
export async function testConnection(): Promise<TestConnectionResult> {
  const started = performance.now();
  const res = await chatCompletion({
    messages: [{ role: "user", content: "ping" }],
    temperature: 0,
    maxTokens: 1,
  });
  const latencyMs = Math.round(performance.now() - started);
  if (res.ok) return { ok: true, latencyMs, provider: res.provider };
  return { ok: false, latencyMs, error: res.error };
}
