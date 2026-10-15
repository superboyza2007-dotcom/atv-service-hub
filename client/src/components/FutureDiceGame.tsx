import { useEffect, useMemo, useState } from "react";
import { CircleAlert, Dices, Plus, RefreshCw, RotateCcw, Trophy, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

type DirectoryUser = { id: number; name: string; group?: string };
type GameMode = "one_vs_one" | "two_vs_two";
type OutcomeType = "minutes" | "go_no_go";
type Slot = "A1" | "B1" | "A2" | "B2";

const slotsForMode = (mode: GameMode): Slot[] => mode === "one_vs_one" ? ["A1", "B1"] : ["A1", "B1", "A2", "B2"];
const outcomeChoices = (outcomeType: OutcomeType) => outcomeType === "minutes" ? ["30", "60"] : ["ไป", "ไม่ไป"];
const modeLabel = (mode: GameMode) => mode === "one_vs_one" ? "1v1" : "2v2";

function formatDate(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "ทำรายการไม่สำเร็จ กรุณาลองใหม่";
}

export default function FutureDiceGame({ users }: { users: DirectoryUser[] }) {
  const utils = trpc.useUtils();
  const [gameMode, setGameMode] = useState<GameMode>("one_vs_one");
  const [outcomeType, setOutcomeType] = useState<OutcomeType>("minutes");
  const [selectedPlayers, setSelectedPlayers] = useState<Record<Slot, string>>({ A1: "", B1: "", A2: "", B2: "" });
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const sessionsQuery = trpc.futureDice.list.useQuery(undefined, { retry: false, refetchInterval: 1_000, refetchOnWindowFocus: true });
  const createMutation = trpc.futureDice.create.useMutation({
    onSuccess: async session => {
      setSelectedSessionId(session.id);
      setNotice(`เริ่มเกม #${session.id} แล้ว · รอ ${session.currentPlayer?.name ?? "ผลเกม"}`);
      await utils.futureDice.list.invalidate();
    },
    onError: error => setNotice(errorMessage(error)),
  });
  const rollMutation = trpc.futureDice.roll.useMutation({
    onSuccess: async session => {
      setSelectedSessionId(session.id);
      setNotice(session.status === "completed" ? "เกมจบแล้ว ตรวจผลและเลือกผลลัพธ์ได้" : `บันทึกผลทอยแล้ว · เทิร์นถัดไป ${session.currentPlayer?.name ?? "—"}`);
      await utils.futureDice.list.invalidate();
    },
    onError: error => setNotice(errorMessage(error)),
  });
  const chooseOutcomeMutation = trpc.futureDice.chooseOutcome.useMutation({
    onSuccess: async session => {
      setNotice(`บันทึกผลลัพธ์ ${session.selectedOutcome} สำหรับทีม ${session.winningTeam} แล้ว`);
      await utils.futureDice.list.invalidate();
    },
    onError: error => setNotice(errorMessage(error)),
  });
  const cancelMutation = trpc.futureDice.cancel.useMutation({
    onSuccess: async session => {
      setNotice(`ยกเลิกเกม #${session.id} แล้ว`);
      await utils.futureDice.list.invalidate();
    },
    onError: error => setNotice(errorMessage(error)),
  });

  const sessions = sessionsQuery.data ?? [];
  const openSession = sessions.find(session => session.status === "open");
  const selectedSession = sessions.find(session => session.id === selectedSessionId);
  const session = openSession ?? selectedSession ?? sessions[0];
  const slots = useMemo(() => slotsForMode(gameMode), [gameMode]);
  const playerIds = slots.map(slot => Number(selectedPlayers[slot])).filter(id => Number.isInteger(id) && id > 0);
  const hasDuplicatePlayer = new Set(playerIds).size !== playerIds.length;
  const canCreate = !openSession && playerIds.length === slots.length && !hasDuplicatePlayer && !createMutation.isPending;
  const busy = createMutation.isPending || rollMutation.isPending || chooseOutcomeMutation.isPending || cancelMutation.isPending;

  useEffect(() => {
    if (openSession) setSelectedSessionId(openSession.id);
    else if (!selectedSessionId && sessions[0]) setSelectedSessionId(sessions[0].id);
  }, [openSession?.id, sessions[0]?.id, selectedSessionId]);

  const changeMode = (mode: GameMode) => {
    setGameMode(mode);
    setSelectedPlayers({ A1: "", B1: "", A2: "", B2: "" });
    setNotice("");
  };

  const createGame = () => {
    if (!canCreate) return;
    setNotice("");
    createMutation.mutate({ gameMode, outcomeType, directoryUserIds: playerIds });
  };

  return <section className="future-dice-panel" aria-label="Future เกมทอยลูกเต๋า">
    <div className="future-dice-heading">
      <div>
        <p>FUTURE / SERVER-OWNED GAME</p>
        <h2>เกมทอยลูกเต๋า</h2>
        <span>ผลสุ่ม ลำดับเทิร์น และประวัติอยู่บน Server · อุปกรณ์ทุกเครื่องอ่านสถานะเดียวกัน</span>
      </div>
      <Dices size={28} />
    </div>

    {sessionsQuery.isLoading ? <div className="future-dice-empty" role="status">กำลังโหลดเกมจาก Server…</div> : sessionsQuery.isError ? <div className="future-dice-error" role="alert"><CircleAlert size={16} /> เชื่อมต่อ Future Dice ไม่ได้ <button type="button" onClick={() => void sessionsQuery.refetch()}><RefreshCw size={14} /> ลองใหม่</button></div> : <>
      {!openSession && <section className="future-dice-create" aria-labelledby="future-dice-create-title">
        <div className="future-dice-create-heading"><div><p>NEW SESSION</p><h3 id="future-dice-create-title">เริ่มเกมใหม่</h3></div><Plus size={18} /></div>
        <div className="future-dice-options">
          <fieldset><legend>โหมด</legend><div className="future-choice-row">{(["one_vs_one", "two_vs_two"] as const).map(mode => <button type="button" className={gameMode === mode ? "selected" : ""} onClick={() => changeMode(mode)} key={mode}>{modeLabel(mode)}</button>)}</div></fieldset>
          <fieldset><legend>ผลลัพธ์ที่ให้เลือกหลังเกม</legend><div className="future-choice-row">{(["minutes", "go_no_go"] as const).map(type => <button type="button" className={outcomeType === type ? "selected" : ""} onClick={() => setOutcomeType(type)} key={type}>{type === "minutes" ? "30 / 60" : "ไป / ไม่ไป"}</button>)}</div></fieldset>
        </div>
        <div className="future-player-picker">
          {slots.map(slot => <label key={slot}><span><b>{slot}</b> ทีม {slot.startsWith("A") ? "A" : "B"}</span><select value={selectedPlayers[slot]} onChange={event => { setSelectedPlayers(current => ({ ...current, [slot]: event.target.value })); setNotice(""); }}><option value="">เลือกผู้เล่น</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}{user.group ? ` · ${user.group}` : ""}</option>)}</select></label>)}
        </div>
        {hasDuplicatePlayer && <p className="future-dice-validation" role="alert">ผู้เล่นหนึ่งคนเลือกซ้ำในเกมเดียวกันไม่ได้</p>}
        {!users.length && <p className="future-dice-validation" role="alert">ยังไม่มีรายชื่อผู้ใช้งานในสารบบ จึงเริ่มเกมไม่ได้</p>}
        <button type="button" className="future-roll-button" onClick={createGame} disabled={!canCreate}><Plus size={18} /> {createMutation.isPending ? "กำลังสร้างเกม…" : "เริ่มเกมบน Server"}</button>
      </section>}

      {session ? <section className={`future-dice-session is-${session.status}`} aria-live="polite">
        <div className="future-session-meta"><div><span>GAME #{session.id}</span><b>{session.status === "open" ? "กำลังเล่น" : session.status === "completed" ? "จบเกม" : "ยกเลิก"}</b></div><small>{modeLabel(session.gameMode)} · {session.outcomeType === "minutes" ? "30 / 60" : "ไป / ไม่ไป"} · เริ่ม {formatDate(session.createdAt)}</small></div>
        <div className="future-dice-board">{session.players.map(player => <div className={`future-dice-player ${session.currentPlayer?.id === player.id ? "active" : ""}`} key={player.id}><div><b>{player.slot}</b><span>{player.name}</span></div><strong>{player.roll ? `${player.roll.dieOne} + ${player.roll.dieTwo}` : "— + —"}</strong><small>{player.roll ? `รวม ${player.roll.total} · ${player.roll.rolledByName}` : session.currentPlayer?.id === player.id ? "ถึงตา" : "รอการทอย"}</small></div>)}</div>
        <div className="future-score-row"><span>ทีม A <b>{session.scores.A}</b></span><span>ทีม B <b>{session.scores.B}</b></span></div>

        {session.status === "open" && <div className="future-session-actions"><button type="button" className="future-roll-button" onClick={() => rollMutation.mutate({ sessionId: session.id })} disabled={busy}><Dices size={18} /> {rollMutation.isPending ? "กำลังบันทึกผล…" : `ทอย ${session.currentPlayer?.slot ?? ""} · ${session.currentPlayer?.name ?? ""}`}</button><button type="button" className="future-cancel-button" onClick={() => cancelMutation.mutate({ sessionId: session.id })} disabled={busy}><X size={15} /> ยกเลิกเกม</button></div>}
        {session.status === "completed" && <div className="future-dice-result"><Trophy size={20} /><div>{session.winningTeam ? <><b>ทีม {session.winningTeam} ชนะ</b><span>คะแนน ทีม A {session.scores.A} · ทีม B {session.scores.B}</span></> : <><b>ผลเสมอ</b><span>คะแนน ทีม A และ ทีม B เท่ากัน</span></>}</div>{session.winningTeam && <div className="future-result-actions">{outcomeChoices(session.outcomeType).map(choice => <button type="button" className={session.selectedOutcome === choice ? "selected" : ""} onClick={() => chooseOutcomeMutation.mutate({ sessionId: session.id, selectedOutcome: choice })} disabled={busy} key={choice}>{choice}</button>)}</div>}</div>}
        {session.status === "cancelled" && <div className="future-dice-cancelled"><RotateCcw size={16} /> เกมนี้ถูกยกเลิกแล้ว สามารถเริ่มเกมใหม่ได้</div>}
      </section> : <div className="future-dice-empty">ยังไม่มีประวัติเกม</div>}

      {sessions.length > 1 && <div className="future-history"><span>ประวัติล่าสุด</span><div>{sessions.filter(item => item.id !== session?.id).slice(0, 6).map(item => <button type="button" className={selectedSessionId === item.id ? "selected" : ""} onClick={() => setSelectedSessionId(item.id)} key={item.id}>#{item.id} · {item.status === "open" ? "กำลังเล่น" : item.status === "completed" ? "จบเกม" : "ยกเลิก"}</button>)}</div></div>}
    </>}
    {notice && <p className="future-dice-notice" role="status">{notice}</p>}
    <footer className="future-dice-footer"><span>ลำดับทอย: A1 → B1{(session?.gameMode ?? gameMode) === "two_vs_two" ? " → A2 → B2" : ""}</span><button type="button" onClick={() => void sessionsQuery.refetch()} disabled={sessionsQuery.isFetching}><RefreshCw size={14} /> รีเฟรช</button></footer>
  </section>;
}
