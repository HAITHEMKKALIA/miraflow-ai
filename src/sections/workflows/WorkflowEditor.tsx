import { type Workflow } from "@/lib/sim/store";

export default function WorkflowEditor({ 
  workflow, 
  onBack 
}: { 
  workflow: Workflow; 
  onBack: () => void; 
}) {
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
        Canvas de l'éditeur de workflow (Simulation)
      </div>
    </div>
  );
}
