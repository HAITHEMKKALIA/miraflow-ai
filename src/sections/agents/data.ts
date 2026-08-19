/**
 * Données & helpers de la page Agents IA (agents.md).
 * Méta des agents (icône, couleur, salutation), types de la base de
 * connaissances RAG et réponses de repli honnêtes du chat de test
 * (message invitant à configurer un fournisseur LLM — aucune donnée
 * applicative fabriquée).
 */
import {
  Briefcase, CalendarCheck, ChartLine, Headset, ScanSearch, ShieldCheck, Wrench,
  type LucideIcon,
} from "lucide-react";
import type { RefObject } from "react";
import type { AgentMode } from "@/lib/sim/store";

/* ── Types ─────────────────────────────────────────────────────────────── */
export type AgentColor = "iris" | "pulse" | "mint" | "amber" | "rose" | "hi";

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

export interface AgentMeta {
  icon: LucideIcon;
  color: AgentColor;
  role: string;
  greeting: string;
  thinking: string[];
}

export interface KnowledgeDoc {
  id: string;
  name: string;
  kind: "pdf" | "docx" | "txt" | "url";
  size: string;
  fragments: number;
  status: "indexed" | "indexing";
  /** 0 → 3 : Téléversement, Extraction, Fragmentation, Indexation */
  step: number;
  progress: number; // % de l'étape courante
  agents: string[]; // ids d'agents liés
  addedAt: number;
  version: string;
}

export interface DocFragment {
  id: string;
  docId: string;
  num: number;
  text: string;
}

export interface ChatSource {
  docId: string;
  docName: string;
  frag: string;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  from: "user" | "agent" | "system";
  text: string;
  confidence?: number;
  sources?: ChatSource[];
  feedback?: "up" | "down";
}

export interface JournalEntry {
  id: string;
  at: number;
  agentId: string;
  agentName: string;
  conversation: string;
  action: "Suggestion" | "Réponse auto" | "Escalade";
  confidence: number;
  decision: "Approuvée" | "Modifiée" | "Rejetée" | "En attente" | "—";
  latencyS: number;
}

/* ── Type du contexte ──────────────────────────────────────────────────── */
export interface AgentsPageCtx {
  modes: Record<string, AgentMode>;
  paused: Record<string, boolean>;
  toggleMode: (agentId: string) => void;
  togglePaused: (agentId: string) => void;
  setAllModes: (mode: AgentMode) => void;
  autonomousCount: number;

  threshold: number;
  setThreshold: (v: number) => void;

  docs: KnowledgeDoc[];
  addDoc: (file?: File) => void;
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

export type Persona = "vip" | "nouveau" | "frustre";

export const PERSONAS: { id: Persona; label: string; hint: string }[] = [
  { id: "vip", label: "Yasmine VIP", hint: "Cliente fidèle, ton chaleureux" },
  { id: "nouveau", label: "Nouveau visiteur", hint: "Découvre la boutique" },
  { id: "frustre", label: "Client frustré", hint: "Ton tendu, escalade probable" },
];

/* ── Méta des 7 agents par défaut (couleurs agents.md §S2) ─────────────── */
export const AGENT_META: Record<string, AgentMeta> = {
  ag_router: {
    icon: ScanSearch, color: "hi",
    role: "Détecte la langue et l'intention, route vers le bon agent.",
    greeting: "Bonjour, je suis le Router. J'analyse chaque message entrant et je le route vers le bon agent.",
    thinking: ["Détection de la langue…", "Analyse de l'intention…", "Routage vers l'agent pertinent…"],
  },
  ag_sales: {
    icon: Briefcase, color: "iris",
    role: "Qualifie, recommande des produits, relance au bon moment.",
    greeting: "Bonjour, je suis l'agent Commercial. Posez-moi une question sur vos produits, vos offres ou vos relances.",
    thinking: ["Analyse du profil client…", "Recherche dans le catalogue produits…", "Préparation d'une recommandation…"],
  },
  ag_sav: {
    icon: Wrench, color: "mint",
    role: "Traite réclamations, retours et garanties, crée des tickets.",
    greeting: "Bonjour, je suis l'agent SAV. Décrivez-moi une réclamation ou une demande de retour.",
    thinking: ["Analyse de la réclamation…", "Vérification de la garantie…", "Création du ticket…"],
  },
  ag_delivery: {
    icon: CalendarCheck, color: "amber",
    role: "Suit les colis, livreurs, numéros de tracking et ETA.",
    greeting: "Bonjour, je suis l'agent Livraison. Demandez-moi le statut d'une commande ou d'un colis.",
    thinking: ["Recherche de la livraison…", "Vérification du tracking…", "Estimation de l'ETA…"],
  },
  ag_support: {
    icon: Headset, color: "pulse",
    role: "Répond aux questions fréquentes en citant la base de connaissances.",
    greeting: "Bonjour, je suis l'agent Support. Je réponds à vos questions en citant la base de connaissances.",
    thinking: ["Recherche dans la base de connaissances…", "Lecture du fragment pertinent…", "Rédaction de la réponse…"],
  },
  ag_payment: {
    icon: ChartLine, color: "hi",
    role: "Vérifie les paiements, factures et remboursements.",
    greeting: "Bonjour, je suis l'agent Paiement. Posez-moi une question sur un paiement ou une facture.",
    thinking: ["Vérification du paiement…", "Recherche de la facture…", "Rédaction de la réponse…"],
  },
  ag_supervisor: {
    icon: ShieldCheck, color: "rose",
    role: "Surveille la qualité, détecte les frustrations, route vers un humain.",
    greeting: "Bonjour, je suis le Superviseur. Je surveille la qualité des échanges et j'escalade quand il le faut.",
    thinking: ["Analyse du sentiment…", "Évaluation de la qualité…", "Vérification des règles d'escalade…"],
  },
};

/** Classes Tailwind énumérées par couleur d'agent (JIT safe) */
export const COLOR_STYLES: Record<
  AgentColor,
  { text: string; bg: string; border: string; orb: string; glow: string; bar: string }
> = {
  iris: {
    text: "text-iris", bg: "bg-iris/10", border: "border-iris/40",
    orb: "border-iris/35 bg-[radial-gradient(circle_at_35%_30%,rgba(255,90,78,.35),rgba(255,90,78,.05)_70%)]",
    glow: "shadow-glow-iris", bar: "bg-iris",
  },
  pulse: {
    text: "text-pulse", bg: "bg-pulse/10", border: "border-pulse/40",
    orb: "border-pulse/35 bg-[radial-gradient(circle_at_35%_30%,rgba(255,159,46,.32),rgba(255,159,46,.05)_70%)]",
    glow: "", bar: "bg-pulse",
  },
  mint: {
    text: "text-mint", bg: "bg-mint/10", border: "border-mint/40",
    orb: "border-mint/35 bg-[radial-gradient(circle_at_35%_30%,rgba(13,186,155,.32),rgba(13,186,155,.05)_70%)]",
    glow: "shadow-glow-mint", bar: "bg-mint",
  },
  amber: {
    text: "text-amber", bg: "bg-amber/10", border: "border-amber/40",
    orb: "border-amber/35 bg-[radial-gradient(circle_at_35%_30%,rgba(255,180,84,.32),rgba(255,180,84,.05)_70%)]",
    glow: "", bar: "bg-amber",
  },
  rose: {
    text: "text-rose", bg: "bg-rose/10", border: "border-rose/40",
    orb: "border-rose/35 bg-[radial-gradient(circle_at_35%_30%,rgba(255,107,129,.32),rgba(255,107,129,.05)_70%)]",
    glow: "", bar: "bg-rose",
  },
  hi: {
    text: "text-hi", bg: "bg-surface-3", border: "border-line-strong",
    orb: "border-line-strong bg-[radial-gradient(circle_at_35%_30%,rgba(242,245,255,.18),rgba(242,245,255,.03)_70%)]",
    glow: "", bar: "bg-hi",
  },
};

export const SEED_DOCS: KnowledgeDoc[] = [];

export const DOC_EXCERPTS: Record<string, string[]> = {};

export const PIPELINE_STEPS = ["Téléversement", "Extraction", "Fragmentation", "Indexation"] as const;

export const QUESTION_POOL: string[] = [];

export function pickQuestions(_offset: number): string[] {
  return [];
}

export const SEED_SUGGESTION_TEXTS: string[] = [];

export function seedJournal(_agents: { id: string; name: string }[], _contacts: string[]): JournalEntry[] {
  return [];
}

/* ── Helpers ───────────────────────────────────────────────────────────── */
let localUid = 0;
export const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(++localUid).toString(36)}`;

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export const fmtNum = (v: number) => v.toLocaleString("fr-FR");

export function modeLabel(mode: AgentMode): string {
  return mode === "autonomous" ? "Autonome" : "Suggestion";
}

/** % de réponses escaladées en fonction du seuil (formule pédagogique) */
export function escalationRate(threshold: number): number {
  return Math.max(1, Math.round(100 - threshold * 1.12));
}
