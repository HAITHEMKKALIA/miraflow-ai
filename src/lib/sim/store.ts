/**
 * SimEngine — moteur de simulation temps réel de MiraFlow AI (design.md §7).
 *
 * Store Zustand unique consommé par TOUTES les pages app. Aucune donnée ne
 * vient d'un backend : des émetteurs pseudo-aléatoires DÉTERMINISTES (seed
 * fixe → comportement stable de démo) font vivre le produit.
 *
 * ── Hooks exportés (sélecteurs) ──────────────────────────────────────────
 *   useSim()                → le store complet (à éviter dans les listes)
 *   useOrg()                → organisation courante (« Pâtisserie Dar El Baraka »)
 *   useTeam()               → 5 membres d'équipe
 *   useSessions()           → 3 sessions QR (statut, latence, uptime)
 *   useContacts()           → 48 contacts CRM
 *   useConversations()      → 12 conversations (thread inclus)
 *   useConversation(id)     → une conversation
 *   useCampaigns()          → 4 campagnes (compteurs vivants)
 *   useWorkflows()          → 4 workflows (+ journal d'exécution live)
 *   useAgents()             → 6 agents IA
 *   useSuggestions()        → file de suggestions IA (validation humaine)
 *   useTenants()            → tenants Super Admin
 *   useKpis()               → { messagesToday, responseRate, … } (tiquent)
 *   useChartSeries()        → série messages/heure (24 points, vit à 3s)
 *   useNotifications()      → notifications topbar (cloche)
 *   useActivity()           → fil d'activité (dashboard)
 *
 * ── Actions exportées ────────────────────────────────────────────────────
 *   sendMessage(conversationId, body)     → ajoute un message sortant (statuts simulés)
 *   setConversationStatus(id, status)     → ouvert / en attente / résolu…
 *   markConversationRead(id)              → remet les non-lus à zéro
 *   saveDraft(id, text) / clearDraft(id)  → brouillons composer (persistés)
 *   pauseCampaign(id) / resumeCampaign(id) / stopCampaign(id)
 *   toggleWorkflow(id)
 *   acceptSuggestion(id) / rejectSuggestion(id)
 *   markNotificationRead(id) / markAllNotificationsRead()
 *   startSimEngine() / stopSimEngine()    → boucle des émetteurs (App.tsx)
 *
 * Persistance localStorage (clé "mf:sim") : brouillons + suggestions traitées.
 * Les émetteurs se mettent en pause quand l'onglet est caché.
 */
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { persist } from "zustand/middleware";

/* ════════════════════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════════════════════ */
export type MsgStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type MsgDirection = "in" | "out";
export type ConvStatus = "new" | "open" | "pending" | "resolved" | "archived";
export type CrmStage = "prospect" | "interested" | "client" | "loyal" | "lost";
export type SessionStatus = "connected" | "unstable" | "disconnected";
export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "done" | "stopped";
export type WorkflowStatus = "active" | "paused" | "draft";
export type AgentMode = "suggestion" | "autonomous";
export type PlanId = "starter" | "business" | "agency" | "enterprise";

export interface Message {
  id: string;
  conversationId: string;
  direction: MsgDirection;
  body: string;
  at: number;
  status: MsgStatus;
  kind: "text" | "image";
  mediaUrl?: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  status: ConvStatus;
  unread: number;
  assigneeId?: string;
  sessionId: string;
  thread: Message[];
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  city: string;
  tags: string[];
  score: number;
  stage: CrmStage;
  consent: boolean;
  lastContactAt: number;
}

export interface QrSession {
  id: string;
  name: string;
  status: SessionStatus;
  uptime: number; // %
  latencyMs: number;
  phone: string;
  connectedAt?: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  online: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  audience: string;
  total: number;
  sent: number;
  delivered: number;
  replies: number;
  failed: number;
  scheduledAt?: number;
  mediaUrl?: string;
}

export interface WorkflowNode {
  id: string;
  label: string;
  type: "trigger" | "condition" | "action" | "delay";
}

export interface WorkflowLogEntry {
  id: string;
  at: number;
  contactName: string;
  nodeLabel: string;
  durationMs: number;
  ok: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  status: WorkflowStatus;
  runs: number;
  successRate: number;
  nodes: WorkflowNode[];
  log: WorkflowLogEntry[];
}

export interface AiAgent {
  id: string;
  name: string;
  tagline: string;
  mode: AgentMode;
  confidence: number; // % moyen
  handled: number; // conversations traitées / mois
}

export interface AiSuggestion {
  id: string;
  agentId: string;
  conversationId: string;
  text: string;
  confidence: number;
  at: number;
  status: "pending" | "accepted" | "rejected";
}

export interface Tenant {
  id: string;
  name: string;
  plan: PlanId;
  mrr: number;
  users: number;
  messagesMonth: number;
  status: "active" | "trial" | "past_due" | "churned";
  country: string;
}

export interface AppNotification {
  id: string;
  at: number;
  kind: "message" | "campaign" | "session" | "ai" | "system";
  title: string;
  body: string;
  read: boolean;
}

export interface ActivityEvent {
  id: string;
  at: number;
  kind: AppNotification["kind"];
  text: string;
}

export interface Org {
  name: string;
  city: string;
  plan: PlanId;
}

/* ════════════════════════════════════════════════════════════════════════
   PRNG déterministe (mulberry32) — seed fixe → démo stable « zéro bug »
   ════════════════════════════════════════════════════════════════════════ */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private nextFn: () => number;
  constructor(seed: number) {
    this.nextFn = mulberry32(seed);
  }
  next() {
    return this.nextFn();
  }
  range(min: number, max: number) {
    return min + this.nextFn() * (max - min);
  }
  int(min: number, max: number) {
    return Math.floor(this.range(min, max + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.nextFn() * arr.length)];
  }
  chance(p: number) {
    return this.nextFn() < p;
  }
}

const rng = new Rng(20250612);
let uidCounter = 0;
const uid = (prefix: string) =>
  `${prefix}_${(++uidCounter).toString(36)}_${Date.now().toString(36)}`;

/* ════════════════════════════════════════════════════════════════════════
   Seed data (design.md §7)
   ════════════════════════════════════════════════════════════════════════ */
const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;

export const ORG: Org = {
  name: "Pâtisserie Dar El Baraka",
  city: "Tunis",
  plan: "business",
};

const TEAM: TeamMember[] = [
  { id: "u_amira", name: "Amira Ben Salah", role: "Propriétaire", email: "amira@darelbaraka.tn", online: true },
  { id: "u_youssef", name: "Youssef Trabelsi", role: "Admin", email: "youssef@darelbaraka.tn", online: true },
  { id: "u_ines", name: "Ines Kacem", role: "Agent", email: "ines@darelbaraka.tn", online: true },
  { id: "u_karim", name: "Karim Haddad", role: "Superviseur", email: "karim@darelbaraka.tn", online: false },
  { id: "u_lea", name: "Léa Dubois", role: "Analyste", email: "lea@darelbaraka.tn", online: true },
];

const SESSIONS: QrSession[] = [
  { id: "s_main", name: "Boutique Principale", status: "connected", uptime: 99.2, latencyMs: 58, phone: "+216 98 112 445", connectedAt: NOW - 26 * 24 * HOUR },
  { id: "s_sav", name: "SAV & Livraison", status: "connected", uptime: 97.8, latencyMs: 74, phone: "+216 55 903 118", connectedAt: NOW - 11 * 24 * HOUR },
  { id: "s_events", name: "Événements", status: "disconnected", uptime: 91.4, latencyMs: 0, phone: "+216 29 771 602" },
];

const FIRST_NAMES = [
  "Sami", "Rania", "Mehdi", "Yasmine", "Nadia", "Karim", "Salma", "Olfa", "Hichem", "Mariem",
  "Sofien", "Aïcha", "Bilel", "Syrine", "Walid", "Imen", "Anis", "Hela", "Fares", "Dorra",
  "Camille", "Hugo", "Chloé", "Antoine", "Manon", "Lucas", "Emma", "Théo", "Sarah", "Nicolas",
  "Ines", "Rached", "Selma", "Nizar", "Asma", "Khaled", "Rim", "Mouna", "Tarek", "Leïla",
  "Julien", "Claire", "Nour", "Aziz", "Meriem", "Sami", "Aya", "Rayen",
];
const LAST_NAMES = [
  "Ben Ali", "Trabelsi", "Gharbi", "Mansour", "Haddad", "Ben Youssef", "Cherif", "Ayari",
  "Bouzid", "Kacem", "Sfar", "Jelassi", "Meziane", "Brahmi", "Guediche", "Slama",
  "Martin", "Bernard", "Moreau", "Petit", "Roux", "Faure", "Girard", "Lambert",
  "Ben Ammar", "Zouari", "Nefzi", "Hammami", "Khelifi", "Mzoughi",
];
const CITIES = ["Tunis", "Sfax", "Sousse", "Ariana", "Nabeul", "Bizerte", "Lyon", "Paris", "Marseille", "Monastir"];
const TAG_POOL = ["VIP", "Gros", "Anniversaire", "Instagram", "Boutique", "Livraison", "Fidèle", "Nouveau", "Presse", "Traiteur"];
const STAGES: CrmStage[] = ["prospect", "interested", "client", "loyal", "lost"];

function buildContacts(): Contact[] {
  const used = new Set<string>();
  const contacts: Contact[] = [];
  for (let i = 0; i < 48; i++) {
    let name = "";
    do {
      name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`.replace(/\s+/g, " ").trim();
    } while (used.has(name));
    used.add(name);
    const tn = rng.chance(0.7);
    const phone = tn
      ? `+216 ${rng.int(20, 99)} ${rng.int(100, 999)} ${rng.int(100, 999)}`
      : `+33 6 ${rng.int(10, 99)} ${rng.int(10, 99)} ${rng.int(10, 99)} ${rng.int(10, 99)}`;
    const tags: string[] = [];
    const nTags = rng.int(0, 3);
    for (let t = 0; t < nTags; t++) {
      const tag = rng.pick(TAG_POOL);
      if (!tags.includes(tag)) tags.push(tag);
    }
    contacts.push({
      id: `c_${(i + 1).toString(36).padStart(3, "0")}`,
      name,
      phone,
      city: rng.pick(CITIES),
      tags,
      score: rng.int(12, 96),
      stage: rng.pick(STAGES),
      consent: rng.chance(0.85),
      lastContactAt: NOW - rng.int(1, 72) * HOUR,
    });
  }
  return contacts;
}

/** Pool de 24 messages entrants réalistes (design.md §7) */
export const INCOMING_POOL: readonly string[] = [
  "Bonjour, est-ce que les coffrets Aid sont encore disponibles ?",
  "Vous livrez sur La Marsa aujourd'hui ?",
  "C'est possible de commander 30 makroudh pour samedi ?",
  "Le baklava aux pistaches, il est à combien la boîte de 500g ?",
  "Merci pour la commande d'hier, tout était parfait !",
  "Bonjour, avez-vous des options sans gluten ?",
  "Je voudrais modifier ma commande de ce matin si possible.",
  "Est-ce que vous faites les gâteaux d'anniversaire personnalisés ?",
  "Quel est le délai pour une pièce montée ?",
  "Vous avez reçu mon virement ?",
  "On peut réserver un atelier pâtisserie pour un team building ?",
  "Bonjour ! Votre page Instagram m'a donné envie, vous expédiez en France ?",
  "Le coffret découverte contient quoi exactement ?",
  "Je n'ai pas reçu la confirmation de ma commande.",
  "C'est quoi vos horaires pendant Ramadan ?",
  "Vous cherchez des partenaires traiteurs pour des mariages ?",
  "La livraison est offerte à partir de combien ?",
  "Pouvez-vous me refaire la facture au nom de la société ?",
  "Y a-t-il une réduction pour les grosses quantités ?",
  "Mon colis est annoncé livré mais je n'ai rien reçu…",
  "Vous faites des cartes cadeaux ?",
  "Possible de passer retirer ma commande à 18h ?",
  "Votre nouvelle collection a l'air magnifique, on peut la voir en boutique ?",
  "Merci pour votre réactivité, je recommande !",
];

const CONV_SUBJECTS: { status: ConvStatus; seed: string[] }[] = [
  { status: "new", seed: ["Bonjour, est-ce que les coffrets Aid sont encore disponibles ?"] },
  { status: "new", seed: ["Vous livrez sur La Marsa aujourd'hui ?"] },
  { status: "open", seed: ["C'est possible de commander 30 makroudh pour samedi ?", "Bien sûr ! On vous prépare ça. Livraison ou retrait ?", "Retrait si possible, vers 16h."] },
  { status: "open", seed: ["Le baklava aux pistaches, il est à combien la boîte de 500g ?", "Bonjour ! 42 TND les 500g, et 78 TND le kilo cette semaine."] },
  { status: "open", seed: ["Je n'ai pas reçu la confirmation de ma commande.", "Je vérifie tout de suite. Votre commande #2481 est bien enregistrée, je vous renvoie la confirmation."] },
  { status: "open", seed: ["Est-ce que vous faites les gâteaux d'anniversaire personnalisés ?", "Oui, sur devis ! Envoyez-nous une photo d'inspiration et le nombre de parts."] },
  { status: "pending", seed: ["Quel est le délai pour une pièce montée ?", "Comptez 10 jours en ce moment. C'est pour quelle date ?", "Le 28 du mois prochain."] },
  { status: "pending", seed: ["Vous avez reçu mon virement ?", "Nous attendons confirmation de la banque, je reviens vers vous dans l'heure."] },
  { status: "pending", seed: ["Mon colis est annoncé livré mais je n'ai rien reçu…", "Je suis désolée ! J'ouvre une réclamation transporteur immédiatement."] },
  { status: "resolved", seed: ["Merci pour la commande d'hier, tout était parfait !", "Merci beaucoup, au plaisir de vous resservir !"] },
  { status: "resolved", seed: ["Possible de passer retirer ma commande à 18h ?", "C'est noté, elle sera prête à 18h. À tout à l'heure !", "Parfait, merci !"] },
  { status: "archived", seed: ["La livraison est offerte à partir de combien ?", "À partir de 120 TND sur Tunis. Bonne journée !"] },
];

function buildConversations(contacts: Contact[]): Conversation[] {
  return CONV_SUBJECTS.map((spec, i) => {
    const contact = contacts[i * 3]; // répartis sur la liste
    const convId = `cv_${(i + 1).toString(36).padStart(2, "0")}`;
    const thread: Message[] = spec.seed.map((body, j) => ({
      id: `m_${convId}_${j}`,
      conversationId: convId,
      direction: (j % 2 === 0 ? "in" : "out") as MsgDirection,
      body,
      at: NOW - (spec.seed.length - j) * rng.int(4, 22) * MIN,
      status: "read" as MsgStatus,
      kind: "text",
    }));
    const unread =
      spec.status === "new" ? rng.int(1, 3) : spec.status === "open" && rng.chance(0.5) ? 1 : 0;
    return {
      id: convId,
      contactId: contact.id,
      status: spec.status,
      unread,
      assigneeId: rng.pick(["u_ines", "u_youssef", "u_amira"]),
      sessionId: rng.chance(0.75) ? "s_main" : "s_sav",
      thread,
    };
  });
}

const CAMPAIGNS: Campaign[] = [
  {
    id: "cp_aid",
    name: "Offre Aid — Coffrets découverte",
    status: "running",
    audience: "Segment : clients + fidèles (1 240 contacts)",
    total: 1240,
    sent: 742,
    delivered: 690,
    replies: 96,
    failed: 11,
    mediaUrl: "/product-pastry.png",
  },
  {
    id: "cp_relance",
    name: "Relance paniers",
    status: "scheduled",
    audience: "Segment : paniers abandonnés J+1 (318 contacts)",
    total: 318,
    sent: 0,
    delivered: 0,
    replies: 0,
    failed: 0,
    scheduledAt: NOW + 26 * HOUR,
  },
  {
    id: "cp_ramadan",
    name: "Nouveautés Ramadan",
    status: "done",
    audience: "Tous les contacts consentis (2 014 contacts)",
    total: 2014,
    sent: 2014,
    delivered: 1947,
    replies: 388,
    failed: 22,
    mediaUrl: "/product-cosmetic.png",
  },
  {
    id: "cp_vip",
    name: "VIP Fidélité",
    status: "draft",
    audience: "Segment : tag VIP (86 contacts)",
    total: 86,
    sent: 0,
    delivered: 0,
    replies: 0,
    failed: 0,
    mediaUrl: "/product-textile.png",
  },
];

const WORKFLOWS: Workflow[] = [
  {
    id: "wf_welcome",
    name: "Bienvenue nouveau contact",
    status: "active",
    runs: 1284,
    successRate: 98.4,
    nodes: [
      { id: "n1", label: "Nouveau contact", type: "trigger" },
      { id: "n2", label: "Attendre 5 min", type: "delay" },
      { id: "n3", label: "Message de bienvenue", type: "action" },
      { id: "n4", label: "Tag « Nouveau »", type: "action" },
    ],
    log: [],
  },
  {
    id: "wf_cart",
    name: "Panier abandonné J+1",
    status: "active",
    runs: 862,
    successRate: 97.1,
    nodes: [
      { id: "n1", label: "Panier abandonné", type: "trigger" },
      { id: "n2", label: "Attendre 24 h", type: "delay" },
      { id: "n3", label: "Si non commandé", type: "condition" },
      { id: "n4", label: "Relance + code -10%", type: "action" },
    ],
    log: [],
  },
  {
    id: "wf_birthday",
    name: "Anniversaire -20%",
    status: "active",
    runs: 421,
    successRate: 99.1,
    nodes: [
      { id: "n1", label: "Date anniversaire", type: "trigger" },
      { id: "n2", label: "Message + code promo", type: "action" },
    ],
    log: [],
  },
  {
    id: "wf_escalation",
    name: "Escalade SAV vers humain",
    status: "paused",
    runs: 233,
    successRate: 95.7,
    nodes: [
      { id: "n1", label: "Mot-clé SAV détecté", type: "trigger" },
      { id: "n2", label: "Si confiance IA < 70%", type: "condition" },
      { id: "n3", label: "Assigner à un agent", type: "action" },
    ],
    log: [],
  },
];

const AGENTS: AiAgent[] = [
  { id: "ag_sales", name: "Commercial", tagline: "Qualifie, relance et propose au bon moment.", mode: "suggestion", confidence: 91, handled: 842 },
  { id: "ag_support", name: "Support", tagline: "Répond en citant votre base de connaissances.", mode: "suggestion", confidence: 93, handled: 1240 },
  { id: "ag_tech", name: "Technique", tagline: "Diagnostique et guide pas à pas.", mode: "suggestion", confidence: 88, handled: 216 },
  { id: "ag_rdv", name: "Rendez-vous", tagline: "Propose des créneaux et confirme.", mode: "autonomous", confidence: 94, handled: 388 },
  { id: "ag_supervisor", name: "Superviseur", tagline: "Veille sur la qualité et route vers un humain.", mode: "autonomous", confidence: 96, handled: 1512 },
  { id: "ag_analyst", name: "Analyste", tagline: "Lit vos chiffres et résume la semaine.", mode: "suggestion", confidence: 90, handled: 96 },
];

const SUGGESTION_TEXTS = [
  "Bonjour ! Oui, il reste des coffrets découverte — je peux vous en réserver un pour aujourd'hui ?",
  "Merci pour votre message ! La livraison sur La Marsa est possible avant 19h ce soir. Souhaitez-vous un créneau ?",
  "Bien sûr, 30 makroudh pour samedi c'est faisable — je vous confirme le tarif dégressif par message ?",
  "Le coffret contient baklava pistache, makroudh, samsa et cornes de gazelle. Je vous envoie la photo ?",
  "Je vous propose de reprogrammer la livraison à 18h. Cela vous convient-il ?",
];

const TENANTS: Tenant[] = [
  { id: "t_1", name: "Pâtisserie Dar El Baraka", plan: "business", mrr: 79, users: 5, messagesMonth: 12400, status: "active", country: "TN" },
  { id: "t_2", name: "Maison Slimane", plan: "starter", mrr: 29, users: 2, messagesMonth: 1800, status: "active", country: "TN" },
  { id: "t_3", name: "Atlas Cosmétiques", plan: "business", mrr: 79, users: 8, messagesMonth: 9600, status: "active", country: "TN" },
  { id: "t_4", name: "Foulard & Soie", plan: "business", mrr: 79, users: 6, messagesMonth: 7200, status: "trial", country: "FR" },
  { id: "t_5", name: "Studio Nour", plan: "agency", mrr: 199, users: 24, messagesMonth: 38500, status: "active", country: "FR" },
  { id: "t_6", name: "Medina Market", plan: "starter", mrr: 29, users: 2, messagesMonth: 940, status: "past_due", country: "TN" },
  { id: "t_7", name: "Café des Nattes", plan: "starter", mrr: 29, users: 3, messagesMonth: 1250, status: "trial", country: "TN" },
  { id: "t_8", name: "Dar Tech", plan: "enterprise", mrr: 890, users: 60, messagesMonth: 120000, status: "active", country: "FR" },
  { id: "t_9", name: "Le Comptoir Médina", plan: "business", mrr: 79, users: 4, messagesMonth: 4100, status: "churned", country: "TN" },
];

const SEED_NOTIFICATIONS: AppNotification[] = [
  { id: "nt_1", at: NOW - 12 * MIN, kind: "message", title: "Nouveau message", body: "Sami Ben Ali : « Bonjour, est-ce que les coffrets Aid sont encore disponibles ? »", read: false },
  { id: "nt_2", at: NOW - 48 * MIN, kind: "campaign", title: "Campagne à 60%", body: "« Offre Aid — Coffrets découverte » a dépassé 690 messages livrés.", read: false },
  { id: "nt_3", at: NOW - 3 * HOUR, kind: "session", title: "Session à surveiller", body: "« Événements » est déconnectée depuis hier 21:40.", read: false },
  { id: "nt_4", at: NOW - 6 * HOUR, kind: "ai", title: "3 suggestions en attente", body: "L'agent Commercial a préparé des réponses à valider.", read: true },
];

const SEED_ACTIVITY: ActivityEvent[] = [
  { id: "ac_1", at: NOW - 4 * MIN, kind: "message", text: "Message entrant de Rania Gharbi sur « Boutique Principale »" },
  { id: "ac_2", at: NOW - 18 * MIN, kind: "ai", text: "Agent Support : réponse suggérée acceptée par Ines" },
  { id: "ac_3", at: NOW - 41 * MIN, kind: "campaign", text: "Campagne « Offre Aid » : 96 réponses reçues" },
  { id: "ac_4", at: NOW - HOUR, kind: "session", text: "Session « SAV & Livraison » : latence normale (74 ms)" },
  { id: "ac_5", at: NOW - 2 * HOUR, kind: "system", text: "Workflow « Bienvenue nouveau contact » : 12 exécutions réussies" },
];

/* ════════════════════════════════════════════════════════════════════════
   État + actions
   ════════════════════════════════════════════════════════════════════════ */
export interface SimState {
  org: Org;
  team: TeamMember[];
  sessions: QrSession[];
  contacts: Contact[];
  conversations: Conversation[];
  campaigns: Campaign[];
  workflows: Workflow[];
  agents: AiAgent[];
  suggestions: AiSuggestion[];
  tenants: Tenant[];
  notifications: AppNotification[];
  activity: ActivityEvent[];
  /** KPI « messages aujourd'hui » (tick à chaque message entrant/sortant) */
  messagesToday: number;
  /** Série temps réel : messages par heure (24 points) */
  chartSeries: number[];
  /** Écran QR : version du code + compte à rebours (rafraîchi toutes les 12 s) */
  /** Brouillons du composer par conversation (persistés) */
  drafts: Record<string, string>;
  /** Fin de l'essai 14 jours (timestamp ms) — null hors essai / démo */
  trialEndsAt: number | null;
  /** true = données de démonstration (landing / « Voir la démo ») ; false = espace réel vierge */
  demoMode: boolean;

  sendMessage: (conversationId: string, body: string) => void;
  setConversationStatus: (id: string, status: ConvStatus) => void;
  markConversationRead: (id: string) => void;
  saveDraft: (id: string, text: string) => void;
  clearDraft: (id: string) => void;
  pauseCampaign: (id: string) => void;
  resumeCampaign: (id: string) => void;
  stopCampaign: (id: string) => void;
  toggleWorkflow: (id: string) => void;
  acceptSuggestion: (id: string) => void;
  rejectSuggestion: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  /**
   * Applique le résultat du wizard onboarding : l'espace devient celui de
   * l'organisation créée (nom, plan, session principale, utilisateur) et
   * démarre l'essai de 14 jours.
   */
  applyOnboarding: (input: {
    orgName: string;
    plan: PlanId;
    userName: string;
    sessionName?: string;
  }) => void;
  resetDemo: () => void;
}

const seedContacts = buildContacts();
const seedConversations = buildConversations(seedContacts);

/** Points initiaux de la courbe messages/heure (forme en cloche de journée) */
function buildChartSeries(): number[] {
  const base = [12, 8, 5, 4, 3, 5, 9, 18, 32, 48, 61, 74, 82, 78, 70, 76, 84, 92, 88, 71, 52, 38, 26, 18];
  const h = new Date().getHours();
  // on termine la série sur l'heure courante
  return base.slice(h - 23 <= 0 ? 0 : h - 23).concat(base.slice(0, h - 23 <= 0 ? h + 1 : 24)).slice(-24);
}

export const useSim = create<SimState>()(
  persist(
    (set, get) => ({
      org: ORG,
      team: TEAM,
      sessions: SESSIONS,
      contacts: seedContacts,
      conversations: seedConversations,
      campaigns: CAMPAIGNS,
      workflows: WORKFLOWS,
      agents: AGENTS,
      suggestions: [],
      tenants: TENANTS,
      notifications: SEED_NOTIFICATIONS,
      activity: SEED_ACTIVITY,
      messagesToday: 2481,
      chartSeries: buildChartSeries(),
      drafts: {},
      trialEndsAt: null,
      demoMode: true,

      sendMessage: (conversationId, body) => {
        const msg: Message = {
          id: uid("m"),
          conversationId,
          direction: "out",
          body,
          at: Date.now(),
          status: "queued",
          kind: "text",
        };
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, status: c.status === "new" ? "open" : c.status, thread: [...c.thread, msg] }
              : c,
          ),
          messagesToday: s.messagesToday + 1,
        }));
        scheduleStatusAdvance(msg.id, conversationId);
      },

      setConversationStatus: (id, status) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, status } : c)),
        })),

      markConversationRead: (id) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
        })),

      saveDraft: (id, text) => set((s) => ({ drafts: { ...s.drafts, [id]: text } })),
      clearDraft: (id) =>
        set((s) => {
          const drafts = { ...s.drafts };
          delete drafts[id];
          return { drafts };
        }),

      pauseCampaign: (id) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) => (c.id === id && c.status === "running" ? { ...c, status: "paused" } : c)),
        })),
      resumeCampaign: (id) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) => (c.id === id && c.status === "paused" ? { ...c, status: "running" } : c)),
        })),
      stopCampaign: (id) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === id && (c.status === "running" || c.status === "paused") ? { ...c, status: "stopped" } : c,
          ),
        })),

      toggleWorkflow: (id) =>
        set((s) => ({
          workflows: s.workflows.map((w) =>
            w.id === id ? { ...w, status: w.status === "active" ? "paused" : "active" } : w,
          ),
        })),

      acceptSuggestion: (id) => {
        const s = get().suggestions.find((x) => x.id === id);
        if (!s) return;
        set((st) => ({
          suggestions: st.suggestions.map((x) => (x.id === id ? { ...x, status: "accepted" } : x)),
        }));
        get().sendMessage(s.conversationId, s.text);
      },
      rejectSuggestion: (id) =>
        set((st) => ({
          suggestions: st.suggestions.map((x) => (x.id === id ? { ...x, status: "rejected" } : x)),
        })),

      markNotificationRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),
      markAllNotificationsRead: () =>
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),

      applyOnboarding: ({ orgName, plan, userName, sessionName }) =>
        set(() => {
          const name = orgName.trim() || "Mon organisation";
          const displayName = userName.trim() || "Propriétaire";
          const mainName = sessionName?.trim() || "Session Principale";
          /* Espace RÉEL vierge : zéro donnée mockée — le tenant démarre de zéro. */
          return {
            org: { name, city: "", plan },
            trialEndsAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
            demoMode: false,
            team: [{ id: "u_owner", name: displayName, role: "Propriétaire", email: "", online: true }],
            sessions: [{ id: "s_main", name: mainName, status: "disconnected", uptime: 0, latencyMs: 0, phone: "" }],
            contacts: [],
            conversations: [],
            campaigns: [],
            workflows: [],
            suggestions: [],
            notifications: [],
            activity: [],
            messagesToday: 0,
            chartSeries: Array(24).fill(0),
            drafts: {},
          };
        }),

      /** Restaure les données de démo (parcours « Voir la démo » uniquement). */
      resetDemo: () => {
        const contacts = buildContacts();
        set({
          org: ORG,
          team: TEAM,
          sessions: SESSIONS,
          contacts,
          conversations: buildConversations(contacts),
          campaigns: CAMPAIGNS,
          workflows: WORKFLOWS,
          agents: AGENTS,
          suggestions: [],
          tenants: TENANTS,
          notifications: SEED_NOTIFICATIONS,
          activity: SEED_ACTIVITY,
          messagesToday: 2481,
          chartSeries: buildChartSeries(),
          trialEndsAt: null,
          demoMode: true,
          drafts: {},
        });
      },
    }),
    {
      name: "mf:sim",
      partialize: (s) => ({
        drafts: s.drafts,
        org: s.org,
        team: s.team,
        sessions: s.sessions,
        trialEndsAt: s.trialEndsAt,
        contacts: s.contacts,
        conversations: s.conversations,
        campaigns: s.campaigns,
        workflows: s.workflows,
        notifications: s.notifications,
        activity: s.activity,
        messagesToday: s.messagesToday,
        demoMode: s.demoMode,
      }),
    },
  ),
);

/* ════════════════════════════════════════════════════════════════════════
   Helpers internes (mutations hors actions publiques)
   ════════════════════════════════════════════════════════════════════════ */
function pushNotification(n: Omit<AppNotification, "id" | "at" | "read">) {
  useSim.setState((s) => ({
    notifications: [{ ...n, id: uid("nt"), at: Date.now(), read: false }, ...s.notifications].slice(0, 30),
  }));
}

function pushActivity(kind: ActivityEvent["kind"], text: string) {
  useSim.setState((s) => ({
    activity: [{ id: uid("ac"), at: Date.now(), kind, text }, ...s.activity].slice(0, 40),
  }));
}

/** Avance le statut d'un message sortant : file → envoyé → livré → lu (5% échoué) */
function scheduleStatusAdvance(messageId: string, conversationId: string) {
  const steps: MsgStatus[] = ["sent", "delivered", "read"];
  let i = 0;
  const tick = () => {
    const failed = i === 0 && rng.chance(0.05);
    const status: MsgStatus = failed ? "failed" : steps[i];
    useSim.setState((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, thread: c.thread.map((m) => (m.id === messageId ? { ...m, status } : m)) }
          : c,
      ),
    }));
    i += 1;
    if (!failed && i < steps.length) engineTimers.push(setTimeout(tick, rng.range(1000, 4000)));
  };
  engineTimers.push(setTimeout(tick, rng.range(800, 2000)));
}

/* ════════════════════════════════════════════════════════════════════════
   Émetteurs temps réel (design.md §7) — démarrés une fois par session
   ════════════════════════════════════════════════════════════════════════ */
const engineTimers: ReturnType<typeof setTimeout>[] = [];
let engineRunning = false;

function every(fn: () => void, minMs: number, maxMs: number, demoOnly = true) {
  const loop = () => {
    /* Espace réel (demoMode=false) : les émetteurs de démonstration se taisent */
    if (!demoOnly || useSim.getState().demoMode) fn();
    engineTimers.push(setTimeout(loop, rng.range(minMs, maxMs)));
  };
  engineTimers.push(setTimeout(loop, rng.range(minMs, maxMs)));
}

/** 18–35 s : message entrant (toast + badge Inbox + KPI) */
function emitIncomingMessage() {
  const s = useSim.getState();
  const candidates = s.conversations.filter((c) => c.status !== "archived");
  if (!candidates.length) return;
  const conv = rng.pick(candidates);
  const body = rng.pick(INCOMING_POOL);
  const contact = s.contacts.find((c) => c.id === conv.contactId);
  const msg: Message = {
    id: uid("m"),
    conversationId: conv.id,
    direction: "in",
    body,
    at: Date.now(),
    status: "delivered",
    kind: "text",
  };
  useSim.setState((st) => ({
    conversations: st.conversations.map((c) =>
      c.id === conv.id
        ? { ...c, unread: c.unread + 1, status: c.status === "resolved" ? "open" : c.status, thread: [...c.thread, msg] }
        : c,
    ),
    messagesToday: st.messagesToday + 1,
  }));
  pushNotification({
    kind: "message",
    title: "Nouveau message",
    body: `${contact?.name ?? "Contact"} : « ${body.slice(0, 72)}${body.length > 72 ? "…" : ""} »`,
  });
  pushActivity("message", `Message entrant de ${contact?.name ?? "contact"} sur « ${conv.sessionId === "s_main" ? "Boutique Principale" : "SAV & Livraison"} »`);
}

/** 30 s : latence sessions QR (42–120 ms), 1% : session instable + alerte */
function emitQrHeartbeat() {
  useSim.setState((s) => ({
    sessions: s.sessions.map((sess) => {
      if (sess.status === "disconnected") return sess;
      const unstable = rng.chance(0.01);
      if (unstable) {
        pushNotification({
          kind: "session",
          title: "Session instable",
          body: `« ${sess.name} » présente une latence anormale — surveillance renforcée.`,
        });
        pushActivity("session", `Session « ${sess.name} » instable (latence élevée)`);
      }
      return {
        ...sess,
        status: unstable ? "unstable" : "connected",
        latencyMs: Math.round(rng.range(42, 120)),
      };
    }),
  }));
}

/** 3 s : nouveau point du graphique dashboard (lissé autour de la dernière valeur) */
function emitChartTick() {
  useSim.setState((s) => {
    const last = s.chartSeries[s.chartSeries.length - 1] ?? 50;
    const next = Math.max(4, Math.round(last + rng.range(-9, 11)));
    return { chartSeries: [...s.chartSeries.slice(1), next] };
  });
}

/** 800 ms–2 s : compteurs des campagnes en cours */
function emitCampaignPump() {
  useSim.setState((s) => ({
    campaigns: s.campaigns.map((c) => {
      if (c.status !== "running" || c.sent >= c.total) return c;
      const burst = rng.int(1, 6);
      const sent = Math.min(c.total, c.sent + burst);
      const delivered = Math.min(sent, c.delivered + rng.int(0, burst));
      const replies = c.replies + (rng.chance(0.18) ? 1 : 0);
      const failed = c.failed + (rng.chance(0.04) ? 1 : 0);
      const done = sent >= c.total;
      if (done && c.sent < c.total) {
        pushNotification({
          kind: "campaign",
          title: "Campagne terminée",
          body: `« ${c.name} » : ${sent.toLocaleString("fr-FR")} messages envoyés.`,
        });
        pushActivity("campaign", `Campagne « ${c.name} » terminée (${replies} réponses)`);
      }
      return { ...c, sent, delivered, replies, failed, status: done ? "done" : c.status };
    }),
  }));
}

/** 6–14 s : ligne de journal d'exécution workflow (97% succès) */
function emitWorkflowRun() {
  const s = useSim.getState();
  const active = s.workflows.filter((w) => w.status === "active");
  if (!active.length) return;
  const wf = rng.pick(active);
  const node = rng.pick(wf.nodes.filter((n) => n.type === "action").length ? wf.nodes.filter((n) => n.type === "action") : wf.nodes);
  const contact = rng.pick(s.contacts);
  const entry: WorkflowLogEntry = {
    id: uid("wr"),
    at: Date.now(),
    contactName: contact.name,
    nodeLabel: node.label,
    durationMs: rng.int(120, 900),
    ok: rng.chance(0.97),
  };
  useSim.setState((st) => ({
    workflows: st.workflows.map((w) =>
      w.id === wf.id ? { ...w, runs: w.runs + 1, log: [entry, ...w.log].slice(0, 50) } : w,
    ),
  }));
}

/** 45–90 s : suggestion IA sur une conversation ouverte */
function emitAiSuggestion() {
  const s = useSim.getState();
  const open = s.conversations.filter((c) => c.status === "open" || c.status === "new");
  if (!open.length) return;
  const conv = rng.pick(open);
  const agent = rng.pick(s.agents.filter((a) => a.mode === "suggestion"));
  const suggestion: AiSuggestion = {
    id: uid("sg"),
    agentId: agent.id,
    conversationId: conv.id,
    text: rng.pick(SUGGESTION_TEXTS),
    confidence: rng.int(84, 97),
    at: Date.now(),
    status: "pending",
  };
  useSim.setState((st) => ({ suggestions: [suggestion, ...st.suggestions].slice(0, 12) }));
  pushNotification({
    kind: "ai",
    title: "Suggestion IA",
    body: `L'agent ${agent.name} propose une réponse (confiance ${suggestion.confidence}%).`,
  });
  pushActivity("ai", `Agent ${agent.name} : nouvelle suggestion à valider`);
}

function startLoops() {
  every(emitIncomingMessage, 18_000, 35_000);
  every(emitQrHeartbeat, 30_000, 30_500);
  every(emitChartTick, 3_000, 3_200);
  every(emitCampaignPump, 800, 2_000);
  every(emitWorkflowRun, 6_000, 14_000);
  every(emitAiSuggestion, 45_000, 90_000);
}

function clearLoops() {
  while (engineTimers.length) clearTimeout(engineTimers.pop());
}

function onVisibility() {
  if (document.hidden) {
    clearLoops();
  } else if (engineRunning) {
    startLoops();
  }
}

/**
 * Démarre les 8 émetteurs temps réel. Idempotent. À appeler une fois
 * (App.tsx). Les émetteurs se pausent quand l'onglet est caché.
 */
export function startSimEngine() {
  if (engineRunning) return;
  engineRunning = true;
  startLoops();
  document.addEventListener("visibilitychange", onVisibility);
}

/** Arrête tous les émetteurs (tests / démontage). */
export function stopSimEngine() {
  engineRunning = false;
  clearLoops();
  document.removeEventListener("visibilitychange", onVisibility);
}

/* ════════════════════════════════════════════════════════════════════════
   Hooks sélecteurs — API propre consommée par les pages
   ════════════════════════════════════════════════════════════════════════ */
export const useOrg = () => useSim((s) => orgSelector(s));
export const useTeam = () => useSim((s) => s.team);
export const useSessions = () => useSim((s) => s.sessions);
export const useContacts = () => useSim((s) => s.contacts);
export const useConversations = () => useSim((s) => s.conversations);
export const useConversation = (id: string | undefined) =>
  useSim((s) => s.conversations.find((c) => c.id === id));
export const useCampaigns = () => useSim((s) => s.campaigns);
export const useWorkflows = () => useSim((s) => s.workflows);
export const useAgents = () => useSim((s) => s.agents);
export const useSuggestions = () => useSim((s) => s.suggestions);
export const usePendingSuggestions = () =>
  useSim(useShallow((s) => s.suggestions.filter((x) => x.status === "pending")));
export const useTenants = () => useSim((s) => s.tenants);
export const useNotifications = () => useSim((s) => s.notifications);
export const useUnreadNotifications = () =>
  useSim((s) => s.notifications.filter((n) => !n.read).length);
export const useActivity = () => useSim((s) => s.activity);
export const useChartSeries = () => useSim((s) => s.chartSeries);
export const useDraft = (conversationId: string) => useSim((s) => s.drafts[conversationId] ?? "");

const orgSelector = (s: SimState) => s.org;

/** KPI vivants du dashboard / bandeau démo landing */
export interface Kpis {
  messagesToday: number;
  responseRate: number;
  activeSessions: number;
  totalSessions: number;
  unreadInbox: number;
  activeCampaigns: number;
  workflowRunsToday: number;
  automationRate: number;
}
export const useKpis = (): Kpis =>
  useSim(useShallow((s) => ({
    messagesToday: s.messagesToday,
    responseRate: 94,
    activeSessions: s.sessions.filter((x) => x.status !== "disconnected").length,
    totalSessions: s.sessions.length,
    unreadInbox: s.conversations.reduce((acc, c) => acc + c.unread, 0),
    activeCampaigns: s.campaigns.filter((c) => c.status === "running").length,
    workflowRunsToday: s.workflows.reduce((acc, w) => acc + w.runs, 0),
    automationRate: 68,
  })));

/** Contact d'une conversation (helper jointure) */
export const useContact = (id: string | undefined) =>
  useSim((s) => s.contacts.find((c) => c.id === id));
