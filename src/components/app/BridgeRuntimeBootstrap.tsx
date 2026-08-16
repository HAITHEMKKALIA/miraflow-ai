import { useEffect, useMemo, useRef } from "react";
import { fetchBridgeRuntimeBootstrap } from "@/lib/bridge";
import { useSim, type Conversation, type Contact, type QrSession, type SessionStatus, type Message, type AiAgent, type AiSuggestion } from "@/lib/sim/store";

function toSessionStatus(value: string): SessionStatus {
  if (value === "connected") return "connected";
  if (value === "unstable") return "unstable";
  return "disconnected";
}

function shouldReplaceSession(next: QrSession, prev?: QrSession) {
  if (!prev) return true;
  const rank = (session: QrSession) => (
    (session.status === "connected" ? 4 : session.status === "unstable" ? 3 : 1)
    + (session.phone ? 1 : 0)
  );
  return rank(next) >= rank(prev);
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[] | undefined, pickWinner: (inc: T, cur: T) => T = (a) => a): T[] {
  if (!Array.isArray(incoming) || incoming.length === 0) return current;
  const byId = new Map<string, T>(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? pickWinner(item, existing) : item);
  }
  return [...byId.values()];
}

function mergeContactsById(current: Contact[], incoming: Contact[] | undefined): Contact[] {
  return mergeById<Contact>(current, incoming, (inItem, curItem) => ({
    ...curItem,
    ...inItem,
    name: inItem.name?.trim() || curItem.name,
    phone: inItem.phone || curItem.phone,
    tags: Array.isArray(inItem.tags) && inItem.tags.length > 0 ? inItem.tags : curItem.tags,
    lastContactAt: Math.max(curItem.lastContactAt ?? 0, inItem.lastContactAt ?? 0),
    avatarUrl: curItem.avatarUrl || inItem.avatarUrl,
  }));
}

function mergeThreads(curThread: Message[], incThread: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of curThread) byId.set(m.id, m);
  for (const m of incThread) {
    const existing = byId.get(m.id);
    if (!existing) byId.set(m.id, m);
    else {
      const rankS = (s: string) =>
        s === "read" ? 5 : s === "delivered" ? 4 : s === "sent" ? 3 : s === "queued" ? 2 : s === "failed" ? 1 : 0;
      byId.set(m.id, { ...existing, ...m, status: rankS(m.status ?? "") >= rankS(existing.status ?? "") ? m.status ?? existing.status : existing.status });
    }
  }
  return [...byId.values()].sort((a, b) => a.at - b.at);
}

function mergeConversationsById(current: Conversation[], incoming: Conversation[] | undefined, sessionIdMap: Map<string, string>): Conversation[] {
  if (!Array.isArray(incoming) || incoming.length === 0) return current;
  const normalized = incoming.map((item) => ({
    ...item,
    sessionId: sessionIdMap.get(item.sessionId) ?? item.sessionId,
    thread: item.thread.map((msg) => ({
      ...msg,
      conversationId: item.id,
      status: msg.status === "queued" || msg.status === "sent" || msg.status === "delivered" || msg.status === "read" || msg.status === "failed"
        ? msg.status
        : (msg.direction === "out" ? "sent" : "delivered"),
    })),
  })) as Conversation[];

  return mergeById<Conversation>(current, normalized, (inConv, curConv) => {
    const rank = (s: string) =>
      s === "new" ? 0 : s === "open" ? 1 : s === "pending" ? 2 : s === "resolved" ? 3 : s === "archived" ? 4 : 99;
    const mergedThread = mergeThreads(curConv.thread ?? [], inConv.thread ?? []);
    const latestAt = mergedThread.length > 0 ? mergedThread[mergedThread.length - 1].at : 0;
    return {
      ...curConv,
      ...inConv,
      sessionId: inConv.sessionId || curConv.sessionId,
      contactId: inConv.contactId || curConv.contactId,
      status: rank(inConv.status) < rank(curConv.status) ? inConv.status : curConv.status,
      unread: Math.max(curConv.unread ?? 0, inConv.unread ?? 0),
      thread: mergedThread,
      lastMessageAt: latestAt || curConv.lastMessageAt || inConv.lastMessageAt,
    };
  });
}

export default function BridgeRuntimeBootstrap() {
  const demoMode = useSim((s) => s.demoMode);
  const orgName = useSim((s) => s.org.name);
  const runningRef = useRef(false);

  const enabled = useMemo(
    () => !demoMode && typeof orgName === "string" && orgName.trim().length > 0,
    [demoMode, orgName],
  );

  useEffect(() => {
    if (!enabled) return undefined;

    let stopped = false;
    const tick = async () => {
      if (stopped || runningRef.current) return;
      runningRef.current = true;

      try {
        const payload = await fetchBridgeRuntimeBootstrap(orgName);
        if (stopped || !payload?.ok) return;

        useSim.setState((state) => {
          const currentByName = new Map(state.sessions.map((item) => [item.name.trim().toLowerCase(), item]));

          const sessionsById = new Map<string, QrSession>();
          for (const item of payload.sessions ?? []) {
            const byName = currentByName.get(item.name.trim().toLowerCase());
            const preferredId = item.bridgeId ?? byName?.id ?? item.id;
            const candidate = {
              id: preferredId,
              name: item.name,
              type: item.type,
              status: toSessionStatus(item.status),
              uptime: item.uptime,
              latencyMs: item.latencyMs,
              phone: item.phone,
              connectedAt: item.connectedAt,
            } satisfies QrSession;

            if (shouldReplaceSession(candidate, sessionsById.get(preferredId))) {
              sessionsById.set(preferredId, candidate);
            }
          }
          const incomingSessions = [...sessionsById.values()];

          const sessionIdMap = new Map((payload.sessions ?? []).map((item) => {
            const byName = currentByName.get(item.name.trim().toLowerCase());
            return [item.id, item.bridgeId ?? byName?.id ?? item.id] as const;
          }));

          const sessions = mergeById<QrSession>(state.sessions, incomingSessions, (inS, curS) =>
            shouldReplaceSession(inS, curS) ? inS : curS,
          );

          const contacts = mergeContactsById(state.contacts, payload.contacts);
          const conversations = mergeConversationsById(state.conversations, payload.conversations, sessionIdMap);

          // BUG FIX #5: Fusionner les agents AI depuis DB (priorité au state local pour les runtime)
          const dbAgents: AiAgent[] = Array.isArray((payload as any).agents)
            ? (payload as any).agents.map((row: any) => ({
                id: String(row.id),
                key: String(row.key ?? "analyst"),
                name: String(row.name ?? "Agent"),
                tagline: String(row.tagline ?? ""),
                mode: String(row.mode ?? "suggestion"),
                confidence: Number(row.confidence ?? row.threshold ?? 85),
                handled: Number(row.handled ?? 0),
              } satisfies AiAgent))
            : [];
          const agents = mergeById<AiAgent>(state.agents, dbAgents, (inA, curA) => ({
            ...curA,
            ...inA,
            handled: Math.max(Number(curA.handled ?? 0), Number(inA.handled ?? 0)),
          }));

          // BUG FIX #5: Fusionner suggestions AI depuis DB (garder status local si déjà acceptée/rejetée)
          type SugWithId = AiSuggestion & { id: string };
          const dbSuggestions: SugWithId[] = Array.isArray((payload as any).suggestions)
            ? (payload as any).suggestions.filter((s: any) => s?.id).map((row: any) => ({
                id: String(row.id),
                conversationId: row.conversationId ?? row.conversation_id ?? null,
                agentId: row.agentId ?? row.agent_id ?? null,
                text: String(row.text ?? row.body ?? ""),
                confidence: Number(row.confidence ?? 0),
                status: (["pending", "accepted", "rejected"] as const).includes(String(row.status ?? "") as any)
                  ? (String(row.status) as "pending" | "accepted" | "rejected")
                  : "pending",
                at: Number(row.at ?? (row.created_at ? Date.parse(row.created_at) : Date.now())),
              } satisfies SugWithId))
            : [];
          const suggestions = mergeById<AiSuggestion>(
            state.suggestions,
            dbSuggestions,
            (inSug, curSug) => {
              // Règle : status "accepted" ou "rejected" côté DB gagne ; sinon conserver le status local (sauf si curSug est pending)
              const dbStatusFinal = inSug.status;
              const localStatusFinal = curSug.status;
              const finalStatus = (dbStatusFinal !== "pending" && dbStatusFinal !== localStatusFinal)
                ? dbStatusFinal
                : localStatusFinal;
              return {
                ...curSug,
                ...inSug,
                status: finalStatus,
                confidence: Math.max(Number(curSug.confidence ?? 0), Number(inSug.confidence ?? 0)),
                at: Math.max(Number(curSug.at ?? 0), Number(inSug.at ?? 0)),
              };
            },
          );

          return {
            sessions: sessions.length > 0 ? sessions : state.sessions,
            contacts,
            conversations,
            agents,
            suggestions,
            messagesToday: typeof payload.messagesToday === "number" ? Math.max(state.messagesToday, payload.messagesToday) : state.messagesToday,
          };
        });
      } finally {
        runningRef.current = false;
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 10_000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [enabled, orgName]);

  return null;
}
