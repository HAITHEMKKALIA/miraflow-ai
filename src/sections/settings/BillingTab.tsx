import { useEffect, useState } from "react";
import { CreditCard, MessageCircle, Package2, Users } from "lucide-react";
import { useSim } from "@/lib/sim/store";
import {
  FALLBACK_PLANS, fetchSubscriptionPlans, type SubscriptionPlanRow,
} from "@/lib/cloud";
import { InfoGrid, InfoTile, SectionCard, StatusBadge } from "./ui";

const PLAN_LABELS = {
  starter: "Starter",
  business: "Business",
  agency: "Agency",
  enterprise: "Enterprise",
} as const;

/** Libellé plan DB (Essentiel/Pro/Business/Enterprise) → id applicatif. */
const DB_NAME_TO_PLAN: Record<string, keyof typeof PLAN_LABELS> = {
  Essentiel: "starter",
  Pro: "business",
  Business: "agency",
  Enterprise: "enterprise",
};

const fmtPrice = (v: number | null) =>
  v === null || v === undefined
    ? "—"
    : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} TND`;

export default function BillingTab() {
  const org = useSim((s) => s.org);
  const team = useSim((s) => s.team);
  const contacts = useSim((s) => s.contacts);
  const messagesToday = useSim((s) => s.messagesToday);
  const trialEndsAt = useSim((s) => s.trialEndsAt);

  const [plans, setPlans] = useState<SubscriptionPlanRow[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);

  // Plans réels depuis subscription_plans ; fallback sur les constantes
  // locales uniquement si la requête échoue (jamais de données inventées).
  useEffect(() => {
    let alive = true;
    void fetchSubscriptionPlans().then((res) => {
      if (!alive) return;
      if (res.error || !res.data || res.data.length === 0) {
        setPlans(FALLBACK_PLANS);
        setPlansError(res.error ?? "Aucun plan actif retourné par la base.");
        return;
      }
      setPlans(res.data);
      setPlansError(null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86_400_000)) : null;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Plan actuel"
        description="Résumé de l’abonnement actuellement appliqué à l’organisation."
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone="iris">{PLAN_LABELS[org.plan]}</StatusBadge>
          {trialDaysLeft !== null ? <StatusBadge tone="amber">Essai {trialDaysLeft} j restants</StatusBadge> : <StatusBadge tone="mint">Plan actif</StatusBadge>}
        </div>
      </SectionCard>

      <InfoGrid>
        <InfoTile label="Plan" value={<span className="inline-flex items-center gap-2"><Package2 className="size-4" />{PLAN_LABELS[org.plan]}</span>} hint="Niveau d’abonnement courant" />
        <InfoTile label="Messages aujourd’hui" value={<span className="inline-flex items-center gap-2"><MessageCircle className="size-4" />{messagesToday.toLocaleString("fr-FR")}</span>} hint="Compteur runtime" />
        <InfoTile label="Utilisateurs visibles" value={<span className="inline-flex items-center gap-2"><Users className="size-4" />{team.length}</span>} hint="Membres chargés dans l’espace" />
        <InfoTile label="Contacts chargés" value={<span className="inline-flex items-center gap-2"><CreditCard className="size-4" />{contacts.length}</span>} hint="Base CRM active" />
      </InfoGrid>

      <SectionCard
        title="Plans disponibles"
        description="Tarifs réels lus depuis la base (subscription_plans)."
      >
        {plansError && (
          <p className="mb-3 rounded-r-sm border border-amber/30 bg-amber/10 px-3 py-2 text-[12px] text-amber">
            Impossible de charger les plans depuis la base ({plansError}). Les
            tarifs ci-dessous proviennent des constantes locales de l’application.
          </p>
        )}
        {plans === null ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-r-md border border-line bg-surface-2/60" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const planId = DB_NAME_TO_PLAN[plan.name];
              const isCurrent = planId === org.plan;
              return (
                <div
                  key={plan.id}
                  className={
                    "rounded-r-md border p-4 " +
                    (isCurrent ? "border-iris/50 bg-iris/5" : "border-line bg-surface-2/60")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-hi">{plan.name}</span>
                    {isCurrent && <StatusBadge tone="iris">Actuel</StatusBadge>}
                  </div>
                  <p className="mt-2 text-[20px] font-semibold tabular text-hi">
                    {fmtPrice(plan.price_monthly)}
                    <span className="text-[12px] font-normal text-low"> /mois</span>
                  </p>
                  <p className="text-[12px] tabular text-mid">
                    {fmtPrice(plan.price_yearly)} /an
                  </p>
                  <ul className="mt-3 space-y-1 text-[12px] text-mid">
                    <li>
                      Sessions WhatsApp :{" "}
                      {plan.max_whatsapp_sessions < 0 ? "illimitées" : plan.max_whatsapp_sessions}
                    </li>
                    <li>Utilisateurs : {plan.max_users < 0 ? "illimités" : plan.max_users}</li>
                    <li>Agents IA : {plan.max_ai_agents < 0 ? "illimités" : plan.max_ai_agents}</li>
                    <li>RAG : {plan.rag_enabled ? "inclus" : "—"}</li>
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
