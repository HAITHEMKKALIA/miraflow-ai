/**
 * Dashboard — cockpit « satellite » (/app, dashboard.md).
 * En-tête (salutation, période, actions) · bandeau alertes · 4 KPI vivants ·
 * graphique temps réel (3 s) · santé sessions QR · campagnes actives · fil
 * d'activité · bandeau Agents IA. Tout consomme le SimEngine : chaque chiffre
 * tique, chaque action a un feedback.
 */
import { useState } from "react";
import { toast } from "sonner";
import { persistBridgeSession } from "@/lib/bridge";
import {
  sessionQuota, usePendingSuggestions, useSessions, useSim, type QrSession, type SessionStatus,
} from "@/lib/sim/store";
import QuotaReachedDialog from "@/components/app/QuotaReachedDialog";
import DashboardHeader, { type Period } from "@/sections/dashboard/DashboardHeader";
import AlertsBanner from "@/sections/dashboard/AlertsBanner";
import KpiRow from "@/sections/dashboard/KpiRow";
import LiveChart from "@/sections/dashboard/LiveChart";
import SessionsHealth from "@/sections/dashboard/SessionsHealth";
import ActiveCampaigns from "@/sections/dashboard/ActiveCampaigns";
import ActivityFeed from "@/sections/dashboard/ActivityFeed";
import AiBanner from "@/sections/dashboard/AiBanner";
import QrModal from "@/sections/dashboard/QrModal";
import type { BridgeConnectedInfo } from "@/components/BridgeQrPanel";
import CloudGate from "@/components/app/CloudGate";

/** id de session bridge frais pour une nouvelle connexion réelle */
const newSessionId = () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Met en forme un numéro brut renvoyé par le bridge (digits) en +XXX … */
function displayPhone(raw?: string): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length < 7) return `+${d}`;
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`.trim();
}

export default function Dashboard() {
  const sessions = useSessions();
  const livePending = usePendingSuggestions().length;
  const orgName = useSim((s) => s.org.name);

  const [period, setPeriod] = useState<Period>("today");
  const [qrFor, setQrFor] = useState<string | null>(null); // id session existante | id frais (nouvelle)
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, SessionStatus>>({});
  const [flashId, setFlashId] = useState<string | null>(null);

  // Sessions avec statuts locaux (override optimiste en attendant le
  // statut réel du bridge ; l'override vit le temps de la session cockpit).
  const merged = sessions.map((s) =>
    overrides[s.id] && overrides[s.id] !== s.status
      ? {
          ...s,
          status: overrides[s.id],
          latencyMs: overrides[s.id] === "connected" ? 64 : s.latencyMs,
          uptime: overrides[s.id] === "connected" ? Math.max(s.uptime, 96.5) : s.uptime,
          connectedAt: overrides[s.id] === "connected" ? Date.now() : s.connectedAt,
        }
      : s,
  );

  const eventsSession = merged.find((s) => s.id === "s_events");
  const sessionDisconnected = eventsSession?.status === "disconnected";

  const isNew = qrFor !== null && newIds.has(qrFor);
  const qrName = isNew
    ? "Nouvelle session"
    : (merged.find((s) => s.id === qrFor)?.name ?? "Session");

  /** Connexion RÉELLE confirmée par le bridge (vrai numéro / pushname). */
  const handleConnected = (info: BridgeConnectedInfo) => {
    if (!qrFor) return;
    const phone = displayPhone(info.phone);
    if (isNew) {
      const name = info.pushname?.trim() || "Session WhatsApp";
      const session: QrSession = {
        id: qrFor,
        name,
        status: "connected",
        uptime: 100,
        latencyMs: 0,
        phone,
        connectedAt: Date.now(),
      };
      useSim.setState((st) => ({ sessions: [...st.sessions, session] }));
      void persistBridgeSession({
        orgName,
        sessionId: session.id,
        sessionName: session.name,
        sessionPhone: session.phone,
        sessionStatus: session.status,
      });
      toast.success("Session connectée", {
        description: `« ${name} » (${phone || "numéro en cours de récupération"}) est prête.`,
      });
    } else {
      const name = sessions.find((s) => s.id === qrFor)?.name ?? "Session";
      useSim.setState((st) => ({
        sessions: st.sessions.map((s) =>
          s.id === qrFor
            ? { ...s, status: "connected" as const, phone: phone || s.phone, connectedAt: Date.now() }
            : s,
        ),
      }));
      setOverrides((o) => {
        const next = { ...o };
        delete next[qrFor];
        return next;
      });
      void persistBridgeSession({
        orgName,
        sessionId: qrFor,
        sessionName: name,
        sessionPhone: phone || sessions.find((s) => s.id === qrFor)?.phone,
        sessionStatus: "connected",
      });
      toast.success(`Session « ${name} » reconnectée`, {
        description: phone ? `Numéro ${phone} — les envois reprennent.` : "Les envois reprennent normalement.",
      });
    }
    setFlashId(qrFor);
    setTimeout(() => setFlashId(null), 1400);
  };

  return (
    <CloudGate>
    <div className="mx-auto w-full max-w-[1440px] space-y-4 md:space-y-5">
      <DashboardHeader
        period={period}
        onPeriodChange={setPeriod}
        onConnectSession={() => {
          // Contrôle quota WhatsApp (§20) avant d'ouvrir le flux QR
          const plan = useSim.getState().org.plan;
          if (sessions.length >= sessionQuota(plan)) {
            setQuotaOpen(true);
            return;
          }
          const id = newSessionId();
          setNewIds((s) => new Set(s).add(id));
          setQrFor(id);
        }}
      />

      <AlertsBanner
        sessionDisconnected={sessionDisconnected}
        pendingSuggestions={livePending}
        onReconnect={() => setQrFor("s_events")}
      />

      <KpiRow period={period} />

      <div className="grid grid-cols-12 gap-4 md:gap-5">
        <LiveChart period={period} />
        <SessionsHealth
          sessions={merged}
          flashId={flashId}
          onReconnect={setQrFor}
        />
        <ActiveCampaigns />
        <ActivityFeed />
      </div>

      <AiBanner />

      <QrModal
        open={qrFor !== null}
        sessionName={qrName}
        targetId={qrFor ?? undefined}
        onClose={() => setQrFor(null)}
        onConnected={handleConnected}
      />

      <QuotaReachedDialog
        open={quotaOpen}
        current={sessions.length}
        onClose={() => setQuotaOpen(false)}
      />
    </div>
    </CloudGate>
  );
}
