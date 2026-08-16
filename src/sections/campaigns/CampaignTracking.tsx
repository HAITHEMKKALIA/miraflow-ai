/**
 * CampaignTracking — Vue 3 Suivi (campaigns.md S1→S4).
 * En-tête (contrôles live + export CSV réel) · funnel 5 étapes relié par
 * signal lines (compteurs qui tickent, flash mint/rose) · area chart empilé
 * live (point toutes les 3 s) · flux d'événements role="log" (auto-scroll,
 * « Revenir au direct ») · table des destinataires filtrable. Empty state
 * planifiée avec compte à rebours, skeleton au chargement.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle, ArrowLeft, ArrowDownToLine, BellRing, CheckCheck, CircleStop,
  Clock, Download, OctagonX, Pause, Play, Reply, Send, UserMinus,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { useContacts, useSessions } from "@/lib/sim/store";
import { StatusDot, TickNumber } from "@/components/ui-shared";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { mergeContacts, useCrm } from "@/sections/contacts/crmStore";
import type { StudioCampaign } from "./shared";
import { fmt, pct, timeHM, timeHMS } from "./shared";
import { StatusChip } from "./CampaignList";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/* ── Types locaux ──────────────────────────────────────────────────────── */
type RowStatus = "queued" | "sent" | "delivered" | "replied" | "failed" | "unsub";
interface RecipientRow {
  id: string;
  name: string;
  phone: string;
  status: RowStatus;
  at: number | null;
  reply?: string;
}
interface StreamEvent {
  id: string;
  at: number;
  kind: "delivered" | "reply" | "failed" | "unsub" | "sent" | "excluded";
  text: string;
}

const ROW_STATUS_META: Record<RowStatus, { label: string; cls: string }> = {
  queued: { label: "en file", cls: "bg-surface-3 text-low" },
  sent: { label: "envoyé", cls: "bg-surface-3 text-mid" },
  delivered: { label: "livré", cls: "bg-pulse/10 text-pulse" },
  replied: { label: "réponse", cls: "bg-mint/10 text-mint" },
  failed: { label: "échoué", cls: "bg-rose/10 text-rose" },
  unsub: { label: "désinscrit", cls: "bg-rose/10 text-rose" },
};

function maskPhone(phone: string): string {
  return `${phone.slice(0, 8)} •• •• ${phone.slice(-2)}`;
}

/* ── Signal line entre les étapes du funnel ────────────────────────────── */
function SignalConnector() {
  return (
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" className="hidden shrink-0 md:block" aria-hidden>
      <path d="M2 12 C 16 12, 32 12, 46 12" stroke="var(--line-strong)" strokeWidth="1.5" className="signal-line" />
      <circle cx="46" cy="12" r="2.5" fill="var(--pulse)" />
    </svg>
  );
}

/* ── Étape du funnel ───────────────────────────────────────────────────── */
function FunnelStep({
  label, value, sub, tone, icon, index,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: "hi" | "mint" | "rose" | "pulse";
  icon: React.ReactNode;
  index: number;
}) {
  const color = tone === "mint" ? "text-mint" : tone === "rose" ? "text-rose" : tone === "pulse" ? "text-pulse" : "text-hi";
  const flash = tone === "rose" ? "rgba(255,107,129,.12)" : "rgba(13,186,155,.10)";
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.1, ease: EASE }}
      className="relative min-w-[120px] flex-1 overflow-hidden rounded-r-md border border-line bg-surface-1 p-4"
    >
      {/* flash à l'incrément */}
      <AnimatePresence>
        <motion.span
          key={value}
          initial={{ opacity: value > 0 ? 0.9 : 0 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9 }}
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: flash }}
        />
      </AnimatePresence>
      <p className="label-micro flex items-center gap-1.5 text-low">{icon} {label}</p>
      <p className={cn("mt-2 font-display text-[32px] leading-[36px] font-semibold tabular", color)}>
        <TickNumber value={value} />
      </p>
      {sub && <p className="mt-1 font-mono text-[11px] text-low tabular">{sub}</p>}
    </motion.div>
  );
}

/* ── Compte à rebours mono (campagne planifiée) ────────────────────────── */
function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((target - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <p className="font-mono text-[28px] text-pulse tabular" aria-live="polite">
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </p>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function CampaignTracking({
  campaign: c,
  onBack,
  onPauseToggle,
  onStop,
}: {
  campaign: StudioCampaign;
  onBack: () => void;
  onPauseToggle: (c: StudioCampaign) => void;
  onStop: (c: StudioCampaign) => void;
}) {
  const baseContacts = useContacts();
  const overrides = useCrm((state) => state.overrides);
  const extra = useCrm((state) => state.extra);
  const deleted = useCrm((state) => state.deleted);
  const contacts = useMemo(
    () => mergeContacts(baseContacts, { overrides, extra, deleted }),
    [baseContacts, overrides, extra, deleted],
  );
  const sessions = useSessions();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 650);
    return () => clearTimeout(t);
  }, []);

  const live = c.status === "running" || c.status === "paused";
  const startAt = useMemo(
    () => Date.now() - Math.round((c.sent / Math.max(1, c.ratePerMin)) * 60_000),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.id],
  );

  /* ── Destinataires dérivés des compteurs live ────────────────────────── */
  const recipients = useMemo<RecipientRow[]>(() => {
    if (!c.recipientIds?.length) return [];
    const rows: RecipientRow[] = [];
    const recipientContacts = c.recipientIds
      .map((id) => contacts.find((contact) => contact.id === id))
      .filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));
    const rngStep = (i: number) => startAt + Math.round((i / Math.max(1, c.ratePerMin)) * 60_000);
    for (let i = 0; i < recipientContacts.length; i++) {
      const contact = recipientContacts[i];
      let status: RowStatus = "queued";
      if (i < c.failed) status = "failed";
      else if (i < c.failed + c.unsubscribed) status = "unsub";
      else if (i < c.failed + c.unsubscribed + c.replies) status = "replied";
      else if (i < c.delivered) status = "delivered";
      else if (i < c.sent) status = "sent";
      rows.push({
        id: `${c.id}_r${i}`,
        name: contact.name,
        phone: contact.phone,
        status,
        at: status === "queued" ? null : rngStep(i),
      });
    }
    return rows;
  }, [c.recipientIds, c.id, c.sent, c.delivered, c.replies, c.failed, c.unsubscribed, c.ratePerMin, contacts, startAt]);

  /* ── Flux d'événements (deltas des compteurs) ────────────────────────── */
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const prevRef = useRef({ sent: c.sent, delivered: c.delivered, replies: c.replies, failed: c.failed, unsub: c.unsubscribed });
  const lastReplyToastRef = useRef(0);
  useEffect(() => {
    setEvents([]);
    prevRef.current = { sent: c.sent, delivered: c.delivered, replies: c.replies, failed: c.failed, unsub: c.unsubscribed };
  }, [c.id, c.sent, c.delivered, c.replies, c.failed, c.unsubscribed]);

  useEffect(() => {
    const prev = prevRef.current;
    const lines: StreamEvent[] = [];
    const pickByStatus = (statuses: RowStatus[], offset = 0) => {
      const pool = recipients.filter((row) => statuses.includes(row.status));
      if (pool.length === 0) return recipients[Math.max(0, recipients.length - 1 - offset)];
      return pool[Math.max(0, pool.length - 1 - offset)];
    };
    const dDel = c.delivered - prev.delivered;
    const dRep = c.replies - prev.replies;
    const dFail = c.failed - prev.failed;
    const dUnsub = c.unsubscribed - prev.unsub;
    if (dDel > 0) {
      const contact = pickByStatus(["delivered", "replied", "unsub"], dDel - 1);
      if (contact) lines.push({ id: `${c.id}_e${Date.now()}_d`, at: Date.now(), kind: "delivered", text: `livré à ${contact.name}` });
    }
    if (dRep > 0) {
      const contact = pickByStatus(["replied"], dRep - 1);
      if (contact) lines.push({
        id: `${c.id}_e${Date.now()}_r`, at: Date.now(), kind: "reply",
        text: `réponse reçue de ${contact.name.split(" ")[0]}`,
      });
      if (contact && c.stopOnReply) {
        lines.push({
          id: `${c.id}_e${Date.now()}_x`, at: Date.now(), kind: "excluded",
          text: `${contact.name} exclue après réponse (arrêt auto activé)`,
        });
      }
      if (contact && Date.now() - lastReplyToastRef.current > 8000) {
        lastReplyToastRef.current = Date.now();
        toast.info("Nouvelle réponse à la campagne", { description: `${contact.name} — conversation marquée dans l'Inbox` });
      }
    }
    if (dFail > 0) {
      const contact = pickByStatus(["failed"], dFail - 1);
      if (contact) lines.push({
        id: `${c.id}_e${Date.now()}_f`, at: Date.now(), kind: "failed",
        text: `échec ${maskPhone(contact.phone)} (numéro indisponible)`,
      });
    }
    if (dUnsub > 0) {
      const contact = pickByStatus(["unsub"], dUnsub - 1);
      if (contact) lines.push({
        id: `${c.id}_e${Date.now()}_u`, at: Date.now(), kind: "unsub",
        text: `STOP reçu de ${contact.name} — désinscrit et ajouté à la liste d'exclusion`,
      });
    }
    if (lines.length) setEvents((ev) => [...lines.reverse(), ...ev].slice(0, 50));
    prevRef.current = { sent: c.sent, delivered: c.delivered, replies: c.replies, failed: c.failed, unsub: c.unsubscribed };
  }, [c.id, c.sent, c.delivered, c.replies, c.failed, c.unsubscribed, c.stopOnReply, recipients]);

  /* auto-scroll : pause si l'utilisateur scrolle */
  const logRef = useRef<HTMLDivElement>(null);
  const [logPaused, setLogPaused] = useState(false);
  useEffect(() => {
    if (!logPaused && logRef.current) logRef.current.scrollTop = 0;
  }, [events, logPaused]);

  /* ── Série chart (points toutes les 3 s quand en cours) ─────────────── */
  interface ChartPoint { t: string; envois: number; livrés: number; réponses: number }
  const [series, setSeries] = useState<ChartPoint[]>(() => {
    const pts: ChartPoint[] = [];
    const buckets = 10;
    for (let i = buckets; i >= 1; i--) {
      const f = (buckets - i + 1) / buckets;
      pts.push({
        t: timeHM(Date.now() - i * 15 * 60_000),
        envois: Math.round(c.sent * f * 0.12),
        livrés: Math.round(c.delivered * f * 0.1),
        réponses: Math.round(c.replies * f * 0.15),
      });
    }
    return pts;
  });
  const chartSeed = useRef({ sent: c.sent, delivered: c.delivered, replies: c.replies });
  useEffect(() => {
    if (c.status !== "running") return;
    const t = setInterval(() => {
      setSeries((prev) => {
        const dS = Math.max(0, c.sent - chartSeed.current.sent);
        const dD = Math.max(0, c.delivered - chartSeed.current.delivered);
        const dR = Math.max(0, c.replies - chartSeed.current.replies);
        chartSeed.current = { sent: c.sent, delivered: c.delivered, replies: c.replies };
        return [...prev.slice(1), { t: timeHM(Date.now()), envois: dS + Math.round(c.ratePerMin / 3), livrés: dD + Math.round(c.ratePerMin / 4), réponses: dR }];
      });
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.status, c.sent, c.delivered, c.replies]);

  /* ── Export CSV réel ─────────────────────────────────────────────────── */
  const exportCsv = () => {
    const head = "contact;telephone;statut;heure;reponse\n";
    const body = recipients
      .map((r) => `"${r.name}";"${r.phone}";"${ROW_STATUS_META[r.status].label}";"${r.at ? timeHMS(r.at) : ""}";"${r.reply ?? ""}"`)
      .join("\n");
    const blob = new Blob([`\uFEFF${head}${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-${c.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Rapport exporté", { description: `${recipients.length} destinataires · CSV téléchargé` });
  };

  /* ── Relance des sans-réponse (campagne terminée) ────────────────────── */
  const [relance, setRelance] = useState<number | null>(null);
  const relaunch = () => {
    const n = Math.max(0, c.delivered - c.replies - c.failed - c.unsubscribed);
    setRelance(n);
    setEvents((ev) =>
      [
        {
          id: `${c.id}_relance_${Date.now()}`, at: Date.now(), kind: "sent" as const,
          text: `relance programmée : ${fmt(n)} contact(s) sans réponse seront recontactés dans 48 h`,
        },
        ...ev,
      ].slice(0, 50),
    );
    toast.success("Relance programmée", {
      description: `${fmt(n)} contacts sans réponse seront relancés dans 48 h — répondants et désinscrits exclus.`,
    });
  };

  /* ── Filtres table ───────────────────────────────────────────────────── */
  const [filter, setFilter] = useState<RowStatus | "all">("all");
  const [query, setQuery] = useState("");
  const statusCounts = useMemo(() => {
    const m = new Map<RowStatus, number>();
    for (const r of recipients) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [recipients]);
  const rows = recipients.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      (!query.trim() || r.name.toLowerCase().includes(query.toLowerCase()) || r.phone.includes(query)),
  );

  const mainSession = sessions[0];
  const sessionDown = mainSession?.status === "disconnected";
  const sessionUnstable = mainSession?.status === "unstable";

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 flex-1 rounded-r-md" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-[7fr_5fr]">
          <Skeleton className="h-72 rounded-r-md" />
          <Skeleton className="h-72 rounded-r-md" />
        </div>
      </div>
    );
  }

  /* Empty : planifiée, brouillon ou en attente de validation sans envois */
  if ((c.status === "scheduled" || c.status === "draft" || c.status === "review") && c.sent === 0) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-[13px] text-mid transition-colors hover:text-hi">
          <ArrowLeft className="size-4 rtl:-scale-x-100" /> Toutes les campagnes
        </button>
        <div className="flex flex-col items-center rounded-r-lg border border-line bg-surface-1 px-6 py-16 text-center">
          <motion.img
            src="/empty-orbit.svg" alt="" width={180} height={135}
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <h3 className="mt-5 font-display text-[20px] font-semibold text-hi">{c.name}</h3>
          <div className="mt-2"><StatusChip status={c.status} /></div>
          <p className="mt-3 max-w-[46ch] text-[14px] text-mid">
            {c.status === "review"
              ? "Validation à quatre yeux en cours — un superviseur doit approuver le lancement. Le suivi démarrera au premier envoi."
              : "Le suivi apparaîtra au premier envoi — compteurs, funnel, flux d'événements et destinataires en temps réel."}
          </p>
          {c.scheduledAt && (
            <div className="mt-6">
              <p className="label-micro text-low">Premier envoi dans</p>
              <div className="mt-2"><Countdown target={c.scheduledAt} /></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* S1 — En-tête */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour à la liste"
          className="flex size-9 items-center justify-center rounded-full border border-line text-mid transition-colors hover:bg-surface-2 hover:text-hi"
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="truncate font-display text-[24px] leading-[30px] font-semibold text-hi">{c.name}</h2>
            <StatusChip status={c.status} />
            {/* Liste d'exclusion (STOP) — compteur en haut */}
            {c.unsubscribed > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-rose/10 px-2.5 py-1 label-micro text-rose"
                title="Contacts désinscrits via STOP — exclus de tous les prochains envois"
              >
                <UserMinus className="size-3" /> Liste d'exclusion · <TickNumber value={c.unsubscribed} />
              </span>
            )}
            {c.stopOnReply && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-amber/10 px-2.5 py-1 label-micro text-amber"
                title="Les répondants sont exclus automatiquement de la campagne"
              >
                <CircleStop className="size-3" /> Arrêt après réponse
              </span>
            )}
            {relance !== null && (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-2.5 py-1 label-micro text-mint"
              >
                <BellRing className="size-3" /> Relance 48 h · <TickNumber value={relance} /> contacts
              </motion.span>
            )}
          </div>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-low tabular">
            {c.audience} · démarrée à {timeHM(startAt)} · {c.ratePerMin} msg/min
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {live && (
            <button
              type="button"
              onClick={() => onPauseToggle(c)}
              className={cn(
                "inline-flex items-center gap-2 rounded-r-sm border px-3.5 py-2 text-[13px] font-medium transition-colors",
                c.status === "running"
                  ? "border-line text-mid hover:border-amber/50 hover:text-amber"
                  : "border-amber/40 bg-amber/10 text-amber hover:bg-amber/20",
              )}
            >
              {c.status === "running" ? <><Pause className="size-3.5" /> Pause</> : <><Play className="size-3.5" /> Reprendre</>}
            </button>
          )}
          {live && (
            <button
              type="button"
              onClick={() => onStop(c)}
              className="inline-flex items-center gap-2 rounded-r-sm border border-rose/40 bg-rose/10 px-3.5 py-2 text-[13px] font-medium text-rose transition-colors hover:bg-rose/20"
            >
              <OctagonX className="size-3.5" /> Arrêt d'urgence
            </button>
          )}
          {(c.status === "done" || c.status === "stopped") && c.followUpOn && relance === null && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={relaunch}
              className="inline-flex items-center gap-2 rounded-r-sm border border-amber/40 bg-amber/10 px-3.5 py-2 text-[13px] font-medium text-amber transition-colors hover:bg-amber/20"
            >
              <BellRing className="size-3.5" /> Relancer les sans-réponse
            </motion.button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-r-sm border border-line bg-surface-1 px-3.5 py-2 text-[13px] font-medium text-mid transition-colors hover:bg-surface-2 hover:text-hi"
          >
            <Download className="size-3.5" /> Rapport
          </button>
        </div>
      </div>

      {/* Bandeaux session */}
      <AnimatePresence>
        {(sessionDown || sessionUnstable) && live && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={cn(
              "mt-4 flex items-center gap-2.5 rounded-r-md border p-3.5 text-[13px]",
              sessionDown ? "border-rose/40 bg-rose/10 text-rose" : "border-amber/40 bg-amber/10 text-amber",
            )}
            role="alert"
          >
            <AlertTriangle className="size-4 shrink-0" />
            {sessionDown
              ? "Envois suspendus — session « Boutique Principale » déconnectée. Reconnectez-la puis reprenez la campagne."
              : "Session instable — la cadence peut être réduite temporairement."}
          </motion.div>
        )}
      </AnimatePresence>

      {/* S2 — Funnel live */}
      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-stretch md:gap-2">
        <FunnelStep index={0} label="Éligibles" value={c.total} tone="hi" icon={<Clock className="size-3" />} />
        <SignalConnector />
        <FunnelStep index={1} label="Envoyés" value={c.sent} sub={pct(c.sent, c.total)} tone="hi" icon={<Send className="size-3" />} />
        <SignalConnector />
        <FunnelStep index={2} label="Livrés" value={c.delivered} sub={pct(c.delivered, c.sent)} tone="pulse" icon={<CheckCheck className="size-3" />} />
        <SignalConnector />
        <FunnelStep index={3} label="Réponses" value={c.replies} sub={pct(c.replies, c.delivered)} tone="mint" icon={<Reply className="size-3" />} />
        <SignalConnector />
        <FunnelStep index={4} label="Désinscrits" value={c.unsubscribed} tone="rose" icon={<UserMinus className="size-3" />} />
      </div>

      {/* S3 — Graphique + flux */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[7fr_5fr]">
        <div className="rounded-r-md border border-line bg-surface-1 p-4">
          <div className="flex items-center justify-between">
            <p className="label-micro text-low">Envois / livrés / réponses · 15 min</p>
            {c.status === "running" && (
              <span className="flex items-center gap-1.5 label-micro text-mint"><StatusDot tone="mint" size={6} /> live</span>
            )}
          </div>
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gEnvois" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF5A4E" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#FF5A4E" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gLivres" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF9F2E" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#FF9F2E" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gReponses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0DBA9B" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#0DBA9B" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,190,150,.08)" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: "var(--text-low)", fontSize: 10, fontFamily: "IBM Plex Mono" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "var(--text-low)", fontSize: 10, fontFamily: "IBM Plex Mono" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-3)", border: "1px solid var(--line)",
                    borderRadius: 10, fontSize: 12, color: "var(--text-hi)",
                  }}
                  labelStyle={{ color: "var(--text-low)", fontFamily: "IBM Plex Mono", fontSize: 10 }}
                />
                <Area type="monotone" dataKey="envois" stroke="#FF5A4E" strokeWidth={2} fill="url(#gEnvois)" stackId="1" animationDuration={600} />
                <Area type="monotone" dataKey="livrés" stroke="#FF9F2E" strokeWidth={2} fill="url(#gLivres)" stackId="1" animationDuration={600} />
                <Area type="monotone" dataKey="réponses" stroke="#0DBA9B" strokeWidth={2} fill="url(#gReponses)" stackId="1" animationDuration={600} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Flux d'événements */}
        <div className="flex flex-col rounded-r-md border border-line bg-surface-1 p-4">
          <div className="flex items-center justify-between">
            <p className="label-micro text-low">Flux d'événements</p>
            {logPaused ? (
              <button
                type="button"
                onClick={() => setLogPaused(false)}
                className="inline-flex items-center gap-1.5 rounded-full bg-pulse/10 px-2.5 py-1 label-micro text-pulse transition-colors hover:bg-pulse/20"
              >
                <ArrowDownToLine className="size-3" /> Revenir au direct
              </button>
            ) : (
              c.status === "running" && <span className="flex items-center gap-1.5 label-micro text-mint"><StatusDot tone="mint" size={6} /> direct</span>
            )}
          </div>
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Événements de la campagne en temps réel"
            onScroll={(e) => setLogPaused((e.target as HTMLDivElement).scrollTop > 40)}
            className="mt-3 h-[260px] space-y-1 overflow-y-auto pe-1"
          >
            <AnimatePresence initial={false}>
              {events.map((ev) => (
                <motion.p
                  key={ev.id}
                  layout="position"
                  initial={{ opacity: 0, y: -12, backgroundColor: "rgba(255,159,46,.10)" }}
                  animate={{ opacity: 1, y: 0, backgroundColor: "rgba(255,159,46,0)" }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="flex items-center gap-2 rounded-r-sm px-2 py-1.5 font-mono text-[11px] leading-[16px]"
                >
                  <span className="text-low tabular">{timeHMS(ev.at)}</span>
                  {ev.kind === "delivered" && <CheckCheck className="size-3 shrink-0 text-mint" />}
                  {ev.kind === "reply" && <Reply className="size-3 shrink-0 text-pulse" />}
                  {ev.kind === "failed" && <AlertTriangle className="size-3 shrink-0 text-rose" />}
                  {ev.kind === "unsub" && <UserMinus className="size-3 shrink-0 text-rose" />}
                  {ev.kind === "excluded" && <CircleStop className="size-3 shrink-0 text-amber" />}
                  {ev.kind === "sent" && <Send className="size-3 shrink-0 text-mid" />}
                  <span className="truncate text-mid">{ev.text}</span>
                </motion.p>
              ))}
            </AnimatePresence>
            {events.length === 0 && (
              <p className="px-2 py-6 text-center text-[12px] text-low">Les événements apparaîtront ici au premier envoi.</p>
            )}
          </div>
        </div>
      </div>

      {/* S4 — Destinataires */}
      <div className="mt-4 rounded-r-md border border-line bg-surface-1">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <p className="label-micro text-low">Destinataires</p>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-mid tabular">{fmt(recipients.length)}</span>
          <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] transition-colors",
                filter === "all" ? "bg-iris/15 text-iris" : "text-low hover:text-mid",
              )}
            >
              Tous · {recipients.length}
            </button>
            {(Object.keys(ROW_STATUS_META) as RowStatus[]).map((st) => {
              const n = statusCounts.get(st) ?? 0;
              if (!n) return null;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilter(st)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] transition-colors",
                    filter === st ? "bg-iris/15 text-iris" : "text-low hover:text-mid",
                  )}
                >
                  {ROW_STATUS_META[st].label} · {n}
                </button>
              );
            })}
          </div>
          <span className="flex-1" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher un destinataire"
            className="h-8 w-44 rounded-r-sm border border-line bg-surface-2 px-3 text-[12px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
          />
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="border-b border-line text-start">
                <th className="px-4 py-2.5 text-start label-micro text-low">Contact</th>
                <th className="px-4 py-2.5 text-start label-micro text-low">Statut</th>
                <th className="px-4 py-2.5 text-start label-micro text-low">Heure</th>
                <th className="hidden px-4 py-2.5 text-start label-micro text-low md:table-cell">Réponse</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 120).map((r) => (
                <tr key={r.id} className="border-b border-line/50 transition-colors hover:bg-surface-2/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[9px] font-bold text-mid">
                        {r.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-hi">{r.name}</span>
                        <span className="block font-mono text-[10px] text-low tabular">{r.phone}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", ROW_STATUS_META[r.status].cls)}>
                        {ROW_STATUS_META[r.status].label}
                      </span>
                      {r.status === "replied" && c.stopOnReply && (
                        <span
                          className="rounded-full bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber"
                          title="Arrêt après réponse actif — ce contact ne recevra plus rien"
                        >
                          Exclue après réponse
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-mid tabular">{r.at ? timeHMS(r.at) : "—"}</td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    {r.reply ? (
                      <button
                        type="button"
                        onClick={() => navigate("/app/inbox")}
                        className="max-w-[220px] truncate text-pulse hover:underline"
                        title="Ouvrir dans l'Inbox"
                      >
                        « {r.reply} »
                      </button>
                    ) : (
                      <span className="text-low">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-low">Aucun destinataire pour ce filtre.</p>
          )}
          {rows.length > 120 && (
            <p className="px-4 py-3 text-center font-mono text-[11px] text-low">+ {fmt(rows.length - 120)} autres destinataires</p>
          )}
        </div>
      </div>
    </div>
  );
}
