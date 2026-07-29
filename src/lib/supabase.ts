/**
 * supabase.ts — client Supabase + repli gracieux en mode démo local.
 *
 * L'app doit TOUJOURS fonctionner même si la base est inaccessible
 * (offline, clé invalide, réseau filtré) : chaque helper fait try/catch
 * et retourne null / false / [] en cas d'échec — jamais d'exception
 * non capturée. `isSupabaseReady()` ping la table promo_codes (select 1,
 * limit 1, timeout 4 s) et met le résultat en cache 60 s.
 */
import { useEffect, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://yifjcvwhmdycpsvldlzo.supabase.co";
export const SUPABASE_KEY = "sb_publishable_lvEqjzWwIWb-eLfLSGMUpg_S0NAKVxq";

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── Ping léger mis en cache (60 s) ────────────────────────────────────── */
const CACHE_TTL = 60_000;
const PING_TIMEOUT = 4_000;

let cached: { ok: boolean; at: number } | null = null;
let inflight: Promise<boolean> | null = null;

export async function isSupabaseReady(force = false): Promise<boolean> {
  try {
    if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached.ok;
    if (inflight) return await inflight;
    inflight = (async () => {
      try {
        const query = supabase.from("promo_codes").select("id").limit(1);
        const result = await Promise.race([
          query,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), PING_TIMEOUT),
          ),
        ]);
        const ok = !(result as { error?: unknown }).error;
        cached = { ok, at: Date.now() };
        return ok;
      } catch {
        cached = { ok: false, at: Date.now() };
        return false;
      } finally {
        inflight = null;
      }
    })();
    return await inflight;
  } catch {
    return false;
  }
}

/** Hook React : état de connexion Supabase (cache 60 s, non bloquant). */
export function useSupabaseStatus(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(cached ? cached.ok : null);
  useEffect(() => {
    let alive = true;
    void isSupabaseReady().then((ready) => {
      if (alive) setOk(ready);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

/* ── Types DB ──────────────────────────────────────────────────────────── */
export interface DbSignupRequest {
  id: string;
  business: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  plan: string | null;
  kind: string | null;
  message: string | null;
  status: string | null;
  reject_reason: string | null;
  created_at: string | null;
}

export interface DbPromoCode {
  id: string;
  code: string | null;
  kind: string | null;
  value: number | null;
  plan: string | null;
  max_uses: number | null;
  used: number | null;
  expires_at: string | null;
  active: boolean | null;
  created_at: string | null;
}

/* ── signup_requests ───────────────────────────────────────────────────── */
export async function fetchSignupRequests(): Promise<DbSignupRequest[] | null> {
  try {
    const { data, error } = await supabase
      .from("signup_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return null;
    return (data ?? []) as DbSignupRequest[];
  } catch {
    return null;
  }
}

export async function insertSignupRequest(row: {
  business: string;
  contact: string;
  email: string;
  phone?: string;
  country?: string;
  plan: string;
  kind: string;
  message: string;
  status?: string;
}): Promise<DbSignupRequest | null> {
  try {
    const { data, error } = await supabase
      .from("signup_requests")
      .insert({ ...row, status: row.status ?? "pending" })
      .select()
      .single();
    if (error) return null;
    return data as DbSignupRequest;
  } catch {
    return null;
  }
}

export async function updateSignupRequestStatus(
  id: string,
  status: "approved" | "rejected",
  rejectReason?: string,
): Promise<boolean> {
  try {
    const patch: Record<string, string> = { status };
    if (status === "rejected") patch.reject_reason = rejectReason ?? "";
    const { error } = await supabase.from("signup_requests").update(patch).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Recherche la demande d'inscription la plus récente pour un email.
 * Retourne la ligne, `null` si aucune, ou `"error"` si la base est
 * injoignable (le caller affiche alors un message de service indisponible).
 */
export async function lookupSignupRequest(
  email: string,
): Promise<DbSignupRequest | null | "error"> {
  try {
    const { data, error } = await supabase
      .from("signup_requests")
      .select("*")
      .ilike("email", email.trim())
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return "error";
    return ((data ?? [])[0] as DbSignupRequest | undefined) ?? null;
  } catch {
    return "error";
  }
}

/* ── organizations ─────────────────────────────────────────────────────── */
/** Slug dérivé du nom commercial (minuscules, tirets, sans accents). */
export function orgSlug(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritiques combinants U+0300–U+036F
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "org";
}

/** Crée l'organisation correspondant à une demande approuvée (best effort). */
export async function insertOrganization(row: {
  name: string;
  plan: string;
  status?: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase.from("organizations").insert({
      name: row.name,
      slug: orgSlug(row.name),
      plan: row.plan,
      status: row.status ?? "trial",
    });
    return !error;
  } catch {
    return false;
  }
}

/* ── promo_codes ───────────────────────────────────────────────────────── */
export async function fetchPromoCodes(): Promise<DbPromoCode[] | null> {
  try {
    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return null;
    return (data ?? []) as DbPromoCode[];
  } catch {
    return null;
  }
}

export async function insertPromoCode(row: {
  code: string;
  kind: string;
  value: number;
  plan: string | null;
  max_uses: number;
  used?: number;
  expires_at: string | null;
  active: boolean;
}): Promise<DbPromoCode | null> {
  try {
    const { data, error } = await supabase
      .from("promo_codes")
      .insert({ ...row, used: row.used ?? 0 })
      .select()
      .single();
    if (error) return null;
    return data as DbPromoCode;
  } catch {
    return null;
  }
}

export async function updatePromoCode(
  id: string,
  patch: { active?: boolean; used?: number },
): Promise<boolean> {
  try {
    const { error } = await supabase.from("promo_codes").update(patch).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function deletePromoCode(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("promo_codes").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
