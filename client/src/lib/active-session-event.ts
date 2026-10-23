export type ActiveSessionEventSource = {
  sessionId: string;
  status: string;
  completedAt?: string;
  scheduledEndAt?: string;
};

/**
 * Builds a stable identity for the current Active snapshot.
 * When no session is active, include the latest terminal-session marker so an
 * initial empty board cannot deduplicate a later return-to-empty transition.
 */
export function activeSessionEventId(sessions: readonly ActiveSessionEventSource[]) {
  const activeIds = Array.from(new Set(
    sessions.filter((session) => session.status === "Active").map((session) => session.sessionId),
  )).sort();
  if (activeIds.length) return activeIds.join("|");

  const terminal = sessions
    .filter((session) => session.status === "Completed" || session.status === "TIME_EXPIRED")
    .slice()
    .sort((left, right) => {
      const leftTime = left.completedAt ?? left.scheduledEndAt ?? "";
      const rightTime = right.completedAt ?? right.scheduledEndAt ?? "";
      return leftTime.localeCompare(rightTime) || left.sessionId.localeCompare(right.sessionId);
    });
  const latest = terminal.at(-1);
  if (!latest) return "atv-empty";

  const terminalAt = latest.completedAt ?? latest.scheduledEndAt ?? "no-time";
  return `atv-terminal:${terminal.length}:${latest.sessionId}:${latest.status}:${terminalAt}`;
}
