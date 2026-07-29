/**
 * S7. Témoignages (home.md).
 * 3 cartes glass avec guillemet géant serif (y:60 blur 8px stagger 120ms,
 * tilt 3D ±5° au hover desktop). Rangée « résultats » : 3 métriques count-up.
 */
import { useRef } from "react";
import { motion } from "framer-motion";
import { SectionHead, Reveal, CountUp, EASE_OUT_EXPO } from "./shared";

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  initials: string;
  color: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "On répondait aux clients depuis trois téléphones perso. Avec MiraFlow, toute l'équipe est sur une seule inbox : le temps de réponse est passé sous 2 minutes et les avis Google ont suivi.",
    name: "Sami Gharbi",
    role: "Gérant · Pâtisserie Dar El Baraka",
    initials: "SG",
    color: "var(--iris)",
  },
  {
    quote:
      "La campagne Aid avec carrousel produit a fait 96 réponses en 4 heures. On a écoulé le stock des coffrets une semaine plus tôt que prévu.",
    name: "Yasmine Trabelsi",
    role: "Responsable marketing · Maison Slimane",
    initials: "YT",
    color: "var(--pulse)",
  },
  {
    quote:
      "L'agent IA prépare les réponses SAV avec les sources de notre FAQ. On valide d'un clic : l'équipe gagne deux heures par jour, sans jamais perdre la main.",
    name: "Karim Haddad",
    role: "Fondateur · Dar Tech",
    initials: "KH",
    color: "var(--mint)",
  },
];

const RESULTS = [
  { value: 38, prefix: "+", suffix: "%", label: "de réponses clients en 30 jours" },
  { value: 2, suffix: " min", label: "de temps de réponse médian" },
  { value: 3.2, suffix: "×", label: "de conversions campagne vs. e-mail", decimals: 1 },
];

function TiltCard({ t, index }: { t: Testimonial; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(800px) rotateY(${px * 5}deg) rotateX(${-py * 5}deg) translateY(-4px)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 60, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: 0.8, ease: EASE_OUT_EXPO, delay: index * 0.12 }}
    >
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="glass relative h-full rounded-r-lg p-7 transition-transform duration-300 will-change-transform"
      >
        <span className="pointer-events-none absolute -top-4 left-5 font-serif text-[88px] leading-none text-gradient select-none" aria-hidden>
          «
        </span>
        <p className="relative mt-6 text-[15px] leading-[25px] text-hi">{t.quote}</p>
        <div className="mt-6 flex items-center gap-3">
          <span
            className="flex size-11 items-center justify-center rounded-full font-display text-[14px] font-semibold text-void"
            style={{ background: t.color }}
          >
            {t.initials}
          </span>
          <div>
            <p className="text-[14px] font-semibold text-hi">{t.name}</p>
            <p className="text-[12px] text-mid">{t.role}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function Testimonials() {
  return (
    <section className="relative bg-base py-24 md:py-40">
      <div className="mx-auto max-w-[1240px] px-6">
        <SectionHead
          overline="TÉMOIGNAGES"
          title="Ils vendent déjà dans la conversation"
          accent="conversation"
        />
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <TiltCard key={t.name} t={t} index={i} />
          ))}
        </div>
        <Reveal className="mt-14" delay={0.1}>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-r-lg border border-line bg-line sm:grid-cols-3">
            {RESULTS.map((r) => (
              <div key={r.label} className="bg-surface-1 px-6 py-8 text-center">
                <p className="font-display text-[32px] font-semibold text-hi">
                  {r.prefix}
                  <CountUp
                    value={r.value}
                    format={(v) =>
                      r.decimals ? v.toFixed(r.decimals).replace(".", ",") : Math.round(v).toLocaleString("fr-FR")
                    }
                  />
                  {r.suffix}
                </p>
                <p className="mt-1.5 text-[13px] text-mid">{r.label}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
