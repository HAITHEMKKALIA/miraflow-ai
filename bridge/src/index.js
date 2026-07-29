/**
 * MiraFlow Bridge — micro-service de connexion WhatsApp réelle via Baileys.
 *
 * Endpoints REST :
 *   POST /sessions            { sessionId }        → { status: "qr_pending" }
 *   GET  /sessions/:id/qr     → { status, qr?, phone? }        (qr = dataURL PNG)
 *   GET  /sessions/:id/status → { status, phone?, pushname? }
 *   POST /sessions/:id/logout → { status: "disconnected" }
 *   GET  /health              → { ok: true }
 *
 * Statuts : qr_pending | connecting | connected | disconnected
 * Auth state persisté dans ./auth/<sessionId> (useMultiFileAuthState).
 */
import express from "express";
import cors from "cors";
import pino from "pino";
import QRCode from "qrcode";
import fs from "node:fs/promises";
import path from "node:path";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

const PORT = Number(process.env.PORT || 3100);
const AUTH_DIR = process.env.AUTH_DIR || path.resolve("./auth");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

/** @typedef {"qr_pending"|"connecting"|"connected"|"disconnected"} Status */

/**
 * sessions en mémoire :
 * Map<sessionId, { status, qr?, phone?, pushname?, sock?, retryCount, starting? }>
 */
const sessions = new Map();

function getEntry(id) {
  if (!sessions.has(id)) {
    sessions.set(id, { status: "disconnected", qr: undefined, phone: undefined, pushname: undefined, sock: undefined, retryCount: 0 });
  }
  return sessions.get(id);
}

async function startSession(sessionId) {
  const entry = getEntry(sessionId);
  if (entry.sock && (entry.status === "connected" || entry.status === "connecting" || entry.status === "qr_pending")) {
    return entry;
  }
  entry.status = "connecting";
  entry.qr = undefined;

  const { state, saveCreds } = await useMultiFileAuthState(path.join(AUTH_DIR, sessionId));
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: ["MiraFlow Bridge", "Chrome", "1.0.0"],
  });
  entry.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        entry.qr = await QRCode.toDataURL(qr, { margin: 2, width: 320 });
        entry.status = "qr_pending";
        logger.info({ sessionId }, "QR généré");
      } catch (err) {
        logger.error({ sessionId, err }, "échec encodage QR");
      }
    }

    if (connection === "open") {
      entry.status = "connected";
      entry.qr = undefined;
      entry.retryCount = 0;
      const jid = sock.user?.id ?? "";
      entry.phone = jid.split("@")[0].split(":")[0] || undefined;
      entry.pushname = sock.user?.name || undefined;
      logger.info({ sessionId, phone: entry.phone }, "session connectée");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      entry.status = "disconnected";
      entry.qr = undefined;
      entry.sock = undefined;

      if (loggedOut) {
        logger.warn({ sessionId }, "déconnexion définitive (logged out) — auth supprimé");
        await fs.rm(path.join(AUTH_DIR, sessionId), { recursive: true, force: true }).catch(() => {});
      } else {
        // reconnexion automatique avec backoff exponentiel (max 60 s)
        entry.retryCount += 1;
        const delay = Math.min(60_000, 2_000 * 2 ** Math.min(entry.retryCount, 5));
        logger.info({ sessionId, delay, code }, "connexion fermée — reconnexion planifiée");
        setTimeout(() => {
          const cur = sessions.get(sessionId);
          if (cur && cur.status === "disconnected" && !cur.sock) {
            startSession(sessionId).catch((err) => logger.error({ sessionId, err }, "échec reconnexion"));
          }
        }, delay).unref();
      }
    }
  });

  return entry;
}

const app = express();
app.use(cors()); // le frontend est servi depuis un autre domaine
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/sessions", async (req, res) => {
  const { sessionId } = req.body ?? {};
  if (!sessionId || typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(sessionId)) {
    return res.status(400).json({ error: "sessionId invalide (a-z, 0-9, -, _, 64 car. max)" });
  }
  try {
    const entry = await startSession(sessionId);
    res.json({ status: entry.status === "connecting" ? "qr_pending" : entry.status });
  } catch (err) {
    logger.error({ sessionId, err }, "échec démarrage session");
    res.status(500).json({ error: "impossible de démarrer la session" });
  }
});

app.get("/sessions/:id/qr", (req, res) => {
  const entry = sessions.get(req.params.id);
  if (!entry) return res.json({ status: "disconnected" });
  res.json({ status: entry.status, qr: entry.qr, phone: entry.phone });
});

app.get("/sessions/:id/status", (req, res) => {
  const entry = sessions.get(req.params.id);
  if (!entry) return res.json({ status: "disconnected" });
  res.json({ status: entry.status, phone: entry.phone, pushname: entry.pushname });
});

app.post("/sessions/:id/logout", async (req, res) => {
  const entry = sessions.get(req.params.id);
  try {
    if (entry?.sock) {
      await entry.sock.logout().catch(() => {});
      entry.sock.end(undefined);
    }
  } catch (err) {
    logger.warn({ id: req.params.id, err }, "logout partiel");
  }
  sessions.delete(req.params.id);
  await fs.rm(path.join(AUTH_DIR, req.params.id), { recursive: true, force: true }).catch(() => {});
  res.json({ status: "disconnected" });
});

app.listen(PORT, () => {
  logger.info({ port: PORT, authDir: AUTH_DIR }, "MiraFlow Bridge démarré");
});
