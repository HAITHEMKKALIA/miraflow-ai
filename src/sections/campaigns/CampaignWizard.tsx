/**
 * CampaignWizard — coquille de l'assistant 6 étapes (campaigns.md Vue 2).
 * Stepper vertical (horizontal sur mobile), transitions slide 300 ms (RTL
 * inversé), auto-save du brouillon toutes les 10 s (« Enregistré à 14:32 »),
 * reprise « Continuer l'étape N » via localStorage (mf:campaign-draft).
 * L'étape 6 « Suivre » est la Vue 3 (ouverte après lancement).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, CalendarClock, Check, LineChart, PenLine,
  Smartphone, Target, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/sim/store";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DRAFT_KEY, timeHM } from "./shared";
import type { WizardState } from "./WizardSteps";
import {
  INITIAL_WIZARD, StepAudience, StepContent, StepObjective, StepPreview, StepSchedule,
} from "./WizardSteps";

const STEPS = [
  { n: 1, label: "Objectif", icon: Target },
  { n: 2, label: "Audience", icon: Users },
  { n: 3, label: "Contenu", icon: PenLine },
  { n: 4, label: "Prévisualiser", icon: Smartphone },
  { n: 5, label: "Planifier", icon: CalendarClock },
  { n: 6, label: "Suivre", icon: LineChart },
];

function loadDraft(): WizardState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    return { ...INITIAL_WIZARD, ...parsed, step: Math.min(Math.max(parsed.step ?? 1, 1), 5) };
  } catch {
    return null;
  }
}

export default function CampaignWizard({
  resume,
  onCancel,
  onLaunch,
}: {
  resume: boolean;
  onCancel: () => void;
  onLaunch: (state: WizardState, eligible: Contact[]) => void;
}) {
  const { dir } = useI18n();
  const rtl = dir === "rtl";
  const [s, setS] = useState<WizardState>(() => (resume ? (loadDraft() ?? INITIAL_WIZARD) : INITIAL_WIZARD));
  const [dirNav, setDirNav] = useState(1);
  const [eligible, setEligible] = useState<Contact[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const maxStep = useRef(s.step);

  const patch = useCallback((p: Partial<WizardState>) => setS((prev) => ({ ...prev, ...p })), []);
  const reportEligible = useCallback((list: Contact[]) => setEligible(list), []);

  // Auto-save toutes les 10 s
  useEffect(() => {
    const t = setInterval(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(s));
        setSavedAt(Date.now());
      } catch {
        /* stockage indisponible */
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [s]);

  const goTo = useCallback((step: number) => {
    setDirNav(step > s.step ? 1 : -1);
    maxStep.current = Math.max(maxStep.current, step);
    patch({ step });
  }, [s.step, patch]);

  const canContinue = useMemo(() => {
    switch (s.step) {
      case 1: return !!s.goal && s.name.trim().length > 1;
      case 2: return eligible.length > 0;
      case 3: return s.content.trim().length > 0;
      case 4: return true;
      default: return false;
    }
  }, [s.step, s.goal, s.name, s.content, eligible.length]);

  const saveDraftAndExit = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(s));
    } catch { /* noop */ }
    toast.success("Brouillon enregistré", { description: "Reprenez-le à tout moment depuis la liste." });
    onCancel();
  };

  const launch = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* noop */ }
    onLaunch(s, eligible);
  };

  const slideX = (sign: number) => (rtl ? -1 : 1) * sign * 48;

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* Barre supérieure */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="label-micro text-low">Campagnes / Nouvelle</p>
          <h2 className="mt-1 font-display text-[24px] leading-[30px] font-semibold text-hi">
            {s.name.trim() || "Nouvelle campagne"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Fermer l'assistant"
          className="flex size-9 items-center justify-center rounded-full border border-line text-mid transition-colors hover:bg-surface-2 hover:text-hi"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[220px_1fr]">
        {/* Stepper vertical (horizontal sur mobile) */}
        <nav aria-label="Étapes de création" className="lg:sticky lg:top-24 lg:h-fit">
          <ol className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:gap-0 lg:pb-0">
            {STEPS.map((st, i) => {
              const done = st.n < s.step;
              const current = st.n === s.step;
              const reachable = st.n <= Math.max(maxStep.current, s.step) && st.n < 6;
              const Icon = st.icon;
              return (
                <li key={st.n} className="relative shrink-0 lg:shrink">
                  {i > 0 && (
                    <span
                      className={cn(
                        "absolute start-[17px] -top-4 hidden h-4 w-px lg:block",
                        done || current ? "bg-iris/60" : "bg-line",
                      )}
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => reachable && goTo(st.n)}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-r-sm px-2 py-2 text-start transition-colors lg:mb-4 lg:w-full",
                      reachable ? "hover:bg-surface-2" : "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-[34px] shrink-0 items-center justify-center rounded-full border transition-all duration-300",
                        current
                          ? "border-iris bg-iris/15 text-iris shadow-glow-iris"
                          : done
                            ? "border-mint/50 bg-mint/10 text-mint"
                            : "border-line bg-surface-1 text-low",
                      )}
                    >
                      {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                    </span>
                    <span className="hidden lg:block">
                      <span className={cn("block text-[13px] font-medium", current ? "text-hi" : done ? "text-mid" : "text-low")}>
                        {st.label}
                      </span>
                      <span className="label-micro text-low">
                        {st.n === 6 ? "après lancement" : `étape ${st.n}/6`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Contenu de l'étape */}
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={s.step}
              initial={{ opacity: 0, x: slideX(dirNav) }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: slideX(-dirNav) }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {s.step === 1 && <StepObjective s={s} patch={patch} />}
              {s.step === 2 && <StepAudience s={s} patch={patch} eligibleCount={reportEligible} />}
              {s.step === 3 && <StepContent s={s} patch={patch} />}
              {s.step === 4 && <StepPreview s={s} />}
              {s.step === 5 && <StepSchedule s={s} patch={patch} eligible={eligible.length} onLaunch={launch} />}
            </motion.div>
          </AnimatePresence>

          {/* Pied */}
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <button
              type="button"
              onClick={saveDraftAndExit}
              className="rounded-r-sm border border-line bg-surface-1 px-4 py-2.5 text-[13px] font-medium text-mid transition-colors hover:bg-surface-2 hover:text-hi"
            >
              Enregistrer le brouillon
            </button>
            <AnimatePresence>
              {savedAt && (
                <motion.span
                  key={savedAt}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="label-micro text-low"
                >
                  Enregistré à {timeHM(savedAt)}
                </motion.span>
              )}
            </AnimatePresence>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => (s.step === 1 ? onCancel() : goTo(s.step - 1))}
              className="inline-flex items-center gap-2 rounded-r-sm border border-line bg-surface-1 px-4 py-2.5 text-[13px] font-medium text-mid transition-colors hover:bg-surface-2 hover:text-hi"
            >
              <ArrowLeft className="size-4 rtl:-scale-x-100" /> {s.step === 1 ? "Annuler" : "Retour"}
            </button>
            {s.step < 5 && (
              <button
                type="button"
                disabled={!canContinue}
                onClick={() => goTo(s.step + 1)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-r-sm px-5 py-2.5 text-[13px] font-semibold text-white transition-all",
                  canContinue ? "gradient-signature hover:-translate-y-px hover:shadow-glow-iris active:scale-[.97]" : "cursor-not-allowed bg-surface-3 text-low",
                )}
              >
                Continuer <ArrowRight className="size-4 rtl:-scale-x-100" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
