/**
 * Contacts — page « /app/contacts » (contacts.md). CRM complet : en-tête avec
 * compteur vivant, toolbar (recherche, filtres Étape/Segment/Tag/Consentement,
 * curseur de score, densité, colonnes, export), table riche paginée, vue
 * Segments dynamiques, drawer contact 4 onglets, import CSV 3 étapes, création
 * manuelle. Données = SimEngine (base) + surcouche crmStore (mutations).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check, Columns3, Download, FileUp, LayoutGrid, Megaphone, RotateCcw, Search,
  StretchHorizontal, Table2, Tag as TagIcon, Trash2, UserPlus, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact, CrmStage } from "@/lib/sim/store";
import { useConversations, useContacts } from "@/lib/sim/store";
import ContactsTable, { OPTIONAL_COLS } from "@/sections/contacts/ContactsTable";
import type { ColKey, Density, SortKey } from "@/sections/contacts/ContactsTable";
import ContactDrawer from "@/sections/contacts/ContactDrawer";
import SegmentsView from "@/sections/contacts/SegmentsView";
import ImportCsvModal from "@/sections/contacts/ImportCsvModal";
import NewContactModal from "@/sections/contacts/NewContactModal";
import { mergeContacts, useCrm } from "@/sections/contacts/crmStore";
import { SEGMENTS, segmentContacts } from "@/sections/contacts/segments";
import { STAGE_META, getProfile } from "@/sections/contacts/shared";
import { TickNumber, EmptyState } from "@/components/ui-shared";
import { MenuItem, Popover } from "@/sections/inbox/ui";
import { cn } from "@/lib/utils";

const ALL_TAGS = ["VIP", "Nouveau", "Instagram", "Boutique", "Livraison", "Fidèle", "Devis"];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Contacts() {
  const navigate = useNavigate();
  const baseContacts = useContacts();
  const conversations = useConversations();
  const overrides = useCrm((s) => s.overrides);
  const extra = useCrm((s) => s.extra);
  const deleted = useCrm((s) => s.deleted);
  const addContacts = useCrm((s) => s.addContacts);
  const deleteContacts = useCrm((s) => s.deleteContacts);

  const contacts = useMemo(
    () => mergeContacts(baseContacts, { overrides, extra, deleted }),
    [baseContacts, overrides, extra, deleted],
  );

  const [view, setView] = useState<"table" | "segments">("table");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 150);
  const [stageF, setStageF] = useState<string>("all");
  const [segmentF, setSegmentF] = useState<string>("all");
  const [tagF, setTagF] = useState<string>("all");
  const [consentF, setConsentF] = useState<string>("all");
  const [scoreMin, setScoreMin] = useState(0);
  const [density, setDensity] = useState<Density>("comfortable");
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(OPTIONAL_COLS.map((c) => c.key)));
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("activity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const perPage = 25;
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<Contact | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const timeout = setTimeout(() => setPage(1), 0);
    return () => clearTimeout(timeout);
  }, [debounced, stageF, segmentF, tagF, consentF, scoreMin]);

  const segmentName = (c: Contact): string => SEGMENTS.find((s) => s.predicate(c, getProfile(c)))?.name ?? "—";

  const filtered = useMemo(() => {
    let list = [...contacts];
    if (debounced.trim()) {
      const q = debounced.toLowerCase();
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.city.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (stageF !== "all") list = list.filter((c) => c.stage === stageF);
    if (segmentF !== "all") {
      const seg = SEGMENTS.find((s) => s.id === segmentF);
      if (seg) list = segmentContacts(seg, list);
    }
    if (tagF !== "all") list = list.filter((c) => c.tags.includes(tagF));
    if (consentF !== "all") list = list.filter((c) => c.consent === (consentF === "oui"));
    if (scoreMin > 0) list = list.filter((c) => c.score >= scoreMin);
    return list;
  }, [contacts, debounced, stageF, segmentF, tagF, consentF, scoreMin]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "score") return (a.score - b.score) * dir;
      return (getProfile(a).lastActiveTs - getProfile(b).lastActiveTs) * dir;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const total = sorted.length;
  const paginated = useMemo(() => sorted.slice((page - 1) * perPage, page * perPage), [sorted, page, perPage]);

  /* Ramène la page courante dans la plage si le total diminue (suppression) */
  const maxPage = Math.max(1, Math.ceil(total / perPage));
  useEffect(() => {
    if (page > maxPage) {
      const timeout = setTimeout(() => setPage(maxPage), 0);
      return () => clearTimeout(timeout);
    }
  }, [page, maxPage]);

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (stageF !== "all") activeFilters.push({ key: "stage", label: `Étape : ${STAGE_META[stageF as CrmStage]?.label ?? stageF}`, clear: () => setStageF("all") });
  if (segmentF !== "all") activeFilters.push({ key: "segment", label: `Segment : ${SEGMENTS.find((s) => s.id === segmentF)?.name}`, clear: () => setSegmentF("all") });
  if (tagF !== "all") activeFilters.push({ key: "tag", label: `Tag : ${tagF}`, clear: () => setTagF("all") });
  if (consentF !== "all") activeFilters.push({ key: "consent", label: `Consentement : ${consentF}`, clear: () => setConsentF("all") });
  if (scoreMin > 0) activeFilters.push({ key: "score", label: `Score ≥ ${scoreMin}`, clear: () => setScoreMin(0) });

  const resetAll = () => {
    setStageF("all");
    setSegmentF("all");
    setTagF("all");
    setConsentF("all");
    setScoreMin(0);
    setSearch("");
  };

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const toggleSelect = (id: string) =>
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = (ids: string[], checked: boolean) =>
    setSelection((s) => {
      const n = new Set(s);
      ids.forEach((id) => (checked ? n.add(id) : n.delete(id)));
      return n;
    });

  const onMessage = (c: Contact) => {
    const conv = conversations.find((cv) => cv.contactId === c.id);
    navigate(conv ? `/app/inbox?c=${conv.id}` : "/app/inbox");
  };

  const exportCsv = (list: Contact[]) => {
    const rows = [["nom", "telephone", "ville", "tags", "score", "etape", "consentement"]];
    list.forEach((c) => rows.push([c.name, c.phone, c.city, c.tags.join("|"), String(c.score), STAGE_META[c.stage].label, c.consent ? "oui" : "non"]));
    const blob = new Blob([`\uFEFF${rows.map((r) => r.join(";")).join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts_miraflow.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${list.length} contacts exportés`);
  };

  const onDelete = (ids: string[]) => {
    deleteContacts(ids);
    setSelection((s) => {
      const n = new Set(s);
      ids.forEach((id) => n.delete(id));
      return n;
    });
    toast.success(`${ids.length} contact${ids.length > 1 ? "s" : ""} supprimé${ids.length > 1 ? "s" : ""}`);
  };

  const selCount = selection.size;
  const selContacts = contacts.filter((c) => selection.has(c.id));

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] flex-col gap-4 md:h-[calc(100dvh-7.5rem)]">
      {/* ── En-tête ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-none text-hi">
            Contacts
          </h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-mid">
            <span className="font-semibold tabular text-hi"><TickNumber value={contacts.length} /></span>
            contacts
            <span className="inline-flex items-center gap-1 text-low">
              <span className="size-1.5 animate-pulse rounded-full bg-mint" /> mis à jour à l'instant
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-r-sm border border-line bg-surface-2 px-3.5 py-2 text-[13px] font-medium text-hi transition-colors hover:bg-surface-3">
            <FileUp className="size-4 text-pulse" /> Importer un CSV
          </button>
          <button type="button" onClick={() => setNewOpen(true)}
            className="flex items-center gap-1.5 rounded-r-sm gradient-signature px-3.5 py-2 text-[13px] font-semibold text-white shadow-glow-iris transition-transform hover:scale-[1.02] active:scale-95">
            <UserPlus className="size-4" /> Nouveau contact
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="shrink-0 rounded-r-md border border-line bg-surface-1 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Recherche */}
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-low" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un nom, un numéro, une ville, un tag…"
              aria-label="Rechercher un contact"
              className="w-full rounded-r-sm border border-line bg-surface-2 py-2 pe-3 ps-9 text-[13px] text-hi placeholder:text-low focus:border-iris focus:outline-none focus:ring-1 focus:ring-iris/40"
            />
          </div>

          {/* Filtres */}
          <select value={stageF} onChange={(e) => setStageF(e.target.value)} aria-label="Filtrer par étape"
            className="rounded-r-sm border border-line bg-surface-2 px-2.5 py-2 text-[12px] text-hi focus:border-iris focus:outline-none">
            <option value="all">Étape : toutes</option>
            {Object.entries(STAGE_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          <select value={segmentF} onChange={(e) => setSegmentF(e.target.value)} aria-label="Filtrer par segment"
            className="rounded-r-sm border border-line bg-surface-2 px-2.5 py-2 text-[12px] text-hi focus:border-iris focus:outline-none">
            <option value="all">Segment : tous</option>
            {SEGMENTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={tagF} onChange={(e) => setTagF(e.target.value)} aria-label="Filtrer par tag"
            className="rounded-r-sm border border-line bg-surface-2 px-2.5 py-2 text-[12px] text-hi focus:border-iris focus:outline-none">
            <option value="all">Tag : tous</option>
            {ALL_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={consentF} onChange={(e) => setConsentF(e.target.value)} aria-label="Filtrer par consentement"
            className="rounded-r-sm border border-line bg-surface-2 px-2.5 py-2 text-[12px] text-hi focus:border-iris focus:outline-none">
            <option value="all">Consent. : tous</option>
            <option value="oui">Oui</option>
            <option value="non">Non</option>
          </select>

          {/* Score min */}
          <div className="flex items-center gap-2 rounded-r-sm border border-line bg-surface-2 px-2.5 py-1.5">
            <span className="font-mono text-[10px] uppercase text-low">Score ≥</span>
            <input type="range" min={0} max={100} step={5} value={scoreMin} onChange={(e) => setScoreMin(Number(e.target.value))}
              aria-label="Score minimum" className="w-24 accent-[#FF5A4E]" />
            <span className="w-7 font-mono text-[11px] tabular text-hi">{scoreMin}</span>
          </div>

          <div className="ms-auto flex items-center gap-1.5">
            {/* Basculer vue */}
            <div className="flex items-center rounded-r-sm border border-line bg-surface-2 p-0.5">
              <button type="button" onClick={() => setView("table")} aria-label="Vue table"
                className={cn("flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors", view === "table" ? "bg-surface-1 text-hi shadow-sm" : "text-low hover:text-mid")}>
                <Table2 className="size-3.5" /> Table
              </button>
              <button type="button" onClick={() => setView("segments")} aria-label="Vue segments"
                className={cn("flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors", view === "segments" ? "bg-surface-1 text-hi shadow-sm" : "text-low hover:text-mid")}>
                <LayoutGrid className="size-3.5" /> Segments
              </button>
            </div>

            {/* Densité */}
            <button type="button" onClick={() => setDensity((d) => (d === "comfortable" ? "compact" : "comfortable"))}
              title={density === "comfortable" ? "Passer en densité compacte" : "Passer en densité confortable"}
              className="flex size-9 items-center justify-center rounded-r-sm border border-line bg-surface-2 text-mid transition-colors hover:bg-surface-3 hover:text-hi">
              <StretchHorizontal className="size-4" />
            </button>

            {/* Colonnes */}
            <Popover align="end"
              trigger={(open: boolean, toggle: () => void) => (
                <button type="button" onClick={toggle} title="Afficher / masquer des colonnes"
                  className={cn("flex size-9 items-center justify-center rounded-r-sm border transition-colors",
                    open ? "border-iris/50 bg-surface-3 text-hi" : "border-line bg-surface-2 text-mid hover:bg-surface-3 hover:text-hi")}>
                  <Columns3 className="size-4" />
                </button>
              )}>
              <div className="p-1">
                <p className="label-micro px-3 py-1.5 text-low">Colonnes</p>
                {OPTIONAL_COLS.map((col) => {
                  const on = visibleCols.has(col.key);
                  return (
                    <MenuItem key={col.key} icon={
                      <span className={cn("flex size-4 items-center justify-center rounded border transition-colors", on ? "border-iris bg-iris text-white" : "border-line bg-surface-1")}>
                        {on && <Check className="size-3" />}
                      </span>
                    }
                      onClick={() => setVisibleCols((s) => { const n = new Set(s); if (n.has(col.key)) n.delete(col.key); else n.add(col.key); return n; })}>
                      {col.label}
                    </MenuItem>
                  );
                })}
              </div>
            </Popover>

            {/* Export */}
            <button type="button" onClick={() => exportCsv(selCount ? selContacts : filtered)} title="Exporter en CSV"
              className="flex size-9 items-center justify-center rounded-r-sm border border-line bg-surface-2 text-mid transition-colors hover:bg-surface-3 hover:text-hi">
              <Download className="size-4" />
            </button>
          </div>
        </div>

        {/* Chips filtres actifs */}
        <AnimatePresence>
          {activeFilters.length > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-1.5 pt-2.5">
                {activeFilters.map((f) => (
                  <motion.span key={f.key} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                    className="inline-flex items-center gap-1 rounded-full border border-iris/40 bg-iris/10 px-2.5 py-1 text-[11px] font-medium text-iris">
                    {f.label}
                    <button type="button" onClick={f.clear} aria-label={`Retirer ${f.label}`} className="hover:text-hi"><X className="size-3" /></button>
                  </motion.span>
                ))}
                <button type="button" onClick={resetAll} className="flex items-center gap-1 text-[11px] font-medium text-low hover:text-hi">
                  <RotateCcw className="size-3" /> Réinitialiser
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Contenu ── */}
      {view === "table" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-r-md border border-line bg-surface-1">
          {total === 0 && !loading ? (
            <EmptyState
              title="Aucun contact trouvé"
              description="Essayez d'autres filtres ou importez vos premiers contacts."
              action={
                <div className="flex gap-2">
                  <button type="button" onClick={resetAll} className="rounded-r-sm border border-line bg-surface-2 px-4 py-2 text-[13px] font-medium text-hi hover:bg-surface-3">
                    Réinitialiser
                  </button>
                  <button type="button" onClick={() => setImportOpen(true)} className="rounded-r-sm gradient-signature px-4 py-2 text-[13px] font-semibold text-white">
                    Importer un CSV
                  </button>
                </div>
              }
            />
          ) : (
            <ContactsTable
              contacts={paginated}
              total={total}
              page={page}
              perPage={perPage}
              loading={loading}
              density={density}
              sortKey={sortKey}
              sortDir={sortDir}
              selection={selection}
              visibleCols={visibleCols}
              segmentName={segmentName}
              onPage={setPage}
              onSort={onSort}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              onOpen={setDrawer}
              onMessage={onMessage}
              onDelete={onDelete}
            />
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SegmentsView contacts={contacts} onUseInCampaign={(id) => navigate(`/app/campaigns?segment=${id}`)} onOpenContact={setDrawer} />
        </div>
      )}

      {/* ── Barre de sélection flottante ── */}
      <AnimatePresence>
        {selCount > 0 && (
          <motion.div
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit items-center gap-1 rounded-full border border-line bg-surface-3/95 p-1.5 shadow-card backdrop-blur-md"
            role="toolbar" aria-label="Actions groupées"
          >
            <span className="flex items-center gap-1.5 px-2.5 text-[12px] font-medium text-hi">
              <Users className="size-3.5 text-iris" />
              <span className="tabular">{selCount}</span> sélectionné{selCount > 1 ? "s" : ""}
            </span>
            <span className="h-4 w-px bg-line" />
            <button type="button" onClick={() => toast.success(`Tag ajouté à ${selCount} contacts`)}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] text-mid transition-colors hover:bg-surface-2 hover:text-hi">
              <TagIcon className="size-3.5" /> Ajouter tag
            </button>
            <button type="button" onClick={() => navigate("/app/campaigns")}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] text-mid transition-colors hover:bg-surface-2 hover:text-hi">
              <Megaphone className="size-3.5" /> Lancer campagne
            </button>
            <button type="button" onClick={() => exportCsv(selContacts)}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] text-mid transition-colors hover:bg-surface-2 hover:text-hi">
              <Download className="size-3.5" /> Exporter
            </button>
            <button type="button" onClick={() => onDelete(Array.from(selection))}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] text-rose transition-colors hover:bg-rose/10">
              <Trash2 className="size-3.5" /> Supprimer
            </button>
            <button type="button" onClick={() => setSelection(new Set())} aria-label="Tout désélectionner"
              className="flex size-7 items-center justify-center rounded-full text-low transition-colors hover:bg-surface-2 hover:text-hi">
              <X className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Drawer + modales ── */}
      <ContactDrawer contact={drawer} conversations={conversations} onClose={() => setDrawer(null)} onMessage={onMessage} onDelete={(id) => onDelete([id])} />
      <ImportCsvModal open={importOpen} onClose={() => setImportOpen(false)} onImport={(list) => addContacts(list)} />
      <NewContactModal open={newOpen} onClose={() => setNewOpen(false)} onCreate={(c) => addContacts([c])} />
    </div>
  );
}
