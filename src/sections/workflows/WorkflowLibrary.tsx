export interface LibraryWorkflow {
  id: string;
  name: string;
  status: "active" | "paused" | "draft";
  runs: number;
  successRate: number;
  version: number;
  lastRunAt?: number;
  graphId: string;
}

export default function WorkflowLibrary({
  workflows,
  onOpen,
  onCreate,
}: {
  workflows: LibraryWorkflow[];
  onOpen: (id: string) => void;
  onJournal: (id: string) => void;
  onToggle: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onExport: (id: string) => void;
  onCreate: (name: string, graphId: string) => void;
}) {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Workflows</h1>
        <button onClick={() => onCreate("Nouveau Workflow", "wf_empty")} className="bg-iris text-white px-4 py-2 rounded">
          + Nouveau Workflow
        </button>
      </div>
      <div className="grid grid-cols-3 gap-6">
        {workflows.map((wf: any) => (
          <div key={wf.id} onClick={() => onOpen(wf.id)} className="p-6 border border-line rounded-lg hover:border-iris cursor-pointer">
            <h3 className="font-bold">{wf.name}</h3>
            <div className="text-sm text-low mt-2">Version {wf.version}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
