import { useSim } from "@/lib/sim/store";

const SESSION_KEY = "mf:tenant-session";
const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 h

type TenantSession = {
  orgName: string;
  userName: string;
  exp: number;
};

function norm(value: string) {
  return value.trim().toLowerCase();
}

function writeTenantSession(orgName: string, userName: string): boolean {
  const session: TenantSession = {
    orgName: orgName.trim(),
    userName: userName.trim(),
    exp: Date.now() + SESSION_TTL,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    return false;
  }
  return true;
}

export function hasTenantWorkspace(): boolean {
  const state = useSim.getState();
  return !state.demoMode && Boolean(state.org.name.trim()) && Boolean(state.team[0]?.name?.trim());
}

export function tenantLogin(orgName: string, userName: string): boolean {
  if (!hasTenantWorkspace()) return false;

  const state = useSim.getState();
  const matchesOrg = norm(state.org.name) === norm(orgName);
  const matchesUser = norm(state.team[0]?.name ?? "") === norm(userName);

  if (!matchesOrg || !matchesUser) return false;
  return writeTenantSession(state.org.name, state.team[0]?.name ?? userName);
}

export function tenantStartSession(orgName: string, userName: string): boolean {
  return writeTenantSession(orgName, userName);
}

export function tenantSession(): TenantSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as TenantSession;
    if (!session.exp || session.exp < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (!hasTenantWorkspace()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function isTenantAuthed(): boolean {
  return tenantSession() !== null;
}

export function tenantLogout(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* stockage indisponible */
  }
}
