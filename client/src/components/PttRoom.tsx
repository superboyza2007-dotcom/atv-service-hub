import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Mic, MicOff, Radio, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import { getPttSocketUrl, makePttClientId, PTT_ROOM_ID, pttModuleFromQuery, pttModuleLabel, shouldPromptForPttAccess, type PttModule } from "@/lib/ptt-room";
import { trpc } from "@/lib/trpc";

type PttPeer = { clientId: string; name: string; module: string };
type PttSpeaker = PttPeer | null;
type PttSignal = { type: string; from?: PttPeer; speaker?: PttSpeaker; peers?: PttPeer[]; clientId?: string; signal?: { offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null } };

type PttContextValue = {
  connected: boolean;
  connecting: boolean;
  microphoneReady: boolean;
  permissionGranted: boolean;
  permissionPromptOpen: boolean;
  audioBlocked: boolean;
  isTalking: boolean;
  speaker: PttSpeaker;
  peers: PttPeer[];
  error: string;
  startTalking: () => Promise<void>;
  stopTalking: () => void;
  requestAccess: () => Promise<void>;
  openPermissionPrompt: () => void;
  dismissPermissionPrompt: () => void;
  enableAudio: () => void;
  openPermissionSettings: () => void;
  permissionHelpOpen: boolean;
  retryPermissionCheck: () => void;
  dismissPermissionHelp: () => void;
};

const PttRoomContext = createContext<PttContextValue | null>(null);

function sendSocketMessage(socket: WebSocket | null, payload: unknown) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

export function PttRoomProvider({ children }: { children: ReactNode }) {
  const module = useMemo(() => pttModuleFromQuery(typeof window === "undefined" ? "" : window.location.search), []);
  const identityQuery = trpc.directory.me.useQuery(undefined, { retry: false });
  const identityName = identityQuery.data?.name ?? "";
  const clientIdRef = useRef<string>("");
  const socketRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>());
  const peerMetaRef = useRef(new Map<string, PttPeer>());
  const audioElementsRef = useRef(new Map<string, HTMLAudioElement>());
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionPromptOpen, setPermissionPromptOpen] = useState(false);
  const [permissionHelpOpen, setPermissionHelpOpen] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [speaker, setSpeaker] = useState<PttSpeaker>(null);
  const [peers, setPeers] = useState<PttPeer[]>([]);
  const [error, setError] = useState("");
  const talkRequestedRef = useRef(false);

  const syncPeers = useCallback(() => setPeers(Array.from(peerMetaRef.current.values())), []);

  const closePeer = useCallback((peerId: string) => {
    peerConnectionsRef.current.get(peerId)?.close();
    peerConnectionsRef.current.delete(peerId);
    const audio = audioElementsRef.current.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    }
    audioElementsRef.current.delete(peerId);
    peerMetaRef.current.delete(peerId);
    syncPeers();
  }, [syncPeers]);

  const sendSignal = useCallback((targetId: string, signal: PttSignal["signal"]) => {
    sendSocketMessage(socketRef.current, { type: "signal", targetId, signal });
  }, []);

  const attachLocalTracks = useCallback((connection: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      if (!connection.getSenders().some(sender => sender.track === track)) connection.addTrack(track, stream);
    }
  }, []);

  const createPeerConnection = useCallback((peer: PttPeer, shouldOffer: boolean) => {
    const existing = peerConnectionsRef.current.get(peer.clientId);
    if (existing) return existing;
    const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerConnectionsRef.current.set(peer.clientId, connection);
    peerMetaRef.current.set(peer.clientId, peer);
    syncPeers();
    attachLocalTracks(connection);
    connection.onicecandidate = event => {
      if (event.candidate) sendSignal(peer.clientId, { candidate: event.candidate.toJSON() });
    };
    connection.ontrack = event => {
      const stream = event.streams[0];
      if (!stream) return;
      let audio = audioElementsRef.current.get(peer.clientId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audio.setAttribute("aria-hidden", "true");
        document.body.appendChild(audio);
        audioElementsRef.current.set(peer.clientId, audio);
      }
      audio.srcObject = stream;
      audio.play().catch(() => setAudioBlocked(true));
    };
    connection.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(connection.connectionState)) closePeer(peer.clientId);
    };
    if (shouldOffer) {
      void connection.createOffer().then(offer => connection.setLocalDescription(offer).then(() => sendSignal(peer.clientId, { offer })));
    }
    return connection;
  }, [attachLocalTracks, closePeer, sendSignal, syncPeers]);

  const ensureMicrophone = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("เบราว์เซอร์นี้ไม่รองรับไมโครโฟน");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    for (const track of stream.getAudioTracks()) track.enabled = false;
    localStreamRef.current = stream;
    setMicrophoneReady(true);
    for (const [peerId, connection] of Array.from(peerConnectionsRef.current.entries())) {
      attachLocalTracks(connection);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      sendSignal(peerId, { offer });
    }
    return stream;
  }, [attachLocalTracks, sendSignal]);

  const enableAudio = useCallback(() => {
    setAudioBlocked(false);
    for (const audio of Array.from(audioElementsRef.current.values())) void audio.play().catch(() => setAudioBlocked(true));
  }, []);

  const openPermissionPrompt = useCallback(() => {
    if (!permissionGranted) {
      setPermissionHelpOpen(false);
      setPermissionPromptOpen(true);
    }
  }, [permissionGranted]);

  const dismissPermissionPrompt = useCallback(() => setPermissionPromptOpen(false), []);

  const openPermissionSettings = useCallback(() => {
    setPermissionHelpOpen(true);
    setPermissionPromptOpen(false);
    const settingsUrl = `chrome://settings/content/siteDetails?site=${encodeURIComponent(window.location.origin)}`;
    const opened = window.open(settingsUrl, "_blank", "noopener,noreferrer");
    if (!opened) setError("เปิดหน้าตั้งค่าอัตโนมัติไม่ได้บน browser นี้ กรุณาแตะไอคอนล็อกข้างที่อยู่เว็บ → สิทธิ์ → ไมโครโฟน → อนุญาต แล้วกลับมาเปิดหน้านี้ใหม่");
  }, []);

  const retryPermissionCheck = useCallback(() => {
    setPermissionHelpOpen(false);
    setPermissionPromptOpen(true);
  }, []);

  const dismissPermissionHelp = useCallback(() => setPermissionHelpOpen(false), []);

  const requestAccess = useCallback(async () => {
    setError("");
    try {
      await ensureMicrophone();
      setPermissionGranted(true);
      setPermissionPromptOpen(false);
      setPermissionHelpOpen(false);
      enableAudio();
    } catch (cause) {
      setPermissionGranted(false);
      setPermissionPromptOpen(false);
      setPermissionHelpOpen(true);
      setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "เจ้าของเครื่องยังไม่อนุญาตไมโครโฟน กรุณากดอนุญาตในหน้าต่างของเบราว์เซอร์" : cause instanceof Error ? cause.message : "ขอสิทธิ์อุปกรณ์ไม่สำเร็จ");
    }
  }, [enableAudio, ensureMicrophone]);

  useEffect(() => {
    let disposed = false;
    const syncMicrophonePermission = async () => {
      if (!navigator.permissions?.query) return;
      try {
        const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (!disposed) {
          setPermissionGranted(result.state === "granted");
        }
      } catch {
        // Some mobile browsers do not expose microphone through Permissions API; getUserMedia remains the source of truth.
      }
    };
    void syncMicrophonePermission();
    window.addEventListener("focus", syncMicrophonePermission);
    document.addEventListener("visibilitychange", syncMicrophonePermission);
    return () => { disposed = true; window.removeEventListener("focus", syncMicrophonePermission); document.removeEventListener("visibilitychange", syncMicrophonePermission); };
  }, []);

  useEffect(() => {
    if (shouldPromptForPttAccess(connected, permissionGranted)) setPermissionPromptOpen(true);
  }, [connected, permissionGranted]);

  const handleSignal = useCallback(async (message: PttSignal) => {
    if (!message.from || !message.signal) return;
    const connection = createPeerConnection(message.from, false);
    try {
      if (message.signal.offer) {
        await connection.setRemoteDescription(message.signal.offer);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        sendSignal(message.from.clientId, { answer });
      } else if (message.signal.answer) {
        await connection.setRemoteDescription(message.signal.answer);
      } else if (message.signal.candidate) {
        await connection.addIceCandidate(message.signal.candidate);
      }
    } catch {
      setError("เชื่อมต่อเสียงกับผู้ใช้บางรายไม่สำเร็จ");
    }
  }, [createPeerConnection, sendSignal]);

  useEffect(() => {
    if (!identityName) return;
    clientIdRef.current = makePttClientId();
    const socket = new WebSocket(getPttSocketUrl(window.location));
    socketRef.current = socket;
    setConnecting(true);
    socket.onopen = () => {
      setConnected(true);
      setConnecting(false);
      setError("");
      sendSocketMessage(socket, { type: "join", roomId: PTT_ROOM_ID, clientId: clientIdRef.current, name: identityName, module });
    };
    socket.onmessage = event => {
      let message: PttSignal;
      try {
        message = JSON.parse(event.data) as PttSignal;
      } catch {
        return;
      }
      if (message.type === "joined") {
        setPeers(message.peers ?? []);
        for (const peer of message.peers ?? []) {
          peerMetaRef.current.set(peer.clientId, peer);
          createPeerConnection(peer, true);
        }
        setSpeaker(message.speaker ?? null);
      } else if (message.type === "peer_joined" && message.from) {
        peerMetaRef.current.set(message.from.clientId, message.from);
        syncPeers();
        if (localStreamRef.current) createPeerConnection(message.from, true);
      } else if (message.type === "peer_left" && message.clientId) {
        closePeer(message.clientId);
      } else if (message.type === "signal") {
        void handleSignal(message);
      } else if (message.type === "speaker_state") {
        setSpeaker(message.speaker ?? null);
      } else if (message.type === "ptt_denied") {
        setIsTalking(false);
        for (const track of localStreamRef.current?.getAudioTracks() ?? []) track.enabled = false;
        setError(`กำลังพูดอยู่: ${message.speaker?.name ?? "ผู้ใช้งานอื่น"}`);
      }
    };
    socket.onclose = () => {
      setConnected(false);
      setConnecting(false);
      setSpeaker(null);
    };
    socket.onerror = () => {
      setConnected(false);
      setConnecting(false);
      setError("ยังเชื่อมต่อห้องเสียงไม่ได้");
    };
    return () => {
      talkRequestedRef.current = false;
      socket.close();
      for (const peerId of Array.from(peerConnectionsRef.current.keys())) closePeer(peerId);
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    };
  }, [closePeer, createPeerConnection, handleSignal, identityName, module, syncPeers]);

  const startTalking = useCallback(async () => {
    if (!connected || isTalking) return;
    if (!permissionGranted) {
      openPermissionPrompt();
      return;
    }
    talkRequestedRef.current = true;
    setError("");
    try {
      const stream = await ensureMicrophone();
      if (!talkRequestedRef.current) return;
      sendSocketMessage(socketRef.current, { type: "ptt_start" });
      for (const track of stream.getAudioTracks()) track.enabled = true;
      setIsTalking(true);
      setSpeaker({ clientId: clientIdRef.current, name: identityName, module });
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "กรุณาอนุญาตการใช้ไมโครโฟนก่อนกดพูด" : cause instanceof Error ? cause.message : "เปิดไมโครโฟนไม่สำเร็จ");
    }
  }, [connected, ensureMicrophone, identityName, isTalking, module, openPermissionPrompt, permissionGranted]);

  const stopTalking = useCallback(() => {
    talkRequestedRef.current = false;
    if (!isTalking) return;
    for (const track of localStreamRef.current?.getAudioTracks() ?? []) track.enabled = false;
    sendSocketMessage(socketRef.current, { type: "ptt_stop" });
    setIsTalking(false);
    setSpeaker(null);
  }, [isTalking]);

  const value = useMemo<PttContextValue>(() => ({ connected, connecting, microphoneReady, permissionGranted, permissionPromptOpen, audioBlocked, isTalking, speaker, peers, error, startTalking, stopTalking, requestAccess, openPermissionPrompt, dismissPermissionPrompt, enableAudio, openPermissionSettings, permissionHelpOpen, retryPermissionCheck, dismissPermissionHelp }), [audioBlocked, connected, connecting, dismissPermissionHelp, dismissPermissionPrompt, enableAudio, error, isTalking, microphoneReady, openPermissionPrompt, openPermissionSettings, peers, permissionGranted, permissionPromptOpen, requestAccess, speaker, startTalking, stopTalking, permissionHelpOpen, retryPermissionCheck]);

  return <PttRoomContext.Provider value={value}>{children}<PttGlobalReceiver /></PttRoomContext.Provider>;
}

export function usePttRoom() {
  const context = useContext(PttRoomContext);
  if (!context) throw new Error("usePttRoom must be used inside PttRoomProvider");
  return context;
}

function PttGlobalReceiver() {
  const { speaker, audioBlocked, enableAudio } = usePttRoom();
  if (!speaker && !audioBlocked) return null;
  return <div className={`ptt-global-receiver ${speaker ? "speaking" : "audio-blocked"}`} role="status" aria-live="polite">{audioBlocked ? <><VolumeX size={15} /><span>แตะเพื่อเปิดเสียง PTT</span><button type="button" onClick={enableAudio}>เปิดเสียง</button></> : <><Radio size={15} /><span>{speaker?.name} กำลังพูด · {pttModuleLabel(speaker?.module === "mechanic" || speaker?.module === "supervisor" ? speaker.module : "guide")}</span></>}</div>;
}

export function PttRoomPanel() {
  const { connected, connecting, microphoneReady, permissionGranted, permissionPromptOpen, isTalking, speaker, peers, audioBlocked, error, startTalking, stopTalking, requestAccess, openPermissionPrompt, dismissPermissionPrompt, enableAudio, openPermissionSettings, permissionHelpOpen, retryPermissionCheck, dismissPermissionHelp } = usePttRoom();
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    void startTalking();
  };
  const releaseTalking = () => stopTalking();
  const speakerName = speaker?.name ?? "ไม่มีผู้กำลังพูด";
  return <section className="ptt-room-panel" aria-label="ระบบ PTT ห้องสื่อสาร"><div className="ptt-room-heading"><div><p>PTT / LIVE VOICE ROOM</p><h3>วิทยุสื่อสารสด</h3><span>{connected ? `${peers.length + 1} เครื่องอยู่ในห้องเสียงร่วม` : connecting ? "กำลังเชื่อมต่อห้องเสียง" : "ยังไม่เชื่อมต่อห้องเสียง"}</span></div><div className={`ptt-connection-state ${connected ? "online" : "offline"}`}>{connected ? <Wifi size={16} /> : <WifiOff size={16} />}<small>{connected ? "ออนไลน์" : "ออฟไลน์"}</small></div></div><div className={`ptt-speaker-status ${speaker ? "speaking" : "idle"}`}><span className="ptt-speaker-dot" />{speaker ? <><strong>{speakerName}</strong><span>กำลังส่งเสียงสด</span></> : <span>ช่องว่างพร้อมรับเสียง</span>}</div><button type="button" className={`ptt-talk-button ${isTalking ? "talking" : ""}`} onPointerDown={handlePointerDown} onPointerUp={releaseTalking} onPointerCancel={releaseTalking} onPointerLeave={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) releaseTalking(); }} onContextMenu={event => event.preventDefault()} disabled={!connected} aria-label="กดค้างเพื่อพูดผ่าน PTT">{isTalking ? <Mic size={28} /> : <MicOff size={28} />}<strong>{isTalking ? "กำลังพูด · ปล่อยเพื่อหยุด" : "กดค้างเพื่อพูด"}</strong><small>{microphoneReady ? "ไมโครโฟนพร้อมใช้งาน" : "ต้องอนุญาตไมโครโฟนก่อนใช้งาน"}</small></button>{!permissionGranted && <button type="button" className="ptt-request-access-inline" onClick={openPermissionPrompt}><Mic size={15} /> ขออนุญาตไมโครโฟนและเปิดเสียง</button>}{audioBlocked && <button type="button" className="ptt-enable-audio" onClick={enableAudio}><Volume2 size={15} /> เปิดเสียงลำโพง</button>}{error && <p className="ptt-room-error">{error}</p>}{permissionPromptOpen && connected && <div className="ptt-permission-backdrop" role="presentation"><section className="ptt-permission-dialog" role="dialog" aria-modal="true" aria-labelledby="ptt-permission-title"><div className="ptt-permission-icon"><Mic size={24} /></div><p>PTT / DEVICE ACCESS</p><h4 id="ptt-permission-title">อนุญาตใช้งานไมโครโฟนและลำโพง</h4><span>เพื่อรับฟังเสียงจากห้องสื่อสารและกดค้างเพื่อพูด ระบบจะขอสิทธิ์ไมโครโฟนจากเจ้าของเครื่อง</span><div className="ptt-permission-actions"><button type="button" className="ptt-permission-later" onClick={dismissPermissionPrompt}>ไว้ก่อน</button><button type="button" className="ptt-permission-help" onClick={openPermissionSettings}>ไปตั้งค่าสิทธิ์</button><button type="button" className="ptt-permission-allow" onClick={() => void requestAccess()}><Mic size={15} /> อนุญาตและเปิดเสียง</button></div></section></div>}{permissionHelpOpen && <div className="ptt-permission-backdrop" role="presentation"><section className="ptt-permission-dialog ptt-permission-help-dialog" role="dialog" aria-modal="true" aria-labelledby="ptt-permission-help-title"><div className="ptt-permission-icon"><Mic size={24} /></div><p>PTT / BROWSER SETTINGS</p><h4 id="ptt-permission-help-title">สิทธิ์ไมโครโฟนยังไม่เปิด</h4><span>บนมือถือให้เปิดเมนูของ browser หรือแตะไอคอนล็อกข้างที่อยู่เว็บ แล้วเลือก สิทธิ์ → ไมโครโฟน → อนุญาต จากนั้นกลับมาที่หน้านี้แล้วกดตรวจใหม่</span><div className="ptt-permission-actions"><button type="button" className="ptt-permission-later" onClick={dismissPermissionHelp}>ปิด</button><button type="button" className="ptt-permission-allow" onClick={retryPermissionCheck}><Mic size={15} /> ตรวจสิทธิ์อีกครั้ง</button></div></section></div>}</section>;
}
