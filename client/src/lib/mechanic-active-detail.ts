export type MechanicActiveIdentity = { memberId?: string | number; group?: string; special?: boolean };
export type MechanicDirectoryMember = { id: string | number; name: string; code?: string };

export function mechanicSessionMemberNames(memberIds: Array<string | number> = [], directory: MechanicDirectoryMember[] = []) {
  return memberIds
    .map(String)
    .map(memberId => directory.find(user => String(user.id) === memberId || user.code?.trim().toLowerCase() === memberId.toLowerCase())?.name?.trim())
    .filter((name): name is string => Boolean(name));
}

export function mechanicSessionHref(sessionId: string) {
  return `/?module=mechanic&sessionId=${encodeURIComponent(sessionId)}`;
}

export function canMechanicManageSession(identity: MechanicActiveIdentity | undefined, memberIds: Array<string | number> = []) {
  if (!identity) return false;
  if (identity.special || identity.group?.includes("หัวหน้า")) return true;
  if (identity.memberId === undefined || identity.memberId === null) return false;
  return memberIds.map(String).includes(String(identity.memberId));
}
