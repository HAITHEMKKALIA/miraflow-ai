import type { PlanId, Tenant } from "@/lib/sim/store";
import type { RichTenant } from "@/sections/superadmin/data";

const Section = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="p-6 border border-line rounded-lg bg-surface-1 mb-4">
    <h3 className="font-bold mb-2">{title}</h3>
    <div className="h-20 bg-surface-2 rounded flex items-center justify-center px-4 text-center text-low italic">
      {subtitle ?? `Aucune donnée ${title} pour le moment`}
    </div>
  </div>
);

export default function ContextBar({ tenants }: { tenants: Tenant[]; onImpersonate: (name: string) => void }) {
  return <Section title="Barre de Contexte" subtitle={`${tenants.length} tenants visibles`} />;
}

export function RequestsPanel({ onApprove }: { onApprove: (tenant: Tenant) => void }) {
  void onApprove;
  return <Section title="Demandes" subtitle="Panneau d'approbation branché sur la page SuperAdmin" />;
}

export function PlatformKpis({
  mrr,
  clients,
  trials,
  sessionsUp,
}: {
  mrr: number;
  clients: number;
  trials: number;
  sessionsUp: number;
  sessionsFlash: boolean;
}) {
  return <Section title="KPI Plateforme" subtitle={`MRR ${mrr} TND • ${clients} clients • ${trials} essais • ${sessionsUp} sessions up`} />;
}

export function RevenueCharts({
  mrr,
  planFilter,
}: {
  mrr: number;
  planFilter: PlanId | null;
  onSelectPlan: (plan: PlanId | null) => void;
}) {
  return <Section title="Graphiques Revenus" subtitle={`MRR ${mrr} TND • filtre ${planFilter ?? "tous les plans"}`} />;
}

export function TenantsTable({
  tenants,
  planFilter,
  highlightId,
}: {
  tenants: RichTenant[];
  planFilter: PlanId | null;
  onPlanFilter: (plan: PlanId | null) => void;
  highlightId: string | null;
  onImpersonate: (name: string) => void;
  onSuspend: (tenant: RichTenant) => void;
  onDelete: (id: string) => void;
  onQuotaBoost: (id: string, type: "messages" | "contacts" | "sessions" | "agents") => void;
}) {
  const listed = planFilter ? tenants.filter((tenant) => tenant.plan === planFilter) : tenants;
  return <Section title="Table des Tenants" subtitle={`${listed.length} lignes${highlightId ? ` • focus ${highlightId}` : ""}`} />;
}

export function SessionsMap({ sessionsUp, sessionsTotal }: { sessionsUp: number; sessionsTotal: number }) {
  return <Section title="Carte des Sessions" subtitle={`${sessionsUp}/${sessionsTotal} sessions connectées`} />;
}

export function Incidents() {
  return <Section title="Incidents" />;
}

export function PlanQuotas() {
  return <Section title="Quotas Plans" />;
}

export function WhiteLabel() {
  return <Section title="Marque Blanche" />;
}

export function Resellers() {
  return <Section title="Revendeurs" />;
}

export function PromoCodes() {
  return <Section title="Codes Promo" />;
}

export function Maintenance() {
  return <Section title="Maintenance" />;
}
