/**
 * db.ts — couche d'accès Supabase (backend réel MiraFlow AI).
 *
 * Règles :
 *  - organization_id est TOUJOURS résolu côté client depuis la session auth
 *    (auth.uid() → organization_members → organizations), jamais passé
 *    librement par un composant.
 *  - Chaque helper retourne { data, error } — jamais d'exception non capturée.
 *  - Les écritures passent par une file d'attente avec retry (backoff
 *    exponentiel, 4 tentatives) pour absorber les erreurs réseau transitoires.
 *  - Colonnes legacy NOT NULL encore présentes en base (messages.org_id,
 *    messages.direction, messages.sender_type, messages.body) sont remplies
 *    avec les mêmes valeurs que les colonnes nouvelles.
 */
import { supabase } from "./supabase";
import type {
  AgentPromptVersion, AiAgent, Conversation, Customer, Delivery, KbDoc,
  Message, Order, Product, QrSession,
} from "./sim/store";
import type { User } from "@supabase/supabase-js";

export interface DbResult<T> {
  data: T | null;
  error: string | null;
}

const ok = <T>(data: T): DbResult<T> => ({ data, error: null });
const fail = <T>(error: unknown): DbResult<T> => ({
  data: null,
  error: error instanceof Error ? error.message : String(error ?? "Erreur inconnue"),
});

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | undefined | null): v is string => !!v && UUID_RE.test(v);

/* ── Contexte organisation (résolu depuis auth, jamais depuis l'UI) ────── */

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  country: string | null;
  currency: string | null;
  trial_ends_at: string | null;
  mrr: number | null;
}

let currentOrgId: string | null = null;
let currentOrgRole: string | null = null;

export function getCloudOrgId(): string | null {
  return currentOrgId;
}
export function getCloudOrgRole(): string | null {
  return currentOrgRole;
}
/** Mode cloud actif : les nouveaux ids du store sont des UUID compatibles DB. */
export function isCloudActive(): boolean {
  return currentOrgId !== null;
}
export function clearCloudContext(): void {
  currentOrgId = null;
  currentOrgRole = null;
}

export async function getAuthUser(): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Résout l'organisation de l'utilisateur connecté :
 * auth.uid() → organization_members → organizations.
 * Met à jour le contexte cloud (orgId + rôle) en cas de succès.
 */
export async function resolveOrganization(): Promise<DbResult<OrgRow>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("not-authenticated");
    const { data: member, error: mErr } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (mErr) return fail(mErr.message);
    if (!member) return fail("no-organization");
    const { data: org, error: oErr } = await supabase
      .from("organizations")
      .select("id, name, slug, plan, status, country, currency, trial_ends_at, mrr")
      .eq("id", member.organization_id)
      .single();
    if (oErr || !org) return fail(oErr?.message ?? "organization-not-found");
    currentOrgId = org.id as string;
    currentOrgRole = (member.role as string) ?? null;
    return ok(org as OrgRow);
  } catch (e) {
    return fail(e);
  }
}

/* ── File d'écriture avec retry (best effort, erreurs réseau) ──────────── */

type WriteOp = () => Promise<string | null>; // null = succès, sinon message d'erreur

interface QueuedWrite {
  op: WriteOp;
  attempts: number;
  label: string;
}

const writeQueue: QueuedWrite[] = [];
const MAX_ATTEMPTS = 4;
let flushing = false;
let lastWriteError: string | null = null;
const writeErrorListeners = new Set<(msg: string | null) => void>();

export function getLastWriteError(): string | null {
  return lastWriteError;
}
export function onWriteError(listener: (msg: string | null) => void): () => void {
  writeErrorListeners.add(listener);
  return () => writeErrorListeners.delete(listener);
}
function setLastWriteError(msg: string | null) {
  lastWriteError = msg;
  for (const fn of writeErrorListeners) fn(msg);
}

/** Enfile une écriture cloud best-effort avec retry (backoff exponentiel). */
export function enqueueWrite(label: string, op: WriteOp): void {
  writeQueue.push({ op, attempts: 0, label });
  void flushWrites();
}

async function flushWrites(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (writeQueue.length > 0) {
      const item = writeQueue[0];
      let err: string | null = null;
      try {
        err = await item.op();
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
      }
      if (err === null) {
        writeQueue.shift();
        setLastWriteError(null);
        continue;
      }
      item.attempts += 1;
      if (item.attempts >= MAX_ATTEMPTS) {
        writeQueue.shift();
        setLastWriteError(`${item.label}: ${err}`);
        continue; // on abandonne cette écriture, on traite la suivante
      }
      setLastWriteError(`${item.label}: ${err} (retry ${item.attempts}/${MAX_ATTEMPTS})`);
      await new Promise((r) => setTimeout(r, 500 * 2 ** item.attempts));
    }
  } finally {
    flushing = false;
  }
}

/* ── CRUD génériques (organization_id injecté depuis le contexte auth) ─── */

export async function listRows<T = Record<string, unknown>>(
  table: string,
  orgId: string,
  orderBy = "created_at",
): Promise<DbResult<T[]>> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("organization_id", orgId)
      .order(orderBy, { ascending: false });
    if (error) return fail(error.message);
    return ok((data ?? []) as T[]);
  } catch (e) {
    return fail(e);
  }
}

export async function insertRow(
  table: string,
  row: Record<string, unknown>,
): Promise<string | null> {
  if (!currentOrgId) return "cloud-inactive";
  const { error } = await supabase
    .from(table)
    .insert({ ...row, organization_id: currentOrgId });
  return error ? error.message : null;
}

export async function updateRow(
  table: string,
  id: string,
  patch: Record<string, unknown>,
  matchColumn = "id",
): Promise<string | null> {
  if (!currentOrgId) return "cloud-inactive";
  const { error } = await supabase
    .from(table)
    .update(patch)
    .eq("organization_id", currentOrgId)
    .eq(matchColumn, id);
  return error ? error.message : null;
}

export async function deleteRow(
  table: string,
  id: string,
  matchColumn = "id",
): Promise<string | null> {
  if (!currentOrgId) return "cloud-inactive";
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("organization_id", currentOrgId)
    .eq(matchColumn, id);
  return error ? error.message : null;
}

/* ── Mappers store ↔ DB ────────────────────────────────────────────────── */

const toMs = (iso: string | null | undefined): number =>
  iso ? Date.parse(iso) : Date.now();
const toIso = (ms: number | null | undefined): string | null =>
  ms ? new Date(ms).toISOString() : null;

/* Produits (stock dans metadata, pas de colonne dédiée en base) */
export function productToRow(p: Product): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    description: p.description || null,
    sku: p.sku || null,
    price: p.price,
    active: p.active,
    updated_at: toIso(p.updatedAt),
    metadata: { stock: p.stock },
  };
}
export function productFromRow(r: Record<string, unknown>): Product {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    sku: String(r.sku ?? ""),
    price: Number(r.price ?? 0),
    stock: Number(meta.stock ?? 0),
    active: Boolean(r.active ?? true),
    createdAt: toMs(r.created_at as string),
    updatedAt: toMs(r.updated_at as string),
  };
}

/* Commandes : snapshot complet des lignes dans metadata.items + order_items */
export function orderToRow(o: Order): Record<string, unknown> {
  return {
    id: o.id,
    customer_id: isUuid(o.customerId) ? o.customerId : null,
    order_number: o.orderNumber,
    status: o.status,
    total: o.total,
    currency: o.currency || "TND",
    updated_at: toIso(o.updatedAt),
    metadata: { customer_name: o.customerName, items: o.items },
  };
}
export function orderItemsToRows(o: Order): Record<string, unknown>[] {
  return o.items.map((it) => ({
    order_id: o.id,
    product_id: isUuid(it.productId) ? it.productId : null,
    quantity: it.quantity,
    unit_price: it.unitPrice,
    total: it.quantity * it.unitPrice,
  }));
}
export function orderFromRow(r: Record<string, unknown>): Order {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const items = Array.isArray(meta.items) ? (meta.items as Order["items"]) : [];
  return {
    id: String(r.id),
    orderNumber: String(r.order_number ?? ""),
    customerId: (r.customer_id as string) ?? undefined,
    customerName: String(meta.customer_name ?? ""),
    status: (r.status as Order["status"]) ?? "pending",
    total: Number(r.total ?? 0),
    currency: String(r.currency ?? "TND"),
    items,
    createdAt: toMs(r.created_at as string),
    updatedAt: toMs(r.updated_at as string),
  };
}

/* Livraisons (adresse en jsonb) */
export function deliveryToRow(d: Delivery): Record<string, unknown> {
  return {
    id: d.id,
    order_id: d.orderId,
    status: d.status,
    driver_name: d.driverName || null,
    tracking_number: d.trackingNumber || null,
    eta_start: toIso(d.etaStart),
    eta_end: toIso(d.etaEnd),
    delivery_address: d.address ? { text: d.address } : null,
    updated_at: toIso(d.updatedAt),
  };
}
export function deliveryFromRow(r: Record<string, unknown>): Delivery {
  const addr = r.delivery_address as { text?: string } | string | null;
  return {
    id: String(r.id),
    orderId: String(r.order_id ?? ""),
    status: (r.status as Delivery["status"]) ?? "pending",
    driverName: String(r.driver_name ?? ""),
    trackingNumber: String(r.tracking_number ?? ""),
    etaStart: r.eta_start ? toMs(r.eta_start as string) : undefined,
    etaEnd: r.eta_end ? toMs(r.eta_end as string) : undefined,
    address: typeof addr === "string" ? addr : (addr?.text ?? ""),
    createdAt: toMs(r.created_at as string),
    updatedAt: toMs(r.updated_at as string),
  };
}

/* Clients */
export function customerToRow(c: Customer): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name || null,
    phone: c.phone || null,
    preferred_language: c.preferredLang,
    tags: c.tags,
    updated_at: toIso(c.updatedAt),
    metadata: { memory: c.memory },
  };
}
export function customerFromRow(r: Record<string, unknown>): Customer {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    phone: String(r.phone ?? ""),
    preferredLang: (r.preferred_language as Customer["preferredLang"]) ?? "fr",
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    memory: String(meta.memory ?? ""),
    createdAt: toMs(r.created_at as string),
    updatedAt: toMs(r.updated_at as string),
  };
}

/* Base de connaissances */
export function kbDocToRow(d: KbDoc): Record<string, unknown> {
  return {
    id: d.id,
    title: d.title || null,
    content: d.content,
    content_type: d.kind,
    source: d.source || null,
    updated_at: toIso(d.updatedAt),
    metadata: { chunks: d.chunks },
  };
}
export function kbDocFromRow(r: Record<string, unknown>): KbDoc {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const content = String(r.content ?? "");
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    content,
    kind: (r.content_type as KbDoc["kind"]) ?? "text",
    source: String(r.source ?? ""),
    chunks: Number(meta.chunks ?? Math.max(1, Math.ceil(content.length / 450))),
    createdAt: toMs(r.created_at as string),
    updatedAt: toMs(r.updated_at as string),
  };
}

/* Agents IA (config jsonb + versions de prompt dans agent_prompts) */
export function agentToRow(a: AiAgent): Record<string, unknown> {
  return {
    ...(isUuid(a.id) ? { id: a.id } : {}),
    name: a.name,
    agent_type: a.agentType ?? "support",
    model: a.model ?? "qwen3:8b",
    temperature: a.temperature ?? 0.2,
    enabled: a.enabled ?? true,
    updated_at: new Date().toISOString(),
    config: {
      key: a.key ?? a.id,
      tagline: a.tagline,
      mode: a.mode,
      confidence: a.confidence,
      handled: a.handled,
      thresholds: a.thresholds,
      languages: a.languages,
      sessionIds: a.sessionIds,
      stats: a.stats,
    },
  };
}
export function agentFromRow(
  r: Record<string, unknown>,
  prompts: AgentPromptVersion[] = [],
): AiAgent {
  const cfg = (r.config ?? {}) as Record<string, unknown>;
  const sorted = [...prompts].sort((a, b) => a.version - b.version);
  const active = sorted[sorted.length - 1];
  return {
    id: String(r.id),
    key: (cfg.key as string) ?? undefined,
    name: String(r.name ?? ""),
    tagline: String(cfg.tagline ?? ""),
    mode: (cfg.mode as AiAgent["mode"]) ?? "suggestion",
    confidence: Number(cfg.confidence ?? 0),
    handled: Number(cfg.handled ?? 0),
    agentType: r.agent_type as AiAgent["agentType"],
    enabled: Boolean(r.enabled ?? true),
    model: String(r.model ?? "qwen3:8b"),
    temperature: Number(r.temperature ?? 0.2),
    thresholds: cfg.thresholds as AiAgent["thresholds"],
    languages: cfg.languages as AiAgent["languages"],
    sessionIds: Array.isArray(cfg.sessionIds) ? (cfg.sessionIds as string[]) : [],
    systemPrompt: active?.systemPrompt,
    promptVersions: sorted,
    stats: cfg.stats as AiAgent["stats"],
  };
}

/* Sessions WhatsApp : l'id applicatif (bridge) est conservé dans
 * session_reference ; l'id DB reste un UUID généré. */
export function sessionToRow(s: QrSession): Record<string, unknown> {
  return {
    name: s.name,
    status: s.status,
    phone_number: s.phone || null,
    session_reference: s.id,
    connected_at: toIso(s.connectedAt),
    updated_at: new Date().toISOString(),
  };
}
export function sessionFromRow(r: Record<string, unknown>): QrSession {
  return {
    id: String(r.session_reference ?? r.id),
    name: String(r.name ?? ""),
    type: undefined,
    status: (r.status as QrSession["status"]) ?? "disconnected",
    uptime: 0,
    latencyMs: 0,
    phone: String(r.phone_number ?? ""),
    connectedAt: r.connected_at ? toMs(r.connected_at as string) : undefined,
  };
}

/* Conversations + messages (colonnes legacy remplies à l'identique) */
export function messageToRow(
  m: Message,
  orgId: string,
  sessionId?: string,
): Record<string, unknown> {
  return {
    ...(isUuid(m.id) ? { id: m.id } : {}),
    conversation_id: m.conversationId,
    organization_id: orgId,
    org_id: orgId, // colonne legacy NOT NULL
    direction: m.direction, // enum msg_direction NOT NULL
    sender_type: m.direction === "in" ? "customer" : "user",
    type: m.kind,
    message_type: m.kind,
    body: m.body,
    content: m.body,
    status: m.status,
    media_url: m.mediaUrl ?? null,
    whatsapp_session_id: isUuid(sessionId) ? sessionId : null,
    created_at: toIso(m.at),
  };
}
export function messageFromRow(r: Record<string, unknown>): Message {
  return {
    id: String(r.id),
    conversationId: String(r.conversation_id),
    direction: (r.direction as Message["direction"]) ?? "in",
    body: String(r.content ?? r.body ?? ""),
    at: toMs(r.created_at as string),
    status: (r.status as Message["status"]) ?? "sent",
    kind: (r.message_type ?? r.type) === "image" ? "image" : "text",
    mediaUrl: (r.media_url as string) ?? undefined,
  };
}
export function conversationFromRow(
  r: Record<string, unknown>,
  thread: Message[],
): Conversation {
  return {
    id: String(r.id),
    contactId: String(r.customer_id ?? r.contact_id ?? ""),
    status: (r.status as Conversation["status"]) ?? "new",
    unread: Number(r.unread_count ?? 0),
    assigneeId: (r.assigned_user_id as string) ?? undefined,
    sessionId: String(r.whatsapp_session_id ?? r.session_id ?? ""),
    thread,
    lastMessageAt: r.last_message_at ? toMs(r.last_message_at as string) : undefined,
  };
}
