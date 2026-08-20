/**
 * Livraisons — page « /app/livraisons » (prompt maître §31).
 * Livraisons liées aux commandes : statut, livreur, numéro de tracking, ETA.
 * L'agent Livraison répond aux clients via getDeliveryStatus() / getDeliveryETA().
 */
import { useMemo, useState } from "react";
import { Plus, Search, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  useDeliveries, useOrders, useSim, type Delivery, type DeliveryStatus,
} from "@/lib/sim/store";
import { EmptyState } from "@/components/ui-shared";
import {
  BizBadge, BizModal, BizTable, FormField, GhostButton, PageHeader,
  PrimaryButton, SelectField, TextField, type BizTone,
} from "@/sections/business/ui";
import { ORDER_STATUS_META } from "./Orders";
import CloudGate from "@/components/app/CloudGate";

export const DELIVERY_STATUS_META: Record<DeliveryStatus, { label: string; tone: BizTone }> = {
  pending: { label: "En attente", tone: "amber" },
  preparing: { label: "Préparation", tone: "iris" },
  in_transit: { label: "En transit", tone: "pulse" },
  delivered: { label: "Livrée", tone: "mint" },
  failed: { label: "Échec", tone: "rose" },
};

const EMPTY_FORM = { orderId: "", driverName: "", trackingNumber: "", address: "", etaStart: "", etaEnd: "" };

export default function Deliveries() {
  const deliveries = useDeliveries();
  const orders = useOrders();
  const upsertDelivery = useSim((s) => s.upsertDelivery);
  const setDeliveryStatus = useSim((s) => s.setDeliveryStatus);
  const deleteDelivery = useSim((s) => s.deleteDelivery);

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  /** Commandes livrables : confirmée/expédiée et pas déjà couverte par une livraison. */
  const deliverableOrders = useMemo(
    () => orders.filter((o) => !deliveries.some((d) => d.orderId === o.id) && o.status !== "cancelled"),
    [orders, deliveries],
  );

  const filtered = useMemo(() => {
    let list = deliveries;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) => {
        const order = orderById.get(d.orderId);
        return (
          d.trackingNumber.toLowerCase().includes(q)
          || d.driverName.toLowerCase().includes(q)
          || (order?.orderNumber.toLowerCase().includes(q) ?? false)
          || (order?.customerName.toLowerCase().includes(q) ?? false)
        );
      });
    }
    if (statusF !== "all") list = list.filter((d) => d.status === statusF);
    return list;
  }, [deliveries, orderById, search, statusF]);

  const submit = () => {
    if (!form.orderId) return toast.error("Sélectionnez une commande");
    const etaStart = form.etaStart ? new Date(form.etaStart).getTime() : undefined;
    const etaEnd = form.etaEnd ? new Date(form.etaEnd).getTime() : undefined;
    upsertDelivery({
      orderId: form.orderId,
      status: "pending",
      driverName: form.driverName.trim(),
      trackingNumber: form.trackingNumber.trim(),
      address: form.address.trim(),
      etaStart: Number.isFinite(etaStart) ? etaStart : undefined,
      etaEnd: Number.isFinite(etaEnd) ? etaEnd : undefined,
    });
    toast.success("Livraison créée");
    setModalOpen(false);
    setForm(EMPTY_FORM);
  };

  const onDelete = (d: Delivery) => {
    deleteDelivery(d.id);
    toast.success(`Livraison ${d.trackingNumber} supprimée`);
  };

  const etaLabel = (d: Delivery) => {
    if (!d.etaStart && !d.etaEnd) return "—";
    const fmt = (ts?: number) => (ts ? new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "…");
    return `${fmt(d.etaStart)} → ${fmt(d.etaEnd)}`;
  };

  return (
    <CloudGate>
      <div className="flex flex-col gap-4">
      <PageHeader
        title="Livraisons"
        count={deliveries.length}
        countLabel=" livraisons"
        action={
          <PrimaryButton onClick={() => setModalOpen(true)} disabled={deliverableOrders.length === 0}>
            <Plus className="size-4" /> Nouvelle livraison
          </PrimaryButton>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-r-md border border-line bg-surface-1 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-low" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un tracking, un livreur, une commande…"
            aria-label="Rechercher une livraison"
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
          {Object.entries(DELIVERY_STATUS_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-r-md border border-line bg-surface-1">
          <EmptyState
            title={deliveries.length === 0 ? "Aucune livraison" : "Aucune livraison trouvée"}
            description={
              deliveries.length === 0
                ? "Créez une livraison à partir d'une commande confirmée : suivi, livreur et ETA seront visibles par l'agent Livraison."
                : "Essayez d'autres filtres."
            }
          />
        </div>
      ) : (
        <BizTable head={["Commande", "Client", "Statut", "Livreur", "Tracking", "ETA", ""]}>
          {filtered.map((d) => {
            const order = orderById.get(d.orderId);
            return (
              <tr key={d.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-3">
                  <span className="block font-mono text-[12px] text-hi">{order?.orderNumber ?? "—"}</span>
                  {order && (
                    <span className="label-micro text-low">
                      {ORDER_STATUS_META[order.status].label}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-[13px] font-medium text-hi">{order?.customerName ?? "—"}</td>
                <td className="px-4 py-3">
                  <select
                    value={d.status}
                    onChange={(e) => {
                      setDeliveryStatus(d.id, e.target.value as DeliveryStatus);
                      toast.success(`Statut → ${DELIVERY_STATUS_META[e.target.value as DeliveryStatus].label}`);
                    }}
                    aria-label={`Statut de ${d.trackingNumber}`}
                    className="rounded-full border border-line bg-surface-2 px-2 py-1 text-[11px] text-hi focus:border-iris focus:outline-none"
                  >
                    {Object.entries(DELIVERY_STATUS_META).map(([k, m]) => (
                      <option key={k} value={k}>{m.label}</option>
                    ))}
                  </select>
                  <BizBadge tone={DELIVERY_STATUS_META[d.status].tone}>
                    {DELIVERY_STATUS_META[d.status].label}
                  </BizBadge>
                </td>
                <td className="px-4 py-3 text-[13px] text-mid">
                  <span className="inline-flex items-center gap-1.5">
                    <Truck className="size-3.5 text-low" /> {d.driverName || "—"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-mid">{d.trackingNumber}</td>
                <td className="px-4 py-3 text-[12px] text-mid">{etaLabel(d)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => onDelete(d)}
                      aria-label={`Supprimer ${d.trackingNumber}`}
                      className="flex size-8 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-rose/15 hover:text-rose"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </BizTable>
      )}

      <BizModal
        open={modalOpen}
        title="Nouvelle livraison"
        subtitle="Rattachée à une commande — un numéro de tracking est généré si vide."
        onClose={() => setModalOpen(false)}
      >
        <div className="space-y-4">
          <FormField label="Commande">
            <SelectField
              value={form.orderId}
              onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))}
            >
              <option value="">— Sélectionner —</option>
              {deliverableOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber} · {o.customerName}
                </option>
              ))}
            </SelectField>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Livreur">
              <TextField
                value={form.driverName}
                onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))}
                placeholder="Nom du livreur"
              />
            </FormField>
            <FormField label="Tracking">
              <TextField
                value={form.trackingNumber}
                onChange={(e) => setForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                placeholder="(auto)"
              />
            </FormField>
          </div>
          <FormField label="Adresse de livraison">
            <TextField
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="12 rue de la Liberté, Ariana"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="ETA début">
              <TextField
                type="datetime-local"
                value={form.etaStart}
                onChange={(e) => setForm((f) => ({ ...f, etaStart: e.target.value }))}
              />
            </FormField>
            <FormField label="ETA fin">
              <TextField
                type="datetime-local"
                value={form.etaEnd}
                onChange={(e) => setForm((f) => ({ ...f, etaEnd: e.target.value }))}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <GhostButton onClick={() => setModalOpen(false)}>Annuler</GhostButton>
            <PrimaryButton onClick={submit}>Créer</PrimaryButton>
          </div>
        </div>
      </BizModal>
      </div>
    </CloudGate>
  );
}
