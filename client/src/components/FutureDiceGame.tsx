import { useEffect, useMemo, useState } from "react";
import { Dices, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Mode = "1v1" | "2v2";
type Slot = "A1" | "B1" | "A2" | "B2";
type Choice = "30/60" | "ไป/ไม่ไป";
type DirectoryUser = { id: number; name: string; group?: string };
const order: Slot[] = ["A1", "B1", "A2", "B2"];
const placeholders: Record<Slot, string> = { A1: "นาย A", B1: "นาย B", A2: "นาย C", B2: "นาย D" };
function dicePair(values: [number, number] | undefined) {
  return values ? `${values[0]} + ${values[1]}` : "— + —";
}
function apiMode(mode: Mode): "one_vs_one" | "two_vs_two" {
  return mode === "1v1" ? "one_vs_one" : "two_vs_two";
}
function apiOutcome(choice: Choice): "minutes" | "go_no_go" {
  return choice === "30/60" ? "minutes" : "go_no_go";
}
function displayMode(mode: "one_vs_one" | "two_vs_two"): Mode {
  return mode === "one_vs_one" ? "1v1" : "2v2";
}
function displayChoice(type: "minutes" | "go_no_go"): Choice {
  return type === "minutes" ? "30/60" : "ไป/ไม่ไป";
}
function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง";
}

export default function FutureDiceGame({ users }: { users: DirectoryUser[] }) {
  const utils = trpc.useUtils();
  const sessionsQuery = trpc.futureDice.list.useQuery({ limit: 30 }, { retry: false, refetchInterval: 1_000, refetchOnWindowFocus: true });
  const sessions = sessionsQuery.data ?? [];
  const [mode, setMode] = useState<Mode>("1v1");
  const [choice, setChoice] = useState<Choice>("30/60");
  const [selectedResult, setSelectedResult] = useState<string>();
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [ignoredOpenSessionId, setIgnoredOpenSessionId] = useState<number | null>(null);
  const [latestSession, setLatestSession] = useState<(typeof sessions)[number] | null>(null);
  const [error, setError] = useState("");

  const eligibleUsers = useMemo(() => {
    const operational = users.filter(user => /ไกด์|ช่าง|guide|mechanic/i.test(user.group ?? ""));
    return (operational.length ? operational : users).slice().sort((a, b) => a.id - b.id);
  }, [users]);
  const openSession = sessions.find(session => session.status === "open" && session.id !== ignoredOpenSessionId);
  const activeSession = (activeSessionId ? sessions.find(session => session.id === activeSessionId) : undefined)
    ?? (latestSession?.id === activeSessionId ? latestSession : undefined)
    ?? openSession;
  const visibleSlots = mode === "2v2" ? order : ["A1", "B1"] as Slot[];
  const directoryUserIds = eligibleUsers.slice(0, visibleSlots.length).map(user => user.id);
  const rosterBySlot = useMemo(() => {
    const assigned = activeSession?.players ?? [];
    return Object.fromEntries(visibleSlots.map((slot, index) => {
      const serverPlayer = assigned.find(player => player.slot === slot);
      return [slot, serverPlayer?.name ?? eligibleUsers[index]?.name ?? placeholders[slot]];
    })) as Record<Slot, string>;
  }, [activeSession, eligibleUsers, visibleSlots]);
  const rolls = useMemo(() => Object.fromEntries((activeSession?.players ?? []).flatMap(player => player.roll ? [[player.slot, [player.roll.dieOne, player.roll.dieTwo] as [number, number]]] : [])) as Partial<Record<Slot, [number, number]>>, [activeSession]);
  const currentSlot = activeSession?.status === "open"
    ? activeSession.currentPlayer?.slot as Slot | undefined
    : activeSession ? undefined : order.find(slot => !rolls[slot] && (mode === "2v2" || slot === "A1" || slot === "B1"));
  const finished = activeSession?.status === "completed" || visibleSlots.every(slot => Boolean(rolls[slot]));
  const scoreA = activeSession?.scores.A ?? visibleSlots.filter(slot => slot.startsWith("A")).reduce((sum, slot) => sum + (rolls[slot]?.[0] ?? 0) + (rolls[slot]?.[1] ?? 0), 0);
  const scoreB = activeSession?.scores.B ?? visibleSlots.filter(slot => slot.startsWith("B")).reduce((sum, slot) => sum + (rolls[slot]?.[0] ?? 0) + (rolls[slot]?.[1] ?? 0), 0);
  const winningTeam = finished && activeSession?.status === "completed" ? activeSession.winningTeam : null;
  const winner = winningTeam ? `ทีม ${winningTeam}` : undefined;
  const canCreate = directoryUserIds.length === visibleSlots.length && new Set(directoryUserIds).size === visibleSlots.length;

  const createMutation = trpc.futureDice.create.useMutation({
    onSuccess: async session => {
      setActiveSessionId(session.id);
      setLatestSession(session);
      await utils.futureDice.list.invalidate();
    },
    onError: cause => setError(messageOf(cause)),
  });
  const rollMutation = trpc.futureDice.roll.useMutation({
    onSuccess: async session => {
      setActiveSessionId(session.id);
      setLatestSession(session);
      setError("");
      await utils.futureDice.list.invalidate();
    },
    onError: cause => setError(messageOf(cause)),
  });
  const outcomeMutation = trpc.futureDice.setOutcomeType.useMutation({
    onSuccess: async session => {
      setLatestSession(session);
      await utils.futureDice.list.invalidate();
    },
    onError: cause => setError(messageOf(cause)),
  });
  const chooseMutation = trpc.futureDice.chooseOutcome.useMutation({
    onSuccess: async session => {
      setLatestSession(session);
      setSelectedResult(session.selectedOutcome ?? undefined);
      await utils.futureDice.list.invalidate();
    },
    onError: cause => setError(messageOf(cause)),
  });
  const cancelMutation = trpc.futureDice.cancel.useMutation({
    onSuccess: async () => { await utils.futureDice.list.invalidate(); },
    onError: cause => setError(messageOf(cause)),
  });
  const isBusy = sessionsQuery.isLoading || sessionsQuery.isError || createMutation.isPending || rollMutation.isPending || outcomeMutation.isPending || chooseMutation.isPending || cancelMutation.isPending;

  useEffect(() => {
    if (!openSession) return;
    setActiveSessionId(openSession.id);
    setLatestSession(openSession);
    setMode(displayMode(openSession.gameMode));
    setChoice(displayChoice(openSession.outcomeType));
    setSelectedResult(openSession.selectedOutcome ?? undefined);
  }, [openSession?.id]);

  const roll = async () => {
    if (!currentSlot || isBusy) return;
    setError("");
    try {
      let session = activeSession;
      if (!session || session.status !== "open") {
        if (!canCreate) {
          setError("ต้องมีผู้เล่นในสารบบให้ครบตามโหมดก่อนเริ่มเกม");
          return;
        }
        session = await createMutation.mutateAsync({ gameMode: apiMode(mode), outcomeType: apiOutcome(choice), directoryUserIds });
        setActiveSessionId(session.id);
        setLatestSession(session);
      }
      const updated = await rollMutation.mutateAsync({ sessionId: session.id });
      setActiveSessionId(updated.id);
      setLatestSession(updated);
    } catch {
      // Mutation hooks provide the user-facing error message.
    }
  };

  const reset = () => {
    const session = activeSession;
    if (session?.status === "open") {
      setIgnoredOpenSessionId(session.id);
      cancelMutation.mutate({ sessionId: session.id });
    }
    setActiveSessionId(null);
    setLatestSession(null);
    setSelectedResult(undefined);
    setError("");
  };

  const changeMode = (next: Mode) => {
    if (next === mode) return;
    const session = activeSession;
    if (session?.status === "open") {
      setIgnoredOpenSessionId(session.id);
      cancelMutation.mutate({ sessionId: session.id });
    }
    setMode(next);
    setActiveSessionId(null);
    setLatestSession(null);
    setSelectedResult(undefined);
    setError("");
  };

  const changeChoice = (next: Choice) => {
    setChoice(next);
    setError("");
    if (activeSession && activeSession.status !== "cancelled") {
      outcomeMutation.mutate({ sessionId: activeSession.id, outcomeType: apiOutcome(next) });
    }
  };

  const selectResult = (result: string) => {
    setSelectedResult(result);
    if (activeSession?.status === "completed" && activeSession.winningTeam) {
      chooseMutation.mutate({ sessionId: activeSession.id, selectedOutcome: result });
    }
  };

  return <section className="future-dice-panel" aria-label="Future เกมทอยลูกเต๋า">
    <div className="future-dice-heading"><div><p>FUTURE / MINI GAME</p><h2>เกมทอยลูกเต๋า</h2><span>เครื่องมือสุ่มผลแบบสั้น ๆ สำหรับใช้ในแอปหลัก</span></div><Dices size={28} /></div>
    <div className="future-dice-options"><div><span>ผลลัพธ์</span><div className="future-choice-row">{(["30/60", "ไป/ไม่ไป"] as const).map(item => <button type="button" className={choice === item ? "selected" : ""} onClick={() => changeChoice(item)} key={item}>{item}</button>)}</div></div><div><span>โหมด</span><div className="future-choice-row">{(["1v1", "2v2"] as const).map(item => <button type="button" className={mode === item ? "selected" : ""} onClick={() => changeMode(item)} key={item}>{item}</button>)}</div></div></div>
    <div className="future-dice-board">{visibleSlots.map(slot => <div className={`future-dice-player ${currentSlot === slot ? "active" : ""}`} key={slot}><div><b>{slot}</b><span>{rosterBySlot[slot]}</span></div><strong>{dicePair(rolls[slot])}</strong><small>{rolls[slot] ? "ทอยแล้ว" : currentSlot === slot ? "ถึงตา" : "รอการทอย"}</small></div>)}</div>
    {finished && winner ? <div className="future-dice-result"><b>{winner} ชนะ</b><span>ทีม A {scoreA} · ทีม B {scoreB}</span><div className="future-result-actions">{(choice === "30/60" ? ["30", "60"] : ["ไป", "ไม่ไป"]).map(item => <button type="button" className={selectedResult === item ? "selected" : ""} onClick={() => selectResult(item)} key={item}>{item}</button>)}</div></div> : <button type="button" className="future-roll-button" onClick={() => void roll()} disabled={!currentSlot || isBusy}><Dices size={18} />{currentSlot ? `ทอย ${currentSlot}` : "รอผล"}</button>}
    {error && <small role="alert">{error}</small>}
    <div className="future-dice-footer"><span>ลำดับ 2vs2: A1 → B1 → A2 → B2</span><button type="button" onClick={reset} disabled={isBusy}><RotateCcw size={14} /> เริ่มใหม่</button></div>
  </section>;
}
