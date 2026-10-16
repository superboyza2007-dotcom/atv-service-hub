import { MessageCircle } from "lucide-react";
import type { SessionChatMessage } from "@/lib/session-chat-sync";

export type ActiveSessionChatMessage = SessionChatMessage;

type ActiveSessionChatProps = {
  messages: ActiveSessionChatMessage[];
  draft: string;
  canSend: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  formatTime?: (value?: string) => string;
};

const defaultFormatTime = (value?: string) => value ? new Date(value).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }) : "—";

export function ActiveSessionChat({ messages, draft, canSend, onDraftChange, onSend, formatTime = defaultFormatTime }: ActiveSessionChatProps) {
  return <div className="m3-subpanel active-session-chat" aria-label="สื่อสารระหว่างงาน">
    <div className="m3-panel-title"><div><p>SESSION CHAT</p><h3>สื่อสารระหว่างงาน</h3></div><MessageCircle size={18} /></div>
    <div className="m3-chat" aria-live="polite">{messages.length ? messages.map(message => <p key={message.id}><b>{message.sender}</b><span>{message.text}</span><small>{formatTime(message.createdAt)}</small></p>) : <em>ยังไม่มีข้อความ</em>}</div>
    <div className="m3-chat-input"><input disabled={!canSend} value={draft} onChange={event => onDraftChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter") onSend(); }} placeholder={canSend ? "พิมพ์ข้อความใน Session นี้" : "ดูข้อความได้อย่างเดียว"} aria-label="พิมพ์ข้อความใน Session นี้" /><button type="button" disabled={!canSend || !draft.trim()} onClick={onSend} aria-label="ส่งข้อความ"><MessageCircle size={15} /></button></div>
  </div>;
}
