import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useSim, type PlanId } from "@/lib/sim/store";
import { tenantStartSession } from "@/lib/tenant";
import { getAuthUser } from "@/lib/db";
import { hydrateFromCloud, provisionCloudWorkspace } from "@/lib/cloud";

const PLANS: { id: PlanId; label: string }[] = [
  { id: "starter", label: "Starter" },
  { id: "business", label: "Business" },
  { id: "agency", label: "Agency" },
  { id: "enterprise", label: "Enterprise" },
];

export default function WizardScreen() {
  const navigate = useNavigate();
  const applyOnboarding = useSim((s) => s.applyOnboarding);
  const [orgName, setOrgName] = useState("");
  const [userName, setUserName] = useState("");
  const [sessionName, setSessionName] = useState("Session Principale");
  const [plan, setPlan] = useState<PlanId>("business");
  const [loading, setLoading] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const cleanOrg = orgName.trim();
    const cleanUser = userName.trim();
    const cleanSession = sessionName.trim() || "Session Principale";

    if (!cleanOrg || !cleanUser) {
      toast.error("Renseignez le nom de votre espace et le nom du proprietaire.");
      return;
    }

    setLoading(true);
    void (async () => {
      try {
        // Si l'utilisateur est authentifié Supabase → création réelle en base
        // (organization, membre owner, abonnement trial, session WhatsApp).
        const user = await getAuthUser();
        if (user) {
          const res = await provisionCloudWorkspace({
            orgName: cleanOrg,
            plan,
            userName: cleanUser,
            sessionName: cleanSession,
          });
          if (res.error || !res.data) {
            toast.error(`La création cloud a échoué (${res.error}). Espace local créé à la place.`);
          } else {
            // Hydrate le store depuis la base (org, session, agents, trial).
            applyOnboarding({
              orgName: res.data.org.name,
              plan: (res.data.org.plan as PlanId) ?? plan,
              userName: cleanUser,
              sessionName: cleanSession,
            });
            const hydraError = await hydrateFromCloud();
            if (hydraError) {
              toast.warning("Espace créé, mais le rechargement des données a échoué : " + hydraError);
            }
            tenantStartSession(cleanOrg, cleanUser);
            toast.success("Votre espace cloud est prêt (essai 14 jours).");
            navigate("/app", { replace: true });
            return;
          }
        }

        // Mode espace local (non authentifié) — comportement historique.
        applyOnboarding({
          orgName: cleanOrg,
          plan,
          userName: cleanUser,
          sessionName: cleanSession,
        });
        tenantStartSession(cleanOrg, cleanUser);
        toast.success("Votre espace est pret.");
        navigate("/app", { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-1 px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-[640px] rounded-lg border border-line bg-surface-2 p-8 shadow-card">
        <h2 className="mb-2 text-2xl font-semibold text-hi">Configuration de votre espace</h2>
        <p className="mb-6 text-[13px] text-mid">
          Creez votre espace reel puis ouvrez directement l'application.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-low">Nom de l'espace</span>
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Ex: MiraFlow Tunis"
              className="w-full rounded-r-sm border border-line bg-surface-1 px-3 py-2.5 text-[14px] text-hi outline-none transition-colors placeholder:text-low focus:border-iris/60"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-low">Nom du proprietaire</span>
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Ex: Haithem"
              className="w-full rounded-r-sm border border-line bg-surface-1 px-3 py-2.5 text-[14px] text-hi outline-none transition-colors placeholder:text-low focus:border-iris/60"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-low">Nom de la session</span>
            <input
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="Session Principale"
              className="w-full rounded-r-sm border border-line bg-surface-1 px-3 py-2.5 text-[14px] text-hi outline-none transition-colors placeholder:text-low focus:border-iris/60"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-low">Plan</span>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as PlanId)}
              className="w-full rounded-r-sm border border-line bg-surface-1 px-3 py-2.5 text-[14px] text-hi outline-none transition-colors focus:border-iris/60"
            >
              {PLANS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 rounded-r-sm border border-line bg-surface-3 px-4 py-3 text-[13px] text-mid">
          L'onboarding va creer votre organisation, votre premiere session QR et votre session locale de connexion.
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate("/auth")}
            className="flex-1 rounded-full border border-line bg-surface-1 px-5 py-3 text-[13px] font-medium text-hi transition-colors hover:bg-surface-3"
          >
            Retour a la connexion
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-full gradient-signature px-5 py-3 text-[14px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Creation..." : "Creer mon espace"}
          </button>
        </div>
      </form>
    </div>
  );
}
