/**
 * Onboarding — page /auth + /onboarding (design/onboarding.md).
 * Aiguillage selon la route :
 *   /auth       → <AuthScreen/>  (split-screen connexion/inscription)
 *   /onboarding → <WizardScreen/> (assistant 5 étapes : organisation → plan
 *                 → connexion QR → équipe → lancement, puis /app)
 * Monte un <Toaster/> local (ces routes sont hors AppShell) + grain global.
 */
import { useLocation } from "react-router";
import { Toaster } from "sonner";
import AuthScreen from "@/sections/onboarding/AuthScreen";
import WizardScreen from "@/sections/onboarding/WizardScreen";

export default function Onboarding() {
  const { pathname } = useLocation();
  const isAuth = pathname.startsWith("/auth");

  return (
    <div className="grain">
      {isAuth ? <AuthScreen /> : <WizardScreen />}
      <Toaster
        position="top-right"
        gap={8}
        visibleToasts={4}
        toastOptions={{
          style: {
            background: "var(--surface-3)",
            border: "1px solid var(--line)",
            borderInlineStart: "2px solid var(--pulse)",
            color: "var(--text-hi)",
          },
        }}
      />
    </div>
  );
}
