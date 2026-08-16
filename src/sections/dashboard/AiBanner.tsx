/**
 * AiBanner — bandeau « Agents IA » pleine largeur (dashboard.md S5).
 * Carte horizontale dégradé subtil (iris→cyan 8 %) : Core 56px + compteur de
 * suggestions qui tique + texte ; à droite « Examiner » (primaire → Inbox
 * filtré) et « Ouvrir les agents » (glass → /app/agents).
 * Entrée y:24 500ms au scroll (trigger 30 %), halo du Core respirant 6 s.
 */
import { motion } from "framer-motion";
import { ArrowRight, Eye } from "lucide-react";
import { useNavigate } from "react-router";
import { TickNumber } from "@/components/ui-shared";
import { usePendingSuggestions } from "@/lib/sim/store";
import { EASE, GlassButton, MiniCore, PrimaryButton } from "./shared";

export default function AiBanner() {
  const navigate = useNavigate();
  const pending = usePendingSuggestions().length;
  const total = pending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30% 0px" }}
      transition={{ duration: 0.5, ease: EASE }}
      className="relative overflow-hidden rounded-r-lg border border-line"
      style={{
        backgroundImage:
          "linear-gradient(120deg, rgba(255,90,78,.10) 0%, rgba(255,159,46,.07) 60%, rgba(13,186,155,.05) 100%)",
      }}
    >
      {/* halo d'arrière-plan */}
      <div
        className="pointer-events-none absolute -end-16 -top-24 size-64 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,159,46,.14), transparent 65%)" }}
        aria-hidden
      />
      <div className="relative flex flex-wrap items-center gap-5 p-5 md:p-6">
        <MiniCore size={56} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[18px] leading-[26px] font-semibold text-hi">
            <span className="tabular">
              <TickNumber value={total} />
            </span>{" "}
            suggestion{total > 1 ? "s" : ""} en attente
          </h3>
          <p className="mt-1 max-w-[56ch] text-[13px] leading-[20px] text-mid">
            Réponses IA réellement en attente de validation dans l'espace courant.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <PrimaryButton onClick={() => navigate("/app/inbox?suggestions=1")}>
            <Eye className="size-4" />
            Examiner
          </PrimaryButton>
          <GlassButton onClick={() => navigate("/app/agents")}>
            Ouvrir les agents
            <ArrowRight className="size-4 rtl:-scale-x-100" />
          </GlassButton>
        </div>
      </div>
    </motion.div>
  );
}
