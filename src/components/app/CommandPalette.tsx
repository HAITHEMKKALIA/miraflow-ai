/**
 * CommandPalette (⌘K) — recherche globale (design.md §6 App shell).
 * Modale centrée 560px, recherche floue sur conversations, contacts,
 * campagnes + actions rapides. Navigation clavier : flèches + ↵, Échap ferme.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot, CornerDownLeft, MessageSquare, Megaphone, Search, User, Workflow, Zap,
} from "lucide-react";
import { useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  group: "Conversations" | "Contacts" | "Campagnes" | "Actions";
  icon: typeof Search;
  title: string;
  hint?: string;
  to: string;
}

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const conversations = useSim((s) => s.conversations);
  const contacts = useSim((s) => s.contacts);
  const campaigns = useSim((s) => s.campaigns);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const contactName = (id: string) => contacts.find((c) => c.id === id)?.name ?? "Contact";
    const out: Item[] = [];
    for (const c of conversations) {
      const last = c.thread[c.thread.length - 1]?.body ?? "";
      if (match(contactName(c.contactId)) || match(last))
        out.push({
          id: `conv_${c.id}`,
          group: "Conversations",
          icon: MessageSquare,
          title: contactName(c.contactId),
          hint: last.slice(0, 48),
          to: "/app/inbox",
        });
    }
    for (const c of contacts) {
      if (match(c.name) || match(c.phone))
        out.push({ id: `ct_${c.id}`, group: "Contacts", icon: User, title: c.name, hint: c.phone, to: "/app/contacts" });
    }
    for (const c of campaigns) {
      if (match(c.name))
        out.push({ id: `cp_${c.id}`, group: "Campagnes", icon: Megaphone, title: c.name, hint: c.audience, to: "/app/campaigns" });
    }
    const ACTIONS: Item[] = [
      { id: "a_new_campaign", group: "Actions", icon: Zap, title: "Nouvelle campagne", to: "/app/campaigns" },
      { id: "a_invite", group: "Actions", icon: User, title: "Inviter un agent", to: "/app/settings" },
      { id: "a_new_workflow", group: "Actions", icon: Workflow, title: "Nouveau workflow", to: "/app/workflows" },
      { id: "a_agents", group: "Actions", icon: Bot, title: "Configurer les agents IA", to: "/app/agents" },
    ];
    for (const a of ACTIONS) if (match(a.title)) out.push(a);
    return out.slice(0, 12);
  }, [query, conversations, contacts, campaigns]);

  useEffect(() => {
    setCursor(0);
  }, [items.length]);

  const go = (item: Item) => {
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(items.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter" && items[cursor]) {
      go(items[cursor]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  // groupes ordonnés pour l'affichage
  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      if (!map.has(it.group)) map.set(it.group, []);
      map.get(it.group)!.push(it);
    }
    return [...map.entries()];
  }, [items]);

  let flatIndex = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label="Recherche globale"
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[4px]" onClick={onClose} />
          <motion.div
            initial={{ y: -8, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -8, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="relative w-full max-w-[560px] overflow-hidden rounded-r-lg border border-line bg-surface-1 shadow-card"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 shrink-0 text-low" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Rechercher ou lancer une action…"
                className="h-[52px] w-full bg-transparent text-[14px] text-hi placeholder:text-low focus:outline-none"
              />
              <kbd className="label-micro rounded border border-line bg-surface-2 px-1.5 py-0.5 text-low">ÉCHAP</kbd>
            </div>
            <div className="max-h-[46vh] overflow-y-auto p-2" role="listbox">
              {items.length === 0 && (
                <p className="px-3 py-8 text-center text-[13px] text-low">Aucun résultat pour « {query} »</p>
              )}
              {groups.map(([group, list]) => (
                <div key={group} className="mb-1">
                  <p className="label-micro px-3 py-1.5 text-low">{group}</p>
                  {list.map((item) => {
                    flatIndex += 1;
                    const idx = flatIndex;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={idx === cursor}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => go(item)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-r-sm px-3 py-2.5 text-left transition-colors",
                          idx === cursor ? "bg-surface-2" : "bg-transparent",
                        )}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-r-sm border border-line bg-surface-2 text-mid">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-hi">{item.title}</span>
                          {item.hint && <span className="block truncate text-[12px] text-low">{item.hint}</span>}
                        </span>
                        {idx === cursor && <CornerDownLeft className="size-3.5 shrink-0 text-low" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
