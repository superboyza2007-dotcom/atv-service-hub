import { describe, expect, it } from "vitest";
import { completedSessionFromRecord, mergeSharedSessions, patchSharedSession } from "./shared-session-sync";

type TestSession = {
  sessionId: string;
  status: "Standby" | "Active" | "Completed";
  completedAt?: string;
  completedByName?: string;
  activityLog?: Array<{ id: string; actorName: string; action: string; createdAt: string }>;
};

describe("shared session sync", () => {
  it("uses the terminal Completed record from another module over a stale Active record", () => {
    const local: TestSession[] = [{ sessionId: "M3-1", status: "Active" }];
    const remote: TestSession[] = [{
      sessionId: "M3-1",
      status: "Completed",
      completedAt: "2026-08-27T10:00:00.000Z",
      completedByName: "ช่างเอ",
      activityLog: [{ id: "a1", actorName: "ช่างเอ", action: "จบงาน → Completed", createdAt: "2026-08-27T10:00:00.000Z" }],
    }];

    expect(mergeSharedSessions(local, remote)[0]).toMatchObject({
      status: "Completed",
      completedByName: "ช่างเอ",
      completedAt: "2026-08-27T10:00:00.000Z",
    });
  });

  it("does not reopen a completed record when a stale device reports Active", () => {
    const local: TestSession[] = [{ sessionId: "M3-2", status: "Completed", completedAt: "2026-08-27T10:00:00.000Z", completedByName: "ช่างบี" }];
    const remote: TestSession[] = [{ sessionId: "M3-2", status: "Active" }];
    expect(mergeSharedSessions(local, remote)[0]).toMatchObject({ status: "Completed", completedByName: "ช่างบี" });
  });

  it("patches only the requested shared session and exposes the terminal record", () => {
    const sessions: TestSession[] = [
      { sessionId: "M3-3", status: "Active" },
      { sessionId: "M3-4", status: "Active" },
    ];
    const next = patchSharedSession(sessions, "M3-3", { status: "Completed", completedByName: "ผู้ดูแลและพัฒนาระบบ" });
    expect(next).toEqual([
      { sessionId: "M3-3", status: "Completed", completedByName: "ผู้ดูแลและพัฒนาระบบ" },
      { sessionId: "M3-4", status: "Active" },
    ]);
    expect(completedSessionFromRecord(next, "M3-3")?.completedByName).toBe("ผู้ดูแลและพัฒนาระบบ");
  });
});
