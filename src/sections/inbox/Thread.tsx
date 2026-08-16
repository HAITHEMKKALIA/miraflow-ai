import { useState } from "react";
import { SendHorizonal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { persistBridgeMessage, sendBridgeMessage, deleteBridgeConversation } from "@/lib/bridge";
import { useSim, useSessions, type AiAgent, type AiSuggestion, type Contact, type Conversation, type Message, type QrSession, type TeamMember } from "@/lib/sim/store";
import { GradientAvatar } from "../contacts/shared";
import { cn } from "@/lib/utils";
import AiSuggestionBanner from "./AiSuggestionBanner";

const HAITHEM_PHONE_DIGITS = "21658746997";

function normalizeDigits(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function findHaithemSession(sessions: QrSession[]): QrSession | undefined {
  return sessions.find((s) => s.phone && normalizeDigits(s.phone) === HAITHEM_PHONE_DIGITS && s.status === "connected");
}

export default function Thread({
  conv,
  onBack,
  contact,
  session,
  suggestions = [],
}: {
  conv: Conversation;
  onBack: () => void;
  contact?: Contact;
  team?: TeamMember[];
  agents?: AiAgent[];
  session?: QrSession;
  suggestions?: AiSuggestion[];
  assignee?: TeamMember;
  starred?: boolean;
  panelOpen?: boolean;
  onAssign?: (id?: string) => void;
  onToggleStar?: () => void;
  onTogglePanel?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const allSessions = useSessions();
  const orgName = useSim((s) => s.org.name);
  const acceptSuggestion = useSim((s) => s.acceptSuggestion);
  const rejectSuggestion = useSim((s) => s.rejectSuggestion);
  const deleteConversation = useSim((s) => s.deleteConversation);

  const effectiveSendSession = findHaithemSession(allSessions) ?? session;

  const handleDelete = async () => {
    if (!window.confirm("Voulez-vous supprimer définitivement cette conversation ?")) return;
    setDeleting(true);
    try {
      await deleteBridgeConversation(conv.id);
    } catch {
      // ignoré le reste
    }
    deleteConversation(conv.id);
    toast.success("Conversation supprimée");
    onBack();
  };

  const canSendReal = !!effectiveSendSession?.id && effectiveSendSession.status === "connected" && !!contact?.phone;

  const appendOutgoing = (body: string, remoteId: string | null) => {
    useSim.setState((state) => ({
      conversations: state.conversations.map((item) =>
        item.id === conv.id
          ? {
            ...item,
            status: item.status === "new" ? "open" : item.status,
            thread: [
              ...item.thread,
              {
                id: remoteId ?? `m_local_${Date.now().toString(36)}`,
                conversationId: conv.id,
                direction: "out",
                body,
                at: Date.now(),
                status: "sent",
                kind: "text",
              },
            ],
          }
          : item,
      ),
      messagesToday: state.messagesToday + 1,
    }));
  };

  const doSendBody = async (body: string, viaLabel: string) => {
    if (!contact?.phone) {
      toast.error("Aucun numéro contact", { description: "Ajoute un numéro valide avant l'envoi réel." });
      return false;
    }
    if (!effectiveSendSession?.id || effectiveSendSession.status !== "connected") {
      toast.error("Session WhatsApp non connectée", { description: "Reconnecte la session QR HAITHEM avant d'envoyer." });
      return false;
    }

    const sent = await sendBridgeMessage(effectiveSendSession.id, contact.phone, body);

    if (!sent) {
      toast.error("Envoi bridge échoué", { description: "Le message n'a pas été accepté par la session WhatsApp." });
      return false;
    }

    appendOutgoing(body, sent.id);
    void persistBridgeMessage({
      orgName,
      sessionId: effectiveSendSession.id,
      sessionName: effectiveSendSession.name,
      sessionPhone: effectiveSendSession.phone,
      sessionStatus: effectiveSendSession.status,
      contact: {
        name: contact.name,
        phone: contact.phone,
        city: contact.city,
        tags: contact.tags,
        score: contact.score,
        stage: contact.stage,
        consent: contact.consent,
      },
      message: {
        direction: "out",
        body,
        at: sent.at ?? Date.now(),
        status: sent.status,
      },
    });
    toast.success("Message envoyé", { description: `Envoi réel via ${viaLabel}.` });
    return true;
  };

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await doSendBody(body, effectiveSendSession?.name ?? "session HAITHEM");
    setSending(false);
    if (ok) setDraft("");
  };

  const handleSuggestionSend = (suggestionId: string) => {
    const sug = suggestions.find((s) => s.id === suggestionId);
    if (!sug) return;
    acceptSuggestion(suggestionId);
    void doSendBody(sug.text, `Agent IA · ${effectiveSendSession?.name ?? "HAITHEM"}`);
  };

  const handleSuggestionEdit = (_suggestionId: string, newText: string) => {
    setDraft(newText);
    const textarea = document.querySelector<HTMLTextAreaElement>(`textarea[data-conv="${conv.id}"]`);
    textarea?.focus();
    toast.info("Suggestion chargée dans le champ d'écriture", { description: "Modifiez puis cliquez sur Envoyer." });
  };

  const handleSuggestionDismiss = (suggestionId: string) => {
    rejectSuggestion(suggestionId);
  };

  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");

  const usingHaithem = effectiveSendSession && session?.id !== effectiveSendSession.id;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-line p-4">
        <button onClick={onBack} className="p-2 lg:hidden">←</button>
        {contact ? (
          <GradientAvatar name={contact.name} size={40} src={contact.avatarUrl} />
        ) : (
          <div className="size-10 rounded-full bg-surface-3" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-bold text-hi">{contact?.name ?? `Conversation ${conv.id}`}</div>
          <div className="text-xs text-mid">
            {contact?.phone ?? "numéro inconnu"} · {usingHaithem
              ? <span className="text-iris font-semibold">HAITHEM KALIA · +216 58 746 997</span>
              : session ? `${session.name} (${session.status})` : "aucune session"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium",
              canSendReal ? "bg-mint/10 text-mint" : "bg-amber/10 text-amber",
            )}
          >
            {canSendReal ? (usingHaithem ? "Route HAITHEM" : "Bridge réel") : "Envoi bloqué"}
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Supprimer la conversation"
            className="flex items-center justify-center rounded-md p-2 text-low transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {conv.thread.map((m: Message) => (
          <div key={m.id} className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[80%] rounded-lg p-3 ${m.direction === "in" ? "bg-surface-2" : "bg-iris text-white"}`}>
              <div>{m.body}</div>
              <div className={cn("mt-1 text-[10px] uppercase tracking-wide", m.direction === "in" ? "text-low" : "text-white/75")}>
                {m.status}
              </div>
            </div>
          </div>
        ))}
      </div>

      {pendingSuggestions.length > 0 && (
        <div className="space-y-3 border-t border-line bg-iris/[.03] p-4">
          {pendingSuggestions.map((s) => (
            <AiSuggestionBanner
              key={s.id}
              suggestion={s}
              onSend={handleSuggestionSend}
              onEdit={handleSuggestionEdit}
              onDismiss={handleSuggestionDismiss}
            />
          ))}
        </div>
      )}

      <div className="border-t border-line bg-surface-1 p-3">
        <div className="mb-2 text-[11px] text-low">
          {canSendReal
            ? usingHaithem
              ? "✅ Tous les envois (manuel + IA) passent par la session HAITHEM KALIA · +216 58 746 997."
              : "Les messages envoyés ici partent via le bridge WhatsApp réel."
            : "⚠️ Connectez d'abord la session HAITHEM KALIA (+216 58 746 997) pour autoriser les envois."}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            data-conv={conv.id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={canSendReal ? "Écrire un message réel WhatsApp…" : "Connexion WhatsApp requise pour envoyer"}
            disabled={!canSendReal || sending}
            rows={2}
            className="min-h-[44px] flex-1 resize-none rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-sm text-hi placeholder:text-low focus:border-iris focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSendReal || sending || !draft.trim()}
            className="flex h-11 items-center gap-2 rounded-r-sm gradient-signature px-4 text-sm font-semibold text-white transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SendHorizonal className="size-4" />
            {sending ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
