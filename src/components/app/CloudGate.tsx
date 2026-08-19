/**
 * CloudGate — états de chargement / erreur honnêtes pour les pages branchées
 * sur Supabase. Pendant l'hydratation initiale : skeleton. Si la requête a
 * échoué : bandeau d'erreur avec bouton « Réessayer » (aucune donnée
 * inventée). En mode espace local : rendu direct.
 */
import type { ReactNode } from "react";
import { CloudOff, RefreshCcw } from "lucide-react";
import { bootstrapCloud, useCloudState } from "@/lib/cloud";

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Chargement des données">
      <div className="h-9 w-64 animate-pulse rounded-r-sm bg-surface-2" />
      <div className="h-14 animate-pulse rounded-r-md border border-line bg-surface-1" />
      <div className="space-y-2 rounded-r-md border border-line bg-surface-1 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 animate-pulse rounded bg-surface-2/70" />
        ))}
      </div>
    </div>
  );
}

export default function CloudGate({ children }: { children: ReactNode }) {
  const status = useCloudState((s) => s.status);
  const error = useCloudState((s) => s.error);

  if (status === "loading") return <SkeletonRows />;

  return (
    <div className="flex flex-col gap-4">
      {status === "error" && (
        <div className="flex flex-wrap items-center gap-3 rounded-r-md border border-rose/30 bg-rose/10 px-4 py-3 text-[13px] text-rose">
          <CloudOff className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {error ?? "La connexion à la base de données a échoué."} Les données
            affichées ci-dessous peuvent être incomplètes — aucune donnée fictive
            n'est affichée.
          </span>
          <button
            type="button"
            onClick={() => void bootstrapCloud(true)}
            className="inline-flex items-center gap-2 rounded-full border border-rose/40 px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-rose/15"
          >
            <RefreshCcw className="size-3.5" /> Réessayer
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
