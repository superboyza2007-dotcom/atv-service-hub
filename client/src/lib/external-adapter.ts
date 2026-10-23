/* Mission Control Dark-Glow: integration boundary stays data-first, read-only, and separate from Active UI. */
import type { ActiveRun, BoardMember } from "@/lib/queue-engine";

export type ExternalUser = {
  id: string;
  displayName: string;
  teamId?: string;
  shift?: string;
};

export type ExternalActiveSnapshot = {
  source: "external" | "local-preview";
  capturedAt: number;
  activeRuns: Array<Pick<ActiveRun, "id" | "memberIds" | "externalNames" | "units" | "mode" | "startedAt" | "durationSeconds">>;
};

export type ExternalDataProvider = {
  listUsers: () => Promise<ExternalUser[]>;
  readActive: () => Promise<ExternalActiveSnapshot>;
};

/**
 * Preview provider keeps the current app standalone. Replace only this provider
 * when the destination app exposes its real users/active API or shared store.
 */
export const createLocalPreviewProvider = (members: BoardMember[], activeRuns: ActiveRun[]): ExternalDataProvider => ({
  async listUsers() {
    return members.map((member) => ({ id: member.id, displayName: member.name, teamId: member.teamId, shift: member.shift }));
  },
  async readActive() {
    return { source: "local-preview", capturedAt: Date.now(), activeRuns: activeRuns.map(({ id, memberIds, externalNames, units, mode, startedAt, durationSeconds }) => ({ id, memberIds, externalNames, units, mode, startedAt, durationSeconds })) };
  },
});

export function usersToRegistrationOptions(users: ExternalUser[]): string[] {
  return Array.from(new Set(users.map((user) => user.displayName.trim()).filter(Boolean)));
}
