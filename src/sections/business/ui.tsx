/**
 * UI partagée des pages métier (Produits / Commandes / Livraisons / Clients /
 * Connaissances) — conventions visuelles du cockpit (surfaces, radius, tons).
 */
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── En-tête de page (style Contacts) ───────────────────────────────────── */
export function PageHeader({
  title,
  count,
  countLabel,
  action,
}: {
  title: string;
  count: number;
  countLabel: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-none text-hi">{title}</h1>
        <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-mid">
          <span className="font-semibold tabular text-hi">{count}</span>
          {countLabel}
          <span className="inline-flex items-center gap-1 text-low">
            <span className="size-1.5 animate-pulse rounded-full bg-mint" /> mis à jour à l'instant
          </span>
        </p>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

/* ── Boutons ────────────────────────────────────────────────────────────── */
export function PrimaryButton({
  children, onClick, disabled, type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-r-sm gradient-signature px-3.5 py-2 text-[13px] font-semibold text-white shadow-glow-iris transition-transform hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children, onClick, disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-r-sm border border-line bg-surface-2 px-3.5 py-2 text-[13px] font-medium text-hi transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/* ── Badge de statut ────────────────────────────────────────────────────── */
export type BizTone = "mint" | "amber" | "rose" | "iris" | "low" | "pulse";

export function BizBadge({ tone, children }: { tone: BizTone; children: ReactNode }) {
  const cls =
    tone === "mint" ? "bg-mint/12 text-mint"
    : tone === "amber" ? "bg-amber/12 text-amber"
    : tone === "rose" ? "bg-rose/12 text-rose"
    : tone === "iris" ? "bg-iris/12 text-iris"
    : tone === "pulse" ? "bg-pulse/12 text-pulse"
    : "bg-surface-2 text-mid";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium", cls)}>
      {children}
    </span>
  );
}

/* ── Champs de formulaire ───────────────────────────────────────────────── */
export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-micro mb-1.5 block text-low">{label}</span>
      {children}
    </label>
  );
}

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[13px] text-hi outline-none transition placeholder:text-low focus:border-iris focus:ring-1 focus:ring-iris/40",
        props.className,
      )}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[13px] text-hi outline-none transition placeholder:text-low focus:border-iris focus:ring-1 focus:ring-iris/40",
        props.className,
      )}
    />
  );
}

export function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[13px] text-hi outline-none transition focus:border-iris",
        props.className,
      )}
    />
  );
}

/* ── Modale générique (style QrModal) ───────────────────────────────────── */
export function BizModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[4px]" onClick={onClose} />
          <motion.div
            initial={{ y: 24, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={cn(
              "relative max-h-[88dvh] w-full overflow-y-auto rounded-r-lg border border-line bg-surface-1 p-6 shadow-card",
              wide ? "max-w-[720px]" : "max-w-[520px]",
            )}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-[18px] leading-[26px] font-semibold text-hi">{title}</h3>
                {subtitle && <p className="mt-0.5 text-[12px] text-mid">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="flex size-8 items-center justify-center rounded-r-sm text-mid transition-colors hover:bg-surface-2 hover:text-hi"
              >
                <X className="size-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Conteneur table ────────────────────────────────────────────────────── */
export function BizTable({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-r-md border border-line bg-surface-1">
      <table className="w-full min-w-[640px] text-start">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th key={i} className="label-micro px-4 py-3 text-start font-medium text-low">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const fmtTnd = (v: number) =>
  `${v.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`;

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
