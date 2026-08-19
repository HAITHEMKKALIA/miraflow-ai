/**
 * Contexte de la page Agents IA — état partagé entre les sections S1→S7 :
 * modes des agents (Suggestion/Autonome), seuil de confiance, base de
 * connaissances (pipeline d'indexation vivant), chat de test (agent choisi),
 * drawer de configuration, journal d'activité IA, ancres de navigation.
 * Consomme le SimEngine (agents, suggestions, conversations) sans le modifier.
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode, type RefObject,
} from "react";
import { toast } from "sonner";
import { useSim, useAgents } from "@/lib/sim/store";
import type { AgentMode } from "@/lib/sim/store";
import {
  SEED_DOCS,
  seedJournal, uid,
  type AgentConfig, type AgentsPageCtx, type JournalEntry, type KnowledgeDoc,
} from "./data";
import { Ctx } from "./context-object";

/* ── Configuration par agent (drawer S3) ───────────────────────────────── */
function defaultConfigs(): Record<string, AgentConfig> {
  const mk = (name: string): AgentConfig => ({
    name,
    tone: "Chaleureux",
    langs: ["FR", "AR"],
    signature: "",
    threshold: 85,
    activeFrom: "08:00",
    activeTo: "20:00",
    maxMessages: 6,
    forbidden: [],
    docIds: [],
    escalationKeywords: ["réclamation", "avocat", "remboursement"],
    escalateOnNegative: true,
    escalateAfterExchanges: true,
    escalateTo: "u_owner",
  });
  return {
    ag_router: mk("Router"),
    ag_sales: mk("Commercial"),
    ag_sav: mk("SAV"),
    ag_delivery: mk("Livraison"),
    ag_support: mk("Support"),
    ag_payment: mk("Paiement"),
    ag_supervisor: mk("Superviseur"),
  };
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
      agents.find((a) => a.id === agentId)?.name ?? "Agent",
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

  /* Ajout réel : le fichier choisi par l'utilisateur (nom/taille réels). */
  const addDoc = useCallback((file?: File) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const kind: KnowledgeDoc["kind"] = ext === "pdf" ? "pdf" : ext === "docx" || ext === "doc" ? "docx" : ext === "txt" || ext === "md" ? "txt" : "txt";
    const size = file.size >= 1_048_576
      ? `${(file.size / 1_048_576).toFixed(1).replace(".", ",")} Mo`
      : `${Math.max(1, Math.round(file.size / 1024))} Ko`;
    const doc: KnowledgeDoc = {
      id: uid("doc"),
      name: file.name,
      kind,
      size,
      fragments: 0,
      status: "indexing",
      step: 0,
      progress: 0,
      agents: ["ag_support"],
      addedAt: Date.now(),
      version: "v1.0",
    };
    setDocs((d) => [doc, ...d]);
    toast(`« ${file.name} » téléversé`, { description: "Indexation en cours…" });
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
          const progress = x.progress + 22;
          if (progress < 100) return { ...x, progress };
          if (x.step < 3) return { ...x, step: x.step + 1, progress: 0 };
          return { ...x, status: "indexed" as const, progress: 100, fragments: Math.max(x.fragments, 1) };
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
  const globalJournal = useSim((s) => s.journal);
  const pushGlobalJournal = useSim((s) => s.pushJournal);

  const [localJournal] = useState<JournalEntry[]>(() =>
    seedJournal(
      agents.map((a) => ({ id: a.id, name: a.name })),
      contacts.slice(0, 8).map((c) => c.name),
    ),
  );

  const journal = useMemo(() => [...globalJournal, ...localJournal], [globalJournal, localJournal]);

  const pushJournal = useCallback((e: Omit<JournalEntry, "id" | "at">) => {
    pushGlobalJournal(e);
  }, [pushGlobalJournal]);

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
