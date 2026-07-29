/**
 * ActivityFeed — fil d'activité streamé (dashboard.md S4d).
 * Fusionne le flux SimEngine (useActivity) et le journal live des workflows
 * (6–14 s). Filtres chips (Tout · Messages · Workflows · IA · Équipe) en
 * crossfade 250ms. Nouvel événement : entre en haut (y:-16, highlight
 * surface-2 1.2s qui s'estompe), le plus ancien sort (fade). Montage stagger
 * 50ms. Timestamps relatifs mono. aria-live="polite" (role log).
 */
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Megaphone, MessageCircle, Smartphone, Workflow } from "lucide-react";
import { useNavigate } from "react-router";
import { useActivity, useWorkflows, type ActivityEvent } from "@/lib/sim/store";
import { Card, EASE, useNow } from "./shared";
import { cn } from "@/lib/utils";

type Filter = "all" | "message" | "system" | "ai" | "team";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "message", label: "Messages" },
  { value: "system", label: "Workflows" },
  { value: "ai", label: "IA" },
  { value: "team", label: "Équipe" },
];

const KIND_META: Record<ActivityEvent["kind"], { icon: typeof Bot; className: string; to: string }> = {
  message: { icon: MessageCircle, className: "bg-pulse/10 text-pulse", to: "/app/inbox" },
  system: { icon: Workflow, className: "bg-iris/10 text-iris", to: "/app/workflows" },
  ai: { icon: Bot, className: "bg-amber/10 text-amber", to: "/app/agents" },
  campaign: { icon: Megaphone, className: "bg-mint/10 text-mint", to: "/app/campaigns" },
  session: { icon: Smartphone, className: "bg-rose/10 text-rose", to: "/app/settings" },
};

const TEAM_KINDS: ActivityEvent["kind"][] = ["campaign", "session"];

function matches(kind: ActivityEvent["kind"], filter: Filter) {
  if (filter === "all") return true;
  if (filter === "team") return TEAM_KINDS.includes(kind);
  return kind === filter;
}

export function relativeTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export default function ActivityFeed() {
  const navigate = useNavigate();
  const activity = useActivity();
  const workflows = useWorkflows();
  const [filter, setFilter] = useState<Filter>("all");
  const now = useNow(30_000);
  const mountIds = useRef<Set<string> | null>(null);

  // Fusion flux + journal workflow live, tri desc
  const events = useMemo(() => {
    const wfEvents: ActivityEvent[] = workflows.flatMap((w) =>
      w.log.map((e) => ({
        id: e.id,
        at: e.at,
        kind: "system" as const,
        text: `Workflow « ${w.name} » exécuté pour ${e.contactName} (${e.durationMs} ms)${e.ok ? "" : " — échec"}`,
      })),
    );
    return [...activity, ...wfEvents].sort((a, b) => b.at - a.at).slice(0, 12);
  }, [activity, workflows]);

  if (mountIds.current === null) {
    mountIds.current = new Set(events.map((e) => e.id));
  }
  const filtered = events.filter((e) => matches(e.kind, filter)).slice(0, 10);

  return (
    <Card
      title="Activité"
      className="col-span-12 xl:col-span-5"
      bodyClassName="p-3"
      action={
        <div className="flex items-center gap-1" role="tablist" aria-label="Filtrer l'activité">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-200",
                filter === f.value ? "bg-surface-3 text-hi" : "text-low hover:text-mid",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      <ul className="flex flex-col" role="log" aria-live="polite" aria-label="Fil d'activité">
        <AnimatePresence mode="popLayout">
          {filtered.map((e, i) => {
            const meta = KIND_META[e.kind];
            const Icon = meta.icon;
            const isNew = !mountIds.current!.has(e.id);
            return (
              <motion.li
                key={e.id}
                layout
                initial={isNew ? { opacity: 0, y: -16 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.35, ease: EASE, delay: isNew ? 0 : Math.min(i * 0.05, 0.4) }}
              >
                <motion.button
                  type="button"
                  onClick={() => navigate(meta.to)}
                  initial={isNew ? { backgroundColor: "var(--surface-2)" } : false}
                  animate={{ backgroundColor: "rgba(0,0,0,0)" }}
                  transition={{ duration: 1.2 }}
                  className="group flex w-full items-start gap-3 rounded-r-sm px-2.5 py-2.5 text-start transition-colors hover:!bg-surface-2"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                      meta.className,
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-[19px] text-mid transition-colors group-hover:text-hi">
                      {e.text}
                    </span>
                    <span className="label-micro mt-0.5 block text-[10px] text-low tabular">
                      {relativeTime(e.at, now)}
                    </span>
                  </span>
                </motion.button>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {filtered.length === 0 && (
          <li className="px-3 py-8 text-center text-[13px] text-low">
            Aucun événement pour ce filtre.
          </li>
        )}
      </ul>
    </Card>
  );
}
