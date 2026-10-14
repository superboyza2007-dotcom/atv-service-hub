import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";

type PttClient = { id: string; name: string; module: string; roomId: string; ws: WebSocket };
type PttSignalMessage = { type: string; roomId?: string; clientId?: string; name?: string; module?: string; targetId?: string; signal?: unknown; speakerId?: string; speakerName?: string; speakerModule?: string };

const clients = new Map<string, PttClient>();
const roomSpeakers = new Map<string, string>();
const wss = new WebSocketServer({ noServer: true });

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function roomMembers(roomId: string) {
  return Array.from(clients.values()).filter(client => client.roomId === roomId);
}

function broadcast(roomId: string, payload: unknown, exceptId?: string) {
  for (const client of roomMembers(roomId)) {
    if (client.id !== exceptId) send(client.ws, payload);
  }
}

function participant(client: PttClient) {
  return { clientId: client.id, name: client.name, module: client.module };
}

function removeClient(client: PttClient) {
  if (clients.get(client.id) !== client) return;
  clients.delete(client.id);
  if (roomSpeakers.get(client.roomId) === client.id) {
    roomSpeakers.delete(client.roomId);
    broadcast(client.roomId, { type: "speaker_state", speaker: null });
  }
  broadcast(client.roomId, { type: "peer_left", clientId: client.id });
}

function handleMessage(client: PttClient, raw: string) {
  let message: PttSignalMessage;
  try {
    message = JSON.parse(raw) as PttSignalMessage;
  } catch {
    return;
  }

  if (message.type === "join") {
    const roomId = typeof message.roomId === "string" && message.roomId ? message.roomId : "atv-operations-main";
    const id = typeof message.clientId === "string" && message.clientId ? message.clientId : crypto.randomUUID();
    const existing = clients.get(id);
    if (existing && existing.ws !== client.ws) {
      existing.ws.close(1000, "reconnected");
      removeClient(existing);
    }
    client.id = id;
    client.name = typeof message.name === "string" && message.name.trim() ? message.name.trim().slice(0, 80) : "ผู้ใช้งาน";
    client.module = typeof message.module === "string" ? message.module : "guide";
    client.roomId = roomId;
    clients.set(id, client);
    const peers = roomMembers(roomId).filter(peer => peer.id !== id).map(participant);
    send(client.ws, { type: "joined", clientId: id, peers, speaker: roomSpeakers.has(roomId) ? participant(roomMembers(roomId).find(peer => peer.id === roomSpeakers.get(roomId))!) : null });
    broadcast(roomId, { type: "peer_joined", peer: participant(client) }, id);
    return;
  }

  if (!client.id || !client.roomId) return;
  if (message.type === "signal" && message.targetId && message.signal !== undefined) {
    const target = clients.get(message.targetId);
    if (target && target.roomId === client.roomId) send(target.ws, { type: "signal", from: participant(client), signal: message.signal });
    return;
  }

  if (message.type === "ptt_start") {
    const activeSpeakerId = roomSpeakers.get(client.roomId);
    if (activeSpeakerId && activeSpeakerId !== client.id) {
      send(client.ws, { type: "ptt_denied", speaker: participant(roomMembers(client.roomId).find(peer => peer.id === activeSpeakerId)!) });
      return;
    }
    roomSpeakers.set(client.roomId, client.id);
    broadcast(client.roomId, { type: "speaker_state", speaker: participant(client) });
    return;
  }

  if (message.type === "ptt_stop" && roomSpeakers.get(client.roomId) === client.id) {
    roomSpeakers.delete(client.roomId);
    broadcast(client.roomId, { type: "speaker_state", speaker: null });
  }
}

wss.on("connection", (ws, request: IncomingMessage) => {
  const client: PttClient = { id: "", name: "ผู้ใช้งาน", module: "guide", roomId: "", ws };
  ws.on("message", data => handleMessage(client, data.toString()));
  ws.on("close", () => removeClient(client));
  ws.on("error", () => removeClient(client));
  send(ws, { type: "connected" });
  void request;
});

export function registerPttSignaling(server: HttpServer) {
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/ptt") return;
    wss.handleUpgrade(request, socket, head, ws => wss.emit("connection", ws, request));
  });
}
