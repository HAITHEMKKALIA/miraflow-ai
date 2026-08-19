/**
 * sections/campaigns/shared.tsx — socle du Studio Campagnes (campaigns.md).
 *
 * Types locaux du Studio Campagnes, méta objectifs/statuts, segments
 * d'audience calculés sur les contacts disponibles, tokenisation des
 * variables {{prenom}}… et petits utilitaires de formatage.
 */
import type { Campaign, CampaignStatus, Contact } from "@/lib/sim/store";
import type { StatusTone } from "@/components/ui-shared/StatusDot";

/* ── Types ─────────────────────────────────────────────────────────────── */
export type CampaignGoal = "promotion" | "relance" | "annonce" | "fidelisation";

/** Statuts du Studio : ceux du SimEngine + « review » (validation à quatre yeux). */
export type StudioStatus = CampaignStatus | "review";

export interface StudioCampaign extends Omit<Campaign, "status"> {
  remoteId?: string;
  status: StudioStatus;
  goal: CampaignGoal;
  unsubscribed: number;
  ratePerMin: number;
  /** Créée via l'assistant → pompée localement par la page (pas par le store). */
  local?: boolean;
  /** Contenu du message (campagnes créées via l'assistant). */
  content?: string;
  /** Relance automatique J+2 des contacts sans réponse (étape Planification). */
  followUpOn?: boolean;
  /** Message de relance éditable. */
  followUpMsg?: string;
  /** Arrêt/exclusion d'un destinataire dès qu'il répond. */
  stopOnReply?: boolean;
  /** Type de relance : manuel (humain) ou automatisé (IA). */
  relanceType?: "human" | "ai";
  /** Destinataires exacts d'une campagne créée localement. */
  recipientIds?: string[];
  /** Session QR réellement utilisée pour l'envoi. */
  bridgeSessionId?: string;
  /** Position de dispatch dans la file d'envoi réelle. */
  dispatchCursor?: number;
}

/** Format d'envoi du carrousel intelligent (étape Contenu). */
export type CarouselMode = "sequence" | "montage" | "pdf";

export interface CarouselCard {
  id: string;
  image: string;
  title: string;
  price: string;
  cta: string;
}

export interface Persona {
  id: string;
  name: string;
  first: string;
  last: string;
  city: string;
  segment: string;
  product: string;
}

/* ── Méta objectifs & statuts ──────────────────────────────────────────── */
export const GOAL_META: Record<CampaignGoal, { label: string; hint: string; tone: StatusTone; chip: string }> = {
  promotion: { label: "Promotion", hint: "Offres, réductions, lancements", tone: "iris", chip: "bg-iris/12 text-iris" },
  relance: { label: "Relance", hint: "Paniers abandonnés, inactifs", tone: "amber", chip: "bg-amber/12 text-amber" },
  annonce: { label: "Annonce", hint: "Nouveautés, événements", tone: "pulse", chip: "bg-pulse/12 text-pulse" },
  fidelisation: { label: "Fidélisation", hint: "Anniversaires, ventes privées", tone: "mint", chip: "bg-mint/12 text-mint" },
};

export const STATUS_META: Record<StudioStatus, { label: string; tone: StatusTone; ping: boolean }> = {
  draft: { label: "Brouillon", tone: "low", ping: false },
  scheduled: { label: "Planifiée", tone: "pulse", ping: false },
  review: { label: "En attente de validation", tone: "amber", ping: false },
  running: { label: "En cours", tone: "mint", ping: true },
  paused: { label: "En pause", tone: "amber", ping: false },
  done: { label: "Terminée", tone: "mint", ping: false },
  stopped: { label: "Arrêtée", tone: "rose", ping: false },
};

/** Seuil d'audience déclenchant la validation à quatre yeux. */
export const REVIEW_THRESHOLD = 500;

/* ── Mapping campagnes legacy ──────────────────────────────────────────── */
export const GOAL_BY_ID: Record<string, CampaignGoal> = {
  cp_aid: "promotion",
  cp_relance: "relance",
  cp_ramadan: "annonce",
  cp_vip: "fidelisation",
};

export const EXTRA_CAMPAIGNS: StudioCampaign[] = [];

const UNSUB_BY_ID: Record<string, number> = { cp_aid: 2, cp_ramadan: 9, cp_relance: 0, cp_vip: 0 };

/** Campaign (store) → StudioCampaign (affichage studio). */
export function toStudio(c: Campaign): StudioCampaign {
  return {
    ...c,
    goal: GOAL_BY_ID[c.id] ?? "promotion",
    unsubscribed: UNSUB_BY_ID[c.id] ?? 0,
    ratePerMin: 15,
  };
}

/* ── Personas de prévisualisation (campaigns.md Étape 4) ───────────────── */
export const PERSONAS: Persona[] = [
  { id: "p_fidele", name: "Contact fidèle", first: "Prénom", last: "Nom", city: "Ville", segment: "fidèle", product: "Produit" },
  { id: "p_interesse", name: "Contact intéressé", first: "Prénom", last: "Nom", city: "Ville", segment: "intéressé", product: "Produit" },
  { id: "p_vip", name: "Contact VIP", first: "Prénom", last: "Nom", city: "Ville", segment: "VIP", product: "Produit" },
];

/* ── Variables de message ──────────────────────────────────────────────── */
export const VARIABLES = ["{{prenom}}", "{{nom}}", "{{produit}}", "{{ville}}", "{{lien_promo}}"] as const;

export function resolveVar(token: string, p: Persona): string {
  switch (token) {
    case "{{prenom}}": return p.first;
    case "{{nom}}": return p.last;
    case "{{ville}}": return p.city;
    case "{{produit}}": return p.product;
    case "{{lien_promo}}": return "https://votre-domaine.tld/promo";
    default: return token;
  }
}

/** Découpe le contenu en segments texte / variable (pour rendu coloré). */
export function tokenize(content: string): { text: string; variable: boolean }[] {
  const re = /(\{\{(?:prenom|nom|produit|ville|lien_promo)\}\})/g;
  return content
    .split(re)
    .filter((s) => s.length > 0)
    .map((text) => ({ text, variable: text.startsWith("{{") }));
}

export function usedVariables(content: string): string[] {
  return tokenize(content).filter((t) => t.variable).map((t) => t.text);
}

/* ── Segments d'audience (calculés sur les contacts SimEngine) ─────────── */
export interface SegmentDef {
  id: string;
  label: string;
  hint: string;
  count: number;
  test: (c: Contact) => boolean;
}

export function buildSegments(contacts: Contact[]): SegmentDef[] {
  const opted = contacts.filter((c) => c.consent);
  const defs: { id: string; label: string; hint: string; test: (c: Contact) => boolean }[] = [
    { id: "seg_all", label: "Tous les contacts consentis", hint: "Base complète opt-in", test: () => true },
    { id: "seg_clients", label: "Clients & fidèles", hint: "Étape CRM client ou fidèle", test: (c) => c.stage === "client" || c.stage === "loyal" },
    { id: "seg_vip", label: "Tag VIP", hint: "Vos meilleurs clients", test: (c) => c.tags.includes("VIP") },
    { id: "seg_prospects", label: "Prospects & intéressés", hint: "À convertir", test: (c) => c.stage === "prospect" || c.stage === "interested" },
    { id: "seg_fr", label: "Contacts France", hint: "Numéros +33", test: (c) => c.phone.startsWith("+33") },
  ];
  return defs.map((d) => ({ ...d, count: opted.filter(d.test).length }));
}

export function computeEligible(
  contacts: Contact[],
  segments: SegmentDef[],
  segmentIds: string[],
  manualIds: string[],
  excludeInactive: boolean,
  excludeRecent: boolean,
): Contact[] {
  const map = new Map<string, Contact>();
  for (const c of contacts) {
    if (!c.consent) continue;
    const inSegment = segmentIds.some((id) => segments.find((s) => s.id === id)?.test(c));
    if (inSegment || manualIds.includes(c.id)) map.set(c.id, c);
  }
  let arr = [...map.values()];
  if (excludeInactive) arr = arr.filter((c) => c.score >= 40);
  if (excludeRecent) arr = arr.filter((c) => Date.now() - c.lastContactAt > 24 * 3600e3);
  return arr;
}

/* ── Formatage ─────────────────────────────────────────────────────────── */
export const fmt = (n: number) => n.toLocaleString("fr-FR");
export const pct = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—";

export function timeHM(ts: number): string {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
export function timeHMS(ts: number): string {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** « il y a X » court pour les timestamps. */
export function ago(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}


export const PRODUCT_IMAGES = [
  { src: "/product-pastry.png", label: "Pâtisseries" },
  { src: "/product-textile.png", label: "Textile & soie" },
  { src: "/product-cosmetic.png", label: "Cosmétique" },
];

export const TIMEZONES = [
  "Africa/Tunis",
  "Europe/Paris",
  "Europe/London",
  "America/New_York",
  "Asia/Dubai",
  "Africa/Casablanca",
];

/** Clé localStorage du brouillon d'assistant campagne. */
export const DRAFT_KEY = "mf:campaign-draft";
export const LOCAL_CAMPAIGNS_KEY = "mf:campaigns-local";
