/**
 * QuotaReachedDialog — modale « Quota WhatsApp atteint » (prompt maître §20).
 * Affichée quand le nombre de sessions dépasse le quota du plan
 * (Essentiel 1 · Pro 3 · Business 10 · Enterprise illimité). Renvoie vers
 * la facturation (Paramètres → Plan) sans casser le flux QR existant.
 */
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, X } from "lucide-react";
import { PLAN_LABELS, sessionQuota, useOrg } from "@/lib/sim/store";

export default function QuotaReachedDialog({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  /** Nombre de sessions actuelles */
  current: number;
}) {
  const navigate = useNavigate();
  const org = useOrg();
  const quota = sessionQuota(org.plan);
  const quotaLabel = quota === Infinity ? "illimité" : String(quota);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label="Quota WhatsApp atteint"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[4px]" onClick={onClose} />
          <motion.div
            initial={{ y: 24, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative w-full max-w-[440px] rounded-r-lg border border-line bg-surface-1 p-6 shadow-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-r-sm bg-amber/10 text-amber">
                  <Crown className="size-5" />
                </span>
                <div>
                  <h3 className="font-display text-[18px] leading-[26px] font-semibold text-hi">
                    Quota WhatsApp atteint
                  </h3>
                  <p className="text-[12px] text-mid">Plan {PLAN_LABELS[org.plan]}</p>
                </div>
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

            <p className="mt-4 text-[13px] leading-relaxed text-mid">
              Votre plan <span className="font-semibold text-hi">{PLAN_LABELS[org.plan]}</span> autorise{" "}
              <span className="font-semibold tabular text-hi">{quotaLabel}</span> session
              {quota === 1 ? "" : "s"} WhatsApp — vous en utilisez déjà{" "}
              <span className="font-semibold tabular text-hi">{current}</span>. Passez au plan
              supérieur pour ajouter une nouvelle session (Essentiel 1 · Pro 3 · Business 10 ·
              Enterprise illimité).
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-r-sm border border-line bg-surface-2 px-3.5 py-2 text-[13px] font-medium text-hi transition-colors hover:bg-surface-3"
              >
                Plus tard
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate("/app/settings");
                }}
                className="flex items-center gap-1.5 rounded-r-sm gradient-signature px-3.5 py-2 text-[13px] font-semibold text-white shadow-glow-iris transition-transform hover:scale-[1.02] active:scale-95"
              >
                <Crown className="size-4" /> Voir la facturation
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
