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
// Quota multi-tenant (section 20) : 0 = illimité
const MAX_SESSIONS_PER_ORG = Number(process.env.MAX_SESSIONS_PER_ORG || 0);
// Organisation par défaut quand le client n'en précise pas (rétro-compatibilité API)
const DEFAULT_ORG_ID = "default";
const SUPABASE_URL = String(process.env.SUPABASE_URL || "https://yifjcvwhmdycpsvldlzo.supabase.co").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// ============ DIAGNOSTIC DÉMARRAGE ============
setTimeout(async () => {
  logger.warn(
    {
      port: PORT,
      authDir: AUTH_DIR,
      supabaseUrl: SUPABASE_URL,
      hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
      serviceKeyPrefix: SUPABASE_SERVICE_ROLE_KEY ? SUPABASE_SERVICE_ROLE_KEY.slice(0, 10) + "..." : null,
      aiProvider: String(process.env.AI_PROVIDER || (String(process.env.GROQ_API_KEY || "").trim() ? "groq" : "ollama")),
      aiConfigured: String(process.env.GROQ_API_KEY || "").trim().length > 0 || true,
    },
    "[BOOT] MiraFlow Bridge — environnement chargé"
  );
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    logger.error(
      "[BOOT] ⚠️  SUPABASE_SERVICE_ROLE_KEY NON DÉFINIE — les messages ne seront PAS persistés et l'IA NE TRAITERA RIEN. Utilisez set SUPABASE_SERVICE_ROLE_KEY=... avant de démarrer."
    );
  } else {
    const orgId = await findAnyOrgId().catch(() => null);
    if (!orgId) {
      logger.error(
        { supabaseUrl: SUPABASE_URL },
        "[BOOT] ⚠️  Aucune organisation trouvée dans Supabase. Vérifiez la clé, l'URL et la table `organizations`. Les messages ne seront pas persistés."
      );
    } else {
      logger.info({ orgId }, "[BOOT] ✅ Organisation résolue pour persistance runtime");
    }
  }
  const configuredSessions = [];
  try {
    const entries = await fs.readdir(AUTH_DIR).catch(() => []);
    for (const name of entries) {
      try {
        const stat = await fs.stat(path.join(AUTH_DIR, name));
        if (stat.isDirectory()) configuredSessions.push(name);
      } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
  logger.info({ sessions: configuredSessions }, `[BOOT] ${configuredSessions.length} dossier(s) d'autorisation trouvés dans ${AUTH_DIR}`);
}, 500);

/** @typedef {"qr_pending"|"connecting"|"connected"|"disconnected"} Status */

/**
 * sessions en mémoire :
 * Map<sessionId, { status, qr?, phone?, pushname?, sock?, retryCount, events? }>
 */
const sessions = new Map();

const phoneToValidRemoteJid = new Map();
const remoteJidToPhoneCanonical = new Map();

function isValidRemoteJid(jid) {
  const s = String(jid ?? "");
  if (!s) return false;
  if (s.endsWith("@g.us") || s === "status@broadcast") return false;
  if (s.endsWith("@s.whatsapp.net")) return true;
  if (s.endsWith("@lid")) return true;
  return false;
}

function registerJidPhonePairing(jid, phoneDigits) {
  if (!isValidRemoteJid(jid)) return;
  const key = normalizeDigits(phoneDigits);
  if (!key) return;
  phoneToValidRemoteJid.set(key, jid);
  remoteJidToPhoneCanonical.set(String(jid).toLowerCase(), key);
}

function resolveSendJid(phone, preferredRemoteJid) {
  if (preferredRemoteJid && isValidRemoteJid(preferredRemoteJid)) {
    return preferredRemoteJid;
  }
  const key = normalizeDigits(phone);
  if (key) {
    const cached = phoneToValidRemoteJid.get(key);
    if (cached && isValidRemoteJid(cached)) return cached;
  }
  const fallback = toJid(phone);
  return fallback || "";
}

function looksLikeValidPhone(d) {
  if (!d || d.length < 8 || d.length > 13) return false;
  if (!/^[1-9]/.test(d)) return false;
  if (d.startsWith("216") && d.length === 11) return true;
  if (d.startsWith("33") && d.length === 11) return true;
  if (d.startsWith("1") && d.length === 11 && /^1[2-9]/.test(d)) return true;
  if (d.length === 8) return true;
  return d.length >= 9 && d.length <= 13;
}

function extractValidPhoneSegment(digits) {
  if (!digits) return "";
  if (looksLikeValidPhone(digits)) return digits;

  const candidates = [];
  const len = digits.length;

  for (let start = 0; start < len; start++) {
    for (let end = start + 8; end <= Math.min(start + 13, len); end++) {
      const seg = digits.slice(start, end);
      if (looksLikeValidPhone(seg)) candidates.push({ seg, start, end });
    }
  }

  if (candidates.length === 0) {
    if (digits.length > 13) {
      if (digits.startsWith("216")) return digits.slice(0, 11);
      if (digits.startsWith("33")) return digits.slice(0, 11);
      if (digits.startsWith("1") && /^1[2-9]/.test(digits)) return digits.slice(0, 11);
    }
    if (digits.length === 8) return `216${digits}`;
    return "";
  }

  candidates.sort((a, b) => {
    const aScore = (a.seg.startsWith("216") ? 100 : 0) + (a.seg.startsWith("33") ? 90 : 0) + (a.seg.startsWith("1") && a.seg.length === 11 ? 80 : 0) + (a.seg.length === 11 ? 30 : a.seg.length);
    const bScore = (b.seg.startsWith("216") ? 100 : 0) + (b.seg.startsWith("33") ? 90 : 0) + (b.seg.startsWith("1") && b.seg.length === 11 ? 80 : 0) + (b.seg.length === 11 ? 30 : b.seg.length);
    if (bScore !== aScore) return bScore - aScore;
    return b.start - a.start;
  });

  return candidates[0].seg;
}

function normalizeDigits(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.length > 11) {
    if (digits.startsWith("216216")) digits = digits.slice(3);
    else if (digits.startsWith("3333")) digits = digits.slice(2);
    else if (/^11[2-9]/.test(digits)) digits = digits.slice(1);
  }

  const extracted = extractValidPhoneSegment(digits);
  if (extracted) {
    if (extracted.length === 8) return `216${extracted}`;
    return extracted;
  }

  if (digits.length === 8) return `216${digits}`;
  return digits;
}

function toJid(raw) {
  const digits = normalizeDigits(raw);
  return digits ? `${digits}@s.whatsapp.net` : "";
}

function formatPhone(raw) {
  const digits = normalizeDigits(raw);
  return digits ? `+${digits}` : "";
}

function jidToPhone(raw) {
  // BUG FIX #1: Vérifier d'abord le cache des pairings JID↔Phone (essentiel pour @lid)
  const rawLower = String(raw ?? "").toLowerCase();
  const cached = remoteJidToPhoneCanonical.get(rawLower);
  if (cached) return cached;

  const beforeAt = String(raw ?? "").split("@")[0];
  if (!beforeAt) return "";

  const segments = beforeAt.split(/[:\\-_.]/);
  for (const seg of segments) {
    const digits = String(seg).replace(/\D/g, "");
    if (looksLikeValidPhone(digits)) {
      if (digits.length === 8) return `216${digits}`;
      return digits;
    }
  }

  const fallback = normalizeDigits(segments[0] ?? beforeAt);
  if (fallback) return fallback;

  const allDigits = beforeAt.replace(/\D/g, "");
  const extracted = extractValidPhoneSegment(allDigits);
  if (extracted) {
    return extracted.length === 8 ? `216${extracted}` : extracted;
  }
  return "";
}

/**
 * jidToPhoneWithFallback : résout phone depuis un JID même pour @lid inconnus.
 * Stratégie : cache → parsing classique → lookup DB par remote_jid.
 */
async function jidToPhoneWithFallback(rawJid) {
  const fromCache = jidToPhone(rawJid);
  if (fromCache) return fromCache;

  const jidLower = String(rawJid ?? "").toLowerCase();
  if (!jidLower || !jidLower.includes("@")) return "";

  // Si c'est un @lid non résolu par parsing, tenter un contact déjà persisté
  if (jidLower.endsWith("@lid") && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const orgId = await findAnyOrgId();
      if (orgId) {
        const rows = await supabaseRest(
          `/contacts?org_id=eq.${orgId}&remote_jid=eq.${encodeURIComponent(jidLower)}&select=id,phone&limit=1`
        ).catch(() => []);
        if (Array.isArray(rows) && rows[0]?.phone) {
          const digits = normalizeDigits(rows[0].phone);
          if (digits) {
            // Remplir le cache pour les prochaines fois
            remoteJidToPhoneCanonical.set(jidLower, digits);
            phoneToValidRemoteJid.set(digits, String(rawJid ?? ""));
            return digits;
          }
        }
      }
    } catch (_) { /* ignore DB errors here */ }
  }
  return "";
}

function toMs(value) {
  const n = Number(value ?? Date.now());
  if (!Number.isFinite(n)) return Date.now();
  return n < 1_000_000_000_000 ? n * 1000 : n;
}

function getMessageText(message) {
  if (!message) return "";
  return String(
    message.conversation
    ?? message.extendedTextMessage?.text
    ?? message.imageMessage?.caption
    ?? message.videoMessage?.caption
    ?? message.documentMessage?.caption
    ?? message.buttonsResponseMessage?.selectedDisplayText
    ?? message.listResponseMessage?.title
    ?? message.templateButtonReplyMessage?.selectedDisplayText
    ?? "",
  ).trim();
}

function pushEvent(sessionId, event) {
  if (!sessionId || !event?.id) return;
  const entry = getEntry(sessionId);
  const list = Array.isArray(entry.events) ? entry.events : [];
  if (list.some((item) => String(item?.id ?? "") === String(event.id))) return;
  // BUG FIX #7: receivedAt monotone (Date.now()) + fallback sur l'horodatage original WhatsApp (at)
  // Évite de rater des messages dont le timestamp WhatsApp est dans le passé (appareil offline, etc.)
  const now = Date.now();
  const origAt = Number.isFinite(event.at) ? event.at : now;
  const origReceived = Number.isFinite(event.receivedAt) ? event.receivedAt : now;
  const stamped = { ...event, at: origAt, receivedAt: origReceived };
  entry.events = [...list, stamped].slice(-250);
  logger.debug(
    { sessionId, eventId: stamped.id, type: stamped.type, direction: stamped.direction, at: stamped.at, receivedAt: stamped.receivedAt, listSize: entry.events.length },
    "[EVENT] Event ajouté au buffer de session"
  );
}

function orgSlug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "org";
}

async function supabaseRest(endpoint, init = {}) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return [];

  try {
    const hasBody = init.body !== undefined && init.body !== null;
    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    };
    const response = await fetch(`${SUPABASE_URL}/rest/v1${endpoint}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      logger.warn({ endpoint, status: response.status, body: await response.text().catch(() => "") }, "supabase rest rejected request");
      return [];
    }

    if (response.status === 204) return [];
    const text = await response.text();
    if (!text) return [];
    try { return JSON.parse(text); }
    catch { return []; }
  } catch (err) {
    logger.warn({ endpoint, err }, "supabase rest request failed");
    return [];
  }
}

async function findOrgId(orgName) {
  const slug = orgSlug(orgName);
  const exact = await supabaseRest(`/organizations?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug&limit=1`);
  if (Array.isArray(exact) && exact[0]?.id) return exact[0].id;

  const byName = await supabaseRest(`/organizations?name=ilike.${encodeURIComponent(`*${String(orgName ?? "").trim()}*`)}&select=id,name,slug&limit=1`);
  if (Array.isArray(byName) && byName[0]?.id) return byName[0].id;

  const single = await supabaseRest("/organizations?select=id,name,slug&order=created_at.asc&limit=2");
  if (Array.isArray(single) && single.length === 1 && single[0]?.id) return single[0].id;

  return null;
}

let CACHED_ANY_ORG_ID = null;
async function findAnyOrgId() {
  if (CACHED_ANY_ORG_ID) return CACHED_ANY_ORG_ID;
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    logger.warn("findAnyOrgId() appelé sans SUPABASE_SERVICE_ROLE_KEY défini — retourne null");
    return null;
  }
  const rows = await supabaseRest("/organizations?select=id,name,slug&order=created_at.asc&limit=5");
  if (Array.isArray(rows) && rows[0]?.id) {
    CACHED_ANY_ORG_ID = rows[0].id;
    return CACHED_ANY_ORG_ID;
  }
  logger.warn(
    { supabaseUrl: SUPABASE_URL, query: "/organizations?select=id,name,slug&order=created_at.asc&limit=5" },
    "findAnyOrgId() n'a trouvé aucune organisation dans Supabase"
  );
  return null;
}

async function ensureSessionRow(orgId, sessionName, phone, status, bridgeSessionId, sessionType) {
  if (!orgId || !sessionName) return null;

  const typeStr = sessionType ? `|type:${sessionType}` : "|type:principal";
  const bridgeTag = bridgeSessionId ? `bridge:${bridgeSessionId}${typeStr}` : null;

  if (bridgeTag) {
    const byBridgeId = await supabaseRest(
      `/sessions_qr?org_id=eq.${orgId}&device=eq.${encodeURIComponent(bridgeTag)}&select=id,name,phone,status,latency_ms,last_seen_at,created_at,device&limit=1`,
    );
    if (Array.isArray(byBridgeId) && byBridgeId[0]?.id) {
      await supabaseRest(`/sessions_qr?id=eq.${byBridgeId[0].id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: sessionName,
          phone: formatPhone(phone) || null,
          status: status ?? "connected",
          last_seen_at: new Date().toISOString(),
        }),
      });
      return { ...byBridgeId[0], device: bridgeTag };
    }
  }

  const existing = await supabaseRest(
    `/sessions_qr?org_id=eq.${orgId}&name=eq.${encodeURIComponent(sessionName)}&select=id,name,phone,status,latency_ms,last_seen_at,created_at,device&limit=1`,
  );
  if (Array.isArray(existing) && existing[0]?.id) {
    await supabaseRest(`/sessions_qr?id=eq.${existing[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        phone: formatPhone(phone) || null,
        status: status ?? existing[0].status ?? "connected",
        device: bridgeTag ?? existing[0].device ?? null,
        last_seen_at: new Date().toISOString(),
      }),
    });
    return { ...existing[0], device: bridgeTag ?? existing[0].device ?? null };
  }

  const created = await supabaseRest("/sessions_qr", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      org_id: orgId,
      name: sessionName,
      phone: formatPhone(phone) || null,
      device: bridgeTag,
      status: status ?? "connected",
    }),
  });
  return Array.isArray(created) ? created[0] ?? null : null;
}

function normalizeContactStage(value) {
  const stage = String(value ?? "").trim().toLowerCase();
  if (stage === "client" || stage === "loyal" || stage === "interested" || stage === "lost" || stage === "prospect") {
    return stage;
  }
  if (stage.includes("fidel")) return "loyal";
  if (stage.includes("inter")) return "interested";
  if (stage.includes("client")) return "client";
  if (stage.includes("perdu")) return "lost";
  return "prospect";
}

function mapSessionStatus(value) {
  const status = String(value ?? "").toLowerCase();
  if (status === "connected") return "connected";
  if (status === "unstable") return "unstable";
  return "disconnected";
}

function bridgeIdFromSessionRow(row) {
  const device = String(row?.device ?? "");
  const match = device.match(/bridge:([^|]+)/);
  if (match) return match[1];
  return null;
}

function typeFromSessionRow(row) {
  const device = String(row?.device ?? "");
  const match = device.match(/type:([^|]+)/);
  if (match) return match[1];
  return "principal";
}

async function ensureContactRow(orgId, contact) {
  if (!orgId) return null;

  // remote_jid optionnel : persister le JID WhatsApp réel (@lid, @s.whatsapp.net, ...) pour résolution future
  const rawRemoteJid = String(contact?.remoteJid ?? "").trim();
  const remoteJidLower = rawRemoteJid ? rawRemoteJid.toLowerCase() : "";

  const extraPatchCols = {};
  if (remoteJidLower) {
    extraPatchCols.remote_jid = remoteJidLower;
    if (remoteJidLower.endsWith("@lid")) extraPatchCols.remote_jid_type = "lid";
    else if (remoteJidLower.endsWith("@s.whatsapp.net")) extraPatchCols.remote_jid_type = "standard";
  }

  if (contact?.id && String(contact.id).trim()) {
    const byId = await supabaseRest(
      `/contacts?id=eq.${String(contact.id).trim()}&select=id,name,phone,tags,consent_marketing,org_id,remote_jid&limit=1`,
    ).catch(() => []);
    if (Array.isArray(byId) && byId[0]?.id && String(byId[0].org_id === orgId || byId[0]?.id)) {
      const phoneDigits = normalizeDigits(contact?.phone || byId[0].phone);
      const canonicalPhone = phoneDigits ? formatPhone(phoneDigits) : (byId[0].phone?.trim() || null);
      const patchBody = {
        name: contact?.name?.trim() || byId[0].name,
        tags: Array.isArray(contact?.tags) ? contact.tags : byId[0].tags ?? [],
        consent_marketing: contact?.consent ?? byId[0].consent_marketing ?? true,
        phone: byId[0].phone?.trim() || canonicalPhone,
        ...extraPatchCols,
      };
      // Patch avec remote_jid uniquement si renseigné (colonne peut ne pas exister)
      await supabaseRest(`/contacts?id=eq.${byId[0].id}`, {
        method: "PATCH",
        body: JSON.stringify(remoteJidLower ? patchBody : { name: patchBody.name, tags: patchBody.tags, consent_marketing: patchBody.consent_marketing, phone: patchBody.phone }),
      }).catch(() => {
        // Fallback : réessayer sans remote_jid (colonne absente du schéma)
        if (remoteJidLower) {
          supabaseRest(`/contacts?id=eq.${byId[0].id}`, {
            method: "PATCH",
            body: JSON.stringify({ name: patchBody.name, tags: patchBody.tags, consent_marketing: patchBody.consent_marketing, phone: patchBody.phone }),
          }).catch(() => { });
        }
      });
      return byId[0];
    }
  }

  const phoneDigits = normalizeDigits(contact?.phone);
  if (!phoneDigits) return null;

  let existing = [];
  const variants = formatPhoneVariants(phoneDigits);
  if (variants.length > 0) {
    const params = variants.map(v => `"${encodeURIComponent(v)}"`).join(",");
    const rows = await supabaseRest(
      `/contacts?org_id=eq.${orgId}&phone=in.(${params})&select=id,name,phone,tags,consent_marketing,remote_jid&limit=10`,
    );
    if (Array.isArray(rows) && rows.length > 0) {
      let best = rows.find(c => normalizeDigits(c.phone) === phoneDigits);
      if (!best) best = rows[0];
      existing = [best];
    }
  }

  if (!existing[0]?.id) {
    const suffix = phoneDigits.slice(-4);
    const bySuffix = await supabaseRest(
      `/contacts?org_id=eq.${orgId}&name=ilike.${encodeURIComponent(`%${suffix}%`)}&select=id,name,phone,tags,consent_marketing&limit=20`,
    ).catch(() => []);
    if (Array.isArray(bySuffix) && bySuffix.length > 0) {
      const match = bySuffix.find(c => normalizeDigits(c.phone) === phoneDigits);
      if (match) existing = [match];
    }
  }

  if (existing[0]?.id) {
    const canonicalPhone = formatPhone(phoneDigits);
    const basePatch = {
      name: contact?.name?.trim() || existing[0].name,
      tags: Array.isArray(contact?.tags) ? contact.tags : existing[0].tags ?? [],
      consent_marketing: contact?.consent ?? existing[0].consent_marketing ?? true,
      phone: existing[0].phone?.trim() || canonicalPhone,
    };
    // Patch avec remote_jid si applicable (fallback silencieux si colonne absente)
    await supabaseRest(`/contacts?id=eq.${existing[0].id}`, {
      method: "PATCH",
      body: JSON.stringify(remoteJidLower ? { ...basePatch, ...extraPatchCols } : basePatch),
    }).catch(() => {
      if (remoteJidLower) {
        supabaseRest(`/contacts?id=eq.${existing[0].id}`, { method: "PATCH", body: JSON.stringify(basePatch) }).catch(() => { });
      }
    });
    return existing[0];
  }

  const canonicalPhone = formatPhone(phoneDigits);
  const baseCreate = {
    id: contact?.id || undefined,
    org_id: orgId,
    phone: canonicalPhone,
    name: contact?.name?.trim() || `Contact ${canonicalPhone.slice(-4)}`,
    stage: contact?.stage ?? "prospect",
    score: Number(contact?.score ?? 0),
    tags: Array.isArray(contact?.tags) ? contact.tags : [],
    consent_marketing: contact?.consent ?? true,
  };
  const createBody = remoteJidLower ? { ...baseCreate, ...extraPatchCols } : baseCreate;
  const created = await supabaseRest("/contacts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(createBody),
  }).catch(async () => {
    // Fallback : créer sans remote_jid si la colonne n'existe pas
    if (remoteJidLower) {
      return supabaseRest("/contacts", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(baseCreate),
      }).catch(() => []);
    }
    return [];
  });
  return Array.isArray(created) ? created[0] ?? null : null;
}

async function ensureConversationRow(orgId, contactId, sessionRowId, at, status) {
  if (!orgId || !contactId) return null;

  const allExisting = await supabaseRest(
    `/conversations?org_id=eq.${orgId}&contact_id=eq.${contactId}&select=id,status,unread_count,last_message_at,created_at&order=created_at.asc&limit=50`,
  );
  if (Array.isArray(allExisting) && allExisting.length > 0) {
    const canonical = allExisting[0];
    if (allExisting.length > 1) {
      const extras = allExisting.slice(1);
      for (const extra of extras) {
        const extraMessages = await supabaseRest(`/messages?conversation_id=eq.${extra.id}&select=*&order=created_at.asc`);
        if (Array.isArray(extraMessages) && extraMessages.length > 0) {
          for (const msg of extraMessages) {
            await supabaseRest("/messages", {
              method: "POST",
              headers: { Prefer: "return=representation" },
              body: JSON.stringify({
                org_id: orgId,
                conversation_id: canonical.id,
                direction: msg.direction,
                type: msg.type ?? "text",
                body: msg.body ?? "",
                status: msg.status ?? (msg.direction === "out" ? "sent" : "delivered"),
                created_at: msg.created_at ?? new Date().toISOString(),
              }),
            }).catch(() => { });
          }
        }
        await supabaseRest(`/conversations?id=eq.${extra.id}`, { method: "DELETE" }).catch(() => { });
        logger.info({ orgId, contactId, mergedInto: canonical.id, deleted: extra.id }, "Merged duplicate conversation row");
      }
    }

    const unread = Number(canonical.unread_count ?? 0);
    const patch = {
      session_id: sessionRowId ?? canonical.session_id ?? null,
      last_message_at: new Date(at).toISOString(),
      status: status ?? canonical.status ?? "open",
      unread_count: status === "new" ? unread + 1 : unread,
    };
    await supabaseRest(`/conversations?id=eq.${canonical.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return { ...canonical, ...patch };
  }

  const created = await supabaseRest("/conversations", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      org_id: orgId,
      contact_id: contactId,
      session_id: sessionRowId ?? null,
      status: status ?? "new",
      unread_count: status === "new" ? 1 : 0,
      last_message_at: new Date(at).toISOString(),
    }),
  });
  return Array.isArray(created) ? created[0] ?? null : null;
}

async function persistRuntimeMessageDirect(orgId, opts) {
  if (!orgId || !opts) return { ok: false, reason: "invalid_args" };
  const sessionRow = await ensureSessionRow(
    orgId,
    opts?.sessionName ?? opts?.sessionId ?? "Session WhatsApp",
    opts?.sessionPhone,
    opts?.sessionStatus ?? "connected",
    opts?.sessionId,
  );
  const contactRow = await ensureContactRow(orgId, opts?.contact);
  if (!contactRow?.id) return { ok: false, reason: "contact_not_found" };

  const direction = opts?.message?.direction === "out" ? "out" : "in";
  const status = direction === "in" ? "new" : "open";
  const at = Number(opts?.message?.at ?? Date.now());
  const conversationRow = await ensureConversationRow(orgId, contactRow.id, sessionRow?.id ?? null, at, status);
  if (!conversationRow?.id) return { ok: false, reason: "conversation_not_found" };

  const bodyText = String(opts?.message?.body ?? "").trim();
  const msgStatus = opts?.message?.status ?? (direction === "out" ? "sent" : "delivered");
  const createdAtIso = new Date(at).toISOString();

  const atLower = new Date(at - 5000).toISOString();
  const atUpper = new Date(at + 5000).toISOString();
  const dupCheck = await supabaseRest(
    `/messages?conversation_id=eq.${conversationRow.id}&direction=eq.${direction}&body=eq.${encodeURIComponent(bodyText)}&created_at=gte.${encodeURIComponent(atLower)}&created_at=lte.${encodeURIComponent(atUpper)}&select=id&limit=1`,
  );
  if (Array.isArray(dupCheck) && dupCheck.length > 0) {
    return { ok: true, id: dupCheck[0].id, duplicated: true };
  }

  const created = await supabaseRest("/messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      org_id: orgId,
      conversation_id: conversationRow.id,
      direction,
      type: "text",
      body: bodyText,
      status: msgStatus,
      created_at: createdAtIso,
    }),
  });

  return { ok: Array.isArray(created) && !!created[0]?.id, id: created?.[0]?.id ?? null };
}

async function persistRuntimeMessage(payload) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return { ok: false, reason: "supabase_not_configured" };

  const orgId = await findOrgId(payload?.orgName);
  if (!orgId) return { ok: false, reason: "org_not_found" };

  return persistRuntimeMessageDirect(orgId, payload);
}

async function persistRuntimeWaMessage(bridgeSessionId, opts) {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    logger.warn({ bridgeSessionId, opts }, "persistRuntimeWaMessage: SUPABASE_SERVICE_ROLE_KEY absente — skip persistance DB");
    return { ok: false, reason: "supabase_not_configured" };
  }
  if (!bridgeSessionId || !opts) return { ok: false, reason: "invalid_args" };

  const orgId = await findAnyOrgId();
  if (!orgId) {
    logger.warn({ bridgeSessionId }, "persistRuntimeWaMessage: aucune organisation trouvée — skip persistance DB");
    return { ok: false, reason: "org_not_found" };
  }

  const peerDigits = normalizeDigits(opts.peerPhone);
  const peerPhoneFormatted = formatPhone(peerDigits);
  if (!peerPhoneFormatted) return { ok: false, reason: "invalid_peer_phone" };

  return persistRuntimeMessageDirect(orgId, {
    sessionId: bridgeSessionId,
    sessionName: opts?.sessionName ?? bridgeSessionId,
    sessionPhone: opts?.sessionPhone,
    sessionStatus: opts?.sessionStatus ?? "connected",
    contact: {
      name: opts?.peerName?.trim() || `Contact ${peerDigits.slice(-4)}`,
      phone: peerPhoneFormatted,
      tags: ["WhatsApp"],
      consent: true,
      stage: "prospect",
      score: 0,
      // BUG FIX #2: Transmettre remote_jid pour qu'ensureContactRow le persiste
      remoteJid: opts?.remoteJid ? String(opts.remoteJid).toLowerCase() : undefined,
    },
    message: {
      direction: opts.direction === "out" ? "out" : "in",
      body: String(opts?.body ?? "").trim(),
      at: Number(opts?.at ?? Date.now()),
      status: opts.direction === "out" ? "sent" : "delivered",
    },
  });
}

async function persistRuntimeContact(payload) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return { ok: false, reason: "supabase_not_configured" };

  const orgId = await findOrgId(payload?.orgName);
  if (!orgId) return { ok: false, reason: "org_not_found" };

  const contactRow = await ensureContactRow(orgId, payload?.contact);
  return { ok: !!contactRow?.id };
}

async function persistRuntimeSession(payload) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return { ok: false, reason: "supabase_not_configured" };

  const orgId = await findOrgId(payload?.orgName);
  if (!orgId) return { ok: false, reason: "org_not_found" };

  const sessionRow = await ensureSessionRow(
    orgId,
    payload?.sessionName ?? payload?.sessionId ?? "Session WhatsApp",
    payload?.sessionPhone,
    payload?.sessionStatus ?? "connected",
    payload?.sessionId,
    payload?.sessionType
  );

  return { ok: !!sessionRow?.id };
}

function toCampaignStatus(value, fourEyes) {
  const status = String(value ?? "draft").toLowerCase();
  if (fourEyes && status === "draft") return "review";
  if (["draft", "scheduled", "running", "paused", "done", "stopped"].includes(status)) return status;
  return "draft";
}

function toDbCampaignStatus(value) {
  const status = String(value ?? "draft").toLowerCase();
  if (status === "review") return "draft";
  if (["draft", "scheduled", "running", "paused", "done", "stopped"].includes(status)) return status;
  return "draft";
}

function hourToPgTime(hour, fallback) {
  const n = Number(hour);
  const safe = Number.isFinite(n) ? Math.max(0, Math.min(23, Math.trunc(n))) : fallback;
  return `${String(safe).padStart(2, "0")}:00:00`;
}

async function persistRuntimeCampaign(payload) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return { ok: false, reason: "supabase_not_configured" };

  const orgId = await findOrgId(payload?.orgName);
  if (!orgId) return { ok: false, reason: "org_not_found" };

  const campaign = payload?.campaign ?? {};
  const remoteId = typeof campaign?.remoteId === "string" && campaign.remoteId ? campaign.remoteId : null;
  const body = {
    org_id: orgId,
    name: String(campaign?.name ?? "Campagne").trim() || "Campagne",
    goal: String(campaign?.goal ?? "promotion"),
    status: toDbCampaignStatus(campaign?.status),
    audience: {
      label: String(campaign?.audience ?? ""),
      recipientIds: Array.isArray(campaign?.recipientIds) ? campaign.recipientIds : [],
      segments: Array.isArray(campaign?.segments) ? campaign.segments : [],
      manualIds: Array.isArray(campaign?.manualIds) ? campaign.manualIds : [],
      bridgeSessionId: campaign?.bridgeSessionId ?? null,
    },
    content: String(campaign?.content ?? ""),
    media: {
      url: campaign?.mediaUrl ?? null,
      bridgeSessionId: campaign?.bridgeSessionId ?? null,
    },
    scheduled_at: campaign?.scheduledAt ? new Date(Number(campaign.scheduledAt)).toISOString() : null,
    timezone: String(campaign?.timezone ?? "Africa/Tunis"),
    window_start: hourToPgTime(campaign?.windowStart, 8),
    window_end: hourToPgTime(campaign?.windowEnd, 21),
    follow_up: Boolean(campaign?.followUpOn),
    follow_up_msg: String(campaign?.followUpMsg ?? ""),
    stop_on_reply: Boolean(campaign?.stopOnReply),
    four_eyes: Boolean(campaign?.needsReview),
    stats: {
      eligible: Number(campaign?.total ?? 0),
      sent: Number(campaign?.sent ?? 0),
      delivered: Number(campaign?.delivered ?? 0),
      read: 0,
      replies: Number(campaign?.replies ?? 0),
      unsub: Number(campaign?.unsubscribed ?? 0),
      failed: Number(campaign?.failed ?? 0),
      ratePerMin: Number(campaign?.ratePerMin ?? 15),
      dispatchCursor: Number(campaign?.dispatchCursor ?? 0),
    },
  };

  if (remoteId) {
    const updated = await supabaseRest(`/campaigns?id=eq.${remoteId}&org_id=eq.${orgId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    return { ok: Array.isArray(updated) && !!updated[0]?.id, id: updated?.[0]?.id ?? remoteId };
  }

  const created = await supabaseRest("/campaigns", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return { ok: Array.isArray(created) && !!created[0]?.id, id: created?.[0]?.id ?? null };
}

async function buildRuntimeBootstrap(orgName) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return { ok: false, reason: "supabase_not_configured" };

  const orgId = await findOrgId(orgName);
  if (!orgId) return { ok: false, reason: "org_not_found" };

  // BUG FIX #5: Ajout des ai_agents ET ai_suggestions pour que l'inbox affiche les suggestions et les agents activés
  const [sessionRows, contactRows, conversationRows, messageRows, campaignRows, aiAgentRows, aiSuggestionRows] = await Promise.all([
    supabaseRest(`/sessions_qr?org_id=eq.${orgId}&select=id,name,phone,status,latency_ms,last_seen_at,created_at,device&order=created_at.asc&limit=200`),
    supabaseRest(`/contacts?org_id=eq.${orgId}&select=id,name,phone,stage,score,tags,consent_marketing,unsubscribed,created_at&order=created_at.desc&limit=2000`),
    supabaseRest(`/conversations?org_id=eq.${orgId}&select=id,contact_id,session_id,status,unread_count,last_message_at,created_at&order=last_message_at.desc&limit=1000`),
    supabaseRest(`/messages?org_id=eq.${orgId}&select=id,conversation_id,direction,body,status,created_at&order=created_at.asc&limit=5000`),
    supabaseRest(`/campaigns?org_id=eq.${orgId}&select=id,name,goal,status,audience,content,media,scheduled_at,timezone,window_start,window_end,follow_up,follow_up_msg,stop_on_reply,four_eyes,stats,created_at&order=created_at.desc&limit=500`),
    supabaseRest(`/ai_agents?org_id=eq.${orgId}&select=id,key,name,mode,threshold,config,active&order=id.asc&limit=100`),
    supabaseRest(`/ai_suggestions?org_id=eq.${orgId}&select=id,org_id,conversation_id,agent_id,body,status,confidence,created_at&order=created_at.desc&limit=500`).catch(() => []),
  ]);

  const sessionsByDbId = new Map();
  const liveIds = new Set(sessions.keys());

  const sessionsPayload = Array.isArray(sessionRows)
    ? sessionRows.map((row) => {
      const bridgeId = bridgeIdFromSessionRow(row);
      const live = bridgeId ? sessions.get(bridgeId) : undefined;
      const id = bridgeId ?? `db_${row.id}`;
      sessionsByDbId.set(row.id, { id, name: row.name ?? "Session", bridgeId });
      if (bridgeId) liveIds.delete(bridgeId);

      return {
        id,
        rawId: row.id,
        bridgeId,
        name: row.name ?? "Session",
        type: typeFromSessionRow(row),
        status: bridgeId ? mapSessionStatus(live?.status ?? row.status) : "disconnected",
        latencyMs: Number(row.latency_ms ?? 0),
        uptime: bridgeId && mapSessionStatus(live?.status ?? row.status) === "connected" ? 100 : 0,
        phone: formatPhone(live?.phone ?? row.phone),
        connectedAt: row.created_at ? Date.parse(row.created_at) : undefined,
      };
    })
    : [];

  for (const liveId of liveIds) {
    const live = sessions.get(liveId);
    sessionsPayload.push({
      id: liveId,
      rawId: null,
      bridgeId: liveId,
      name: live?.pushname?.trim() || "Session WhatsApp",
      type: "principal",
      status: mapSessionStatus(live?.status),
      latencyMs: 0,
      uptime: live?.status === "connected" ? 100 : 0,
      phone: formatPhone(live?.phone),
      connectedAt: undefined,
    });
  }

  let canonicalHaithemSessionId = null;
  for (const s of sessionsPayload) {
    if (s.status === "connected") {
      const digits = normalizeDigits(s.phone);
      if (digits === HAITHEM_PHONE_DIGITS) {
        canonicalHaithemSessionId = s.id;
        break;
      }
      const sn = String(s.name ?? "").toLowerCase();
      if (sn.includes("haithem") || sn.includes("kalia")) {
        canonicalHaithemSessionId = s.id;
        break;
      }
      if (s.bridgeId && !canonicalHaithemSessionId) {
        canonicalHaithemSessionId = s.id;
      }
      if (s.type === "principal" && !canonicalHaithemSessionId) {
        canonicalHaithemSessionId = s.id;
      }
    }
  }
  if (!canonicalHaithemSessionId) {
    for (const s of sessionsPayload) {
      const sn = String(s.name ?? "").toLowerCase();
      if (sn.includes("haithem") || sn.includes("kalia")) {
        canonicalHaithemSessionId = s.id;
        break;
      }
      const digits = normalizeDigits(s.phone);
      if (digits === HAITHEM_PHONE_DIGITS) {
        canonicalHaithemSessionId = s.id;
        break;
      }
      if (s.type === "principal" && !canonicalHaithemSessionId) {
        canonicalHaithemSessionId = s.id;
      }
    }
  }
  if (!canonicalHaithemSessionId && sessionsPayload.length > 0) {
    canonicalHaithemSessionId = sessionsPayload[0].id;
  }

  const contactsPayload = Array.isArray(contactRows)
    ? contactRows.map((row) => ({
      id: row.id,
      name: row.name?.trim() || `Contact ${String(row.phone ?? "").slice(-4)}`,
      phone: formatPhone(row.phone),
      city: "",
      tags: Array.isArray(row.tags) ? row.tags.filter(Boolean) : [],
      score: Number(row.score ?? 0),
      stage: normalizeContactStage(row.stage),
      consent: Boolean(row.consent_marketing ?? true) && !Boolean(row.unsubscribed ?? false),
      lastContactAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    }))
    : [];

  const messagesByConversation = new Map();
  if (Array.isArray(messageRows)) {
    for (const row of messageRows) {
      const list = messagesByConversation.get(row.conversation_id) ?? [];
      list.push({
        id: row.id,
        conversationId: row.conversation_id,
        direction: row.direction === "out" ? "out" : "in",
        body: String(row.body ?? ""),
        at: row.created_at ? Date.parse(row.created_at) : Date.now(),
        status: row.status ?? (row.direction === "out" ? "sent" : "delivered"),
        kind: "text",
      });
      messagesByConversation.set(row.conversation_id, list);
    }
  }

  let conversationsPayload = [];
  if (Array.isArray(conversationRows)) {
    const byContact = new Map();
    for (const row of conversationRows) {
      const list = byContact.get(row.contact_id) ?? [];
      list.push(row);
      byContact.set(row.contact_id, list);
    }

    const STATUS_ORDER = { new: 0, open: 1, pending: 2, resolved: 3, archived: 4 };
    const deduped = [];
    for (const [contactId, rows] of byContact.entries()) {
      if (rows.length === 0) continue;
      const sorted = [...rows].sort((a, b) => {
        const aAt = a.created_at ? Date.parse(a.created_at) : 0;
        const bAt = b.created_at ? Date.parse(b.created_at) : 0;
        return aAt - bAt;
      });
      const canonical = sorted[0];
      let mergedThread = [];
      for (const r of sorted) {
        const t = messagesByConversation.get(r.id) ?? [];
        mergedThread = mergedThread.concat(t);
      }
      const seenMsgKeys = new Set();
      mergedThread = mergedThread.filter((m) => {
        const key = `${m.direction}|${m.at}|${m.body}`;
        if (seenMsgKeys.has(key)) return false;
        seenMsgKeys.add(key);
        return true;
      }).sort((a, b) => a.at - b.at);

      let worstStatus = canonical.status ?? "open";
      let maxUnread = 0;
      let bestSessionId = canonical.session_id ?? null;
      let latestMsgAt = canonical.last_message_at ? Date.parse(canonical.last_message_at) : 0;
      for (const r of sorted) {
        const rStatus = r.status ?? "open";
        if ((STATUS_ORDER[rStatus] ?? 99) < (STATUS_ORDER[worstStatus] ?? 99)) {
          worstStatus = rStatus;
        }
        maxUnread += Number(r.unread_count ?? 0);
        const rAt = r.last_message_at ? Date.parse(r.last_message_at) : 0;
        if (rAt > latestMsgAt) {
          latestMsgAt = rAt;
          bestSessionId = r.session_id ?? bestSessionId;
        }
      }

      deduped.push({
        id: canonical.id,
        contactId: canonical.contact_id,
        status: worstStatus,
        unread: maxUnread,
        sessionId: canonicalHaithemSessionId ?? (bestSessionId ? (sessionsByDbId.get(bestSessionId)?.id ?? `db_${bestSessionId}`) : (sessionsByDbId.get(canonical.session_id)?.id ?? `db_${canonical.session_id}`)),
        thread: mergedThread,
      });
    }

    deduped.sort((a, b) => {
      const aLast = a.thread.length > 0 ? a.thread[a.thread.length - 1].at : 0;
      const bLast = b.thread.length > 0 ? b.thread[b.thread.length - 1].at : 0;
      return bLast - aLast;
    });

    conversationsPayload = deduped;
  }

  const campaignsPayload = Array.isArray(campaignRows)
    ? campaignRows.map((row) => {
      const stats = row.stats && typeof row.stats === "object" ? row.stats : {};
      const audience = row.audience && typeof row.audience === "object" ? row.audience : {};
      const media = row.media && typeof row.media === "object" ? row.media : {};
      return {
        id: row.id,
        remoteId: row.id,
        name: row.name ?? "Campagne",
        status: toCampaignStatus(row.status, row.four_eyes),
        audience: String(audience.label ?? ""),
        total: Number(stats.eligible ?? 0),
        sent: Number(stats.sent ?? 0),
        delivered: Number(stats.delivered ?? 0),
        replies: Number(stats.replies ?? 0),
        failed: Number(stats.failed ?? 0),
        unsubscribed: Number(stats.unsub ?? 0),
        scheduledAt: row.scheduled_at ? Date.parse(row.scheduled_at) : undefined,
        mediaUrl: media.url ?? undefined,
        goal: ["promotion", "relance", "annonce", "fidelisation"].includes(String(row.goal ?? ""))
          ? row.goal
          : "promotion",
        ratePerMin: Number(stats.ratePerMin ?? 15),
        content: String(row.content ?? ""),
        followUpOn: Boolean(row.follow_up),
        followUpMsg: String(row.follow_up_msg ?? ""),
        stopOnReply: Boolean(row.stop_on_reply),
        recipientIds: Array.isArray(audience.recipientIds) ? audience.recipientIds : [],
        bridgeSessionId: media.bridgeSessionId ?? audience.bridgeSessionId ?? undefined,
        dispatchCursor: Number(stats.dispatchCursor ?? 0),
      };
    })
    : [];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const messagesToday = Array.isArray(messageRows)
    ? messageRows.reduce((count, row) => count + ((row.created_at ? Date.parse(row.created_at) : 0) >= todayStart.getTime() ? 1 : 0), 0)
    : 0;

  // BUG FIX #5: Formater agents AI pour les consommateurs frontend (store Zustand, Agents page, Inbox)
  const agentsPayload = Array.isArray(aiAgentRows)
    ? aiAgentRows.map((row) => {
      const cfg = row.config && typeof row.config === "object" ? row.config : {};
      return {
        id: String(row.id),
        key: String(row.key ?? "analyst"),
        name: String(row.name ?? "Agent"),
        tagline: String(cfg.tagline ?? ""),
        mode: String(row.mode ?? "suggestion"),
        threshold: Number(row.threshold ?? 85),
        active: Boolean(row.active ?? true),
        confidence: Number(row.threshold ?? 85),
        handled: 0,
        config: cfg,
      };
    })
    : [];

  const suggestionsPayload = Array.isArray(aiSuggestionRows)
    ? aiSuggestionRows.map((row) => {
      const statusRaw = String(row.status ?? "pending").toLowerCase();
      const allowedStatus = ["pending", "accepted", "rejected"];
      const safeStatus = allowedStatus.includes(statusRaw) ? statusRaw : "pending";
      return {
        id: String(row.id),
        conversationId: row.conversation_id ?? null,
        agentId: row.agent_id ?? null,
        text: String(row.body ?? ""),
        confidence: Number(row.confidence ?? 0),
        status: safeStatus,
        at: row.created_at ? Date.parse(row.created_at) : Date.now(),
        meta: typeof row.meta === "object" ? row.meta : null,
      };
    })
    : [];

  logger.info(
    {
      orgId, sessions: sessionsPayload.length, contacts: contactsPayload.length, conversations: conversationsPayload.length,
      campaigns: campaignsPayload.length, agents: agentsPayload.length, suggestions: suggestionsPayload.length
    },
    "[BOOTSTRAP] Payload runtime prêt (incluant agents + suggestions)"
  );

  return {
    ok: true,
    sessions: sessionsPayload,
    contacts: contactsPayload,
    conversations: conversationsPayload,
    campaigns: campaignsPayload,
    agents: agentsPayload,
    suggestions: suggestionsPayload,
    messagesToday,
  };
}

function getEntry(id, organizationId = DEFAULT_ORG_ID) {
  if (!sessions.has(id)) {
    sessions.set(id, {
      status: "disconnected",
      qr: undefined,
      phone: undefined,
      pushname: undefined,
      sock: undefined,
      retryCount: 0,
      events: [],
      // Multi-tenant : organisation propriétaire de la session (isolation, section 15/61)
      organizationId,
      // Anti-doublon (section 50) : ids WhatsApp déjà traités pour cette session
      processedMessageIds: new Set(),
      // Mode dégradé (section 53) : file de messages sortants en attente de connexion
      outboundQueue: [],
      // Horodatage de dernière activité (pour GET /orgs/:orgId/sessions)
      lastSeenAt: Date.now(),
    });
  }
  return sessions.get(id);
}

// Verrou logique par conversation (section 51) : sérialise le traitement des
// messages entrants d'une même conversation via une chaîne de Promises.
const conversationLocks = new Map();

function withConversationLock(conversationId, task) {
  const previous = conversationLocks.get(conversationId) ?? Promise.resolve();
  const next = previous.then(() => task()).catch((err) => {
    logger.error({ conversationId, err }, "Erreur dans la tâche verrouillée de conversation");
  });
  conversationLocks.set(conversationId, next);
  // Nettoyage mémoire : supprimer le verrou une fois la chaîne terminée
  next.finally(() => {
    if (conversationLocks.get(conversationId) === next) conversationLocks.delete(conversationId);
  });
  return next;
}

// ============ ISOLATION PHYSIQUE (section 15) ============
// Les credentials Baileys sont stockés dans AUTH_DIR/<organizationId>/<sessionId>/.
// Chaque dossier de session contient un owner.json { organizationId } qui rend
// impossible le démarrage d'une session par une autre organisation (403).

function isValidOrgId(orgId) {
  return typeof orgId === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(orgId);
}

function sessionAuthDir(organizationId, sessionId) {
  return path.join(AUTH_DIR, organizationId, sessionId);
}

async function readOwnerOrg(dir) {
  try {
    const raw = await fs.readFile(path.join(dir, "owner.json"), "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed?.organizationId === "string" ? parsed.organizationId : null;
  } catch (_) {
    return null; // pas d'owner.json : dossier neuf ou legacy
  }
}

async function writeOwnerOrg(dir, organizationId) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "owner.json"),
    JSON.stringify({ organizationId, createdAt: new Date().toISOString() }, null, 2),
  ).catch((err) => logger.warn({ dir, err }, "impossible d'écrire owner.json"));
}

/**
 * Résout et vérifie le propriétaire d'une session avant démarrage.
 * Retourne l'organizationId effectif, ou null si conflit de propriétaire (→ 403).
 */
async function resolveSessionOwner(sessionId, requestedOrgId) {
  const orgId = isValidOrgId(requestedOrgId) ? requestedOrgId : DEFAULT_ORG_ID;
  const dir = sessionAuthDir(orgId, sessionId);

  // Rétro-compatibilité : ancien format plat AUTH_DIR/<sessionId> → migrer vers 'default'
  const legacyDir = path.join(AUTH_DIR, sessionId);
  if (orgId === DEFAULT_ORG_ID) {
    try {
      const stat = await fs.stat(legacyDir).catch(() => null);
      if (stat?.isDirectory() && !(await fs.stat(dir).catch(() => null))) {
        await fs.mkdir(path.dirname(dir), { recursive: true });
        await fs.rename(legacyDir, dir);
        logger.info({ sessionId, from: legacyDir, to: dir }, "migration legacy auth dir vers structure multi-tenant");
      }
    } catch (err) {
      logger.warn({ sessionId, err }, "échec migration legacy auth dir");
    }
  }

  const existingOwner = await readOwnerOrg(dir);
  if (existingOwner && existingOwner !== orgId) {
    // Incohérence de propriétaire → refus (règle absolue d'isolation, section 61)
    return null;
  }
  if (!existingOwner) {
    await writeOwnerOrg(dir, orgId);
  }
  return orgId;
}

// Quota par organisation (section 20) : compte les sessions actives de l'org
function countOrgActiveSessions(orgId) {
  let count = 0;
  for (const entry of sessions.values()) {
    if ((entry.organizationId ?? DEFAULT_ORG_ID) === orgId && entry.status !== "disconnected") count++;
  }
  return count;
}

// ============ MODE DÉGRADÉ (section 53) ============
// Si le socket est déconnecté, les messages sortants sont mis en file et
// renvoyés automatiquement à la reconnexion : aucune perte silencieuse.

async function flushOutboundQueue(sessionId, entry) {
  if (!entry?.sock || entry.status !== "connected") return;
  const queue = Array.isArray(entry.outboundQueue) ? entry.outboundQueue : [];
  while (queue.length > 0 && entry.status === "connected" && entry.sock) {
    const msg = queue.shift();
    try {
      const jid = resolveSendJid(msg.to, msg.preferredRemoteJid);
      if (!jid) throw new Error("jid invalide");
      await entry.sock.sendMessage(jid, { text: msg.text });
      logger.info({ sessionId, to: jid }, "[QUEUE] message en file envoyé après reconnexion");
    } catch (err) {
      // Échec : on remet en tête de file et on réessaiera plus tard (pas de perte)
      queue.unshift(msg);
      logger.warn({ sessionId, err }, "[QUEUE] échec envoi message en file — conservé en queue");
      break;
    }
  }
}

async function startSession(sessionId, organizationId = DEFAULT_ORG_ID) {
  // Isolation (section 15/61) : vérifier le propriétaire AVANT de toucher aux credentials
  const ownerOrg = await resolveSessionOwner(sessionId, organizationId);
  if (!ownerOrg) {
    const err = new Error("owner_mismatch");
    err.statusCode = 403;
    throw err;
  }
  const entry = getEntry(sessionId, ownerOrg);
  entry.organizationId = ownerOrg;
  if (entry.sock && (entry.status === "connected" || entry.status === "connecting" || entry.status === "qr_pending")) {
    return entry;
  }
  entry.status = "connecting";
  entry.qr = undefined;

  // Credentials propres au couple <org>/<session> : jamais partagés (section 15)
  const { state, saveCreds } = await useMultiFileAuthState(sessionAuthDir(ownerOrg, sessionId));
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
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const item of messages ?? []) {
      const remoteJid = item.key?.remoteJid ?? "";
      if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;

      const text = getMessageText(item.message);
      if (!text) continue;

      const fromMe = item.key?.fromMe === true;

      // BUG FIX #2: Résolution JID → phone AVANT check de sortie. Utilise la version avec fallback DB pour @lid.
      let peerPhone = jidToPhone(remoteJid);
      if (!peerPhone && !fromMe) {
        peerPhone = await jidToPhoneWithFallback(remoteJid);
      }

      // BUG FIX #2 SUITE: Remplir d'abord le cache de pairing (avant tout continue éventuel sauf si vraiment pas de phone)
      if (isValidRemoteJid(remoteJid)) {
        const cacheKey = normalizeDigits(peerPhone);
        if (cacheKey) {
          phoneToValidRemoteJid.set(cacheKey, remoteJid);
          remoteJidToPhoneCanonical.set(String(remoteJid).toLowerCase(), cacheKey);
        }
      }

      if (!peerPhone) {
        logger.warn({ remoteJid, fromMe, hasText: !!text, pushName: item.pushName }, "[DROP] Impossible de résoudre le phone depuis ce JID — message ignoré");
        continue;
      }

      if (!fromMe) {
        logger.info({ remoteJid, peerPhone, participant: item.key?.participant, itemKey: item.key, pushName: item.pushName }, "[DEBUG-JID] Incoming message payload");
      }

      const eventId = item.key?.id ?? `${sessionId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Anti-doublon (section 50) : un whatsapp_message_id n'est traité qu'une
      // seule fois par session — jamais deux réponses au même message.
      if (item.key?.id) {
        if (entry.processedMessageIds.has(eventId)) {
          logger.debug({ sessionId, eventId }, "[ANTI-DOUBLON] message déjà traité — ignoré");
          continue;
        }
        entry.processedMessageIds.add(eventId);
        // Borne mémoire : on conserve les 10 000 derniers ids par session
        if (entry.processedMessageIds.size > 10_000) {
          const first = entry.processedMessageIds.values().next().value;
          entry.processedMessageIds.delete(first);
        }
      }
      entry.lastSeenAt = Date.now();

      const msgAt = toMs(item.messageTimestamp);
      const direction = fromMe ? "out" : "in";

      pushEvent(sessionId, {
        id: eventId,
        type: "message",
        direction,
        sessionId,
        from: fromMe ? entry.phone ?? "" : peerPhone,
        to: fromMe ? peerPhone : entry.phone ?? "",
        body: text,
        pushName: item.pushName ?? undefined,
        at: msgAt,
      });

      persistRuntimeWaMessage(sessionId, {
        sessionName: entry.pushname ?? sessionId,
        sessionPhone: entry.phone,
        sessionStatus: entry.status,
        peerPhone,
        peerName: item.pushName,
        direction,
        body: text,
        at: msgAt,
        // BUG FIX #2: Passer le remoteJid réel (y compris @lid) pour persistance DB
        remoteJid: remoteJid || undefined,
      }).catch((err) => {
        logger.warn({ err, direction, peerPhone }, "Failed to persist WA message to DB (messages.upsert)");
      });

      if (!fromMe) {
        // Verrou par conversation (section 51) : les messages d'une même
        // conversation sont traités séquentiellement, dans l'ordre d'arrivée.
        const conversationId = `${sessionId}:${peerPhone}`;
        withConversationLock(conversationId, () =>
          processIncomingMessageForCampainsAndAI(entry, text, peerPhone, remoteJid)
        );
      }
    }
  });

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
      entry.lastSeenAt = Date.now();
      logger.info({ sessionId, phone: entry.phone }, "session connectée");
      // Mode dégradé (section 53) : vider la file des messages en attente
      flushOutboundQueue(sessionId, entry).catch(() => { });
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      entry.status = "disconnected";
      entry.qr = undefined;
      entry.sock = undefined;

      if (loggedOut) {
        logger.warn({ sessionId }, "déconnexion définitive (logged out) — auth supprimé");
        await fs.rm(sessionAuthDir(entry.organizationId ?? DEFAULT_ORG_ID, sessionId), { recursive: true, force: true }).catch(() => { });
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

// Éviter les erreurs 404 bruyantes de Chrome DevTools dans la console
app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) => {
  res.status(200).json({});
});

app.get("/", (_req, res) => {
  res.status(200).json({ status: "online", service: "MiraFlow Bridge WhatsApp", version: "1.0.0" });
});

app.get("/repair/dump", async (_req, res) => {
  try {
    const organizationsQuery = "/organizations?select=id,name,slug&order=created_at.asc&limit=5";
    const tickCampaignsQuery = "/campaigns?status=eq.running&select=id,org_id,content,stats,audience";
    const processIncomingCampaignsQuery = "/campaigns?status=in.(running,done,paused,stopped)&select=id,audience,stop_on_reply,stats";
    const aiAgentsQuery = "/ai_agents?active=eq.true&select=id,org_id,key,name,mode,threshold,config";
    const aiSuggestionsQuery = "/ai_suggestions?status=eq.pending&select=id,org_id,conversation_id,agent_id,confidence,created_at&order=created_at.desc&limit=10";
    const invoicesQuery = "/invoices?select=id,org_id,number,amount,currency,status,created_at&order=created_at.desc&limit=10";
    const contactsQuery = "/contacts?select=id,org_id,phone,name,stage,score,tags,segment,created_at&order=created_at.desc&limit=10";
    const conversationsQuery = "/conversations?select=id,org_id,contact_id,status,unread_count,last_message_at&order=last_message_at.desc&limit=10";

    const orgId = await findAnyOrgId();

    const organizations = await supabaseRest(organizationsQuery).catch(err => ({ err: String(err?.message ?? err) }));
    const tickCampaignsRows = await supabaseRest(tickCampaignsQuery).catch(err => ({ err: String(err?.message ?? err) }));
    const processIncomingCampaignRows = await supabaseRest(processIncomingCampaignsQuery).catch(err => ({ err: String(err?.message ?? err) }));
    const aiAgents = orgId ? await supabaseRest(aiAgentsQuery + `&org_id=eq.${orgId}`).catch(err => ({ err: String(err?.message ?? err) })) : [];
    const aiSuggestions = orgId ? await supabaseRest(aiSuggestionsQuery + `&org_id=eq.${orgId}`).catch(err => ({ err: String(err?.message ?? err) })) : [];
    const invoices = orgId ? await supabaseRest(invoicesQuery + `&org_id=eq.${orgId}`).catch(err => ({ err: String(err?.message ?? err) })) : [];
    const contacts = orgId ? await supabaseRest(contactsQuery + `&org_id=eq.${orgId}`).catch(err => ({ err: String(err?.message ?? err) })) : [];
    const conversations = orgId ? await supabaseRest(conversationsQuery + `&org_id=eq.${orgId}`).catch(err => ({ err: String(err?.message ?? err) })) : [];

    res.json({
      SUPABASE_URL,
      HAS_SERVICE_ROLE: !!SUPABASE_SERVICE_ROLE_KEY,
      SERVICE_ROLE_PREFIX: SUPABASE_SERVICE_ROLE_KEY ? SUPABASE_SERVICE_ROLE_KEY.slice(0, 10) + "..." : null,
      resolvedOrgId: orgId ?? null,
      queries: {
        organizations: organizationsQuery,
        tickCampaigns: tickCampaignsQuery,
        processIncomingMessageForCampainsAndAI: processIncomingCampaignsQuery,
        aiAgents: aiAgentsQuery,
        aiSuggestions: aiSuggestionsQuery,
        invoices: invoicesQuery,
        contacts: contactsQuery,
        conversations: conversationsQuery,
      },
      organizationsCount: Array.isArray(organizations) ? organizations.length : null,
      tickCampaignsCount: Array.isArray(tickCampaignsRows) ? tickCampaignsRows.length : null,
      processIncomingCampaignsCount: Array.isArray(processIncomingCampaignRows) ? processIncomingCampaignRows.length : null,
      aiAgentsCount: Array.isArray(aiAgents) ? aiAgents.length : null,
      aiSuggestionsPendingCount: Array.isArray(aiSuggestions) ? aiSuggestions.length : null,
      invoicesCount: Array.isArray(invoices) ? invoices.length : null,
      contactsRecentCount: Array.isArray(contacts) ? contacts.length : null,
      conversationsRecentCount: Array.isArray(conversations) ? conversations.length : null,
      organizations,
      tickCampaignsRows,
      processIncomingCampaignRows,
      aiAgents,
      aiSuggestions,
      invoices,
      contacts,
      conversations,
    });
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get("/repair/backfill-campaign-replies", async (_req, res) => {
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ ok: false, error: "No SUPABASE_SERVICE_ROLE_KEY" });

  try {
    const orgId = await findAnyOrgId();
    const allCampaigns = await supabaseRest("/campaigns?status=in.(draft,running,done,paused,stopped,archived,failed)&select=id,org_id,name,status,started_at,created_at,stats,audience&order=created_at.desc&limit=5000").catch(() => []);
    if (!Array.isArray(allCampaigns)) return res.status(500).json({ ok: false, error: "failed to list campaigns" });

    const summary = [];
    for (const c of allCampaigns) {
      try {
        const audience = (c.audience && typeof c.audience === "object") ? c.audience : {};
        const stats = (c.stats && typeof c.stats === "object") ? c.stats : {};
        const recipientIdsRaw = Array.isArray(audience.recipientIds) ? audience.recipientIds : [];
        const recipientIds = recipientIdsRaw.map(x => String(x)).filter(Boolean);
        if (recipientIds.length === 0) {
          summary.push({ id: c.id, name: c.name, skipped: true, reason: "no recipients" });
          continue;
        }
        const batchParam = recipientIds.map(x => `"${encodeURIComponent(x)}"`).join(",");
        const recipientRows = await supabaseRest(
          `/contacts?id=in.(${batchParam})&select=id,phone&limit=${recipientIds.length}`
        ).catch(() => []);

        const recipientDigits = (Array.isArray(recipientRows) ? recipientRows : [])
          .filter(r => r?.phone)
          .map(r => ({ id: String(r.id), phone: normalizeDigits(r.phone) }))
          .filter(r => r.phone);
        if (recipientDigits.length === 0) {
          summary.push({ id: c.id, name: c.name, skipped: true, reason: "no phones resolved" });
          continue;
        }

        const repliedContactIds = new Set((Array.isArray(stats.replied_contact_ids) ? stats.replied_contact_ids : []).map(x => String(x)));
        const windowStart = new Date(c.started_at ?? c.created_at ?? new Date(0)).getTime();
        const windowEnd = Date.now() + 60_000;

        const phonesParam = recipientDigits.map(r => `"${encodeURIComponent(formatPhone(r.phone))}"`).join(",");
        const allCandidateMessages = await supabaseRest(
          `/messages?direction=eq.in&org_id=eq.${orgId ?? '00000000-0000-0000-0000-000000000000'}&contact_phone=in.(${phonesParam})&and=(at.gte.${windowStart},at.lte.${windowEnd})&select=id,at,contact_id,contact_phone&limit=50000`
        ).catch(async () => {
          const out = [];
          for (const r of recipientDigits.slice(0, 2000)) {
            const byPhone = await supabaseRest(
              `/messages?direction=eq.in&contact_phone=eq.${encodeURIComponent(formatPhone(r.phone))}&and=(at.gte.${windowStart},at.lte.${windowEnd})&select=id,contact_id&limit=5000`
            ).catch(() => []);
            if (Array.isArray(byPhone)) out.push(...byPhone);
          }
          return out;
        });

        if (Array.isArray(allCandidateMessages)) {
          for (const m of allCandidateMessages) {
            const phone = normalizeDigits(m.contact_phone);
            const match = recipientDigits.find(r => r.phone === phone);
            if (match) repliedContactIds.add(match.id);
            else if (m.contact_id) {
              const s = String(m.contact_id);
              if (recipientIds.includes(s)) repliedContactIds.add(s);
            }
          }
        }

        const repliedArr = Array.from(repliedContactIds);
        const newRepliesCount = repliedArr.length;
        const beforeReplies = Number(stats.replies || 0);
        const changed = beforeReplies !== newRepliesCount
          || (Array.isArray(stats.replied_contact_ids) && stats.replied_contact_ids.length !== repliedArr.length);

        if (changed) {
          const newStats = { ...stats, replies: newRepliesCount, replied_contact_ids: repliedArr };
          await supabaseRest(`/campaigns?id=eq.${c.id}`, {
            method: "PATCH",
            body: JSON.stringify({ stats: newStats })
          }).catch(() => { });
        }
        summary.push({
          id: c.id,
          name: c.name,
          recipientsTotal: recipientIds.length,
          recipientsWithPhone: recipientDigits.length,
          beforeReplies,
          afterReplies: newRepliesCount,
          delta: newRepliesCount - beforeReplies,
          updated: changed,
          repliedContactIdsCount: repliedArr.length,
          status: c.status
        });
      } catch (e) {
        summary.push({ id: c.id, name: c.name, error: String(e?.message ?? e) });
      }
    }
    res.json({ ok: true, total: allCampaigns.length, summary });
  } catch (err) {
    logger.error({ err }, "backfill campaign replies failed");
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/sessions", async (req, res) => {
  const { sessionId, organizationId } = req.body ?? {};
  if (!sessionId || typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(sessionId)) {
    return res.status(400).json({ error: "sessionId invalide (a-z, 0-9, -, _, 64 car. max)" });
  }
  // Multi-tenant : organizationId optionnel (défaut 'default') pour préserver l'API existante
  const orgId = organizationId == null ? DEFAULT_ORG_ID : String(organizationId);
  if (!isValidOrgId(orgId)) {
    return res.status(400).json({ error: "organizationId invalide (a-z, 0-9, -, _, 64 car. max)" });
  }
  // Quota (section 20) : contrôle côté backend, jamais uniquement côté frontend
  if (MAX_SESSIONS_PER_ORG > 0 && !sessions.has(sessionId) && countOrgActiveSessions(orgId) >= MAX_SESSIONS_PER_ORG) {
    return res.status(403).json({ error: "quota_exceeded", organizationId: orgId, max: MAX_SESSIONS_PER_ORG });
  }
  try {
    const entry = await startSession(sessionId, orgId);
    res.json({ status: entry.status === "connecting" ? "qr_pending" : entry.status, organizationId: orgId });
  } catch (err) {
    if (err?.statusCode === 403) {
      // Le dossier de session appartient à une autre organisation (owner.json mismatch)
      return res.status(403).json({ error: "owner_mismatch", sessionId });
    }
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

app.get("/sessions/:id/contacts/:phone/avatar", async (req, res) => {
  const entry = sessions.get(req.params.id);
  if (!entry || entry.status !== "connected" || !entry.sock) {
    return res.json({ url: null, error: "session_offline" });
  }
  const jid = req.params.phone + "@s.whatsapp.net";
  try {
    const url = await entry.sock.profilePictureUrl(jid, "image");
    res.json({ url });
  } catch (err) {
    res.json({ url: null, error: "not_found" });
  }
});

app.get("/sessions/:id/events", (req, res) => {
  const entry = sessions.get(req.params.id);
  const since = Number(req.query?.since ?? 0);
  const all = Array.isArray(entry?.events) ? entry.events : [];

  // BUG FIX #7: Filtrer par receivedAt (monotone, à l'heure du serveur) ET par at (horodatage original WhatsApp)
  // Si un message arrive avec un ancien timestamp WhatsApp mais qu'il vient d'être reçu côté bridge,
  // receivedAt > since le capte, contrairement à at seul.
  const events = since <= 0
    ? all.slice()
    : all.filter((item) => {
      const recvAt = Number(item?.receivedAt ?? 0);
      const origAt = Number(item?.at ?? 0);
      return (recvAt > 0 && recvAt >= since) || (origAt >= since);
    });

  // Safety net : si le filtre est vide mais que des events existent très récents, les renvoyer.
  // Évite un curseur bloqué « à l'inf