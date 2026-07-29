/**
 * Contexte de la page Agents IA — état partagé entre les sections S1→S7 :
 * modes des agents (Suggestion/Autonome), seuil de confiance, base de
 * connaissances (pipeline d'indexation vivant), chat de test (agent choisi),
 * drawer de configuration, journal d'activité IA, ancres de navigation.
 * Consomme le SimEngine (agents, suggestions, conversations) sans le modifier.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode, type RefObject,
} from "react";
import { toast } from "sonner";
import { useSim, useAgents } from "@/lib/sim/store";
import type { AgentMode, AiSuggestion } from "@/lib/sim/store";
import {
  EXTRA_AGENTS, SEED_DOCS, SEED_SUGGESTION_TEXTS, UPLOAD_POOL,
  seedJournal, uid,
  type JournalEntry, type KnowledgeDoc,
} from "./data";

/* ── Configuration par agent (drawer S3) ───────────────────────────────── */
export interface AgentConfig {
  name: string;
  tone: "Formel" | "Chaleureux" | "Concis";
  langs: string[];
  signature: string;
  threshold: number;
  activeFrom: string;
  activeTo: string;
  maxMessages: number;
  forbidden: string[];
  docIds: string[];
  escalationKeywords: string[];
  escalateOnNegative: boolean;
  escalateAfterExchanges: boolean;
  escalateTo: string;
}

function defaultConfigs(): Record<string, AgentConfig> {
  const mk = (name: string, docIds: string[]): AgentConfig => ({
    name,
    tone: "Chaleureux",
    langs: ["FR", "AR"],
    signature: "— L'équipe Dar El Baraka",
    threshold: 85,
    activeFrom: "08:00",
    activeTo: "20:00",
    maxMessages: 6,
    forbidden: ["gratuit à vie", "garantie 100 %"],
    docIds,
    escalationKeywords: ["réclamation", "avocat", "remboursement"],
    escalateOnNegative: true,
    escalateAfterExchanges: true,
    escalateTo: "u_karim",
  });
  return {
    ag_sales: mk("Commercial", ["doc_catalogue", "doc_tarifs", "doc_scripts"]),
    ag_support: mk("Support", ["doc_faq", "doc_horaires", "doc_garantie"]),
    ag_tech: mk("Technique", ["doc_garantie", "doc_tailles"]),
    ag_rdv: mk("Rendez-vous", ["doc_horaires"]),
    ag_supervisor: mk("Superviseur", ["doc_privacy", "doc_scripts"]),
    ag_analyst: mk("Analyste", ["doc_tarifs"]),
    ag_translate: { ...mk("Traduction", ["doc_faq", "doc_horaires"]), langs: ["FR", "AR", "EN"] },
    ag_vision: mk("Analyse d'images", ["doc_catalogue", "doc_tarifs"]),
  };
}

/* ── Type du contexte ──────────────────────────────────────────────────── */
interface AgentsPageCtx {
  modes: Record<string, AgentMode>;
  paused: Record<string, boolean>;
  toggleMode: (agentId: string) => void;
  togglePaused: (agentId: string) => void;
  setAllModes: (mode: AgentMode) => void;
  autonomousCount: number;

  threshold: number;
  setThreshold: (v: number) => void;

  docs: KnowledgeDoc[];
  addDoc: () => void;
  removeDoc: (id: string) => void;
  reindexDoc: (id: string) => void;
  toggleDocAgent: (docId: string, agentId: string) => void;
  totalFragments: number;

  configs: Record<string, AgentConfig>;
  configAgentId: string | null;
  openConfig: (agentId: string) => void;
  closeConfig: () => void;
  saveConfig: (agentId: string, cfg: AgentConfig) => void;
  updatedAt: Record<string, number>;

  chatAgentId: string;
  setChatAgentId: (id: string) => void;
  testAgent: (id: string) => void;

  journal: JournalEntry[];
  pushJournal: (e: Omit<JournalEntry, "id" | "at">) => void;

  chatRef: RefObject<HTMLDivElement | null>;
  kbRef: RefObject<HTMLDivElement | null>;
  queueRef: RefObject<HTMLDivElement | null>;
  scrollTo: (r: RefObject<HTMLDivElement | null>) => void;
}

const Ctx = createContext<AgentsPageCtx | null>(null);

export function useAgentsPage(): AgentsPageCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAgentsPage doit être utilisé sous <AgentsProvider>");
  return ctx;
}

/* ── Provider ──────────────────────────────────────────────────────────── */
export function AgentsProvider({ children }: { children: ReactNode }) {
  const agents = useAgents();
  const contacts = useSim((s) => s.contacts);
  const conversations = useSim((s) => s.conversations);

  /* Modes & pause — initialisés depuis le SimEngine */
  const [modes, setModes] = useState<Record<string, AgentMode>>(() =>
    Object.fromEntries(agents.map((a) => [a.id, a.mode])),
  );
  const [paused, setPaused] = useState<Record<string, boolean>>({});
  const [threshold, setThreshold] = useState(85);
  const [updatedAt, setUpdatedAt] = useState<Record<string, number>>({});

  const nameOf = useCallback(
    (agentId: string) =>
      agents.find((a) => a.id === agentId)?.name ?? EXTRA_AGENTS.find((a) => a.id === agentId)?.name ?? "Agent",
    [agents],
  );

  const toggleMode = useCallback((agentId: string) => {
    const next: AgentMode = modes[agentId] === "autonomous" ? "suggestion" : "autonomous";
    const name = nameOf(agentId);
    setModes((m) => ({ ...m, [agentId]: next }));
    toast(`Agent ${name} en mode ${next === "autonomous" ? "Autonome" : "Suggestion"}`, {
      description: next === "autonomous"
        ? "Il répondra sans validation si la confiance dépasse le seuil."
        : "Ses réponses seront soumises à validation humaine.",
    });
  }, [nameOf, modes]);

  const togglePaused = useCallback((agentId: string) => {
    const next = !paused[agentId];
    const name = nameOf(agentId);
    setPaused((p) => ({ ...p, [agentId]: next }));
    toast(next ? `Agent ${name} mis en pause` : `Agent ${name} réactivé`);
  }, [nameOf, paused]);

  const setAllModes = useCallback((mode: AgentMode) => {
    setModes((m) => Object.fromEntries(Object.keys(m).map((k) => [k, mode])));
  }, []);

  const autonomousCount = useMemo(
    () => Object.values(modes).filter((m) => m === "autonomous").length,
    [modes],
  );

  /* Base de connaissances */
  const [docs, setDocs] = useState<KnowledgeDoc[]>(SEED_DOCS);
  const uploadIdx = useRef(0);

  const addDoc = useCallback(() => {
    const spec = UPLOAD_POOL[uploadIdx.current % UPLOAD_POOL.length];
    uploadIdx.current += 1;
    const doc: KnowledgeDoc = {
      id: uid("doc"),
      name: spec.name,
      kind: spec.kind,
      size: spec.size,
      fragments: 0,
      status: "indexing",
      step: 0,
      progress: 0,
      agents: ["ag_support"],
      addedAt: Date.now(),
      version: "v1.0",
    };
    setDocs((d) => [doc, ...d]);
    toast(`« ${spec.name} » téléversé`, { description: "Indexation en cours…" });
  }, []);

  const removeDoc = useCallback((id: string) => {
    const doc = docs.find((x) => x.id === id);
    if (doc) toast(`« ${doc.name} » retiré de la base`);
    setDocs((d) => d.filter((x) => x.id !== id));
  }, [docs]);

  const reindexDoc = useCallback((id: string) => {
    setDocs((d) =>
      d.map((x) => (x.id === id ? { ...x, status: "indexing" as const, step: 0, progress: 0 } : x)),
    );
  }, []);

  const toggleDocAgent = useCallback((docId: string, agentId: string) => {
    setDocs((d) =>
      d.map((x) =>
        x.id === docId
          ? { ...x, agents: x.agents.includes(agentId) ? x.agents.filter((a) => a !== agentId) : [...x.agents, agentId] }
          : x,
      ),
    );
  }, []);

  /* Pipeline d'indexation vivant (toutes les 420 ms) */
  useEffect(() => {
    const t = setInterval(() => {
      setDocs((d) => {
        if (!d.some((x) => x.status === "indexing")) return d;
        return d.map((x) => {
          if (x.status !== "indexing") return x;
          const progress = x.progress + 14 + Math.floor(Math.random() * 16);
          if (progress < 100) return { ...x, progress };
          if (x.step < 3) return { ...x, step: x.step + 1, progress: 0 };
          const target = UPLOAD_POOL.find((p) => p.name === x.name)?.fragments ?? x.fragments;
          const fragments = x.fragments > 0 ? x.fragments : target;
          return { ...x, status: "indexed" as const, progress: 100, fragments: Math.max(fragments, 24) };
        });
      });
    }, 420);
    return () => clearInterval(t);
  }, []);

  /* Toast « indexé » une seule fois par document */
  const toastedDocs = useRef<Set<string>>(new Set(SEED_DOCS.map((d) => d.id)));
  useEffect(() => {
    docs.forEach((d) => {
      if (d.status === "indexed" && !toastedDocs.current.has(d.id)) {
        toastedDocs.current.add(d.id);
        toast.success(`« ${d.name} » indexé — ${d.fragments} fragments prêts`);
      }
    });
  }, [docs]);

  const totalFragments = useMemo(
    () => docs.reduce((acc, d) => acc + (d.status === "indexed" ? d.fragments : 0), 0),
    [docs],
  );

  /* Configurations & drawer */
  const [configs, setConfigs] = useState<Record<string, AgentConfig>>(() => defaultConfigs());
  const [configAgentId, setConfigAgentId] = useState<string | null>(null);
  const openConfig = useCallback((id: string) => setConfigAgentId(id), []);
  const closeConfig = useCallback(() => setConfigAgentId(null), []);
  const saveConfig = useCallback((agentId: string, cfg: AgentConfig) => {
    setConfigs((c) => ({ ...c, [agentId]: cfg }));
    setUpdatedAt((u) => ({ ...u, [agentId]: Date.now() }));
    const name = cfg.name;
    toast.success(`Configuration de l'agent ${name} enregistrée`);
    setTimeout(() => {
      setUpdatedAt((u) => {
        const n = { ...u };
        delete n[agentId];
        return n;
      });
    }, 8000);
  }, []);

  /* Chat de test */
  const [chatAgentId, setChatAgentId] = useState("ag_sales");
  const chatRef = useRef<HTMLDivElement | null>(null);
  const kbRef = useRef<HTMLDivElement | null>(null);
  const queueRef = useRef<HTMLDivElement | null>(null);
  const scrollTo = useCallback((r: RefObject<HTMLDivElement | null>) => {
    r.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const testAgent = useCallback((id: string) => {
    setChatAgentId(id);
    setTimeout(() => chatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, []);

  /* Journal IA */
  const [journal, setJournal] = useState<JournalEntry[]>(() =>
    seedJournal(
      agents.map((a) => ({ id: a.id, name: a.name })),
      contacts.slice(0, 8).map((c) => c.name),
    ),
  );
  const pushJournal = useCallback((e: Omit<JournalEntry, "id" | "at">) => {
    setJournal((j) => [{ ...e, id: uid("j"), at: Date.now() }, ...j].slice(0, 30));
  }, []);

  /* Seed : 3 suggestions en attente si la file est vide (design §S1/S6) */
  useEffect(() => {
    const st = useSim.getState();
    if (st.suggestions.length > 0) return;
    const open = st.conversations.filter((c) => c.status === "open" || c.status === "new");
    if (open.length < 3) return;
    const seeds: AiSuggestion[] = SEED_SUGGESTION_TEXTS.map((text, i) => ({
      id: uid("sg"),
      agentId: ["ag_sales", "ag_support", "ag_sales"][i],
      conversationId: open[i].id,
      text,
      confidence: [92, 88, 85][i],
      at: Date.now() - (6 + i * 4) * 60_000,
      status: "pending" as const,
    }));
    useSim.setState((s) => ({ suggestions: [...seeds, ...s.suggestions] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Nouvelle suggestion SimEngine → entrée de journal « En attente » */
  const pendingIds = useSim((s) => s.suggestions.map((x) => (x.status === "pending" ? x.id : "")).join("|"));
  const seenRef = useRef<string>(pendingIds);
  useEffect(() => {
    if (pendingIds === seenRef.current) return;
    const prev = new Set(seenRef.current.split("|"));
    seenRef.current = pendingIds;
    const fresh = useSim.getState().suggestions.find((x) => x.status === "pending" && !prev.has(x.id));
    if (fresh) {
      const agent = agents.find((a) => a.id === fresh.agentId);
      const conv = conversations.find((c) => c.id === fresh.conversationId);
      const contact = contacts.find((c) => c.id === conv?.contactId);
      pushJournal({
        agentId: fresh.agentId,
        agentName: agent?.name ?? "Agent",
        conversation: contact?.name ?? "Conversation",
        action: "Suggestion",
        confidence: fresh.confidence,
        decision: "En attente",
        latencyS: 1.1,
      });
    }
  }, [pendingIds, agents, conversations, contacts, pushJournal]);

  const value = useMemo<AgentsPageCtx>(() => ({
    modes, paused, toggleMode, togglePaused, setAllModes, autonomousCount,
    threshold, setThreshold,
    docs, addDoc, removeDoc, reindexDoc, toggleDocAgent, totalFragments,
    configs, configAgentId, openConfig, closeConfig, saveConfig, updatedAt,
    chatAgentId, setChatAgentId, testAgent,
    journal, pushJournal,
    chatRef, kbRef, queueRef, scrollTo,
  }), [
    modes, paused, toggleMode, togglePaused, setAllModes, autonomousCount,
    threshold, docs, addDoc, removeDoc, reindexDoc, toggleDocAgent, totalFragments,
    configs, configAgentId, openConfig, closeConfig, saveConfig, updatedAt,
    chatAgentId, testAgent, journal, pushJournal, scrollTo,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
