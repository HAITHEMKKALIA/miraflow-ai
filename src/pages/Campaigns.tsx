/**
 * Campaigns — page /app/campaigns (design/campaigns.md).
 * Machine à vues : liste → assistant (brouillon possible) → suivi live.
 * Les campagnes du SimEngine tickent via campaignPump ; les campagnes
 * créées par l'assistant sont pompées localement (intervalle 1,1 s).
 * Arrêt d'urgence : ConfirmDialog avec saisie « ARRÊTER ».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pause, OctagonX } from "lucide-react";
import { toast } from "sonner";
import { useCampaigns, useSim } from "@/lib/sim/store";
import { ConfirmDialog } from "@/components/ui-shared";
import CampaignList from "@/sections/campaigns/CampaignList";
import CampaignWizard from "@/sections/campaigns/CampaignWizard";
import CampaignTracking from "@/sections/campaigns/CampaignTracking";
import Confetti from "@/sections/campaigns/Confetti";
import type { StudioCampaign } from "@/sections/campaigns/shared";
import { DRAFT_KEY, EXTRA_CAMPAIGNS, REVIEW_THRESHOLD, makeRng, toStudio } from "@/sections/campaigns/shared";
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

export default function Campaigns() {
  const storeCampaigns = useCampaigns();
  const pauseCampaign = useSim((s) => s.pauseCampaign);
  const resumeCampaign = useSim((s) => s.resumeCampaign);
  const stopCampaign = useSim((s) => s.stopCampaign);

  const [view, setView] = useState<View>({ name: "list" });
  const [locals, setLocals] = useState<StudioCampaign[]>(EXTRA_CAMPAIGNS);
  const [pauseTarget, setPauseTarget] = useState<StudioCampaign | null>(null);
  const [stopTarget, setStopTarget] = useState<StudioCampaign | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [draft, setDraft] = useState<{ step: number } | null>(() => readDraft());

  /* ── Fusion store + locales ──────────────────────────────────────────── */
  const campaigns = useMemo<StudioCampaign[]>(
    () => [...storeCampaigns.map(toStudio), ...locals],
    [storeCampaigns, locals],
  );

  /* ── Pompe locale pour les campagnes créées via l'assistant ─────────── */
  const rngRef = useRef(makeRng(777001));
  const localsRef = useRef(locals);
  localsRef.current = locals;
  useEffect(() => {
    const t = setInterval(() => {
      const rng = rngRef.current;
      const prev = localsRef.current;
      if (!prev.some((c) => c.status === "running" && c.sent < c.total)) return;
      const next = prev.map((c) => {
        if (c.status !== "running" || c.sent >= c.total) return c;
        const burst = 1 + Math.floor(rng() * 4);
        const sent = Math.min(c.total, c.sent + burst);
        const delivered = Math.min(sent, c.delivered + Math.floor(rng() * (burst + 1)));
        const replies = c.replies + (rng() < 0.16 ? 1 : 0);
        const failed = c.failed + (rng() < 0.03 ? 1 : 0);
        const unsubscribed = c.unsubscribed + (rng() < 0.015 ? 1 : 0);
        const done = sent >= c.total;
        return { ...c, sent, delivered, replies, failed, unsubscribed, status: done ? ("done" as const) : c.status };
      });
      const finished = next.find((c, i) => c.status === "done" && prev[i].status === "running");
      localsRef.current = next;
      setLocals(next);
      if (finished) {
        toast.success("Campagne terminée", {
          description: `« ${finished.name} » : ${finished.sent.toLocaleString("fr-FR")} messages envoyés.`,
        });
      }
    }, 1100);
    return () => clearInterval(t);
  }, []);

  /* ── Actions ─────────────────────────────────────────────────────────── */
  const isStore = useCallback((id: string) => storeCampaigns.some((sc) => sc.id === id), [storeCampaigns]);

  const applyPause = useCallback((c: StudioCampaign) => {
    if (isStore(c.id)) {
      pauseCampaign(c.id);
    } else {
      setLocals((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "paused" } : x)));
    }
    toast("Campagne en pause", { description: "Les envois reprendront où ils en étaient." });
  }, [isStore, pauseCampaign]);

  const applyResume = useCallback((c: StudioCampaign) => {
    if (isStore(c.id)) {
      resumeCampaign(c.id);
    } else {
      setLocals((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "running" } : x)));
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
      setLocals((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "stopped" } : x)));
    }
    toast.error("Campagne arrêtée", {
      description: `${(c.total - c.sent).toLocaleString("fr-FR")} messages restants ne seront pas envoyés.`,
    });
  }, [isStore, stopCampaign]);

  const onDuplicate = useCallback((c: StudioCampaign) => {
    const copy: StudioCampaign = {
      ...c,
      id: `cp_local_${Date.now().toString(36)}`,
      name: `${c.name} (copie)`,
      status: "draft",
      sent: 0,
      delivered: 0,
      replies: 0,
      failed: 0,
      unsubscribed: 0,
      scheduledAt: undefined,
      local: true,
    };
    setLocals((prev) => [...prev, copy]);
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
    const copy: StudioCampaign = {
      ...c,
      id: `cp_local_human_${Date.now().toString(36)}`,
      name: `${c.name} (Relance Humaine)`,
      status: "draft",
      audience: "Audience à définir",
      total: 0,
      sent: 0,
      delivered: 0,
      replies: 0,
      failed: 0,
      unsubscribed: 0,
      scheduledAt: undefined,
      relanceType: "human",
      local: true,
    };
    setLocals((prev) => [...prev, copy]);
    toast.info("Relance humaine créée", { description: "Brouillon prêt. Définissez l'audience pour lancer." });
  }, []);

  const onRelanceAi = useCallback((c: StudioCampaign) => {
    const copy: StudioCampaign = {
      ...c,
      id: `cp_local_ai_${Date.now().toString(36)}`,
      name: `${c.name} (Relance IA)`,
      status: "running",
      sent: 0,
      delivered: 0,
      replies: 0,
      failed: 0,
      unsubscribed: 0,
      scheduledAt: undefined,
      relanceType: "ai",
      local: true,
    };
    setLocals((prev) => [...prev, copy]);
    toast.success("Relance IA activée", { description: "L'agent IA traite les réponses en temps réel." });
    setConfetti(true);
    setTimeout(() => setConfetti(false), 2000);
  }, []);

  const onLaunch = useCallback((state: WizardState, eligible: Contact[]) => {
    const scheduled = state.sendMode === "later" && state.date;
    const scheduledAt = scheduled ? new Date(`${state.date}T${state.time || "09:00"}:00`).getTime() : undefined;
    /* Validation à quatre yeux : audience > seuil → approbation superviseur requise */
    const needsReview = eligible.length > REVIEW_THRESHOLD;
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
      local: true,
    };
    setLocals((prev) => [...prev, created]);
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
        description: `« ${created.name} » partira le ${new Date(scheduledAt!).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} (${state.tz}).`,
      });
    } else {
      toast.success("Campagne lancée", { description: `« ${created.name} » — les envois démarrent.` });
    }
    setConfetti(true);
    setTimeout(() => setConfetti(false), 3200);
    setView({ name: "track", id: created.id });
  }, []);

  /* Validation à quatre yeux : le superviseur approuve → confettis + démarrage */
  const onValidate = useCallback((c: StudioCampaign) => {
    setLocals((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "running" as const } : x)));
    toast.success("Lancement validé", {
      description: `« ${c.name} » — approuvée par le superviseur, les envois démarrent.`,
    });
    setConfetti(true);
    setTimeout(() => setConfetti(false), 3200);
  }, []);

  const tracked = view.name === "track" ? campaigns.find((c) => c.id === view.id) : undefined;

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
              onTrack={(c) => setView({ name: "track", id: c.id })}
              onPauseToggle={onPauseToggle}
              onStop={(c) => setStopTarget(c)}
              onDuplicate={onDuplicate}
              onEdit={onEdit}
              onExport={onExport}
              onValidate={onValidate}
              onRelanceHuman={onRelanceHuman}
              onRelanceAi={onRelanceAi}
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
