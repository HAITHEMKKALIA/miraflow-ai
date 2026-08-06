/**
 * Page Landing (`/`) — home.md.
 * S0 Preloader (1re visite) → S1 Hero WebGL → S2 Marquee → S3 Démo épinglée →
 * S4 Bento → S5 Orbite agents → S6 Tarifs → S7 Témoignages → S8 FAQ →
 * S9 CTA final. Navbar/Footer via <Layout/> (route parent). Lenis smooth
 * scroll + curseur custom desktop + grain global.
 */
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Cursor from "@/sections/home/Cursor";
import Preloader from "@/sections/home/Preloader";
import Hero from "@/sections/home/Hero";
import Marquee from "@/sections/home/Marquee";
import ProductDemo from "@/sections/home/ProductDemo";
import Bento from "@/sections/home/Bento";
import AgentsOrbit from "@/sections/home/AgentsOrbit";
import Pricing from "@/sections/home/Pricing";
import Testimonials from "@/sections/home/Testimonials";
import Faq from "@/sections/home/Faq";
import FinalCta from "@/sections/home/FinalCta";
import { initLenis } from "@/sections/home/lenis";

export default function Home() {
  const [loading, setLoading] = useState(() => {
    try {
      return !sessionStorage.getItem("mf:seen");
    } catch {
      return false;
    }
  });

  useEffect(() => {
    initLenis();
  }, []);

  return (
    <div className="grain relative bg-void text-hi">
      <Cursor />
      <AnimatePresence>
        {loading && <Preloader onDone={() => setLoading(false)} />}
      </AnimatePresence>
      <Hero />
      <Marquee />
      <ProductDemo />
      <Bento />
      <AgentsOrbit />
      <Pricing />
      <Testimonials />
      <Faq />
      <FinalCta />
    </div>
  );
}
