/**
 * AgentManager — gestion des 7 agents IA du tenant (prompt maître §32-37, §46, §57).
 * Table : nom, type, actif, modèle (qwen3:8b), température, seuils de confiance,
 * langues, sessions autorisées, statistiques. Drawer/modale d'édition avec prompt
 * système versionné (§33).
 */
import { useState } from "react";
import { Pencil, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  useAgents, useSessions, useSim,
  type AgentLang, type AgentProvider, type AgentType, type AiAgent, type ConfidenceThresholds,
} from "@/lib/sim/store";
import { resolveAgentEngine } from "@/lib/ai";
import {
  BizBadge, BizModal, BizTable, FormField, GhostButton,
  PrimaryButton, SelectField, TextArea, TextField,
} from "@/sections/business/ui";
import { cn } from "@/lib/utils";

export const AGENT_TYPE_META: Record<AgentType, { label: string; tone: "mint" | "amber" | "rose" | "iris" | "low" | "pulse" }> = {
  router: { label: "Router", tone: "iris" },
  commercial: { label: "Commercial", tone: "pulse" },
  sav: { label: "SAV", tone: "amber" },
  livraison: { label: "Livraison", tone: "mint" },
  support: { label: "Support", tone: "low" },
  paiement: { label: "Paiement", tone: "iris" },
  superviseur: { label: "Superviseur", tone: "rose" },
};

export const AGENT_LANG_LABELS: Record<AgentLang, string> = {
  "ar-TN": "Arabe TN",
  arabizi: "Arabizi",
  fr: "Français",
  en: "Anglais",
  de: "Allemand",
};

const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen/qwen3-32b", "openai/gpt-oss-120b"];
const OLLAMA_MODELS = ["qwen3:8b", "qwen3:14b", "llama3.1:8b", "mistral:7b"];

interface EditState {
  id: string;
  enabled: boolean;
  provider: AgentProvider;
  model: string;
  temperature: string;
  thresholds: ConfidenceThresholds;
  languages: AgentLang[];
  sessionIds: string[];
  systemPrompt: string;
}

function toEditState(a: AiAgent): EditState {
  const g = useSim.getState().aiSettings;
  return {
    id: a.id,
    enabled: a.enabled ?? true,
    provider: a.provider ?? "default",
    model: a.model ?? g.ollamaModel,
    temperature: String(a.temperature ?? 0.2),
    thresholds: { ...(a.thresholds ?? g.thresholds) },
    languages: [...(a.languages ?? [])],
    sessionIds: [...(a.sessionIds ?? [])],
    systemPrompt: a.systemPrompt ?? "",
  };
}

export default function AgentManager() {
  const agents = useAgents();
  const sessions = useSessions();
  const updateAgent = useSim((s) => s.updateAgent);

  const [edit, setEdit] = useState<EditState | null>(null);

  const openEdit = (a: AiAgent) => setEdit(toEditState(a));

  const toggleEnabled = (a: AiAgent) => {
    updateAgent(a.id, { enabled: !(a.enabled ?? true) });
    toast.success(`${a.name} ${(a.enabled ?? true) ? "désactivé" : "activé"}`);
  };

  const toggleLang = (l: AgentLang) =>
    setEdit((e) =>
      e
        ? { ...e, languages: e.languages.includes(l) ? e.languages.filter((x) => x !== l) : [...e.languages, l] }
        : e,
    );

  const toggleSession = (id: string) =>
    setEdit((e) =>
      e
        ? { ...e, sessionIds: e.sessionIds.includes(id) ? e.sessionIds.filter((x) => x !== id) : [...e.sessionIds, id] }
        : e,
    );

  const submit = () => {
    if (!edit) return;
    const temperature = Number(edit.temperature.replace(",", "."));
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      return toast.error("Température invalide (0.0 à 2.0)");
    }
    const t = edit.thresholds;
    if (!(t.auto >= t.validation && t.validation >= t.supervisor)) {
      return toast.error("Seuils incohérents : auto ≥ validation ≥ superviseur requis (§46)");
    }
    updateAgent(edit.id, {
      enabled: edit.enabled,
      provider: edit.provider,
      model: edit.model.trim() || "qwen3:8b",
      temperature,
      thresholds: { ...t },
      languages: edit.languages,
      sessionIds: edit.sessionIds,
      systemPrompt: edit.systemPrompt.trim(),
    });
    toast.success("Agent mis à jour (prompt versionné)");
    setEdit(null);
  };

  const editingAgent = edit ? agents.find((a) => a.id === edit.id) : undefined;

  return (
    <section aria-label="Gestion des agents IA">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-[20px] font-semibold text-hi">Configuration des agents</h2>
          <p className="mt-1 text-[13px] text-mid">
            Moteur IA personnalisable par agent (Groq cloud ou Ollama local), prompts et permissions dédiés (§32). Seuils de confiance configurables (§46).
          </p>
        </div>
        <BizBadge tone="iris">
          <SlidersHorizontal className="mr-1 size-3" />
          {agents.filter((a) => a.enabled ?? true).length} / {agents.length} actifs
        </BizBadge>
      </div>

      <BizTable head={["Agent", "Type", "Actif", "Moteur IA", "Modèle", "Temp.", "Seuils (A/V/S)", "Langues", "Sessions", "Stats", ""]}>
        {agents.map((a) => {
          const type = a.agentType ? AGENT_TYPE_META[a.agentType] : undefined;
          const enabled = a.enabled ?? true;
          const th = a.thresholds;
          const stats = a.stats;
          const engine = resolveAgentEngine(a);
          const shortModel = engine.model.length > 22 ? `${engine.model.slice(0, 21)}…` : engine.model;
          return (
            <tr
              key={a.id}
              className={cn(
                "border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/50",
                !enabled && "opacity-60",
              )}
            >
              <td className="px-4 py-3">
                <span className="block text-[13px] font-medium text-hi">{a.name}</span>
                <span className="block max-w-[280px] truncate text-[11px] text-low">{a.tagline}</span>
              </td>
              <td className="px-4 py-3">
                {type ? <BizBadge tone={type.tone}>{type.label}</BizBadge> : <span className="text-[12px] text-low">—</span>}
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`Activer ${a.name}`}
                  onClick={() => toggleEnabled(a)}
                  className={cn(
                    "relative h-5 w-9 rounded-full transition-colors",
                    enabled ? "bg-mint/70" : "bg-surface-3",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-4 rounded-full bg-white shadow transition-all",
                      enabled ? "start-[18px]" : "start-0.5",
                    )}
                  />
                </button>
              </td>
              <td className="px-4 py-3">
                {engine.overridden ? (
                  <BizBadge tone={engine.provider === "groq" ? "iris" : "mint"}>
                    {engine.provider === "groq" ? "Groq" : "Ollama"} · {shortModel}
                  </BizBadge>
                ) : (
                  <BizBadge tone="low">Défaut</BizBadge>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-[12px] text-mid">{a.model ?? "qwen3:8b"}</td>
              <td className="px-4 py-3 text-[13px] tabular text-hi">{(a.temperature ?? 0.2).toFixed(1)}</td>
              <td className="px-4 py-3 font-mono text-[11px] text-mid">
                {th ? `${th.auto.toFixed(2)} / ${th.validation.toFixed(2)} / ${th.supervisor.toFixed(2)}` : "—"}
              </td>
              <td className="px-4 py-3">
                <span className="flex max-w-[180px] flex-wrap gap-1">
                  {(a.languages ?? []).slice(0, 3).map((l) => (
                    <span key={l} className="rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-mid">
                      {AGENT_LANG_LABELS[l]}
                    </span>
                  ))}
                  {(a.languages?.length ?? 0) > 3 && (
                    <span className="text-[10px] text-low">+{(a.languages?.length ?? 0) - 3}</span>
                  )}
                </span>
              </td>
              <td className="px-4 py-3 text-[12px] tabular text-mid">
                {(a.sessionIds?.length ?? 0) === 0 ? "Toutes" : `${a.sessionIds!.length} / ${sessions.length}`}
              </td>
              <td className="px-4 py-3 text-[12px] text-mid">
                <span className="tabular">{stats?.handled ?? a.handled}</span> traités
                {stats && stats.escalations > 0 && (
                  <span className="block text-[10px] text-rose">{stats.escalations} escalades</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    aria-label={`Configurer ${a.name}`}
                    className="flex size-8 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-surface-2 hover:text-hi"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </BizTable>

      {/* Modale d'édition (§57 : prompt versionné, modèle, température, seuils, langues, sessions) */}
      <BizModal
        open={edit !== null}
        title={editingAgent ? `Configurer « ${editingAgent.name} »` : ""}
        subtitle={
          editingAgent
            ? `${editingAgent.agentType ? AGENT_TYPE_META[editingAgent.agentType].label : "Agent"} · prompt v${editingAgent.promptVersions?.length ?? 1}`
            : undefined
        }
        onClose={() => setEdit(null)}
        wide
      >
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <FormField label="Moteur IA">
                <SelectField
                  value={edit.provider}
                  onChange={(e) => setEdit({ ...edit, provider: e.target.value as AgentProvider })}
                >
                  <option value="default">Par défaut (paramètres globaux)</option>
                  <option value="groq">Groq Cloud</option>
                  <option value="ollama">Ollama (local)</option>
                </SelectField>
              </FormField>
              <FormField label="Modèle">
                <TextField
                  list={edit.provider === "groq" ? "agent-groq-models" : edit.provider === "ollama" ? "agent-ollama-models" : undefined}
                  value={edit.model}
                  onChange={(e) => setEdit({ ...edit, model: e.target.value })}
                  placeholder={edit.provider === "groq" ? "llama-3.3-70b-versatile" : "qwen3:8b"}
                />
                <datalist id="agent-groq-models">
                  {GROQ_MODELS.map((m) => <option key={m} value={m} />)}
                </datalist>
                <datalist id="agent-ollama-models">
                  {OLLAMA_MODELS.map((m) => <option key={m} value={m} />)}
                </datalist>
              </FormField>
              <FormField label="Température (0.0 – 2.0)">
                <TextField
                  value={edit.temperature}
                  inputMode="decimal"
                  onChange={(e) => setEdit({ ...edit, temperature: e.target.value })}
                />
              </FormField>
              <FormField label="Statut">
                <SelectField
                  value={edit.enabled ? "1" : "0"}
                  onChange={(e) => setEdit({ ...edit, enabled: e.target.value === "1" })}
                >
                  <option value="1">Actif</option>
                  <option value="0">Inactif</option>
                </SelectField>
              </FormField>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <FormField label="Seuil auto (≥)">
                <TextField
                  value={String(edit.thresholds.auto)}
                  inputMode="decimal"
                  onChange={(e) =>
                    setEdit({ ...edit, thresholds: { ...edit.thresholds, auto: Number(e.target.value.replace(",", ".")) || 0 } })
                  }
                />
              </FormField>
              <FormField label="Validation (≥)">
                <TextField
                  value={String(edit.thresholds.validation)}
                  inputMode="decimal"
                  onChange={(e) =>
                    setEdit({ ...edit, thresholds: { ...edit.thresholds, validation: Number(e.target.value.replace(",", ".")) || 0 } })
                  }
                />
              </FormField>
              <FormField label="Superviseur (≥)">
                <TextField
                  value={String(edit.thresholds.supervisor)}
                  inputMode="decimal"
                  onChange={(e) =>
                    setEdit({ ...edit, thresholds: { ...edit.thresholds, supervisor: Number(e.target.value.replace(",", ".")) || 0 } })
                  }
                />
              </FormField>
            </div>

            <FormField label="Langues comprises (§37 : arabe TN, arabizi, FR, EN, DE)">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(AGENT_LANG_LABELS) as AgentLang[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={edit.languages.includes(l)}
                    onClick={() => toggleLang(l)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      edit.languages.includes(l)
                        ? "border-iris/40 bg-iris/10 text-iris"
                        : "border-line bg-surface-2 text-low hover:text-mid",
                    )}
                  >
                    {AGENT_LANG_LABELS[l]}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Sessions WhatsApp autorisées (§34 — vide = toutes)">
              <div className="flex flex-wrap gap-1.5">
                {sessions.length === 0 && (
                  <span className="text-[12px] text-low">Aucune session — l'agent s'appliquera à toutes les futures sessions.</span>
                )}
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={edit.sessionIds.includes(s.id)}
                    onClick={() => toggleSession(s.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      edit.sessionIds.includes(s.id)
                        ? "border-mint/40 bg-mint/10 text-mint"
                        : "border-line bg-surface-2 text-low hover:text-mid",
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label={`Prompt système — nouvelle version à l'enregistrement (v${(editingAgent?.promptVersions?.length ?? 1) + 1})`}>
              <TextArea
                rows={8}
                value={edit.systemPrompt}
                onChange={(e) => setEdit({ ...edit, systemPrompt: e.target.value })}
                className="font-mono text-[12px]"
              />
            </FormField>

            {(editingAgent?.promptVersions?.length ?? 0) > 1 && (
              <div className="rounded-r-sm border border-line bg-surface-2/60 p-3">
                <p className="label-micro mb-2 text-low">Historique des versions</p>
                <ul className="space-y-1 text-[11px] text-mid">
                  {[...(editingAgent?.promptVersions ?? [])].reverse().map((v) => (
                    <li key={v.version} className="flex justify-between gap-3">
                      <span>v{v.version}</span>
                      <span className="tabular">{new Date(v.at).toLocaleString("fr-FR")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <GhostButton onClick={() => setEdit(null)}>Annuler</GhostButton>
              <PrimaryButton onClick={submit}>Enregistrer</PrimaryButton>
            </div>
          </div>
        )}
      </BizModal>
    </section>
  );
}
