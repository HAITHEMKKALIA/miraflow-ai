/**
 * Composer — barre de réponse (inbox.md S2d). Textarea auto-grandissante,
 * palette « / » de réponses enregistrées (variables {{…}} auto-remplies),
 * emoji picker, menu pièces jointes (image/document/audio/carrousel),
 * bouton envoyer ⇄ micro (dictée simulée), brouillon persisté par
 * conversation, bandeau réponse citée, état résolu / session déconnectée.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines, CornerUpLeft, FileText, Image as ImageIcon, LayoutGrid, Mic,
  Plus, SendHorizonal, Smile, X,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/sim/store";
import { useSim } from "@/lib/sim/store";
import type { DisplayMsg } from "./thread";
import { SAVED_REPLIES, fillReplyVars, splitVars } from "./data";
import { getProfile } from "../contacts/shared";
import { MenuItem, Popover } from "./ui";
import { cn } from "@/lib/utils";

const EMOJI_CATS: { name: string; emojis: string[] }[] = [
  { name: "Smileys", emojis: ["😀", "😄", "😂", "🤣", "😊", "😍", "😘", "🤩", "😉", "😋", "🤔", "😅", "😭", "😴", "🙌", "👏"] },
  { name: "Gestes", emojis: ["👍", "👎", "🙏", "👌", "✌️", "🤝", "💪", "👋", "🫶", "✍️"] },
  { name: "Cœurs", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "✨"] },
  { name: "Objets", emojis: ["🎉", "🎂", "🍰", "🧁", "☕", "🎁", "📦", "🚚", "📍", "🕐"] },
];

const PRODUCTS = [
  { url: "/product-pastry.png", label: "Coffret pâtisserie" },
  { url: "/product-textile.png", label: "Soie atlas" },
  { url: "/product-cosmetic.png", label: "Huile d'argan" },
];

export interface RichPayload {
  kind: "image" | "doc" | "audio" | "carousel";
  body: string;
  mediaUrl?: string;
  docName?: string;
  docSize?: string;
  audioSec?: number;
  carousel?: string[];
}

export interface ComposerProps {
  convId: string;
  contact?: Contact;
  replyTo: DisplayMsg | null;
  onCancelReply: () => void;
  onSendText: (body: string, replyTo: DisplayMsg | null) => void;
  onSendRich: (p: RichPayload) => void;
  /** texte à insérer (suggestion IA / modification) */
  insertRequest: { text: string; nonce: number } | null;
  disabled?: boolean;
  disabledReason?: string;
  resolved: boolean;
  onReopen: () => void;
}

export default function Composer({
  convId,
  contact,
  replyTo,
  onCancelReply,
  onSendText,
  onSendRich,
  insertRequest,
  disabled,
  disabledReason,
  resolved,
  onReopen,
}: ComposerProps) {
  const saveDraft = useSim((s) => s.saveDraft);
  const clearDraft = useSim((s) => s.clearDraft);
  const [value, setValue] = useState<string>(() => useSim.getState().drafts[convId] ?? "");
  const [slashIdx, setSlashIdx] = useState(0);
  const [emojiQuery, setEmojiQuery] = useState("");
  const [dictating, setDictating] = useState(false);
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselSel, setCarouselSel] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const vars = useMemo(() => {
    const profile = contact ? getProfile(contact) : undefined;
    return {
      prenom: contact?.name.split(" ")[0],
      ville: contact?.city,
      produit: profile?.orders[0]?.label ?? "coffret Aid",
    };
  }, [contact]);

  /* Charger le brouillon à chaque changement de conversation */
  useEffect(() => {
    setValue(useSim.getState().drafts[convId] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  /* Persister le brouillon (debounce) */
  useEffect(() => {
    const id = convId;
    const t = setTimeout(() => {
      if (value.trim()) saveDraft(id, value);
      else clearDraft(id);
    }, 400);
    return () => clearTimeout(t);
  }, [value, convId, saveDraft, clearDraft]);

  /* Flush du brouillon quand on quitte la conversation */
  useEffect(() => {
    const id = convId;
    return () => {
      if (valueRef.current.trim()) saveDraft(id, valueRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  /* Insertion externe (suggestion IA) */
  useEffect(() => {
    if (insertRequest) {
      setValue(insertRequest.text);
      requestAnimationFrame(() => {
        taRef.current?.focus();
        grow();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertRequest?.nonce]);

  /* Raccourcis page : « r » focus, « / » palette réponses */
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ convId: string; action: string }>).detail;
      if (!d || d.convId !== convId) return;
      if (d.action === "focus") taRef.current?.focus();
      if (d.action === "slash") {
        setValue("/");
        requestAnimationFrame(() => taRef.current?.focus());
      }
    };
    window.addEventListener("mf:composer", handler);
    return () => window.removeEventListener("mf:composer", handler);
  }, [convId]);

  /* Auto-grandissement (max ~5 lignes) */
  const grow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 5 * 22 + 20)}px`;
  };
  useEffect(() => {
    grow();
  }, [value]);

  /* Palette « / » */
  const slashMatch = value.match(/^\/([^\s]*)$/);
  const slashOpen = !!slashMatch && !disabled;
  const slashQuery = slashMatch?.[1]?.toLowerCase() ?? "";
  const slashResults = useMemo(
    () =>
      SAVED_REPLIES.filter(
        (r) => r.title.toLowerCase().includes(slashQuery) || r.body.toLowerCase().includes(slashQuery),
      ),
    [slashQuery],
  );
  useEffect(() => {
    setSlashIdx(0);
  }, [slashQuery]);

  const pickReply = (idx: number) => {
    const r = slashResults[idx];
    if (!r) return;
    setValue(fillReplyVars(r.body, vars));
    requestAnimationFrame(() => {
      taRef.current?.focus();
    });
  };

  const insertEmoji = (e: string) => {
    setValue((v) => v + e);
    taRef.current?.focus();
  };

  const doSend = () => {
    const body = value.trim();
    if (!body || disabled) return;
    onSendText(body, replyTo);
    setValue("");
    clearDraft(convId);
    onCancelReply();
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = "auto";
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (slashOpen && slashResults.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx((i) => (i + 1) % slashResults.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx((i) => (i - 1 + slashResults.length) % slashResults.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickReply(slashIdx);
        return;
      }
      if (e.key === "Escape") {
        setValue("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  const startDictation = () => {
    if (dictating) return;
    setDictating(true);
    setTimeout(() => {
      setDictating(false);
      setValue((v) => (v ? v + " " : "") + "Bonjour, je voulais un renseignement sur le coffret Aid.");
      toast.success("Dictée terminée");
    }, 2200);
  };

  const emojiList = useMemo(() => {
    if (!emojiQuery) return EMOJI_CATS;
    return EMOJI_CATS.map((c) => ({ ...c, emojis: c.emojis })).filter((c) => c.emojis.length);
  }, [emojiQuery]);

  const toggleCarousel = (url: string) =>
    setCarouselSel((sel) => (sel.includes(url) ? sel.filter((u) => u !== url) : sel.length < 4 ? [...sel, url] : sel));

  /* État résolu */
  if (resolved) {
    return (
      <div className="shrink-0 border-t border-line bg-surface-1/60 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 rounded-r-md border border-mint/30 bg-mint/5 px-4 py-3">
          <p className="text-[13px] text-mid">Conversation résolue — rouvrez-la pour répondre.</p>
          <button
            type="button"
            onClick={onReopen}
            className="rounded-r-sm bg-mint/15 px-3 py-1.5 text-[13px] font-semibold text-mint transition-colors hover:bg-mint/25"
          >
            Rouvrir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative shrink-0 border-t border-line bg-surface-1/60 px-3 pb-3 pt-2 backdrop-blur-md md:px-4">
      {/* Palette « / » */}
      <AnimatePresence>
        {slashOpen && slashResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-full start-3 end-3 z-40 mb-2 max-h-[300px] overflow-hidden rounded-r-md border border-line bg-surface-3 shadow-card"
            role="listbox"
            aria-label="Réponses enregistrées"
          >
            <p className="label-micro border-b border-line px-3 py-2 text-low">Réponses enregistrées · {slashResults.length}</p>
            <div className="max-h-[250px] overflow-y-auto p-1">
              {slashResults.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  role="option"
                  aria-selected={i === slashIdx}
                  onMouseEnter={() => setSlashIdx(i)}
                  onClick={() => pickReply(i)}
                  className={cn(
                    "group flex w-full items-start gap-3 rounded-r-sm px-3 py-2 text-start transition-colors",
                    i === slashIdx ? "bg-surface-2" : "hover:bg-surface-2/60",
                  )}
                >
                  <span className="mt-0.5 shrink-0 rounded border border-line bg-surface-2 px-1 font-mono text-[10px] text-pulse">/</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-hi">{r.title}</span>
                    <span className="block truncate text-[12px] text-mid">
                      {splitVars(r.body).map((p, k) => (
                        <span key={k} className={p.isVar ? "font-medium text-pulse" : undefined}>
                          {p.isVar ? fillReplyVars(p.text, vars) : p.text}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bandeau réponse citée */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-2 flex items-center gap-2 rounded-r-sm border-s-2 border-iris bg-iris/10 px-3 py-2">
              <CornerUpLeft className="size-3.5 shrink-0 text-iris" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-iris">
                  Réponse à {replyTo.direction === "out" ? "vous" : contact?.name.split(" ")[0] ?? "contact"}
                </p>
                <p className="truncate text-[12px] text-mid">{replyTo.body || replyTo.docName || "Message"}</p>
              </div>
              <button type="button" onClick={onCancelReply} aria-label="Annuler la réponse"
                className="flex size-6 items-center justify-center rounded-full text-low hover:bg-surface-2 hover:text-hi">
                <X className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barre */}
      <div
        className={cn(
          "flex items-end gap-1.5 rounded-r-md border bg-surface-2 p-1.5 transition-all",
          disabled ? "border-line opacity-60" : "border-line focus-within:border-line-strong focus-within:shadow-glow-iris",
        )}
      >
        {/* Pièces jointes */}
        <Popover
          trigger={(open, toggle) => (
            <button type="button" onClick={toggle} disabled={disabled} aria-label="Joindre" title="Joindre"
              className={cn("flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                open ? "bg-surface-3 text-hi" : "text-mid hover:bg-surface-3 hover:text-hi", disabled && "cursor-not-allowed")}>
              <Plus className={cn("size-4.5 transition-transform", open && "rotate-45")} />
            </button>
          )}>
          {(close) => (
            <div className="p-1">
              <MenuItem icon={<ImageIcon className="text-pulse" />}
                onClick={() => { onSendRich({ kind: "image", body: "", mediaUrl: PRODUCTS[0].url }); close(); toast.success("Image jointe"); }}>
                Image
              </MenuItem>
              <MenuItem icon={<FileText className="text-rose" />}
                onClick={() => { onSendRich({ kind: "doc", body: "", docName: "Catalogue_Aid_2025.pdf", docSize: "2,4 Mo" }); close(); toast.success("Document joint"); }}>
                Document
              </MenuItem>
              <MenuItem icon={<AudioLines className="text-mint" />}
                onClick={() => { onSendRich({ kind: "audio", body: "", audioSec: 23 }); close(); toast.success("Note vocale envoyée"); }}>
                Audio
              </MenuItem>
              <MenuItem icon={<LayoutGrid className="text-iris" />}
                onClick={() => { setCarouselSel(PRODUCTS.slice(0, 2).map((p) => p.url)); setCarouselOpen(true); close(); }}>
                Carrousel produit
              </MenuItem>
            </div>
          )}
        </Popover>

        {/* Textarea */}
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={disabled ? disabledReason ?? "Envoi indisponible" : "Écrivez votre message… (/ pour une réponse rapide)"}
          aria-label="Écrire un message"
          className="max-h-[130px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] leading-[22px] text-hi placeholder:text-low focus:outline-none disabled:cursor-not-allowed"
        />

        {/* Emoji */}
        <Popover align="end"
          trigger={(open, toggle) => (
            <button type="button" onClick={toggle} disabled={disabled} aria-label="Émojis" title="Émojis"
              className={cn("hidden size-9 shrink-0 items-center justify-center rounded-full transition-colors sm:flex",
                open ? "bg-surface-3 text-hi" : "text-mid hover:bg-surface-3 hover:text-hi", disabled && "cursor-not-allowed")}>
              <Smile className="size-4.5" />
            </button>
          )}
          panelClassName="w-[300px]">
          <div>
            <div className="border-b border-line p-2">
              <input value={emojiQuery} onChange={(e) => setEmojiQuery(e.target.value)} placeholder="Rechercher…"
                className="w-full rounded-r-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-hi placeholder:text-low focus:border-iris focus:outline-none" />
            </div>
            <div className="max-h-[240px] overflow-y-auto p-2">
              {emojiList.map((cat) => (
                <div key={cat.name} className="mb-2">
                  <p className="label-micro px-1 py-1 text-low">{cat.name}</p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {cat.emojis.map((e) => (
                      <button key={e} type="button" onClick={() => insertEmoji(e)}
                        className="flex size-8 items-center justify-center rounded text-[17px] transition-transform hover:scale-125 hover:bg-surface-2">
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Popover>

        {/* Envoyer / Micro */}
        {dictating ? (
          <div className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-rose/15 px-3" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <motion.span key={i} className="w-[3px] rounded-full bg-rose"
                animate={{ height: [6, 16, 6] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
            ))}
            <span className="ms-1 font-mono text-[10px] text-rose">REC</span>
          </div>
        ) : value.trim() ? (
          <motion.button
            key="send"
            type="button"
            onClick={doSend}
            disabled={disabled}
            aria-label="Envoyer"
            whileTap={{ scale: 0.9 }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex size-9 shrink-0 items-center justify-center rounded-full gradient-signature text-white shadow-glow-iris transition-transform hover:scale-105 active:scale-90 disabled:opacity-50 rtl:-scale-x-100"
          >
            <SendHorizonal className="size-4.5" />
          </motion.button>
        ) : (
          <motion.button
            key="mic"
            type="button"
            onClick={startDictation}
            disabled={disabled}
            aria-label="Dicter un message"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-3 text-mid transition-colors hover:text-hi disabled:opacity-50"
          >
            <Mic className="size-4.5" />
          </motion.button>
        )}
      </div>

      {/* Constructeur de carrousel */}
      <AnimatePresence>
        {carouselOpen && (
          <motion.div className="fixed inset-0 z-[85] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            role="dialog" aria-modal="true" aria-label="Carrousel produit">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[4px]" onClick={() => setCarouselOpen(false)} />
            <motion.div
              initial={{ y: 24, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 12, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="relative w-full max-w-[480px] rounded-r-lg border border-line bg-surface-1 p-5 shadow-card">
              <h3 className="font-display text-[16px] font-semibold text-hi">Carrousel produit</h3>
              <p className="mt-1 text-[12px] text-mid">Sélectionnez jusqu'à 4 produits — numérotation automatique.</p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {PRODUCTS.map((p) => {
                  const sel = carouselSel.indexOf(p.url);
                  return (
                    <button key={p.url} type="button" onClick={() => toggleCarousel(p.url)}
                      className={cn("group relative overflow-hidden rounded-r-md border-2 transition-all",
                        sel >= 0 ? "border-iris shadow-glow-iris" : "border-line hover:border-line-strong")}>
                      <img src={p.url} alt={p.label} className="aspect-square w-full object-cover" />
                      {sel >= 0 && (
                        <span className="absolute end-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-iris font-mono text-[10px] font-bold text-white">
                          {sel + 1}
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white">
                        {p.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="label-micro text-low">{carouselSel.length} sélectionné{carouselSel.length > 1 ? "s" : ""}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setCarouselOpen(false)}
                    className="rounded-r-sm border border-line bg-surface-2 px-3 py-1.5 text-[13px] text-mid hover:bg-surface-3">
                    Annuler
                  </button>
                  <button type="button" disabled={!carouselSel.length}
                    onClick={() => { onSendRich({ kind: "carousel", body: "Nos produits du moment ✨", carousel: carouselSel }); setCarouselOpen(false); setCarouselSel([]); }}
                    className="rounded-r-sm gradient-signature px-3 py-1.5 text-[13px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-40">
                    Envoyer ({carouselSel.length})
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
