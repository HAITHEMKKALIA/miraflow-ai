import { Mail, ShieldCheck, UserRound } from "lucide-react";
import { useSim } from "@/lib/sim/store";
import { SectionCard, StatusBadge } from "./ui";

export default function TeamTab() {
  const team = useSim((s) => s.team);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Équipe active"
        description="Membres actuellement disponibles dans l’organisation chargée."
      >
        <div className="space-y-3">
          {team.map((member, index) => (
            <div key={member.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-iris/12 text-sm font-semibold text-iris">
                  {member.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-hi">{member.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-mid">
                    <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{member.role}</span>
                    {member.email ? <span className="inline-flex items-center gap-1"><Mail className="size-3.5" />{member.email}</span> : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {index === 0 ? <StatusBadge tone="iris"><span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" />Compte principal</span></StatusBadge> : null}
                <StatusBadge tone={member.online ? "mint" : "low"}>{member.online ? "En ligne" : "Hors ligne"}</StatusBadge>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
