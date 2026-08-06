/**
 * App — racine des routes MiraFlow AI.
 *
 * Patterns de layout (react-dev.md « Layout + routing contract », pattern B) :
 *   - Marketing : <Layout/> (Navbar + Footer) avec routes imbriquées
 *   - App       : <AppShell/> (sidebar + topbar) avec routes imbriquées
 * Les deux layouts rendent <Outlet/> — ne PAS passer de children.
 *
 * Le SimEngine (émetteurs temps réel) démarre une fois au montage.
 */
import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import Layout from "@/components/Layout";
import AppShell from "@/components/app/AppShell";
import RequireOwner from "@/components/app/RequireOwner";
import RequireTenant from "@/components/app/RequireTenant";
import { startSimEngine, stopSimEngine } from "@/lib/sim/store";

const Home = lazy(() => import("@/pages/Home"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Inbox = lazy(() => import("@/pages/Inbox"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const Workflows = lazy(() => import("@/pages/Workflows"));
const Agents = lazy(() => import("@/pages/Agents"));
const Settings = lazy(() => import("@/pages/Settings"));
const SuperAdmin = lazy(() => import("@/pages/SuperAdmin"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-void text-mid">
      Chargement...
    </div>
  );
}

export default function App() {
  useEffect(() => {
    startSimEngine();
    return () => stopSimEngine();
  }, []);

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Marketing */}
        <Route element={<Layout />}>
          <Route index element={<Home />} />
        </Route>

        {/* Auth / onboarding (plein écran, hors shell) */}
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/auth" element={<Onboarding />} />

        {/* Connexion propriétaire (plein écran, hors shell) */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Application tenant — nécessite une session espace */}
        <Route
          element={(
            <RequireTenant>
              <AppShell />
            </RequireTenant>
          )}
        >
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/inbox" element={<Inbox />} />
          <Route path="/app/contacts" element={<Contacts />} />
          <Route path="/app/campaigns" element={<Campaigns />} />
          <Route path="/app/workflows" element={<Workflows />} />
          <Route path="/app/agents" element={<Agents />} />
          <Route path="/app/settings" element={<Settings />} />
        </Route>

        {/* Console propriétaire — garde dédiée */}
        <Route element={<AppShell />}>
          <Route
            path="/admin"
            element={
              <RequireOwner>
                <SuperAdmin />
              </RequireOwner>
            }
          />
        </Route>

        {/* Fallback → landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
