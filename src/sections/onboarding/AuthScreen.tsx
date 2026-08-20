import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useSim } from "@/lib/sim/store";
import { hasTenantWorkspace, tenantLogin, tenantStartSession } from "@/lib/tenant";
import { getAuthUser } from "@/lib/db";
import { bootstrapCloud, signInWithEmail, signInWithOAuth, useCloudState } from "@/lib/cloud";
import { cn } from "@/lib/utils";

export default function AuthScreen() {
  const navigate = useNavigate();
  const org = useSim((s) => s.org);
  const me = useSim((s) => s.team[0]);
  const workspaceReady = hasTenantWorkspace();

  const [orgName, setOrgName] = useState(() => org.name);
  const [userName, setUserName] = useState(() => me?.name ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cloudLoading, setCloudLoading] = useState<"email" | "google" | "azure" | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // Retour OAuth ou session Supabase déjà active → ouverture directe de l'espace.
  useEffect(() => {
    void getAuthUser().then(async (user) => {
      if (!user) return;
      const status = await bootstrapCloud(true);
      if (status !== "ready") return;
      const state = useSim.getState();
      if (!state.org.name.trim()) return;
      const displayName = state.team[0]?.name?.trim() || state.org.name;
      tenantStartSession(state.org.name, displayName);
      navigate("/app", { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** Connexion cloud réelle : signInWithPassword puis hydratation de l'espace. */
  const afterCloudSignIn = async () => {
    const status = await bootstrapCloud(true);
    if (status === "error") {
      setCloudError(useCloudState.getState().error ?? "Le chargement de votre espace a échoué.");
      return;
    }
    const state = useSim.getState();
    if (status !== "ready" || !state.org.name.trim()) {
      setCloudError(
        "Compte authentifié, mais aucune organisation n'est liée à ce compte. Créez votre espace via l'onboarding.",
      );
      return;
    }
    const displayName = state.team[0]?.name?.trim() || state.org.name;
    tenantStartSession(state.org.name, displayName);
    toast.success("Connecté à votre espace cloud");
    navigate("/app", { replace: true });
  };

  const submitCloudEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (cloudLoading) return;
    if (!email.trim() || !password) {
      setCloudError("Renseignez votre email et votre mot de passe.");
      return;
    }
    setCloudError(null);
    setCloudLoading("email");
    const res = await signInWithEmail(email, password);
    if (res.error) {
      setCloudLoading(null);
      setCloudError(res.error);
      return;
    }
    await afterCloudSignIn();
    setCloudLoading(null);
  };

  const submitOAuth = async (provider: "google" | "azure") => {
    if (cloudLoading) return;
    setCloudError(null);
    setCloudLoading(provider);
    const res = await signInWithOAuth(provider);
    if (res.error) {
      setCloudLoading(null);
      setCloudError(res.error);
    }
    // Sinon : redirection vers le fournisseur OAuth (retour sur /auth).
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-1 px-5 py-10">
      <div className="w-full max-w-[440px] rounded-lg border border-line bg-surface-2 p-8 shadow-card">
        <h1 className="mb-2 text-center font-display text-3xl font-semibold text-hi">MiraFlow AI</h1>
        <p className="mb-6 text-center text-[13px] text-mid">Connexion a votre espace de travail</p>

        {/* Connexion cloud Supabase (compte réel) */}
        <form onSubmit={(e) => void submitCloudEmail(e)} className="space-y-4" noValidate>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-low">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@entreprise.tn"
              autoComplete="email"
              className={cn(
                "w-full rounded-r-sm border bg-surface-1 px-3 py-2.5 text-[14px] text-hi outline-none transition-colors placeholder:text-low",
                cloudError ? "border-rose/60" : "border-line focus:border-iris/60",
              )}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-low">Mot de passe</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className={cn(
                "w-full rounded-r-sm border bg-surface-1 px-3 py-2.5 text-[14px] text-hi outline-none transition-colors placeholder:text-low",
                cloudError ? "border-rose/60" : "border-line focus:border-iris/60",
              )}
            />
          </label>

          {cloudError && (
            <p className="rounded-r-sm border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose">
              {cloudError}
            </p>
          )}

          <button
            type="submit"
            disabled={cloudLoading !== null}
            className="w-full rounded-full gradient-signature py-3 text-[14px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
          >
            {cloudLoading === "email" ? "Connexion..." : "Connecter à mon espace"}
          </button>
        </form>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void submitOAuth("google")}
            disabled={cloudLoading !== null}
            className="rounded-full border border-line bg-surface-1 py-2.5 text-[13px] font-medium text-hi transition-colors hover:bg-surface-3 disabled:opacity-60"
          >
            {cloudLoading === "google" ? "Redirection..." : "Google"}
          </button>
          <button
            type="button"
            onClick={() => void submitOAuth("azure")}
            disabled={cloudLoading !== null}
            className="rounded-full border border-line bg-surface-1 py-2.5 text-[13px] font-medium text-hi transition-colors hover:bg-surface-3 disabled:opacity-60"
          >
            {cloudLoading === "azure" ? "Redirection..." : "Microsoft"}
          </button>
        </div>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="label-micro text-low">ou espace local</span>
          <span className="h-px flex-1 bg-line" />
        </div>

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
            className="w-full rounded-full border border-line bg-surface-1 py-3 text-[13px] font-medium text-hi transition-colors hover:bg-surface-3 disabled:opacity-60"
          >
            {loading ? "Connexion..." : "Ouvrir l'espace local"}
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
