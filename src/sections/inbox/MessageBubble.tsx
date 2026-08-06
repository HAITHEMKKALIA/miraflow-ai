import type { Message } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

export interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <div className={cn("flex", message.direction === "in" ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg p-3",
          message.direction === "in" ? "bg-surface-2 text-hi" : "bg-iris text-white",
        )}
      >
        {message.body}
      </div>
    </div>
  );
}
