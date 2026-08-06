import { createContext, useContext, useState, type ReactNode } from "react";

export type TabId = "general" | "equipe" | "sessions" | "plan" | "securite" | "notifications" | "apparence";

interface SettingsCtx {
  tab: TabId;
  setTab: (t: TabId) => void;
  dirty: boolean;
  setDirty: (v: boolean) => void;
  savedFlash: boolean;
  save: () => void;
  cancel: () => void;
}

const SettingsContext = createContext<SettingsCtx | null>(null);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [tab, setTab] = useState<TabId>("general");
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const save = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
    setDirty(false);
  };

  const cancel = () => setDirty(false);

  return (
    <SettingsContext.Provider value={{ tab, setTab, dirty, setDirty, savedFlash, save, cancel }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
