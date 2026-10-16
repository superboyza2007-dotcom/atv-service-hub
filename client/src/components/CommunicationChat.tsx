import { useMemo, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import type { AppModule } from "@/lib/app-access";
import { trpc } from "@/lib/trpc";

function formatThaiDate(value: Date | string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

const COMMUNICATION_ROOM_ID = "communication-room";
const communicationModuleLabels: Record<AppModule, string> = { guide: "ไกด์", mechanic: "ช่าง", supervisor: "หัวหน้า" };

type CommunicationChatMessage = {
  id: string;
  text: string;
  author: string;
  module: AppModule;
  createdAt: string;
};

export default function CommunicationChat({ module }: { module: AppModule }) {
  const [text, setText] = useState("");
  const utils = trpc.useUtils();
  const identityQuery = trpc.directory.me.useQuery(undefined, { retry: false, refetchInterval: 5_000 });
  const roomQuery = trpc.liveMessages.list.useQuery(
    { channelType: "room", channelId: COMMUNICATION_ROOM_ID },
    { retry: false, refetchInterval: 1_000 },
  );
  const sendMutation = trpc.liveMessages.send.useMutation({
    onSuccess: () => utils.liveMessages.list.invalidate({ channelType: "room", channelId: COMMUNICATION_ROOM_ID }),
  });
  const messages = useMemo<CommunicationChatMessage[]>(() => (roomQuery.data ?? []).map(row => ({
    id: String(row.id),
    text: row.body,
    author: row.senderName,
    module: row.senderModule,
    createdAt: new Date(row.createdAt).toISOString(),
  })), [roomQuery.data]);
  const author = identityQuery.data?.name ?? "รอข้อมูลผู้ใช้จาก Server";

  const sendMessage = () => {
    const body = text.trim();
    if (!body || !identityQuery.data || sendMutation.isPending) return;
    sendMutation.mutate({
      channelType: "room",
      channelId: COMMUNICATION_ROOM_ID,
      module,
      body,
    }, { onSuccess: () => setText("") });
  };

  return <section className="communication-chat" aria-label="แชตข้อความห้องสื่อสาร">
    <div className="communication-chat-heading"><div><p>SHARED TEXT CHAT</p><h3>ข้อความร่วมทุกโมดูล</h3><span>ไกด์ ช่าง และหัวหน้าเห็นข้อความในห้องเดียวกัน</span></div><MessageCircle size={20} /></div>
    <div className="communication-chat-list" aria-live="polite">
      {roomQuery.isError ? <p className="m3-empty" role="alert">เชื่อมต่อข้อความบน Server ไม่ได้</p> : roomQuery.isLoading ? <p className="m3-empty">กำลังโหลดข้อความจาก Server…</p> : messages.length ? messages.map(message => <article key={message.id}><div><b>{message.author}</b><small>{communicationModuleLabels[message.module]} · {formatThaiDate(message.createdAt)}</small></div><p>{message.text}</p></article>) : <p className="m3-empty">ยังไม่มีข้อความในห้องสื่อสาร</p>}
    </div>
    <div className="communication-chat-compose"><input value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder={`พิมพ์ข้อความถึงทีม${communicationModuleLabels[module]}`} aria-label="ข้อความห้องสื่อสาร" /><button type="button" className="m3-primary" onClick={sendMessage} disabled={!text.trim() || !identityQuery.data || sendMutation.isPending}><Send size={15} /> {sendMutation.isPending ? "กำลังส่ง…" : "ส่งข้อความ"}</button></div>
    {sendMutation.isError && <small role="alert">ส่งข้อความไป Server ไม่สำเร็จ ข้อความยังอยู่ในช่องพิมพ์</small>}
    <small className="communication-chat-identity">ส่งในนาม <strong>{author}</strong> · Server sync 1s</small>
  </section>;
}
