/**
 * ConfirmDialog — modale de confirmation 440px (design.md §6).
 * Titre, description, bouton danger `rose`. Pour les actions destructives
 * critiques, `requireText` impose la saisie d'un mot (ex. « ARRÊTER »).
 */
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  requireText,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Si défini, le bouton danger reste inactif tant que le texte saisi ≠ requireText */
  requireText?: string;
  icon?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const blocked = requireText ? typed.trim().toUpperCase() !== requireText.toUpperCase() : false;

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
            className="relative w-full max-w-[440px] rounded-r-lg border border-line bg-surface-1 p-6 shadow-card"
          >
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose/10 text-rose">
                {icon ?? <AlertTriangle className="size-5" />}
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-[18px] leading-[26px] font-semibold text-hi">{title}</h3>
                {description && <div className="mt-1.5 text-[14px] leading-[22px] text-mid">{description}</div>}
              </div>
            </div>

            {requireText && (
              <div className="mt-4">
                <label className="label-micro text-low" htmlFor="confirm-typed">
                  Saisissez « {requireText} » pour confirmer
                </label>
                <input
                  id="confirm-typed"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                  className="mt-2 w-full rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[14px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
                  placeholder={requireText}
                />
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-r-sm border border-line bg-surface-2 px-4 py-2 text-[14px] font-medium text-mid transition-colors hover:bg-surface-3 hover:text-hi"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={blocked}
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={cn(
                  "rounded-r-sm px-4 py-2 text-[14px] font-semibold text-white transition-all",
                  blocked ? "cursor-not-allowed bg-rose/30" : "bg-rose hover:brightness-110 active:scale-[.97]",
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
