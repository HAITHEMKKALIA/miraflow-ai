/**
 * crmStore — surcouche CRM locale et partagée entre les pages Contacts et
 * Inbox. Le SimEngine expose des contacts en lecture seule (aucune action de
 * mutation) ; ce store Zustand gère les mutations locales : changement
 * d'étape, tags, ajout (import/nouveau), suppression, consentements, notes et
 * journal d'activité. Persisté en localStorage (« mf:crm »).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Contact, CrmStage } from "@/lib/sim/store";
import type { HistoryItem, Note } from "./shared";

export type ConsentKind = "marketing" | "transactional" | "data";

export interface CrmState {
  /** patchs par contact (stage, tags, score, consent…) */
  overrides: Record<string, Partial<Contact>>;
  /** contacts ajoutés (import CSV / nouveau) */
  extra: Contact[];
  /** ids supprimés */
  deleted: string[];
  /** consentements forcés */
  consents: Record<string, Partial<Record<ConsentKind, boolean>>>;
  /** notes ajoutées */
  notes: Record<string, Note[]>;
  /** journal d'activité additionnel (affiché en tête) */
  activity: Record<string, HistoryItem[]>;

  setStage: (id: string, stage: CrmStage) => void;
  setTags: (id: string, tags: string[]) => void;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  addContacts: (list: Contact[]) => void;
  deleteContacts: (ids: string[]) => void;
  setConsent: (id: string, kind: ConsentKind, granted: boolean) => void;
  addNote: (id: string, note: Note) => void;
  log: (id: string, item: Omit<HistoryItem, "id" | "at">) => void;
}

const nid = (_p: string) => crypto.randomUUID();

export const useCrm = create<CrmState>()(
  persist(
    (set) => ({
      overrides: {},
      extra: [],
      deleted: [],
      consents: {},
      notes: {},
      activity: {},

      setStage: (id, stage) =>
        set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], stage } } })),
      setTags: (id, tags) =>
        set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], tags } } })),
      updateContact: (id, patch) =>
        set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...patch } } })),
      addContacts: (list) => set((s) => ({ extra: [...list, ...s.extra] })),
      deleteContacts: (ids) =>
        set((s) => ({ deleted: Array.from(new Set([...s.deleted, ...ids])) })),
      setConsent: (id, kind, granted) =>
        set((s) => ({
          consents: { ...s.consents, [id]: { ...s.consents[id], [kind]: granted } },
          overrides: kind === "marketing"
            ? { ...s.overrides, [id]: { ...s.overrides[id], consent: granted } }
            : s.overrides,
        })),
      addNote: (id, note) =>
        set((s) => ({ notes: { ...s.notes, [id]: [note, ...(s.notes[id] ?? [])] } })),
      log: (id, item) =>
        set((s) => ({
          activity: {
            ...s.activity,
            [id]: [{ ...item, id: nid("hl"), at: Date.now() }, ...(s.activity[id] ?? [])].slice(0, 40),
          },
        })),
    }),
    {
      name: "mf:crm",
      version: 3,
      migrate: () => ({
        overrides: {},
        extra: [],
        deleted: [],
        consents: {},
        notes: {},
        activity: {},
      }),
    },
  ),
);

/** Fusionne les contacts de base (SimEngine) avec la surcouche CRM. */
export function mergeContacts(base: Contact[], s: Pick<CrmState, "overrides" | "extra" | "deleted">): Contact[] {
  const del = new Set(s.deleted);
  const merged = base
    .filter((c) => !del.has(c.id))
    .map((c) => (s.overrides[c.id] ? { ...c, ...s.overrides[c.id] } : c));
  const extra = s.extra.filter((c) => !del.has(c.id)).map((c) => (s.overrides[c.id] ? { ...c, ...s.overrides[c.id] } : c));
  return [...extra, ...merged];
}

/** Génère un id neuf pour un contact créé côté client. */
export function newContactId(): string {
  return nid("c_new");
}
