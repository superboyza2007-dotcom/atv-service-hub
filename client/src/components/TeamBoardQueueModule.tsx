/* Mission Control Ledger: UI contract follows Daily Board → 5 cards → Active/Run Queue. No seeded roster. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, Check, ChevronRight, Clock3, ListFilter, LockKeyhole, Play, ShieldCheck, UserRound, UsersRound, X, Zap } from "lucide-react";
import { completeRun, createQueueState, dispatch as engineDispatch, planByRequiredUnits, type BoardMember, type QueueEvent, type QueueState } from "@/lib/team-board-queue-engine";
import { expandActiveRunSelection, recordActive, recordActiveSessions, restoreLegacyAtvMirrorRuns } from "@/lib/team-board-mirror-engine";
import { trpc } from "@/lib/trpc";
import { parseOperationsSnapshot, serializeOperationsSnapshot } from "@/lib/operations-snapshot";
import { groupStandbyCardItems, selectStandbyCardItems, type RegistrationRow } from "@/lib/team-board-queue-view";

type QueueMemberOption = { name: string; group?: string };
type ActiveSessionNameGroup = { sessionId: string; memberNames: string[]; activeUserName?: string; startedAt?: string; durationMinutes?: number };
const CUSTOM_NAME_OPTION = "__atv_custom_name__";
const shifts = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00"];
const durationOptions = [15, 30, 45, 60];
const initialRows = shifts.slice(0, 3).map((shift, index) => ({ id: `row-${index + 1}`, shift, slot1: "", slot2: "" }));
const DEFAULT_ACCESS_CODE = "123456";
const SHADOW_DISPLAY_NAME = "";
const isRegistrationRows = (value: unknown): value is RegistrationRow[] => Array.isArray(value) && value.every((row) => Boolean(row && typeof row === "object" && typeof (row as RegistrationRow).id === "string" && typeof (row as RegistrationRow).shift === "string" && typeof (row as RegistrationRow).slot1 === "string" && typeof (row as RegistrationRow).slot2 === "string"));
const withoutAccessCode = (rows: RegistrationRow[], accessCode: string) => rows.map((row) => ({ ...row, slot1: row.slot1.trim() === accessCode ? "" : row.slot1, slot2: row.slot2.trim() === accessCode ? "" : row.slot2 }));
const roleLabel: Record<BoardMember["role"], string> = { te: "Te -", floating: "ตัวลอย ^", wk: "Wk", dp: "Dp / _", ql: "QL", qf: "QF" };
const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const teamLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const getMemberCode = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return parts.slice(0, 2).map((part) => part[0]).join("").toLocaleLowerCase("th-TH");
  return Array.from(name.trim()).slice(0, 2).join("").toLocaleLowerCase("th-TH") || "—";
};
const getTeamIdentity = (member: BoardMember) => {
  if (member.isShadow) return { label: "SH", className: "team-avatar team-tone-neutral", ariaLabel: "ผู้ใช้เงา ไม่เข้าร่วมการคำนวณคิว" };
  const match = member.teamId?.match(/(\d+)$/);
  const memberCode = getMemberCode(member.name);
  if (!match) return { label: `^/${memberCode}`, className: "team-avatar team-tone-neutral", ariaLabel: `ตัวลอย ${memberCode} ไม่มีทีมตั้งต้น` };
  const ordinal = Math.max(0, Number(match[1]) - 1);
  const teamLetter = teamLetters[ordinal % teamLetters.length];
  const tone = (ordinal % 8) + 1;
  return { label: `${teamLetter}/${memberCode}`, className: `team-avatar team-tone-${tone}`, ariaLabel: `ทีมตั้งต้น ${teamLetter} สมาชิก ${memberCode}` };
};
const TeamAvatar = ({ member }: { member: BoardMember }) => {
  const identity = getTeamIdentity(member);
  return <span className={`member-avatar ${identity.className}`} aria-label={identity.ariaLabel} title={identity.ariaLabel}>{identity.label}</span>;
};
const nextQueueDescription = (state: QueueState) => {
  const next = state.standby.map((id) => state.members[id]).filter((member): member is BoardMember => Boolean(member) && !member.isShadow).slice(0, 4);
  return next.length ? next.map((member) => `${getTeamIdentity(member).label} ${member.name} (${roleLabel[member.role]})`).join(" → ") : "คิวว่าง / ไม่มีสมาชิกพร้อมรัน";
};
const activeIntegrityWarning = (state: QueueState, proposedActiveIds = state.active.flatMap((run) => run.memberIds), actionKey?: string) => {
  const ids = proposedActiveIds.filter((id) => !state.members[id]?.isShadow);
  const names = ids.map((id) => state.members[id]?.name.trim().toLocaleLowerCase("th-TH")).filter(Boolean);
  const duplicated = (values: string[]) => values.filter((value, index) => values.indexOf(value) !== index);
  const duplicateIds = duplicated(ids);
  const duplicateNames = duplicated(names);
  if (duplicateIds.length || duplicateNames.length) {
    return `รายการ Active มีข้อมูลซ้ำ (${duplicateNames.length ? `ชื่อ ${Array.from(new Set(duplicateNames)).join(", ")} ` : ""}${duplicateIds.length ? "หรือ member เดิมถูกใช้งานซ้ำ" : ""})`;
  }
  const missingIds = ids.filter((id) => !state.members[id]);
  if (missingIds.length) return `รายการ Active มี member id ที่ไม่อยู่ใน Daily Board: ${missingIds.join(", ")}`;
  if (actionKey === "Active Return") {
    const currentIds = state.active.flatMap((run) => run.memberIds).sort();
    const proposedIds = [...ids].sort();
    if (currentIds.join("|") !== proposedIds.join("|")) {
      return `รายการ Active Return ไม่ตรงกับรายการที่กำลังทำงานปัจจุบัน (ควรคืน ${currentIds.length} คน แต่เลือก ${proposedIds.length} คน)`;
    }
  }
  const teamRuns = new Map<string, Set<string>>();
  state.active.forEach((run) => run.memberIds.forEach((id) => {
    const teamId = state.members[id]?.teamId;
    if (!teamId) return;
    const runs = teamRuns.get(teamId) ?? new Set<string>();
    runs.add(run.id);
    teamRuns.set(teamId, runs);
  }));
  const splitAcrossRuns = Array.from(teamRuns.values()).some((runs) => runs.size > 1);
  if (splitAcrossRuns) return "รายการ Active มีสมาชิกทีมเดิมซ้ำข้ามหลาย run ในสถานะพิเศษ Wk / Dp / QL / QF";
  return null;
};

function buildBoard(rows: RegistrationRow[], accessCode: string): BoardMember[] {
  const members: BoardMember[] = [];
  let order = 1;
  rows.forEach((row, rowIndex) => {
    const entries = [row.slot1.trim(), row.slot2.trim()].filter((value) => value && value !== accessCode).map((value, slot) => ({ value, slot, isShadow: false }));
    const present = entries.filter((entry) => entry.value);
    if (!present.length) return;
    const realEntries = present.filter((entry) => !entry.isShadow);
    const teamId = realEntries.length === 2 ? `te-${rowIndex + 1}` : undefined;
    const ids = present.map((_, slot) => `guide-${rowIndex + 1}-${slot + 1}`);
    present.forEach((entry, index) => {
      const isShadow = entry.isShadow;
      const partnerEntry = present.find((candidate) => candidate !== entry && !candidate.isShadow);
      members.push({ id: ids[index], name: isShadow ? SHADOW_DISPLAY_NAME : entry.value, teamId: isShadow ? undefined : teamId, partnerId: !isShadow && teamId && partnerEntry ? ids[present.indexOf(partnerEntry)] : undefined, shift: row.shift, boardOrder: order++, rounds: 0, role: !isShadow && teamId ? "te" : "floating", isShadow });
    });
  });
  return members;
}

function sortedMembers(state: QueueState) { return Object.values(state.members).sort((a, b) => a.boardOrder - b.boardOrder); }

function TeamBoardQueueContent({ activeNames = [], activeGroups, activeEventId = "atv-active", rosterNames = [], standbyNames, memberOptions = [], operatorName = "ผู้ใช้งานปัจจุบัน", readOnly = false }: { activeNames?: string[]; activeGroups?: ActiveSessionNameGroup[]; activeEventId?: string; rosterNames?: string[]; standbyNames?: string[]; memberOptions?: QueueMemberOption[]; operatorName?: string; readOnly?: boolean }) {
  const [screen, setScreen] = useState<"register" | "dashboard" | "queue" | "events">("register");
  const [rows, setRows] = useState<RegistrationRow[]>(initialRows);
  const [engineState, setEngineState] = useState<QueueState | null>(null);
  const engineRef = useRef<QueueState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [duration, setDuration] = useState(30);
  const [commandUnits, setCommandUnits] = useState("1");
  const [mirrorMode, setMirrorMode] = useState(false);
  const [mirrorEventId, setMirrorEventId] = useState("mirror-001");
  const [queueReads, setQueueReads] = useState<string[]>([]);
  const [lastDispatch, setLastDispatch] = useState("—");
  const [queueWarning, setQueueWarning] = useState<string | null>(null);
  const [warningKey, setWarningKey] = useState<string | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [secretCode, setSecretCode] = useState(DEFAULT_ACCESS_CODE);
  const [secretUnlocked, setSecretUnlocked] = useState(false);
  const [changeCodeOpen, setChangeCodeOpen] = useState(false);
  const [changeCodeError, setChangeCodeError] = useState("");
  const sharedQueueQuery = trpc.runQueue.get.useQuery(undefined, { retry: false, refetchInterval: 1000, enabled: true });
  const sharedQueueMutation = trpc.runQueue.save.useMutation({ onError: () => setQueueWarning("บันทึก Run Queue ลง Server ไม่สำเร็จ กรุณาลองใหม่") });
  const accessUnlockMutation = trpc.runQueue.access.unlock.useMutation();
  const accessChangeMutation = trpc.runQueue.access.change.useMutation();
  const sharedQueueHydrated = useRef(false);
  const lastPersistedAt = useRef(0);
  const rosterKey = rosterNames.map((name) => name.trim()).filter(Boolean).join("|");
  const seededRosterRef = useRef("");
  useEffect(() => {
    if (!sharedQueueHydrated.current || readOnly) return;
    const current = engineRef.current;
    const payload = serializeOperationsSnapshot({
      version: 1,
      updatedAt: Date.now(),
      updatedBy: operatorName,
      draftRows: withoutAccessCode(rows, secretCode),
      ...(current ? { state: current } : {}),
    });
    sharedQueueMutation.mutate({ payload });
  }, [rows, secretCode, operatorName, readOnly]);
  useEffect(() => {
    if (!sharedQueueQuery.isSuccess || sharedQueueHydrated.current) return;
    sharedQueueHydrated.current = true;
    const remote = parseOperationsSnapshot<{ state?: QueueState; draftRows?: unknown; updatedAt?: number }>(sharedQueueQuery.data);
    if (isRegistrationRows(remote?.draftRows)) setRows(remote.draftRows);
    if (remote?.state) {
      engineRef.current = remote.state;
      setEngineState(remote.state);
      setScreen("dashboard");
      lastPersistedAt.current = remote.updatedAt ?? 0;
    }
  }, [sharedQueueQuery.data, sharedQueueQuery.isSuccess, readOnly]);
  useEffect(() => {
    if (!engineState || !sharedQueueHydrated.current || readOnly) return;
    const updatedAt = Date.now();
    lastPersistedAt.current = updatedAt;
    const payload = serializeOperationsSnapshot({ version: 1, updatedAt, updatedBy: operatorName, draftRows: withoutAccessCode(rows, secretCode), state: engineState });
    sharedQueueMutation.mutate({ payload });
  }, [engineState, operatorName, readOnly]);
  useEffect(() => {
    if (!rosterKey || seededRosterRef.current === rosterKey || engineRef.current || !sharedQueueHydrated.current) return;
    const uniqueRoster = Array.from(new Set(rosterNames.map((name) => name.trim()).filter(Boolean)));
    const seededRows = uniqueRoster.reduce<RegistrationRow[]>((rows, name, index) => {
      const row = rows.at(-1);
      if (!row || row.slot2) rows.push({ id: `atv-row-${index + 1}`, shift: `${8 + rows.length}:00`, slot1: name, slot2: "" });
      else row.slot2 = name;
      return rows;
    }, []);
    const board = buildBoard(seededRows, secretCode);
    if (board.length) {
      const next = createQueueState(board);
      engineRef.current = next;
      setRows(seededRows);
      setEngineState(next);
      setScreen("dashboard");
      setQueueReads((logs) => [`${new Date().toLocaleTimeString("th-TH")}  ATV_ROSTER_LINKED → เชื่อม ${board.length} รายชื่อจาก Daily Board`, ...logs].slice(0, 8));
    }
    seededRosterRef.current = rosterKey;
  }, [rosterKey, rosterNames, secretCode, sharedQueueQuery.isSuccess]);
  useEffect(() => {
    if (standbyNames === undefined || !sharedQueueHydrated.current || readOnly || !engineRef.current) return;
    if (!rosterNames.length && !standbyNames.length) return;
    const normalized = new Map(Object.values(engineRef.current.members).map((member) => [member.name.trim().toLocaleLowerCase("th-TH"), member.id]));
    const desiredIds = Array.from(new Set(standbyNames.map((name) => normalized.get(name.trim().toLocaleLowerCase("th-TH"))).filter((id): id is string => Boolean(id))));
    if (standbyNames.some((name) => name.trim()) && desiredIds.length === 0) return;
    const activeIds = new Set(engineRef.current.active.flatMap((run) => run.memberIds));
    const nextStandby = desiredIds.filter((id) => !activeIds.has(id));
    const currentStandby = engineRef.current.standby.filter((id) => !activeIds.has(id));
    if (nextStandby.join("|") === currentStandby.join("|")) return;
    const next = { ...engineRef.current, standby: nextStandby };
    engineRef.current = next;
    setEngineState(next);
  }, [readOnly, rosterNames.length, sharedQueueQuery.isSuccess, standbyNames]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = engineRef.current;
      if (!state) return;
      const now = Date.now();
      state.active.filter((run) => !run.externalEventId && now - run.startedAt >= (run.durationSeconds ?? duration) * 1000).forEach((run) => {
        const result = completeRun(engineRef.current!, run.id, now);
        if (!result.error) {
          engineRef.current = result.state;
          setEngineState(result.state);
          setQueueReads((logs) => [`${new Date().toLocaleTimeString("th-TH")}  ${run.id} → Timer expired / returned to queue tail`, ...logs].slice(0, 8));
        }
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [duration]);

  const submitBoard = async () => {
    const unlockSubmitted = rows.some((row) => row.slot1.trim() === secretCode || row.slot2.trim() === secretCode);
    if (unlockSubmitted) {
      const verified = await accessUnlockMutation.mutateAsync({ code: secretCode });
      if (!verified) {
        setQueueReads(["ERROR: Team Board access code ไม่ถูกต้องบน Server"]);
        return;
      }
    }
    const board = buildBoard(rows, secretCode);
    if (!board.length) { setQueueReads(["ERROR: ต้องลงทะเบียนอย่างน้อย 1 รายชื่อก่อนส่ง/สำเร็จ"]); return; }
    const floatingMembers = board.filter((member) => !member.isShadow && member.role === "floating");
    if (floatingMembers.length > 1) {
      setQueueReads([`ERROR: ตัวลอยมีได้เพียง 1 คนในระบบ · พบ ${floatingMembers.length} คน กรุณาแก้รายชื่อช่องเดียวก่อนส่ง`]);
      return;
    }
    const normalizedNames = board.filter((member) => !member.isShadow).map((member) => member.name.toLocaleLowerCase("th-TH"));
    if (new Set(normalizedNames).size !== normalizedNames.length) { setQueueReads(["ERROR: ชื่อสมาชิกซ้ำกันใน Daily Board กรุณาแก้ก่อนส่ง/สำเร็จ"]); return; }
    const previous = engineRef.current;
    const activeIds = previous ? new Set(previous.active.flatMap((run) => run.memberIds)) : new Set<string>();
    const state = previous ? {
      ...previous,
      members: Object.fromEntries(board.map((member) => {
        const old = previous.members[member.id];
        const preserveRuntime = Boolean(old) && (activeIds.has(member.id) || old.role !== "floating");
        return [member.id, old && preserveRuntime ? { ...member, role: member.role === "floating" ? "floating" : old.role, rounds: old.rounds, qvId: old.qvId, underRound: old.underRound, boardOrder: old.boardOrder } : member];
      })) as QueueState["members"],
      standby: [...previous.standby.filter((id) => board.some((member) => member.id === id)), ...board.map((member) => member.id).filter((id) => !previous.standby.includes(id) && !activeIds.has(id))],
    } : createQueueState(board);
    engineRef.current = state;
    setEngineState(state);
    setSelected([]);
    const nextUnlocked = unlockSubmitted ? !secretUnlocked : secretUnlocked;
    if (unlockSubmitted) {
      setSecretUnlocked(nextUnlocked);
    }
    setRows(withoutAccessCode(rows, secretCode));
    setScreen("dashboard");
    setQueueReads((logs) => [`${new Date().toLocaleTimeString("th-TH")}  DAILY_REGISTERED_GUIDES → อัปเดต ${board.length} รายชื่อโดยคงลำดับและ Active เดิม`, ...logs].slice(0, 8));
  };
  const updateRow = (id: string, field: "slot1" | "slot2", value: string) => {
    setRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, [field]: value };
      if (next.slot1.trim() === secretCode && next.slot2.trim() === secretCode) {
        setChangeCodeError("");
        setChangeCodeOpen(true);
        return { ...next, slot1: "", slot2: "" };
      }
      return next;
    }));
  };
  const addRow = () => setRows((current) => [...current, { id: `row-${Date.now()}`, shift: `${8 + current.length}:00`, slot1: "", slot2: "" }]);
  const openRegistration = () => {
    setScreen("register");
  };

  const state = engineState;
  const members = useMemo(() => state ? sortedMembers(state) : [], [state]);
  const sourceActiveGroups = activeGroups ?? [];
  const sourceActiveNames = new Set(sourceActiveGroups.flatMap((group) => group.memberNames).map((name) => name.trim().toLocaleLowerCase("th-TH")).filter(Boolean));
  const sourceActiveIds = new Set(members.filter((member) => sourceActiveNames.has(member.name.trim().toLocaleLowerCase("th-TH"))).map((member) => member.id));
  const sourceActiveSessions = sourceActiveGroups.map((group) => ({
    sessionId: group.sessionId,
    memberIds: group.memberNames.map((name) => members.find((member) => member.name.trim().toLocaleLowerCase("th-TH") === name.trim().toLocaleLowerCase("th-TH"))?.id).filter((id): id is string => Boolean(id)),
    startedAt: group.startedAt ? Date.parse(group.startedAt) : undefined,
    durationSeconds: Math.max(1, Math.round((group.durationMinutes ?? duration) * 60)),
  }));
  const engineActiveRuns = state?.active ?? [];
  const activeIds = new Set([...engineActiveRuns.flatMap((run) => run.memberIds), ...Array.from(sourceActiveIds)]);
  const visibleQueueState = state;
  const activeRuns = engineActiveRuns;
  const activeRunCount = activeRuns.length;

  const atvMirrorKey = `${activeEventId}:${sourceActiveGroups.map((group) => `${group.sessionId}:${group.memberNames.map((name) => name.trim().toLocaleLowerCase("th-TH")).join(",")}:${group.startedAt ?? ""}:${group.durationMinutes ?? ""}`).join("|") || activeNames.map((name) => name.trim().toLocaleLowerCase("th-TH")).filter(Boolean).join("|")}`;
  const atvMirrorRef = useRef("");
  useEffect(() => {
    if (!engineRef.current || atvMirrorRef.current === atvMirrorKey) return;
    const normalized = new Map(members.map((member) => [member.name.trim().toLocaleLowerCase("th-TH"), member.id]));
    if (activeGroups !== undefined) {
      if (sourceActiveGroups.some((group) => group.memberNames.some((name) => name.trim() && !normalized.has(name.trim().toLocaleLowerCase("th-TH"))))) {
        setQueueWarning("พบชื่อจาก 2.3 Active ที่ยังไม่มีในคิวตั้งต้น จึงยังไม่เอาเข้าคำนวณ");
        return;
      }
      const result = recordActiveSessions(engineRef.current, { eventId: `2.3:${atvMirrorKey}`, sessions: sourceActiveSessions, now: Date.now() });
      atvMirrorRef.current = atvMirrorKey;
      if (!result.error && !result.ignored) {
        engineRef.current = result.state;
        setEngineState(result.state);
        setQueueWarning(null);
        setQueueReads((logs) => [`${new Date().toLocaleTimeString("th-TH")}  2.3_ACTIVE → เข้า Run Queue ตามกติกาเดิม ${sourceActiveSessions.length} รายการ`, ...logs].slice(0, 8));
      } else if (result.error) {
        setQueueWarning(result.error);
      }
      return;
    }
    const matchedIds = activeNames.map((name) => normalized.get(name.trim().toLocaleLowerCase("th-TH"))).filter((id): id is string => Boolean(id));
    const hasNames = activeNames.some((name) => name.trim());
    if (hasNames && matchedIds.length === 0) return;
    const result = recordActive(engineRef.current, { eventId: `atv:${atvMirrorKey}`, activeMemberIds: matchedIds, durationSeconds: duration, now: Date.now() });
    atvMirrorRef.current = atvMirrorKey;
    if (!result.error && !result.ignored) {
      engineRef.current = result.state;
      setEngineState(result.state);
    }
  }, [activeNames, activeEventId, activeGroups, atvMirrorKey, duration, members, sourceActiveGroups, sourceActiveSessions]);

  useEffect(() => {
    if (activeGroups === undefined || !engineState || !sharedQueueHydrated.current || readOnly) return;
    const restored = restoreLegacyAtvMirrorRuns(engineState);
    if (!restored) return;
    engineRef.current = restored;
    setEngineState(restored);
    setQueueReads((logs) => [`${new Date().toLocaleTimeString("th-TH")}  ATV_SOURCE_ACTIVE → removed legacy synthetic Active; queue order restored without adding rounds`, ...logs].slice(0, 8));
  }, [activeGroups, engineState, readOnly]);
  if (sharedQueueQuery.isError) return <div className="queue-shared-empty" role="alert">เชื่อมต่อ Run Queue บน Server ไม่ได้ กรุณาลองใหม่</div>;
  if (!sharedQueueHydrated.current) return <div className="queue-shared-empty" role="status">กำลังโหลด Run Queue จาก Server…</div>;
  if (readOnly) return state ? <QueueDisplayBoard operatorName={operatorName} members={members} state={visibleQueueState ?? state} onNavigate={() => undefined} /> : <div className="queue-shared-empty">ยังไม่มีข้อมูล Shared Run Queue</div>;
  const available = members.filter((member) => !member.isShadow && (mirrorMode || (state?.standby.includes(member.id) && !activeIds.has(member.id))));
  const dispatchSelected = () => {
    const base = engineRef.current;
    if (!base || selected.length === 0) return;
    if (selected.length > 2) {
      setQueueReads((logs) => [`ERROR Active → เลือกได้ครั้งละ 1 คนสำหรับงาน 0.5 หรือ 2 คนสำหรับทีมเต็ม`, ...logs].slice(0, 8));
      return;
    }
    const selectedMembers = selected.map((id) => base.members[id]).filter(Boolean);
    const splitCandidate = selectedMembers.length === 1 && selectedMembers[0].role === "te" && Boolean(selectedMembers[0].partnerId);
    const input = splitCandidate
      ? { memberIds: selected, units: 1 as const, mode: "split" as const, splitMemberId: selected[0], durationSeconds: duration }
      : { memberIds: selected, units: selected.length === 1 ? 0.5 as const : 1 as const, mode: "normal" as const, durationSeconds: duration };
    const result = engineDispatch(base, { ...input, now: Date.now() });
    if (result.error) {
      setQueueReads((logs) => [`ERROR Active → ${result.error}`, ...logs].slice(0, 8));
      return;
    }
    engineRef.current = result.state;
    setEngineState(result.state);
    setSelected([]);
    setLastDispatch(result.run?.id ?? "—");
    setQueueReads((logs) => [`${new Date().toLocaleTimeString("th-TH")}  ACTIVE_MANUAL → ${result.run?.id ?? "—"} · ${duration} วินาที`, ...logs].slice(0, 8));
  };

  const confirmBeforeUnsafe = (actionKey: string, action: () => void, proposedActiveIds?: string[]) => {
    const current = engineRef.current;
    if (!current) return;
    const integrity = activeIntegrityWarning(current, proposedActiveIds, actionKey);
    if (!integrity) {
      setQueueWarning(null);
      setWarningKey(null);
      action();
      return;
    }
    const key = `${actionKey}:${integrity}:${(proposedActiveIds ?? current.active.flatMap((run) => run.memberIds)).join(",")}:${current.active.map((run) => `${run.id}:${run.memberIds.join(",")}`).join("|")}`;
    if (warningKey !== key) {
      setWarningKey(key);
      setQueueWarning(`${integrity} · คิวต่อไปควรเป็น: ${nextQueueDescription(current)} · กดส่งซ้ำอีกครั้งเพื่อยืนยันการฝืนรัน`);
      setQueueReads((logs) => [`WARNING ${actionKey} → ${integrity} · expected next: ${nextQueueDescription(current)}`, ...logs].slice(0, 8));
      return;
    }
    setQueueWarning(null);
    setWarningKey(null);
    action();
  };

  const recordSelectedActive = () => {
    setQueueWarning(null);
    setWarningKey(null);
    recordSelectedActiveNow();
  };
  const recordSelectedActiveNow = () => {
    if (!engineRef.current || !mirrorEventId.trim()) {
      setQueueReads((logs) => ["ERROR Mirror Active → ต้องระบุ eventId ก่อนบันทึก", ...logs].slice(0, 8));
      return;
    }
    const selectedRunIds = expandActiveRunSelection(engineRef.current, selected);
    const result = recordActive(engineRef.current, { eventId: mirrorEventId.trim(), activeMemberIds: selectedRunIds, durationSeconds: duration, now: Date.now() });
    if (result.error) {
      setQueueReads((logs) => [`ERROR Mirror Active → ${result.error}`, ...logs].slice(0, 8));
      return;
    }
    engineRef.current = result.state;
    setEngineState(result.state);
    setSelected([]);
    setLastDispatch(result.exitedRunIds?.join(", ") || "MIRROR");
    setQueueReads((logs) => [`${new Date().toLocaleTimeString("th-TH")}  MIRROR_ACTIVE → ${mirrorEventId} · เข้า ${result.enteredIds?.length ?? 0} · ออก ${result.exitedRunIds?.length ?? 0}${result.ignored ? " · duplicate ignored" : ""}`, ...logs].slice(0, 8));
    setMirrorEventId((current) => current.replace(/(\\d+)$/, (_, n) => String(Number(n) + 1)));
  };

  const runQueue = () => {
    confirmBeforeUnsafe("Command Dispatch", () => runQueueNow());
  };
  const runQueueNow = () => {
    const base = engineRef.current;
    if (!base) return;
    const plan = planByRequiredUnits(visibleQueueState ?? base, Number(commandUnits));
    if ("error" in plan) { setQueueReads((logs) => [`ERROR Command Dispatch → ${plan.error}`, ...logs].slice(0, 8)); return; }
    const result = engineDispatch(base, { memberIds: plan.memberIds, units: plan.units, mode: plan.mode, memberUnits: plan.memberUnits, splitMemberId: plan.splitMemberId, durationSeconds: duration, now: Date.now() });
    if (result.error) { setQueueReads((logs) => [`ERROR Command Dispatch → ${plan.reason} · ${result.error}`, ...logs].slice(0, 8)); return; }
    engineRef.current = result.state; setEngineState(result.state); setQueueReads((logs) => [`${new Date().toLocaleTimeString("th-TH")}  COMMAND_DISPATCH → ${plan.reason}`, ...logs].slice(0, 8));
  };
  const complete = (runId: string) => { if (!engineRef.current) return; const result = completeRun(engineRef.current, runId, Date.now()); if (!result.error) { engineRef.current = result.state; setEngineState(result.state); setQueueReads((logs) => [`${new Date().toLocaleTimeString("th-TH")}  COMPLETE → ${runId} returned according to lifecycle`, ...logs].slice(0, 8)); } };
  const resetRunQueue = () => { const board = buildBoard(rows, secretCode); const next = createQueueState(board); engineRef.current = next; setEngineState(next); setSelected([]); setQueueReads([`${new Date().toLocaleTimeString("th-TH")}  QUEUE_RESET → ล้างสถานะการรันและเริ่มคิวใหม่จากรายชื่อเดิม`]); };

  if (screen === "register") return <Registration operatorName={operatorName} rows={rows} updateRow={updateRow} addRow={addRow} onSubmit={submitBoard} onBack={() => setScreen("queue")} hasSubmitted={Boolean(state)} options={memberOptions} secretCode={secretCode} secretUnlocked={secretUnlocked} changeCodeOpen={changeCodeOpen} changeCodeError={changeCodeError} onCloseChangeCode={() => setChangeCodeOpen(false)} onChangeCode={async (oldCode, nextCode, confirmCode) => { if (!nextCode || nextCode !== confirmCode) return setChangeCodeError("รหัสใหม่สองช่องต้องตรงกันและห้ามว่าง"); try { await accessChangeMutation.mutateAsync({ currentCode: oldCode, nextCode }); setSecretCode(nextCode); setChangeCodeOpen(false); setChangeCodeError(""); setQueueReads((logs) => [`${new Date().toLocaleTimeString("th-TH")}  ACCESS_CODE_CHANGED → เปลี่ยนรหัสสำเร็จบน Server`, ...logs].slice(0, 8)); } catch { setChangeCodeError("รหัสเดิมไม่ถูกต้องหรือเชื่อมต่อ Server ไม่สำเร็จ"); } }} />;
  if (!state) return null;
  if (screen === "queue") return secretUnlocked ? <QueueDisplayBoard operatorName={operatorName} members={members} state={visibleQueueState ?? state} onNavigate={setScreen} /> : <QueueBoard members={members} state={state} onNavigate={setScreen} />;
  if (screen === "events") return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark" aria-label="queue slot mark"><span>[[</span><i /><span>]]</span></div><div><strong>team board</strong><span>engine event ledger</span></div></div><div className="sidebar-kicker">STEP 03 / EVENT LOG</div><nav className="nav-list"><button className="nav-item" onClick={() => setScreen("dashboard")}><Activity size={17} />Dashboard<span className="nav-count">05</span></button><button className="nav-item" onClick={() => setScreen("queue")}><ListFilter size={17} />{secretUnlocked ? "กระดาน Active" : "คิวตั้งต้น"}<span className="nav-count">{state.standby.length}</span></button><button className="nav-item" onClick={() => openRegistration()}><UsersRound size={17} />แก้คิวตั้งต้น<span className="nav-count">{members.length}</span></button><button className="nav-item active" onClick={() => setScreen("events")}><Clock3 size={17} />Event log<span className="nav-count">{state.events.length}</span></button></nav><div className="sidebar-bottom"><div className="system-status"><span className="pulse-dot" />Engine event ledger<span>engine v1</span></div><div className="side-note"><LockKeyhole size={15} />ตรวจ transition แบบ step-by-step</div></div></aside><main className="main-canvas event-page"><header className="topbar"><div><div className="eyebrow"><span className="live-dot" />ENGINE EVENT LEDGER</div><h1>ลำดับเหตุการณ์ของ Engine</h1><p>เลือกแต่ละ transition เพื่อ audit การเปลี่ยนสถานะและลำดับคิว</p></div><div className="header-actions"><button className="clear-button" onClick={() => setScreen("dashboard")}>กลับ Dashboard</button></div></header><EventLog events={state.events} replayIndex={replayIndex} onReplay={setReplayIndex} /></main></div>;

  const standbyCard = selectStandbyCardItems(visibleQueueState ?? state);
  const dpCard = members.filter((member) => !member.isShadow && member.role === "dp");
  const floatingCard = members.filter((member) => !member.isShadow && member.role === "floating");
  const qCard = members.filter((member) => !member.isShadow && (member.role === "ql" || member.role === "qf"));

  if (screen === "dashboard" && !secretUnlocked) return <QueueDisplayBoard operatorName={operatorName} members={members} state={visibleQueueState ?? state} onNavigate={setScreen} />;

  return <div className={`app-shell ${secretUnlocked ? "restricted-mode" : ""}`}><aside className="sidebar"><div className="brand"><div className="brand-mark" aria-label="queue slot mark"><span>[[</span><i /><span>]]</span></div><div><strong>team board</strong><span>daily registered guides</span></div></div><div className="sidebar-kicker">STEP 02 / RUN QUEUE</div><nav className="nav-list"><button className="nav-item active" onClick={() => setScreen("dashboard")}><Activity size={17} />Dashboard<span className="nav-count">05</span></button><button className="nav-item" onClick={() => setScreen("queue")}><ListFilter size={17} />คิวตั้งต้น<span className="nav-count">{state.standby.length}</span></button><button className="nav-item" onClick={() => openRegistration()}><UsersRound size={17} />แก้คิวตั้งต้น<span className="nav-count">{members.length}</span></button><button className="nav-item" onClick={() => setScreen("events")}><Clock3 size={17} />Event log<span className="nav-count">{state.events.length}</span></button></nav><div className="sidebar-bottom"><div className="system-status"><span className="pulse-dot" />Simulation mode<span>engine v1</span></div><div className="side-note"><LockKeyhole size={15} />ข้อมูลมาจากช่องกรอกเท่านั้น</div></div></aside><main className="main-canvas"><div className="run-queue-toolbar"><button className="clear-button" onClick={() => setScreen("queue")}><ListFilter size={15} />กลับคิวตั้งต้น</button><button className="dispatch-button reset-run-button" onClick={resetRunQueue}>↻ ล้างประวัติรันคิวใหม่</button></div><section className="cards-grid"><BoardCard index="02" title="คิว Standby หลัก" subtitle="ลำดับรันของ Te / Dp / Wk" items={standbyCard} empty="ไม่มีสมาชิกใน Standby" groupTeams /><div className="status-cards-row"><BoardCard index="03" title="สถานะ Dp / Drop List" subtitle="ยังอยู่ใน Standby และนับรอบคู่" items={dpCard} empty="ยังไม่มี Dp" showRounds compact /><BoardCard index="04" title="ตัวลอย ^" subtitle="สถานะรายบุคคล: ว่าง / กำลังทำงาน" items={floatingCard} empty="ไม่มีตัวลอย" showFloatingState activeIds={activeIds} compact /><BoardCard index="05" title="สถานะ QL & QF" subtitle="แสดงคู่เดียวกันพร้อมบทบาทคิวหลัก / คิวรอง" items={qCard} empty="ยังไม่มี QL หรือ QF" groupQv compact /></div></section><div className="workspace-grid"><section className={`panel active-panel ${secretUnlocked ? "" : "secure-feature-hidden"}`}><div className="panel-heading"><div><div className="section-index">06 / ACTIVE ZONE</div><h2>รายการที่กำลังทำงาน</h2></div><span className="badge badge-teal"><span className="pulse-dot small" />{activeRunCount} runs</span></div>{activeRunCount === 0 ? <div className="empty-state"><div className="empty-mark"><Zap size={23} /></div><strong>ยังไม่มีรายการ Active</strong><span>รายการจะแสดงตามสถานะจริงใน 2.3 Active</span></div> : <div className="active-list">{activeRuns.map((run) => <ActiveCard key={run.id} run={run} state={state} duration={duration} onComplete={() => complete(run.id)} />)}</div>}</section><section className={`panel directory-panel ${secretUnlocked ? "" : "secure-feature-hidden"}`} id="board"><div className="panel-heading"><div><div className="section-index">07 / STANDBY SELECTOR</div><h2>{mirrorMode ? "คืนคิวจากรายการ Active" : "สั่งรันคิวตามจำนวนทีม"}</h2></div><span className={`count-chip ${mirrorMode ? "mirror-chip" : "command-chip"}`}>{mirrorMode ? "ACTIVE RETURN" : `${commandUnits} ทีม`}</span></div><div className="duration-selector" aria-label="เลือกเวลาโปรแกรม"><div className="duration-selector-label"><Clock3 size={14} /><span>เวลาโปรแกรม</span><strong>{duration} วินาที</strong></div><div className="duration-options">{durationOptions.map((seconds) => <button type="button" key={seconds} className={`duration-option ${duration === seconds ? "active" : ""}`} onClick={() => setDuration(seconds)}>{seconds} วิ</button>)}</div></div><div className="mode-switch command-route-switch" aria-label="เลือกฟังก์ชันการทำงาน"><button type="button" className={`mode-button command-route-button ${mirrorMode ? "active" : ""}`} onClick={() => { setMirrorMode(true); setSelected([]); }}><ShieldCheck size={14} /><span><strong>Active Return</strong><small>คืนคิวจากรายการ Active</small></span></button><button type="button" className={`mode-button command-route-button ${!mirrorMode ? "active" : ""}`} onClick={() => { setMirrorMode(false); setSelected([]); }}><Play size={14} /><span><strong>Command Dispatch</strong><small>สั่งรันจากจำนวนทีม</small></span></button></div>{queueWarning && !mirrorMode && <div className="queue-warning" role="alert"><strong>ตรวจพบความไม่สอดคล้อง</strong><span>{queueWarning}</span></div>}{mirrorMode ? <><div className="mirror-event-field"><label>eventId สำหรับคืนคิว</label><input value={mirrorEventId} onChange={(event) => setMirrorEventId(event.target.value)} placeholder="เช่น board-2026-08-17-001" /><span>รายการซ้ำจะถูก ignore ไม่ dispatch ซ้ำ</span></div><div className="directory-list">{available.map((member) => <button className={`member-row ${selected.includes(member.id) ? "selected" : ""}`} key={member.id} onClick={() => setSelected((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])}><span className={`checkbox ${selected.includes(member.id) ? "checked" : ""}`}>{selected.includes(member.id) && <Check size={13} />}</span><TeamAvatar member={member} /><span className="member-copy"><strong className={member.isShadow ? "shadow-name" : ""}>{member.name}</strong><span>{member.isShadow ? "แสดงผลเท่านั้น · ไม่คำนวณ" : `${member.shift} · ${member.rounds} rounds`}</span></span><span className="state-tag state-standby">{roleLabel[member.role]}</span></button>)}</div><div className="directory-footer"><span><UserRound size={15} /> {members.length} คนจาก Daily Board</span><button className="clear-button" onClick={() => setSelected([])}>Clear selection</button></div><div className="selector-controls"><button className="dispatch-button" onClick={recordSelectedActive}><ShieldCheck size={15} />ส่งรายการ Active เพื่อคืนคิว</button></div></> : <><div className="panel-heading"><div><div className="section-index">06 / COMMAND DISPATCH</div><h2>สั่งรันคิวตามจำนวนทีม</h2><span className="card-subtitle">คำนวณจากคำสั่งนี้ ไม่อ่านรายการ Active เพื่อ dispatch</span></div><span className="count-chip command-chip">{commandUnits} ทีม</span></div><div className="command-form"><label><span>จำนวนคำสั่งทีม</span><input aria-label="จำนวนคำสั่งทีม" type="number" min="0.5" max="5.5" step="0.5" list="queue-unit-presets" value={commandUnits} onChange={(event) => setCommandUnits(event.target.value)} /><datalist id="queue-unit-presets"><option value="0.5" /><option value="1" /><option value="1.5" /><option value="2" /><option value="2.5" /><option value="3" /><option value="3.5" /><option value="4" /><option value="4.5" /><option value="5" /><option value="5.5" /></datalist></label><div className="command-presets" aria-label="ตัวเลือกจำนวนทีม">{[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5].map((units) => <button type="button" className={`command-preset ${commandUnits === String(units) ? "active" : ""}`} key={units} onClick={() => setCommandUnits(String(units))}>{units.toFixed(1)}</button>)}</div><button className="dispatch-button command-submit" onClick={runQueue}><Play size={15} />ส่งคำสั่งรันคิว</button></div><div className="command-note"><span>กฎเดิมยังทำงานครบ</span><small>Dp → ตัวลอย ^ → Split · ส่วน Active ใช้สำหรับคืนคิวผ่าน Active Return</small></div></>}</section></div></main></div>;
}

function BoardCard({ index, title, subtitle, items, empty, showRounds, showFloatingState, activeIds, groupTeams, groupQv, compact }: { index: string; title: string; subtitle: string; items: BoardMember[]; empty: string; showRounds?: boolean; showFloatingState?: boolean; activeIds?: Set<string>; groupTeams?: boolean; groupQv?: boolean; compact?: boolean }) {
  const groups = groupTeams ? groupStandbyCardItems(items) : groupQv ? Object.values(items.reduce<Record<string, BoardMember[]>>((acc, member) => { const key = member.qvId ?? member.partnerId ?? `qv-${member.id}`; (acc[key] ??= []).push(member); return acc; }, {})) : items.map((member) => [member]);
  const renderMember = (member: BoardMember) => <div className={`card-item ${groupQv ? "qv-member-row" : ""}`} key={member.id}><TeamAvatar member={member} />{groupQv ? <><span className={`qv-role-badge qv-role-${member.role}`}>{member.role === "ql" ? "QL" : "QF"}</span><div className="member-copy qv-member-copy"><strong className={member.isShadow ? "shadow-name" : ""}>{member.name}</strong></div></> : <><div className="member-copy"><strong className={member.isShadow ? "shadow-name" : ""}>{member.name}</strong><span>{member.isShadow ? "แสดงผลเท่านั้น · ไม่คำนวณ" : `${member.shift} · ${showRounds ? `${member.rounds} รอบคู่` : `${member.rounds} rounds`}`}</span></div><span className={`state-tag ${member.isShadow ? "state-shadow" : showFloatingState && activeIds?.has(member.id) ? "state-active" : member.role === "floating" ? "state-floating" : member.role === "dp" || member.role === "qf" ? "state-dp" : "state-active"}`}>{member.isShadow ? "ผู้ใช้เงา" : showFloatingState ? (activeIds?.has(member.id) ? "กำลังทำงาน" : "ว่าง") : roleLabel[member.role]}</span></>}</div>;
  return <section className={`panel board-card ${compact ? "board-card-compact" : ""}`}><div className="panel-heading"><div><div className="section-index">{index} / CARD</div><h2>{title}</h2><span className="card-subtitle">{subtitle}</span></div><span className="count-chip">{items.length} คน</span></div>{items.length === 0 ? <div className={`card-empty ${compact ? "card-empty-compact" : ""}`}>{empty}</div> : <div className="card-items">{groups.map((group, index) => group.length > 1 ? <div className={`team-group ${groupQv ? "qv-pair-group" : ""} ${groupTeams ? "horizontal-team-group" : ""}`} key={group.map((member) => member.id).join("-")}>{!groupQv && <div className="team-group-label"><span>{`TEAM ${String(index + 1).padStart(2, "0")}`}</span><b>Te คู่</b><em>{group.length} สมาชิก</em></div>}{group.map(renderMember)}</div> : <div className="individual-group" key={group[0].id}>{!groupQv && <div className="team-group-label"><span>{group[0].isShadow ? "SHADOW" : "INDIVIDUAL"}</span><b>{group[0].isShadow ? "แสดงผลเท่านั้น" : group[0].role === "floating" ? (showFloatingState && activeIds?.has(group[0].id) ? "กำลังทำงาน" : "ตัวลอย ^") : roleLabel[group[0].role]}</b></div>}{group.map(renderMember)}</div>)}</div>}</section>;
}

function EventLog({ events, replayIndex, onReplay }: { events: QueueEvent[]; replayIndex: number; onReplay: (index: number) => void }) {
  const selected = events[replayIndex] ?? events[0];
  const [detail, setDetail] = useState<QueueEvent | null>(null);
  const isMerge = (event: QueueEvent) => event.code.includes("MERGED") || event.code.includes("MERGE");
  return <>
    <section className="panel event-log-panel" id="event-replay"><div className="panel-heading"><div><div className="section-index">06A / EVENT REPLAY</div><h2>ลำดับเหตุการณ์ของ Engine</h2><span className="card-subtitle">เลือก Step เพื่อ audit ว่าเหตุใดคิวจึงเปลี่ยนสถานะ · กดรายการเพื่อดูรายละเอียด</span></div><span className="count-chip">{events.length} events</span></div>{events.length === 0 ? <div className="card-empty">ยังไม่มี transition</div> : <><div className="replay-toolbar"><button className="text-button" onClick={() => onReplay(Math.min(replayIndex + 1, events.length - 1))} disabled={replayIndex >= events.length - 1}>Step older</button><span>Replay step {replayIndex + 1} / {events.length}</span><button className="text-button" onClick={() => onReplay(Math.max(replayIndex - 1, 0))} disabled={replayIndex <= 0}>Step newer</button></div><div className="replay-focus"><strong>{selected?.code}</strong><span>{selected ? new Date(selected.at).toLocaleTimeString("th-TH") : "—"}</span><p>{selected?.message}</p>{selected && <button className="event-detail-link" onClick={() => setDetail(selected)}>เปิดรายละเอียดเต็ม</button>}</div><div className="event-log-list">{events.map((event, index) => <button className={`event-log-row ${index === replayIndex ? "latest" : ""} ${isMerge(event) ? "is-merge" : ""}`} onClick={() => { onReplay(index); setDetail(event); }} key={`${event.at}-${event.code}-${index}`}><span className="event-log-time">{new Date(event.at).toLocaleTimeString("th-TH")}</span><span className="event-log-code">{event.code}</span><span className="event-log-message">{event.message}</span>{event.memberIds?.length ? <span className="event-log-members">{event.memberIds.join(" · ")}</span> : null}{isMerge(event) && <span className="event-merge-badge">MERGE</span>}</button>)}</div></>}</section>
    {detail && <div className="event-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className={`event-modal ${isMerge(detail) ? "is-merge" : ""}`} role="dialog" aria-modal="true" aria-labelledby="event-modal-title"><div className="event-modal-header"><div><span className="section-index">EVENT DETAIL / {isMerge(detail) ? "MERGE TRACE" : "TRANSITION TRACE"}</span><h2 id="event-modal-title">{detail.code}</h2></div><button className="icon-button" aria-label="ปิดรายละเอียด Event Log" onClick={() => setDetail(null)}><X size={17} /></button></div><div className="event-modal-meta"><span>เวลา</span><strong>{new Date(detail.at).toLocaleString("th-TH")}</strong><span>สมาชิกที่เกี่ยวข้อง</span><strong>{detail.memberIds?.length ? detail.memberIds.join(" · ") : "ไม่มี member id"}</strong></div><div className="event-modal-message"><span>{isMerge(detail) ? "MERGE / รวมรายการ" : "เหตุผลของ transition"}</span><p>{detail.message}</p></div>{isMerge(detail) && <div className="event-merge-note">รายการนี้ระบุว่า Active หลายรายการถูก reconcile เป็นรายการเดียว เพื่อป้องกันชื่อซ้ำและรักษา assignment เดียวกัน</div>}</section></div>}
  </>;
}

function Registration({ operatorName, rows, updateRow, addRow, onSubmit, onBack, hasSubmitted, options, secretCode, secretUnlocked, changeCodeOpen, changeCodeError, onCloseChangeCode, onChangeCode }: { operatorName: string; rows: RegistrationRow[]; updateRow: (id: string, field: "slot1" | "slot2", value: string) => void; addRow: () => void; onSubmit: () => void | Promise<void>; onBack: () => void; hasSubmitted: boolean; options: QueueMemberOption[] | string[]; secretCode: string; secretUnlocked: boolean; changeCodeOpen: boolean; changeCodeError: string; onCloseChangeCode: () => void; onChangeCode: (oldCode: string, nextCode: string, confirmCode: string) => void }) {
  const [clockNow, setClockNow] = useState(() => new Date());
  const [oldCode, setOldCode] = useState("");
  const [nextCode, setNextCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [customNameFields, setCustomNameFields] = useState<Record<string, boolean>>({});
  const visibleRows = rows;
  useEffect(() => { const timer = window.setInterval(() => setClockNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  const memberOptions = Array.from(options.reduce<Map<string, QueueMemberOption>>((map, option) => {
    const normalized = typeof option === "string" ? { name: option.trim() } : { ...option, name: option.name.trim() };
    if (normalized.name && !map.has(normalized.name)) map.set(normalized.name, normalized);
    return map;
  }, new Map<string, QueueMemberOption>()).values());
  const renderNameField = (row: RegistrationRow, field: "slot1" | "slot2") => {
    const value = row[field];
    const fieldKey = `${row.id}:${field}`;
    const known = memberOptions.some(option => option.name === value);
    const customSelected = customNameFields[fieldKey] || (Boolean(value) && !known);
    const selectValue = customSelected ? CUSTOM_NAME_OPTION : value;
    return <div className="queue-name-field">
      <select aria-label={`${row.shift} ${field === "slot1" ? "Slot 1" : "Slot 2"} เลือกรายชื่อ`} value={selectValue} onChange={event => {
        const nextValue = event.target.value;
        setCustomNameFields(current => ({ ...current, [fieldKey]: nextValue === CUSTOM_NAME_OPTION }));
        updateRow(row.id, field, nextValue === CUSTOM_NAME_OPTION ? "" : nextValue);
      }}>
        <option value="">เลือกชื่อ Guide / Mechanic</option>
        {memberOptions.map(option => <option value={option.name} key={`${option.name}-${option.group ?? ""}`}>{option.name}{option.group ? ` · ${option.group}` : ""}</option>)}
        <option value={CUSTOM_NAME_OPTION}>กรอกชื่อเอง</option>
      </select>
      {customSelected && <input autoFocus aria-label={`${row.shift} ${field === "slot1" ? "Slot 1" : "Slot 2"} กรอกชื่อเอง`} value={value} onChange={event => updateRow(row.id, field, event.target.value)} placeholder="พิมพ์ชื่อผู้เข้าใช้งาน" />}
    </div>;
  };
  return <div className="app-shell initial-structure-app">
    <main className="initial-main-canvas">
      <header className="initial-page-header">
        <div className="initial-brand"><div className="initial-brand-mark">▦</div><div><span>QUEUE CONTROL</span><strong>ระบบจัดการคิว</strong></div></div>{hasSubmitted && <button className="clear-button" onClick={onBack}>← กลับหน้าก่อนหน้า</button>}
        <div className="initial-live"><i /> ระบบทำงานปกติ <b>เจ้าหน้าที่</b></div>
      </header>
      <section className="initial-content">
        <div className="initial-intro"><div><p>ศูนย์บริการ · ตารางคิว</p><h1>จัดการคิวผู้เข้าใช้งาน</h1><span>กรอกชื่อผู้เข้าใช้งานตามโครงสร้างตารางด้านล่าง</span></div><div className="initial-clock">(เวลาปัจจุบัน)<strong>{clockNow.toLocaleTimeString("th-TH", { hour12: false })}</strong></div></div>
        <section className="initial-board-card">
          <div className="initial-board-title"><div><small>✦ LIVE QUEUE BOARD</small><h2>คิวที่ 3 <em>(สถานะ)</em></h2></div><span>กรอกชื่อได้ทุกช่อง</span></div>
          <div className="initial-table-wrap">
            <div className="initial-table">
              <div className="initial-head"><div className="initial-left-head">คิวที่ 3 <small>(สถานะ)</small></div><div className="initial-system-head">ชื่อผู้เข้าใช้งานระบบ<small>{operatorName}</small></div><div className="initial-day-head">{clockNow.toLocaleDateString("th-TH", { weekday: "long" })}</div><div className="initial-now-head">(เวลาปัจจุบัน)<strong>{clockNow.toLocaleTimeString("th-TH", { hour12: false })}</strong></div></div>
              <div className="initial-time-head"><div>วันที่ {clockNow.toLocaleDateString("th-TH", { day: "numeric", month: "numeric", year: "2-digit" })}</div><div>08:00</div><div>10:00</div><div>13:00</div><div>15:00</div></div>
              <div className="initial-body"><div className="initial-name-panel"><div className="initial-name-grid">{visibleRows.map((row) => <div className="initial-name-row" key={row.id}>{renderNameField(row, "slot1")}{renderNameField(row, "slot2")}</div>)}</div><div className="initial-actions"><button className="initial-add" onClick={addRow}>＋<span>เพิ่ม<br />แถว</span></button><button className="initial-submit" onClick={onSubmit}>ส่ง<br />รายชื่อ <b>→</b></button></div></div><div className="initial-empty-column" /><div className="initial-empty-column" /><div className="initial-empty-column" /><div className="initial-empty-column" /></div>
              <div className="initial-footer">ⓘ แสดงรายการ active ตามช่วงเวลาที่มีข้อมูล หากไม่มีรายการจะเว้นพื้นที่โดยไม่ลากเส้นตารางต่อท้าย</div>
            </div>
          </div>
        </section>
      </section>
    </main>
    {changeCodeOpen && <ChangeCodeDialog oldCode={oldCode} nextCode={nextCode} confirmCode={confirmCode} error={changeCodeError} onOldCode={setOldCode} onNextCode={setNextCode} onConfirmCode={setConfirmCode} onClose={onCloseChangeCode} onConfirm={() => onChangeCode(oldCode, nextCode, confirmCode)} />}
  </div>;
}

function ChangeCodeDialog({ oldCode, nextCode, confirmCode, error, onOldCode, onNextCode, onConfirmCode, onClose, onConfirm }: { oldCode: string; nextCode: string; confirmCode: string; error: string; onOldCode: (value: string) => void; onNextCode: (value: string) => void; onConfirmCode: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  return <div className="dialog-backdrop" role="presentation"><section className="access-dialog" role="dialog" aria-modal="true" aria-labelledby="change-code-title"><div className="panel-heading"><div><div className="section-index">ACCESS CONTROL</div><h2 id="change-code-title">เปลี่ยนรหัสลับ</h2></div><button className="icon-button" onClick={onClose} aria-label="ปิด"><X size={17} /></button></div><label className="access-field">ยืนยันรหัสเดิม<input type="password" inputMode="numeric" autoComplete="current-password" value={oldCode} onChange={(event) => onOldCode(event.target.value)} autoFocus /></label><label className="access-field">รหัสใหม่<input type="password" inputMode="numeric" autoComplete="new-password" value={nextCode} onChange={(event) => onNextCode(event.target.value)} /></label><label className="access-field">ยืนยันรหัสใหม่<input type="password" inputMode="numeric" autoComplete="new-password" value={confirmCode} onChange={(event) => onConfirmCode(event.target.value)} /></label>{error && <p className="access-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="clear-button" onClick={onClose}>ยกเลิก</button><button className="dispatch-button" onClick={onConfirm}>ยืนยันการเปลี่ยนรหัส</button></div></section></div>;
}

function SourceActiveCard({ group, members }: { group: ActiveSessionNameGroup; members: BoardMember[] }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!group.startedAt || !group.durationMinutes) { setRemaining(null); return; }
    const endAt = Date.parse(group.startedAt) + group.durationMinutes * 60_000;
    if (!Number.isFinite(endAt)) { setRemaining(null); return; }
    const tick = () => setRemaining(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [group.startedAt, group.durationMinutes]);
  const visibleNames = group.memberNames.length ? group.memberNames : group.activeUserName ? [group.activeUserName] : [];
  return <article className="active-card" data-source-session-id={group.sessionId}>
    <div className="active-card-top"><span className="run-id">{group.sessionId}</span><span className="state-tag state-active">2.3 ACTIVE</span></div>
    <div className="active-members"><div className="active-team-label">SOURCE SESSION / 2.3 ACTIVE</div>
      {visibleNames.map((name, index) => {
        const member = members.find((item) => item.name.trim().toLocaleLowerCase("th-TH") === name.trim().toLocaleLowerCase("th-TH"));
        return <div className="active-member-line" key={`${group.sessionId}:${name}:${index}`}>{member ? <TeamAvatar member={member} /> : <span className="member-avatar">2.3</span>}<strong>{name}</strong><span>{member ? roleLabel[member.role] : "ต้นทาง"}</span></div>;
      })}
    </div>
    <div className="active-meta"><span>กำหนด {group.durationMinutes ? `${group.durationMinutes} นาที` : "ไม่ระบุเวลา"} · จาก 2.3 Active</span><span className="countdown"><Clock3 size={15} />{remaining === null ? "—" : formatClock(remaining)}</span></div>
    <small>อ่านสถานะจาก session ต้นทาง · จบรายการใน 2.3 แล้วการ์ดนี้จะหายไป</small>
  </article>;
}

function ActiveCard({ run, state, duration, onComplete }: { run: QueueState["active"][number]; state: QueueState; duration: number; onComplete: () => void }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => { const runDuration = run.durationSeconds ?? duration; const tick = () => setRemaining(Math.max(0, Math.ceil((run.startedAt + runDuration * 1000 - Date.now()) / 1000))); tick(); const timer = window.setInterval(tick, 500); return () => window.clearInterval(timer); }, [run.startedAt, run.durationSeconds, duration]);
  const activeMembers = run.memberIds.map((id) => state.members[id]).filter(Boolean) as BoardMember[];
  return <article className="active-card"><div className="active-card-top"><span className="run-id">{run.id}</span><span className="state-tag state-active">ACTIVE</span></div><div className="active-members"><div className="active-team-label">{run.mode === "split" ? "SPLIT RUN / สมาชิกแยกสถานะ" : activeMembers.length > 1 ? "TEAM RUN / สมาชิกในทีม" : "INDIVIDUAL RUN"}</div>{activeMembers.map((member) => <div className="active-member-line" key={member.id}><TeamAvatar member={member} /><strong className={member.isShadow ? "shadow-name" : ""}>{member.name}</strong><span>{roleLabel[member.role]}</span></div>)}{run.externalNames.map((name) => <div className="active-member-line external-line" key={`external-${name}`}><span className="member-avatar">EX</span><strong>{name}</strong><span>External</span></div>)}</div><div className="active-meta"><span>{run.mode === "split" ? "Wk / Dp split" : run.units === 0.5 ? "0.5 round" : "Full team"}</span><span className="countdown"><Clock3 size={15} />{formatClock(remaining)}</span></div><button className="clear-button" onClick={onComplete}>จำลอง Timer หมด / คืนคิว</button></article>;
}


function QueueDisplayBoard({ operatorName, members, state, onNavigate }: { operatorName: string; members: BoardMember[]; state: QueueState; onNavigate: (screen: "register" | "dashboard" | "queue" | "events") => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);

  // This screen is a read-only mirror of the canonical Standby queue. Do not
  // derive its order from boardOrder or regroup members from the full roster.
  const standbyMembers = state.standby
    .map((id) => state.members[id])
    .filter((member): member is BoardMember => Boolean(member));
  const primaryGroups = groupStandbyCardItems(selectStandbyCardItems(state));
  const activeIds = new Set(state.active.flatMap((run) => run.memberIds));
  // QL/QF leave Standby while airborne/Active, so mirror the Dashboard card
  // from the full roster rather than only state.standby.
  const ql = members.filter((member) => !member.isShadow && member.role === "ql");
  const qf = members.filter((member) => !member.isShadow && member.role === "qf");
  const dp = standbyMembers.filter((member) => member.role === "dp");
  // Match Dashboard's floating card: active floating members remain visible.
  const floating = members.filter((member) => !member.isShadow && member.role === "floating");
  const rows = primaryGroups.flatMap((group, groupIndex) => Array.from({ length: Math.ceil(group.length / 2) }, (_, rowIndex) => ({
    group,
    groupIndex,
    pair: group.slice(rowIndex * 2, rowIndex * 2 + 2),
  })));
  const names = (items: BoardMember[], showActive = false) => items.map((member) => <span key={member.id}>{member.name}{showActive && activeIds.has(member.id) ? " · กำลังทำงาน" : ""}</span>);
  return (
    <div className="queue-display-app">
      <header className="queue-display-topbar">
        <div className="queue-display-brand"><span>▦</span><div><small>QUEUE CONTROL</small><strong>ระบบจัดการคิว</strong></div></div>
        <div className="queue-display-status"><i /> ระบบทำงานปกติ <b>เจ้าหน้าที่</b></div>
      </header>
      <main className="queue-display-main">
        <div className="queue-display-actions">
          <button onClick={() => onNavigate("register")}>แก้ไขรายชื่อ</button>
          <button className="queue-display-primary" onClick={() => onNavigate("dashboard")}>ฟอร์มรันคิว</button>
        </div>
        <section className="queue-display-table-wrap">
          <div className="queue-display-table">
            <div className="queue-display-head">
              <div>คิวที่ 3 <small>(Te)</small></div>
              <div className="queue-display-system">ชื่อผู้เข้าใช้งานระบบ<small>{operatorName}</small></div>
              <div>{now.toLocaleDateString("th-TH", { weekday: "long" })}</div>
              <div>(เวลาปัจจุบัน)<strong>{now.toLocaleTimeString("th-TH", { hour12: false })}</strong></div>
            </div>
            <div className="queue-display-times">
              <div>วันที่ {now.toLocaleDateString("th-TH", { day: "numeric", month: "numeric", year: "2-digit" })}</div>
              <div>08:00</div><div>10:00</div><div>13:00</div><div>15:00</div>
            </div>
            <div className="queue-display-body">
              <div className="queue-display-left">
                <div className="queue-display-primary-list">
                  {rows.map(({ group, groupIndex, pair }) => {
                    const [left, right] = pair;
                    const key = pair.map((member) => member?.id ?? "empty").join("-");
                    const teamLabel = `TEAM ${String(groupIndex + 1).padStart(2, "0")} · Te คู่`;
                    const individualLabel = (member: BoardMember) => member.isShadow ? "SHADOW" : `INDIVIDUAL · ${roleLabel[member.role]}`;
                    return <div className="queue-display-pair" key={key}>
                      <div>{left && <><small>{group.length > 1 ? teamLabel : individualLabel(left)}</small><b>{left.name}</b></>}</div>
                      <div>{right && <><small>{roleLabel[right.role]}</small><b>{right.name}</b></>}</div>
                    </div>;
                  })}
                </div>
                <div className="queue-display-status-row"><div>QL{names(ql)}</div><div>QF{names(qf)}</div></div>
                <div className="queue-display-status-row queue-display-colored"><div className="queue-display-dp">Dp{names(dp)}</div><div className="queue-display-floating">^ <span>ตัวลอย{names(floating, true)}</span></div></div>
              </div>
              <div className="queue-display-empty" /><div className="queue-display-empty" /><div className="queue-display-empty" /><div className="queue-display-empty" />
            </div>
            <div className="queue-display-footer">แสดงจาก 02 / CARD คิว Standby หลัก · ลำดับทีมและตำแหน่ง Te / Dp / Wk</div>
          </div>
        </section>
      </main>
    </div>
  );
}
function QueueBoard({ members, state, onNavigate }: { members: BoardMember[]; state: QueueState; onNavigate: (screen: "register" | "dashboard" | "queue" | "events") => void }) {
  // Keep this view as a literal projection of the canonical queue. Each row
  // corresponds to exactly one consecutive entry in state.standby; no team
  // regrouping or board-order sorting is performed here.
  const standby = state.standby
    .map((id) => state.members[id])
    .filter((member): member is BoardMember => Boolean(member));
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark" aria-label="queue slot mark"><span>[[</span><i /><span>]]</span></div><div><strong>team board</strong><span>standby queue board</span></div></div><div className="sidebar-kicker">STEP 02 / QUEUE BOARD</div><nav className="nav-list"><button className="nav-item" onClick={() => onNavigate("dashboard")}><Activity size={17} />Dashboard<span className="nav-count">05</span></button><button className="nav-item active" onClick={() => onNavigate("queue")}><ListFilter size={17} />คิวตั้งต้น<span className="nav-count">{standby.length}</span></button><button className="nav-item" onClick={() => onNavigate("register")}><UsersRound size={17} />แก้คิวตั้งต้น<span className="nav-count">{members.length}</span></button><button className="nav-item" onClick={() => onNavigate("events")}><Clock3 size={17} />Event log<span className="nav-count">{state.events.length}</span></button></nav><div className="sidebar-bottom"><div className="system-status"><span className="pulse-dot" />Queue board live<span>engine v1</span></div><div className="side-note"><LockKeyhole size={15} />ลำดับปัจจุบันจาก engine</div></div></aside><main className="main-canvas queue-page"><header className="topbar"><div><div className="eyebrow"><span className="live-dot" />STANDBY QUEUE BOARD</div><h1>คิวตั้งต้นปัจจุบัน</h1><p>แสดงผลสะท้อนจากคิว Standby หลักตามลำดับจริง โดยไม่จัดกลุ่มหรือเรียงสมาชิกใหม่</p></div><div className="header-actions"><button className="clear-button" onClick={() => onNavigate("dashboard")}>กลับ Dashboard</button></div></header><section className="panel queue-board-panel"><div className="panel-heading"><div><div className="section-index">01 / CURRENT STANDBY ORDER</div><h2>ลำดับคิวที่กำลังรอ</h2><span className="card-subtitle">คิวหลัก {standby.length} รายการ · แสดงตามลำดับจริง</span></div><span className="count-chip">{standby.length} คน</span></div>{standby.length === 0 ? <div className="card-empty">ไม่มีสมาชิกใน Standby</div> : <div className="queue-board-list">{standby.map((member, index) => <div className="queue-team-row is-individual" key={member.id}><span className="queue-rank">{String(index + 1).padStart(2, "0")}</span><div className="queue-team-content"><div className="team-group-label"><span>{`STANDBY ${String(index + 1).padStart(2, "0")}`}</span><b>{member.isShadow ? "แสดงผลเท่านั้น" : roleLabel[member.role]}</b><em>{member.isShadow ? "ไม่เข้าร่วมการคำนวณ" : "รายการจากคิวหลัก"}</em></div><div className="horizontal-team-members"><div className="horizontal-member"><TeamAvatar member={member} /><div className="member-copy"><strong className={member.isShadow ? "shadow-name" : ""}>{member.name}</strong><span>{member.shift} · {member.rounds} รอบ</span></div><span className={`state-tag ${member.isShadow ? "state-shadow" : member.role === "dp" ? "state-dp" : member.role === "floating" ? "state-floating" : "state-active"}`}>{member.isShadow ? "ผู้ใช้เงา" : roleLabel[member.role]}</span></div></div></div></div>)}</div>}</section></main></div>;
}
export default function TeamBoardQueueModule(props: { activeNames?: string[]; activeGroups?: ActiveSessionNameGroup[]; activeEventId?: string; rosterNames?: string[]; standbyNames?: string[]; memberOptions?: QueueMemberOption[]; operatorName?: string; readOnly?: boolean }) {
  return <div className="team-board-queue-scope"><TeamBoardQueueContent {...props} /></div>;
}
