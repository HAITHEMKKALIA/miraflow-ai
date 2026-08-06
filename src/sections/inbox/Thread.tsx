import type { AiAgent, AiSuggestion, Contact, Conversation, Message, QrSession, TeamMember } from "@/lib/sim/store";

export default function Thread({
  conv,
  onBack,
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
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-line flex items-center gap-4">
        <button onClick={onBack} className="lg:hidden p-2">←</button>
        <div className="font-bold">Conversation: {conv.id}</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conv.thread.map((m: Message) => (
          <div key={m.id} className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[80%] p-3 rounded-lg ${m.direction === "in" ? "bg-surface-2" : "bg-iris text-white"}`}>
              {m.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
