/**
 * Commandes — page « /app/commandes » (prompt maître §29-30).
 * Liste des commandes réelles (numéro, client, statut, total TND), détail et
 * changement de statut. Les agents IA créent les commandes via createOrder().
 */
import { useMemo, useState } from "react";
import { Eye, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCustomers, useOrders, useSim, type Order, type OrderStatus,
} from "@/lib/sim/store";
import { EmptyState } from "@/components/ui-shared";
import {
  BizBadge, BizModal, BizTable, FormField, GhostButton, PageHeader,
  PrimaryButton, SelectField, TextField, fmtDate, fmtTnd, type BizTone,
} from "@/sections/business/ui";
import CloudGate from "@/components/app/CloudGate";

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: BizTone }> = {
  pending: { label: "En attente", tone: "amber" },
  confirmed: { label: "Confirmée", tone: "iris" },
  shipped: { label: "Expédiée", tone: "pulse" },
  delivered: { label: "Livrée", tone: "mint" },
  cancelled: { label: "Annulée", tone: "rose" },
};

const EMPTY_FORM = { customerId: "", customerName: "", productName: "", quantity: "1", unitPrice: "" };

export default function Orders() {
  const orders = useOrders();
  const customers = useCustomers();
  const upsertOrder = useSim((s) => s.upsertOrder);
  const setOrderStatus = useSim((s) => s.setOrderStatus);
  const deleteOrder = useSim((s) => s.deleteOrder);

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<Order | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = useMemo(() => {
    let list = orders;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) => o.orderNumber.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q),
      );
    }
    if (statusF !== "all") list = list.filter((o) => o.status === statusF);
    return list;
  }, [orders, search, statusF]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const submit = () => {
    const quantity = Math.max(1, Math.floor(Number(form.quantity) || 1));
    const unitPrice = Number(form.unitPrice.replace(",", "."));
    const customerName =
      form.customerName.trim()
      || customers.find((c) => c.id === form.customerId)?.name
      || "";
    if (!customerName) return toast.error("Le client est requis");
    if (!form.productName.trim()) return toast.error("L'article est requis");
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return toast.error("Prix unitaire invalide");
    upsertOrder({
      customerId: form.customerId || undefined,
      customerName,
      status: "pending",
      total: quantity * unitPrice,
      currency: "TND",
      items: [{ productName: form.productName.trim(), quantity, unitPrice }],
    });
    toast.success("Commande créée");
    setModalOpen(false);
  };

  const onDelete = (o: Order) => {
    deleteOrder(o.id);
    toast.success(`Commande ${o.orderNumber} supprimée`);
  };

  return (
    <CloudGate>
      <div className="flex flex-col gap-4">
      <PageHeader
        title="Commandes"
        count={orders.length}
        countLabel=" commandes"
        action={
          <PrimaryButton onClick={openCreate}>
            <Plus className="size-4" /> Nouvelle commande
          </PrimaryButton>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-r-md border border-line bg-surface-1 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-low" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un numéro ou un client…"
            aria-label="Rechercher une commande"
            className="w-full rounded-r-sm border border-line bg-surface-2 py-2 pe-3 ps-9 text-[13px] text-hi placeholder:text-low focus:border-iris focus:outline-none focus:ring-1 focus:ring-iris/40"
          />
        </div>
        <select
          value={statusF}
          onChange={(e) => setStatusF(e.target.value)}
          aria-label="Filtrer par statut"
          className="rounded-r-sm border border-line bg-surface-2 px-2.5 py-2 text-[12px] text-hi focus:border-iris focus:outline-none"
        >
          <option value="all">Statut : tous</option>
          {Object.entries(ORDER_STATUS_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-r-md border border-line bg-surface-1">
          <EmptyState
            title={orders.length === 0 ? "Aucune commande" : "Aucune commande trouvée"}
            description={
              orders.length === 0
                ? "Les commandes créées par vos clients via WhatsApp (agent Commercial) apparaîtront ici."
                : "Essayez d'autres filtres."
            }
            action={
              orders.length === 0 ? (
                <PrimaryButton onClick={openCreate}>
                  <Plus className="size-4" /> Créer une commande
                </PrimaryButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <BizTable head={["N°", "Client", "Statut", "Total", "Créée le", ""]}>
          {filtered.map((o) => (
            <tr key={o.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/50">
              <td className="px-4 py-3 font-mono text-[12px] text-hi">{o.orderNumber}</td>
              <td className="px-4 py-3 text-[13px] font-medium text-hi">{o.customerName}</td>
              <td className="px-4 py-3">
                <select
                  value={o.status}
                  onChange={(e) => {
                    setOrderStatus(o.id, e.target.value as OrderStatus);
                    toast.success(`Statut → ${ORDER_STATUS_META[e.target.value as OrderStatus].label}`);
                  }}
                  aria-label={`Statut de ${o.orderNumber}`}
                  className="rounded-full border border-line bg-surface-2 px-2 py-1 text-[11px] text-hi focus:border-iris focus:outline-none"
                >
                  {Object.entries(ORDER_STATUS_META).map(([k, m]) => (
                    <option key={k} value={k}>{m.label}</option>
                  ))}
                </select>
                <BizBadge tone={ORDER_STATUS_META[o.status].tone}>
                  {ORDER_STATUS_META[o.status].label}
                </BizBadge>
              </td>
              <td className="px-4 py-3 text-[13px] tabular text-hi">{fmtTnd(o.total)}</td>
              <td className="px-4 py-3 text-[12px] text-mid">{fmtDate(o.createdAt)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setDetail(o)}
                    aria-label={`Détail de ${o.orderNumber}`}
                    className="flex size-8 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-surface-2 hover:text-hi"
                  >
                    <Eye className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(o)}
                    aria-label={`Supprimer ${o.orderNumber}`}
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

      {/* Création */}
      <BizModal
        open={modalOpen}
        title="Nouvelle commande"
        subtitle="Une ligne d'article simple — le total est calculé en TND."
        onClose={() => setModalOpen(false)}
      >
        <div className="space-y-4">
          <FormField label="Client (fiche existante)">
            <SelectField
              value={form.customerId}
              onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
            >
              <option value="">— Sélectionner —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </SelectField>
          </FormField>
          <FormField label="Ou nom du client (libre)">
            <TextField
              value={form.customerName}
              onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
              placeholder="Ahmed Ben Salah"
            />
          </FormField>
          <FormField label="Article">
            <TextField
              value={form.productName}
              onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
              placeholder="Caftan en soie brodée"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Quantité">
              <TextField
                value={form.quantity}
                inputMode="numeric"
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </FormField>
            <FormField label="Prix unitaire (TND)">
              <TextField
                value={form.unitPrice}
                inputMode="decimal"
                onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                placeholder="120.000"
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <GhostButton onClick={() => setModalOpen(false)}>Annuler</GhostButton>
            <PrimaryButton onClick={submit}>Créer</PrimaryButton>
          </div>
        </div>
      </BizModal>

      {/* Détail */}
      <BizModal
        open={detail !== null}
        title={detail ? `Commande ${detail.orderNumber}` : ""}
        subtitle={detail ? `${detail.customerName} · créée le ${fmtDate(detail.createdAt)}` : undefined}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BizBadge tone={ORDER_STATUS_META[detail.status].tone}>
                {ORDER_STATUS_META[detail.status].label}
              </BizBadge>
              <span className="text-[13px] tabular font-semibold text-hi">{fmtTnd(detail.total)}</span>
            </div>
            <div className="rounded-r-md border border-line bg-surface-2/60">
              {detail.items.map((it, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-2.5 text-[13px] last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-hi">{it.productName}</span>
                  <span className="tabular text-mid">× {it.quantity}</span>
                  <span className="tabular text-hi">{fmtTnd(it.unitPrice * it.quantity)}</span>
                </div>
              ))}
            </div>
            <FormField label="Changer le statut">
              <SelectField
                value={detail.status}
                onChange={(e) => {
                  const st = e.target.value as OrderStatus;
                  setOrderStatus(detail.id, st);
                  setDetail({ ...detail, status: st });
                  toast.success(`Statut → ${ORDER_STATUS_META[st].label}`);
                }}
              >
                {Object.entries(ORDER_STATUS_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </SelectField>
            </FormField>
          </div>
        )}
      </BizModal>
      </div>
    </CloudGate>
  );
}
