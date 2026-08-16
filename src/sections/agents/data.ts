/**
 * Données & helpers de la page Agents IA (agents.md).
 * Méta des 6 agents (icône, couleur, salutation), base de connaissances RAG
 * (documents + fragments), moteur de réponses simulées du chat de test,
 * seeds de la file de validation et du journal d'activité IA.
 */
import {
  Briefcase, CalendarCheck, ChartLine, Headset, Languages, ScanSearch, ShieldCheck, Wrench,
  type LucideIcon,
} from "lucide-react";
import type { RefObject } from "react";
import type { AgentMode, AiAgent } from "@/lib/sim/store";

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
  escalations: number;
  spark: number[];
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

export type Persona = "vip" | "nouveau" | "frustre";

export const PERSONAS: { id: Persona; label: string; hint: string }[] = [
  { id: "vip", label: "Yasmine VIP", hint: "Cliente fidèle, ton chaleureux" },
  { id: "nouveau", label: "Nouveau visiteur", hint: "Découvre la boutique" },
  { id: "frustre", label: "Client frustré", hint: "Ton tendu, escalade probable" },
];

/* ── Méta des 6 agents (couleurs agents.md §S2) ────────────────────────── */
export const AGENT_META: Record<string, AgentMeta> = {
  ag_sales: {
    icon: Briefcase, color: "iris",
    role: "Qualifie, recommande des produits, relance au bon moment.",
    greeting: "Bonjour, je suis l'agent Commercial. Posez-moi une question sur vos produits, vos offres ou vos relances.",
    thinking: ["Analyse du profil client…", "Recherche dans Catalogue produits…", "Préparation d'une recommandation…"],
    escalations: 7, spark: [12, 18, 15, 22, 28, 24, 31],
  },
  ag_support: {
    icon: Headset, color: "pulse",
    role: "Répond aux questions fréquentes en citant la base de connaissances.",
    greeting: "Bonjour, je suis l'agent Support. Je réponds à vos questions en citant la base de connaissances.",
    thinking: ["Recherche dans la FAQ…", "Lecture du fragment pertinent…", "Rédaction de la réponse…"],
    escalations: 12, spark: [22, 26, 31, 28, 35, 33, 40],
  },
  ag_tech: {
    icon: Wrench, color: "mint",
    role: "Guide les diagnostics pas à pas, crée des tickets.",
    greeting: "Bonjour, je suis l'agent Technique. Décrivez-moi un problème, je guide le diagnostic pas à pas.",
    thinking: ["Analyse du symptôme…", "Consultation de Garantie & SAV…", "Construction du diagnostic…"],
    escalations: 5, spark: [4, 7, 5, 9, 8, 11, 10],
  },
  ag_rdv: {
    icon: CalendarCheck, color: "amber",
    role: "Propose des créneaux, confirme et rappelle.",
    greeting: "Bonjour, je suis l'agent Rendez-vous. Demandez-moi un créneau, je propose et confirme.",
    thinking: ["Lecture du planning…", "Vérification des disponibilités…", "Proposition de créneaux…"],
    escalations: 3, spark: [8, 12, 10, 14, 18, 16, 21],
  },
  ag_supervisor: {
    icon: ShieldCheck, color: "rose",
    role: "Surveille la qualité, détecte les frustrations, route vers un humain.",
    greeting: "Bonjour, je suis le Superviseur. Je surveille la qualité des échanges et j'escalade quand il le faut.",
    thinking: ["Analyse du sentiment…", "Évaluation de la qualité…", "Vérification des règles d'escalade…"],
    escalations: 28, spark: [30, 34, 32, 38, 41, 39, 46],
  },
  ag_analyst: {
    icon: ChartLine, color: "hi",
    role: "Résume l'activité, détecte les tendances, suggère des campagnes.",
    greeting: "Bonjour, je suis l'Analyste. Interrogez-moi sur votre activité, vos tendances ou vos campagnes.",
    thinking: ["Agrégation des métriques…", "Détection de tendances…", "Rédaction du résumé…"],
    escalations: 2, spark: [3, 5, 4, 6, 9, 7, 12],
  },
  ag_translate: {
    icon: Languages, color: "mint",
    role: "Traduit instantanément les messages FR ⇄ AR ⇄ EN dans l'inbox.",
    greeting: "Bonjour, je suis l'agent Traduction. Envoyez-moi un message en français, arabe ou anglais — je le traduis instantanément, prêt à insérer dans l'inbox.",
    thinking: ["Détection de la langue source…", "Traduction neuronale locale…", "Vérification terminologique…"],
    escalations: 1, spark: [18, 24, 21, 30, 34, 32, 41],
  },
  ag_vision: {
    icon: ScanSearch, color: "iris",
    role: "Décrit les images reçues, identifie produits et prix visibles.",
    greeting: "Bonjour, je suis l'agent Analyse d'images. Décrivez-moi une image reçue ou demandez une analyse — j'en extrais produits, prix et texte visible.",
    thinking: ["Chargement de l'image…", "Détection des objets et du texte…", "Extraction des produits et prix…"],
    escalations: 2, spark: [6, 9, 8, 12, 15, 13, 19],
  },
};

/**
 * Deux agents locaux ajoutés à l'affichage (le SimEngine, en lecture seule,
 * n'en porte que 6) : même design de carte, mêmes interactions (toggle de
 * mode, pause, config, test) via les métas ci-dessus et les configs du
 * contexte.
 */
export const EXTRA_AGENTS: AiAgent[] = [
  {
    id: "ag_translate",
    name: "Traduction",
    tagline: "FR ⇄ AR ⇄ EN instantané dans l'inbox.",
    mode: "autonomous",
    confidence: 96,
    handled: 2134,
  },
  {
    id: "ag_vision",
    name: "Analyse d'images",
    tagline: "Décrit les images reçues, extrait produits et prix.",
    mode: "suggestion",
    confidence: 89,
    handled: 764,
  },
];

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

/** Pool de noms pour les documents ajoutés via la dropzone */
export const UPLOAD_POOL: { name: string; kind: KnowledgeDoc["kind"]; size: string; fragments: number }[] = [
  { name: "Menu traiteur été 2025.pdf", kind: "pdf", size: "1,8 Mo", fragments: 142 },
  { name: "Questions fréquentes boutique.txt", kind: "txt", size: "24 Ko", fragments: 36 },
  { name: "Lookbook collection soie.pdf", kind: "pdf", size: "3,2 Mo", fragments: 188 },
  { name: "Conditions de vente.docx", kind: "docx", size: "290 Ko", fragments: 64 },
];

export const PIPELINE_STEPS = ["Téléversement", "Extraction", "Fragmentation", "Indexation"] as const;

const FALLBACK = {
  text: "Connectez un fournisseur LLM (OpenAI / Anthropic / Gemini) dans les paramètres pour activer les réponses IA. Transférez vers un humain si besoin.",
  base: 0,
  sources: [] as [string, number][],
};

const PERSONA_DELTA: Record<Persona, number> = { vip: 0, nouveau: 0, frustre: 0 };

const clampConf = (v: number) => Math.max(41, Math.min(98, v));

function craftTranslation(question: string, _persona: Persona): { text: string; confidence: number; sources: ChatSource[] } {
  return {
    text: `Traduction requiert un fournisseur LLM configuré. Message original : « ${question.length > 120 ? question.slice(0, 117) + "…" : question} »`,
    confidence: 0,
    sources: [],
  };
}

function craftVision(question: string, _persona: Persona, _hasDocs: boolean): { text: string; confidence: number; sources: ChatSource[] } {
  return {
    text: `Analyse d'images inactive : connectez un modèle vision. Reçu : « ${question.length > 120 ? question.slice(0, 117) + "…" : question} »`,
    confidence: 0,
    sources: [],
  };
}

export function craftAnswer(
  agentId: string,
  question: string,
  persona: Persona,
  _hasDocs: boolean,
): { text: string; confidence: number; sources: ChatSource[] } {
  if (agentId === "ag_translate") return craftTranslation(question, persona);
  if (agentId === "ag_vision") return craftVision(question, persona, _hasDocs);

  const confidence = clampConf(FALLBACK.base + PERSONA_DELTA[persona]);
  const prefix = persona === "frustre" ? "" : persona === "vip" ? "" : "";
  return { text: prefix + FALLBACK.text, confidence, sources: [] };
}

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
