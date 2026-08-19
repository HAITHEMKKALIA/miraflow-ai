/**
 * media.ts — pièces jointes « riches » de l'étape Contenu (campaigns.md).
 *
 *  - Montage : grille professionnelle 2×2 générée en canvas (images produits,
 *    bandeau titre dégradé signature, prix en pilules) → dataURL JPEG,
 *    téléchargeable et affichable comme une seule image dans le PhoneMock.
 *  - Catalogue PDF : vrai PDF client-side via jsPDF — couverture dégradée,
 *    une page par produit (image, titre, description, prix, référence) et
 *    page contact. Téléchargé via doc.save().
 */
import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import type { CarouselCard } from "./shared";
import { useSim } from "@/lib/sim/store";

/* ── Constantes publiques ──────────────────────────────────────────────── */
export const CATALOG_FILENAME = "Catalogue_Été.pdf";
export const CATALOG_SIZE = "2,4 Mo";
export const MONTAGE_FILENAME = "montage-campagne.jpg";

const companyName = () => useSim.getState().org.name.trim() || "Votre entreprise";
const IRIS = { r: 255, g: 90, b: 78 };
const PULSE = { r: 255, g: 159, b: 46 };
const INK = { r: 16, g: 22, b: 40 };

/* ── Chargement d'images ───────────────────────────────────────────────── */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image introuvable : ${src}`));
    img.src = src;
  });
}

/** Image → dataURL (JPEG par défaut) via canvas, pour jsPDF / aperçus. */
async function imageToDataUrl(
  src: string,
  maxW = 900,
  format: "jpeg" | "png" = "jpeg",
): Promise<{ dataUrl: string; w: number; h: number }> {
  const img = await loadImage(src);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(1, maxW / iw);
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: c.toDataURL(format === "png" ? "image/png" : "image/jpeg", 0.86), w, h };
}

/* ════════════════════════════════════════════════════════════════════════
   MONTAGE — grille 2×2 en canvas
   ════════════════════════════════════════════════════════════════════════ */
const SIZE = 1080;
const BANNER_H = 176;
const PAD = 36;
const GAP = 24;
const CELL = (SIZE - BANNER_H - PAD * 2 - GAP) / 2; // 404

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dessine l'image en mode « cover » dans le cadre (x,y,w,h). */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const ir = iw / ih;
  const r = w / h;
  let sw = iw;
  let sh = ih;
  let sx = 0;
  let sy = 0;
  if (ir > r) {
    sw = ih * r;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / r;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function truncateTo(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Génère le montage 2×2 (1080×1080) et renvoie un dataURL JPEG. */
export async function buildMontage(cards: CarouselCard[], title: string): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");

  // Fond nuit Solar Glass
  const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
  bg.addColorStop(0, "#121A30");
  bg.addColorStop(1, "#0A0E1C");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Bandeau dégradé signature
  const banner = ctx.createLinearGradient(0, 0, SIZE, 0);
  banner.addColorStop(0, "#FF5A4E");
  banner.addColorStop(0.55, "#FF7A3C");
  banner.addColorStop(1, "#FF9F2E");
  ctx.fillStyle = banner;
  ctx.fillRect(0, 0, SIZE, BANNER_H);

  // Logo dans un médaillon clair
  try {
    const logo = await loadImage("/logo.svg");
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.arc(PAD + 46, BANNER_H / 2, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(logo, PAD + 10, BANNER_H / 2 - 36, 72, 72);
  } catch {
    /* logo optionnel */
  }

  // Titre + sous-titre du bandeau
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 46px 'Space Grotesk', 'Segoe UI', sans-serif";
  const cleanTitle = title.trim() || "Offre du moment";
  ctx.fillText(truncateTo(ctx, cleanTitle, SIZE - PAD * 2 - 130), PAD + 118, BANNER_H / 2 - 2);
  ctx.font = "500 26px 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText(`${Math.min(cards.length, 4)} produits · sélection du moment`, PAD + 118, BANNER_H / 2 + 42);

  // 4 cases (on boucle sur les cartes si moins de 4)
  const cells: CarouselCard[] = [];
  for (let i = 0; i < 4; i++) cells.push(cards[i % cards.length]);
  const gridTop = BANNER_H + PAD;

  for (let i = 0; i < 4; i++) {
    const card = cells[i];
    const x = PAD + (i % 2) * (CELL + GAP);
    const y = gridTop + Math.floor(i / 2) * (CELL + GAP);

    // Cadre
    ctx.save();
    roundRectPath(ctx, x, y, CELL, CELL, 26);
    ctx.clip();
    ctx.fillStyle = "#1B2440";
    ctx.fillRect(x, y, CELL, CELL);
    try {
      const img = await loadImage(card.image);
      drawCover(ctx, img, x, y, CELL, CELL);
    } catch {
      /* fond placeholder conservé */
    }
    // Voile bas pour lisibilité
    const veil = ctx.createLinearGradient(0, y + CELL - 130, 0, y + CELL);
    veil.addColorStop(0, "rgba(6,9,18,0)");
    veil.addColorStop(1, "rgba(6,9,18,.88)");
    ctx.fillStyle = veil;
    ctx.fillRect(x, y + CELL - 130, CELL, 130);

    // Titre produit
    ctx.font = "700 30px 'Space Grotesk', 'Segoe UI', sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(truncateTo(ctx, card.title || "Produit", CELL - 40), x + 20, y + CELL - 62);

    // Pilule prix
    const price = card.price || "—";
    ctx.font = "700 26px 'Segoe UI', sans-serif";
    const pw = ctx.measureText(price).width + 34;
    const px = x + 20;
    const py = y + CELL - 48;
    const grad = ctx.createLinearGradient(px, 0, px + pw, 0);
    grad.addColorStop(0, "#FF5A4E");
    grad.addColorStop(1, "#FF9F2E");
    ctx.fillStyle = grad;
    roundRectPath(ctx, px, py, pw, 36, 18);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(price, px + 17, py + 27);
    ctx.restore();

    // Liseré
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 2;
    roundRectPath(ctx, x, y, CELL, CELL, 26);
    ctx.stroke();
  }

  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Hook : régénère le montage quand les cartes/titre changent (enabled requis). */
export function useMontage(cards: CarouselCard[], title: string, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const key = `${enabled ? "on" : "off"}|${title}|${cards.map((c) => `${c.image}:${c.title}:${c.price}`).join(";")}`;
  useEffect(() => {
    if (!enabled || cards.length === 0) {
      setUrl(null);
      return;
    }
    let alive = true;
    buildMontage(cards, title)
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

/** Télécharge un dataURL sous un nom de fichier. */
export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/* ════════════════════════════════════════════════════════════════════════
   CATALOGUE PDF — jsPDF
   ════════════════════════════════════════════════════════════════════════ */
const DESC_BY_IMAGE: Record<string, string> = {
  "/product-pastry.png":
    "Pâtisseries artisanales préparées chaque matin : makroudh au miel, baklawa aux amandes et kaak warka. Coffret assorti de 24 pièces, idéal pour les fêtes, les cadeaux et les plateaux d'accueil.",
  "/product-textile.png":
    "Étole en soie naturelle tissée main par nos artisanes, teinture végétale aux pigments d'Atlas. Douce, légère et lumineuse — le cadeau élégant par excellence, du quotidien aux grandes occasions.",
  "/product-cosmetic.png":
    "Huile d'argan pure, première pression à froid, certifiée biologique. Nourrit la peau et les cheveux en profondeur sans film gras. Flacon verre ambré 50 ml avec compte-gouttes de précision.",
};
const DESC_FALLBACK =
  "Produit phare de notre collection, sélectionné avec soin auprès de nos artisans partenaires. Qualité garantie, fabrication en petites séries et retours possibles sous 14 jours.";

function descFor(image: string): string {
  return DESC_BY_IMAGE[image] ?? DESC_FALLBACK;
}

/** Bande horizontale sombre d'en-tête de page produit. */
function pdfHeader(doc: jsPDF, W: number, label: string) {
  doc.setFillColor(INK.r, INK.g, INK.b);
  doc.rect(0, 0, W, 64, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(companyName(), 48, 38);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(PULSE.r, PULSE.g, PULSE.b);
  doc.text(label, W - 48, 38, { align: "right" });
}

/** Dégradé vertical iris → ambre → nuit (couverture / page contact). */
function pdfGradient(doc: jsPDF, W: number, H: number) {
  const SLICES = 90;
  for (let i = 0; i < SLICES; i++) {
    const t = i / (SLICES - 1);
    const mid = t < 0.62 ? t / 0.62 : 1;
    const dark = t < 0.62 ? 0 : (t - 0.62) / 0.38;
    const r = Math.round((IRIS.r + (PULSE.r - IRIS.r) * mid) * (1 - dark) + INK.r * dark);
    const g = Math.round((IRIS.g + (PULSE.g - IRIS.g) * mid) * (1 - dark) + INK.g * dark);
    const b = Math.round((IRIS.b + (PULSE.b - IRIS.b) * mid) * (1 - dark) + INK.b * dark);
    doc.setFillColor(r, g, b);
    doc.rect(0, (H / SLICES) * i, W, H / SLICES + 1, "F");
  }
}

/** Génère et télécharge le catalogue PDF (couverture + produits + contact). */
export async function generateCatalogPdf(opts: {
  title: string;
  cards: CarouselCard[];
}): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const cards = opts.cards.length ? opts.cards : [{ id: "x", image: "", title: "Produit", price: "", cta: "" }];

  /* ── Couverture ── */
  pdfGradient(doc, W, H);
  try {
    const logo = await imageToDataUrl("/logo.svg", 256, "png");
    doc.addImage(logo.dataUrl, "PNG", W - 56 - 76, 56, 76, 76);
  } catch {
    /* logo optionnel */
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("MIRAFLOW AI · CATALOGUE", 56, 96);
  doc.setFontSize(40);
  doc.text(companyName(), 56, 150, { maxWidth: W - 112 });
  doc.setFontSize(22);
  doc.setTextColor(255, 238, 224);
  doc.text(opts.title.trim() || "Catalogue Été", 56, 190, { maxWidth: W - 112 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  const edition = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  doc.text(`Édition ${edition} · ${cards.length} produit${cards.length > 1 ? "s" : ""}`, 56, 220);
  doc.setFontSize(10);
  doc.text("Commandes sur WhatsApp — répondez OUI à notre message.", 56, H - 84);
  doc.text("Catalogue généré avec MiraFlow AI", 56, H - 66);

  /* ── 1 page par produit ── */
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    doc.addPage();
    pdfHeader(doc, W, `Produit ${i + 1}/${cards.length}`);

    // Visuel produit (contenu dans un cadre)
    const box = { x: 48, y: 96, w: W - 96, h: 300 };
    doc.setFillColor(244, 241, 236);
    doc.roundedRect(box.x, box.y, box.w, box.h, 10, 10, "F");
    try {
      const img = await imageToDataUrl(card.image);
      const ratio = img.w / img.h;
      let w = box.w;
      let h = w / ratio;
      if (h > box.h) {
        h = box.h;
        w = h * ratio;
      }
      doc.addImage(img.dataUrl, "JPEG", box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    } catch {
      doc.setTextColor(140, 146, 166);
      doc.setFontSize(12);
      doc.text("Visuel indisponible", box.x + box.w / 2, box.y + box.h / 2, { align: "center" });
    }

    // Titre + référence + prix
    doc.setTextColor(INK.r, INK.g, INK.b);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text(card.title || `Produit ${i + 1}`, 48, 452, { maxWidth: W - 96 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(126, 132, 152);
    doc.text(`Réf. MF-${String(i + 1).padStart(3, "0")} · En stock`, 48, 476);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(IRIS.r, IRIS.g, IRIS.b);
    doc.text(card.price || "Prix sur demande", W - 48, 470, { align: "right" });

    // Description
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(58, 64, 84);
    const lines = doc.splitTextToSize(descFor(card.image), W - 96) as string[];
    doc.text(lines, 48, 512);

    // Bandeau CTA
    doc.setFillColor(255, 238, 229);
    doc.roundedRect(48, H - 150, W - 96, 58, 8, 8, "F");
    doc.setTextColor(196, 62, 48);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Commande express", 64, H - 128);
    doc.setFont("helvetica", "normal");
    doc.text("Répondez OUI à notre message WhatsApp pour réserver ce produit.", 64, H - 110);

    doc.setFontSize(9);
    doc.setTextColor(150, 156, 176);
    doc.text(`${i + 2} / ${cards.length + 2}`, W / 2, H - 26, { align: "center" });
  }

  /* ── Page contact ── */
  doc.addPage();
  pdfGradient(doc, W, H);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("Contact & commandes", 56, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  const org = useSim.getState().org;
  const mainSession = useSim.getState().sessions[0];
  const contactLines = [
    `${companyName()}`,
    `WhatsApp Business : ${mainSession?.phone?.trim() || "session à connecter"}`,
    org.city?.trim() ? `Adresse : ${org.city.trim()}` : "Adresse : à compléter dans les réglages",
    `Horaires : à compléter dans les réglages`,
    ``,
    `Livraison offerte à Tunis dès 80 TND d'achat.`,
    `Paiement à la livraison ou par virement.`,
  ];
  doc.text(contactLines, 56, 162, { lineHeightFactor: 1.7 });
  doc.setFontSize(10);
  doc.setTextColor(255, 232, 220);
  doc.text("Répondez STOP pour vous désinscrire de nos envois.", 56, H - 84);
  doc.text("Catalogue généré avec MiraFlow AI", 56, H - 66);

  doc.save(CATALOG_FILENAME);
}
