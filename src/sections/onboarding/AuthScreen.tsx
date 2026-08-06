import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useSim } from "@/lib/sim/store";
import { hasTenantWorkspace, tenantLogin } from "@/lib/tenant";
import { cn } from "@/lib/utils";

export default function AuthScreen() {
  const navigate = useNavigate();
  const org = useSim((s) => s.org);
  const me = useSim((s) => s.team[0]);
  const demoMode = useSim((s) => s.demoMode);
  const workspaceReady = hasTenantWorkspace();

  const [orgName, setOrgName] = useState(() => (demoMode ? "" : org.name));
  const [userName, setUserName] = useState(() => (demoMode ? "" : me?.name ?? ""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);

    window.setTimeout(() => {
      if (tenantLogin(orgName, userName)) {
        toast.success("Connexion réussie");
        navigate("/app", { replace: true });
        return;
      }

      setLoading(false);
      if (!workspaceReady) {
        setError("Aucun espace n'est encore configuré sur ce navigateur.");
        return;
      }

      setError("Le nom de l'espace ou le nom du propriétaire ne correspondent pas.");
    }, 350);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-1 px-5">
      <div className="w-full max-w-[440px] rounded-lg border border-line bg-surface-2 p-8 shadow-card">
        <h1 className="mb-2 text-center font-display text-3xl font-semibold text-hi">MiraFlow AI</h1>
        <p className="mb-6 text-center text-[13px] text-mid">Connexion a votre espace de travail</p>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-low">Nom de l'espace</span>
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Ex: MiraFlow Tunis"
              className={cn(
                "w-full rounded-r-sm border bg-surface-1 px-3 py-2.5 text-[14px] text-hi outline-none transition-colors placeholder:text-low",
                error ? "border-rose/60" : "border-line focus:border-iris/60",
              )}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-low">Nom du proprietaire</span>
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Ex: Haithem"
              className={cn(
                "w-full rounded-r-sm border bg-surface-1 px-3 py-2.5 text-[14px] text-hi outline-none transition-colors placeholder:text-low",
                error ? "border-rose/60" : "border-line focus:border-iris/60",
              )}
            />
          </label>

          {error && (
            <p className="rounded-r-sm border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full gradient-signature py-3 text-[14px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Connexion..." : "Connecter a mon espace"}
          </button>
        </form>

        <div className="mt-5 space-y-3">
          {!workspaceReady && (
            <p className="rounded-r-sm border border-amber/30 bg-amber/10 px-3 py-2 text-[12px] text-amber">
              Aucun espace local detecte. Creez-le d'abord avec l'onboarding.
            </p>
          )}

          <button
            type="button"
            onClick={() => navigate("/onboarding")}
            className="w-full rounded-full border border-line bg-surface-1 py-2.5 text-[13px] font-medium text-hi transition-colors hover:bg-surface-3"
          >
            {workspaceReady ? "Reconfigurer mon espace" : "Creer mon espace"}
          </button>
        </div>
      </div>
    </div>
  );
}
