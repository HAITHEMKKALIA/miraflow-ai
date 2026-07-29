/**
 * PhoneMock — cadre mobile réutilisable (design.md §6).
 * Rayons 36px, encoche, cadre sombre avec reflet. L'écran intérieur est un
 * slot React : vraie UI miniature (chat, carrousel, QR…) construite en code.
 * Utilisé : landing (démo S3), prévisualisation campagne, écran QR.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function PhoneMock({
  children,
  width = 300,
  className,
}: {
  children?: ReactNode;
  /** Largeur du téléphone (la hauteur suit un ratio ~ 1:2.05) */
  width?: number;
  className?: string;
}) {
  const height = Math.round(width * 2.05);
  return (
    <div
      className={cn("relative select-none", className)}
      style={{ width, height }}
      role="img"
      aria-label="Aperçu mobile de l'application MiraFlow AI"
    >
      {/* cadre */}
      <div className="absolute inset-0 rounded-[36px] border border-line-strong bg-[#0A0D17] shadow-card" />
      {/* reflet latéral */}
      <div className="pointer-events-none absolute inset-0 rounded-[36px] bg-gradient-to-br from-white/[.07] via-transparent to-transparent" />
      {/* écran */}
      <div className="absolute inset-[10px] overflow-hidden rounded-[28px] bg-base">
        {/* encoche */}
        <div className="absolute left-1/2 top-[10px] z-20 h-[22px] w-[34%] -translate-x-1/2 rounded-full bg-[#0A0D17]" />
        <div className="relative z-10 flex h-full flex-col">{children}</div>
      </div>
    </div>
  );
}

/** Barre de statut miniature (9:41, réseau, batterie) pour les écrans du PhoneMock */
export function PhoneStatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-3 text-[10px] font-medium text-mid">
      <span className="tabular">9:41</span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-[7px] w-[12px] rounded-[2px] border border-mid/60 align-middle">
          <span className="m-[1px] block h-[3px] w-[7px] rounded-[1px] bg-mint" />
        </span>
      </span>
    </div>
  );
}

/** Bulle de chat miniature (vraie UI, utilisée dans les écrans PhoneMock) */
export function MiniBubble({
  children,
  out = false,
  className,
}: {
  children: ReactNode;
  out?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-[78%] rounded-2xl px-3 py-2 text-[11px] leading-[15px]",
        out
          ? "bubble-out self-end rounded-br-md text-white"
          : "self-start rounded-bl-md bg-bubble-in text-hi",
        className,
      )}
    >
      {children}
    </div>
  );
}
