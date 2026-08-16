import { useEffect, useMemo, useRef } from "react";
import { persistBridgeContact, persistBridgeMessage, pollBridgeEvents, getBridgeAvatarUrl, type BridgeMessageEvent } from "@/lib/bridge";
import {
  useSessions,
  useSim,
  type ActivityEvent,
  type AppNotification,
  type Contact,
  type Conversation,
  type Message,
} from "@/lib/sim/store";
import { mergeContacts, newContactId, useCrm } from "@/sections/contacts/crmStore";

let seq = 0;
const CURSOR_KEY = "mf:bridge-event-cursors";
const localId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

function readCursors(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CURSOR_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCursors(value: Record<string, number>) {
  try {
    localStorage.setItem(CURSOR_KEY, JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
}

function normalizeDigits(raw?: string): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length > 11) {
    if (digits.startsWith("216216")) digits = digits.slice(3);
    else if (digits.startsWith("3333")) digits = digits.slice(2);
    else if (/^11[2-9]/.test(digits)) digits = digits.slice(1);
  }
  if (digits.length === 8) return `216${digits}`;
  return digits;
}

function formatPhone(raw?: string): string {
  const digits = normalizeDigits(raw);
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("216")) {
    return `+216 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
  }
  if (digits.length === 11 && digits.startsWith("33")) {
    return `+33 ${digits.slice(2, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
  }
  return `+${digits}`;
}

function contactName(event: BridgeMessageEvent, phoneDigits: string) {
  const named = event.pushName?.trim();
  if (named) return named;
  const tail = phoneDigits.slice(-4);
  return tail ? `WhatsApp ${tail}` : "Contact WhatsApp";
}

function addNotification(list: AppNotification[], title: string, body: string): AppNotification[] {
  return [{ id: localId("nt"), at: Date.now(), kind: "message" as const, title, body, read: false }, ...list].slice(0, 30);
}

function addActivity(list: ActivityEvent[], text: string): ActivityEvent[] {
  return [{ id: localId("ac"), at: Date.now(), kind: "message" as const, text }, ...list].slice(0, 40);
}

function findPreferredSessionId(sessions: { id: string; phone?: string; status?: string; type?: string }[]): string | null {
  let connectedPrincipal: string | null = null;
  let connectedNamed: string | null = null;
  let connectedAny: string | null = null;
  let fallback: string | null = null;
  for (const s of sessions) {
    const sn = String(s.name ?? "").toLowerCase();
    const digits = normalizeDigits(s.phone);
    if (s.status === "connected") {
      if (s.type === "principal") connectedPrincipal = s.id;
      if (sn.includes("haithem") || sn.includes("kalia")) connectedNamed = s.id;
      if (!connectedAny && digits) connectedAny = s.id;
      if (!connectedAny) connectedAny = s.id;
    }
    if (!fallback) fallback = s.id;
  }
  return connectedNamed ?? connectedPrincipal ?? connectedAny ?? fallback;
}

function mergeThreads(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.at - b.at);
}

function mergeContactIntoStore(current: Contact[], contact: Contact): Contact[] {
  const idx = current.findIndex((c) => c.id === contact.id);
  if (idx === -1) return [contact, ...current];
  const existing = current[idx];
  const merged: Contact = {
    ...existing,
    ...contact,
    name: contact.name?.trim() || existing.name,
    phone: contact.phone || existing.phone,
    tags: Array.isArray(contact.tags) && contact.tags.length > 0 ? contact.tags : existing.tags,
    lastContactAt: Math.max(existing.lastContactAt ?? 0, contact.lastContactAt ?? 0),
    avatarUrl: existing.avatarUrl || contact.avatarUrl,
  };
  return [...current.slice(0, idx), merged, ...current.slice(idx + 1)];
}

function ingestIncomingEvent(event: BridgeMessageEvent) {
  try {
  if (event.type !== "message" || !event.body.trim()) return;

  const state = useSim.getState();
  const session = state.sessions.find((item) => item.id === event.sessionId);
  const peerPhone = event.direction === "out" ? event.to : event.from;
  const phoneDigits = normalizeDigits(peerPhone);
  if (!phoneDigits) return;

  const effectiveSessionId = findPreferredSessionId(state.sessions) ?? event.sessionId;

  const crm = useCrm.getState();
  const mergedContacts = mergeContacts(state.contacts, crm);

  let contact = mergedContacts.find((item) => normalizeDigits(item.phone) === phoneDigits);
  let contacts: Contact[] = state.contacts;
  let wasCreated = false;
  if (!contact) {
    const created: Contact = {
      id: newContactId(),
      name: contactName(event, phoneDigits),
      phone: formatPhone(phoneDigits),
      city: "",
      tags: ["WhatsApp"],
      score: 0,
      stage: "prospect",
      consent: true,
      lastContactAt: event.at,
    };
    contact = created;
    contacts = [created, ...state.contacts];
    wasCreated = true;

    persistBridgeContact({
      orgName: state.org.name,
      contact: {
        id: created.id,
        name: created.name,
        phone: created.phone,
        city: created.city,
        tags: created.tags,
        score: created.score,
        stage: created.stage,
        consent: created.consent,
      },
    }).catch(() => { });
  } else if (state.contacts.some((item) => item.id === contact?.id)) {
    contacts = state.contacts.map((item) => (
      item.id === contact?.id
        ? {
          ...item,
          name: item.name?.trim() || contactName(event, phoneDigits),
          lastContactAt: Math.max(item.lastContactAt, event.at),
        }
        : item
    ));
  }

  if (contact && !contact.avatarUrl && session?.id) {
    const contactId = contact.id;
    getBridgeAvatarUrl(session.id, phoneDigits).then((url) => {
      useSim.setState((s) => ({
        contacts: s.contacts.map((c) =>
          c.id === contactId ? { ...c, avatarUrl: url || "none" } : c
        ),
      }));
    });
  }

  const existingConversation = state.conversations.find(
    (item) => item.contactId === contact!.id,
  );

  if (existingConversation?.thread.some((item) => item.id === event.id)) return;

  const message: Message = {
    id: event.id,
    conversationId: existingConversation?.id ?? localId("conv"),
    direction: event.direction === "out" ? "out" : "in",
    body: event.body.trim(),
    at: event.at,
    status: "delivered",
    kind: "text",
  };

  let conversations: Conversation[];
  if (!existingConversation) {
    const created: Conversation = {
      id: message.conversationId,
      contactId: contact.id,
      status: event.direction === "out" ? "open" : "new",
      unread: event.direction === "out" ? 0 : 1,
      sessionId: effectiveSessionId,
      thread: [message],
    };
    conversations = [created, ...state.conversations];
  } else {
    conversations = state.conversations.map((item) => (
      item.id === existingConversation.id
        ? {
          ...item,
          sessionId: effectiveSessionId,
          unread: event.direction === "out" ? item.unread : item.unread + 1,
          status: event.direction === "out"
            ? (item.status === "new" ? "open" : item.status)
            : (item.status === "resolved" ? "open" : item.status),
          thread: mergeThreads(item.thread, [{ ...message, conversationId: item.id }]),
          lastMessageAt: Math.max(item.lastMessageAt ?? 0, event.at),
        }
        : item
    ));
  }

  let notifications = state.notifications;
  let activity = state.activity;
  if (event.direction === "in") {
    notifications = addNotification(
      notifications,
      "Message WhatsApp reçu",
      `${contact.name} : « ${message.body.slice(0, 72)}${message.body.length > 72 ? "..." : ""} »`,
    );
    activity = addActivity(activity, `Message entrant de ${contact.name} sur la session ${event.sessionId}`);
  }
  const messagesToday = state.messagesToday + 1;

  if (!wasCreated && contacts === state.contacts) {
    contacts = mergeContactIntoStore(state.contacts, contact);
  }

  useSim.setState({
    contacts,
    conversations,
    notifications,
    activity,
    messagesToday,
  });

  void persistBridgeMessage({
    orgName: state.org.name,
    sessionId: event.sessionId,
    sessionName: session?.name,
    sessionPhone: session?.phone,
    sessionStatus: session?.status,
    contact: {
      name: contact.name,
      phone: contact.phone,
      city: contact.city,
      tags: contact.tags,
      score: contact.score,
      stage: contact.stage,
      consent: contact.consent,
    },
    message: {
      direction: message.direction,
      body: message.body,
      at: message.at,
      status: message.status,
    },
  });
  } catch (err) {
    console.error("[BridgeInboxSync] CRITICAL: ingestIncomingEvent failed", { err, event });
  }
}

export default function BridgeInboxSync() {
  const sessions = useSessions();
  const demoMode = useSim((s) => s.demoMode);
  const cursorsRef = useRef<Record<string, number>>(readCursors());
  const runningRef = useRef(false);

  const connectedKey = useMemo(
    () => sessions.filter((item) => item.status === "connected").map((item) => item.id).sort().join("|"),
    [sessions],
  );

  useEffect(() => {
    if (demoMode || !connectedKey) return undefined;

    let stopped = false;
    const tick = async () => {
      if (stopped || runningRef.current) return;
      runningRef.current = true;
      try {
        const activeSessions = useSim.getState().sessions.filter((item) => item.status === "connected");
        for (const session of activeSessions) {
          const since = cursorsRef.current[session.id] ?? 0;
          const events = await pollBridgeEvents(session.id, since);
          let maxAt = since;
          if (Array.isArray(events) && events.length > 0) {
            for (const event of events) {
              try {
                ingestIncomingEvent(event);
              } catch (err) {
                console.error("[BridgeInboxSync] Failed to ingest event", { err, event });
              }
              // BUG FIX #7: Préférer receivedAt (horloge monotone serveur) à at (horloge WhatsApp possiblement dans le passé)
              // reçut 5 messages mais at = tous à 10h, while since=11h. Sans receivedAt : on saute tout.
              const evRecv = Number((event as any).receivedAt ?? 0);
              const evOrigAt = Number(event.at ?? 0);
              const bestCursor = evRecv > 0 ? Math.max(evRecv, evOrigAt + 1) : evOrigAt + 1;
              if (bestCursor > maxAt) maxAt = bestCursor;
            }
          } else if (events !== null && Array.isArray(events)) {
            // Tableau vide → avancer prudemment (2s de marge) pour éviter un curseur coincé
            maxAt = Math.max(maxAt, Date.now() - 2_000);
          } else if (events === null && since === 0) {
            // Bridge injoignable au premier poll : NE PAS avancer le curseur depuis 0
          } else if (events === null && since > 0) {
            // Bridge injoignable mais curseur déjà avancé : on ne touche pas (pas de saut en avant)
          }
          if (maxAt !== cursorsRef.current[session.id]) {
            cursorsRef.current[session.id] = maxAt;
            writeCursors(cursorsRef.current);
          }
        }
      } finally {
        runningRef.current = false;
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 2_500);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [connectedKey, demoMode]);

  return null;
}
