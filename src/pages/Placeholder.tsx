/**
 * PageStub — placeholder en attendant l'implémentation par l'agent page dédié.
 * Affiche le titre de la page + résumé du périmètre, dans le style cockpit.
 */
import EmptyState from "@/components/ui-shared/EmptyState";

export default function PageStub({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-r-lg border border-line bg-surface-1">
      <EmptyState
        title={title}
        description={subtitle}
      />
    </div>
  );
}
