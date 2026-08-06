import type { Contact, Conversation, QrSession, TeamMember } from "@/lib/sim/store";

export default function ConversationList({ 
  conversations, 
  onSelect, 
  selectedId,
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
      {conversations.map((c: Conversation) => (
        <div
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`p-4 cursor-pointer hover:bg-surface-2 border-b border-line ${selectedId === c.id ? "bg-surface-3" : ""}`}
        >
          <div className="font-medium">{c.id}</div>
          <div className="text-sm text-low truncate">{c.thread[c.thread.length - 1]?.body}</div>
        </div>
      ))}
    </div>
  );
}
