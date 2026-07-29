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

const LS_KEY = "mf:bridge-url";

/** URL du bridge : env de build prioritaire, sinon localStorage. */
export function getBridgeUrl(): string {
  const fromEnv = (import.meta.env.VITE_BRIDGE_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  try {
    return (localStorage.getItem(LS_KEY) ?? "").trim().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/** Persiste l'URL saisie dans Paramètres (vide = supprimer). */
export function setBridgeUrl(url: string) {
  try {
    const clean = url.trim().replace(/\/+$/, "");
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
  const base = getBridgeUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
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
