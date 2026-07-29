/**
 * SegmentsView — vue « Segments dynamiques » (contacts.md S5). À gauche :
 * cartes de segments (règles résumées, compteur recalculé en direct). À
 * droite : constructeur de règles (champ/opérateur/valeur, connecteurs ET/OU)
 * avec compteur d'aperçu en temps réel + 5 premiers contacts, sauvegarde et
 * « Utiliser dans une campagne ».
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clock, Crown, Megaphone, Plus, Save, ShoppingCart, Sparkles, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/sim/store";
import { TickNumber } from "@/components/ui-shared";
import {
  FIELD_LABELS, OP_LABELS, SEGMENTS, countRules, matchRules, opsFor, segmentContacts, segmentCount,
} from "./segments";
import type { Rule, RuleField, RuleOp } from "./segments";
import { CRM_STAGES, GradientAvatar, STAGE_META } from "./shared";
import { cn } from "@/lib/utils";

const SEG_ICONS: Record<string, React.ReactNode> = {
  "vip-tunis": <Crown className="size-4" />,
  "new-30": <Sparkles className="size-4" />,
  cart: <ShoppingCart className="size-4" />,
  "inactive-90": <Clock className="size-4" />,
};

let ruleSeq = 0;
const rid = () => `rule_${Date.now().toString(36)}_${ruleSeq++}`;

export interface SegmentsViewProps {
  contacts: Contact[];
  onUseInCampaign: (segmentId: string) => void;
  onOpenContact: (c: Contact) => void;
}

export default function SegmentsView({ contacts, onUseInCampaign, onOpenContact }: SegmentsViewProps) {
  const [selected, setSelected] = useState<string>(SEGMENTS[0].id);
  const [rules, setRules] = useState<Rule[]>([
    { id: rid(), field: "city", op: "is", value: "Tunis" },
    { id: rid(), field: "score", op: "gt", value: "70" },
  ]);
  const [combinator, setCombinator] = useState<"and" | "or">("and");
  const [customSegments, setCustomSegments] = useState<{ id: string; name: string; count: number }[]>([]);
  const [segName, setSegName] = useState("");

  const liveCount = useMemo(() => countRules(contacts, rules, combinator), [contacts, rules, combinator]);
  const preview = useMemo(() => contacts.filter((c) => matchRules(c, rules, combinator)).slice(0, 5), [contacts, rules, combinator]);

  const updateRule = (id: string, patch: Partial<Rule>) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRule = (id: string) => setRules((rs) => rs.filter((r) => r.id !== id));
  const addRule = () => setRules((rs) => [...rs, { id: rid(), field: "city", op: "is", value: "" }]);

  const saveSegment = () => {
    const name = segName.trim() || `Segment ${customSegments.length + 1}`;
    setCustomSegments((s) => [...s, { id: rid(), name, count: liveCount }]);
    setSegName("");
    toast.success(`Segment « ${name} » enregistré`, { description: `${liveCount} contacts` });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      {/* ── Liste des segments ── */}
      <div className="space-y-2.5">
        {SEGMENTS.map((s, i) => {
          const count = segmentCount(s, contacts);
          const active = selected === s.id;
          return (
            <motion.button
              key={s.id}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelected(s.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-r-md border p-3.5 text-start transition-all",
                active ? "border-iris/50 bg-surface-2 shadow-glow-iris" : "border-line bg-surface-1 hover:bg-surface-2/60",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-r-sm" style={{ backgroundColor: `color-mix(in srgb, ${s.color} 15%, transparent)`, color: s.color }}>
                {SEG_ICONS[s.id] ?? <Users className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-hi">{s.name}</span>
                <span className="block truncate text-[11px] text-low">{s.desc}</span>
              </span>
              <span className="shrink-0 font-display text-[18px] font-semibold tabular text-hi">
                <TickNumber value={count} />
              </span>
            </motion.button>
          );
        })}

        {/* Segments personnalisés */}
        <AnimatePresence>
          {customSegments.map((s) => (
            <motion.div key={s.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 rounded-r-md border border-dashed border-iris/40 bg-iris/5 p-3.5">
              <span className="flex size-9 items-center justify-center rounded-r-sm bg-iris/15 text-iris"><Users className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-hi">{s.name}</span>
                <span className="block text-[11px] text-low">Personnalisé</span>
              </span>
              <span className="font-display text-[18px] font-semibold tabular text-hi">{s.count}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        <button type="button" onClick={() => onUseInCampaign(selected)}
          className="flex w-full items-center justify-center gap-2 rounded-r-md border border-line bg-surface-2 px-3 py-2.5 text-[13px] font-medium text-hi transition-colors hover:bg-surface-3">
          <Megaphone className="size-4 text-iris" /> Utiliser dans une campagne
        </button>
      </div>

      {/* ── Constructeur de règles ── */}
      <div className="rounded-r-md border border-line bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[16px] font-semibold text-hi">Constructeur de segment</h3>
          <div className="flex items-center gap-1 rounded-full border border-line bg-surface-2 p-0.5">
            {(["and", "or"] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCombinator(c)}
                className={cn("rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                  combinator === c ? "bg-iris text-white" : "text-low hover:text-mid")}>
                {c === "and" ? "ET" : "OU"}
              </button>
            ))}
          </div>
        </div>

        {/* Règles */}
        <div className="mt-4 space-y-2">
          <AnimatePresence initial={false}>
            {rules.map((r, i) => (
              <motion.div key={r.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="relative flex items-center gap-2">
                {i > 0 && (
                  <span className="absolute -top-2.5 start-4 z-10 rounded-full bg-surface-2 px-1.5 font-mono text-[9px] uppercase text-low">
                    {combinator === "and" ? "ET" : "OU"}
                  </span>
                )}
                <div className="grid flex-1 grid-cols-[1fr_0.8fr_1fr] gap-2 rounded-r-md border border-line bg-surface-2/50 p-2.5">
                  {/* Champ */}
                  <select value={r.field} aria-label="Champ"
                    onChange={(e) => {
                      const field = e.target.value as RuleField;
                      updateRule(r.id, { field, op: opsFor(field)[0], value: field === "stage" ? "client" : field === "consent" ? "oui" : "" });
                    }}
                    className="rounded-r-sm border border-line bg-surface-1 px-2 py-1.5 text-[12px] text-hi focus:border-iris focus:outline-none">
                    {(Object.keys(FIELD_LABELS) as RuleField[]).map((f) => (
                      <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                    ))}
                  </select>
                  {/* Opérateur */}
                  <select value={r.op} aria-label="Opérateur" onChange={(e) => updateRule(r.id, { op: e.target.value as RuleOp })}
                    className="rounded-r-sm border border-line bg-surface-1 px-2 py-1.5 text-[12px] text-hi focus:border-iris focus:outline-none">
                    {opsFor(r.field).map((o) => (
                      <option key={o} value={o}>{OP_LABELS[o]}</option>
                    ))}
                  </select>
                  {/* Valeur */}
                  {r.field === "stage" ? (
                    <select value={r.value} aria-label="Valeur" onChange={(e) => updateRule(r.id, { value: e.target.value })}
                      className="rounded-r-sm border border-line bg-surface-1 px-2 py-1.5 text-[12px] text-hi focus:border-iris focus:outline-none">
                      {CRM_STAGES.map((s) => (
                        <option key={s} value={s}>{STAGE_META[s].label}</option>
                      ))}
                    </select>
                  ) : r.field === "consent" ? (
                    <select value={r.value} aria-label="Valeur" onChange={(e) => updateRule(r.id, { value: e.target.value })}
                      className="rounded-r-sm border border-line bg-surface-1 px-2 py-1.5 text-[12px] text-hi focus:border-iris focus:outline-none">
                      <option value="oui">Oui</option>
                      <option value="non">Non</option>
                    </select>
                  ) : (
                    <input value={r.value} aria-label="Valeur" onChange={(e) => updateRule(r.id, { value: e.target.value })}
                      placeholder={r.field === "score" || r.field === "lastActive" ? "0" : "Valeur…"}
                      type={r.field === "score" || r.field === "lastActive" ? "number" : "text"}
                      className="rounded-r-sm border border-line bg-surface-1 px-2 py-1.5 text-[12px] text-hi placeholder:text-low focus:border-iris focus:outline-none" />
                  )}
                </div>
                <button type="button" onClick={() => removeRule(r.id)} aria-label="Supprimer la condition"
                  className="flex size-8 shrink-0 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-rose/10 hover:text-rose">
                  <X className="size-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <button type="button" onClick={addRule}
          className="mt-3 flex items-center gap-1.5 rounded-r-sm border border-dashed border-line px-3 py-2 text-[12px] font-medium text-mid transition-colors hover:border-iris/50 hover:text-iris">
          <Plus className="size-3.5" /> Ajouter une condition
        </button>

        {/* Aperçu en direct */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-r-md border border-line bg-surface-2/40 p-4">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {preview.map((c) => (
                <button key={c.id} type="button" onClick={() => onOpenContact(c)} title={c.name}
                  className="rounded-full ring-2 ring-surface-1 transition-transform hover:-translate-y-0.5">
                  <GradientAvatar name={c.name} size={30} />
                </button>
              ))}
            </div>
            <p className="text-[13px] text-mid">
              <span className="font-display text-[20px] font-semibold tabular text-hi"><TickNumber value={liveCount} /></span>{" "}
              contact{liveCount > 1 ? "s" : ""} correspond{liveCount > 1 ? "ent" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input value={segName} onChange={(e) => setSegName(e.target.value)} placeholder="Nom du segment…"
              className="w-40 rounded-r-sm border border-line bg-surface-1 px-2.5 py-1.5 text-[12px] text-hi placeholder:text-low focus:border-iris focus:outline-none" />
            <button type="button" onClick={saveSegment} disabled={!rules.length}
              className="flex items-center gap-1.5 rounded-r-sm gradient-signature px-3 py-1.5 text-[12px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-40">
              <Save className="size-3.5" /> Enregistrer
            </button>
          </div>
        </div>

        {/* Aperçu contacts du segment sélectionné */}
        <div className="mt-4">
          <p className="label-micro text-low">Aperçu — {SEGMENTS.find((s) => s.id === selected)?.name}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {segmentContacts(SEGMENTS.find((s) => s.id === selected)!, contacts).slice(0, 8).map((c) => (
              <button key={c.id} type="button" onClick={() => onOpenContact(c)}
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pe-2.5 ps-1 text-[11px] text-mid transition-colors hover:bg-surface-3 hover:text-hi">
                <GradientAvatar name={c.name} size={18} />
                {c.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
