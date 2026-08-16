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
      openaiKeyConfigured: !!String(process.env.OPENAI_API_KEY || "").trim(),
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

  const segments = beforeAt.split(/[:\-_.]/);
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
    .replace(/[\u0300-\u036f]/g, "")
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

function getEntry(id) {
  if (!sessions.has(id)) {
    sessions.set(id, {
      status: "disconnected",
      qr: undefined,
      phone: undefined,
      pushname: undefined,
      sock: undefined,
      retryCount: 0,
      events: [],
    });
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
        processIncomingMessageForCampainsAndAI(entry, text, peerPhone, remoteJid).catch(err => {
          logger.error({ err }, "Erreur de la routine IA/StopCampaign");
        });
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
        await fs.rm(path.join(AUTH_DIR, sessionId), { recursive: true, force: true }).catch(() => { });
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
  const { sessionId } = req.body ?? {};
  // #region debug-point D:bridge-post-session
  fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "bridge-sync-break", runId: "pre-fix", hypothesisId: "D", location: "bridge/src/index.js:POST /sessions", msg: "[DEBUG] bridge session start requested", data: { sessionId, body: req.body ?? null }, ts: Date.now() }) }).catch(() => { });
  // #endregion
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
  // Évite un curseur bloqué « à l'infini » quand at << since.
  if (since > 0 && all.length > 0 && events.length === 0) {
    const mostRecentReceived = Number(all[all.length - 1]?.receivedAt ?? 0);
    if (mostRecentReceived >= since - 60_000) {
      const tail = all.slice(-10);
      res.json({ events: tail, _hint: "tail_since_fallback", _count: tail.length, _total: all.length });
      return;
    }
  }
  res.json({ events, _count: events.length, _total: all.length });
});

app.post("/runtime/contacts", async (req, res) => {
  const result = await persistRuntimeContact(req.body ?? {});
  res.json(result);
});

app.post("/runtime/sessions", async (req, res) => {
  const result = await persistRuntimeSession(req.body ?? {});
  res.json(result);
});

app.delete("/runtime/sessions/:id", async (req, res) => {
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "supabase non configure" });
  let sid = req.params.id;
  if (sid.startsWith("db_")) {
    sid = sid.slice(3);
    const del = await supabaseRest(`/sessions_qr?id=eq.${sid}`, { method: "DELETE" });
    return res.json({ ok: true, deleted: del });
  } else {
    // Delete by device match (bridge tag)
    const lists = await supabaseRest(`/sessions_qr?device=like.*bridge:${sid}*&select=id`);
    if (Array.isArray(lists)) {
      for (const row of lists) {
        await supabaseRest(`/sessions_qr?id=eq.${row.id}`, { method: "DELETE" });
      }
    }
    return res.json({ ok: true });
  }
});

app.post("/runtime/messages", async (req, res) => {
  const result = await persistRuntimeMessage(req.body ?? {});
  res.json(result);
});

app.delete("/runtime/conversations/:id", async (req, res) => {
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "supabase non configure" });
  try {
    await supabaseRest(`/conversations?id=eq.${req.params.id}`, { method: "DELETE" });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "erreur", details: String(err) });
  }
});

app.post("/runtime/campaigns", async (req, res) => {
  const result = await persistRuntimeCampaign(req.body ?? {});
  res.json(result);
});

app.delete("/runtime/campaigns/:id", async (req, res) => {
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "supabase non configure" });
  try {
    await supabaseRest(`/campaigns?id=eq.${req.params.id}`, { method: "DELETE" });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "erreur", details: String(err) });
  }
});


app.post("/runtime/bootstrap", async (req, res) => {
  const result = await buildRuntimeBootstrap(req.body?.orgName);
  res.json(result);
});

app.post("/sessions/:id/messages", async (req, res) => {
  const sessionId = req.params.id;
  const entry = sessions.get(sessionId);
  const text = String(req.body?.text ?? "").trim();
  const to = String(req.body?.to ?? "").trim();
  const jid = resolveSendJid(to);

  if (!entry?.sock || entry.status !== "connected") {
    return res.status(409).json({ error: "session non connectee" });
  }
  if (!jid) {
    return res.status(400).json({ error: "numero destinataire invalide" });
  }
  if (!text) {
    return res.status(400).json({ error: "message vide" });
  }

  try {
    const [presence] = await entry.sock.onWhatsApp(jid).catch(() => []);
    if (presence && presence.exists === false) {
      return res.status(404).json({ error: "destinataire WhatsApp introuvable" });
    }

    const out = await entry.sock.sendMessage(jid, { text });
    const sendAt = Date.now();
    const msgId = out?.key?.id ?? `${sessionId}_${sendAt}_${Math.random().toString(36).slice(2, 8)}`;
    const peerPhone = jidToPhone(jid) ?? to;

    pushEvent(sessionId, {
      id: msgId,
      type: "message",
      direction: "out",
      sessionId,
      from: entry.phone ?? "",
      to: peerPhone,
      body: text,
      pushName: undefined,
      at: sendAt,
    });

    persistRuntimeWaMessage(sessionId, {
      sessionName: entry.pushname ?? sessionId,
      sessionPhone: entry.phone,
      sessionStatus: entry.status,
      peerPhone,
      peerName: undefined,
      direction: "out",
      body: text,
      at: sendAt,
    }).catch((persistErr) => {
      logger.warn({ persistErr, sessionId, peerPhone }, "Failed to persist outgoing /messages endpoint message to DB");
    });

    return res.json({
      ok: true,
      id: msgId,
      to: jid,
      status: "sent",
      at: sendAt,
    });
  } catch (err) {
    logger.error({ sessionId, to: jid, err }, "echec envoi message");
    return res.status(500).json({ error: "impossible d'envoyer le message" });
  }
});

app.post("/sessions/:id/logout", async (req, res) => {
  const entry = sessions.get(req.params.id);
  try {
    if (entry?.sock) {
      await entry.sock.logout().catch(() => { });
      entry.sock.end(undefined);
    }
  } catch (err) {
    logger.warn({ id: req.params.id, err }, "logout partiel");
  }
  sessions.delete(req.params.id);
  await fs.rm(path.join(AUTH_DIR, req.params.id), { recursive: true, force: true }).catch(() => { });
  res.json({ status: "disconnected" });
});

app.listen(PORT, () => {
  logger.info({ port: PORT, authDir: AUTH_DIR }, "MiraFlow Bridge démarré");
});

// ==== BACKGROUND WORKER: CAMPAIGNS ====
// Runs every 15 seconds to dispatch "running" campaigns over real WhatsApp.
async function tickCampaigns() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const runningCampaigns = await supabaseRest("/campaigns?status=eq.running&select=id,org_id,content,stats,audience");
    if (!Array.isArray(runningCampaigns)) return;

    for (const c of runningCampaigns) {
      if (!c || !c.stats) continue;

      const audience = (c.audience && typeof c.audience === "object") ? c.audience : {};
      const stats = (c.stats && typeof c.stats === "object") ? c.stats : {};

      const entry = findCampaignSendSession(audience.bridgeSessionId);
      if (!entry?.sock || entry.status !== "connected") continue;
      logger.info({
        campaignId: c.id,
        sessionPhone: entry.phone,
        pushname: entry.pushname,
        haithemUsed: normalizeDigits(entry.phone) === HAITHEM_PHONE_DIGITS,
      }, "[TICK] Campaign routed to sending session");

      const ratePerMin = Number(stats.ratePerMin || 15);
      const tickRate = Math.ceil(ratePerMin / 4); // rate for 15s interval
      const cursor = Number(stats.dispatchCursor || 0);
      const recipientIds = Array.isArray(audience.recipientIds) ? audience.recipientIds : [];

      if (cursor >= recipientIds.length && recipientIds.length > 0) {
        await supabaseRest(`/campaigns?id=eq.${c.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "done" })
        });
        continue;
      }

      const batchIds = recipientIds.slice(cursor, cursor + tickRate);
      if (batchIds.length === 0) continue;

      let sentCount = 0;
      let failedCount = 0;

      const cleanBatchIds = batchIds.join(',');
      const contacts = await supabaseRest(`/contacts?id=in.(${encodeURIComponent(cleanBatchIds)})&select=id,phone,name`);

      if (Array.isArray(contacts)) {
        for (const contactId of batchIds) {
          const contact = contacts.find(row => row.id === contactId);
          if (!contact || !contact.phone) {
            logger.warn({ contactId, found: !!contact, phone: contact?.phone }, "[TICK] Contact not found or missing phone");
            failedCount++;
            continue;
          }

          const jid = resolveSendJid(contact.phone);
          if (!jid) {
            logger.warn({ contactId, phone: contact.phone }, "[TICK] Invalid JID");
            failedCount++;
            continue;
          }

          let text = String(c.content ?? "").replace(/\{\{prenom\}\}/gi, (contact.name || "").split(' ')[0]);

          try {
            const [presence] = await entry.sock.onWhatsApp(jid).catch(() => []);
            if (presence && presence.exists === false) {
              failedCount++;
              continue;
            }
            const sendTs = Date.now();
            const out = await entry.sock.sendMessage(jid, { text });
            sentCount++;
            logger.info({ jid, campaignId: c.id }, "campaign message sent");

            const liveSessionId = Object.keys(Object.fromEntries(sessions.entries())).find(k => sessions.get(k) === entry);
            if (liveSessionId) {
              const msgId = out?.key?.id ?? `${liveSessionId}_${sendTs}_${Math.random().toString(36).slice(2, 8)}`;
              const peerPhone = jidToPhone(jid) ?? contact.phone;
              pushEvent(liveSessionId, {
                id: msgId,
                type: "message",
                direction: "out",
                sessionId: liveSessionId,
                from: entry.phone ?? "",
                to: peerPhone,
                body: text,
                pushName: undefined,
                at: sendTs,
              });
            }

            persistRuntimeMessageDirect(c.org_id, {
              sessionId: audience.bridgeSessionId ?? liveSessionId,
              sessionName: entry.pushname ?? entry.phone ?? "Session campagne",
              sessionPhone: entry.phone,
              sessionStatus: entry.status ?? "connected",
              contact: {
                id: contact.id,
                name: contact.name?.trim() || `Contact ${normalizeDigits(contact.phone).slice(-4)}`,
                phone: formatPhone(contact.phone),
                tags: ["WhatsApp"],
                consent: true,
                stage: "prospect",
                score: 0,
              },
              message: {
                direction: "out",
                body: text,
                at: sendTs,
                status: "sent",
              },
            }).catch((persistErr) => {
              logger.warn({ persistErr, campaignId: c.id, contactId: contact.id }, "Failed to persist outgoing campaign message to DB");
            });

            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch (err) {
            logger.error({ err, jid, campaignId: c.id }, "failed to send campaign msg");
            failedCount++;
          }
        }
      } else {
        logger.warn({ cleanBatchIds, contacts }, "[TICK] supabaseRest returned non-array for contacts");
        failedCount += batchIds.length;
      }

      const newCursor = cursor + batchIds.length;
      const newSent = Number(stats.sent || 0) + sentCount;
      const newFailed = Number(stats.failed || 0) + failedCount;

      await supabaseRest(`/campaigns?id=eq.${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          stats: {
            ...stats,
            dispatchCursor: newCursor,
            sent: newSent,
            failed: newFailed,
            delivered: newSent
          }
        })
      });
    }
  } catch (err) {
    logger.error({ err }, "tickCampaigns failed");
  }
}

setInterval(tickCampaigns, 15000);

const OPENAI_API_KEY = "sk-XuaBdA0QXNP3mafkjJr5q3bBbfIdmkRIyhzaOEZrxm7xwaqs";

// ==== BACKGROUND WORKER: AUTO-WAKE SESSIONS ====
async function autoWakeSessions() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const rows = await supabaseRest("/sessions_qr?status=eq.connected&select=device");
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const bridgeId = bridgeIdFromSessionRow(row);
        if (bridgeId && !sessions.has(bridgeId)) {
          logger.info({ bridgeId }, "Auto-waking connected session on boot");
          await startSession(bridgeId).catch(() => { });
        }
      }
    }
  } catch (e) {
    logger.error({ err: e }, "autoWakeSessions failed");
  }
}
autoWakeSessions();

const ROUTER_DEPARTMENTS = {
  commercial: {
    label: "Commercial",
    prompt: "Tu es l'agent Commercial. Tu gères les prospects, les devis, les remises sur volume, les demandes B2B et la negociation tarifaire."
  },
  vente: {
    label: "Vente",
    prompt: "Tu es l'agent Vente. Tu aides le client a choisir, tu expliques clairement l'offre et tu fais avancer la commande sans inventer d'informations."
  },
  achat: {
    label: "Achat",
    prompt: "Tu es l'agent Achat. Tu traites les questions fournisseurs, disponibilites d'approvisionnement et demandes d'achat internes."
  },
  livraison: {
    label: "Livraison",
    prompt: "Tu es l'agent Livraison. Tu aides sur le suivi de commande, l'adresse, les retards et les questions de distribution."
  },
  logistique: {
    label: "Logistique",
    prompt: "Tu es l'agent Logistique. Tu traites le stock, la disponibilite, la preparation et la coordination operationnelle."
  },
  paiement: {
    label: "Paiement",
    prompt: "Tu es l'agent Paiement. Tu geres facture, paiement, confirmation et points financiers sans jamais confirmer une operation sans preuve."
  },
  sav: {
    label: "SAV",
    prompt: "Tu es l'agent SAV. Tu traites les reclamations avec empathie, tu qualifies le probleme et tu proposes la prochaine etape la plus utile."
  },
  information: {
    label: "Information",
    prompt: "Tu es l'agent Information. Tu reponds aux questions generales sur l'entreprise, les horaires et les informations non sensibles."
  },
  human_support: {
    label: "Support humain",
    prompt: "Tu es l'agent de Support humain. Tu n'essaies pas de resoudre toi-meme un cas ambigu ou sensible: tu qualifies et tu transfers proprement."
  }
};

function containsArabicScript(text) {
  return /[\u0600-\u06FF]/.test(String(text ?? ""));
}

function detectReplyLanguage(text, preferredLanguage) {
  const preferred = String(preferredLanguage ?? "").trim();
  if (preferred) return preferred;

  const raw = String(text ?? "");
  const t = raw.toLowerCase();
  const tunisianLatin = /(aslema|slm|salam|salem|brabi|chnowa|chnowa|ch7al|n7eb|mte3i|mt3i|win|weslet|waktach|wa9tach|ya3mlouli|ena|mazel|mazel ma|livreur)/i;
  const german = /\b(ich|möchte|moechte|stück|stueck|preis|angebot|lieferung|rechnung|zahlung|bestellen|haben sie)\b/i;
  const english = /\b(hello|hi|price|order|delivery|invoice|payment|stock|support|quote|pieces)\b/i;

  if (containsArabicScript(raw)) return "ar-TN";
  if (tunisianLatin.test(t)) return "ar-TN";
  if (german.test(t)) return "de";
  if (english.test(t)) return "en";
  return "fr";
}

function extractRoutingEntities(text) {
  const raw = String(text ?? "");
  const quantityMatch = raw.match(/\b(\d+)\s*(pieces?|pi[eè]ces?|pcs?|units?|unit[eé]s?|stück|stueck)\b/i) || raw.match(/\b(\d+)\b/);
  const orderMatch = raw.match(/\b(?:cmd|commande|order|bestellung)[-:\s#]*([a-z0-9-]{3,})\b/i) || raw.match(/\b\d{4,}\b/);
  const productMatch = raw.match(/\b(?:modele|model|produit|product|article|ref)[-:\s#]*([a-z0-9][a-z0-9 _-]{1,40})\b/i);

  return {
    order_number: orderMatch ? String(orderMatch[1] ?? orderMatch[0]).trim() : null,
    quantity: quantityMatch ? Number(quantityMatch[1]) : null,
    product_hint: productMatch ? String(productMatch[1] ?? "").trim() : null,
  };
}

function detectUrgencyAndSentiment(text) {
  const t = String(text ?? "").toLowerCase();
  const urgent = /(urgent|vite|rapidement|aujourd'hui|today|asap|responsable|plainte|complaint|reclamation|chauffeur|retard|problem|probl[eè]me|mazel ma|waktach|wa9tach)/i.test(t);
  const negative = /(probl[eè]me|panne|cass[eé]|retard|reclamation|remboursement|angry|not happy|livreur|mazel ma|mech mawsel|mouch mawsel)/i.test(t);
  const positive = /(merci|thanks|perfect|parfait|top|good|super)/i.test(t);

  return {
    urgency: urgent ? "high" : "normal",
    sentiment: negative ? "negative" : (positive ? "positive" : "neutral"),
  };
}

function fallbackRouteAgentForText(text, context = {}) {
  const t = String(text ?? "").toLowerCase();
  const entities = extractRoutingEntities(text);
  const { urgency, sentiment } = detectUrgencyAndSentiment(text);
  const language = detectReplyLanguage(text, context?.state?.preferredLanguage || context?.customer?.preferredLanguage);

  let department = "information";
  let intent = "general_information";
  let confidence = 0.72;
  let humanRequired = false;

  if (/(human|humain|agent|conseiller|responsable|operator|support humain)/i.test(t)) {
    department = "human_support";
    intent = "human_handoff";
    confidence = 0.95;
    humanRequired = true;
  } else if (/(devis|quote|quotation|angebot|grossiste|gros|wholesale|meilleur prix|better price|remise|discount|50 stück|50 stueck|50 pieces)/i.test(t)) {
    department = "commercial";
    intent = "quote_negotiation";
    confidence = 0.9;
  } else if (/(livraison|delivery|colis|commande|order|bestellung|suivi|track|retard|livreur|weslet|waktach|wa9tach)/i.test(t)) {
    department = "livraison";
    intent = entities.order_number ? "delivery_tracking" : "delivery_question";
    confidence = entities.order_number ? 0.9 : 0.82;
  } else if (/(prix|price|combien|tarif|catalogue|catalog|acheter|buy|promo|promotion)/i.test(t)) {
    department = "vente";
    intent = "sales_inquiry";
    confidence = 0.84;
  } else if (/(stock|dispo|disponible|availability|available|preparation|logistique|warehouse)/i.test(t)) {
    department = "logistique";
    intent = "stock_check";
    confidence = 0.84;
  } else if (/(fournisseur|supplier|approvisionnement|procurement|achat)/i.test(t)) {
    department = "achat";
    intent = "procurement_request";
    confidence = 0.84;
  } else if (/(paiement|payment|facture|invoice|virement|versement|reglement|paid)/i.test(t)) {
    department = "paiement";
    intent = "payment_question";
    confidence = 0.86;
  } else if (/(sav|support|panne|cass[eé]|broken|retour|return|refund|remboursement|problem|probl[eè]me|reclamation)/i.test(t)) {
    department = "sav";
    intent = "support_request";
    confidence = 0.88;
    if (sentiment === "negative" && urgency === "high") humanRequired = true;
  }

  return {
    language,
    reply_language: language,
    intent,
    department,
    entities,
    urgency,
    sentiment,
    confidence,
    human_required: humanRequired,
  };
}

function sanitizeRouteAnalysis(candidate, fallback) {
  const department = String(candidate?.department ?? fallback.department).toLowerCase();
  const safeDepartment = ROUTER_DEPARTMENTS[department] ? department : fallback.department;
  const confidence = Number(candidate?.confidence);
  const language = detectReplyLanguage(candidate?.language || fallback.language, fallback.reply_language);
  const replyLanguage = detectReplyLanguage(candidate?.reply_language || language, fallback.reply_language);

  return {
    language,
    reply_language: replyLanguage,
    intent: String(candidate?.intent ?? fallback.intent),
    department: safeDepartment,
    entities: {
      ...fallback.entities,
      ...(candidate?.entities && typeof candidate.entities === "object" ? candidate.entities : {}),
    },
    urgency: String(candidate?.urgency ?? fallback.urgency) === "high" ? "high" : "normal",
    sentiment: ["positive", "negative", "neutral"].includes(String(candidate?.sentiment ?? "")) ? String(candidate.sentiment) : fallback.sentiment,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : fallback.confidence,
    human_required: Boolean(candidate?.human_required ?? fallback.human_required),
  };
}

async function routeAgentForText(text, context = {}) {
  const fallback = fallbackRouteAgentForText(text, context);

  if (!OPENAI_API_KEY) {
    return fallback;
  }

  try {
    const out = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + OPENAI_API_KEY },
      body: JSON.stringify({
        model: "moonshot-v1-8k",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are the central router for a multilingual WhatsApp CRM.",
              "Understand mixed French, English, German, Arabic, Tunisian Arabic, Latin Tunisian, and Arabizi.",
              "Return JSON only with keys: language, reply_language, intent, department, entities, urgency, sentiment, confidence, human_required.",
              "Valid department values: commercial, vente, achat, livraison, logistique, paiement, sav, information, human_support.",
              "Never answer the customer. Only classify and extract."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              text,
              customer: context?.customer ?? null,
              state: context?.state ?? null,
              recentMessages: Array.isArray(context?.recentMessages) ? context.recentMessages.slice(-8) : [],
            })
          }
        ]
      })
    });
    const data = await out.json();
    const rawContent = data?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(rawContent);
    return sanitizeRouteAnalysis(parsed, fallback);
  } catch (e) {
    logger.error({ err: e }, "AI Routing failed, using fallback");
    return fallback;
  }
}

async function buildCustomerAiContext(orgId, contactRow) {
  const context = {
    customer: {
      id: contactRow?.id ?? null,
      name: contactRow?.name ?? null,
      phone: contactRow?.phone ?? null,
      stage: contactRow?.stage ?? null,
      tags: Array.isArray(contactRow?.tags) ? contactRow.tags : [],
      preferredLanguage: null,
      score: 0,
      segment: null,
      consent_marketing: null,
      unsubscribed: false,
      notes: null,
      created_at: null,
    },
    state: {},
    recentMessages: [],
    conversation: null,
    extended: null,
  };

  if (!orgId || !contactRow?.id) return context;

  try {
    const conversations = await supabaseRest(
      `/conversations?org_id=eq.${orgId}&contact_id=eq.${contactRow.id}&select=id,last_message_at,created_at,status,unread_count,assignee_id&order=last_message_at.desc&limit=1`,
    );
    const conversationId = Array.isArray(conversations) && conversations[0]?.id ? conversations[0].id : null;
    const convRow = Array.isArray(conversations) ? (conversations[0] ?? null) : null;
    if (convRow) {
      context.conversation = {
        id: convRow.id,
        status: convRow.status ?? null,
        unread_count: Number(convRow.unread_count ?? 0),
        last_message_at: convRow.last_message_at ?? null,
        created_at: convRow.created_at ?? null,
        assignee_id: convRow.assignee_id ?? null,
      };
      context.state.conversation_id = convRow.id;
    }

    const extended = await lookupContactExtendedData(orgId, contactRow);
    if (extended) {
      context.extended = extended;
      context.customer.stage = extended.stage ?? context.customer.stage;
      context.customer.tags = Array.isArray(extended.tags) ? extended.tags : context.customer.tags;
      context.customer.score = extended.score;
      context.customer.segment = extended.segment;
      context.customer.consent_marketing = extended.consent_marketing;
      context.customer.unsubscribed = extended.unsubscribed;
      context.customer.notes = extended.notes;
      context.customer.created_at = extended.created_at;
    }

    if (!conversationId) return context;

    const recentMessages = await supabaseRest(
      `/messages?conversation_id=eq.${conversationId}&select=direction,body,created_at,status&order=created_at.desc&limit=12`,
    );
    const orderedMessages = Array.isArray(recentMessages) ? [...recentMessages].reverse() : [];
    context.recentMessages = orderedMessages.map((row) => ({
      direction: row.direction === "out" ? "out" : "in",
      body: String(row.body ?? "").trim(),
      created_at: row.created_at ?? null,
      status: row.status ?? null,
    })).filter((row) => row.body);

    const inboundText = context.recentMessages
      .filter((row) => row.direction === "in")
      .map((row) => row.body)
      .join(" ");
    const combined = `${inboundText} ${contactRow?.name ?? ""}`.trim();
    const entities = extractRoutingEntities(combined);

    context.customer.preferredLanguage = detectReplyLanguage(inboundText || contactRow?.name || "");
    context.state = {
      ...context.state,
      preferredLanguage: context.customer.preferredLanguage,
      order_number: entities.order_number ?? null,
      quantity: entities.quantity ?? null,
      product_hint: entities.product_hint ?? null,
      last_customer_message: context.recentMessages.length > 0 ? context.recentMessages[context.recentMessages.length - 1].body : null,
    };
  } catch (err) {
    logger.warn({ err, contactId: contactRow?.id }, "Failed to build customer AI context");
  }

  return context;
}

function departmentToAgentKey(department) {
  const d = String(department ?? "").toLowerCase();
  if (d === "commercial" || d === "vente") return "sales";
  if (d === "sav") return "support";
  if (d === "human_support") return "supervisor";
  if (d === "information") return "analyst";
  if (d === "paiement") return "support";
  if (d === "livraison" || d === "logistique") return "support";
  return "analyst";
}

async function findActiveAiAgent(orgId, department) {
  if (!orgId) return null;
  const key = departmentToAgentKey(department);
  const rows = await supabaseRest(
    `/ai_agents?org_id=eq.${orgId}&active=eq.true&key=eq.${encodeURIComponent(key)}&select=id,key,name,mode,threshold,config&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) ? (rows[0] ?? null) : null;
}

function extractLookupTokens(text, route, context) {
  const bag = new Set();
  const push = (value) => {
    const s = String(value ?? "").trim();
    if (!s) return;
    if (s.length < 3) return;
    bag.add(s);
  };

  push(route?.entities?.order_number);
  push(route?.entities?.product_hint);
  push(context?.state?.order_number);
  push(context?.state?.product_hint);

  for (const match of String(text ?? "").matchAll(/\b[a-z0-9-]{3,}\b/gi)) {
    const token = String(match[0] ?? "").trim();
    if (/^\d{1,2}$/.test(token)) continue;
    push(token);
    if (bag.size >= 8) break;
  }

  return Array.from(bag);
}

async function lookupInvoicesForRoute(orgId, text, route, context) {
  if (!orgId) return [];
  const candidates = extractLookupTokens(text, route, context);
  const hits = [];
  const seen = new Set();

  for (const token of candidates) {
    const rows = await supabaseRest(
      `/invoices?org_id=eq.${orgId}&number=ilike.${encodeURIComponent(`*${token}*`)}&select=id,number,amount,currency,status,created_at&period_start,period_end&order=created_at.desc&limit=3`
    ).catch(() => []);
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      hits.push(row);
      if (hits.length >= 5) return hits;
    }
  }

  return hits;
}

async function searchKnowledgeDocsForRoute(orgId, text, route, context) {
  if (!orgId) return [];
  const candidates = extractLookupTokens(text, route, context)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 4)
    .slice(0, 4);
  const hits = [];
  const seen = new Set();

  for (const token of candidates) {
    const rows = await supabaseRest(
      `/knowledge_docs?org_id=eq.${orgId}&title=ilike.${encodeURIComponent(`*${token}*`)}&select=id,title,type,status,version,chunks,created_at&order=created_at.desc&limit=5`
    ).catch(() => []);
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      hits.push(row);
      if (hits.length >= 5) return hits;
    }
  }

  return hits;
}

async function lookupContactExtendedData(orgId, contactRow) {
  if (!orgId || !contactRow?.id) return null;
  try {
    const rows = await supabaseRest(
      `/contacts?id=eq.${contactRow.id}&org_id=eq.${orgId}&select=id,org_id,phone,name,stage,score,tags,segment,consent_marketing,unsubscribed,notes,created_at&limit=1`
    ).catch(() => []);
    if (!Array.isArray(rows) || !rows[0]) return null;
    const c = rows[0];
    return {
      id: c.id,
      stage: c.stage ?? null,
      score: Number(c.score ?? 0),
      segment: c.segment ?? null,
      consent_marketing: Boolean(c.consent_marketing),
      unsubscribed: Boolean(c.unsubscribed),
      notes: String(c.notes ?? "").trim(),
      tags: Array.isArray(c.tags) ? c.tags : [],
      created_at: c.created_at ?? null,
    };
  } catch (err) {
    logger.warn({ err, contactId: contactRow?.id }, "lookupContactExtendedData failed");
    return null;
  }
}

async function lookupCustomerInvoicesByContact(orgId, contactRow, text, route, context) {
  if (!orgId || !contactRow?.id) return [];
  const direct = await lookupInvoicesForRoute(orgId, text, route, context);
  if (Array.isArray(direct) && direct.length > 0) return direct;
  const tokens = new Set();
  const nameWords = String(contactRow?.name ?? "").split(/\s+/).filter(w => w.length >= 3);
  for (const w of nameWords) tokens.add(w);
  const phoneTail = normalizeDigits(contactRow?.phone ?? "").slice(-4);
  if (phoneTail) tokens.add(phoneTail);
  if (tokens.size === 0) return [];
  const hits = [];
  const seen = new Set();
  for (const token of tokens) {
    const rows = await supabaseRest(
      `/invoices?org_id=eq.${orgId}&number=ilike.${encodeURIComponent(`*${token}*`)}&select=id,number,plan,amount,currency,status,period_start,period_end,created_at&order=created_at.desc&limit=3`
    ).catch(() => []);
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      hits.push(row);
      if (hits.length >= 5) return hits;
    }
  }
  return hits;
}

async function lookupCustomerCampaigns(orgId, contactRow) {
  if (!orgId || !contactRow?.id) return [];
  try {
    const contactIdStr = String(contactRow.id);
    const rows = await supabaseRest(
      `/campaigns?org_id=eq.${orgId}&status=in.(running,done,paused,stopped)&select=id,name,goal,status,stop_on_reply,stats,created_at,scheduled_at&order=created_at.desc&limit=20`
    ).catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const involved = [];
    for (const c of rows) {
      const audience = (c.audience && typeof c.audience === "object") ? c.audience : {};
      const recipientIdsRaw = Array.isArray(audience.recipientIds) ? audience.recipientIds : [];
      const recipientStrings = recipientIdsRaw.map(x => String(x));
      const stats = (c.stats && typeof c.stats === "object") ? c.stats : {};
      const repliedIds = Array.isArray(stats.replied_contact_ids) ? stats.replied_contact_ids.map(x => String(x)) : [];
      if (!recipientStrings.includes(contactIdStr) && !repliedIds.includes(contactIdStr)) continue;
      involved.push({
        id: c.id,
        name: c.name,
        goal: c.goal ?? null,
        status: c.status,
        scheduled_at: c.scheduled_at ?? null,
        created_at: c.created_at ?? null,
        repliesCount: Number(stats.replies ?? 0),
        contactReplied: repliedIds.includes(contactIdStr),
        stop_on_reply: Boolean(c.stop_on_reply),
      });
      if (involved.length >= 8) break;
    }
    return involved;
  } catch (err) {
    logger.warn({ err, contactId: contactRow?.id }, "lookupCustomerCampaigns failed");
    return [];
  }
}

async function lookupConversationStats(orgId, contactRow) {
  if (!orgId || !contactRow?.id) return null;
  try {
    const convs = await supabaseRest(
      `/conversations?org_id=eq.${orgId}&contact_id=eq.${contactRow.id}&select=id,status,unread_count,last_message_at,created_at,assignee_id&order=last_message_at.desc&limit=5`
    ).catch(() => []);
    if (!Array.isArray(convs) || convs.length === 0) return null;
    const primary = convs[0];
    let totalMessages = 0;
    let outCount = 0;
    let inCount = 0;
    const msgRows = await supabaseRest(
      `/messages?conversation_id=eq.${primary.id}&select=direction&limit=500`
    ).catch(() => []);
    if (Array.isArray(msgRows)) {
      totalMessages = msgRows.length;
      outCount = msgRows.filter(m => m.direction === "out").length;
      inCount = msgRows.filter(m => m.direction === "in").length;
    }
    return {
      conversation_id: primary.id,
      conversation_status: primary.status,
      unread_count: Number(primary.unread_count ?? 0),
      last_message_at: primary.last_message_at ?? null,
      conversation_created_at: primary.created_at ?? null,
      assignee_id: primary.assignee_id ?? null,
      total_conversations: convs.length,
      total_messages: totalMessages,
      messages_in: inCount,
      messages_out: outCount,
    };
  } catch (err) {
    logger.warn({ err, contactId: contactRow?.id }, "lookupConversationStats failed");
    return null;
  }
}

async function lookupRecentAiSuggestions(orgId, contactRow, conversationStats) {
  if (!orgId) return [];
  const convId = conversationStats?.conversation_id;
  try {
    const endpoint = convId
      ? `/ai_suggestions?org_id=eq.${orgId}&conversation_id=eq.${convId}&select=id,body,confidence,status,created_at,agent_id&order=created_at.desc&limit=5`
      : `/ai_suggestions?org_id=eq.${orgId}&select=id,body,confidence,status,created_at,agent_id&order=created_at.desc&limit=5`;
    const rows = await supabaseRest(endpoint).catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn({ err }, "lookupRecentAiSuggestions failed");
    return [];
  }
}

async function listActiveAiAgents(orgId) {
  if (!orgId) return [];
  try {
    const rows = await supabaseRest(
      `/ai_agents?org_id=eq.${orgId}&active=eq.true&select=id,key,name,mode,threshold,config`
    ).catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn({ err }, "listActiveAiAgents failed");
    return [];
  }
}

async function buildRouterToolsContext(orgId, contactRow, text, route, context) {
  const activeAgent = await findActiveAiAgent(orgId, route?.department);
  const invoices = await lookupCustomerInvoicesByContact(orgId, contactRow, text, route, context);
  const knowledgeDocs = ["information", "commercial", "vente", "logistique", "achat"].includes(String(route?.department ?? ""))
    ? await searchKnowledgeDocsForRoute(orgId, text, route, context)
    : [];
  const extendedContact = await lookupContactExtendedData(orgId, contactRow);
  const customerCampaigns = await lookupCustomerCampaigns(orgId, contactRow);
  const conversationStats = await lookupConversationStats(orgId, contactRow);
  const recentSuggestions = await lookupRecentAiSuggestions(orgId, contactRow, conversationStats);
  const allActiveAgents = await listActiveAiAgents(orgId);

  return {
    activeAgent: activeAgent ? {
      id: activeAgent.id,
      key: activeAgent.key,
      name: activeAgent.name,
      mode: activeAgent.mode,
      threshold: Number(activeAgent.threshold ?? 85),
      config: activeAgent.config ?? {},
    } : null,
    allActiveAgents: Array.isArray(allActiveAgents) ? allActiveAgents.map(a => ({
      id: a.id, key: a.key, name: a.name, mode: a.mode, threshold: Number(a.threshold ?? 85),
    })) : [],
    customerProfile: {
      id: contactRow?.id ?? null,
      name: contactRow?.name ?? null,
      phone: contactRow?.phone ?? null,
      tags: Array.isArray(contactRow?.tags) ? contactRow.tags : [],
      lastKnownLanguage: context?.customer?.preferredLanguage ?? null,
      recentMessageCount: Array.isArray(context?.recentMessages) ? context.recentMessages.length : 0,
      stage: extendedContact?.stage ?? contactRow?.stage ?? null,
      score: extendedContact?.score ?? 0,
      segment: extendedContact?.segment ?? null,
      consent_marketing: extendedContact?.consent_marketing ?? null,
      unsubscribed: extendedContact?.unsubscribed ?? false,
      notes: extendedContact?.notes ?? null,
      contact_created_at: extendedContact?.created_at ?? null,
    },
    invoices: Array.isArray(invoices) ? invoices : [],
    knowledgeDocs: Array.isArray(knowledgeDocs) ? knowledgeDocs : [],
    campaigns: Array.isArray(customerCampaigns) ? customerCampaigns : [],
    conversation: conversationStats ? {
      id: conversationStats.conversation_id,
      status: conversationStats.conversation_status,
      unread_count: conversationStats.unread_count,
      last_message_at: conversationStats.last_message_at,
      created_at: conversationStats.conversation_created_at,
      assignee_id: conversationStats.assignee_id,
      total_conversations: conversationStats.total_conversations,
      total_messages: conversationStats.total_messages,
      messages_in: conversationStats.messages_in,
      messages_out: conversationStats.messages_out,
    } : null,
    recentSuggestions: Array.isArray(recentSuggestions) ? recentSuggestions.map(s => ({
      id: s.id,
      status: s.status,
      confidence: Number(s.confidence ?? 0),
      created_at: s.created_at,
      agent_id: s.agent_id,
      preview: String(s.body ?? "").slice(0, 160),
    })) : [],
  };
}

async function persistAiSuggestionForRoute(orgId, route, context, toolsContext, answer, text) {
  if (!orgId || !route) return null;

  const threshold = Number(toolsContext?.activeAgent?.threshold ?? 85);
  const confidencePct = Number(route.confidence ?? 0) * 100;
  const needsHuman = Boolean(route.human_required) || confidencePct < threshold;

  const conversationId = context?.conversation?.id ?? context?.state?.conversation_id ?? toolsContext?.conversation?.id ?? null;
  const agentId = toolsContext?.activeAgent?.id ?? null;
  const department = String(route.department ?? "information").toLowerCase();

  const summaryBody = needsHuman
    ? buildTransferReply(route.reply_language || "fr")
    : String(answer ?? "").trim();

  const meta = {
    department,
    intent: route.intent ?? null,
    urgency: route.urgency ?? null,
    sentiment: route.sentiment ?? null,
    confidence_pct: confidencePct,
    threshold_agent: threshold,
    human_required: needsHuman,
    human_reason: route.human_required
      ? "flagged_by_router"
      : (confidencePct < threshold ? `below_agent_threshold_${threshold}` : null),
    entities: route.entities ?? null,
    customer_id: toolsContext?.customerProfile?.id ?? null,
    conversation_id: conversationId,
    matched_campaigns: Array.isArray(toolsContext?.campaigns) ? toolsContext.campaigns.map(c => c.id) : [],
    matched_invoices: Array.isArray(toolsContext?.invoices) ? toolsContext.invoices.map(i => i.id) : [],
    recent_suggestions_count: Array.isArray(toolsContext?.recentSuggestions) ? toolsContext.recentSuggestions.length : 0,
    incoming_preview: String(text ?? "").slice(0, 400),
  };

  try {
    const created = await supabaseRest("/ai_suggestions", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        org_id: orgId,
        conversation_id: conversationId,
        agent_id: agentId,
        body: summaryBody,
        confidence: Number(route.confidence ?? 0),
        status: needsHuman ? "pending" : "pending",
      }),
    }).catch((err) => {
      logger.warn({ err, orgId, department }, "Failed to persist AI suggestion");
      return [];
    });
    const suggestionId = Array.isArray(created) && created[0]?.id ? created[0].id : null;
    logger.info(
      { suggestionId, orgId, department, needsHuman, confidencePct, threshold, conversationId, agentId },
      needsHuman ? "AI handoff suggestion persisted" : "AI suggestion persisted for review"
    );
    return { suggestionId, needsHuman, threshold, confidencePct, meta };
  } catch (e) {
    logger.warn({ err: e, orgId, department }, "persistAiSuggestionForRoute crashed");
    return null;
  }
}

function buildTransferReply(replyLanguage) {
  if (replyLanguage === "ar-TN" || replyLanguage === "ar") {
    return "عسلامة. باش نحوّل طلبك لمستشار بش يتابع معاك بطريقة أدق، خاطر نحب نعطيك معلومة صحيحة ومؤكدة.";
  }
  if (replyLanguage === "de") {
    return "Gerne. Ich leite Ihre Anfrage an einen Berater weiter, damit Sie eine sichere und genaue Antwort bekommen.";
  }
  if (replyLanguage === "en") {
    return "Sure. I am forwarding your request to a human advisor so you get a precise and reliable answer.";
  }
  return "Bien reçu. Je transfere votre demande a un conseiller humain pour vous donner une reponse fiable et precise.";
}

function buildFallbackAnswer(text, route, context = {}) {
  const lang = route?.reply_language || "fr";
  const intent = route?.intent || "general_information";
  const invoice = Array.isArray(context?.tools?.invoices) ? context.tools.invoices[0] : null;

  if (route?.human_required || Number(route?.confidence ?? 0) < 0.6) {
    return buildTransferReply(lang);
  }

  if (lang === "ar-TN" || lang === "ar") {
    if (intent === "payment_question" && invoice?.number) {
      return `تثبتّلك الفاتورة ${invoice.number}. الحالة متاعها ${invoice.status ?? "غير مؤكدة"} والمبلغ ${invoice.amount ?? "غير متوفر"} ${invoice.currency ?? "TND"}.`;
    }
    if (intent === "delivery_tracking") return "عسلامة. ابعثلي رقم الطلب متاعك ونثبتلك وضعية التوصيل متاعها كي نتأكد من المعطيات.";
    if (intent === "sales_inquiry" || intent === "quote_negotiation") return "عسلامة. نجم نعاونك، اما ما نجمش نأكد سعر ولا stock من غير معطيات محدثة. ابعثلي اسم المنتج والكمية المطلوبة.";
    if (intent === "payment_question") return "عسلامة. نجّم نعاونك في موضوع الخلاص، اما يلزمني رقم الطلب ولا رقم الفاتورة باش نتحقق.";
    if (intent === "support_request") return "عسلامة. نحب نعاونك. ابعثلي رقم الطلب ووصف صغير للمشكل باش نوجّهك بالطريقة الصحيحة.";
    return "عسلامة. وضّحلي طلبك شوية، واذا فيه طلب ولا منتج ابعثلي المرجع متاعو باش نجاوبك بشكل صحيح.";
  }

  if (lang === "de") {
    if (intent === "payment_question" && invoice?.number) {
      return `Ich habe die Rechnung ${invoice.number} gefunden. Status: ${invoice.status ?? "unbestaetigt"}, Betrag: ${invoice.amount ?? "n/a"} ${invoice.currency ?? "TND"}.`;
    }
    if (intent === "delivery_tracking") return "Gerne. Senden Sie mir bitte Ihre Bestellnummer, damit ich den Lieferstatus korrekt pruefen kann.";
    if (intent === "sales_inquiry" || intent === "quote_negotiation") return "Gerne. Ich kann Ihnen helfen, aber ich bestaetige keinen Preis ohne aktuelle Daten. Bitte senden Sie Produkt und Menge.";
    if (intent === "payment_question") return "Bitte senden Sie mir die Bestell- oder Rechnungsnummer, damit ich den Zahlungspunkt sauber pruefen kann.";
    if (intent === "support_request") return "Beschreiben Sie mir bitte kurz das Problem und senden Sie wenn moeglich die Bestellnummer.";
    return "Gerne. Praezisieren Sie bitte kurz Ihre Anfrage, damit ich Sie richtig weiterleiten oder beantworten kann.";
  }

  if (lang === "en") {
    if (intent === "payment_question" && invoice?.number) {
      return `I found invoice ${invoice.number}. Status: ${invoice.status ?? "unconfirmed"}, amount: ${invoice.amount ?? "n/a"} ${invoice.currency ?? "TND"}.`;
    }
    if (intent === "delivery_tracking") return "Sure. Please send me your order number so I can check the delivery status properly.";
    if (intent === "sales_inquiry" || intent === "quote_negotiation") return "Sure. I can help, but I should not confirm price or stock without live data. Please send the product and quantity.";
    if (intent === "payment_question") return "Please send your order or invoice number so I can clarify the payment topic correctly.";
    if (intent === "support_request") return "Please share a short description of the issue and, if possible, your order number.";
    return "Sure. Please give me a bit more detail so I can help you correctly.";
  }

  if (intent === "payment_question" && invoice?.number) {
    return `J'ai retrouve la facture ${invoice.number}. Statut: ${invoice.status ?? "non confirme"}, montant: ${invoice.amount ?? "n/a"} ${invoice.currency ?? "TND"}.`;
  }
  if (intent === "delivery_tracking") return "Bien recu. Envoyez-moi votre numero de commande pour que je puisse verifier le suivi correctement.";
  if (intent === "sales_inquiry" || intent === "quote_negotiation") return "Je peux vous aider, mais je ne dois pas confirmer un prix ou un stock sans donnees a jour. Envoyez-moi le produit et la quantite souhaitee.";
  if (intent === "payment_question") return "Envoyez-moi le numero de commande ou de facture, et je clarifierai le point de paiement avec des informations fiables.";
  if (intent === "support_request") return "Je suis la pour vous aider. Decrivez-moi brievement le probleme et ajoutez si possible le numero de commande.";
  return `J'ai bien recu votre message. Precisez-moi juste le besoin principal pour que je vous reponde correctement: ${String(text ?? "").slice(0, 80)}`;
}

function buildAgentPrompt(route, context) {
  const specialist = ROUTER_DEPARTMENTS[route.department] || ROUTER_DEPARTMENTS.information;
  const tools = context?.tools ?? {};
  const toolsBrief = [];

  if (Array.isArray(tools.invoices) && tools.invoices.length > 0) {
    toolsBrief.push(`FACTURES TROUVEES (${tools.invoices.length}): ${JSON.stringify(tools.invoices.slice(0, 3))}`);
  }
  if (Array.isArray(tools.campaigns) && tools.campaigns.length > 0) {
    toolsBrief.push(`CAMPAGNES CLIENT (${tools.campaigns.length}): ${JSON.stringify(tools.campaigns.slice(0, 3))}`);
  }
  if (tools.conversation) {
    toolsBrief.push(`RESUME_CONVERSATION: ${JSON.stringify(tools.conversation)}`);
  }
  if (Array.isArray(tools.recentSuggestions) && tools.recentSuggestions.length > 0) {
    toolsBrief.push(`SUGGESTIONS_RECENTES (${tools.recentSuggestions.length})`);
  }
  if (Array.isArray(tools.knowledgeDocs) && tools.knowledgeDocs.length > 0) {
    toolsBrief.push(`DOCS_BASE_CONNAISSANCE (${tools.knowledgeDocs.length}): ${JSON.stringify(tools.knowledgeDocs.slice(0, 2))}`);
  }
  if (tools.activeAgent) {
    toolsBrief.push(`AGENT_ACTIF: ${JSON.stringify({ key: tools.activeAgent.key, name: tools.activeAgent.name, mode: tools.activeAgent.mode, threshold: tools.activeAgent.threshold })}`);
  }

  return [
    "Tu es un agent intelligent de service client utilisé dans une application de communication WhatsApp professionnelle.",
    "",
    "## Objectif",
    "Comprendre précisément le besoin du client et l'orienter vers le service approprié :",
    "* commercial ;",
    "* vente ;",
    "* achat ;",
    "* logistique ;",
    "* livraison ;",
    "* paiement ;",
    "* service après-vente ;",
    "* support ;",
    "* information générale.",
    "",
    "## Directives Spécifiques",
    specialist.prompt,
    "",
    "## Langues",
    "Tu dois comprendre et utiliser naturellement :",
    "* français ;",
    "* anglais ;",
    "* allemand ;",
    "* arabe standard ;",
    "* arabe tunisien ;",
    "* tunisien écrit avec l'alphabet latin ;",
    "* Arabizi utilisant notamment 2, 3, 5, 7 et 9 ;",
    "* les messages mélangeant plusieurs langues.",
    "",
    "Ne corrige pas inutilement la langue du client.",
    "Réponds normalement dans la langue ou le dialecte principalement utilisé par le client, sauf demande contraire.",
    `Langue principale détectée du client : ${route.reply_language || "fr"}`,
    "",
    "## Règles fondamentales",
    "Ne jamais inventer :",
    "* un prix ;",
    "* une promotion ;",
    "* un stock ;",
    "* une disponibilité ;",
    "* un délai ;",
    "* un état de commande ;",
    "* une livraison ;",
    "* une facture ;",
    "* un paiement ;",
    "* une garantie ;",
    "* une politique commerciale ;",
    "* une information concernant un client.",
    "",
    "Pour toutes les informations dynamiques, utilise obligatoirement les outils ou données mis à ta disposition.",
    "Si l'information n'est pas disponible, indique clairement que tu ne peux pas la confirmer.",
    "",
    "## Compréhension du contexte",
    "Analyse les messages précédents afin de comprendre les références telles que :",
    "* celui-ci ;",
    "* le même ;",
    "* en noir ;",
    "* deux autres ;",
    "* la commande ;",
    "* mon produit ;",
    "* combien pour cinq ;",
    "* وقتاش توصل ;",
    "* موجودة ;",
    "* نفس السلعة.",
    "",
    "Ne demande pas au client une information qu'il a déjà donnée dans la conversation.",
    "",
    "## Style",
    "Sois professionnel, naturel, concis et serviable.",
    "Évite les réponses robotiques.",
    "Adapte le niveau de langage au client.",
    "Pour le tunisien, utilise un tunisien naturel et compréhensible.",
    "",
    "## Outils",
    "Lorsque la demande concerne des données réelles de l'entreprise, utilise les fonctions disponibles avant de répondre.",
    "Exemples : recherche produit ; prix ; stock ; client ; commande ; paiement ; livraison ; devis ; support.",
    "",
    toolsBrief.length > 0 ? `RESULTATS DES OUTILS METIER EN BASE REELS (fiables, utilise-les d'abord) : ${toolsBrief.join(" | ")}` : "Aucun résultat d'outil métier attaché.",
    "",
    "## Sécurité commerciale",
    "Ne confirme jamais une opération importante uniquement à partir d'une supposition.",
    "Avant une opération sensible telle qu'une annulation, une modification d'adresse, un remboursement ou une modification importante de commande, vérifie les informations nécessaires.",
    "",
    "## Transfert humain",
    "Transfère la conversation à un opérateur humain lorsque :",
    "* le client le demande ;",
    "* le niveau de confiance est insuffisant ;",
    "* une réclamation importante est détectée ;",
    "* une autorisation humaine est nécessaire ;",
    "* aucune information fiable n'est disponible ;",
    "* la situation sort de ton périmètre.",
    "",
    "L'objectif n'est pas de répondre à tout prix.",
    "L'objectif est de donner une réponse correcte et utile.",
    "",
    route.human_required || route.confidence < 0.6
      ? "🚨 ALERTE : Le cas doit être transféré à un humain. Réponds en annonçant ce transfert calmement au client."
      : "Si l'information manque, pose uniquement la question minimale nécessaire, après avoir vérifié les outils.",
    "",
    "## État actuel du système",
    `Routage courant : ${JSON.stringify(route)}`,
    `Contexte client : ${JSON.stringify(context ?? {})}`,
  ].join("\n");
}

async function craftAnswer(text, route, context) {
  if (!OPENAI_API_KEY) {
    return buildFallbackAnswer(text, route, context);
  }

  const tools = context?.tools ?? {};
  const hasAnyToolHit = (
    (Array.isArray(tools.invoices) && tools.invoices.length > 0)
    || (Array.isArray(tools.campaigns) && tools.campaigns.length > 0)
    || (Array.isArray(tools.knowledgeDocs) && tools.knowledgeDocs.length > 0)
    || Boolean(tools.conversation)
    || (Array.isArray(tools.recentSuggestions) && tools.recentSuggestions.length > 0)
  );

  try {
    const out = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + OPENAI_API_KEY },
      body: JSON.stringify({
        model: "moonshot-v1-8k",
        temperature: route?.human_required ? 0.2 : 0.4,
        messages: [
          { role: "system", content: buildAgentPrompt(route, context) },
          {
            role: "user",
            content: JSON.stringify({
              message: text,
              instruction: hasAnyToolHit
                ? "Des resultats d'outils metier reels (factures, campagnes, conversation, docs connaissance) sont joints dans le contexte systeme. Base ta reponse exclusivement sur ces donnees reelles. Si une info manque malgre les outils, pose uniquement la question minimale."
                : "Aucun resultat d'outil metier n'est attache a cette requete. Si la reponse depend de donnees metier dynamiques (factures, livraison, stock, campagnes), dis que tu ne peux pas confirmer et pose uniquement la question minimale.",
              tools_attached: hasAnyToolHit ? {
                invoices_count: Array.isArray(tools.invoices) ? tools.invoices.length : 0,
                campaigns_count: Array.isArray(tools.campaigns) ? tools.campaigns.length : 0,
                knowledge_count: Array.isArray(tools.knowledgeDocs) ? tools.knowledgeDocs.length : 0,
                has_conversation: Boolean(tools.conversation),
                suggestions_count: Array.isArray(tools.recentSuggestions) ? tools.recentSuggestions.length : 0,
              } : null,
            })
          }
        ]
      })
    });
    const data = await out.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    return content || buildFallbackAnswer(text, route, context);
  } catch (e) {
    logger.warn({ err: e }, "AI answer generation failed, using fallback");
    return buildFallbackAnswer(text, route, context);
  }
}

const HAITHEM_PHONE_DIGITS = "21658746997";

function findHaithemSession() {
  let idMatch = null;
  let nameMatch = null;
  let firstConnected = null;
  for (const [id, s] of sessions.entries()) {
    if (s.status === "connected" && s.sock) {
      if (id === "haithem_kalia" || id === "haithem" || id === "s_haithem") {
        idMatch = s;
      }
      const pn = String(s.pushname ?? "").toLowerCase();
      if (pn.includes("haithem") || pn.includes("kalia")) {
        nameMatch = s;
      }
      if (!firstConnected) firstConnected = s;
    }
  }
  return idMatch ?? nameMatch ?? firstConnected;
}

function findReplySession(fallbackEntry) {
  const haithem = findHaithemSession();
  if (haithem) return haithem;
  return fallbackEntry;
}

function findCampaignSendSession(audienceBridgeSessionId) {
  const haithem = findHaithemSession();
  if (haithem) return haithem;
  if (audienceBridgeSessionId) {
    const byId = sessions.get(audienceBridgeSessionId);
    if (byId && byId.status === "connected" && byId.sock) return byId;
  }
  for (const [id, s] of sessions.entries()) {
    if (s.status === "connected" && s.sock) return s;
  }
  return null;
}

function formatPhoneVariants(raw) {
  const d = normalizeDigits(raw);
  if (!d) return [];
  const variants = new Set();
  variants.add("+" + d);
  variants.add(d);
  if (d.length === 11 && d.startsWith("1")) {
    variants.add("+1 (" + d.slice(1, 4) + ") " + d.slice(4, 7) + "-" + d.slice(7));
    variants.add("+1 " + d.slice(1, 4) + " " + d.slice(4, 7) + " " + d.slice(7));
  }
  if (d.startsWith("216") && d.length === 11) {
    variants.add("+216 " + d.slice(3, 5) + " " + d.slice(5, 8) + " " + d.slice(8));
    variants.add("+216" + d.slice(3));
  }
  if (d.length === 8) {
    variants.add("+216 " + d.slice(0, 2) + " " + d.slice(2, 5) + " " + d.slice(5));
    variants.add("+216" + d);
    variants.add("216" + d);
  }
  if (d.startsWith("33") && d.length === 11) {
    variants.add("+33 " + d.slice(3, 4) + " " + d.slice(4, 6) + " " + d.slice(6, 8) + " " + d.slice(8, 10) + " " + d.slice(10));
  }
  variants.add(d.replace(/^(\d{3})(\d{2})(\d{3})(\d{3})$/, "+$1 $2 $3 $4"));
  return Array.from(variants);
}

async function processIncomingMessageForCampainsAndAI(entry, text, phone, originalRemoteJid) {
  if (!SUPABASE_SERVICE_ROLE_KEY || !text || text.length < 2) return;

  const phoneDigits = normalizeDigits(phone);
  const orgId = await findAnyOrgId();

  let guaranteedContactRow = null;
  if (orgId && phoneDigits) {
    try {
      guaranteedContactRow = await ensureContactRow(orgId, {
        name: `Contact ${phoneDigits.slice(-4)}`,
        phone: formatPhone(phoneDigits),
        tags: ["WhatsApp"],
        consent: true,
        stage: "prospect",
        score: 0,
      });
    } catch (e) {
      logger.warn({ err: e, phoneDigits }, "Could not ensure contact row");
    }
  }

  let preferredCampaignContactId = guaranteedContactRow?.id ?? null;

  try {
    const campaigns = await supabaseRest("/campaigns?status=in.(running,done,paused,stopped)&select=id,audience,stop_on_reply,stats");

    const allMatchingContactIds = new Set();
    if (guaranteedContactRow?.id) {
      allMatchingContactIds.add(guaranteedContactRow.id);
    }
    if (orgId && phoneDigits) {
      const variants = formatPhoneVariants(phoneDigits);
      if (variants.length > 0) {
        const params = variants.map(v => `"${encodeURIComponent(v)}"`).join(",");
        const contacts = await supabaseRest(`/contacts?org_id=eq.${orgId}&phone=in.(${params})&select=id,phone`);
        if (Array.isArray(contacts)) {
          for (const c of contacts) {
            if (c?.id && normalizeDigits(c.phone) === phoneDigits) {
              allMatchingContactIds.add(c.id);
            }
          }
        }
      }
    }

    const contactIdsArr = Array.from(allMatchingContactIds);
    if (contactIdsArr.length > 0) {
      preferredCampaignContactId = contactIdsArr[0];
      if (orgId && (!guaranteedContactRow || String(guaranteedContactRow.id) !== String(preferredCampaignContactId))) {
        try {
          const canonicalFromCampaign = await ensureContactRow(orgId, {
            id: preferredCampaignContactId,
            name: `Contact ${phoneDigits.slice(-4)}`,
            phone: formatPhone(phoneDigits),
            tags: ["WhatsApp"],
            consent: true,
            stage: "prospect",
            score: 0,
          });
          if (canonicalFromCampaign?.id) {
            guaranteedContactRow = canonicalFromCampaign;
            logger.info({ phone: phoneDigits, oldId: guaranteedContactRow?.id, forcedId: preferredCampaignContactId }, "Canonical contact id re-synced to campaign recipient");
          }
        } catch (e) {
          logger.warn({ err: e, preferredCampaignContactId }, "Failed to re-sync to campaign contact id");
        }
      }
      logger.info({ phone: phoneDigits, matchingContactIds: contactIdsArr.length, preferredId: preferredCampaignContactId }, "processIncomingMessageForCampainsAndAI: matching contact ids for campaign reply");
    } else {
      logger.warn({ phone: phoneDigits, orgId }, "processIncomingMessageForCampainsAndAI: no matching contact id found for campaign reply tracking");
    }

    if (contactIdsArr.length > 0 && Array.isArray(campaigns)) {
      const contactIdsSet = new Set(contactIdsArr.map(x => String(x)));
      for (const c of campaigns) {
        const audience = (c.audience && typeof c.audience === "object") ? c.audience : {};
        const recipientIdsRaw = Array.isArray(audience.recipientIds) ? audience.recipientIds : [];
        const recipientIdsAsStrings = recipientIdsRaw.map(x => String(x));

        let matchedId = contactIdsArr.find(id => recipientIdsAsStrings.includes(String(id)));
        let matchReason = matchedId ? "by-id" : null;

        if (!matchedId && orgId && phoneDigits) {
          try {
            if (recipientIdsAsStrings.length > 0 && recipientIdsAsStrings.length <= 5000) {
              const batchParam = recipientIdsAsStrings.map(x => `"${encodeURIComponent(x)}"`).join(",");
              const recipientRows = await supabaseRest(
                `/contacts?id=in.(${batchParam})&select=id,phone&limit=${recipientIdsAsStrings.length}`
              ).catch(() => []);
              if (Array.isArray(recipientRows) && recipientRows.length > 0) {
                const matchByPhone = recipientRows.find(r => normalizeDigits(r.phone) === phoneDigits);
                if (matchByPhone?.id) {
                  matchedId = matchByPhone.id;
                  matchReason = "by-phone";
                  if (!contactIdsSet.has(String(matchedId))) {
                    contactIdsArr.push(String(matchedId));
                    contactIdsSet.add(String(matchedId));
                  }
                }
                logger.info({
                  campaignId: c.id,
                  recipientIds: recipientIdsAsStrings.slice(0, 50),
                  recipientPhones: recipientRows.slice(0, 10).map(r => ({ id: r.id, phone: r.phone })),
                  inputPhone: phoneDigits,
                  foundIds: contactIdsArr,
                  matchByPhone: !!matchedId && matchReason === "by-phone"
                }, "[REPLY-TRACKING] Phone fallback audit");
              }
            }
          } catch (e) {
            logger.warn({ err: e, campaignId: c.id }, "[REPLY-TRACKING] phone fallback failed");
          }
        }

        if (!matchedId) {
          logger.warn({
            campaignId: c.id,
            contactIds: contactIdsArr,
            recipientIdsFirst10: recipientIdsAsStrings.slice(0, 10),
            recipientIdsTotal: recipientIdsAsStrings.length,
            phone: phoneDigits,
          }, "[REPLY-TRACKING] NO MATCH — skipping campaign reply increment");
          continue;
        }

        const stats = c.stats || {};
        const existingReplies = Number(stats.replies || 0);
        const repliedContactIdsAsStrings = Array.isArray(stats.replied_contact_ids) ? stats.replied_contact_ids.map(x => String(x)) : [];
        const alreadyReplied = repliedContactIdsAsStrings.includes(String(matchedId));
        const newRepliedIds = alreadyReplied ? repliedContactIdsAsStrings : [...repliedContactIdsAsStrings, String(matchedId)];

        const newStats = { ...stats, replies: alreadyReplied ? existingReplies : (existingReplies + 1), replied_contact_ids: newRepliedIds };
        const patchBody = { stats: newStats };
        if (c.stop_on_reply) {
          logger.info({ campaignId: c.id, phone: phoneDigits, matchedId, matchReason }, "Stopping campaign for contact due to reply");
          const newRecipientIds = recipientIdsRaw.filter(id => !contactIdsSet.has(String(id)));
          patchBody.audience = { ...audience, recipientIds: newRecipientIds };
        } else {
          logger.info({ campaignId: c.id, phone: phoneDigits, matchedId, matchReason, before: existingReplies, after: newStats.replies, alreadyReplied }, "Tracking reply for campaign");
        }
        await supabaseRest(`/campaigns?id=eq.${c.id}`, {
          method: "PATCH",
          body: JSON.stringify(patchBody)
        }).then(resp => {
          logger.info({ campaignId: c.id, newReplies: newStats.replies, respType: Array.isArray(resp) ? "array:" + resp.length : typeof resp }, "[REPLY-TRACKING] PATCH response");
          return resp;
        }).catch(err => logger.warn({ err, campaignId: c.id }, "failed to patch campaign reply stats"));
      }
    }
  } catch (e) {
    logger.warn({ err: e, phone: phoneDigits }, "processIncomingMessageForCampainsAndAI reply tracking failed");
  }

  setTimeout(async () => {
    try {
      const replyEntry = findReplySession(entry);
      const replySessionId = replyEntry === entry ? "same" : (replyEntry?.phone ?? "haithem");
      const aiContext = await buildCustomerAiContext(orgId, guaranteedContactRow);
      const route = await routeAgentForText(text, aiContext);
      const toolsContext = await buildRouterToolsContext(orgId, guaranteedContactRow, text, route, aiContext);
      const effectiveRoute = {
        ...route,
        human_required: Boolean(route?.human_required)
          || (Number(route?.confidence ?? 0) * 100) < Number(toolsContext?.activeAgent?.threshold ?? 85),
      };
      const fullContext = {
        ...aiContext,
        tools: toolsContext,
      };
      const answer = await craftAnswer(text, effectiveRoute, fullContext);
      const resolvedJid = resolveSendJid(phone, originalRemoteJid);
      logger.info({
        phone,
        route: effectiveRoute,
        toolsContext,
        text,
        replySessionId,
        contactId: guaranteedContactRow?.id,
        originalRemoteJid: originalRemoteJid || null,
        resolvedJid
      }, "Message routed to central router — preparing send");

      if (!replyEntry?.sock) {
        logger.error({ phone }, "Aucune session disponible pour envoi réponse IA");
        return;
      }
      if (!resolvedJid) {
        logger.error({ phone, originalRemoteJid }, "Aucun JID résolu pour envoi réponse IA");
        return;
      }
      const aiSendTs = Date.now();
      const agentMode = toolsContext?.activeAgent?.mode ?? "suggestion";
      const isAutonome = agentMode === "autonome";
      const transferReply = buildTransferReply(effectiveRoute.reply_language || "fr");
      const rawAnswer = answer;
      const finalAnswer = (effectiveRoute.human_required && !isAutonome) ? transferReply : answer;
      const sendAttempt = await replyEntry.sock.sendMessage(resolvedJid, { text: finalAnswer }).catch(sendErr => {
        logger.error({ sendErr, resolvedJid, fallback: toJid(phone) }, "Échec sendMessage sur JID résolu");
        return null;
      });
      let fallbackSent = false;
      if (!sendAttempt && isValidRemoteJid(toJid(phone)) && toJid(phone) !== resolvedJid) {
        logger.warn({ phone, resolvedJid, fallback: toJid(phone) }, "Retry sendMessage with fallback toJid");
        const fbResult = await replyEntry.sock.sendMessage(toJid(phone), { text: finalAnswer }).catch(fbErr => {
          logger.error({ fbErr, fallback: toJid(phone) }, "Même le fallback @s.whatsapp.net a échoué");
          return null;
        });
        fallbackSent = !!fbResult;
      }
      const aiMsgId = (sendAttempt || fallbackSent) ? ((sendAttempt ?? fallbackSent)?.key?.id ?? `ai_reply_${aiSendTs}_${Math.random().toString(36).slice(2, 8)}`) : `ai_reply_${aiSendTs}_${Math.random().toString(36).slice(2, 8)}`;
      const aiPeerPhone = jidToPhone(resolvedJid) ?? phoneDigits;
      const replyBridgeSessionIdForEvent = Object.keys(Object.fromEntries(sessions.entries())).find(k => sessions.get(k) === replyEntry) ?? "haithem_reply";
      if (sendAttempt || fallbackSent) {
        pushEvent(replyBridgeSessionIdForEvent, {
          id: aiMsgId,
          type: "message",
          direction: "out",
          sessionId: replyBridgeSessionIdForEvent,
          from: replyEntry.phone ?? "",
          to: aiPeerPhone,
          body: finalAnswer,
          pushName: undefined,
          at: aiSendTs,
        });
      }
      await persistAiSuggestionForRoute(orgId, effectiveRoute, fullContext, toolsContext, rawAnswer, text);
      logger.info(
        { phone, route: effectiveRoute, replySessionId, resolvedJid, agentMode, overridden: finalAnswer !== rawAnswer, isAutonome },
        "Specialized AI agent sent answer via HAITHEM session"
      );

      if (orgId && phoneDigits) {
        const replyBridgeSessionId = Object.keys(Object.fromEntries(sessions.entries())).find(k => sessions.get(k) === replyEntry) ?? "haithem_reply";
        persistRuntimeMessageDirect(orgId, {
          sessionId: replyBridgeSessionId,
          sessionName: replyEntry.pushname ?? replyEntry.phone ?? "Session IA",
          sessionPhone: replyEntry.phone,
          sessionStatus: replyEntry.status ?? "connected",
          contact: {
            id: guaranteedContactRow?.id ?? preferredCampaignContactId ?? undefined,
            name: guaranteedContactRow?.name ?? `Contact ${phoneDigits.slice(-4)}`,
            phone: formatPhone(phoneDigits),
            tags: ["WhatsApp"],
            consent: true,
            stage: "prospect",
            score: 0,
          },
          message: {
            direction: "out",
            body: finalAnswer,
            at: aiSendTs,
            status: "sent",
          },
        }).catch((persistErr) => {
          logger.warn({ persistErr, phoneDigits }, "Failed to persist AI answer to DB");
        });
      }
    } catch (e) {
      logger.error({ err: e }, "AI orchestration failed");
    }
  }, 1000);
}
