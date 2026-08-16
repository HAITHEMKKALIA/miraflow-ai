import { useMemo, useState } from "react";
import { Globe, QrCode, RefreshCcw, Save, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { bridgeHealth, getBridgeUrl, setBridgeUrl, createSession, deleteBridgeSession, persistBridgeSession } from "@/lib/bridge";
import { useSim, useSessions } from "@/lib/sim/store";
import { ActionButton, Field, SectionCard, StatusBadge, TextInput } from "./ui";

export default function SessionsTab() {
  const sessions = useSessions();
  const orgName = useSim((s) => s.org.name);
  const [url, setUrlState] = useState(() => getBridgeUrl());
  const [checking, setChecking] = useState(false);
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  const [newSessionId, setNewSessionId] = useState("");
  const [creating, setCreating] = useState(false);

  const connectedCount = useMemo(
    () => sessions.filter((item) => item.status === "connected").length,
    [sessions],
  );

  const handleSave = () => {
    setBridgeUrl(url);
    toast.success("URL du bridge enregistrée");
  };

  const handleCheck = async () => {
    setChecking(true);
    const ok = await bridgeHealth();
    setChecking(false);
    setBridgeOk(ok);
    toast[ok ? "success" : "error"](ok ? "Bridge joignable" : "Bridge injoignable");
  };

  const handleCreateSession = async () => {
    if (!newSessionId.trim()) return toast.error("Entrez un ID de session");
    setCreating(true);
    try {
      await createSession(newSessionId);
      toast.success("Session lancée sur le bridge. Scannez le QR.");
      setNewSessionId("");
    } catch {
      toast.error("Erreur de création de session");
    } finally {
      setCreating(false);
    }
  };

  const updateType = async (sessionId: string, newType: string) => {
    toast.promise(
      persistBridgeSession({
        orgName,
        sessionId,
        sessionType: newType,
      }),
      {
        loading: "Mise à jour du rôle...",
        success: "Rôle modifié",
        error: "Erreur lors de la modification",
      }
    );
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Pont WhatsApp"
        description="Configuration de l’URL du bridge et état des sessions QR visibles."
      >
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <Field
            label="URL du bridge"
            hint="Exemple: http://127.0.0.1:3100. Cette adresse est utilisée pour le QR, les envois et le mirroring."
          >
            <TextInput value={url} onChange={(e) => setUrlState(e.target.value)} placeholder="http://127.0.0.1:3100" />
          </Field>
          <ActionButton onClick={handleSave}><span className="inline-flex items-center gap-2"><Save className="size-4" />Enregistrer</span></ActionButton>
          <ActionButton onClick={() => void handleCheck()} disabled={checking}>
            <span className="inline-flex items-center gap-2"><RefreshCcw className="size-4" />{checking ? "Test..." : "Tester"}</span>
          </ActionButton>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusBadge tone={bridgeOk === null ? "low" : bridgeOk ? "mint" : "rose"}>
            {bridgeOk === null ? "Santé non testée" : bridgeOk ? "Bridge joignable" : "Bridge hors ligne"}
          </StatusBadge>
          <StatusBadge tone="iris">{connectedCount} session(s) connectée(s)</StatusBadge>
        </div>
      </SectionCard>

      <SectionCard title="Sessions QR" description="Sessions actuellement visibles dans l’application.">
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-hi">{session.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-mid">
                  <span className="inline-flex items-center gap-1"><QrCode className="size-3.5" />{session.id}</span>
                  <span className="inline-flex items-center gap-1"><Globe className="size-3.5" />{session.phone || "Numéro non remonté"}</span>
                  <span>{session.latencyMs} ms</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={session.type || "principal"}
                  onChange={(e) => updateType(session.id, e.target.value)}
                  className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-hi mr-2"
                >
                  <option value="principal">Principal</option>
                  <option value="commercial">Commercial</option>
                  <option value="technique">Technique</option>
                  <option value="achat">Service Achat</option>
                </select>
                <StatusBadge tone={session.status === "connected" ? "mint" : session.status === "unstable" ? "amber" : "rose"}>
                  {session.status === "connected" ? "Connectée" : session.status === "unstable" ? "Instable" : "Déconnectée"}
                </StatusBadge>
                <StatusBadge tone="low">Uptime {session.uptime}%</StatusBadge>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await deleteBridgeSession(session.id);
                    if (ok) {
                      toast.success("Session supprimée");
                    } else {
                      toast.error("Erreur lors de la suppression de la session réseau");
                    }
                  }}
                  className="ml-2 inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                  Supprimer
                </button>
              </div>
            </div>
          ))}
          {sessions.length === 0 && <div className="text-sm text-mid italic py-2">Aucune session configurée</div>}
        </div>
        <div className="mt-4 pt-4 border-t border-line/40 flex items-end gap-3">
          <Field label="Nouvelle Session ID" hint="">
            <TextInput value={newSessionId} onChange={e => setNewSessionId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} placeholder="ma_session_ventes" maxLength={20} />
          </Field>
          <ActionButton onClick={handleCreateSession} disabled={creating || !newSessionId.trim()}>
            <span className="inline-flex items-center gap-2"><Plus className="size-4" />{creating ? "Lancement..." : "Ajouter Session"}</span>
          </ActionButton>
        </div>
      </SectionCard>
    </div>
  );
}
