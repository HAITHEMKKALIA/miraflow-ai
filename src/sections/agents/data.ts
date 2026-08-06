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

/* ── Base de connaissances (docs seed, agents.md §S4) ──────────────────── */
const NOW = Date.now();
const DAY = 86_400_000;

export const SEED_DOCS: KnowledgeDoc[] = [
  { id: "doc_catalogue", name: "Catalogue produits 2025.pdf", kind: "pdf", size: "2,4 Mo", fragments: 214, status: "indexed", step: 3, progress: 100, agents: ["ag_sales", "ag_support"], addedAt: NOW - 42 * DAY, version: "v3.2" },
  { id: "doc_faq", name: "FAQ livraison & retours.docx", kind: "docx", size: "380 Ko", fragments: 96, status: "indexed", step: 3, progress: 100, agents: ["ag_support", "ag_sales"], addedAt: NOW - 35 * DAY, version: "v1.8" },
  { id: "doc_tarifs", name: "Tarifs et formules.pdf", kind: "pdf", size: "512 Ko", fragments: 74, status: "indexed", step: 3, progress: 100, agents: ["ag_sales", "ag_analyst"], addedAt: NOW - 28 * DAY, version: "v2.0" },
  { id: "doc_tailles", name: "Guide tailles textile.pdf", kind: "pdf", size: "1,1 Mo", fragments: 58, status: "indexed", step: 3, progress: 100, agents: ["ag_support", "ag_tech"], addedAt: NOW - 21 * DAY, version: "v1.4" },
  { id: "doc_privacy", name: "Politique de confidentialité.pdf", kind: "pdf", size: "220 Ko", fragments: 41, status: "indexed", step: 3, progress: 100, agents: ["ag_supervisor"], addedAt: NOW - 18 * DAY, version: "v1.1" },
  { id: "doc_horaires", name: "Horaires & adresses", kind: "url", size: "miraflow.tn/horaires", fragments: 18, status: "indexed", step: 3, progress: 100, agents: ["ag_support", "ag_rdv"], addedAt: NOW - 12 * DAY, version: "sync" },
  { id: "doc_scripts", name: "Scripts de vente Ramadan.docx", kind: "docx", size: "640 Ko", fragments: 132, status: "indexed", step: 3, progress: 100, agents: ["ag_sales", "ag_supervisor"], addedAt: NOW - 8 * DAY, version: "v2.6" },
  { id: "doc_garantie", name: "Garantie & SAV.pdf", kind: "pdf", size: "890 Ko", fragments: 107, status: "indexed", step: 3, progress: 100, agents: ["ag_tech", "ag_support"], addedAt: NOW - 3 * DAY, version: "v1.9" },
];

/** Extraits réels utilisés par le drawer de fragments ET les sources du chat */
export const DOC_EXCERPTS: Record<string, string[]> = {
  doc_catalogue: [
    "Coffret Aid « Découverte » — 24 pièces assorties : baklava pistache, makroudh, samsa aux amandes, cornes de gazelle. Prix : 68 TND. Stock limité à 300 coffrets.",
    "Baklava aux pistaches — boîte 500 g : 42 TND, boîte 1 kg : 78 TND. Conservation 10 jours à température ambiante.",
    "Pièce montée sur commande — à partir de 320 TND, délai 10 jours ouvrés, personnalisation incluse.",
    "Coffret « Prestige » — 48 pièces + coffret en bois d'olivier gravé : 145 TND. Gravure prénom offerte jusqu'au 12 juin.",
    "Makroudh au miel — barquette 400 g : 18 TND. Disponible aussi en version sans gluten sur précommande 48 h.",
    "Collection Ramadan 2025 — 12 nouveautés dont la corne de gazelle à la fleur d'oranger et le kaak warka.",
  ],
  doc_faq: [
    "Livraison sur le Grand Tunis : 7 TND, offerte dès 120 TND d'achat. Créneaux : 10 h–13 h et 15 h–19 h.",
    "Livraison Sfax, Sousse, Nabeul et Bizerte via transporteur (24–48 h) : 12 TND. Les coffrets fragiles voyagent en emballage renforcé.",
    "Retours acceptés sous 48 h pour tout produit non entamé, remboursement sous 5 jours ouvrés.",
    "Livraison en France métropolitaine (DHL 3–5 jours) : 24 TND, offerte dès 200 TND. Frais de douane inclus.",
    "Suivi de commande : un lien de suivi est envoyé par message dès l'expédition du colis.",
    "En cas de colis annoncé livré mais non reçu, une réclamation transporteur est ouverte sous 2 h.",
  ],
  doc_tarifs: [
    "Formule Traiteur événement : à partir de 9 TND/pers. (minimum 30 pers.), dégustation offerte pour les mariages.",
    "Tarif dégressif quantités : -5 % dès 5 kg, -10 % dès 10 kg sur les assortiments classiques.",
    "Abonnement entreprise « Coffee Break » : 4 livraisons/mois de douceurs, 190 TND/mois hors livraison.",
    "Carte cadeau : montants 30 / 50 / 100 TND, valable 12 mois en boutique et en ligne.",
  ],
  doc_tailles: [
    "Guide des tailles textile (partenaire) : XS = 84 cm, S = 90 cm, M = 96 cm, L = 102 cm, XL = 108 cm de tour de poitrine.",
    "En cas d'hésitation entre deux tailles, prendre la taille au-dessus pour les tissus non stretch.",
  ],
  doc_privacy: [
    "Les conversations sont chiffrées en transit et au repos. Conservation : 24 mois puis anonymisation.",
    "Conformément au RGPD, tout contact peut demander l'export ou la suppression de ses données.",
  ],
  doc_horaires: [
    "Boutique Lafayette : lun–sam 8 h–20 h, dim 9 h–13 h. 14 rue de la Kasbah, Tunis.",
    "Boutique Les Berges du Lac : lun–sam 9 h–19 h. Pendant Ramadan : 10 h–17 h puis 21 h–23 h.",
    "Atelier (visites sur rendez-vous) : mer–sam 10 h–16 h, 8 impasse des Jasmins, Ariana.",
  ],
  doc_scripts: [
    "Accroche Ramadan : « Nos coffrets partent vite en fin de journée — je vous en mets un de côté ? »",
    "Relance panier : rappeler le produit + proposer la livraison offerte dès 120 TND plutôt qu'une remise directe.",
    "Objection prix : valoriser le fait-main, le grammage généreux et le coffret offert dès 3 boîtes.",
  ],
  doc_garantie: [
    "Garantie matériel partenaire : 12 mois pièces et main-d'œuvre, échange sous 72 h en cas de défaut confirmé.",
    "Diagnostic SAV niveau 1 : vérifier l'alimentation, redémarrer l'appareil, tester avec un autre câble.",
    "Si le diagnostic niveau 1 échoue, créer un ticket SAV avec photos et numéro de série.",
  ],
};

/** Pool de noms pour les documents ajoutés via la dropzone */
export const UPLOAD_POOL: { name: string; kind: KnowledgeDoc["kind"]; size: string; fragments: number }[] = [
  { name: "Menu traiteur été 2025.pdf", kind: "pdf", size: "1,8 Mo", fragments: 142 },
  { name: "Questions fréquentes boutique.txt", kind: "txt", size: "24 Ko", fragments: 36 },
  { name: "Lookbook collection soie.pdf", kind: "pdf", size: "3,2 Mo", fragments: 188 },
  { name: "Conditions de vente.docx", kind: "docx", size: "290 Ko", fragments: 64 },
];

export const PIPELINE_STEPS = ["Téléversement", "Extraction", "Fragmentation", "Indexation"] as const;

/* ── Moteur de réponses simulées du chat de test (agents.md §S5) ───────── */
interface Rule {
  keywords: string[];
  text: string;
  base: number;
  sources: [string, number][]; // [docId, fragmentNum]
  agents?: string[]; // agents boostés sur ce sujet
}

const RULES: Rule[] = [
  {
    keywords: ["coffret", "aid", "aïd", "découverte", "decouverte"],
    text: "Oui ! Le coffret Aid « Découverte » (24 pièces : baklava pistache, makroudh, samsa et cornes de gazelle) est à 68 TND. Il en reste en stock — je peux vous en réserver un pour retrait ou livraison aujourd'hui. Souhaitez-vous que je vous confirme un créneau ?",
    base: 94,
    sources: [["doc_catalogue", 112], ["doc_tarifs", 31]],
    agents: ["ag_sales", "ag_support"],
  },
  {
    keywords: ["livraison", "livrer", "livrez", "sfax", "expédier", "expédition", "colis", "france"],
    text: "Nous livrons sur le Grand Tunis (7 TND, offert dès 120 TND) en créneaux 10 h–13 h et 15 h–19 h, et à Sfax, Sousse, Nabeul et Bizerte en 24–48 h via transporteur (12 TND, emballage renforcé). Pour la France : DHL 3–5 jours, 24 TND. Je vous propose le premier créneau disponible ?",
    base: 92,
    sources: [["doc_faq", 8], ["doc_horaires", 4]],
    agents: ["ag_support", "ag_sales"],
  },
  {
    keywords: ["prix", "tarif", "combien", "coûte", "coute", "cher"],
    text: "Voici les repères de prix : baklava pistache 42 TND les 500 g (78 TND le kilo), makroudh au miel 18 TND les 400 g, coffret Découverte 68 TND. À partir de 5 kg d'assortiment, une remise de 5 % s'applique (-10 % dès 10 kg). Voulez-vous un devis précis ?",
    base: 90,
    sources: [["doc_tarifs", 12], ["doc_catalogue", 87]],
    agents: ["ag_sales"],
  },
  {
    keywords: ["horaire", "ouvert", "adresse", "ramadan", "fermé", "ferme"],
    text: "La boutique Lafayette est ouverte lun–sam 8 h–20 h et dim 9 h–13 h (14 rue de la Kasbah, Tunis) ; Les Berges du Lac lun–sam 9 h–19 h. Pendant Ramadan : 10 h–17 h puis 21 h–23 h. Je peux aussi vous proposer un retrait à l'atelier d'Ariana sur rendez-vous.",
    base: 95,
    sources: [["doc_horaires", 4]],
    agents: ["ag_support", "ag_rdv"],
  },
  {
    keywords: ["rendez-vous", "rdv", "créneau", "creneau", "réserver", "reserver", "atelier", "visite"],
    text: "Avec plaisir ! L'atelier d'Ariana reçoit du mercredi au samedi, 10 h–16 h. Prochains créneaux : jeudi 11 h, jeudi 15 h 30 ou samedi 10 h. Lequel vous convient ? Je confirme immédiatement et vous envoie un rappel la veille.",
    base: 93,
    sources: [["doc_horaires", 9]],
    agents: ["ag_rdv"],
  },
  {
    keywords: ["garantie", "sav", "panne", "cassé", "casse", "défaut", "defaut", "réparer", "reparer"],
    text: "Le matériel partenaire est garanti 12 mois pièces et main-d'œuvre, avec échange sous 72 h si le défaut est confirmé. Démarrons le diagnostic niveau 1 : 1) vérifiez l'alimentation, 2) redémarrez l'appareil, 3) testez avec un autre câble. Si le souci persiste, je crée un ticket SAV avec vos photos.",
    base: 86,
    sources: [["doc_garantie", 21]],
    agents: ["ag_tech"],
  },
  {
    keywords: ["taille", "mesure", "pointure"],
    text: "Pour le textile partenaire : XS = 84 cm, S = 90 cm, M = 96 cm, L = 102 cm, XL = 108 cm de tour de poitrine. Entre deux tailles, prenez celle au-dessus pour les tissus non stretch. Je peux noter votre préférence pour la prochaine commande.",
    base: 88,
    sources: [["doc_tailles", 5]],
    agents: ["ag_support"],
  },
  {
    keywords: ["tendance", "chiffre", "activité", "activite", "semaine", "statistique", "campagne", "résumé", "resume"],
    text: "Cette semaine : 412 conversations traitées (+18 %), pic entre 17 h et 20 h, taux de réponse automatique de 68 %. Le coffret Aid génère 34 % des demandes — je suggère une campagne de relance ciblée « clients inactifs 30 j » vendredi 10 h. Je vous prépare le brouillon ?",
    base: 89,
    sources: [["doc_scripts", 41]],
    agents: ["ag_analyst"],
  },
  {
    keywords: ["réclamation", "reclamation", "avocat", "rembours", "arnaqu", "honteux", "inacceptable", "plainte"],
    text: "Je comprends tout à fait votre mécontentement, et je suis désolé de cette situation. Plutôt que de risquer une mauvaise réponse, je préfère vous mettre en relation immédiate avec un membre de l'équipe qui traitera votre demande en priorité. Je transfère la conversation dès maintenant.",
    base: 62,
    sources: [["doc_faq", 44]],
    agents: ["ag_supervisor"],
  },
];

const FALLBACK = {
  text: "Bonne question ! D'après notre base de connaissances, je peux vous renseigner sur les produits, prix, horaires, livraisons, garanties et rendez-vous. Pourriez-vous préciser votre demande ? Si vous préférez, je vous transfère à un membre de l'équipe.",
  base: 71,
  sources: [["doc_catalogue", 2]] as [string, number][],
};

/** Persona → ajustement de confiance */
const PERSONA_DELTA: Record<Persona, number> = { vip: 2, nouveau: -4, frustre: -12 };

function toSources(pairs: [string, number][], hasDocs: boolean): ChatSource[] {
  if (!hasDocs) return [];
  return pairs.map(([docId, num]) => {
    const excerpts = DOC_EXCERPTS[docId] ?? ["Fragment indexé."];
    const excerpt = excerpts[num % excerpts.length];
    const doc = SEED_DOCS.find((d) => d.id === docId);
    return {
      docId,
      docName: doc?.name.replace(/\.(pdf|docx|txt)$/, "") ?? "Document",
      frag: `#${String(num).padStart(2, "0")}`,
      excerpt: `${excerpt} (${doc?.version ?? "v1.0"})`,
    };
  });
}

const clampConf = (v: number) => Math.max(41, Math.min(98, v));

/* ── Agent Traduction (ag_translate) ───────────────────────────────────── */
const AR_RE = /[؀-ۿ]/;
const EN_RE = /\b(the|is|are|you|hello|hi|please|thank|order|delivery|price|much)\b/i;

function craftTranslation(question: string, persona: Persona): { text: string; confidence: number; sources: ChatSource[] } {
  const snippet = question.length > 90 ? `${question.slice(0, 87)}…` : question;
  let body: string;
  if (AR_RE.test(question)) {
    body = `Traduction (AR → FR) :\n« Bonjour ! Est-ce que ce produit est toujours disponible ? Et quel est le délai de livraison sur Tunis ? »\n\nTraduction (AR → EN) :\n« Hello! Is this product still available? And what's the delivery time to Tunis? »`;
  } else if (EN_RE.test(question)) {
    body = `Traduction (EN → FR) :\n« Bonjour ! Les coffrets sont-ils toujours disponibles ? Je peux confirmer ma commande aujourd'hui avec une livraison demain. »\n\nTraduction (EN → AR) :\n« مرحباً! هل ما زالت الصناديق متوفرة؟ يمكنني تأكيد طلبي اليوم مع التوصيل غداً. »`;
  } else {
    body = `Traduction (FR → AR) :\n« مرحباً! هل ما زالت صناديق العيد متوفرة؟ يمكنني تأكيد طلبكم اليوم مع التوصيل غداً. »\n\nTraduction (FR → EN) :\n« Hello! Are the Eid gift boxes still available? I can confirm your order today with delivery tomorrow. »`;
  }
  return {
    text: `Message analysé : « ${snippet} »\n\n${body}\n\nLangue source détectée automatiquement — la traduction est prête à insérer dans l'inbox, le message original reste inchangé.`,
    confidence: clampConf(96 + PERSONA_DELTA[persona]),
    sources: [],
  };
}

/* ── Agent Analyse d'images (ag_vision) ────────────────────────────────── */
const VISION_ANALYSES = [
  "Analyse de l'image reçue :\n• Sujet : coffret de pâtisseries orientales (baklava pistache, cornes de gazelle, makroudh) sur plateau doré, photo nette.\n• Produits identifiés : Coffret Aid « Découverte » (24 pièces), boîte de baklava 500 g.\n• Prix visibles : 68 TND (étiquette coffret), 42 TND (boîte 500 g).\n• Texte détecté : « Offre Aid — livraison offerte dès 120 TND ».\n\nSuggestion : répondre avec la fiche du coffret et proposer un créneau de livraison.",
  "Analyse de l'image reçue :\n• Sujet : pièce montée de mariage à 3 étages, décor fleurs d'oranger, prise en boutique.\n• Produits identifiés : pièce montée sur commande (réf. catalogue « Prestige »).\n• Prix visibles : « à partir de 320 TND » sur le cartel.\n• Texte détecté : « Sur commande — délai 10 jours ».\n\nSuggestion : confirmer la date de l'événement et envoyer le formulaire de devis.",
] as const;

function craftVision(question: string, persona: Persona, hasDocs: boolean): { text: string; confidence: number; sources: ChatSource[] } {
  const variant = question.length % 2;
  return {
    text: VISION_ANALYSES[variant],
    confidence: clampConf(91 + PERSONA_DELTA[persona]),
    sources: toSources([["doc_catalogue", 112]], hasDocs),
  };
}

export function craftAnswer(
  agentId: string,
  question: string,
  persona: Persona,
  hasDocs: boolean,
): { text: string; confidence: number; sources: ChatSource[] } {
  if (agentId === "ag_translate") return craftTranslation(question, persona);
  if (agentId === "ag_vision") return craftVision(question, persona, hasDocs);

  const q = question.toLowerCase();
  const rule = RULES.find((r) => r.keywords.some((k) => q.includes(k)));
  let confidence = (rule ? rule.base : FALLBACK.base) + PERSONA_DELTA[persona];
  if (rule && rule.agents && !rule.agents.includes(agentId)) confidence -= 8;
  if (rule && rule.agents && rule.agents.includes(agentId)) confidence += 2;
  if (!hasDocs) confidence = Math.min(confidence, 58);
  confidence = clampConf(confidence);

  const sources = toSources(rule ? rule.sources : FALLBACK.sources, hasDocs);

  const prefix = persona === "frustre" ? "Je comprends votre agacement. " : persona === "vip" ? "Ravi de vous retrouver, Yasmine ! " : "";
  return { text: prefix + (rule ? rule.text : FALLBACK.text), confidence, sources };
}

/** 3 questions suggérées, renouvelées à chaque réponse */
export const QUESTION_POOL = [
  "Avez-vous le coffret Aid en livraison à Sfax ?",
  "Quels sont vos horaires pendant Ramadan ?",
  "Le baklava est à combien le kilo ?",
  "Puis-je réserver un atelier pour 8 personnes ?",
  "Comment fonctionne la garantie ?",
  "Je veux être remboursé, c'est urgent !",
  "Faites-vous des cartes cadeaux ?",
  "Un résumé de l'activité de la semaine ?",
  "Livrez-vous en France ?",
];

export function pickQuestions(offset: number): string[] {
  return [0, 1, 2].map((i) => QUESTION_POOL[(offset * 3 + i) % QUESTION_POOL.length]);
}

/* ── Seeds : file de validation + journal IA ───────────────────────────── */
export const SEED_SUGGESTION_TEXTS = [
  "Bonjour ! Oui, il reste des coffrets Découverte — je peux vous en réserver un pour retrait aujourd'hui entre 15 h et 19 h. Cela vous convient ?",
  "Merci pour votre message ! La livraison sur La Marsa est possible ce soir avant 19 h (7 TND, offerte dès 120 TND). Souhaitez-vous un créneau ?",
  "Bien sûr, 30 makroudh pour samedi c'est faisable — le tarif dégressif de -5 % s'applique. Je vous confirme la commande par message ?",
];

export function seedJournal(agents: { id: string; name: string }[], contacts: string[]): JournalEntry[] {
  const actions: JournalEntry["action"][] = ["Suggestion", "Réponse auto", "Escalade", "Suggestion", "Réponse auto", "Suggestion", "Suggestion", "Réponse auto", "Escalade", "Suggestion", "Réponse auto", "Suggestion"];
  const decisions: JournalEntry["decision"][] = ["Approuvée", "—", "Approuvée", "Modifiée", "—", "Rejetée", "Approuvée", "—", "Modifiée", "Approuvée", "—", "En attente"];
  return actions.map((action, i) => {
    const agent = agents[i % agents.length];
    return {
      id: `j_seed_${i}`,
      at: NOW - (8 + i * 14) * 60_000,
      agentId: agent.id,
      agentName: agent.name,
      conversation: contacts[(i * 2 + 1) % contacts.length],
      action,
      confidence: 72 + ((i * 7) % 26),
      decision: decisions[i],
      latencyS: Math.round((0.8 + ((i * 37) % 160) / 100) * 10) / 10,
    };
  });
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
