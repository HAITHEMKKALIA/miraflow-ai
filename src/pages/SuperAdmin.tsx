/**
 * SuperAdmin — mission control plateforme (/admin, superadmin.md).
 * Barre de contexte (badge SUPER ADMIN, env, « Voir comme tenant ») · 6 KPI
 * plateforme (MRR/ARR/clients/essais/churn/sessions qui tickent) · courbe MRR
 * + donut plans (filtre synchronisé) · table tenants (recherche, filtres,
 * export CSV, drawer, impersonnation, suspendre/supprimer, quotas) · dot map
 * satellite + incidents (déclaration cross-module → bannière dashboard) ·
 * quotas par plan éditables · marque blanche live · revendeurs · codes
 * promotionnels (création, statuts, KPI) · maintenance (mises à jour,
 * sauvegardes & serveurs, usage à risque).
 *
 * Toutes les données vivantes sont locales à cette console (le SimEngine
 * couvre le tenant courant) ; les conversions d'essais (≈40 s) font ticker
 * MRR/clients/essais avec flash mint + toast.
 */
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTenants, type PlanId, type Tenant } from "@/lib/sim/store";
import ContextBar, {
  RequestsPanel, PlatformKpis, RevenueCharts, TenantsTable,
  SessionsMap, Incidents, PlanQuotas, WhiteLabel, Resellers,
  PromoCodes, Maintenance
} from "@/sections/superadmin/Sections";
import {
  DEFAULT_QUOTAS, PLATFORM, tenantExtra, type RichTenant, type TenantExtra,
  type TenantStatus,
} from "@/sections/superadmin/data";

type Overrides = Record<string, { status?: TenantStatus; extra?: TenantExtra }>;

export default function SuperAdmin() {
  const navigate = useNavigate();
  const storeTenants = useTenants();

  /* ── État plateforme vivant ─────────────────────────────────────────── */
  const [mrr] = useState(PLATFORM.mrr);
  const [clients] = useState(PLATFORM.clients);
  const [trials, setTrials] = useState(PLATFORM.trials);
  const [sessionsUp] = useState(PLATFORM.sessionsUp);
  const [sessionsFlash] = useState(false);

  /* ── Tenants enrichis + overrides (statuts, quotas, suppressions) ────── */
  const [overrides, setOverrides] = useState<Overrides>({});
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [planFilter, setPlanFilter] = useState<PlanId | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  /* Tenants créés par approbation de demandes d'inscription */
  const [approvedTenants, setApprovedTenants] = useState<Tenant[]>([]);

  const richTenants: RichTenant[] = useMemo(
    () =>
      [...storeTenants, ...approvedTenants]
        .filter((t) => !deletedIds.includes(t.id))
        .map((t) => ({
          ...t,
          status: overrides[t.id]?.status ?? t.status,
          extra: overrides[t.id]?.extra ?? tenantExtra(t),
        })),
    [storeTenants, approvedTenants, overrides, deletedIds],
  );
  const richRef = useRef(richTenants);
  richRef.current = richTenants;

  /* ── Indicateurs plateforme : aucun tick automatique — uniquement les
   *  mouvements réels (approbations d'inscriptions, actions admin). ─────── */

  /* ── Actions ─────────────────────────────────────────────────────────── */
  const impersonate = (name: string) => {
    try {
      localStorage.setItem("mf:impersonate", name);
    } catch {
      /* noop */
    }
    toast.info(`Vous voyez désormais ${name}`, {
      description: "Bandeau d'impersonnation actif sur /app — journalisé dans l'audit.",
    });
    navigate("/app");
  };

  const toggleSuspend = (t: RichTenant) => {
    const next: TenantStatus = t.status === "suspended" ? "active" : "suspended";
    setOverrides((o) => ({ ...o, [t.id]: { ...o[t.id], status: next } }));
    if (next === "suspended") {
      toast.success(`${t.name} suspendu`, { description: "Sessions gelées — action journalisée." });
    } else {
      toast.success(`${t.name} réactivé`, { description: "Le tenant retrouve ses accès." });
    }
  };

  const deleteTenant = (id: string) => {
    const t = richRef.current.find((x) => x.id === id);
    setDeletedIds((d) => [...d, id]);
    toast.success("Tenant supprimé", {
      description: `${t?.name ?? id} — purge définitive dans 30 jours.`,
    });
  };

  const quotaBoost = (id: string, type: "messages" | "contacts" | "sessions" | "agents") => {
    const base = storeTenants.find((t) => t.id === id);
    if (!base) return;
    setOverrides((o) => {
      const prev = o[id]?.extra ?? tenantExtra(base);
      const e = { ...prev };
      if (type === "messages") e.msgQuota = Math.round(e.msgQuota * 1.2);
      else if (type === "sessions") e.sessionsQuota += 1;
      else if (type === "contacts")
        e.contactsQuota = Math.round((e.contactsQuota ?? DEFAULT_QUOTAS[base.plan].contactsQuota) * 1.2);
      else e.agentsQuota = (e.agentsQuota ?? DEFAULT_QUOTAS[base.plan].agentsQuota) + 1;
      return { ...o, [id]: { ...o[id], extra: e } };
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 md:space-y-5">
      <ContextBar tenants={storeTenants} onImpersonate={impersonate} />

      <PlatformKpis
        mrr={mrr}
        clients={clients}
        trials={trials}
        sessionsUp={sessionsUp}
        sessionsFlash={sessionsFlash}
      />

      <RequestsPanel
        onApprove={(t) => {
          setApprovedTenants((cur) => [...cur, t]);
          setTrials((n) => n + 1);
          setHighlightId(t.id);
          setTimeout(() => setHighlightId((id) => (id === t.id ? null : id)), 2600);
        }}
      />

      <RevenueCharts mrr={mrr} planFilter={planFilter} onSelectPlan={setPlanFilter} />

      <TenantsTable
        tenants={richTenants}
        planFilter={planFilter}
        onPlanFilter={setPlanFilter}
        highlightId={highlightId}
        onImpersonate={impersonate}
        onSuspend={toggleSuspend}
        onDelete={deleteTenant}
        onQuotaBoost={quotaBoost}
      />

      <div className="grid grid-cols-12 gap-4 md:gap-5">
        <SessionsMap sessionsUp={sessionsUp} sessionsTotal={PLATFORM.sessionsTotal} />
        <Incidents />
      </div>

      <div className="grid grid-cols-12 gap-4 md:gap-5">
        <PlanQuotas />
        <WhiteLabel />
        <Resellers />
        <PromoCodes />
      </div>

      <Maintenance />
    </div>
  );
}
