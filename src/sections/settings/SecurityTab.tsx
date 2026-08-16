import { Shield, ShieldCheck, UserLock } from "lucide-react";
import { ownerLogout, ownerSession } from "@/lib/owner";
import { tenantLogout, tenantSession } from "@/lib/tenant";
import { ActionButton, SectionCard, StatusBadge } from "./ui";

function formatExpiry(ts?: number) {
  if (!ts) return "Aucune expiration";
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SecurityTab() {
  const owner = ownerSession();
  const tenant = tenantSession();

  return (
    <div className="space-y-5">
      <SectionCard
        title="Sessions locales"
        description="État des authentifications stockées localement sur cette machine."
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-hi"><ShieldCheck className="size-4" />Session propriétaire</div>
              <div className="mt-1 text-xs text-mid">{owner ? `${owner.email} · expire le ${formatExpiry(owner.exp)}` : "Aucune session propriétaire active"}</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge tone={owner ? "mint" : "low"}>{owner ? "Active" : "Inactive"}</StatusBadge>
              {owner ? <ActionButton onClick={() => ownerLogout()}>Fermer</ActionButton> : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-hi"><UserLock className="size-4" />Session tenant</div>
              <div className="mt-1 text-xs text-mid">{tenant ? `${tenant.userName} · ${tenant.orgName} · expire le ${formatExpiry(tenant.exp)}` : "Aucune session espace client active"}</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge tone={tenant ? "mint" : "low"}>{tenant ? "Active" : "Inactive"}</StatusBadge>
              {tenant ? <ActionButton onClick={() => tenantLogout()}>Fermer</ActionButton> : null}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Bonnes pratiques"
        description="Repères utiles pour sécuriser l’utilisation locale actuelle."
      >
        <div className="space-y-2 text-sm text-mid">
          <p className="inline-flex items-start gap-2"><Shield className="mt-0.5 size-4 shrink-0 text-iris" />Les sessions propriétaire et tenant sont stockées en local sur ce navigateur.</p>
          <p className="inline-flex items-start gap-2"><Shield className="mt-0.5 size-4 shrink-0 text-iris" />Le bridge WhatsApp utilise une session séparée côté backend, indépendante de ces jetons navigateur.</p>
          <p className="inline-flex items-start gap-2"><Shield className="mt-0.5 size-4 shrink-0 text-iris" />En cas de doute, ferme les sessions ci-dessus puis reconnecte-toi proprement.</p>
        </div>
      </SectionCard>
    </div>
  );
}
