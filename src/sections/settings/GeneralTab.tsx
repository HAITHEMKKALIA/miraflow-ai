import { Building2, ContactRound, MessageSquareText, Rocket, Users } from "lucide-react";
import { useSim } from "@/lib/sim/store";
import { tenantSession } from "@/lib/tenant";
import { InfoGrid, InfoTile, SectionCard, StatusBadge } from "./ui";

export default function GeneralTab() {
  const org = useSim((s) => s.org);
  const team = useSim((s) => s.team);
  const sessions = useSim((s) => s.sessions);
  const contacts = useSim((s) => s.contacts);
  const conversations = useSim((s) => s.conversations);
  const trialEndsAt = useSim((s) => s.trialEndsAt);
  const tenant = tenantSession();

  const connectedCount = sessions.filter((item) => item.status === "connected").length;
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86_400_000)) : null;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Vue d’ensemble"
        description="État réel de l’organisation actuellement chargée dans l’application."
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone="mint">Espace réel</StatusBadge>
          <StatusBadge tone="iris">Plan {org.plan}</StatusBadge>
          {trialDaysLeft !== null ? <StatusBadge tone="amber">Essai {trialDaysLeft} j restants</StatusBadge> : null}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-line bg-surface-2/60 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-iris/12 p-2 text-iris"><Building2 className="size-5" /></div>
              <div>
                <div className="text-lg font-semibold text-hi">{org.name || "Organisation non définie"}</div>
                <div className="mt-1 text-sm text-mid">
                  {org.city ? `${org.city} · ` : ""}
                  {tenant ? `Session ouverte pour ${tenant.userName}` : "Aucune session tenant active détectée"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface-2/60 p-5">
            <div className="text-sm font-medium text-hi">Santé applicative</div>
            <div className="mt-3 space-y-2 text-sm text-mid">
              <div>{connectedCount} session(s) QR connectée(s)</div>
              <div>{contacts.length} contact(s) chargés</div>
              <div>{conversations.length} conversation(s) disponibles</div>
            </div>
          </div>
        </div>
      </SectionCard>

      <InfoGrid>
        <InfoTile label="Équipe" value={<span className="inline-flex items-center gap-2"><Users className="size-4" />{team.length}</span>} hint="Membres actuellement visibles dans l’espace" />
        <InfoTile label="Sessions QR" value={<span className="inline-flex items-center gap-2"><Rocket className="size-4" />{sessions.length}</span>} hint={`${connectedCount} connectée(s)`} />
        <InfoTile label="Contacts" value={<span className="inline-flex items-center gap-2"><ContactRound className="size-4" />{contacts.length}</span>} hint="Base CRM chargée" />
        <InfoTile label="Conversations" value={<span className="inline-flex items-center gap-2"><MessageSquareText className="size-4" />{conversations.length}</span>} hint="Inbox disponible" />
      </InfoGrid>
    </div>
  );
}
