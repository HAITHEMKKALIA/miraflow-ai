const fs = require('fs');
const filepath = 'src/index.js';
let content = fs.readFileSync(filepath, 'utf8');
const searchIndex = content.indexOf('// ==== BACKGROUND WORKER: CAMPAIGNS ====');
if (searchIndex > -1) {
  content = content.substring(0, searchIndex);
}

// Remove trailing spaces or newlines at the end of content
content = content.trimEnd();

const toAdd = `
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
      
      const bridgeSessionId = audience.bridgeSessionId || Array.from(sessions.keys())[0];
      const entry = bridgeSessionId ? sessions.get(bridgeSessionId) : null;
      
      if (!entry?.sock || entry.status !== "connected") continue;
      
      const ratePerMin = Number(stats.ratePerMin || 15);
      const tickRate = Math.ceil(ratePerMin / 4); // rate for 15s interval
      const cursor = Number(stats.dispatchCursor || 0);
      const recipientIds = Array.isArray(audience.recipientIds) ? audience.recipientIds : [];
      
      if (cursor >= recipientIds.length && recipientIds.length > 0) {
        await supabaseRest(\`/campaigns?id=eq.\${c.id}\`, {
          method: "PATCH",
          body: JSON.stringify({ status: "done" })
        });
        continue;
      }
      
      const batchIds = recipientIds.slice(cursor, cursor + tickRate);
      if (batchIds.length === 0) continue;
      
      let sentCount = 0;
      let failedCount = 0;
      
      const cleanBatchIds = batchIds.map(id => \`"\${id}"\`).join(',');
      const contacts = await supabaseRest(\`/contacts?id=in.(\${encodeURIComponent(cleanBatchIds)})&select=id,phone,name\`);
      
      if (Array.isArray(contacts)) {
        for (const contactId of batchIds) {
          const contact = contacts.find(row => row.id === contactId);
          if (!contact || !contact.phone) {
            failedCount++;
            continue;
          }
          
          const jid = toJid(contact.phone);
          if (!jid) {
            failedCount++;
            continue;
          }
          
          let text = String(c.content ?? "").replace(/\\{\\{prenom\\}\\}/gi, (contact.name || "").split(' ')[0]);
          
          try {
            const [presence] = await entry.sock.onWhatsApp(jid).catch(() => []);
            if (presence && presence.exists === false) {
              failedCount++;
              continue;
            }
            await entry.sock.sendMessage(jid, { text });
            sentCount++;
            logger.info({ jid, campaignId: c.id }, "campaign message sent");
            
            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch(err) {
            logger.error({ err, jid, campaignId: c.id }, "failed to send campaign msg");
            failedCount++;
          }
        }
      } else {
        failedCount += batchIds.length;
      }
      
      const newCursor = cursor + batchIds.length;
      const newSent = Number(stats.sent || 0) + sentCount;
      const newFailed = Number(stats.failed || 0) + failedCount;
      
      await supabaseRest(\`/campaigns?id=eq.\${c.id}\`, {
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
  } catch(err) {
    logger.error({ err }, "tickCampaigns failed");
  }
}

setInterval(tickCampaigns, 15000);

const OPENAI_API_KEY = "sk-XuaBdA0QXNP3mafkjJr5q3bBbfIdmkRIyhzaOEZrxm7xwaqs";

async function routeAgentForText(text) {
  const t = text.toLowerCase();
  
  if (OPENAI_API_KEY) {
    try {
      const out = await fetch("https://api.moonshot.cn/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + OPENAI_API_KEY },
        body: JSON.stringify({
          model: "moonshot-v1-8k",
          temperature: 0.1,
          messages: [
            { role: "system", content: "You are a routing agent for a WhatsApp business CRM. Decide which agent handles the user's message. Output ONLY one of: Vente, SAV, Reservation, Recrutement, Marketing, Accueil." },
            { role: "user", content: text }
          ]
        })
      }).then(r => r.json());
      const res = out.choices[0].message.content.trim();
      return res;
    } catch(e) {
      logger.error("AI Routing failed, using fallback");
    }
  }

  if (t.includes("panne") || t.includes("marche pas") || t.includes("cassé") || t.includes("remboursement") || t.includes("problème")) return "SAV";
  if (t.includes("prix") || t.includes("combien") || t.includes("acheter") || t.includes("catalogue") || t.includes("dispo") || t.includes("oui")) return "Vente";
  if (t.includes("reserver") || t.includes("rendez-vous") || t.includes("rdv") || t.includes("dispo")) return "Reservation";
  if (t.includes("job") || t.includes("cv") || t.includes("postuler") || t.includes("recruter") || t.includes("emploi")) return "Recrutement";
  return "Accueil";
}

async function craftAnswer(text, agent) {
  if (OPENAI_API_KEY) {
    try {
      const prompt = `Tu es l'agent ${agent} d'une entreprise tunisienne.Reponds brievement, en francais, a ce message client sur WhatsApp: "${text}"`;
      const out = await fetch("https://api.moonshot.cn/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + OPENAI_API_KEY },
        body: JSON.stringify({
          model: "moonshot-v1-8k",
          temperature: 0.7,
          messages: [{ role: "system", content: prompt }]
        })
      }).then(r => r.json());
      return out.choices[0].message.content.trim();
    } catch(e) {}
  }
  
  if (agent === "SAV") return "Bonjour, je suis l'Ouvrier SAV. Quel est le problème avec votre commande ?";
  if (text.toLowerCase().includes("oui")) return "Excellent ! Je finalise votre réservation. Un lien de paiement vous sera envoyé par SMS.";
  if (text.toLowerCase().includes("prix")) return "Le coffret découverte est à 68 TND TTC. La livraison est offerte.";
  return `Bonjour, comment puis - je vous aider ? (Dirigé vers ${ agent })`;
}

async function processIncomingMessageForCampainsAndAI(entry, text, phone) {
  if (!SUPABASE_SERVICE_ROLE_KEY || !text || text.length < 2) return;
  
  try {
     const campaigns = await supabaseRest("/campaigns?status=eq.running&select=id,audience,stop_on_reply");
     if (Array.isArray(campaigns)) {
        const contacts = await supabaseRest("/contacts?phone=eq."+encodeURIComponent('+'+normalizeDigits(phone)));
        const contactId = (Array.isArray(contacts) && contacts[0]) ? contacts[0].id : null;
        if (contactId) {
           for (const c of campaigns) {
              if (c.stop_on_reply) {
                 const audience = (c.audience && typeof c.audience === "object") ? c.audience : {};
                 const recipientIds = Array.isArray(audience.recipientIds) ? audience.recipientIds : [];
                 if (recipientIds.includes(contactId)) {
                    logger.info({ campaignId: c.id, phone }, "Stopping campaign for contact due to reply");
                    const stats = c.stats || {};
                    await supabaseRest(`/ campaigns ? id = eq.${ c.id } `, {
                        method: "PATCH",
                        body: JSON.stringify({ stats: { ...stats, replies: (stats.replies || 0) + 1 } })
                    });
                    
                    const newRecipientIds = recipientIds.filter(id => id !== contactId);
                    await supabaseRest(`/ campaigns ? id = eq.${ c.id } `, {
                        method: "PATCH",
                        body: JSON.stringify({ audience: { ...audience, recipientIds: newRecipientIds } })
                    });
                 }
              }
           }
        }
     }
  } catch(e) {}
  
  setTimeout(async () => {
      try {
        const agent = await routeAgentForText(text);
        logger.info({ phone, agent, text }, "Message routed to AI agent");
        
        let answer = await craftAnswer(text, agent);
        const jid = toJid(phone);
        await entry.sock.sendMessage(jid, { text: answer });
        logger.info({ phone, agent }, "AI Agent sent answer");
      } catch (e) {
        logger.error({ err: e }, "AI orchestration failed");
      }
  }, 1000);
}
`;
fs.writeFileSync(filepath, content + '\n' + toAdd, 'utf8');
