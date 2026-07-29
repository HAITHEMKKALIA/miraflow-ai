/**
 * QrModal — modale de connexion d'une session WhatsApp (dashboard.md S1).
 * Flux 100 % réel via BridgeQrPanel : si le serveur bridge est configuré,
 * le vrai QR Baileys est affiché et la connexion remonte le vrai numéro ;
 * sinon, un état « Serveur bridge requis » permet de coller et tester l'URL.
 * Aucune simulation de connexion.
 */
import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QrCode, X } from "lucide-react";
import BridgeQrPanel, { type BridgeConnectedInfo } from "@/components/BridgeQrPanel";

/** id bridge frais par ouverture (régénéré à chaque montage du contenu) */
const newSessionId = () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function QrModalContent({
  onClose,
  onConnected,
  sessionName,
  sessionId: sessionIdProp,
}: {
  onClose: () => void;
  onConnected?: (info: BridgeConnectedInfo) => void;
  sessionName: string;
  sessionId?: string;
}) {
  // id bridge stable pour cette ouverture : réutilise la session existante
  // (auth persistée côté bridge) ou en crée une nouvelle.
  const sessionId = useMemo(() => sessionIdProp ?? newSessionId(), [sessionIdProp]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label="Connecter une session WhatsApp"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[4px]" onClick={onClose} />
      <motion.div
        initial={{ y: 24, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 12, scale: 0.98, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="relative w-full max-w-[480px] rounded-r-lg border border-line bg-surface-1 p-6 shadow-card"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-r-sm bg-iris/10 text-iris">
              <QrCode className="size-5" />
            </span>
            <div>
              <h3 className="font-display text-[18px] leading-[26px] font-semibold text-hi">
                Connecter une session
              </h3>
              <p className="text-[12px] text-mid">{sessionName} · WhatsApp via bridge MiraFlow</p>
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

        <div className="mt-5 flex flex-col items-center">
          <BridgeQrPanel sessionId={sessionId} onConnected={onConnected} />
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function QrModal({
  open,
  onClose,
  onConnected,
  sessionName = "Nouvelle session",
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  /** Appelé à la connexion réelle, avec le vrai numéro / pushname. */
  onConnected?: (info: BridgeConnectedInfo) => void;
  sessionName?: string;
  /** Id de session existante à reconnecter (sinon id frais par ouverture). */
  targetId?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <QrModalContent
          onClose={onClose}
          onConnected={onConnected}
          sessionName={sessionName}
          sessionId={targetId}
        />
      )}
    </AnimatePresence>
  );
}
