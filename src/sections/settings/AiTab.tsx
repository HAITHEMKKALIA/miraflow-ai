/**
 * Onglet IA — Paramètres (prompt maître §38-39, §46).
 * Fournisseur Groq (recommandé, cloud) ou Ollama local, fallback Gemini,
 * embeddings, RAG_TOP_K et seuils de confiance globaux — persistés dans
 * le store (partialize + migration douce).
 */
import { useState } from "react";
import { Bot, CheckCircle2, ChevronDown, Eye, EyeOff, Loader2, PlugZap, Save, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAiSettings, useSim, type AiProvider, type ConfidenceThresholds } from "@/lib/sim/store";
import { testConnection } from "@/lib/ai";
import { cn } from "@/lib/utils";
import { ActionButton, Field, SectionCard, TextInput } from "./ui";

const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen/qwen3-32b", "openai/gpt-oss-120b"];

type TestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; latencyMs: number; provider: string }
  | { status: "error"; error: string };

export default function AiTab() {
  const aiSettings = useAiSettings();
  const setAiSettings = useSim((s) => s.setAiSettings);

  const [form, setForm] = useState(() => ({
    provider: aiSettings.provider,
    groqApiKey: aiSettings.groqApiKey,
    groqModel: aiSettings.groqModel,
    geminiApiKey: aiSettings.geminiApiKey,
    geminiModel: aiSettings.geminiModel,
    ollamaBaseUrl: aiSettings.ollamaBaseUrl,
    ollamaModel: aiSettings.ollamaModel,
    embeddingModel: aiSettings.embeddingModel,
    ragTopK: String(aiSettings.ragTopK),
    thresholds: { ...aiSettings.thresholds },
  }));

  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiOpen, setGeminiOpen] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });

  const persist = (patch: Parameters<typeof setAiSettings>[0]) => setAiSettings(patch);

  const save = () => {
    const ragTopK = Math.max(1, Math.floor(Number(form.ragTopK) || 5));
    const t: ConfidenceThresholds = {
      auto: Math.min(1, Math.max(0, form.thresholds.auto)),
      validation: Math.min(1, Math.max(0, form.thresholds.validation)),
      supervisor: Math.min(1, Math.max(0, form.thresholds.supervisor)),
    };
    if (!(t.auto >= t.validation && t.validation >= t.supervisor)) {
      return toast.error("Seuils incohérents : auto ≥ validation ≥ superviseur requis (§46)");
    }
    persist({
      provider: form.provider,
      groqApiKey: form.groqApiKey.trim(),
      groqModel: form.groqModel.trim() || "llama-3.3-70b-versatile",
      geminiApiKey: form.geminiApiKey.trim(),
      geminiModel: form.geminiModel.trim() || "gemini-2.5-flash",
      ollamaBaseUrl: form.ollamaBaseUrl.trim() || "http://localhost:11434",
      ollamaModel: form.ollamaModel.trim() || "qwen3:8b",
      embeddingModel: form.embeddingModel.trim() || "nomic-embed-text",
      ragTopK,
      thresholds: t,
    });
    toast.success("Réglages IA enregistrés");
  };

  const runTest = async () => {
    // On teste avec les valeurs du formulaire : on enregistre d'abord.
    save();
    setTest({ status: "running" });
    const res = await testConnection();
    if (res.ok) setTest({ status: "ok", latencyMs: res.latencyMs, provider: res.provider ?? "groq" });
    else setTest({ status: "error", error: res.error ?? "Erreur inconnue" });
  };

  const numField = (key: keyof ConfidenceThresholds) => (
    <TextInput
      value={String(form.thresholds[key])}
      inputMode="decimal"
      onChange={(e) =>
        setForm((f) => ({
          ...f,
          thresholds: { ...f.thresholds, [key]: Number(e.target.value.replace(",", ".")) || 0 },
        }))
      }
    />
  );

  const providerBtn = (p: AiProvider, label: string, hint: string) => (
    <button
      type="button"
      onClick={() => setForm((f) => ({ ...f, provider: p }))}
      className={cn(
        "rounded-xl border p-4 text-left transition",
        form.provider === p
          ? "border-iris bg-iris/10"
          : "border-line bg-surface-2 hover:bg-surface-3",
      )}
    >
      <div className="text-sm font-semibold text-hi">{label}</div>
      <div className="mt-1 text-xs text-mid">{hint}</div>
    </button>
  );

  return (
    <div className="space-y-5">
      <SectionCard
        title="Fournisseur IA"
        description="Groq (cloud, ultra-rapide, recommandé) ou Ollama en local. Le fournisseur choisi alimente le Router et tous les agents. Le moteur peut être personnalisé par agent dans la page Agents IA."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {providerBtn("groq", "Groq Cloud (recommandé)", "API compatible OpenAI · llama-3.3-70b · latence < 1 s")}
          {providerBtn("ollama", "Ollama (local)", "Auto-hébergé · qwen3:8b · nécessite un serveur local")}
        </div>
      </SectionCard>

      {form.provider === "groq" && (
        <SectionCard
          title="Groq Cloud"
          description="Moteur de complétion par défaut de MiraFlow AI."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Clé API Groq" hint={
              <>
                Commence par gsk_ ·{" "}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-iris underline underline-offset-2"
                >
                  Obtenir ma clé gratuite
                </a>
              </>
            }>
              <div className="relative">
                <TextInput
                  type={showGroqKey ? "text" : "password"}
                  value={form.groqApiKey}
                  onChange={(e) => setForm((f) => ({ ...f, groqApiKey: e.target.value }))}
                  placeholder="gsk_…"
                  autoComplete="off"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowGroqKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-mid hover:text-hi"
                  aria-label={showGroqKey ? "Masquer la clé" : "Afficher la clé"}
                >
                  {showGroqKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            <Field label="Modèle Groq" hint="Défaut : llama-3.3-70b-versatile">
              <TextInput
                list="groq-models"
                value={form.groqModel}
                onChange={(e) => setForm((f) => ({ ...f, groqModel: e.target.value }))}
                placeholder="llama-3.3-70b-versatile"
              />
              <datalist id="groq-models">
                {GROQ_MODELS.map((m) => <option key={m} value={m} />)}
              </datalist>
            </Field>
          </div>

          <div className="mt-4">
            <ActionButton onClick={runTest} disabled={test.status === "running"}>
              <span className="inline-flex items-center gap-2">
                {test.status === "running" ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
                Tester la connexion
              </span>
            </ActionButton>
            {test.status === "ok" && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-xl border border-mint/30 bg-mint/10 px-3 py-2 text-sm text-mint">
                <CheckCircle2 className="size-4" /> ✓ Connecté en {test.latencyMs} ms ({test.provider})
              </p>
            )}
            {test.status === "error" && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
                <XCircle className="mt-0.5 size-4 shrink-0" />
                <span>✗ {test.error}</span>
              </p>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-line bg-surface-2/70">
            <button
              type="button"
              onClick={() => setGeminiOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-medium text-hi">Fallback Gemini (optionnel)</span>
              <ChevronDown className={cn("size-4 text-mid transition-transform", geminiOpen && "rotate-180")} />
            </button>
            {geminiOpen && (
              <div className="grid gap-4 border-t border-line px-4 py-4 md:grid-cols-2">
                <Field label="Clé API Gemini" hint={
                  <>
                    Utilisée uniquement si Groq renvoie 429/quota ·{" "}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="text-iris underline underline-offset-2"
                    >
                      Obtenir une clé
                    </a>
                  </>
                }>
                  <div className="relative">
                    <TextInput
                      type={showGeminiKey ? "text" : "password"}
                      value={form.geminiApiKey}
                      onChange={(e) => setForm((f) => ({ ...f, geminiApiKey: e.target.value }))}
                      placeholder="AIza…"
                      autoComplete="off"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-mid hover:text-hi"
                      aria-label={showGeminiKey ? "Masquer la clé" : "Afficher la clé"}
                    >
                      {showGeminiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
                <Field label="Modèle Gemini" hint="Défaut : gemini-2.5-flash">
                  <TextInput
                    value={form.geminiModel}
                    onChange={(e) => setForm((f) => ({ ...f, geminiModel: e.target.value }))}
                    placeholder="gemini-2.5-flash"
                  />
                </Field>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {form.provider === "ollama" && (
        <SectionCard
          title="Moteur IA local (Ollama)"
          description="Un seul moteur Qwen/Ollama pour tous les agents, avec prompts et permissions dédiés (§32)."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="OLLAMA_BASE_URL" hint="Défaut : http://localhost:11434">
              <TextInput
                value={form.ollamaBaseUrl}
                onChange={(e) => setForm((f) => ({ ...f, ollamaBaseUrl: e.target.value }))}
                placeholder="http://localhost:11434"
              />
            </Field>
            <Field label="OLLAMA_MODEL" hint="Défaut : qwen3:8b">
              <TextInput
                value={form.ollamaModel}
                onChange={(e) => setForm((f) => ({ ...f, ollamaModel: e.target.value }))}
                placeholder="qwen3:8b"
              />
            </Field>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="RAG & embeddings"
        description="Indexation des connaissances et injection de contexte (§38-39)."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Modèle d'embeddings" hint="Utilisé pour l'indexation RAG des connaissances (§39).">
            <TextInput
              value={form.embeddingModel}
              onChange={(e) => setForm((f) => ({ ...f, embeddingModel: e.target.value }))}
              placeholder="nomic-embed-text"
            />
          </Field>
          <Field label="RAG_TOP_K" hint="Nombre de chunks injectés dans le contexte (défaut : 5).">
            <TextInput
              value={form.ragTopK}
              inputMode="numeric"
              onChange={(e) => setForm((f) => ({ ...f, ragTopK: e.target.value }))}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Seuils de confiance globaux"
        description="≥ auto : réponse automatique · ≥ validation : file de validation · ≥ superviseur : arbitrage · sinon : escalade humaine (§46). Surchargeables par agent."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Réponse auto (≥)" hint="Défaut : 0.90">
            {numField("auto")}
          </Field>
          <Field label="Validation humaine (≥)" hint="Défaut : 0.70">
            {numField("validation")}
          </Field>
          <Field label="Superviseur (≥)" hint="Défaut : 0.50">
            {numField("supervisor")}
          </Field>
        </div>
      </SectionCard>

      <p className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>Sécurité :</strong> la clé API est stockée localement dans ce navigateur.
          En production SaaS, la clé doit transiter par le serveur bridge, pas le navigateur.
        </span>
      </p>

      <div className="flex items-center gap-3">
        <ActionButton variant="primary" onClick={save}>
          <span className="inline-flex items-center gap-2"><Bot className="size-4" />Appliquer</span>
        </ActionButton>
        <ActionButton onClick={save}>
          <span className="inline-flex items-center gap-2"><Save className="size-4" />Enregistrer</span>
        </ActionButton>
      </div>
    </div>
  );
}
