/* Module 3 Guide Side — standalone domain. This page intentionally does not import or read Home.tsx state. */
/** Style contract: dark operational dashboard; status colors convey readiness, activity, inspection, and repair. */
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarDays, Check, Clock3, Coins, Database, Dices, History, MessageCircle, MessageSquare, Plus, RefreshCw, RotateCcw, Search, Settings2, ShieldCheck, Truck, UsersRound, X } from "lucide-react";
import VehicleCard from "@/components/VehicleCard";
import { ActiveVehicleDetailList } from "@/components/ActiveVehicleDetailList";
import { VehicleChoiceList, type VehicleChoiceItem } from "@/components/VehicleChoiceList";
import { ServerActiveSessionChat } from "@/components/ServerActiveSessionChat";
import { VehicleSafetyNoticeDialog as SharedVehicleSafetyNoticeDialog, VehicleSafetyNoticeIndicator } from "@/components/VehicleSafetyNotice";
import { PttRoomPanel } from "@/components/PttRoom";
import CommunicationChat from "@/components/CommunicationChat";
import ModuleLogoutButton from "@/components/ModuleLogoutButton";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { deriveVehicleStatusesFromActive } from "@/lib/active-vehicle-status";
import { buildDailyActiveTimeline, DAILY_TIME_SLOTS, groupDailyActiveTimelineBySlot } from "@/lib/daily-active-timeline";
import { extractGuideVehicleNumber, GUIDE_REPAIR_SCREEN, mergeGuideRepairReports, type GuideRepairReport } from "@/lib/mechanic-guide-repair";
import { canReceiveVehiclePickup, markVehiclePickupRequestReceived, pickupRequestsForResponsibleOwner, receiveVehiclePickupForGuide, type VehiclePickupRequest } from "@/lib/vehicle-pickup-notifications";
import { acknowledgeVehicleMaintenanceNotification, notificationsForGuide, type VehicleMaintenanceNotification } from "@/lib/vehicle-maintenance-notifications";
import { removeOrphanedVehicleSafetyNotices, type VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";
import { buildSupervisorInputVehicles, buildSupervisorUserDirectoryStatusModel, buildSupervisorUserDirectoryStatusSource } from "@/lib/supervisor-data";
import { groupVehicleOptionsByResponsibility, prioritizeVehicleGroupsByQueue } from "@/lib/vehicle-selection-groups";
import { formatSessionCountdown, remainingSessionSeconds, sessionTiming } from "@/lib/session-countdown";
import { appendSessionActivity, createSessionActivity, sessionActivitiesOrFallback, sortSessionActivities, type SessionActivity } from "@/lib/session-activity-log";
import { OPERATIONS_SNAPSHOT_KEYS, parseOperationsSnapshot, serializeOperationsSnapshot } from "@/lib/operations-snapshot";
import { mergeVehiclePickupRequests, type VehicleFlowSnapshot } from "@/lib/vehicle-flow-snapshot";
import { mergeSessionChatMessages } from "@/lib/session-chat-sync";
import { buildVehicleHistory, reconcileVehicleHistory, sortVehicleHistory, vehicleHistoryOrFallback, type SessionVehicleHistory } from "@/lib/session-vehicle-history";
import { canManageActiveSession, canSendSessionMessage, permissionMessage, type PermissionAction, type RoleId } from "@/lib/permissions";
import { identityFromServerSession, resolveAppActor } from "@/lib/app-access";
import { roleFromUserGroup } from "@/lib/permissions";
import { useCanonicalAppDirectory } from "@/hooks/useCanonicalAppDirectory";
import { buildPersonalPayoutRows, PAYOUT_ROUND_COLUMNS, payoutPageOffsetForDate, updatePersonalPayoutValue, type PersonalPayoutValues } from "@/lib/mechanic-payout-table";
import { isVehicleOperationallyReadyStatus } from "@/lib/vehicle-selection-rules";
import { completionTimingDetail, formatCompletionDifference, sessionCompletionTiming, type SessionCompletionTiming } from "@/lib/session-completion-timing";
import { excludeCurrentGuideMember, guideMembersFromCanonicalDirectory, sortGuideMembersByQueue } from "@/lib/guide-member-selector";
import { mergeSharedSessions } from "@/lib/shared-session-sync";
import { findSessionConflict, findSessionDraftDuplicates, findSessionForMember } from "@/lib/session-conflicts";
import {
  getResponsibilityGroupColor,
  reconcileActiveVehicleNumbers,
  setVehicleStatusForNumbers,
  type VehicleStatus as SharedVehicleStatus,
  type VehicleResponsibilityState,
} from "@/lib/vehicle-responsibility-store";
import { formatGroupManagerNames, resolveVehicleManagerNames, resolveVehicleResponsibilityView } from "@/lib/vehicle-manager-resolver";
import { memberGroupClass } from "@/lib/member-group-style";
import { showBrowserNotification } from "@/lib/browser-notification";
import { GuideVehicleStatusSummary } from "@/components/GuideVehicleStatusSummary";
import { VehicleResponsibilityGroupView } from "@/components/VehicleResponsibilityGroupView";
import TeamBoardQueueModule from "@/components/TeamBoardQueueModule";
import { openFutureDiceApp } from "@/components/FutureDiceGame";
import { CountPicker } from "@/components/SessionCreatorForm";
import { FULL_APP_DEMO_REPAIR_REPORTS, FULL_APP_DEMO_VEHICLE_STATE, FULL_APP_DEMO_VEHICLES, isFullAppDemo } from "@/lib/full-app-demo";
import SpeechSettingsPanel from "@/components/SpeechSettingsPanel";
import { DEFAULT_SUPERVISOR_TIMER_SETTINGS, type TimerExpiryBehavior } from "@shared/supervisor-timer-settings";

type GuideStatus = "Standby" | "Active" | "Completed";
type VehicleStatus = "ready" | "repair" | "inspection" | "pickup" | "active";
type MemberRole = "Guide" | "Mechanic";

type GuideVehicle = { id: string; number: string; cc: "200" | "250"; status: VehicleStatus };
type GuideMember = { id: string; name: string; role: MemberRole; available: boolean };
type ModuleSession = {
  sessionId: string;
  status: GuideStatus;
  durationMinutes: 30 | 60;
  vehicleIds: string[];
  memberIds: string[];
  activeUserId?: string;
  activeUserName?: string;
  riderCount: number;
  passengerCount: number;
  createdAt: string;
  startedAt?: string;
  scheduledEndAt?: string;
  completedAt?: string;
  completedById?: string;
  completedByName?: string;
  vehicleStatusesBeforeSession?: Record<string, VehicleStatus>;
  persistentSessionId?: number;
  activityLog?: SessionActivity[];
  vehicleHistory?: SessionVehicleHistory[];
  overtimeAcknowledged?: boolean;
  timerEnabled?: boolean;
  expiryBehavior?: TimerExpiryBehavior;
  completionTiming?: SessionCompletionTiming;
};
type ModuleMessage = { id: string; sessionId: string; sender: string; text: string; createdAt: string };
type RepairReport = { id: string; vehicleId: string; description: string; reporter: string; createdAt: string; status: "แจ้งซ่อม" | "กำลังซ่อม" | "ซ่อมเสร็จ"; completedAt?: string; completedBy?: string };
type RepairQueueStatus = "คิวใหม่" | "กำลังตรวจ" | "กำลังซ่อม" | "รอทดสอบ" | "เสร็จแล้ว";
type RepairQueueItem = { id: string; vehicleId: string; issue: string; reporter: string; mechanic: string; priority: "ปกติ" | "เร่งด่วน"; status: RepairQueueStatus; createdAt: string; updatedAt: string };
type AlertReport = { id: string; vehicleId: string; description: string; reporter: string; createdAt: string; status: "ใหม่" | "รับทราบ" | "ปิดเรื่อง" };
type CompletionPrompt = { sessionId: string; kind: "manual" | "expired" | "cancel-standby" };

function makeId(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }



function formatTime(value?: string) { return value ? new Date(value).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }) : "—"; }

function DailyActiveCard({ session, members, onOpen }: { session: ModuleSession; members: GuideMember[]; onOpen: () => void }) {
  const names = session.memberIds.map(id => members.find(member => member.id === id)?.name).filter((name): name is string => Boolean(name)).join(" · ") || session.activeUserName || "ไม่ระบุผู้ปฏิบัติงาน";
  return <button type="button" className="m3-daily-board-card m3-daily-board-card-compact" aria-label={`ดูรายละเอียด ${names}`} onClick={onOpen}><strong>{names}</strong><span>โปรแกรม {session.durationMinutes} นาที</span><small>R {session.riderCount} · P {session.passengerCount}</small></button>;
}

function SessionActivitySheet({ session }: { session: ModuleSession }) {
  const activities = sortSessionActivities(sessionActivitiesOrFallback(session));
  const completionSummary = session.completionTiming ? `${completionTimingDetail(session.completionTiming)} · ใช้เวลาจริง ${formatCompletionDifference(session.completionTiming.actualSeconds)}` : undefined;
  const completedByLabel = session.completedByName ? `ผู้จบรายการ: ${session.completedByName}` : undefined;
  return <section className="m3-activity-sheet" aria-labelledby="m3-activity-title">
    <div className="m3-activity-heading"><div><p>SESSION ACTIVITY LOG</p><h3 id="m3-activity-title">ใบบันทึกการปฏิบัติงาน</h3></div><History size={18} aria-hidden="true" /></div>
    {completionSummary && <div className={`m3-completion-summary ${session.completionTiming?.overtimeSeconds ? "is-overtime" : session.completionTiming?.earlySeconds ? "is-early" : "is-on-time"}`}><strong>{completionSummary}</strong><span>กำหนดโปรแกรม {formatCompletionDifference(session.completionTiming?.plannedSeconds ?? 0)}</span>{completedByLabel && <small>{completedByLabel}</small>}</div>}
    {activities.length ? <ol className="m3-activity-list">{activities.map(activity => <li key={activity.id}><span className="m3-activity-dot" aria-hidden="true" /><div><strong>{activity.action}</strong>{activity.detail && <p>{activity.detail}</p>}<small>{activity.actorName} · {formatTime(activity.createdAt)}</small></div></li>)}</ol> : <p className="m3-empty">ยังไม่มีบันทึกกิจกรรม</p>}
  </section>;
}

type SessionFollowPosition = { edge: "left" | "right"; top: number };
type SessionFollowDrag = { pointerId: number; startX: number; startY: number; startTop: number; moved: boolean };
const SESSION_FOLLOW_SIZE = 76;

function readSessionFollowPosition(): SessionFollowPosition {
  if (typeof window === "undefined") return { edge: "right", top: 18 };
  return { edge: "right", top: Math.max(18, window.innerHeight - SESSION_FOLLOW_SIZE - 26) };
}

function clampSessionFollowTop(top: number) {
  if (typeof window === "undefined") return Math.max(12, top);
  return Math.min(Math.max(12, top), Math.max(12, window.innerHeight - SESSION_FOLLOW_SIZE - 12));
}

function SessionFollowPopup({ session, members, now, screen, onOpen }: { session: ModuleSession | undefined; members: GuideMember[]; now: number; screen: string; onOpen: () => void }) {
  const [position, setPosition] = useState<SessionFollowPosition>(() => readSessionFollowPosition());
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<SessionFollowDrag | null>(null);
  const suppressClickRef = useRef(false);
  if (!session || screen === (session.status === "Active" ? "active" : "standby")) return null;
  const names = session.memberIds.map(id => members.find(member => member.id === id)?.name).filter((name): name is string => Boolean(name)).join(" · ") || session.activeUserName || "รายการของคุณ";
  const isActive = session.status === "Active";
  const timing = sessionTiming(session.startedAt, session.durationMinutes, now, session.scheduledEndAt);
  const timeLabel = session.timerEnabled === false ? "ปิด" : timing.overtimeSeconds > 0 ? `+${formatSessionCountdown(timing.overtimeSeconds)}` : formatSessionCountdown(timing.remainingSeconds);
  const label = `${isActive ? "กำลังทำงาน" : "รอเริ่มงาน"} · ${names} · ${isActive ? (session.timerEnabled === false ? "ปิดตัวจับเวลา" : timing.overtimeSeconds > 0 ? `เวลาบวก ${timeLabel}` : `เหลือ ${timeLabel}`) : "แตะเพื่อเปิดรายการ"}`;
  const savePosition = (next: SessionFollowPosition) => {
    const safePosition = { ...next, top: clampSessionFollowTop(next.top) };
    setPosition(safePosition);
  };
  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startTop: position.top, moved: false };
    setIsDragging(true);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) drag.moved = true;
    if (!drag.moved) return;
    savePosition({ edge: event.clientX < window.innerWidth / 2 ? "left" : "right", top: drag.startTop + deltaY });
  };
  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) savePosition({ ...position, top: clampSessionFollowTop(position.top) });
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    setIsDragging(false);
  };
  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpen();
  };
  return <button type="button" className={`m3-session-follow-popup m3-session-follow-orb ${isActive ? "is-active" : "is-standby"} ${timing.overtimeSeconds > 0 ? "is-overtime" : ""} ${isDragging ? "is-dragging" : ""}`} style={{ top: `${clampSessionFollowTop(position.top)}px`, ...(position.edge === "left" ? { left: "max(12px, env(safe-area-inset-left))" } : { right: "max(12px, env(safe-area-inset-right))" }) }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onClick={handleClick} aria-label={`เปิดรายการ ${label}`} title={label}><span className="m3-session-follow-icon"><Clock3 size={22} /></span><span className="m3-session-follow-time">{isActive ? timeLabel : "รอ"}</span><span className="sr-only">{names}</span></button>;
}

function SafetyNoticeDialog({ notice, vehicle, onClose }: { notice: VehicleSafetyNotice; vehicle?: GuideVehicle; onClose: () => void }) {
  return <div className="m3-safety-dialog-backdrop" role="presentation" onClick={onClose}><section className="m3-safety-dialog" role="dialog" aria-modal="true" aria-labelledby="safety-notice-title" onClick={event => event.stopPropagation()}><div className="m3-panel-title"><div><p>MECHANIC / SAFETY GUIDANCE</p><h2 id="safety-notice-title">คำแนะนำการใช้งานรถ #{notice.vehicleNumber}</h2><span>{vehicle ? `${vehicle.cc} ซีซี` : "รถในฐานข้อมูล"} · จาก {notice.reporter}</span></div><button type="button" className="m3-icon-button" onClick={onClose} aria-label="ปิดคำแนะนำ"><X size={17} /></button></div><p className="m3-safety-dialog-copy">{notice.description}</p><small className="m3-safety-dialog-meta">บันทึกเมื่อ {formatTime(notice.createdAt)} · คำแนะนำนี้ไม่เปลี่ยนสถานะรถ</small></section></div>;
}

function SafetyNoticeList({ notices, vehicles, onOpen }: { notices: VehicleSafetyNotice[]; vehicles: GuideVehicle[]; onOpen: (notice: VehicleSafetyNotice) => void }) {
  return <div className="m3-group-safety-notices"><div className="m3-group-safety-heading"><strong>คำแนะนำจากช่าง</strong><span>{notices.length}</span></div>{notices.length ? notices.map(notice => <button type="button" className="m3-group-safety-row" key={notice.id} onClick={() => onOpen(notice)}><span>รถ #{notice.vehicleNumber} · {vehicles.find(vehicle => Number(vehicle.number) === notice.vehicleNumber)?.cc ?? "—"} ซีซี</span><b>{notice.description}</b><small>{notice.reporter} · {formatTime(notice.createdAt)} · กดเพื่ออ่าน</small></button>) : <p className="m3-group-safety-empty">ยังไม่มีคำแนะนำจากช่าง</p>}</div>;
}

function labelStatus(status: GuideStatus) { return status === "Standby" ? "รอเริ่มงาน" : status === "Active" ? "กำลังทำงาน" : "จบงาน"; }

export default function GuideModule3() {
  const fullAppDemo = isFullAppDemo();
  const canonicalDirectory = useCanonicalAppDirectory();
  const directoryUsers = canonicalDirectory.users;
  const directoryMembers = useMemo(() => guideMembersFromCanonicalDirectory(directoryUsers), [directoryUsers]);
  const [vehicles, setVehicles] = useState<GuideVehicle[]>(() => fullAppDemo ? FULL_APP_DEMO_VEHICLES.map(vehicle => ({ id: `m3-v${vehicle.number}`, number: String(vehicle.number), cc: vehicle.cc, status: vehicle.number === 23 ? "active" : vehicle.number === 25 ? "repair" : "ready" })) : []);
  const [members, setMembers] = useState<GuideMember[]>([]);
  const [responsibilityState, setResponsibilityState] = useState<VehicleResponsibilityState>(fullAppDemo ? FULL_APP_DEMO_VEHICLE_STATE : { version: 1, vehicleGroups: [], responsibilityGroups: [], updatedAt: 0 });

  const [sessions, setSessions] = useState<ModuleSession[]>([]);
  const [messages, setMessages] = useState<ModuleMessage[]>([]);
  const [repairReports, setRepairReports] = useState<RepairReport[]>(fullAppDemo ? [...FULL_APP_DEMO_REPAIR_REPORTS] : []);
  const [pickupRequests, setPickupRequests] = useState<VehiclePickupRequest[]>([]);
  const [maintenanceNotifications, setMaintenanceNotifications] = useState<VehicleMaintenanceNotification[]>([]);
  const [repairQueue, setRepairQueue] = useState<RepairQueueItem[]>([]);
  const [repairVehicleId, setRepairVehicleId] = useState("");
  const [repairDescription, setRepairDescription] = useState("");
  const [alertReports, setAlertReports] = useState<AlertReport[]>([]);
  const [safetyNotices, setSafetyNotices] = useState<VehicleSafetyNotice[]>([]);
  const [selectedSafetyNoticeId, setSelectedSafetyNoticeId] = useState<string>();
  const [isStorageHydrated] = useState(true);
  const [isGuideSnapshotHydrated, setIsGuideSnapshotHydrated] = useState(false);
  const [alertVehicleId, setAlertVehicleId] = useState("");
  const [alertDescription, setAlertDescription] = useState("");
  const [pickupBoardView, setPickupBoardView] = useState<"pickup" | "maintenance">("pickup");
  const [notificationView, setNotificationView] = useState<"repair" | "pickup" | "maintenance">("pickup");
  const [queuePayoutView, setQueuePayoutView] = useState<"daily" | "payout" | "dice">("daily");
  const [screen, setScreen] = useState<string>(() => {
    if (typeof window === "undefined") return "dashboard";
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("screen");
    return params.get("sessionId") ? "active" : requested === "communications" ? "communications" : "queuePayout";
  });
  const [dailySummaryFilter, setDailySummaryFilter] = useState<"all" | "Active" | "Completed">("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string>(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("sessionId") ?? "");
  const [editingSessionId, setEditingSessionId] = useState<string>();
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [duration, setDuration] = useState<30 | 60>(30);
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);
  const [riderCount, setRiderCount] = useState(1);
  const [passengerCount, setPassengerCount] = useState(0);
  const [memberSearch, setMemberSearch] = useState("");
  const [vehicleSelectionMode, setVehicleSelectionMode] = useState<"grouped" | "number">("grouped");
  const [chatText, setChatText] = useState("");
  const [now, setNow] = useState(Date.now());
  const [payoutPageOffset, setPayoutPageOffset] = useState(() => new Date().getDate() >= 16 ? 1 : 0);
  const [payoutRoundValues, setPayoutRoundValues] = useState<PersonalPayoutValues>({});
  const [payoutDraftValues, setPayoutDraftValues] = useState<PersonalPayoutValues>({});
  const [payoutSaveOpen, setPayoutSaveOpen] = useState(false);
  const [payoutSavePassword, setPayoutSavePassword] = useState("");
  const [payoutSaveError, setPayoutSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [completionPrompt, setCompletionPrompt] = useState<CompletionPrompt | null>(null);
  const directoryMeQuery = trpc.directory.me.useQuery(undefined, { retry: false });
  const timerSettingsQuery = trpc.supervisorTimerSettings.get.useQuery(undefined, { retry: false, refetchInterval: 30_000 });
  const currentIdentity = identityFromServerSession(directoryMeQuery.data);
  const currentRoleId: RoleId = currentIdentity?.special ? "SUPERVISOR" : currentIdentity ? roleFromUserGroup(currentIdentity.group) : "GUIDE";
  const currentMemberId = currentIdentity?.special ? "" : String(currentIdentity?.memberId ?? "");
  const isHead = currentIdentity?.special === true || currentRoleId === "SUPERVISOR";
  const isPrivileged = isHead;
  const [activeDialog, setActiveDialog] = useState<"members" | "addVehicle" | "replace" | "removeVehicle" | null>(null);
  const [replaceFromId, setReplaceFromId] = useState("");
  const [replaceToId, setReplaceToId] = useState("");
  const [activeUserId, setActiveUserId] = useState("");

  useEffect(() => {
    // Navigation follows an explicit Guide session selection or initial deep link.
    // A repair/status snapshot refresh must never change the current screen to Standby.
    const requestedSession = selectedSessionId ? sessions.find(session => session.sessionId === selectedSessionId) : undefined;
    if (isStorageHydrated && selectedSessionId && requestedSession) setScreen(requestedSession.status === "Active" ? "active" : requestedSession.status === "Standby" ? "standby" : "completed");
  }, [isStorageHydrated, selectedSessionId]);
  useEffect(() => {
    if (!canonicalDirectory.isSuccess && !fullAppDemo) return;
    setMembers(directoryMembers);
  }, [canonicalDirectory.isSuccess, directoryMembers, fullAppDemo]);
  // Responsibility state is hydrated from the Supervisor fleet Server snapshot.

  // Pickup requests are hydrated from the Supervisor fleet Server snapshot.
  // Persistent state is written through Server operations snapshots only.
  useEffect(() => {
    if (fullAppDemo || !isStorageHydrated || !isGuideSnapshotHydrated) return;
    saveGuideSessionsMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, payload: serializeOperationsSnapshot({ sessions, repairReports }) });
  }, [fullAppDemo, isStorageHydrated, isGuideSnapshotHydrated, sessions, repairReports]);
  useEffect(() => {
    if (fullAppDemo || !isStorageHydrated || !guideStateHydrated.current || (!canonicalDirectory.isSuccess && !fullAppDemo)) return;
    saveGuideStateMutation.mutate(
      { key: OPERATIONS_SNAPSHOT_KEYS.guideState, payload: serializeOperationsSnapshot({ vehicles, members, sessions, messages, repairReports, alertReports, repairQueue }) },
      { onError: () => setNotice("บันทึกข้อมูลการทำงานเข้าฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่") },
    );
  }, [fullAppDemo, isStorageHydrated, canonicalDirectory.isSuccess, vehicles, members, sessions, messages, repairReports, alertReports, repairQueue]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  // Cross-device session refresh is provided by guideSessionsQuery polling.
  // Safety guidance is hydrated from the Mechanic Warning Tab 2 vehicleFlow Server snapshot.
  useEffect(() => {
    const memberId = currentMemberId || activeUserId;
    if (!memberId) return;
    const own = sessions.find(session => session.status === "Active" && session.memberIds.includes(memberId)) ?? sessions.find(session => session.status === "Standby" && session.memberIds.includes(memberId));
    if (own && !selectedSessionId) setSelectedSessionId(own.sessionId);
  }, [sessions, currentMemberId, activeUserId, selectedSessionId]);
  // Active vehicle status is reconciled from the Supervisor fleet Server snapshot; Browser storage is not authoritative.

  const orderedDirectoryUsers = [...directoryUsers].sort((a, b) => {
    if (String(a.id) === activeUserId) return -1;
    if (String(b.id) === activeUserId) return 1;
    return a.name.localeCompare(b.name, "th");
  });
  const activeUser = directoryUsers.find(user => String(user.id) === activeUserId);
  const visibleRepairReports = useMemo(() => repairReports.filter(report => {
    const movedToWaitingParts = String(report.status) === "รออะไหล่ใช้งานได้"
      || safetyNotices.some(notice => notice.waitingParts && (notice.id === report.id || notice.sourceRepairReportId === report.id));
    return report.status !== "ซ่อมเสร็จ" && !report.completedAt && !movedToWaitingParts;
  }), [repairReports, safetyNotices]);
  const { isAuthenticated: isOAuthAuthenticated, user: authenticatedUser } = useAuth();
  const isAuthenticated = Boolean(currentIdentity) || isOAuthAuthenticated;
  const authenticatedActor = authenticatedUser?.name ? { id: String(authenticatedUser.id), name: authenticatedUser.name } : undefined;
  const currentActor = resolveAppActor(currentIdentity, authenticatedActor ?? (activeUser ? { id: String(activeUser.id), name: activeUser.name } : undefined));
  const currentOperatorName = currentActor.name;
  const currentOperatorId = currentActor.id;
  const runQueueQuery = trpc.runQueue.get.useQuery(undefined, { retry: false, refetchInterval: 1000 });
  const standbyQueueKeys = useMemo(() => {
    const remote = parseOperationsSnapshot<{ state?: { standby?: unknown[]; members?: Record<string, { name?: unknown }> } }>(runQueueQuery.data);
    if (!Array.isArray(remote?.state?.standby)) return [];
    return remote.state.standby
      .filter((id): id is string => typeof id === "string")
      .map(id => typeof remote.state?.members?.[id]?.name === "string" ? remote.state.members[id].name : id);
  }, [runQueueQuery.data]);
  const standbyQueueManagerIds = useMemo(() => standbyQueueKeys.map(key => {
    const normalized = key.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
    return String(directoryMembers.find(member => String(member.id) === key || member.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH") === normalized)?.id ?? key);
  }), [standbyQueueKeys, directoryMembers]);
  const selectableMembers = useMemo(() => sortGuideMembersByQueue(
    excludeCurrentGuideMember(directoryMembers, currentMemberId, activeUserId, activeUser?.name),
    standbyQueueKeys,
  ), [directoryMembers, currentMemberId, activeUserId, activeUser?.name, standbyQueueKeys]);
  useEffect(() => {
    setSelectedMemberIds(current => current.filter(id => ![currentMemberId, activeUserId].filter(Boolean).includes(id)));
  }, [currentMemberId, activeUserId]);
  const flowUtils = trpc.useUtils();
  const guideSessionsQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions }, { retry: false, refetchInterval: 1000 });
  const guideStateQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.guideState }, { retry: false, refetchInterval: 1000 });
  const vehicleFlowSnapshotQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.vehicleFlow }, { retry: false, refetchInterval: 1000 });
  const supervisorFleetSnapshotQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.fleet }, { retry: false, refetchInterval: 1000 });
  const mechanicStateQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.mechanicState }, { retry: false, refetchInterval: 1000 });
  const saveGuideSessionsMutation = trpc.operationsSnapshots.merge.useMutation();
  const saveGuideStateMutation = trpc.operationsSnapshots.merge.useMutation();
  const saveSupervisorFleetSnapshotMutation = trpc.operationsSnapshots.merge.useMutation();
  const saveVehicleFlowSnapshotMutation = trpc.operationsSnapshots.merge.useMutation();
  const appendGuideMessageMutation = trpc.operationsSnapshots.append.useMutation();
  const payoutVerifyMutation = trpc.directory.verifyCurrentCode.useMutation();
  const sessionMessageMigrationAttempted = useRef(false);
  const guideStateHydrated = useRef(false);
  const expiryAlertedSessions = useRef(new Set<string>());
  const autoCompletionInFlight = useRef(new Set<string>());
  const repairAlertedReports = useRef(new Set<string>());
  const repairAlertBaselineReady = useRef(false);
  const expiryAudioContext = useRef<AudioContext | null>(null);

  const playExpiryAlertSound = () => {
    if (typeof window === "undefined") return;
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = expiryAudioContext.current ?? new AudioContextConstructor();
    expiryAudioContext.current = context;
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime;
    [0, 0.24, 0.48].forEach(offset => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.2);
    });
  };

  useEffect(() => {
    const unlockExpiryAudio = () => {
      if (typeof window === "undefined") return;
      const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      expiryAudioContext.current ??= new AudioContextConstructor();
      if (expiryAudioContext.current.state === "suspended") void expiryAudioContext.current.resume();
    };
    window.addEventListener("pointerdown", unlockExpiryAudio);
    window.addEventListener("touchstart", unlockExpiryAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockExpiryAudio);
      window.removeEventListener("touchstart", unlockExpiryAudio);
    };
  }, []);
  useEffect(() => {
    if (!guideStateQuery.isSuccess || guideStateHydrated.current) return;
    const remote = parseOperationsSnapshot<Partial<{ vehicles: GuideVehicle[]; members: GuideMember[]; sessions: ModuleSession[]; messages: ModuleMessage[]; repairReports: RepairReport[]; alertReports: AlertReport[]; repairQueue: RepairQueueItem[]; payoutRoundValues: PersonalPayoutValues }>>(guideStateQuery.data);
    if (Array.isArray(remote?.vehicles)) setVehicles(remote.vehicles);
    if (!canonicalDirectory.isSuccess && Array.isArray(remote?.members)) setMembers(remote.members);
    if (Array.isArray(remote?.sessions)) setSessions(remote.sessions);
    if (Array.isArray(remote?.messages)) setMessages(remote.messages);
    if (Array.isArray(remote?.repairReports)) {
      setRepairReports(current => mergeGuideRepairReports(current, remote.repairReports as RepairReport[]) as RepairReport[]);
    }
    if (Array.isArray(remote?.alertReports)) setAlertReports(remote.alertReports);
    if (Array.isArray(remote?.repairQueue)) setRepairQueue(remote.repairQueue);
    if (remote?.payoutRoundValues && typeof remote.payoutRoundValues === "object") {
      setPayoutRoundValues(remote.payoutRoundValues);
      setPayoutDraftValues(remote.payoutRoundValues);
    }
    guideStateHydrated.current = true;
  }, [guideStateQuery.data, guideStateQuery.isSuccess]);
  useEffect(() => {
    if (!guideSessionsQuery.isSuccess) return;
    const remote = parseOperationsSnapshot<{ sessions?: unknown[]; messages?: unknown[]; repairReports?: unknown[]; maintenanceNotifications?: unknown[] }>(guideSessionsQuery.data);
    if (Array.isArray(remote?.sessions)) {
      setSessions(current => {
        const merged = mergeSharedSessions(current, remote.sessions as ModuleSession[]);
        return JSON.stringify(current) === JSON.stringify(merged) ? current : merged;
      });
    }
    if (Array.isArray(remote?.messages)) {
      setMessages(current => {
        const merged = mergeSessionChatMessages(current, remote.messages ?? []);
        return JSON.stringify(current) === JSON.stringify(merged) ? current : merged;
      });
    } else if (remote === undefined && messages.length && !sessionMessageMigrationAttempted.current) {
      sessionMessageMigrationAttempted.current = true;
      saveGuideSessionsMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, payload: serializeOperationsSnapshot({ messages }) });
    }
    if (Array.isArray(remote?.repairReports)) {
      setRepairReports(current => {
        const remoteReports = remote.repairReports as RepairReport[];
        const merged = mergeGuideRepairReports(current, remoteReports) as RepairReport[];
        return JSON.stringify(current) === JSON.stringify(merged) ? current : merged;
      });
    }
    if (Array.isArray(remote?.maintenanceNotifications)) setMaintenanceNotifications(remote.maintenanceNotifications as VehicleMaintenanceNotification[]);
    setIsGuideSnapshotHydrated(true);
  }, [guideSessionsQuery.data, guideSessionsQuery.isSuccess, messages]);
  useEffect(() => {
    if (!supervisorFleetSnapshotQuery.isSuccess) return;
    const remote = parseOperationsSnapshot<{ vehicleDatabase?: Array<{ number: number; cc: "200" | "250" }>; vehicleState?: { vehicleGroups?: Array<{ cc: string; numbers: number[]; unavailable?: number[]; notifications?: number[]; inUse?: number[]; pickup?: number[] }>; responsibilityGroups?: Array<{ id: number | string; name?: string; managers: number[]; vehicleNumbers: number[]; color?: string }> }; pickupRequests?: VehiclePickupRequest[] }>(supervisorFleetSnapshotQuery.data);
    if (Array.isArray(remote?.vehicleDatabase) && remote.vehicleDatabase.length) {
      const unavailable = new Set((remote.vehicleState?.vehicleGroups ?? []).flatMap(group => group.unavailable ?? []));
      const inUse = new Set((remote.vehicleState?.vehicleGroups ?? []).flatMap(group => group.inUse ?? []));
      const pickup = new Set((remote.vehicleState?.vehicleGroups ?? []).flatMap(group => group.pickup ?? []));
      const repair = new Set((remote.vehicleState?.vehicleGroups ?? []).flatMap(group => group.notifications ?? []));
      const nextVehicles = remote.vehicleDatabase.map(vehicle => ({ id: `m3-v${vehicle.number}`, number: String(vehicle.number), cc: vehicle.cc, status: inUse.has(vehicle.number) ? "active" : pickup.has(vehicle.number) ? "pickup" : repair.has(vehicle.number) ? "repair" : unavailable.has(vehicle.number) ? "repair" : "ready" } as GuideVehicle));
      setVehicles(current => JSON.stringify(current) === JSON.stringify(nextVehicles) ? current : nextVehicles);
    }
    if (remote?.vehicleState?.vehicleGroups && remote.vehicleState.responsibilityGroups) setResponsibilityState(remote.vehicleState as typeof responsibilityState);
    if (Array.isArray(remote?.pickupRequests)) {
      const nextRequests = mergeVehiclePickupRequests([], remote.pickupRequests);
      setPickupRequests(current => JSON.stringify(current) === JSON.stringify(nextRequests) ? current : nextRequests);
    }
  }, [supervisorFleetSnapshotQuery.data, supervisorFleetSnapshotQuery.isSuccess]);
  useEffect(() => {
    if (!vehicleFlowSnapshotQuery.isSuccess) return;
    const remote = parseOperationsSnapshot<VehicleFlowSnapshot>(vehicleFlowSnapshotQuery.data);
    if (Array.isArray(remote?.safetyNotices)) {
      setSafetyNotices(current => JSON.stringify(current) === JSON.stringify(remote.safetyNotices) ? current : remote.safetyNotices!);
    }
  }, [vehicleFlowSnapshotQuery.data, vehicleFlowSnapshotQuery.isSuccess]);
  useEffect(() => {
    if (!vehicleFlowSnapshotQuery.isSuccess || !guideSessionsQuery.isSuccess) return;
    const flow = parseOperationsSnapshot<VehicleFlowSnapshot>(vehicleFlowSnapshotQuery.data);
    const guide = parseOperationsSnapshot<{ repairReports?: unknown[] }>(guideSessionsQuery.data);
    if (!Array.isArray(flow?.safetyNotices) || !Array.isArray(guide?.repairReports)) return;
    const cleaned = removeOrphanedVehicleSafetyNotices(flow.safetyNotices, guide.repairReports.filter((report): report is { id: string; status?: string; completedAt?: string } => Boolean(report && typeof report === "object" && typeof (report as { id?: unknown }).id === "string")));
    if (JSON.stringify(cleaned) === JSON.stringify(flow.safetyNotices)) return;
    setSafetyNotices(cleaned);
    saveVehicleFlowSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.vehicleFlow, payload: serializeOperationsSnapshot({ safetyNotices: cleaned }) });
  }, [guideSessionsQuery.data, guideSessionsQuery.isSuccess, vehicleFlowSnapshotQuery.data, vehicleFlowSnapshotQuery.isSuccess]);
  const vehicleSummaryQuery = trpc.vehicleFlow.summary.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const pickupNotificationsQuery = trpc.vehicleFlow.pickupNotifications.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const usingPersistentVehicleFlow = Boolean(vehicleSummaryQuery.data?.length);
  const refreshVehicleFlow = async () => {
    await Promise.all([
      flowUtils.vehicleFlow.summary.invalidate(),
      flowUtils.vehicleFlow.pickupNotifications.invalidate(),
    ]);
  };
  const reportRepairMutation = trpc.vehicleFlow.reportRepair.useMutation({ onSuccess: refreshVehicleFlow });
  const markPickupMutation = trpc.vehicleFlow.markPickup.useMutation({ onSuccess: refreshVehicleFlow });
  const receivePickupMutation = trpc.vehicleFlow.receivePickup.useMutation({ onSuccess: refreshVehicleFlow });
  const createSessionMutation = trpc.vehicleFlow.createSession.useMutation({ onSuccess: refreshVehicleFlow });
  const activateSessionMutation = trpc.vehicleFlow.activateSession.useMutation({ onSuccess: refreshVehicleFlow });
  const completeSessionMutation = trpc.vehicleFlow.completeSession.useMutation({ onSuccess: refreshVehicleFlow });
  const cancelSessionMutation = trpc.vehicleFlow.cancelSession.useMutation({ onSuccess: refreshVehicleFlow });
  const databaseVehicleId = (vehicleId: string) => {
    const parsed = Number(vehicleId.replace(/^m3-v/, ""));
    return usingPersistentVehicleFlow && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  };
  useEffect(() => {
    if (!vehicleSummaryQuery.data?.length) return;
    setVehicles(vehicleSummaryQuery.data.map(vehicle => ({
      id: String(vehicle.id),
      number: String(vehicle.vehicleNumber),
      cc: vehicle.engineCc,
      status: vehicle.status,
    })));
  }, [vehicleSummaryQuery.data]);
  useEffect(() => {
    if (currentMemberId && directoryUsers.some(user => String(user.id) === currentMemberId)) setActiveUserId(currentMemberId);
  }, [currentMemberId, directoryUsers]);
  const activeSessions = sessions.filter(item => item.status === "Active");
  const standbySessions = sessions.filter(item => item.status === "Standby");
  const followMemberId = currentMemberId || activeUserId;
  const ownFollowSession = followMemberId
    ? activeSessions.find(session => session.memberIds.includes(followMemberId)) ?? standbySessions.find(session => session.memberIds.includes(followMemberId))
    : undefined;
  const selectedSession = sessions.find(item => item.sessionId === selectedSessionId);
  useEffect(() => {
    if (!isGuideSnapshotHydrated) return;
    const currentReportIds = new Set(repairReports.map(report => report.id));
    if (!repairAlertBaselineReady.current) {
      currentReportIds.forEach(id => repairAlertedReports.current.add(id));
      repairAlertBaselineReady.current = true;
      return;
    }
    const newReports = repairReports.filter(report => !repairAlertedReports.current.has(report.id));
    if (!newReports.length) return;
    newReports.forEach(report => repairAlertedReports.current.add(report.id));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([350, 180, 350, 180, 650]);
    playExpiryAlertSound();
    showBrowserNotification("มีรายการแจ้งซ่อมใหม่", { body: `${newReports.length} รายการใหม่ กรุณาเปิดหน้าแจ้งซ่อมเพื่อตรวจสอบ`, tag: `atv-repair-report-${newReports.map(report => report.id).join("-")}` });
    setNotice(`มีรายการแจ้งซ่อมใหม่ ${newReports.length} รายการ`);
  }, [repairReports, isGuideSnapshotHydrated]);

  useEffect(() => {
    const currentUserId = currentMemberId || activeUserId;
    if (!currentUserId) return;
    sessions.filter(session => session.status === "Active" && session.timerEnabled !== false && session.startedAt && (session.memberIds.includes(currentUserId) || session.activeUserId === currentUserId)).forEach(session => {
      const scheduledEnd = session.scheduledEndAt ? Date.parse(session.scheduledEndAt) : Number.NaN;
      const expiresAt = Number.isFinite(scheduledEnd) ? scheduledEnd : Date.parse(session.startedAt!) + session.durationMinutes * 60_000;
      if (expiresAt > now || expiryAlertedSessions.current.has(session.sessionId)) return;
      expiryAlertedSessions.current.add(session.sessionId);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([500, 250, 500, 250, 700]);
      playExpiryAlertSound();
      const autoComplete = session.expiryBehavior === "auto_complete";
      showBrowserNotification("รายการ Active หมดเวลาแล้ว", { body: autoComplete ? `${session.sessionId} ครบเวลา ระบบกำลังจบรายการอัตโนมัติ` : session.expiryBehavior === "overtime" ? `${session.sessionId} ครบเวลาแล้วและกำลังนับเวลาเกิน` : `${session.sessionId} หมดเวลาแล้ว กรุณาตรวจสอบและยืนยันจบงาน`, tag: `atv-active-expired-${session.sessionId}` });
      setNotice(autoComplete ? `รายการ ${session.sessionId} ครบเวลา ระบบจะจบรายการอัตโนมัติ` : session.expiryBehavior === "overtime" ? `รายการ ${session.sessionId} ครบเวลาและกำลังนับเวลาเกิน` : `แจ้งเตือน: ${session.sessionId} หมดเวลาแล้ว กรุณาตรวจสอบและยืนยันจบงาน`);
    });
  }, [sessions, now, currentMemberId, activeUserId]);

  useEffect(() => {
    if (selectedSession?.status !== "Active" || selectedSession.timerEnabled === false || !selectedSession.startedAt || selectedSession.overtimeAcknowledged || !canManageSelectedSession("edit")) return;
    const durationMs = selectedSession.durationMinutes * 60_000;
    if (Date.parse(selectedSession.startedAt) + durationMs > now) return;
    if (selectedSession.expiryBehavior === "auto_complete") {
      if (autoCompletionInFlight.current.has(selectedSession.sessionId)) return;
      autoCompletionInFlight.current.add(selectedSession.sessionId);
      setNotice(`รายการ ${selectedSession.sessionId} ครบเวลา ระบบกำลังจบรายการอัตโนมัติ`);
      finalizeSession();
      return;
    }
    setCompletionPrompt(current => current?.sessionId === selectedSession.sessionId ? current : { sessionId: selectedSession.sessionId, kind: "expired" });
  }, [now, selectedSession?.sessionId, selectedSession?.status, selectedSession?.startedAt, selectedSession?.durationMinutes, selectedSession?.expiryBehavior, selectedSession?.overtimeAcknowledged]);
  const isSelectedSessionMember = Boolean(selectedSession && currentMemberId && selectedSession.memberIds.includes(currentMemberId));
  const canManageSelectedSession = (action: PermissionAction = "edit") => Boolean(selectedSession && canManageActiveSession(currentRoleId, isSelectedSessionMember));
  const canSendSelectedSessionMessage = canSendSessionMessage(Boolean(selectedSession));
  const canOperateSelectedSession = canManageSelectedSession;
  const isOwnSession = (session: ModuleSession) => Boolean(currentMemberId && session.memberIds.includes(currentMemberId));
  const editingVehicleIds = useMemo(() => new Set(editingSessionId ? (sessions.find(item => item.sessionId === editingSessionId)?.vehicleIds ?? []) : []), [editingSessionId, sessions]);
  const editingMemberIds = useMemo(() => new Set(editingSessionId ? (sessions.find(item => item.sessionId === editingSessionId)?.memberIds ?? []) : []), [editingSessionId, sessions]);
  const busyVehicleIds = useMemo(() => new Set(sessions.filter(item => item.status !== "Completed").flatMap(item => item.vehicleIds)), [sessions]);
  const busyMemberIds = useMemo(() => new Set(sessions.filter(item => item.status !== "Completed").flatMap(item => item.memberIds)), [sessions]);
  const currentOwnerId = Number(currentMemberId || activeUserId) || undefined;
  const managedVehicleNumbers = new Set(responsibilityState.responsibilityGroups.filter(group => currentOwnerId !== undefined && group.managers.includes(currentOwnerId)).flatMap(group => group.vehicleNumbers));
  const managedVehicles = vehicles.filter(vehicle => managedVehicleNumbers.has(Number(vehicle.number)));
  // Single Door: Guide reads the exact same canonical source/model as Mechanic and Supervisor.
  // Do not rebuild a Guide-local summary here; the inner group view must receive this same object.
  const guideStatusModel = useMemo(() => buildSupervisorUserDirectoryStatusModel(buildSupervisorUserDirectoryStatusSource({
    vehicleDatabase: vehicles.map(vehicle => ({ number: Number(vehicle.number), cc: vehicle.cc })),
    vehicleState: responsibilityState,
    guideReports: repairReports.filter(report => !safetyNotices.some(notice => notice.waitingParts && (notice.id === report.id || notice.sourceRepairReportId === report.id))),
    mechanicRepairs: parseOperationsSnapshot<{ repairs?: unknown }>(mechanicStateQuery.data)?.repairs,
    guidanceVehicleNumbers: safetyNotices.map(notice => notice.vehicleNumber),
    pickupVehicleNumbers: pickupRequests.filter(request => request.status === "รอรับรถ").map(request => request.vehicleNumber),
    activeVehicleNumbers: activeSessions.flatMap(session => session.vehicleIds.map(id => Number(String(id).replace(/^m3-v/, "")))),
  })), [activeSessions, mechanicStateQuery.data, pickupRequests, responsibilityState, repairReports, safetyNotices, vehicles]);
  const summaryForCc = (cc: GuideVehicle["cc"]) => ({ ...guideStatusModel.byCc[cc].summary, alert: safetyNotices.filter(notice => vehicles.some(vehicle => vehicle.cc === cc && Number(vehicle.number) === notice.vehicleNumber)).length });
  // 2.1 uses the same Supervisor Database status model as the dashboard and Group View.
  const guideInputVehicles = useMemo<GuideVehicle[]>(() => buildSupervisorInputVehicles(guideStatusModel).map(vehicle => ({
    id: `m3-v${vehicle.number}`,
    number: String(vehicle.number),
    cc: vehicle.cc,
    status: vehicle.status,
  })), [guideStatusModel]);
  const guideInputVehicleGroups = useMemo(() => groupVehicleOptionsByResponsibility(
    guideInputVehicles.filter(vehicle => isVehicleOperationallyReadyStatus(vehicle.status)),
    responsibilityState.responsibilityGroups,
  ), [guideInputVehicles, responsibilityState.responsibilityGroups]);
  const orderedGuideInputVehicleGroups = useMemo(() => prioritizeVehicleGroupsByQueue(
    guideInputVehicleGroups,
    responsibilityState.responsibilityGroups,
    Array.from(new Set([currentOperatorId, ...selectedMemberIds].filter((id): id is string => Boolean(id)))),
    standbyQueueManagerIds,
  ), [guideInputVehicleGroups, responsibilityState.responsibilityGroups, currentOperatorId, selectedMemberIds, standbyQueueManagerIds]);
  const orderedGuideInputVehicles = useMemo(() => [...guideInputVehicles].sort((left, right) => Number(left.number) - Number(right.number)), [guideInputVehicles]);
  const selectedMessages = messages.filter(item => item.sessionId === selectedSessionId);
  const responsibleManagersForNumber = (number: number) => resolveVehicleManagerNames(number, responsibilityState.responsibilityGroups, directoryUsers);
  const vehicleResponsibilityMeta = (number: number) => {
    const view = resolveVehicleResponsibilityView(number, responsibilityState.responsibilityGroups, directoryUsers);
    return { groupLabel: view.groupLabel, managerLabel: view.managerLabel };
  };
  const renderInputVehicle = (vehicle: GuideVehicle) => {
    const number = Number(vehicle.number);
    const meta = vehicleResponsibilityMeta(number);
    const selected = selectedVehicleIds.includes(vehicle.id);
    const locked = busyVehicleIds.has(vehicle.id) && !editingVehicleIds.has(vehicle.id);
    return <button key={vehicle.id} aria-pressed={selected} aria-label={`เบอร์รถ ${number}${selected ? " เลือกแล้ว" : ""}`} style={{ "--vehicle-accent": getResponsibilityGroupColor(number, responsibilityState.responsibilityGroups), borderColor: getResponsibilityGroupColor(number, responsibilityState.responsibilityGroups) } as CSSProperties} disabled={locked} className={`m3-guide-21-vehicle-tile ${vehicle.status} ${selected ? "selected m3-selected-vehicle" : ""} ${locked ? "locked" : ""} ${meta.groupLabel === "ยังไม่มีกลุ่ม" ? "unassigned" : ""}`} onClick={() => toggleVehicle(vehicle)}>{selected && <span className="m3-guide-21-selected-check" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>}<span className="m3-lot-number-wrap"><b style={{ color: getResponsibilityGroupColor(number, responsibilityState.responsibilityGroups) }}>#{number}</b><VehicleSafetyNoticeIndicator notices={safetyNotices} vehicleNumber={number} accentColor={getResponsibilityGroupColor(number, responsibilityState.responsibilityGroups)} inline onOpen={notices => setSelectedSafetyNoticeId(notices[0]?.id)} /></span><small>{locked ? (sessions.find(session => session.vehicleIds.includes(vehicle.id) && session.status !== "Completed")?.status === "Active" ? "กำลัง Active" : "อยู่ใน Standby") : vehicle.status === "inspection" ? "พร้อมใช้ · มีคำแนะนำ" : "พร้อม"}</small><em>{meta.groupLabel}</em><em>{meta.managerLabel}</em></button>;
  };

  const updateCentralVehicleStatus = (vehicleIds: string[], status: SharedVehicleStatus) => {
    const numbers = vehicleIds.map(id => Number(id.replace("m3-v", ""))).filter(number => Number.isInteger(number) && number > 0);
    const nextState = { ...setVehicleStatusForNumbers(responsibilityState, numbers, status), version: responsibilityState.version ?? 1, updatedAt: Date.now() };
    const nextStatus: VehicleStatus = status === "active" ? "active" : status === "pickup" ? "pickup" : status === "repair" ? "repair" : "ready";
    const nextVehicles: GuideVehicle[] = vehicles.map(vehicle => vehicleIds.includes(vehicle.id) ? { ...vehicle, status: nextStatus } : vehicle);
    setResponsibilityState(nextState);
    setVehicles(nextVehicles);
    saveSupervisorFleetSnapshotMutation.mutate({
      key: OPERATIONS_SNAPSHOT_KEYS.fleet,
      payload: serializeOperationsSnapshot({
        vehicleDatabase: nextVehicles.map(vehicle => ({ number: Number(vehicle.number), cc: vehicle.cc })),
        fleetGroups: nextState.responsibilityGroups.map(group => ({ id: String(group.id), name: group.name ?? `กลุ่ม ${group.id}`, vehicleNumbers: group.vehicleNumbers, managerIds: group.managers, color: group.color || "#81e597" })),
        vehicleState: nextState,
        pickupRequests,
      }),
    });
  };

  const openSession = (session: ModuleSession) => { setSelectedSessionId(session.sessionId); setScreen(session.status === "Active" ? "active" : session.status === "Completed" ? "completed" : "standby"); };
  const sessionFollowPopup = <SessionFollowPopup session={ownFollowSession} members={members} now={now} screen={screen} onOpen={() => ownFollowSession && openSession(ownFollowSession)} />;
  const toggleVehicle = (vehicle: GuideVehicle) => { const editingCurrent = editingSessionId !== undefined && selectedSessionId === editingSessionId && editingVehicleIds.has(vehicle.id); const busySession = findSessionConflict(sessions, { vehicleIds: [vehicle.id] }, members); const staleActive = vehicle.status === "active" && !busySession; if ((!isVehicleOperationallyReadyStatus(vehicle.status) && !staleActive) || (busySession && !editingCurrent)) return; setSelectedVehicleIds(current => current.includes(vehicle.id) ? current.filter(id => id !== vehicle.id) : [...current, vehicle.id]); };
  const toggleMember = (member: GuideMember) => { const editingCurrent = editingSessionId !== undefined && selectedSessionId === editingSessionId && editingMemberIds.has(member.id); const busySession = findSessionForMember(sessions, member.id, member.name, members); if ((!member.available || busySession) && !editingCurrent) return; setSelectedMemberIds(current => current.includes(member.id) ? current.filter(id => id !== member.id) : [...current, member.id]); };
  const createSession = () => {
    if (!currentOperatorName) { setNotice("ยังไม่พบ identity ผู้ทำรายการจากบัญชีที่ล็อกอิน"); return; }
    const operatorId = currentOperatorId ?? "";
    const operatorMember = members.find(member => member.id === operatorId);
    if (!currentIdentity?.special && !operatorMember) { setNotice("บัญชีที่ล็อกอินยังไม่มีสิทธิ์เป็น Guide/Mechanic ในฐานข้อมูลหัวหน้า"); return; }
    const sessionMemberIds = Array.from(new Set([operatorId, ...selectedMemberIds]));
    if (!selectedVehicleIds.length) { setNotice("ต้องเลือกรถพร้อมใช้อย่างน้อย 1 คัน"); return; }
    const draftDuplicates = findSessionDraftDuplicates({ memberIds: sessionMemberIds, vehicleIds: selectedVehicleIds }, members);
    if (draftDuplicates.memberNames.length || draftDuplicates.vehicleKeys.length) {
      setNotice(`รายการนี้มีข้อมูลซ้ำ${draftDuplicates.memberNames.length ? ` ชื่อ ${draftDuplicates.memberNames.join(", ")}` : ""}${draftDuplicates.vehicleKeys.length ? ` รถ #${draftDuplicates.vehicleKeys.join(", #")}` : ""} กรุณาแก้ก่อนบันทึก`);
      return;
    }
    const conflict = findSessionConflict(sessions, { memberIds: sessionMemberIds, activeUserName: currentOperatorName, vehicleIds: selectedVehicleIds }, members, editingSessionId);
    if (conflict) {
      const existing = conflict.session as ModuleSession;
      const reason = conflict.reason === "member" ? "สมาชิกหรือชื่อผู้ทำรายการ" : "รถที่เลือก";
      setSelectedSessionId(existing.sessionId ?? "");
      setNotice(`${reason} อยู่ใน ${existing.status === "Active" ? "Active" : "Standby"} ${existing.sessionId} แล้ว จึงสร้างรายการซ้ำไม่ได้ ระบบเปิดรายการเดิมให้ตรวจสอบ`);
      setScreen(existing.status === "Active" ? "active" : "standby");
      return;
    }
    setDurationPickerOpen(true);
  };
  const commitSession = (chosenDuration: 30 | 60) => {
    const vehicleStatusesBeforeSession = Object.fromEntries(selectedVehicleIds.map(id => [id, guideInputVehicles.find(vehicle => vehicle.id === id)?.status ?? "ready"])) as Record<string, VehicleStatus>;
    const operatorId = currentOperatorId ?? "";
    const sessionMemberIds = Array.from(new Set([operatorId, ...selectedMemberIds]));
    if (editingSessionId) { const editAt = new Date().toISOString(); const previousSession = sessions.find(item => item.sessionId === editingSessionId); const vehicleHistory = reconcileVehicleHistory(previousSession ?? { sessionId: editingSessionId, vehicleIds: [], createdAt: editAt }, vehicles, selectedVehicleIds, editAt); patchSession({ durationMinutes: chosenDuration, vehicleIds: selectedVehicleIds, memberIds: sessionMemberIds, vehicleStatusesBeforeSession: vehicleStatusesBeforeSession, activeUserId: operatorId, activeUserName: currentOperatorName, riderCount, passengerCount, vehicleHistory }, recordSessionActivity("แก้ไขรายการ", `รถ ${selectedVehicleIds.map(id => `#${vehicles.find(vehicle => vehicle.id === id)?.number ?? "?"}`).join(", ")} · สมาชิก ${sessionMemberIds.map(id => members.find(member => member.id === id)?.name ?? id).join(", ")} · ${chosenDuration} นาที · R ${riderCount} · P ${passengerCount}`)); setSelectedSessionId(editingSessionId); setSelectedVehicleIds([]); setSelectedMemberIds([]); setEditingSessionId(undefined); setDurationPickerOpen(false); setNotice(`แก้ไขรายการ ${editingSessionId} แล้ว โดยคง Session_ID เดิม`); setScreen("standby"); return; }
    const createdAt = new Date().toISOString();
    const session: ModuleSession = { sessionId: `M3-${createdAt.slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, status: "Standby", durationMinutes: chosenDuration, vehicleIds: selectedVehicleIds, memberIds: sessionMemberIds, activeUserId: operatorId, activeUserName: currentOperatorName, riderCount, passengerCount, createdAt, vehicleStatusesBeforeSession, activityLog: [createSessionActivity({ actorId: operatorId, actorName: currentOperatorName, action: "สร้างรายการ → Standby", detail: `รถ ${selectedVehicleIds.map(id => `#${vehicles.find(vehicle => vehicle.id === id)?.number ?? "?"}`).join(", ")} · สมาชิก ${sessionMemberIds.map(id => members.find(member => member.id === id)?.name ?? id).join(", ")} · ${chosenDuration} นาที · R ${riderCount} · P ${passengerCount}`, createdAt })], vehicleHistory: buildVehicleHistory(vehicles, selectedVehicleIds, createdAt) };
    setSessions(current => [...current, session]); setSelectedSessionId(session.sessionId); setSelectedVehicleIds([]); setSelectedMemberIds([]); setDurationPickerOpen(false); setNotice("สร้าง Session ใหม่แล้ว และคง Session_ID นี้จนจบงาน"); setScreen("standby");
    const databaseVehicleIds = selectedVehicleIds.map(databaseVehicleId);
    if (isAuthenticated && databaseVehicleIds.every((id): id is number => id !== undefined)) {
      createSessionMutation.mutate({ sessionCode: session.sessionId, durationMinutes: chosenDuration, vehicleIds: databaseVehicleIds, startImmediately: false }, {
        onSuccess: result => setSessions(current => current.map(item => item.sessionId === session.sessionId ? { ...item, persistentSessionId: result.sessionId } : item)),
        onError: () => setNotice("บันทึก Session ลงฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
      });
    }
  };
  const recordSessionActivity = (action: string, detail?: string): SessionActivity => createSessionActivity({ actorId: currentOperatorId, actorName: currentOperatorName ?? "ผู้ใช้งานปัจจุบัน", action, detail, createdAt: new Date().toISOString() });
  const patchSession = (patch: Partial<ModuleSession>, activity?: SessionActivity) => { if (!selectedSessionId) return; setSessions(current => current.map(item => item.sessionId === selectedSessionId ? { ...item, ...patch, ...(activity ? { activityLog: appendSessionActivity(item.activityLog, activity) } : {}) } : item)); };
  const resetInputDraft = () => { setEditingSessionId(undefined); setSelectedVehicleIds([]); setSelectedMemberIds([]); setDuration(30); setRiderCount(1); setPassengerCount(0); setActiveUserId(String(activeUser?.id ?? currentMemberId ?? "")); setMemberSearch(""); };
  const startNewSession = () => { const existing = !isPrivileged ? findSessionForMember(sessions, currentMemberId, currentOperatorName, members) : undefined; if (existing) { setSelectedSessionId(existing.sessionId ?? ""); setNotice(`คุณมีชื่ออยู่ใน ${existing.status === "Active" ? "Active" : "Standby"} ${existing.sessionId} แล้ว ระบบเปิดรายการเดิมให้ตรวจสอบ`); setScreen(existing.status === "Active" ? "active" : "standby"); return; } setEditingSessionId(undefined); setDuration(timerSettingsQuery.data?.defaultDurationMinutes ?? DEFAULT_SUPERVISOR_TIMER_SETTINGS.defaultDurationMinutes); setSelectedVehicleIds([]); setSelectedMemberIds(currentMemberId && members.some(member => member.id === currentMemberId) ? [currentMemberId] : []); setActiveUserId(currentMemberId || activeUserId); setNotice(""); setScreen("input"); };
  const startSession = () => { if (!selectedSession || !canManageSelectedSession("edit")) { setNotice(permissionMessage("edit")); return; } const applyStart = () => { const timerSettings = timerSettingsQuery.data ?? DEFAULT_SUPERVISOR_TIMER_SETTINGS; const startedAt = selectedSession.startedAt ?? new Date().toISOString(); const scheduledEndAt = timerSettings.enabled ? new Date(Date.parse(startedAt) + selectedSession.durationMinutes * 60_000).toISOString() : undefined; patchSession({ status: "Active", startedAt, scheduledEndAt, timerEnabled: timerSettings.enabled, expiryBehavior: timerSettings.expiryBehavior, overtimeAcknowledged: false }, recordSessionActivity("เริ่มงาน → Active", `รถ ${selectedSession.vehicleIds.map(id => `#${vehicles.find(vehicle => vehicle.id === id)?.number ?? "?"}`).join(", ")}`)); setVehicles(current => current.map(vehicle => selectedSession.vehicleIds.includes(vehicle.id) ? { ...vehicle, status: "active" } : vehicle)); updateCentralVehicleStatus(selectedSession.vehicleIds, "active"); setScreen("active"); }; if (usingPersistentVehicleFlow) { if (!selectedSession.persistentSessionId) { setNotice("Session กำลังบันทึกลงฐานข้อมูล กรุณารอสักครู่"); return; } activateSessionMutation.mutate({ sessionId: selectedSession.persistentSessionId }, { onSuccess: applyStart, onError: () => setNotice("ไม่สามารถเริ่ม Session ในฐานข้อมูลได้") }); return; } applyStart(); };
  const finalizeSession = () => { if (!selectedSession || !canManageSelectedSession("edit")) { if (selectedSession) setNotice(permissionMessage("edit")); return; } const applyCompletion = () => { const completedAt = new Date().toISOString(); const completionTiming = sessionCompletionTiming(selectedSession.startedAt, completedAt, selectedSession.durationMinutes); patchSession({ status: "Completed", completedAt, completedById: currentOperatorId, completedByName: currentOperatorName ?? "ผู้ใช้งานปัจจุบัน", completionTiming }, recordSessionActivity("จบงาน → Completed", `รถ ${selectedSession.vehicleIds.map(id => `#${vehicles.find(vehicle => vehicle.id === id)?.number ?? "?"}`).join(", ")} · ${completionTimingDetail(completionTiming)} · ใช้เวลาจริง ${formatCompletionDifference(completionTiming.actualSeconds)}`)); setVehicles(current => current.map(vehicle => selectedSession.vehicleIds.includes(vehicle.id) ? { ...vehicle, status: "ready" } : vehicle)); updateCentralVehicleStatus(selectedSession.vehicleIds, "ready"); autoCompletionInFlight.current.delete(selectedSession.sessionId); setCompletionPrompt(null); setNotice(`จบรายการ ${selectedSession.sessionId} แล้ว รถกลับเป็นพร้อมใช้`); setQueuePayoutView("daily"); setScreen("queuePayout"); }; if (usingPersistentVehicleFlow) { if (!selectedSession.persistentSessionId) { autoCompletionInFlight.current.delete(selectedSession.sessionId); setNotice("ไม่พบ Session นี้ในฐานข้อมูล"); return; } completeSessionMutation.mutate({ sessionId: selectedSession.persistentSessionId }, { onSuccess: applyCompletion, onError: () => { autoCompletionInFlight.current.delete(selectedSession.sessionId); setNotice("ไม่สามารถจบ Session ในฐานข้อมูลได้"); } }); return; } applyCompletion(); };
  const requestCompleteSession = () => { if (!selectedSession || !canOperateSelectedSession("edit")) { setNotice(permissionMessage("edit")); return; } setCompletionPrompt({ sessionId: selectedSession.sessionId, kind: "manual" }); };
  const applyStandbyCancellation = () => {
    if (!selectedSession) return;
    const cancelledSessionId = selectedSession.sessionId;
    setSessions(current => current.filter(item => item.sessionId !== cancelledSessionId));
    setVehicles(current => current.map(vehicle => selectedSession.vehicleIds.includes(vehicle.id) ? { ...vehicle, status: "ready" } : vehicle));
    updateCentralVehicleStatus(selectedSession.vehicleIds, "ready");
    setCompletionPrompt(null);
    setSelectedSessionId("");
    setNotice(`ยกเลิกรายการ ${cancelledSessionId} แล้ว รถกลับเป็นพร้อมใช้`);
    setQueuePayoutView("daily"); setScreen("queuePayout");
  };
  const cancelStandbySession = () => {
    if (!selectedSession || selectedSession.status !== "Standby" || !canManageSelectedSession("edit")) { if (selectedSession) setNotice(permissionMessage("edit")); return; }
    if (usingPersistentVehicleFlow) {
      if (!selectedSession.persistentSessionId) { setNotice("Session กำลังบันทึกลงฐานข้อมูล กรุณารอสักครู่"); return; }
      cancelSessionMutation.mutate({ sessionId: selectedSession.persistentSessionId }, { onSuccess: applyStandbyCancellation, onError: () => setNotice("ไม่สามารถยกเลิก Session ในฐานข้อมูลได้") });
      return;
    }
    applyStandbyCancellation();
  };
  const requestCancelStandby = () => {
    if (!selectedSession || selectedSession.status !== "Standby" || !canManageSelectedSession("edit")) { if (selectedSession) setNotice(permissionMessage("edit")); return; }
    setCompletionPrompt({ sessionId: selectedSession.sessionId, kind: "cancel-standby" });
  };
  const keepSessionOpenAfterExpiry = () => { if (!selectedSession || !canManageSelectedSession("edit") || completionPrompt?.sessionId !== selectedSession.sessionId) return; patchSession({ overtimeAcknowledged: true }, recordSessionActivity("หมดเวลาแต่ยังไม่จบ", "ยืนยันให้รายการ Active นับเวลาบวกต่อจนกว่าจะกดจบ/คืนรถ")); setCompletionPrompt(null); setNotice(`รายการ ${selectedSession.sessionId} ยังไม่จบ ระบบจะนับเวลาบวกต่อ`); };
  const addVehicle = (vehicle: GuideVehicle) => { if (!selectedSession || !canManageSelectedSession("changeVehicle") || !isVehicleOperationallyReadyStatus(vehicle.status) || busyVehicleIds.has(vehicle.id)) { if (selectedSession) setNotice(permissionMessage("changeVehicle")); return; } const changedAt = new Date().toISOString(); patchSession({ vehicleIds: [...selectedSession.vehicleIds, vehicle.id], vehicleHistory: reconcileVehicleHistory(selectedSession, vehicles, [...selectedSession.vehicleIds, vehicle.id], changedAt) }, recordSessionActivity("เพิ่มรถในรายการ", `เพิ่มรถ #${vehicle.number} · ${vehicle.cc} ซีซี`)); setVehicles(current => current.map(item => item.id === vehicle.id ? { ...item, status: "active" } : item)); updateCentralVehicleStatus([vehicle.id], "active"); };
  const changeVehicle = (oldId: string, next: GuideVehicle) => { if (!selectedSession || !canManageSelectedSession("changeVehicle") || !isVehicleOperationallyReadyStatus(next.status) || busyVehicleIds.has(next.id)) { if (selectedSession) setNotice(permissionMessage("changeVehicle")); return; } const changedAt = new Date().toISOString(); const nextVehicleIds = selectedSession.vehicleIds.map(id => id === oldId ? next.id : id); patchSession({ vehicleIds: nextVehicleIds, vehicleHistory: reconcileVehicleHistory(selectedSession, vehicles, nextVehicleIds, changedAt) }, recordSessionActivity("เปลี่ยนรถในรายการ", `เปลี่ยนรถ #${vehicles.find(vehicle => vehicle.id === oldId)?.number ?? "?"} เป็น #${next.number}`)); setVehicles(current => current.map(item => item.id === oldId ? { ...item, status: "ready" } : item.id === next.id ? { ...item, status: "active" } : item)); updateCentralVehicleStatus([oldId], "ready"); updateCentralVehicleStatus([next.id], "active"); };
  const addMembers = (memberIds = selectedMemberIds) => { if (!selectedSession || !canManageSelectedSession("edit") || !memberIds.length) { if (selectedSession) setNotice(permissionMessage("edit")); return; } patchSession({ memberIds: Array.from(new Set([...selectedSession.memberIds, ...memberIds])) }, recordSessionActivity("เพิ่มสมาชิกในรายการ", memberIds.map(id => members.find(member => member.id === id)?.name ?? id).join(", "))); setSelectedMemberIds([]); setMemberSearch(""); setActiveDialog(null); };
  const removeVehicleFromActive = (vehicleId: string) => { if (!selectedSession || selectedSession.vehicleIds.length <= 1 || !canManageSelectedSession("changeVehicle")) { setNotice("ต้องเหลือรถใน Active อย่างน้อย 1 คัน และต้องมีสิทธิ์เปลี่ยนรถ"); return; } const changedAt = new Date().toISOString(); const nextVehicleIds = selectedSession.vehicleIds.filter(id => id !== vehicleId); patchSession({ vehicleIds: nextVehicleIds, vehicleHistory: reconcileVehicleHistory(selectedSession, vehicles, nextVehicleIds, changedAt) }, recordSessionActivity("นำรถออกจากรายการ", `นำรถ #${vehicles.find(item => item.id === vehicleId)?.number ?? "?"} ออกจาก Session`)); setVehicles(current => current.map(item => item.id === vehicleId ? { ...item, status: "ready" } : item)); updateCentralVehicleStatus([vehicleId], "ready"); setActiveDialog(null); setNotice(`นำรถ #${vehicles.find(item => item.id === vehicleId)?.number ?? ""} ออกจาก Active แล้ว รถกลับเป็นพร้อมใช้`); };
  const sendMessage = () => { if (!selectedSession || !canSendSelectedSessionMessage || !chatText.trim()) return; const text = chatText.trim(); const message = { id: makeId("msg"), sessionId: selectedSession.sessionId, sender: currentOperatorName ?? "ผู้ใช้งานปัจจุบัน", text, createdAt: new Date().toISOString() }; setMessages(current => mergeSessionChatMessages(current, [message])); appendGuideMessageMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, field: "messages", item: JSON.stringify(message), maxItems: 500 }); patchSession({}, recordSessionActivity("ส่งข้อความในห้องสื่อสาร", text)); setChatText(""); };
  const activeTiming = selectedSession ? sessionTiming(selectedSession.startedAt, selectedSession.durationMinutes, now, selectedSession.scheduledEndAt) : { elapsedSeconds: 0, remainingSeconds: 0, overtimeSeconds: 0 };
  const { remainingSeconds, overtimeSeconds } = activeTiming;
  const formattedActiveTime = overtimeSeconds > 0 ? `+${formatSessionCountdown(overtimeSeconds)}` : formatSessionCountdown(remainingSeconds);

  const selectedSafetyNotice = safetyNotices.find(notice => notice.id === selectedSafetyNoticeId);
  const selectedSessionVehicleHistory = selectedSession ? sortVehicleHistory(vehicleHistoryOrFallback(selectedSession, vehicles, selectedSession.createdAt)) : [];
  const safetyNoticeDialog = selectedSafetyNotice ? <SharedVehicleSafetyNoticeDialog notices={safetyNotices.filter(item => item.vehicleNumber === selectedSafetyNotice.vehicleNumber)} onClose={() => setSelectedSafetyNoticeId(undefined)} /> : null;
  const standbyCancelDialog = selectedSession && completionPrompt?.sessionId === selectedSession.sessionId && completionPrompt.kind === "cancel-standby" ? <div className="m3-modal-backdrop" role="presentation"><div className="m3-modal m3-completion-modal" role="dialog" aria-modal="true" aria-labelledby="m3-cancel-standby-title"><div className="m3-modal-head"><div><p>STANDBY / CANCEL</p><h3 id="m3-cancel-standby-title">ยืนยันยกเลิกรายการ</h3></div><button type="button" onClick={() => setCompletionPrompt(null)} aria-label="ปิด"><X size={18} /></button></div><p className="m3-modal-message">รายการนี้ยังอยู่ในขั้นตอน Standby หากยืนยัน รถและสมาชิกในรายการจะถูกคืนกลับเป็นสถานะพร้อมใช้งาน</p><div className="m3-modal-actions"><button type="button" className="m3-secondary" onClick={() => setCompletionPrompt(null)}>กลับไปตรวจสอบ</button><button type="button" className="m3-danger" onClick={cancelStandbySession}>ยืนยันยกเลิก</button></div></div></div> : null;
  const header = <><header className="m3-header"><div className="m3-header-copy"><p>GUIDE OPERATIONS / LIVE</p><h1>ศูนย์ปฏิบัติการไกด์</h1><span>สถานะรถ งาน และการแจ้งเตือนในมือ</span></div><div className="m3-header-actions"><div className="m3-header-mark"><img src="/manus-storage/guide-route-compass-mark_008ff91e.png" alt="สัญลักษณ์เส้นทางและเข็มทิศของ Guide Side" /><ShieldCheck size={22} aria-hidden="true" /></div><ModuleLogoutButton /></div></header>{sessionFollowPopup}{safetyNoticeDialog}{standbyCancelDialog}</>;
  const canReceivePickup = (vehicle: GuideVehicle) => {
    return canReceiveVehiclePickup(Number(vehicle.number), currentOwnerId, responsibilityState.responsibilityGroups);
  };
  const receivePickupVehicle = (vehicle: GuideVehicle, nextScreen = "groups") => {
    if (!canReceivePickup(vehicle)) {
      setNotice("เฉพาะไกด์ผู้รับผิดชอบกลุ่มรถนี้หรือผู้ดูแลระบบเท่านั้นที่รับรถได้");
      return;
    }
    setVehicles(current => current.map(candidate => candidate.id === vehicle.id ? { ...candidate, status: "ready" } : candidate));
    updateCentralVehicleStatus([vehicle.id], "ready");
    setNotice(`ไกด์รับรถ #${vehicle.number} กลับเข้ากลุ่มพร้อมใช้แล้ว`);
    const vehicleId = databaseVehicleId(vehicle.id);
    if (vehicleId) {
      receivePickupMutation.mutate({ vehicleId }, {
        onError: () => setNotice("รับรถเข้ากลุ่มในฐานข้อมูลไม่สำเร็จ"),
      });
    }
    setScreen(nextScreen);
  };
  const receivePickupRequest = (request: VehiclePickupRequest) => {
    const vehicle = vehicles.find(candidate => Number(candidate.number) === request.vehicleNumber);
    if (!vehicle || !canReceivePickup(vehicle)) {
      setNotice("เฉพาะเจ้าของรถในกลุ่มที่รับผิดชอบเบอร์นี้เท่านั้นที่รับรถได้");
      return;
    }
    const receivedAt = new Date().toISOString();
    const receiveResult = receiveVehiclePickupForGuide(pickupRequests, request.id, currentOwnerId, activeUser?.name ?? "ไกด์ผู้รับรถ", receivedAt, responsibilityState.responsibilityGroups);
    if (!receiveResult.updated) {
      setNotice(receiveResult.reason === "already_received" ? "รายการนี้ถูกรับรถโดยไกด์อีกคนในกลุ่มแล้ว" : "ไม่สามารถรับรายการแจ้งรับรถนี้ได้");
      return;
    }
    const nextRequests = receiveResult.requests;
    setPickupRequests(nextRequests);
    saveSupervisorFleetSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.fleet, payload: serializeOperationsSnapshot({ pickupRequests: nextRequests }) });
    receivePickupVehicle(vehicle, "pickupBoard");
  };
  const visiblePickupRequests = pickupRequestsForResponsibleOwner(pickupRequests, currentOwnerId, responsibilityState.responsibilityGroups);
  const visibleMaintenanceNotifications = notificationsForGuide(maintenanceNotifications, currentOwnerId, currentIdentity?.special === true);
  const pendingMaintenanceNotificationCount = visibleMaintenanceNotifications.filter(notification => notification.status === "รอตรวจสอบ").length;
  const acknowledgeMaintenanceNotification = (notificationId: string) => {
    const nextNotifications = acknowledgeVehicleMaintenanceNotification(maintenanceNotifications, notificationId, activeUser?.name ?? currentOperatorName ?? "ไกด์ผู้รับผิดชอบ", new Date().toISOString());
    setMaintenanceNotifications(nextNotifications);
    saveGuideSessionsMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, payload: serializeOperationsSnapshot({ maintenanceNotifications: nextNotifications }) });
    setNotice("รับทราบแจ้งเตือนตรวจสภาพรถแล้ว โดยยังแยกจากรายการแจ้งรับรถ");
  };
  const pendingPickupCount = visiblePickupRequests.filter(request => request.status === "รอรับรถ").length;
  const mainTabs = <nav className="m3-main-tabs" aria-label="เมนูหลัก"><button className={screen === "queuePayout" ? "selected" : ""} onClick={() => { setQueuePayoutView("daily"); setScreen("queuePayout"); }}><CalendarDays size={15} /><span>คิวและตารางค่ารอบ</span></button><button className={screen === "communications" ? "selected" : ""} onClick={() => setScreen("communications")}><MessageSquare size={15} /><span>ห้องสื่อสาร</span></button><button className={screen === "notifications" ? "selected" : ""} onClick={() => { setNotificationView("pickup"); setPickupBoardView("pickup"); setScreen("notifications"); }}><AlertTriangle size={15} /><span>หน้าแจ้งเตือน</span>{pendingPickupCount + pendingMaintenanceNotificationCount > 0 && <b className="m3-tab-badge">{pendingPickupCount + pendingMaintenanceNotificationCount}</b>}</button><button className={screen === "settings" ? "selected" : ""} onClick={() => setScreen("settings")}><Settings2 size={15} /><span>ตั้งค่า</span></button><button type="button" onClick={() => { window.location.href = "?module=mechanic&tab=tips"; }}><AlertTriangle size={15} /><span>เตือนระวังช่าง</span></button></nav>;
  const queuePayoutTabs = <nav className="m3-daily-tabs m3-alert-tabs" aria-label="เมนูคิว ตารางค่ารอบ และทอยเต๋า"><button type="button" className={queuePayoutView === "daily" ? "selected" : ""} onClick={() => setQueuePayoutView("daily")}><CalendarDays size={15} /><span>บอร์ดบันทึกรายวัน</span></button><button type="button" className={queuePayoutView === "payout" ? "selected" : ""} onClick={() => { const currentDate = new Date(); const monthOffset = (currentDate.getFullYear() - new Date().getFullYear()) * 12 + currentDate.getMonth() - new Date().getMonth(); setPayoutPageOffset(monthOffset * 2 + (currentDate.getDate() >= 16 ? 1 : 0)); setQueuePayoutView("payout"); }}><Coins size={15} /><span>ตารางค่ารอบ</span></button><button type="button" className={queuePayoutView === "dice" ? "selected" : ""} onClick={() => { setQueuePayoutView("dice"); openFutureDiceApp(); }}><Dices size={15} /><span>ทอยเต๋า</span></button></nav>;
  const alertBoardTabs = <nav className="m3-daily-tabs m3-alert-tabs" aria-label="เมนูรายการแจ้งเตือน"><button className={screen === "alertBoard" ? "selected" : ""} onClick={() => setScreen("alertBoard")}><AlertTriangle size={15} /><span>รายการแจ้งเตือน</span></button></nav>;
  const notificationTabs = <nav className="m3-daily-tabs m3-alert-tabs" aria-label="เมนูหน้าแจ้งเตือน"><button type="button" className={notificationView === "repair" ? "selected" : ""} onClick={() => setNotificationView("repair")}><Settings2 size={15} /><span>แจ้งซ่อม</span></button><button type="button" className={notificationView === "pickup" ? "selected" : ""} onClick={() => { setNotificationView("pickup"); setPickupBoardView("pickup"); }}><Check size={15} /><span>แจ้งรับรถ</span>{pendingPickupCount > 0 && <b className="m3-tab-badge">{pendingPickupCount}</b>}</button><button type="button" className={notificationView === "maintenance" ? "selected" : ""} onClick={() => { setNotificationView("maintenance"); setPickupBoardView("maintenance"); }}><AlertTriangle size={15} /><span>แจ้งตรวจสภาพรถ</span>{pendingMaintenanceNotificationCount > 0 && <b className="m3-tab-badge">{pendingMaintenanceNotificationCount}</b>}</button></nav>;
  if (screen === "groups") return <VehicleResponsibilityGroupView
    vehicles={vehicles}
    responsibilityState={responsibilityState}
    directoryUsers={directoryUsers}
    safetyNotices={safetyNotices}
    chrome={header}
    notice={notice}
    onBack={() => { setQueuePayoutView("daily"); setScreen("queuePayout"); }}
    onSafetyNoticeOpen={notices => { const first = notices[0]; if (first) setSelectedSafetyNoticeId(first.id); }}
    statusModel={guideStatusModel}
    canReceivePickup={vehicle => { const guideVehicle = vehicles.find(candidate => Number(candidate.number) === Number(vehicle.number)); return guideVehicle ? canReceivePickup(guideVehicle) : false; }}
    onReceivePickup={vehicle => { const guideVehicle = vehicles.find(candidate => Number(candidate.number) === Number(vehicle.number)); if (guideVehicle) receivePickupVehicle(guideVehicle); }}
  />;
  const completedSessions = sessions.filter(session => session.status === "Completed");
  const personalSessionOwnerId = currentMemberId || activeUserId;
  const dailyActiveTimeline = buildDailyActiveTimeline(sessions);
  const dailyActiveBySlot = groupDailyActiveTimelineBySlot(sessions);
  const dailyDateLabel = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "numeric", year: "2-digit" }).format(new Date());
  const dailySummaryTitle = dailySummaryFilter === "all" ? "รายการ Active วันนี้" : dailySummaryFilter === "Active" ? "รายการกำลังทำงาน" : "รายการที่จบแล้ว";
  const dailySummarySessions = dailyActiveTimeline.filter(session => dailySummaryFilter === "all" || session.status === dailySummaryFilter);
  const currentClockLabel = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(now));
  const currentWeekdayLabel = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", weekday: "long" }).format(new Date(now));
  // รายการตัวเลือกแจ้งซ่อมอ่านสถานะรถจาก Supervisor fleet snapshot ผ่าน `vehicles` เท่านั้น
  // ซ่อนเฉพาะรถที่ Supervisor ระบุเป็น “ซ่อม” หรือ “แจ้งรับรถ”
  const repairableVehicles = vehicles.filter(vehicle => vehicle.status !== "repair" && vehicle.status !== "pickup" && !busyVehicleIds.has(vehicle.id));
  const submitRepairReport = () => { if (!repairVehicleId || !repairDescription.trim()) return; const vehicle = vehicles.find(item => item.id === repairVehicleId); if (!vehicle || vehicle.status === "repair" || vehicle.status === "pickup" || busyVehicleIds.has(vehicle.id)) { setRepairVehicleId(""); setNotice("รถคันนี้มีสถานะหรือคิวที่ไม่สามารถแจ้งซ่อมซ้ำได้"); return; } const issue = repairDescription.trim(); const nowIso = new Date().toISOString(); const nextReport = { id: makeId("repair"), vehicleId: vehicle.id, description: issue, reporter: currentOperatorName ?? "ผู้ใช้งานปัจจุบัน", createdAt: nowIso, status: "แจ้งซ่อม" as const }; const nextReports = [nextReport, ...repairReports]; setRepairReports(nextReports); setRepairQueue(current => [{ id: makeId("RQ"), vehicleId: vehicle.id, issue, reporter: currentOperatorName ?? "ผู้ใช้งานปัจจุบัน", mechanic: "รอมอบหมาย", priority: "ปกติ", status: "คิวใหม่", createdAt: nowIso, updatedAt: nowIso }, ...current]);     setVehicles(current => current.map(item => item.id === repairVehicleId ? { ...item, status: "repair" } : item)); updateCentralVehicleStatus([vehicle.id], "repair"); const vehicleId = databaseVehicleId(vehicle.id); if (vehicleId) reportRepairMutation.mutate({ vehicleId, description: issue }, { onError: () => setNotice("บันทึกแจ้งซ่อมในฐานข้อมูลไม่สำเร็จ") }); setRepairDescription(""); setRepairVehicleId(""); setNotice(`บันทึกแจ้งซ่อมรถ #${vehicle.number} แล้ว`); };
  const alertableVehicles = vehicles.filter(vehicle => vehicle.status !== "active" && !busyVehicleIds.has(vehicle.id));
  const submitAlertReport = () => { if (!alertVehicleId || !alertDescription.trim()) return; const vehicle = vehicles.find(item => item.id === alertVehicleId); if (!vehicle) return; setAlertReports(current => [{ id: makeId("alert"), vehicleId: vehicle.id, description: alertDescription.trim(), reporter: currentOperatorName ?? "ผู้ใช้งานปัจจุบัน", createdAt: new Date().toISOString(), status: "ใหม่" }, ...current]); setAlertDescription(""); setAlertVehicleId(""); setNotice(`บันทึกคำแนะนำรถ #${vehicle.number} แล้ว โดยไม่เปลี่ยนสถานะรถ`); };
  if (screen === "settings") return <main className="m3-shell">{header}{mainTabs}<section className="m3-panel"><div className="m3-panel-title"><div><p>SETTINGS / GUIDE SIDE</p><h2>ตั้งค่า</h2><span>พื้นที่ตั้งค่าการใช้งานของ Guide Side — ATV Operations</span></div><Settings2 size={22} /></div><SpeechSettingsPanel moduleName="Guide" /><div className="m3-settings-empty">การเข้าถึงโมดูลอื่นจัดการผ่านหน้ารหัสเข้าสู่ระบบกลาง</div></section></main>;
  if (screen === "dailySummary") return <main className="m3-shell">{sessionFollowPopup}<button className="m3-back" onClick={() => { setQueuePayoutView("daily"); setScreen("queuePayout"); }}><ArrowLeft size={16} /> กลับบอร์ดบันทึกรายวัน</button><section className="m3-panel"><div className="m3-panel-title"><div><p>DAILY BOARD / SUMMARY</p><h2>{dailySummaryTitle}</h2><span>วันที่ {dailyDateLabel}</span></div><span>{dailySummarySessions.length} รายการ</span></div><div className="m3-daily-filter-list">{dailySummarySessions.length ? dailySummarySessions.map(session => <button type="button" className="m3-session-row" key={session.sessionId} onClick={() => openSession(session)}><b>{session.memberIds.map(id => members.find(member => member.id === id)?.name).filter(Boolean).join(" · ") || session.activeUserName || "ไม่ระบุผู้ปฏิบัติงาน"}</b><span>โปรแกรม {session.durationMinutes} นาที · R {session.riderCount} · P {session.passengerCount}</span><small>{session.status === "Active" ? "กำลังทำงาน" : "จบแล้ว"}</small></button>) : <p className="m3-empty">ไม่มีรายการในกลุ่มนี้</p>}</div></section></main>;
  if (screen === "queuePayout" && queuePayoutView === "dice") return <main className="m3-shell">{header}{mainTabs}{queuePayoutTabs}<section className="m3-panel m3-dice-tab-panel"><div className="m3-panel-title"><div><p>DICE GAME / SHARED LIVE</p><h2>ทอยเต๋า</h2><span>เกมเต็มหน้าจอ · ผู้เล่นที่ถูกเลือกเข้าร่วมอัตโนมัติ</span></div><Dices size={22} /></div><p>เกมเปิดเต็มหน้าจอ และผู้เล่นที่ถูกเลือกจะเข้ามาอัตโนมัติ</p><button type="button" className="m3-primary" onClick={openFutureDiceApp}>เปิดเกมทอยเต๋าเต็มหน้าจอ</button></section></main>;
  if (screen === "queuePayout" && queuePayoutView === "daily") {
    const atvStandbyRoster = Array.from(new Set(standbySessions.flatMap(session => session.memberIds.map(memberId => members.find(member => member.id === memberId)?.name).filter((name): name is string => Boolean(name)))));
    const atvQueueRoster = Array.from(new Set([...atvStandbyRoster, ...activeSessions.flatMap(session => session.memberIds.map(memberId => members.find(member => member.id === memberId)?.name).filter((name): name is string => Boolean(name)))]));
    const atvActiveGroups = activeSessions.map(session => ({
      sessionId: session.sessionId,
      memberNames: session.memberIds.map(memberId => members.find(member => member.id === memberId)?.name).filter((name): name is string => Boolean(name)),
      activeUserName: session.activeUserName,
      startedAt: session.startedAt,
      durationMinutes: session.durationMinutes,
    }));
    const dailyBoardSessions = dailyActiveTimeline.map(session => ({
      sessionId: session.sessionId,
      status: session.status,
      durationMinutes: session.durationMinutes,
      vehicleNumbers: session.vehicleIds.map(id => vehicles.find(vehicle => vehicle.id === id)?.number).filter((number): number is string => Boolean(number)),
      memberNames: session.memberIds.map(memberId => members.find(member => member.id === memberId)?.name).filter((name): name is string => Boolean(name)),
      activeUserName: session.activeUserName,
      riderCount: session.riderCount,
      passengerCount: session.passengerCount,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    }));
    return <main className="m3-shell m3-queue-host">{header}{mainTabs}{queuePayoutTabs}<section className="m3-queue-body"><TeamBoardQueueModule operatorName={currentOperatorName ?? activeUser?.name ?? "ผู้ใช้งานปัจจุบัน"} rosterNames={atvQueueRoster} standbyNames={atvStandbyRoster} memberOptions={directoryUsers.filter(user => /ไกด์|ช่าง|guide|mechanic/i.test(user.group ?? "")).map(user => ({ name: user.name, group: user.group }))} activeGroups={atvActiveGroups} dailySessions={dailyBoardSessions} onDailySessionOpen={sessionId => { const session = sessions.find(item => item.sessionId === sessionId); if (session) openSession(session); }} onCreateSession={startNewSession} demoMode={fullAppDemo} /></section></main>;
  }
  if (screen === "queuePayout" && queuePayoutView === "payout") {
    const payoutRoundColumns = PAYOUT_ROUND_COLUMNS;
    const anchorMonth = new Date();
    const currentPageKey = payoutPageOffset;
    const pageMonth = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() + Math.floor(currentPageKey / 2), 1);
    const pageHalf = ((currentPageKey % 2) + 2) % 2 === 0 ? 1 : 2;
    const daysInPageMonth = new Date(pageMonth.getFullYear(), pageMonth.getMonth() + 1, 0).getDate();
    const pageEnd = pageHalf === 1 ? 15 : daysInPageMonth;
    const payoutRows = personalSessionOwnerId
      ? buildPersonalPayoutRows({ year: pageMonth.getFullYear(), month: pageMonth.getMonth(), half: pageHalf, userId: personalSessionOwnerId, sessions, values: payoutDraftValues })
      : [];
    const payoutTotals = payoutRoundColumns.map((_, index) => payoutRows.reduce((sum, row) => sum + row.rounds[index], 0));
    const totalDriveHours = payoutRows.reduce((sum, row) => sum + row.driveHours, 0);
    const totalRounds = payoutRows.reduce((sum, row) => sum + row.totalRounds, 0);
    const totalPayout = totalDriveHours * 100;
    const updatePayoutRound = (key: string, minutes: 30 | 60, value: string) => {
      const numericValue = Math.max(0, Math.floor(Number(value) || 0));
      if (!personalSessionOwnerId) return;
      setPayoutDraftValues(current => updatePersonalPayoutValue(current, personalSessionOwnerId, key, minutes, numericValue, sessions));
    };
    const canEditPayout = isHead;
    const savePayoutChanges = async (event: React.FormEvent) => {
      event.preventDefault();
      const password = payoutSavePassword.trim();
      if (!password) {
        setPayoutSaveError("กรุณากรอกรหัสผ่านของหัวหน้า");
        return;
      }
      try {
        const authenticated = await payoutVerifyMutation.mutateAsync({ code: password });
        if (!authenticated || !isHead) {
          setPayoutSaveError("รหัสผ่านหัวหน้าไม่ถูกต้อง");
          return;
        }
        await saveGuideStateMutation.mutateAsync({ key: OPERATIONS_SNAPSHOT_KEYS.guideState, payload: serializeOperationsSnapshot({ payoutRoundValues: payoutDraftValues }) });
        setPayoutRoundValues(payoutDraftValues);
        setPayoutSavePassword("");
        setPayoutSaveError("");
        setPayoutSaveOpen(false);
        setNotice("บันทึกตารางค่ารอบแล้ว");
      } catch {
        setPayoutSaveError("ยืนยันหรือบันทึกค่ารอบบน Server ไม่สำเร็จ กรุณาลองใหม่");
      }
    };
    const movePayoutPage = (direction: -1 | 1) => setPayoutPageOffset(index => index + direction);
    const goToCurrentPayoutPage = () => {
      const currentDate = new Date();
      const monthOffset = (currentDate.getFullYear() - anchorMonth.getFullYear()) * 12 + currentDate.getMonth() - anchorMonth.getMonth();
      setPayoutPageOffset(monthOffset * 2 + payoutPageOffsetForDate(currentDate));
    };
    const pageLabel = pageHalf === 1 ? `วันที่ 1–15` : `วันที่ 16–${daysInPageMonth}`;
    const today = new Date();
    const isToday = (date: Date) => date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    return <main className="m3-shell m3-payout-shell">{header}{mainTabs}{queuePayoutTabs}<section className="m3-panel"><div className="m3-panel-title"><div><p>PAYOUT TABLE / HALF MONTH</p><h2>ตารางค่ารอบ</h2><span>{pageLabel} · {new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(pageMonth)}</span></div><Coins size={22} /></div><div className="m3-payout-week-nav round-table-floating-nav"><button className="m3-payout-recenter" onClick={goToCurrentPayoutPage} aria-label="กลับไปวันที่ปัจจุบัน" title="กลับไปวันที่ปัจจุบัน"><RotateCcw size={15} /> Re</button><button onClick={() => movePayoutPage(-1)} aria-label="หน้าก่อนหน้า">‹</button><strong>หน้า {pageLabel} · {new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(pageMonth)}</strong><button onClick={() => movePayoutPage(1)} aria-label="หน้าถัดไป">›</button></div><div className="m3-payout-sheet-wrap"><table className="m3-payout-sheet"><thead><tr><th>วัน / วันที่</th>{payoutRoundColumns.map(minutes => <th key={minutes}>{minutes} นาที</th>)}<th className="hours-head">ชั่วโมงขับ</th><th className="total-head">รวม</th></tr></thead><tbody>{payoutRows.map(row => <tr key={row.key}><th className={`payout-weekday ${isToday(row.date) ? "today" : ""}`}><small>{new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(row.date)}</small><strong>{row.date.getDate()}/{row.date.getMonth() + 1}</strong>{isToday(row.date) && <em>วันนี้</em>}</th>{row.rounds.map((count, index) => { const minutes = payoutRoundColumns[index]; const key = row.key; return <td key={`${row.key}-${index}`} className="payout-number-cell"><input aria-label={`${minutes} นาที วันที่ ${row.date.getDate()}/${row.date.getMonth() + 1}`} type="number" min="0" step="1" value={count || ""} disabled={!canEditPayout} onChange={event => updatePayoutRound(key, minutes, event.target.value)} placeholder="0" /></td>; })}<td className="hours-cell">{row.driveHours ? row.driveHours.toFixed(1) : "0"}</td><td className={`row-total-cell ${row.totalRounds > 0 ? "has-value" : "empty"}`}><strong>{row.totalRounds}</strong><small>฿{row.payout.toLocaleString("th-TH")}</small></td></tr>)}</tbody><tfoot><tr><th>รวม</th>{payoutTotals.map((total, index) => <td key={`total-${index}`}>{total}</td>)}<td className="hours-total">{totalDriveHours.toFixed(1)}</td><td className="row-total-total">{totalRounds}</td></tr></tfoot></table></div><p className="m3-payout-swipe-hint">{canEditPayout ? "แตะช่อง 30/60 เพื่อกรอกหรือแก้ไขจำนวนรอบ" : "คุณไม่มีสิทธิ์แก้ไขตารางนี้"}</p>{canEditPayout && <button type="button" className="m3-primary" onClick={() => { setPayoutSaveError(""); setPayoutSaveOpen(true); }}>ยืนยันและบันทึกตารางค่ารอบ</button>}<div className="m3-payout-summary"><div><span>รวมชั่วโมงขับ</span><strong>{totalDriveHours.toFixed(1)}</strong></div><div><span>จำนวนรอบ</span><strong>{totalRounds}</strong></div><div><span>เป็นเงินจำนวน</span><strong>฿{totalPayout.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</strong></div></div><div className="m3-payout-period"><strong>{activeUser?.name ?? "ผู้ใช้งานปัจจุบัน"}</strong><span>{new Intl.DateTimeFormat("th-TH", { month: "long" }).format(pageMonth)} · {pageLabel}</span></div>{payoutSaveOpen && <div className="m3-modal-backdrop" role="presentation"><form className="m3-modal" role="dialog" aria-modal="true" aria-labelledby="payout-save-title" onSubmit={savePayoutChanges}><div className="m3-modal-head"><div><p>SUPERVISOR CONFIRMATION</p><h3 id="payout-save-title">ยืนยันการบันทึกตารางค่ารอบ</h3></div><button type="button" onClick={() => { setPayoutSaveOpen(false); setPayoutSavePassword(""); setPayoutSaveError(""); }} aria-label="ปิด"> <X size={18} /></button></div><p className="m3-modal-message">กรอกรหัสผ่านของหัวหน้าเพื่อยืนยันการแก้ไขข้อมูล</p><label>รหัสผ่านหัวหน้า<input autoFocus type="password" value={payoutSavePassword} onChange={event => { setPayoutSavePassword(event.target.value); setPayoutSaveError(""); }} /></label>{payoutSaveError && <p className="m3-notice">{payoutSaveError}</p>}<div className="m3-modal-actions"><button type="button" className="m3-secondary" onClick={() => { setPayoutSaveOpen(false); setPayoutSavePassword(""); setPayoutSaveError(""); }}>ยกเลิก</button><button type="submit" className="m3-primary" disabled={payoutVerifyMutation.isPending}>ยืนยันการบันทึก</button></div></form></div>}</section></main>;
  }
  if (screen === "communications") return <main className="m3-shell communication-page">{header}{mainTabs}<section className="m3-panel"><div className="m3-panel-title"><div><p>COMMUNICATIONS / ROOM</p><h2>ห้องสื่อสาร</h2><span>PTT และข้อความร่วมกับไกด์ ช่าง และหัวหน้า</span></div><MessageCircle size={22} /></div><PttRoomPanel /><CommunicationChat module="guide" /><div className="m3-communications-list"><div className="m3-panel-title"><div><p>SESSION MESSAGES</p><h3>ข้อความจากงานที่กำลังทำ</h3></div></div>{messages.length ? messages.map(message => <article key={message.id}><div><b>{message.sender}</b><small>{formatTime(message.createdAt)} · {message.sessionId}</small></div><p>{message.text}</p></article>) : <p className="m3-empty">ยังไม่มีข้อความจาก Session</p>}</div></section></main>;
  if (screen === "notifications" && (notificationView === "pickup" || notificationView === "maintenance")) return <main className="m3-shell m3-pickup-shell">{header}{mainTabs}{notificationTabs}<section className="m3-panel"><div className="m3-panel-title"><div><p>VEHICLE NOTIFICATION CENTER</p><h2>{notificationView === "maintenance" ? "แจ้งตรวจสภาพรถ" : "แจ้งรับรถ"}</h2><span>{notificationView === "maintenance" ? "รายการแจ้งตรวจสภาพรถ แยกจากการแจ้งรับรถ" : "รายการรถที่แจ้งให้ไกด์เข้ารับรถ"}</span></div><Check size={22} /></div>{pickupBoardView === "pickup" ? <><div className="m3-pickup-summary"><div><b>{pendingPickupCount}</b><span>รอรับรถ</span></div><div><b>{visiblePickupRequests.filter(request => request.status === "รับรถแล้ว").length}</b><span>รับรถแล้ว</span></div></div><div className="m3-pickup-list">{visiblePickupRequests.length ? visiblePickupRequests.map(request => { const vehicle = vehicles.find(candidate => Number(candidate.number) === request.vehicleNumber); const isPending = request.status === "รอรับรถ"; return <article className={`m3-pickup-card ${isPending ? "is-pending" : "is-received"}`} key={request.id}><div className="m3-pickup-card-head"><div><p>รถ #{request.vehicleNumber} · {request.cc} Cc.</p><h3>{isPending ? "รอไกด์มารับรถ" : "รับรถแล้ว"}</h3><span>{formatTime(request.createdAt)} · ช่าง {request.mechanic} · {vehicle ? vehicleResponsibilityMeta(request.vehicleNumber).managerLabel : "ยังไม่ระบุผู้ดูแล"}</span></div><strong>{request.status}</strong></div><p className="m3-pickup-message">{request.message}</p><div className="m3-pickup-recipients"><span>ส่งถึงผู้รับผิดชอบ</span><b>{request.recipients.length ? request.recipients.map(recipient => recipient.name).join(" · ") : "ยังไม่พบผู้รับผิดชอบในกลุ่มรถ"}</b></div>{isPending && vehicle && <button type="button" className="m3-pickup-confirm" disabled={!canReceivePickup(vehicle)} title={!canReceivePickup(vehicle) ? "เฉพาะเจ้าของรถในกลุ่มเท่านั้นที่รับรถได้" : undefined} onClick={() => receivePickupRequest(request)}>ยืนยันรับรถ #{request.vehicleNumber}</button>}{!isPending && <small className="m3-pickup-received-by">รับรถโดย {request.receivedBy ?? "ไกด์"} · {request.receivedAt ? formatTime(request.receivedAt) : "—"}</small>}</article>; }) : <p className="m3-empty">ยังไม่มีรถแจ้งรับในกลุ่มของคุณ</p>}</div></> : <><div className="m3-pickup-summary"><div><b>{pendingMaintenanceNotificationCount}</b><span>รอตรวจสอบ</span></div><div><b>{visibleMaintenanceNotifications.filter(notification => notification.status === "รับทราบแล้ว").length}</b><span>รับทราบแล้ว</span></div></div><div className="m3-pickup-list">{visibleMaintenanceNotifications.length ? visibleMaintenanceNotifications.map(notification => <article className={`m3-pickup-card m3-maintenance-alert-card ${notification.status === "รอตรวจสอบ" ? "is-pending" : "is-received"}`} key={notification.id}><div className="m3-pickup-card-head"><div><p>รถ #{notification.vehicleNumber} · {notification.cc} Cc. · {notification.ruleName}</p><h3>{notification.status === "รอตรวจสอบ" ? "รอไกด์เข้าตรวจสภาพรถ" : "รับทราบแล้ว"}</h3><span>{formatTime(notification.createdAt)} · ช่าง {notification.mechanic}</span></div><strong>{notification.status}</strong></div><p className="m3-pickup-message">{notification.message}</p><div className="m3-pickup-recipients"><span>ส่งถึงไกด์ผู้รับผิดชอบ</span><b>{notification.recipients.length ? notification.recipients.map(recipient => recipient.name).join(" · ") : "ยังไม่พบผู้รับผิดชอบในกลุ่มรถ"}</b></div>{notification.status === "รอตรวจสอบ" ? <button type="button" className="m3-pickup-confirm" onClick={() => acknowledgeMaintenanceNotification(notification.id)}>รับทราบแจ้งเตือน</button> : <small className="m3-pickup-received-by">รับทราบโดย {notification.acknowledgedBy ?? "ไกด์ผู้รับผิดชอบ"} · {notification.acknowledgedAt ? formatTime(notification.acknowledgedAt) : "—"}</small>}</article>) : <p className="m3-empty">ยังไม่มีแจ้งเตือนตรวจสภาพรถในกลุ่มของคุณ</p>}</div></>}{notice && <p className="m3-notice">{notice}</p>}</section></main>;
  if (screen === "notifications" && notificationView === "repair") return <main className="m3-shell m3-repair-shell">{header}{mainTabs}{notificationTabs}{alertBoardTabs}<section className="m3-panel"><div className="m3-panel-title"><div><p>REPAIR REPORT / ATV</p><h2>แจ้งซ่อม</h2><span>แจ้งปัญหารถและติดตามรายการซ่อม</span></div><Settings2 size={22} /></div><div className="m3-repair-form"><div className="vehicle-choice-field"><span className="vehicle-choice-section-label">เลือกรถที่ต้องการแจ้งซ่อม</span><VehicleChoiceList compact items={repairableVehicles.map(vehicle => ({ id: vehicle.id, number: Number(vehicle.number), cc: vehicle.cc, statusLabel: vehicle.status === "ready" ? "พร้อมใช้" : vehicle.status === "inspection" ? "แจ้งเตือน" : vehicle.status === "pickup" ? "แจ้งรับรถ" : "ซ่อม", accentColor: getResponsibilityGroupColor(Number(vehicle.number), responsibilityState.responsibilityGroups), safetyNotices }))} selectedId={repairVehicleId} responsibilityGroups={responsibilityState.responsibilityGroups} managerDirectory={directoryUsers} onSafetyNoticeOpen={notices => setSelectedSafetyNoticeId(notices[0]?.id)} onSelect={setRepairVehicleId} ariaLabel="เลือกรถที่ต้องการแจ้งซ่อม" actionLabel="เลือก" emptyLabel="ไม่มีรถที่แจ้งซ่อมได้" /></div><label>รายละเอียดปัญหา<textarea value={repairDescription} onChange={event => setRepairDescription(event.target.value)} placeholder="ระบุอาการหรือปัญหาของรถ" rows={4} /></label><button className="m3-primary" disabled={!repairVehicleId || !repairDescription.trim()} onClick={submitRepairReport}><Settings2 size={15} /> ส่งแจ้งซ่อม</button></div><div className="m3-repair-list"><div className="m3-panel-title"><div><p>REPAIR QUEUE</p><h3>รายการแจ้งซ่อม</h3></div><span>{visibleRepairReports.length} รายการ</span></div>{visibleRepairReports.length ? visibleRepairReports.map(report => { const vehicle = vehicles.find(item => item.id === report.vehicleId); return <article key={report.id}><div><b style={{ color: getResponsibilityGroupColor(Number(vehicle?.number ?? 0), responsibilityState.responsibilityGroups), borderColor: getResponsibilityGroupColor(Number(vehicle?.number ?? 0), responsibilityState.responsibilityGroups) }} className="m3-colored-vehicle-number">#{vehicle?.number ?? "ไม่พบรถ"}</b><small>{vehicle?.cc} ซีซี · {vehicle ? vehicleResponsibilityMeta(Number(vehicle.number)).groupLabel : "ยังไม่มีกลุ่ม"} · {vehicle ? vehicleResponsibilityMeta(Number(vehicle.number)).managerLabel : "ยังไม่ระบุผู้ดูแล"} · {report.status} · {formatTime(report.createdAt)}</small></div><p>{report.description}</p><small>ผู้แจ้ง: {report.reporter}</small></article>; }) : <p className="m3-empty">ยังไม่มีรายการแจ้งซ่อม</p>}</div></section></main>;
  if (screen === "alerts") return <main className="m3-shell">{header}{mainTabs}{notificationTabs}{alertBoardTabs}<section className="m3-panel"><div className="m3-panel-title"><div><p>REPAIR REPORT / ATV</p><h2>แจ้งซ่อม</h2><span>แจ้งปัญหารถและติดตามงานซ่อม</span></div><AlertTriangle size={22} /></div><div className="m3-repair-form m3-alert-form"><div className="vehicle-choice-field"><span className="vehicle-choice-section-label">เลือกรถที่ต้องการแจ้งเตือน</span><VehicleChoiceList compact items={alertableVehicles.map(vehicle => ({ id: vehicle.id, number: Number(vehicle.number), cc: vehicle.cc, statusLabel: "พร้อมเลือก", accentColor: getResponsibilityGroupColor(Number(vehicle.number), responsibilityState.responsibilityGroups), safetyNotices }))} selectedId={alertVehicleId} responsibilityGroups={responsibilityState.responsibilityGroups} managerDirectory={directoryUsers} onSafetyNoticeOpen={notices => setSelectedSafetyNoticeId(notices[0]?.id)} onSelect={setAlertVehicleId} ariaLabel="เลือกรถที่ต้องการแจ้งเตือน" actionLabel="เลือก" emptyLabel="ไม่มีรถที่แจ้งเตือนได้" /></div><label>รายละเอียดปัญหาการซ่อม<textarea value={alertDescription} onChange={event => setAlertDescription(event.target.value)} placeholder="ระบุอาการหรือปัญหาของรถ" rows={4} /></label><button className="m3-primary" disabled={!alertVehicleId || !alertDescription.trim()} onClick={submitAlertReport}><AlertTriangle size={15} /> ส่งแจ้งซ่อม</button></div><div className="m3-repair-list m3-alert-list"><div className="m3-panel-title"><div><p>REPAIR QUEUE</p><h3>รายการแจ้งซ่อม</h3></div><span>{alertReports.length} รายการ</span></div>{alertReports.length ? alertReports.map(report => { const vehicle = vehicles.find(item => item.id === report.vehicleId); return <article key={report.id}><div><b style={{ color: getResponsibilityGroupColor(Number(vehicle?.number ?? 0), responsibilityState.responsibilityGroups), borderColor: getResponsibilityGroupColor(Number(vehicle?.number ?? 0), responsibilityState.responsibilityGroups) }} className="m3-colored-vehicle-number">#{vehicle?.number ?? "ไม่พบรถ"}</b><small>{vehicle?.cc} ซีซี · {vehicle ? vehicleResponsibilityMeta(Number(vehicle.number)).groupLabel : "ยังไม่มีกลุ่ม"} · {vehicle ? vehicleResponsibilityMeta(Number(vehicle.number)).managerLabel : "ยังไม่ระบุผู้ดูแล"} · {report.status} · {formatTime(report.createdAt)}</small></div><p>{report.description}</p><small>ผู้แจ้ง: {report.reporter}</small></article>; }) : <p className="m3-empty">ยังไม่มีรายการแจ้งซ่อม</p>}</div></section></main>;
  if (screen === "alertBoard") { const alertBoardVehicles = currentIdentity?.special ? vehicles : vehicles.filter(vehicle => managedVehicleNumbers.has(Number(vehicle.number))); const alertBoardVehicleIds = new Set(alertBoardVehicles.map(vehicle => vehicle.id)); const alertBoardReports = alertReports.filter(report => alertBoardVehicleIds.has(report.vehicleId)); return <main className="m3-shell m3-alert-shell">{header}{mainTabs}{notificationTabs}{alertBoardTabs}<section className="m3-panel"><div className="m3-panel-title"><div><p>ALERT BOARD / OPERATIONS</p><h2>รายการแจ้งเตือน</h2><span>รวมเหตุการณ์แจ้งเตือนตามสถานะเพื่อให้ติดตามต่อได้ทันที</span></div><AlertTriangle size={22} /></div><div className="m3-alert-board-columns">{(["รับทราบ"] as const).map(status => <div className="m3-alert-board-column" key={status}><div className="m3-alert-board-heading"><b>{status}</b><span>{alertBoardReports.filter(report => report.status === status).length}</span></div>{status === "รับทราบ" && <div className="m3-alert-ack-structure" aria-label="โครงสร้างข้อมูลรถในรายการรับทราบ"><div className="m3-alert-ack-scroll"><table><tbody>{(["เบอร์รถ", "CC", "สถานะ", "-", "เตือน", "-"] as const).map((label, rowIndex) => <tr key={`${label}-${rowIndex}`}>{Array.from({ length: 6 }, (_, index) => { const vehicle = alertBoardVehicles[index]; const value = rowIndex === 0 ? vehicle ? `#${vehicle.number}` : "เบอร์รถ" : rowIndex === 1 ? vehicle ? `${vehicle.cc} CC` : "CC" : rowIndex === 2 ? vehicle ? (vehicle.status === "inspection" ? "เตือน" : vehicle.status === "repair" ? "ซ่อม" : vehicle.status === "pickup" ? "แจ้งรับรถ" : vehicle.status === "active" ? "ใช้งาน" : "พร้อม") : "สถานะ" : label; return <td key={`${rowIndex}-${index}`}>{value}</td>; })}</tr>)}</tbody></table></div></div>}{alertBoardReports.filter(report => report.status === status).map(report => { const vehicle = vehicles.find(item => item.id === report.vehicleId); return <article key={report.id}><strong style={{ color: getResponsibilityGroupColor(Number(vehicle?.number ?? 0), responsibilityState.responsibilityGroups) }} className="m3-colored-vehicle-number">#{vehicle?.number ?? "ไม่พบรถ"}</strong><small>{vehicle?.cc} ซีซี · {vehicle ? vehicleResponsibilityMeta(Number(vehicle.number)).groupLabel : "ยังไม่มีกลุ่ม"} · {vehicle ? vehicleResponsibilityMeta(Number(vehicle.number)).managerLabel : "ยังไม่ระบุผู้ดูแล"} · {formatTime(report.createdAt)}</small><p>{report.description}</p><em>ผู้แจ้ง: {report.reporter}</em></article>; })}{!alertBoardReports.some(report => report.status === status) && <p className="m3-empty">ไม่มีรายการ</p>}</div>)}</div></section></main>; }
  if (screen === "input") return <main className="m3-shell m3-guide-21-input">{header}<button className="m3-back" onClick={() => { resetInputDraft(); setNotice(""); setQueuePayoutView("daily"); setScreen("queuePayout"); }}><ArrowLeft size={16} /> กลับ Module 3</button><section className="m3-panel"><div className="m3-panel-title"><div><p>2.1 / INPUT</p><h2>{editingSessionId ? "แก้ไขรายการเดิม" : "สร้างรายการใหม่"}</h2></div><span>สร้าง ID ครั้งเดียว</span></div><div className="m3-input-settings-row"><div className="m3-counter-group"><label className="m3-counter-heading">ผู้ใช้บริการ</label><div className="m3-counter-row"><CountPicker label="R" value={riderCount} min={1} max={30} onChange={setRiderCount} /><CountPicker label="P" value={passengerCount} min={0} max={30} onChange={setPassengerCount} /></div></div></div><div className="m3-field m3-active-user-field"><label htmlFor="m3-active-user">ผู้ทำรายการ / Active User</label><div id="m3-active-user" className="m3-locked-user" aria-live="polite"><strong>{currentOperatorName ?? "ยังไม่พบผู้ล็อกอิน"}</strong><span>ล็อกอินอยู่ · ระบบใส่ให้อัตโนมัติ</span></div><small>ชื่อนี้ดึงจากบัญชีที่ล็อกอินเข้าระบบหัวหน้า และจะถูกบันทึกกับ Session_ID โดยเปลี่ยนเองไม่ได้</small></div><div className="m3-field"><label>ช่องรายชื่อ · รายชื่อในคิวขึ้นก่อน</label><div className="m3-search"><Search size={15} /><input value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="ค้นหาชื่อในคิว" /></div><div className="m3-member-grid">{selectableMembers.filter(item => item.name.includes(memberSearch)).map(member => <button key={member.id} disabled={(!member.available || busyMemberIds.has(member.id)) && !editingMemberIds.has(member.id)} className={`${selectedMemberIds.includes(member.id) ? "selected" : ""} ${busyMemberIds.has(member.id) ? "busy" : ""}`} onClick={() => toggleMember(member)}><b className={memberGroupClass(member.role)}>{member.name}</b><small>{member.role}{standbyQueueKeys.some(key => key === member.id || key.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH") === member.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH")) ? " · อยู่ในคิว" : " · นอกคิว"}{busyMemberIds.has(member.id) ? ` · ${sessions.find(session => session.memberIds.includes(member.id) && session.status !== "Completed")?.status === "Active" ? "กำลัง Active" : "อยู่ใน Standby"}` : ""}</small></button>)}</div></div><div className="m3-vehicle-mode-switch" role="group" aria-label="โหมดการเลือกเบอร์รถ"><button type="button" className={`m3-vehicle-mode-card ${vehicleSelectionMode === "grouped" ? "selected" : ""}`} onClick={() => setVehicleSelectionMode("grouped")}><strong>1. แบบกลุ่มรถ</strong><span>แยกกลุ่มรถ และแยก 200 / 250 ซีซี</span></button><button type="button" className={`m3-vehicle-mode-card ${vehicleSelectionMode === "number" ? "selected" : ""}`} onClick={() => setVehicleSelectionMode("number")}><strong>2. เรียงตามเลขรถ</strong><span>เรียงเลขต่อเนื่อง ไม่แยกกลุ่มและไม่แยกซีซี</span></button></div>{vehicleSelectionMode === "grouped" ? <div className="m3-field"><label>ช่องเบอร์รถ · กลุ่มรถของทีมหลักขึ้นก่อน</label><div className="m3-input-vehicle-groups">{orderedGuideInputVehicleGroups.length ? orderedGuideInputVehicleGroups.map(group => <section className="m3-input-vehicle-group" key={group.key} style={{ "--input-group-accent": group.color } as CSSProperties}><div className="m3-input-vehicle-group-heading"><div><strong>{group.label}</strong><span>รถในกลุ่มที่เลือกได้ · {group.vehicles.length} คัน</span></div><small>{group.key === "unassigned" ? "ท้ายรายการ" : "ตามทีมหลัก / คิว"}</small></div><div className="m3-input-vehicle-group-numbers">{(["200", "250"] as const).map(cc => { const groupVehicles = group.vehicles.filter(vehicle => vehicle.cc === cc).sort((left, right) => Number(left.number) - Number(right.number)); return groupVehicles.length ? <section className="m3-input-vehicle-cc" key={cc}><div className="m3-input-vehicle-cc-heading"><strong>{cc} ซีซี</strong><span>{groupVehicles.length} คัน</span></div><div className={`m3-guide-21-vehicle-grid m3-guide-21-vehicle-grid-${cc}`}>{groupVehicles.map(renderInputVehicle)}</div></section> : null; })}</div></section>) : <p className="m3-empty">ยังไม่มีรถพร้อมใช้ในกลุ่ม</p>}</div></div> : <div className="m3-field"><label>ช่องเบอร์รถ · เรียงตามเลขรถ</label><div className="m3-input-vehicle-groups m3-input-vehicle-number-mode"><section className="m3-input-vehicle-group"><div className="m3-input-vehicle-group-heading"><div><strong>รถทั้งหมดเรียงตามหมายเลข</strong><span>ไม่แยกกลุ่ม · ไม่แยก 200 / 250 ซีซี · {orderedGuideInputVehicles.length} คัน</span></div><small>เลขรถน้อย → มาก</small></div><div className="m3-guide-21-vehicle-grid m3-guide-21-vehicle-grid-number">{orderedGuideInputVehicles.map(renderInputVehicle)}</div></section></div></div>}<button className="m3-primary" onClick={createSession}><Plus size={16} /> {editingSessionId ? "บันทึกการแก้ไข → 2.2 Standby" : "ส่งข้อมูล → 2.2 Standby"}</button>{notice && <p className="m3-notice">{notice}</p>}</section>{durationPickerOpen &&<div className="m3-duration-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDurationPickerOpen(false); }}><section className="m3-duration-modal" role="dialog" aria-modal="true" aria-labelledby="m3-guide-duration-title"><div className="m3-duration-modal-heading"><div><p>2.1 / PROGRAM TIME</p><h2 id="m3-guide-duration-title">เลือกโปรแกรมเวลา</h2><span>เลือกเวลาให้รายการนี้ก่อนส่งไปหน้า 2.2</span></div><CalendarDays size={24} /></div><div className="m3-duration-options"><button type="button" className={duration === 30 ? "selected" : ""} onClick={() => setDuration(30)}><strong>30</strong><span>นาที</span></button><button type="button" className={duration === 60 ? "selected" : ""} onClick={() => setDuration(60)}><strong>60</strong><span>นาที</span></button></div><div className="m3-duration-modal-actions"><button type="button" className="m3-secondary" onClick={() => setDurationPickerOpen(false)}>กลับไปแก้รายการ</button><button type="button" className="m3-primary" onClick={() => commitSession(duration)}>ยืนยัน → 2.2 Standby</button></div></section></div>}</main>;

  if (screen === "standby" && selectedSession) return <main className="m3-shell">{header}<button className="m3-back" onClick={() => { setQueuePayoutView("daily"); setScreen("queuePayout"); }}><ArrowLeft size={16} /> กลับรายการ</button><section className="m3-panel"><div className="m3-panel-title"><div><p>2.2 / STANDBY · {selectedSession.sessionId}</p><h2>รอเริ่มงาน</h2></div><Clock3 size={22} /></div><div className="m3-detail"><span>รถ</span><div className="m3-vehicle-card-list">{selectedSession.vehicleIds.map(id => { const vehicle = vehicles.find(item => item.id === id); return vehicle ? <VehicleCard key={vehicle.id} number={Number(vehicle.number)} cc={`${vehicle.cc}cc`} managers={responsibleManagersForNumber(Number(vehicle.number))} responsibilityGroups={responsibilityState.responsibilityGroups} managerDirectory={directoryUsers} status={vehicle.status} safetyNotices={safetyNotices} onSafetyNoticeOpen={notices => setSelectedSafetyNoticeId(notices[0]?.id)} accentColor={getResponsibilityGroupColor(Number(vehicle.number), responsibilityState.responsibilityGroups)} /> : null; })}</div><span>ผู้ทำรายการ</span><b>{selectedSession.activeUserName ?? "ยังไม่ระบุ"}</b><span>ผู้ปฏิบัติงาน</span><div className="m3-member-name-list">{selectedSession.memberIds.map(id => { const member = members.find(item => item.id === id); return member ? <span className={`m3-member-name ${memberGroupClass(member.role)}`} key={member.id}>{member.name}</span> : null; })}</div><span>โปรแกรม / ลูกค้า</span><b>{selectedSession.durationMinutes} นาที · R {selectedSession.riderCount} · P {selectedSession.passengerCount}</b></div><button className="m3-primary" disabled={!isPrivileged && !(currentMemberId && selectedSession.memberIds.includes(currentMemberId))} onClick={startSession}><Truck size={16} /> ยืนยันเริ่มงาน → 2.3 Active</button><button className="m3-secondary" disabled={!isPrivileged && !(currentMemberId && selectedSession.memberIds.includes(currentMemberId))} onClick={() => { setEditingSessionId(selectedSession.sessionId); setSelectedVehicleIds([...selectedSession.vehicleIds]); setSelectedMemberIds(Array.from(new Set([...selectedSession.memberIds, ...(currentMemberId ? [currentMemberId] : [])]))); setDuration(selectedSession.durationMinutes); setActiveUserId(currentMemberId || selectedSession.activeUserId || activeUserId); setRiderCount(selectedSession.riderCount); setPassengerCount(selectedSession.passengerCount); setNotice(`กำลังแก้ไข ${selectedSession.sessionId} · ค่าเดิมถูกโหลดแล้ว`); setScreen("input"); }}>แก้ไขรายการเดิม</button><button className="m3-danger m3-cancel-session-button" disabled={!isPrivileged && !(currentMemberId && selectedSession.memberIds.includes(currentMemberId))} onClick={requestCancelStandby}>ยกเลิกรายการ</button>{notice && <p className="m3-notice">{notice}</p>}</section></main>;

  if (screen === "dashboard") {
    return (
      <main className="m3-shell m3-guide-home-shell">
        {header}
        {mainTabs}
        <section className="m3-panel">
          <div className="m3-panel-title">
            <div>
              <p>DASHBOARD / STATUS VIEW</p>
              <h2>สถานะรถ ATV ของ Module 3</h2>
              <small className="m3-demo-badge">{usingPersistentVehicleFlow ? "LIVE DATABASE · สถานะรถจากระบบกลาง" : "DEMO DATA · รอเชื่อมข้อมูลรถจริง"}</small>
            </div>
            <button className="m3-icon-button" onClick={() => { void refreshVehicleFlow(); void supervisorFleetSnapshotQuery.refetch(); setNotice("รีเฟรชสถานะรถจาก Server แล้ว"); }} aria-label="รีเฟรชข้อมูลรถ"><RefreshCw size={16} /></button>
          </div>
          {!!pickupNotificationsQuery.data?.length && <div className="m3-pickup-alert"><AlertTriangle size={16} /><div><b>มีรถรอไกด์รับเข้ากลุ่ม {pickupNotificationsQuery.data.length} คัน</b><span>{pickupNotificationsQuery.data.map(item => `#${item.vehicleNumber} · ${item.groupName}`).join(" | ")}</span></div><button type="button" onClick={() => setScreen("groups")}>ดูรถ</button></div>}
          <div className="m3-status-cards">
            <div className="m3-cc-card-grid">
              {(["200", "250"] as const).map(cc => {
                const summary = summaryForCc(cc);
                return <div className="m3-cc-card" key={cc}>
                  <h3>{cc} ซีซี</h3>
                  <div className="m3-cc-metrics">
                    <div className="ready"><b>{summary.ready}</b><span>พร้อมใช้</span></div>
                    <div className="repair"><b>{summary.repair}</b><span>ซ่อม</span></div>
                    <div className="inspection"><b>{summary.alert}</b><span>คำแนะนำ</span></div>
                    <div className="pickup"><b>{summary.pickup}</b><span>แจ้งรับรถ</span></div>
                    <div className="active"><b>{summary.active}</b><span>กำลังใช้งาน</span></div>
                    <div className="total"><b>{summary.total}</b><span>รวมทั้งหมด</span></div>
                  </div>
                </div>;
              })}
            </div>
            <GuideVehicleStatusSummary vehicles={vehicles} safetyNotices={safetyNotices} statusModel={guideStatusModel} onOpen={() => setScreen("groups")} />
          </div>
          <div className="m3-lists">
            <div><div className="m3-list-heading"><h3>กำลังทำงาน / Active</h3><span>{activeSessions.length}</span></div>{activeSessions.map(session => { const timing = sessionTiming(session.startedAt, session.durationMinutes, now); const { remainingSeconds: remaining, overtimeSeconds: overtime } = timing; const names = session.memberIds.map(id => members.find(member => member.id === id)?.name).filter(Boolean).join(" · ") || session.activeUserName || "ไม่ระบุผู้ปฏิบัติงาน"; return <button className={`m3-session-row ${isOwnSession(session) ? "m3-own-session" : ""}`} key={session.sessionId} onClick={() => openSession(session)}>{isOwnSession(session) && <i className="m3-own-session-light" aria-label="คุณมีชื่ออยู่ในรายการนี้" />}<b>{names}</b><span>โปรแกรม {session.durationMinutes} นาที · R {session.riderCount} · P {session.passengerCount}</span><small>{session.timerEnabled === false ? "ปิดตัวจับเวลา" : overtime > 0 ? session.expiryBehavior === "auto_complete" ? "ครบเวลา · ระบบกำลังจบรายการ" : `เกินเวลา +${formatSessionCountdown(overtime)}` : `เหลือเวลา ${formatSessionCountdown(remaining)}`}</small></button>; })}{!activeSessions.length && <p className="m3-empty">ไม่มีรายการ Active</p>}</div>
            <div><div className="m3-list-heading"><h3>รอเริ่มงาน / Standby</h3><span>{standbySessions.length}</span></div>{standbySessions.map(session => <button className={`m3-session-row ${isOwnSession(session) ? "m3-own-session" : ""}`} key={session.sessionId} onClick={() => openSession(session)}>{isOwnSession(session) && <i className="m3-own-session-light" aria-label="คุณมีชื่ออยู่ในรายการนี้" />}<b>{session.sessionId}</b><span>{session.vehicleIds.map(id => { const vehicle = vehicles.find(item => item.id === id); return vehicle ? `#${vehicle.number} · ${vehicleResponsibilityMeta(Number(vehicle.number)).groupLabel} · ${vehicleResponsibilityMeta(Number(vehicle.number)).managerLabel}` : "ไม่พบรถ"; }).join(" · ")}</span><small>{labelStatus(session.status)}{isOwnSession(session) ? " · รายการของคุณ" : ""}</small></button>)}{!standbySessions.length && <p className="m3-empty">ไม่มีรายการ Standby</p>}</div>
          </div>
          {notice && <p className="m3-notice">{notice}</p>}
        </section>
        <footer className="m3-footer"><a href="/">กลับระบบหลัก</a><span>Module 3 · Server Database sync</span></footer>
      </main>
    );
  }
  if (screen === "completed" && selectedSession) return <main className="m3-shell"><button className="m3-back" onClick={() => { setQueuePayoutView("daily"); setScreen("queuePayout"); }}><ArrowLeft size={16} /> กลับบอร์ดบันทึกรายวัน</button><section className="m3-panel"><div className="m3-panel-title"><div><p>SESSION DETAIL / COMPLETED · {selectedSession.sessionId}</p><h2>รายละเอียดรายการที่จบแล้ว</h2></div><span>จบงาน</span></div><div className="m3-detail"><span>เริ่มงาน</span><b>{formatTime(selectedSession.startedAt)}</b><span>จบงาน</span><b>{formatTime(selectedSession.completedAt)}</b><span>โปรแกรม / ลูกค้า</span><b>{selectedSession.durationMinutes} นาที · R {selectedSession.riderCount} · P {selectedSession.passengerCount}</b><span>ผู้ทำรายการ</span><b>{selectedSession.activeUserName ?? "ยังไม่ระบุ"}</b><span>สมาชิก</span><b>{selectedSession.memberIds.map(id => members.find(item => item.id === id)?.name).filter(Boolean).join(" · ") || "ไม่ระบุ"}</b><span>รถที่ใช้ตลอดรายการ</span><div className="m3-history-vehicle-groups">{(["200", "250"] as const).map(cc => { const group = selectedSessionVehicleHistory.filter(item => item.cc === cc); return <section className="m3-history-vehicle-group" key={cc}><div className="m3-history-vehicle-heading"><strong>{cc} ซีซี</strong><span>{group.length} คัน</span></div>{group.length ? <div className="m3-history-vehicle-grid">{group.map(item => <div className={`m3-history-vehicle-card ${item.removedAt ? "removed" : ""}`} key={item.vehicleId}><b>#{item.number}</b><span>{item.cc}cc</span><small>{vehicleResponsibilityMeta(Number(item.number)).groupLabel} · {vehicleResponsibilityMeta(Number(item.number)).managerLabel}</small><small>{item.removedAt ? `นำออกก่อนจบ · ${formatTime(item.removedAt)}` : "อยู่ในรายการตอนจบ"}</small></div>)}</div> : <p className="m3-empty">ไม่มีรถในหมวดนี้</p>}</section>; })}</div><SessionActivitySheet session={selectedSession} /></div></section></main>;
  if (screen === "active" && selectedSession) {
    const availableToAdd = vehicles.filter(item => item.status === "ready" && !busyVehicleIds.has(item.id));
    const availableMembers = members.filter(item => item.available && !busyMemberIds.has(item.id) && !selectedSession.memberIds.includes(item.id));
    return <main className="m3-shell">{header}<button className="m3-back" onClick={() => { setQueuePayoutView("daily"); setScreen("queuePayout"); }}><ArrowLeft size={16} /> กลับรายการ</button><section className="m3-panel m3-active-panel"><div className="m3-panel-title"><div><p>2.3 / ACTIVE · {selectedSession.sessionId}</p><h2>กำลังปฏิบัติงาน</h2></div><span className="m3-live"><i /> LIVE</span></div>{selectedSession.timerEnabled !== false && <div className={`m3-timer ${overtimeSeconds > 0 ? "m3-timer-overtime" : ""}`}><strong>{formattedActiveTime}</strong><span>{overtimeSeconds > 0 ? selectedSession.expiryBehavior === "auto_complete" ? "ครบเวลา · ระบบกำลังจบรายการ" : selectedSession.expiryBehavior === "overtime" ? "เกินเวลา · นับเวลาต่อ" : "เกินเวลา · รอยืนยันการจบงาน" : `เหลือเวลา · โปรแกรม ${selectedSession.durationMinutes} นาที`}</span></div>}<div className="m3-detail"><div className="m3-notice m3-readonly-notice" role="status">{canManageSelectedSession("edit") ? "คุณมีสิทธิ์จัดการรายการนี้" : "โหมดดูรายละเอียด · คุณสามารถส่งข้อความใน Session Chat ได้"}</div><span>รถทั้งหมด</span><ActiveVehicleDetailList sessionId={selectedSession.sessionId} vehicles={selectedSession.vehicleIds.flatMap(id => { const vehicle = vehicles.find(item => item.id === id); return vehicle ? [{ id: vehicle.id, number: Number(vehicle.number), cc: `${vehicle.cc}cc`, managers: responsibleManagersForNumber(Number(vehicle.number)), accentColor: getResponsibilityGroupColor(Number(vehicle.number), responsibilityState.responsibilityGroups) }] : []; })} activeStaff={selectedSession.memberIds.map(memberId => members.find(item => item.id === memberId)?.name).filter((name): name is string => Boolean(name))} activeRoles={selectedSession.memberIds.map(memberId => members.find(member => member.id === memberId)?.role).filter((role): role is MemberRole => Boolean(role))} safetyNotices={safetyNotices} onSafetyNoticeOpen={notices => setSelectedSafetyNoticeId(notices[0]?.id)} responsibilityGroups={responsibilityState.responsibilityGroups} managerDirectory={directoryUsers} /><span>ผู้ทำรายการ</span><b>{selectedSession.activeUserName ?? "ยังไม่ระบุ"}</b><span>สมาชิก</span><b>{selectedSession.memberIds.map(id => members.find(item => item.id === id)?.name).join(" · ")}</b><span>ผู้ใช้บริการ</span><b>R {selectedSession.riderCount} · P {selectedSession.passengerCount}</b></div><SessionActivitySheet session={selectedSession} /><div className="m3-action-grid"><button disabled={!canOperateSelectedSession("edit")} onClick={() => setActiveDialog("members")}><UsersRound size={15} /> เพิ่มสมาชิก</button><button disabled={!canOperateSelectedSession("changeVehicle")} onClick={() => setActiveDialog("addVehicle")}><Plus size={15} /> เพิ่มรถ</button><button disabled={!canOperateSelectedSession("changeVehicle")} onClick={() => { setReplaceFromId(selectedSession.vehicleIds[0] ?? ""); setReplaceToId(availableToAdd[0]?.id ?? ""); setActiveDialog("replace"); }}><RotateCcw size={15} /> เปลี่ยนรถ</button><button disabled={!canOperateSelectedSession("changeVehicle")} onClick={() => setActiveDialog("removeVehicle")}><X size={15} /> เอารถออก</button><button disabled={!canOperateSelectedSession("edit")} onClick={requestCompleteSession}><Check size={15} /> จบ/คืนรถ</button></div>{activeDialog && <div className="m3-modal-backdrop" role="presentation" onClick={() => setActiveDialog(null)}><div className="m3-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}><div className="m3-modal-head"><div><p>ACTIVE RESOURCE ACTION</p><h3>{activeDialog === "members" ? "เพิ่มสมาชิก" : activeDialog === "addVehicle" ? "เพิ่มรถ" : activeDialog === "replace" ? "เปลี่ยนรถ" : "เอารถออกระหว่างทาง"}</h3></div><button type="button" onClick={() => setActiveDialog(null)} aria-label="ปิด"><X size={18} /></button></div>{activeDialog === "members" && <div className="m3-modal-list">{availableMembers.length ? availableMembers.map(member => <button type="button" key={member.id} onClick={() => addMembers([member.id])}><b>{member.name}</b><small>{member.role} · ว่าง</small></button>) : <p className="m3-empty">ไม่มีสมาชิกที่ว่าง</p>}</div>}{activeDialog === "addVehicle" && <VehicleChoiceList items={availableToAdd.map(vehicle => ({ id: vehicle.id, number: Number(vehicle.number), cc: vehicle.cc, statusLabel: "พร้อมใช้", accentColor: getResponsibilityGroupColor(Number(vehicle.number), responsibilityState.responsibilityGroups), safetyNotices }))} responsibilityGroups={responsibilityState.responsibilityGroups} managerDirectory={directoryUsers} onSafetyNoticeOpen={notices => setSelectedSafetyNoticeId(notices[0]?.id)} onSelect={id => { const vehicle = availableToAdd.find(item => item.id === id); if (vehicle) addVehicle(vehicle); }} ariaLabel="เลือกรถเพื่อเพิ่มเข้า Active" actionLabel="เพิ่มรถ" emptyLabel="ไม่มีรถที่ว่างและพร้อมใช้" />}{activeDialog === "replace" && <div className="m3-modal-form vehicle-choice-form"><div className="vehicle-choice-section"><span className="vehicle-choice-section-label">รถที่จะเอาออก</span><VehicleChoiceList items={selectedSession.vehicleIds.flatMap(id => { const vehicle = vehicles.find(item => item.id === id); return vehicle ? [{ id: vehicle.id, number: Number(vehicle.number), cc: vehicle.cc, statusLabel: "อยู่ใน Active", accentColor: getResponsibilityGroupColor(Number(vehicle.number), responsibilityState.responsibilityGroups), safetyNotices }] : []; })} selectedId={replaceFromId} responsibilityGroups={responsibilityState.responsibilityGroups} managerDirectory={directoryUsers} onSafetyNoticeOpen={notices => setSelectedSafetyNoticeId(notices[0]?.id)} onSelect={setReplaceFromId} ariaLabel="เลือกรถเดิมที่จะเปลี่ยน" actionLabel="เลือกรถเดิม" /></div><div className="vehicle-choice-section"><span className="vehicle-choice-section-label">รถที่จะนำเข้าแทน</span><VehicleChoiceList items={availableToAdd.map(vehicle => ({ id: vehicle.id, number: Number(vehicle.number), cc: vehicle.cc, statusLabel: "พร้อมใช้", accentColor: getResponsibilityGroupColor(Number(vehicle.number), responsibilityState.responsibilityGroups), safetyNotices }))} selectedId={replaceToId} responsibilityGroups={responsibilityState.responsibilityGroups} managerDirectory={directoryUsers} onSafetyNoticeOpen={notices => setSelectedSafetyNoticeId(notices[0]?.id)} onSelect={setReplaceToId} ariaLabel="เลือกรถพร้อมใช้เพื่อแทนที่" actionLabel="เลือกแทน" emptyLabel="ไม่มีรถที่ว่างและพร้อมใช้" /></div><button type="button" className="m3-primary" disabled={!replaceFromId || !replaceToId} onClick={() => { const next = vehicles.find(vehicle => vehicle.id === replaceToId); if (next) changeVehicle(replaceFromId, next); setReplaceFromId(""); setReplaceToId(""); setActiveDialog(null); }}>ยืนยันเปลี่ยนรถ</button></div>}{activeDialog === "removeVehicle" && <VehicleChoiceList items={selectedSession.vehicleIds.flatMap(id => { const vehicle = vehicles.find(item => item.id === id); return vehicle ? [{ id: vehicle.id, number: Number(vehicle.number), cc: vehicle.cc, statusLabel: "อยู่ใน Active", accentColor: getResponsibilityGroupColor(Number(vehicle.number), responsibilityState.responsibilityGroups), disabled: selectedSession.vehicleIds.length <= 1, disabledReason: "ต้องเหลือรถใน Active อย่างน้อย 1 คัน", safetyNotices }] : []; })} responsibilityGroups={responsibilityState.responsibilityGroups} managerDirectory={directoryUsers} onSafetyNoticeOpen={notices => setSelectedSafetyNoticeId(notices[0]?.id)} onSelect={removeVehicleFromActive} ariaLabel="เลือกรถที่จะนำออกจาก Active" actionLabel="เอาออก" emptyLabel="ไม่มีรถใน Active" /> }</div></div>}{completionPrompt?.sessionId === selectedSession.sessionId && <div className="m3-modal-backdrop" role="presentation"><div className="m3-modal m3-completion-modal" role="dialog" aria-modal="true" aria-labelledby="m3-completion-title"><div className="m3-modal-head"><div><p>{completionPrompt.kind === "expired" ? "ACTIVE TIMEOUT" : "ACTIVE COMPLETION"}</p><h3 id="m3-completion-title">{completionPrompt.kind === "expired" ? "รายการ Active หมดเวลาแล้ว" : "ยืนยันจบและคืนรถ"}</h3></div><button type="button" onClick={() => completionPrompt.kind === "expired" ? keepSessionOpenAfterExpiry() : setCompletionPrompt(null)} aria-label="ปิด"><X size={18} /></button></div><p className="m3-modal-message">{completionPrompt.kind === "expired" ? "โปรแกรมครบเวลาแล้ว ต้องยืนยันว่าจะจบงาน หรือให้รายการทำงานต่อ" : "ตรวจสอบว่าการทำงานเสร็จแล้ว รถทุกคันจะกลับเป็นสถานะพร้อมใช้"}</p><div className="m3-modal-actions"><button type="button" className="m3-secondary" onClick={() => completionPrompt.kind === "expired" ? keepSessionOpenAfterExpiry() : setCompletionPrompt(null)}>{completionPrompt.kind === "expired" ? "ยังไม่จบ" : "ยกเลิก"}</button><button type="button" className="m3-primary" onClick={finalizeSession}><Check size={15} /> ยืนยัน</button></div></div></div>}<div className="m3-subpanel"><div className="m3-panel-title"><div><p>ทรัพยากรที่ว่าง</p><h3>เพิ่มสมาชิกภายใต้ ID เดิม</h3></div><span>{availableMembers.length} คน</span></div><div className="m3-member-grid">{availableMembers.map(member => <button key={member.id} onClick={() => { addMembers([member.id]); }}><b>{member.name}</b><small>{member.role}</small></button>)}</div></div><ServerActiveSessionChat sessionId={selectedSessionId} module="guide" canSend={canSendSelectedSessionMessage} /></section></main>;
  }

  return <main className="m3-shell">{header}{mainTabs}<section className="m3-panel"><div className="m3-panel-title"><div><p>DASHBOARD / STATUS VIEW</p><h2>สถานะรถ ATV ของ Module 3</h2><small className="m3-demo-badge">SERVER DATABASE · อัปเดตจากข้อมูลกลาง</small></div><button className="m3-icon-button" onClick={() => { void refreshVehicleFlow(); void supervisorFleetSnapshotQuery.refetch(); setNotice("รีเฟรชสถานะรถจาก Server แล้ว"); }}><RefreshCw size={16} /></button></div><div className="m3-status-cards"><div className="m3-cc-card-grid">{(["200", "250"] as const).map(cc => { const summary = summaryForCc(cc); return <div className="m3-cc-card" key={cc}><h3>{cc} ซีซี</h3><div className="m3-cc-metrics"><div className="ready"><b>{summary.ready}</b><span>พร้อมใช้</span></div><div className="repair"><b>{summary.repair}</b><span>ซ่อม</span></div><div className="inspection"><b>{summary.alert}</b><span>คำแนะนำ</span></div><div className="active"><b>{summary.active}</b><span>กำลังใช้งาน</span></div><div className="total"><b>{summary.total}</b><span>รวมทั้งหมด</span></div></div></div>; })}</div><GuideVehicleStatusSummary vehicles={vehicles} safetyNotices={safetyNotices} statusModel={guideStatusModel} onOpen={() => setScreen("groups")} /></div><div className="m3-dashboard-actions"><button className="m3-primary" onClick={startNewSession}><Plus size={16} /> สร้างรายการ 2.1</button></div><div className="m3-lists"><div><div className="m3-list-heading"><h3>กำลังทำงาน / Active</h3><span>{activeSessions.length}</span></div>{activeSessions.map(session => <button className={`m3-session-row ${isOwnSession(session) ? "m3-own-session" : ""}`} key={session.sessionId} onClick={() => openSession(session)}>{isOwnSession(session) && <i className="m3-own-session-light" aria-label="คุณมีชื่ออยู่ในรายการนี้" />}<b>{session.sessionId}</b><span>{session.vehicleIds.map(id => { const vehicle = vehicles.find(item => item.id === id); return vehicle ? `#${vehicle.number} · ${vehicleResponsibilityMeta(Number(vehicle.number)).groupLabel} · ${vehicleResponsibilityMeta(Number(vehicle.number)).managerLabel}` : "ไม่พบรถ"; }).join(" · ")}</span><small>{labelStatus(session.status)}{isOwnSession(session) ? " · รายการของคุณ" : ""}</small></button>)}{!activeSessions.length && <p className="m3-empty">ไม่มีรายการ Active</p>}</div><div><div className="m3-list-heading"><h3>รอเริ่มงาน / Standby</h3><span>{standbySessions.length}</span></div>{standbySessions.map(session => <button className={`m3-session-row ${isOwnSession(session) ? "m3-own-session" : ""}`} key={session.sessionId} onClick={() => openSession(session)}>{isOwnSession(session) && <i className="m3-own-session-light" aria-label="คุณมีชื่ออยู่ในรายการนี้" />}<b>{session.sessionId}</b><span>{session.vehicleIds.map(id => { const vehicle = vehicles.find(item => item.id === id); return vehicle ? `#${vehicle.number} · ${vehicleResponsibilityMeta(Number(vehicle.number)).groupLabel} · ${vehicleResponsibilityMeta(Number(vehicle.number)).managerLabel}` : "ไม่พบรถ"; }).join(" · ")}</span><small>{labelStatus(session.status)}{isOwnSession(session) ? " · รายการของคุณ" : ""}</small></button>)}{!standbySessions.length && <p className="m3-empty">ไม่มีรายการ Standby</p>}</div></div>{notice && <p className="m3-notice">{notice}</p>}</section><footer className="m3-footer"><a href="/">กลับระบบหลัก</a><span>Module 3 · Server Database sync</span></footer></main>;
}
