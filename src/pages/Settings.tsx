/**
 * Page Paramètres (/app/settings) — design/settings.md.
 * Coquille : nav verticale d'onglets (sticky 240px, indicateur glissant,
 * routes #general…#apparence) + panneau de contenu avec transition 300ms.
 * Barre sticky basse « Modifications non enregistrées » (slide-up spring,
 * devient verte « Enregistré ✓ » 1,2 s à la sauvegarde).
 */
import type { ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE } from "@/sections/settings/data";
import { SettingsProvider, useSettings, type TabId } from "@/sections/settings/context";
import SettingsNav from "@/sections/settings/SettingsNav";
import GeneralTab from "@/sections/settings/GeneralTab";
import TeamTab from "@/sections/settings/TeamTab";
import SessionsTab from "@/sections/settings/SessionsTab";
import AiTab from "@/sections/settings/AiTab";
import BillingTab from "@/sections/settings/BillingTab";
import SecurityTab from "@/sections/settings/SecurityTab";
import NotificationsTab from "@/sections/settings/NotificationsTab";
import AppearanceTab from "@/sections/settings/AppearanceTab";

const TAB_CONTENT: Record<TabId, ComponentType<any>> = {
  general: GeneralTab,
  equipe: TeamTab,
  sessions: SessionsTab,
  ia: AiTab,
  plan: BillingTab,
  securite: SecurityTab,
  notifications: NotificationsTab,
  apparence: AppearanceTab,
};

/* ── Barre « modifications non enregistrées » ──────────────────────────── */
function DirtyBar() {
  const { dirty, savedFlash, save, cancel } = useSettings();
  const visible = dirty || savedFlash;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="sticky bottom-5 z-40 mx-auto w-fit"
          role="status"
        >
          <div
            className={cn(
              "flex items-center gap-4 rounded-full border px-5 py-3 shadow-card backdrop-blur transition-colors duration-300",
              savedFlash ? "border-mint/50 bg-mint/15" : "border-line bg-surface-3/95",
            )}
          >
            {savedFlash ? (
              <span className="flex items-center gap-2 text-[13px] font-semibold text-mint">
                <Check className="size-4" /> Enregistré ✓
              </span>
            ) : (
              <>
                <span className="text-[13px] text-mid">Modifications non enregistrées</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancel}
                    className="rounded-full border border-line bg-surface-2 px-3.5 py-1.5 text-[12.5px] font-medium text-mid transition-colors hover:text-hi"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    className="gradient-signature rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-all hover:brightness-110 active:scale-[.97]"
                  >
                    Enregistrer
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SettingsBody() {
  const { tab } = useSettings();
  const Content = TAB_CONTENT[tab];
  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="mb-6">
        <h2 className="font-display text-[32px] leading-[38px] font-semibold tracking-[-0.02em] text-hi">
          Paramètres
        </h2>
        <p className="mt-1 text-[14px] text-mid">
          Administration de l'organisation : équipe, sessions, plan, sécurité et préférences.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <SettingsNav />
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <Content />
            </motion.div>
          </AnimatePresence>
          <DirtyBar />
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <SettingsProvider>
      <SettingsBody />
    </SettingsProvider>
  );
}
