import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { persist } from "zustand/middleware";

export type MsgStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type MsgDirection = "in" | "out";
export type ConvStatus = "new" | "open" | "pending" | "resolved" | "archived";
export type CrmStage = "prospect" | "interested" | "client" | "loyal" | "lost";
export type SessionStatus = "connected" | "unstable" | "disconnected";
export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "done" | "stopped";
export type WorkflowStatus = "active" | "paused" | "draft";
export type AgentMode = "suggestion" | "autonomous";
export type PlanId = "starter" | "business" | "agency" | "enterprise";

export interface Message {
  id: string;
  conversationId: string;
  direction: MsgDirection;
  body: string;
  at: number;
  status: MsgStatus;
  kind: "text" | "image";
  mediaUrl?: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  status: ConvStatus;
  unread: number;
  assigneeId?: string;
  sessionId: string;
  thread: Message[];
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  city: string;
  tags: string[];
  score: number;
  stage: CrmStage;
  consent: boolean;
  lastContactAt: number;
  avatarUrl?: string;
}

export interface QrSession {
  id: string;
  name: string;
  type?: string;
  status: SessionStatus;
  uptime: number;
  latencyMs: number;
  phone: string;
  connectedAt?: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  online: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  audience: string;
  total: number;
  sent: number;
  delivered: number;
  replies: number;
  failed: number;
  scheduledAt?: number;
  mediaUrl?: string;
}

export interface WorkflowNode {
  id: string;
  label: string;
  type: "trigger" | "condition" | "action" | "delay";
}

export interface WorkflowLogEntry {
  id: string;
  at: number;
  contactName: string;
  nodeLabel: string;
  durationMs: number;
  ok: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  status: WorkflowStatus;
  runs: number;
  successRate: number;
  nodes: WorkflowNode[];
  log: WorkflowLogEntry[];
}

export interface AiAgent {
  id: string;
  key?: string;
  name: string;
  tagline: string;
  mode: AgentMode;
  confidence: number;
  handled: number;
}

export interface AiSuggestion {
  id: string;
  agentId: string;
  conversationId: string;
  text: string;
  confidence: number;
  at: number;
  status: "pending" | "accepted" | "rejected";
}

export interface Tenant {
  id: string;
  name: string;
  plan: PlanId;
  mrr: number;
  users: number;
  messagesMonth: number;
  status: "active" | "trial" | "past_due" | "churned";
  country: string;
}

export interface AppNotification {
  id: string;
  at: number;
  kind: "message" | "campaign" | "session" | "ai" | "system";
  title: string;
  body: string;
  read: boolean;
}

export interface ActivityEvent {
  id: string;
  at: number;
  kind: AppNotification["kind"];
  text: string;
}

export interface JournalEntry {
  id: string;
  at: number;
  agentId: string;
  agentName: string;
  conversation: string;
  action: "Suggestion" | "Réponse auto" | "Escalade";
  confidence: number;
  decision: "Approuvée" | "Modifiée" | "Rejetée" | "En attente" | "—";
  latencyS: number;
}

export interface Org {
  name: string;
  city: string;
  plan: PlanId;
}

let uidCounter = 0;
const uid = (prefix: string) =>
  `${prefix}_${(++uidCounter).toString(36)}_${Date.now().toString(36)}`;

const EMPTY_ORG: Org = { name: "", city: "", plan: "starter" };
const EMPTY_CHART = () => Array(24).fill(0);

export function realDefaults() {
  return {
    org: EMPTY_ORG,
    team: [] as TeamMember[],
    sessions: [] as QrSession[],
    contacts: [] as Contact[],
    conversations: [] as Conversation[],
    campaigns: [] as Campaign[],
    workflows: [] as Workflow[],
    agents: [] as AiAgent[],
    suggestions: [] as AiSuggestion[],
    tenants: [] as Tenant[],
    notifications: [] as AppNotification[],
    activity: [] as ActivityEvent[],
    journal: [] as JournalEntry[],
    messagesToday: 0,
    chartSeries: EMPTY_CHART(),
    drafts: {} as Record<string, string>,
    trialEndsAt: null as number | null,
    demoMode: false,
  };
}

export interface SimState {
  org: Org;
  team: TeamMember[];
  sessions: QrSession[];
  contacts: Contact[];
  conversations: Conversation[];
  campaigns: Campaign[];
  workflows: Workflow[];
  agents: AiAgent[];
  suggestions: AiSuggestion[];
  tenants: Tenant[];
  notifications: AppNotification[];
  activity: ActivityEvent[];
  journal: JournalEntry[];
  messagesToday: number;
  chartSeries: number[];
  drafts: Record<string, string>;
  trialEndsAt: number | null;
  demoMode: boolean;

  sendMessage: (conversationId: string, body: string) => void;
  setConversationStatus: (id: string, status: ConvStatus) => void;
  markConversationRead: (id: string) => void;
  saveDraft: (id: string, text: string) => void;
  clearDraft: (id: string) => void;
  pauseCampaign: (id: string) => void;
  resumeCampaign: (id: string) => void;
  stopCampaign: (id: string) => void;
  toggleWorkflow: (id: string) => void;
  acceptSuggestion: (id: string) => void;
  rejectSuggestion: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  applyOnboarding: (input: {
    orgName: string;
    plan: PlanId;
    userName: string;
    sessionName?: string;
  }) => void;
  addSuggestion: (s: Omit<AiSuggestion, "id" | "at" | "status">) => void;
  addActivity: (event: Omit<ActivityEvent, "id" | "at">) => void;
  pushJournal: (entry: Omit<JournalEntry, "id" | "at">) => void;
  removeSession: (id: string) => void;
  deleteConversation: (id: string) => void;
  deleteCampaign: (id: string) => void;
  resetDemo: () => void;
}

export const useSim = create<SimState>()(
  persist(
    (set, get) => ({
      ...realDefaults(),

      deleteConversation: (id) =>
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== id),
        })),

      deleteCampaign: (id) =>
        set((state) => ({
          campaigns: state.campaigns.filter((c) => c.id !== id),
        })),

      sendMessage: (conversationId, body) => {
        const msg: Message = {
          id: uid("m"),
          conversationId,
          direction: "out",
          body,
          at: Date.now(),
          status: "queued",
          kind: "text",
        };
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, status: c.status === "new" ? "open" : c.status, thread: [...c.thread, msg] }
              : c,
          ),
          messagesToday: s.messagesToday + 1,
        }));
      },

      setConversationStatus: (id, status) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, status } : c)),
        })),

      markConversationRead: (id) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
        })),

      saveDraft: (id, text) => set((s) => ({ drafts: { ...s.drafts, [id]: text } })),
      clearDraft: (id) =>
        set((s) => {
          const drafts = { ...s.drafts };
          delete drafts[id];
          return { drafts };
        }),

      pauseCampaign: (id) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) => (c.id === id && c.status === "running" ? { ...c, status: "paused" } : c)),
        })),
      resumeCampaign: (id) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) => (c.id === id && c.status === "paused" ? { ...c, status: "running" } : c)),
        })),
      stopCampaign: (id) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === id && (c.status === "running" || c.status === "paused") ? { ...c, status: "stopped" } : c,
          ),
        })),

      toggleWorkflow: (id) =>
        set((s) => ({
          workflows: s.workflows.map((w) =>
            w.id === id ? { ...w, status: w.status === "active" ? "paused" : "active" } : w,
          ),
        })),

      acceptSuggestion: (id) => {
        const s = get().suggestions.find((x) => x.id === id);
        if (!s) return;
        set((st) => ({
          suggestions: st.suggestions.map((x) => (x.id === id ? { ...x, status: "accepted" } : x)),
        }));
        get().sendMessage(s.conversationId, s.text);
      },
      rejectSuggestion: (id) =>
        set((st) => ({
          suggestions: st.suggestions.map((x) => (x.id === id ? { ...x, status: "rejected" } : x)),
        })),

      markNotificationRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),
      markAllNotificationsRead: () =>
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),

      addSuggestion: (sug) =>
        set((s) => ({
          suggestions: [
            { ...sug, id: uid("sug"), at: Date.now(), status: "pending" as const },
            ...s.suggestions,
          ].slice(0, 50),
        })),

      addActivity: (event) =>
        set((s) => ({
          activity: [{ ...event, id: uid("ac"), at: Date.now() }, ...s.activity].slice(0, 40),
        })),

      pushJournal: (entry) =>
        set((s) => ({
          journal: [{ ...entry, id: uid("j"), at: Date.now() }, ...s.journal].slice(0, 100),
        })),

      applyOnboarding: ({ orgName, plan, userName, sessionName }) =>
        set(() => {
          const name = orgName.trim() || "Mon organisation";
          const displayName = userName.trim() || "Propriétaire";
          const mainName = sessionName?.trim() || "Session Principale";
          return {
            org: { name, city: "", plan },
            trialEndsAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
            demoMode: false,
            team: [{ id: "u_owner", name: displayName, role: "Propriétaire", email: "", online: true }],
            sessions: [{ id: "s_main", name: mainName, status: "disconnected", uptime: 0, latencyMs: 0, phone: "" }],
            contacts: [],
            conversations: [],
            campaigns: [],
            workflows: [],
            suggestions: [],
            notifications: [],
            activity: [],
            messagesToday: 0,
            chartSeries: Array(24).fill(0),
            drafts: {},
          };
        }),

      resetDemo: () => set(realDefaults()),
      removeSession: (id) => set((s) => ({ sessions: s.sessions.filter(x => x.id !== id) })),
    }),
    {
      name: "mf:sim",
      version: 4,
      migrate: () => realDefaults(),
      partialize: (s) => ({
        drafts: s.drafts,
        org: s.org,
        team: s.team,
        sessions: s.sessions,
        trialEndsAt: s.trialEndsAt,
        contacts: s.contacts,
        conversations: s.conversations,
        campaigns: s.campaigns,
        workflows: s.workflows,
        notifications: s.notifications,
        activity: s.activity,
        messagesToday: s.messagesToday,
        demoMode: s.demoMode,
      }),
    },
  ),
);

export function startSimEngine() { }
export function stopSimEngine() { }

export const useOrg = () => useSim((s) => s.org);
export const useTeam = () => useSim((s) => s.team);
export const useSessions = () => useSim((s) => s.sessions);
export const useContacts = () => useSim((s) => s.contacts);
export const useConversations = () => useSim((s) => s.conversations);
export const useConversation = (id: string | undefined) =>
  useSim((s) => s.conversations.find((c) => c.id === id));
export const useCampaigns = () => useSim((s) => s.campaigns);
export const useWorkflows = () => useSim((s) => s.workflows);
export const useAgents = () => useSim((s) => s.agents);
export const useSuggestions = () => useSim((s) => s.suggestions);
export const usePendingSuggestions = () =>
  useSim(useShallow((s) => s.suggestions.filter((x) => x.status === "pending")));
export const useTenants = () => useSim((s) => s.tenants);
export const useNotifications = () => useSim((s) => s.notifications);
export const useUnreadNotifications = () =>
  useSim((s) => s.notifications.filter((n) => !n.read).length);
export const useActivity = () => useSim((s) => s.activity);
export const useChartSeries = () => useSim((s) => s.chartSeries);
export const useDraft = (conversationId: string) => useSim((s) => s.drafts[conversationId] ?? "");

export interface Kpis {
  messagesToday: number;
  responseRate: number;
  activeSessions: number;
  totalSessions: number;
  unreadInbox: number;
  activeCampaigns: number;
  workflowRunsToday: number;
  automationRate: number;
}
export const useKpis = (): Kpis =>
  useSim(useShallow((s) => ({
    messagesToday: s.messagesToday,
    responseRate: s.messagesToday > 0 ? 0 : 0,
    activeSessions: s.sessions.filter((x) => x.status !== "disconnected").length,
    totalSessions: s.sessions.length,
    unreadInbox: s.conversations.reduce((acc, c) => acc + c.unread, 0),
    activeCampaigns: s.campaigns.filter((c) => c.status === "running").length,
    workflowRunsToday: s.workflows.reduce((acc, w) => acc + w.runs, 0),
    automationRate: s.journal.length > 0
      ? Math.round(100 * s.journal.filter((j) => j.action === "Réponse auto").length / s.journal.length)
      : 0,
  })));

export const useContact = (id: string | undefined) =>
  useSim((s) => s.contacts.find((c) => c.id === id));
