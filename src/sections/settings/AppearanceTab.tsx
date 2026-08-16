import { MonitorCog, Moon, Sun } from "lucide-react";
import { LANGS, useI18n } from "@/lib/i18n";
import { ActionButton, SectionCard, StatusBadge } from "./ui";

export default function AppearanceTab() {
  const { lang, setLang, theme, setTheme } = useI18n();

  return (
    <div className="space-y-5">
      <SectionCard
        title="Langue"
        description="Préférence d’interface enregistrée localement dans le navigateur."
      >
        <div className="flex flex-wrap gap-3">
          {LANGS.map((item) => (
            <ActionButton
              key={item.code}
              onClick={() => setLang(item.code)}
              variant={lang === item.code ? "primary" : "secondary"}
            >
              {item.label}
            </ActionButton>
          ))}
        </div>
        <div className="mt-4">
          <StatusBadge tone="iris">Langue active: {lang.toUpperCase()}</StatusBadge>
        </div>
      </SectionCard>

      <SectionCard
        title="Thème"
        description="Basculer entre mode clair et mode sombre."
      >
        <div className="flex flex-wrap gap-3">
          <ActionButton onClick={() => setTheme("light")} variant={theme === "light" ? "primary" : "secondary"}>
            <span className="inline-flex items-center gap-2"><Sun className="size-4" />Clair</span>
          </ActionButton>
          <ActionButton onClick={() => setTheme("dark")} variant={theme === "dark" ? "primary" : "secondary"}>
            <span className="inline-flex items-center gap-2"><Moon className="size-4" />Sombre</span>
          </ActionButton>
        </div>
        <div className="mt-4">
          <StatusBadge tone="iris"><span className="inline-flex items-center gap-1"><MonitorCog className="size-3.5" />Thème actif: {theme === "dark" ? "Sombre" : "Clair"}</span></StatusBadge>
        </div>
      </SectionCard>
    </div>
  );
}
