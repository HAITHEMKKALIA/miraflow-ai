/**
 * ImportCsvModal — import CSV réel en 3 étapes (contacts.md S6).
 * 1) Fichier : dropzone + téléchargement d'un modèle (en-têtes) + aperçu.
 * 2) Mapping : colonnes → champs MiraFlow avec auto-détection + ignorer 1re ligne.
 * 3) Traitement : validation réelle des lignes (numéros, doublons) → rapport
 *    valides / rejetés / doublons + table des rejetés téléchargeable + import
 *    réel des contacts dans le CRM (confettis + toast).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check, CheckCircle2, Download, FileSpreadsheet, Loader2, UploadCloud, X, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/sim/store";
import { newContactId } from "./crmStore";
import { cn } from "@/lib/utils";

/* ── Utilitaire déterministe (confettis) ────────────────────────────────── */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Modèle CSV vierge : uniquement la ligne d'en-têtes. */
const TEMPLATE_HEADER = ["nom", "telephone", "ville", "tags", "email"];

type Field = "ignore" | "name" | "phone" | "city" | "tags" | "email";
const FIELD_LABELS: Record<Field, string> = {
  ignore: "Ignorer", name: "Nom", phone: "Téléphone", city: "Ville", tags: "Tags", email: "Email",
};
function detectField(header: string): Field {
  const h = header.toLowerCase().trim();
  if (/nom|name|contact/.test(h)) return "name";
  if (/tel|phone|num|mobile/.test(h)) return "phone";
  if (/ville|city|adresse/.test(h)) return "city";
  if (/tag|label|segment/.test(h)) return "tags";
  if (/mail|email|e-mail/.test(h)) return "email";
  return "ignore";
}

export interface RejectedLine { line: number; value: string; reason: string }


export interface ImportCsvModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (contacts: Contact[]) => void;
}

export default function ImportCsvModal({ open, onClose, onImport }: ImportCsvModalProps) {
  const [step, setStep] = useState(1);
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Field[]>([]);
  const [skipFirst, setSkipFirst] = useState(true);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [imported, setImported] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep(1);
    setRows([]);
    setFileName("");
    setMapping([]);
    setProgress(0);
    setImported(false);
    setError("");
    setStage("");
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const parseCsv = (text: string, name: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) {
      setError("Fichier vide. CSV UTF-8, max 5 Mo.");
      return;
    }
    const parsed = lines.map((l) => l.split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, "")));
    setRows(parsed);
    setFileName(name);
    setMapping(parsed[0].map(detectField));
    setError("");
    setStep(2);
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name) || f.size > 5 * 1024 * 1024) {
      setError("CSV UTF-8, max 5 Mo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => parseCsv(String(reader.result ?? ""), f.name);
    reader.readAsText(f);
  };

  const downloadTemplate = () => {
    const csv = TEMPLATE_HEADER.join(";");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modele_contacts_miraflow.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Modèle téléchargé");
  };

  const downloadRejected = () => {
    const csv = ["ligne;valeur;raison", ...parsed.rejected.map((r) => `${r.line};${r.value};${r.reason}`)].join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rejets_import.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* Étape 3 : traitement (barre de progression de validation) */
  useEffect(() => {
    if (step !== 3) return;
    setProgress(0);
    setImported(false);
    const stages = ["Validation des numéros…", "Détection des doublons…", "Normalisation des tags…", "Finalisation…"];
    let p = 0;
    const iv = window.setInterval(() => {
      p += 4;
      setProgress(Math.min(100, p));
      setStage(stages[Math.min(stages.length - 1, Math.floor(p / 26))]);
      if (p >= 100) window.clearInterval(iv);
    }, 100);
    return () => window.clearInterval(iv);
  }, [step]);

  const dataRows = useMemo(() => (skipFirst ? rows.slice(1) : rows), [rows, skipFirst]);
  const preview = dataRows.slice(0, 5);
  const headers = rows[0] ?? [];

  /* Analyse réelle du fichier : validation des numéros + dédup par téléphone. */
  const parsed = useMemo(() => {
    const contacts: Contact[] = [];
    const rejected: RejectedLine[] = [];
    let duplicates = 0;
    if (!rows.length) return { contacts, rejected, duplicates };
    const idx = (f: Field) => mapping.indexOf(f);
    const iName = idx("name");
    const iPhone = idx("phone");
    const iCity = idx("city");
    const iTags = idx("tags");
    const seen = new Set<string>();
    dataRows.forEach((r, i) => {
      const line = i + (skipFirst ? 2 : 1);
      const name = (iName >= 0 ? r[iName] : "")?.trim() ?? "";
      const phoneRaw = (iPhone >= 0 ? r[iPhone] : "")?.trim() ?? "";
      const digits = phoneRaw.replace(/\D/g, "");
      if (!name) {
        rejected.push({ line, value: phoneRaw || "(vide)", reason: "Nom manquant" });
        return;
      }
      if (!phoneRaw) {
        rejected.push({ line, value: name, reason: "Téléphone manquant" });
        return;
      }
      if (digits.length < 8) {
        rejected.push({ line, value: phoneRaw, reason: "Numéro invalide" });
        return;
      }
      if (seen.has(digits)) {
        duplicates += 1;
        return;
      }
      seen.add(digits);
      contacts.push({
        id: newContactId(),
        name,
        phone: phoneRaw.startsWith("+") ? phoneRaw : `+${digits}`,
        city: iCity >= 0 ? (r[iCity] ?? "").trim() : "",
        tags: iTags >= 0 ? (r[iTags] ?? "").split(/[|/]/).map((t) => t.trim()).filter(Boolean) : [],
        score: 0,
        stage: "prospect",
        consent: false,
        lastContactAt: Date.now(),
      });
    });
    return { contacts, rejected, duplicates };
  }, [rows, dataRows, mapping, skipFirst]);

  const doImport = () => {
    onImport(parsed.contacts);
    setImported(true);
    toast.success(`${parsed.contacts.length} contacts importés`, { description: "Ils apparaissent maintenant dans la table." });
  };

  const STEPS = ["Fichier", "Mapping", "Traitement"];

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          role="dialog" aria-modal="true" aria-label="Importer un CSV">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[4px]" onClick={onClose} />
          <motion.div
            initial={{ y: 24, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 12, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative flex max-h-[88vh] w-full max-w-[720px] flex-col overflow-hidden rounded-r-lg border border-line bg-surface-1 shadow-card"
          >
            {/* En-tête + stepper */}
            <div className="shrink-0 border-b border-line p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-[18px] font-semibold text-hi">Importer des contacts</h2>
                <button type="button" onClick={onClose} aria-label="Fermer"
                  className="flex size-8 items-center justify-center rounded-r-sm text-mid transition-colors hover:bg-surface-2 hover:text-hi">
                  <X className="size-4.5" />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2">
                {STEPS.map((label, i) => {
                  const n = i + 1;
                  const done = step > n;
                  const active = step === n;
                  return (
                    <div key={label} className="flex flex-1 items-center gap-2">
                      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] transition-colors",
                        done ? "border-mint bg-mint/15 text-mint" : active ? "border-iris bg-iris/15 text-iris" : "border-line bg-surface-2 text-low")}>
                        {done ? <Check className="size-3" /> : n}
                      </span>
                      <span className={cn("text-[12px] font-medium", active ? "text-hi" : "text-low")}>{label}</span>
                      {i < STEPS.length - 1 && <span className={cn("h-px flex-1", done ? "bg-mint" : "bg-line")} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Contenu */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <AnimatePresence mode="wait">
                {/* ÉTAPE 1 : fichier */}
                {step === 1 && (
                  <motion.div key="s1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3 }}>
                    <button
                      type="button"
                      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                      onDragLeave={() => setDrag(false)}
                      onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
                      onClick={() => fileInput.current?.click()}
                      className={cn(
                        "flex w-full flex-col items-center justify-center gap-3 rounded-r-lg border-2 border-dashed px-6 py-12 text-center transition-all",
                        drag ? "border-pulse bg-pulse/5" : error ? "border-rose/60 bg-rose/5" : "border-line bg-surface-2/40 hover:border-line-strong",
                      )}
                    >
                      <motion.span animate={drag ? { y: [-3, 3, -3] } : {}} transition={{ repeat: Infinity, duration: 0.8 }}
                        className={cn("flex size-12 items-center justify-center rounded-full", drag ? "bg-pulse/15 text-pulse" : "bg-surface-3 text-low")}>
                        <UploadCloud className="size-6" />
                      </motion.span>
                      <div>
                        <p className="text-[14px] font-medium text-hi">Glissez votre CSV ici, ou <span className="text-iris underline">parcourez</span></p>
                        <p className="mt-1 text-[12px] text-low">UTF-8 · max 5 Mo · séparateur , ou ;</p>
                      </div>
                      <input ref={fileInput} type="file" accept=".csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                    </button>
                    {error && (
                      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-rose"><XCircle className="size-3.5" /> {error}</p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <button type="button" onClick={downloadTemplate}
                        className="flex items-center gap-1.5 rounded-r-sm border border-line bg-surface-2 px-3 py-2 text-[12px] font-medium text-mid transition-colors hover:bg-surface-3 hover:text-hi">
                        <Download className="size-3.5" /> Télécharger un modèle
                      </button>

                    </div>
                  </motion.div>
                )}

                {/* ÉTAPE 2 : mapping */}
                {step === 2 && (
                  <motion.div key="s2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3 }}>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="flex items-center gap-2 text-[13px] text-mid">
                        <FileSpreadsheet className="size-4 text-pulse" />
                        <span className="font-medium text-hi">{fileName}</span>
                        <span className="font-mono text-[11px] tabular text-low">{dataRows.length} lignes</span>
                      </p>
                      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-mid">
                        <input type="checkbox" checked={skipFirst} onChange={(e) => setSkipFirst(e.target.checked)} className="size-4 accent-[#FF5A4E]" />
                        Ignorer la première ligne
                      </label>
                    </div>

                    {/* Mapping colonnes */}
                    <div className="space-y-2">
                      {headers.map((h, i) => (
                        <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-r-sm border border-line bg-surface-2/40 px-3 py-2">
                          <span className="truncate font-mono text-[12px] text-hi">{h || `Colonne ${i + 1}`}</span>
                          <span className="text-low">→</span>
                          <div className="flex items-center gap-2">
                            <select value={mapping[i]} onChange={(e) => setMapping((m) => m.map((f, j) => (j === i ? (e.target.value as Field) : f)))}
                              className="w-full rounded-r-sm border border-line bg-surface-1 px-2 py-1.5 text-[12px] text-hi focus:border-iris focus:outline-none">
                              {(Object.keys(FIELD_LABELS) as Field[]).map((f) => (
                                <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                              ))}
                            </select>
                            {mapping[i] !== "ignore" && detectField(h) === mapping[i] && (
                              <span className="shrink-0 rounded-full bg-mint/15 px-1.5 py-0.5 text-[9px] font-semibold text-mint">détecté</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Aperçu */}
                    <p className="label-micro mt-4 text-low">Aperçu (5 premières lignes)</p>
                    <div className="mt-2 overflow-x-auto rounded-r-md border border-line">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-line bg-surface-2/60">
                            {headers.map((h, i) => (
                              <th key={i} className="px-3 py-2 text-start label-micro text-low">{h || `Col ${i + 1}`}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((r, ri) => (
                            <tr key={ri} className="border-b border-line/50">
                              {headers.map((_, ci) => (
                                <td key={ci} className="px-3 py-1.5 text-mid">{r[ci] ?? "—"}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-5 flex justify-between">
                      <button type="button" onClick={() => setStep(1)} className="rounded-r-sm border border-line bg-surface-2 px-4 py-2 text-[13px] text-mid hover:bg-surface-3">Retour</button>
                      <button type="button" onClick={() => setStep(3)} disabled={!mapping.includes("phone") || !mapping.includes("name")}
                        className="rounded-r-sm gradient-signature px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-40">
                        Lancer l'import
                      </button>
                    </div>
                    {(!mapping.includes("phone") || !mapping.includes("name")) && (
                      <p className="mt-2 text-end text-[11px] text-amber">Mappez au moins « Nom » et « Téléphone ».</p>
                    )}
                  </motion.div>
                )}

                {/* ÉTAPE 3 : traitement + rapport */}
                {step === 3 && (
                  <motion.div key="s3" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3 }}>
                    {progress < 100 ? (
                      <div className="flex flex-col items-center py-10">
                        <Loader2 className="size-8 animate-spin text-iris" />
                        <p className="mt-4 text-[14px] font-medium text-hi">{stage}</p>
                        <div className="mt-4 h-2 w-full max-w-[420px] overflow-hidden rounded-full bg-surface-2">
                          <motion.div className="h-full gradient-signature" animate={{ width: `${progress}%` }} transition={{ ease: "linear" }} />
                        </div>
                        <p className="mt-2 font-mono text-[12px] tabular text-mid">{progress}%</p>
                      </div>
                    ) : !imported ? (
                      <div>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: "Valides", value: parsed.contacts.length, tone: "mint", icon: <CheckCircle2 className="size-5" /> },
                            { label: "Rejetés", value: parsed.rejected.length, tone: "rose", icon: <XCircle className="size-5" /> },
                            { label: "Doublons", value: parsed.duplicates, tone: "amber", icon: <Loader2 className="size-5" /> },
                          ].map((c, i) => (
                            <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }}
                              className={cn("rounded-r-md border p-4 text-center",
                                c.tone === "mint" ? "border-mint/30 bg-mint/5" : c.tone === "rose" ? "border-rose/30 bg-rose/5" : "border-amber/30 bg-amber/5")}>
                              <span className={cn("mx-auto flex w-fit", c.tone === "mint" ? "text-mint" : c.tone === "rose" ? "text-rose" : "text-amber")}>{c.icon}</span>
                              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className={cn("mt-2 font-display text-[30px] font-semibold tabular", c.tone === "mint" ? "text-mint" : c.tone === "rose" ? "text-rose" : "text-amber")}>
                                <CountUp value={c.value} />
                              </motion.p>
                              <p className="label-micro text-low">{c.label}</p>
                            </motion.div>
                          ))}
                        </div>

                        {/* Rejetés */}
                        <div className="mt-4 rounded-r-md border border-line">
                          <div className="flex items-center justify-between border-b border-line px-3 py-2">
                            <p className="label-micro text-low">Lignes rejetées</p>
                            {parsed.rejected.length > 0 && (
                              <button type="button" onClick={downloadRejected} className="flex items-center gap-1 text-[11px] font-medium text-iris hover:underline">
                                <Download className="size-3" /> Télécharger
                              </button>
                            )}
                          </div>
                          <div className="max-h-[150px] overflow-y-auto">
                            {parsed.rejected.length === 0 && (
                              <p className="px-3 py-2 text-[12px] text-low">Aucune ligne rejetée.</p>
                            )}
                            {parsed.rejected.map((r) => (
                              <div key={r.line} className="flex items-center justify-between border-b border-line/40 px-3 py-1.5 text-[12px] last:border-0">
                                <span className="font-mono tabular text-low">L.{r.line}</span>
                                <span className="min-w-0 flex-1 truncate px-2 text-mid">{r.value}</span>
                                <span className="shrink-0 text-rose">{r.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-5 flex justify-end">
                          <button type="button" onClick={doImport} disabled={parsed.contacts.length === 0}
                            className="rounded-r-sm gradient-signature px-4 py-2 text-[13px] font-semibold text-white shadow-glow-iris transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-40">
                            Importer les {parsed.contacts.length} contacts
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex flex-col items-center py-10">
                        <Confetti />
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
                          className="flex size-16 items-center justify-center rounded-full bg-mint/15 text-mint">
                          <Check className="size-8" />
                        </motion.span>
                        <p className="mt-4 font-display text-[18px] font-semibold text-hi">Import terminé !</p>
                        <p className="mt-1 text-[13px] text-mid">{parsed.contacts.length} contacts ajoutés · {parsed.duplicates} doublons ignorés · {parsed.rejected.length} rejetés.</p>
                        <button type="button" onClick={onClose}
                          className="mt-5 rounded-r-sm gradient-signature px-5 py-2 text-[13px] font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95">
                          Voir les contacts
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Count-up ───────────────────────────────────────────────────────────── */
function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let cur = 0;
    const iv = window.setInterval(() => {
      cur += Math.max(1, Math.round(value / 30));
      if (cur >= value) {
        setN(value);
        window.clearInterval(iv);
      } else setN(cur);
    }, 26);
    return () => window.clearInterval(iv);
  }, [value]);
  return <>{n}</>;
}

/* ── Confettis légers ───────────────────────────────────────────────────── */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => ({
        id: i,
        x: (hash(`x${i}`) % 200) - 100,
        y: -(hash(`y${i}`) % 120) - 20,
        r: hash(`r${i}`) % 360,
        c: ["#FF5A4E", "#FF9F2E", "#0DBA9B", "#FFB84D", "#FF6B7A"][i % 5],
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.y, 160], opacity: [1, 1, 0], rotate: p.r }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          className="absolute size-2 rounded-[2px]"
          style={{ backgroundColor: p.c }}
        />
      ))}
    </div>
  );
}
