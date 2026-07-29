/**
 * owner.ts — authentification du propriétaire plateforme (Super Admin).
 *
 * Compte propriétaire unique (démo) : haitham.kalia@gmail.com.
 * La session est matérialisée par un jeton localStorage `mf:owner-session`
 * (valide 12 h). La console /admin est protégée par <RequireOwner/>.
 */

export const OWNER_EMAIL = "haitham.kalia@gmail.com";
const OWNER_PASSWORD = "54372272Hk";
const SESSION_KEY = "mf:owner-session";
const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 h

type OwnerSession = { email: string; exp: number };

export function ownerLogin(email: string, password: string): boolean {
  // Tolérant aux espaces parasites (copier-coller) et à la casse de l'email
  const ok =
    email.trim().toLowerCase() === OWNER_EMAIL &&
    password.trim() === OWNER_PASSWORD;
  if (!ok) return false;
  const session: OwnerSession = {
    email: OWNER_EMAIL,
    exp: Date.now() + SESSION_TTL,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* stockage indisponible */
  }
  return true;
}

export function ownerSession(): OwnerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as OwnerSession;
    if (!s.exp || s.exp < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function isOwnerAuthed(): boolean {
  return ownerSession() !== null;
}

export function ownerLogout(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* stockage indisponible */
  }
}
