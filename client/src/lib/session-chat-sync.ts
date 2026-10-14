export type SessionChatMessage = {
  id: string;
  sessionId: string;
  sender: string;
  text: string;
  createdAt: string;
};

export function normalizeSessionChatMessages(value: unknown): SessionChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SessionChatMessage => {
    if (!item || typeof item !== "object") return false;
    const message = item as Partial<SessionChatMessage>;
    return typeof message.id === "string" && typeof message.sessionId === "string" && typeof message.sender === "string" && typeof message.text === "string" && typeof message.createdAt === "string";
  });
}

export function mergeSessionChatMessages(...sources: unknown[][]): SessionChatMessage[] {
  const byId = new Map<string, SessionChatMessage>();
  for (const source of sources) {
    for (const message of normalizeSessionChatMessages(source)) {
      if (!byId.has(message.id)) byId.set(message.id, message);
    }
  }
  return Array.from(byId.values()).sort((left, right) => {
    const timeDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return Number.isFinite(timeDifference) && timeDifference !== 0 ? timeDifference : left.id.localeCompare(right.id);
  });
}
