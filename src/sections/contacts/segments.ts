/**
 * Segments dynamiques (contacts.md S5). 4 segments prédéfinis recalculés en
 * direct + constructeur de règles (champ/opérateur/valeur, connecteurs ET/OU)
 * avec compteur d'aperçu en temps réel.
 */
import type { Contact, CrmStage } from "@/lib/sim/store";
import type { ContactProfile } from "./shared";
import { getProfile } from "./shared";

const DAY = 24 * 60 * 60_000;

export interface Segment {
  id: string;
  name: string;
  desc: string;
  color: string;
  predicate: (c: Contact, p: ContactProfile) => boolean;
}

export const SEGMENTS: Segment[] = [
  {
    id: "vip-tunis",
    name: "VIP Tunis",
    desc: "Ville = Tunis · score > 70",
    color: "var(--amber)",
    predicate: (c) => c.city === "Tunis" && c.score > 70,
  },
  {
    id: "new-30",
    name: "Nouveaux 30 j",
    desc: "Créé il y a < 30 jours",
    color: "var(--pulse)",
    predicate: (_c, p) => Date.now() - p.sinceTs < 30 * DAY,
  },
  {
    id: "cart",
    name: "Panier abandonné",
    desc: "Panier sans achat depuis 7 j",
    color: "var(--iris)",
    predicate: (_c, p) => p.abandonedCart,
  },
  {
    id: "inactive-90",
    name: "Inactifs 90 j",
    desc: "Sans activité depuis 90 j",
    color: "var(--rose)",
    predicate: (_c, p) => Date.now() - p.lastActiveTs > 90 * DAY,
  },
];

export function segmentCount(segment: Segment, contacts: Contact[]): number {
  return contacts.reduce((acc, c) => acc + (segment.predicate(c, getProfile(c)) ? 1 : 0), 0);
}
export function segmentContacts(segment: Segment, contacts: Contact[]): Contact[] {
  return contacts.filter((c) => segment.predicate(c, getProfile(c)));
}

/* ── Constructeur de règles ─────────────────────────────────────────────── */
export type RuleField = "city" | "score" | "tag" | "stage" | "consent" | "lastActive";
export type RuleOp = "is" | "isNot" | "gt" | "lt" | "contains";

export interface Rule {
  id: string;
  field: RuleField;
  op: RuleOp;
  value: string;
}

export const FIELD_LABELS: Record<RuleField, string> = {
  city: "Ville",
  score: "Score",
  tag: "Tag",
  stage: "Étape",
  consent: "Consentement",
  lastActive: "Dernière activité",
};
export const OP_LABELS: Record<RuleOp, string> = {
  is: "est",
  isNot: "n'est pas",
  gt: ">",
  lt: "<",
  contains: "contient",
};

export function opsFor(field: RuleField): RuleOp[] {
  if (field === "score" || field === "lastActive") return ["gt", "lt", "is"];
  if (field === "tag") return ["contains", "isNot"];
  return ["is", "isNot"];
}

function matchRule(c: Contact, p: ContactProfile, r: Rule): boolean {
  const v = r.value;
  switch (r.field) {
    case "city":
      return r.op === "is" ? c.city.toLowerCase() === v.toLowerCase() : c.city.toLowerCase() !== v.toLowerCase();
    case "score": {
      const n = Number(v) || 0;
      if (r.op === "gt") return c.score > n;
      if (r.op === "lt") return c.score < n;
      return c.score === n;
    }
    case "tag": {
      const has = c.tags.some((t) => t.toLowerCase().includes(v.toLowerCase()));
      return r.op === "contains" ? has : !has;
    }
    case "stage":
      return r.op === "is" ? c.stage === (v as CrmStage) : c.stage !== (v as CrmStage);
    case "consent": {
      const want = v === "oui";
      return r.op === "is" ? c.consent === want : c.consent !== want;
    }
    case "lastActive": {
      const days = Number(v) || 0;
      const age = (Date.now() - p.lastActiveTs) / DAY;
      if (r.op === "gt") return age > days;
      if (r.op === "lt") return age < days;
      return Math.round(age) === days;
    }
    default:
      return true;
  }
}

export function matchRules(c: Contact, rules: Rule[], combinator: "and" | "or"): boolean {
  if (!rules.length) return false;
  const p = getProfile(c);
  return combinator === "and" ? rules.every((r) => matchRule(c, p, r)) : rules.some((r) => matchRule(c, p, r));
}

export function countRules(contacts: Contact[], rules: Rule[], combinator: "and" | "or"): number {
  return contacts.reduce((acc, c) => acc + (matchRules(c, rules, combinator) ? 1 : 0), 0);
}
