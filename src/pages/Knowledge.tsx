/**
 * Connaissances — page « /app/connaissances » (prompt maître §38-39, §55).
 * Base de connaissance RAG du tenant : documents (titre, contenu, type, source)
 * avec compteur de « chunks » estimé côté front (1 chunk ≈ 450 caractères).
 */
import { useMemo, useState } from "react";
import { BookOpen, FileText, Globe, HelpCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useKnowledgeDocs, useSim, type KbDoc, type KbDocKind } from "@/lib/sim/store";
import { EmptyState } from "@/components/ui-shared";
import { InfoTile } from "@/sections/settings/ui";
import {
  BizBadge, BizModal, FormField, GhostButton, PageHeader,
  PrimaryButton, SelectField, TextArea, TextField, fmtDate, type BizTone,
} from "@/sections/business/ui";
import { cn } from "@/lib/utils";
import CloudGate from "@/components/app/CloudGate";

const KIND_META: Record<KbDocKind, { label: string; tone: BizTone; icon: typeof FileText }> = {
  text: { label: "Texte", tone: "iris", icon: FileText },
  url: { label: "URL", tone: "pulse", icon: Globe },
  faq: { label: "FAQ", tone: "mint", icon: HelpCircle },
  catalog: { label: "Catalogue", tone: "amber", icon: BookOpen },
};

const EMPTY_FORM = { title: "", content: "", kind: "text" as KbDocKind, source: "" };

export default function Knowledge() {
  const docs = useKnowledgeDocs();
  const upsertKnowledgeDoc = useSim((s) => s.upsertKnowledgeDoc);
  const deleteKnowledgeDoc = useSim((s) => s.deleteKnowledgeDoc);

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KbDoc | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q) || d.source.toLowerCase().includes(q),
    );
  }, [docs, search]);

  const totalChunks = docs.reduce((acc, d) => acc + d.chunks, 0);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };
  const openEdit = (d: KbDoc) => {
    setEditing(d);
    setForm({ title: d.title, content: d.content, kind: d.kind, source: d.source });
    setModalOpen(true);
  };

  const submit = () => {
    if (!form.title.trim()) return toast.error("Le titre est requis");
    if (!form.content.trim()) return toast.error("Le contenu est requis");
    upsertKnowledgeDoc({
      id: editing?.id,
      title: form.title.trim(),
      content: form.content.trim(),
      kind: form.kind,
      source: form.source.trim() || "manuel",
    });
    toast.success(editing ? "Document mis à jour" : "Document indexé");
    setModalOpen(false);
  };

  const onDelete = (d: KbDoc) => {
    deleteKnowledgeDoc(d.id);
    toast.success(`Document « ${d.title} » supprimé`);
  };

  return (
    <CloudGate>
      <div className="flex flex-col gap-4">
      <PageHeader
        title="Connaissances"
        count={docs.length}
        countLabel=" documents indexés"
        action={
          <PrimaryButton onClick={openCreate}>
            <Plus className="size-4" /> Nouveau document
          </PrimaryButton>
        }
      />

      {/* KPI RAG */}
      <div className="grid gap-4 md:grid-cols-3">
        <InfoTile label="Documents" value={docs.length} hint="Sources de la base RAG" />
        <InfoTile label="Chunks indexés" value={totalChunks} hint="Estimation locale (~1 chunk / 450 car.)" />
        <InfoTile label="Top-K RAG" value={useSim.getState().aiSettings.ragTopK} hint="Réglable dans Paramètres → IA" />
      </div>

      <div className="shrink-0 rounded-r-md border border-line bg-surface-1 p-3">
        <div className="relative min-w-[220px] max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-low" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un document…"
            aria-label="Rechercher un document"
            className="w-full rounded-r-sm border border-line bg-surface-2 py-2 pe-3 ps-9 text-[13px] text-hi placeholder:text-low focus:border-iris focus:outline-none focus:ring-1 focus:ring-iris/40"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-r-md border border-line bg-surface-1">
          <EmptyState
            title={docs.length === 0 ? "Base de connaissances vide" : "Aucun document trouvé"}
            description={
              docs.length === 0
                ? "Ajoutez des documents (FAQ, catalogue, pages web) : les agents IA les citeront via searchKnowledge()."
                : "Essayez d'autres termes de recherche."
            }
            action={
              docs.length === 0 ? (
                <PrimaryButton onClick={openCreate}>
                  <Plus className="size-4" /> Ajouter un document
                </PrimaryButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => {
            const meta = KIND_META[d.kind];
            const Icon = meta.icon;
            return (
              <article
                key={d.id}
                className={cn(
                  "group relative flex flex-col rounded-r-md border border-line bg-surface-1 p-4 transition-all hover:border-line-strong hover:shadow-card",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-9 items-center justify-center rounded-r-sm bg-surface-2 text-mid">
                    <Icon className="size-4" />
                  </span>
                  <BizBadge tone={meta.tone}>{meta.label}</BizBadge>
                </div>
                <h3 className="mt-3 text-[14px] font-semibold text-hi">{d.title}</h3>
                <p className="mt-1 line-clamp-2 flex-1 text-[12px] leading-relaxed text-mid">{d.content}</p>
                <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3">
                  <div className="flex items-center gap-2 text-[11px] text-low">
                    <span className="tabular font-medium text-mid">{d.chunks} chunks</span>
                    <span aria-hidden>·</span>
                    <span className="max-w-[90px] truncate" title={d.source}>{d.source}</span>
                    <span aria-hidden>·</span>
                    <span>{fmtDate(d.updatedAt)}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEdit(d)}
                      aria-label={`Modifier ${d.title}`}
                      className="flex size-7 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-surface-2 hover:text-hi"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(d)}
                      aria-label={`Supprimer ${d.title}`}
                      className="flex size-7 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-rose/15 hover:text-rose"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <BizModal
        open={modalOpen}
        title={editing ? "Modifier le document" : "Nouveau document"}
        subtitle="Fragmenté puis indexé côté RAG — le compteur de chunks est recalculé à l'enregistrement."
        onClose={() => setModalOpen(false)}
        wide
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Titre">
              <TextField
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Politique de retour"
              />
            </FormField>
            <FormField label="Type">
              <SelectField
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as KbDocKind }))}
              >
                {Object.entries(KIND_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </SelectField>
            </FormField>
          </div>
          <FormField label="Source">
            <TextField
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              placeholder="https://… ou « manuel »"
            />
          </FormField>
          <FormField label={`Contenu — ~${Math.max(1, Math.ceil(form.content.length / 450))} chunks`}>
            <TextArea
              rows={8}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Collez le texte de référence (FAQ, conditions, catalogue…)"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <GhostButton onClick={() => setModalOpen(false)}>Annuler</GhostButton>
            <PrimaryButton onClick={submit}>{editing ? "Enregistrer" : "Indexer"}</PrimaryButton>
          </div>
        </div>
      </BizModal>
      </div>
    </CloudGate>
  );
}
