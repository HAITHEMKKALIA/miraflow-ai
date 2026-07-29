/**
 * ActiveCampaigns — campagnes en cours (dashboard.md S4c).
 * Nom + pill objectif + progression (barre 8px dégradé, % qui avance en live
 * via campaignPump) + méta mono (envoyés/livrés/réponses qui tickent) +
 * Pause/Reprendre avec confirm inline. « En pause » : barre hachurée amber,
 * pill bascule ; Reprendre : toast. Lien « Studio » → /app/campaigns.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { EmptyState, StatusDot, TickNumber } from "@/components/ui-shared";
import { useCampaigns, useSim, type Campaign } from "@/lib/sim/store";
import { Card, EASE, fmtInt } from "./shared";
import { cn } from "@/lib/utils";

const OBJECTIVES: Record<string, { label: string; className: string }> = {
  cp_aid: { label: "Promotion", className: "bg-iris/10 text-iris" },
  cp_relance: { label: "Relance", className: "bg-pulse/10 text-pulse" },
  cp_ramadan: { label: "Lancement", className: "bg-mint/10 text-mint" },
  cp_vip: { label: "Fidélité", className: "bg-amber/10 text-amber" },
};

function CampaignRow({
  campaign,
  index,
  confirming,
  onAskPause,
  onCancelPause,
}: {
  campaign: Campaign;
  index: number;
  confirming: boolean;
  onAskPause: () => void;
  onCancelPause: () => void;
}) {
  const navigate = useNavigate();
  const pauseCampaign = useSim((s) => s.pauseCampaign);
  const resumeCampaign = useSim((s) => s.resumeCampaign);
  const paused = campaign.status === "paused";
  const scheduled = campaign.status === "scheduled";
  const pct = Math.min(100, Math.round((campaign.sent / campaign.total) * 100));
  const deliveredPct = campaign.sent > 0 ? Math.round((campaign.delivered / campaign.sent) * 100) : 0;
  const objective = OBJECTIVES[campaign.id] ?? OBJECTIVES.cp_aid;

  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: index * 0.08 }}
      className="rounded-r-md px-3 py-3.5 transition-colors hover:bg-surface-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot
          tone={paused ? "amber" : scheduled ? "pulse" : "mint"}
          ping={!paused && !scheduled}
        />
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-hi">{campaign.name}</p>
        <span className={cn("label-micro rounded-full px-2 py-0.5", objective.className)}>
          {objective.label}
        </span>
        <span
          className={cn(
            "label-micro rounded-full px-2 py-0.5",
            paused ? "bg-amber/10 text-amber" : scheduled ? "bg-pulse/10 text-pulse" : "bg-mint/10 text-mint",
          )}
        >
          {paused ? "En pause" : scheduled ? "Planifiée" : "En cours"}
        </span>
      </div>

      {scheduled ? (
        <p className="mt-2 ps-6 font-mono text-[11px] text-low">
          {campaign.scheduledAt
            ? `Démarre ${new Intl.DateTimeFormat("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(campaign.scheduledAt))}`
            : "Démarrage planifié"}{" "}
          · {campaign.audience}
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3 ps-6">
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full rounded-full"
                style={{
                  backgroundImage: paused
                    ? "repeating-linear-gradient(45deg, rgba(255,180,84,.85) 0 6px, rgba(255,180,84,.3) 6px 12px)"
                    : "linear-gradient(90deg, #FF5A4E 0%, #FF9F2E 60%, #0DBA9B 100%)",
                }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: EASE }}
              />
            </div>
            <span className="w-10 shrink-0 text-end font-mono text-[12px] font-medium text-hi tabular">
              {pct} %
            </span>
          </div>
          <p className="mt-2 ps-6 font-mono text-[11px] leading-[16px] text-low">
            <span className="text-mid">
              <TickNumber value={campaign.sent} /> / {fmtInt(campaign.total)}
            </span>{" "}
            envoyés · <span className="tabular">{deliveredPct} %</span> livrés ·{" "}
            <span className="tabular text-mid">
              <TickNumber value={campaign.replies} />
            </span>{" "}
            réponses
            {campaign.failed > 0 && (
              <>
                {" "}· <span className="text-rose tabular">{campaign.failed}</span> échoués
              </>
            )}
          </p>
        </>
      )}

      {/* actions */}
      {!scheduled && (
        <div className="mt-2.5 flex items-center gap-1.5 ps-6">
          <AnimatePresence mode="wait" initial={false}>
            {confirming ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.2 }}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="text-[12px] text-mid">
                  Mettre en pause ? Les envois reprendront où ils en étaient.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    pauseCampaign(campaign.id);
                    onCancelPause();
                    toast("Campagne en pause", {
                      description: `« ${campaign.name} » reprendra où elle en était.`,
                    });
                  }}
                  className="rounded-r-sm bg-amber/15 px-2.5 py-1 text-[11px] font-semibold text-amber transition-colors hover:bg-amber/25"
                >
                  Oui, pause
                </button>
                <button
                  type="button"
                  onClick={onCancelPause}
                  className="rounded-r-sm px-2.5 py-1 text-[11px] font-medium text-mid transition-colors hover:bg-surface-3 hover:text-hi"
                >
                  Non
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="buttons"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1.5"
              >
                {paused ? (
                  <button
                    type="button"
                    onClick={() => {
                      resumeCampaign(campaign.id);
                      toast.success("Campagne reprise", {
                        description: `« ${campaign.name} » : les envois continuent.`,
                      });
                    }}
                    className="flex items-center gap-1.5 rounded-r-sm border border-mint/30 bg-mint/10 px-2.5 py-1.5 text-[11px] font-semibold text-mint transition-colors hover:bg-mint/20"
                  >
                    <Play className="size-3" /> Reprendre
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onAskPause}
                    aria-label={`Mettre « ${campaign.name} » en pause`}
                    className="flex items-center gap-1.5 rounded-r-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-mid transition-colors hover:border-amber/40 hover:text-amber"
                  >
                    <Pause className="size-3" /> Pause
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate("/app/campaigns")}
                  className="flex items-center gap-1.5 rounded-r-sm px-2.5 py-1.5 text-[11px] font-semibold text-pulse transition-colors hover:bg-surface-2 hover:text-hi"
                >
                  Suivi <ArrowUpRight className="size-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.li>
  );
}

export default function ActiveCampaigns() {
  const navigate = useNavigate();
  const campaigns = useCampaigns();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const shown = campaigns
    .filter((c) => c.status === "running" || c.status === "paused" || c.status === "scheduled")
    .sort((a, b) => {
      const rank = (c: Campaign) => (c.status === "running" ? 0 : c.status === "paused" ? 1 : 2);
      return rank(a) - rank(b);
    })
    .slice(0, 3);

  return (
    <Card
      title="Campagnes en cours"
      linkLabel="Studio"
      onLink={() => navigate("/app/campaigns")}
      className="col-span-12 xl:col-span-7"
      bodyClassName="p-2.5"
    >
      {shown.length === 0 ? (
        <EmptyState
          title="Aucune campagne en cours"
          description="Lancez votre première campagne pour revenir vers vos clients au bon moment."
          action={
            <button
              type="button"
              onClick={() => navigate("/app/campaigns")}
              className="rounded-r-sm gradient-signature px-4 py-2 text-[13px] font-semibold text-white transition-all hover:-translate-y-px hover:shadow-glow-iris"
            >
              Nouvelle campagne
            </button>
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line/60" aria-label="Campagnes actives">
          {shown.map((c, i) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              index={i}
              confirming={confirmId === c.id}
              onAskPause={() => setConfirmId(c.id)}
              onCancelPause={() => setConfirmId(null)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
