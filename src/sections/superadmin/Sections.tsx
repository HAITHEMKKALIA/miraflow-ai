
const Section = ({ title }: { title: string }) => (
  <div className="p-6 border border-line rounded-lg bg-surface-1 mb-4">
    <h3 className="font-bold mb-2">{title}</h3>
    <div className="h-20 bg-surface-2 rounded flex items-center justify-center text-low italic">Composant {title} simulé</div>
  </div>
);

export default function ContextBar() { return <Section title="Barre de Contexte" />; }
export function RequestsPanel() { return <Section title="Demandes" />; }
export function PlatformKpis() { return <Section title="KPI Plateforme" />; }
export function RevenueCharts() { return <Section title="Graphiques Revenus" />; }
export function TenantsTable() { return <Section title="Table des Tenants" />; }
export function SessionsMap() { return <Section title="Carte des Sessions" />; }
export function Incidents() { return <Section title="Incidents" />; }
export function PlanQuotas() { return <Section title="Quotas Plans" />; }
export function WhiteLabel() { return <Section title="Marque Blanche" />; }
export function Resellers() { return <Section title="Revendeurs" />; }
export function PromoCodes() { return <Section title="Codes Promo" />; }
export function Maintenance() { return <Section title="Maintenance" />; }
