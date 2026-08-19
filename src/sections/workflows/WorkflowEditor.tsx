import type { WorkflowLogEntry } from "@/lib/sim/store";
import type { LibraryWorkflow } from "@/sections/workflows/WorkflowLibrary";

export type EditorTab = "canvas" | "journal" | "dead-letter" | "versions";

export default function WorkflowEditor({ 
  workflow, 
  initialTab,
  log,
  onBack,
  onRename,
  onToggle,
  onDuplicate,
  onVersionBump,
}: { 
  workflow: LibraryWorkflow;
  initialTab: EditorTab;
  log: WorkflowLogEntry[];
  onBack: () => void; 
  onRename: (name: string) => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onVersionBump: (version: number) => void;
}) {
  void onRename;
  void onToggle;
  void onDuplicate;
  void onVersionBump;
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack}>←</button>
          <h2 className="font-bold">{workflow.name}</h2>
        </div>
        <button className="bg-iris text-white px-4 py-1 rounded">Publier</button>
      </div>
      <div className="flex-1 bg-surface-2 p-10 text-center">
        Onglet {initialTab} de l'éditeur de workflow
        <div className="mt-3 text-sm text-low">{log.length} entrées de journal chargées</div>
      </div>
    </div>
  );
}
