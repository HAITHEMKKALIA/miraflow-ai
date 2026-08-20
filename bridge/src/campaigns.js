/**
 * MiraFlow Bridge — campagnes WhatsApp + orchestration des messages entrants
 * (worker tickCampaigns, processIncomingMessageForCampainsAndAI).
 * (Extrait de index.js pour contourner la limite de taille des push API.)
 */
import {
  HAITHEM_PHONE_DIGITS,
  SUPABASE_SERVICE_ROLE_KEY,
  ensureContactRow,
  findAnyOrgId,
  formatPhone,
  formatPhoneVariants,
  isValidRemoteJid,
  jidToPhone,
  logger,
  normalizeDigits,
  persistRuntimeMessageDirect,
  pushEvent,
  resolveSendJid,
  sessions,
  supabaseRest,
  toJid,
} from "./shared.js";
import {
  buildCustomerAiContext,
  buildRouterToolsContext,
  buildTransferReply,
  craftAnswer,
  persistAiSuggestionForRoute,
  routeAgentForText,
} from "./ai.js";

// Runs every 15 seconds to dispatch "running" campaigns over real WhatsApp.
export async function tickCampaigns() {
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

export async function processIncomingMessageForCampainsAndAI(entry, text, phone, originalRemoteJid) {
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
