const Tab = ({ title }: { title: string }) => (
  <div className="p-8 border border-line rounded-lg bg-surface-1 min-h-[400px]">
    <h3 className="text-xl font-bold mb-4">{title}</h3>
    <p className="text-mid">Configuration du module {title.toLowerCase()}.</p>
  </div>
);
export default Tab;
