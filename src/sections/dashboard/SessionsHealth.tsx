/**
 * SessionsHealth — santé des sessions QR (dashboard.md S4b).
 * 3 lignes : avatar-orbe teinté statut + nom + numéro masqué + StatusDot +
 * état + latence mono qui tique (2s) + uptime 30j + bouton contextuel.
 * Clic ligne → drawer détail (appareil, batterie, bridge, historique 24 h en
 * mini-barres). Reconnecter → modale QR ; passage Déconnectée→Connectée :
 * onde mint + toast. Session « Instable » : latence scintillante amber.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BatteryMedium, ChevronRight, History, RefreshCw, Smartphone } from "lucide-react";
import { useNavigate } from "react-router";
import { Drawer, StatusDot, TickNumber } from "@/components/ui-shared";
import type { QrSession } from "@/lib/sim/store";
import { Card, EASE, MiniCore } from "./shared";
import { cn } from "@/lib/utils";

/* ── Données d'enrichissement déterministes par session ────────────────── */
const DEVICES: Record<string, { device: string; battery: number; bridge: string }> = {
  s_main: { device: "iPhone 15 Pro · iOS 18.4", battery: 82, bridge: "v2.4.1" },
  s_sav: { device: "Galaxy S23 · Android 15", battery: 64, bridge: "v2.4.1" },
  s_events: { device: "Pixel 8 · Android 15", battery: 31, bridge: "v2.3.7" },
  s_new: { device: "iPhone 16 · iOS 18.5", battery: 91, bridge: "v2.4.1" },
};

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Historique 24 h : 24 barres (hauteur = volume, couleur = santé) */
function historyBars(session: QrSession) {
  const h = hash(session.id);
  const bars: { h: number; tone: "mint" | "amber" | "rose" }[] = [];
  for (let i = 0; i < 24; i++) {
    const v = ((h >> (i % 16)) + i * 17) % 100;
    let tone: "mint" | "amber" | "rose" = "mint";
    if (session.status === "disconnected" && i >= 21) tone = "rose";
    else if (session.status === "unstable" && i >= 22) tone = "amber";
    else if (v % 13 === 0) tone = "amber";
    bars.push({ h: 22 + (v % 78), tone });
  }
  return bars;
}

function masked(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `${phone.startsWith("+33") ? "+33" : "+216"} •• •• ${digits.slice(-3)}`;
}

const STATUS_LABEL: Record<QrSession["status"], string> = {
  connected: "Connectée",
  unstable: "Instable",
  disconnected: "Déconnectée",
};
const STATUS_TONE: Record<QrSession["status"], "mint" | "amber" | "rose"> = {
  connected: "mint",
  unstable: "amber",
  disconnected: "rose",
};

/* ── Ligne session ──────────────────────────────────────────────────────── */
function SessionRow({
  session,
  index,
  flash,
  onOpen,
  onReconnect,
}: {
  session: QrSession;
  index: number;
  flash: boolean;
  onOpen: () => void;
  onReconnect: () => void;
}) {
  const tone = STATUS_TONE[session.status];
  const disconnected = session.status === "disconnected";

  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: index * 0.08 }}
      className="relative"
    >
      {/* onde mint quand Déconnectée → Connectée */}
      {flash && (
        <motion.span
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 z-10 rounded-r-md border border-mint/60 bg-mint/10"
          aria-hidden
        />
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="group flex w-full cursor-pointer items-center gap-3 rounded-r-md border border-transparent px-3 py-3 text-start transition-colors hover:border-line hover:bg-surface-2"
      >
        <MiniCore size={36} tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-semibold text-hi">{session.name}</p>
            <StatusDot tone={tone} ping={!disconnected} />
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-low">{masked(session.phone)}</p>
        </div>
        <div className="shrink-0 text-end">
          <p
            className={cn(
              "text-[12px] font-medium",
              tone === "mint" ? "text-mint" : tone === "amber" ? "text-amber" : "text-rose",
            )}
          >
            {STATUS_LABEL[session.status]}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-low">
            {disconnected ? (
              "hors ligne"
            ) : (
              <span className={cn("tabular", session.status === "unstable" && "animate-pulse text-amber")}>
                <TickNumber value={session.latencyMs} /> ms
              </span>
            )}
            <span className="mx-1.5 text-line-strong">·</span>
            <span className="tabular">{session.uptime.toLocaleString("fr-FR")} %</span>
          </p>
        </div>
        {disconnected ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReconnect();
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-r-sm border border-amber/30 bg-amber/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber transition-colors hover:bg-amber/20"
          >
            <RefreshCw className="size-3" />
            Reconnecter
          </button>
        ) : (
          <ChevronRight className="size-4 shrink-0 text-low transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-mid rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
        )}
      </div>
    </motion.li>
  );
}

/* ── Drawer détail session ──────────────────────────────────────────────── */
function SessionDrawer({ session, onClose }: { session: QrSession | null; onClose: () => void }) {
  // Garde la dernière session pendant l'animation de sortie du Drawer
  const [last, setLast] = useState<QrSession | null>(session);
  useEffect(() => {
    if (session) setLast(session);
  }, [session]);
  const bars = useMemo(() => (last ? historyBars(last) : []), [last]);
  if (!last) return null;
  const meta = DEVICES[last.id] ?? DEVICES.s_new;
  const tone = STATUS_TONE[last.status];
  return (
    <Drawer open={!!session} onClose={onClose} title={last.name} width={440}>
      <div className="space-y-5">
        {/* statut */}
        <div className="flex items-center gap-3 rounded-r-md border border-line bg-surface-2/60 p-4">
          <MiniCore size={44} tone={tone} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-hi">{STATUS_LABEL[last.status]}</p>
            <p className="mt-0.5 font-mono text-[11px] text-low">{masked(last.phone)}</p>
          </div>
          <StatusDot tone={tone} />
        </div>

        {/* méta appareil */}
        <div className="space-y-2.5">
          <p className="label-micro text-low">Appareil</p>
          <div className="space-y-2 rounded-r-md border border-line p-3.5 text-[13px]">
            <p className="flex items-center gap-2.5 text-mid">
              <Smartphone className="size-4 text-pulse" /> {meta.device}
            </p>
            <p className="flex items-center gap-2.5 text-mid">
              <BatteryMedium className={cn("size-4", meta.battery > 40 ? "text-mint" : "text-amber")} />
              Batterie <span className="font-mono tabular text-hi">{meta.battery} %</span>
            </p>
            <p className="flex items-center gap-2.5 text-mid">
              <History className="size-4 text-iris" /> Bridge <span className="font-mono text-hi">{meta.bridge}</span>
            </p>
          </div>
        </div>

        {/* historique 24h */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="label-micro text-low">Connexions · 24 h</p>
            <p className="font-mono text-[11px] text-mid tabular">uptime 30 j : {last.uptime.toLocaleString("fr-FR")} %</p>
          </div>
          <div className="flex h-16 items-end gap-[3px] rounded-r-md border border-line p-3" aria-hidden>
            {bars.map((b, i) => (
              <motion.span
                key={i}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.4, delay: i * 0.02, ease: EASE }}
                className={cn(
                  "flex-1 origin-bottom rounded-[2px]",
                  b.tone === "mint" ? "bg-mint/70" : b.tone === "amber" ? "bg-amber/80" : "bg-rose/80",
                )}
                style={{ height: `${b.h}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between font-mono text-[10px] text-low">
            <span>il y a 24 h</span>
            <span>maintenant</span>
          </div>
        </div>

        {/* latence */}
        <div className="rounded-r-md border border-line p-3.5">
          <div className="flex items-center justify-between text-[12px] text-mid">
            <span>Latence bridge</span>
            <span className="font-mono tabular text-hi">
              {last.status === "disconnected" ? "—" : `${last.latencyMs} ms`}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.span
              className={cn(
                "block h-full rounded-full",
                last.status === "unstable" ? "bg-amber animate-pulse" : "gradient-signature",
              )}
              initial={{ width: 0 }}
              animate={{
                width: last.status === "disconnected" ? "0%" : `${Math.min(100, (last.latencyMs / 160) * 100)}%`,
              }}
              transition={{ duration: 0.8, ease: EASE }}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-low">
            <span>42 ms</span>
            <span>seuil 160 ms</span>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

/* ── Carte ──────────────────────────────────────────────────────────────── */
export default function SessionsHealth({
  sessions,
  flashId,
  onReconnect,
  extraSessions = [],
}: {
  sessions: QrSession[];
  /** Session qui vient d'être reconnectée (onde mint) */
  flashId?: string | null;
  onReconnect: (id: string) => void;
  /** Sessions ajoutées localement (modale « Connecter une session ») */
  extraSessions?: QrSession[];
}) {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const all = [...sessions, ...extraSessions];
  const opened = all.find((s) => s.id === openId) ?? null;

  return (
    <Card
      title="Sessions QR"
      linkLabel="Gérer"
      onLink={() => navigate("/app/settings")}
      className="col-span-12 xl:col-span-5"
      bodyClassName="gap-1 p-3"
    >
      <ul className="flex flex-col" aria-label="État des sessions QR">
        {all.map((s, i) => (
          <SessionRow
            key={s.id}
            session={s}
            index={i}
            flash={flashId === s.id}
            onOpen={() => setOpenId(s.id)}
            onReconnect={() => onReconnect(s.id)}
          />
        ))}
      </ul>
      <SessionDrawer session={opened} onClose={() => setOpenId(null)} />
    </Card>
  );
}
