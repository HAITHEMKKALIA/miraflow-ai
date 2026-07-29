/**
 * Workflows — page /app/workflows (design/workflows.md).
 * Machine à vues : bibliothèque ↔ éditeur (onglets Canvas/Journal/
 * Dead-letter/Versions). Les workflows du SimEngine (statut, runs, journal
 * live via workflowRun) sont enrichis localement : créations depuis modèles,
 * duplications, renommages, suppressions (masquage) et bumps de version.
 */
import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useSim, useWorkflows } from "@/lib/sim/store";
import WorkflowLibrary from "@/sections/workflows/WorkflowLibrary";
import type { LibraryWorkflow } from "@/sections/workflows/WorkflowLibrary";
import WorkflowEditor from "@/sections/workflows/WorkflowEditor";
import type { EditorTab } from "@/sections/workflows/WorkflowEditor";
import { VERSION_BY_ID, seedGraph } from "@/sections/workflows/shared";

type View = { name: "library" } | { name: "editor"; id: string; tab: EditorTab };

interface LocalWf {
  id: string;
  name: string;
  status: "active" | "paused" | "draft";
  runs: number;
  successRate: number;
  version: number;
  graphId: string;
}

export default function Workflows() {
  const storeWfs = useWorkflows();
  const toggleWorkflow = useSim((s) => s.toggleWorkflow);

  const [view, setView] = useState<View>({ name: "library" });
  const [locals, setLocals] = useState<LocalWf[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [versionBumps, setVersionBumps] = useState<Record<string, number>>({});

  /* ── Fusion store + état local ───────────────────────────────────────── */
  const workflows = useMemo<LibraryWorkflow[]>(() => {
    const fromStore: LibraryWorkflow[] = storeWfs
      .filter((w) => !deletedIds.includes(w.id))
      .map((w) => ({
        id: w.id,
        name: renames[w.id] ?? w.name,
        status: w.status,
        runs: w.runs,
        successRate: w.successRate,
        version: versionBumps[w.id] ?? VERSION_BY_ID[w.id] ?? 1,
        lastRunAt: w.log[0]?.at,
        graphId: w.id,
      }));
    const fromLocals: LibraryWorkflow[] = locals.map((w) => ({
      ...w,
      name: renames[w.id] ?? w.name,
      version: versionBumps[w.id] ?? w.version,
      lastRunAt: undefined,
    }));
    return [...fromStore, ...fromLocals];
  }, [storeWfs, deletedIds, renames, versionBumps, locals]);

  /* ── Actions ─────────────────────────────────────────────────────────── */
  const isStore = useCallback((id: string) => storeWfs.some((w) => w.id === id), [storeWfs]);

  const onToggle = useCallback((id: string) => {
    if (isStore(id)) {
      toggleWorkflow(id);
      const wf = storeWfs.find((w) => w.id === id);
      toast(wf?.status === "active" ? "Workflow mis en pause" : "Workflow activé", {
        description: wf ? `« ${renames[id] ?? wf.name} »` : undefined,
      });
    } else {
      setLocals((prev) => prev.map((w) => (w.id === id ? { ...w, status: w.status === "active" ? "paused" : "active" } : w)));
      toast("Statut du workflow modifié");
    }
  }, [isStore, toggleWorkflow, storeWfs, renames]);

  const onDuplicate = useCallback((id: string) => {
    const src = workflows.find((w) => w.id === id);
    if (!src) return;
    const copy: LocalWf = {
      id: `wf_local_${Date.now().toString(36)}`,
      name: `${src.name} (copie)`,
      status: "paused",
      runs: 0,
      successRate: 100,
      version: 1,
      graphId: src.graphId,
    };
    setLocals((prev) => [...prev, copy]);
    toast.success("Workflow dupliqué", { description: `« ${copy.name} » créé (inactif).` });
  }, [workflows]);

  const onDelete = useCallback((id: string) => {
    if (isStore(id)) setDeletedIds((prev) => [...prev, id]);
    else setLocals((prev) => prev.filter((w) => w.id !== id));
    toast("Workflow supprimé", { description: "Il peut être recréé depuis un modèle." });
  }, [isStore]);

  const onRename = useCallback((id: string, name: string) => {
    setRenames((prev) => ({ ...prev, [id]: name }));
  }, []);

  const onExport = useCallback((id: string) => {
    const wf = workflows.find((w) => w.id === id);
    if (!wf) return;
    const g = seedGraph(wf.graphId);
    const payload = {
      name: wf.name,
      version: wf.version,
      exportedAt: new Date().toISOString(),
      nodes: g.nodes.map((n) => ({ id: n.id, kind: n.data.kind, label: n.data.label, config: n.data.config, position: n.position })),
      edges: g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workflow-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Workflow exporté", { description: "JSON téléchargé." });
  }, [workflows]);

  const onCreate = useCallback((name: string, graphId: string) => {
    const wf: LocalWf = {
      id: `wf_local_${Date.now().toString(36)}`,
      name,
      status: "draft",
      runs: 0,
      successRate: 100,
      version: 1,
      graphId,
    };
    setLocals((prev) => [...prev, wf]);
    toast.success("Workflow créé", { description: `« ${name} » — configurez-le puis publiez.` });
    setView({ name: "editor", id: wf.id, tab: "canvas" });
  }, []);

  const onVersionBump = useCallback((id: string, v: number) => {
    setVersionBumps((prev) => ({ ...prev, [id]: v }));
  }, []);

  const current = view.name === "editor" ? workflows.find((w) => w.id === view.id) : undefined;
  const currentLog = useMemo(() => {
    if (view.name !== "editor") return [];
    return storeWfs.find((w) => w.id === view.id)?.log ?? [];
  }, [view, storeWfs]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view.name + (view.name === "editor" ? view.id : "")}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      >
        {view.name === "library" && (
          <WorkflowLibrary
            workflows={workflows}
            onOpen={(id) => setView({ name: "editor", id, tab: "canvas" })}
            onJournal={(id) => setView({ name: "editor", id, tab: "journal" })}
            onToggle={onToggle}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onRename={onRename}
            onExport={onExport}
            onCreate={onCreate}
          />
        )}
        {view.name === "editor" && current && (
          <WorkflowEditor
            key={current.id}
            workflow={current}
            initialTab={view.tab}
            log={currentLog}
            onBack={() => setView({ name: "library" })}
            onRename={(name) => onRename(current.id, name)}
            onToggle={() => onToggle(current.id)}
            onDuplicate={() => onDuplicate(current.id)}
            onVersionBump={(v) => onVersionBump(current.id, v)}
          />
        )}
        {view.name === "editor" && !current && (
          <div className="mx-auto max-w-[1200px] rounded-r-lg border border-line bg-surface-1 p-10 text-center text-mid">
            Workflow introuvable.
            <button type="button" onClick={() => setView({ name: "library" })} className="ms-2 text-iris hover:underline">
              Retour à la bibliothèque
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
