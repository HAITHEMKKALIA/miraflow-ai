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
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTenants, type PlanId, type Tenant } from "@/lib/sim/store";
import ContextBar from "@/sections/superadmin/ContextBar";
import RequestsPanel from "@/sections/superadmin/RequestsPanel";
import PlatformKpis from "@/sections/superadmin/PlatformKpis";
import RevenueCharts from "@/sections/superadmin/RevenueCharts";
import TenantsTable from "@/sections/superadmin/TenantsTable";
import SessionsMap from "@/sections/superadmin/SessionsMap";
import Incidents from "@/sections/superadmin/Incidents";
import PlanQuotas from "@/sections/superadmin/PlanQuotas";
import WhiteLabel from "@/sections/superadmin/WhiteLabel";
import Resellers from "@/sections/superadmin/Resellers";
import PromoCodes from "@/sections/superadmin/PromoCodes";
import Maintenance from "@/sections/superadmin/Maintenance";
import {
  DEFAULT_QUOTAS, PLATFORM, PLAN_META, tenantExtra, type RichTenant, type TenantExtra,
  type TenantStatus,
} from "@/sections/superadmin/data";

type Overrides = Record<string, { status?: TenantStatus; extra?: TenantExtra }>;

export default function SuperAdmin() {
  const navigate = useNavigate();
  const storeTenants = useTenants();

  /* ── État plateforme vivant ─────────────────────────────────────────── */
  const [mrr, setMrr] = useState(PLATFORM.mrr);
  const [clients, setClients] = useState(PLATFORM.clients);
  const [trials, setTrials] = useState(PLATFORM.trials);
  const [sessionsUp, setSessionsUp] = useState(PLATFORM.sessionsUp);
  const [sessionsFlash, setSessionsFlash] = useState(false);

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

  /* ── Sessions connectées : tick ±1 toutes les 8–15 s (flash) ─────────── */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let flashTimer: ReturnType<typeof setTimeout>;
    const loop = () => {
      setSessionsUp((v) => Math.min(PLATFORM.sessionsTotal, Math.max(178, v + (Math.random() > 0.5 ? 1 : -1))));
      setSessionsFlash(true);
      flashTimer = setTimeout(() => setSessionsFlash(false), 400);
      timer = setTimeout(loop, 8000 + Math.random() * 7000);
    };
    timer = setTimeout(loop, 8000 + Math.random() * 7000);
    return () => {
      clearTimeout(timer);
      clearTimeout(flashTimer);
    };
  }, []);

  /* ── Conversion d'essai simulée (≈40 s) : ligne flash mint + toast ────── */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      const candidate = richRef.current.find((t) => t.status === "trial");
      if (candidate) {
        setOverrides((o) => ({ ...o, [candidate.id]: { ...o[candidate.id], status: "active" } }));
        setMrr((m) => m + candidate.mrr);
        setClients((c) => c + 1);
        setTrials((t) => Math.max(0, t - 1));
        setHighlightId(candidate.id);
        setTimeout(() => setHighlightId((id) => (id === candidate.id ? null : id)), 2200);
        toast.success(`${candidate.name} est passé à ${PLAN_META[candidate.plan].label}`, {
          description: `+${candidate.mrr} TND MRR — essai converti en abonnement.`,
        });
      }
      timer = setTimeout(loop, 35_000 + Math.random() * 10_000);
    };
    timer = setTimeout(loop, 38_000);
    return () => clearTimeout(timer);
  }, []);

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
        e.contactsQuota = Math.round((e.contactsQuota ?? DEFAULT_QUOTAS[base.plan].contacts) * 1.2);
      else e.agentsQuota = (e.agentsQuota ?? DEFAULT_QUOTAS[base.plan].agents) + 1;
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
