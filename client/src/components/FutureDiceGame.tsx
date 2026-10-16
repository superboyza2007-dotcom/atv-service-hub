import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import "./FutureDiceMiniPopup.css";

type Mode = "1v1" | "2v2";
type Slot = "A1" | "B1" | "A2" | "B2";
type Choice = "30/60" | "ไป/ไม่ไป";
type Team = "A" | "B";
type Phase = "choose" | "players" | "game";
const slotOrder: Slot[] = ["A1", "B1", "A2", "B2"];
const pipMap: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function apiMode(mode: Mode): "one_vs_one" | "two_vs_two" { return mode === "1v1" ? "one_vs_one" : "two_vs_two"; }
function apiOutcome(choice: Choice): "minutes" | "go_no_go" { return choice === "30/60" ? "minutes" : "go_no_go"; }
function displayMode(mode: "one_vs_one" | "two_vs_two"): Mode { return mode === "one_vs_one" ? "1v1" : "2v2"; }
function displayChoice(type: "minutes" | "go_no_go"): Choice { return type === "minutes" ? "30/60" : "ไป/ไม่ไป"; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง"; }
function dieFace(value?: number, rolling = false) {
  const dots = value == null ? [] : pipMap[value] ?? [];
  return <span className={`die ${rolling ? "rolling" : ""}`} aria-label={rolling ? "กำลังทอย" : value ? `ลูกเต๋า ${value}` : "ยังไม่ทอย"}>{Array.from({ length: 9 }, (_, index) => <i className={dots.includes(index) ? "pip" : ""} key={index} />)}</span>;
}
function slotTeam(slot: Slot): Team { return slot.startsWith("A") ? "A" : "B"; }
function selectedSlotCount(mode: Mode) { return mode === "1v1" ? 1 : 2; }
function sessionTime(value: Date | string) { return new Date(value).getTime(); }

export const FUTURE_DICE_OPEN_EVENT = "future-dice:open";
export function openFutureDiceApp() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FUTURE_DICE_OPEN_EVENT));
}

export default function FutureDiceGame() {
  const utils = trpc.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("choose");
  const [mode, setMode] = useState<Mode | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<Partial<Record<Slot, number>>>({});
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [dismissedSessionId, setDismissedSessionId] = useState<number | null>(null);
  const [latestSession, setLatestSession] = useState<unknown>(null);
  const [rollingSlot, setRollingSlot] = useState<Slot | null>(null);
  const [remoteRollingUntil, setRemoteRollingUntil] = useState<Partial<Record<Slot, number>>>({});
  const seenRollKeysRef = useRef(new Set<string>());
  const observedSessionRef = useRef<number | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const onOpen = () => { setError(""); setPhase("choose"); setIsOpen(true); };
    window.addEventListener(FUTURE_DICE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FUTURE_DICE_OPEN_EVENT, onOpen);
  }, []);

  const invitationQuery = trpc.futureDice.invitation.useQuery(undefined, {
    retry: false,
    refetchInterval: isOpen ? false : 1_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const identityQuery = trpc.directory.me.useQuery(undefined, { enabled: isOpen, retry: false, refetchOnWindowFocus: true });
  const rosterQuery = trpc.futureDice.roster.useQuery(undefined, { enabled: isOpen, retry: false, refetchInterval: 5_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true });
  const sessionsQuery = trpc.futureDice.list.useQuery({ limit: 30 }, {
    enabled: isOpen && activeSessionId == null,
    retry: false,
    refetchInterval: isOpen && activeSessionId == null ? 1_000 : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const sessionQuery = trpc.futureDice.get.useQuery({ sessionId: activeSessionId ?? 0 }, {
    enabled: isOpen && activeSessionId != null,
    retry: false,
    refetchInterval: isOpen && activeSessionId != null ? 250 : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const sessions = sessionsQuery.data ?? [];
  const roster = rosterQuery.data ?? [];
  const currentUserId = identityQuery.data && "id" in identityQuery.data ? identityQuery.data.id : undefined;
  const currentUserName = identityQuery.data?.name ?? "ผู้ชม";
  const openSession = sessions.find(session => session.status === "open");
  const awaitingChoiceSession = sessions.find(session => session.status === "completed" && session.winningTeam != null && !session.selectedOutcome);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  const recentResultSession = sessions.find(session => session.selectedOutcome && now - sessionTime(session.updatedAt) >= 0 && now - sessionTime(session.updatedAt) < 10_000);
  const selectedMode = mode ?? "1v1";
  const activeSession = activeSessionId != null
    ? sessionQuery.data ?? ((latestSession as (typeof sessions)[number] | null)?.id === activeSessionId ? latestSession as (typeof sessions)[number] : null) ?? sessions.find(session => session.id === activeSessionId) ?? null
    : openSession ?? awaitingChoiceSession ?? recentResultSession ?? null;

  useEffect(() => {
    if (!activeSession) return;
    if (observedSessionRef.current !== activeSession.id) {
      observedSessionRef.current = activeSession.id;
      seenRollKeysRef.current = new Set(activeSession.players.flatMap(player => player.rolls.map(roll => `${player.id}:${roll.round}:${roll.rolledAt}`)));
      setRemoteRollingUntil({});
      return;
    }
    const freshRolls = activeSession.players.flatMap(player => player.rolls.map(roll => ({ player, roll, key: `${player.id}:${roll.round}:${roll.rolledAt}` }))).filter(item => !seenRollKeysRef.current.has(item.key));
    if (!freshRolls.length) return;
    const nowAtClient = Date.now();
    setRemoteRollingUntil(current => {
      const next = { ...current };
      freshRolls.forEach(({ player, roll, key }) => {
        const serverStartedAt = sessionTime(roll.rolledAt);
        next[player.slot] = Math.max(serverStartedAt + 1_350, nowAtClient + 250);
        seenRollKeysRef.current.add(key);
      });
      return next;
    });
  }, [activeSession?.id, activeSession?.updatedAt]);

  const invitationSessionId = invitationQuery.data?.sessionId;
  useEffect(() => {
    if (!invitationSessionId || isOpen || invitationSessionId === dismissedSessionId) return;
    setActiveSessionId(invitationSessionId);
    setLatestSession(null);
    setPhase("game");
    setError("");
    setIsOpen(true);
  }, [invitationSessionId, isOpen, dismissedSessionId]);

  useEffect(() => {
    if (!isOpen) return;
    const sharedSession = openSession ?? awaitingChoiceSession ?? recentResultSession;
    if (!sharedSession) return;
    setActiveSessionId(sharedSession.id);
    setLatestSession(sharedSession);
    setMode(displayMode(sharedSession.gameMode));
    setChoice(displayChoice(sharedSession.outcomeType));
    setPhase("game");
    setError("");
  }, [isOpen, openSession?.id, awaitingChoiceSession?.id, recentResultSession?.id]);

  useEffect(() => {
    if (!isOpen || !activeSession?.selectedOutcome) return;
    const ageMs = Date.now() - sessionTime(activeSession.updatedAt);
    const remainingMs = Math.max(3_000, 8_000 - ageMs);
    const sessionId = activeSession.id;
    const timer = window.setTimeout(() => {
      setDismissedSessionId(sessionId);
      setIsOpen(false);
      setActiveSessionId(null);
      setLatestSession(null);
      setSelectedPlayers({});
      setPhase("choose");
      setMode(null);
      setChoice(null);
      setError("");
    }, remainingMs);
    return () => window.clearTimeout(timer);
  }, [isOpen, activeSession?.id, activeSession?.selectedOutcome, activeSession?.updatedAt]);

  const createMutation = trpc.futureDice.create.useMutation({
    onSuccess: () => { void utils.futureDice.list.invalidate(); },
    onError: cause => setError(errorMessage(cause)),
  });
  const rollMutation = trpc.futureDice.roll.useMutation({
    onSuccess: session => { setLatestSession(session); setActiveSessionId(session.id); void utils.futureDice.get.invalidate({ sessionId: session.id }); void utils.futureDice.list.invalidate(); },
    onError: cause => setError(errorMessage(cause)),
  });
  const chooseMutation = trpc.futureDice.chooseOutcome.useMutation({
    onSuccess: session => { setLatestSession(session); setActiveSessionId(session.id); void utils.futureDice.get.invalidate({ sessionId: session.id }); void utils.futureDice.list.invalidate(); },
    onError: cause => setError(errorMessage(cause)),
  });
  const cancelMutation = trpc.futureDice.cancel.useMutation({
    onSuccess: () => { void utils.futureDice.list.invalidate(); },
    onError: cause => setError(errorMessage(cause)),
  });

  const visibleSlots = selectedMode === "1v1" ? ["A1", "B1"] as Slot[] : slotOrder;
  const chosenIds = visibleSlots.map(slot => selectedPlayers[slot]).filter((id): id is number => id != null);
  const hasDistinctCompleteRoster = chosenIds.length === visibleSlots.length && new Set(chosenIds).size === visibleSlots.length;
  const teamHasOnlinePlayer = (team: Team) => visibleSlots.some(slot => slotTeam(slot) === team && roster.some(user => user.id === selectedPlayers[slot] && user.isOnline));
  const canCreate = rosterQuery.isSuccess && sessionsQuery.isSuccess && hasDistinctCompleteRoster && (selectedMode === "1v1" || (teamHasOnlinePlayer("A") && teamHasOnlinePlayer("B"))) && !createMutation.isPending;
  const isBusy = createMutation.isPending || rollMutation.isPending || chooseMutation.isPending || cancelMutation.isPending;
  const actorPlayer = activeSession?.players.find(player => player.directoryUserId === currentUserId);
  const target = activeSession?.status === "open" ? activeSession.currentPlayer : null;
  const isCurrentPlayer = Boolean(target && currentUserId != null && target.directoryUserId === currentUserId);
  const mayCoverOfflineTeammate = Boolean(target && activeSession?.gameMode === "two_vs_two" && !target.isOnline && actorPlayer && actorPlayer.team === target.team && actorPlayer.directoryUserId !== target.directoryUserId);
  const canRoll = Boolean(activeSession?.status === "open" && target && (isCurrentPlayer || mayCoverOfflineTeammate) && !isBusy && !rollingSlot);
  const isAwaitingWinnerChoice = Boolean(activeSession?.status === "completed" && activeSession.winningTeam != null && activeSession.selectedOutcome == null);
  const isCancellableSession = Boolean(activeSession?.status === "open" || isAwaitingWinnerChoice);
  const canReset = Boolean(isCancellableSession && (actorPlayer || identityQuery.data?.special || identityQuery.data?.group?.includes("หัวหน้า")));
  const staleActiveSession = Boolean(isCancellableSession && activeSession && !activeSession.players.some(player => player.isOnline) && now - sessionTime(activeSession.updatedAt) >= 30_000);
  const winnerMembers = activeSession?.winningTeam ? activeSession.players.filter(player => player.team === activeSession.winningTeam) : [];
  const canChoose = Boolean(currentUserId != null && winnerMembers.some(player => player.directoryUserId === currentUserId));
  const expectedSlotCount = activeSession ? (activeSession.gameMode === "one_vs_one" ? 2 : 4) : (selectedMode === "1v1" ? 2 : 4);
  const previousRoundRolls = activeSession?.players.flatMap(player => player.rolls.filter(rollItem => rollItem.round === (activeSession.currentRound - 1)).map(rollItem => ({ player, roll: rollItem }))) ?? [];
  const previousRoundScore = previousRoundRolls.reduce((scores, item) => { scores[item.player.team] += item.roll.total; return scores; }, { A: 0, B: 0 });
  const wasTiebreak = Boolean(activeSession && activeSession.currentRound > 1 && previousRoundRolls.length === expectedSlotCount && previousRoundScore.A === previousRoundScore.B);

  const closePopup = () => {
    setDismissedSessionId(activeSessionId);
    setIsOpen(false);
    setActiveSessionId(null);
    setLatestSession(null);
    setSelectedPlayers({});
    setPhase("choose");
    setMode(null);
    setChoice(null);
    setError("");
  };

  const resetGame = async () => {
    if (!activeSession || !isCancellableSession || (!canReset && !staleActiveSession) || cancelMutation.isPending) return;
    setError("");
    try {
      await cancelMutation.mutateAsync({ sessionId: activeSession.id });
      closePopup();
    } catch {
      // The mutation hook supplies the server's message.
    }
  };

  const leaveGame = () => {
    if (isCancellableSession && (canReset || staleActiveSession)) {
      void resetGame();
      return;
    }
    closePopup();
  };

  useEffect(() => {
    if (!isOpen || activeSession?.status !== "cancelled") return;
    closePopup();
  }, [isOpen, activeSession?.status]);

  const choosePlayer = (slot: Slot, value: string) => {
    setSelectedPlayers(current => {
      const next = { ...current };
      if (!value) delete next[slot];
      else next[slot] = Number(value);
      return next;
    });
    setError("");
  };

  const startSession = async () => {
    if (!mode || !choice) {
      setError("กรุณาเลือกประเภทผลลัพธ์และโหมดก่อน");
      return;
    }
    if (!hasDistinctCompleteRoster) {
      setError("กรุณาเลือกผู้เล่นให้ครบและไม่ซ้ำกัน");
      return;
    }
    if (mode === "2v2" && (!teamHasOnlinePlayer("A") || !teamHasOnlinePlayer("B"))) {
      setError("แต่ละทีมต้องมีผู้เล่นมาอย่างน้อย 1 คน");
      return;
    }
    setError("");
    try {
      const session = await createMutation.mutateAsync({ gameMode: apiMode(mode), outcomeType: apiOutcome(choice), directoryUserIds: visibleSlots.map(slot => selectedPlayers[slot]!) });
      setActiveSessionId(session.id);
      setLatestSession(session);
      setPhase("game");
    } catch {
      // The mutation hook supplies the server's message.
    }
  };

  const roll = async () => {
    if (!activeSession || !target || !canRoll) return;
    setError("");
    setRollingSlot(target.slot);
    try {
      const session = await rollMutation.mutateAsync({ sessionId: activeSession.id });
      await new Promise(resolve => window.setTimeout(resolve, 1_350));
      setLatestSession(session);
      setActiveSessionId(session.id);
    } catch {
      // The mutation hook supplies the server's message.
    } finally {
      setRollingSlot(null);
    }
  };

  const selectResult = async (result: string) => {
    if (!activeSession || !canChoose || isBusy) return;
    setError("");
    try {
      await chooseMutation.mutateAsync({ sessionId: activeSession.id, selectedOutcome: result });
      closePopup();
    } catch {
      // The mutation hook supplies the server's message.
    }
  };

  const chooseView = () => <div className="body">
    <div className="title"><h1>สร้างรายการทอย</h1><span className="step">1/3</span></div>
    <p className="label">ประเภทผลลัพธ์</p>
    <div className="grid2"><button type="button" className={`pick ${choice === "30/60" ? "selected" : ""}`} onClick={() => setChoice("30/60")}>30/60</button><button type="button" className={`pick ${choice === "ไป/ไม่ไป" ? "selected" : ""}`} onClick={() => setChoice("ไป/ไม่ไป")}>ไป/ไม่ไป</button></div>
    <p className="label">โหมด</p>
    <div className="grid2"><button type="button" className={`pick mode ${mode === "1v1" ? "selected" : ""}`} onClick={() => { setMode("1v1"); setSelectedPlayers({}); }}>1vs1</button><button type="button" className={`pick mode ${mode === "2v2" ? "selected" : ""}`} onClick={() => { setMode("2v2"); setSelectedPlayers({}); }}>2vs2</button></div>
    {!sessionsQuery.isSuccess && <p className="hint" role="status">กำลังเชื่อมต่อ Session จาก Server…</p>}
    {sessionsQuery.isError && <p className="error" role="alert">โหลด Session จาก Server ไม่สำเร็จ กรุณาลองใหม่</p>}
    {rosterQuery.isError && <p className="error" role="alert">โหลดรายชื่อจากสารบบผู้ใช้งานไม่ได้</p>}
    <button type="button" className="primary" onClick={() => { if (!mode || !choice) { setError("กรุณาเลือกประเภทผลลัพธ์และโหมดก่อน"); return; } setPhase("players"); setError(""); }} disabled={!mode || !choice || !sessionsQuery.isSuccess || !rosterQuery.isSuccess || Boolean(openSession || awaitingChoiceSession)}>ถัดไป</button>
    {(openSession || awaitingChoiceSession) && <p className="hint">มี Session ที่ยังดำเนินอยู่ ระบบจะเปิดรายการเดิมให้ทุกคนเห็นร่วมกัน</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;

  const playerSlot = (team: Team, index: number) => {
    const slot = `${team}${index + 1}` as Slot;
    const selectedId = selectedPlayers[slot];
    return <label className="slot" key={slot}><span>ผู้เล่น {slot}</span><select aria-label={`ผู้เล่น ${slot}`} value={selectedId ?? ""} onChange={event => choosePlayer(slot, event.target.value)}><option value="">เลือกรายชื่อ</option>{roster.map(user => { const selectedElsewhere = visibleSlots.some(other => other !== slot && selectedPlayers[other] === user.id); return <option value={user.id} key={user.id} disabled={selectedElsewhere}>{user.name} · {user.isOnline ? "มาแล้ว" : "ไม่มา"}</option>; })}</select></label>;
  };

  const playersView = () => {
    const count = selectedSlotCount(selectedMode);
    return <div className="body">
      <div className="setup-head"><button type="button" className="back" onClick={() => { setPhase("choose"); setError(""); }}>←</button><div><small>ระบุชื่อ</small><h1>เลือกผู้เล่น</h1></div></div>
      <div className="setup"><div className="team"><div className="team-name">ทีม A</div>{Array.from({ length: count }, (_, index) => playerSlot("A", index))}</div><div className="mid"><div className="mode-stamp">{selectedMode}</div><button type="button" className="start" onClick={() => void startSession()} disabled={!canCreate}>{createMutation.isPending ? "กำลังเริ่ม…" : "เริ่ม"}</button></div><div className="team b"><div className="team-name">ทีม B</div>{Array.from({ length: count }, (_, index) => playerSlot("B", index))}</div></div>
      <p className="hint">ผู้สร้างไม่จำเป็นต้องเป็นผู้เล่น · คนที่มีชื่อเท่านั้นจึงกดทอยได้{selectedMode === "2v2" ? " · ทีมละ 1 คนมาแล้วก็เริ่มได้" : ""}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {rosterQuery.isLoading && <p className="hint" role="status">กำลังโหลดรายชื่อผู้ใช้…</p>}
    </div>;
  };

  const gameView = () => {
    if (!activeSession) return <div className="body" role="status"><h1>กำลังโหลด Session…</h1></div>;
    const gameMode = displayMode(activeSession.gameMode);
    const isFinished = activeSession.status === "completed";
    const winnerTeam = activeSession.winningTeam;
    const loserTeam = winnerTeam === "A" ? "B" : winnerTeam === "B" ? "A" : null;
    const winnerNames = winnerMembers.map(player => player.name).join(" และ ");
    const loserNames = loserTeam ? activeSession.players.filter(player => player.team === loserTeam).map(player => player.name).join(" และ ") : "";
    const winnerScore = winnerTeam ? activeSession.scores[winnerTeam] : 0;
    const loserScore = loserTeam ? activeSession.scores[loserTeam] : 0;
    const winnerLabel = winnerTeam ? `${gameMode === "2v2" ? `ทีม ${winnerTeam} (${winnerNames})` : winnerNames || `ผู้เล่น ${winnerTeam}`} ชนะ ${winnerScore} แต้ม` : "";
    const choices = activeSession.outcomeType === "minutes" ? ["30", "60"] : ["ไป", "ไม่ไป"];
    return <div className="body">
      <div className="game-head"><div><small>{gameMode}</small><h1>{isFinished ? "ผลการทอย" : "ทอยลูกเต๋า"}</h1></div><span className="round">{activeSession.currentRound > 1 ? `รอบตัดสิน ${activeSession.currentRound}` : `รอบ ${activeSession.currentRound}`}</span></div>
      <div className="game-controls"><button type="button" className="back-app" onClick={leaveGame} disabled={cancelMutation.isPending}>{isCancellableSession && (canReset || staleActiveSession) ? "ยกเลิกรายการและเริ่มใหม่" : "กลับหน้าก่อนหน้า"}</button>{isCancellableSession && (canReset || staleActiveSession) && <button type="button" className="reset-game" onClick={() => void resetGame()} disabled={isBusy}>{cancelMutation.isPending ? "กำลังยกเลิก…" : staleActiveSession && !canReset ? "ยกเลิกเกมค้างเพื่อเริ่มรายการใหม่" : "รีเซ็ต / ยกเลิกการทอย"}</button>}</div>
      {gameMode === "2v2" && <div className="score"><span>ทีม A <b>{activeSession.scores.A}</b></span><span>—</span><span>ทีม B <b>{activeSession.scores.B}</b></span></div>}
      <div className="table">{(["A", "B"] as const).map(team => <div className={`side ${team === "B" ? "b" : ""}`} key={team}><div className="side-head">{gameMode === "1v1" ? (team === "A" ? "ผู้เล่น A" : "ผู้เล่น B") : `ทีม ${team}`}</div>{activeSession.players.filter(player => player.team === team).map(player => {
        const rollResult = player.rolls.find(rollItem => rollItem.round === activeSession.currentRound);
        const isActive = target?.id === player.id && activeSession.status === "open";
        const isRolling = rollingSlot === player.slot || (remoteRollingUntil[player.slot] ?? 0) > now;
        const shownRoll = isRolling ? undefined : rollResult;
        const history = player.rolls.filter(rollItem => rollItem.round < activeSession.currentRound).map(rollItem => `รอบ ${rollItem.round}: ${rollItem.dieOne}+${rollItem.dieTwo}`).join(" · ");
        return <div className={`player ${isActive ? "active" : ""}`} key={player.id}><div className="p-top"><span className="p-name">{player.name}</span><span className={`p-status ${shownRoll ? "done" : ""}`}>{shownRoll ? "ทอยแล้ว" : isActive ? "ถึงตา" : "รอการทอย"}</span></div><div className="dice-row">{dieFace(shownRoll?.dieOne, isRolling)}{dieFace(shownRoll?.dieTwo, isRolling)}{shownRoll && <span className="total">รวม {shownRoll.total}</span>}</div>{shownRoll && shownRoll.rolledByName !== player.name && <span className="sub">{shownRoll.rolledByName} ทอยแทน {player.name}</span>}{history && <span className="player-history">{history}</span>}</div>;
      })}</div>)}</div>
      {wasTiebreak && <p className="round-tie-note">ผลเสมอ · ทอยตัดสินใหม่ในรอบนี้</p>}
      {activeSession.status === "cancelled" ? <div className="action result"><h2>รายการนี้ถูกยกเลิก</h2><button type="button" className="primary" onClick={() => { setActiveSessionId(null); setLatestSession(null); setSelectedPlayers({}); setMode(null); setChoice(null); setPhase("choose"); }}>เริ่มรายการใหม่</button></div>
        : isFinished ? <div className="action result"><h2>{winnerLabel}</h2>{winnerTeam && loserTeam && <p>ผู้แพ้: {gameMode === "2v2" ? `ทีม ${loserTeam} (${loserNames})` : loserNames || `ผู้เล่น ${loserTeam}`} ได้ {loserScore} แต้ม</p>}<p>คะแนน: ทีม A {activeSession.scores.A} · ทีม B {activeSession.scores.B}</p>{activeSession.selectedOutcome ? <div className="announcement">ผลลัพธ์ผู้ชนะเลือก: {activeSession.selectedOutcome}<br /><small>ประกาศจาก Server แล้ว</small></div> : canChoose ? <><p>เลือกผลลัพธ์</p><div className="choices">{choices.map(result => <button type="button" className="choice" onClick={() => selectResult(result)} disabled={isBusy} key={result}>{result}</button>)}</div></> : <p>รอสมาชิกทีมผู้ชนะเลือกผล</p>}</div>
          : <div className="action">{!actorPlayer ? <p className="viewer">กำลังดูผล · กดเล่นไม่ได้</p> : canRoll ? <><p className="note">{isCurrentPlayer ? "ถึงตาคุณทอย" : `ทอยแทน ${target?.name}`}</p><button type="button" className="roll" onClick={() => void roll()} disabled={isBusy || Boolean(rollingSlot)}>{isBusy || rollingSlot ? "กำลังทอย…" : "ทอยลูกเต๋า"}</button></> : <p className="note">{target?.isOnline ? `รอ ${target.name} ทอยจากบัญชีของตน` : target ? `รอสมาชิกทีมเดียวกันที่ออนไลน์ทอยแทน ${target.name}` : "รอผลลัพธ์"}</p>}</div>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>;
  };

  const currentRole = activeSession ? actorPlayer ? "ผู้เล่น" : "ผู้ชม" : "ผู้สร้าง / ผู้ชม";
  if (!isOpen) return null;
  return <div id="future-dice-mini-root">
    <div className="future-dice-mini-overlay"><div className="app-shell"><section className="mini" role="dialog" aria-modal="true" aria-label="แอปทอยลูกเต๋าเต็มหน้าจอ"><header className="top"><b className="logo">ทอย</b><small>ทอยลูกเต๋า · 1vs1 / 2vs2</small><button type="button" className="close" onClick={closePopup} aria-label="ปิดและกลับหน้าก่อนหน้า">×</button></header>{phase === "choose" ? chooseView() : phase === "players" ? playersView() : gameView()}<footer className="footer">{currentUserName} · {currentRole}</footer></section></div></div>
  </div>;
}
