/**
 * DashboardHeader — en-tête de page (dashboard.md S1).
 * Salutation selon l'heure, date locale FR, SegmentedControl de période,
 * boutons « Nouvelle campagne » (primaire) et « Connecter une session » (glass).
 * Animation : titre y:16→0 450ms, actions stagger 60ms.
 */
import { motion } from "framer-motion";
import { Plus, QrCode } from "lucide-react";
import { useNavigate } from "react-router";
import { useSim } from "@/lib/sim/store";
import { EASE, GlassButton, PrimaryButton, SegmentedControl } from "./shared";

export type Period = "today" | "7d" | "30d";

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Aujourd'hui" },
  { value: "7d", label: "7 jours" },
  { value: "30d", label: "30 jours" },
];

export default function DashboardHeader({
  period,
  onPeriodChange,
  onConnectSession,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
  onConnectSession: () => void;
}) {
  const navigate = useNavigate();
  const me = useSim((s) => s.team[0]);
  const hour = new Date().getHours();
  const greeting = hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour";
  const firstName = me?.name.split(" ")[0] ?? "";
  const date = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <h1 className="font-display text-[32px] leading-[38px] font-semibold tracking-[-0.03em] text-hi">
          {greeting}{firstName ? <> <span className="text-gradient">{firstName}</span></> : ""}
        </h1>
        <p className="mt-1 text-[14px] text-mid">
          Voici le pouls de vos conversations — <span className="text-low">{date}</span>
        </p>
      </motion.div>

      <div className="flex flex-wrap items-center gap-2.5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.06 }}
        >
          <SegmentedControl options={PERIOD_OPTIONS} value={period} onChange={onPeriodChange} />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.12 }}
        >
          <GlassButton onClick={onConnectSession}>
            <QrCode className="size-4" />
            Connecter une session
          </GlassButton>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.18 }}
        >
          <PrimaryButton onClick={() => navigate("/app/campaigns")}>
            <Plus className="size-4" />
            Nouvelle campagne
          </PrimaryButton>
        </motion.div>
      </div>
    </div>
  );
}
