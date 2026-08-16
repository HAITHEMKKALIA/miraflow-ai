import { Bell, CheckCheck } from "lucide-react";
import { useNotifications, useSim } from "@/lib/sim/store";
import { ActionButton, SectionCard, StatusBadge } from "./ui";

export default function NotificationsTab() {
  const notifications = useNotifications();
  const markAllRead = useSim((s) => s.markAllNotificationsRead);
  const unread = notifications.filter((item) => !item.read).length;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Centre de notifications"
        description="Notifications réellement présentes dans l’état de l’application."
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StatusBadge tone={unread > 0 ? "amber" : "mint"}>{unread} non lue(s)</StatusBadge>
          <ActionButton onClick={markAllRead}><span className="inline-flex items-center gap-2"><CheckCheck className="size-4" />Tout marquer lu</span></ActionButton>
        </div>

        <div className="space-y-3">
          {notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface-2/40 p-6 text-sm text-mid">
              Aucune notification disponible.
            </div>
          ) : notifications.slice(0, 12).map((item) => (
            <div key={item.id} className="rounded-2xl border border-line bg-surface-2/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-hi">
                    <Bell className="size-4 text-iris" />
                    {item.title}
                  </div>
                  <div className="mt-1 text-sm text-mid">{item.body}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge tone={item.read ? "low" : "pulse" as never}>{item.read ? "Lue" : "Nouvelle"}</StatusBadge>
                  <span className="text-xs text-low">
                    {new Date(item.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
