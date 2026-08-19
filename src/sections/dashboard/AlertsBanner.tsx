/**
 * AlertsBanner — bandeau d'alertes conditionnel (dashboard.md S2).
 * Max 2 alertes empilées + bandeaux de contexte :
 *   - Impersonnation (amber, persistant, croix interdite) — écrit par le Super
 *     Admin via localStorage "mf:impersonate" (console cross-module).
 *   - Incident plateforme (rose) — déclaré depuis /admin via "mf:incident".
 *   - Session déconnectée (amber) → action Reconnecter (modale QR).
 *   - Suggestions IA (iris) → action Examiner (Inbox filtré).
 * Entrée : hauteur auto + y:-8 (stagger 100ms) ; fermeture : hauteur→0 250ms.
 */
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Eye, Info, RefreshCw, Siren, X } from "lucide-react";
import { useNavigate } from "react-router";
import { StatusDot } from "@/components/ui-shared";
import { EASE } from "./shared";
import { cn } from "@/lib/utils";

export interface PlatformIncident {
  title: string;
  severity: "critique" | "majeur" | "mineur";
  at: number;
}

export function readImpersonation(): string | null {
  try {
    return localStorage.getItem("mf:impersonate");
  } catch {
    return null;
  }
}

export function readIncident(): PlatformIncident | null {
  try {
    const raw = localStorage.getItem("mf:incident");
    return raw ? (JSON.parse(raw) as PlatformIncident) : null;
  } catch {
    return null;
  }
}

interface AlertDef {
  id: string;
  tone: "amber" | "iris" | "rose";
  icon: typeof Info;
  text: ReactNode;
  actionLabel?: string;
  actionIcon?: typeof Info;
  onAction?: () => void;
  sticky?: boolean;
}

const TONE_BAR: Record<AlertDef["tone"], string> = {
  amber: "border-s-amber",
  iris: "border-s-iris",
  rose: "border-s-rose",
};
const TONE_DOT: Record<AlertDef["tone"], "amber" | "iris" | "rose"> = {
  amber: "amber",
  iris: "iris",
  rose: "rose",
};
const TONE_ICON: Record<AlertDef["tone"], string> = {
  amber: "bg-amber/10 text-amber",
  iris: "bg-iris/10 text-iris",
  rose: "bg-rose/10 text-rose",
};

export default function AlertsBanner({
  sessionDisconnected,
  pendingSuggestions,
  onReconnect,
}: {
  sessionDisconnected: boolean;
  pendingSuggestions: number;
  onReconnect: () => void;
}) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [impersonating, setImpersonating] = useState<string | null>(() => readImpersonation());
  const [incident, setIncident] = useState<PlatformIncident | null>(() => readIncident());

  // Re-lecture au focus (retour d'onglet) — la navigation SPA remonte la page.
  useEffect(() => {
    const sync = () => {
      setImpersonating(readImpersonation());
      setIncident(readIncident());
    };
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  const alerts: AlertDef[] = [];
  if (impersonating) {
    alerts.push({
      id: "impersonation",
      tone: "amber",
      icon: Eye,
      sticky: true,
      text: (
        <>
          Vous voyez <span className="font-semibold text-hi">{impersonating}</span> — session
          d'impersonnation journalisée dans l'audit.
        </>
      ),
      actionLabel: "Quitter",
      actionIcon: X,
      onAction: () => {
        try {
          localStorage.removeItem("mf:impersonate");
        } catch {
          /* noop */
        }
        setImpersonating(null);
        navigate("/admin");
      },
    });
  }
  if (incident && !dismissed.includes("incident")) {
    alerts.push({
      id: "incident",
      tone: incident.severity === "critique" ? "rose" : "amber",
      icon: Siren,
      text: (
        <>
          Incident plateforme : <span className="font-semibold text-hi">{incident.title}</span> —
          nos équipes sont mobilisées.
        </>
      ),
    });
  }
  if (sessionDisconnected && !dismissed.includes("session")) {
    alerts.push({
      id: "session",
      tone: "amber",
      icon: AlertTriangle,
      text: (
        <>
          Session <span className="font-semibold text-hi">« Événements »</span> déconnectée depuis
          2 h — reconnectez-la pour reprendre les envois.
        </>
      ),
      actionLabel: "Reconnecter",
      actionIcon: RefreshCw,
      onAction: onReconnect,
    });
  }
  if (pendingSuggestions > 0 && !dismissed.includes("ai")) {
    alerts.push({
      id: "ai",
      tone: "iris",
      icon: Info,
      text: (
        <>
          <span className="font-semibold text-hi tabular">{pendingSuggestions} suggestion
          {pendingSuggestions > 1 ? "s" : ""}</span> de l'agent Commercial{" "}
          {pendingSuggestions > 1 ? "attendent" : "attend"} votre validation.
        </>
      ),
      actionLabel: "Examiner",
      actionIcon: Eye,
      onAction: () => navigate("/app/inbox?suggestions=1"),
    });
  }

  // Impersonnation toujours visible ; ensuite max 2 alertes.
  const sticky = alerts.filter((a) => a.sticky);
  const rest = alerts.filter((a) => !a.sticky).slice(0, 2);
  const visible = [...sticky, ...rest];

  return (
    <div className="space-y-2.5" role="status">
      <AnimatePresence>
        {visible.map((alert, i) => {
          const Icon = alert.icon;
          const ActionIcon = alert.actionIcon;
          return (
            <motion.div
              key={alert.id}
              layout
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 0.4, ease: EASE, delay: i * 0.1 }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  "flex items-center gap-3 rounded-r-md border border-line border-s-[3px] bg-surface-1 px-4 py-3",
                  TONE_BAR[alert.tone],
                )}
              >
                <StatusDot tone={TONE_DOT[alert.tone]} className="shrink-0" />
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-r-sm",
                    TONE_ICON[alert.tone],
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <p className="min-w-0 flex-1 text-[13px] leading-[20px] text-mid">{alert.text}</p>
                {alert.actionLabel && (
                  <button
                    type="button"
                    onClick={alert.onAction}
                    className="flex shrink-0 items-center gap-1.5 rounded-r-sm px-2.5 py-1.5 text-[12px] font-semibold text-hi transition-colors hover:bg-surface-2"
                  >
                    {ActionIcon && <ActionIcon className="size-3.5" />}
                    {alert.actionLabel}
                  </button>
                )}
                {!alert.sticky && (
                  <button
                    type="button"
                    aria-label="Fermer l'alerte"
                    onClick={() => setDismissed((d) => [...d, alert.id])}
                    className="flex size-7 shrink-0 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-surface-2 hover:text-hi"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
