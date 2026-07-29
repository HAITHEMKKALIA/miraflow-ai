/**
 * S2. Marquee logos + métriques (home.md).
 * Rangée 1 : marquee infini de 10 wordmarks (pause au hover). Rangée 2 :
 * 4 métriques avec count-up au scroll.
 */
import { CountUp } from "./shared";

const WORDMARKS = [
  "Pâtisserie Dar El Baraka", "Maison Slimane", "Café des Nattes", "Atlas Cosmétiques",
  "Le Comptoir Médina", "Dar Tech", "Foulard & Soie", "Librairie El Kitab",
  "Medina Market", "Studio Nour",
];

const METRICS: { value: number; prefix?: string; suffix?: string; label: string; decimals?: number }[] = [
  { value: 38, prefix: "+", suffix: "%", label: "de réponses en 30 jours" },
  { value: 12400, label: "conversations automatisées / mois" },
  { value: 4.8, suffix: "/5", label: "satisfaction équipes", decimals: 1 },
  { value: 99.2, suffix: "%", label: "uptime sessions QR", decimals: 1 },
];

export default function Marquee() {
  return (
    <section id="marquee" className="border-y border-line bg-void">
      {/* Rangée 1 : wordmarks */}
      <div className="group relative overflow-hidden py-7" aria-hidden>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-void to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-void to-transparent" />
        <div className="flex w-max animate-marquee will-change-transform group-hover:[animation-play-state:paused] motion-reduce:animate-none">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex shrink-0 items-center">
              {WORDMARKS.map((w) => (
                <span
                  key={`${dup}-${w}`}
                  className="label-micro mx-8 whitespace-nowrap text-low transition-colors duration-300 hover:text-hi"
                >
                  {w}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Rangée 2 : métriques */}
      <div className="border-t border-line">
        <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-px lg:grid-cols-4">
          {METRICS.map((m) => (
            <div key={m.label} className="px-6 py-10 text-center">
              <p className="font-display text-[clamp(1.8rem,3vw,2.5rem)] font-semibold text-hi">
                {m.prefix}
                <CountUp
                  value={m.value}
                  format={(v) =>
                    m.decimals
                      ? v.toFixed(m.decimals).replace(".", ",")
                      : Math.round(v).toLocaleString("fr-FR")
                  }
                />
                {m.suffix}
              </p>
              <p className="mt-2 text-[13px] text-mid">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
