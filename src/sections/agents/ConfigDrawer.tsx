/**
 * S3 — Drawer de configuration d'un agent (480px, 4 onglets crossfade) :
 * Identité (nom, ton, langues, signature) · Comportement (seuil de confiance
 * avec jauge + exemple live, horaires, max messages, phrases interdites) ·
 * Connaissances (documents liés) · Escalade (règles + assignation).
 * Enregistrer → toast + badge « mis à jour » sur la carte.
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Plus, X } from "lucide-react";
import { useTeam } from "@/lib/sim/store";
import { Drawer } from "@/components/ui-shared";
import { cn } from "@/lib/utils";
import { AGENT_META, COLOR_STYLES, escalationRate } from "./data";
import { ThresholdSlider, Toggle } from "./controls";
import { useAgentsPage, type AgentConfig } from "./context";
import { EASE } from "./motion";

const TABS = ["Identité", "Comportement", "Connaissances", "Escalade"] as const;
type TabId = (typeof TABS)[number];

const inputCls =
  "w-full rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[13.5px] text-hi placeholder:text-low transition-colors focus:border-iris focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-micro mb-1.5 block text-low">{label}</span>
      {children}
    </label>
  );
}

/** Tags éditables (phrases interdites, mots-clés d'escalade) */
function TagEditor({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-mid">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Retirer ${t}`} className="text-low hover:text-rose">
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className={inputCls}
        />
        <button type="button" onClick={add} className="shrink-0 rounded-r-sm border border-line bg-surface-2 px-3 text-mid hover:text-hi" aria-label="Ajouter">
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

export default function ConfigDrawer() {
  const { configAgentId, closeConfig, configs, saveConfig, docs, toggleDocAgent } = useAgentsPage();
  const team = useTeam();
  const [tab, setTab] = useState<TabId>("Identité");
  const [draft, setDraft] = useState<AgentConfig | null>(null);

  useEffect(() => {
    if (configAgentId) {
      setTab("Identité");
      setDraft(configs[configAgentId] ? { ...configs[configAgentId], langs: [...configs[configAgentId].langs], forbidden: [...configs[configAgentId].forbidden], docIds: [...configs[configAgentId].docIds], escalationKeywords: [...configs[configAgentId].escalationKeywords] } : null);
    }
  }, [configAgentId, configs]);

  const meta = configAgentId ? AGENT_META[configAgentId] : null;
  const styles = meta ? COLOR_STYLES[meta.color] : null;
  const escalated = useMemo(() => (draft ? escalationRate(draft.threshold) : 0), [draft]);

  const patch = (p: Partial<AgentConfig>) => setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <Drawer
      open={!!configAgentId && !!draft}
      onClose={closeConfig}
      width={480}
      title={
        <span className="flex items-center gap-2.5">
          {meta && styles && (
            <span className={cn("flex size-8 items-center justify-center rounded-full border", styles.orb)}>
              <meta.icon className={cn("size-4", styles.text)} />
            </span>
          )}
          Configurer · {draft?.name}
        </span>
      }
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={closeConfig}
            className="rounded-r-sm border border-line bg-surface-2 px-4 py-2 text-[13px] font-medium text-mid transition-colors hover:text-hi"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              if (configAgentId && draft) saveConfig(configAgentId, draft);
              closeConfig();
            }}
            className="gradient-signature rounded-r-sm px-4 py-2 text-[13px] font-semibold text-white transition-all hover:brightness-110 active:scale-[.97]"
          >
            Enregistrer
          </button>
        </div>
      }
    >
      {draft && configAgentId && (
        <div>
          {/* Onglets */}
          <div className="mb-5 flex gap-1 rounded-r-sm border border-line bg-surface-2 p-1">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "relative flex-1 rounded-[6px] px-2 py-1.5 text-[12px] font-medium transition-colors",
                  tab === t ? "text-hi" : "text-low hover:text-mid",
                )}
              >
                {tab === t && (
                  <motion.span layoutId="agent-config-tab" className="absolute inset-0 rounded-[6px] bg-surface-3" transition={{ type: "spring", stiffness: 420, damping: 32 }} />
                )}
                <span className="relative">{t}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="space-y-4"
            >
              {tab === "Identité" && (
                <>
                  <Field label="Nom de l'agent">
                    <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} className={inputCls} />
                  </Field>
                  <div>
                    <span className="label-micro mb-1.5 block text-low">Ton</span>
                    <div className="flex gap-2">
                      {(["Formel", "Chaleureux", "Concis"] as const).map((tone) => (
                        <button
                          key={tone}
                          type="button"
                          onClick={() => patch({ tone })}
                          className={cn(
                            "flex-1 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-all",
                            draft.tone === tone
                              ? "border-iris/50 bg-iris/10 text-iris"
                              : "border-line bg-surface-2 text-mid hover:text-hi",
                          )}
                        >
                          {tone}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="label-micro mb-1.5 block text-low">Langues</span>
                    <div className="flex gap-2">
                      {["FR", "AR", "EN"].map((l) => {
                        const on = draft.langs.includes(l);
                        return (
                          <button
                            key={l}
                            type="button"
                            onClick={() => patch({ langs: on ? draft.langs.filter((x) => x !== l) : [...draft.langs, l] })}
                            aria-pressed={on}
                            className={cn(
                              "flex size-10 items-center justify-center rounded-full border font-mono text-[12px] transition-all",
                              on ? "border-iris/50 bg-iris/10 text-iris" : "border-line bg-surface-2 text-low hover:text-mid",
                            )}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Field label="Signature des messages">
                    <input value={draft.signature} onChange={(e) => patch({ signature: e.target.value })} className={inputCls} />
                  </Field>
                </>
              )}

              {tab === "Comportement" && (
                <>
                  <div className="rounded-r-md border border-line bg-surface-2/60 p-4">
                    <span className="label-micro mb-2 block text-low">Seuil de confiance</span>
                    <ThresholdSlider value={draft.threshold} onChange={(v) => patch({ threshold: v })} id="cfg-threshold" />
                    <p className="mt-2 text-[12px] leading-[18px] text-mid">
                      En dessous, l'agent escalade à un humain.{" "}
                      <span className="text-hi">Avec {draft.threshold} %, ~{escalated} % des réponses sont escaladées.</span>
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <motion.div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--mint),var(--amber),var(--rose))]"
                        animate={{ width: `${escalated}%` }}
                        transition={{ duration: 0.4, ease: EASE }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Actif de">
                      <input type="time" value={draft.activeFrom} onChange={(e) => patch({ activeFrom: e.target.value })} className={inputCls} dir="ltr" />
                    </Field>
                    <Field label="à">
                      <input type="time" value={draft.activeTo} onChange={(e) => patch({ activeTo: e.target.value })} className={inputCls} dir="ltr" />
                    </Field>
                  </div>
                  <Field label="Messages max par conversation">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={draft.maxMessages}
                      onChange={(e) => patch({ maxMessages: Math.max(1, Math.min(20, Number(e.target.value))) })}
                      className={inputCls}
                      dir="ltr"
                    />
                  </Field>
                  <div>
                    <span className="label-micro mb-1.5 block text-low">Phrases interdites</span>
                    <TagEditor tags={draft.forbidden} onChange={(t) => patch({ forbidden: t })} placeholder="Ex. « gratuit à vie »" />
                  </div>
                </>
              )}

              {tab === "Connaissances" && (
                <>
                  <p className="text-[12.5px] leading-[19px] text-mid">
                    Documents que cet agent peut citer dans ses réponses (base RAG).
                  </p>
                  <div className="space-y-2">
                    {docs.map((doc) => {
                      const linked = draft.docIds.includes(doc.id);
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => {
                            patch({ docIds: linked ? draft.docIds.filter((x) => x !== doc.id) : [...draft.docIds, doc.id] });
                            toggleDocAgent(doc.id, configAgentId);
                          }}
                          aria-pressed={linked}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-r-sm border p-3 text-start transition-colors",
                            linked ? "border-iris/40 bg-iris/5" : "border-line bg-surface-2/50 hover:bg-surface-2",
                          )}
                        >
                          <FileText className={cn("size-4 shrink-0", linked ? "text-iris" : "text-low")} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-hi">{doc.name}</span>
                            <span className="label-micro text-low">{doc.fragments} fragments · {doc.version}</span>
                          </span>
                          <span className={cn("flex size-5 items-center justify-center rounded-full border", linked ? "border-iris bg-iris text-white" : "border-line-strong")}>
                            {linked && (
                              <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2 6.5 5 9l5-6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {tab === "Escalade" && (
                <>
                  <div>
                    <span className="label-micro mb-1.5 block text-low">Mots-clés déclencheurs</span>
                    <TagEditor tags={draft.escalationKeywords} onChange={(t) => patch({ escalationKeywords: t })} placeholder="Ex. réclamation" />
                  </div>
                  {[
                    { key: "escalateOnNegative" as const, label: "Sentiment négatif détecté", desc: "Escalade si le client semble frustré." },
                    { key: "escalateAfterExchanges" as const, label: "3 échanges sans résolution", desc: "Escalade si la conversation tourne en rond." },
                  ].map((rule) => (
                    <div key={rule.key} className="flex items-center justify-between gap-3 rounded-r-md border border-line bg-surface-2/60 p-3.5">
                      <div>
                        <p className="text-[13px] font-medium text-hi">{rule.label}</p>
                        <p className="text-[12px] text-mid">{rule.desc}</p>
                      </div>
                      <Toggle checked={draft[rule.key]} onChange={(v) => patch({ [rule.key]: v })} label={rule.label} />
                    </div>
                  ))}
                  <Field label="Assigner l'escalade à">
                    <select
                      value={draft.escalateTo}
                      onChange={(e) => patch({ escalateTo: e.target.value })}
                      className={cn(inputCls, "appearance-none")}
                    >
                      {team.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {m.role}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </Drawer>
  );
}
