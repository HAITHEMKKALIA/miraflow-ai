/**
 * bridge.ts — client du serveur bridge WhatsApp (Baileys, voir bridge/).
 *
 * L'URL du bridge provient de `import.meta.env.VITE_BRIDGE_URL` (build) ou,
 * à défaut, de `localStorage["mf:bridge-url"]` (renseignable dans
 * Paramètres → Sessions). Toutes les fonctions sont sans-throw : elles
 * renvoient `null` ou un objet d'erreur en cas de bridge injoignable.
 */

export type BridgeStatus = "qr_pending" | "connecting" | "connected" | "disconnected";

export interface BridgePoll {
  status: BridgeStatus;
  qr?: string; // dataURL PNG du QR réel
  phone?: string;
  pushname?: string;
}

export interface BridgeSendResult {
  ok: boolean;
  id: string | null;
  to: string;
  status: "sent";
  at: number;
}

export interface BridgeMessageEvent {
  id: string;
  type: "message";
  direction: "in" | "out";
  sessionId: string;
  from: string;
  to: string;
  body: string;
  pushName?: string;
  at: number;
}

export interface BridgePersistContactInput {
  orgName: string;
  contact: {
    id?: string;
    name: string;
    phone: string;
    city?: string;
    tags?: string[];
    score?: number;
    stage?: string;
    consent?: boolean;
  };
}

export interface BridgePersistMessageInput {
  orgName: string;
  sessionId: string;
  sessionName?: string;
  sessionPhone?: string;
  sessionStatus?: BridgeStatus | "unstable";
  contact: {
    id?: string;
    name: string;
    phone: string;
    city?: string;
    tags?: string[];
    score?: number;
    stage?: string;
    consent?: boolean;
  };
  message: {
    direction: "in" | "out";
    body: string;
    at: number;
    status?: string;
  };
}

export interface BridgePersistSessionInput {
  orgName: string;
  sessionId: string;
  sessionName?: string;
  sessionPhone?: string;
  sessionStatus?: BridgeStatus | "unstable";
  sessionType?: string;
}

export interface BridgePersistCampaignInput {
  orgName: string;
  campaign: {
    remoteId?: string;
    name: string;
    goal: string;
    status: string;
    audience: string;
    total: number;
    sent: number;
    delivered: number;
    replies: number;
    failed: number;
    unsubscribed: number;
    ratePerMin: number;
    content?: string;
    mediaUrl?: string;
    scheduledAt?: number;
    timezone?: string;
    windowStart?: number;
    windowEnd?: number;
    followUpOn?: boolean;
    followUpMsg?: string;
    stopOnReply?: boolean;
    needsReview?: boolean;
    recipientIds?: string[];
    segments?: string[];
    manualIds?: string[];
    bridgeSessionId?: string;
    dispatchCursor?: number;
  };
}

export interface BridgeRuntimeSession {
  id: string;
  rawId: string | null;
  bridgeId: string | null;
  name: string;
  type?: string;
  status: BridgeStatus | "unstable";
  latencyMs: number;
  uptime: number;
  phone: string;
  connectedAt?: number;
}

export interface BridgeRuntimeContact {
  id: string;
  name: string;
  phone: string;
  city: string;
  tags: string[];
  score: number;
  stage: "prospect" | "interested" | "client" | "loyal" | "lost";
  consent: boolean;
  lastContactAt: number;
}

export interface BridgeRuntimeMessage {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  body: string;
  at: number;
  status: string;
  kind: "text";
}

export interface BridgeRuntimeConversation {
  id: string;
  contactId: string;
  status: "new" | "open" | "pending" | "resolved" | "archived";
  unread: number;
  sessionId: string;
  thread: BridgeRuntimeMessage[];
}

// BUG FIX #5: Nouveaux types pour agents et suggestions AI renvoyés par le bootstrap runtime
export interface BridgeRuntimeAgent {
  id: string;
  key: string;
  name: string;
  tagline: string;
  mode: "suggestion" | "autonomous";
  threshold: number;
  active: boolean;
  confidence: number;
  handled: number;
  config?: Record<string, any>;
}

export interface BridgeRuntimeSuggestion {
  id: string;
  conversationId: string | null;
  agentId: string | null;
  text: string;
  confidence: number;
  status: "pending" | "accepted" | "rejected";
  at: number;
  meta?: Record<string, any> | null;
}

export interface BridgeRuntimeBootstrap {
  ok: boolean;
  reason?: string;
  sessions?: BridgeRuntimeSession[];
  contacts?: BridgeRuntimeContact[];
  conversations?: BridgeRuntimeConversation[];
  campaigns?: BridgeRuntimeCampaign[];
  agents?: BridgeRuntimeAgent[];
  suggestions?: BridgeRuntimeSuggestion[];
  messagesToday?: number;
}

export interface BridgeRuntimeCampaign {
  id: string;
  remoteId: string;
  name: string;
  status: "draft" | "scheduled" | "running" | "paused" | "done" | "stopped" | "review";
  audience: string;
  total: number;
  sent: number;
  delivered: number;
  replies: number;
  failed: number;
  unsubscribed: number;
  scheduledAt?: number;
  mediaUrl?: string;
  goal: "promotion" | "relance" | "annonce" | "fidelisation";
  ratePerMin: number;
  content?: string;
  followUpOn?: boolean;
  followUpMsg?: string;
  stopOnReply?: boolean;
  recipientIds?: string[];
  bridgeSessionId?: string;
  dispatchCursor?: number;
}

const LS_KEY = "mf:bridge-url";

function normalizeBridgeUrl(value?: string): string {
  return (value ?? "")
    .trim()
    .replace(/\/+(health|sessions(?:\/.*)?)$/i, "")
    .replace(/\/+$/, "");
}

function defaultBridgeUrl(): string {
  if (typeof window === "undefined") return "";
  const { protocol, hostname } = window.location;
  if (!hostname) return "";
  const scheme = protocol === "https:" ? "https:" : "http:";
  return `${scheme}//${hostname}:3100`;
}

function bridgeCandidates(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value?: string) => {
    const clean = normalizeBridgeUrl(value);
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  const fromEnv = (import.meta.env.VITE_BRIDGE_URL as string | undefined)?.trim();
  push(fromEnv);

  try {
    push(localStorage.getItem(LS_KEY) ?? "");
  } catch {
    /* stockage indisponible */
  }

  push(defaultBridgeUrl());
  push("http://127.0.0.1:3100");
  push("http://localhost:3100");

  return out;
}

/** URL du bridge : env de build prioritaire, sinon localStorage. */
export function getBridgeUrl(): string {
  const fromEnv = normalizeBridgeUrl(import.meta.env.VITE_BRIDGE_URL as string | undefined);
  if (fromEnv) return fromEnv;
  try {
    const fromStorage = normalizeBridgeUrl(localStorage.getItem(LS_KEY) ?? "");
    return fromStorage || defaultBridgeUrl();
  } catch {
    return defaultBridgeUrl();
  }
}

export async function getBridgeAvatarUrl(sessionId: string, phone: string): Promise<string | null> {
  if (!sessionId || !phone) return null;
  const baseUrl = getBridgeUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionId)}/contacts/${encodeURIComponent(phone)}/avatar`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

/** Persiste l'URL saisie dans Paramètres (vide = supprimer). */
export function setBridgeUrl(url: string) {
  try {
    const clean = normalizeBridgeUrl(url);
    if (clean) localStorage.setItem(LS_KEY, clean);
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* stockage indisponible — silencieux */
  }
}

export function isBridgeConfigured(): boolean {
  return getBridgeUrl().length > 0;
}

async function req<T>(path: string, init?: RequestInit): Promise<T | null> {
  const candidates = bridgeCandidates();
  if (candidates.length === 0) return null;

  for (const base of candidates) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) return null;
        continue;
      }
      return (await res.json()) as T;
    } catch {
      /* essaie l'URL suivante */
    }
  }

  return null;
}

/** true si le bridge répond à /health. */
export async function bridgeHealth(): Promise<boolean> {
  const out = await req<{ ok?: boolean }>("/health");
  return out?.ok === true;
}

/** Démarre une session côté bridge (QR à venir via pollSession). */
export async function createSession(id: string): Promise<{ status: BridgeStatus } | null> {
  return req<{ status: BridgeStatus }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ sessionId: id }),
  });
}

/** Poll combiné : statut + QR courant + numéro une fois connecté. */
export async function pollSession(id: string): Promise<BridgePoll | null> {
  return req<BridgePoll>(`/sessions/${encodeURIComponent(id)}/qr`);
}

/** Statut seul (avec pushname une fois connecté). */
export async function sessionStatus(id: string): Promise<BridgePoll | null> {
  return req<BridgePoll>(`/sessions/${encodeURIComponent(id)}/status`);
}

/** Déconnexion propre + suppression de l'auth state côté bridge. */
export async function logoutSession(id: string): Promise<boolean> {
  const out = await req<{ status: BridgeStatus }>(`/sessions/${encodeURIComponent(id)}/logout`, {
    method: "POST",
    body: "{}",
  });
  return out?.status === "disconnected";
}

/** Envoie un message texte réel via une session WhatsApp connectée. */
export async function sendBridgeMessage(sessionId: string, to: string, text: string): Promise<BridgeSendResult | null> {
  return req<BridgeSendResult>(`/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ to, text }),
  });
}

/** Lit les événements bridge mémorisés depuis un instant donné. */
export async function pollBridgeEvents(sessionId: string, since = 0): Promise<BridgeMessageEvent[] | null> {
  const out = await req<{ events?: BridgeMessageEvent[] }>(
    `/sessions/${encodeURIComponent(sessionId)}/events?since=${encodeURIComponent(String(since))}`,
  );
  return out?.events ?? null;
}

/** Persiste un contact runtime côté backend bridge -> Supabase. */
export async function persistBridgeContact(input: BridgePersistContactInput): Promise<boolean> {
  const out = await req<{ ok?: boolean }>("/runtime/contacts", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return out?.ok === true;
}

/** Persiste une session QR runtime côté backend bridge -> Supabase. */
export async function persistBridgeSession(input: BridgePersistSessionInput): Promise<boolean> {
  const out = await req<{ ok?: boolean }>("/runtime/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return out?.ok === true;
}

/** Persiste un message runtime côté backend bridge -> Supabase. */
export async function persistBridgeMessage(input: BridgePersistMessageInput): Promise<boolean> {
  const out = await req<{ ok?: boolean }>("/runtime/messages", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return out?.ok === true;
}

/** Persiste une campagne runtime côté backend bridge -> Supabase. */
export async function persistBridgeCampaign(input: BridgePersistCampaignInput): Promise<string | null> {
  const out = await req<{ ok?: boolean; id?: string }>("/runtime/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return out?.ok && typeof out.id === "string" ? out.id : null;
}

/** Charge l'état runtime réel (sessions, contacts, conversations) depuis le bridge. */
export async function fetchBridgeRuntimeBootstrap(orgName: string): Promise<BridgeRuntimeBootstrap | null> {
  return req<BridgeRuntimeBootstrap>("/runtime/bootstrap", {
    method: "POST",
    body: JSON.stringify({ orgName }),
  });
}

/** Supprime une session persistée depuis le backend supabase. */
export async function deleteBridgeSession(id: string): Promise<boolean> {
  const out = await req<{ ok?: boolean }>(`/runtime/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return out?.ok === true;
}

/** Supprime une conversation persistée depuis le backend supabase. */
export async function deleteBridgeConversation(id: string): Promise<boolean> {
  const out = await req<{ ok?: boolean }>(`/runtime/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return out?.ok === true;
}

/** Supprime une campagne persistée depuis le backend supabase. */
export async function deleteBridgeCampaign(id: string): Promise<boolean> {
  const out = await req<{ ok?: boolean }>(`/runtime/campaigns/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return out?.ok === true;
}


