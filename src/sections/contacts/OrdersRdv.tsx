/**
 * OrdersRdv — sections « Commandes » et « Rendez-vous » de la fiche contact,
 * partagées entre l'Inbox (ContactPanel, accordéons) et la page Contacts
 * (ContactDrawer, onglets dédiés). Commandes = données réelles du store
 * (module Commandes, rattachées par nom client). Rendez-vous : aucun module
 * de planification n'existe encore — la liste démarre vide.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarCheck, CalendarClock, CheckCircle2, ChevronDown, PackageCheck, Truck, User,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/sim/store";
import { useSim } from "@/lib/sim/store";
import { fmtDate, fmtTime } from "./shared";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

/* ── Types & accès aux données réelles ─────────────────────────────────── */
export interface ContactOrder {
  id: string;
  /** n° de commande affiché, ex. « CMD-2481 » */
  num: string;
  product: string;
  /** montant TND */
  amount: number;
  status: "delivered" | "processing";
  at: number;
}

export interface Appointment {
  id: string;
  service: string;
  agent: string;
  at: number;
}

/** Commandes réelles du store rattachées au contact (par nom client). */
export function getContactOrders(contact: Contact): ContactOrder[] {
  return useSim
    .getState()
    .orders.filter((o) => o.customerName === contact.name)
    .map((o) => ({
      id: o.id,
      num: o.orderNumber,
      product:
        o.items
          .map((it) => (it.quantity > 1 ? `${it.productName} ×${it.quantity}` : it.productName))
          .join(", ") || o.orderNumber,
      amount: o.total,
      status: (o.status === "delivered" ? "delivered" : "processing") as ContactOrder["status"],
      at: o.createdAt,
    }))
    .sort((a, b) => b.at - a.at);
}

/** Aucun module de rendez-vous : liste vide tant qu'aucun RDV n'existe. */
export function getContactAppointments(_contact: Contact): Appointment[] {
  return [];
}

/* ── Commandes ─────────────────────────────────────────────────────────── */
const ORDER_STATUS: Record<ContactOrder["status"], { label: string; chip: string; icon: typeof Truck }> = {
  delivered: { label: "Livrée", chip: "border-mint/30 bg-mint/10 text-mint", icon: PackageCheck },
  processing: { label: "En cours", chip: "border-amber/30 bg-amber/10 text-amber", icon: Truck },
};

export function OrdersBlock({ contact }: { contact: Contact }) {
  const orders = useMemo(() => getContactOrders(contact), [contact]);
  const total = orders.reduce((acc, o) => acc + o.amount, 0);
  if (orders.length === 0) {
    return <p className="py-6 text-center text-[13px] text-low">Aucune commande enregistrée pour ce contact.</p>;
  }
  return (
    <div className="space-y-2">
      {orders.map((o) => {
        const st = ORDER_STATUS[o.status];
        const StIcon = st.icon;
        return (
          <div key={o.id} className="flex items-center gap-2.5 rounded-r-sm border border-line/60 bg-surface-2/50 px-2.5 py-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-r-sm bg-mint/10 text-mint">
              <StIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-hi">{o.product}</p>
              <p className="font-mono text-[10px] tabular text-low">
                {o.num} · {fmtDate(o.at)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-mono text-[11.5px] font-medium tabular text-hi">
                {o.amount.toLocaleString("fr-FR")} TND
              </span>
              <span className={cn("rounded-full border px-1.5 py-px text-[9.5px] font-semibold leading-3.5", st.chip)}>
                {st.label}
              </span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between border-t border-line/60 pt-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-low">Total</span>
        <span className="font-mono text-[12px] font-semibold tabular text-hi">{total.toLocaleString("fr-FR")} TND</span>
      </div>
    </div>
  );
}

/* ── Rendez-vous ───────────────────────────────────────────────────────── */
function AppointmentCard({ appt, contactName }: { appt: Appointment; contactName: string }) {
  const [at, setAt] = useState(appt.at);
  const [confirmed, setConfirmed] = useState(false);
  const [picking, setPicking] = useState(false);

  /* 3 créneaux alternatifs proposés (jours suivants, horaires ouvrés) */
  const slots = useMemo(
    () =>
      [1, 2, 3].map((i) => {
        const d = new Date(appt.at + i * DAY);
        d.setHours(9 + i * 2, i % 2 ? 30 : 0, 0, 0);
        return d.getTime();
      }),
    [appt.at],
  );

  const confirm = () => {
    setConfirmed(true);
    toast.success("Rendez-vous confirmé", {
      description: `${appt.service} · ${fmtDate(at)} à ${fmtTime(at)} — rappel envoyé à ${contactName}.`,
    });
  };
  const reschedule = (slot: number) => {
    setAt(slot);
    setPicking(false);
    setConfirmed(false);
    toast.success("Rendez-vous replanifié", {
      description: `Nouveau créneau : ${fmtDate(slot)} à ${fmtTime(slot)}.`,
    });
  };

  return (
    <div className="rounded-r-sm border border-line/60 bg-surface-2/50 p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-r-sm bg-amber/10 text-amber">
          <CalendarCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-hi">{appt.service}</p>
          <p className="mt-0.5 font-mono text-[10.5px] tabular text-low">
            {fmtDate(at)} · {fmtTime(at)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-low">
            <User className="size-3" />
            {appt.agent}
          </p>
        </div>
        {confirmed && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex shrink-0 items-center gap-1 rounded-full border border-mint/30 bg-mint/10 px-2 py-0.5 text-[10px] font-semibold text-mint"
          >
            <CheckCircle2 className="size-3" />
            Confirmé
          </motion.span>
        )}
      </div>

      <div className="mt-2.5 flex gap-2">
        {!confirmed && (
          <button
            type="button"
            onClick={confirm}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-r-sm gradient-signature px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95"
          >
            <CheckCircle2 className="size-3.5" />
            Confirmer
          </button>
        )}
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          aria-expanded={picking}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-r-sm border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
            picking ? "border-iris/40 bg-iris/10 text-iris" : "border-line bg-surface-1 text-mid hover:bg-surface-3 hover:text-hi",
          )}
        >
          <CalendarClock className="size-3.5" />
          Replanifier
          <ChevronDown className={cn("size-3 transition-transform", picking && "rotate-180")} />
        </button>
      </div>

      {/* Sélecteur de créneau */}
      <AnimatePresence initial={false}>
        {picking && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1 border-t border-line/50 pt-2">
              <p className="label-micro text-low">Créneaux disponibles</p>
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => reschedule(s)}
                  className="flex w-full items-center justify-between rounded-r-sm border border-line/60 bg-surface-1 px-2.5 py-1.5 text-[11.5px] text-mid transition-colors hover:border-iris/40 hover:bg-iris/5 hover:text-hi"
                >
                  <span>{fmtDate(s)}</span>
                  <span className="font-mono tabular text-low">{fmtTime(s)}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AppointmentsBlock({ contact }: { contact: Contact }) {
  const appts = useMemo(() => getContactAppointments(contact), [contact]);
  const first = contact.name.split(" ")[0] ?? contact.name;
  if (appts.length === 0) {
    return <p className="py-6 text-center text-[13px] text-low">Aucun rendez-vous planifié.</p>;
  }
  return (
    <div className="space-y-2">
      {appts.map((a) => (
        <AppointmentCard key={a.id} appt={a} contactName={first} />
      ))}
    </div>
  );
}
