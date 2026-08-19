import { useSettings, type TabId } from "./context";

export default function SettingsNav() {
  const { tab, setTab } = useSettings();
  const tabs: { id: TabId; label: string }[] = [
    { id: "general", label: "Général" },
    { id: "equipe", label: "Équipe" },
    { id: "sessions", label: "Sessions QR" },
    { id: "ia", label: "IA & RAG" },
    { id: "plan", label: "Plan & Facturation" },
    { id: "securite", label: "Sécurité" },
    { id: "notifications", label: "Notifications" },
    { id: "apparence", label: "Apparence" },
  ];

  return (
    <div className="w-60 shrink-0 space-y-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`w-full text-left px-4 py-2 rounded-md transition-colors ${tab === t.id ? "bg-iris text-white" : "hover:bg-surface-2"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
