/**
 * ContactPanel — fiche contact latérale de l'Inbox (inbox.md S3, 320px).
 * En-tête (avatar, étape CRM en stepper cliquable, score radial), sections en
 * accordéons : Tags (édition), Consentements (toggles + dates), Commandes
 * récentes, Notes internes (ajout), Historique (timeline). Données enrichies
 * déterministes + mutations via crmStore (partagé avec la page Contacts).
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check, ChevronDown, MessageSquare, Phone, Plus, Send, Tag as TagIcon, X,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact, Conversation, CrmStage } from "@/lib/sim/store";
import { useCrm } from "../contacts/crmStore";
import type { ConsentKind } from "../contacts/crmStore";
import {
  CRM_STAGES, GradientAvatar, ScoreRing, STAGE_META, fmtDate, fmtTime, getProfile, relTime,
} from "../contacts/shared";
import {
  AppointmentsBlock, OrdersBlock, getContactAppointments, getContactOrders,
} from "../contacts/OrdersRdv";
import { cn } from "@/lib/utils";

/* ── Toggle ─────────────────────────────────────────────────────────────── */
function Toggle({ on, onChange, tone = "mint" }: { on: boolean; onChange: (v: boolean) => void; tone?: "mint" | "iris" }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
        on ? (tone === "mint" ? "bg-mint/80" : "bg-iris/80") : "bg-surface-3",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow", on ? "end-0.5" : "start-0.5")}
      />
    </button>
  );
}

/* ── Accordéon ──────────────────────────────────────────────────────────── */
function Accordion({
  title,
  count,
  children,
  defaultOpen,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-line/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-start transition-colors hover:bg-surface-2/50"
      >
        <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-mid">
          {title}
          {count !== undefined && <span className="rounded-full bg-surface-2 px-1.5 font-mono text-[10px] tabular text-low">{count}</span>}
        </span>
        <ChevronDown className={cn("size-4 text-low transition-transform duration-300", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Stepper CRM (Prospect → Intéressé → Client → Fidèle) ───────────────── */
function StageStepper({ stage, onChange }: { stage: CrmStage; onChange: (s: CrmStage) => void }) {
  const steps: CrmStage[] = CRM_STAGES.filter((s) => s !== "lost");
  const activeIdx = steps.indexOf(stage);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Étape CRM">
      {steps.map((s, i) => {
        const done = i <= activeIdx;
        return (
          <div key={s} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => onChange(s)}
              title={STAGE_META[s].label}
              aria-label={`Étape ${STAGE_META[s].label}`}
              className="group flex flex-col items-center gap-1"
            >
              <motion.span
                animate={{
                  scale: i === activeIdx ? 1 : 0.86,
                  backgroundColor: done ? `var(--${STAGE_META[s].tone})` : "var(--surface-3)",
                }}
                transition={{ duration: 0.3 }}
                className={cn("size-3 rounded-full ring-2", i === activeIdx ? "ring-current" : "ring-transparent")}
                style={{ color: `var(--${STAGE_META[s].tone})` }}
              />
              <span className={cn("text-[9px] leading-none", i === activeIdx ? "font-semibold text-hi" : "text-low")}>
                {STAGE_META[s].label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span className={cn("mb-4 h-px flex-1 transition-colors duration-500", i < activeIdx ? "bg-mint" : "bg-line")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Panel ──────────────────────────────────────────────────────────────── */
export interface ContactPanelProps {
  contact: Contact;
  conversations: Conversation[];
  onMessage: () => void;
}

export default function ContactPanel({ contact, conversations, onMessage }: ContactPanelProps) {
  const overrides = useCrm((s) => s.overrides[contact.id]);
  const consentOv = useCrm((s) => s.consents[contact.id]);
  const addedNotes = useCrm((s) => s.notes[contact.id]);
  const activity = useCrm((s) => s.activity[contact.id]);
  const setStage = useCrm((s) => s.setStage);
  const setTags = useCrm((s) => s.setTags);
  const setConsent = useCrm((s) => s.setConsent);
  const addNote = useCrm((s) => s.addNote);
  const log = useCrm((s) => s.log);

  const effective: Contact = useMemo(() => ({ ...contact, ...(overrides ?? {}) }), [contact, overrides]);
  const profile = useMemo(() => getProfile(contact), [contact]);
  const orders = useMemo(() => getContactOrders(effective), [effective]);
  const appts = useMemo(() => getContactAppointments(effective), [effective]);

  const [tagInput, setTagInput] = useState("");
  const [noteInput, setNoteInput] = useState("");

  /* reset champs au changement de contact */
  useEffect(() => {
    setTagInput("");
    setNoteInput("");
  }, [contact.id]);

  const notes = useMemo(() => {
    const all = [...(addedNotes ?? []), ...profile.notes];
    return all.sort((a, b) => b.at - a.at);
  }, [addedNotes, profile.notes]);

  const history = useMemo(() => {
    const all = [...(activity ?? []), ...profile.history];
    return all.sort((a, b) => b.at - a.at).slice(0, 12);
  }, [activity, profile.history]);

  const consentOf = (kind: ConsentKind) => consentOv?.[kind] ?? profile.consents[kind].granted;
  const consentAt = (kind: ConsentKind) => profile.consents[kind].at;

  const onStage = (s: CrmStage) => {
    setStage(contact.id, s);
    log(contact.id, { kind: "stage", text: `Étape mise à jour : ${STAGE_META[s].label}` });
    toast.success("Étape mise à jour", { description: STAGE_META[s].label });
  };

  const onConsent = (kind: ConsentKind, label: string) => (v: boolean) => {
    setConsent(contact.id, kind, v);
    log(contact.id, { kind: "consent", text: `Consentement ${label} ${v ? "accordé" : "retiré"}` });
    toast.success(`Consentement ${label} ${v ? "accordé" : "retiré"}`);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (effective.tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags(contact.id, [...effective.tags, t]);
    setTagInput("");
    toast.success(`Tag « ${t} » ajouté`);
  };
  const removeTag = (t: string) => setTags(contact.id, effective.tags.filter((x) => x !== t));

  const submitNote = () => {
    const text = noteInput.trim();
    if (!text) return;
    addNote(contact.id, { id: `note_${Date.now().toString(36)}`, author: "Vous", at: Date.now(), text });
    log(contact.id, { kind: "note", text: `Note ajoutée : « ${text.slice(0, 40)}${text.length > 40 ? "…" : ""} »` });
    setNoteInput("");
    toast.success("Note ajoutée");
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain">
      {/* En-tête */}
      <div className="shrink-0 border-b border-line p-4">
        <div className="flex items-start gap-3">
          <GradientAvatar name={effective.name} size={56} src={effective.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-hi">{effective.name}</p>
            <p className="truncate font-mono text-[11px] tabular text-low" dir="ltr">{effective.phone}</p>
            <p className="mt-0.5 text-[11px] text-low">Client depuis {profile.since}</p>
          </div>
          <ScoreRing score={effective.score} size={44} />
        </div>

        <div className="mt-4">
          <StageStepper stage={effective.stage} onChange={onStage} />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onMessage}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-r-sm gradient-signature px-3 py-2 text-[12px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95"
          >
            <MessageSquare className="size-3.5" /> Message
          </button>
          <a
            href={`tel:${effective.phone.replace(/\s/g, "")}`}
            aria-label={`Appeler ${effective.name}`}
            className="flex items-center justify-center gap-1.5 rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[12px] font-medium text-mid transition-colors hover:bg-surface-3 hover:text-hi"
          >
            <Phone className="size-3.5" />
          </a>
        </div>
      </div>

      {/* Tags */}
      <Accordion title="Tags" count={effective.tags.length} defaultOpen>
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence>
            {effective.tags.map((t) => (
              <motion.span
                key={t}
                layout
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ type: "spring", stiffness: 500, damping: 26 }}
                className="group inline-flex items-center gap-1 rounded-full border border-iris/30 bg-iris/10 px-2 py-0.5 text-[11px] font-medium text-iris"
              >
                <TagIcon className="size-2.5" />
                {t}
                <button type="button" onClick={() => removeTag(t)} aria-label={`Retirer ${t}`}
                  className="text-iris/60 transition-colors hover:text-iris">
                  <X className="size-3" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        <div className="mt-2 flex gap-1.5">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTag()}
            placeholder="Ajouter un tag…"
            className="min-w-0 flex-1 rounded-r-sm border border-line bg-surface-2 px-2 py-1 text-[12px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
          />
          <button type="button" onClick={addTag} aria-label="Ajouter le tag"
            className="flex size-7 shrink-0 items-center justify-center rounded-r-sm border border-line bg-surface-2 text-mid hover:bg-surface-3 hover:text-hi">
            <Plus className="size-3.5" />
          </button>
        </div>
      </Accordion>

      {/* Consentements */}
      <Accordion title="Consentements" defaultOpen>
        <div className="space-y-3">
          {(
            [
              { k: "marketing" as ConsentKind, label: "Marketing" },
              { k: "transactional" as ConsentKind, label: "Transactionnel" },
              { k: "data" as ConsentKind, label: "Données" },
            ]
          ).map(({ k, label }) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-hi">{label}</p>
                <p className="font-mono text-[10px] tabular text-low">{consentOf(k) ? `depuis ${fmtDate(consentAt(k))}` : "non accordé"}</p>
              </div>
              <Toggle on={consentOf(k)} onChange={onConsent(k, label)} />
            </div>
          ))}
        </div>
      </Accordion>

      {/* Commandes (n°, statut, montant TND) */}
      <Accordion title="Commandes" count={orders.length} defaultOpen>
        <OrdersBlock contact={effective} />
      </Accordion>

      {/* Rendez-vous à venir (confirmer / replanifier) */}
      <Accordion title="Rendez-vous" count={appts.length}>
        <AppointmentsBlock contact={effective} />
      </Accordion>

      {/* Notes internes */}
      <Accordion title="Notes internes" count={notes.length}>
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {notes.map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-r-sm border border-line/60 bg-surface-2/60 p-2.5"
              >
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold text-iris">{n.author}</span>
                  <span className="font-mono text-[9px] tabular text-low">{fmtTime(n.at)}</span>
                </p>
                <p className="mt-1 text-[12.5px] leading-snug text-mid">{n.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="mt-2 flex gap-1.5">
          <input
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNote()}
            placeholder="Ajouter une note…"
            className="min-w-0 flex-1 rounded-r-sm border border-line bg-surface-2 px-2 py-1.5 text-[12px] text-hi placeholder:text-low focus:border-iris focus:outline-none"
          />
          <button type="button" onClick={submitNote} aria-label="Ajouter la note"
            className="flex size-8 shrink-0 items-center justify-center rounded-r-sm gradient-signature text-white transition-transform hover:scale-105 active:scale-95 rtl:-scale-x-100">
            <Send className="size-3.5" />
          </button>
        </div>
      </Accordion>

      {/* Historique */}
      <Accordion title="Historique" count={history.length}>
        <ol className="relative space-y-3 border-s border-line ps-4">
          {history.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -start-[21px] top-1 size-2 rounded-full border border-line bg-surface-3" />
              <p className="text-[12px] leading-snug text-mid">{h.text}</p>
              <p className="font-mono text-[9.5px] tabular text-low">{relTime(h.at)}</p>
            </li>
          ))}
        </ol>
      </Accordion>

      {/* Conversations liées */}
      {conversations.length > 0 && (
        <Accordion title="Conversations" count={conversations.length}>
          <div className="space-y-1.5">
            {conversations.slice(0, 5).map((c) => {
              const last = c.thread[c.thread.length - 1];
              return (
                <button key={c.id} type="button" onClick={onMessage}
                  className="flex w-full items-center gap-2 rounded-r-sm border border-line/60 bg-surface-2/50 px-2.5 py-2 text-start transition-colors hover:bg-surface-2">
                  <Check className="size-3 shrink-0 text-mint" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-mid">{last?.body ?? "—"}</span>
                  <span className="shrink-0 font-mono text-[9.5px] tabular text-low">{last ? relTime(last.at) : ""}</span>
                </button>
              );
            })}
          </div>
        </Accordion>
      )}
    </div>
  );
}
