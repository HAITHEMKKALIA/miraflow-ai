/**
 * i18n.tsx — Provider langue (FR/EN/AR) + thème (dark/light) pour MiraFlow AI.
 *
 * Exports :
 *   - <I18nProvider>            : à monter à la racine (main.tsx / App.tsx)
 *   - useI18n()                 : { lang, setLang, dir, t, theme, setTheme, toggleTheme }
 *   - useT()                    : raccourci vers la fonction de traduction `t`
 *   - LANGS                     : liste des langues supportées [{ code, label, dir }]
 *
 * Comportement :
 *   - lang par défaut : "fr" ; persistée dans localStorage ("mf:lang")
 *   - lang === "ar"   : dir="rtl" appliqué sur <html> (+ police IBM Plex Sans Arabic via CSS)
 *   - thème par défaut : "dark" ; persisté ("mf:theme") ; classe `.dark` sur <html>
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "fr" | "en" | "ar";
export type Theme = "dark" | "light";

export const LANGS: { code: Lang; label: string; dir: "ltr" | "rtl" }[] = [
  { code: "fr", label: "FR", dir: "ltr" },
  { code: "en", label: "EN", dir: "ltr" },
  { code: "ar", label: "ع", dir: "rtl" },
];

/* ── Dictionnaires ─────────────────────────────────────────────────────── */
/* Les chaînes produit sont rédigées en FR (défaut). EN/AR via dictionnaire. */
const fr = {
  "nav.product": "Produit",
  "nav.features": "Fonctionnalités",
  "nav.pricing": "Tarifs",
  "nav.faq": "FAQ",
  "nav.cta": "Essai gratuit",
  "nav.login": "Connecter à mon espace",
  "nav.demo": "Voir la démo",
  "common.free_trial": "Démarrer l'essai gratuit",
  "common.loading": "Chargement…",
  "common.search": "Rechercher",
  "common.cancel": "Annuler",
  "common.confirm": "Confirmer",
  "common.save": "Enregistrer",
  "common.close": "Fermer",
  "common.see_all": "Tout voir",
  "common.today": "Aujourd'hui",
  "shell.dashboard": "Accueil",
  "shell.inbox": "Inbox",
  "shell.contacts": "Contacts",
  "shell.campaigns": "Campagnes",
  "shell.workflows": "Workflows",
  "shell.agents": "Agents IA",
  "shell.products": "Produits",
  "shell.orders": "Commandes",
  "shell.deliveries": "Livraisons",
  "shell.customers": "Clients",
  "shell.knowledge": "Connaissances",
  "shell.settings": "Paramètres",
  "shell.superadmin": "Super Admin",
  "shell.group.pilotage": "Pilotage",
  "shell.group.business": "Business",
  "shell.group.automation": "Automatisation",
  "shell.group.admin": "Administration",
  "shell.search_hint": "Rechercher ou lancer une action…",
  "shell.notifications": "Notifications",
  "shell.connected": "connectée",
  "shell.disconnected": "déconnectée",
  "shell.unstable": "instable",
};

const en: Record<string, string> = {
  "nav.product": "Product",
  "nav.features": "Features",
  "nav.pricing": "Pricing",
  "nav.faq": "FAQ",
  "nav.cta": "Free trial",
  "nav.login": "Sign in to my workspace",
  "nav.demo": "Watch demo",
  "common.free_trial": "Start free trial",
  "common.loading": "Loading…",
  "common.search": "Search",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.save": "Save",
  "common.close": "Close",
  "common.see_all": "See all",
  "common.today": "Today",
  "shell.dashboard": "Home",
  "shell.inbox": "Inbox",
  "shell.contacts": "Contacts",
  "shell.campaigns": "Campaigns",
  "shell.workflows": "Workflows",
  "shell.agents": "AI Agents",
  "shell.products": "Products",
  "shell.orders": "Orders",
  "shell.deliveries": "Deliveries",
  "shell.customers": "Customers",
  "shell.knowledge": "Knowledge",
  "shell.settings": "Settings",
  "shell.superadmin": "Super Admin",
  "shell.group.pilotage": "Operate",
  "shell.group.business": "Business",
  "shell.group.automation": "Automation",
  "shell.group.admin": "Administration",
  "shell.search_hint": "Search or run an action…",
  "shell.notifications": "Notifications",
  "shell.connected": "connected",
  "shell.disconnected": "disconnected",
  "shell.unstable": "unstable",
};

const ar: Record<string, string> = {
  "nav.product": "المنتج",
  "nav.features": "الميزات",
  "nav.pricing": "الأسعار",
  "nav.faq": "الأسئلة",
  "nav.cta": "تجربة مجانية",
  "nav.login": "الاتصال بمساحتي",
  "nav.demo": "شاهد العرض",
  "common.free_trial": "ابدأ التجربة المجانية",
  "common.loading": "جارٍ التحميل…",
  "common.search": "بحث",
  "common.cancel": "إلغاء",
  "common.confirm": "تأكيد",
  "common.save": "حفظ",
  "common.close": "إغلاق",
  "common.see_all": "عرض الكل",
  "common.today": "اليوم",
  "shell.dashboard": "الرئيسية",
  "shell.inbox": "البريد",
  "shell.contacts": "جهات الاتصال",
  "shell.campaigns": "الحملات",
  "shell.workflows": "سير العمل",
  "shell.agents": "وكلاء الذكاء",
  "shell.products": "المنتجات",
  "shell.orders": "الطلبات",
  "shell.deliveries": "التوصيل",
  "shell.customers": "العملاء",
  "shell.knowledge": "قاعدة المعرفة",
  "shell.settings": "الإعدادات",
  "shell.superadmin": "المشرف العام",
  "shell.group.pilotage": "التشغيل",
  "shell.group.business": "الأعمال",
  "shell.group.automation": "الأتمتة",
  "shell.group.admin": "الإدارة",
  "shell.search_hint": "ابحث أو نفّذ إجراءً…",
  "shell.notifications": "الإشعارات",
  "shell.connected": "متصلة",
  "shell.disconnected": "غير متصلة",
  "shell.unstable": "غير مستقرة",
};

const DICTS: Record<Lang, Record<string, string>> = { fr, en, ar };

/* ── Contexte ──────────────────────────────────────────────────────────── */
interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  dir: "ltr" | "rtl";
  t: (key: string) => string;
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const Ctx = createContext<I18nCtx | null>(null);

function readLS<T extends string>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return (v as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readLS("mf:lang", "fr"));
  const [theme, setThemeState] = useState<Theme>(() => readLS("mf:theme", "light"));

  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = dir;
    try {
      localStorage.setItem("mf:lang", lang);
    } catch {
      /* stockage indisponible */
    }
  }, [lang, dir]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("mf:theme", theme);
    } catch {
      /* stockage indisponible */
    }
  }, [theme]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(
    () => setThemeState((p) => (p === "dark" ? "light" : "dark")),
    [],
  );

  const t = useCallback(
    (key: string) => DICTS[lang][key] ?? DICTS.fr[key] ?? key,
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, dir, t, theme, setTheme, toggleTheme }),
    [lang, setLang, dir, t, theme, setTheme, toggleTheme],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n doit être utilisé sous <I18nProvider>");
  return ctx;
}

/** Raccourci : const t = useT() */
export function useT() {
  return useI18n().t;
}
