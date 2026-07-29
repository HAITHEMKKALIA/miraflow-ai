/**
 * BridgeQrPanel — flux de connexion WhatsApp RÉEL via le serveur bridge
 * (voir bridge/ à la racine du repo). Aucune simulation :
 *
 *  - Bridge configuré : POST /sessions puis polling 2 s de /sessions/:id/qr.
 *    Le QR affiché est le vrai QR (dataURL PNG) émis par Baileys ; la
 *    timeline (QR généré → Scan détecté → Connecté) suit les statuts réels.
 *    À `connected`, le vrai numéro / pushname est affiché et remonté via
 *    onConnected.
 *  - Bridge NON configuré : état d'information honnête + champ pour coller
 *    l'URL du bridge (persistée dans localStorage["mf:bridge-url"]) + test
 *    de connexion (/health). Aucune fausse connexion n'est simulée.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check, CheckCircle2, Loader2, PlugZap, QrCode, RefreshCw, ServerOff, XCircle,
} from "lucide-react";
import { format } from "date-fns";
import {
  bridgeHealth, createSession, getBridgeUrl, isBridgeConfigured, pollSession, setBridgeUrl,
} from "@/lib/bridge";
import { StatusDot } from "@/components/ui-shared";
import { cn } from "@/lib/utils";

export interface BridgeConnectedInfo {
  phone?: string;
  pushname?: string;
}

type Phase = "starting" | "qr" | "connecting" | "connected" | "unreachable" | "disconnected";

const QR_TTL = 20; // un QR WhatsApp Web est renouvelé ~toutes les 20 s

/* ── Champ URL du bridge + test de connexion (réutilisé dans Paramètres) ── */
export function BridgeUrlField({ onSaved }: { onSaved?: (url: string) => void }) {
  const [url, setUrl] = useState(getBridgeUrl());
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<"ok" | "ko" | null>(null);

  const save = (v: string) => {
    setUrl(v);
    setResult(null);
  };

  const test = async () => {
    setBridgeUrl(url);
    onSaved?.(url);
    if (!url.trim()) {
      setResult(null);
      return;
    }
    setTesting(true);
    const ok = await bridgeHealth();
    setTesting(false);
    setResult(ok ? "ok" : "ko");
  };

  return (
    <div className="w-full">
      <div className="flex items-stretch gap-2">
        <input
          value={url}
          onChange={(e) => save(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && test()}
          placeholder="https://bridge.mondomaine.com"
          dir="ltr"
          inputMode="url"
          className="min-w-0 flex-1 rounded-r-sm border border-line bg-surface-2 px-3 py-2 font-mono text-[12.5px] text-hi placeholder:text-low transition-colors focus:border-iris focus:outline-none"
          aria-label="URL du serveur bridge"
        />
        <button
          type="button"
          onClick={test}
          disabled={testing}
          className="flex shrink-0 items-center gap-1.5 rounded-r-sm gradient-signature px-3 py-2 text-[12.5px] font-semibold text-white transition-all hover:brightness-110 active:scale-[.97] disabled:opacity-60"
        >
          {testing ? <Loader2 className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />}
          Tester
        </button>
      </div>
      <AnimatePresence>
        {result && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn("mt-2 flex items-center gap-1.5 text-[12px]", result === "ok" ? "text-mint" : "text-rose")}
            role="status"
          >
            {result === "ok" ? (
              <>
                <CheckCircle2 className="size-3.5" /> Connexion réussie — le bridge répond.
              </>
            ) : (
              <>
                <XCircle className="size-3.5" /> Bridge injoignable — vérifiez l'URL et que le serveur tourne.
              </>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── État « bridge requis » (aucune simulation de secours) ─────────────── */
function BridgeRequired({ onConfigured }: { onConfigured: () => void }) {
  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-r-md border border-line bg-surface-2/50 p-5 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-amber/10 text-amber">
        <ServerOff className="size-5" />
      </span>
      <div>
        <p className="text-[14px] font-semibold text-hi">Serveur bridge requis</p>
        <p className="mt-1.5 max-w-[380px] text-[12.5px] leading-[19px] text-mid">
          La connexion WhatsApp réelle nécessite le serveur bridge MiraFlow (Baileys).
          Déployez-le — guide pas à pas dans <code className="rounded bg-surface-3 px-1 font-mono text-[11.5px]">bridge/README.md</code> —
          puis renseignez son URL ici ou dans Paramètres → Sessions.
        </p>
      </div>
      <BridgeUrlField onSaved={() => { if (isBridgeConfigured()) onConfigured(); }} />
    </div>
  );
}

/* ── Timeline réelle ───────────────────────────────────────────────────── */
const STEPS = [
  { id: "qr", label: "QR généré", tone: "iris" },
  { id: "connecting", label: "Scan détecté", tone: "amber" },
  { id: "connected", label: "Session connectée", tone: "mint" },
] as const;

function Timeline({ phase, marks }: { phase: Phase; marks: Record<string, number> }) {
  const activeIdx =
    phase === "connected" ? 2 : phase === "connecting" ? 1 : phase === "qr" ? 0 : -1;
  return (
    <ol className="relative w-full space-y-3 border-s border-line ps-5" aria-label="Étapes de connexion">
      {STEPS.map((t, i) => {
        const done = i < activeIdx || phase === "connected";
        const active = i === activeIdx && phase !== "connected";
        const at = marks[t.id];
        return (
          <li key={t.id} className="relative flex items-center gap-3">
            <span className="absolute -start-[26.5px] flex items-center justify-center bg-surface-1">
              {done ? (
                <span className="flex size-[13px] items-center justify-center rounded-full bg-mint/20">
                  <Check className="size-2.5 text-mint" strokeWidth={3.5} />
                </span>
              ) : active ? (
                <StatusDot tone={t.tone} size={9} />
              ) : (
                <StatusDot tone="low" size={9} ping={false} />
              )}
            </span>
            <span className={cn("text-[13px] font-medium", done ? "text-mid" : active ? "text-hi" : "text-low")}>
              {t.label}
            </span>
            {at && (done || active) && (
              <span className="font-mono text-[11px] tabular text-low" dir="ltr">
                {format(at, "HH:mm:ss")}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Panneau principal ─────────────────────────────────────────────────── */
export default function BridgeQrPanel({
  sessionId,
  onConnected,
  showTimeline = true,
}: {
  /** Identifiant de session envoyé au bridge (stable pendant le flux). */
  sessionId: string;
  /** Appelé une fois à la connexion réelle, avec le vrai numéro / pushname. */
  onConnected?: (info: BridgeConnectedInfo) => void;
  showTimeline?: boolean;
}) {
  const [configured, setConfigured] = useState(isBridgeConfigured());
  const [phase, setPhase] = useState<Phase>("starting");
  const [qr, setQr] = useState<string | null>(null);
  const [info, setInfo] = useState<BridgeConnectedInfo>({});
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [qrAge, setQrAge] = useState(0); // secondes depuis le dernier QR reçu
  const [runId, setRunId] = useState(0);
  const notified = useRef(false);
  const lastQrAt = useRef(0);

  /* Flux réel : createSession + polling 2 s */
  useEffect(() => {
    if (!configured) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    notified.current = false;
    setPhase("starting");
    setQr(null);
    setMarks({});

    const mark = (k: string) => setMarks((m) => (m[k] ? m : { ...m, [k]: Date.now() }));

    const tick = async () => {
      if (stopped) return;
      const s = await pollSession(sessionId);
      if (stopped) return;
      if (!s) {
        setPhase((p) => (p === "connected" ? p : "unreachable"));
        return;
      }
      if (s.status === "qr_pending") {
        if (s.qr) {
          setQr((prev) => {
            if (prev !== s.qr) lastQrAt.current = Date.now();
            return s.qr ?? prev;
          });
        }
        setPhase("qr");
        mark("qr");
      } else if (s.status === "connecting") {
        setPhase("connecting");
        mark("connecting");
      } else if (s.status === "connected") {
        setPhase("connected");
        mark("connected");
        const data = { phone: s.phone, pushname: s.pushname };
        setInfo(data);
        if (!notified.current) {
          notified.current = true;
          onConnected?.(data);
        }
        if (timer) clearInterval(timer);
      } else {
        setPhase((p) => (p === "starting" || p === "unreachable" ? p : "disconnected"));
      }
    };

    void (async () => {
      const created = await createSession(sessionId);
      if (stopped) return;
      if (!created) {
        setPhase("unreachable");
        return;
      }
      await tick();
      timer = setInterval(tick, 2_000);
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, sessionId, runId]);

  /* compteur d'âge du QR (1 s) — un nouveau code est émis automatiquement */
  useEffect(() => {
    if (phase !== "qr") return;
    const t = setInterval(() => {
      setQrAge(lastQrAt.current ? Math.max(0, Math.round((Date.now() - lastQrAt.current) / 1000)) : 0);
    }, 1_000);
    return () => clearInterval(t);
  }, [phase]);

  const retry = () => setRunId((r) => r + 1);

  if (!configured) {
    return <BridgeRequired onConfigured={() => setConfigured(true)} />;
  }

  const qrRemaining = Math.max(0, QR_TTL - qrAge);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* Zone QR */}
      <div
        className={cn(
          "relative flex size-[208px] items-center justify-center overflow-hidden rounded-r-md border border-line bg-white p-2 transition-opacity",
          phase === "connected" && "opacity-30",
        )}
      >
        {phase === "qr" && qr ? (
          <motion.img
            key={qr.slice(-32)}
            src={qr}
            alt="QR code WhatsApp réel — à scanner avec l'application"
            className="size-full object-contain"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          />
        ) : phase === "unreachable" ? (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <ServerOff className="size-7 text-rose" />
            <p className="text-[12px] leading-[17px] text-mid">Bridge injoignable</p>
          </div>
        ) : phase === "disconnected" ? (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <XCircle className="size-7 text-rose" />
            <p className="text-[12px] leading-[17px] text-mid">Session déconnectée par le bridge</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-mid">
            {phase === "connected" ? (
              <Check className="size-8 text-mint" />
            ) : (
              <Loader2 className="size-7 animate-spin text-pulse" />
            )}
          </div>
        )}

        {/* overlay connexion établie */}
        <AnimatePresence>
          {phase === "connected" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-1/85 backdrop-blur-sm"
            >
              <motion.span
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22 }}
                className="flex size-12 items-center justify-center rounded-full bg-mint/15 text-mint shadow-glow-mint"
              >
                <Check className="size-6" />
              </motion.span>
              <p className="label-micro text-mint">Session connectée</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Label d'état */}
      <div className="min-h-[40px] text-center" aria-live="polite">
        {phase === "starting" && (
          <p className="flex items-center gap-2 text-[13px] text-mid">
            <Loader2 className="size-3.5 animate-spin text-pulse" /> Contact du serveur bridge…
          </p>
        )}
        {phase === "qr" && (
          <>
            <p className="text-[13px] text-mid">
              Ouvrez WhatsApp → <span className="text-hi">Appareils connectés</span> → scannez ce code.
            </p>
            <p className="label-micro mt-1 text-low">
              Code valide encore ~<span className="tabular text-pulse">{qrRemaining} s</span> — renouvelé automatiquement
            </p>
          </>
        )}
        {phase === "connecting" && (
          <p className="flex items-center gap-2 text-[13px] text-mid">
            <Loader2 className="size-3.5 animate-spin text-pulse" /> Scan détecté — établissement de la session…
          </p>
        )}
        {phase === "connected" && (
          <>
            <p className="text-[13px] font-semibold text-mint">Session connectée</p>
            <p className="mt-0.5 font-mono text-[12px] text-mid" dir="ltr">
              {info.pushname ? `${info.pushname} · ` : ""}{info.phone ? `+${info.phone}` : "numéro en cours de récupération…"}
            </p>
          </>
        )}
        {(phase === "unreachable" || phase === "disconnected") && (
          <button
            type="button"
            onClick={retry}
            className="flex items-center gap-1.5 rounded-r-sm border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-hi transition-colors hover:border-line-strong"
          >
            <RefreshCw className="size-3.5" /> Réessayer
          </button>
        )}
      </div>

      {showTimeline && phase !== "starting" && (
        <div className="w-full max-w-[300px]">
          <Timeline phase={phase} marks={marks} />
        </div>
      )}

      {phase !== "connected" && (
        <p className="flex items-center gap-1.5 text-[11px] text-low">
          <QrCode className="size-3" />
          Flux réel via le bridge — aucune simulation.
        </p>
      )}
    </div>
  );
}
