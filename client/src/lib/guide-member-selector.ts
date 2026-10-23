export type SelectableGuideMember = { id: string; name: string };
export type CanonicalGuideDirectoryUser = { id: number; name: string; group?: string };
export type CanonicalGuideMember = { id: string; name: string; role: "Guide" | "Mechanic"; available: true };

/** Build Guide 2.1 choices only from the canonical Supervisor directory. */
export function guideMembersFromCanonicalDirectory(users: CanonicalGuideDirectoryUser[]): CanonicalGuideMember[] {
  return users
    .filter(user => user.group?.includes("ไกด์") || user.group?.includes("ช่าง"))
    .map(user => ({
      id: String(user.id),
      name: user.name.trim(),
      role: user.group?.includes("ช่าง") ? "Mechanic" as const : "Guide" as const,
      available: true as const,
    }))
    .filter(user => user.name.length > 0);
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
}

export function excludeCurrentGuideMember<T extends SelectableGuideMember>(
  members: T[],
  currentMemberId: string,
  activeUserId: string,
  activeUserName?: string,
): T[] {
  const ids = new Set([currentMemberId, activeUserId].filter(Boolean));
  const normalizedActiveName = activeUserName ? normalize(activeUserName) : "";
  return members.filter(member => {
    if (ids.has(member.id)) return false;
    if (normalizedActiveName && normalize(member.name) === normalizedActiveName) return false;
    return true;
  });
}

/**
 * Keep the live Run Queue order at the top of the 2.1 member selector. Members
 * absent from the queue remain available, but are deliberately placed after
 * the queued names so the operator can pick the front of the line quickly.
 */
export function sortGuideMembersByQueue<T extends SelectableGuideMember>(members: T[], standbyKeys: string[]): T[] {
  const normalizeKey = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
  const queueRank = new Map(standbyKeys.flatMap((key, index) => [[String(key), index], [normalizeKey(String(key)), index]]));
  return [...members].sort((left, right) => {
    const leftRank = queueRank.get(String(left.id)) ?? queueRank.get(normalizeKey(left.name));
    const rightRank = queueRank.get(String(right.id)) ?? queueRank.get(normalizeKey(right.name));
    if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
    if (leftRank !== undefined) return -1;
    if (rightRank !== undefined) return 1;
    return left.name.localeCompare(right.name, "th");
  });
}
