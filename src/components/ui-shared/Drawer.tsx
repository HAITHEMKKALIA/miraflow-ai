/**
 * Drawer — panneau latéral droit 420–480px (design.md §6).
 * Entrée x:100%→0 en 450ms ease-out-expo, overlay blur 4px, Échap ferme.
 */
import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Drawer({
  open,
  onClose,
  title,
  children,
  width = 440,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** 420–480 recommandé */
  width?: number;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-[4px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "absolute inset-y-0 end-0 flex flex-col border-s border-line bg-surface-1 shadow-card",
            )}
            style={{ width: `min(${width}px, 100vw)` }}
          >
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
              <h2 className="font-display text-[16px] font-semibold text-hi">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer le panneau"
                className="flex size-8 items-center justify-center rounded-r-sm text-mid transition-colors hover:bg-surface-2 hover:text-hi"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
            {footer && <footer className="shrink-0 border-t border-line p-4">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
