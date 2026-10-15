import { useMemo, useState } from "react";
import { Dices, RotateCcw } from "lucide-react";

type Mode = "1v1" | "2v2";
type Slot = "A1" | "B1" | "A2" | "B2";

const order: Slot[] = ["A1", "B1", "A2", "B2"];
const players: Record<Slot, string> = { A1: "นาย A", B1: "นาย B", A2: "นาย C", B2: "นาย D" };

function dicePair(values: [number, number] | undefined) {
  return values ? `${values[0]} + ${values[1]}` : "— + —";
}

export default function FutureDiceGame() {
  const [mode, setMode] = useState<Mode>("1v1");
  const [choice, setChoice] = useState<"30/60" | "ไป/ไม่ไป">("30/60");
  const [rolls, setRolls] = useState<Partial<Record<Slot, [number, number]>>>({});
  const [selectedResult, setSelectedResult] = useState<string>();
  const currentSlot = useMemo(() => order.find(slot => !rolls[slot] && (mode === "2v2" || (slot === "A1" || slot === "B1"))), [mode, rolls]);
  const visibleSlots = mode === "2v2" ? order : ["A1", "B1"] as Slot[];
  const finished = visibleSlots.every(slot => rolls[slot]);
  const scoreA = visibleSlots.filter(slot => slot.startsWith("A")).reduce((sum, slot) => sum + (rolls[slot]?.[0] ?? 0) + (rolls[slot]?.[1] ?? 0), 0);
  const scoreB = visibleSlots.filter(slot => slot.startsWith("B")).reduce((sum, slot) => sum + (rolls[slot]?.[0] ?? 0) + (rolls[slot]?.[1] ?? 0), 0);
  const winner = finished && scoreA !== scoreB ? (scoreA > scoreB ? "ทีม A" : "ทีม B") : undefined;

  const roll = () => {
    if (!currentSlot) return;
    setRolls(previous => ({ ...previous, [currentSlot]: [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)] }));
  };

  const reset = () => { setRolls({}); setSelectedResult(undefined); };

  return <section className="future-dice-panel" aria-label="Future เกมทอยลูกเต๋า">
    <div className="future-dice-heading"><div><p>FUTURE / MINI GAME</p><h2>เกมทอยลูกเต๋า</h2><span>เครื่องมือสุ่มผลแบบสั้น ๆ สำหรับใช้ในแอปหลัก</span></div><Dices size={28} /></div>
    <div className="future-dice-options"><div><span>ผลลัพธ์</span><div className="future-choice-row">{(["30/60", "ไป/ไม่ไป"] as const).map(item => <button type="button" className={choice === item ? "selected" : ""} onClick={() => setChoice(item)} key={item}>{item}</button>)}</div></div><div><span>โหมด</span><div className="future-choice-row">{(["1v1", "2v2"] as const).map(item => <button type="button" className={mode === item ? "selected" : ""} onClick={() => { setMode(item); reset(); }} key={item}>{item}</button>)}</div></div></div>
    <div className="future-dice-board">{visibleSlots.map(slot => <div className={`future-dice-player ${currentSlot === slot ? "active" : ""}`} key={slot}><div><b>{slot}</b><span>{players[slot]}</span></div><strong>{dicePair(rolls[slot])}</strong><small>{rolls[slot] ? "ทอยแล้ว" : currentSlot === slot ? "ถึงตา" : "รอการทอย"}</small></div>)}</div>
    {finished && winner ? <div className="future-dice-result"><b>{winner} ชนะ</b><span>ทีม A {scoreA} · ทีม B {scoreB}</span><div className="future-result-actions">{([choice === "30/60" ? "30" : "ไป", choice === "30/60" ? "60" : "ไม่ไป"]).map(item => <button type="button" className={selectedResult === item ? "selected" : ""} onClick={() => setSelectedResult(item)} key={item}>{item}</button>)}</div></div> : <button type="button" className="future-roll-button" onClick={roll} disabled={!currentSlot}><Dices size={18} />{currentSlot ? `ทอย ${currentSlot}` : "รอผล"}</button>}
    <div className="future-dice-footer"><span>ลำดับ 2vs2: A1 → B1 → A2 → B2</span><button type="button" onClick={reset}><RotateCcw size={14} /> เริ่มใหม่</button></div>
  </section>;
}
