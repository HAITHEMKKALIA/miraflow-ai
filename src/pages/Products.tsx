/**
 * Produits — page « /app/produits » (prompt maître §26-28).
 * Catalogue réel du tenant : liste + création/édition (nom, description, sku,
 * prix TND, stock simplifié, actif). Aucune donnée mock : le store démarre vide.
 */
import { useMemo, useState } from "react";
import { PackagePlus, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProducts, useSim, type Product } from "@/lib/sim/store";
import { EmptyState } from "@/components/ui-shared";
import {
  BizBadge, BizModal, BizTable, FormField, GhostButton, PageHeader,
  PrimaryButton, SelectField, TextArea, TextField, fmtTnd,
} from "@/sections/business/ui";
import { cn } from "@/lib/utils";
import CloudGate from "@/components/app/CloudGate";

const EMPTY_FORM = { name: "", description: "", sku: "", price: "", stock: "0", active: true };

export default function Products() {
  const products = useProducts();
  const upsertProduct = useSim((s) => s.upsertProduct);
  const deleteProduct = useSim((s) => s.deleteProduct);

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [products, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description,
      sku: p.sku,
      price: String(p.price),
      stock: String(p.stock),
      active: p.active,
    });
    setModalOpen(true);
  };

  const submit = () => {
    if (!form.name.trim()) return toast.error("Le nom du produit est requis");
    const price = Number(form.price.replace(",", "."));
    if (!Number.isFinite(price) || price < 0) return toast.error("Prix invalide (TND)");
    const stock = Math.max(0, Math.floor(Number(form.stock) || 0));
    upsertProduct({
      id: editing?.id,
      name: form.name.trim(),
      description: form.description.trim(),
      sku: form.sku.trim(),
      price,
      stock,
      active: form.active,
    });
    toast.success(editing ? "Produit mis à jour" : "Produit créé");
    setModalOpen(false);
  };

  const onDelete = (p: Product) => {
    deleteProduct(p.id);
    toast.success(`Produit « ${p.name} » supprimé`);
  };

  return (
    <CloudGate>
      <div className="flex flex-col gap-4">
      <PageHeader
        title="Produits"
        count={products.length}
        countLabel=" produits au catalogue"
        action={
          <PrimaryButton onClick={openCreate}>
            <PackagePlus className="size-4" /> Nouveau produit
          </PrimaryButton>
        }
      />

      {/* Toolbar */}
      <div className="shrink-0 rounded-r-md border border-line bg-surface-1 p-3">
        <div className="relative min-w-[220px] max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-low" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit ou un SKU…"
            aria-label="Rechercher un produit"
            className="w-full rounded-r-sm border border-line bg-surface-2 py-2 pe-3 ps-9 text-[13px] text-hi placeholder:text-low focus:border-iris focus:outline-none focus:ring-1 focus:ring-iris/40"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-r-md border border-line bg-surface-1">
          <EmptyState
            title={products.length === 0 ? "Aucun produit" : "Aucun produit trouvé"}
            description={
              products.length === 0
                ? "Ajoutez vos premiers produits : ils alimenteront le catalogue utilisé par l'agent Commercial."
                : "Essayez d'autres termes de recherche."
            }
            action={
              products.length === 0 ? (
                <PrimaryButton onClick={openCreate}>
                  <PackagePlus className="size-4" /> Créer un produit
                </PrimaryButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <BizTable head={["Produit", "SKU", "Prix (TND)", "Stock", "Statut", ""]}>
          {filtered.map((p) => (
            <tr key={p.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/50">
              <td className="px-4 py-3">
                <span className="block text-[13px] font-medium text-hi">{p.name}</span>
                {p.description && (
                  <span className="block max-w-[360px] truncate text-[12px] text-low">{p.description}</span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-[12px] text-mid">{p.sku || "—"}</td>
              <td className="px-4 py-3 text-[13px] tabular text-hi">{fmtTnd(p.price)}</td>
              <td className="px-4 py-3 text-[13px] tabular text-hi">
                <span className={cn(p.stock === 0 && "text-rose", p.stock > 0 && p.stock < 5 && "text-amber")}>
                  {p.stock}
                </span>
              </td>
              <td className="px-4 py-3">
                <BizBadge tone={p.active ? "mint" : "low"}>{p.active ? "Actif" : "Inactif"}</BizBadge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    aria-label={`Modifier ${p.name}`}
                    className="flex size-8 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-surface-2 hover:text-hi"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(p)}
                    aria-label={`Supprimer ${p.name}`}
                    className="flex size-8 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-rose/15 hover:text-rose"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </BizTable>
      )}

      <BizModal
        open={modalOpen}
        title={editing ? "Modifier le produit" : "Nouveau produit"}
        subtitle="Catalogue utilisé par les agents IA (tools searchProducts / checkStock)."
        onClose={() => setModalOpen(false)}
      >
        <div className="space-y-4">
          <FormField label="Nom">
            <TextField
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Caftan en soie brodée"
            />
          </FormField>
          <FormField label="Description">
            <TextArea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description courte visible par les agents IA…"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="SKU">
              <TextField
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="REF-001"
              />
            </FormField>
            <FormField label="Prix (TND)">
              <TextField
                value={form.price}
                inputMode="decimal"
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="120.000"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Stock">
              <TextField
                value={form.stock}
                inputMode="numeric"
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              />
            </FormField>
            <FormField label="Statut">
              <SelectField
                value={form.active ? "1" : "0"}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === "1" }))}
              >
                <option value="1">Actif</option>
                <option value="0">Inactif</option>
              </SelectField>
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <GhostButton onClick={() => setModalOpen(false)}>Annuler</GhostButton>
            <PrimaryButton onClick={submit}>{editing ? "Enregistrer" : "Créer"}</PrimaryButton>
          </div>
        </div>
      </BizModal>
      </div>
    </CloudGate>
  );
}
