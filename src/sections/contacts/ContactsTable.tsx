/**
 * ContactsTable — table riche du CRM (contacts.md S3). Colonnes : checkbox,
 * Contact (avatar + nom + téléphone mono), Tags (max 2 + « +n »), Segment,
 * Étape (chip, select inline), Score (jauge radiale + valeur), Dernière
 * activité (relative mono), Consentement, menu ⋯. Tri (Nom/Score/Activité,
 * flèche rotative), sélection multiple, densité 64/44px, pagination, skeleton.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp, Check, ChevronLeft, ChevronRight, Megaphone, MessageSquare, MoreHorizontal,
  Pencil, Tag as TagIcon, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact, CrmStage } from "@/lib/sim/store";
import { ConfirmDialog } from "@/components/ui-shared";
import { useCrm } from "./crmStore";
import { CRM_STAGES, GradientAvatar, STAGE_CHIP, STAGE_META, ScoreRing, getProfile, relTime } from "./shared";
import { MenuItem, Popover } from "@/sections/inbox/ui";
import { cn } from "@/lib/utils";

export type SortKey = "name" | "score" | "activity";
export type Density = "comfortable" | "compact";

const OPTIONAL_COLS = [
  { key: "tags", label: "Tags" },
  { key: "segment", label: "Segment" },
  { key: "stage", label: "Étape" },
  { key: "score", label: "Score" },
  { key: "activity", label: "Dernière activité" },
  { key: "consent", label: "Consentement" },
] as const;
export type ColKey = (typeof OPTIONAL_COLS)[number]["key"];
export { OPTIONAL_COLS };

/* ── Select d'étape inline ──────────────────────────────────────────────── */
function StageCell({ contact }: { contact: Contact }) {
  const setStage = useCrm((s) => s.setStage);
  const log = useCrm((s) => s.log);
  return (
    <Popover
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all hover:brightness-125",
            STAGE_CHIP[contact.stage],
            open && "ring-1 ring-iris/50",
          )}
        >
          {STAGE_META[contact.stage].label}
        </button>
      )}
    >
      {(close) => (
        <div className="p-1">
          {CRM_STAGES.map((s) => (
            <MenuItem key={s} active={s === contact.stage}
              onClick={() => {
                setStage(contact.id, s as CrmStage);
                log(contact.id, { kind: "stage", text: `Étape mise à jour : ${STAGE_META[s].label}` });
                toast.success("Étape mise à jour", { description: `${contact.name} → ${STAGE_META[s].label}` });
                close();
              }}>
              <span className="flex flex-1 items-center justify-between gap-2">
                <span className={cn("rounded-full border px-1.5 py-px text-[10px]", STAGE_CHIP[s])}>{STAGE_META[s].label}</span>
                {s === contact.stage && <Check className="size-3.5 text-iris" />}
              </span>
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}

/* ── Tags (max 2 + « +n ») ──────────────────────────────────────────────── */
function TagsCell({ contact }: { contact: Contact }) {
  const shown = contact.tags.slice(0, 2);
  const rest = contact.tags.length - shown.length;
  if (!contact.tags.length) return <span className="text-[12px] text-low">—</span>;
  return (
    <div className="flex items-center gap-1">
      {shown.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-1.5 py-px text-[10px] text-mid">
          <TagIcon className="size-2.5" />{t}
        </span>
      ))}
      {rest > 0 && (
        <Popover
          trigger={(open, toggle) => (
            <button type="button" onClick={(e) => { e.stopPropagation(); toggle(); }}
              className={cn("rounded-full border px-1.5 py-px text-[10px] font-medium transition-colors",
                open ? "border-iris/50 bg-iris/10 text-iris" : "border-line bg-surface-2 text-mid hover:bg-surface-3")}>
              +{rest}
            </button>
          )}>
            <div className="flex max-w-[200px] flex-wrap gap-1.5 p-2.5">
              {contact.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full border border-iris/30 bg-iris/10 px-2 py-0.5 text-[11px] text-iris">
                  <TagIcon className="size-2.5" />{t}
                </span>
              ))}
            </div>
          </Popover>
        )}
    </div>
  );
}

/* ── En-tête triable ────────────────────────────────────────────────────── */
function SortTh({ label, k, sortKey, sortDir, onSort, className }: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  return (
    <th className={cn("px-3 py-2.5 text-start", className)}>
      <button type="button" onClick={() => onSort(k)}
        className="group inline-flex items-center gap-1 label-micro text-low transition-colors hover:text-mid">
        {label}
        <ArrowUp
          className={cn(
            "size-3 transition-all duration-200",
            sortKey === k ? "text-iris opacity-100" : "opacity-0 group-hover:opacity-40",
            sortKey === k && sortDir === "desc" && "rotate-180",
          )}
        />
      </button>
    </th>
  );
}

/* ── Table ──────────────────────────────────────────────────────────────── */
export interface ContactsTableProps {
  contacts: Contact[];
  total: number;
  page: number;
  perPage: number;
  loading: boolean;
  density: Density;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  selection: Set<string>;
  visibleCols: Set<ColKey>;
  segmentName: (c: Contact) => string;
  onPage: (p: number) => void;
  onSort: (k: SortKey) => void;
  onToggleSelect: (id: string) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
  onOpen: (c: Contact) => void;
  onMessage: (c: Contact) => void;
  onDelete: (ids: string[]) => void;
}

export default function ContactsTable({
  contacts,
  total,
  page,
  perPage,
  loading,
  density,
  sortKey,
  sortDir,
  selection,
  visibleCols,
  segmentName,
  onPage,
  onSort,
  onToggleSelect,
  onToggleAll,
  onOpen,
  onMessage,
  onDelete,
}: ContactsTableProps) {
  const [confirmDel, setConfirmDel] = useState<Contact | null>(null);
  const pageIds = contacts.map((c) => c.id);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selection.has(id));
  const pages = Math.max(1, Math.ceil(total / perPage));
  const rowH = density === "compact" ? "h-11" : "h-16";
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  /* fenêtre de ≤7 pages centrée sur la page courante */
  const win = 7;
  const startP = Math.max(1, Math.min(page - 3, pages - win + 1));
  const pageNums = Array.from({ length: Math.min(win, pages) }, (_, i) => startP + i);

  const th = (label: string, k: SortKey) => ({ label, k, sortKey, sortDir, onSort });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface-1/95 backdrop-blur-sm">
            <tr className="border-b border-line">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => onToggleAll(pageIds, e.target.checked)}
                  aria-label="Tout sélectionner"
                  className="size-4 cursor-pointer accent-[#FF5A4E]"
                />
              </th>
              <SortTh {...th("Contact", "name")} />
              {visibleCols.has("tags") && <th className="px-3 py-2.5 text-start label-micro text-low">Tags</th>}
              {visibleCols.has("segment") && <th className="px-3 py-2.5 text-start label-micro text-low">Segment</th>}
              {visibleCols.has("stage") && <th className="px-3 py-2.5 text-start label-micro text-low">Étape</th>}
              {visibleCols.has("score") && <SortTh {...th("Score", "score")} />}
              {visibleCols.has("activity") && <SortTh {...th("Activité", "activity")} />}
              {visibleCols.has("consent") && <th className="px-3 py-2.5 text-start label-micro text-low">Consent.</th>}
              <th className="w-10 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <tr key={i} className="border-b border-line/50">
                  <td className="px-3 py-3"><div className="size-4 animate-pulse rounded bg-surface-2" /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-9 animate-pulse rounded-full bg-surface-2" />
                      <div className="space-y-1.5"><div className="h-2.5 w-32 animate-pulse rounded bg-surface-2" /><div className="h-2 w-24 animate-pulse rounded bg-surface-2" /></div>
                    </div>
                  </td>
                  <td colSpan={8} className="px-3 py-3"><div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-2" /></td>
                </tr>
              ))
            ) : (
              <AnimatePresence initial={false}>
                {contacts.map((c, i) => {
                  const profile = getProfile(c);
                  const selected = selection.has(c.id);
                  return (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25, delay: Math.min(i * 0.025, 0.3) }}
                      onClick={() => onOpen(c)}
                      className={cn(
                        "cursor-pointer border-b border-line/50 transition-colors",
                        selected ? "bg-iris/5" : "hover:bg-surface-2/60",
                      )}
                    >
                      <td className={cn("px-3", rowH)} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => onToggleSelect(c.id)}
                          aria-label={`Sélectionner ${c.name}`}
                          className="size-4 cursor-pointer accent-[#FF5A4E]"
                        />
                      </td>
                      <td className={cn("px-3", rowH)}>
                        <div className="flex items-center gap-3">
                          <GradientAvatar name={c.name} size={density === "compact" ? 30 : 38} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-hi">{c.name}</p>
                            <p className="truncate font-mono text-[11px] tabular text-low" dir="ltr">{c.phone}</p>
                          </div>
                        </div>
                      </td>
                      {visibleCols.has("tags") && <td className={cn("px-3", rowH)}><TagsCell contact={c} /></td>}
                      {visibleCols.has("segment") && (
                        <td className={cn("px-3 text-[12px] text-mid", rowH)}>{segmentName(c)}</td>
                      )}
                      {visibleCols.has("stage") && (
                        <td className={cn("px-3", rowH)} onClick={(e) => e.stopPropagation()}><StageCell contact={c} /></td>
                      )}
                      {visibleCols.has("score") && (
                        <td className={cn("px-3", rowH)}>
                          <div className="flex items-center gap-2">
                            <ScoreRing score={c.score} size={density === "compact" ? 26 : 32} stroke={3} />
                          </div>
                        </td>
                      )}
                      {visibleCols.has("activity") && (
                        <td className={cn("px-3 font-mono text-[11px] tabular text-mid", rowH)}>{relTime(profile.lastActiveTs)}</td>
                      )}
                      {visibleCols.has("consent") && (
                        <td className={cn("px-3", rowH)}>
                          {c.consent ? (
                            <span className="flex size-5 items-center justify-center rounded-full bg-mint/15 text-mint"><Check className="size-3" /></span>
                          ) : (
                            <span className="flex size-5 items-center justify-center rounded-full bg-rose/15 text-rose"><X className="size-3" /></span>
                          )}
                        </td>
                      )}
                      <td className={cn("px-2", rowH)} onClick={(e) => e.stopPropagation()}>
                        <Popover align="end"
                          trigger={(open, toggle) => (
                            <button type="button" onClick={toggle} aria-label="Actions"
                              className={cn("flex size-7 items-center justify-center rounded-full transition-colors",
                                open ? "bg-surface-2 text-hi" : "text-low hover:bg-surface-2 hover:text-hi")}>
                              <MoreHorizontal className="size-4" />
                            </button>
                          )}>
                          {(close) => (
                            <div className="p-1">
                              <MenuItem icon={<Pencil />} onClick={() => { onOpen(c); close(); }}>Voir / Modifier</MenuItem>
                              <MenuItem icon={<MessageSquare />} onClick={() => { onMessage(c); close(); }}>Envoyer un message</MenuItem>
                              <MenuItem icon={<Megaphone />} onClick={() => { toast.success(`« ${c.name} » ajouté à une campagne`); close(); }}>Ajouter à une campagne</MenuItem>
                              <MenuItem icon={<Trash2 />} danger onClick={() => { setConfirmDel(c); close(); }}>Supprimer</MenuItem>
                            </div>
                          )}
                        </Popover>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex shrink-0 items-center justify-between border-t border-line px-3 py-2.5">
        <span className="font-mono text-[11px] tabular text-low">
          {from}–{to} sur {total.toLocaleString("fr-FR")}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Page précédente"
            className="flex size-7 items-center justify-center rounded-r-sm border border-line bg-surface-1 text-mid transition-colors hover:bg-surface-2 disabled:opacity-40 rtl:-scale-x-100">
            <ChevronLeft className="size-4" />
          </button>
          {pageNums.map((p) => (
            <button key={p} type="button" onClick={() => onPage(p)}
              className={cn("flex size-7 items-center justify-center rounded-r-sm font-mono text-[11px] tabular transition-colors",
                p === page ? "bg-iris text-white" : "border border-line bg-surface-1 text-mid hover:bg-surface-2")}>
              {p}
            </button>
          ))}
          <button type="button" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages} aria-label="Page suivante"
            className="flex size-7 items-center justify-center rounded-r-sm border border-line bg-surface-1 text-mid transition-colors hover:bg-surface-2 disabled:opacity-40 rtl:-scale-x-100">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDel !== null}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => { if (confirmDel) onDelete([confirmDel.id]); setConfirmDel(null); }}
        title="Supprimer ce contact ?"
        description={`« ${confirmDel?.name} » sera définitivement supprimé. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        icon={<Trash2 className="size-5" />}
      />
    </div>
  );
}
