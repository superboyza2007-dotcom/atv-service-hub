import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import "./FutureDiceResultToast.css";

function isDiceResult(body: string) {
  return body.startsWith("ผู้ชนะ:") && body.includes("ผู้แพ้:") && body.includes("ผู้ชนะเลือก:");
}

export default function FutureDiceResultToast() {
  const messagesQuery = trpc.liveMessages.list.useQuery(
    { channelType: "room", channelId: "future-dice" },
    { retry: false, refetchInterval: 1_000, refetchOnWindowFocus: true },
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const latestResult = useMemo(() => (messagesQuery.data ?? [])
    .filter(message => isDiceResult(message.body))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0], [messagesQuery.data]);
  if (!latestResult) return null;
  const ageMs = now - new Date(latestResult.createdAt).getTime();
  if (ageMs < 0 || ageMs >= 10_000) return null;
  return <div className="future-dice-global-toast" role="status" aria-live="polite">{latestResult.body}</div>;
}
