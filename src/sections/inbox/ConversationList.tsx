import type { Contact, Conversation, QrSession, TeamMember } from "@/lib/sim/store";
import { GradientAvatar } from "../contacts/shared";

export default function ConversationList({
  conversations,
  onSelect,
  selectedId,
  contacts,
}: {
  conversations: Conversation[];
  onSelect: (id: string) => void;
  selectedId?: string;
  contacts?: Contact[];
  team?: TeamMember[];
  sessions?: QrSession[];
  starred?: Set<string>;
  onAssign?: (convId: string, memberId?: string) => void;
  onToggleStar?: (convId: string) => void;
}) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-line font-bold">Conversations</div>
      {conversations.map((c: Conversation) => {
        const contact = contacts?.find((ct) => ct.id === c.contactId);
        return (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-surface-2 border-b border-line ${selectedId === c.id ? "bg-surface-3" : ""}`}
          >
            {contact ? (
              <GradientAvatar name={contact.name} size={40} src={contact.avatarUrl} />
            ) : (
              <div className="size-10 rounded-full bg-surface-3 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{contact?.name ?? c.id}</div>
              <div className="text-sm text-low truncate">{c.thread[c.thread.length - 1]?.body}</div>
            </div>
            {c.unread > 0 && (
              <div className="shrink-0 size-2 rounded-full bg-iris self-start mt-2"></div>
            )}
          </div>
        );
      })}
    </div>
  );
}
