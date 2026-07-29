/**
 * S8. FAQ (home.md).
 * 2 colonnes : gauche titre + note support ; droite accordéon 7 questions.
 * Recherche instantanée avec surlignage <mark> pulse. Une seule question
 * ouverte à la fois (sauf si Maj maintenue au clic). Ouverture animée 350ms,
 * « + » pivote en « × », bordure gauche iris.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Search } from "lucide-react";
import { Reveal, EASE_OUT_EXPO } from "./shared";
import { cn } from "@/lib/utils";

const QA: { q: string; a: string }[] = [
  {
    q: "Est-ce affilié à WhatsApp ?",
    a: "Non. MiraFlow AI est un produit indépendant, non affilié, non autorisé et non approuvé par WhatsApp ou Meta. Nous utilisons un bridge QR non officiel : votre numéro se connecte comme sur WhatsApp Web, sans API officielle.",
  },
  {
    q: "Combien de temps pour connecter une session ?",
    a: "Environ 5 minutes : créez votre organisation, ouvrez l'écran QR, scannez-le avec l'application de messagerie de votre téléphone. La session reste connectée tant que le téléphone garde Internet ; elle se reconnecte automatiquement après une coupure.",
  },
  {
    q: "Que se passe-t-il si ma session se déconnecte ?",
    a: "Vous êtes alerté immédiatement (notification + email), les messages entrants sont mis en file et les campagnes passent en pause sécurisée. Dès le nouveau scan du QR, tout reprend là où c'était arrêté — rien n'est perdu.",
  },
  {
    q: "Puis-je importer mes contacts (CSV) ?",
    a: "Oui. Importez un CSV (nom, téléphone, tags, consentement) : MiraFlow déduplique, valide les numéros et vous remet un rapport d'import détaillé (lignes acceptées, rejetées, doublons fusionnés).",
  },
  {
    q: "Comment fonctionnent les agents IA locaux et la validation humaine ?",
    a: "Chaque agent rédige une réponse à partir de votre base de connaissances, avec sources citées et score de confiance. En mode « Suggestion », un humain valide avant envoi ; en mode « Autonome », l'agent envoie seul si la confiance dépasse votre seuil — et escalade sinon.",
  },
  {
    q: "La marque blanche est-elle incluse ?",
    a: "Oui, dès le plan Agency : votre logo, votre domaine, vos couleurs, et des sous-comptes clients isolés avec leurs propres quotas et rapports.",
  },
  {
    q: "Puis-je annuler à tout moment ?",
    a: "Oui, en un clic depuis les paramètres — sans frais, sans préavis. Vos données restent exportables (CSV) pendant 30 jours après la fin de l'abonnement.",
  },
];

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-pulse/25 px-0.5 text-inherit">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function Faq() {
  const [openIdx, setOpenIdx] = useState<number[]>([0]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return QA;
    return QA.filter((x) => x.q.toLowerCase().includes(q) || x.a.toLowerCase().includes(q));
  }, [query]);

  const toggle = (idx: number, shift: boolean) => {
    setOpenIdx((prev) => {
      const isOpen = prev.includes(idx);
      if (shift) return isOpen ? prev.filter((i) => i !== idx) : [...prev, idx];
      return isOpen ? [] : [idx];
    });
  };

  return (
    <section id="faq" className="relative bg-void py-24 md:py-40">
      <div className="mx-auto grid max-w-[1240px] gap-14 px-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Colonne gauche */}
        <div>
          <Reveal>
            <p className="label-micro text-pulse">FAQ</p>
            <h2 className="mt-4 font-display text-[clamp(2.25rem,4.5vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-hi">
              Questions <span className="font-serif italic font-normal text-gradient">fréquentes</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-[44ch] text-[15px] leading-[24px] text-mid">
              Une question ? <span className="text-hi">support@miraflow.ai</span> — réponse en moins de 4 h, en français.
            </p>
          </Reveal>
          <Reveal delay={0.18}>
            <div className="mt-8 flex items-center gap-2.5 rounded-full border border-line bg-surface-1 px-4 py-3">
              <Search className="size-4 shrink-0 text-low" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher dans la FAQ…"
                aria-label="Rechercher dans la FAQ"
                className="w-full bg-transparent text-[14px] text-hi placeholder:text-low focus:outline-none"
              />
            </div>
          </Reveal>
        </div>

        {/* Accordéon */}
        <div>
          {filtered.length === 0 && (
            <p className="rounded-r-md border border-line bg-surface-1 p-6 text-[14px] text-mid">
              Aucune question ne correspond à « {query} ».
            </p>
          )}
          {filtered.map((item) => {
            const idx = QA.indexOf(item);
            const isOpen = openIdx.includes(idx);
            return (
              <Reveal key={item.q} delay={0.04}>
                <div
                  className={cn(
                    "mb-3 overflow-hidden rounded-r-md border border-line bg-surface-1 transition-colors",
                    isOpen && "border-s-2 border-s-iris",
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => toggle(idx, e.shiftKey)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start"
                  >
                    <span className="font-display text-[16px] font-semibold text-hi">
                      <Highlight text={item.q} query={query.trim()} />
                    </span>
                    <motion.span
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-mid"
                    >
                      <Plus className="size-4" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                      >
                        <p className="px-5 pb-5 text-[14px] leading-[24px] text-mid">
                          <Highlight text={item.a} query={query.trim()} />
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
