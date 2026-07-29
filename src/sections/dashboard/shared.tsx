/**
 * Helpers partagés des sections du Dashboard (dashboard.md).
 * MiniCore (orbe « The Core » miniature), Card (panneau cockpit), CountUpTick
 * (count-up 1.2s au montage puis TickNumber), useNow (horloge pour les
 * timestamps relatifs), boutons & SegmentedControl, formatteurs FR.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { TickNumber } from "@/components/ui-shared";
import { cn } from "@/lib/utils";

export const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** Formatage entier FR (espaces fines insécables) */
export const fmtInt = (v: number) => v.toLocaleString("fr-FR");

/** Horloge re-render (timestamps relatifs qui se rafraîchissent) */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Orbe « Core » miniature (design.md §1.1) : dégradé iris→cyan, halo flou,
 * particule en orbite lente. Teintable par statut (glow coloré).
 */
export function MiniCore({
  size = 40,
  tone,
  className,
}: {
  size?: number;
  /** Teinte statut : glow coloré (mint/amber/rose). Défaut : iris neutre. */
  tone?: "mint" | "amber" | "rose";
  className?: string;
}) {
  const glow =
    tone === "mint"
      ? "0 0 18px -2px rgba(13,186,155,.55)"
      : tone === "amber"
        ? "0 0 18px -2px rgba(255,180,84,.55)"
        : tone === "rose"
          ? "0 0 18px -2px rgba(255,107,129,.55)"
          : "0 0 22px -4px rgba(255,90,78,.5)";
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* halo respirant */}
      <span
        className="absolute inset-0 rounded-full animate-core-breathe motion-reduce:animate-none"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, rgba(255,90,78,.55), rgba(255,159,46,.25) 55%, transparent 72%)",
          filter: "blur(6px)",
        }}
      />
      {/* sphère */}
      <span
        className="absolute rounded-full"
        style={{
          inset: size * 0.16,
          background: "radial-gradient(circle at 32% 28%, #FFB3AC 0%, #FF5A4E 42%, #FF9F2E 88%)",
          boxShadow: glow,
        }}
      />
      {/* particule orbitale */}
      {size >= 28 && (
        <span className="absolute inset-0 animate-spin-slow motion-reduce:animate-none">
          <span
            className="absolute rounded-full bg-pulse"
            style={{
              width: Math.max(2.5, size * 0.07),
              height: Math.max(2.5, size * 0.07),
              top: size * 0.04,
              left: "50%",
              boxShadow: "0 0 6px 1px rgba(255,159,46,.8)",
            }}
          />
        </span>
      )}
    </span>
  );
}

/** Panneau cockpit standard : surface-1 r-md bordure line, tête optionnelle */
export function Card({
  title,
  action,
  linkLabel,
  onLink,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  /** Élément libre à droite de la tête (chips, select…) */
  action?: ReactNode;
  /** Lien « Gérer → » discret à droite */
  linkLabel?: string;
  onLink?: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-r-md border border-line bg-surface-1 transition-shadow duration-300 hover:shadow-card",
        className,
      )}
    >
      {(title || action || linkLabel) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h3 className="min-w-0 truncate font-display text-[15px] font-semibold text-hi">{title}</h3>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {linkLabel && (
              <button
                type="button"
                onClick={onLink}
                className="group flex items-center gap-1 text-[12px] font-medium text-pulse transition-colors hover:text-hi"
              >
                {linkLabel}
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
              </button>
            )}
          </div>
        </header>
      )}
      <div className={cn("flex min-h-0 flex-1 flex-col p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * Valeur KPI : count-up 1.2s ease-out au montage, puis TickNumber (tick 400ms)
 * à chaque changement ultérieur (design.md §5).
 */
export function CountUpTick({
  value,
  format = fmtInt,
  duration = 1200,
  className,
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const [settled, setSettled] = useState(false);
  const mounted = useRef(false);

  // Count-up unique au montage
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const target = value;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * e));
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setSettled(true);
        mounted.current = true;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Après le montage : suivre la valeur directement (TickNumber gère l'anim)
  useEffect(() => {
    if (mounted.current) setDisplay(value);
  }, [value]);

  if (!settled) {
    return <span className={cn("tabular inline-block", className)}>{format(display)}</span>;
  }
  return <TickNumber value={display} format={format} className={className} />;
}

/** Bouton primaire dégradé signature (design.md §2/§6) */
export function PrimaryButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-r-sm gradient-signature px-4 py-2 text-[13px] font-semibold text-white",
        "transition-all duration-200 hover:-translate-y-px hover:shadow-glow-iris active:translate-y-0 active:scale-[.98]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Bouton glass secondaire */
export function GlassButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-r-sm glass px-4 py-2 text-[13px] font-medium text-mid",
        "transition-all duration-200 hover:border-line-strong hover:text-hi active:scale-[.98]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** SegmentedControl (design.md §6) : pilules dans un track surface-2 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-0.5 rounded-r-sm border border-line bg-surface-2/70 p-0.5", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative rounded-[6px] px-3 py-1.5 text-[12px] font-medium transition-colors duration-200",
              active ? "bg-surface-3 text-hi shadow-xs" : "text-low hover:text-mid",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
