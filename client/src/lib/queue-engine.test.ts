import { describe, expect, it } from "vitest";
import { completeRun, createQueueState, dispatch, eligibleFullTeams, planByRequiredPeople, planByRequiredUnits, queueSnapshot, snapshot, type BoardMember } from "./queue-engine";
import { expandActiveRunSelection, recordActive, recordActiveSessions } from "./mirror-engine";

const board: BoardMember[] = [
  { id: "a1", name: "A1", teamId: "T1", partnerId: "a2", shift: "08:00", boardOrder: 1, rounds: 2, role: "te" },
  { id: "a2", name: "A2", teamId: "T1", partnerId: "a1", shift: "08:00", boardOrder: 2, rounds: 2, role: "te" },
  { id: "b1", name: "B1", teamId: "T2", partnerId: "b2", shift: "09:00", boardOrder: 3, rounds: 1, role: "dp", underRound: true },
  { id: "b2", name: "B2", teamId: "T2", partnerId: "b1", shift: "09:00", boardOrder: 4, rounds: 2, role: "te" },
  { id: "c1", name: "C1", shift: "10:00", boardOrder: 5, rounds: 0, role: "floating" },
  { id: "d1", name: "D1", teamId: "T3", partnerId: "d2", shift: "10:00", boardOrder: 6, rounds: 3, role: "te" },
  { id: "d2", name: "D2", teamId: "T3", partnerId: "d1", shift: "10:00", boardOrder: 7, rounds: 3, role: "te" },
];

describe("mirror / record active", () => {
  it("records board-backed Active entries and ignores a repeated eventId", () => {
    const state = createQueueState(board);
    const first = recordActive(state, { eventId: "active-001", activeMemberIds: ["a1", "a2"], now: 100 });
    expect(first.error).toBeUndefined();
    expect(first.enteredIds).toEqual(["a1", "a2"]);
    expect(first.state.active[0]?.memberIds).toEqual(["a1", "a2"]);
    const repeated = recordActive(first.state, { eventId: "active-001", activeMemberIds: ["a1", "a2"], now: 110 });
    expect(repeated.ignored).toBe(true);
    expect(repeated.state.active).toHaveLength(1);
  });

  it("rejects unknown board members without mutating state", () => {
    const state = createQueueState(board);
    const result = recordActive(state, { eventId: "active-002", activeMemberIds: ["not-on-board"], now: 100 });
    expect(result.error).toContain("ไม่มีใน Team Board");
    expect(result.state.active).toHaveLength(0);
    expect(result.state.mirrorEventIds).toEqual([]);
  });

  it("completes a whole recorded run when it disappears from Active", () => {
    const state = createQueueState(board);
    const started = recordActive(state, { eventId: "active-003", activeMemberIds: ["a1", "a2"], now: 100 });
    const returned = recordActive(started.state, { eventId: "active-004", activeMemberIds: [], now: 200 });
    expect(returned.error).toBeUndefined();
    expect(returned.exitedRunIds).toEqual(["AR-001"]);
    expect(returned.state.active).toHaveLength(0);
    expect(returned.state.standby).toContain("a1");
    expect(returned.state.events.some((event) => event.code === "MIRROR_ACTIVE_RECORDED")).toBe(true);
  });

  it("expands one selected member to the complete Active run for UI reconciliation", () => {
    const state = createQueueState(board);
    const started = recordActive(state, { eventId: "active-005a", activeMemberIds: ["a1", "a2"], now: 100 });
    expect(expandActiveRunSelection(started.state, ["a1"])).toEqual(["a1", "a2"]);
  });

  it("rejects a partial disappearance of a multi-member Active run", () => {
    const state = createQueueState(board);
    const started = recordActive(state, { eventId: "active-005", activeMemberIds: ["a1", "a2"], now: 100 });
    const partial = recordActive(started.state, { eventId: "active-006", activeMemberIds: ["a1"], now: 200 });
    expect(partial.error).toContain("แยก Active บางส่วน");
    expect(partial.state.active[0]?.memberIds).toEqual(["a1", "a2"]);
  });

  it("keeps a full-plus-fraction Active Return selection of three members as one run", () => {
    const state = createQueueState(board);
    const returned = recordActive(state, { eventId: "active-007", activeMemberIds: ["a1", "a2", "b1"], now: 100 });
    expect(returned.error).toBeUndefined();
    expect(returned.state.active).toHaveLength(1);
    expect(returned.state.active[0]?.memberIds).toEqual(["a1", "a2", "b1"]);
    expect(returned.state.active[0]?.memberUnits).toEqual({ a1: 1, a2: 1, b1: 0.5 });
  });

  it("merges two existing AR records when three selected members came from one full-plus-fraction command", () => {
    const state = createQueueState(board);
    const first = recordActive(state, { eventId: "active-008a", activeMemberIds: ["a1", "a2"], now: 100 });
    expect(first.error).toBeUndefined();
    const second = recordActive(first.state, { eventId: "active-008b", activeMemberIds: ["a1", "a2", "b1"], now: 110 });
    expect(second.error).toBeUndefined();
    expect(second.state.active).toHaveLength(1);
    expect(second.state.active[0]?.memberIds).toEqual(["a1", "a2", "b1"]);
    expect(second.state.active[0]?.memberUnits).toEqual({ a1: 1, a2: 1, b1: 0.5 });
    expect(second.state.events.some((event) => event.code === "MIRROR_ACTIVE_MERGED")).toBe(true);
  });

  it("keeps two canonical Active Sessions as two separate AR runs", () => {
    const state = createQueueState(board);
    const result = recordActiveSessions(state, {
      eventId: "sessions-001",
      sessions: [
        { sessionId: "S-001", memberIds: ["a1", "a2"], startedAt: 100, durationSeconds: 1800 },
        { sessionId: "S-002", memberIds: ["d1", "d2"], startedAt: 200, durationSeconds: 3600 },
      ],
      now: 300,
    });
    expect(result.error).toBeUndefined();
    expect(result.state.active).toHaveLength(2);
    expect(result.state.active.map(run => ({ id: run.id, sourceSessionId: run.sourceSessionId, memberIds: run.memberIds }))).toEqual([
      { id: "AR-S-001", sourceSessionId: "S-001", memberIds: ["a1", "a2"] },
      { id: "AR-S-002", sourceSessionId: "S-002", memberIds: ["d1", "d2"] },
    ]);
  });

  it("returns only the members of the Session that disappeared from Active", () => {
    const state = createQueueState(board);
    const started = recordActiveSessions(state, {
      eventId: "sessions-002",
      sessions: [
        { sessionId: "S-001", memberIds: ["a1", "a2"], startedAt: 100, durationSeconds: 1800 },
        { sessionId: "S-002", memberIds: ["d1", "d2"], startedAt: 200, durationSeconds: 3600 },
      ],
      now: 300,
    });
    const returned = recordActiveSessions(started.state, {
      eventId: "sessions-003",
      sessions: [{ sessionId: "S-002", memberIds: ["d1", "d2"], startedAt: 200, durationSeconds: 3600 }],
      now: 500,
    });
    expect(returned.error).toBeUndefined();
    expect(returned.exitedRunIds).toEqual(["AR-S-001"]);
    expect(returned.state.active.map(run => run.sourceSessionId)).toEqual(["S-002"]);
    expect(returned.state.standby).toContain("a1");
    expect(returned.state.standby).toContain("a2");
    expect(returned.state.standby).not.toContain("d1");
    expect(returned.state.standby).not.toContain("d2");
  });

  it("rebuilds one legacy merged AR into separate session-owned runs", () => {
    const legacy = recordActive(createQueueState(board), {
      eventId: "legacy-merged",
      activeMemberIds: ["a1", "a2", "d1", "d2"],
      now: 100,
    });
    expect(legacy.state.active).toHaveLength(1);
    const rebuilt = recordActiveSessions(legacy.state, {
      eventId: "sessions-004",
      sessions: [
        { sessionId: "S-001", memberIds: ["a1", "a2"], startedAt: 100, durationSeconds: 1800 },
        { sessionId: "S-002", memberIds: ["d1", "d2"], startedAt: 200, durationSeconds: 1800 },
      ],
      now: 300,
    });
    expect(rebuilt.error).toBeUndefined();
    expect(rebuilt.state.active.map(run => run.sourceSessionId)).toEqual(["S-001", "S-002"]);
  });
});

describe("queue engine: definitions and priority", () => {
  it("does not treat floating member as Dp or a full team", () => {
    const state = createQueueState(board);
    expect(state.members.c1.role).toBe("floating");
    expect(eligibleFullTeams(state).flat()).not.toContain("c1");
  });

  it("selects Dp first for a 0.5 job", () => {
    const state = createQueueState(board);
    const plan = planByRequiredPeople(state, 1);
    expect(plan).toMatchObject({ memberIds: ["b1"], units: 0.5, mode: "normal" });
  });

  it("maps 2R–4R to one complete team", () => {
    const state = createQueueState(board);
    expect(planByRequiredPeople(state, 2)).toMatchObject({ memberIds: ["a1", "a2"], units: 1 });
    expect(planByRequiredPeople(state, 4)).toMatchObject({ memberIds: ["a1", "a2", "d1", "d2"], units: 1 });
  });

  it("maps 5R to one complete team plus one fractional member", () => {
    const state = createQueueState(board);
    const plan = planByRequiredPeople(state, 3);
    expect(plan).toMatchObject({ memberIds: ["a1", "a2", "b1"], units: 1 });
    expect((plan as any).reason).toContain("ทีมเต็มก่อน");
  });

  it("allows a full 1.0 dispatch for a complete pair even when both retain _", () => {
    const state = createQueueState(board);
    state.members.b1.role = "te";
    state.members.b1.underRound = true;
    state.members.b2.underRound = true;
    const result = dispatch(state, { memberIds: ["b1", "b2"], units: 1, now: 100 });
    expect(result.error).toBeUndefined();
    expect(result.run?.memberIds).toEqual(["b1", "b2"]);
  });

  it("plans 1.5 as full team first, then split only when no Dp or floating exists", () => {
    const noSpecial = board.map((member) => member.id === "b1" || member.id === "c1" ? { ...member, role: "te" as const, underRound: false } : member);
    const state = createQueueState(noSpecial);
    const plan = planByRequiredPeople(state, 3);
    expect(plan).toMatchObject({ memberIds: ["a1", "a2", "b1"], mode: "mixed", units: 1, splitMemberId: "b1" });
    const result = dispatch(state, { ...plan, now: 100 } as any);
    expect(result.error).toBeUndefined();
    expect(result.state.members.b1.role).toBe("wk");
    expect(result.state.members.b2.role).toBe("dp");
    expect(result.state.active[0].memberIds).toEqual(["a1", "a2", "b1"]);
    const finished = completeRun(result.state, result.run!.id, 200);
    expect(finished.state.members.b1.role).toBe("wk");
    expect(finished.state.members.b2.role).toBe("dp");
    expect(finished.state.standby).toContain("a1");
    expect(finished.state.standby).toContain("a2");
    expect(finished.state.events.some((event) => event.code === "QV_WARP")).toBe(true);
  });

  it("supports the >=6R standard and the operator's 1.5-team adjustment", () => {
    const state = createQueueState(board);
    expect(planByRequiredPeople(state, 4)).toMatchObject({ memberIds: ["a1", "a2", "d1", "d2"], units: 1 });
    expect(planByRequiredPeople(state, 3)).toMatchObject({ memberIds: ["a1", "a2", "b1"], units: 1 });
  });

  it("falls back to split pair creation when no Dp or floating member is available", () => {
    const noSpecial = board.map((member) => member.id === "b1" || member.id === "c1" || member.id === "m10" ? { ...member, role: "te" as const, underRound: false } : member);
    const state = createQueueState(noSpecial);
    const plan = planByRequiredPeople(state, 1);
    expect(plan).toMatchObject({ memberIds: ["a1"], units: 1, mode: "split" });
  });

  it("falls back to floating when no Dp exists", () => {
    const state = createQueueState(board.map((member) => member.id === "b1" ? { ...member, role: "te", underRound: false } : member));
    const plan = planByRequiredPeople(state, 1);
    expect(plan).toMatchObject({ memberIds: ["c1"], units: 0.5 });
  });

  it("prioritizes a normal full team over an earlier under-round full pair for mixed work", () => {
    const input = board.map((member) => member.id === "a1" || member.id === "a2" ? { ...member, underRound: true } : member);
    const state = createQueueState(input);
    const plan = planByRequiredPeople(state, 3);
    expect(plan).toMatchObject({ memberIds: ["d1", "d2", "b1"], mode: "normal", units: 1 });
  });

  it("rejects mixed dispatch when its full portion contains `_`", () => {
    const input = board.map((member) => member.id === "a1" || member.id === "a2" ? { ...member, underRound: true } : member);
    const state = createQueueState(input);
    const result = dispatch(state, { memberIds: ["a1", "a2", "d1"], units: 1, mode: "mixed", splitMemberId: "d1", now: 100 });
    expect(result.error).toContain("สถานะปกติ (-)");
  });

  it("does not allow a normal Te without `_` to claim a 0.5 compensation", () => {
    const state = createQueueState(board);
    const result = dispatch(state, { memberIds: ["a1"], units: 0.5, now: 100 });
    expect(result.error).toContain("Dp/Te ที่ยังติด _");
    expect(result.state.members.a1.underRound).toBeUndefined();
  });

});

describe("queue engine: split and Qv lifecycle", () => {
  it("creates Wk, Dp and Qv only from a split", () => {
    const state = createQueueState(board);
    const result = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    expect(result.error).toBeUndefined();
    expect(result.state.members.a1.role).toBe("wk");
    expect(result.state.members.a2.role).toBe("dp");
    expect(result.state.standby.at(-1)).toBe("a2");
    expect(Object.keys(result.state.qv)).toHaveLength(1);
    expect(result.state.events.some((event) => event.code === "SPLIT_PAIR")).toBe(true);
  });

  it("claims one compensation event only once", () => {
    const state = createQueueState(board);
    const first = dispatch(state, { memberIds: ["b1"], units: 0.5, compensationEventId: "EV-001", now: 100 });
    expect(first.error).toBeUndefined();
    const second = dispatch(first.state, { memberIds: ["c1"], units: 0.5, compensationEventId: "EV-001", now: 110 });
    expect(second.error).toContain("ถูกใช้สิทธิ์ไปแล้ว");
    expect(second.state.active).toHaveLength(1);
    expect(second.state.compensatedEventIds).toEqual(["EV-001"]);
  });

  it("allows the linked Qv pair to run full before Qv ends and preserves _", () => {
    const state = createQueueState(board);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const returned = completeRun(split.state, split.run!.id, 110);
    const full = dispatch(returned.state, { memberIds: ["a1", "a2"], units: 1, now: 120 });
    expect(full.error).toBeUndefined();
    expect(full.state.events.some((event) => event.code === "QV_FULL_TEAM")).toBe(true);
    expect(full.state.members.a1.role).toBe("wk");
    expect(full.state.members.a2.role).toBe("dp");
    expect(full.state.members.a1.underRound).toBeFalsy();
    expect(full.state.members.a2.underRound).toBe(true);
    expect(full.state.qv["QV-001"].status).toBe("broken");
    const done = completeRun(full.state, full.run!.id, 130);
    expect(done.state.members.a1.role).toBe("wk");
    expect(done.state.members.a2.role).toBe("dp");
    expect(done.state.members.a1.underRound).toBeFalsy();
    expect(done.state.members.a2.underRound).toBe(true);
    expect(done.state.standby.slice(-2)).toEqual(["a1", "a2"]);
  });

  it("runs the user-locked 0.5 Wk return and Qv warp contract", () => {
    const state = createQueueState(board);
    const started = dispatch(state, { memberIds: ["a1"], units: 0.5, mode: "split", now: 100 });
    expect(started.error).toBeUndefined();
    expect(started.run?.units).toBe(0.5);
    expect(started.state.members.a1.role).toBe("wk");
    expect(started.state.members.a2.role).toBe("dp");
    expect(started.state.members.a2.underRound).toBe(true);
    expect(started.state.standby.at(-1)).toBe("a2");

    const returned = completeRun(started.state, started.run!.id, 200);
    expect(returned.error).toBeUndefined();
    expect(returned.state.members.a1.role).toBe("wk");
    expect(returned.state.members.a2.role).toBe("dp");
    expect(returned.state.members.a2.underRound).toBe(true);
    expect(returned.state.qv["QV-001"].status).toBe("linked");
    expect(returned.state.events.find((event) => event.code === "QV_WARP")?.memberIds).toEqual(["a1", "a2"]);
    expect(returned.state.standby.indexOf("a1")).toBeGreaterThan(returned.state.standby.indexOf("a2"));
    expect(returned.state.members.a1.role).not.toBe("ql");
    expect(returned.state.members.a2.role).not.toBe("qf");
  });

  it("returns a Wk and preserves Qv warp position", () => {
    const state = createQueueState(board);
    const started = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const completed = completeRun(started.state, started.run!.id, 200);
    expect(completed.state.members.a1.role).toBe("wk");
    expect(completed.state.standby.indexOf("a1")).toBeGreaterThan(completed.state.standby.indexOf("a2"));
    expect(completed.state.qv["QV-001"].status).toBe("linked");
    expect(completed.state.events.some((event) => event.code === "QV_WARP")).toBe(true);
  });

  it("breaks Qv when Dp is pulled while Wk is active", () => {
    const state = createQueueState(board);
    const wk = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const dp = dispatch(wk.state, { memberIds: ["a2"], units: 0.5, now: 110 });
    expect(dp.state.qv["QV-001"].status).toBe("broken");
    expect(dp.state.members.a1.role).toBe("ql");
    expect(dp.state.events.some((event) => event.code === "QV_BROKEN")).toBe(true);
  });

  it("does not return external helpers to standby", () => {
    const state = createQueueState(board);
    const started = dispatch(state, { memberIds: ["c1"], externalNames: ["ช่างซ่อมรถ"], units: 0.5, now: 100 });
    const finished = completeRun(started.state, started.run!.id, 200);
    expect(finished.state.standby).toContain("c1");
    expect(finished.state.members).not.toHaveProperty("ช่างซ่อมรถ");
    expect(finished.state.events.some((event) => event.code === "RETURN_STANDBY")).toBe(true);
  });

  it("rejects duplicate dispatch and invalid full team selection", () => {
    const state = createQueueState(board);
    const started = dispatch(state, { memberIds: ["a1", "a2"], units: 1, now: 100 });
    const duplicate = dispatch(started.state, { memberIds: ["a1"], units: 0.5, now: 110 });
    const underTeam = dispatch(state, { memberIds: ["b1", "b2"], units: 1, now: 120 });
    expect(duplicate.error).toContain("ไม่อยู่ใน Standby");
    expect(underTeam.error).toContain("สถานะปกติ");
  });

  it("does not merge QF while its _ status is still present", () => {
    const state = createQueueState(board);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const half = dispatch(split.state, { memberIds: ["a2"], units: 0.5, now: 110 });
    const qfFirst = completeRun(half.state, half.run!.id, 120);
    expect(qfFirst.state.members.a2.role).toBe("qf");
    qfFirst.state.members.a2.underRound = true;
    const qlLater = completeRun(qfFirst.state, split.run!.id, 130);
    expect(qlLater.state.members.a1.role).toBe("ql");
    expect(qlLater.state.members.a2.role).toBe("qf");
    expect(qlLater.state.events.some((event) => event.code === "QF_JOIN_QL")).toBe(false);
  });

  it("keeps QF waiting when QF returns before QL", () => {
    const state = createQueueState(board);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const half = dispatch(split.state, { memberIds: ["a2"], units: 0.5, now: 110 });
    const qfFirst = completeRun(half.state, half.run!.id, 120);
    expect(qfFirst.state.members.a2.role).toBe("qf");
    expect(qfFirst.state.events.some((event) => event.code === "QF_JOIN_QL")).toBe(false);
    const qfSelfDispatch = dispatch(qfFirst.state, { memberIds: ["a2"], units: 0.5, now: 125 });
    expect(qfSelfDispatch.error).toContain("QL/QF ไม่มีสิทธิ์");
    const qlLater = completeRun(qfFirst.state, split.run!.id, 130);
    expect(qlLater.state.members.a1.role).toBe("te");
    expect(qlLater.state.members.a2.role).toBe("te");
    expect(qlLater.state.events.some((event) => event.code === "QF_JOIN_QL")).toBe(true);
  });

  it("joins QF immediately when QL has already returned", () => {
    const state = createQueueState(board);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const half = dispatch(split.state, { memberIds: ["a2"], units: 0.5, now: 110 });
    const qlFirst = completeRun(half.state, split.run!.id, 120);
    expect(qlFirst.state.members.a1.role).toBe("ql");
    const qfLater = completeRun(qlFirst.state, half.run!.id, 130);
    expect(qfLater.state.members.a1.role).toBe("te");
    expect(qfLater.state.members.a2.role).toBe("te");
    expect(qfLater.state.events.some((event) => event.code === "QF_JOIN_QL")).toBe(true);
    const nextFull = dispatch(qfLater.state, { memberIds: ["a1", "a2"], units: 1, now: 140 });
    expect(nextFull.error).toBeUndefined();
    expect(nextFull.run?.memberIds).toEqual(["a1", "a2"]);
  });

  it("rolls Wk back to the exact post-warp anchor when Dp is pulled in the first round", () => {
    const state = createQueueState(board);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const wkReturned = completeRun(split.state, split.run!.id, 110);
    const anchorIndex = wkReturned.state.standby.indexOf("a1");
    expect(anchorIndex).toBe(wkReturned.state.standby.indexOf("a2") + 1);
    const dpPulled = dispatch(wkReturned.state, { memberIds: ["a2"], units: 0.5, now: 120 });
    expect(dpPulled.error).toBeUndefined();
    expect(dpPulled.state.standby).toEqual(["b1", "b2", "c1", "d1", "d2", "a1"]);
    expect(dpPulled.state.events.some((event) => event.code === "QV_ROLLBACK" && event.memberIds?.includes("a1"))).toBe(true);
    expect(dpPulled.state.members.a1.role).toBe("te");
    expect(dpPulled.state.members.a2.role).toBe("te");
    expect(dpPulled.state.members.a2.underRound).toBe(true);
    expect(dpPulled.state.events.some((event) => event.code === "QV_BROKEN" && event.message.includes("เปลี่ยนเป็น Te ทันที") && event.message.includes("ไม่สร้าง QL/QF"))).toBe(true);
  });

  it("warps Wk back past every Te queue it crossed when Dp collects 0.5", () => {
    const state = createQueueState(board);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    expect(split.error).toBeUndefined();
    const full = dispatch(split.state, { memberIds: ["d1", "d2"], units: 1, now: 105 });
    expect(full.error).toBeUndefined();
    const fullReturned = completeRun(full.state, full.run!.id, 110);
    const wkReturned = completeRun(fullReturned.state, split.run!.id, 120);
    expect(wkReturned.state.standby).toEqual(["b1", "b2", "c1", "a2", "a1", "d1", "d2"]);
    const dp = dispatch(wkReturned.state, { memberIds: ["a2"], units: 0.5, now: 130 });
    expect(dp.error).toBeUndefined();
    expect(dp.state.standby).toEqual(["b1", "b2", "c1", "d1", "d2", "a1"]);
    expect(dp.state.events.some((event) => event.code === "QV_ROLLBACK" && event.message.includes("ข้ามกลับ 2 คิว"))).toBe(true);
    expect(dp.state.members.a1.role).toBe("te");
    expect(dp.state.members.a2.role).toBe("te");
    expect(dp.state.members.a2.underRound).toBe(true);
  });

  it("keeps post-warp rollback separate from airborne QL/QF reunion", () => {
    const state = createQueueState(board);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const wkReturned = completeRun(split.state, split.run!.id, 110);
    const dpPulled = dispatch(wkReturned.state, { memberIds: ["a2"], units: 0.5, now: 120 });
    expect(dpPulled.error).toBeUndefined();
    expect(dpPulled.state.members.a1.role).toBe("te");
    expect(dpPulled.state.members.a2.role).toBe("te");
    expect(dpPulled.state.members.a2.underRound).toBe(true);
    const dpReturned = completeRun(dpPulled.state, dpPulled.run!.id, 130);
    expect(dpReturned.state.members.a1.role).toBe("te");
    expect(dpReturned.state.members.a2.role).toBe("te");
    expect(dpReturned.state.members.a2.underRound).toBe(false);
    expect(dpReturned.state.events.some((event) => event.code === "QF_JOIN_QL")).toBe(false);
  });

  it("keeps the representative in place while Dp collects after a full-before-Qv return", () => {
    const state = createQueueState(board);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const wkReturned = completeRun(split.state, split.run!.id, 110);
    const full = dispatch(wkReturned.state, { memberIds: ["a1", "a2"], units: 1, now: 120 });
    const fullReturned = completeRun(full.state, full.run!.id, 130);
    const a1Index = fullReturned.state.standby.indexOf("a1");
    const dpPulled = dispatch(fullReturned.state, { memberIds: ["a2"], units: 0.5, now: 140 });
    expect(dpPulled.error).toBeUndefined();
    expect(dpPulled.state.standby.indexOf("a1")).toBe(a1Index);
    const dpReturned = completeRun(dpPulled.state, dpPulled.run!.id, 150);
    expect(dpReturned.state.members.a2.underRound).toBe(false);
    expect(dpReturned.state.members.a1.role).toBe("te");
    expect(dpReturned.state.members.a2.role).toBe("te");
  });

  it("rolls B.Por back to its pre-warp position after B.Boy collects 0.5", () => {
    const exampleBoard: BoardMember[] = [
      { id: "nai", name: "A Nai", teamId: "TA", partnerId: "oud", shift: "08:00", boardOrder: 1, rounds: 0, role: "te" },
      { id: "oud", name: "A Oud", teamId: "TA", partnerId: "nai", shift: "08:00", boardOrder: 2, rounds: 0, role: "te" },
      { id: "boy", name: "B Boy", teamId: "TB", partnerId: "por", shift: "09:00", boardOrder: 3, rounds: 0, role: "te" },
      { id: "por", name: "B Por", teamId: "TB", partnerId: "boy", shift: "09:00", boardOrder: 4, rounds: 0, role: "te" },
      { id: "bas", name: "C Bas", teamId: "TC", partnerId: "golf", shift: "10:00", boardOrder: 5, rounds: 0, role: "te" },
      { id: "golf", name: "C Golf", teamId: "TC", partnerId: "bas", shift: "10:00", boardOrder: 6, rounds: 0, role: "te" },
    ];
    const state = createQueueState(exampleBoard);
    const started = dispatch(state, { memberIds: ["nai", "oud", "por"], units: 1, mode: "mixed", splitMemberId: "por", memberUnits: { nai: 1, oud: 1, por: 1 }, now: 100 });
    expect(started.error).toBeUndefined();
    const returned = completeRun(started.state, started.run!.id, 110);
    expect(returned.error).toBeUndefined();
    expect(returned.state.standby.map((id) => returned.state.members[id].name)).toEqual(["C Bas", "C Golf", "B Boy", "B Por", "A Nai", "A Oud"]);
    const preWarpQueue = [...returned.state.standby];
    expect(preWarpQueue).toEqual(["bas", "golf", "boy", "por", "nai", "oud"]);
    const collected = dispatch(returned.state, { memberIds: ["boy"], units: 0.5, now: 120 });
    expect(collected.error).toBeUndefined();
    expect(collected.state.standby.map((id) => collected.state.members[id].name)).toEqual(["C Bas", "C Golf", "A Nai", "A Oud", "B Por"]);
    expect(collected.state.standby.indexOf("por")).toBe(4);
    expect(collected.state.members.boy.role).toBe("te");
    expect(collected.state.members.por.role).toBe("te");
    expect(collected.state.events.some((event) => event.code === "QV_ROLLBACK" && event.memberIds?.includes("por"))).toBe(true);
  });

  it("starts a new Wk/Dp/Qv cycle when the representative splits again", () => {
    const state = createQueueState(board);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const wkReturned = completeRun(split.state, split.run!.id, 110);
    const full = dispatch(wkReturned.state, { memberIds: ["a1", "a2"], units: 1, now: 120 });
    const fullReturned = completeRun(full.state, full.run!.id, 130);
    const dpPulled = dispatch(fullReturned.state, { memberIds: ["a2"], units: 0.5, now: 140 });
    const dpReturned = completeRun(dpPulled.state, dpPulled.run!.id, 150);
    const newSplit = dispatch(dpReturned.state, { memberIds: ["a1"], units: 1, mode: "split", now: 160 });
    expect(newSplit.error).toBeUndefined();
    expect(newSplit.state.members.a1.role).toBe("wk");
    expect(newSplit.state.members.a2.role).toBe("dp");
    expect(newSplit.state.members.a1.qvId).toBe("QV-002");
    expect(newSplit.state.qv["QV-002"].wkId).toBe("a1");
    expect(newSplit.state.qv["QV-002"].dpId).toBe("a2");
  });

  it("runs the declared Te → Wk/Dp → QL/QF → Te lifecycle as one deterministic queue scenario", () => {
    const state = createQueueState(board);

    // 1) Te A is split only because the scenario explicitly requests a split.
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    expect(split.error).toBeUndefined();
    expect(split.state.members.a1.role).toBe("wk");
    expect(split.state.members.a2.role).toBe("dp");
    expect(split.state.members.a2.underRound).toBe(true);
    expect(split.state.standby.at(-1)).toBe("a2");
    expect(Object.values(split.state.qv)).toHaveLength(1);

    // 2) Dp is pulled while Wk is still Active: the original Qv breaks in-air.
    const dpPulled = dispatch(split.state, { memberIds: ["a2"], units: 0.5, now: 120 });
    expect(dpPulled.error).toBeUndefined();
    expect(dpPulled.state.members.a1.role).toBe("ql");
    expect(dpPulled.state.members.a2.role).toBe("qf");
    expect(dpPulled.state.qv["QV-001"].status).toBe("broken");
    expect(dpPulled.state.events.some((event) => event.code === "QV_BROKEN")).toBe(true);

    // 3) QF returns first: it must wait off-board until QL returns.
    const qfReturned = completeRun(dpPulled.state, dpPulled.run!.id, 130);
    expect(qfReturned.state.members.a2.role).toBe("qf");
    expect(qfReturned.state.members.a2.underRound).toBe(false);
    expect(qfReturned.state.standby).not.toContain("a2");
    expect(queueSnapshot(qfReturned.state).find((entry) => entry.memberIds.includes("a2"))?.state).toBe("waiting");

    // 4) QL returns, reserves the real queue position, and QF joins it.
    const reunited = completeRun(qfReturned.state, split.run!.id, 140);
    expect(reunited.state.members.a1.role).toBe("te");
    expect(reunited.state.members.a2.role).toBe("te");
    expect(reunited.state.members.a1.underRound).not.toBe(true);
    expect(reunited.state.members.a2.underRound).not.toBe(true);
    expect(reunited.state.events.some((event) => event.code === "QF_JOIN_QL")).toBe(true);
    // QF_JOIN_QL closes the old Qv relationship; the engine records that as broken.
    expect(reunited.state.qv["QV-001"].status).toBe("broken");

    // 5) A floating member is never converted into Dp/QL/QF by this lifecycle.
    expect(reunited.state.members.c1.role).toBe("floating");
    expect(reunited.state.members.c1.qvId).toBeUndefined();

    // 6) After reunion, the pair can run as a normal full Te again.
    const nextFull = dispatch(reunited.state, { memberIds: ["a1", "a2"], units: 1, now: 150 });
    expect(nextFull.error).toBeUndefined();
    const nextFullReturned = completeRun(nextFull.state, nextFull.run!.id, 160);
    expect(nextFullReturned.state.members.a1.role).toBe("te");
    expect(nextFullReturned.state.members.a2.role).toBe("te");
    expect(nextFullReturned.state.active).toHaveLength(0);
  });

  it("keeps an auditable snapshot after a normal full-team return", () => {
    const state = createQueueState(board);
    const started = dispatch(state, { memberIds: ["a1", "a2"], units: 1, now: 100 });
    const finished = completeRun(started.state, started.run!.id, 200);
    expect(snapshot(finished.state).active).toEqual([]);
    expect(finished.state.standby.slice(-2)).toEqual(["a1", "a2"]);
  });
});

describe("queue board snapshot", () => {
  it("groups a standby Te pair into one queue entry with two members", () => {
    const entries = queueSnapshot(createQueueState(board));
    expect(entries[0].memberNames).toEqual(["A1", "A2"]);
    expect(entries[0].position).toBe(1);
    expect(entries[0].state).toBe("standby");
  });

  it("moves the selected team to active and exposes the next team as queue 01", () => {
    const state = createQueueState(board);
    const result = dispatch(state, { memberIds: ["a1", "a2"], units: 1, now: 100 });
    expect(result.error).toBeUndefined();
    const entries = queueSnapshot(result.state);
    expect(entries[0].state).toBe("active");
    expect(entries[0].memberNames).toEqual(["A1", "A2"]);
    expect(entries[1].position).toBe(1);
  });
});


describe("queue engine: airborne Qv branch", () => {
  it("keeps QF off-board when QF finishes before the active QL", () => {
    const state = createQueueState(board);
    const wkRun = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const dpRun = dispatch(wkRun.state, { memberIds: ["a2"], units: 0.5, now: 110 });
    expect(dpRun.state.members.a1.role).toBe("ql");
    expect(dpRun.state.members.a2.role).toBe("qf");
    const qfFirst = completeRun(dpRun.state, dpRun.run!.id, 120);
    expect(qfFirst.state.standby).not.toContain("a2");
    expect(queueSnapshot(qfFirst.state).find((entry) => entry.memberIds.includes("a2"))?.state).toBe("waiting");
    const qlLater = completeRun(qfFirst.state, wkRun.run!.id, 130);
    expect(qlLater.state.members.a1.role).toBe("te");
    expect(qlLater.state.members.a2.role).toBe("te");
    expect(qlLater.state.standby).toContain("a1");
    expect(qlLater.state.standby).toContain("a2");
    expect(qlLater.state.events.some((event) => event.code === "QF_JOIN_QL")).toBe(true);
  });

  it("lets QL reserve the queue when QL finishes before QF, then joins QF at that slot", () => {
    const state = createQueueState(board);
    const wkRun = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const dpRun = dispatch(wkRun.state, { memberIds: ["a2"], units: 0.5, now: 110 });
    const qlFirst = completeRun(dpRun.state, wkRun.run!.id, 120);
    expect(qlFirst.state.members.a1.role).toBe("ql");
    const qlIndex = qlFirst.state.standby.indexOf("a1");
    expect(qlIndex).toBeGreaterThanOrEqual(0);
    const qfLater = completeRun(qlFirst.state, dpRun.run!.id, 130);
    expect(qfLater.state.members.a1.role).toBe("te");
    expect(qfLater.state.members.a2.role).toBe("te");
    expect(qfLater.state.standby.indexOf("a1")).toBe(qlIndex);
    expect(qfLater.state.standby.indexOf("a2")).toBe(qlIndex + 1);
    expect(qfLater.state.events.some((event) => event.code === "QF_JOIN_QL")).toBe(true);
  });

  it("labels the airborne Qv run and off-board QF in the queue snapshot", () => {
    const state = createQueueState(board);
    const wkRun = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const dpRun = dispatch(wkRun.state, { memberIds: ["a2"], units: 0.5, now: 110 });
    const entries = queueSnapshot(dpRun.state);
    expect(entries.find((entry) => entry.runId === wkRun.run!.id)?.reason).toContain("airborne Qv");
    expect(entries.find((entry) => entry.runId === dpRun.run!.id)?.reason).toContain("airborne Qv");
  });
});



describe("queue engine: fractional team expansion", () => {
  const fractionalBoard: BoardMember[] = [
    ...Array.from({ length: 6 }, (_, index) => {
      const teamNo = index + 1;
      const firstId = `f${teamNo}a`;
      const secondId = `f${teamNo}b`;
      return [
        { id: firstId, name: `F${teamNo}A`, teamId: `FT${teamNo}`, partnerId: secondId, shift: `${String(8 + index).padStart(2, "0")}:00`, boardOrder: index * 2 + 1, rounds: 0, role: "te" as const },
        { id: secondId, name: `F${teamNo}B`, teamId: `FT${teamNo}`, partnerId: firstId, shift: `${String(8 + index).padStart(2, "0")}:00`, boardOrder: index * 2 + 2, rounds: 0, role: "te" as const },
      ];
    }).flat(),
    { id: "fractional-floating", name: "Fractional Floating", shift: "14:00", boardOrder: 99, rounds: 0, role: "floating" as const },
  ];

  it.each([
    [3, 1, 1.5],
    [5, 2, 2.5],
    [7, 3, 3.5],
    [9, 4, 4.5],
    [11, 5, 5.5],
  ])("plans %s people as %s full teams plus 0.5 (%s teams)", (people, fullCount, label) => {
    const state = createQueueState(fractionalBoard);
    const plan = planByRequiredPeople(state, people);
    expect(plan).not.toHaveProperty("error");
    if ("error" in plan) return;
    expect(plan.memberIds).toHaveLength(people);
    expect(plan.memberIds.at(-1)).toBe("fractional-floating");
    expect(Object.values(plan.memberUnits ?? {}).filter((units) => units === 1)).toHaveLength(fullCount * 2);
    expect(Object.values(plan.memberUnits ?? {}).filter((units) => units === 0.5)).toEqual([0.5]);
    expect(plan.reason).toContain("ทีมเต็มก่อน");
  });

  it.each([
    [0.5, 1],
    [1, 2],
    [1.5, 3],
    [2, 4],
    [2.5, 5],
    [3, 6],
    [3.5, 7],
    [4, 8],
    [4.5, 9],
    [5, 10],
    [5.5, 11],
  ])("accepts a %s-team command and plans %s members", (units, expectedMembers) => {
    const state = createQueueState(fractionalBoard);
    const plan = planByRequiredUnits(state, units);
    expect(plan).not.toHaveProperty("error");
    if ("error" in plan) return;
    expect(plan.memberIds).toHaveLength(expectedMembers);
    expect(plan.reason).toContain(`คำสั่ง ${Number(units).toFixed(1)} ทีม`);
  });

  it.each([0, 1.25, 6, 7.5])("rejects an invalid %s-team command", (units) => {
    const plan = planByRequiredUnits(createQueueState(fractionalBoard), units);
    expect(plan).toEqual({ error: expect.stringContaining("จำนวนเต็มหรือครึ่งทีม") });
  });

  it("transitions a Dp selected as the fractional half of a 1.5-team command into QL/QF while airborne", () => {
    const smallBoard: BoardMember[] = [
      { id: "a1", name: "A1", teamId: "TA", partnerId: "a2", shift: "08:00", boardOrder: 1, rounds: 0, role: "te" },
      { id: "a2", name: "A2", teamId: "TA", partnerId: "a1", shift: "08:00", boardOrder: 2, rounds: 0, role: "te" },
      { id: "d1", name: "D1", teamId: "TD", partnerId: "d2", shift: "09:00", boardOrder: 3, rounds: 0, role: "te" },
      { id: "d2", name: "D2", teamId: "TD", partnerId: "d1", shift: "09:00", boardOrder: 4, rounds: 0, role: "te" },
    ];
    const state = createQueueState(smallBoard);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const plan = planByRequiredUnits(split.state, 1.5, 120);
    expect(plan).not.toHaveProperty("error");
    if ("error" in plan) return;
    expect(plan.memberIds).toEqual(["d1", "d2", "a2"]);
    expect(plan.memberUnits?.a2).toBe(0.5);
    const result = dispatch(split.state, { ...plan, now: 120 });
    expect(result.error).toBeUndefined();
    expect(result.state.members.a1.role).toBe("ql");
    expect(result.state.members.a2.role).toBe("qf");
    expect(result.state.members.a2.underRound).toBe(true);
    expect(result.state.qv["QV-001"].status).toBe("broken");
  });

  it("reunites QL/QF as Te after the Dp half finishes inside a mixed full command", () => {
    const smallBoard: BoardMember[] = [
      { id: "a1", name: "A1", teamId: "TA", partnerId: "a2", shift: "08:00", boardOrder: 1, rounds: 0, role: "te" },
      { id: "a2", name: "A2", teamId: "TA", partnerId: "a1", shift: "08:00", boardOrder: 2, rounds: 0, role: "te" },
      { id: "d1", name: "D1", teamId: "TD", partnerId: "d2", shift: "09:00", boardOrder: 3, rounds: 0, role: "te" },
      { id: "d2", name: "D2", teamId: "TD", partnerId: "d1", shift: "09:00", boardOrder: 4, rounds: 0, role: "te" },
    ];
    const state = createQueueState(smallBoard);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const plan = planByRequiredUnits(split.state, 1.5, 120);
    expect(plan).not.toHaveProperty("error");
    if ("error" in plan) return;
    const mixed = dispatch(split.state, { ...plan, now: 120 });
    expect(mixed.error).toBeUndefined();
    expect(mixed.state.members.a1.role).toBe("ql");
    expect(mixed.state.members.a2.role).toBe("qf");
    expect(mixed.run?.memberUnits?.a2).toBe(0.5);

    const mixedReturned = completeRun(mixed.state, mixed.run!.id, 130);
    expect(mixedReturned.state.members.a2.role).toBe("qf");
    expect(mixedReturned.state.members.a2.underRound).toBe(false);
    expect(mixedReturned.state.members.a1.role).toBe("ql");

    const reunited = completeRun(mixedReturned.state, split.run!.id, 140);
    expect(reunited.state.members.a1.role).toBe("te");
    expect(reunited.state.members.a2.role).toBe("te");
    expect(reunited.state.members.a1.underRound).not.toBe(true);
    expect(reunited.state.members.a2.underRound).not.toBe(true);
    expect(reunited.state.events.some((event) => event.code === "QF_JOIN_QL")).toBe(true);
    expect(dispatch(reunited.state, { memberIds: ["a1", "a2"], units: 1, now: 150 }).error).toBeUndefined();
  });

  it("splits the Wk Te at queue head when its Dp is collecting 0.5 inside a mixed run", () => {
    const smallBoard: BoardMember[] = [
      { id: "a1", name: "A1", teamId: "TA", partnerId: "a2", shift: "08:00", boardOrder: 1, rounds: 0, role: "te" },
      { id: "a2", name: "A2", teamId: "TA", partnerId: "a1", shift: "08:00", boardOrder: 2, rounds: 0, role: "te" },
      { id: "d1", name: "D1", teamId: "TD", partnerId: "d2", shift: "09:00", boardOrder: 3, rounds: 0, role: "te" },
      { id: "d2", name: "D2", teamId: "TD", partnerId: "d1", shift: "09:00", boardOrder: 4, rounds: 0, role: "te" },
    ];
    const state = createQueueState(smallBoard);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const wkReturned = completeRun(split.state, split.run!.id, 110);
    expect(wkReturned.state.members.a1.role).toBe("wk");
    expect(wkReturned.state.standby).toContain("a1");

    const mixedPlan = planByRequiredUnits(wkReturned.state, 1.5, 120);
    expect(mixedPlan).not.toHaveProperty("error");
    if ("error" in mixedPlan) return;
    expect(mixedPlan.memberUnits?.a2).toBe(0.5);
    const dpRun = dispatch(wkReturned.state, { ...mixedPlan, now: 120 });
    expect(dpRun.error).toBeUndefined();
    expect(dpRun.state.members.a1.role).toBe("te");
    expect(dpRun.state.members.a2.role).toBe("te");
    expect(dpRun.run?.memberUnits?.a2).toBe(0.5);

    const nextHalf = planByRequiredUnits(dpRun.state, 0.5, 125);
    expect(nextHalf).toMatchObject({ memberIds: ["a1"], mode: "split", splitMemberId: "a1" });
    const nextRun = dispatch(dpRun.state, { ...nextHalf, now: 125 });
    expect(nextRun.error).toBeUndefined();
    expect(nextRun.state.members.a1.role).toBe("wk");
    expect(nextRun.state.members.a2.role).toBe("dp");
  });

  it("creates Wk/Dp when a floating member is already Active and the next fractional command splits a Te pair", () => {
    const floatingBoard: BoardMember[] = [
      { id: "a1", name: "A1", teamId: "TA", partnerId: "a2", shift: "08:00", boardOrder: 1, rounds: 0, role: "te" },
      { id: "a2", name: "A2", teamId: "TA", partnerId: "a1", shift: "08:00", boardOrder: 2, rounds: 0, role: "te" },
      { id: "f1", name: "F1", shift: "08:00", boardOrder: 3, rounds: 0, role: "floating" },
    ];
    const state = createQueueState(floatingBoard);
    const floatingRun = dispatch(state, { memberIds: ["f1"], units: 0.5, now: 100 });
    expect(floatingRun.error).toBeUndefined();
    expect(floatingRun.state.active[0]?.memberIds).toEqual(["f1"]);
    const nextPlan = planByRequiredUnits(floatingRun.state, 0.5, 110);
    expect(nextPlan).toMatchObject({ memberIds: ["a1"], mode: "split", splitMemberId: "a1" });
    if ("error" in nextPlan) return;
    const splitRun = dispatch(floatingRun.state, { ...nextPlan, now: 110 });
    expect(splitRun.error).toBeUndefined();
    expect(splitRun.state.members.a1.role).toBe("wk");
    expect(splitRun.state.members.a2.role).toBe("dp");
    expect(splitRun.state.members.a2.underRound).toBe(true);
  });

  it("bypasses an incomplete Wk/Dp head and selects the next complete team for a full command", () => {
    const state = createQueueState(board);
    const split = dispatch(state, { memberIds: ["a1"], units: 1, mode: "split", now: 100 });
    const afterFull = split.state;
    afterFull.active = [];
    afterFull.members.a1.role = "wk";
    afterFull.members.a2.role = "dp";
    afterFull.members.a1.qvId = "QV-001";
    afterFull.members.a2.qvId = "QV-001";
    afterFull.qv["QV-001"].status = "broken";
    afterFull.standby = ["a1", "a2", "d1", "d2", "b1", "b2", "c1"];
    const plan = planByRequiredUnits(afterFull, 1, 140);
    expect(plan).not.toHaveProperty("error");
    if ("error" in plan) return;
    expect(plan.memberIds).toEqual(["d1", "d2"]);
    expect(plan.reason).toContain("Bypass");
    const result = dispatch(afterFull, { ...plan, now: 140 });
    expect(result.error).toBeUndefined();
    expect(result.run?.memberIds).toEqual(["d1", "d2"]);
    expect(result.state.standby.slice(0, 2)).toEqual(["a1", "a2"]);
  });

  it.each([1, 2, 3, 4, 5])("keeps a complete linked Wk/Dp pair at queue head for a %s-team full command", (units) => {
    const state = createQueueState(fractionalBoard);
    const wk = state.members.f1a;
    const dp = state.members.f1b;
    wk.role = "wk";
    dp.role = "dp";
    dp.underRound = true;
    wk.qvId = "QV-HEAD";
    dp.qvId = "QV-HEAD";
    state.qv["QV-HEAD"] = { id: "QV-HEAD", wkId: wk.id, dpId: dp.id, anchorOrder: dp.boardOrder, status: "linked" };
    state.standby = ["f1a", "f1b", ...state.standby.filter((id) => !["f1a", "f1b"].includes(id))];

    const plan = planByRequiredUnits(state, units, 100);
    expect(plan).not.toHaveProperty("error");
    if ("error" in plan) return;
    expect(plan.memberIds.slice(0, 2)).toEqual(["f1a", "f1b"]);
    expect(plan.memberIds).toHaveLength(units * 2);
  });

  it.each([2, 3, 4, 5])("dispatches a %s-team full command with a linked Wk/Dp pair plus Te pairs", (units) => {
    const state = createQueueState(fractionalBoard);
    const wk = state.members.f1a;
    const dp = state.members.f1b;
    wk.role = "wk";
    dp.role = "dp";
    dp.underRound = true;
    wk.qvId = "QV-MIXED";
    dp.qvId = "QV-MIXED";
    state.qv["QV-MIXED"] = { id: "QV-MIXED", wkId: wk.id, dpId: dp.id, anchorOrder: dp.boardOrder, status: "linked" };
    state.standby = ["f1a", "f1b", ...state.standby.filter((id) => !["f1a", "f1b"].includes(id))];

    const plan = planByRequiredUnits(state, units, 100);
    expect(plan).not.toHaveProperty("error");
    if ("error" in plan) return;
    expect(plan.memberIds.slice(0, 2)).toEqual(["f1a", "f1b"]);
    expect(plan.memberIds).toHaveLength(units * 2);
    const result = dispatch(state, { ...plan, now: 100, durationSeconds: 30 });
    expect(result.error).toBeUndefined();
    expect(result.run?.memberIds).toEqual(plan.memberIds);
    expect(result.state.qv["QV-MIXED"].status).toBe("broken");
  });

  it.each([2, 3, 4, 5])("dispatches a %s-team full command across multiple complete teams", (units) => {
    const state = createQueueState(fractionalBoard);
    const plan = planByRequiredUnits(state, units, 100);
    expect(plan).not.toHaveProperty("error");
    if ("error" in plan) return;
    expect(plan.memberIds).toHaveLength(units * 2);
    expect(plan.mode).toBe("normal");
    expect(plan.units).toBe(1);
    const result = dispatch(state, { ...plan, now: 100, durationSeconds: 30 });
    expect(result.error).toBeUndefined();
    expect(result.run?.memberIds).toEqual(plan.memberIds);
    expect(result.run?.memberIds).toHaveLength(units * 2);
    expect(result.state.active).toHaveLength(1);
  });

  it("dispatches a 2.5-team plan with per-member awards and no Wk/Dp creation", () => {
    const state = createQueueState(fractionalBoard);
    const plan = planByRequiredPeople(state, 5);
    if ("error" in plan) throw new Error(plan.error);
    const result = dispatch(state, { ...plan, now: 100 });
    expect(result.error).toBeUndefined();
    expect(result.state.members["fractional-floating"].role).toBe("floating");
    expect(result.state.members.f1a.role).toBe("te");
    expect(result.state.members.f2b.role).toBe("te");
    expect(result.state.qv).toEqual({});
    const completed = completeRun(result.state, result.run!.id, 200);
    expect(completed.state.members.f1a.rounds).toBe(1);
    expect(completed.state.members.f2b.rounds).toBe(1);
    expect(completed.state.members["fractional-floating"].rounds).toBe(0.5);
  });
});


describe("shadow identity", () => {
  it("keeps a shadow member visible in Standby but excludes it from full-team and half-team planning", () => {
    const state = createQueueState([
      { id: "shadow", name: "Boy\nผู้พัฒนาระบบ\nalgorithm", shift: "08:00", boardOrder: 1, rounds: 0, role: "floating", isShadow: true },
      { id: "a1", name: "A1", teamId: "T1", partnerId: "a2", shift: "08:00", boardOrder: 2, rounds: 0, role: "te" },
      { id: "a2", name: "A2", teamId: "T1", partnerId: "a1", shift: "08:00", boardOrder: 3, rounds: 0, role: "te" },
    ]);
    expect(state.standby).toEqual(["shadow", "a1", "a2"]);
    expect(eligibleFullTeams(state)).toEqual([["a1", "a2"]]);
    expect(planByRequiredUnits(state, 0.5).memberIds).toEqual(["a1"]);
    expect(planByRequiredPeople(state, 1).memberIds).toEqual(["a1"]);
  });

  it("filters a shadow id from direct dispatch without creating an Active run", () => {
    const state = createQueueState([
      { id: "shadow", name: "Boy\nผู้พัฒนาระบบ\nalgorithm", shift: "08:00", boardOrder: 1, rounds: 0, role: "floating", isShadow: true },
      { id: "a1", name: "A1", shift: "08:00", boardOrder: 2, rounds: 0, role: "floating" },
    ]);
    const result = dispatch(state, { memberIds: ["shadow"], units: 0.5, now: 100 });
    expect(result.error).toContain("อย่างน้อยหนึ่งรายการ");
    expect(result.state.active).toHaveLength(0);
  });
});
