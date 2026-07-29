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
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import Layout from "@/components/Layout";
import AppShell from "@/components/app/AppShell";
import Home from "@/pages/Home";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Inbox from "@/pages/Inbox";
import Contacts from "@/pages/Contacts";
import Campaigns from "@/pages/Campaigns";
import Workflows from "@/pages/Workflows";
import Agents from "@/pages/Agents";
import Settings from "@/pages/Settings";
import SuperAdmin from "@/pages/SuperAdmin";
import AdminLogin from "@/pages/AdminLogin";
import RequireOwner from "@/components/app/RequireOwner";
import { startSimEngine, stopSimEngine } from "@/lib/sim/store";

export default function App() {
  useEffect(() => {
    startSimEngine();
    return () => stopSimEngine();
  }, []);

  return (
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

      {/* Application — routes imbriquées sous AppShell (rend <Outlet/>) */}
      <Route element={<AppShell />}>
        <Route path="/app" element={<Dashboard />} />
        <Route path="/app/inbox" element={<Inbox />} />
        <Route path="/app/contacts" element={<Contacts />} />
        <Route path="/app/campaigns" element={<Campaigns />} />
        <Route path="/app/workflows" element={<Workflows />} />
        <Route path="/app/agents" element={<Agents />} />
        <Route path="/app/settings" element={<Settings />} />
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
  );
}
