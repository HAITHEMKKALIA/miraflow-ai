import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface-1 p-5 shadow-card", className)}>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-hi">{title}</h3>
        {description ? <p className="mt-1 text-sm text-mid">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function InfoGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export function InfoTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/70 p-4">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-low">{label}</div>
      <div className="mt-2 text-lg font-semibold text-hi">{value}</div>
      {hint ? <div className="mt-1 text-xs text-mid">{hint}</div> : null}
    </div>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "mint" | "amber" | "rose" | "iris" | "low";
  children: ReactNode;
}) {
  const toneClass =
    tone === "mint"
      ? "bg-mint/12 text-mint"
      : tone === "amber"
        ? "bg-amber/12 text-amber"
        : tone === "rose"
          ? "bg-rose/12 text-rose"
          : tone === "iris"
            ? "bg-iris/12 text-iris"
            : "bg-surface-2 text-mid";

  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", toneClass)}>{children}</span>;
}

export function ActionButton({
  children,
  onClick,
  variant = "secondary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary"
          ? "gradient-signature text-white hover:brightness-110"
          : "border border-line bg-surface-2 text-hi hover:bg-surface-3",
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-medium text-hi">{label}</div>
      {children}
      {hint ? <div className="mt-1.5 text-xs text-mid">{hint}</div> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-hi outline-none transition focus:border-iris",
        props.className,
      )}
    />
  );
}
