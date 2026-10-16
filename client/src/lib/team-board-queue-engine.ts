/*
 * LOCKED QUEUE CONTRACT — ห้ามแก้ไขกฎ Run Queue หรือลำดับ Standby เด็ดขาด
 * รายละเอียดข้อกำหนดอยู่ที่ QUEUE_RULES_LOCK.md; UI/access changes ต้องไม่เปลี่ยน engine นี้
 */
/* Mission Control Ledger engine: deterministic state transitions, explicit queue reasons, no risk inference. */

export type Role = "te" | "floating" | "wk" | "dp" | "ql" | "qf";
export type JobUnits = 0.5 | 1;
export type JobMode = "normal" | "split" | "mixed";

export type BoardMember = {
  id: string;
  name: string;
  teamId?: string;
  shift: string;
  boardOrder: number;
  rounds: number;
  role: Role;
  underRound?: boolean;
  partnerId?: string;
  qvId?: string;
  /** Display-only identity; remains visible in Standby but never participates in queue logic. */
  isShadow?: boolean;
};

export type ActiveRun = {
  id: string;
  memberIds: string[];
  externalNames: string[];
  units: JobUnits;
  memberUnits?: Record<string, JobUnits>;
  mode: JobMode;
  startedAt: number;
  durationSeconds?: number | null;
  /** The canonical Active event that owns this run. External-owned runs do not expire locally. */
  externalEventId?: string;
  /** The source 2.3 Active Session that owns this run, when applicable. */
  sourceSessionId?: string;
  compensationEventId?: string;
  splitMemberId?: string;
  returnMemberId?: string;
  returnRole?: Role;
  returnUnderRound?: boolean;
  returnQvId?: string;
};

export type QueueEvent = {
  at: number;
  code: string;
  message: string;
  memberIds?: string[];
};

export type QueueState = {
  members: Record<string, BoardMember>;
  standby: string[];
  active: ActiveRun[];
  qv: Record<string, { id: string; wkId: string; dpId: string; anchorOrder: number; returnIndex?: number; warpOriginIndex?: number; status: "linked" | "broken" }>;
  events: QueueEvent[];
  compensatedEventIds: string[];
  nextRun: number;
  nextQv: number;
  mirrorEventIds: string[];
};

export type QueueSnapshotEntry = {
  key: string;
  position: number | null;
  state: "active" | "standby" | "waiting";
  status: Role | "external";
  memberIds: string[];
  memberNames: string[];
  teamId?: string;
  runId?: string;
  relationship?: { type: "te" | "qv" | "qv-broken" | "none"; partnerId?: string };
  reason: string;
};

export type DispatchInput = {
  memberIds: string[];
  externalNames?: string[];
  units: JobUnits;
  mode?: JobMode;
  now?: number;
  compensationEventId?: string;
  splitMemberId?: string;
  memberUnits?: Record<string, JobUnits>;
  durationSeconds?: number | null;
};

export type TransitionResult = { state: QueueState; run?: ActiveRun; error?: string };

const clone = <T,>(value: T): T => structuredClone(value);
const pushEvent = (state: QueueState, event: QueueEvent) => { state.events.unshift(event); state.events = state.events.slice(0, 100); };
const removeFromQueue = (queue: string[], ids: string[]) => queue.filter((id) => !ids.includes(id));
const appendUnique = (queue: string[], ids: string[]) => [...queue, ...ids.filter((id) => !queue.includes(id))];

export function createQueueState(input: BoardMember[]): QueueState {
  const members = Object.fromEntries(input.map((member) => [member.id, clone(member)]));
  return { members, standby: input.slice().sort((a, b) => a.boardOrder - b.boardOrder).map((member) => member.id), active: [], qv: {}, events: [], compensatedEventIds: [], nextRun: 1, nextQv: 1, mirrorEventIds: [] };
}

export function eligibleHalf(state: QueueState): string[] {
  return state.standby.filter((id) => !state.members[id].isShadow && ["dp", "floating", "te"].includes(state.members[id].role));
}

export function eligibleFullTeams(state: QueueState): [string, string][] {
  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  for (const id of state.standby) {
    const member = state.members[id];
    if (member.isShadow || !member.teamId || seen.has(member.teamId) || member.role !== "te" || member.underRound) continue;
    const partner = state.standby.map((candidate) => state.members[candidate]).find((candidate) => candidate.teamId === member.teamId && candidate.id !== id && candidate.role === "te" && !candidate.underRound);
    if (partner) { pairs.push([id, partner.id]); seen.add(member.teamId); }
  }
  return pairs;
}

const eligibleWholeTeams = (state: QueueState): [string, string][] => {
  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  for (const id of state.standby) {
    const member = state.members[id];
    if (member.isShadow || !member.teamId || seen.has(member.teamId)) continue;
    const partner = state.members[member.partnerId ?? ""];
    const bothStandby = Boolean(partner && state.standby.includes(partner.id));
    const normalPair = member.role === "te" && !member.underRound && partner?.role === "te" && !partner.underRound;
    const qv = member.qvId ? state.qv[member.qvId] : undefined;
    const completeQvPair = Boolean(qv?.status === "linked" && member.qvId === partner?.qvId && ((member.role === "wk" && partner.role === "dp") || (member.role === "dp" && partner.role === "wk")));
    if (bothStandby && (normalPair || completeQvPair)) {
      pairs.push([id, partner!.id]);
      seen.add(member.teamId);
    }
  }
  return pairs;
};

const findBypassedHead = (state: QueueState) => {
  const head = state.standby.map((id) => state.members[id]).find((member) => !member.isShadow);
  if (!head || !head.partnerId) return undefined;
  const partner = state.members[head.partnerId];
  const partnerInStandby = Boolean(partner && state.standby.includes(partner.id));
  const partnerReadyAsTe = Boolean(partnerInStandby && partner?.role === "te" && !partner.underRound);
  const qv = head.qvId ? state.qv[head.qvId] : undefined;
  const completeQvPair = Boolean(partnerInStandby && qv?.status === "linked" && head.qvId === partner?.qvId && ((head.role === "wk" && partner?.role === "dp") || (head.role === "dp" && partner?.role === "wk")));
  if (head.role === "te" && !partnerReadyAsTe && !completeQvPair) return head;
  if ((head.role === "wk" || head.role === "dp") && !completeQvPair) return head;
  return undefined;
};

const findSplitCandidate = (state: QueueState, excluded: string[] = []) => state.standby.map((id) => state.members[id]).find((member) => {
  if (member.isShadow || excluded.includes(member.id) || member.role !== "te" || member.underRound || !member.partnerId) return false;
  const partner = state.members[member.partnerId];
  const partnerWaiting = Boolean(partner && state.standby.includes(partner.id) && partner.role === "te" && !partner.underRound);
  const partnerCollecting = Boolean(partner && partner.role === "te" && partner.underRound && state.active.some((run) => (run.memberUnits?.[partner.id] ?? run.units) === 0.5 && run.memberIds.includes(partner.id)));
  return partnerWaiting || partnerCollecting;
});

export function planByRequiredPeople(state: QueueState, people: number, now = Date.now()): { memberIds: string[]; mode: JobMode; units: JobUnits; reason: string; splitMemberId?: string; memberUnits?: Record<string, JobUnits> } | { error: string } {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(people)) return { error: "required people must be 1–11" };
  const fullCount = Math.floor(people / 2);
  const bypassedHead = findBypassedHead(state);
  const bypassReason = bypassedHead ? `; Bypass ${bypassedHead.name} ที่หัวคิวเพราะคู่ยังไม่ครบ` : "";
  const fullTeams = people % 2 === 0 ? eligibleWholeTeams(state) : eligibleFullTeams(state);
  if (people >= 2) {
    const selectedTeams = fullTeams.slice(0, fullCount);
    const ids = selectedTeams.flat();
    if (ids.length === fullCount * 2 && people % 2 === 0) return { memberIds: ids, mode: "normal", units: 1, reason: `${people} คน: เลือกทีมเต็ม ${fullCount} ทีมตาม CF-OF${bypassReason}` };
    if (ids.length === fullCount * 2 && people % 2 === 1) {
      const halfDp = state.standby.find((id) => !state.members[id].isShadow && state.members[id].role === "dp" && !ids.includes(id));
      const halfFloating = state.standby.find((id) => !state.members[id].isShadow && state.members[id].role === "floating" && !ids.includes(id));
      const half = halfDp ?? halfFloating;
      if (half) return { memberIds: [...ids, half], mode: "normal", units: 1, memberUnits: Object.fromEntries([...ids.map((id) => [id, 1 as JobUnits]), [half, 0.5 as JobUnits]]), reason: `${people} คน: ทีมเต็มก่อนตาม CF-OF แล้วเติมเศษตามลำดับ ${halfDp ? "Dp" : "ตัวลอย"}${bypassReason}` };
      const split = findSplitCandidate(state, ids);
      if (split) return { memberIds: [...ids, split.id], mode: "mixed", units: 1, splitMemberId: split.id, memberUnits: Object.fromEntries([...ids.map((id) => [id, 1 as JobUnits]), [split.id, 1 as JobUnits]]), reason: `${people} คน: full team ตาม CF-OF แล้วแยก Te เป็นเศษทางเลือกสุดท้าย${bypassReason}` };
    }
  }
  const dp = state.standby.find((id) => !state.members[id].isShadow && state.members[id].role === "dp");
  if (people === 1 && dp) return { memberIds: [dp], mode: "normal", units: 0.5, reason: "Priority 01: ดึง Dp ก่อน" };
  const floating = state.standby.find((id) => !state.members[id].isShadow && state.members[id].role === "floating");
  if (people === 1 && floating) return { memberIds: [floating], mode: "normal", units: 0.5, reason: "Priority 02: ไม่มี Dp จึงดึงตัวลอยจากกะแรกสุด" };
  const split = findSplitCandidate(state);
  if (people === 1 && split) return { memberIds: [split.id], mode: "split", units: 1, splitMemberId: split.id, reason: "Priority 03: ไม่มี Dp/ตัวลอย จึงแยกคู่สร้าง Wk/Dp" };
  return { error: `ไม่มีสมาชิกที่พร้อมสำหรับ ${people} คน ณ ${new Date(now).toISOString()}` };
}

/**
 * Plans a dispatch from a command quantity instead of reading the Active list.
 * The command is expressed in team units: whole or half units from 0.5 to 5.5; the existing
 * people-based planner remains the single source of truth for priority rules.
 */
export function planByRequiredUnits(state: QueueState, units: number, now = Date.now()): { memberIds: string[]; mode: JobMode; units: JobUnits; reason: string; splitMemberId?: string; memberUnits?: Record<string, JobUnits> } | { error: string } {
  const normalized = Math.round(units * 2) / 2;
  if (!Number.isFinite(units) || normalized !== units || normalized < 0.5 || normalized > 5.5 || !Number.isInteger(normalized * 2)) {
    return { error: "คำสั่งรันคิวต้องเป็นจำนวนเต็มหรือครึ่งทีมระหว่าง 0.5 ถึง 5.5 เช่น 1, 1.5, 2, 2.5" };
  }
  const people = Math.round(normalized * 2);
  const plan = planByRequiredPeople(state, people, now);
  if ("error" in plan) return plan;
  return { ...plan, reason: `คำสั่ง ${normalized.toFixed(1)} ทีม → ${plan.reason}` };
}

export function dispatch(inputState: QueueState, input: DispatchInput): TransitionResult {
  const state = clone(inputState); const now = input.now ?? Date.now(); const externalNames = input.externalNames ?? [];
    const selected = input.memberIds.map((id) => state.members[id]).filter((member): member is BoardMember => Boolean(member) && !member.isShadow);
  if (!selected.length && !externalNames.length) return { state, error: "ต้องมีสมาชิกในบอร์ดหรือ External Helper อย่างน้อยหนึ่งรายการ" };
  if (selected.some((member) => member.role === "ql" || member.role === "qf")) return { state, error: "QL/QF ไม่มีสิทธิ์ตั้งคิวหรือ dispatch เดี่ยว ต้องรอการประกบอัตโนมัติ" };
  if (selected.some((member) => !state.standby.includes(member.id))) return { state, error: "สมาชิกบางรายไม่อยู่ใน Standby จึง dispatch ซ้ำไม่ได้" };
  if (input.compensationEventId && state.compensatedEventIds.includes(input.compensationEventId)) return { state, error: `เหตุการณ์ชดเชย ${input.compensationEventId} ถูกใช้สิทธิ์ไปแล้ว` };
  if (input.mode === "split" || input.mode === "mixed") {
    const splitId = input.splitMemberId ?? selected.at(-1)?.id;
    const wk = splitId ? state.members[splitId] : undefined;
    const partner = wk?.partnerId ? state.members[wk.partnerId] : undefined;
    const partnerOnStandby = Boolean(partner && state.standby.includes(partner.id));
    const partnerCollecting = Boolean(partner && state.active.some((run) => (run.memberUnits?.[partner.id] ?? run.units) === 0.5 && run.memberIds.includes(partner.id)));
    if (!wk || !partner || wk.role !== "te" || partner.role !== "te" || (!partnerOnStandby && !partnerCollecting)) return { state, error: "split ต้องมีคู่ Te ใน Standby หรือคู่ที่กำลังเก็บรอบ 0.5" };
    if (input.mode === "split" && (![0.5, 1].includes(input.units) || selected.length !== 1)) return { state, error: "split ต้องใช้สมาชิกในคู่ 1 คนและงาน 0.5 หรือ 1.0" };
    if (input.mode === "mixed" && (input.units !== 1 || selected.length < 3 || !selected.some((member) => member.id === wk.id))) return { state, error: "mixed ต้องมีทีมเต็มและสมาชิก split หนึ่งคน" };
    if (input.mode === "mixed") {
      const fullIds = selected.filter((member) => member.id !== wk.id);
      if (fullIds.length < 2 || fullIds.length % 2 !== 0 || fullIds.some((member) => member.role !== "te" || member.underRound || !member.teamId)) return { state, error: "mixed ต้องมี Full Team สถานะปกติ (-) เป็นคู่ ๆ ร่วมกับสมาชิก split" };
      const teamIds = new Set<string>();
      for (const member of fullIds) {
        if (teamIds.has(member.teamId!)) continue;
        const partner = fullIds.find((candidate) => candidate.id !== member.id && candidate.teamId === member.teamId);
        if (!partner) return { state, error: "mixed ต้องจัด Full Team ให้ครบคู่ ห้ามมีสมาชิกเดี่ยวในส่วนเต็ม" };
        teamIds.add(member.teamId!);
      }
    }
    wk.role = "wk"; wk.qvId = `QV-${String(state.nextQv).padStart(3, "0")}`; partner.role = "dp"; partner.underRound = true; partner.qvId = wk.qvId;
      state.qv[wk.qvId] = { id: wk.qvId, wkId: wk.id, dpId: partner.id, anchorOrder: partner.boardOrder, status: "linked" }; state.nextQv += 1;
    // Mixed dispatch removes the selected full-team members; only the Dp returns to Standby.
    // This preserves the original queue origin that Qv must later restore.
    state.standby = removeFromQueue(state.standby, [...selected.map((member) => member.id), partner.id]);
    if (partnerOnStandby) state.standby = appendUnique(state.standby, [partner.id]);
    if (partnerCollecting) {
      const partnerRun = state.active.find((run) => run.memberIds.includes(partner.id));
      if (partnerRun) { partnerRun.returnMemberId = partner.id; partnerRun.returnRole = "dp"; partnerRun.returnUnderRound = true; partnerRun.returnQvId = wk.qvId; }
    }
    pushEvent(state, { at: now, code: input.mode === "mixed" ? "MIXED_SPLIT_PAIR" : "SPLIT_PAIR", message: `${wk.name} → Wk Active (${input.units.toFixed(1)}); ${partner.name} → Dp/_ ท้าย Standby; สร้าง ${wk.qvId}`, memberIds: [wk.id, partner.id] });
  } else {
    const fractionalNormal = input.units === 1 && Boolean(input.memberUnits) && Object.values(input.memberUnits ?? {}).some((units) => units === 0.5);
    if (input.units === 1 && !fractionalNormal && (selected.length < 2 || selected.length % 2 !== 0)) return { state, error: "งานทีมเต็มต้องมีสมาชิกเป็นคู่จำนวนคู่" };
    const qvPair = input.units === 1 && selected.length === 2 && selected[0]?.teamId === selected[1]?.teamId && selected.every((member) => member.qvId && member.qvId === selected[0].qvId) && selected.some((member) => member.role === "wk") && selected.some((member) => member.role === "dp");
    const multiFullNormal = input.units === 1 && !fractionalNormal && selected.length >= 2 && selected.length % 2 === 0;
    if (fractionalNormal) {
      const halfMembers = selected.filter((member) => input.memberUnits?.[member.id] === 0.5);
      const fullMembers = selected.filter((member) => input.memberUnits?.[member.id] === 1);
      if (halfMembers.length !== 1 || fullMembers.length < 2 || fullMembers.length % 2 !== 0 || halfMembers[0].role !== "dp" && halfMembers[0].role !== "floating") return { state, error: "งานติดเศษต้องมี Full Team สถานะปกติหลายคู่ และ Dp/ตัวลอยหนึ่งคน" };
      if (fullMembers.some((member) => member.role !== "te" || member.underRound || !member.teamId)) return { state, error: "Full Team ในงานติดเศษต้องเป็นสถานะปกติ (-) เท่านั้น" };
      const seenTeams = new Set<string>();
      for (const member of fullMembers) {
        if (seenTeams.has(member.teamId!)) continue;
        const partner = fullMembers.find((candidate) => candidate.id !== member.id && candidate.teamId === member.teamId);
        if (!partner) return { state, error: "Full Team ในงานติดเศษต้องครบเป็นคู่" };
        seenTeams.add(member.teamId!);
      }
    }
    if (input.units === 1 && !fractionalNormal && selected.length < 2) return { state, error: "ทีมเต็มต้องมีสมาชิกอย่างน้อย 1 คู่" };
    const fullQvPairs: Array<{ teamId: string; members: [BoardMember, BoardMember]; qv: QueueState["qv"][string] }> = [];
    if (!fractionalNormal && selected.length >= 2) {
      const teams = new Map<string, BoardMember[]>();
      for (const member of selected) {
        if (!member.teamId) return { state, error: "ทีมเต็มต้องมี teamId ครบทุกสมาชิก" };
        const group = teams.get(member.teamId) ?? [];
        group.push(member);
        teams.set(member.teamId, group);
      }
      if (Array.from(teams.values()).some((group) => group.length !== 2)) return { state, error: "ทีมเต็มต้องจัดสมาชิกเป็นคู่ให้ครบทุกทีม" };
      for (const [teamId, group] of Array.from(teams.entries())) {
        const [first, second] = group;
        if (!first.partnerId || first.partnerId !== second.id || second.partnerId !== first.id) return { state, error: `ทีม ${teamId} ต้องเป็นคู่สมาชิกเดียวกัน` };
        const qv = first.qvId ? state.qv[first.qvId] : undefined;
        const completeQvPair = Boolean(qv?.status === "linked" && first.qvId === second.qvId && ((first.role === "wk" && second.role === "dp") || (first.role === "dp" && second.role === "wk")));
        const allowLegacyUnderRoundPair = selected.length === 2 && first.role === "te" && second.role === "te";
        if (completeQvPair && qv) {
          fullQvPairs.push({ teamId, members: [first, second], qv });
        } else if (first.role !== "te" || second.role !== "te" || ((!allowLegacyUnderRoundPair) && (first.underRound || second.underRound))) {
          return { state, error: "ทีมเต็มต้องเป็นสมาชิกสถานะปกติ (-) หรือคู่ Wk/Dp ที่ Qv ยัง linked และอยู่ครบทั้งคู่" };
        }
      }
    }
    const fractionalMember = fractionalNormal ? selected.find((member) => input.memberUnits?.[member.id] === 0.5) : undefined;
    const compensationMember = input.units === 0.5 ? selected[0] : fractionalMember;
    if (input.units === 0.5 && selected.length !== 1) return { state, error: "งาน 0.5 ต้องเลือกสมาชิก 1 คน" };
    if (compensationMember && !(compensationMember.role === "dp" || compensationMember.role === "floating" || (compensationMember.role === "te" && compensationMember.underRound))) return { state, error: "งาน 0.5 ต้องเป็นการเก็บรอบของ Dp/Te ที่ยังติด _ หรือการเรียกตัวลอยเท่านั้น" };
    if (fullQvPairs.length) {
      for (const pair of fullQvPairs) {
        pair.qv.status = "broken";
        pushEvent(state, { at: now, code: "QV_FULL_TEAM", message: `${pair.members.map((member) => member.name).join(" + ")} ออกทีมเต็ม 1.0 ในคำสั่งหลายทีม; คงสถานะ Wk/Dp และ (_)(-) ไว้, สิทธิ์ Qv จบ แต่สถานะ _ ของ Dp ยังไม่ถูกล้าง`, memberIds: pair.members.map((member) => member.id) });
      }
    }
    if (compensationMember?.role === "dp") {
      const dp = compensationMember; const qv = dp.qvId ? state.qv[dp.qvId] : undefined;
      if (qv && qv.status === "broken") {
        const wk = state.members[qv.wkId];
        if (wk.role === "wk" && dp.role === "dp" && dp.underRound) {
          wk.role = "te"; dp.role = "te"; wk.qvId = undefined; dp.qvId = undefined;
          pushEvent(state, { at: now, code: "QV_BROKEN", message: `${dp.name} ถูกดึง 0.5 หลังคู่ Wk/Dp ออกทีมเต็มแล้ว; ล้าง _ และรวมสถานะกลับเป็น Te โดยไม่สร้าง QL/QF`, memberIds: [dp.id, wk.id] });
        }
      } else if (qv && qv.status === "linked") {
        qv.status = "broken"; const wk = state.members[qv.wkId];
        const wkIsStandby = state.standby.includes(wk.id);
        if (wkIsStandby && (qv.warpOriginIndex !== undefined || qv.returnIndex !== undefined)) {
          const rollbackIndex = qv.warpOriginIndex ?? qv.returnIndex!;
          wk.role = "te";
          wk.qvId = undefined;
          dp.role = "te";
          dp.qvId = undefined;
          state.standby = removeFromQueue(state.standby, [wk.id]);
          state.standby.splice(Math.min(rollbackIndex, state.standby.length), 0, wk.id);
          const crossedCount = Math.max(0, (qv.warpOriginIndex ?? qv.returnIndex!) - (qv.returnIndex ?? 0) - 1);
          pushEvent(state, { at: now, code: "QV_ROLLBACK", message: `${wk.name} วาปกลับตำแหน่งก่อน Warp หลัง ${dp.name} ถูกดึง 0.5; คืนตามตำแหน่งธรรมชาติเดิม (ข้ามกลับ ${crossedCount} คิว)`, memberIds: [wk.id, dp.id] });
          pushEvent(state, { at: now, code: "QV_BROKEN", message: `${dp.name} ถูกดึง 0.5 หลัง Wk กลับเข้า Standbyแล้ว; ${wk.name} และ ${dp.name} เปลี่ยนเป็น Te ทันที, ทำลาย ${qv.id} โดยไม่สร้าง QL/QF`, memberIds: [dp.id, wk.id] });
        } else {
          // QL/QF is an airborne-only evolution: Wk must still be outside Standby.
          wk.role = "ql"; wk.qvId = qv.id; dp.role = "qf";
          pushEvent(state, { at: now, code: "QV_BROKEN", message: `${dp.name} ถูกดึง 0.5 ขณะที่ Wk ยัง Active; ${wk.name} เปลี่ยน Wk → QL และทำลาย ${qv.id}`, memberIds: [dp.id, wk.id] });
        }
      }
    }
    state.standby = removeFromQueue(state.standby, selected.map((member) => member.id));
  }
  if (input.compensationEventId) {
    state.compensatedEventIds.push(input.compensationEventId);
    pushEvent(state, { at: now, code: "COMPENSATION_CLAIMED", message: `เหตุการณ์ ${input.compensationEventId} ใช้สิทธิ์ชดเชยหนึ่งครั้ง`, memberIds: selected.map((member) => member.id) });
  }
  const run: ActiveRun = { id: `AR-${String(state.nextRun).padStart(3, "0")}`, memberIds: selected.map((member) => member.id), externalNames, units: input.units, memberUnits: input.memberUnits, mode: input.mode ?? "normal", startedAt: now, durationSeconds: input.durationSeconds, compensationEventId: input.compensationEventId, splitMemberId: input.splitMemberId };
  state.nextRun += 1; state.active.push(run);
  for (const member of selected) pushEvent(state, { at: now, code: "DISPATCH", message: `${run.id}: ${member.name} ออกจาก Standby เข้า Active (${input.units.toFixed(1)})`, memberIds: [member.id] });
  if (externalNames.length) pushEvent(state, { at: now, code: "EXTERNAL_ACTIVE", message: `${run.id}: ${externalNames.join(", ")} เป็น External Helper ไม่กระทบ Standby` });
  return { state, run };
}

export function completeRun(inputState: QueueState, runId: string, now = Date.now()): TransitionResult {
  const state = clone(inputState); const index = state.active.findIndex((run) => run.id === runId);
  if (index < 0) return { state, error: `ไม่พบ Active run ${runId}` };
  const run = state.active[index]; state.active.splice(index, 1);
  const returned: string[] = [];
  for (const id of run.memberIds) {
    const member = state.members[id]; const awardedUnits = run.memberUnits?.[id] ?? run.units; member.rounds += awardedUnits;
    if (run.returnMemberId === id && run.returnRole) {
      member.role = run.returnRole; member.underRound = run.returnUnderRound; member.qvId = run.returnQvId;
      returned.push(id); continue;
    }
    if (awardedUnits === 0.5 && member.underRound && (member.role === "dp" || member.role === "te")) { member.underRound = false; member.role = "te"; }
    // QF clears `_` after its 0.5 allocation, including when that half is bundled inside a mixed full run.
    if (member.role === "qf" && awardedUnits === 0.5) { member.underRound = false; }
    if (member.role === "floating") { returned.push(id); continue; }
    returned.push(id);
  }
  if (run.mode === "split" || run.mode === "mixed") {
    const splitId = run.splitMemberId ?? run.memberIds[0];
    const wk = state.members[splitId]; const qv = wk?.qvId ? state.qv[wk.qvId] : undefined;
    if (qv?.status === "linked") {
      wk.role = "wk";
      state.standby = appendUnique(state.standby, returned);
      qv.warpOriginIndex = state.standby.indexOf(wk.id);
      const dpIndex = state.standby.indexOf(qv.dpId);
      qv.returnIndex = dpIndex >= 0 ? dpIndex : state.standby.length;
      state.standby = removeFromQueue(state.standby, [wk.id]);
      // Qv joins immediately after the Dp anchor. Dp remains the queue leader;
      // Wk follows it until the Dp collects 0.5 and rollback restores Wk's origin.
      if (dpIndex >= 0) state.standby.splice(dpIndex + 1, 0, wk.id);
      pushEvent(state, { at: now, code: "QV_WARP", message: `${wk.name} กลับจาก 0.5 และใช้สิทธิ์ Qv วาปข้าม ${Math.max(0, qv.warpOriginIndex - dpIndex - 1)} คิวไปประกบตำแหน่งของ ${state.members[qv.dpId].name}`, memberIds: [wk.id, qv.dpId] });
    } else { state.standby = appendUnique(state.standby, returned); }
  } else {
    // QF is a secondary claimant: after finishing 0.5 it waits off-board until QL has a reserved slot.
    const qfWaitingIds = returned.filter((id) => state.members[id].role === "qf" && !state.members[id].underRound);
    state.standby = appendUnique(state.standby, returned.filter((id) => !qfWaitingIds.includes(id)));
    if (qfWaitingIds.length) pushEvent(state, { at: now, code: "QF_WAITING_OFFBOARD", message: `${qfWaitingIds.map((id) => state.members[id].name).join(" + ")} เก็บรอบเสร็จแล้ว แต่ยังรอ QL กลับมาจองคิว จึงอยู่นอกบอร์ด`, memberIds: qfWaitingIds });
    pushEvent(state, { at: now, code: "RETURN_STANDBY", message: `${run.id} หมดเวลา: สมาชิกในบอร์ดกลับท้าย Standby; External Helper ถูกเคลียร์`, memberIds: returned.filter((id) => !qfWaitingIds.includes(id)) });
  }
  const joinQfToQl = (follower: BoardMember | undefined, leader: BoardMember | undefined) => {
    if (!follower?.qvId || follower.underRound || !leader || leader.role !== "ql" || !state.standby.includes(leader.id)) return;
    if (state.active.some((activeRun) => activeRun.memberIds.includes(follower.id))) return;
    const qv = state.qv[follower.qvId];
    const leaderIndex = state.standby.indexOf(leader.id);
    state.standby = removeFromQueue(state.standby, [follower.id]);
    state.standby.splice(Math.min(leaderIndex + 1, state.standby.length), 0, follower.id);
    follower.role = "te"; leader.role = "te"; follower.partnerId = leader.id; leader.partnerId = follower.id; follower.qvId = undefined; leader.qvId = undefined; if (qv) qv.status = "broken";
    pushEvent(state, { at: now, code: "QF_JOIN_QL", message: `${follower.name} กลับมาเสียบ ${leader.name} รวมเป็น Te (-) ณ ตำแหน่งที่ QL จองไว้`, memberIds: [follower.id, leader.id] });
  };
  const qvPairs = Object.values(state.qv).filter((qv) => qv.status === "broken");
  qvPairs.forEach((qv) => joinQfToQl(state.members[qv.dpId], state.members[qv.wkId]));
  return { state };
}

export function queueSnapshot(state: QueueState): QueueSnapshotEntry[] {
  const activeByMember = new Map<string, ActiveRun>();
  state.active.forEach((run) => run.memberIds.forEach((id) => activeByMember.set(id, run)));
  const activeEntries: QueueSnapshotEntry[] = state.active.flatMap((run) => {
    const members = run.memberIds.map((id) => state.members[id]).filter(Boolean);
    const airborneQvMember = members.find((member) => member.role === "ql" || member.role === "qf") && members.find((member) => member.qvId);
    const qvMember = members.find((member) => member.qvId);
    const qv = qvMember?.qvId ? state.qv[qvMember.qvId] : undefined;
    const airborneReason = airborneQvMember ? `airborne Qv · ${members.some((member) => member.role === "ql") ? "QL ถือสิทธิ์คิว" : "QF ทำงานเก็บรอบ"}` : undefined;
    return [{ key: run.id, position: null, state: "active", status: members.length > 1 ? members[0].role : members[0]?.role ?? "external", memberIds: run.memberIds, memberNames: members.map((member) => member.name), teamId: members[0]?.teamId, runId: run.id, relationship: qv ? { type: "qv-broken" as const, partnerId: qv.wkId === qvMember?.id ? qv.dpId : qv.wkId } : members.length > 1 ? { type: "te" as const } : { type: "none" as const }, reason: airborneReason ?? `กำลัง Active · ${run.mode === "split" ? "split Wk/Dp" : run.units === 0.5 ? "0.5 งาน" : "ทีมเต็ม"}${run.externalNames.length ? " · มี External Helper" : ""}` }];
  });
  const standbyEntries: QueueSnapshotEntry[] = [];
  const consumed = new Set<string>();
  let queuePosition = 1;
  for (const id of state.standby) {
    if (consumed.has(id)) continue;
    const member = state.members[id];
    const partner = member.role === "te" && member.teamId ? state.standby.map((candidateId) => state.members[candidateId]).find((candidate) => candidate.id !== id && candidate.teamId === member.teamId && candidate.role === "te" && !consumed.has(candidate.id)) : undefined;
    const group = partner ? [member, partner] : [member];
    group.forEach((candidate) => consumed.add(candidate.id));
    const qv = member.qvId ? state.qv[member.qvId] : undefined;
    const relationship = group.length > 1 ? { type: "te" as const } : qv ? { type: qv.status === "linked" ? "qv" as const : "qv-broken" as const, partnerId: qv.wkId === member.id ? qv.dpId : qv.wkId } : { type: "none" as const };
    const bypassReason = queuePosition === 1 && member.role === "te" && member.partnerId && !state.standby.includes(member.partnerId) ? " · Bypass รอคู่กลับมา" : "";
    standbyEntries.push({ key: group.map((candidate) => candidate.id).join("-"), position: queuePosition++, state: "standby", status: group.length > 1 ? "te" : member.role, memberIds: group.map((candidate) => candidate.id), memberNames: group.map((candidate) => candidate.name), teamId: member.teamId, relationship, reason: qv?.status === "linked" ? `รอคิว · ${member.role === "dp" ? "Dp/_ รอ Qv" : "Wk รอประกบ"}` : member.role === "ql" ? "QL จองอันดับคิว" : member.role === "qf" ? "QF รอเสียบ QL" : group.length > 1 ? "Te คู่รอตามลำดับ Standby" : `รอตามลำดับ Standby${bypassReason}` });
  }
  const known = new Set([...state.standby, ...state.active.flatMap((run) => run.memberIds)]);
  const waitingEntries: QueueSnapshotEntry[] = Object.values(state.members).filter((member) => !known.has(member.id)).map((member) => ({ key: member.id, position: null, state: "waiting", status: member.role, memberIds: [member.id], memberNames: [member.name], teamId: member.teamId, relationship: member.qvId ? { type: "qv-broken" as const, partnerId: state.qv[member.qvId]?.wkId === member.id ? state.qv[member.qvId]?.dpId : state.qv[member.qvId]?.wkId } : { type: "none" as const }, reason: member.role === "qf" ? "QF เก็บรอบเสร็จแล้ว รอ QL กลับมาจองคิว" : "รอจัดเข้าคิวจาก lifecycle" }));
  return [...activeEntries, ...standbyEntries, ...waitingEntries];
}

export function snapshot(state: QueueState) { return { queue: queueSnapshot(state), standby: state.standby.map((id) => state.members[id].name), active: state.active.map((run) => run.id), roles: Object.fromEntries(Object.values(state.members).map((m) => [m.name, m.role])) }; }
