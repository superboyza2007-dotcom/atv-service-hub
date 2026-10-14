/* Mission Control Ledger: Mirror / Record Active contract. Strictly records board-backed IDs and never invents members. */

import { completeRun, dispatch, type ActiveRun, type QueueState, type TransitionResult } from "./queue-engine";

export type MirrorActiveInput = {
  eventId: string;
  activeMemberIds: string[];
  now?: number;
  durationSeconds?: number;
};

export type MirrorActiveSession = {
  sessionId: string;
  memberIds: string[];
  startedAt?: number;
  durationSeconds: number;
};

export type MirrorActiveSessionsInput = {
  eventId: string;
  sessions: MirrorActiveSession[];
  now?: number;
};

export type MirrorRecordResult = TransitionResult & {
  eventId?: string;
  enteredIds?: string[];
  exitedRunIds?: string[];
  ignored?: boolean;
};

const unique = (ids: string[]) => Array.from(new Set(ids));

/** Keeps a user selection aligned with whole Active runs. A multi-member run
 * cannot be reconciled as a partial snapshot, so selecting one member carries
 * the complete run into the recorded Active list. */
export function expandActiveRunSelection(state: QueueState, ids: string[]): string[] {
  const selected = new Set(unique(ids));
  for (const run of state.active) {
    if (run.memberIds.some((id) => selected.has(id))) {
      run.memberIds.forEach((id) => selected.add(id));
    }
  }
  return Array.from(selected);
}

function inferDispatch(state: QueueState, ids: string[], now: number, durationSeconds?: number): TransitionResult {
  const selected = ids.map((id) => state.members[id]).filter(Boolean);
  if (selected.length === 1) {
    const member = selected[0];
    const split = member.role === "te" && Boolean(member.partnerId);
    return dispatch(state, split
      ? { memberIds: ids, units: 1, mode: "split", splitMemberId: member.id, now, durationSeconds }
      : { memberIds: ids, units: 0.5, mode: "normal", now, durationSeconds });
  }
  if (selected.length === 2 && selected[0].teamId && selected[0].teamId === selected[1].teamId) {
    return dispatch(state, { memberIds: ids, units: 1, mode: "normal", now, durationSeconds });
  }

  // A fractional full-team run is one Active assignment, not separate runs:
  // one Dp/floating member receives 0.5 and every remaining Te member forms
  // complete pairs at 1.0. Preserve that shape when Mirror Return rebuilds it.
  const halfMembers = selected.filter((member) => member.role === "dp" || member.role === "floating");
  const fullMembers = selected.filter((member) => !halfMembers.includes(member));
  const fullTeamIds = new Set(fullMembers.map((member) => member.teamId).filter(Boolean));
  const completeFullTeams = fullMembers.length >= 2 && fullMembers.length % 2 === 0 && fullTeamIds.size * 2 === fullMembers.length
    && fullMembers.every((member) => member.role === "te" && !member.underRound && Boolean(member.teamId));
  if (halfMembers.length === 1 && completeFullTeams) {
    return dispatch(state, {
      memberIds: ids,
      units: 1,
      mode: "normal",
      memberUnits: Object.fromEntries([...fullMembers.map((member) => [member.id, 1 as const]), [halfMembers[0].id, 0.5 as const]]),
      now,
      durationSeconds,
    });
  }

  // A mixed split run also remains one assignment: a split Te plus one or
  // more complete Te pairs. Let the engine validate the exact Qv transition.
  const splitCandidates = selected.filter((member) => member.role === "te" && Boolean(member.partnerId));
  if (splitCandidates.length === 1 && fullMembers.length >= 2) {
    return dispatch(state, { memberIds: ids, units: 1, mode: "mixed", splitMemberId: splitCandidates[0].id, now, durationSeconds });
  }

  return { state, error: "Mirror Active ต้องจับคู่สมาชิกตาม Team Board เดิมเท่านั้น; รายการที่เหลือไม่ใช่ Te หรือ assignment ที่ engine รองรับ" };
}

/**
 * Reconciles a user-recorded Active list against the deterministic queue state.
 * The eventId makes a repeated board snapshot a no-op, while exits are completed
 * through the existing lifecycle instead of deleting state directly.
 */
export function recordActive(inputState: QueueState, input: MirrorActiveInput): MirrorRecordResult {
  const state = structuredClone(inputState);
  const now = input.now ?? Date.now();
  const durationSeconds = input.durationSeconds;
  const eventId = input.eventId.trim();
  if (!eventId) return { state, error: "Mirror Active ต้องมี eventId เพื่อป้องกันการบันทึกซ้ำ" };
  if (state.mirrorEventIds?.includes(eventId)) return { state, eventId, enteredIds: [], exitedRunIds: [], ignored: true };

  const desired = unique(input.activeMemberIds);
  const unknown = desired.filter((id) => !state.members[id]);
  if (unknown.length) return { state, error: `Mirror Active พบสมาชิกที่ไม่มีใน Team Board: ${unknown.join(", ")}` };

  const activeIds = new Set(state.active.flatMap((run) => run.memberIds));
  const desiredIds = new Set(desired);
  const exitedRuns = state.active.filter((run) => run.memberIds.every((id) => !desiredIds.has(id)));
  const enteredIds = desired.filter((id) => !activeIds.has(id));

  // If the selected members are already active but were created as separate
  // runs from one command, preserve the live assignment and merge the visual
  // AR boundary instead of completing/re-dispatching them. This is important
  // for a full-plus-fraction selection such as Te + Te + Dp: it is one job,
  // even when an earlier path produced two ActiveRun records.
  const selectedRuns = state.active.filter((run) => run.memberIds.some((id) => desiredIds.has(id)));
  const selectedRunMemberIds = unique(selectedRuns.flatMap((run) => run.memberIds));
  const canMergeSelectedRuns = enteredIds.length === 0
    && selectedRuns.length > 1
    && selectedRunMemberIds.length === desiredIds.size
    && selectedRunMemberIds.every((id) => desiredIds.has(id));
  if (canMergeSelectedRuns) {
    const primary = selectedRuns[0];
    const mergedMemberIds = desired.filter((id) => selectedRunMemberIds.includes(id));
    const mergedMemberUnits: Record<string, 0.5 | 1> = {};
    for (const run of selectedRuns) {
      for (const id of run.memberIds) mergedMemberUnits[id] = run.memberUnits?.[id] ?? run.units;
    }
    primary.memberIds = mergedMemberIds;
    primary.memberUnits = mergedMemberUnits;
    primary.units = Object.values(mergedMemberUnits).some((value) => value === 1) ? 1 : 0.5;
    primary.mode = selectedRuns.some((run) => run.mode === "split" || run.mode === "mixed") ? "mixed" : "normal";
    primary.splitMemberId = selectedRuns.find((run) => run.splitMemberId)?.splitMemberId;
    primary.externalNames = unique(selectedRuns.flatMap((run) => run.externalNames));
    state.active = state.active.filter((run) => run === primary || !selectedRuns.includes(run));
    state.events.unshift({ at: now, code: "MIRROR_ACTIVE_MERGED", message: `Mirror Active ${eventId}: รวม ${selectedRuns.map((run) => run.id).join(" + ")} เป็น AR เดียว`, memberIds: mergedMemberIds });
  }
  const partialRun = state.active.find((run) => run.memberIds.some((id) => desiredIds.has(id)) && run.memberIds.some((id) => !desiredIds.has(id)));
  if (partialRun) return { state, error: `Mirror Active แยก Active บางส่วนของ ${partialRun.id} ไม่ได้; ต้องส่งรายชื่อทั้ง run ตาม eventId เดียวกัน` };

  let next = state;
  const exitedRunIds: string[] = [];
  for (const run of exitedRuns) {
    const result = completeRun(next, run.id, now);
    if (result.error) return { state, error: result.error };
    next = result.state;
    exitedRunIds.push(run.id);
  }

  const remaining = enteredIds.filter((id) => next.standby.includes(id));
  if (remaining.length) {
    // Try the complete selection first. This preserves a single ActiveRun for
    // full-plus-fraction assignments such as Te + Te + Dp. Only fall back to
    // pair grouping when the whole selection is not a valid single assignment.
    const groupedResult = inferDispatch(next, remaining, now, durationSeconds);
    if (!groupedResult.error) {
      next = groupedResult.state;
    } else {
      const pairGroups = new Map<string, string[]>();
      const singles: string[] = [];
      for (const id of remaining) {
        const member = next.members[id];
        if (member.teamId) {
          const group = pairGroups.get(member.teamId) ?? [];
          group.push(id);
          pairGroups.set(member.teamId, group);
        } else singles.push(id);
      }
      for (const ids of [...Array.from(pairGroups.values()), ...singles.map((id) => [id])]) {
        const result = inferDispatch(next, ids, now, durationSeconds);
        if (result.error) return { state, error: result.error };
        next = result.state;
      }
    }
  }

  // A previous reconciliation can leave members of one command in separate
  // AR records. Once new members have been dispatched, merge all selected
  // records that are fully covered by this same desired snapshot.
  const mergeCandidates = next.active.filter((run) => run.memberIds.some((id) => desiredIds.has(id)));
  const mergeMemberIds = unique(mergeCandidates.flatMap((run) => run.memberIds));
  const shouldMerge = mergeCandidates.length > 1
    && mergeMemberIds.length === desiredIds.size
    && mergeMemberIds.every((id) => desiredIds.has(id));
  if (shouldMerge) {
    const primary = mergeCandidates[0];
    const memberUnits: Record<string, 0.5 | 1> = {};
    for (const run of mergeCandidates) {
      for (const id of run.memberIds) memberUnits[id] = run.memberUnits?.[id] ?? run.units;
    }
    primary.memberIds = desired.filter((id) => mergeMemberIds.includes(id));
    primary.memberUnits = memberUnits;
    primary.units = Object.values(memberUnits).some((value) => value === 1) ? 1 : 0.5;
    primary.mode = mergeCandidates.some((run) => run.mode === "split" || run.mode === "mixed") ? "mixed" : "normal";
    primary.splitMemberId = mergeCandidates.find((run) => run.splitMemberId)?.splitMemberId;
    primary.externalNames = unique(mergeCandidates.flatMap((run) => run.externalNames));
    next.active = next.active.filter((run) => run === primary || !mergeCandidates.includes(run));
    next.events.unshift({ at: now, code: "MIRROR_ACTIVE_MERGED", message: `Mirror Active ${eventId}: รวม ${mergeCandidates.map((run) => run.id).join(" + ")} เป็น AR เดียว`, memberIds: primary.memberIds });
  }

  next.mirrorEventIds = [...(next.mirrorEventIds ?? []), eventId].slice(-100);
  next.events.unshift({ at: now, code: "MIRROR_ACTIVE_RECORDED", message: `Mirror Active ${eventId}: เข้า ${enteredIds.length} คน, ออก ${exitedRunIds.length} run ตามรายการที่ผู้ใช้บันทึก`, memberIds: desired });
  next.events = next.events.slice(0, 100);
  return { state: next, eventId, enteredIds, exitedRunIds };
}

/**
 * Reconciles the canonical Active feed without flattening Session boundaries.
 * Each source session owns exactly one AR. A Session that disappears is
 * completed through completeRun so only that Session's members return to queue.
 */
export function recordActiveSessions(inputState: QueueState, input: MirrorActiveSessionsInput): MirrorRecordResult {
  const state = structuredClone(inputState);
  const now = input.now ?? Date.now();
  const eventId = input.eventId.trim();
  if (!eventId) return { state, error: "Mirror Active Sessions ต้องมี eventId" };
  if (state.mirrorEventIds?.includes(eventId)) return { state, eventId, enteredIds: [], exitedRunIds: [], ignored: true };

  const sessions = input.sessions
    .map(session => ({
      ...session,
      sessionId: session.sessionId.trim(),
      memberIds: unique(session.memberIds),
      durationSeconds: Math.max(1, Math.floor(session.durationSeconds)),
    }))
    .filter(session => session.sessionId && session.memberIds.length);
  const duplicateSession = sessions.find((session, index) => sessions.findIndex(candidate => candidate.sessionId === session.sessionId) !== index);
  if (duplicateSession) return { state, error: `พบ Session ซ้ำใน Active snapshot: ${duplicateSession.sessionId}` };

  const ownerByMember = new Map<string, string>();
  for (const session of sessions) {
    for (const memberId of session.memberIds) {
      if (!state.members[memberId]) return { state, error: `Mirror Active Sessions พบสมาชิกที่ไม่มีใน Team Board: ${memberId}` };
      const existingOwner = ownerByMember.get(memberId);
      if (existingOwner && existingOwner !== session.sessionId) return { state, error: `สมาชิก ${memberId} อยู่ใน Active มากกว่าหนึ่ง Session` };
      ownerByMember.set(memberId, session.sessionId);
    }
  }

  let next = state;
  const desiredSessionIds = new Set(sessions.map(session => session.sessionId));
  const exitedRunIds: string[] = [];
  // Legacy client-mirrored ARs had no Session identity and may contain several
  // Sessions merged together. Complete them first, then rebuild from the
  // canonical session-aware snapshot below.
  for (const run of next.active.filter(run => !run.sourceSessionId)) {
    const completed = completeRun(next, run.id, now);
    if (completed.error) return { state, error: completed.error };
    next = completed.state;
    exitedRunIds.push(run.id);
  }
  for (const run of next.active.filter(run => run.sourceSessionId && !desiredSessionIds.has(run.sourceSessionId))) {
    const completed = completeRun(next, run.id, now);
    if (completed.error) return { state, error: completed.error };
    next = completed.state;
    exitedRunIds.push(run.id);
  }

  const enteredIds: string[] = [];
  for (const session of sessions) {
    const existing = next.active.find(run => run.sourceSessionId === session.sessionId);
    if (existing) {
      const currentIds = [...existing.memberIds].sort().join("|");
      const desiredIds = [...session.memberIds].sort().join("|");
      if (currentIds !== desiredIds) return { state, error: `Session ${session.sessionId} เปลี่ยนสมาชิกระหว่าง Active; ต้องจบ Session เดิมก่อน` };
      existing.startedAt = session.startedAt ?? existing.startedAt;
      existing.durationSeconds = session.durationSeconds;
      existing.scheduledEndAt = existing.startedAt + session.durationSeconds * 1000;
      existing.status = existing.scheduledEndAt <= now ? "TIME_EXPIRED" : "RUNNING";
      continue;
    }

    const conflictingRun = next.active.find(run => run.memberIds.some(memberId => session.memberIds.includes(memberId)));
    if (conflictingRun) return { state, error: `Session ${session.sessionId} ใช้สมาชิกที่กำลังอยู่ใน ${conflictingRun.id}` };

    const preservedRuns = next.active;
    const isolatedState = structuredClone(next);
    isolatedState.active = [];
    const recorded = recordActive(isolatedState, {
      eventId: `${eventId}:${session.sessionId}`,
      activeMemberIds: session.memberIds,
      now: session.startedAt ?? now,
      durationSeconds: session.durationSeconds,
    });
    if (recorded.error) return { state, error: recorded.error };
    if (recorded.state.active.length !== 1) return { state, error: `Session ${session.sessionId} ไม่สามารถสร้างเป็น AR เดียวได้` };
    const created = recorded.state.active[0];
    created.id = `AR-${session.sessionId}`;
    created.sourceSessionId = session.sessionId;
    created.startedAt = session.startedAt ?? created.startedAt;
    created.durationSeconds = session.durationSeconds;
    created.scheduledEndAt = created.startedAt + session.durationSeconds * 1000;
    created.status = created.scheduledEndAt <= now ? "TIME_EXPIRED" : "RUNNING";
    recorded.state.active = [...preservedRuns, created];
    next = recorded.state;
    enteredIds.push(...session.memberIds);
  }

  next.mirrorEventIds = [...(next.mirrorEventIds ?? []), eventId].slice(-100);
  next.events.unshift({
    at: now,
    code: "MIRROR_ACTIVE_SESSIONS_RECORDED",
    message: `Mirror Active Sessions ${eventId}: ${sessions.length} Session → ${sessions.length} AR, คืน ${exitedRunIds.length} AR`,
    memberIds: sessions.flatMap(session => session.memberIds),
  });
  next.events = next.events.slice(0, 100);
  return { state: next, eventId, enteredIds, exitedRunIds };
}
