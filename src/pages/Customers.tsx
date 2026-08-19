/**
 * Clients — page « /app/clients » (prompt maître §23-24).
 * Fiches clients réelles : nom, téléphone, langue préférée, tags, mémoire
 * (résumé relationnel alimenté par les conversations et les agents IA).
 */
import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCustomers, useSim, type Customer, type CustomerLang } from "@/lib/sim/store";
import { EmptyState } from "@/components/ui-shared";
import {
  BizBadge, BizModal, BizTable, FormField, GhostButton, PageHeader,
  PrimaryButton, SelectField, TextArea, TextField, fmtDate,
} from "@/sections/business/ui";
import CloudGate from "@/components/app/CloudGate";

export const CUSTOMER_LANG_META: Record<CustomerLang, string> = {
  "ar-TN": "Arabe (TN)",
  arabizi: "Arabizi",
  fr: "Français",
  en: "Anglais",
  de: "Allemand",
};

const EMPTY_FORM = { name: "", phone: "", preferredLang: "ar-TN" as CustomerLang, tags: "", memory: "" };

export default function Customers() {
  const customers = useCustomers();
  const upsertCustomer = useSim((s) => s.upsertCustomer);
  const deleteCustomer = useSim((s) => s.deleteCustomer);

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q)
        || c.phone.includes(q)
        || c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [customers, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone,
      preferredLang: c.preferredLang,
      tags: c.tags.join(", "),
      memory: c.memory,
    });
    setModalOpen(true);
  };

  const submit = () => {
    if (!form.name.trim()) return toast.error("Le nom est requis");
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    upsertCustomer({
      id: editing?.id,
      name: form.name.trim(),
      phone: form.phone.trim(),
      preferredLang: form.preferredLang,
      tags,
      memory: form.memory.trim(),
    });
    toast.success(editing ? "Fiche client mise à jour" : "Client créé");
    setModalOpen(false);
  };

  const onDelete = (c: Customer) => {
    deleteCustomer(c.id);
    toast.success(`Fiche « ${c.name} » supprimée`);
  };

  return (
    <CloudGate>
      <div className="flex flex-col gap-4">
      <PageHeader
        title="Clients"
        count={customers.length}
        countLabel=" fiches clients"
        action={
          <PrimaryButton onClick={openCreate}>
            <Plus className="size-4" /> Nouveau client
          </PrimaryButton>
        }
      />

      <div className="shrink-0 rounded-r-md border border-line bg-surface-1 p-3">
        <div className="relative min-w-[220px] max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-low" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom, un téléphone, un tag…"
            aria-label="Rechercher un client"
            className="w-full rounded-r-sm border border-line bg-surface-2 py-2 pe-3 ps-9 text-[13px] text-hi placeholder:text-low focus:border-iris focus:outline-none focus:ring-1 focus:ring-iris/40"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-r-md border border-line bg-surface-1">
          <EmptyState
            title={customers.length === 0 ? "Aucun client" : "Aucun client trouvé"}
            description={
              customers.length === 0
                ? "Les fiches clients sont créées automatiquement à la réception d'un message WhatsApp, ou manuellement ici."
                : "Essayez d'autres termes de recherche."
            }
            action={
              customers.length === 0 ? (
                <PrimaryButton onClick={openCreate}>
                  <Plus className="size-4" /> Créer une fiche
                </PrimaryButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <BizTable head={["Client", "Téléphone", "Langue préférée", "Tags", "Mémoire", "Depuis", ""]}>
          {filtered.map((c) => (
            <tr key={c.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/50">
              <td className="px-4 py-3">
                <span className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full gradient-signature text-[10px] font-bold text-white">
                    {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"}
                  </span>
                  <span className="text-[13px] font-medium text-hi">{c.name}</span>
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-[12px] text-mid" dir="ltr">{c.phone || "—"}</td>
              <td className="px-4 py-3">
                <BizBadge tone="iris">{CUSTOMER_LANG_META[c.preferredLang]}</BizBadge>
              </td>
              <td className="px-4 py-3">
                <span className="flex max-w-[200px] flex-wrap gap-1">
                  {c.tags.length === 0 ? <span className="text-[12px] text-low">—</span> : c.tags.map((t) => (
                    <span key={t} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-mid">
                      {t}
                    </span>
                  ))}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="block max-w-[260px] truncate text-[12px] text-mid" title={c.memory}>
                  {c.memory || "—"}
                </span>
              </td>
              <td className="px-4 py-3 text-[12px] text-mid">{fmtDate(c.createdAt)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    aria-label={`Modifier ${c.name}`}
                    className="flex size-8 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-surface-2 hover:text-hi"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(c)}
                    aria-label={`Supprimer ${c.name}`}
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
        title={editing ? "Modifier la fiche client" : "Nouveau client"}
        subtitle="La mémoire résume la relation : préférences, historique, points de friction."
        onClose={() => setModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nom">
              <TextField
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Yasmine Trabelsi"
              />
            </FormField>
            <FormField label="Téléphone">
              <TextField
                value={form.phone}
                dir="ltr"
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+216 00 000 000"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Langue préférée">
              <SelectField
                value={form.preferredLang}
                onChange={(e) => setForm((f) => ({ ...f, preferredLang: e.target.value as CustomerLang }))}
              >
                {Object.entries(CUSTOMER_LANG_META).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </SelectField>
            </FormField>
            <FormField label="Tags (séparés par des virgules)">
              <TextField
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="VIP, Instagram, Livraison"
              />
            </FormField>
          </div>
          <FormField label="Mémoire / résumé">
            <TextArea
              rows={4}
              value={form.memory}
              onChange={(e) => setForm((f) => ({ ...f, memory: e.target.value }))}
              placeholder="Préférences, dernières demandes, sensibilité prix…"
            />
          </FormField>
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
