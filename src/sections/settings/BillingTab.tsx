import { CreditCard, MessageCircle, Package2, Users } from "lucide-react";
import { useSim } from "@/lib/sim/store";
import { InfoGrid, InfoTile, SectionCard, StatusBadge } from "./ui";

const PLAN_LABELS = {
  starter: "Starter",
  business: "Business",
  agency: "Agency",
  enterprise: "Enterprise",
} as const;

export default function BillingTab() {
  const org = useSim((s) => s.org);
  const team = useSim((s) => s.team);
  const contacts = useSim((s) => s.contacts);
  const messagesToday = useSim((s) => s.messagesToday);
  const trialEndsAt = useSim((s) => s.trialEndsAt);

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
    </div>
  );
}
