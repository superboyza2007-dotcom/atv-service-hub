export type QueueNameMember = { id: string; name: string };

const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");

export function resolveActiveMemberIdsByName(members: QueueNameMember[], activeNames: string[]) {
  const activeKeys = new Set(activeNames.map(normalizeName).filter(Boolean));
  return members.filter(member => activeKeys.has(normalizeName(member.name))).map(member => member.id);
}
