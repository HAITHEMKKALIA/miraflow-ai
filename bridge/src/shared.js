/**
 * MiraFlow Bridge — module partagé : configuration, logger, état sessions,
 * helpers JID/téléphone et couche de persistance Supabase.
 * (Extrait de index.js pour contourner la limite de taille des push API.)
 */
import pino from "pino";

// Organisation par défaut quand le client n'en précise pas (rétro-compatibilité API)
export const DEFAULT_ORG_ID = "default";
export const SUPABASE_URL = String(process.env.SUPABASE_URL || "https://yifjcvwhmdycpsvldlzo.supabase.co").replace(/\/+$/, "");
export const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

export const logger = pino({ level: process.env.LOG_LEVEL || "info" });

/** @typedef {"qr_pending"|"connecting"|"connected"|"disconnected"} Status */

/**
 * sessions en mémoire :
 * Map<sessionId, { status, qr?, phone?, pushname?, sock?, retryCount, events? }>
 */
export const sessions = new Map();

export const phoneToValidRemoteJid = new Map();
export const remoteJidToPhoneCanonical = new Map();

export const HAITHEM_PHONE_DIGITS = "21658746997";
export function isValidRemoteJid(jid) {
  const s = String(jid ?? "");
  if (!s) return false;
  if (s.endsWith("@g.us") || s === "status@broadcast") return false;
  if (s.endsWith("@s.whatsapp.net")) return true;
  if (s.endsWith("@lid")) return true;
  return false;
}

export function registerJidPhonePairing(jid, phoneDigits) {
  if (!isValidRemoteJid(jid)) return;
  const key = normalizeDigits(phoneDigits);
  if (!key) return;
  phoneToValidRemoteJid.set(key, jid);
  remoteJidToPhoneCanonical.set(String(jid).toLowerCase(), key);
}

export function resolveSendJid(phone, preferredRemoteJid) {
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

export function looksLikeValidPhone(d) {
  if (!d || d.length < 8 || d.length > 13) return false;
  if (!/^[1-9]/.test(d)) return false;
  if (d.startsWith("216") && d.length === 11) return true;
  if (d.startsWith("33") && d.length === 11) return true;
  if (d.startsWith("1") && d.length === 11 && /^1[2-9]/.test(d)) return true;
  if (d.length === 8) return true;
  return d.length >= 9 && d.length <= 13;
}

export function extractValidPhoneSegment(digits) {
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

export function normalizeDigits(raw) {
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

export function toJid(raw) {
  const digits = normalizeDigits(raw);
  return digits ? `${digits}@s.whatsapp.net` : "";
}

export function formatPhone(raw) {
  const digits = normalizeDigits(raw);
  return digits ? `+${digits}` : "";
}

export function jidToPhone(raw) {
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
export async function jidToPhoneWithFallback(rawJid) {
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

export function toMs(value) {
  const n = Number(value ?? Date.now());
  if (!Number.isFinite(n)) return Date.now();
  return n < 1_000_000_000_000 ? n * 1000 : n;
}

export function getMessageText(message) {
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

export function pushEvent(sessionId, event) {
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


export function getEntry(id, organizationId = DEFAULT_ORG_ID) {
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

export function orgSlug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "org";
}

export async function supabaseRest(endpoint, init = {}) {
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

export async function findOrgId(orgName) {
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
export async function findAnyOrgId() {
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

export async function ensureSessionRow(orgId, sessionName, phone, status, bridgeSessionId, sessionType) {
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

export function normalizeContactStage(value) {
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

export function mapSessionStatus(value) {
  const status = String(value ?? "").toLowerCase();
  if (status === "connected") return "connected";
  if (status === "unstable") return "unstable";
  return "disconnected";
}

export function bridgeIdFromSessionRow(row) {
  const device = String(row?.device ?? "");
  const match = device.match(/bridge:([^|]+)/);
  if (match) return match[1];
  return null;
}

export function typeFromSessionRow(row) {
  const device = String(row?.device ?? "");
  const match = device.match(/type:([^|]+)/);
  if (match) return match[1];
  return "principal";
}

export async function ensureContactRow(orgId, contact) {
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

export async function ensureConversationRow(orgId, contactId, sessionRowId, at, status) {
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

export async function persistRuntimeMessageDirect(orgId, opts) {
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

export async function persistRuntimeMessage(payload) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return { ok: false, reason: "supabase_not_configured" };

  const orgId = await findOrgId(payload?.orgName);
  if (!orgId) return { ok: false, reason: "org_not_found" };

  return persistRuntimeMessageDirect(orgId, payload);
}

export async function persistRuntimeWaMessage(bridgeSessionId, opts) {
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

export async function persistRuntimeContact(payload) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return { ok: false, reason: "supabase_not_configured" };

  const orgId = await findOrgId(payload?.orgName);
  if (!orgId) return { ok: false, reason: "org_not_found" };

  const contactRow = await ensureContactRow(orgId, payload?.contact);
  return { ok: !!contactRow?.id };
}

export async function persistRuntimeSession(payload) {
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

export function toCampaignStatus(value, fourEyes) {
  const status = String(value ?? "draft").toLowerCase();
  if (fourEyes && status === "draft") return "review";
  if (["draft", "scheduled", "running", "paused", "done", "stopped"].includes(status)) return status;
  return "draft";
}

export function toDbCampaignStatus(value) {
  const status = String(value ?? "draft").toLowerCase();
  if (status === "review") return "draft";
  if (["draft", "scheduled", "running", "paused", "done", "stopped"].includes(status)) return status;
  return "draft";
}

export function hourToPgTime(hour, fallback) {
  const n = Number(hour);
  const safe = Number.isFinite(n) ? Math.max(0, Math.min(23, Math.trunc(n))) : fallback;
  return `${String(safe).padStart(2, "0")}:00:00`;
}

export async function persistRuntimeCampaign(payload) {
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


export function formatPhoneVariants(raw) {
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
