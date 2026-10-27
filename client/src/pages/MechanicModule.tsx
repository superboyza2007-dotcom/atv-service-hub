import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Clock3, ClipboardList, ClipboardPlus, Lightbulb, ListChecks, MessageCircle, Pencil, Plus, RefreshCw, RotateCcw, Save, Settings2, Table2, Trash2, Wrench } from "lucide-react";
import { resolveMechanicRecordVehicleStatus } from "@/lib/mechanic-record-status";
import { filterActiveMechanicRepairs, getMechanicRepairLog } from "@/lib/mechanic-repair-visibility";
import { canSubmitMechanicRepair, normalizeOptionalRepairParts } from "@/lib/mechanic-repair-form";
import { closeGuideRepairReport, extractGuideVehicleNumber, findGuideRepairReportForRepair, guideRepairVehicleSelection, isGuideRepairReportCompleted, isGuideRepairReportPending, markGuideRepairReportInProgress, mergeGuideRepairReports, type GuideRepairReport } from "@/lib/mechanic-guide-repair";
import { applyMechanicVehicleStatus, getMechanicVehicleStatus } from "@/lib/mechanic-vehicle-flow";
import { aggregateVehiclePickupRequests, markVehiclePickupRequestReceived, reconcilePickupRecipients, removeVehiclePickupRequest, recipientsForVehicleGroup, responsibilityGroupForVehicle, upsertVehiclePickupRequest, type VehiclePickupRequest } from "@/lib/vehicle-pickup-notifications";
import { getResponsibilityGroupColor, type VehicleResponsibilityState } from "@/lib/vehicle-responsibility-store";
import { formatVehicleManagerNames, resolveVehicleManagerNames, resolveVehicleResponsibilityView } from "@/lib/vehicle-manager-resolver";
import { findMechanicRoundTableUser } from "@/lib/mechanic-round-table";
import { buildPersonalPayoutRows, normalizePayoutValue, PAYOUT_ROUND_COLUMNS, payoutPageOffsetForDate, updatePersonalPayoutValue, type PersonalPayoutValues, type PayoutSessionLike } from "@/lib/mechanic-payout-table";
import { buildSupervisorUserDirectoryStatusModel, buildSupervisorUserDirectoryStatusSource } from "@/lib/supervisor-data";
import { removeVehicleSafetyNotice, upsertVehicleSafetyNotice, type VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";
import { addMaintenanceRule, defaultRoundChangeSettings, evaluateMaintenanceAlerts, getMaintenanceMeterLevel, normalizeRoundChangeSettings, removeMaintenanceRule, updateMaintenanceRule, type MaintenanceRule, type RoundChangeSettings, type VehicleCc } from "@/lib/mechanic-round-change";
import { hasVehicleMaintenanceNotification, type VehicleMaintenanceNotification } from "@/lib/vehicle-maintenance-notifications";
import { accumulatedHoursForVehicle, summarizeVehicleUsageHours, type VehicleUsageHours } from "@/lib/vehicle-usage-hours";
import { PttRoomPanel } from "@/components/PttRoom";
import { DisconnectedVehicleStatusCards } from "@/components/DisconnectedVehicleStatusCards";
import CommunicationChat from "@/components/CommunicationChat";
import ModuleLogoutButton from "@/components/ModuleLogoutButton";
import { ActiveVehicleDetailList } from "@/components/ActiveVehicleDetailList";
import { ActiveSessionChat, type ActiveSessionChatMessage } from "@/components/ActiveSessionChat";
import { ServerActiveSessionChat } from "@/components/ServerActiveSessionChat";
import { VehicleChoiceList, VehicleChoicePicker, VehicleReplacementPanel, type VehicleChoiceItem } from "@/components/VehicleChoiceList";
import { VehicleSafetyNoticeDialog, VehicleSafetyNoticeIndicator, VehicleSafetyNoticeList } from "@/components/VehicleSafetyNotice";
import { VehicleResponsibilityGroupView } from "@/components/VehicleResponsibilityGroupView";
import { canMechanicManageSession, mechanicSessionHref, mechanicSessionMemberNames } from "@/lib/mechanic-active-detail";
import { formatSessionCountdown, sessionTiming } from "@/lib/session-countdown";
import { availableReplacementVehicleNumbers } from "@/lib/active-vehicle-selection";
import { isSelectableForNewRepair } from "@/lib/vehicle-selection-rules";
import { completionTimingDetail, formatCompletionDifference, sessionCompletionTiming } from "@/lib/session-completion-timing";
import { appendSessionActivity, createSessionActivity, type SessionActivity } from "@/lib/session-activity-log";
import { activeCompletionCopy, createActiveCompletionPrompt, isActiveCompletionPromptFor, type ActiveCompletionPrompt } from "@/lib/active-completion";
import { trpc } from "@/lib/trpc";
import { OPERATIONS_SNAPSHOT_KEYS, parseOperationsSnapshot, serializeOperationsSnapshot } from "@/lib/operations-snapshot";
import { mergeVehiclePickupRequests, type VehicleFlowSnapshot } from "@/lib/vehicle-flow-snapshot";
import { mergeSessionChatMessages } from "@/lib/session-chat-sync";
import { mergeSharedSessions, patchSharedSession } from "@/lib/shared-session-sync";
import { useCanonicalAppDirectory } from "@/hooks/useCanonicalAppDirectory";
import { buildRepairLogSheetPayload } from "@/lib/repair-log-google-sheets";
import { showBrowserNotification } from "@/lib/browser-notification";
import { FULL_APP_DEMO_REPAIR_REPORTS, isFullAppDemo } from "@/lib/full-app-demo";
import SpeechSettingsPanel from "@/components/SpeechSettingsPanel";

type MechanicTab = "dashboard" | "status" | "tips" | "roundTable" | "communication" | "roundChange" | "settings" | "repair" | "repairBoard" | "waitingParts" | "log";
type MechanicFollowSession = PayoutSessionLike & { sessionId: string; status: "Active" | "Standby" | "Completed"; startedAt?: string; completedAt?: string; completedById?: string; completedByName?: string; activeUserName?: string; vehicleIds?: string[]; riderCount?: number; passengerCount?: number; overtimeAcknowledged?: boolean; completionTiming?: ReturnType<typeof sessionCompletionTiming>; activityLog?: SessionActivity[] };
type MechanicFollowPosition = { edge: "left" | "right"; top: number };
type MechanicFollowDrag = { pointerId: number; startX: number; startY: number; startTop: number; moved: boolean };
const MECHANIC_FOLLOW_SIZE = 76;
function readMechanicFollowPosition(): MechanicFollowPosition {
  if (typeof window === "undefined") return { edge: "right", top: 18 };
  try {
    return { edge: "right", top: Math.max(18, window.innerHeight - MECHANIC_FOLLOW_SIZE - 26) };
  } catch { return { edge: "right", top: Math.max(18, window.innerHeight - MECHANIC_FOLLOW_SIZE - 26) }; }
}
function clampMechanicFollowTop(top: number) {
  if (typeof window === "undefined") return Math.max(12, top);
  return Math.min(Math.max(12, top), Math.max(12, window.innerHeight - MECHANIC_FOLLOW_SIZE - 12));
}
function MechanicSessionFollowPopup({ session, now, onOpen }: { session?: MechanicFollowSession; now: number; onOpen: () => void }) {
  const [position, setPosition] = useState<MechanicFollowPosition>(() => readMechanicFollowPosition());
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<MechanicFollowDrag | null>(null);
  const suppressClickRef = useRef(false);
  if (!session || session.status !== "Active") return null;
  const durationSeconds = Math.max(0, (session.durationMinutes ?? 30) * 60);
  const startedAtMs = session.startedAt ? Date.parse(session.startedAt) : Number.NaN;
  const elapsed = Number.isFinite(startedAtMs) ? Math.max(0, Math.floor((now - startedAtMs) / 1000)) : 0;
  const overtime = Math.max(0, elapsed - durationSeconds);
  const remaining = Math.max(0, durationSeconds - elapsed);
  const timeLabel = overtime > 0 ? `+${String(Math.floor(overtime / 60)).padStart(2, "0")}:${String(overtime % 60).padStart(2, "0")}` : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const savePosition = (next: MechanicFollowPosition) => { const safe = { ...next, top: clampMechanicFollowTop(next.top) }; setPosition(safe); };
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startTop: position.top, moved: false }; setIsDragging(true); };
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const deltaX = event.clientX - drag.startX; const deltaY = event.clientY - drag.startY; if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) drag.moved = true; if (drag.moved) savePosition({ edge: event.clientX < window.innerWidth / 2 ? "left" : "right", top: drag.startTop + deltaY }); };
  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; suppressClickRef.current = drag.moved; dragRef.current = null; setIsDragging(false); };
  const onClick = () => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } onOpen(); };
  return <button type="button" className={`m3-session-follow-popup m3-session-follow-orb ${overtime > 0 ? "is-overtime" : "is-active"} ${isDragging ? "is-dragging" : ""}`} style={{ top: `${clampMechanicFollowTop(position.top)}px`, ...(position.edge === "left" ? { left: "max(12px, env(safe-area-inset-left))" } : { right: "max(12px, env(safe-area-inset-right))" }) }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClick={onClick} aria-label={`เปิดรายการ Active ${session.sessionId} ${overtime > 0 ? `เวลาบวก ${timeLabel}` : `เหลือ ${timeLabel}`}`} title="ลากเพื่อย้ายตำแหน่ง หรือกดเพื่อเปิดรายละเอียด Active"><span className="m3-session-follow-icon"><Clock3 size={22} /></span><span className="m3-session-follow-time">{timeLabel}</span><span className="sr-only">รายการ Active {session.sessionId}</span></button>;
}

const MECHANIC_TABS: MechanicTab[] = ["dashboard", "tips", "roundTable", "communication", "roundChange", "settings", "repair", "repairBoard", "waitingParts", "log"];
function readInitialMechanicTab(): MechanicTab {
  if (typeof window === "undefined") return "dashboard";
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("tab");
  return requested && MECHANIC_TABS.includes(requested as MechanicTab) ? requested as MechanicTab : "dashboard";
}
type AlertSeverity = "ปกติ" | "เร่งด่วน";
type RepairStatus = "กำลังซ่อม" | "แจ้งรับรถ" | "เสร็จแล้ว";
type RepairDecision = "แจ้งรับรถ" | "ไม่แจ้งรับรถ";
type AlertRecord = { id: string; source?: "manual" | "waiting-available"; sourceRepairReportId?: string; vehicleNumber: number; description: string; severity: AlertSeverity; reporter: string; createdAt: string; waitingParts?: boolean; waitingPartDetail?: string };
type RepairRecord = { id: string; vehicleNumber: number; symptom: string; parts: string; technician: string; decision?: RepairDecision; status: RepairStatus; createdAt: string; updatedAt: string; sourceGuideRepairId?: string; accumulatedHoursAtRepair?: number };
type MechanicLocalState = { alerts: AlertRecord[]; repairs: RepairRecord[] };
type MechanicServerState = MechanicLocalState & { repairPartOptions?: string[]; roundChangeSettings?: RoundChangeSettings; maintenanceResetHours?: Record<string, number>; personalPayoutValues?: PersonalPayoutValues };
type PendingMaintenanceReset = { ruleId: string; vehicleNumber: number };
const defaultRepairPartOptions = ["น้ำมันเครื่อง", "ผ้าเบรก", "ยาง", "แบตเตอรี่", "โซ่และสเตอร์"];
const EMPTY_VEHICLE_STATE: VehicleResponsibilityState = { version: 1, vehicleGroups: [], responsibilityGroups: [], updatedAt: 0 };

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function formatElapsedHours(start: string, end = new Date().toISOString()) {
  const elapsed = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  return `${(elapsed / 3_600_000).toFixed(1)} ชม.`;
}

function persistGuideRepairLifecycle(repair: RepairRecord, status: RepairStatus, changedAt: string, changedBy: string, reports: GuideRepairReport[]): GuideRepairReport[] | undefined {
  const sourceReport = findGuideRepairReportForRepair(reports, repair);
  if (!sourceReport) return undefined;
  // เมื่อช่างกดส่งทำรายการซ่อม แปลว่ารับช่วงรายการจากไกด์แล้ว
  // จึงต้องนำรายการต้นทางออกจากคิวแจ้งซ่อมของไกด์ทันที ไม่ว่าผลการซ่อมจะเป็นแบบใด
  return closeGuideRepairReport(reports, sourceReport.id, changedAt, changedBy);
}

function shortStatus(status: string) {
  if (status === "repair") return "ซ่อม";
  if (status === "inspection") return "แจ้งเตือน";
  if (status === "pickup") return "แจ้งรับรถ";
  if (status === "active") return "กำลังใช้งาน";
  return "พร้อมใช้";
}

export default function MechanicModule() {
  const isMechanicDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "mechanic-board";
  const fullAppDemo = isFullAppDemo();
  const canonicalDirectory = useCanonicalAppDirectory();
  const directoryUsers = canonicalDirectory.users;
  const [tab, setTab] = useState<MechanicTab>(() => readInitialMechanicTab());
  const [vehicleState, setVehicleState] = useState<VehicleResponsibilityState>(EMPTY_VEHICLE_STATE);
  const [mechanicLoginKey, setMechanicLoginKey] = useState("");
  const [localState, setLocalState] = useState<MechanicLocalState>({ alerts: [], repairs: [] });
  const [safetyNotices, setSafetyNotices] = useState<VehicleSafetyNotice[]>([]);
  const [selectedSafetyNotices, setSelectedSafetyNotices] = useState<VehicleSafetyNotice[]>([]);
  const [guideRepairReports, setGuideRepairReports] = useState<GuideRepairReport[]>(() => isMechanicDemo ? [{ id: "demo-guide-repair-28", vehicleId: "m3-v28", description: "ตรวจพบเบรกมีเสียงดัง กรุณาตรวจสอบก่อนนำรถไปใช้งาน", reporter: "Gun (Guide)", createdAt: "2026-10-26T15:00:00.000Z", status: "แจ้งซ่อม" }] : fullAppDemo ? [...FULL_APP_DEMO_REPAIR_REPORTS] : []);
  const [repairBoardStages, setRepairBoardStages] = useState<Record<string, "กำลังประเมิน" | "รออะไหล่ใช้งานได้" | "รออะไหล่ห้ามใช้งาน">>(() => isMechanicDemo ? { "demo-guide-repair-28": "กำลังประเมิน" } : fullAppDemo ? { "demo-repair-21": "กำลังประเมิน", "demo-repair-25": "รออะไหล่ห้ามใช้งาน" } : {} as Record<string, "กำลังประเมิน" | "รออะไหล่ใช้งานได้" | "รออะไหล่ห้ามใช้งาน">);
  const [repairBoardOutcomeDetails, setRepairBoardOutcomeDetails] = useState<Record<string, string>>(() => ({}));
  const [selectedRepairBoardReport, setSelectedRepairBoardReport] = useState<GuideRepairReport>();
  const [repairBoardRepairCompletionId, setRepairBoardRepairCompletionId] = useState<string>();
  const [repairBoardPendingAlertId, setRepairBoardPendingAlertId] = useState<string>();
  const [repairBoardPendingPartsId, setRepairBoardPendingPartsId] = useState<string>();
  const [repairWaitingPartDetail, setRepairWaitingPartDetail] = useState("");
  const [guideSessionsFromServer, setGuideSessionsFromServer] = useState<MechanicFollowSession[]>([]);
  const [guideMessagesFromServer, setGuideMessagesFromServer] = useState<ActiveSessionChatMessage[]>([]);
  const [pickupRequests, setPickupRequests] = useState<VehiclePickupRequest[]>([]);
  const [maintenanceNotifications, setMaintenanceNotifications] = useState<VehicleMaintenanceNotification[]>([]);
  const [alertVehicle, setAlertVehicle] = useState("");
  const [alertDescription, setAlertDescription] = useState("");
  const [alertWaitingParts, setAlertWaitingParts] = useState(false);
  const [alertWaitingPartDetail, setAlertWaitingPartDetail] = useState("");
  const [repairVehicle, setRepairVehicle] = useState("");
  const [repairSymptom, setRepairSymptom] = useState("");
  const [selectedGuideRepairId, setSelectedGuideRepairId] = useState<string>();
  const [repairParts, setRepairParts] = useState("");
  const [repairDecision, setRepairDecision] = useState<RepairDecision | "">("");
  const [repairFormMessage, setRepairFormMessage] = useState("");
  const [repairPartOptions, setRepairPartOptions] = useState<string[]>(defaultRepairPartOptions);
  const [newRepairPartOption, setNewRepairPartOption] = useState("");
  const [showRepairSettings, setShowRepairSettings] = useState(false);
  const [repairLogSheetMessage, setRepairLogSheetMessage] = useState("");
  const [editingAlertId, setEditingAlertId] = useState<string>();
  const [editingRepairId, setEditingRepairId] = useState<string>();
  const [roundChangeSettings, setRoundChangeSettings] = useState<RoundChangeSettings>(defaultRoundChangeSettings);
  const [newMaintenanceName, setNewMaintenanceName] = useState("");
  const [newMaintenanceThresholds, setNewMaintenanceThresholds] = useState<Record<VehicleCc, string>>({ 200: "", 250: "" });
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [editingMaintenanceRuleId, setEditingMaintenanceRuleId] = useState<string>();
  const [editingMaintenanceName, setEditingMaintenanceName] = useState("");
  const [editingMaintenanceThresholds, setEditingMaintenanceThresholds] = useState<Record<VehicleCc, string>>({ 200: "", 250: "" });
  const [roundChangeView, setRoundChangeView] = useState<"vehicles" | "alerts">("vehicles");
  const [maintenanceViewRuleId, setMaintenanceViewRuleId] = useState<string>();
  const [maintenanceResetHours, setMaintenanceResetHours] = useState<Record<string, number>>({});
  const [pendingMaintenanceReset, setPendingMaintenanceReset] = useState<PendingMaintenanceReset>();
  const [roundPageOffset, setRoundPageOffset] = useState(() => new Date().getDate() >= 16 ? 1 : 0);
  const [personalPayoutValues, setPersonalPayoutValues] = useState<PersonalPayoutValues>({});
  const [guideSnapshotVersion, setGuideSnapshotVersion] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [selectedMechanicFollowSessionId, setSelectedMechanicFollowSessionId] = useState<string | undefined>(() => typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("sessionId") ?? undefined);
  const [mechanicDetailAction, setMechanicDetailAction] = useState<"members" | "addVehicle" | "removeVehicle" | "replaceVehicle" | null>(null);
  const [mechanicReplaceFromId, setMechanicReplaceFromId] = useState("");
  const [mechanicReplaceToId, setMechanicReplaceToId] = useState("");
  const [mechanicCompletionPrompt, setMechanicCompletionPrompt] = useState<ActiveCompletionPrompt | null>(null);
  const [mechanicDetailChatText, setMechanicDetailChatText] = useState("");
  const sessionMessageMigrationAttempted = useRef(false);
  const mechanicStateHydrated = useRef(false);
  const mechanicStateMigrationAttempted = useRef(false);
  const repairAlertedReports = useRef(new Set<string>());
  const repairAlertBaselineReady = useRef(false);
  const maintenanceAlertedKeys = useRef(new Set<string>());
  const maintenanceAlertBaselineReady = useRef(false);
  const repairAlertAudioContext = useRef<AudioContext | null>(null);

  const playRepairAlertSound = () => {
    if (typeof window === "undefined") return;
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = repairAlertAudioContext.current ?? new AudioContextConstructor();
    repairAlertAudioContext.current = context;
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
    const unlockRepairAlertAudio = () => {
      if (typeof window === "undefined") return;
      const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      repairAlertAudioContext.current ??= new AudioContextConstructor();
      if (repairAlertAudioContext.current.state === "suspended") void repairAlertAudioContext.current.resume();
    };
    window.addEventListener("pointerdown", unlockRepairAlertAudio);
    window.addEventListener("touchstart", unlockRepairAlertAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockRepairAlertAudio);
      window.removeEventListener("touchstart", unlockRepairAlertAudio);
    };
  }, []);
  const guideSessionsQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions }, { retry: false, refetchInterval: 1000 });
  const mechanicStateQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.mechanicState }, { retry: false, refetchInterval: 1000 });
  const guideStateQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.guideState }, { retry: false, refetchInterval: 1000 });
  const vehicleFlowSnapshotQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.vehicleFlow }, { retry: false, refetchInterval: 1000 });
  const supervisorFleetSnapshotQuery = trpc.operationsSnapshots.get.useQuery({ key: OPERATIONS_SNAPSHOT_KEYS.fleet }, { retry: false, refetchInterval: 3000 });
  const vehicleFlowSummaryQuery = trpc.vehicleFlow.summary.useQuery(undefined, { retry: false, refetchInterval: 3000 });
  const repairWorkflowQuery = trpc.repairWorkflow.list.useQuery(undefined, { enabled: !isMechanicDemo && !fullAppDemo, retry: false, refetchInterval: 3000 });
  const directoryMeQuery = trpc.directory.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: true });
  const saveGuideSessionsMutation = trpc.operationsSnapshots.merge.useMutation();
  const saveGuideStateMutation = trpc.operationsSnapshots.merge.useMutation();
  const saveMechanicStateMutation = trpc.operationsSnapshots.merge.useMutation();
  const saveVehicleFlowSnapshotMutation = trpc.operationsSnapshots.merge.useMutation();
  const saveSupervisorFleetSnapshotMutation = trpc.operationsSnapshots.merge.useMutation();
  const appendGuideMessageMutation = trpc.operationsSnapshots.append.useMutation();
  const completeRepairWithoutPickupMutation = trpc.vehicleFlow.completeRepairWithoutPickup.useMutation({
    onSuccess: () => { void supervisorFleetSnapshotQuery.refetch(); },
  });
  const repairLogStatusQuery = trpc.repairLog.status.useQuery(undefined, { retry: false, refetchInterval: 60_000 });
  const sendRepairLogMutation = trpc.repairLog.submit.useMutation();
  const createRepairWorkflowMutation = trpc.repairWorkflow.create.useMutation();
  const transitionRepairWorkflowMutation = trpc.repairWorkflow.transition.useMutation();
  const completeRepairWorkflowMutation = trpc.repairWorkflow.complete.useMutation();
  useEffect(() => {
    if (!mechanicStateQuery.isSuccess) return;
    const remote = parseOperationsSnapshot<Partial<MechanicServerState>>(mechanicStateQuery.data);
    if (Array.isArray(remote?.alerts) || Array.isArray(remote?.repairs)) {
      setLocalState(current => ({ alerts: Array.isArray(remote.alerts) ? remote.alerts as AlertRecord[] : current.alerts, repairs: Array.isArray(remote.repairs) ? remote.repairs as RepairRecord[] : current.repairs }));
      if (Array.isArray(remote.repairPartOptions)) setRepairPartOptions(remote.repairPartOptions);
      if (remote.roundChangeSettings) setRoundChangeSettings(normalizeRoundChangeSettings(remote.roundChangeSettings));
      if (remote.maintenanceResetHours && typeof remote.maintenanceResetHours === "object") setMaintenanceResetHours(remote.maintenanceResetHours);
      if (remote.personalPayoutValues && typeof remote.personalPayoutValues === "object") setPersonalPayoutValues(remote.personalPayoutValues);
      mechanicStateHydrated.current = true;
      return;
    }
    mechanicStateHydrated.current = true;
  }, [mechanicStateQuery.data, mechanicStateQuery.isSuccess]);
  useEffect(() => {
    if (!guideStateQuery.isSuccess) return;
    const remote = parseOperationsSnapshot<{ payoutRoundValues?: PersonalPayoutValues }>(guideStateQuery.data);
    if (remote?.payoutRoundValues && typeof remote.payoutRoundValues === "object") setPersonalPayoutValues(remote.payoutRoundValues);
  }, [guideStateQuery.data, guideStateQuery.isSuccess]);
  useEffect(() => {
    if (isMechanicDemo || fullAppDemo || !repairWorkflowQuery.isSuccess || !repairWorkflowQuery.data?.length) return;
    const stageMap = { waiting_parts_usable: "รออะไหล่ใช้งานได้", waiting_parts_unavailable: "รออะไหล่ห้ามใช้งาน", assessing: "กำลังประเมิน" } as const;
    const nextStages = { ...repairBoardStages };
    const nextDetails = { ...repairBoardOutcomeDetails };
    for (const item of repairWorkflowQuery.data) {
      const boardId = item.sourceRepairReportId ?? item.id;
      if (item.status in stageMap) nextStages[boardId] = stageMap[item.status as keyof typeof stageMap];
      if (item.requestedPart) nextDetails[boardId] = item.requestedPart;
    }
    setRepairBoardStages(nextStages);
    setRepairBoardOutcomeDetails(nextDetails);
  }, [fullAppDemo, isMechanicDemo, repairWorkflowQuery.data, repairWorkflowQuery.isSuccess]);
  useEffect(() => {
    if (!supervisorFleetSnapshotQuery.isSuccess) return;
    const remote = parseOperationsSnapshot<{ vehicleState?: VehicleResponsibilityState; pickupRequests?: VehiclePickupRequest[] }>(supervisorFleetSnapshotQuery.data);
    if (remote?.vehicleState) setVehicleState(current => JSON.stringify(current) === JSON.stringify(remote.vehicleState) ? current : remote.vehicleState as VehicleResponsibilityState);
    if (Array.isArray(remote?.pickupRequests)) {
      const nextRequests = mergeVehiclePickupRequests([], remote.pickupRequests);
      setPickupRequests(current => JSON.stringify(current) === JSON.stringify(nextRequests) ? current : nextRequests);
    }
  }, [supervisorFleetSnapshotQuery.data, supervisorFleetSnapshotQuery.isSuccess]);
  useEffect(() => {
    if (!guideSessionsQuery.isSuccess) return;
    const remote = parseOperationsSnapshot<{ sessions?: unknown[]; messages?: unknown[]; repairReports?: unknown[]; repairBoardStages?: Record<string, string>; repairBoardOutcomeDetails?: Record<string, string>; maintenanceNotifications?: unknown[] }>(guideSessionsQuery.data);
    if (Array.isArray(remote?.sessions)) setGuideSessionsFromServer(remote.sessions as MechanicFollowSession[]);
    if (Array.isArray(remote?.messages)) setGuideMessagesFromServer(remote.messages as ActiveSessionChatMessage[]);
    if (Array.isArray(remote?.repairReports)) setGuideRepairReports(current => mergeGuideRepairReports(current, remote.repairReports as GuideRepairReport[]));
    if (remote?.repairBoardStages && typeof remote.repairBoardStages === "object") setRepairBoardStages(current => ({ ...current, ...(remote.repairBoardStages as Record<string, "กำลังประเมิน" | "รออะไหล่ใช้งานได้" | "รออะไหล่ห้ามใช้งาน">) }));
    if (remote?.repairBoardOutcomeDetails && typeof remote.repairBoardOutcomeDetails === "object") setRepairBoardOutcomeDetails(current => ({ ...current, ...remote.repairBoardOutcomeDetails }));
    if (Array.isArray(remote?.maintenanceNotifications)) setMaintenanceNotifications(remote.maintenanceNotifications as VehicleMaintenanceNotification[]);
  }, [guideSessionsQuery.data, guideSessionsQuery.isSuccess]);
  useEffect(() => {
    if (!guideSessionsQuery.isSuccess) return;
    if (!repairAlertBaselineReady.current) {
      guideRepairReports.forEach(report => repairAlertedReports.current.add(report.id));
      repairAlertBaselineReady.current = true;
      return;
    }
    const newReports = guideRepairReports.filter(report => !repairAlertedReports.current.has(report.id));
    if (!newReports.length) return;
    newReports.forEach(report => repairAlertedReports.current.add(report.id));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([350, 180, 350, 180, 650]);
    playRepairAlertSound();
    showBrowserNotification("มีรายการแจ้งซ่อมรถใหม่", { body: `${newReports.length} รายการใหม่ กรุณาเปิดแท็บแจ้งซ่อมเพื่อตรวจสอบ`, tag: `atv-mechanic-repair-${newReports.map(report => report.id).join("-")}` });
  }, [guideRepairReports, guideSessionsQuery.isSuccess]);
  useEffect(() => {
    setMechanicLoginKey(directoryMeQuery.data?.id ? String(directoryMeQuery.data.id) : "");
  }, [directoryMeQuery.data?.id]);
  useEffect(() => {
    const remote = parseOperationsSnapshot<VehicleFlowSnapshot>(vehicleFlowSnapshotQuery.data);
    if (Array.isArray(remote?.safetyNotices)) setSafetyNotices(remote.safetyNotices);
  }, [vehicleFlowSnapshotQuery.data]);
  useEffect(() => {
    if (!mechanicStateHydrated.current) return;
    saveMechanicStateMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.mechanicState, payload: serializeOperationsSnapshot({ ...localState, repairPartOptions, roundChangeSettings, maintenanceResetHours, personalPayoutValues }) });
  }, [localState, repairPartOptions, roundChangeSettings, maintenanceResetHours, personalPayoutValues]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  // Repair options persist through mechanicState Server snapshot.


  // Personal payout values persist through mechanicState Server snapshot.


  const supervisorUsageHoursByVehicle = useMemo(() => {
    const remote = parseOperationsSnapshot<{ usageHours?: VehicleUsageHours[] }>(supervisorFleetSnapshotQuery.data);
    return new Map((remote?.usageHours ?? []).filter(item => Number.isFinite(Number(item.number)) && Number.isFinite(item.accumulatedHours)).map(item => [Number(item.number), accumulatedHoursForVehicle(remote?.usageHours ?? [], Number(item.number)) ?? item.accumulatedHours]));
  }, [supervisorFleetSnapshotQuery.data]);
  const vehicles = useMemo(() => vehicleState.vehicleGroups.flatMap(group => group.numbers.map(number => ({
    number,
    cc: group.cc.replace("cc", "") as "200" | "250",
    status: getMechanicVehicleStatus(group, number),
    color: getResponsibilityGroupColor(number, vehicleState.responsibilityGroups),
  }))).sort((a, b) => a.number - b.number), [vehicleState]);
  const supervisorStatusModel = useMemo(() => buildSupervisorUserDirectoryStatusModel(buildSupervisorUserDirectoryStatusSource({
    vehicleState,
    guideReports: guideRepairReports.filter(report => !safetyNotices.some(notice => notice.waitingParts && (notice.id === report.id || notice.sourceRepairReportId === report.id))),
    mechanicRepairs: localState.repairs,
    guidanceVehicleNumbers: safetyNotices.filter(notice => !notice.waitingParts).map(notice => notice.vehicleNumber),
    pickupVehicleNumbers: pickupRequests.filter(request => request.status === "รอรับรถ").map(request => request.vehicleNumber),
    activeVehicleNumbers: guideSessionsFromServer.filter(session => session.status === "Active").flatMap(session => (session.vehicleIds ?? []).map(id => Number(String(id).replace(/^m3-v/, "")))),
  })), [vehicleState, guideRepairReports, localState.repairs, pickupRequests, safetyNotices, guideSessionsFromServer]);
  const vehicleResponsibilityMeta = (vehicleNumber: number) => resolveVehicleResponsibilityView(vehicleNumber, vehicleState.responsibilityGroups, directoryUsers);
  const managerName = (vehicleNumber: number) => formatVehicleManagerNames(vehicleNumber, vehicleState.responsibilityGroups, directoryUsers);
  const managerRecipients = (vehicleNumber: number, state: VehicleResponsibilityState = vehicleState) => recipientsForVehicleGroup(vehicleNumber, state.responsibilityGroups, directoryUsers);
  const editingRepairVehicleNumber = editingRepairId ? localState.repairs.find(repair => repair.id === editingRepairId)?.vehicleNumber : undefined;
  const repairCandidates = vehicles.filter(vehicle => isSelectableForNewRepair(vehicle, new Set(), editingRepairVehicleNumber));
  const guideRepairRows = guideRepairReports.filter(report => isGuideRepairReportPending(report, localState.repairs) || repairBoardStages[report.id] === "รออะไหล่ใช้งานได้" || repairBoardStages[report.id] === "รออะไหล่ห้ามใช้งาน").map(report => {
    const vehicleNumber = extractGuideVehicleNumber(report.vehicleId) ?? 0;
    const vehicle = vehicles.find(item => item.number === vehicleNumber);
    return { ...report, vehicleNumber, cc: vehicle?.cc ?? "", manager: managerName(vehicleNumber) };
  });
  const repairBoardColumns = [
    {
      id: "reported",
      title: "รายการแจ้ง",
      tone: "reported",
      cards: [],
    },
    {
      id: "assessing",
      title: "กำลังประเมิน",
      tone: "assessing",
      cards: [...guideRepairRows.filter(report => repairBoardStages[report.id] !== "รออะไหล่ใช้งานได้" && repairBoardStages[report.id] !== "รออะไหล่ห้ามใช้งาน").map(report => ({ id: report.id, vehicleNumber: report.vehicleNumber, title: `รถ #${report.vehicleNumber}`, detail: report.description, meta: `${report.reporter} · ${formatThaiDate(report.createdAt)}`, kind: "report" as const, report })), ...localState.repairs.filter(repair => repair.status === "กำลังซ่อม" && !repair.parts.trim()).map(repair => ({ id: repair.id, vehicleNumber: repair.vehicleNumber, title: `รถ #${repair.vehicleNumber}`, detail: repair.symptom, meta: `${repair.technician} · ${formatThaiDate(repair.updatedAt)}`, kind: "repair" as const, repair }))],
    },
    {
      id: "waiting-unavailable",
      title: "รออะไหล่ห้ามใช้งาน",
      tone: "unavailable",
      cards: [...guideRepairRows.filter(report => repairBoardStages[report.id] === "รออะไหล่ห้ามใช้งาน").map(report => ({ id: report.id, vehicleNumber: report.vehicleNumber, title: `รถ #${report.vehicleNumber}`, detail: repairBoardOutcomeDetails[report.id] || report.description, meta: `${report.reporter} · ${formatThaiDate(report.createdAt)}`, kind: "report" as const, report })), ...localState.repairs.filter(repair => repair.status === "กำลังซ่อม" && Boolean(repair.parts.trim())).map(repair => ({ id: repair.id, vehicleNumber: repair.vehicleNumber, title: `รถ #${repair.vehicleNumber}`, detail: repair.parts, meta: `${repair.technician} · ${formatThaiDate(repair.updatedAt)}`, kind: "repair" as const, repair }))],
    },
    {
      id: "waiting-available",
      title: "รออะไหล่ใช้งานได้",
      tone: "available",
      cards: [...guideRepairRows.filter(report => repairBoardStages[report.id] === "รออะไหล่ใช้งานได้").map(report => ({ id: report.id, vehicleNumber: report.vehicleNumber, title: `รถ #${report.vehicleNumber}`, detail: repairBoardOutcomeDetails[report.id] || report.description, meta: `${report.reporter} · ${formatThaiDate(report.createdAt)}`, kind: "report" as const, report })), ...localState.repairs.filter(repair => repair.status === "แจ้งรับรถ").map(repair => ({ id: repair.id, vehicleNumber: repair.vehicleNumber, title: `รถ #${repair.vehicleNumber}`, detail: repair.parts.trim() || repair.symptom, meta: `${repair.technician} · ${formatThaiDate(repair.updatedAt)}`, kind: "repair" as const, repair }))],
    },
  ];
  const alertRecords: AlertRecord[] = safetyNotices.map(notice => ({ ...notice }));
  const editingAlert = editingAlertId ? localState.alerts.find(alert => alert.id === editingAlertId) : undefined;
  const showWaitingPartsColumns = Boolean(repairBoardPendingAlertId) || alertRecords.some(alert => alert.source === "waiting-available") || editingAlert?.source === "waiting-available";
  const showWaitingPartsEntryColumns = Boolean(repairBoardPendingAlertId) || editingAlert?.source === "waiting-available";
  const visibleRepairLogs = filterActiveMechanicRepairs(localState.repairs);
  const repairLogRecords = getMechanicRepairLog(localState.repairs);
  const sheetRows = [
    ...localState.repairs.map(repair => ({ id: repair.id, kind: "repair" as const, vehicleNumber: repair.vehicleNumber, description: repair.symptom, reporter: repair.technician, createdAt: repair.updatedAt, status: repair.status, totalHours: formatElapsedHours(repair.createdAt, repair.updatedAt) })),
    ...localState.alerts.filter(alert => !localState.repairs.some(repair => repair.vehicleNumber === alert.vehicleNumber)).map(alert => ({ id: alert.id, kind: "alert" as const, vehicleNumber: alert.vehicleNumber, description: alert.description, reporter: alert.reporter, createdAt: alert.createdAt, status: "เตือนระวัง", totalHours: formatElapsedHours(alert.createdAt) })),
  ];
  const currentRoundTableUser = findMechanicRoundTableUser(directoryUsers, mechanicLoginKey);
  const currentMechanicActor = { id: directoryMeQuery.data?.id ? String(directoryMeQuery.data.id) : undefined, name: directoryMeQuery.data?.name ?? currentRoundTableUser?.name ?? "ช่าง" };
  const roundAnchorDate = new Date();
  const roundPageMonth = new Date(roundAnchorDate.getFullYear(), roundAnchorDate.getMonth() + Math.floor(roundPageOffset / 2), 1);
  const roundPageHalf: 1 | 2 = ((roundPageOffset % 2) + 2) % 2 === 0 ? 1 : 2;
  const roundDaysInMonth = new Date(roundPageMonth.getFullYear(), roundPageMonth.getMonth() + 1, 0).getDate();
  const roundPageLabel = roundPageHalf === 1 ? "วันที่ 1–15" : `วันที่ 16–${roundDaysInMonth}`;
  const guideSessions = useMemo(() => guideSessionsFromServer, [guideSessionsFromServer]);
  const mechanicFollowSession = useMemo(() => {
    const userId = currentRoundTableUser ? String(currentRoundTableUser.id) : "";
    if (!userId) return undefined;
    return guideSessions.find(session => session.status === "Active" && (String(session.activeUserId ?? "") === userId || (session.memberIds ?? []).map(String).includes(userId)));
  }, [currentRoundTableUser, guideSessions]);
  const selectedMechanicFollowSession = guideSessions.find(session => session.sessionId === selectedMechanicFollowSessionId);
  const mechanicCanManageSelected = canMechanicManageSession(directoryMeQuery.data ? { memberId: directoryMeQuery.data.id, group: directoryMeQuery.data.group, special: false } : undefined, selectedMechanicFollowSession?.memberIds ?? []);
  const selectedMechanicMemberNames = mechanicSessionMemberNames(selectedMechanicFollowSession?.memberIds ?? [], directoryUsers);
  const mechanicDetailTiming = selectedMechanicFollowSession?.status === "Active" ? sessionTiming(selectedMechanicFollowSession.startedAt, selectedMechanicFollowSession.durationMinutes ?? 30, now) : undefined;
  useEffect(() => {
    if (selectedMechanicFollowSession?.status !== "Active" || !selectedMechanicFollowSession.startedAt || selectedMechanicFollowSession.overtimeAcknowledged || !mechanicCanManageSelected || !mechanicDetailTiming || mechanicDetailTiming.overtimeSeconds <= 0) return;
    setMechanicCompletionPrompt(current => isActiveCompletionPromptFor(current, selectedMechanicFollowSession.sessionId) ? current : createActiveCompletionPrompt(selectedMechanicFollowSession.sessionId, "expired"));
  }, [selectedMechanicFollowSession?.sessionId, selectedMechanicFollowSession?.status, selectedMechanicFollowSession?.startedAt, selectedMechanicFollowSession?.overtimeAcknowledged, mechanicCanManageSelected, mechanicDetailTiming?.overtimeSeconds]);
  const patchSelectedMechanicSession = (patch: Record<string, unknown>) => {
    if (!selectedMechanicFollowSession) return;
    const currentSessions = guideSessionsFromServer as Array<MechanicFollowSession & { sessionId: string }>;
    const nextSessions = patchSharedSession(currentSessions as Array<Record<string, unknown> & { sessionId: string; status: "Active" | "Standby" | "Completed" }>, selectedMechanicFollowSession.sessionId, patch as Partial<Record<string, unknown> & { sessionId: string; status: "Active" | "Standby" | "Completed" }>);
    if (!nextSessions) return;
    const typedSessions = nextSessions as MechanicFollowSession[];
    setGuideSessionsFromServer(typedSessions);
    saveGuideSessionsMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, payload: serializeOperationsSnapshot({ sessions: typedSessions, messages: guideMessagesFromServer, repairReports: guideRepairReports }) });
  };
  const requestCompleteSelectedMechanicSession = () => { if (!selectedMechanicFollowSession || !mechanicCanManageSelected) return; setMechanicCompletionPrompt(createActiveCompletionPrompt(selectedMechanicFollowSession.sessionId)); };
  const keepSelectedMechanicSessionOpenAfterExpiry = () => { if (!selectedMechanicFollowSession || !mechanicCanManageSelected || !isActiveCompletionPromptFor(mechanicCompletionPrompt, selectedMechanicFollowSession.sessionId)) return; patchSelectedMechanicSession({ overtimeAcknowledged: true }); setMechanicCompletionPrompt(null); };
  const completeSelectedMechanicSession = () => {
    if (!selectedMechanicFollowSession || !mechanicCanManageSelected || !isActiveCompletionPromptFor(mechanicCompletionPrompt, selectedMechanicFollowSession.sessionId)) return;
    const completedAt = new Date().toISOString();
    const completionTiming = sessionCompletionTiming(selectedMechanicFollowSession.startedAt, completedAt, selectedMechanicFollowSession.durationMinutes ?? 30);
    const activity = createSessionActivity({ actorId: currentMechanicActor.id, actorName: currentMechanicActor.name, action: "จบงาน → Completed", detail: `${completionTimingDetail(completionTiming)} · ใช้เวลาจริง ${formatCompletionDifference(completionTiming.actualSeconds)}`, createdAt: completedAt });
    patchSelectedMechanicSession({ status: "Completed", completedAt, completedById: currentMechanicActor.id, completedByName: currentMechanicActor.name, completionTiming, overtimeAcknowledged: true, activityLog: appendSessionActivity(selectedMechanicFollowSession.activityLog, activity) });
    syncTrackedVehicleStatuses(localState, selectedMechanicFollowSession.vehicleIds?.map(id => Number(id.replace(/^m3-v/, ""))).filter(Number.isFinite) ?? []);
    setMechanicCompletionPrompt(null);
    setSelectedMechanicFollowSessionId(undefined);
    setMechanicDetailAction(null);
  };
  const addMechanicMember = (memberId: string) => { if (!selectedMechanicFollowSession) return; patchSelectedMechanicSession({ memberIds: Array.from(new Set([...(selectedMechanicFollowSession.memberIds ?? []), memberId])) }); setMechanicDetailAction(null); };
  const addMechanicVehicle = (vehicleId: string) => { if (!selectedMechanicFollowSession || !mechanicReplacementNumbers.has(Number(vehicleId.replace(/^m3-v/, "")))) return; patchSelectedMechanicSession({ vehicleIds: Array.from(new Set([...(selectedMechanicFollowSession.vehicleIds ?? []), vehicleId])) }); setMechanicDetailAction(null); };
  const removeMechanicVehicle = (vehicleId: string) => { if (!selectedMechanicFollowSession || (selectedMechanicFollowSession.vehicleIds ?? []).length <= 1) return; patchSelectedMechanicSession({ vehicleIds: (selectedMechanicFollowSession.vehicleIds ?? []).filter(id => id !== vehicleId) }); setMechanicDetailAction(null); };
  const replaceMechanicVehicle = (vehicleId: string, fromId = selectedMechanicFollowSession?.vehicleIds?.[0]) => { if (!selectedMechanicFollowSession || !fromId || !(selectedMechanicFollowSession.vehicleIds ?? []).length || !mechanicReplacementNumbers.has(Number(vehicleId.replace(/^m3-v/, "")))) return; patchSelectedMechanicSession({ vehicleIds: (selectedMechanicFollowSession.vehicleIds ?? []).map(id => id === fromId ? vehicleId : id) }); setMechanicReplaceFromId(""); setMechanicReplaceToId(""); setMechanicDetailAction(null); };
  const sendMechanicDetailMessage = () => { if (!selectedMechanicFollowSession || !mechanicDetailChatText.trim()) return; const nextMessage: ActiveSessionChatMessage = { id: `mechanic-${Date.now()}`, sessionId: selectedMechanicFollowSession.sessionId, sender: currentMechanicActor.name, text: mechanicDetailChatText.trim(), createdAt: new Date().toISOString() }; setGuideMessagesFromServer(current => [...current, nextMessage]); appendGuideMessageMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, field: "messages", item: JSON.stringify(nextMessage), maxItems: 500 }); setMechanicDetailChatText(""); };
  const openSafetyNotices = (notices: VehicleSafetyNotice[]) => setSelectedSafetyNotices(notices);
  const safetyNoticeDialog = <VehicleSafetyNoticeDialog notices={selectedSafetyNotices} onClose={() => setSelectedSafetyNotices([])} />;
  const mechanicFollowPopup = <MechanicSessionFollowPopup session={mechanicFollowSession} now={now} onOpen={() => { if (mechanicFollowSession) window.location.href = mechanicSessionHref(mechanicFollowSession.sessionId); }} />;
  const mechanicVehicleKey = (vehicle: { number: number }) => `m3-v${vehicle.number}`;
  const mechanicCurrentVehicleIds = new Set(selectedMechanicFollowSession?.vehicleIds ?? []);
  const mechanicReplacementNumbers = availableReplacementVehicleNumbers(vehicles, guideSessions, selectedMechanicFollowSession?.sessionId);
  const mechanicCurrentVehicleItems: VehicleChoiceItem[] = vehicles.filter(vehicle => mechanicCurrentVehicleIds.has(mechanicVehicleKey(vehicle))).map(vehicle => ({ id: mechanicVehicleKey(vehicle), number: vehicle.number, cc: vehicle.cc, statusLabel: "อยู่ใน Active", accentColor: getResponsibilityGroupColor(vehicle.number, vehicleState.responsibilityGroups), fallbackGroupLabel: vehicleResponsibilityMeta(vehicle.number).groupLabel, fallbackManagers: managerName(vehicle.number).split(" · "), disabled: Boolean(selectedMechanicFollowSession && (selectedMechanicFollowSession.vehicleIds ?? []).length <= 1), disabledReason: "ต้องเหลือรถใน Active อย่างน้อย 1 คัน", safetyNotices }));
  const mechanicReplacementVehicleItems: VehicleChoiceItem[] = vehicles.filter(vehicle => !mechanicCurrentVehicleIds.has(mechanicVehicleKey(vehicle)) && mechanicReplacementNumbers.has(vehicle.number)).map(vehicle => ({ id: mechanicVehicleKey(vehicle), number: vehicle.number, cc: vehicle.cc, statusLabel: "พร้อมใช้", accentColor: getResponsibilityGroupColor(vehicle.number, vehicleState.responsibilityGroups), fallbackGroupLabel: vehicleResponsibilityMeta(vehicle.number).groupLabel, fallbackManagers: managerName(vehicle.number).split(" · "), safetyNotices }));
  const mechanicSessionMessages: ActiveSessionChatMessage[] = selectedMechanicFollowSession ? guideMessagesFromServer.filter(message => message.sessionId === selectedMechanicFollowSession.sessionId) : [];
  const mechanicActiveDetail = selectedMechanicFollowSession ? <section className="m3-panel supervisor-session-detail mechanic-active-detail" aria-labelledby="mechanic-active-detail-title">
    <div className="m3-panel-title"><div><p>ACTIVE SESSION / MECHANIC VIEW</p><h2 id="mechanic-active-detail-title">กำลังปฏิบัติงาน</h2><small>{selectedMechanicFollowSession.sessionId} · กำลังทำงาน</small></div><button type="button" className="m3-icon-button" onClick={() => { setSelectedMechanicFollowSessionId(undefined); setMechanicDetailAction(null); setMechanicCompletionPrompt(null); }} aria-label="กลับหน้าแรกช่าง"><ArrowLeft size={18} /></button></div>
    {mechanicDetailTiming && <div className={`m3-timer ${mechanicDetailTiming.overtimeSeconds > 0 ? "m3-timer-overtime" : ""}`}><strong>{mechanicDetailTiming.overtimeSeconds > 0 ? `+${formatSessionCountdown(mechanicDetailTiming.overtimeSeconds)}` : formatSessionCountdown(mechanicDetailTiming.remainingSeconds)}</strong><span>{mechanicDetailTiming.overtimeSeconds > 0 ? "เกินเวลา · รอยืนยันการจบงาน" : `เหลือเวลา · โปรแกรม ${selectedMechanicFollowSession.durationMinutes ?? 30} นาที`}</span></div>}
    <div className="supervisor-session-summary"><div><span>ผู้ทำรายการ</span><strong>{selectedMechanicFollowSession.activeUserName || "ไม่ระบุ"}</strong></div><div><span>สมาชิก</span><strong>{selectedMechanicMemberNames.join(" · ") || "ยังไม่มีชื่อใน user directory"}</strong></div><div><span>รถในรายการ</span><ActiveVehicleDetailList sessionId={selectedMechanicFollowSession.sessionId} vehicles={(selectedMechanicFollowSession.vehicleIds ?? []).map(id => { const vehicle = vehicles.find(item => mechanicVehicleKey(item) === id); return { id, number: vehicle?.number ?? Number(id.replace(/^m3-v/, "")), cc: `${vehicle?.cc ?? "—"}cc`, managers: vehicle ? resolveVehicleManagerNames(vehicle.number, vehicleState.responsibilityGroups, directoryUsers) : [], accentColor: vehicle?.color }; })} activeStaff={selectedMechanicMemberNames} activeRoles={(selectedMechanicFollowSession.memberIds ?? []).map(id => directoryUsers.find(user => String(user.id) === String(id))?.group ?? "ผู้ใช้งาน")} safetyNotices={safetyNotices} onSafetyNoticeOpen={openSafetyNotices} responsibilityGroups={vehicleState.responsibilityGroups} managerDirectory={directoryUsers} /></div><div><span>โปรแกรม</span><strong>{selectedMechanicFollowSession.durationMinutes ?? 30} นาที · R {selectedMechanicFollowSession.riderCount ?? 0} · P {selectedMechanicFollowSession.passengerCount ?? 0}</strong></div>{selectedMechanicFollowSession.completedByName && <div><span>ผู้จบรายการ</span><strong>{selectedMechanicFollowSession.completedByName}</strong></div>}</div>
    {mechanicCanManageSelected ? <div className="supervisor-session-actions"><button type="button" className="m3-secondary" onClick={() => setMechanicDetailAction("members")}><Plus size={15} /> เพิ่มสมาชิก</button><button type="button" className="m3-secondary" onClick={() => setMechanicDetailAction("addVehicle")}><Plus size={15} /> เพิ่มรถ</button><button type="button" className="m3-secondary" onClick={() => { const currentId = selectedMechanicFollowSession?.vehicleIds?.[0] ?? ""; const replacementId = vehicles.find(vehicle => mechanicReplacementNumbers.has(vehicle.number)); setMechanicReplaceFromId(currentId); setMechanicReplaceToId(replacementId ? mechanicVehicleKey(replacementId) : ""); setMechanicDetailAction("replaceVehicle"); }}><RotateCcw size={15} /> เปลี่ยนรถ</button><button type="button" className="m3-secondary" onClick={() => setMechanicDetailAction("removeVehicle")}><Trash2 size={15} /> เอารถออก</button><button type="button" className="m3-primary" onClick={requestCompleteSelectedMechanicSession}><Check size={15} /> จบ/คืนรถ</button></div> : <p className="m3-readonly-notice">คุณดูรายละเอียดรายการนี้ได้ แต่ไม่มีสิทธิ์จัดการ เนื่องจากไม่มีชื่ออยู่ใน Active</p>}
    {mechanicDetailAction === "members" && <div className="m3-modal-list">{directoryUsers.filter(user => !(selectedMechanicFollowSession.memberIds ?? []).map(String).includes(String(user.id))).map(user => <button type="button" key={user.id} onClick={() => addMechanicMember(String(user.id))}><b>{user.name}</b><small>{user.group ?? "ผู้ใช้งาน"}</small></button>)}</div>}
    {mechanicDetailAction === "replaceVehicle" ? <VehicleReplacementPanel currentItems={mechanicCurrentVehicleItems} replacementItems={mechanicReplacementVehicleItems} selectedFromId={mechanicReplaceFromId} selectedToId={mechanicReplaceToId} onFromSelect={setMechanicReplaceFromId} onToSelect={setMechanicReplaceToId} onConfirm={() => replaceMechanicVehicle(mechanicReplaceToId, mechanicReplaceFromId)} responsibilityGroups={vehicleState.responsibilityGroups} managerDirectory={directoryUsers} onSafetyNoticeOpen={openSafetyNotices} confirmDisabled={!mechanicReplaceFromId || !mechanicReplaceToId} /> : mechanicDetailAction && mechanicDetailAction !== "members" && <VehicleChoiceList items={(mechanicDetailAction === "removeVehicle" ? mechanicCurrentVehicleItems : mechanicReplacementVehicleItems)} responsibilityGroups={vehicleState.responsibilityGroups} managerDirectory={directoryUsers} onSafetyNoticeOpen={openSafetyNotices} onSelect={vehicleId => mechanicDetailAction === "removeVehicle" ? removeMechanicVehicle(vehicleId) : addMechanicVehicle(vehicleId)} ariaLabel={mechanicDetailAction === "removeVehicle" ? "เลือกรถที่จะนำออกจาก Active" : "เลือกรถเพื่อเพิ่มเข้า Active"} actionLabel={mechanicDetailAction === "removeVehicle" ? "เอาออก" : "เพิ่มรถ"} emptyLabel={mechanicDetailAction === "removeVehicle" ? "ไม่มีรถใน Active" : "ไม่มีรถพร้อมใช้ให้เลือก"} />}
    {mechanicCompletionPrompt && isActiveCompletionPromptFor(mechanicCompletionPrompt, selectedMechanicFollowSession.sessionId) && (() => { const copy = activeCompletionCopy(mechanicCompletionPrompt.kind); return <div className="m3-modal-backdrop" role="presentation"><div className="m3-modal m3-completion-modal" role="dialog" aria-modal="true" aria-labelledby="mechanic-completion-title"><div className="m3-modal-head"><div><p>{copy.eyebrow}</p><h3 id="mechanic-completion-title">{copy.title}</h3></div><button type="button" onClick={() => mechanicCompletionPrompt.kind === "expired" ? keepSelectedMechanicSessionOpenAfterExpiry() : setMechanicCompletionPrompt(null)} aria-label="ปิดหน้าต่างยืนยัน">×</button></div><p className="m3-modal-message">{copy.message}</p><div className="m3-modal-actions"><button type="button" className="m3-secondary" onClick={() => mechanicCompletionPrompt.kind === "expired" ? keepSelectedMechanicSessionOpenAfterExpiry() : setMechanicCompletionPrompt(null)}>{copy.secondary}</button><button type="button" className="m3-primary" onClick={completeSelectedMechanicSession}><Check size={15} /> ยืนยัน</button></div></div></div>; })()}
    <ServerActiveSessionChat sessionId={selectedMechanicFollowSession.sessionId} module="mechanic" canSend={mechanicCanManageSelected} />
    <div className="supervisor-session-actions"><button type="button" className="m3-back-home" onClick={() => { setSelectedMechanicFollowSessionId(undefined); setMechanicDetailAction(null); }}><ArrowLeft size={16} /> กลับหน้าแรกช่าง</button></div>
  </section> : null;
  const personalRoundUserId = currentRoundTableUser ? String(currentRoundTableUser.id) : "";
  const personalRoundValues: PersonalPayoutValues = currentRoundTableUser ? { [personalRoundUserId]: personalPayoutValues[personalRoundUserId] ?? {} } : {};
  const personalRoundRows = currentRoundTableUser ? buildPersonalPayoutRows({ year: roundPageMonth.getFullYear(), month: roundPageMonth.getMonth(), half: roundPageHalf, userId: personalRoundUserId, sessions: guideSessions, values: personalRoundValues }) : [];
  const vehicleUsageHours = useMemo(() => summarizeVehicleUsageHours(
    guideSessions,
    vehicles.map(vehicle => ({ id: `m3-v${vehicle.number}`, number: String(vehicle.number), cc: vehicle.cc as "200" | "250" })),
  ), [guideSessions, vehicles]);
  const activeMaintenanceRule = roundChangeSettings.rules.find(rule => rule.id === maintenanceViewRuleId) ?? roundChangeSettings.rules[0];
  const canCreateMaintenanceRule = newMaintenanceName.trim().length > 0 && (Number(newMaintenanceThresholds["200"]) > 0 || Number(newMaintenanceThresholds["250"]) > 0);
  const maintenanceUsageHoursForRule = (rule: MaintenanceRule) => vehicleUsageHours.map(vehicle => ({
    ...vehicle,
    accumulatedHours: Math.max(0, Math.round((vehicle.accumulatedHours - (maintenanceResetHours[`${rule.id}:${vehicle.number}`] ?? 0)) * 10) / 10),
  }));
  const maintenanceUsageHours = useMemo(() => activeMaintenanceRule ? maintenanceUsageHoursForRule(activeMaintenanceRule) : vehicleUsageHours, [activeMaintenanceRule, maintenanceResetHours, vehicleUsageHours]);
  const maintenanceAlerts = useMemo(() => roundChangeSettings.rules.flatMap(rule => evaluateMaintenanceAlerts({ rules: [rule] }, maintenanceUsageHoursForRule(rule))), [maintenanceResetHours, roundChangeSettings, vehicleUsageHours]);
  const maintenanceTableGroups = useMemo(() => vehicleState.vehicleGroups.map(group => ({
    cc: group.cc.replace("cc", "") as VehicleCc,
    label: group.label,
    rows: group.numbers.map(number => {
      const usage = maintenanceUsageHours.find(item => item.number === String(number));
      const thresholdHours = activeMaintenanceRule?.thresholdHours[group.cc.replace("cc", "") as VehicleCc] ?? 0;
      const accumulatedHours = usage?.accumulatedHours ?? 0;
      const progress = thresholdHours > 0 ? Math.min(100, (accumulatedHours / thresholdHours) * 100) : 0;
      return { number, status: getMechanicVehicleStatus(group, number), accumulatedHours, thresholdHours, progress, level: getMaintenanceMeterLevel(progress) };
    }),
  })), [activeMaintenanceRule, maintenanceUsageHours, vehicleState]);
  const dueMaintenanceAlerts = maintenanceAlerts.filter(alert => alert.due);
  useEffect(() => {
    if (!mechanicStateQuery.isSuccess || !supervisorFleetSnapshotQuery.isSuccess) return;
    const dueKeys = new Set(dueMaintenanceAlerts.map(alert => `${alert.ruleId}:${alert.vehicleNumber}`));
    maintenanceAlertedKeys.current.forEach(key => {
      if (!dueKeys.has(key)) maintenanceAlertedKeys.current.delete(key);
    });
    if (!maintenanceAlertBaselineReady.current) {
      const baselineTimer = window.setTimeout(() => {
        dueKeys.forEach(key => maintenanceAlertedKeys.current.add(key));
        maintenanceAlertBaselineReady.current = true;
      }, 1000);
      return () => window.clearTimeout(baselineTimer);
    }
    const newDueAlerts = dueMaintenanceAlerts.filter(alert => !maintenanceAlertedKeys.current.has(`${alert.ruleId}:${alert.vehicleNumber}`));
    if (!newDueAlerts.length) return;
    newDueAlerts.forEach(alert => maintenanceAlertedKeys.current.add(`${alert.ruleId}:${alert.vehicleNumber}`));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([400, 200, 400, 200, 700]);
    playRepairAlertSound();
    showBrowserNotification("รถถึงรอบเปลี่ยนแล้ว", { body: `${newDueAlerts.length} รายการถึงรอบเปลี่ยน กรุณาเปิดหน้าตั้งค่ารอบเปลี่ยนเพื่อตรวจสอบ`, tag: `atv-maintenance-due-${newDueAlerts.map(alert => `${alert.ruleId}-${alert.vehicleNumber}`).join("-")}` });
  }, [dueMaintenanceAlerts, mechanicStateQuery.isSuccess, supervisorFleetSnapshotQuery.isSuccess]);
  const totalFleetVehicles = maintenanceTableGroups.reduce((sum, group) => sum + group.rows.length, 0);
  const dueFleetVehicles = maintenanceTableGroups.reduce((sum, group) => sum + group.rows.filter(row => Boolean(activeMaintenanceRule?.enabled && row.thresholdHours > 0 && row.accumulatedHours >= row.thresholdHours)).length, 0);
  const maintenanceVehicleGroups = maintenanceTableGroups.map(group => <section className="mechanic-vehicle-group" key={`alert-${group.cc}`} aria-labelledby={`alert-vehicle-group-${group.cc}`}><header><div><span>VEHICLE GROUP</span><h4 id={`alert-vehicle-group-${group.cc}`}>{group.label}</h4></div><b>{group.rows.length} คัน</b></header><div className="mechanic-vehicle-table-wrap"><table className="mechanic-vehicle-table"><thead><tr><th>เบอร์รถ</th><th>แถบสะสม</th><th>สะสม / ตั้ง</th><th>เคลียร์</th></tr></thead><tbody>{group.rows.map(row => { const isDue = Boolean(activeMaintenanceRule?.enabled && row.thresholdHours > 0 && row.accumulatedHours >= row.thresholdHours); const maintenanceAlert = maintenanceAlerts.find(item => item.ruleId === activeMaintenanceRule?.id && Number(item.vehicleNumber) === Number(row.number)); const maintenanceNotificationSent = hasVehicleMaintenanceNotification(maintenanceNotifications, activeMaintenanceRule?.id, Number(row.number)); return <tr key={`${group.cc}-${row.number}`} className={`mechanic-vehicle-alert-row ${row.level}`}><th scope="row"><span className="supervisor-status-vehicle-number"><b>#{row.number}</b><VehicleSafetyNoticeIndicator notices={safetyNotices} vehicleNumber={Number(row.number)} accentColor={getResponsibilityGroupColor(Number(row.number), vehicleState.responsibilityGroups)} onOpen={openSafetyNotices} /><small>{vehicleResponsibilityMeta(Number(row.number)).groupLabel} · {vehicleResponsibilityMeta(Number(row.number)).managerLabel}</small></span></th><td><div className={`mechanic-usage-meter ${row.level}`} aria-label={`รถหมายเลข ${row.number} ใช้ไป ${row.accumulatedHours.toFixed(1)} ชั่วโมง คิดเป็น ${row.progress.toFixed(0)} เปอร์เซ็นต์ของเกณฑ์`}><span style={{ width: `${row.progress}%` }} /></div></td><td><strong>{row.accumulatedHours.toFixed(1)}</strong><span> / {row.thresholdHours > 0 ? `${row.thresholdHours.toFixed(1)}` : "—"}</span><em className={`mechanic-ledger-alert ${isDue ? "due" : "normal"}`}>{isDue ? "ถึงรอบ" : "ปกติ"}</em></td><td><div className="mechanic-vehicle-row-actions"><button type="button" className="mechanic-clear-hours" onClick={() => clearMaintenanceVehicleHours(row.number)} disabled={!activeMaintenanceRule || row.accumulatedHours <= 0}>เคลียร์ชั่วโมง</button><button type="button" className={`mechanic-notify-guide ${maintenanceNotificationSent ? "is-sent" : ""}`} onClick={() => { if (maintenanceAlert && !maintenanceNotificationSent) notifyGuideForMaintenance(maintenanceAlert); }} disabled={maintenanceNotificationSent || !activeMaintenanceRule || !maintenanceAlert} title={maintenanceNotificationSent ? "ส่งแจ้งให้ไกด์แล้ว" : "ส่งแจ้งให้ไกด์นำรถมาเพื่อเปลี่ยนตามรายการ"}>{maintenanceNotificationSent ? "ส่งแจ้งแล้ว" : "ส่งแจ้งไกด์"}</button></div></td></tr>; })}</tbody></table></div></section>);
  const personalRoundTotals = PAYOUT_ROUND_COLUMNS.map((_, index) => personalRoundRows.reduce((sum, row) => sum + row.rounds[index], 0));
  const personalDriveHours = personalRoundRows.reduce((sum, row) => sum + row.driveHours, 0);
  const personalTotalRounds = personalRoundRows.reduce((sum, row) => sum + row.totalRounds, 0);
  const personalTotalPayout = personalDriveHours * 100;
  const updatePersonalRound = (key: string, minutes: 30 | 60, value: string) => {
    if (!currentRoundTableUser) return;
    const nextValues = updatePersonalPayoutValue(personalPayoutValues, String(currentRoundTableUser.id), key, minutes, normalizePayoutValue(value), guideSessions);
    setPersonalPayoutValues(nextValues);
    saveGuideStateMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideState, payload: serializeOperationsSnapshot({ payoutRoundValues: nextValues }) });
  };
  const goToCurrentRoundPage = () => setRoundPageOffset(payoutPageOffsetForDate(roundAnchorDate));
  const moveRoundPage = (direction: -1 | 1) => setRoundPageOffset(index => index + direction);
  const isCurrentRoundDate = (date: Date) => date.getFullYear() === roundAnchorDate.getFullYear() && date.getMonth() === roundAnchorDate.getMonth() && date.getDate() === roundAnchorDate.getDate();

  const syncTrackedVehicleStatuses = (nextLocalState: MechanicLocalState, numbers: number[]) => {
    const latestVehicleState = parseOperationsSnapshot<{ vehicleState?: VehicleResponsibilityState }>(supervisorFleetSnapshotQuery.data)?.vehicleState ?? vehicleState;
    const nextVehicleState = Array.from(new Set(numbers)).reduce((current, number) => {
      const status = resolveMechanicRecordVehicleStatus(number, nextLocalState.alerts, nextLocalState.repairs);
      const patch = applyMechanicVehicleStatus(current, [number], status);
      return { version: current.version, updatedAt: Date.now(), ...patch };
    }, latestVehicleState);
    setVehicleState(nextVehicleState);
    saveSupervisorFleetSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.fleet, payload: serializeOperationsSnapshot({ vehicleState: nextVehicleState }) });
  };

  const resetAlertForm = () => { setAlertVehicle(""); setAlertDescription(""); setAlertWaitingParts(false); setAlertWaitingPartDetail(""); setEditingAlertId(undefined); };
  const saveAlert = () => {
    const vehicleNumber = Number(alertVehicle);
    if (!vehicleNumber || !alertDescription.trim()) return;
    const now = new Date().toISOString();
    const existing = localState.alerts.find(alert => alert.id === editingAlertId);
    const fromWaitingAvailable = Boolean(repairBoardPendingAlertId);
    const isWaitingPartsRecord = fromWaitingAvailable || existing?.source === "waiting-available";
    const notice: VehicleSafetyNotice = {
      id: existing?.id ?? (fromWaitingAvailable ? repairBoardPendingAlertId! : `${"AL"}-${Date.now()}`),
      source: existing?.source ?? (fromWaitingAvailable ? "waiting-available" : "manual"),
      sourceRepairReportId: existing?.sourceRepairReportId ?? repairBoardPendingAlertId,
      vehicleNumber,
      description: alertDescription.trim(),
      severity: "ปกติ",
      reporter: currentMechanicActor.name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      waitingParts: isWaitingPartsRecord ? true : undefined,
      waitingPartDetail: isWaitingPartsRecord ? (alertWaitingPartDetail.trim() || undefined) : undefined,
    };
    const nextNotices = upsertVehicleSafetyNotice(safetyNotices, notice);
    setSafetyNotices(nextNotices);
    if (!isMechanicDemo && !editingAlertId) void createRepairWorkflowMutation.mutateAsync({ id: notice.id, source: fromWaitingAvailable ? "waiting-parts-usable" : "manual-alert", sourceRepairReportId: repairBoardPendingAlertId, vehicleNumber, description: notice.description, reporter: notice.reporter, requestedPart: notice.waitingPartDetail, status: fromWaitingAvailable ? "waiting_parts_usable" : "reported" }).catch(() => undefined);
    saveVehicleFlowSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.vehicleFlow, payload: serializeOperationsSnapshot({ safetyNotices: nextNotices }) });
    const nextLocalState: MechanicLocalState = {
      ...localState,
      alerts: editingAlertId
          ? localState.alerts.map(alert => alert.id === editingAlertId ? { ...alert, vehicleNumber, description: alertDescription.trim(), reporter: currentMechanicActor.name, source: notice.source, sourceRepairReportId: notice.sourceRepairReportId, waitingParts: notice.waitingParts, waitingPartDetail: notice.waitingPartDetail } : alert)
        : [{ id: notice.id, vehicleNumber, description: alertDescription.trim(), severity: "ปกติ", reporter: currentMechanicActor.name, createdAt: now, source: notice.source, sourceRepairReportId: notice.sourceRepairReportId, waitingParts: notice.waitingParts, waitingPartDetail: notice.waitingPartDetail }, ...localState.alerts],
    };
    setLocalState(nextLocalState);
    if (repairBoardPendingAlertId) {
      const nextGuideRepairReports = guideRepairReports.map(report => report.id === repairBoardPendingAlertId ? { ...report, status: "รออะไหล่ใช้งานได้", completedAt: undefined, completedBy: undefined } : report);
      setGuideRepairReports(nextGuideRepairReports);
      const latestVehicleState = parseOperationsSnapshot<{ vehicleState?: VehicleResponsibilityState }>(supervisorFleetSnapshotQuery.data)?.vehicleState ?? vehicleState;
      const nextVehicleState = { version: latestVehicleState.version, updatedAt: Date.now(), ...applyMechanicVehicleStatus(latestVehicleState, [vehicleNumber], "ready") };
      setVehicleState(nextVehicleState);
      saveSupervisorFleetSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.fleet, payload: serializeOperationsSnapshot({ vehicleState: nextVehicleState }) });
      persistRepairBoardStages({ ...repairBoardStages, [repairBoardPendingAlertId]: "รออะไหล่ใช้งานได้" }, { ...repairBoardOutcomeDetails, [repairBoardPendingAlertId]: alertDescription.trim() }, nextGuideRepairReports);
      setRepairBoardPendingAlertId(undefined);
    }
    resetAlertForm();
  };
  const editAlert = (alert: AlertRecord) => { setAlertVehicle(String(alert.vehicleNumber)); setAlertDescription(alert.description); setAlertWaitingParts(Boolean(alert.waitingParts)); setAlertWaitingPartDetail(alert.waitingPartDetail ?? ""); setEditingAlertId(alert.id); };
  const deleteAlert = (alert: AlertRecord) => {
    const nextLocalState = { ...localState, alerts: localState.alerts.filter(item => item.id !== alert.id) };
    setLocalState(nextLocalState);
    const nextNotices = removeVehicleSafetyNotice(safetyNotices, alert.id);
    setSafetyNotices(nextNotices);
    saveVehicleFlowSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.vehicleFlow, payload: serializeOperationsSnapshot({ safetyNotices: nextNotices }) });
  };

  const resetRepairForm = () => { setRepairVehicle(""); setRepairSymptom(""); setSelectedGuideRepairId(undefined); setRepairParts(""); setRepairDecision(""); setEditingRepairId(undefined); setRepairFormMessage(""); };
  const addRepairPartOption = () => {
    const option = newRepairPartOption.trim();
    if (!option || repairPartOptions.includes(option)) return;
    setRepairPartOptions(options => [...options, option]);
    setNewRepairPartOption("");
  };
  const removeRepairPartOption = (option: string) => {
    setRepairPartOptions(options => options.filter(item => item !== option));
    if (repairParts === option) setRepairParts("");
  };
  const saveRepair = async () => {
    setRepairFormMessage("");
    const vehicleNumber = Number(repairVehicle);
    const mechanicName = currentMechanicActor.name.trim();
    const parts = normalizeOptionalRepairParts(repairParts);
    const existing = localState.repairs.find(repair => repair.id === editingRepairId);
    const vehicle = vehicles.find(candidate => candidate.number === vehicleNumber);
    if (!canSubmitMechanicRepair({ vehicleNumber: repairVehicle, decision: repairDecision }) || !mechanicName || !vehicle || !isSelectableForNewRepair(vehicle, new Set(), existing?.vehicleNumber)) return;
    const accumulatedHoursAtRepair = existing?.accumulatedHoursAtRepair ?? supervisorUsageHoursByVehicle.get(vehicleNumber);
    if (accumulatedHoursAtRepair === undefined) {
      setRepairFormMessage(supervisorFleetSnapshotQuery.isSuccess ? "ยังไม่พบชั่วโมงสะสมของรถจากฐานข้อมูลหัวหน้า กรุณารีเฟรชแล้วลองใหม่" : "กำลังอ่านชั่วโมงสะสมจากฐานข้อมูลหัวหน้า กรุณารอสักครู่แล้วลองใหม่");
      return;
    }
    const usingPersistentVehicleFlow = Boolean(vehicleFlowSummaryQuery.data?.length);
    if (repairDecision === "ไม่แจ้งรับรถ" && usingPersistentVehicleFlow) {
      try {
        await completeRepairWithoutPickupMutation.mutateAsync({
          vehicleNumber,
          note: `ซ่อมเสร็จและไม่แจ้งรับรถ โดย ${mechanicName}`,
        });
      } catch (error) {
        setRepairFormMessage(error instanceof Error ? error.message : "บันทึกการซ่อมเสร็จในฐานข้อมูลไม่สำเร็จ");
        return;
      }
    }
    const now = new Date().toISOString();
    const status: RepairStatus = repairDecision === "แจ้งรับรถ" ? "แจ้งรับรถ" : "เสร็จแล้ว";
    const repairId = existing?.id ?? `RP-${Date.now()}`;
    const nextRepair: RepairRecord = {
      id: repairId,
      vehicleNumber,
      symptom: repairSymptom.trim() || "ไม่ได้ระบุอาการ",
      parts,
      technician: mechanicName,
      decision: repairDecision || undefined,
      status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      sourceGuideRepairId: existing?.sourceGuideRepairId ?? selectedGuideRepairId,
      accumulatedHoursAtRepair,
    };
    if (!isMechanicDemo) {
      const waitingWorkflowItem = repairBoardRepairCompletionId ? repairWorkflowQuery.data?.find(item => item.id === repairBoardRepairCompletionId || item.sourceRepairReportId === repairBoardRepairCompletionId) : undefined;
      const workflowRequest = waitingWorkflowItem
        ? completeRepairWorkflowMutation.mutateAsync({ id: waitingWorkflowItem.id })
        : existing
          ? transitionRepairWorkflowMutation.mutateAsync({ id: repairId, status: "completed", requestedPart: parts || undefined })
          : createRepairWorkflowMutation.mutateAsync({ id: repairId, source: selectedGuideRepairId ? "guide-report" : "manual-alert", sourceRepairReportId: selectedGuideRepairId, vehicleNumber, description: nextRepair.symptom, reporter: mechanicName, requestedPart: parts || undefined, status: "completed" });
      void workflowRequest.catch(() => undefined);
    }
    const completedWaitingAlertId = repairBoardRepairCompletionId;
    const nextLocalState: MechanicLocalState = {
      ...localState,
      alerts: completedWaitingAlertId ? localState.alerts.filter(alert => alert.id !== completedWaitingAlertId) : localState.alerts,
      repairs: editingRepairId
        ? localState.repairs.map(repair => repair.id === editingRepairId ? nextRepair : repair)
        : [nextRepair, ...localState.repairs],
    };
    setLocalState(nextLocalState);
    if (completedWaitingAlertId) {
      const nextSafetyNotices = removeVehicleSafetyNotice(safetyNotices, completedWaitingAlertId);
      setSafetyNotices(nextSafetyNotices);
      saveVehicleFlowSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.vehicleFlow, payload: serializeOperationsSnapshot({ safetyNotices: nextSafetyNotices }) });
      const nextStages = { ...repairBoardStages };
      const nextDetails = { ...repairBoardOutcomeDetails };
      delete nextStages[completedWaitingAlertId];
      delete nextDetails[completedWaitingAlertId];
      persistRepairBoardStages(nextStages, nextDetails);
      setRepairBoardRepairCompletionId(undefined);
      const latestWaitingVehicleState = parseOperationsSnapshot<{ vehicleState?: VehicleResponsibilityState }>(supervisorFleetSnapshotQuery.data)?.vehicleState ?? vehicleState;
      const readyVehicleState = { version: latestWaitingVehicleState.version, updatedAt: Date.now(), ...applyMechanicVehicleStatus(latestWaitingVehicleState, [vehicleNumber], "ready") };
      setVehicleState(readyVehicleState);
      saveSupervisorFleetSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.fleet, payload: serializeOperationsSnapshot({ vehicleState: readyVehicleState }) });
    }
    const repairPartsText = parts.toLocaleLowerCase();
    const resetRuleIds = roundChangeSettings.rules
      .filter(rule => (pendingMaintenanceReset?.vehicleNumber === vehicleNumber && pendingMaintenanceReset.ruleId === rule.id) || repairPartsText.includes(rule.name.toLocaleLowerCase()))
      .map(rule => rule.id);
    if (resetRuleIds.length) {
      setMaintenanceResetHours(current => resetRuleIds.reduce((next, ruleId) => ({ ...next, [`${ruleId}:${vehicleNumber}`]: accumulatedHoursAtRepair }), current));
      if (pendingMaintenanceReset?.vehicleNumber === vehicleNumber) setPendingMaintenanceReset(undefined);
    }

    const trackedVehicleNumbers = [vehicleNumber, ...(existing ? [existing.vehicleNumber] : [])];
    const latestVehicleState = parseOperationsSnapshot<{ vehicleState?: VehicleResponsibilityState }>(supervisorFleetSnapshotQuery.data)?.vehicleState ?? vehicleState;
    const nextVehicleState = Array.from(new Set(trackedVehicleNumbers)).reduce((current, number) => {
      const trackedStatus = resolveMechanicRecordVehicleStatus(number, nextLocalState.alerts, nextLocalState.repairs);
      const patch = applyMechanicVehicleStatus(current, [number], trackedStatus);
      return { version: current.version, updatedAt: Date.now(), ...patch };
    }, latestVehicleState);
    setVehicleState(nextVehicleState);

    const storedPickupRequests = pickupRequests;
    const remoteFleet = parseOperationsSnapshot<{ vehicleState?: VehicleResponsibilityState; fleetGroups?: Array<{ id: string; name: string; vehicleNumbers: number[]; managerIds: number[] }> }>(supervisorFleetSnapshotQuery.data);
    const currentSharedState = remoteFleet?.vehicleState ?? vehicleState;
    const sharedGroups = currentSharedState.responsibilityGroups;
    const group = responsibilityGroupForVehicle(vehicleNumber, sharedGroups);
    const nextRequest = status === "แจ้งรับรถ" ? {
      id: `PU-${repairId}`,
      sourceRepairId: repairId,
      vehicleNumber,
      cc: vehicle?.cc ?? "",
      message: `รถ #${vehicleNumber} (${vehicle?.cc ?? ""} Cc.) ซ่อมเสร็จแล้ว กรุณามารับรถ`,
      mechanic: mechanicName,
      recipients: managerRecipients(vehicleNumber, currentSharedState),
      responsibilityGroupId: group?.id === undefined ? undefined : String(group.id),
      responsibilityGroupName: group?.name,
      eligibleGuideIds: group?.managers,
      createdAt: now,
      status: "รอรับรถ" as const,
    } satisfies VehiclePickupRequest : undefined;
    const nextPickupRequests = status === "แจ้งรับรถ" && nextRequest
      ? aggregateVehiclePickupRequests(storedPickupRequests, [nextRequest], sharedGroups, directoryUsers)
      : removeVehiclePickupRequest(storedPickupRequests, repairId);
    setPickupRequests(nextPickupRequests);
    const pickupPayload = serializeOperationsSnapshot({ pickupRequests: nextPickupRequests });
    saveVehicleFlowSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.vehicleFlow, payload: pickupPayload });
    // Persist the status transition and pickup queue together so an older snapshot
    // write cannot overwrite the ready state after a no-pickup completion.
    saveSupervisorFleetSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.fleet, payload: serializeOperationsSnapshot({ vehicleState: nextVehicleState, pickupRequests: nextPickupRequests }) });
    const repairActor = currentMechanicActor;
    const nextGuideRepairReports = persistGuideRepairLifecycle(nextRepair, status, now, repairActor.name, guideRepairReports);
    if (nextGuideRepairReports) setGuideRepairReports(nextGuideRepairReports);
    // Repair lifecycle updates only the repairReports field. It must not rewrite
    // Guide sessions or cause the Guide screen to follow a Standby session.
    const repairReportsPayload = serializeOperationsSnapshot({ repairReports: nextGuideRepairReports ?? guideRepairReports });
    saveGuideSessionsMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, payload: repairReportsPayload });
    saveGuideStateMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideState, payload: repairReportsPayload });
    resetRepairForm();
  };
  const editRepair = (repair: RepairRecord) => { setRepairVehicle(String(repair.vehicleNumber)); setRepairSymptom(repair.symptom); setSelectedGuideRepairId(repair.sourceGuideRepairId); setRepairParts(repair.parts); setRepairDecision(repair.decision ?? (repair.status === "แจ้งรับรถ" ? "แจ้งรับรถ" : "ไม่แจ้งรับรถ")); setEditingRepairId(repair.id); setTab("repair"); };
  const deleteRepair = (repair: RepairRecord) => {
    const nextLocalState = { ...localState, repairs: localState.repairs.filter(item => item.id !== repair.id) };
    setLocalState(nextLocalState);
    syncTrackedVehicleStatuses(nextLocalState, [repair.vehicleNumber]);
    const sourceReport = findGuideRepairReportForRepair(guideRepairReports, repair);
    const nextGuideRepairReports = sourceReport && sourceReport.status !== "ซ่อมเสร็จ"
      ? closeGuideRepairReport(guideRepairReports, sourceReport.id, new Date().toISOString(), currentMechanicActor.name)
      : guideRepairReports;
    if (nextGuideRepairReports !== guideRepairReports) {
      setGuideRepairReports(nextGuideRepairReports);
      const repairReportsPayload = serializeOperationsSnapshot({ repairReports: nextGuideRepairReports });
      saveGuideSessionsMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, payload: repairReportsPayload });
      saveGuideStateMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideState, payload: repairReportsPayload });
    }
    const nextPickupRequests = removeVehiclePickupRequest(pickupRequests, repair.id);
    setPickupRequests(nextPickupRequests);
    const pickupPayload = serializeOperationsSnapshot({ pickupRequests: nextPickupRequests });
    saveVehicleFlowSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.vehicleFlow, payload: pickupPayload });
    saveSupervisorFleetSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.fleet, payload: pickupPayload });
  };
  const sendRepairLogToGoogleSheets = async () => {
    if (!repairLogRecords.length) {
      setRepairLogSheetMessage("ยังไม่มีรายการซ่อมให้ส่ง");
      return;
    }
    if (repairLogStatusQuery.data?.configured !== true) {
      setRepairLogSheetMessage("ยังไม่ได้ตั้งค่า Google Apps Script ฝั่ง Server จึงยังไม่ส่งหรือลบรายการซ่อม");
      return;
    }
    setRepairLogSheetMessage("กำลังส่งรายการทั้งหมดไป Google Sheets…");
    const payload = buildRepairLogSheetPayload(repairLogRecords.map(repair => ({
      id: repair.id,
      kind: "repair" as const,
      vehicleNumber: repair.vehicleNumber,
      description: repair.symptom,
      parts: repair.parts,
      reporter: repair.technician,
      createdAt: repair.createdAt,
      updatedAt: repair.updatedAt,
      status: repair.status,
      decision: repair.decision,
      sourceGuideRepairId: repair.sourceGuideRepairId,
      accumulatedHoursAtRepair: repair.accumulatedHoursAtRepair,
      totalHours: formatElapsedHours(repair.createdAt, repair.updatedAt),
    })));
    try {
      const result = await sendRepairLogMutation.mutateAsync(payload);
      const sentAt = result.sentAt;
      const nextGuideRepairReports = repairLogRecords.reduce((reports, repair) => {
        const sourceReport = findGuideRepairReportForRepair(reports, repair);
        return sourceReport && sourceReport.status !== "ซ่อมเสร็จ"
          ? closeGuideRepairReport(reports, sourceReport.id, sentAt, currentMechanicActor.name)
          : reports;
      }, guideRepairReports);
      if (nextGuideRepairReports !== guideRepairReports) {
        setGuideRepairReports(nextGuideRepairReports);
        const repairReportsPayload = serializeOperationsSnapshot({ repairReports: nextGuideRepairReports });
        saveGuideSessionsMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, payload: repairReportsPayload });
        saveGuideStateMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideState, payload: repairReportsPayload });
      }
      const sentRepairIds = new Set(repairLogRecords.map(repair => repair.id));
      const nextLocalState = { ...localState, repairs: localState.repairs.filter(repair => !sentRepairIds.has(repair.id)) };
      setLocalState(nextLocalState);
      syncTrackedVehicleStatuses(nextLocalState, Array.from(new Set(repairLogRecords.map(repair => repair.vehicleNumber))));
      setRepairLogSheetMessage(`ส่ง ${repairLogRecords.length} รายการไป Google Sheets แล้ว และลบรายการออกจากหน้าบันทึกเรียบร้อย โดยคงคิวแจ้งรับรถและสถานะงานที่เกี่ยวข้องไว้`);
    } catch {
      setRepairLogSheetMessage("ส่งข้อมูลไม่สำเร็จ จึงยังไม่เคลียร์รายการซ่อม กรุณาตรวจการตั้งค่า Server และสิทธิ์ของ Google Apps Script");
    }
  };
  const updateRoundChangeSettings = (nextSettings: RoundChangeSettings) => {
    setRoundChangeSettings(nextSettings);
  };
  useEffect(() => {
    // maintenanceResetHours persist through mechanicState Server snapshot.
  }, [maintenanceResetHours]);
  const openMaintenanceForm = () => {
    setRoundChangeView("alerts");
    setShowMaintenanceForm(true);
    setNewMaintenanceName("");
    setNewMaintenanceThresholds({ 200: "", 250: "" });
  };
  const beginMaintenanceEdit = () => {
    if (!activeMaintenanceRule) return;
    setEditingMaintenanceRuleId(activeMaintenanceRule.id);
    setEditingMaintenanceName(activeMaintenanceRule.name);
    setEditingMaintenanceThresholds({ 200: activeMaintenanceRule.thresholdHours[200] ? String(activeMaintenanceRule.thresholdHours[200]) : "", 250: activeMaintenanceRule.thresholdHours[250] ? String(activeMaintenanceRule.thresholdHours[250]) : "" });
    setShowMaintenanceForm(false);
  };
  const cancelMaintenanceEdit = () => {
    setEditingMaintenanceRuleId(undefined);
    setEditingMaintenanceName("");
    setEditingMaintenanceThresholds({ 200: "", 250: "" });
  };
  const saveMaintenanceEdit = () => {
    if (!activeMaintenanceRule || editingMaintenanceRuleId !== activeMaintenanceRule.id || !editingMaintenanceName.trim()) return;
    let nextSettings = updateMaintenanceRule(roundChangeSettings, activeMaintenanceRule.id, { name: editingMaintenanceName });
    nextSettings = updateMaintenanceRule(nextSettings, activeMaintenanceRule.id, { cc: "200", thresholdHours: editingMaintenanceThresholds["200"] });
    nextSettings = updateMaintenanceRule(nextSettings, activeMaintenanceRule.id, { cc: "250", thresholdHours: editingMaintenanceThresholds["250"] });
    updateRoundChangeSettings(nextSettings);
    cancelMaintenanceEdit();
  };
  const cancelMaintenanceRule = () => {
    if (!activeMaintenanceRule || !window.confirm(`ยืนยันยกเลิกแจ้งเตือน “${activeMaintenanceRule.name}” หรือไม่`)) return;
    updateRoundChangeSettings(removeMaintenanceRule(roundChangeSettings, activeMaintenanceRule.id));
    setMaintenanceViewRuleId(undefined);
    setRoundChangeView("vehicles");
    cancelMaintenanceEdit();
  };
  const addRoundChangeRule = () => {
    if (!canCreateMaintenanceRule) return;
    const maintenanceName = newMaintenanceName.trim();
    const nextSettings = addMaintenanceRule(roundChangeSettings, maintenanceName, newMaintenanceThresholds);
    if (nextSettings !== roundChangeSettings) {
      updateRoundChangeSettings(nextSettings);
      setRepairPartOptions(current => current.includes(maintenanceName) ? current : [...current, maintenanceName]);
      setMaintenanceViewRuleId(nextSettings.rules[nextSettings.rules.length - 1]?.id);
      setNewMaintenanceName("");
      setNewMaintenanceThresholds({ 200: "", 250: "" });
      setShowMaintenanceForm(false);
      setRoundChangeView("alerts");
    }
  };
  const updateRoundChangeThreshold = (ruleId: string, cc: VehicleCc, value: string) => {
    updateRoundChangeSettings(updateMaintenanceRule(roundChangeSettings, ruleId, { cc, thresholdHours: value }));
  };
  const removeRoundChangeRule = (ruleId: string) => updateRoundChangeSettings(removeMaintenanceRule(roundChangeSettings, ruleId));
  const toggleRoundChangeRule = (ruleId: string, enabled: boolean) => updateRoundChangeSettings(updateMaintenanceRule(roundChangeSettings, ruleId, { enabled }));
  const clearMaintenanceVehicleHours = (vehicleNumber: number) => {
    const usage = vehicleUsageHours.find(item => item.number === String(vehicleNumber));
    if (!usage || !activeMaintenanceRule) return;
    setPendingMaintenanceReset({ ruleId: activeMaintenanceRule.id, vehicleNumber });
    setRepairVehicle(String(vehicleNumber));
    setRepairParts(activeMaintenanceRule.name);
    setRepairSymptom("");
    setRepairDecision("");
    setSelectedGuideRepairId(undefined);
    setEditingRepairId(undefined);
    setRepairFormMessage("");
    setTab("repair");
  };
  const notifyGuideForMaintenance = (alert: (typeof maintenanceAlerts)[number]) => {
    const group = responsibilityGroupForVehicle(Number(alert.vehicleNumber), vehicleState.responsibilityGroups);
    const recipients = managerRecipients(Number(alert.vehicleNumber));
    if (!recipients.length || hasVehicleMaintenanceNotification(maintenanceNotifications, alert.ruleId, Number(alert.vehicleNumber))) return false;
    const now = new Date().toISOString();
    const nextNotification: VehicleMaintenanceNotification = {
      id: `MN-${Date.now()}-${alert.ruleId}-${alert.vehicleNumber}`,
      ruleId: alert.ruleId,
      ruleName: alert.ruleName,
      vehicleNumber: Number(alert.vehicleNumber),
      cc: alert.cc,
      accumulatedHours: alert.accumulatedHours,
      thresholdHours: alert.thresholdHours,
      message: `กรุณาเข้ามาตรวจสภาพรถ #${alert.vehicleNumber} ในรายการ “${alert.ruleName}” ก่อนนำไปใช้งาน`,
      mechanic: currentMechanicActor.name,
      recipients,
      eligibleGuideIds: group?.managers,
      responsibilityGroupId: group?.id === undefined ? undefined : String(group.id),
      responsibilityGroupName: group?.name,
      createdAt: now,
      status: "รอตรวจสอบ",
    };
    const nextNotifications = [nextNotification, ...maintenanceNotifications];
    setMaintenanceNotifications(nextNotifications);
    saveGuideSessionsMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, payload: serializeOperationsSnapshot({ maintenanceNotifications: nextNotifications }) });
    return true;
  };
  const openRepairBoardReport = (report: GuideRepairReport) => setSelectedRepairBoardReport(report);
  const closeRepairBoardReport = () => setSelectedRepairBoardReport(undefined);
  const chooseRepairBoardRepair = (report: GuideRepairReport) => {
    const waitingPartDetail = safetyNotices.find(notice => notice.id === report.id)?.waitingPartDetail?.trim() || repairBoardOutcomeDetails[report.id]?.trim() || "";
    setRepairVehicle(guideRepairVehicleSelection(report.vehicleId));
    setRepairSymptom(report.description);
    setSelectedGuideRepairId(report.id);
    setRepairParts(waitingPartDetail);
    if (waitingPartDetail) setRepairPartOptions(options => options.includes(waitingPartDetail) ? options : [...options, waitingPartDetail]);
    setRepairDecision("");
    setEditingRepairId(undefined);
    if (repairBoardStages[report.id] === "รออะไหล่ใช้งานได้" || repairBoardStages[report.id] === "รออะไหล่ห้ามใช้งาน") setRepairBoardRepairCompletionId(report.id);
    closeRepairBoardReport();
    setTab("repair");
  };
  const chooseRepairBoardUsableWait = (report: GuideRepairReport) => {
    resetAlertForm();
    setAlertVehicle(guideRepairVehicleSelection(report.vehicleId));
    setAlertDescription("");
    setAlertWaitingParts(true);
    setAlertWaitingPartDetail("");
    setRepairBoardPendingAlertId(report.id);
    closeRepairBoardReport();
    setTab("tips");
  };
  const chooseRepairBoardUnavailableWait = (report: GuideRepairReport) => {
    setRepairWaitingPartDetail("");
    setRepairBoardPendingPartsId(report.id);
    closeRepairBoardReport();
    setTab("waitingParts");
  };
  const saveWaitingPartDetail = () => {
    if (!repairBoardPendingPartsId || !repairWaitingPartDetail.trim()) return;
    if (!isMechanicDemo) {
      const report = guideRepairReports.find(item => item.id === repairBoardPendingPartsId);
      const existingWorkflowItem = repairWorkflowQuery.data?.find(item => item.id === repairBoardPendingPartsId);
      const request = existingWorkflowItem
        ? transitionRepairWorkflowMutation.mutateAsync({ id: repairBoardPendingPartsId, status: "waiting_parts_unavailable", requestedPart: repairWaitingPartDetail.trim() })
        : createRepairWorkflowMutation.mutateAsync({ id: repairBoardPendingPartsId, source: "guide-report", sourceRepairReportId: repairBoardPendingPartsId, vehicleNumber: extractGuideVehicleNumber(report?.vehicleId ?? "") ?? 0, description: report?.description ?? "รายการแจ้งซ่อม", reporter: report?.reporter ?? currentMechanicActor.name, requestedPart: repairWaitingPartDetail.trim(), status: "waiting_parts_unavailable" });
      void request.catch(() => undefined);
    }
    persistRepairBoardStages({ ...repairBoardStages, [repairBoardPendingPartsId]: "รออะไหล่ห้ามใช้งาน" }, { ...repairBoardOutcomeDetails, [repairBoardPendingPartsId]: repairWaitingPartDetail.trim() });
    setRepairBoardPendingPartsId(undefined);
    setRepairWaitingPartDetail("");
    setTab("dashboard");
  };
  const persistRepairBoardStages = (nextStages: typeof repairBoardStages, nextDetails: typeof repairBoardOutcomeDetails = repairBoardOutcomeDetails, reports = guideRepairReports) => {
    setRepairBoardStages(nextStages);
    setRepairBoardOutcomeDetails(nextDetails);
    saveGuideSessionsMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.guideSessions, payload: serializeOperationsSnapshot({ repairReports: reports, repairBoardStages: nextStages, repairBoardOutcomeDetails: nextDetails }) });
  };
  const mechanicTabs = <nav className="mechanic-top-tabs" aria-label="ทางลัดงานช่าง"><button type="button" className={tab === "dashboard" ? "selected" : ""} onClick={() => setTab("dashboard")}><Wrench size={15} /> หน้าแรกช่าง</button><button type="button" className={tab === "roundChange" ? "selected" : ""} onClick={() => setTab("roundChange")}><RotateCcw size={15} /> ตั้งค่ารอบเปลี่ยน</button><button type="button" className={tab === "roundTable" ? "selected" : ""} onClick={() => { setRoundPageOffset(payoutPageOffsetForDate(new Date())); setTab("roundTable"); }}><Table2 size={15} /> ตารางค่ารอบ</button></nav>;
  const mechanicBottomNav = <nav className="mechanic-bottom-nav" aria-label="เมนูหลักโมดูลช่าง">{([{ id: "dashboard", label: "หน้าแรก", icon: Wrench }, { id: "communication", label: "ห้องสื่อสาร", icon: MessageCircle }, { id: "settings", label: "ตั้งค่า", icon: Settings2 }] as const).map(item => { const Icon = item.icon; return <button type="button" key={item.id} className={tab === item.id ? "selected" : ""} onClick={() => setTab(item.id)}><Icon size={16} /><span>{item.label}</span></button>; })}</nav>;
  const repairBoardPanel = <section className="mechanic-repair-board" aria-label="บอร์ดงานซ่อม"><div className="mechanic-repair-board-heading"><div><span>MECHANIC / REPAIR BOARD</span><h3>บอร์ดติดตามงานซ่อม</h3><small>รายการจาก Guide และรายการซ่อมที่บันทึกในระบบ</small></div><ClipboardList size={24} /></div><div className="mechanic-repair-board-columns">{repairBoardColumns.map(column => <section className={`mechanic-repair-board-column ${column.tone}`} key={column.id} aria-labelledby={`repair-board-${column.id}`}><header><h4 id={`repair-board-${column.id}`}>{column.title}</h4><b>{column.cards.length}</b></header><div className="mechanic-repair-board-list">{column.cards.length ? column.cards.map(card => <article className="mechanic-repair-board-card" key={card.id}><button type="button" className="mechanic-repair-board-card-open" onClick={() => { if (card.kind === "report") { openRepairBoardReport(card.report); } else { editRepair(card.repair); } }}><strong>{card.title}</strong><span>{card.detail}</span><small>{card.meta}</small><em className="mechanic-repair-board-card-id">ID: {card.id}</em></button></article>) : <p className="mechanic-repair-board-empty">ยังไม่มีรายการ</p>}</div></section>)}</div></section>;
  const repairBoardDetailDialog = selectedRepairBoardReport ? (() => { const waitingStage = repairBoardStages[selectedRepairBoardReport.id]; const isWaiting = waitingStage === "รออะไหล่ใช้งานได้" || waitingStage === "รออะไหล่ห้ามใช้งาน"; const waitingDays = Math.max(0, Math.floor((Date.now() - Date.parse(selectedRepairBoardReport.createdAt)) / 86400000)); return <div className="mechanic-repair-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeRepairBoardReport(); }}><section className="mechanic-repair-dialog" role="dialog" aria-modal="true" aria-labelledby="mechanic-repair-dialog-title"><header><div><span>{isWaiting ? "WAITING PARTS DETAIL" : "REPAIR REPORT DETAIL"}</span><h3 id="mechanic-repair-dialog-title">รายละเอียดแจ้งซ่อม · รถ #{extractGuideVehicleNumber(selectedRepairBoardReport.vehicleId) ?? "-"}</h3></div><button type="button" onClick={closeRepairBoardReport} aria-label="ปิดรายละเอียด">×</button></header><dl><div><dt>ผู้แจ้ง</dt><dd>{selectedRepairBoardReport.reporter}</dd></div><div><dt>อาการ</dt><dd>{repairBoardOutcomeDetails[selectedRepairBoardReport.id] || selectedRepairBoardReport.description}</dd></div><div><dt>วันที่แจ้ง</dt><dd>{formatThaiDate(selectedRepairBoardReport.createdAt)}</dd></div>{isWaiting && <div><dt>จำนวนวันที่รออะไหล่จนถึงปัจจุบัน</dt><dd>{waitingDays} วัน</dd></div>}</dl>{isWaiting ? <div className="mechanic-repair-dialog-actions mechanic-repair-dialog-actions-two"><button type="button" className="dialog-repair-done" onClick={() => chooseRepairBoardRepair(selectedRepairBoardReport)}>แจ้งซ่อม</button><button type="button" className="dialog-back" onClick={closeRepairBoardReport}>กลับ</button></div> : <div className="mechanic-repair-dialog-actions"><button type="button" className="dialog-repair-done" onClick={() => chooseRepairBoardRepair(selectedRepairBoardReport)}>ซ่อมแล้ว</button><button type="button" className="dialog-wait-usable" onClick={() => chooseRepairBoardUsableWait(selectedRepairBoardReport)}>รออะไหล่ใช้งานได้</button><button type="button" className="dialog-wait-unavailable" onClick={() => chooseRepairBoardUnavailableWait(selectedRepairBoardReport)}>รออะไหล่ห้ามใช้งาน</button></div>}</section></div>; })() : null;
  if (tab === "status") return <VehicleResponsibilityGroupView vehicles={vehicles} responsibilityState={vehicleState} directoryUsers={directoryUsers} safetyNotices={safetyNotices} statusModel={supervisorStatusModel} titleKicker="MECHANIC / VEHICLE RESPONSIBILITY" chrome={safetyNoticeDialog} onBack={() => setTab("dashboard")} onSafetyNoticeOpen={notices => { const first = notices[0]; if (first) setSelectedSafetyNotices(notices); }} />;
  if (tab === "dashboard") return <main className="m3-shell mechanic-guide-dashboard">
    <section className="m3-panel">
      {safetyNoticeDialog}
      {repairBoardDetailDialog}
      {mechanicFollowPopup}
      {selectedMechanicFollowSession ? mechanicActiveDetail : <>{mechanicTabs}
      <div className="m3-panel-title"><div><p>MECHANIC / STATUS VIEW</p><h2>สถานะรถ ATV ของช่าง</h2><small className="m3-demo-badge">สถานะรถจากแหล่งข้อมูลเดียวกับโมดูลไกด์</small></div><div className="mechanic-header-actions"><button className="m3-icon-button" onClick={() => { void supervisorFleetSnapshotQuery.refetch(); }} aria-label="รีเฟรชข้อมูลรถ"><RefreshCw size={16} /></button><ModuleLogoutButton /></div></div>
      <DisconnectedVehicleStatusCards vehicles={vehicles} safetyNotices={safetyNotices} statusModel={supervisorStatusModel} onOpenGroupView={() => setTab("status")} />
      <div className="m3-dashboard-actions"><button className="m3-primary" onClick={() => setTab("tips")}><AlertTriangle size={16} /> เพิ่มรายการเตือน</button><button className="m3-secondary" onClick={() => setTab("repair")}><ClipboardPlus size={16} /> ทำรายการแจ้งซ่อม</button></div>
      {repairBoardPanel}
      <section className="mechanic-active-section mechanic-active-section-secondary" aria-labelledby="mechanic-active-section-title"><div className="m3-list-heading"><div><p>ACTIVE SECTION / LIVE</p><h3 id="mechanic-active-section-title">รายการ Section ที่กำลัง Active</h3></div><span>{guideSessions.filter(session => session.status === "Active").length} รายการ</span></div><div className="mechanic-active-section-grid">{guideSessions.filter(session => session.status === "Active").map(session => { const startedAt = session.startedAt ? Date.parse(session.startedAt) : Number.NaN; const elapsed = Number.isFinite(startedAt) ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0; const duration = Math.max(0, (session.durationMinutes ?? 30) * 60); const over = Math.max(0, elapsed - duration); const remain = Math.max(0, duration - elapsed); const label = over > 0 ? `+${String(Math.floor(over / 60)).padStart(2, "0")}:${String(over % 60).padStart(2, "0")}` : `${String(Math.floor(remain / 60)).padStart(2, "0")}:${String(remain % 60).padStart(2, "0")}`; return <button type="button" className={`mechanic-active-section-card ${over > 0 ? "is-overtime" : ""}`} key={session.sessionId} onClick={() => setSelectedMechanicFollowSessionId(session.sessionId)}><div><span>{session.activeUserName || "ไม่ระบุผู้ทำรายการ"}</span><strong>{over > 0 ? "เวลาบวก" : "กำลังทำงาน"} {label}</strong></div><small>สมาชิก {(session.memberIds ?? []).length} คน · รถ {(session.vehicleIds ?? []).length} คัน</small><em>{session.sessionId}</em></button>; })}{!guideSessions.some(session => session.status === "Active") && <p className="m3-empty">ยังไม่มีรายการ Section ที่กำลัง Active</p>}</div></section></>}
    </section>
      <footer className="m3-footer"><a href="/">กลับระบบหลัก</a><span>Module ช่าง · ใช้สถานะรถร่วมกับโมดูลไกด์</span></footer>
      {mechanicBottomNav}
  </main>;
  const tabTitle = ({ tips: "ทิป", roundTable: "ตารางค่ารอบ", communication: "ห้องสื่อสาร", roundChange: "ตั้งค่ารอบเปลี่ยน", settings: "ตั้งค่า", repair: "ทำรายการแจ้งซ่อม", repairBoard: "บอร์ดงานซ่อม", waitingParts: "ระบุรายละเอียดอะไหล่ที่รอ", log: "บันทึกรายการซ่อม", dashboard: "หน้าแรก" } as const)[tab];
  return <main className="m3-shell mechanic-guide-dashboard mechanic-subpage">
    <section className="m3-panel mechanic-subpage-panel">
      {safetyNoticeDialog}
      {repairBoardDetailDialog}
      {mechanicFollowPopup}
      {mechanicTabs}
      <div className="m3-panel-title mechanic-subpage-title"><div><p>MECHANIC / {tabTitle.toUpperCase()}</p><h2>{tabTitle}</h2><small>หน้างานช่างจากโครงหน้าแรก</small></div><div className="mechanic-header-actions"><button className="m3-back-home" onClick={() => setTab("dashboard")}><ArrowLeft size={15} /> หน้าแรกช่าง</button><ModuleLogoutButton /></div></div>
      <div className="mechanic-sheet-scroll">
        <div className="mechanic-sheet-grid">

        {tab === "repairBoard" && repairBoardPanel}

        {tab === "tips" && <>
          <div className="mechanic-sheet-label alert-label">เตือนระวัง</div>
          <div className="mechanic-sheet-action-row"><button onClick={resetAlertForm}><Plus size={15} /> เพิ่มรายการ</button><span>{editingAlertId ? "กำลังแก้ไขรายการ" : "เพิ่มรายการเตือนระวัง"}</span></div>
          <table className="mechanic-sheet-table mechanic-entry-table" aria-label="เพิ่มรายการเตือน"><thead><tr><th>เลือกเบอร์รถ</th><th>cc</th><th>ชื่อผู้ดูแล</th><th>รายละเอียด</th>{showWaitingPartsEntryColumns && <><th>รออะไหล่</th><th>อะไหล่ที่รอ</th></>}<th>ชื่อช่างผู้แจ้ง</th><th>วันที่และเวลาแจ้ง</th><th>บันทึก</th></tr></thead><tbody><tr>
            <td><VehicleChoicePicker items={vehicles.map(vehicle => ({ id: String(vehicle.number), number: vehicle.number, cc: vehicle.cc, statusLabel: "รถในระบบ", fallbackGroupLabel: vehicleResponsibilityMeta(vehicle.number).groupLabel, fallbackManagers: vehicleResponsibilityMeta(vehicle.number).managerLabel.split(" · "), accentColor: getResponsibilityGroupColor(vehicle.number, vehicleState.responsibilityGroups), safetyNotices }))} selectedId={alertVehicle || undefined} responsibilityGroups={vehicleState.responsibilityGroups} managerDirectory={directoryUsers} onSafetyNoticeOpen={openSafetyNotices} onSelect={setAlertVehicle} ariaLabel="เลือกเบอร์รถสำหรับเตือนระวัง" placeholder="เลือกเบอร์รถ" /></td>
            <td>{vehicles.find(vehicle => vehicle.number === Number(alertVehicle))?.cc ?? ""}</td><td>{alertVehicle ? <><span>{vehicleResponsibilityMeta(Number(alertVehicle)).groupLabel}</span><small>{vehicleResponsibilityMeta(Number(alertVehicle)).managerLabel}</small></> : ""}</td><td><input value={alertDescription} onChange={event => setAlertDescription(event.target.value)} aria-label="รายละเอียด" />{showWaitingPartsEntryColumns && <small>กรอกเองเมื่อมาจากรออะไหล่ใช้งานได้</small>}</td>{showWaitingPartsEntryColumns && <><td><span className="mechanic-waiting-parts-badge is-waiting">รออะไหล่</span></td><td><input value={alertWaitingPartDetail} onChange={event => setAlertWaitingPartDetail(event.target.value)} aria-label="อะไหล่ที่รอ" placeholder="กรอกเอง (ถ้ามี)" /></td></>}<td><input value={currentMechanicActor.name} readOnly aria-readonly="true" aria-label="ชื่อช่างผู้แจ้ง" /></td><td>{new Date().toLocaleDateString("th-TH")}</td><td><button className="sheet-save" disabled={!alertVehicle || !alertDescription.trim()} onClick={saveAlert}><Save size={14} /> บันทึก</button></td>
          </tr></tbody></table>
          <table className="mechanic-sheet-table" aria-label="รายการเตือนระวัง"><thead><tr><th>ID รายการ</th><th>เลขรถ</th><th>cc</th><th>ชื่อผู้ดูแล</th><th>รายละเอียด</th>{showWaitingPartsColumns && <><th>รออะไหล่</th><th>อะไหล่ที่รอ</th></>}<th>ชื่อช่างผู้แจ้ง</th><th>วันที่และเวลาแจ้ง</th><th>ลบ</th><th>แก้ไข</th></tr></thead><tbody>
            {alertRecords.length ? alertRecords.map(alert => <tr key={alert.id}><td><code>{alert.id}</code><small>{alert.source === "waiting-available" ? "จากรออะไหล่ใช้งานได้" : "เพิ่มรายการเตือนปกติ"}</small></td><td><span className="supervisor-status-vehicle-number"><b className="supervisor-colored-vehicle-number" style={{ color: getResponsibilityGroupColor(Number(alert.vehicleNumber), vehicleState.responsibilityGroups), borderColor: getResponsibilityGroupColor(Number(alert.vehicleNumber), vehicleState.responsibilityGroups) }}>#{alert.vehicleNumber}</b><VehicleSafetyNoticeIndicator notices={safetyNotices} vehicleNumber={Number(alert.vehicleNumber)} accentColor={getResponsibilityGroupColor(Number(alert.vehicleNumber), vehicleState.responsibilityGroups)} onOpen={openSafetyNotices} /></span></td><td>{vehicles.find(vehicle => vehicle.number === alert.vehicleNumber)?.cc ?? ""}</td><td><span>{vehicleResponsibilityMeta(alert.vehicleNumber).groupLabel}</span><small>{vehicleResponsibilityMeta(alert.vehicleNumber).managerLabel}</small></td><td>{alert.description}</td>{showWaitingPartsColumns && <><td>{alert.source === "waiting-available" ? <span className="mechanic-waiting-parts-badge is-waiting">รออะไหล่</span> : "—"}</td><td>{alert.source === "waiting-available" ? (alert.waitingPartDetail || "—") : "—"}</td></>}<td>{alert.reporter}</td><td>{formatThaiDate(alert.createdAt)}</td><td><button className="sheet-danger" onClick={() => deleteAlert(alert)}><Trash2 size={14} /> ลบ</button></td><td><button className="sheet-edit" onClick={() => editAlert(alert)}><Pencil size={14} /> แก้ไข</button></td></tr>) : <tr><td colSpan={showWaitingPartsColumns ? 11 : 9} className="sheet-empty">ยังไม่มีรายการเตือนระวัง</td></tr>}
          </tbody></table>
        </>}

        {tab === "waitingParts" && <section className="mechanic-waiting-parts-page" aria-label="ระบุรายละเอียดอะไหล่ที่รอ"><div className="mechanic-feature-heading"><div><p>MECHANIC / WAITING PARTS</p><h3>ระบุรายละเอียดอะไหล่ที่รอ</h3><span>บันทึกข้อมูลอะไหล่สำหรับรายการที่รถยังห้ามใช้งาน</span></div><ClipboardList size={22} /></div>{repairBoardPendingPartsId ? <div className="mechanic-waiting-parts-form"><strong>รถ #{extractGuideVehicleNumber(guideRepairReports.find(report => report.id === repairBoardPendingPartsId)?.vehicleId ?? "") ?? "-"}</strong><p>{guideRepairReports.find(report => report.id === repairBoardPendingPartsId)?.description ?? "รายการแจ้งซ่อม"}</p><textarea value={repairWaitingPartDetail} onChange={event => setRepairWaitingPartDetail(event.target.value)} placeholder="เช่น ผ้าเบรกหน้า 1 ชุด / รออะไหล่จากคลัง" aria-label="รายละเอียดอะไหล่ที่รอ" /><div><button type="button" className="sheet-send" disabled={!repairWaitingPartDetail.trim()} onClick={saveWaitingPartDetail}><Save size={14} /> บันทึกและย้ายไป รออะไหล่ห้ามใช้งาน</button><button type="button" className="mechanic-maintenance-cancel" onClick={() => { setRepairBoardPendingPartsId(undefined); setRepairWaitingPartDetail(""); setTab("dashboard"); }}>ยกเลิก</button></div></div> : <div className="mechanic-round-empty"><ClipboardList size={20} /><p>ยังไม่มีรายการที่เลือก</p><small>เปิดจากป็อปอัพรายละเอียดรายการแจ้งซ่อม</small></div>}</section>}

        {tab === "repair" && <>
          <div className="mechanic-sheet-label repair-label">ทำรายการแจ้งซ่อม</div>
          <div className="mechanic-repair-setup">
            <div className="mechanic-repair-setup-title"><span>รายการแจ้งซ่อม</span><button type="button" className="sheet-setting-button" onClick={() => setShowRepairSettings(value => !value)}><Settings2 size={14} /> ตั้งค่า</button></div>
            {showRepairSettings && <div className="mechanic-repair-settings"><label>เพิ่มตัวเลือกอะไหล่<input value={newRepairPartOption} onChange={event => setNewRepairPartOption(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addRepairPartOption(); }} placeholder="ชื่ออะไหล่" /></label><button type="button" className="sheet-setting-add" onClick={addRepairPartOption}><Plus size={13} /> เพิ่ม</button><div className="mechanic-repair-option-list">{repairPartOptions.map(option => <span key={option}>{option}<button type="button" aria-label={`ลบตัวเลือก ${option}`} onClick={() => removeRepairPartOption(option)}><Trash2 size={11} /></button></span>)}</div></div>}
          </div>
          <table className="mechanic-sheet-table mechanic-entry-table mechanic-repair-entry-table" aria-label="ทำรายการแจ้งซ่อม"><thead><tr><th>เลือกเบอร์รถ</th><th>อะไหล่เบิกซ่อม <small>(ไม่บังคับ)</small></th><th>ตัวเลือก</th><th>ชื่อช่างผู้ทำรายการ</th><th>วันที่และเวลา</th><th>ส่ง</th></tr></thead><tbody><tr>
            <td><VehicleChoicePicker items={repairCandidates.map(vehicle => ({ id: String(vehicle.number), number: vehicle.number, cc: vehicle.cc, statusLabel: "พร้อมทำรายการ", fallbackGroupLabel: vehicleResponsibilityMeta(vehicle.number).groupLabel, fallbackManagers: vehicleResponsibilityMeta(vehicle.number).managerLabel.split(" · "), accentColor: getResponsibilityGroupColor(vehicle.number, vehicleState.responsibilityGroups), safetyNotices }))} selectedId={repairVehicle || undefined} responsibilityGroups={vehicleState.responsibilityGroups} managerDirectory={directoryUsers} onSafetyNoticeOpen={openSafetyNotices} onSelect={setRepairVehicle} ariaLabel="เลือกเบอร์รถสำหรับแจ้งซ่อม" placeholder="เลือกเบอร์รถ" /></td>
            <td><select value={repairParts} onChange={event => setRepairParts(event.target.value)}><option value="">ไม่ระบุ / ไม่เบิก</option>{Array.from(new Set([...repairPartOptions, ...(repairParts && !repairPartOptions.includes(repairParts) ? [repairParts] : [])])).map(option => <option key={option} value={option}>{option}</option>)}</select></td>
            <td><select value={repairDecision} onChange={event => setRepairDecision(event.target.value as RepairDecision | "")}><option value="">เลือก</option><option value="แจ้งรับรถ">แจ้งรับรถ</option><option value="ไม่แจ้งรับรถ">ไม่แจ้งรับรถ</option></select></td>
            <td><input value={currentMechanicActor.name} readOnly aria-readonly="true" aria-label="ชื่อช่างผู้ทำรายการ" /></td><td>{new Date().toLocaleDateString("th-TH")}</td><td><button className="sheet-send" disabled={!repairVehicle || !repairDecision || !currentMechanicActor.name.trim()} onClick={saveRepair}><Save size={14} /> ส่ง</button></td>
          </tr></tbody></table>{repairFormMessage && <p className="m3-form-error" role="alert">{repairFormMessage}</p>}
        </>}

        {tab === "repair" && <>
          <div className="mechanic-inline-log-heading"><p>MECHANIC / REPAIR LOG</p><h3>บันทึกรายการซ่อม</h3><small>รายการบันทึกซ่อมแสดงต่อจากแบบฟอร์มทำรายการแจ้งซ่อม</small></div><div className="mechanic-log-toolbar"><div><strong>ส่งบันทึกรายการซ่อมไป Google Sheets</strong><span>{repairLogRecords.length ? `มี ${repairLogRecords.length} รายการรอส่ง` : "ยังไม่มีรายการรอส่ง"}{repairLogStatusQuery.data?.configured ? " · เชื่อมต่อแล้ว" : repairLogStatusQuery.isLoading ? " · กำลังตรวจสอบการเชื่อมต่อ" : " · ยังไม่ได้ตั้งค่าฝั่ง Server"}</span></div><div className="mechanic-log-toolbar-actions"><span className="mechanic-log-server-status">จัดการผ่าน Server</span><button type="button" className="sheet-send" disabled={!repairLogRecords.length || !repairLogStatusQuery.data?.configured || sendRepairLogMutation.isPending} onClick={() => { void sendRepairLogToGoogleSheets(); }}><Save size={14} /> ส่งบันทึกทั้งหมด</button></div></div>
          {repairLogSheetMessage && <p className="m3-form-error" role="status">{repairLogSheetMessage}</p>}
          <table className="mechanic-sheet-table mechanic-log-table" aria-label="บันทึกรายการซ่อม"><thead><tr><th>ID รายการ</th><th>วันที่และเวลา</th><th>เบอร์รถ</th><th>อะไหล่เบิกซ่อม</th><th>ชื่อช่างผู้ทำรายการ</th><th>ชั่วโมงสะสม</th><th>ตัวเลือก</th><th>แก้ไขรายการ</th></tr></thead><tbody>
            {repairLogRecords.length ? repairLogRecords.map(repair => <tr key={repair.id}><td><code>{repair.id}</code></td><td>{formatThaiDate(repair.createdAt)}</td><td><b className="supervisor-colored-vehicle-number" style={{ color: getResponsibilityGroupColor(repair.vehicleNumber, vehicleState.responsibilityGroups), borderColor: getResponsibilityGroupColor(repair.vehicleNumber, vehicleState.responsibilityGroups) }}>#{repair.vehicleNumber}</b><small>{vehicleResponsibilityMeta(repair.vehicleNumber).groupLabel} · {vehicleResponsibilityMeta(repair.vehicleNumber).managerLabel}</small></td><td>{repair.parts || "—"}</td><td>{repair.technician}</td><td>{typeof repair.accumulatedHoursAtRepair === "number" ? `${repair.accumulatedHoursAtRepair.toFixed(1)} ชม.` : "ไม่มีข้อมูลเดิม"}</td><td>{repair.decision ?? repair.status}</td><td className="sheet-log-actions"><button className="sheet-edit" onClick={() => editRepair(repair)}><Pencil size={14} /> แก้ไข</button></td></tr>) : <tr><td colSpan={8} className="sheet-empty">ยังไม่มีรายการซ่อม</td></tr>}
          </tbody></table>
        </>}

        {tab === "roundTable" && <section className="mechanic-feature-panel mechanic-payout-feature" aria-label="ตารางค่ารอบ"><div className="mechanic-feature-heading"><div><p>MECHANIC / PERSONAL PAYOUT</p><h3>ตารางค่ารอบ</h3><span>โครงสร้างเดียวกับตารางค่ารอบของ Guide และแสดงเฉพาะข้อมูลของคุณ</span></div><Table2 size={22} /></div>{currentRoundTableUser ? <><div className="m3-payout-week-nav round-table-floating-nav"><button type="button" className="m3-payout-recenter" onClick={goToCurrentRoundPage} aria-label="กลับไปวันที่ปัจจุบัน" title="กลับไปวันที่ปัจจุบัน"><RotateCcw size={15} /> Re</button><button type="button" onClick={() => moveRoundPage(-1)} aria-label="หน้าก่อนหน้า">‹</button><strong>หน้า {roundPageLabel} · {new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(roundPageMonth)}</strong><button type="button" onClick={() => moveRoundPage(1)} aria-label="หน้าถัดไป">›</button></div><div className="m3-payout-sheet-wrap"><table className="m3-payout-sheet"><thead><tr><th>วัน / วันที่</th>{PAYOUT_ROUND_COLUMNS.map(minutes => <th key={minutes}>{minutes} นาที</th>)}<th className="hours-head">ชั่วโมงขับ</th><th className="total-head">รวม</th></tr></thead><tbody>{personalRoundRows.map(row => <tr key={row.key}><th className={`payout-weekday ${isCurrentRoundDate(row.date) ? "today" : ""}`}><small>{new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(row.date)}</small><strong>{row.date.getDate()}/{row.date.getMonth() + 1}</strong>{isCurrentRoundDate(row.date) && <em>วันนี้</em>}</th>{row.rounds.map((count, index) => { const minutes = PAYOUT_ROUND_COLUMNS[index] ?? 30; return <td key={`${row.key}-${minutes}`} className="payout-number-cell"><input aria-label={`${minutes} นาที วันที่ ${row.date.getDate()}/${row.date.getMonth() + 1}`} type="number" min="0" step="1" value={count || ""} onChange={event => updatePersonalRound(row.key, minutes, event.target.value)} placeholder="0" /></td>; })}<td className="hours-cell">{row.driveHours ? row.driveHours.toFixed(1) : "0"}</td><td className={`row-total-cell ${row.totalRounds > 0 ? "has-value" : "empty"}`}><strong>{row.totalRounds}</strong><small>฿{row.payout.toLocaleString("th-TH")}</small></td></tr>)}</tbody><tfoot><tr><th>รวม</th>{personalRoundTotals.map((total, index) => <td key={`total-${index}`}>{total}</td>)}<td className="hours-total">{personalDriveHours.toFixed(1)}</td><td className="row-total-total">{personalTotalRounds}</td></tr></tfoot></table></div><p className="m3-payout-swipe-hint">แตะช่อง 30/60 เพื่อกรอกหรือแก้ไขจำนวนรอบของ {currentRoundTableUser.name}</p><div className="m3-payout-summary"><div><span>รวมชั่วโมงขับ</span><strong>{personalDriveHours.toFixed(1)}</strong></div><div><span>จำนวนรอบ</span><strong>{personalTotalRounds}</strong></div><div><span>เป็นเงินจำนวน</span><strong>฿{personalTotalPayout.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</strong></div></div><div className="m3-payout-period"><strong>{currentRoundTableUser.name}</strong><span>{new Intl.DateTimeFormat("th-TH", { month: "long" }).format(roundPageMonth)} · {roundPageLabel}</span></div></> : <div className="mechanic-round-empty"><Table2 size={20} /><p>{mechanicLoginKey ? "ไม่พบผู้ใช้งานไกด์หรือช่างที่ตรงกับรหัสเข้าสู่ระบบนี้" : "ยังไม่พบรหัสผู้ใช้งานปัจจุบัน"}</p><small>กรุณาเข้าสู่ระบบด้วยรหัสที่อยู่ใน directory กลางก่อนเปิดตารางค่ารอบ</small></div>}</section>}

        {tab === "communication" && <section className="mechanic-feature-panel communication-page" aria-label="ห้องสื่อสาร"><div className="mechanic-feature-heading"><div><p>MECHANIC / COMMUNICATION</p><h3>ห้องสื่อสาร</h3><span>PTT และข้อความร่วมกับไกด์และหัวหน้า</span></div><MessageCircle size={22} /></div><PttRoomPanel /><CommunicationChat module="mechanic" /></section>}

        {tab === "roundChange" && <section className="mechanic-feature-panel mechanic-round-change-panel" aria-label="ตั้งค่ารอบเปลี่ยน"><div className="mechanic-feature-heading"><div><p>MECHANIC / VEHICLE MAINTENANCE</p><h3>ตั้งค่ารอบเปลี่ยน</h3></div><RotateCcw size={22} /></div><div className="mechanic-round-change-toolbar"><button type="button" className="mechanic-visible-add-alert" onClick={openMaintenanceForm}><Plus size={17} /> เพิ่มแจ้งเตือนใหม่</button></div><div className="mechanic-round-change-tabs mechanic-alert-tab-strip" role="tablist" aria-label="แท็บรถและแจ้งเตือน"><button type="button" role="tab" aria-selected={roundChangeView === "vehicles"} className={roundChangeView === "vehicles" ? "selected" : ""} onClick={() => setRoundChangeView("vehicles")}><Table2 size={15} /> รถทุกคันในระบบ</button>{roundChangeSettings.rules.map(rule => { const dueCount = maintenanceAlerts.filter(alert => alert.ruleId === rule.id && alert.due).length; const selected = roundChangeView === "alerts" && activeMaintenanceRule?.id === rule.id; return <button type="button" role="tab" key={rule.id} aria-selected={selected} className={selected ? "selected" : ""} onClick={() => { setMaintenanceViewRuleId(rule.id); setRoundChangeView("alerts"); }}><AlertTriangle size={15} /> <span>{rule.name}</span>{dueCount > 0 && <b className="mechanic-alert-tab-count">{dueCount > 99 ? "99+" : dueCount}</b>}</button>; })}</div>{roundChangeView === "vehicles" ? <><div className="mechanic-vehicle-overview" aria-label="สรุปภาพรวมรถ"><div><span>รถทั้งหมด</span><strong>{totalFleetVehicles}</strong><small>คัน</small></div><div><span>200 ซีซี</span><strong>{maintenanceTableGroups.find(group => group.cc === "200")?.rows.length ?? 0}</strong><small>คัน</small></div><div><span>250 ซีซี</span><strong>{maintenanceTableGroups.find(group => group.cc === "250")?.rows.length ?? 0}</strong><small>คัน</small></div><div className={dueFleetVehicles > 0 ? "attention" : "ok"}><span>ถึงรอบ</span><strong>{dueFleetVehicles}</strong><small>คัน</small></div></div><div className="mechanic-vehicle-ledger">{maintenanceTableGroups.map(group => <section className="mechanic-vehicle-group" key={group.cc} aria-labelledby={`vehicle-group-${group.cc}`}><header><div><span>VEHICLE GROUP</span><h4 id={`vehicle-group-${group.cc}`}>{group.label}</h4></div><b>{group.rows.length} คัน</b></header><div className="mechanic-vehicle-table-wrap"><table className="mechanic-vehicle-table"><thead><tr><th>เบอร์รถ</th><th>แถบสะสม</th><th>สะสม / ตั้ง</th><th>เคลียร์</th></tr></thead><tbody>{group.rows.map(row => { const isDue = Boolean(activeMaintenanceRule?.enabled && row.thresholdHours > 0 && row.accumulatedHours >= row.thresholdHours); return <tr key={row.number} className={`mechanic-vehicle-alert-row ${row.level}`}><th scope="row"><span className="supervisor-status-vehicle-number"><b>#{row.number}</b><VehicleSafetyNoticeIndicator notices={safetyNotices} vehicleNumber={Number(row.number)} accentColor={getResponsibilityGroupColor(Number(row.number), vehicleState.responsibilityGroups)} onOpen={openSafetyNotices} /><small>{vehicleResponsibilityMeta(Number(row.number)).groupLabel} · {vehicleResponsibilityMeta(Number(row.number)).managerLabel}</small></span></th><td><div className={`mechanic-usage-meter ${row.level}`} aria-label={`รถหมายเลข ${row.number} ใช้ไป ${row.accumulatedHours.toFixed(1)} ชั่วโมง คิดเป็น ${row.progress.toFixed(0)} เปอร์เซ็นต์ของเกณฑ์`}><span style={{ width: `${row.progress}%` }} /></div></td><td><strong>{row.accumulatedHours.toFixed(1)}</strong><span> / {row.thresholdHours > 0 ? `${row.thresholdHours.toFixed(1)}` : "—"}</span><em className={`mechanic-ledger-alert ${isDue ? "due" : "normal"}`}>{isDue ? "ถึงรอบ" : "ปกติ"}</em></td><td><button type="button" className="mechanic-clear-hours" onClick={() => clearMaintenanceVehicleHours(row.number)} disabled={!activeMaintenanceRule || row.accumulatedHours <= 0}>เคลียร์ชั่วโมง</button></td></tr>; })}</tbody></table></div></section>)}</div></> : <><div className="mechanic-alert-page">{activeMaintenanceRule ? <><header><div><span>MAINTENANCE ALERT</span><h4>{activeMaintenanceRule.name}</h4></div><div className="mechanic-alert-page-meta"><div className="mechanic-alert-due-count"><b>{maintenanceAlerts.filter(alert => alert.ruleId === activeMaintenanceRule.id && alert.due).length}</b><small>คันถึงรอบ</small></div><div className="mechanic-alert-actions"><button type="button" className="mechanic-alert-edit" onClick={beginMaintenanceEdit}><Pencil size={13} /> แก้ไข</button><button type="button" className="mechanic-alert-cancel-rule" onClick={cancelMaintenanceRule}><Trash2 size={13} /> ยกเลิกแจ้งเตือน</button></div></div></header>{editingMaintenanceRuleId === activeMaintenanceRule.id && <div className="mechanic-maintenance-edit-form"><input autoFocus value={editingMaintenanceName} onChange={event => setEditingMaintenanceName(event.target.value)} placeholder="ชื่อหัวข้อแจ้งเตือน" aria-label="แก้ชื่อหัวข้อแจ้งเตือน" /><div className="mechanic-maintenance-add-thresholds"><label><span>200cc</span><input type="number" min="0" step="0.5" value={editingMaintenanceThresholds["200"]} onChange={event => setEditingMaintenanceThresholds(current => ({ ...current, "200": event.target.value }))} placeholder="ชั่วโมง" aria-label="แก้เกณฑ์แจ้งเตือน 200cc" /></label><label><span>250cc</span><input type="number" min="0" step="0.5" value={editingMaintenanceThresholds["250"]} onChange={event => setEditingMaintenanceThresholds(current => ({ ...current, "250": event.target.value }))} placeholder="ชั่วโมง" aria-label="แก้เกณฑ์แจ้งเตือน 250cc" /></label></div><div className="mechanic-alert-edit-actions"><button type="button" className="m3-primary" disabled={!editingMaintenanceName.trim()} onClick={saveMaintenanceEdit}><Save size={14} /> บันทึกแก้ไข</button><button type="button" className="mechanic-maintenance-cancel" onClick={cancelMaintenanceEdit}>ยกเลิกการแก้ไข</button></div></div>}<div className="mechanic-alert-page-groups">{maintenanceVehicleGroups}</div></> : <div className="mechanic-round-empty"><AlertTriangle size={20} /><p>ยังไม่มีหัวข้อแจ้งเตือน</p></div>}</div><div className="mechanic-maintenance-add">{showMaintenanceForm ? <div className="mechanic-maintenance-add-form"><input autoFocus value={newMaintenanceName} onChange={event => setNewMaintenanceName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addRoundChangeRule(); }} placeholder="หัวข้อแจ้งเตือน เช่น น้ำมันเครื่อง" aria-label="ชื่อหัวข้อบำรุงรักษา" /><div className="mechanic-maintenance-add-thresholds"><label><span>200cc</span><input type="number" min="0" step="0.5" value={newMaintenanceThresholds["200"]} onChange={event => setNewMaintenanceThresholds(current => ({ ...current, "200": event.target.value }))} placeholder="ชั่วโมง" aria-label="เกณฑ์แจ้งเตือน 200cc" /></label><label><span>250cc</span><input type="number" min="0" step="0.5" value={newMaintenanceThresholds["250"]} onChange={event => setNewMaintenanceThresholds(current => ({ ...current, "250": event.target.value }))} placeholder="ชั่วโมง" aria-label="เกณฑ์แจ้งเตือน 250cc" /></label></div><button type="button" className="m3-primary" disabled={!canCreateMaintenanceRule} onClick={addRoundChangeRule}><Plus size={15} /> สร้างยืนยัน</button><button type="button" className="mechanic-maintenance-cancel" onClick={() => { setShowMaintenanceForm(false); setNewMaintenanceName(""); setNewMaintenanceThresholds({ 200: "", 250: "" }); }}>ยกเลิก</button></div> : null}</div><div className="mechanic-maintenance-rules mechanic-alert-legacy-settings">{roundChangeSettings.rules.filter(rule => rule.id === activeMaintenanceRule?.id).map(rule => { const ruleAlerts = maintenanceAlerts.filter(alert => alert.ruleId === rule.id); const dueAlerts = ruleAlerts.filter(alert => alert.due); return <article className={`mechanic-maintenance-rule ${rule.enabled ? "enabled" : "disabled"}`} key={rule.id}><header><div><small>หัวข้อเฝ้าเตือน</small><h4>{rule.name}</h4></div><label className="mechanic-maintenance-toggle"><input type="checkbox" checked={rule.enabled} onChange={event => toggleRoundChangeRule(rule.id, event.target.checked)} /><span>{rule.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span></label></header><div className="mechanic-maintenance-thresholds"><label><span>กลุ่ม 200cc</span><div><input type="number" min="0" step="0.5" value={rule.thresholdHours[200] || ""} onChange={event => updateRoundChangeThreshold(rule.id, "200", event.target.value)} placeholder="ยังไม่ตั้ง" /><b>ชั่วโมงขับ</b></div></label><label><span>กลุ่ม 250cc</span><div><input type="number" min="0" step="0.5" value={rule.thresholdHours[250] || ""} onChange={event => updateRoundChangeThreshold(rule.id, "250", event.target.value)} placeholder="ยังไม่ตั้ง" /><b>ชั่วโมงขับ</b></div></label></div><div className="mechanic-maintenance-status"><strong>{dueAlerts.length ? `ถึงรอบแล้ว ${dueAlerts.length} คัน` : "ยังไม่มีรถถึงเกณฑ์"}</strong>{dueAlerts.length > 0 && <div>{dueAlerts.map(alert => <span className="mechanic-maintenance-due" style={{ color: getResponsibilityGroupColor(Number(alert.vehicleNumber), vehicleState.responsibilityGroups), borderColor: getResponsibilityGroupColor(Number(alert.vehicleNumber), vehicleState.responsibilityGroups) }} key={`${alert.ruleId}-${alert.vehicleNumber}`}>#{alert.vehicleNumber} · {alert.accumulatedHours.toFixed(1)}/{alert.thresholdHours.toFixed(1)} ชม. · {vehicleResponsibilityMeta(Number(alert.vehicleNumber)).managerLabel}</span>)}</div>}{ruleAlerts.some(alert => !alert.due) && <small>{ruleAlerts.filter(alert => !alert.due).slice(0, 3).map(alert => `#${alert.vehicleNumber} เหลือ ${alert.remainingHours.toFixed(1)} ชม.`).join(" · ")}</small>}</div><button type="button" className="mechanic-maintenance-remove" onClick={() => removeRoundChangeRule(rule.id)}><Trash2 size={13} /> ลบหัวข้อนี้</button></article>; })}{!roundChangeSettings.rules.length && <div className="mechanic-round-empty"><RotateCcw size={20} /><p>ยังไม่มีหัวข้อเฝ้าเตือน</p><small>เพิ่มหัวข้อ เช่น น้ำมันเครื่อง ผ้าเบรก หรือแบตเตอรี่</small></div>}</div></>}</section>}

        {tab === "settings" && <section className="mechanic-feature-panel" aria-label="ตั้งค่าโมดูลช่าง"><div className="mechanic-feature-heading"><div><p>MECHANIC / SETTINGS</p><h3>ตั้งค่า</h3><span>จัดการตัวเลือกที่ใช้ในรายการแจ้งซ่อม</span></div><Settings2 size={22} /></div><SpeechSettingsPanel moduleName="Mechanic" /><div className="mechanic-settings-card"><h4>ตัวเลือกอะไหล่</h4><p>รายการนี้จะแสดงในช่องอะไหล่เบิกซ่อม</p><div className="mechanic-repair-option-list">{repairPartOptions.map(option => <span key={option}>{option}<button type="button" aria-label={`ลบตัวเลือก ${option}`} onClick={() => removeRepairPartOption(option)}><Trash2 size={11} /></button></span>)}</div><div className="mechanic-settings-add"><input value={newRepairPartOption} onChange={event => setNewRepairPartOption(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addRepairPartOption(); }} placeholder="เพิ่มตัวเลือกอะไหล่" aria-label="เพิ่มตัวเลือกอะไหล่" /><button type="button" className="m3-primary" onClick={addRepairPartOption}><Plus size={14} /> เพิ่ม</button></div></div><div className="mechanic-settings-card"><h4>ข้อมูลร่วมของแอป</h4><p>สถานะรถ รายชื่อผู้ใช้งาน และกลุ่มผู้รับผิดชอบอ่านจากฐานข้อมูลกลางเดียวกัน</p><button type="button" className="m3-secondary" onClick={() => { void supervisorFleetSnapshotQuery.refetch(); }}><RefreshCw size={14} /> รีเฟรชข้อมูลกลาง</button></div></section>}

        </div>
      </div>
    </section>
    {mechanicBottomNav}
  </main>;
}
