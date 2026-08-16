import type { PlanId, Tenant } from "@/lib/sim/store";

export type TenantStatus = Tenant["status"] | "suspended";

export interface TenantExtra {
  msgQuota: number;
  sessionsQuota: number;
  contactsQuota: number;
  agentsQuota: number;
}

export interface RichTenant extends Omit<Tenant, "status"> {
  status: TenantStatus;
  extra: TenantExtra;
}

export const PLATFORM = {
  mrr: 0,
  clients: 0,
  trials: 0,
  sessionsUp: 0,
  sessionsTotal: 0,
};

export const PLAN_META: Record<PlanId, { label: string }> = {
  starter: { label: "Starter" },
  business: { label: "Business" },
  agency: { label: "Agency" },
  enterprise: { label: "Enterprise" },
};

export const DEFAULT_QUOTAS: Record<PlanId, TenantExtra> = {
  starter: { msgQuota: 1000, sessionsQuota: 1, contactsQuota: 500, agentsQuota: 2 },
  business: { msgQuota: 5000, sessionsQuota: 2, contactsQuota: 2500, agentsQuota: 4 },
  agency: { msgQuota: 15000, sessionsQuota: 5, contactsQuota: 10000, agentsQuota: 8 },
  enterprise: { msgQuota: 50000, sessionsQuota: 10, contactsQuota: 50000, agentsQuota: 20 },
};

export const tenantExtra = (tenant: Tenant): TenantExtra => DEFAULT_QUOTAS[tenant.plan];
