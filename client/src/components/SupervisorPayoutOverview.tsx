import React from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, RotateCcw, Table2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildPersonalPayoutRows, PAYOUT_ROUND_COLUMNS, payoutPageOffsetForDate, updatePersonalPayoutValue, type PersonalPayoutValues, type PayoutSessionLike } from "@/lib/mechanic-payout-table";
import type { MechanicRoundTableUser } from "@/lib/mechanic-round-table";
import { trpc } from "@/lib/trpc";
import { OPERATIONS_SNAPSHOT_KEYS, serializeOperationsSnapshot } from "@/lib/operations-snapshot";

type SupervisorPayoutOverviewProps = {
  users: MechanicRoundTableUser[];
  sessions: PayoutSessionLike[];
  values?: PersonalPayoutValues;
};

const SUPERVISOR_PAYOUT_NAV_HIDE_DELAY_MS = 4_000;

export function shouldStartSupervisorNavSwipe(target: { closest?: (selector: string) => unknown } | null) {
  return !target?.closest?.("button");
}

export function SupervisorPayoutOverview({ users, sessions, values = {} }: SupervisorPayoutOverviewProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>();
  const [pageOffset, setPageOffset] = useState(() => new Date().getDate() >= 16 ? 1 : 0);
  const [navEdge, setNavEdge] = useState<"left" | "right">("right");
  const [today] = useState(() => new Date());
  const [isEditing, setIsEditing] = useState(false);
  const [editUserId, setEditUserId] = useState<string>();
  const [draftValues, setDraftValues] = useState<PersonalPayoutValues>(values);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [supervisorCode, setSupervisorCode] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isNavDocked, setIsNavDocked] = useState(false);
  const dockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeRef = useRef<{ pointerId: number; startX: number; moved: boolean } | null>(null);
  const identityQuery = trpc.directory.me.useQuery(undefined, { retry: false });
  const payoutSaveMutation = trpc.operationsSnapshots.merge.useMutation();
  const verifyCurrentCodeMutation = trpc.directory.verifyCurrentCode.useMutation();
  const selectedUser = users.find(user => String(user.id) === selectedUserId) ?? users[0];
  const pageDate = useMemo(() => new Date(today.getFullYear(), today.getMonth() + Math.floor(pageOffset / 2), 1), [today, pageOffset]);
  const pageHalf = (((pageOffset % 2) + 2) % 2 === 0 ? 1 : 2) as 1 | 2;
  const isEditingSelectedUser = isEditing && editUserId === (selectedUser ? String(selectedUser.id) : undefined);
  const visibleValues = isEditingSelectedUser ? draftValues : values;
  const tableRows = useMemo(() => selectedUser ? buildPersonalPayoutRows({ year: pageDate.getFullYear(), month: pageDate.getMonth(), half: pageHalf, userId: String(selectedUser.id), sessions, values: visibleValues }) : [], [pageDate, pageHalf, selectedUser, sessions, visibleValues]);
  const totals = useMemo(() => PAYOUT_ROUND_COLUMNS.map((_, index) => tableRows.reduce((sum, row) => sum + row.rounds[index], 0)), [tableRows]);
  const totalHours = tableRows.reduce((sum, row) => sum + row.driveHours, 0);
  const totalRounds = tableRows.reduce((sum, row) => sum + row.totalRounds, 0);
  const totalPayout = tableRows.reduce((sum, row) => sum + row.payout, 0);
  const isToday = (date: Date) => date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();

  useEffect(() => {
    if (!users.length) { setSelectedUserId(undefined); return; }
    if (!selectedUserId || !users.some(user => String(user.id) === selectedUserId)) setSelectedUserId(String(users[0].id));
  }, [selectedUserId, users]);
  useEffect(() => {
    if (!isEditing) setDraftValues(values);
  }, [isEditing, values]);

  const clearDockTimer = () => {
    if (dockTimerRef.current) { clearTimeout(dockTimerRef.current); dockTimerRef.current = null; }
  };
  const scheduleDock = () => {
    clearDockTimer();
    dockTimerRef.current = setTimeout(() => setIsNavDocked(true), SUPERVISOR_PAYOUT_NAV_HIDE_DELAY_MS);
  };
  const wakeNav = () => { clearDockTimer(); setIsNavDocked(false); };
  useEffect(() => {
    scheduleDock();
    return clearDockTimer;
  }, []);
  const toggleNavEdge = () => {
    const next = navEdge === "left" ? "right" : "left";
    setNavEdge(next);
    wakeNav();
    scheduleDock();
  };
  const onNavPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!shouldStartSupervisorNavSwipe(event.target as { closest?: (selector: string) => unknown })) return;
    wakeNav();
    event.currentTarget.setPointerCapture(event.pointerId);
    swipeRef.current = { pointerId: event.pointerId, startX: event.clientX, moved: false };
  };
  const onNavPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - swipe.startX) > 18) swipe.moved = true;
  };
  const onNavPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const delta = event.clientX - swipe.startX;
    swipeRef.current = null;
    if (Math.abs(delta) >= 35) {
      const next = delta > 0 ? "right" : "left";
      setNavEdge(next);
    }
    scheduleDock();
  };
  const updateDraftValue = (key: string, minutes: 30 | 60, value: string) => {
    if (!editUserId || !isEditingSelectedUser) return;
    setDraftValues(current => updatePersonalPayoutValue(current, editUserId, key, minutes, value, sessions));
  };
  const openEdit = () => {
    if (!selectedUser) return;
    setDraftValues(values);
    setEditUserId(String(selectedUser.id));
    setSaveError("");
    setIsEditing(true);
  };
  const cancelEdit = () => {
    setDraftValues(values);
    setEditUserId(undefined);
    setSaveError("");
    setIsEditing(false);
  };
  const confirmSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = supervisorCode.trim();
    if (!code) { setSaveError("กรุณากรอกรหัสหัวหน้า"); return; }
    try {
      const identity = identityQuery.data;
      const validSupervisor = Boolean(identity && (identity.special || identity.group.includes("หัวหน้า")) && await verifyCurrentCodeMutation.mutateAsync({ code }));
      if (!validSupervisor) { setSaveError("รหัสไม่ตรงกับผู้ใช้งานหัวหน้า"); return; }
      if (!editUserId) { setSaveError("ไม่พบผู้ใช้เป้าหมายของการแก้ไข กรุณาเริ่มแก้ไขใหม่"); return; }
      const payoutRoundValues = { ...values, [editUserId]: draftValues[editUserId] ?? values[editUserId] ?? {} };
      await payoutSaveMutation.mutateAsync({ key: OPERATIONS_SNAPSHOT_KEYS.guideState, payload: serializeOperationsSnapshot({ payoutRoundValues }) });
      setSupervisorCode("");
      setShowSaveDialog(false);
      setIsEditing(false);
      setEditUserId(undefined);
      setSaveError("");
    } catch {
      setSaveError("บันทึกค่ารอบไม่สำเร็จ กรุณาลองใหม่");
    }
  };

  if (!selectedUser) return <section className="supervisor-round-table supervisor-payout-feature" aria-label="ตารางค่ารอบ"><div className="supervisor-round-heading"><div><p>SUPERVISOR / PAYOUT OVERVIEW</p><h3>ตารางค่ารอบ</h3><span>รวมข้อมูลของไกด์และช่างทั้งหมด</span></div><Table2 size={22} /></div><div className="supervisor-round-empty"><Table2 size={20} /><p>ยังไม่มีรายชื่อไกด์หรือช่างในระบบ</p><small>เมื่อเพิ่มผู้ใช้บทบาทไกด์หรือช่าง รายชื่อจะแสดงที่นี่อัตโนมัติ</small></div></section>;

  return <section className="supervisor-round-table supervisor-payout-feature" aria-label="ตารางค่ารอบรวม">
    <div className="supervisor-round-heading"><div><p>SUPERVISOR / PAYOUT OVERVIEW</p><h3>ตารางค่ารอบ</h3><span>มุมมองรวมของไกด์และช่าง · หัวหน้าเท่านั้นที่แก้ไขได้</span>{isEditing && editUserId && <small className="supervisor-payout-edit-target">กำลังแก้ไขข้อมูลของ {users.find(user => String(user.id) === editUserId)?.name ?? editUserId} เท่านั้น · เลื่อนไปดูผู้ใช้อื่นได้ แต่แก้ไขไม่ได้</small>}</div><div className="supervisor-payout-heading-actions"><Table2 size={22} />{isEditing ? <><button type="button" className="m3-primary" onClick={() => { setSaveError(""); setShowSaveDialog(true); }}>บันทึกการแก้ไข</button><button type="button" className="m3-secondary" onClick={cancelEdit}>ยกเลิก</button></> : <button type="button" className="m3-secondary" onClick={openEdit}>แก้ไข</button>}</div></div>
    <div className="m3-payout-week-nav supervisor-round-page-nav supervisor-floating-payout-nav"><button type="button" className="m3-payout-recenter" onClick={() => setPageOffset(payoutPageOffsetForDate(new Date()))} aria-label="กลับไปวันที่ปัจจุบัน" title="กลับไปวันที่ปัจจุบัน"><RotateCcw size={15} /> Re</button><button type="button" onClick={() => setPageOffset(offset => offset - 1)} aria-label="หน้าก่อนหน้า"><ChevronLeft size={18} /></button><strong>Re&lt;&gt; · {pageHalf === 1 ? "1–15" : "16–สิ้นเดือน"} · {new Intl.DateTimeFormat("th-TH", { month: "short", year: "numeric" }).format(pageDate)}</strong><button type="button" onClick={() => setPageOffset(offset => offset + 1)} aria-label="หน้าถัดไป"><ChevronRight size={18} /></button></div>
    <aside className={`supervisor-vertical-user-nav edge-${navEdge} ${isNavDocked ? "is-docked" : "is-open"}`} aria-label="ดูตารางของ" onPointerDown={onNavPointerDown} onPointerMove={onNavPointerMove} onPointerUp={onNavPointerUp} onPointerCancel={onNavPointerUp} onMouseEnter={wakeNav} onMouseLeave={scheduleDock}><div className="supervisor-user-nav-label">ดูตาราง</div>{users.map(user => <button type="button" key={user.id} className={String(user.id) === String(selectedUser.id) ? "selected" : ""} onClick={() => { setSelectedUserId(String(user.id)); scheduleDock(); }} aria-label={`ดูตาราง ${user.name}`}><strong>{user.name}</strong><small>{user.group}</small></button>)}<button type="button" className="nav-side-toggle" onClick={event => { event.stopPropagation(); toggleNavEdge(); }} aria-label={`ย้ายแถบดูตารางไปด้าน${navEdge === "left" ? "ขวา" : "ซ้าย"}`} title="ย้ายแถบไปอีกขอบหน้าจอ"><ArrowLeftRight size={15} /></button><button type="button" className="nav-dock-handle" onClick={wakeNav} aria-label="เปิดแถบดูตาราง" title="แตะหรือปัดเพื่อเปิดแถบรายชื่อ"><span /></button></aside>
    <div className="m3-payout-sheet-wrap"><table className="m3-payout-sheet"><thead><tr><th>วัน / วันที่</th>{PAYOUT_ROUND_COLUMNS.map(minutes => <th key={minutes}>{minutes} นาที</th>)}<th className="hours-head">ชั่วโมงขับ</th><th className="total-head">รวม</th></tr></thead><tbody>{tableRows.map(row => <tr key={row.key}><th className={`payout-weekday ${isToday(row.date) ? "today" : ""}`}><small>{new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(row.date)}</small><strong>{row.date.getDate()}/{row.date.getMonth() + 1}</strong>{isToday(row.date) && <em>วันนี้</em>}</th>{row.rounds.map((count, index) => { const minutes = PAYOUT_ROUND_COLUMNS[index]; return <td key={`${row.key}-${minutes}`} className="payout-number-cell">{isEditingSelectedUser ? <input aria-label={`${minutes} นาที วันที่ ${row.date.getDate()}/${row.date.getMonth() + 1}`} type="number" min="0" step="1" value={count || ""} onChange={event => updateDraftValue(row.key, minutes, event.target.value)} placeholder="0" /> : <span>{count || "0"}</span>}</td>; })}<td className="hours-cell">{row.driveHours ? row.driveHours.toFixed(1) : "0"}</td><td className={`row-total-cell ${row.totalRounds > 0 ? "has-value" : "empty"}`}><strong>{row.totalRounds}</strong><small>฿{row.payout.toLocaleString("th-TH")}</small></td></tr>)}</tbody><tfoot><tr><th>รวม</th>{totals.map((total, index) => <td key={`total-${index}`}>{total}</td>)}<td className="hours-total">{totalHours.toFixed(1)}</td><td className="row-total-total">{totalRounds}</td></tr></tfoot></table></div>
    <p className="m3-payout-swipe-hint">{isEditingSelectedUser ? `กำลังแก้ไขข้อมูลของ ${users.find(user => String(user.id) === editUserId)?.name ?? editUserId} เท่านั้น · เปลี่ยนได้เฉพาะช่อง 30 และ 60 นาที` : isEditing ? `กำลังดูข้อมูลของ ${selectedUser.name} · ผู้ใช้นี้แก้ไขไม่ได้ในรอบนี้ ต้องกลับไปที่ผู้ใช้เป้าหมาย` : `กำลังดูข้อมูลของ ${selectedUser.name} · หัวหน้ามีสิทธิ์ดูข้อมูลรวมทุกคน`}</p><div className="m3-payout-summary"><div><span>รวมชั่วโมงขับ</span><strong>{totalHours.toFixed(1)}</strong></div><div><span>จำนวนรอบ</span><strong>{totalRounds}</strong></div><div><span>เป็นเงินจำนวน</span><strong>฿{totalPayout.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</strong></div></div><div className="m3-payout-period"><strong>{selectedUser.name}</strong><span>{selectedUser.group} · {new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(pageDate)} · ครึ่งเดือนที่ {pageHalf}</span></div>{showSaveDialog && <div className="supervisor-modal-backdrop" role="presentation"><form className="supervisor-user-modal" role="dialog" aria-modal="true" aria-labelledby="supervisor-payout-save-title" onSubmit={confirmSave}><div className="supervisor-modal-heading"><div><p>SUPERVISOR CONFIRMATION</p><h3 id="supervisor-payout-save-title">ยืนยันการบันทึกค่ารอบ</h3></div><button type="button" className="supervisor-modal-close" onClick={() => { setShowSaveDialog(false); setSupervisorCode(""); setSaveError(""); }} aria-label="ปิด">×</button></div><p>กำลังจะบันทึกเฉพาะข้อมูลของ {users.find(user => String(user.id) === editUserId)?.name ?? editUserId}</p><p>กรอกรหัสของผู้ใช้งานหัวหน้าที่กำลังใช้งานอยู่</p><label>รหัสหัวหน้า<input autoFocus type="password" value={supervisorCode} onChange={event => { setSupervisorCode(event.target.value); setSaveError(""); }} /></label>{saveError && <p className="supervisor-form-error" role="alert">{saveError}</p>}<div className="supervisor-modal-actions"><button type="button" className="supervisor-modal-cancel" onClick={() => { setShowSaveDialog(false); setSupervisorCode(""); setSaveError(""); }}>ยกเลิก</button><button type="submit" className="supervisor-modal-submit" disabled={payoutSaveMutation.isPending || verifyCurrentCodeMutation.isPending}>ตกลงและบันทึก</button></div></form></div>}
  </section>;
}
