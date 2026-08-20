/**
 * cloud.ts — couche cloud Supabase : bootstrap, hydratation du store et
 * file d'écriture persistante (avec retry + backoff) entre l'app et la base.
 *
 * Règles :
 *  - Chaque helper retourne { data, error } ou void — jamais d'exception non capturée.
 *  - Écritures asynchrones persistées dans localStorage (mf:cloud-writes) : si
 *    le navigateur se ferme, elles seront relancées au prochain démarrage.
 *  - Hydratation déclenchée par AuthGate après connexion (email/OAuth) puis
 *    périodiquement.
 */
import { useEffect, useState } from "react";
import { getAuthUser, isSupabaseReady } from "./supabase";
import {
  agentFromRow, agentToRow, clearCloudContext, conversationFromRow,
  customerFromRow, customerToRow, deliveryFromRow, deliveryToRow, enqueueWrite,
  isCloudActive, isUuid, kbDocFromRow, kbDocToRow, messageFromRow, messageToRow,
  orderFromRow, orderItemsToRows, orderToRow, productFromRow, productToRow,
  resolveOrganization, sessionFromRow, sessionToRow, getCloudOrgId, type OrgRow,
} from "./db";
import {
  useSim, type AiAgent, type Conversation, type Customer, type Delivery,
  type KbDoc, type Message, type Order, type Product, type QrSession,
  type Subscription, type TeamMember, PLAN_LABELS, type PlanId,
} from "./sim/store";
import { supabase } from "./supabase";

export interface CloudResult<T> {
  data: T | null;
  error: string | null;
}
const ok = <T,>(data: T): CloudResult<T> => ({ data, error: null });
const fail = <T,>(error: unknown): CloudResult<T> => ({
  data: null,
  error: error instanceof Error ? error.message : String(error ?? "Erreur inconnue"),
});

/* ════════════════════════════════════════════════════════════════════════
   File d'écriture persistante (localStorage)
   ════════════════════════════════════════════════════════════════════════ */

const WRITE_QUEUE_KEY = "mf:cloud-writes";
const MAX_ATTEMPTS = 5;

interface PersistedWrite {
  id: string;
  table: string;
  action: "insert" | "update" | "delete" | "rpc";
  payload: Record<string, unknown>;
  matchColumn?: string;
  matchValue?: string;
  rpcName?: string;
  rpcArgs?: Record<string, unknown>;
  label: string;
  attempts: number;
  enqueuedAt: number;
}

function readQueue(): PersistedWrite[] {
  try {
    const raw = localStorage.getItem(WRITE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PersistedWrite[]) : [];
  } catch {
    return [];
  }
}
function writeQueue(items: PersistedWrite[]) {
  try {
    localStorage.setItem(WRITE_QUEUE_KEY, JSON.stringify(items));
  } catch { /* quota dépassé — on abandonne */ }
}

let writeFlushing = false;

export async function flushPersistedWrites(): Promise<number> {
  if (writeFlushing || !isCloudActive()) return 0;
  writeFlushing = true;
  let flushed = 0;
  try {
    let queue = readQueue();
    while (queue.length > 0) {
      const item = queue[0];
      let err: string | null = null;
      try {
        err = await executeWrite(item);
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
      }
      if (err === null) {
        queue.shift();
        flushed += 1;
        writeQueue(queue);
        continue;
      }
      item.attempts += 1;
      if (item.attempts >= MAX_ATTEMPTS) {
        console.warn(`[cloud] Écriture abandonnée après ${MAX_ATTEMPTS} tentatives :`, item.label, err);
        queue.shift();
        writeQueue(queue);
        continue;
      }
      writeQueue(queue);
      await new Promise((r) => setTimeout(r, 600 * 2 ** item.attempts));
    }
  } finally {
    writeFlushing = false;
  }
  return flushed;
}

async function executeWrite(item: PersistedWrite): Promise<string | null> {
  const orgId = getCloudOrgId();
  if (!orgId) return "cloud-inactive";
  if (item.action === "rpc" && item.rpcName) {
    const { error } = await supabase.rpc(item.rpcName, item.rpcArgs ?? {});
    return error ? error.message : null;
  }
  const table = item.table;
  const payload = { ...item.payload, organization_id: orgId };
  if (item.action === "insert") {
    const { error } = await supabase.from(table).insert(payload);
    return error ? error.message : null;
  }
  if (item.action === "update") {
    const { error } = await supabase
      .from(table)
      .update(payload)
      .eq("organization_id", orgId)
      .eq(item.matchColumn ?? "id", item.matchValue ?? "");
    return error ? error.message : null;
  }
  if (item.action === "delete") {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("organization_id", orgId)
      .eq(item.matchColumn ?? "id", item.matchValue ?? "");
    return error ? error.message : null;
  }
  return "unknown-action";
}

/** Enfile une écriture cloud persistée (survit à un rechargement). */
export function persistWrite(
  label: string,
  table: string,
  action: PersistedWrite["action"],
  payload: Record<string, unknown>,
  opts?: { matchColumn?: string; matchValue?: string; rpcName?: string; rpcArgs?: Record<string, unknown> },
): void {
  if (!isCloudActive()) return;
  const item: PersistedWrite = {
    id: `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    table,
    action,
    payload,
    matchColumn: opts?.matchColumn,
    matchValue: opts?.matchValue,
    rpcName: opts?.rpcName,
    rpcArgs: opts?.rpcArgs,
    label,
    attempts: 0,
    enqueuedAt: Date.now(),
  };
  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);
  void flushPersistedWrites();
}

/* ════════════════════════════════════════════════════════════════════════
   Statut cloud (React)
   ════════════════════════════════════════════════════════════════════════ */

type CloudStatus = "local" | "loading" | "ready" | "error";
interface CloudState {
  status: CloudStatus;
  error: string | null;
  /** org.id quand prête */
  orgId: string | null;
}

let cloudState: CloudState = { status: "local", error: null, orgId: null };
const cloudListeners = new Set<(s: CloudState) => void>();
function setCloudState(patch: Partial<CloudState>) {
  cloudState = { ...cloudState, ...patch };
  for (const fn of cloudListeners) fn(cloudState);
}

export function useCloudState(): CloudState {
  const [state, setState] = useState(cloudState);
  useEffect(() => {
    const fn = (s: CloudState) => setState(s);
    cloudListeners.add(fn);
    return () => {
      cloudListeners.delete(fn);
    };
  }, []);
  return state;
}

/* ════════════════════════════════════════════════════════════════════════
   Bootstrap & hydratation
   ════════════════════════════════════════════════════════════════════════ */

/** Test de connectivité + résolution de l'organisation. Appelé par AuthGate. */
export async function bootstrapCloud(force = false): Promise<CloudStatus> {
  const current = cloudState.status;
  if (!force && current === "ready") return current;
  setCloudState({ status: "loading", error: null });

  try {
    const supabaseOk = await isSupabaseReady(force);
    if (!supabaseOk) {
      setCloudState({ status: "error", error: "Base Supabase injoignable." });
      return "error";
    }

    const user = await getAuthUser();
    if (!user) {
      setCloudState({ status: "local", error: null });
      return "local";
    }

    const orgRes = await resolveOrganization();
    if (orgRes.error || !orgRes.data) {
      setCloudState({ status: "error", error: orgRes.error ?? "Organisation introuvable." });
      return "error";
    }
    const org = orgRes.data;
    setCloudState({ status: "ready", orgId: org.id });

    // Hydrate le store depuis la base (meilleur effort).
    const hydraError = await hydrateFromCloud();
    if (hydraError) {
      setCloudState({ status: "error", error: hydraError });
      return "error";
    }
    return "ready";
  } catch (e) {
    setCloudState({ status: "error", error: e instanceof Error ? e.message : String(e) });
    return "error";
  }
}

/** Plans de souscription affichés dans Paramètres → Plan (avec fallback). */
export interface SubscriptionPlanRow {
  id: string;
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
  max_users: number;
  max_whatsapp_sessions: number;
  max_ai_agents: number;
  rag_enabled: boolean;
}

export const FALLBACK_PLANS: SubscriptionPlanRow[] = [
  { id: "p_essentiel", name: "Essentiel", price_monthly: 99, price_yearly: 990, max_users: 2, max_whatsapp_sessions: 1, max_ai_agents: 2, rag_enabled: false },
  { id: "p_pro", name: "Pro", price_monthly: 249, price_yearly: 2490, max_users: 10, max_whatsapp_sessions: 3, max_ai_agents: 6, rag_enabled: true },
  { id: "p_business", name: "Business", price_monthly: 499, price_yearly: 4990, max_users: 25, max_whatsapp_sessions: 10, max_ai_agents: 12, rag_enabled: true },
  { id: "p_enterprise", name: "Enterprise", price_monthly: null, price_yearly: null, max_users: -1, max_whatsapp_sessions: -1, max_ai_agents: -1, rag_enabled: true },
];

export async function fetchSubscriptionPlans(): Promise<CloudResult<SubscriptionPlanRow[]>> {
  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("id, name, price_monthly, price_yearly, max_users, max_whatsapp_sessions, max_ai_agents, rag_enabled")
      .eq("active", true)
      .order("price_monthly", { ascending: true, nullsFirst: false });
    if (error) return fail(error.message);
    return ok((data ?? []) as SubscriptionPlanRow[]);
  } catch (e) {
    return fail(e);
  }
}

/* ── Hydratation du store depuis la base ───────────────────────────────── */

async function fetchAll<T>(table: string, orgId: string, orderBy = "created_at"): Promise<T[]> {
  const { data } = await supabase
    .from(table)
    .select("*")
    .eq("organization_id", orgId)
    .order(orderBy, { ascending: false })
    .limit(500);
  return (data ?? []) as T[];
}

export async function hydrateFromCloud(): Promise<string | null> {
  const orgId = getCloudOrgId();
  if (!orgId) return "cloud-inactive";
  try {
    const [orgRes] = await Promise.all([
      supabase.from("organizations").select("*").eq("id", orgId).single(),
    ]);
    const org = orgRes.data as OrgRow | null;

    const [products, orders, deliveries, customers, kbDocs, sessionsRows, convRows, msgRows, agentRows, promptRows, memberRows, subRow] = await Promise.all([
      fetchAll<Record<string, unknown>>("products", orgId),
      fetchAll<Record<string, unknown>>("orders", orgId),
      fetchAll<Record<string, unknown>>("deliveries", orgId),
      fetchAll<Record<string, unknown>>("customers", orgId),
      fetchAll<Record<string, unknown>>("knowledge_base", orgId),
      fetchAll<Record<string, unknown>>("whatsapp_sessions", orgId),
      fetchAll<Record<string, unknown>>("conversations", orgId),
      fetchAll<Record<string, unknown>>("messages", orgId),
      fetchAll<Record<string, unknown>>("ai_agents", orgId),
      fetchAll<Record<string, unknown>>("agent_prompts", orgId, "version"),
      supabase.from("organization_members").select("user_id, role, created_at").eq("organization_id", orgId),
      supabase.from("subscriptions").select("*").eq("organization_id", orgId).maybeSingle(),
    ]);

    const mappedSessions: QrSession[] = (sessionsRows as Record<string, unknown>[]).map(sessionFromRow);
    const mappedMessages: Message[] = (msgRows as Record<string, unknown>[]).map(messageFromRow);
    const msgByConv = new Map<string, Message[]>();
    for (const m of mappedMessages) {
      const arr = msgByConv.get(m.conversationId) ?? [];
      arr.push(m);
      msgByConv.set(m.conversationId, arr);
    }
    const mappedConversations: Conversation[] = (convRows as Record<string, unknown>[]).map((r) => {
      const thread = (msgByConv.get(String(r.id)) ?? []).sort((a, b) => a.at - b.at);
      return conversationFromRow(r, thread);
    });

    const promptByAgent = new Map<string, { version: number; systemPrompt: string; at: number }[]>();
    for (const pr of promptRows as Record<string, unknown>[]) {
      const key = String(pr.agent_id);
      const arr = promptByAgent.get(key) ?? [];
      arr.push({
        version: Number(pr.version ?? 1),
        systemPrompt: String(pr.system_prompt ?? ""),
        at: pr.created_at ? Date.parse(pr.created_at as string) : Date.now(),
      });
      promptByAgent.set(key, arr);
    }
    const mappedAgents: AiAgent[] = (agentRows as Record<string, unknown>[]).map((r) =>
      agentFromRow(r, promptByAgent.get(String(r.id)) ?? []),
    );

    const team: TeamMember[] = ((memberRows.data ?? []) as Record<string, unknown>[]).map((m) => ({
      id: String(m.user_id),
      name: String(m.user_id).slice(0, 8),
      role: (m.role as TeamMember["role"]) ?? "owner",
      email: "",
      active: true,
      lastActiveAt: Date.now(),
    }));

    const sub = (subRow.data ?? null) as { status?: string; trial_ends_at?: string } | null;
    const planNameToId = (name: string): PlanId => {
      const n = name.toLowerCase();
      if (n.includes("enterprise")) return "enterprise";
      if (n.includes("business")) return "agency";
      if (n.includes("pro")) return "business";
      return "starter";
    };

    useSim.setState((s) => ({
      org: org
        ? {
            ...s.org,
            name: org.name || s.org.name,
            slug: org.slug || s.org.slug,
            plan: planNameToId(org.plan ?? "Essentiel"),
            country: org.country ?? s.org.country,
            currency: org.currency ?? s.org.currency,
          }
        : s.org,
      products: (products as Record<string, unknown>[]).map(productFromRow),
      orders: (orders as Record<string, unknown>[]).map(orderFromRow),
      deliveries: (deliveries as Record<string, unknown>[]).map(deliveryFromRow),
      customers: (customers as Record<string, unknown>[]).map(customerFromRow),
      knowledgeDocs: (kbDocs as Record<string, unknown>[]).map(kbDocFromRow),
      sessions: mappedSessions.length > 0 ? mappedSessions : s.sessions,
      conversations: mappedConversations,
      agents: mappedAgents.length > 0 ? mappedAgents : s.agents,
      team: team.length > 0 ? team : s.team,
      subscription: sub
        ? ({
            status: (sub.status as Subscription["status"]) ?? "trial",
            trialEndsAt: sub.trial_ends_at ? Date.parse(sub.trial_ends_at) : undefined,
          } satisfies Subscription)
        : s.subscription,
    }));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   Provisionnement d'un espace cloud (onboarding)
   ════════════════════════════════════════════════════════════════════════ */

export interface ProvisionArgs {
  orgName: string;
  plan: PlanId;
  userName: string;
  sessionName: string;
}

/** Crée organisation + membre owner + abonnement trial + session WhatsApp. */
export async function provisionCloudWorkspace(args: ProvisionArgs): Promise<CloudResult<{ org: OrgRow }>> {
  try {
    const user = await getAuthUser();
    if (!user) return fail("not-authenticated");

    const planName = PLAN_LABELS[args.plan] ?? "Essentiel";
    const slug = args.orgName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "org";

    // 1. Organisation
    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      .insert({
        name: args.orgName.trim(),
        slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
        plan: planName,
        status: "trial",
        trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      })
      .select()
      .single();
    if (orgErr || !orgRow) return fail(orgErr?.message ?? "organization-insert-failed");
    const org = orgRow as OrgRow;

    // 2. Membre owner
    const { error: memErr } = await supabase.from("organization_members").insert({
      organization_id: org.id,
      user_id: user.id,
      role: "owner",
    });
    if (memErr) return fail(memErr.message);

    // 3. Abonnement trial
    const { data: planRow } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("name", planName)
      .maybeSingle();
    await supabase.from("subscriptions").insert({
      organization_id: org.id,
      plan_id: planRow?.id ?? null,
      status: "trial",
      trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    });

    // 4. Session WhatsApp initiale
    await supabase.from("whatsapp_sessions").insert({
      organization_id: org.id,
      name: args.sessionName.trim() || "Session Principale",
      status: "disconnected",
      session_reference: `s_${Date.now().toString(36)}`,
    });

    return ok({ org });
  } catch (e) {
    return fail(e);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   Authentification cloud (email / OAuth)
   ════════════════════════════════════════════════════════════════════════ */

export async function signInWithEmail(email: string, password: string): Promise<CloudResult<true>> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return fail(error.message);
    return ok(true);
  } catch (e) {
    return fail(e);
  }
}

export async function signInWithOAuth(provider: "google" | "azure"): Promise<CloudResult<true>> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    if (error) return fail(error.message);
    return ok(true);
  } catch (e) {
    return fail(e);
  }
}

export async function signOutCloud(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch { /* best effort */ }
  clearCloudContext();
  setCloudState({ status: "local", error: null, orgId: null });
}

/* ════════════════════════════════════════════════════════════════════════
   Écritures store → cloud (helpers typés)
   ════════════════════════════════════════════════════════════════════════ */

export const cloudWrite = {
  upsertProduct(p: Product) {
    persistWrite(`product:${p.id}`, "products", "insert", productToRow(p));
  },
  deleteProduct(id: string) {
    persistWrite(`delete product ${id}`, "products", "delete", {}, { matchValue: id });
  },
  upsertOrder(o: Order) {
    persistWrite(`order:${o.id}`, "orders", "insert", orderToRow(o));
    for (const row of orderItemsToRows(o)) {
      persistWrite(`order-item:${o.id}`, "order_items", "insert", row);
    }
  },
  deleteOrder(id: string) {
    persistWrite(`delete order ${id}`, "orders", "delete", {}, { matchValue: id });
  },
  upsertDelivery(d: Delivery) {
    persistWrite(`delivery:${d.id}`, "deliveries", "insert", deliveryToRow(d));
  },
  deleteDelivery(id: string) {
    persistWrite(`delete delivery ${id}`, "deliveries", "delete", {}, { matchValue: id });
  },
  upsertCustomer(c: Customer) {
    persistWrite(`customer:${c.id}`, "customers", "insert", customerToRow(c));
  },
  deleteCustomer(id: string) {
    persistWrite(`delete customer ${id}`, "customers", "delete", {}, { matchValue: id });
  },
  upsertKbDoc(d: KbDoc) {
    persistWrite(`kb:${d.id}`, "knowledge_base", "insert", kbDocToRow(d));
  },
  deleteKbDoc(id: string) {
    persistWrite(`delete kb ${id}`, "knowledge_base", "delete", {}, { matchValue: id });
  },
  upsertAgent(a: AiAgent) {
    persistWrite(`agent:${a.id}`, "ai_agents", "insert", agentToRow(a));
  },
  upsertSession(s: QrSession) {
    persistWrite(`session:${s.id}`, "whatsapp_sessions", "insert", sessionToRow(s));
  },
  appendMessage(m: Message) {
    const orgId = getCloudOrgId();
    if (!orgId) return;
    persistWrite(`message:${m.id}`, "messages", "insert", messageToRow(m, orgId));
  },
  updateConversation(id: string, patch: Record<string, unknown>) {
    persistWrite(`conversation:${id}`, "conversations", "update", patch, { matchValue: id });
  },
};
