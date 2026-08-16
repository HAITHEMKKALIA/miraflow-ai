/**
 * Campaigns — page /app/campaigns (design/campaigns.md).
 * Machine à vues : liste → assistant (brouillon possible) → suivi live.
 * Les campagnes du SimEngine tickent via campaignPump ; les campagnes
 * créées par l'assistant sont pompées localement (intervalle 1,1 s).
 * Arrêt d'urgence : ConfirmDialog avec saisie « ARRÊTER ».
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pause, OctagonX } from "lucide-react";
import { toast } from "sonner";
import { fetchBridgeRuntimeBootstrap, persistBridgeCampaign, deleteBridgeCampaign } from "@/lib/bridge";
import { useCrm } from "@/sections/contacts/crmStore";
import { useCampaigns, useSim, useSessions } from "@/lib/sim/store";
import { ConfirmDialog } from "@/components/ui-shared";
import CampaignList from "@/sections/campaigns/CampaignList";
import CampaignWizard from "@/sections/campaigns/CampaignWizard";
import CampaignTracking from "@/sections/campaigns/CampaignTracking";
import Confetti from "@/sections/campaigns/Confetti";
import type { StudioCampaign } from "@/sections/campaigns/shared";
import { DRAFT_KEY, EXTRA_CAMPAIGNS, LOCAL_CAMPAIGNS_KEY, REVIEW_THRESHOLD, toStudio } from "@/sections/campaigns/shared";
import type { WizardState } from "@/sections/campaigns/WizardSteps";
import type { Contact } from "@/lib/sim/store";

type View = { name: "list" } | { name: "wizard"; resume: boolean } | { name: "track"; id: string };

function readDraft(): { step: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { step?: number };
    return { step: parsed.step ?? 1 };
  } catch {
    return null;
  }
}

function readLocalCampaigns(): StudioCampaign[] {
  try {
    const raw = localStorage.getItem(LOCAL_CAMPAIGNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StudioCampaign[];
    if (!Array.isArray(parsed)) return [];
    return mergeCampaignLists(EXTRA_CAMPAIGNS, parsed);
  } catch {
    return [];
  }
}

function campaignKey(campaign: Pick<StudioCampaign, "id" | "remoteId">) {
  return campaign.remoteId ? `remote:${campaign.remoteId}` : `local:${campaign.id}`;
}

function mergeCampaignLists(current: StudioCampaign[], incoming: StudioCampaign[]) {
  const byKey = new Map<string, StudioCampaign>();
  for (const campaign of current) byKey.set(campaignKey(campaign), campaign);
  for (const campaign of incoming) byKey.set(campaignKey(campaign), { ...byKey.get(campaignKey(campaign)), ...campaign });
  return [...byKey.values()];
}

export default function Campaigns() {
  const storeCampaigns = useCampaigns();
  const sessions = useSessions();
  const orgName = useSim((s) => s.org.name);
  const pauseCampaign = useSim((s) => s.pauseCampaign);
  const resumeCampaign = useSim((s) => s.resumeCampaign);
  const stopCampaign = useSim((s) => s.stopCampaign);
  const deleteCampaignStore = useSim((s) => s.deleteCampaign);
  void useCrm((s) => s.overrides);
  void useCrm((s) => s.extra);
  void useCrm((s) => s.deleted);

  const [view, setView] = useState<View>({ name: "list" });
  const [locals, setLocals] = useState<StudioCampaign[]>(() => readLocalCampaigns());
  const [pauseTarget, setPauseTarget] = useState<StudioCampaign | null>(null);
  const [stopTarget, setStopTarget] = useState<StudioCampaign | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [draft, setDraft] = useState<{ step: number } | null>(() => readDraft());

  const isStore = useCallback(
    (id: string) => storeCampaigns.some((c) => c.id === id),
    [storeCampaigns]
  );
  /* ── Fusion store + locales ──────────────────────────────────────────── */
  const campaigns = useMemo<StudioCampaign[]>(
    () => [...storeCampaigns.map(toStudio), ...locals],
    [storeCampaigns, locals],
  );

  const handleDelete = useCallback(async (c: StudioCampaign) => {
    if (!window.confirm(`Voulez-vous supprimer définitivement la campagne « ${c.name} » ?`)) return;
    try {
      if (c.remoteId) await deleteBridgeCampaign(c.remoteId);
    } catch {
      // Ignoré
    }
    setLocals((prev) => prev.filter(x => x.id !== c.id && x.remoteId !== c.remoteId));
    if (c.remoteId) deleteCampaignStore(c.remoteId);
    toast.success("Campagne supprimée");
    if (view.name === "track" && (view.id === c.id || view.id === c.remoteId)) {
      setView({ name: "list" });
    }
  }, [deleteCampaignStore, view]);

  /* ── Pompe locale pour les campagnes créées via l'assistant ─────────── */
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_CAMPAIGNS_KEY, JSON.stringify(locals));
    } catch {
      /* stockage indisponible */
    }
  }, [locals]);

  const syncCampaign = useCallback(async (campaign: StudioCampaign, extra?: Partial<{
    segments: string[];
    manualIds: string[];
    timezone: string;
    windowStart: number;
    windowEnd: number;
    needsReview: boolean;
  }>) => {
    const remoteId = await persistBridgeCampaign({
      orgName,
      campaign: {
        remoteId: campaign.remoteId,
        name: campaign.name,
        goal: campaign.goal,
        status: campaign.status,
        audience: campaign.audience,
        total: campaign.total,
        sent: campaign.sent,
        delivered: campaign.delivered,
        replies: campaign.replies,
        failed: campaign.failed,
        unsubscribed: campaign.unsubscribed,
        ratePerMin: campaign.ratePerMin,
        content: campaign.content,
        mediaUrl: campaign.mediaUrl,
        scheduledAt: campaign.scheduledAt,
        timezone: extra?.timezone,
        windowStart: extra?.windowStart,
        windowEnd: extra?.windowEnd,
        followUpOn: campaign.followUpOn,
        followUpMsg: campaign.followUpMsg,
        stopOnReply: campaign.stopOnReply,
        needsReview: extra?.needsReview ?? campaign.status === "review",
        recipientIds: campaign.recipientIds,
        segments: extra?.segments,
        manualIds: extra?.manualIds,
        bridgeSessionId: campaign.bridgeSessionId,
        dispatchCursor: campaign.dispatchCursor,
      },
    });
    if (remoteId) {
      setLocals((prev) => prev.map((item) => (item.id === campaign.id ? { ...item, remoteId } : item)));
    }
    return remoteId;
  }, [orgName]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const load = async () => {
      if (cancelled) return;
      try {
        const payload = await fetchBridgeRuntimeBootstrap(orgName);
        if (!cancelled && payload?.ok && Array.isArray(payload.campaigns)) {
          setLocals((prev) => mergeCampaignLists(prev, payload.campaigns as StudioCampaign[]));
        }
      } catch {
        // ignore
      }

      if (!cancelled) {
        timeoutId = setTimeout(load, 3000);
      }
    };

    void load();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [orgName]);

  const applyPause = useCallback((c: StudioCampaign) => {
    if (isStore(c.id)) {
      pauseCampaign(c.id);
    } else {
      const updated = { ...c, status: "paused" as const };
      setLocals((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
      void syncCampaign(updated);
    }
    toast("Campagne en pause", { description: "Les envois reprendront où ils en étaient." });
  }, [isStore, pauseCampaign, syncCampaign]);

  const applyResume = useCallback((c: StudioCampaign) => {
    if (isStore(c.id)) {
      resumeCampaign(c.id);
    } else {
      const updated = { ...c, status: "running" as const };
      setLocals((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
      void syncCampaign(updated);
    }
    toast.success("Campagne reprise", { description: `« ${c.name} » envoie à nouveau.` });
  }, [isStore, resumeCampaign]);

  const onPauseToggle = useCallback((c: StudioCampaign) => {
    if (c.status === "running") setPauseTarget(c);
    else if (c.status === "paused") applyResume(c);
  }, [applyResume]);

  const applyStop = useCallback((c: StudioCampaign) => {
    if (isStore(c.id)) {
      stopCampaign(c.id);
    } else {
      const updated = { ...c, status: "stopped" as const };
      setLocals((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
      void syncCampaign(updated);
    }
    toast.error("Campagne arrêtée", {
      description: `${(c.total - c.sent).toLocaleString("fr-FR")} messages restants ne seront pas envoyés.`,
    });
  }, [isStore, stopCampaign]);

  const onDuplicate = useCallback((c: StudioCampaign) => {
    const { remoteId, dispatchCursor, ...rest } = c;
    const copy: StudioCampaign = {
      ...rest,
      id: `cp_local_${Date.now().toString(36)}`,
      name: `${c.name} (copie)`,
      status: "draft",
      sent: 0,
      delivered: 0,
      replies: 0,
      failed: 0,
      unsubscribed: 0,
      dispatchCursor: 0,
      scheduledAt: undefined,
      local: true,
    };
    setLocals((prev) => [...prev, copy]);
    void syncCampaign(copy);
    toast.success("Campagne dupliquée", { description: `« ${copy.name} » ajoutée aux brouillons.` });
  }, []);

  const onEdit = useCallback((c: StudioCampaign) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        step: 1,
        goal: c.goal,
        name: c.name,
        content: c.content ?? "",
        rate: c.ratePerMin,
        selectedSessionId: c.bridgeSessionId ?? "",
      }));
    } catch { /* noop */ }
    setDraft({ step: 1 });
    setView({ name: "wizard", resume: true });
  }, []);

  const onExport = useCallback((c: StudioCampaign) => {
    const csv = [
      "campagne;statut;audience;eligibles;envoyes;livres;reponses;echoues;desinscrits",
      `"${c.name}";"${c.status}";"${c.audience}";${c.total};${c.sent};${c.delivered};${c.replies};${c.failed};${c.unsubscribed}`,
    ].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campagne-${c.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Rapport exporté", { description: "CSV téléchargé." });
  }, []);

  const onRelanceHuman = useCallback((c: StudioCampaign) => {
    const { remoteId, dispatchCursor, ...rest } = c;
    const copy: StudioCampaign = {
      ...rest,
      id: `cp_local_human_${Date.now().toString(36)}`,
      name: `${c.name} (Relance Humaine)`,
      status: "draft",
      audience: "Audience à définir",
      recipientIds: [],
      total: 0,
      sent: 0,
      delivered: 0,
      replies: 0,
      failed: 0,
      unsubscribed: 0,
      dispatchCursor: 0,
      scheduledAt: undefined,
      content: c.followUpMsg || c.content,
      relanceType: "human",
      local: true,
    };
    setLocals((prev) => [...prev, copy]);
    void syncCampaign(copy);
    toast.info("Relance humaine créée", { description: "Brouillon prêt. Définissez l'audience pour lancer." });
  }, []);

  const onRelanceAi = useCallback((c: StudioCampaign) => {
    const { remoteId, dispatchCursor, ...rest } = c;
    const copy: StudioCampaign = {
      ...rest,
      id: `cp_local_ai_${Date.now().toString(36)}`,
      name: `${c.name} (Relance IA)`,
      status: "running",
      sent: 0,
      delivered: 0,
      replies: 0,
      failed: 0,
      unsubscribed: 0,
      dispatchCursor: 0,
      scheduledAt: undefined,
      content: c.followUpMsg || c.content,
      relanceType: "ai",
      stopOnReply: true,
      local: true,
    };
    setLocals((prev) => [...prev, copy]);
    void syncCampaign(copy);
    toast.success("Relance IA activée", { description: "L'agent IA traite les réponses en temps réel." });
    setConfetti(true);
    setTimeout(() => setConfetti(false), 2000);
  }, [syncCampaign]);

  const onLaunch = useCallback(async (state: WizardState, eligible: Contact[]) => {
    const scheduled = state.sendMode === "later" && state.date;
    const scheduledAt = scheduled ? new Date(`${state.date}T${state.time || "09:00"}:00`).getTime() : undefined;
    /* Validation à quatre yeux : audience > seuil → approbation superviseur requise */
    const needsReview = eligible.length > REVIEW_THRESHOLD;
    const selectedSession = sessions.find((item) => item.id === state.selectedSessionId && item.status === "connected");
    if (!selectedSession) {
      toast.error("Session WhatsApp requise", {
        description: "Choisis une session QR connectée dans l'assistant avant de créer la campagne.",
      });
      return;
    }
    const created: StudioCampaign = {
      id: `cp_local_${Date.now().toString(36)}`,
      name: state.name.trim() || "Sans nom",
      status: needsReview ? "review" : scheduled ? "scheduled" : "running",
      audience: `${eligible.length.toLocaleString("fr-FR")} éligibles · ${state.segments.length} segment(s)${state.manualIds.length ? ` + ${state.manualIds.length} contact(s)` : ""}`,
      total: eligible.length,
      sent: 0,
      delivered: 0,
      replies: 0,
      failed: 0,
      scheduledAt,
      mediaUrl: state.mediaUrl ?? (state.carouselOn && state.carouselMode !== "pdf" ? state.cards[0]?.image : undefined),
      goal: state.goal ?? "promotion",
      unsubscribed: 0,
      ratePerMin: state.rate,
      content: state.content,
      followUpOn: state.followUpOn,
      followUpMsg: state.followUpMsg,
      stopOnReply: state.stopOnReply,
      recipientIds: eligible.map((contact) => contact.id),
      bridgeSessionId: state.selectedSessionId,
      dispatchCursor: 0,
      local: true,
    };
    const remoteId = await syncCampaign(created, {
      segments: state.segments,
      manualIds: state.manualIds,
      timezone: state.tz,
      windowStart: state.windowStart,
      windowEnd: state.windowEnd,
      needsReview,
    });
    const persisted = remoteId ? { ...created, remoteId } : created;
    setLocals((prev) => [...prev, persisted]);
    setDraft(null);
    if (needsReview) {
      toast.info("Campagne soumise à la validation", {
        description: `Audience > ${REVIEW_THRESHOLD.toLocaleString("fr-FR")} contacts — un superviseur doit approuver le lancement (validation à quatre yeux).`,
      });
      setView({ name: "list" });
      return;
    }
    if (scheduled) {
      toast.success("Campagne planifiée", {
        description: `« ${persisted.name} » utilisera ${selectedSession.name} le ${new Date(scheduledAt!).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} (${state.tz}).`,
      });
    } else {
      toast.success("Campagne lancée", { description: `« ${persisted.name} » — envois via ${selectedSession.name}.` });
    }
    setConfetti(true);
    setTimeout(() => setConfetti(false), 3200);
    setView({ name: "track", id: persisted.remoteId || persisted.id });
  }, [sessions, syncCampaign]);

  /* Validation à quatre yeux : le superviseur approuve → confettis + démarrage */
  const onValidate = useCallback((c: StudioCampaign) => {
    const connectedSession = sessions.find((item) => item.id === c.bridgeSessionId && item.status === "connected");
    if (!connectedSession) {
      toast.error("Session WhatsApp indisponible", {
        description: "Reconnecte la session choisie dans la campagne avant l'approbation finale.",
      });
      return;
    }
    const updated = { ...c, status: "running" as const, bridgeSessionId: c.bridgeSessionId ?? connectedSession.id };
    setLocals((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    void syncCampaign(updated);
    toast.success("Lancement validé", {
      description: `« ${c.name} » — approuvée, envois via ${connectedSession.name}.`,
    });
    setConfetti(true);
    setTimeout(() => setConfetti(false), 3200);
  }, [sessions, syncCampaign]);

  const tracked = view.name === "track" ? campaigns.find((c) => c.id === view.id || c.remoteId === view.id) : undefined;

  return (
    <>
      {confetti && <Confetti />}
      <AnimatePresence mode="wait">
        <motion.div
          key={view.name + (view.name === "track" ? view.id : "") + (view.name === "wizard" ? String(view.resume) : "")}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
          {view.name === "list" && (
            <CampaignList
              campaigns={campaigns}
              hasDraft={!!draft}
              draftStep={draft?.step ?? 1}
              onNew={() => {
                try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
                setDraft(null);
                setView({ name: "wizard", resume: false });
              }}
              onResumeDraft={() => setView({ name: "wizard", resume: true })}
              onTrack={(c) => setView({ name: "track", id: c.remoteId || c.id })}
              onPauseToggle={onPauseToggle}
              onStop={(c) => setStopTarget(c)}
              onDuplicate={onDuplicate}
              onEdit={onEdit}
              onExport={onExport}
              onValidate={onValidate}
              onRelanceHuman={onRelanceHuman}
              onRelanceAi={onRelanceAi}
              onDelete={handleDelete}
            />
          )}
          {view.name === "wizard" && (
            <CampaignWizard
              resume={view.resume}
              onCancel={() => { setDraft(readDraft()); setView({ name: "list" }); }}
              onLaunch={onLaunch}
            />
          )}
          {view.name === "track" && tracked && (
            <CampaignTracking
              campaign={tracked}
              onBack={() => { setDraft(readDraft()); setView({ name: "list" }); }}
              onPauseToggle={onPauseToggle}
              onStop={(c) => setStopTarget(c)}
            />
          )}
          {view.name === "track" && !tracked && (
            <div className="mx-auto max-w-[1200px] rounded-r-lg border border-line bg-surface-1 p-10 text-center text-mid">
              Campagne introuvable.
              <button type="button" onClick={() => setView({ name: "list" })} className="ms-2 text-iris hover:underline">
                Retour à la liste
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Pause → confirmation légère */}
      <ConfirmDialog
        open={!!pauseTarget}
        onClose={() => setPauseTarget(null)}
        onConfirm={() => pauseTarget && applyPause(pauseTarget)}
        title={`Mettre « ${pauseTarget?.name ?? ""} » en pause ?`}
        description="Les envois reprendront où ils en étaient. Les compteurs et le suivi restent accessibles."
        confirmLabel="Mettre en pause"
        icon={<Pause className="size-5" />}
      />

      {/* Arrêt d'urgence → saisie ARRÊTER */}
      <ConfirmDialog
        open={!!stopTarget}
        onClose={() => setStopTarget(null)}
        onConfirm={() => stopTarget && applyStop(stopTarget)}
        title={`Arrêter définitivement « ${stopTarget?.name ?? ""} » ?`}
        description={
          <span>
            Les <strong>{((stopTarget?.total ?? 0) - (stopTarget?.sent ?? 0)).toLocaleString("fr-FR")} messages restants</strong> ne seront
            pas envoyés. Cette action est irréversible.
          </span>
        }
        confirmLabel="Arrêt d'urgence"
        requireText="ARRÊTER"
        icon={<OctagonX className="size-5" />}
      />
    </>
  );
}
