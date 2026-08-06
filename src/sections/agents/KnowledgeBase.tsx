/**
 * S4 — Base de connaissances (RAG) : dropzone, pipeline d'indexation animé
 * (Téléversement → Extraction → Fragmentation → Indexation, coches mint),
 * table des documents (statut, fragments, agents liés, menu ⋯ : ré-indexer,
 * prévisualiser les fragments, retirer avec ConfirmDialog), drawer de
 * prévisualisation des fragments avec recherche + surlignage.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check, CloudUpload, Ellipsis, Eye, FileText, FileType, Globe, Link2, Loader2,
  Plus, RefreshCw, Search, Trash2,
} from "lucide-react";
import { ConfirmDialog, Drawer } from "@/components/ui-shared";
import { cn } from "@/lib/utils";
import {
  AGENT_META, DOC_EXCERPTS, PIPELINE_STEPS, fmtNum, timeAgo,
  type KnowledgeDoc,
} from "./data";
import { SectionHead } from "./controls";
import { useAgentsPage } from "./hooks";
import { EASE } from "./motion";

const KIND_ICON = { pdf: FileType, docx: FileText, txt: FileText, url: Globe } as const;

/* ── Pipeline d'indexation animé ───────────────────────────────────────── */
function Pipeline({ doc }: { doc: KnowledgeDoc }) {
  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-1">
        {PIPELINE_STEPS.map((label, i) => {
          const done = i < doc.step || doc.status === "indexed";
          const current = i === doc.step && doc.status === "indexing";
          return (
            <div key={label} className="flex items-center gap-1">
              <motion.span
                initial={false}
                animate={done ? { scale: [1, 1.25, 1] } : {}}
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border",
                  done ? "border-mint bg-mint text-white" : current ? "border-amber text-amber" : "border-line-strong text-low",
                )}
                title={label}
              >
                {done ? <Check className="size-2.5" /> : current ? <Loader2 className="size-2.5 animate-spin" /> : <span className="size-1 rounded-full bg-current" />}
              </motion.span>
              {i < PIPELINE_STEPS.length - 1 && <span className={cn("h-px w-4", done ? "bg-mint/60" : "bg-line-strong")} />}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="label-micro text-amber">{PIPELINE_STEPS[doc.step]}…</span>
        <span className="h-1 w-16 overflow-hidden rounded-full bg-surface-3">
          <motion.span
            className="block h-full rounded-full bg-amber"
            animate={{ width: `${doc.progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </span>
        <span className="font-mono text-[10px] text-low tabular">{doc.progress}%</span>
      </div>
    </div>
  );
}

/* ── Menu ⋯ d'une ligne document ───────────────────────────────────────── */
function RowMenu({ onPreview, onReindex, onRemove }: { onPreview: () => void; onReindex: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const items = [
    { icon: Eye, label: "Prévisualiser les fragments", fn: onPreview },
    { icon: RefreshCw, label: "Ré-indexer", fn: onReindex },
    { icon: Trash2, label: "Retirer", fn: onRemove, danger: true },
  ];
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Actions du document"
        className="flex size-8 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-surface-2 hover:text-hi"
      >
        <Ellipsis className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute end-0 top-9 z-40 w-56 overflow-hidden rounded-r-md border border-line bg-surface-3 shadow-card"
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.fn();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] transition-colors",
                  it.danger ? "text-rose hover:bg-rose/10" : "text-mid hover:bg-surface-2 hover:text-hi",
                )}
              >
                <it.icon className="size-3.5" />
                {it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Surlignage de recherche ───────────────────────────────────────────── */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber/25 px-0.5 text-amber">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/* ── Section ───────────────────────────────────────────────────────────── */
export default function KnowledgeBase() {
  const { docs, addDoc, removeDoc, reindexDoc, totalFragments, kbRef } = useAgentsPage();
  const [dragOver, setDragOver] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<KnowledgeDoc | null>(null);
  const [removeTarget, setRemoveTarget] = useState<KnowledgeDoc | null>(null);
  const [search, setSearch] = useState("");

  const fragments = useMemo(() => {
    if (!previewDoc) return [];
    const excerpts = DOC_EXCERPTS[previewDoc.id] ?? [
      "Fragment extrait du document téléversé, en cours d'enrichissement par l'indexeur.",
      "Section détectée automatiquement — le texte sera affiné à la prochaine indexation.",
    ];
    return Array.from({ length: 12 }, (_, i) => ({
      num: i + 1,
      text: excerpts[i % excerpts.length],
    })).filter((f) => !search.trim() || f.text.toLowerCase().includes(search.toLowerCase()));
  }, [previewDoc, search]);

  return (
    <section ref={kbRef} className="scroll-mt-24">
      <SectionHead
        title="Base de connaissances"
        counter={`${docs.length} documents · ${fmtNum(totalFragments)} fragments indexés`}
        action={
          <button
            type="button"
            onClick={addDoc}
            className="gradient-signature flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-glow-iris active:scale-[.97]"
          >
            <Plus className="size-4" />
            Ajouter un document
          </button>
        }
      />

      {/* Dropzone */}
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.45, ease: EASE }}
        onClick={addDoc}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addDoc();
        }}
        className={cn(
          "mb-4 flex w-full items-center justify-center gap-3 rounded-r-md border border-dashed px-4 py-6 transition-colors",
          dragOver ? "border-pulse bg-pulse/5" : "border-line-strong hover:border-pulse/50 hover:bg-surface-2/40",
        )}
      >
        <CloudUpload className={cn("size-5", dragOver ? "text-pulse" : "text-low")} />
        <span className="text-[13px] text-mid">
          PDF, DOCX, TXT, URL — <span className="text-hi">glissez ici</span> ou cliquez pour simuler un ajout
        </span>
      </motion.button>

      {/* Table documents */}
      <div className="overflow-hidden rounded-r-lg border border-line bg-surface-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-start">
            <thead>
              <tr className="border-b border-line">
                {["Document", "Taille", "Fragments", "Statut", "Agents liés", "Ajouté", ""].map((h) => (
                  <th key={h} className="label-micro px-4 py-3 text-start font-normal text-low">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {docs.map((doc, i) => {
                  const Icon = KIND_ICON[doc.kind];
                  return (
                    <motion.tr
                      key={doc.id}
                      layout="position"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ duration: 0.35, ease: EASE, delay: i < 8 ? i * 0.06 : 0 }}
                      className="border-b border-line/60 last:border-0 hover:bg-surface-2/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-r-sm border border-line bg-surface-2 text-pulse">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-[260px] truncate text-[13px] font-medium text-hi">{doc.name}</p>
                            <p className="label-micro text-low">{doc.version}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-mid">{doc.size}</td>
                      <td className="px-4 py-3 font-mono text-[12px] text-hi tabular">
                        {doc.status === "indexed" ? fmtNum(doc.fragments) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {doc.status === "indexed" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-2.5 py-1 label-micro text-mint">
                            <Check className="size-3" /> Indexé
                          </span>
                        ) : (
                          <Pipeline doc={doc} />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {doc.agents.map((id) => {
                            const meta = AGENT_META[id];
                            if (!meta) return null;
                            return (
                              <span
                                key={id}
                                className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-medium", COLOR_CHIP[meta.color])}
                              >
                                {id.replace("ag_", "")}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-low">{timeAgo(doc.addedAt)}</td>
                      <td className="px-2 py-3">
                        <RowMenu
                          onPreview={() => {
                            setSearch("");
                            setPreviewDoc(doc);
                          }}
                          onReindex={() => reindexDoc(doc.id)}
                          onRemove={() => setRemoveTarget(doc)}
                        />
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer fragments */}
      <Drawer
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        width={480}
        title={
          <span className="flex items-center gap-2">
            <Link2 className="size-4 text-pulse" />
            Fragments · {previewDoc?.name}
          </span>
        }
      >
        <div className="relative mb-4">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-low" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher dans les fragments…"
            className="w-full rounded-r-sm border border-line bg-surface-2 py-2.5 pe-3 ps-9 text-[13px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
          />
        </div>
        <p className="label-micro mb-3 text-low">
          {fragments.length} fragment{fragments.length > 1 ? "s" : ""} · {previewDoc?.version}
        </p>
        <div className="space-y-2.5">
          {fragments.map((f) => (
            <motion.div
              key={f.num}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: f.num * 0.03 }}
              className="rounded-r-sm border border-line bg-surface-2/60 p-3"
            >
              <p className="label-micro mb-1 text-pulse">frag. #{String(f.num).padStart(3, "0")}</p>
              <p className="text-[12.5px] leading-[19px] text-mid">
                <Highlight text={f.text} query={search} />
              </p>
            </motion.div>
          ))}
          {fragments.length === 0 && (
            <p className="py-8 text-center text-[13px] text-low">Aucun fragment ne correspond à « {search} ».</p>
          )}
        </div>
      </Drawer>

      {/* Retirer */}
      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && removeDoc(removeTarget.id)}
        title={`Retirer « ${removeTarget?.name} » ?`}
        description="Les fragments associés seront désindexés. Les agents liés à ce document perdront ces sources — leurs réponses pourraient perdre en confiance."
        confirmLabel="Retirer le document"
      />
    </section>
  );
}

/** Chips agents (JIT safe) */
const COLOR_CHIP: Record<string, string> = {
  iris: "bg-iris/10 text-iris",
  pulse: "bg-pulse/10 text-pulse",
  mint: "bg-mint/10 text-mint",
  amber: "bg-amber/10 text-amber",
  rose: "bg-rose/10 text-rose",
  hi: "bg-surface-3 text-mid",
};
