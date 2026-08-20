/**
 * WizardSteps — étapes 1→5 de l'assistant campagne (campaigns.md Vue 2).
 *   StepObjective  : 4 cartes radio + nom interne auto-suggéré + cible chiffrée
 *   StepAudience   : segments (compteurs vivants) + contacts manuels + exclusions,
 *                    carte récap « Éligibles » + donut CRM + estimation mono
 *   StepContent    : éditeur (variables, emoji, upload média réel, boutons),
 *                    carrousel intelligent (drag&drop Reorder, numérotation 1/n)
 *   StepPreview    : PhoneMock rendu exact par persona + checklist qualité
 *   StepSchedule   : maintenant/planifier (fuseau)/meilleur moment + cadence
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, Reorder, motion, useDragControls } from "framer-motion";
import {
  AlertTriangle, BadgeCheck, BellRing, CalendarClock, Check, ChevronDown, CircleStop, Clock,
  Download, FileText, GripVertical, Heart, ImagePlus, Languages, Layers, LayoutGrid,
  Link2, ListChecks, Loader2, Megaphone, MessageSquarePlus, Paperclip, Percent,
  RotateCcw, Search, Send, ShieldCheck, Smile, Sparkles, SpellCheck, Trash2, Type,
  Users, Wand2, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/sim/store";
import { useContacts, useSessions, useSim } from "@/lib/sim/store";
import { ConfirmDialog, PhoneMock, PhoneStatusBar, TickNumber } from "@/components/ui-shared";
import { cn } from "@/lib/utils";
import { mergeContacts, useCrm } from "@/sections/contacts/crmStore";
import type { CampaignGoal, CarouselCard, CarouselMode, Persona } from "./shared";
import {
  GOAL_META, PERSONAS, PRODUCT_IMAGES, REVIEW_THRESHOLD, TIMEZONES, VARIABLES,
  buildSegments, computeEligible, fmt, resolveVar, timeHM, tokenize, usedVariables,
} from "./shared";
import type { AiActionId, AiVariant } from "./aiWriter";
import {
  aiFix, aiGenerate, aiTitle, aiTunisian, aiVariants, applyTitle,
} from "./aiWriter";
import {
  CATALOG_FILENAME, CATALOG_SIZE, MONTAGE_FILENAME,
  downloadDataUrl, generateCatalogPdf, useMontage,
} from "./media";

/* ── État partagé de l'assistant ───────────────────────────────────────── */
export interface WizardState {
  step: number;
  goal: CampaignGoal | null;
  name: string;
  targetReplies: string;
  segments: string[];
  manualIds: string[];
  excludeInactive: boolean;
  excludeRecent: boolean;
  content: string;
  mediaUrl: string | null;
  buttons: string[];
  carouselOn: boolean;
  carouselMode: CarouselMode;
  cards: CarouselCard[];
  followUpOn: boolean;
  followUpMsg: string;
  stopOnReply: boolean;
  sendMode: "now" | "later" | "best";
  date: string;
  time: string;
  tz: string;
  rate: number;
  windowStart: number;
  windowEnd: number;
  spread: boolean;
  selectedSessionId: string;
}

export const INITIAL_WIZARD: WizardState = {
  step: 1,
  goal: null,
  name: "",
  targetReplies: "",
  segments: ["seg_clients"],
  manualIds: [],
  excludeInactive: false,
  excludeRecent: false,
  content:
    "Bonjour {{prenom}} ! Notre coffret découverte Aid est de retour : 3 parfums, livraison offerte à {{ville}} jusqu'à dimanche. Répondez OUI pour réserver. {{lien_promo}}",
  mediaUrl: null,
  buttons: ["Voir le catalogue"],
  carouselOn: false,
  carouselMode: "sequence",
  followUpOn: false,
  followUpMsg:
    "Bonjour {{prenom}} ! Notre offre vous attend encore : elle se termine bientôt. Répondez OUI pour en profiter. {{lien_promo}}",
  stopOnReply: false,
  cards: [
    { id: "card_1", image: "/product-pastry.png", title: "Coffret découverte", price: "68 TND", cta: "Réserver" },
    { id: "card_2", image: "/product-textile.png", title: "Étole Atlas de soie", price: "120 TND", cta: "Voir" },
    { id: "card_3", image: "/product-cosmetic.png", title: "Huile d'argan pure", price: "45 TND", cta: "Commander" },
  ],
  sendMode: "now",
  date: "",
  time: "09:00",
  tz: "Africa/Tunis",
  rate: 15,
  windowStart: 8,
  windowEnd: 21,
  spread: false,
  selectedSessionId: "",
};

export const SEED_CONTENT = INITIAL_WIZARD.content;

type Patch = (p: Partial<WizardState>) => void;

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/* ── Interrupteur pills du Studio ──────────────────────────────────────── */
function Toggle({
  checked, onChange, label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[22px] w-10 shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-mint" : "bg-surface-3",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn(
          "absolute top-0.5 size-[18px] rounded-full bg-white shadow",
          checked ? "end-0.5" : "start-0.5",
        )}
      />
    </button>
  );
}

/* ── Barre d'outils IA (étape Contenu) ─────────────────────────────────── */
const AI_BUTTONS: { id: AiActionId; label: string; icon: typeof Wand2 }[] = [
  { id: "generate", label: "Générer", icon: Wand2 },
  { id: "fix", label: "Corriger", icon: SpellCheck },
  { id: "variants", label: "3 variantes", icon: ListChecks },
  { id: "title", label: "Meilleur titre", icon: Type },
  { id: "tunisian", label: "En tunisien", icon: Languages },
];

/* ── Formats du carrousel intelligent ──────────────────────────────────── */
const CAROUSEL_FORMATS: { id: CarouselMode; label: string; icon: typeof Layers; hint: string }[] = [
  { id: "sequence", label: "Séquence 1/n", icon: Layers, hint: "Cartes défilables numérotées" },
  { id: "montage", label: "Montage", icon: LayoutGrid, hint: "Grille 2×2 en une seule image" },
  { id: "pdf", label: "Catalogue PDF", icon: FileText, hint: "Document multi-pages" },
];

/* ════════════════════════════════════════════════════════════════════════
   ÉTAPE 1 — Objectif
   ════════════════════════════════════════════════════════════════════════ */
const GOAL_ICONS: Record<CampaignGoal, typeof Percent> = {
  promotion: Percent,
  relance: RotateCcw,
  annonce: Megaphone,
  fidelisation: Heart,
};

export function StepObjective({ s, patch }: { s: WizardState; patch: Patch }) {
  const nameTouched = useRef(!!s.name);
  const goals = Object.keys(GOAL_META) as CampaignGoal[];

  const select = (goal: CampaignGoal) => {
    const next: Partial<WizardState> = { goal };
    if (!nameTouched.current) {
      const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
      next.name = `${GOAL_META[goal].label} — ${date}`;
    }
    patch(next);
  };

  return (
    <div>
      <h3 className="font-display text-[24px] leading-[30px] font-semibold text-hi">Quel est l'objectif ?</h3>
      <p className="mt-1 text-[14px] text-mid">Il détermine le ton, les métriques suivies et les suggestions de contenu.</p>

      <motion.div
        className="mt-6 grid gap-3 sm:grid-cols-2"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      >
        {goals.map((g) => {
          const meta = GOAL_META[g];
          const Icon = GOAL_ICONS[g];
          const active = s.goal === g;
          return (
            <motion.button
              key={g}
              type="button"
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.45, ease: EASE }}
              onClick={() => select(g)}
              aria-pressed={active}
              className={cn(
                "group relative rounded-r-md border p-5 text-start transition-all duration-300",
                active
                  ? "border-gradient -translate-y-0.5 shadow-card"
                  : "border-line bg-surface-1 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card",
              )}
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-full transition-all duration-300",
                  active ? "gradient-signature text-white shadow-glow-iris" : "bg-surface-2 text-mid group-hover:text-hi",
                )}
              >
                <Icon className={cn("size-5 transition-transform duration-300", active && "animate-pulse")} />
              </span>
              <span className="mt-3 block text-[15px] font-semibold text-hi">{meta.label}</span>
              <span className="mt-0.5 block text-[12px] text-low">{meta.hint}</span>
              {/* coche dessinée */}
              <svg viewBox="0 0 24 24" className="absolute end-4 top-4 size-5 text-mint" aria-hidden>
                <motion.path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                  animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                />
              </svg>
            </motion.button>
          );
        })}
      </motion.div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="wz-name" className="label-micro text-low">Nom interne</label>
          <input
            id="wz-name"
            value={s.name}
            onChange={(e) => { nameTouched.current = true; patch({ name: e.target.value }); }}
            placeholder="Promotion — 12 mai"
            className="mt-2 w-full rounded-r-sm border border-line bg-surface-2 px-3 py-2.5 text-[14px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="wz-target" className="label-micro text-low">Objectif chiffré (optionnel)</label>
          <input
            id="wz-target"
            value={s.targetReplies}
            onChange={(e) => patch({ targetReplies: e.target.value.replace(/[^0-9]/g, "") })}
            placeholder="Cible : 50 réponses"
            inputMode="numeric"
            className="mt-2 w-full rounded-r-sm border border-line bg-surface-2 px-3 py-2.5 text-[14px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ÉTAPE 2 — Audience
   ════════════════════════════════════════════════════════════════════════ */
const STAGE_META: { id: Contact["stage"]; label: string; color: string }[] = [
  { id: "prospect", label: "Prospect", color: "var(--pulse)" },
  { id: "interested", label: "Intéressé", color: "var(--iris)" },
  { id: "client", label: "Client", color: "var(--mint)" },
  { id: "loyal", label: "Fidèle", color: "var(--amber)" },
  { id: "lost", label: "Perdu", color: "var(--rose)" },
];

function MiniDonut({ eligible }: { eligible: Contact[] }) {
  const counts = STAGE_META.map((st) => ({ ...st, n: eligible.filter((c) => c.stage === st.id).length }));
  const total = Math.max(1, eligible.length);
  const R = 34;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
        {counts.map((st) => {
          const frac = st.n / total;
          const dash = `${frac * C} ${C}`;
          const el = (
            <motion.circle
              key={st.id}
              cx="44" cy="44" r={R} fill="none"
              stroke={st.color} strokeWidth="10" strokeLinecap="butt"
              initial={false}
              animate={{ strokeDasharray: dash, strokeDashoffset: -offset }}
              transition={{ duration: 0.6, ease: EASE }}
            />
          );
          offset += frac * C;
          return el;
        })}
      </svg>
      <ul className="space-y-1">
        {counts.filter((st) => st.n > 0).map((st) => (
          <li key={st.id} className="flex items-center gap-2 text-[11px] text-mid">
            <span className="size-2 rounded-full" style={{ backgroundColor: st.color }} />
            {st.label} <span className="font-mono text-low tabular">{st.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StepAudience({ s, patch, eligibleCount }: { s: WizardState; patch: Patch; eligibleCount: (ids: Contact[]) => void }) {
  const baseContacts = useContacts();
  const overrides = useCrm((state) => state.overrides);
  const extra = useCrm((state) => state.extra);
  const deleted = useCrm((state) => state.deleted);
  const contacts = useMemo(
    () => mergeContacts(baseContacts, { overrides, extra, deleted }),
    [baseContacts, overrides, extra, deleted],
  );
  const segments = useMemo(() => buildSegments(contacts), [contacts]);
  const [query, setQuery] = useState("");

  const eligible = useMemo(
    () => computeEligible(contacts, segments, s.segments, s.manualIds, s.excludeInactive, s.excludeRecent),
    [contacts, segments, s.segments, s.manualIds, s.excludeInactive, s.excludeRecent],
  );
  useEffect(() => { eligibleCount(eligible); }, [eligible, eligibleCount]);

  const toggleSegment = (id: string) =>
    patch({ segments: s.segments.includes(id) ? s.segments.filter((x) => x !== id) : [...s.segments, id] });

  const manualContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((c) => c.consent)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q))
      .slice(0, 8);
  }, [contacts, query]);

  const manualSelected = contacts.filter((c) => s.manualIds.includes(c.id));
  const toggleManual = (id: string) =>
    patch({ manualIds: s.manualIds.includes(id) ? s.manualIds.filter((x) => x !== id) : [...s.manualIds, id] });

  const minutes = Math.ceil(eligible.length / Math.max(1, s.rate));

  return (
    <div>
      <h3 className="font-display text-[24px] leading-[30px] font-semibold text-hi">Qui va recevoir ce message ?</h3>
      <p className="mt-1 text-[14px] text-mid">Combinez segments et contacts manuels. Les désinscrits sont toujours exclus.</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {/* Segments */}
          <div className="space-y-2" role="group" aria-label="Segments">
            {segments.map((seg) => {
              const active = s.segments.includes(seg.id);
              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => toggleSegment(seg.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-r-md border p-3.5 text-start transition-all duration-200",
                    active ? "border-iris/60 bg-iris/[.07]" : "border-line bg-surface-1 hover:border-line-strong",
                  )}
                >
                  <span className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors",
                    active ? "border-iris bg-iris text-white" : "border-line-strong bg-surface-2",
                  )}>
                    {active && <Check className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-hi">{seg.label}</span>
                    <span className="block text-[11px] text-low">{seg.hint}</span>
                  </span>
                  <span className="font-mono text-[12px] text-pulse tabular"><TickNumber value={seg.count} /></span>
                </button>
              );
            })}
          </div>

          {/* Contacts manuels */}
          <div className="rounded-r-md border border-line bg-surface-1 p-3.5">
            <p className="label-micro text-low">Contacts manuels</p>
            <div className="mt-2.5 flex items-center gap-2 rounded-r-sm border border-line bg-surface-2 px-3">
              <Search className="size-3.5 text-low" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un contact consenti…"
                aria-label="Rechercher un contact"
                className="h-9 w-full bg-transparent text-[13px] text-hi placeholder:text-low focus:outline-none"
              />
            </div>
            {manualSelected.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <AnimatePresence>
                  {manualSelected.map((c) => (
                    <motion.span
                      key={c.id}
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 420, damping: 22 }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-pulse/10 px-2.5 py-1 text-[12px] text-pulse"
                    >
                      {c.name}
                      <button type="button" onClick={() => toggleManual(c.id)} aria-label={`Retirer ${c.name}`}>
                        <X className="size-3" />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            )}
            <ul className="mt-2.5 max-h-44 space-y-0.5 overflow-y-auto">
              {manualContacts.map((c) => {
                const active = s.manualIds.includes(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => toggleManual(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-r-sm px-2.5 py-2 text-start transition-colors",
                        active ? "bg-pulse/10" : "hover:bg-surface-2",
                      )}
                    >
                      <span className="flex size-6 items-center justify-center rounded-full bg-surface-3 text-[9px] font-bold text-mid">
                        {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-hi">{c.name}</span>
                        <span className="block font-mono text-[10px] text-low tabular">{c.phone} · {c.city}</span>
                      </span>
                      {active && <Check className="size-3.5 text-pulse" />}
                    </button>
                  </li>
                );
              })}
              {manualContacts.length === 0 && (
                <li className="px-2.5 py-3 text-[12px] text-low">Aucun contact ne correspond.</li>
              )}
            </ul>
          </div>

          {/* Exclusions */}
          <div className="space-y-2 rounded-r-md border border-line bg-surface-1 p-3.5">
            <p className="label-micro text-low">Exclusions</p>
            <label className="flex cursor-not-allowed items-center gap-3 rounded-r-sm bg-surface-2/60 p-2.5" title="Conformité : les désinscrits sont toujours exclus">
              <span className="flex size-5 items-center justify-center rounded-[6px] border border-mint bg-mint text-white">
                <Check className="size-3.5" />
              </span>
              <span className="flex-1 text-[13px] text-mid">Exclure les désinscrits <span className="text-low">(verrouillé — conformité)</span></span>
            </label>
            {[
              { key: "excludeInactive" as const, label: "Exclure le segment Inactifs (score < 40)" },
              { key: "excludeRecent" as const, label: "Exclure les contacts ciblés ces dernières 24 h" },
            ].map((opt) => {
              const active = s[opt.key];
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => patch({ [opt.key]: !active })}
                  aria-pressed={active}
                  className="flex w-full items-center gap-3 rounded-r-sm p-2.5 text-start transition-colors hover:bg-surface-2"
                >
                  <span className={cn(
                    "flex size-5 items-center justify-center rounded-[6px] border transition-colors",
                    active ? "border-iris bg-iris text-white" : "border-line-strong bg-surface-2",
                  )}>
                    {active && <Check className="size-3.5" />}
                  </span>
                  <span className="text-[13px] text-mid">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Récap live */}
        <aside className="h-fit rounded-r-md border border-line bg-surface-1 p-5 lg:sticky lg:top-20">
          <p className="label-micro text-low">Éligibles</p>
          <p className="mt-1 font-display text-[34px] leading-[38px] font-semibold text-hi tabular">
            <TickNumber value={eligible.length} />
          </p>
          {eligible.length === 0 ? (
            <p className="mt-3 flex items-start gap-2 rounded-r-sm border border-amber/40 bg-amber/10 p-3 text-[12px] text-amber">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Aucun contact éligible — élargissez la sélection pour continuer.
            </p>
          ) : (
            <>
              <div className="mt-4"><MiniDonut eligible={eligible} /></div>
              <p className="mt-4 rounded-r-sm bg-surface-2 p-2.5 font-mono text-[11px] text-mid tabular">
                ~{fmt(eligible.length)} messages · fenêtre {minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`} à {s.rate} msg/min
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ÉTAPE 3 — Contenu
   ════════════════════════════════════════════════════════════════════════ */
const EMOJIS = ["👋", "😊", "🎉", "✨", "❤️", "🥐", "🍰", "🎁", "🚚", "📍", "✅", "🙏"];

function CarouselCardItem({
  card, index, total, onChange, onRemove,
}: {
  card: CarouselCard;
  index: number;
  total: number;
  onChange: (c: CarouselCard) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={card}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.02, boxShadow: "0 32px 80px -24px rgba(3,6,18,.7)" }}
      className="rounded-r-md border border-line bg-surface-1 p-3.5"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onPointerDown={(e) => controls.start(e)}
          aria-label="Réorganiser la carte"
          className="cursor-grab touch-none text-low transition-colors hover:text-mid active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <img src={card.image} alt="" className="size-11 rounded-r-sm border border-line object-cover" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[13px] font-medium text-hi">
            Carte <span className="rounded-full bg-iris/15 px-1.5 font-mono text-[10px] text-iris tabular">{index + 1}/{total}</span>
          </p>
          <p className="truncate text-[11px] text-low">{card.title || "Sans titre"} · {card.price || "—"}</p>
        </div>
        <button type="button" onClick={onRemove} aria-label="Supprimer la carte" className="text-low transition-colors hover:text-rose">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_96px_110px]">
        <input
          value={card.title}
          onChange={(e) => onChange({ ...card, title: e.target.value })}
          placeholder="Titre de la carte"
          aria-label="Titre de la carte"
          className="rounded-r-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
        />
        <input
          value={card.price}
          onChange={(e) => onChange({ ...card, price: e.target.value })}
          placeholder="68 TND"
          aria-label="Prix"
          className="rounded-r-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
        />
        <input
          value={card.cta}
          onChange={(e) => onChange({ ...card, cta: e.target.value })}
          placeholder="Libellé du bouton"
          aria-label="Libellé du bouton"
          className="rounded-r-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
        />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {PRODUCT_IMAGES.map((img) => (
          <button
            key={img.src}
            type="button"
            title={img.label}
            onClick={() => onChange({ ...card, image: img.src })}
            className={cn(
              "overflow-hidden rounded-r-sm border-2 transition-all",
              card.image === img.src ? "border-iris" : "border-transparent opacity-60 hover:opacity-100",
            )}
          >
            <img src={img.src} alt={img.label} className="size-8 object-cover" />
          </button>
        ))}
      </div>
    </Reorder.Item>
  );
}

export function StepContent({ s, patch }: { s: WizardState; patch: Patch }) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [newButton, setNewButton] = useState("");
  const emojiRef = useRef<HTMLDivElement>(null);

  /* ── IA rédactionnelle ── */
  const [aiBusy, setAiBusy] = useState<AiActionId | null>(null);
  const [aiVars, setAiVars] = useState<AiVariant[] | null>(null);
  const aiTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (aiTimer.current !== null) window.clearTimeout(aiTimer.current);
  }, []);

  /* ── Montage canvas + PDF ── */
  const montageUrl = useMontage(s.cards, s.name, s.carouselOn && s.carouselMode === "montage");
  const [pdfBusy, setPdfBusy] = useState(false);

  const runAi = (action: AiActionId) => {
    if (aiBusy) return;
    setAiBusy(action);
    if (action !== "variants") setAiVars(null);
    aiTimer.current = window.setTimeout(() => {
      switch (action) {
        case "generate":
          patch({ content: aiGenerate(s.goal, s.name) });
          toast.success("Message généré", { description: "Brouillon IA inséré — variables {{prenom}} conservées." });
          break;
        case "fix":
          patch({ content: aiFix(s.content) });
          toast.success("Texte corrigé", { description: "Espaces, ponctuation et majuscules ajustés." });
          break;
        case "variants":
          setAiVars(aiVariants(s.content, s.goal));
          break;
        case "title": {
          const t = aiTitle(s.goal, s.name);
          patch({ content: applyTitle(s.content, t) });
          toast.success("Titre inséré en gras", { description: `« ${t} » placé en première ligne.` });
          break;
        }
        case "tunisian":
          patch({ content: aiTunisian(s.content) });
          toast.success("Version tunisienne", { description: "Formules clés reformulées en tunisien phonétique." });
          break;
      }
      setAiBusy(null);
    }, 900);
  };

  const downloadPdf = () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    generateCatalogPdf({ title: s.name, cards: s.cards })
      .then(() => toast.success("Catalogue PDF généré", { description: `${CATALOG_FILENAME} · ${s.cards.length} produit(s)` }))
      .catch(() => toast.error("PDF impossible", { description: "La génération du catalogue a échoué." }))
      .finally(() => setPdfBusy(false));
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const insertAtCursor = (snippet: string) => {
    const ta = taRef.current;
    if (!ta) { patch({ content: s.content + snippet }); return; }
    const start = ta.selectionStart ?? s.content.length;
    const end = ta.selectionEnd ?? s.content.length;
    const next = s.content.slice(0, start) + snippet + s.content.slice(end);
    patch({ content: next });
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const mediaInputRef = useRef<HTMLInputElement>(null);

  /* Upload réel : lecture du fichier image choisi (FileReader → data URL). */
  const onMediaFile = (f: File | undefined) => {
    if (!f || uploading !== null) return;
    if (!f.type.startsWith("image/")) {
      return;
    }
    setUploading(0);
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) setUploading(Math.round((e.loaded / e.total) * 100));
    };
    reader.onload = () => {
      setUploading(null);
      patch({ mediaUrl: String(reader.result ?? "") });
    };
    reader.onerror = () => setUploading(null);
    reader.readAsDataURL(f);
  };

  const len = s.content.length;
  const segmentsCount = Math.max(1, Math.ceil(len / 160));
  const over = len > 900;

  return (
    <div>
      <h3 className="font-display text-[24px] leading-[30px] font-semibold text-hi">Rédigez le message</h3>
      <p className="mt-1 text-[14px] text-mid">Variables, média, boutons d'action et carrousel intelligent — le rendu exact est à l'étape suivante.</p>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_340px]">
        {/* Éditeur */}
        <div>
          <div className="rounded-r-md border border-line bg-surface-1">
            {/* Barre d'outils */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line p-2.5">
              {VARIABLES.map((v) => (
                <motion.button
                  key={v}
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={() => insertAtCursor(v)}
                  className="rounded-full bg-pulse/10 px-2.5 py-1 font-mono text-[11px] text-pulse transition-colors hover:bg-pulse/20"
                >
                  {v}
                </motion.button>
              ))}
              <span className="mx-1 h-5 w-px bg-line" />
              <div className="relative" ref={emojiRef}>
                <button
                  type="button"
                  onClick={() => setEmojiOpen((o) => !o)}
                  aria-label="Insérer un emoji"
                  className="flex size-8 items-center justify-center rounded-r-sm text-mid transition-colors hover:bg-surface-2 hover:text-hi"
                >
                  <Smile className="size-4" />
                </button>
                <AnimatePresence>
                  {emojiOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute start-0 top-9 z-40 grid w-52 grid-cols-6 gap-1 rounded-r-md border border-line bg-surface-3 p-2 shadow-card"
                    >
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => { insertAtCursor(e); setEmojiOpen(false); }}
                          className="flex size-7 items-center justify-center rounded text-[16px] transition-colors hover:bg-surface-2"
                        >
                          {e}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                disabled={uploading !== null}
                aria-label="Ajouter un média"
                className="flex size-8 items-center justify-center rounded-r-sm text-mid transition-colors hover:bg-surface-2 hover:text-hi disabled:opacity-50"
              >
                <ImagePlus className="size-4" />
              </button>
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  onMediaFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Barre IA rédactionnelle */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface-2/50 p-2.5">
              <span className="me-1 inline-flex items-center gap-1.5 label-micro text-iris">
                <Sparkles className="size-3.5" /> IA
              </span>
              {AI_BUTTONS.map((b) => {
                const Icon = b.icon;
                const busy = aiBusy === b.id;
                return (
                  <motion.button
                    key={b.id}
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    disabled={aiBusy !== null}
                    onClick={() => runAi(b.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      busy
                        ? "border-iris/50 bg-iris/15 text-iris"
                        : "border-line bg-surface-1 text-mid hover:border-iris/40 hover:text-iris disabled:opacity-50",
                    )}
                  >
                    {busy ? <Loader2 className="size-3 animate-spin" /> : <Icon className="size-3" />}
                    {b.label}
                  </motion.button>
                );
              })}
              <AnimatePresence>
                {aiBusy && (
                  <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="ms-1 inline-flex items-center gap-1.5 text-[11px] text-pulse"
                    aria-live="polite"
                  >
                    <Loader2 className="size-3 animate-spin" /> L'IA rédige…
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <textarea
              ref={taRef}
              value={s.content}
              onChange={(e) => patch({ content: e.target.value.slice(0, 1024) })}
              rows={6}
              placeholder="Bonjour {{prenom}} ! …"
              aria-label="Contenu du message"
              className="w-full resize-y rounded-b-r-md bg-transparent p-4 text-[14px] leading-[22px] text-hi placeholder:text-low focus:outline-none"
            />

            {/* Aperçu variables en chips */}
            <div className="border-t border-line px-4 py-3">
              <p className="text-[12px] leading-[20px] text-mid">
                {tokenize(s.content).map((t, i) =>
                  t.variable ? (
                    <motion.span
                      key={`${i}-${t.text}`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 22 }}
                      className="mx-0.5 inline-block rounded-full bg-pulse/10 px-1.5 py-px font-mono text-[10px] text-pulse"
                    >
                      {t.text}
                    </motion.span>
                  ) : (
                    <span key={i}>{t.text}</span>
                  ),
                )}
              </p>
            </div>
          </div>

          {/* Variantes IA — cartes radio */}
          <AnimatePresence>
            {aiVars && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="mt-3 rounded-r-md border border-iris/40 bg-iris/[.05] p-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="label-micro text-iris">3 variantes IA — choisissez un ton</p>
                  <button
                    type="button"
                    onClick={() => setAiVars(null)}
                    aria-label="Fermer les variantes"
                    className="flex size-6 items-center justify-center rounded-full text-low transition-colors hover:bg-surface-2 hover:text-hi"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="mt-2.5 space-y-2" role="radiogroup" aria-label="Variantes de message proposées par l'IA">
                  {aiVars.map((v) => {
                    const active = s.content === v.text;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          patch({ content: v.text });
                          setAiVars(null);
                          toast.success(`Variante « ${v.tone} » appliquée`, { description: "Le contenu du message a été remplacé." });
                        }}
                        className={cn(
                          "w-full rounded-r-md border p-3 text-start transition-all duration-200",
                          active ? "border-iris/60 bg-iris/[.08]" : "border-line bg-surface-1 hover:border-iris/40",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                              active ? "border-iris bg-iris text-white" : "border-line-strong bg-surface-2",
                            )}
                          >
                            {active && <Check className="size-2.5" />}
                          </span>
                          <span className="text-[12px] font-semibold text-hi">{v.tone}</span>
                          <span className="text-[10px] text-low">{v.hint}</span>
                        </span>
                        <span className="mt-1.5 block text-[12px] leading-[18px] text-mid">{v.text}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Média */}
          <div className="mt-3">
            {uploading !== null ? (
              <div className="rounded-r-md border border-line bg-surface-1 p-3.5">
                <p className="label-micro text-low">Envoi du média…</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <motion.div className="h-full gradient-signature" animate={{ width: `${uploading}%` }} transition={{ duration: 0.1 }} />
                </div>
              </div>
            ) : s.mediaUrl ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                className="flex items-center gap-3 rounded-r-md border border-line bg-surface-1 p-3"
              >
                <img src={s.mediaUrl} alt="Média joint" className="size-14 rounded-r-sm border border-line object-cover" />
                <div className="flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-hi"><Paperclip className="size-3.5 text-pulse" /> Image jointe</p>
                  <p className="text-[11px] text-low">Elle apparaîtra au-dessus du message.</p>
                </div>
                <button type="button" onClick={() => patch({ mediaUrl: null })} aria-label="Retirer le média" className="text-low transition-colors hover:text-rose">
                  <Trash2 className="size-4" />
                </button>
              </motion.div>
            ) : null}
          </div>

          {/* Boutons d'action */}
          <div className="mt-3 rounded-r-md border border-line bg-surface-1 p-3.5">
            <p className="label-micro text-low">Boutons d'action ({s.buttons.length}/3)</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <AnimatePresence>
                {s.buttons.map((b) => (
                  <motion.span
                    key={b}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-iris/10 px-2.5 py-1 text-[12px] text-iris"
                  >
                    <Link2 className="size-3" /> {b}
                    <button type="button" onClick={() => patch({ buttons: s.buttons.filter((x) => x !== b) })} aria-label={`Retirer ${b}`}>
                      <X className="size-3" />
                    </button>
                  </motion.span>
                ))}
              </AnimatePresence>
              {s.buttons.length < 3 && (
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = newButton.trim();
                    if (v && !s.buttons.includes(v)) patch({ buttons: [...s.buttons, v].slice(0, 3) });
                    setNewButton("");
                  }}
                >
                  <input
                    value={newButton}
                    onChange={(e) => setNewButton(e.target.value)}
                    placeholder="Réserver"
                    aria-label="Nouveau bouton d'action"
                    className="h-7 w-32 rounded-full border border-dashed border-line-strong bg-transparent px-2.5 text-[12px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
                  />
                  <button type="submit" aria-label="Ajouter le bouton" className="flex size-7 items-center justify-center rounded-full border border-line text-mid hover:text-hi">
                    <MessageSquarePlus className="size-3.5" />
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Compteur */}
          <p className={cn("mt-3 flex items-center justify-between font-mono text-[11px] tabular", over ? "text-amber" : "text-low")}>
            <span>{over && "⚠ Message long — privilégiez la concision. "}{fmt(len)} / 1 024 caractères</span>
            <span>≈ {segmentsCount} segment{segmentsCount > 1 ? "s" : ""} SMS-équivalent</span>
          </p>
        </div>

        {/* Carrousel intelligent */}
        <aside className="h-fit rounded-r-md border border-line bg-surface-1 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-hi">Carrousel intelligent</p>
            <Toggle checked={s.carouselOn} onChange={(v) => patch({ carouselOn: v })} label="Activer le carrousel intelligent" />
          </div>
          <p className="mt-1 text-[12px] text-low">Cartes produits défilables, numérotées automatiquement. Le message principal devient la carte 0.</p>

          <AnimatePresence>
            {s.carouselOn && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="overflow-hidden"
              >
                {/* Sélecteur de format */}
                <div className="mt-3 grid grid-cols-3 gap-1 rounded-r-sm border border-line bg-surface-2 p-1" role="radiogroup" aria-label="Format d'envoi">
                  {CAROUSEL_FORMATS.map((f) => {
                    const Icon = f.icon;
                    const active = s.carouselMode === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={f.hint}
                        onClick={() => patch({ carouselMode: f.id })}
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-[10px] px-1.5 py-1.5 text-[11px] font-medium transition-all duration-200",
                          active ? "bg-surface-1 text-hi shadow-card" : "text-low hover:text-mid",
                        )}
                      >
                        <Icon className={cn("size-3.5", active && "text-iris")} />
                        <span className="hidden min-[420px]:inline">{f.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Montage 2×2 — aperçu canvas + téléchargement */}
                {s.carouselMode === "montage" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="mt-3 rounded-r-md border border-line bg-surface-2/50 p-3"
                  >
                    {s.cards.length === 0 ? (
                      <p className="flex items-center gap-2 py-2 text-[12px] text-amber">
                        <AlertTriangle className="size-3.5 shrink-0" /> Ajoutez au moins une carte pour composer le montage.
                      </p>
                    ) : montageUrl ? (
                      <>
                        <img src={montageUrl} alt="Aperçu du montage 2×2" className="w-full rounded-r-sm border border-line" />
                        <p className="mt-2 text-[11px] text-low">
                          Grille 2×2 générée en canvas — envoyée comme <span className="text-mid">une seule image</span>.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            downloadDataUrl(montageUrl, MONTAGE_FILENAME);
                            toast.success("Montage téléchargé", { description: MONTAGE_FILENAME });
                          }}
                          className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-r-sm border border-iris/40 bg-iris/10 px-3 py-2 text-[12px] font-medium text-iris transition-colors hover:bg-iris/20"
                        >
                          <Download className="size-3.5" /> Télécharger le montage
                        </button>
                      </>
                    ) : (
                      <p className="flex items-center gap-2 py-6 text-[12px] text-low">
                        <Loader2 className="size-3.5 animate-spin" /> Génération du montage…
                      </p>
                    )}
                  </motion.div>
                )}

                {/* Catalogue PDF — récap + génération */}
                {s.carouselMode === "pdf" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="mt-3 rounded-r-md border border-line bg-surface-2/50 p-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-r-sm bg-rose/15 text-rose">
                        <FileText className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-hi">{CATALOG_FILENAME}</p>
                        <p className="text-[10px] text-low">
                          PDF · {CATALOG_SIZE} · couverture + {s.cards.length} page(s) produit + contact
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={downloadPdf}
                      disabled={pdfBusy}
                      className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-r-sm border border-rose/40 bg-rose/10 px-3 py-2 text-[12px] font-medium text-rose transition-colors hover:bg-rose/20 disabled:opacity-60"
                    >
                      {pdfBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                      Télécharger le PDF
                    </button>
                    <p className="mt-2 text-[11px] text-low">Le document sera joint au message, visible à l'étape Prévisualiser.</p>
                  </motion.div>
                )}

                <Reorder.Group
                  axis="y"
                  values={s.cards}
                  onReorder={(cards) => patch({ cards })}
                  className="mt-3 space-y-2.5"
                >
                  {s.cards.map((card, i) => (
                    <CarouselCardItem
                      key={card.id}
                      card={card}
                      index={i}
                      total={s.cards.length}
                      onChange={(c) => patch({ cards: s.cards.map((x) => (x.id === c.id ? c : x)) })}
                      onRemove={() => patch({ cards: s.cards.filter((x) => x.id !== card.id) })}
                    />
                  ))}
                </Reorder.Group>
                {s.cards.length < 5 && (
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        cards: [
                          ...s.cards,
                          {
                            id: `card_${Date.now().toString(36)}`,
                            image: PRODUCT_IMAGES[s.cards.length % PRODUCT_IMAGES.length].src,
                            title: "",
                            price: "",
                            cta: "Voir",
                          },
                        ],
                      })
                    }
                    className="mt-3 w-full rounded-r-sm border border-dashed border-line-strong py-2 text-[12px] text-mid transition-colors hover:border-iris hover:text-iris"
                  >
                    + Ajouter une carte
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ÉTAPE 4 — Prévisualisation
   ════════════════════════════════════════════════════════════════════════ */
function PreviewBubble({ s, persona }: { s: WizardState; persona: Persona }) {
  const orgName = useSim((st) => st.org.name).trim() || "Votre entreprise";
  const [slide, setSlide] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const montageUrl = useMontage(s.cards, s.name, s.carouselOn && s.carouselMode === "montage");
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !s.cards.length) return;
    const w = el.scrollWidth / s.cards.length;
    setSlide(Math.round(el.scrollLeft / w));
  };

  return (
    <>
      <PhoneStatusBar />
      {/* En-tête conversation */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <img src="/logo.svg" alt="" className="size-6" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-hi">{orgName}</p>
          <p className="text-[9px] text-mint">en ligne</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={persona.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="flex flex-col items-end gap-1.5"
          >
            {s.mediaUrl && (
              <img src={s.mediaUrl} alt="" className="w-[78%] rounded-2xl rounded-br-md border border-line object-cover" />
            )}
            <div className="bubble-out max-w-[85%] self-end rounded-2xl rounded-br-md px-3 py-2 text-[11px] leading-[15px] text-white">
              {tokenize(s.content).map((t, i) =>
                t.variable ? (
                  <motion.span
                    key={`${persona.id}-${i}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.03 }}
                    className="mx-px inline-block rounded-full bg-white/20 px-1.5 py-px font-medium"
                  >
                    {resolveVar(t.text, persona)}
                  </motion.span>
                ) : (
                  <span key={i}>{t.text}</span>
                ),
              )}
            </div>
            {s.buttons.length > 0 && (
              <div className="flex max-w-[85%] flex-wrap justify-end gap-1">
                {s.buttons.map((b) => (
                  <span key={b} className="rounded-full border border-pulse/50 px-2 py-0.5 text-[9px] font-medium text-pulse">
                    {b}
                  </span>
                ))}
              </div>
            )}

            {/* Montage 2×2 — une seule image */}
            {s.carouselOn && s.carouselMode === "montage" && s.cards.length > 0 && (
              montageUrl ? (
                <motion.img
                  src={montageUrl}
                  alt="Montage produits 2×2"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="w-[85%] rounded-2xl rounded-br-md border border-line object-cover"
                />
              ) : (
                <div className="flex h-28 w-[85%] items-center justify-center rounded-2xl border border-line bg-surface-2 text-low">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              )
            )}

            {/* Catalogue PDF — message document */}
            {s.carouselOn && s.carouselMode === "pdf" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="flex w-[78%] items-center gap-2 self-end rounded-2xl rounded-br-md border border-line bg-surface-1 p-2.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose/15 text-rose">
                  <FileText className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-semibold text-hi">{CATALOG_FILENAME}</span>
                  <span className="block font-mono text-[8px] text-low tabular">PDF · {CATALOG_SIZE}</span>
                </span>
                <Download className="size-3.5 shrink-0 text-low" />
              </motion.div>
            )}

            {/* Carrousel défilable */}
            {s.carouselOn && s.carouselMode === "sequence" && s.cards.length > 0 && (
              <div className="w-full">
                <div
                  ref={scrollRef}
                  onScroll={onScroll}
                  className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {s.cards.map((card, i) => (
                    <div key={card.id} className="w-[150px] shrink-0 snap-start overflow-hidden rounded-xl border border-line bg-surface-1">
                      <div className="relative">
                        <img src={card.image} alt="" className="h-20 w-full object-cover" />
                        <span className="absolute end-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-[8px] text-white tabular">
                          {i + 1}/{s.cards.length}
                        </span>
                      </div>
                      <div className="p-2">
                        <p className="truncate text-[10px] font-semibold text-hi">{card.title || "Produit"}</p>
                        <p className="font-mono text-[9px] text-pulse tabular">{card.price || "—"}</p>
                        <span className="mt-1.5 block rounded-full gradient-signature py-1 text-center text-[9px] font-semibold text-white">
                          {card.cta || "Voir"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex justify-center gap-1">
                  {s.cards.map((card, i) => (
                    <span key={card.id} className={cn("size-1.5 rounded-full transition-colors", i === Math.min(slide, s.cards.length - 1) ? "bg-pulse" : "bg-surface-3")} />
                  ))}
                </div>
              </div>
            )}

            <p className="mt-1 w-full text-center font-mono text-[8px] uppercase tracking-wider text-low">
              Répondez STOP pour vous désinscrire
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

export function StepPreview({ s }: { s: WizardState }) {
  const [personaId, setPersonaId] = useState(PERSONAS[0].id);
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];
  const [testOpen, setTestOpen] = useState(false);
  const [phone, setPhone] = useState("+216 ");

  const used = usedVariables(s.content);
  const checks = [
    { label: `Variables : ${used.length}/${used.length} résolues`, ok: true, show: used.length > 0 },
    { label: s.content.length <= 1024 ? "Longueur OK" : "Message trop long", ok: s.content.length <= 1024, show: true },
    { label: "Lien promo présent", ok: true, show: used.includes("{{lien_promo}}") },
    { label: "Désinscription : mention incluse", ok: true, show: true },
  ].filter((c) => c.show);

  return (
    <div>
      <h3 className="font-display text-[24px] leading-[30px] font-semibold text-hi">Prévisualisation exacte</h3>
      <p className="mt-1 text-[14px] text-mid">Le rendu réel tel que le verra chaque persona — variables remplies, média, boutons, carrousel.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[auto_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mx-auto"
        >
          <PhoneMock width={272}>
            <PreviewBubble s={s} persona={persona} />
          </PhoneMock>
        </motion.div>

        <div className="space-y-5">
          {/* Personas */}
          <div>
            <p className="label-micro text-low">Persona de test</p>
            <div className="mt-2.5 space-y-2" role="radiogroup" aria-label="Persona de test">
              {PERSONAS.map((p) => {
                const active = p.id === personaId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPersonaId(p.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-r-md border p-3 text-start transition-all",
                      active ? "border-iris/60 bg-iris/[.07]" : "border-line bg-surface-1 hover:border-line-strong",
                    )}
                  >
                    <span className={cn(
                      "flex size-8 items-center justify-center rounded-full text-[10px] font-bold text-white",
                      active ? "gradient-signature" : "bg-surface-3 text-mid",
                    )}>
                      {p.first[0]}{p.last[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-hi">{p.name}</span>
                      <span className="block text-[11px] text-low">{p.city} — {p.segment}</span>
                    </span>
                    {active && <Check className="size-4 text-iris" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checklist qualité */}
          <div className="rounded-r-md border border-line bg-surface-1 p-4">
            <p className="label-micro text-low">Checklist qualité</p>
            <motion.ul
              className="mt-2.5 space-y-2"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.1 } } }}
            >
              {checks.map((c) => (
                <motion.li
                  key={c.label}
                  variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-2.5 py-1.5 text-[12px]",
                    c.ok ? "bg-mint/10 text-mint" : "bg-amber/10 text-amber",
                  )}
                >
                  {c.ok ? <BadgeCheck className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                  {c.label}
                </motion.li>
              ))}
            </motion.ul>
          </div>

          <button
            type="button"
            onClick={() => setTestOpen(true)}
            className="inline-flex items-center gap-2 rounded-r-sm border border-pulse/40 bg-pulse/10 px-4 py-2.5 text-[13px] font-medium text-pulse transition-colors hover:bg-pulse/20"
          >
            <Send className="size-4" /> Recevoir un test
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={testOpen}
        onClose={() => setTestOpen(false)}
        onConfirm={() => toast.success("Message de test planifié", { description: `Destination : ${phone}` })}
        title="Recevoir un message de test"
        description={
          <span>
            Le message, tel que prévisualisé pour <strong>{persona.name}</strong>, sera envoyé à :
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-label="Numéro de test"
              className="mt-3 w-full rounded-r-sm border border-line bg-surface-2 px-3 py-2 font-mono text-[13px] text-hi focus:border-iris focus:outline-none"
            />
          </span>
        }
        confirmLabel="Envoyer le test"
        icon={<Send className="size-5" />}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ÉTAPE 5 — Planification
   ════════════════════════════════════════════════════════════════════════ */
function RadioCard({
  active, onClick, icon, title, desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-3 rounded-r-md border p-4 text-start transition-all duration-200",
        active ? "border-iris/60 bg-iris/[.07]" : "border-line bg-surface-1 hover:border-line-strong",
      )}
    >
      <span className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
        active ? "gradient-signature text-white" : "bg-surface-2 text-mid",
      )}>
        {icon}
      </span>
      <span>
        <span className="block text-[14px] font-semibold text-hi">{title}</span>
        <span className="mt-0.5 block text-[12px] text-low">{desc}</span>
      </span>
    </button>
  );
}

export function StepSchedule({
  s, patch, eligible, onLaunch,
}: {
  s: WizardState;
  patch: Patch;
  eligible: number;
  onLaunch: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const sessions = useSessions();
  const connectedSessions = useMemo(
    () => sessions.filter((item) => item.status === "connected"),
    [sessions],
  );
  const selectedSession = connectedSessions.find((item) => item.id === s.selectedSessionId);

  useEffect(() => {
    if (selectedSession) return;
    if (connectedSessions.length === 0) {
      if (s.selectedSessionId) patch({ selectedSessionId: "" });
      return;
    }
    patch({ selectedSessionId: connectedSessions[0].id });
  }, [connectedSessions, patch, s.selectedSessionId, selectedSession]);

  const conversion = useMemo(() => {
    if (s.sendMode !== "later" || !s.date) return null;
    try {
      const local = new Date(`${s.date}T${s.time || "09:00"}:00`);
      return new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit", minute: "2-digit", timeZone: s.tz === "Africa/Tunis" ? "Europe/Paris" : "Africa/Tunis",
      }).format(local);
    } catch {
      return null;
    }
  }, [s.sendMode, s.date, s.time, s.tz]);

  const endEstimate = useMemo(() => {
    const minutes = Math.ceil(eligible / Math.max(1, s.rate));
    const base = s.sendMode === "later" && s.date ? new Date(`${s.date}T${s.time || "09:00"}:00`).getTime() : Date.now();
    return timeHM(base + minutes * 60_000);
  }, [eligible, s.rate, s.sendMode, s.date, s.time]);

  const ready = (s.sendMode !== "later" || (!!s.date && !!s.time)) && !!selectedSession;
  const needsReview = eligible > REVIEW_THRESHOLD;

  return (
    <div>
      <h3 className="font-display text-[24px] leading-[30px] font-semibold text-hi">Quand envoyer ?</h3>
      <p className="mt-1 text-[14px] text-mid">Fuseau horaire, cadence et fenêtre d'envoi respectent vos contacts.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <RadioCard
          active={s.sendMode === "now"}
          onClick={() => patch({ sendMode: "now" })}
          icon={<Zap className="size-[18px]" />}
          title="Envoyer maintenant"
          desc="Démarrage immédiat après confirmation."
        />
        <RadioCard
          active={s.sendMode === "later"}
          onClick={() => patch({ sendMode: "later" })}
          icon={<CalendarClock className="size-[18px]" />}
          title="Planifier"
          desc="Date, heure et fuseau horaire précis."
        />
        <RadioCard
          active={s.sendMode === "best"}
          onClick={() => patch({ sendMode: "best" })}
          icon={<Sparkles className="size-[18px]" />}
          title="Meilleur moment"
          desc="L'IA choisit le créneau d'ouverture max."
        />
      </div>

      <AnimatePresence>
        {s.sendMode === "best" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-3 flex items-center gap-2.5 rounded-r-md border border-iris/40 bg-iris/10 p-3.5"
          >
            <Sparkles className="size-4 shrink-0 text-iris" />
            <p className="text-[13px] text-mid">
              <span className="font-semibold text-hi">IA : mardi 10:24</span> — taux d'ouverture maximal observé sur votre audience
              (4 dernières campagnes, fuseau Africa/Tunis).
            </p>
          </motion.div>
        )}
        {s.sendMode === "later" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-3 grid gap-3 rounded-r-md border border-line bg-surface-1 p-4 sm:grid-cols-3"
          >
            <div>
              <label htmlFor="wz-date" className="label-micro text-low">Date</label>
              <input
                id="wz-date"
                type="date"
                value={s.date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => patch({ date: e.target.value })}
                className="mt-1.5 w-full rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[13px] text-hi [color-scheme:dark] focus:border-iris focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="wz-time" className="label-micro text-low">Heure</label>
              <input
                id="wz-time"
                type="time"
                value={s.time}
                onChange={(e) => patch({ time: e.target.value })}
                className="mt-1.5 w-full rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[13px] text-hi [color-scheme:dark] focus:border-iris focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="wz-tz" className="label-micro text-low">Fuseau horaire</label>
              <div className="relative mt-1.5">
                <select
                  id="wz-tz"
                  value={s.tz}
                  onChange={(e) => patch({ tz: e.target.value })}
                  className="w-full appearance-none rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[13px] text-hi focus:border-iris focus:outline-none"
                >
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-low" />
              </div>
            </div>
            {conversion && (
              <p className="font-mono text-[11px] text-pulse tabular sm:col-span-3">
                = {conversion} à {s.tz === "Africa/Tunis" ? "Paris" : "Tunis"}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 rounded-r-md border border-line bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-hi">Session WhatsApp à utiliser</p>
            <p className="mt-0.5 text-[12px] text-low">
              Choisissez la session réelle qui doit porter cette campagne.
            </p>
          </div>
          <BadgeCheck className="size-5 shrink-0 text-iris" />
        </div>

        {connectedSessions.length === 0 ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-r-md border border-amber/40 bg-amber/10 p-3.5 text-[12px] text-amber">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>Aucune session WhatsApp connectée. Reconnecte une session QR avant de lancer ou planifier une campagne réelle.</p>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {connectedSessions.map((session) => {
              const active = s.selectedSessionId === session.id;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => patch({ selectedSessionId: session.id })}
                  className={cn(
                    "rounded-r-md border p-4 text-start transition-all duration-200",
                    active ? "border-iris/60 bg-iris/[.07] shadow-card" : "border-line bg-surface-2 hover:border-line-strong",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-semibold text-hi">{session.name}</div>
                      <div className="mt-1 text-[12px] text-mid">{session.phone || "Numéro non remonté"}</div>
                    </div>
                    {active ? <Check className="size-4 text-iris" /> : null}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-low">
                    <span className="rounded-full bg-mint/12 px-2 py-0.5 text-mint">Connectée</span>
                    <span>{session.latencyMs} ms</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cadence */}
      <div className="mt-5 grid gap-4 rounded-r-md border border-line bg-surface-1 p-4 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="wz-rate" className="label-micro text-low">Cadence</label>
            <span className="font-mono text-[12px] text-hi tabular"><TickNumber value={s.rate} /> msg/min</span>
          </div>
          <input
            id="wz-rate"
            type="range"
            min={5}
            max={60}
            step={5}
            value={s.rate}
            onChange={(e) => patch({ rate: Number(e.target.value) })}
            className="mt-3 w-full accent-[#FF5A4E]"
          />
          <p className="mt-1.5 font-mono text-[11px] text-low tabular">fin estimée : <span className="text-pulse">{endEstimate}</span> · {fmt(eligible)} messages</p>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className="label-micro text-low">Fenêtre d'envoi</span>
            <span className="font-mono text-[12px] text-hi tabular">{String(s.windowStart).padStart(2, "0")}:00 → {String(s.windowEnd).padStart(2, "0")}:00</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="range" min={6} max={s.windowEnd - 1} value={s.windowStart}
              onChange={(e) => patch({ windowStart: Math.min(Number(e.target.value), s.windowEnd - 1) })}
              aria-label="Début de la fenêtre"
              className="w-full accent-[#FF9F2E]"
            />
            <input
              type="range" min={s.windowStart + 1} max={23} value={s.windowEnd}
              onChange={(e) => patch({ windowEnd: Math.max(Number(e.target.value), s.windowStart + 1) })}
              aria-label="Fin de la fenêtre"
              className="w-full accent-[#0DBA9B]"
            />
          </div>
          <button
            type="button"
            onClick={() => patch({ spread: !s.spread })}
            aria-pressed={s.spread}
            className="mt-2 flex items-center gap-2 text-[12px] text-mid"
          >
            <span className={cn(
              "flex size-4 items-center justify-center rounded border transition-colors",
              s.spread ? "border-mint bg-mint text-white" : "border-line-strong bg-surface-2",
            )}>
              {s.spread && <Check className="size-3" />}
            </span>
            Étaler sur les heures creuses
          </button>
        </div>
      </div>

      {/* Automatisations : relance sans-réponse & arrêt après réponse */}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div
          className={cn(
            "rounded-r-md border p-4 transition-colors duration-200",
            s.followUpOn ? "border-iris/50 bg-iris/[.06]" : "border-line bg-surface-1",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                  s.followUpOn ? "gradient-signature text-white" : "bg-surface-2 text-mid",
                )}
              >
                <BellRing className="size-[18px]" />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-hi">Relancer les sans-réponse</p>
                <p className="mt-0.5 text-[12px] leading-[18px] text-low">
                  Relancer uniquement les contacts sans réponse après 48 h.
                </p>
              </div>
            </div>
            <Toggle checked={s.followUpOn} onChange={(v) => patch({ followUpOn: v })} label="Relancer uniquement les contacts sans réponse après 48 h" />
          </div>
          <AnimatePresence>
            {s.followUpOn && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="overflow-hidden"
              >
                <label htmlFor="wz-followup" className="label-micro mt-3 block text-low">
                  Message de relance (envoyé à J+2)
                </label>
                <textarea
                  id="wz-followup"
                  value={s.followUpMsg}
                  onChange={(e) => patch({ followUpMsg: e.target.value.slice(0, 480) })}
                  rows={3}
                  className="mt-1.5 w-full resize-y rounded-r-sm border border-line bg-surface-2 p-3 text-[13px] leading-[20px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
                />
                <p className="mt-1 font-mono text-[10px] text-low tabular">
                  {s.followUpMsg.length} / 480 · variables {"{{prenom}}"} acceptées
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          className={cn(
            "rounded-r-md border p-4 transition-colors duration-200",
            s.stopOnReply ? "border-mint/50 bg-mint/[.06]" : "border-line bg-surface-1",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                  s.stopOnReply ? "bg-mint text-white" : "bg-surface-2 text-mid",
                )}
              >
                <CircleStop className="size-[18px]" />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-hi">Arrêt après réponse</p>
                <p className="mt-0.5 text-[12px] leading-[18px] text-low">
                  Arrêter la campagne dès qu'un contact répond — il est marqué « Exclue après réponse » et sort de la file.
                </p>
              </div>
            </div>
            <Toggle checked={s.stopOnReply} onChange={(v) => patch({ stopOnReply: v })} label="Arrêter la campagne dès qu'un contact répond" />
          </div>
        </div>
      </div>

      {/* Récap final */}
      <motion.div
        className="mt-5 rounded-r-md border-gradient p-5"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      >
        <p className="label-micro text-low">Récapitulatif</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: "Objectif", v: s.goal ? GOAL_META[s.goal].label : "—" },
            { k: "Audience", v: `${fmt(eligible)} éligibles` },
            { k: "Contenu", v: s.content.slice(0, 60) + (s.content.length > 60 ? "…" : "") },
            {
              k: "Envoi",
              v: s.sendMode === "now"
                ? "Immédiat"
                : s.sendMode === "best"
                  ? "Meilleur moment (IA)"
                  : s.date
                    ? `${new Date(`${s.date}T${s.time || "09:00"}`).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${s.tz}`
                    : "À définir",
            },
            { k: "Session", v: selectedSession ? `${selectedSession.name}${selectedSession.phone ? ` · ${selectedSession.phone}` : ""}` : "Aucune session connectée" },
          ].map((row) => (
            <motion.div
              key={row.k}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <p className="label-micro text-low">{row.k}</p>
              <p className="mt-1 line-clamp-2 text-[13px] font-medium text-hi">{row.v}</p>
            </motion.div>
          ))}
        </div>
        {/* Validation à quatre yeux (grandes audiences) */}
        <AnimatePresence>
          {needsReview && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              role="alert"
              className="mt-5 flex items-start gap-3 rounded-r-md border border-amber/40 bg-amber/10 p-4"
            >
              <ShieldCheck className="size-5 shrink-0 text-amber" />
              <div>
                <p className="text-[14px] font-semibold text-amber">Validation à quatre yeux requise</p>
                <p className="mt-0.5 text-[12px] leading-[18px] text-amber/90">
                  Votre audience dépasse {fmt(REVIEW_THRESHOLD)} contacts ({fmt(eligible)} éligibles) : la campagne
                  passera en statut « En attente de validation » et un superviseur devra approuver le lancement.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!ready}
            onClick={() => setConfirmOpen(true)}
            className={cn(
              "inline-flex items-center gap-2 rounded-r-sm px-5 py-3 text-[14px] font-semibold text-white transition-all",
              ready ? "gradient-signature hover:-translate-y-px hover:shadow-glow-iris active:scale-[.97]" : "cursor-not-allowed bg-surface-3 text-low",
            )}
          >
            {needsReview ? <ShieldCheck className="size-4" /> : <Send className="size-4" />}
            {needsReview ? "Soumettre pour validation" : "Lancer la campagne"}
          </button>
          {!ready && (
            <p className="flex items-center gap-1.5 text-[12px] text-amber">
              <Clock className="size-3.5" /> {!selectedSession ? "Choisissez une session WhatsApp connectée." : "Choisissez une date et une heure pour planifier."}
            </p>
          )}
        </div>
      </motion.div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onLaunch}
        title={needsReview ? `Soumettre « ${s.name || "Sans nom"} » à la validation ?` : `Lancer « ${s.name || "Sans nom"} » ?`}
        description={
          <span className="block space-y-1.5">
            <span className="block">{fmt(eligible)} messages · {s.rate} msg/min · fenêtre {String(s.windowStart).padStart(2, "0")}:00–{String(s.windowEnd).padStart(2, "0")}:00</span>
            <span className="block">Session choisie : <span className="font-medium text-hi">{selectedSession?.name ?? "Aucune"}</span></span>
            {needsReview && (
              <span className="block font-medium text-amber">
                Audience &gt; {fmt(REVIEW_THRESHOLD)} contacts — validation à quatre yeux : aucun message ne partira
                avant l'approbation d'un superviseur.
              </span>
            )}
            <span className="block text-low">
              {needsReview
                ? "La campagne sera créée en « En attente de validation » (badge ambre dans la liste)."
                : s.sendMode === "now" ? "Les envois démarrent immédiatement." : s.sendMode === "best" ? "L'IA déclenchera au meilleur moment." : "La campagne sera planifiée."}
              {" "}Vous pourrez la mettre en pause à tout moment.
            </span>
          </span>
        }
        confirmLabel={needsReview ? "Envoyer en validation" : "Confirmer le lancement"}
        icon={needsReview ? <ShieldCheck className="size-5" /> : <Users className="size-5" />}
      />
    </div>
  );
}
