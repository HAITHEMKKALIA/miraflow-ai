/**
 * AppShell — shell applicatif MiraFlow AI (design.md §6 « App shell »). CRITIQUE.
 *
 * Toutes les pages app sont des ROUTES IMBRIQUÉES sous `<Route element={<AppShell/>}>`
 * (pattern B — react-dev.md) : ce composant rend `<Outlet/>`.
 *
 * Structure :
 *   - Sidebar 264px (réductible à 72px, persistance localStorage « mf:sidebar »)
 *       · En-tête : logo Core + sélecteur d'organisation
 *       · Groupes : PILOTAGE (Accueil, Inbox [badge non-lus mint], Contacts,
 *         Campagnes) · AUTOMATISATION (Workflows, Agents IA [badge suggestions
 *         amber]) · ADMINISTRATION (Super Admin, Paramètres)
 *       · Pied : carte statut session QR + utilisateur (avatar initiales, rôle)
 *   - Topbar 64px glass : titre + fil d'Ariane, recherche ⌘K, pill session QR,
 *     toggles thème/langue, cloche notifications (popover), avatar
 *   - Contenu : <Outlet/> avec transition page 220ms (fade + y:8→0)
 *   - Toasts temps réel : chaque nouvelle notification du SimEngine s'affiche
 *     en haut à droite (sonner), pile max 4.
 *
 * Dépendances : SimEngine (@/lib/sim/store), i18n (@/lib/i18n).
 */
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Bot, ChevronDown, ChevronsLeft, ChevronsRight, Contact as ContactIcon,
  Home, Inbox, LogOut, Megaphone, Menu, Moon, Search, Settings,
  ShieldCheck, Sparkles, Sun, Workflow, X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import {
  useKpis, useNotifications, useOrg, usePendingSuggestions, useSessions, useSim,
} from "@/lib/sim/store";
import { LANGS, useI18n } from "@/lib/i18n";
import { isOwnerAuthed, ownerLogout } from "@/lib/owner";
import StatusDot from "@/components/ui-shared/StatusDot";
import CommandPalette from "./CommandPalette";
import { cn } from "@/lib/utils";

/* ── Navigation ─────────────────────────────────────────────────────────── */
interface NavItem {
  to: string;
  key: string;
  icon: typeof Home;
  end?: boolean;
}
const GROUPS: { key: string; items: NavItem[] }[] = [
  {
    key: "shell.group.pilotage",
    items: [
      { to: "/app", key: "shell.dashboard", icon: Home, end: true },
      { to: "/app/inbox", key: "shell.inbox", icon: Inbox },
      { to: "/app/contacts", key: "shell.contacts", icon: ContactIcon },
      { to: "/app/campaigns", key: "shell.campaigns", icon: Megaphone },
    ],
  },
  {
    key: "shell.group.automation",
    items: [
      { to: "/app/workflows", key: "shell.workflows", icon: Workflow },
      { to: "/app/agents", key: "shell.agents", icon: Bot },
    ],
  },
  {
    key: "shell.group.admin",
    items: [
      { to: "/admin", key: "shell.superadmin", icon: ShieldCheck },
      { to: "/app/settings", key: "shell.settings", icon: Settings },
    ],
  },
];

const TITLES: [RegExp, string, string[]][] = [
  [/^\/app$/, "Accueil", ["App"]],
  [/^\/app\/inbox/, "Inbox", ["App", "Inbox"]],
  [/^\/app\/contacts/, "Contacts", ["App", "Contacts"]],
  [/^\/app\/campaigns/, "Campagnes", ["App", "Campagnes"]],
  [/^\/app\/workflows/, "Workflows", ["App", "Workflows"]],
  [/^\/app\/agents/, "Agents IA", ["App", "Agents IA"]],
  [/^\/app\/settings/, "Paramètres", ["App", "Paramètres"]],
  [/^\/admin/, "Super Admin", ["Plateforme"]],
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* ── Popover notifications ──────────────────────────────────────────────── */
function NotificationsBell() {
  const { t } = useI18n();
  const notifications = useNotifications();
  const markAll = useSim((s) => s.markAllNotificationsRead);
  const markOne = useSim((s) => s.markNotificationRead);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("shell.notifications")}
        className="relative flex size-9 items-center justify-center rounded-full border border-line bg-surface-1/60 text-mid transition-colors hover:text-hi"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute end-0 top-11 z-50 w-[340px] overflow-hidden rounded-r-md border border-line bg-surface-1 shadow-card"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-[13px] font-semibold text-hi">{t("shell.notifications")}</span>
              <button
                type="button"
                onClick={markAll}
                className="label-micro text-iris hover:underline"
              >
                Tout marquer lu
              </button>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {notifications.slice(0, 10).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markOne(n.id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-start transition-colors hover:bg-surface-2",
                    !n.read && "bg-surface-2/50",
                  )}
                >
                  <StatusDot
                    tone={n.kind === "message" ? "pulse" : n.kind === "campaign" ? "mint" : n.kind === "session" ? "amber" : "iris"}
                    ping={false}
                    className="mt-1.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-hi">{n.title}</span>
                    <span className="block truncate text-[12px] text-mid">{n.body}</span>
                    <span className="label-micro mt-1 block text-low">
                      {new Date(n.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Pill statut session QR (topbar) ────────────────────────────────────── */
function SessionPill() {
  const sessions = useSessions();
  const { t } = useI18n();
  const main = sessions[0];
  const ok = main.status === "connected";
  return (
    <div className="hidden items-center gap-2 rounded-full border border-line bg-surface-1/60 py-1.5 pe-3 ps-2.5 md:flex">
      <StatusDot tone={ok ? "mint" : main.status === "unstable" ? "amber" : "rose"} ping={ok} />
      <span className="label-micro text-mid">
        {main.name} · {ok ? t("shell.connected") : main.status === "unstable" ? t("shell.unstable") : t("shell.disconnected")}
      </span>
      <span className="label-micro text-low tabular">{main.latencyMs} ms</span>
    </div>
  );
}

/* ── AppShell ───────────────────────────────────────────────────────────── */
export default function AppShell() {
  const { t, lang, setLang, theme, toggleTheme } = useI18n();
  const org = useOrg();
  const kpis = useKpis();
  const pendingSuggestions = usePendingSuggestions().length;
  const sessions = useSessions();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("mf:sidebar") === "1";
    } catch {
      return false;
    }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  // Suivi du breakpoint desktop/mobile
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const fn = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  // Ferme le drawer mobile à chaque navigation + verrouille le scroll
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    try {
      localStorage.setItem("mf:sidebar", collapsed ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [collapsed]);

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Toast temps réel : nouvelle notification en tête → toast
  const lastNotifId = useSim((s) => s.notifications[0]?.id);
  const seenRef = useRef<string | undefined>(lastNotifId);
  const notifications = useNotifications();
  useEffect(() => {
    if (lastNotifId && lastNotifId !== seenRef.current) {
      seenRef.current = lastNotifId;
      const n = notifications.find((x) => x.id === lastNotifId);
      if (n) {
        toast(n.title, { description: n.body, duration: 5000 });
      }
    }
  }, [lastNotifId, notifications]);

  const [, title, crumbs] = TITLES.find(([re]) => re.test(location.pathname)) ?? [/ /, "App", ["App"]];
  const mainSession = sessions[0];
  const me = useSim((s) => s.team[0]);
  const trialEndsAt = useSim((s) => s.trialEndsAt);
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86_400_000))
    : null;
  const inboxBadge = kpis.unreadInbox;

  /** Déconnexion réelle : ferme la session owner/tenant puis retour accueil. */
  const logout = () => {
    if (isOwnerAuthed()) ownerLogout();
    try {
      localStorage.removeItem("mf:tenant-session");
    } catch {
      /* stockage indisponible */
    }
    toast.success("Déconnecté");
    navigate("/");
  };

  const sidebarW = !isDesktop ? 264 : collapsed ? 72 : 264;

  return (
    <div className="flex min-h-[100dvh] bg-base">
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
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* ── Overlay mobile (derrière le drawer) ──────────────────────── */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {/* ── Sidebar (drawer off-canvas sur mobile) ───────────────────── */}
      <motion.aside
        animate={{ width: sidebarW }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex h-[100dvh] shrink-0 flex-col border-e border-line bg-surface-1 transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] lg:sticky lg:top-0 lg:z-40 lg:translate-x-0",
          // Déterministe (évite les conflits d'ordre des variants Tailwind) :
          // drawer caché uniquement sur mobile quand il est fermé
          mobileOpen || isDesktop ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full",
        )}
      >
        {/* En-tête : logo + organisation — clic sur le logo → retour à l'accueil */}
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-4">
          <Link
            to="/"
            aria-label="MiraFlow AI — retourner à la page d'accueil"
            title="MiraFlow AI — retourner à la page d'accueil"
            className="flex shrink-0 items-center gap-2 rounded-r-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-iris/50"
          >
            <img src="/logo.svg" alt="" className="size-7 shrink-0" />
            {!collapsed && (
              <span className="font-display text-[15px] font-semibold tracking-tight text-hi">
                MiraFlow <span className="text-gradient">AI</span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              className="group flex min-w-0 flex-1 items-center gap-1 text-start"
              title={org.name}
            >
              <span className="truncate text-[13px] font-semibold text-hi">{org.name}</span>
              <ChevronDown className="size-3.5 shrink-0 text-low transition-colors group-hover:text-mid" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
            className="flex size-7 shrink-0 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-surface-2 hover:text-hi lg:hidden"
          >
            <X className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Déplier la barre latérale" : "Réduire la barre latérale"}
            className={cn(
              "hidden size-7 shrink-0 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-surface-2 hover:text-hi lg:flex",
              collapsed && "mx-auto",
            )}
          >
            {collapsed ? (
              document.dir === "rtl" ? <ChevronsLeft className="size-4" /> : <ChevronsRight className="size-4" />
            ) : document.dir === "rtl" ? (
              <ChevronsRight className="size-4" />
            ) : (
              <ChevronsLeft className="size-4" />
            )}
          </button>
        </div>

        {/* Navigation groupée */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navigation app">
          {GROUPS.map((group) => (
            <div key={group.key} className="mb-5">
              {!collapsed && (
                <p className="label-micro mb-2 px-2.5 text-low">{t(group.key)}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const badge =
                    item.key === "shell.inbox"
                      ? inboxBadge
                      : item.key === "shell.agents"
                        ? pendingSuggestions
                        : 0;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        title={collapsed ? t(item.key) : undefined}
                        className={({ isActive }) =>
                          cn(
                            "group relative flex items-center gap-3 rounded-r-sm px-2.5 py-2 text-[13px] font-medium transition-colors",
                            collapsed && "justify-center px-0",
                            isActive
                              ? "bg-surface-2 text-hi"
                              : "text-mid hover:bg-surface-2/60 hover:text-hi",
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <span className="absolute inset-y-1 start-0 w-[2px] rounded-full gradient-signature" />
                            )}
                            <Icon className="size-[18px] shrink-0" />
                            {!collapsed && <span className="flex-1 truncate">{t(item.key)}</span>}
                            {!collapsed && badge > 0 && (
                              <span
                                className={cn(
                                  "label-micro rounded-full px-1.5 py-0.5 tabular",
                                  item.key === "shell.inbox" ? "bg-mint/15 text-mint" : "bg-amber/15 text-amber",
                                )}
                              >
                                {item.key === "shell.agents" ? `${badge} sugg.` : badge}
                              </span>
                            )}
                            {collapsed && badge > 0 && (
                              <span
                                className={cn(
                                  "absolute end-1 top-1 size-2 rounded-full",
                                  item.key === "shell.inbox" ? "bg-mint" : "bg-amber",
                                )}
                              />
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Pied : statut session QR + utilisateur */}
        <div className="border-t border-line p-3">
          {!collapsed && (
            <div className="mb-3 rounded-r-md border border-line bg-surface-2/60 p-3">
              <div className="flex items-center gap-2">
                <StatusDot
                  tone={mainSession.status === "connected" ? "mint" : mainSession.status === "unstable" ? "amber" : "rose"}
                  ping={mainSession.status === "connected"}
                />
                <span className="truncate text-[12px] font-medium text-hi">{mainSession.name}</span>
              </div>
              <p className="label-micro mt-1.5 text-low">
                {mainSession.status === "connected" ? t("shell.connected") : mainSession.status}
                {" · "}
                <span className="tabular">uptime {mainSession.uptime.toLocaleString("fr-FR")}%</span>
              </p>
            </div>
          )}
          <div className={cn("flex items-center gap-1", collapsed && "justify-center")}>
            <button
              type="button"
              onClick={() => navigate("/app/settings")}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 rounded-r-sm p-1.5 text-start transition-colors hover:bg-surface-2",
                collapsed && "flex-none justify-center",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full gradient-signature text-[11px] font-bold text-white">
                {initials(me.name)}
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-hi">{me.name}</span>
                  <span className="block truncate text-[11px] text-low">{me.role}</span>
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={logout}
              aria-label="Se déconnecter"
              title="Se déconnecter"
              className="flex size-8 shrink-0 items-center justify-center rounded-r-sm text-low transition-colors hover:bg-rose/15 hover:text-rose"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* ── Colonne principale ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line px-4 md:px-5">
          {/* Hamburger mobile */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-1/60 text-mid transition-colors hover:text-hi lg:hidden"
          >
            <Menu className="size-4" />
          </button>
          <div className="min-w-0">
            <nav className="label-micro hidden text-low sm:block" aria-label="Fil d'Ariane">
              {crumbs.join(" / ")}
            </nav>
            <h1 className="truncate font-display text-[16px] font-semibold leading-tight text-hi">
              {title}
            </h1>
          </div>

          <div className="flex-1" />

          {/* Recherche ⌘K */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-9 w-[220px] items-center gap-2 rounded-full border border-line bg-surface-1/60 px-3 text-[13px] text-low transition-colors hover:border-line-strong hover:text-mid lg:flex"
          >
            <Search className="size-3.5" />
            <span className="flex-1 truncate text-start">{t("shell.search_hint")}</span>
            <kbd className="label-micro rounded border border-line bg-surface-2 px-1.5 py-0.5">⌘K</kbd>
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label={t("common.search")}
            className="flex size-9 items-center justify-center rounded-full border border-line bg-surface-1/60 text-mid lg:hidden"
          >
            <Search className="size-4" />
          </button>

          <SessionPill />

          {/* Langue */}
          <div className="hidden items-center rounded-full border border-line bg-surface-1/60 p-0.5 md:flex">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
                className={cn(
                  "rounded-full px-2 py-1 label-micro transition-colors",
                  lang === l.code ? "bg-surface-3 text-hi" : "text-low hover:text-mid",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* Thème */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Mode clair" : "Mode sombre"}
            className="flex size-9 items-center justify-center rounded-full border border-line bg-surface-1/60 text-mid transition-colors hover:text-hi"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>

          <NotificationsBell />

          {/* Avatar */}
          <button
            type="button"
            onClick={() => navigate("/app/settings")}
            aria-label="Profil"
            className="flex size-9 items-center justify-center rounded-full gradient-signature text-[11px] font-bold text-white"
          >
            {initials(me.name)}
          </button>
        </header>

        {/* Bandeau essai 14 jours (créé via le wizard onboarding) */}
        {trialDaysLeft !== null && !location.pathname.startsWith("/admin") && (
          <div className="flex items-center gap-2 border-b border-amber/25 bg-amber/10 px-5 py-2 text-[12px] text-amber">
            <Sparkles className="size-3.5 shrink-0" />
            <span className="font-medium">
              Essai — {trialDaysLeft} jour{trialDaysLeft > 1 ? "s" : ""} restant{trialDaysLeft > 1 ? "s" : ""}
            </span>
            <span className="hidden text-amber/70 sm:inline">
              · Passez à un plan payant depuis Paramètres → Facturation pour conserver vos données.
            </span>
          </div>
        )}

        {/* Contenu — routes imbriquées */}
        <main className="min-w-0 flex-1 p-5 md:p-7">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
