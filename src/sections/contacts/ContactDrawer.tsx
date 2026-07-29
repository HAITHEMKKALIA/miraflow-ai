/**
 * ContactDrawer — fiche contact en drawer 480px (contacts.md S4). En-tête
 * (avatar 72px, actions Message/Appeler/⋯), stepper CRM cliquable, 4 onglets
 * à indicateur glissant : Aperçu (champs éditables inline, tags, score
 * détaillé, langue), Conversations (5 derniers échanges → Inbox),
 * Consentements (toggles + journal), Activité (timeline, entrées live).
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Cake, Check, Globe, Mail, MapPin, MessageSquare, MoreHorizontal, Pencil, Phone, Plus, Tag as TagIcon, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact, Conversation, CrmStage } from "@/lib/sim/store";
import { useCrm } from "./crmStore";
import type { ConsentKind } from "./crmStore";
import {
  CRM_STAGES, GradientAvatar, ScoreRing, STAGE_META, fmtDate, getProfile, relTime,
} from "./shared";
import { AppointmentsBlock, OrdersBlock } from "./OrdersRdv";
import { ConfirmDialog } from "@/components/ui-shared";
import { cn } from "@/lib/utils";

type Tab = "apercu" | "conversations" | "commandes" | "rdv" | "consentements" | "activite";
const TABS: { id: Tab; label: string }[] = [
  { id: "apercu", label: "Aperçu" },
  { id: "conversations", label: "Conversations" },
  { id: "commandes", label: "Commandes" },
  { id: "rdv", label: "Rendez-vous" },
  { id: "consentements", label: "Consentements" },
  { id: "activite", label: "Activité" },
];

/* ── Champ éditable inline (crayon au hover, sauvegarde au blur) ────────── */
function EditableField({
  icon,
  label,
  value,
  onSave,
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [saved, setSaved] = useState(false);
  useEffect(() => setVal(value), [value]);
  const commit = () => {
    setEditing(false);
    if (val.trim() && val !== value) {
      onSave(val.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    }
  };
  return (
    <div className="group flex items-center gap-3 rounded-r-sm border border-transparent px-2 py-2 transition-colors hover:border-line hover:bg-surface-2/50">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-r-sm bg-surface-2 text-low [&>svg]:size-3.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="label-micro text-low">{label}</p>
        {editing ? (
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={placeholder}
            className="mt-0.5 w-full rounded-r-sm border border-iris bg-surface-1 px-1.5 py-0.5 text-[13px] text-hi focus:outline-none"
          />
        ) : (
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-hi">
            <span className="truncate">{value || <span className="text-low">—</span>}</span>
            {saved && <Check className="size-3.5 shrink-0 text-mint" />}
          </p>
        )}
      </div>
      {!editing && (
        <button type="button" onClick={() => setEditing(true)} aria-label={`Modifier ${label}`}
          className="shrink-0 text-low opacity-0 transition-opacity hover:text-iris group-hover:opacity-100">
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/* ── Toggle ─────────────────────────────────────────────────────────────── */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200", on ? "bg-mint/80" : "bg-surface-3")}>
      <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow", on ? "end-0.5" : "start-0.5")} />
    </button>
  );
}

/* ── Drawer ─────────────────────────────────────────────────────────────── */
export interface ContactDrawerProps {
  contact: Contact | null;
  conversations: Conversation[];
  onClose: () => void;
  onMessage: (c: Contact) => void;
  onDelete: (id: string) => void;
}

export default function ContactDrawer({ contact, conversations, onClose, onMessage, onDelete }: ContactDrawerProps) {
  return (
    <AnimatePresence>
      {contact && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`Fiche ${contact.name}`}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-[4px]" onClick={onClose} />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 end-0 flex w-[min(480px,100vw)] flex-col border-s border-line bg-surface-1 shadow-card"
          >
            <DrawerBody key={contact.id} contact={contact} conversations={conversations} onClose={onClose} onMessage={onMessage} onDelete={onDelete} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({ contact, conversations, onClose, onMessage, onDelete }: {
  contact: Contact; conversations: Conversation[]; onClose: () => void; onMessage: (c: Contact) => void; onDelete: (id: string) => void;
}) {
  const overrides = useCrm((s) => s.overrides[contact.id]);
  const consentOv = useCrm((s) => s.consents[contact.id]);
  const activity = useCrm((s) => s.activity[contact.id]);
  const updateContact = useCrm((s) => s.updateContact);
  const setStage = useCrm((s) => s.setStage);
  const setTags = useCrm((s) => s.setTags);
  const setConsent = useCrm((s) => s.setConsent);
  const log = useCrm((s) => s.log);

  const effective: Contact = useMemo(() => ({ ...contact, ...(overrides ?? {}) }), [contact, overrides]);
  const profile = useMemo(() => getProfile(contact), [contact]);
  const [tab, setTab] = useState<Tab>("apercu");
  const [tagInput, setTagInput] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [profileEdits, setProfileEdits] = useState<Record<string, string>>({});

  const consentOf = (k: ConsentKind) => consentOv?.[k] ?? profile.consents[k].granted;
  const timeline = useMemo(() => {
    const all = [...(activity ?? []), ...profile.history];
    return all.sort((a, b) => b.at - a.at).slice(0, 20);
  }, [activity, profile.history]);
  const convList = useMemo(
    () => conversations.filter((c) => c.contactId === contact.id).slice(0, 5),
    [conversations, contact.id],
  );

  const onStage = (s: CrmStage) => {
    setStage(contact.id, s);
    log(contact.id, { kind: "stage", text: `Étape mise à jour : ${STAGE_META[s].label}` });
    toast.success("Étape mise à jour", { description: STAGE_META[s].label });
  };
  const onConsent = (k: ConsentKind, label: string) => (v: boolean) => {
    setConsent(contact.id, k, v);
    log(contact.id, { kind: "consent", text: `Consentement ${label} ${v ? "accordé" : "retiré"}` });
    toast.success(`Consentement ${label} ${v ? "accordé" : "retiré"}`);
  };
  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!effective.tags.includes(t)) setTags(contact.id, [...effective.tags, t]);
    setTagInput("");
  };

  return (
    <>
      {/* En-tête riche */}
      <div className="shrink-0 border-b border-line p-5">
        <div className="flex items-start gap-4">
          <GradientAvatar name={effective.name} size={72} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[18px] font-semibold text-hi">{effective.name}</h2>
            <p className="truncate font-mono text-[12px] tabular text-low" dir="ltr">{effective.phone}</p>
            <p className="mt-0.5 text-[12px] text-low">Client depuis {profile.since}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => onMessage(effective)}
                className="flex items-center gap-1.5 rounded-r-sm gradient-signature px-3 py-1.5 text-[12px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95">
                <MessageSquare className="size-3.5" /> Message
              </button>
              <button type="button" onClick={() => toast.info("Appel simulé", { description: `Appel de ${effective.name}…` })}
                className="flex items-center gap-1.5 rounded-r-sm border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-mid hover:bg-surface-3 hover:text-hi">
                <Phone className="size-3.5" /> Appeler
              </button>
              <button type="button" onClick={() => setConfirmDel(true)} aria-label="Plus d'actions"
                className="flex size-8 items-center justify-center rounded-r-sm border border-line bg-surface-2 text-mid hover:bg-surface-3 hover:text-hi">
                <MoreHorizontal className="size-4" />
              </button>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer"
            className="flex size-8 shrink-0 items-center justify-center rounded-r-sm text-mid transition-colors hover:bg-surface-2 hover:text-hi">
            <X className="size-4.5" />
          </button>
        </div>

        {/* Stepper CRM */}
        <div className="mt-4 flex items-center gap-1">
          {CRM_STAGES.map((s, i) => {
            const activeIdx = CRM_STAGES.indexOf(effective.stage);
            const done = i <= activeIdx;
            return (
              <button key={s} type="button" onClick={() => onStage(s)} title={STAGE_META[s].label}
                className="group flex flex-1 flex-col items-center gap-1">
                <motion.span
                  animate={{ backgroundColor: done ? `var(--${STAGE_META[s].tone})` : "var(--surface-3)", scale: i === activeIdx ? 1 : 0.8 }}
                  transition={{ duration: 0.3 }}
                  className={cn("h-2 w-full rounded-full", i === activeIdx && "ring-1 ring-current")}
                  style={{ color: `var(--${STAGE_META[s].tone})` }} />
                <span className={cn("text-[9px] leading-none", i === activeIdx ? "font-semibold text-hi" : "text-low")}>{STAGE_META[s].label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Onglets (défilement horizontal si étroit) */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-5 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cn("relative shrink-0 px-3 pb-2.5 pt-1.5 text-[13px] font-medium whitespace-nowrap transition-colors", tab === t.id ? "text-hi" : "text-low hover:text-mid")}>
            {t.label}
            {tab === t.id && (
              <motion.span layoutId="drawer-tab" className="absolute inset-x-0 bottom-0 h-[2px] gradient-signature" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
            )}
          </button>
        ))}
      </div>

      {/* Contenu onglets */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }}>
            {tab === "apercu" && (
              <div className="space-y-1">
                <EditableField icon={<Pencil />} label="Nom" value={effective.name} onSave={(v) => updateContact(contact.id, { name: v })} />
                <EditableField icon={<Mail />} label="Email" value={profileEdits.email ?? profile.email} onSave={(v) => setProfileEdits((p) => ({ ...p, email: v }))} />
                <EditableField icon={<MapPin />} label="Ville" value={effective.city} onSave={(v) => updateContact(contact.id, { city: v })} />
                <EditableField icon={<Cake />} label="Anniversaire" value={profileEdits.birthday ?? profile.birthday} onSave={(v) => setProfileEdits((p) => ({ ...p, birthday: v }))} />

                {/* Langue */}
                <div className="flex items-center gap-3 rounded-r-sm px-2 py-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-r-sm bg-surface-2 text-low"><Globe className="size-3.5" /></span>
                  <div className="flex-1">
                    <p className="label-micro text-low">Langue préférée</p>
                    <div className="mt-1 flex gap-1">
                      {(["FR", "AR"] as const).map((l) => (
                        <button key={l} type="button"
                          onClick={() => setProfileEdits((p) => ({ ...p, lang: l }))}
                          className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                            (profileEdits.lang ?? profile.lang) === l ? "border-iris/50 bg-iris/15 text-iris" : "border-line bg-surface-2 text-mid hover:bg-surface-3")}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div className="px-2 py-3">
                  <p className="label-micro text-low">Tags</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <AnimatePresence>
                      {effective.tags.map((t) => (
                        <motion.span key={t} layout initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
                          className="inline-flex items-center gap-1 rounded-full border border-iris/30 bg-iris/10 px-2 py-0.5 text-[11px] font-medium text-iris">
                          <TagIcon className="size-2.5" />{t}
                          <button type="button" onClick={() => setTags(contact.id, effective.tags.filter((x) => x !== t))} aria-label={`Retirer ${t}`} className="text-iris/60 hover:text-iris">
                            <X className="size-3" />
                          </button>
                        </motion.span>
                      ))}
                    </AnimatePresence>
                    <div className="flex items-center gap-1">
                      <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()}
                        placeholder="Ajouter…" className="w-20 rounded-r-sm border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-hi placeholder:text-low focus:border-iris focus:outline-none" />
                      <button type="button" onClick={addTag} aria-label="Ajouter le tag" className="text-low hover:text-iris"><Plus className="size-3.5" /></button>
                    </div>
                  </div>
                </div>

                {/* Score détaillé */}
                <div className="mt-2 rounded-r-md border border-line bg-surface-2/50 p-4">
                  <div className="flex items-center gap-4">
                    <ScoreRing score={effective.score} size={64} stroke={5} />
                    <div className="flex-1">
                      <p className="label-micro text-low">Score d'engagement</p>
                      <p className="mt-1 font-display text-[24px] font-semibold text-hi">{effective.score}<span className="text-[14px] text-low">/100</span></p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
                    {profile.scoreFactors.map((f) => (
                      <p key={f.label} className="flex items-center justify-between text-[12px]">
                        <span className="text-mid">{f.label}</span>
                        <span className="font-mono tabular text-mint">+{f.pts}</span>
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "conversations" && (
              <div className="space-y-2">
                {convList.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-low">Aucune conversation avec ce contact.</p>
                ) : (
                  convList.map((c) => {
                    const last = c.thread[c.thread.length - 1];
                    return (
                      <button key={c.id} type="button" onClick={() => onMessage(effective)}
                        className="flex w-full items-start gap-3 rounded-r-md border border-line bg-surface-2/40 p-3 text-start transition-colors hover:bg-surface-2">
                        <MessageSquare className="mt-0.5 size-4 shrink-0 text-iris" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-hi">{last?.body ?? "—"}</p>
                          <p className="mt-0.5 font-mono text-[10px] tabular text-low">{last ? relTime(last.at) : ""} · {c.thread.length} messages</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {tab === "commandes" && <OrdersBlock contact={effective} />}

            {tab === "rdv" && <AppointmentsBlock contact={effective} />}

            {tab === "consentements" && (
              <div className="space-y-4">
                {([{ k: "marketing" as ConsentKind, label: "Marketing" }, { k: "transactional" as ConsentKind, label: "Transactionnel" }, { k: "data" as ConsentKind, label: "Données" }]).map(({ k, label }) => (
                  <div key={k} className="flex items-center justify-between gap-3 rounded-r-md border border-line bg-surface-2/40 p-3.5">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-hi">{label}</p>
                      <p className="mt-0.5 font-mono text-[10px] tabular text-low">
                        {consentOf(k) ? `Accordé le ${fmtDate(profile.consents[k].at)} via ${profile.consents[k].via}` : "Non accordé"}
                      </p>
                    </div>
                    <Toggle on={consentOf(k)} onChange={onConsent(k, label)} />
                  </div>
                ))}
                <div className="rounded-r-md border border-line bg-surface-2/30 p-3.5">
                  <p className="label-micro text-low">Journal</p>
                  <ol className="mt-2 space-y-1.5">
                    {profile.history.filter((h) => h.kind === "consent").map((h) => (
                      <li key={h.id} className="flex items-center justify-between gap-2 text-[11px] text-mid">
                        <span className="truncate">{h.text}</span>
                        <span className="shrink-0 font-mono tabular text-low">{fmtDate(h.at)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {tab === "activite" && (
              <ol className="relative space-y-4 border-s border-line ps-5">
                <AnimatePresence initial={false}>
                  {timeline.map((h) => (
                    <motion.li key={h.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="relative">
                      <span className="absolute -start-[25px] top-1 size-2.5 rounded-full border border-line bg-surface-3" />
                      <p className="text-[13px] leading-snug text-mid">{h.text}</p>
                      <p className="mt-0.5 font-mono text-[10px] tabular text-low">{relTime(h.at)}</p>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => { onDelete(contact.id); setConfirmDel(false); onClose(); }}
        title="Supprimer ce contact ?"
        description={`« ${contact.name} » sera définitivement supprimé. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        icon={<Trash2 className="size-5" />}
      />
    </>
  );
}
