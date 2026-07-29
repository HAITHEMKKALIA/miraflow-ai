/**
 * CampaignList — Vue 1 du Studio Campagnes (campaigns.md S1/S2).
 * En-tête + 4 mini-stats, onglets comptés (layoutId), lignes campagnes avec
 * progression live (campaignPump via store / pompe locale), contrôles
 * pause ⇄ reprise, menu ⋯ (Dupliquer · Modifier · Suivi · Exporter · Arrêt
 * d'urgence). État vide pédagogique par onglet.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check, ChevronRight, Clock, Copy, Download, FilePenLine, Megaphone,
  MoreHorizontal, OctagonX, Pause, Play, Plus, ShieldCheck, TrendingUp,
} from "lucide-react";
import { EmptyState, StatusDot, TickNumber } from "@/components/ui-shared";
import { cn } from "@/lib/utils";
import type { StudioCampaign, StudioStatus } from "./shared";
import { GOAL_META, STATUS_META, fmt, pct } from "./shared";

/* ── Onglets ───────────────────────────────────────────────────────────── */
type TabId = "all" | "draft" | "scheduled" | "running" | "done";
const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "draft", label: "Brouillons" },
  { id: "scheduled", label: "Planifiées" },
  { id: "running", label: "En cours" },
  { id: "done", label: "Terminées" },
];

function inTab(c: StudioCampaign, tab: TabId): boolean {
  switch (tab) {
    case "all": return true;
    case "draft": return c.status === "draft";
    case "scheduled": return c.status === "scheduled" || c.status === "review";
    case "running": return c.status === "running" || c.status === "paused";
    case "done": return c.status === "done" || c.status === "stopped";
  }
}

/* ── Chip de statut ────────────────────────────────────────────────────── */
export function StatusChip({ status }: { status: StudioStatus }) {
  const meta = STATUS_META[status];
  if (status === "review") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-2.5 py-1 label-micro text-amber">
        <ShieldCheck className="size-3" /> En attente de validation
      </span>
    );
  }
  if (status === "paused") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 px-2.5 py-1 label-micro text-amber"
        style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(255,180,84,.14) 0 4px, transparent 4px 8px)" }}
      >
        <Pause className="size-3" /> En pause
      </span>
    );
  }
  if (status === "scheduled") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-pulse/10 px-2.5 py-1 label-micro text-pulse">
        <Clock className="size-3" /> Planifiée
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-2.5 py-1 label-micro text-mint">
        <Check className="size-3" /> Terminée
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 label-micro",
        status === "running" && "bg-mint/10 text-mint",
        status === "stopped" && "bg-rose/10 text-rose",
        status === "draft" && "bg-surface-3 text-low",
      )}
    >
      <StatusDot tone={meta.tone} ping={meta.ping} size={6} />
      {meta.label}
    </span>
  );
}

/* ── Menu ⋯ ────────────────────────────────────────────────────────────── */
function RowMenu({
  onDuplicate, onEdit, onTrack, onExport, onStop, stoppable,
}: {
  onDuplicate: () => void;
  onEdit: () => void;
  onTrack: () => void;
  onExport: () => void;
  onStop: () => void;
  stoppable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const item =
    "flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-mid transition-colors hover:bg-surface-2 hover:text-hi";
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Actions de la campagne"
        className="flex size-8 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-surface-2 hover:text-hi"
      >
        <MoreHorizontal className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute end-0 top-9 z-40 w-56 overflow-hidden rounded-r-md border border-line bg-surface-3 py-1 shadow-card"
          >
            <button type="button" className={item} onClick={() => { setOpen(false); onDuplicate(); }}>
              <Copy className="size-3.5" /> Dupliquer
            </button>
            <button type="button" className={item} onClick={() => { setOpen(false); onEdit(); }}>
              <FilePenLine className="size-3.5" /> Modifier
            </button>
            <button type="button" className={item} onClick={() => { setOpen(false); onTrack(); }}>
              <TrendingUp className="size-3.5" /> Suivi
            </button>
            <button type="button" className={item} onClick={() => { setOpen(false); onExport(); }}>
              <Download className="size-3.5" /> Exporter le rapport
            </button>
            {stoppable && (
              <>
                <div className="my-1 border-t border-line" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-rose transition-colors hover:bg-rose/10"
                  onClick={() => { setOpen(false); onStop(); }}
                >
                  <OctagonX className="size-3.5" /> Arrêt d'urgence
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Ligne campagne ────────────────────────────────────────────────────── */
function CampaignRow({
  c, index, onPauseToggle, onTrack, onStop, onDuplicate, onEdit, onExport, onValidate,
}: {
  c: StudioCampaign;
  index: number;
  onPauseToggle: (c: StudioCampaign) => void;
  onTrack: (c: StudioCampaign) => void;
  onStop: (c: StudioCampaign) => void;
  onDuplicate: (c: StudioCampaign) => void;
  onEdit: (c: StudioCampaign) => void;
  onExport: (c: StudioCampaign) => void;
  onValidate: (c: StudioCampaign) => void;
}) {
  const goal = GOAL_META[c.goal];
  const progress = c.total > 0 ? c.sent / c.total : 0;
  const live = c.status === "running" || c.status === "paused";
  const deliveryRate = c.sent > 0 ? c.delivered / c.sent : 0;

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="group rounded-r-md border border-line bg-surface-1 p-4 transition-all duration-300 hover:border-line-strong hover:shadow-card md:p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* Identité */}
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            {c.mediaUrl ? (
              <img src={c.mediaUrl} alt="" className="size-11 shrink-0 rounded-r-sm border border-line object-cover" />
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-r-sm border border-line bg-surface-2 text-low">
                <Megaphone className="size-[18px]" />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onTrack(c)}
                  className="truncate text-[15px] font-semibold text-hi transition-colors hover:text-iris"
                >
                  {c.name}
                </button>
                <span className={cn("rounded-full px-2 py-0.5 label-micro", goal.chip)}>{goal.label}</span>
                <StatusChip status={c.status} />
              </div>
              <p className="mt-1 truncate text-[12px] text-low">
                {c.audience}
                {c.status === "scheduled" && c.scheduledAt && (
                  <> · <span className="text-pulse">{new Date(c.scheduledAt).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })} — Africa/Tunis</span></>
                )}
              </p>
            </div>
          </div>

          {/* Progression live */}
          <div className="w-full min-w-[180px] sm:w-56">
            <div className="flex items-baseline justify-between">
              <span className="label-micro text-low">Progression</span>
              <span className="font-mono text-[11px] text-mid tabular">
                <TickNumber value={c.sent} /> / {fmt(c.total)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <motion.div
                className={cn("h-full rounded-full", c.status === "stopped" ? "bg-rose/70" : "gradient-signature")}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, progress * 100)}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-low tabular">
              {pct(c.sent, c.total)}
              {c.status === "paused" && " · suspendue"}
            </p>
          </div>

          {/* Métriques compactes */}
          <div className="flex items-center gap-4 font-mono text-[11px] tabular">
            <span className="text-mid">livrés <span className="text-mint">{c.sent > 0 ? pct(c.delivered, c.sent) : "—"}</span></span>
            <span className="text-mid">réponses <span className="text-hi"><TickNumber value={c.replies} /></span></span>
            <span className="text-mid">désinscrits <span className={c.unsubscribed > 0 ? "text-rose" : "text-low"}>{c.unsubscribed}</span></span>
            {deliveryRate > 0 && <span className="hidden text-low xl:inline">échecs {c.failed}</span>}
          </div>

          {/* Contrôles */}
          <div className="flex items-center gap-1.5">
            {live && (
              <button
                type="button"
                onClick={() => onPauseToggle(c)}
                aria-label={c.status === "running" ? "Mettre en pause" : "Reprendre"}
                title={c.status === "running" ? "Mettre en pause" : "Reprendre"}
                className={cn(
                  "flex size-8 items-center justify-center rounded-r-sm border transition-colors",
                  c.status === "running"
                    ? "border-line text-mid hover:border-amber/50 hover:text-amber"
                    : "border-amber/40 bg-amber/10 text-amber hover:bg-amber/20",
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={c.status}
                    initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.2 }}
                    className="flex"
                  >
                    {c.status === "running" ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </motion.span>
                </AnimatePresence>
              </button>
            )}
            <button
              type="button"
              onClick={() => onTrack(c)}
              aria-label="Ouvrir le suivi"
              title="Ouvrir le suivi"
              className="flex size-8 items-center justify-center rounded-r-sm border border-line text-mid transition-colors hover:border-iris/50 hover:text-iris"
            >
              <ChevronRight className="size-4 rtl:-scale-x-100" />
            </button>
            <RowMenu
              stoppable={live}
              onStop={() => onStop(c)}
              onDuplicate={() => onDuplicate(c)}
              onEdit={() => onEdit(c)}
              onTrack={() => onTrack(c)}
              onExport={() => onExport(c)}
            />
          </div>
        </div>

        {/* Bandeau validation à quatre yeux */}
        {c.status === "review" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 + index * 0.06 }}
            className="mt-3.5 flex flex-wrap items-center gap-3 rounded-r-sm border border-amber/40 bg-amber/10 px-3.5 py-2.5"
            role="alert"
          >
            <ShieldCheck className="size-4 shrink-0 text-amber" />
            <p className="min-w-0 flex-1 text-[12px] font-medium text-amber">
              En attente d'approbation — un superviseur doit valider
            </p>
            <button
              type="button"
              onClick={() => onValidate(c)}
              className="inline-flex items-center gap-1.5 rounded-r-sm gradient-signature px-3 py-1.5 text-[12px] font-semibold text-white transition-all hover:-translate-y-px hover:shadow-glow-iris active:scale-[.97]"
            >
              <Check className="size-3.5" /> Valider le lancement
            </button>
          </motion.div>
        )}
      </div>
    </motion.li>
  );
}

/* ── Vue liste ─────────────────────────────────────────────────────────── */
export default function CampaignList({
  campaigns,
  hasDraft,
  draftStep,
  onNew,
  onResumeDraft,
  onTrack,
  onPauseToggle,
  onStop,
  onDuplicate,
  onEdit,
  onExport,
  onValidate,
}: {
  campaigns: StudioCampaign[];
  hasDraft: boolean;
  draftStep: number;
  onNew: () => void;
  onResumeDraft: () => void;
  onTrack: (c: StudioCampaign) => void;
  onPauseToggle: (c: StudioCampaign) => void;
  onStop: (c: StudioCampaign) => void;
  onDuplicate: (c: StudioCampaign) => void;
  onEdit: (c: StudioCampaign) => void;
  onExport: (c: StudioCampaign) => void;
  onValidate: (c: StudioCampaign) => void;
}) {
  const [tab, setTab] = useState<TabId>("all");

  const counts = useMemo(() => {
    const m = new Map<TabId, number>();
    for (const t of TABS) m.set(t.id, campaigns.filter((c) => inTab(c, t.id)).length);
    return m;
  }, [campaigns]);

  const stats = useMemo(() => {
    const running = campaigns.filter((c) => c.status === "running").length;
    const scheduled = campaigns.filter((c) => c.status === "scheduled" || c.status === "review").length;
    const withSent = campaigns.filter((c) => c.sent > 0);
    const avgDelivery = withSent.length
      ? withSent.reduce((a, c) => a + c.delivered / c.sent, 0) / withSent.length
      : 0;
    const replies = campaigns.reduce((a, c) => a + c.replies, 0);
    return { running, scheduled, avgDelivery, replies };
  }, [campaigns]);

  const visible = campaigns.filter((c) => inTab(c, tab));

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* S1 — En-tête + stats rapides */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[32px] leading-[38px] font-semibold text-hi">Campagnes</h2>
          <motion.div
            className="mt-3 flex flex-wrap items-center gap-2"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.07 } } }}
          >
            {[
              { label: "En cours", value: stats.running, suffix: "" },
              { label: "Planifiées", value: stats.scheduled, suffix: "" },
              { label: "Taux de livraison moyen", value: Math.round(stats.avgDelivery * 100), suffix: "%" },
              { label: "Réponses 30 j", value: stats.replies, suffix: "" },
            ].map((s) => (
              <motion.span
                key={s.label}
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-1 px-3 py-1.5"
              >
                <span className="label-micro text-low">{s.label}</span>
                <span className="font-display text-[14px] font-semibold text-hi tabular">
                  <TickNumber value={s.value} />
                  {s.suffix}
                </span>
              </motion.span>
            ))}
          </motion.div>
        </div>
        <div className="flex items-center gap-2.5">
          {hasDraft && (
            <button
              type="button"
              onClick={onResumeDraft}
              className="rounded-r-sm border border-amber/40 bg-amber/10 px-4 py-2.5 text-[13px] font-medium text-amber transition-colors hover:bg-amber/20"
            >
              Reprendre le brouillon · étape {draftStep}
            </button>
          )}
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-2 rounded-r-sm gradient-signature px-4 py-2.5 text-[13px] font-semibold text-white transition-all hover:-translate-y-px hover:shadow-glow-iris active:scale-[.97]"
          >
            <Plus className="size-4" /> Nouvelle campagne
          </button>
        </div>
      </div>

      {/* S2 — Onglets */}
      <div className="mt-6 flex flex-wrap items-center gap-1 border-b border-line" role="tablist" aria-label="Filtrer les campagnes">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors",
              tab === t.id ? "text-hi" : "text-low hover:text-mid",
            )}
          >
            {t.label}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular",
              tab === t.id ? "bg-iris/15 text-iris" : "bg-surface-2 text-low",
            )}>
              {counts.get(t.id) ?? 0}
            </span>
            {tab === t.id && (
              <motion.span
                layoutId="campaigns-tab"
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full gradient-signature"
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Liste */}
      <AnimatePresence mode="wait">
        <motion.ul
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-5 space-y-3"
        >
          {visible.map((c, i) => (
            <CampaignRow
              key={c.id}
              c={c}
              index={i}
              onPauseToggle={onPauseToggle}
              onTrack={onTrack}
              onStop={onStop}
              onDuplicate={onDuplicate}
              onEdit={onEdit}
              onExport={onExport}
              onValidate={onValidate}
            />
          ))}
        </motion.ul>
      </AnimatePresence>

      {visible.length === 0 && (
        <div className="mt-5 rounded-r-lg border border-line bg-surface-1">
          <EmptyState
            title="Aucune campagne ici — lancez votre première"
            description="Créez une campagne en 6 étapes : objectif, audience, contenu, prévisualisation, planification et suivi en temps réel."
            action={
              <button
                type="button"
                onClick={onNew}
                className="inline-flex items-center gap-2 rounded-r-sm gradient-signature px-4 py-2.5 text-[13px] font-semibold text-white transition-all hover:-translate-y-px hover:shadow-glow-iris"
              >
                <Plus className="size-4" /> Nouvelle campagne
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}
