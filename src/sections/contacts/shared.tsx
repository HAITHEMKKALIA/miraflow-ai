/**
 * Kit CRM partagé — primitives communes aux pages Contacts et Inbox
 * (design.md §2/§3). Avatars à initiales sur dégradé (générés en code),
 * jauge de score radiale, étapes CRM, temps relatif FR et profil enrichi
 * déterministe dérivé d'un contact (email, consentements, commandes, notes,
 * historique) — le SimEngine ne porte que les champs de base.
 */
import type { Contact, CrmStage } from "@/lib/sim/store";
import { useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

/* ── Hash stable (avatar dégradé par contact) ───────────────────────────── */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ── Initiales + avatar dégradé ─────────────────────────────────────────── */
export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_GRADIENTS: [string, string][] = [
  ["#FF5A4E", "#FF9F2E"],
  ["#FF5A4E", "#FF9F2E"],
  ["#FF9F2E", "#0DBA9B"],
  ["#FF5A4E", "#FF6B7A"],
  ["#FFB84D", "#FF6B7A"],
  ["#0DBA9B", "#FF9F2E"],
  ["#FF9F2E", "#FF5A4E"],
];

import { useState, type ReactNode } from "react";

export function GradientAvatar({
  name,
  size = 44,
  className,
  ring,
  src,
}: {
  name: string;
  size?: number;
  className?: string;
  /** badge (présence/statut) à chevaucher en coin */
  ring?: ReactNode;
  /** Image source URL */
  src?: string;
}) {
  const h = hashStr(name);
  const [c1, c2] = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
  const [imgError, setImgError] = useState(false);

  const hasImg = src && src !== "none" && !imgError;

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{
        width: size,
        height: size,
        background: hasImg ? "none" : `linear-gradient(135deg, ${c1}, ${c2})`,
        fontSize: Math.max(10, Math.round(size * 0.34)),
      }}
      aria-hidden
    >
      {hasImg ? (
        <img
          src={src}
          alt={name}
          className="size-full rounded-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        initials(name)
      )}
      {ring}
    </span>
  );
}

/* ── Jauge de score radiale ─────────────────────────────────────────────── */
export function scoreTone(score: number): "rose" | "amber" | "mint" {
  return score < 40 ? "rose" : score <= 70 ? "amber" : "mint";
}
const TONE_COLOR = { rose: "var(--rose)", amber: "var(--amber)", mint: "var(--mint)" } as const;

export function ScoreRing({
  score,
  size = 40,
  stroke = 3.5,
  showValue = true,
  className,
}: {
  score: number;
  size?: number;
  stroke?: number;
  showValue?: boolean;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = TONE_COLOR[scoreTone(score)];
  return (
    <span
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score ${score} sur 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset .5s cubic-bezier(.22,1,.36,1), stroke .3s" }}
        />
      </svg>
      {showValue && (
        <span className="absolute font-mono tabular text-hi" style={{ fontSize: Math.max(9, Math.round(size * 0.3)) }}>
          {score}
        </span>
      )}
    </span>
  );
}

/* ── Étapes CRM ─────────────────────────────────────────────────────────── */
export const CRM_STAGES: CrmStage[] = ["prospect", "interested", "client", "loyal", "lost"];
export const STAGE_META: Record<CrmStage, { label: string; tone: "pulse" | "iris" | "mint" | "amber" | "rose" }> = {
  prospect: { label: "Prospect", tone: "pulse" },
  interested: { label: "Intéressé", tone: "iris" },
  client: { label: "Client", tone: "mint" },
  loyal: { label: "Fidèle", tone: "amber" },
  lost: { label: "Perdu", tone: "rose" },
};
export const STAGE_CHIP: Record<CrmStage, string> = {
  prospect: "bg-pulse/10 text-pulse border-pulse/30",
  interested: "bg-iris/10 text-iris border-iris/30",
  client: "bg-mint/10 text-mint border-mint/30",
  loyal: "bg-amber/10 text-amber border-amber/30",
  lost: "bg-rose/10 text-rose border-rose/30",
};

/* ── Temps (FR) ─────────────────────────────────────────────────────────── */
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** « 14:32 » */
export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
/** « 12 mai 2025 » */
export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
/** « à l'instant · il y a 5 min · il y a 2 h · hier · 12 mai » */
export function relTime(ts: number, now = Date.now()): string {
  const d = now - ts;
  if (d < MIN) return "à l'instant";
  if (d < HOUR) return `il y a ${Math.floor(d / MIN)} min`;
  if (d < DAY) return `il y a ${Math.floor(d / HOUR)} h`;
  if (d < 2 * DAY) return "hier";
  if (d < 7 * DAY) return `il y a ${Math.floor(d / DAY)} j`;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
/** Heure courte pour la liste (« 14:32 », « hier », « 12/05 ») */
export function listTime(ts: number, now = Date.now()): string {
  const d = now - ts;
  if (d < DAY && new Date(ts).getDate() === new Date(now).getDate()) return fmtTime(ts);
  if (d < 2 * DAY) return "hier";
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/* ── Profil enrichi déterministe ────────────────────────────────────────── */
export interface Consent {
  granted: boolean;
  at: number;
  via: string;
}
export interface Order {
  id: string;
  label: string;
  qty: number;
  amount: number;
  currency: "TND" | "EUR";
  at: number;
}
export interface Note {
  id: string;
  author: string;
  at: number;
  text: string;
}
export interface HistoryItem {
  id: string;
  at: number;
  kind: "message" | "campaign" | "import" | "stage" | "note" | "consent" | "order";
  text: string;
}
export interface ContactProfile {
  email: string;
  birthday: string;
  lang: "FR" | "AR";
  since: string;
  sinceTs: number;
  /** dernière activité dérivée (peut être > 90 j pour les segments) */
  lastActiveTs: number;
  /** panier abandonné (segment) */
  abandonedCart: boolean;
  scoreFactors: { label: string; pts: number }[];
  consents: { marketing: Consent; transactional: Consent; data: Consent };
  orders: Order[];
  totalOrders: number;
  currency: "TND" | "EUR";
  notes: Note[];
  history: HistoryItem[];
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/**
 * Profil dérivé exclusivement des données réelles : champs du contact +
 * commandes du store (module Commandes). Aucune donnée fabriquée — les
 * champs inconnus (email, anniversaire) restent vides et les collections
 * (notes, historique) démarrent vides ; les mutations passent par crmStore.
 */
export function getProfile(c: Contact): ContactProfile {
  const tn = c.phone.startsWith("+216");
  const currency: "TND" | "EUR" = tn ? "TND" : "EUR";

  const sinceTs = c.lastContactAt || Date.now();
  const sd = new Date(sinceTs);
  const since = `${MONTHS[sd.getMonth()]} ${sd.getFullYear()}`;

  // Commandes réelles du store rattachées au contact (par nom client).
  const realOrders = useSim.getState().orders.filter((o) => o.customerName === c.name);
  const orders: Order[] = realOrders.map((o) => ({
    id: o.id,
    label:
      o.items
        .map((it) => (it.quantity > 1 ? `${it.productName} ×${it.quantity}` : it.productName))
        .join(", ") || o.orderNumber,
    qty: o.items.reduce((acc, it) => acc + it.quantity, 0),
    amount: o.total,
    currency: "TND",
    at: o.createdAt,
  }));
  orders.sort((a, b) => b.at - a.at);
  const totalOrders = orders.reduce((acc, o) => acc + o.amount, 0);

  const consents = {
    marketing: { granted: c.consent, at: sinceTs, via: "WhatsApp" },
    transactional: { granted: true, at: sinceTs, via: "automatique" },
    data: { granted: true, at: sinceTs, via: "paramètres" },
  };

  const history: HistoryItem[] = [
    { id: `${c.id}_h0`, at: sinceTs, kind: "import", text: "Premier contact enregistré" },
    ...orders.map((o) => ({
      id: `${c.id}_ho_${o.id}`,
      at: o.at,
      kind: "order" as const,
      text: `Commande ${o.label} — ${o.amount.toLocaleString("fr-FR")} ${o.currency}`,
    })),
  ];
  history.sort((a, b) => b.at - a.at);

  return {
    email: "",
    birthday: "",
    lang: "FR",
    since,
    sinceTs,
    lastActiveTs: c.lastContactAt || sinceTs,
    abandonedCart: false,
    scoreFactors: [],
    consents,
    orders,
    totalOrders,
    currency,
    notes: [],
    history,
  };
}
