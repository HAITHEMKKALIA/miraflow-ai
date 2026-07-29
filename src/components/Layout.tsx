/**
 * Layout — enveloppe marketing : Navbar + contenu + Footer.
 * Pattern « layout-route » : rend <Outlet/>, utilisé comme élément de route
 * parent dans App.tsx (même pattern que AppShell — ne pas mélanger).
 */
import { Outlet } from "react-router";
import Navbar from "./Navbar";
import Footer from "./Footer";

export default function Layout() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-void">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
