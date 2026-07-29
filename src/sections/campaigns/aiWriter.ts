/**
 * aiWriter.ts — assistance IA rédactionnelle (étape Contenu).
 *
 * Transformations déterministes côté client (dictionnaires en dur), appliquées
 * après un délai « l'IA rédige… » dans l'UI :
 *   generate  → nouveau message complet selon l'objectif
 *   fix       → correction espaces / ponctuation / casse
 *   variants  → 3 variantes de ton (chaleureux, urgent, premium) en cartes radio
 *   title     → meilleur titre d'accroche, inséré en gras (*…*) en 1re ligne
 *   tunisian  → reformulation en tunisien phonétique des formules clés
 * Les variables {{prenom}}, {{ville}}… sont toujours conservées.
 */
import type { CampaignGoal } from "./shared";

export type AiActionId = "generate" | "fix" | "variants" | "title" | "tunisian";

export interface AiVariant {
  id: string;
  tone: string;
  hint: string;
  text: string;
}

/* ── Dictionnaires par objectif ────────────────────────────────────────── */
const OFFER: Record<CampaignGoal, string> = {
  promotion: "notre coffret best-seller à -30 %",
  relance: "votre panier vous attend sagement, livraison offerte",
  annonce: "la nouvelle collection vient d'arriver en boutique",
  fidelisation: "votre cadeau fidélité est prêt en boutique",
};

const GEN_TEMPLATES: Record<CampaignGoal, string[]> = {
  promotion: [
    "Bonjour {{prenom}} ! Cette semaine seulement : -30 % sur notre coffret vedette, livraison offerte à {{ville}}. Répondez OUI pour en profiter. {{lien_promo}}",
    "{{prenom}}, c'est le moment : notre sélection fête ses prix doux jusqu'à dimanche, à {{ville}} et partout en Tunisie. Répondez OUI pour réserver. {{lien_promo}}",
  ],
  relance: [
    "{{prenom}}, vous aviez un œil sur notre coffret… Il est toujours disponible et la livraison vous est offerte à {{ville}} jusqu'à demain. Répondez OUI pour le récupérer. {{lien_promo}}",
    "Petit coucou {{prenom}} ! Votre panier vous attend : on vous le garde encore 48 h, livraison offerte à {{ville}}. Répondez OUI et on s'occupe du reste. {{lien_promo}}",
  ],
  annonce: [
    "Bonjour {{prenom}} ! Grande nouvelle : la collection est arrivée en boutique et en ligne. Soyez parmi les premiers à {{ville}} à la découvrir. Répondez OUI pour un aperçu privé. {{lien_promo}}",
    "{{prenom}}, ça vient de sortir ! Nouveautés, éditions limitées et retours de stock — tout est en ligne. Répondez OUI pour recevoir le catalogue à {{ville}}. {{lien_promo}}",
  ],
  fidelisation: [
    "{{prenom}}, merci pour votre fidélité ! Un cadeau vous attend en boutique cette semaine — rien que pour vous. Répondez OUI pour le réserver à {{ville}}. {{lien_promo}}",
    "Chère cliente, cher client {{prenom}} : en avant-première, notre vente privée vous ouvre ses portes à {{ville}}. Répondez OUI pour recevoir votre invitation. {{lien_promo}}",
  ],
};

const TITLES: Record<CampaignGoal, string[]> = {
  promotion: ["OFFRE FLASH −30 % · 48 H", "PRIX DOUX CETTE SEMAINE", "−30 % + LIVRAISON OFFERTE"],
  relance: ["VOTRE PANIER VOUS ATTEND", "ENCORE 48 H POUR EN PROFITER", "ON VOUS L'A GARDÉ DE CÔTÉ"],
  annonce: ["NOUVEAUTÉ : LA COLLECTION EST LÀ", "ÇA VIENT DE SORTIR", "EN EXCLUSIVITÉ CETTE SEMAINE"],
  fidelisation: ["VOTRE CADEAU FIDÉLITÉ VOUS ATTEND", "VENTE PRIVÉE · RIEN QUE POUR VOUS", "MERCI POUR VOTRE FIDÉLITÉ"],
};

function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

/* ── Générer ───────────────────────────────────────────────────────────── */
export function aiGenerate(goal: CampaignGoal | null, name: string): string {
  return pick(GEN_TEMPLATES[goal ?? "promotion"], name || "x");
}

/* ── Corriger ──────────────────────────────────────────────────────────── */
export function aiFix(text: string): string {
  let t = text.replace(/\r\n?/g, "\n");
  t = t.replace(/[ \t]{2,}/g, " "); // espaces multiples
  t = t.replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?"); // ponctuation répétée
  t = t.replace(/ +([,.…»)])/g, "$1"); // pas d'espace avant , . …
  t = t.replace(/([(«]) +/g, "$1"); // pas d'espace après ( «
  t = t.replace(/ *([!?;:])/g, " $1"); // une espace avant ! ? ; : (typo FR)
  t = t.replace(/([,;:!?…])(?=\S)/g, "$1 "); // espace après ponctuation
  t = t.replace(/\.(?=[A-ZÀ-Þ])/g, ". "); // point collé à une majuscule
  t = t.replace(/([!?])\s+(?=[!?])/g, "$1"); // « ! ! » → « !! » (fusionné ensuite)
  t = t.replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?");
  t = t.replace(/ {2,}/g, " ");
  // Majuscule en début de phrase (hors variables {{…}})
  t = t.replace(/(^|[.!?…]\s+|\n\s*)([a-zà-öø-ÿ])/g, (_m, p1: string, p2: string) => p1 + p2.toUpperCase());
  t = t.split("\n").map((l) => l.trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/* ── 3 variantes ───────────────────────────────────────────────────────── */
export function aiVariants(current: string, goal: CampaignGoal | null): AiVariant[] {
  const g = goal ?? "promotion";
  const offer = OFFER[g];
  const offerCap = offer.charAt(0).toUpperCase() + offer.slice(1);
  const link = current.includes("{{lien_promo}}") ? " {{lien_promo}}" : "";
  const city = current.includes("{{ville}}") ? " à {{ville}}" : "";
  return [
    {
      id: "warm",
      tone: "Chaleureux",
      hint: "Proche, complice, rassurant",
      text: `Bonjour {{prenom}} 😊 On pense à vous : ${offer}${city}. On vous garde tout au chaud — dites simplement OUI et on s'occupe du reste.${link}`,
    },
    {
      id: "urgent",
      tone: "Urgent",
      hint: "Rare, compte à rebours, stock limité",
      text: `⏳ {{prenom}}, plus que 48 h ! ${offerCap} — stock limité, départs chaque soir${city}. Répondez OUI maintenant pour bloquer le vôtre.${link}`,
    },
    {
      id: "premium",
      tone: "Premium",
      hint: "Exclusif, soigné, service concierge",
      text: `{{prenom}}, en avant-première pour nos clients privilégiés : ${offer}. Sélection réservée, livraison soignée${city} — répondez OUI, nous nous occupons de tout.${link}`,
    },
  ];
}

/* ── Meilleur titre ────────────────────────────────────────────────────── */
export function aiTitle(goal: CampaignGoal | null, name: string): string {
  return pick(TITLES[goal ?? "promotion"], name || "x");
}

/** Insère (ou remplace) le titre en gras *…* sur la première ligne. */
export function applyTitle(text: string, title: string): string {
  const line = `*${title}*`;
  if (text.startsWith("*")) {
    const nl = text.indexOf("\n");
    if (nl > 0 && text.slice(0, nl).endsWith("*")) return line + text.slice(nl);
  }
  return `${line}\n${text}`;
}

/* ── En tunisien (phonétique) ──────────────────────────────────────────── */
const TUNISIAN_RULES: { re: RegExp; to: string }[] = [
  { re: /\b[Bb]onsoir\b/g, to: "Masaa el khir" },
  { re: /\b[Aa]hla\b/g, to: "Ahla" }, // déjà tunisien, idempotent
  { re: /\bmerci beaucoup\b/gi, to: "3aychek bezzef" },
  { re: /\b[Mm]erci\b/g, to: "3aychek" },
  { re: /\b[Ll]ivraison offerte\b/g, to: "el livraison blash" },
  { re: /\b[Rr]épondez OUI pour réserver\b/g, to: "Jaweb OUI bch t7ajez" },
  { re: /\b[Rr]épondez OUI\b/g, to: "Jaweb OUI" },
  { re: /\bjusqu'à dimanche\b/gi, to: "lil nhar el a7ad" },
  { re: /\bcette semaine seulement\b/gi, to: "ken el jom3a hedhi" },
  { re: /\b[Cc]ette semaine\b/g, to: "el jom3a hedhi" },
  { re: /\b[Nn]otre coffret vedette\b/g, to: "el coffret el meshhour mte3na" },
  { re: /\b[Nn]otre coffret\b/g, to: "el coffret mte3na" },
  { re: /\bde retour\b/gi, to: "raje3" },
  { re: /\bplus que 48 h\b/gi, to: "ma ba9a ken 48 se3a" },
  { re: /\bmaintenant\b/gi, to: "tawa" },
  { re: /\b[Ss]eulement\b/g, to: "ken" },
  { re: /\bgrande nouvelle\b/gi, to: "khbir 3adhim" },
];

export function aiTunisian(text: string): string {
  let t = text;
  t = t.replace(/\bBonjour\b/g, "Ahla").replace(/\bbonjour\b/g, "ahla");
  for (const { re, to } of TUNISIAN_RULES) t = t.replace(re, to);
  return t;
}
