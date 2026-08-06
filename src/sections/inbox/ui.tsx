import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export const MenuItem = ({ 
  children, 
  onClick, 
  className,
  icon,
  active,
  danger,
}: { 
  children: ReactNode; 
  onClick?: () => void; 
  className?: string;
  icon?: ReactNode;
  active?: boolean;
  danger?: boolean;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-surface-2",
      active && "bg-surface-2",
      danger ? "text-rose hover:bg-rose/10" : "text-hi",
      className,
    )}
  >
    {icon}
    {children}
  </button>
);

export const Popover = ({ 
  children, 
  align, 
  trigger,
  panelClassName,
}: { 
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end" | "center"; 
  trigger?: (open: boolean, toggle: () => void) => ReactNode;
  panelClassName?: string;
}) => {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen(!open);
  const close = () => setOpen(false);

  return (
    <div className="relative inline-block">
      {trigger?.(open, toggle)}
      {open && (
        <div
          className={cn(
            "absolute z-50 mt-2 min-w-[180px] rounded-md border border-line bg-surface-1 shadow-lg",
            align === "end" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0",
            panelClassName,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
};
