import { useMemo, useState } from "react";
import type { AppModule } from "@/lib/app-access";
import type { SessionChatMessage } from "@/lib/session-chat-sync";
import { trpc } from "@/lib/trpc";
import { ActiveSessionChat } from "@/components/ActiveSessionChat";

type ServerActiveSessionChatProps = {
  sessionId?: string | number;
  module: AppModule;
  canSend: boolean;
};

export function ServerActiveSessionChat({ sessionId, module, canSend }: ServerActiveSessionChatProps) {
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();
  const identityQuery = trpc.directory.me.useQuery(undefined, { retry: false, refetchInterval: 5_000 });
  const channelId = sessionId ? `session:${String(sessionId)}` : "session:none";
  const messagesQuery = trpc.liveMessages.list.useQuery(
    { channelType: "active", channelId },
    { enabled: Boolean(sessionId), retry: false, refetchInterval: 1_000 },
  );
  const sendMutation = trpc.liveMessages.send.useMutation({
    onSuccess: () => utils.liveMessages.list.invalidate({ channelType: "active", channelId }),
  });
  const messages = useMemo<SessionChatMessage[]>(() => (messagesQuery.data ?? []).map(row => ({
    id: String(row.id),
    sessionId: String(sessionId ?? ""),
    sender: row.senderName,
    text: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
  })), [messagesQuery.data, sessionId]);
  const send = () => {
    const body = draft.trim();
    if (!body || !sessionId || sendMutation.isPending) return;
    sendMutation.mutate({ channelType: "active", channelId, sessionId: Number(sessionId) || undefined, module, body });
    setDraft("");
  };
  return <ActiveSessionChat messages={messages} draft={draft} canSend={canSend && Boolean(sessionId)} onDraftChange={setDraft} onSend={send} />;
}
