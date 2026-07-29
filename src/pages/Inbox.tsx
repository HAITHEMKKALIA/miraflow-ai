/**
 * Inbox — page « /app/inbox » (inbox.md). Inbox collaboratif 3 colonnes :
 * liste des conversations, thread multimédia, fiche contact repliable.
 * Consomme le SimEngine en direct (messages entrants, statuts, suggestions IA).
 * Raccourcis : j/k naviguer, r répondre, e résoudre, / réponses enregistrées.
 * Deep-link : /app/inbox?c=<id> (la route /app/inbox est unique dans App.tsx).
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard } from "lucide-react";
import type { Conversation } from "@/lib/sim/store";
import {
  useAgents, useContacts, useConversations, useSim, useSessions, useSuggestions, useTeam,
} from "@/lib/sim/store";
import ConversationList from "@/sections/inbox/ConversationList";
import Thread from "@/sections/inbox/Thread";
import ContactPanel from "@/sections/inbox/ContactPanel";
import { EmptyState } from "@/components/ui-shared";
import { mergeContacts, useCrm } from "@/sections/contacts/crmStore";
import { cn } from "@/lib/utils";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : true));
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export default function Inbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("c") ?? undefined;

  const conversations = useConversations();
  const baseContacts = useContacts();
  const team = useTeam();
  const sessions = useSessions();
  const agents = useAgents();
  const suggestions = useSuggestions();
  const markConversationRead = useSim((s) => s.markConversationRead);
  const setConversationStatus = useSim((s) => s.setConversationStatus);

  const overrides = useCrm((s) => s.overrides);
  const extra = useCrm((s) => s.extra);
  const deleted = useCrm((s) => s.deleted);
  const contacts = useMemo(
    () => mergeContacts(baseContacts, { overrides, extra, deleted }),
    [baseContacts, overrides, extra, deleted],
  );

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [panelOpen, setPanelOpen] = useState(true);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [starred, setStarred] = useState<Set<string>>(new Set());

  /* Fiche ouverte par défaut sur desktop, fermée sur mobile */
  useEffect(() => {
    setPanelOpen(isDesktop);
  }, [isDesktop]);

  const selectedConv = conversations.find((c) => c.id === selectedId);
  const selectedContact = selectedConv ? contacts.find((c) => c.id === selectedConv.contactId) : undefined;

  const assigneeOf = (conv: Conversation) => {
    const id = conv.id in assignments ? assignments[conv.id] : conv.assigneeId;
    return team.find((m) => m.id === id);
  };

  const select = (id: string) => {
    setSearchParams({ c: id }, { replace: false });
    markConversationRead(id);
  };
  const closeThread = () => setSearchParams({}, { replace: false });

  /* Marque lue la conversation ouverte quand un message entrant arrive */
  const lastMsgId = selectedConv?.thread[selectedConv.thread.length - 1]?.id;
  useEffect(() => {
    if (selectedId && selectedConv && selectedConv.unread > 0) markConversationRead(selectedId);
  }, [lastMsgId, selectedId, selectedConv, markConversationRead]);

  /* Raccourcis clavier j/k/r/e + « / » */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      const sorted = [...conversations].sort(
        (a, b) => (b.thread[b.thread.length - 1]?.at ?? 0) - (a.thread[a.thread.length - 1]?.at ?? 0),
      );
      const idx = sorted.findIndex((c) => c.id === selectedId);

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = e.key === "j" ? idx + 1 : idx - 1;
        const clamped = (next + sorted.length) % sorted.length;
        const conv = sorted[clamped];
        if (conv) select(conv.id);
      } else if (e.key === "e" && selectedConv) {
        e.preventDefault();
        setConversationStatus(selectedConv.id, "resolved");
      } else if (e.key === "r" && selectedConv) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("mf:composer", { detail: { convId: selectedConv.id, action: "focus" } }));
      } else if (e.key === "/" && selectedConv) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("mf:composer", { detail: { convId: selectedConv.id, action: "slash" } }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, selectedId, selectedConv]);

  const toggleStar = (convId: string) =>
    setStarred((s) => {
      const n = new Set(s);
      if (n.has(convId)) n.delete(convId);
      else n.add(convId);
      return n;
    });
  const onAssign = (convId: string, memberId?: string) =>
    setAssignments((a) => ({ ...a, [convId]: memberId ?? null }));

  return (
    <div className="relative flex h-[calc(100dvh-6.5rem)] overflow-hidden rounded-r-lg border border-line bg-surface-1 md:h-[calc(100dvh-7.5rem)]">
      {/* ── Colonne 1 : liste ─────────────────────────────────────────── */}
      <div className={cn("h-full w-full shrink-0 border-e border-line lg:w-[340px] xl:w-[360px]", selectedId ? "hidden lg:block" : "block")}>
        <ConversationList
          conversations={conversations}
          contacts={contacts}
          team={team}
          sessions={sessions}
          selectedId={selectedId}
          starred={starred}
          onSelect={select}
          onAssign={onAssign}
          onToggleStar={toggleStar}
        />
      </div>

      {/* ── Colonne 2 : thread ────────────────────────────────────────── */}
      <div className={cn("h-full min-w-0 flex-1", selectedId ? "block" : "hidden lg:block")}>
        {selectedConv ? (
          <Thread
            conv={selectedConv}
            contact={selectedContact}
            team={team}
            agents={agents}
            session={sessions.find((s) => s.id === selectedConv.sessionId)}
            suggestions={suggestions.filter((s) => s.conversationId === selectedConv.id)}
            assignee={assigneeOf(selectedConv)}
            starred={starred.has(selectedConv.id)}
            panelOpen={panelOpen}
            onBack={closeThread}
            onAssign={(id) => onAssign(selectedConv.id, id)}
            onToggleStar={() => toggleStar(selectedConv.id)}
            onTogglePanel={() => setPanelOpen((p) => !p)}
          />
        ) : (
          <div className="hidden h-full items-center justify-center lg:flex">
            <EmptyState
              title="Sélectionnez une conversation"
              description="Choisissez une conversation dans la liste pour afficher le fil, ou utilisez les raccourcis clavier."
              action={
                <div className="flex items-center gap-3 rounded-r-md border border-line bg-surface-2 px-4 py-2.5 text-[12px] text-mid">
                  <Keyboard className="size-4 text-low" />
                  <span className="flex items-center gap-2">
                    <kbd className="rounded border border-line bg-surface-1 px-1.5 font-mono text-[10px]">j</kbd>
                    <kbd className="rounded border border-line bg-surface-1 px-1.5 font-mono text-[10px]">k</kbd> naviguer
                    <kbd className="rounded border border-line bg-surface-1 px-1.5 font-mono text-[10px]">r</kbd> répondre
                    <kbd className="rounded border border-line bg-surface-1 px-1.5 font-mono text-[10px]">e</kbd> résoudre
                    <kbd className="rounded border border-line bg-surface-1 px-1.5 font-mono text-[10px]">/</kbd> réponses
                  </span>
                </div>
              }
            />
          </div>
        )}
      </div>

      {/* ── Colonne 3 : fiche contact (desktop, repliable) ────────────── */}
      {isDesktop && selectedConv && selectedContact && (
        <AnimatePresence initial={false}>
          {panelOpen && (
            <motion.div
              key="panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="h-full shrink-0 overflow-hidden border-s border-line"
            >
              <div className="h-full w-[320px]">
                <ContactPanel
                  contact={selectedContact}
                  conversations={conversations.filter((c) => c.contactId === selectedContact.id)}
                  onMessage={() => select(selectedConv.id)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ── Fiche contact (mobile : tiroir overlay) ───────────────────── */}
      {!isDesktop && selectedConv && selectedContact && (
        <AnimatePresence>
          {panelOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
                onClick={() => setPanelOpen(false)}
              />
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-y-0 end-0 z-50 w-[320px] border-s border-line bg-surface-1 shadow-card"
              >
                <ContactPanel
                  contact={selectedContact}
                  conversations={conversations.filter((c) => c.contactId === selectedContact.id)}
                  onMessage={() => {
                    setPanelOpen(false);
                    select(selectedConv.id);
                  }}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
