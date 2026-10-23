import type { SupervisorDirectoryUser } from "@/lib/supervisor-users";

export const ROUND_TABLE_USER_GROUPS = ["ไกด์", "ช่าง"] as const;
export type RoundTableUserGroup = (typeof ROUND_TABLE_USER_GROUPS)[number];
export type MechanicRoundTableUser = SupervisorDirectoryUser & { group: RoundTableUserGroup; code: string };

function normalizeGroup(group?: string): RoundTableUserGroup | undefined {
  if (group?.includes("ไกด์") || group?.toLowerCase().includes("guide")) return "ไกด์";
  if (group?.includes("ช่าง") || group?.toLowerCase().includes("mechanic")) return "ช่าง";
  return undefined;
}

export function filterMechanicRoundTableUsers(users: SupervisorDirectoryUser[]): MechanicRoundTableUser[] {
  const seen = new Set<string>();
  return users
    .map(user => {
      const group = normalizeGroup(user.group);
      const name = user.name?.trim();
      const code = user.code?.trim();
      // The server deliberately returns only hasCode, never the plaintext credential.
      if (!Number.isInteger(user.id) || !name || (!code && user.hasCode !== true) || !group) return undefined;
      return { ...user, name, code: code ?? "", group };
    })
    .filter((user): user is MechanicRoundTableUser => Boolean(user))
    .filter(user => {
      const identity = `${user.id}:${user.code.toLowerCase()}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
}

/** Supervisor uses the sanitized directory contract: hasCode proves eligibility without plaintext code. */
export function filterSupervisorRoundTableUsers(users: SupervisorDirectoryUser[]): MechanicRoundTableUser[] {
  const seen = new Set<number>();
  return users
    .map(user => {
      const group = normalizeGroup(user.group);
      const name = user.name?.trim();
      if (!Number.isInteger(user.id) || !name || user.hasCode !== true || !group) return undefined;
      return { ...user, name, group, code: user.code?.trim() ?? "" };
    })
    .filter((user): user is MechanicRoundTableUser => Boolean(user))
    .filter(user => {
      if (seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
}

export function getVisibleMechanicRoundTableUsers(users: SupervisorDirectoryUser[], loginKey?: string): MechanicRoundTableUser[] {
  const eligibleUsers = filterMechanicRoundTableUsers(users);
  const key = loginKey?.trim().toLowerCase();
  if (!key) return [];
  return eligibleUsers.filter(user => String(user.id) === key || user.code.toLowerCase() === key);
}

export function findMechanicRoundTableUser(users: SupervisorDirectoryUser[], loginKey?: string): MechanicRoundTableUser | undefined {
  return getVisibleMechanicRoundTableUsers(users, loginKey)[0];
}
