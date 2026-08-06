export const PLATFORM = { mrr: 12500, clients: 142, trials: 28, sessionsUp: 185, sessionsTotal: 200 };
export const PLAN_META: Record<string, { label: string }> = { starter: { label: "Starter" }, business: { label: "Business" }, agency: { label: "Agency" }, enterprise: { label: "Enterprise" } };
export const DEFAULT_QUOTAS: Record<string, number> = {};
export const tenantExtra = (_t: unknown) => ({ msgQuota: 1000, sessionsQuota: 1, contactsQuota: 500, agentsQuota: 2 });
