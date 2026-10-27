import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type SpeechSettingsContextValue = {
  thaiSpeechEnabled: boolean;
  setThaiSpeechEnabled: (enabled: boolean) => void;
  speakThai: (text: string) => void;
  stopSpeaking: () => void;
  speechSupported: boolean;
};

const SpeechSettingsContext = createContext<SpeechSettingsContextValue | null>(null);

export function SpeechSettingsProvider({ children }: { children: ReactNode }) {
  const [thaiSpeechEnabled, setThaiSpeechEnabledState] = useState(false);
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const setThaiSpeechEnabled = useCallback((enabled: boolean) => {
    setThaiSpeechEnabledState(enabled);
    if (!enabled && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const speakThai = useCallback((text: string) => {
    if (!thaiSpeechEnabled || !text.trim() || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = "th-TH";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, [thaiSpeechEnabled]);

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (!thaiSpeechEnabled || typeof document === "undefined") return;
    const doubleClickWindowMs = 280;
    let pendingTarget: HTMLElement | null = null;
    let pendingTimer: number | undefined;
    let pointerStart: { id: number; x: number; y: number } | null = null;
    let dragged = false;

    const readableTarget = (node: EventTarget | null) => {
      if (!(node instanceof HTMLElement)) return null;
      const target = node.closest("button, a, [role=button], label, summary, [tabindex]") as HTMLElement | null;
      if (!target || target.closest("[aria-hidden=true]") || target.matches("input, select, textarea, option")) return null;
      const text = (target.getAttribute("aria-label") || target.innerText || target.textContent || "").replace(/\s+/g, " ").trim();
      return text ? { target, text: text.slice(0, 500) } : null;
    };

    const replayNormalClick = (target: HTMLElement) => {
      const replay = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      Object.defineProperty(replay, "__speechReplay", { value: true });
      target.dispatchEvent(replay);
    };

    const onClick = (event: MouseEvent) => {
      if ((event as MouseEvent & { __speechReplay?: boolean }).__speechReplay) return;
      if (dragged) {
        dragged = false;
        pointerStart = null;
        return;
      }
      const item = readableTarget(event.target);
      if (!item) return;
      if (pendingTarget === item.target) {
        if (pendingTimer !== undefined) window.clearTimeout(pendingTimer);
        pendingTarget = null;
        pendingTimer = undefined;
        event.preventDefault();
        event.stopPropagation();
        replayNormalClick(item.target);
        return;
      }
      if (pendingTimer !== undefined) window.clearTimeout(pendingTimer);
      pendingTarget = item.target;
      event.preventDefault();
      event.stopPropagation();
      pendingTimer = window.setTimeout(() => {
        speakThai(item.text);
        pendingTarget = null;
        pendingTimer = undefined;
      }, doubleClickWindowMs);
    };

    const onPointerDown = (event: PointerEvent) => {
      pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
      dragged = false;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8) {
        dragged = true;
        if (pendingTimer !== undefined) window.clearTimeout(pendingTimer);
        pendingTimer = undefined;
        pendingTarget = null;
      }
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (pointerStart?.id === event.pointerId) pointerStart = null;
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerEnd, true);
    document.addEventListener("pointercancel", onPointerEnd, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerEnd, true);
      document.removeEventListener("pointercancel", onPointerEnd, true);
      if (pendingTimer !== undefined) window.clearTimeout(pendingTimer);
    };
  }, [speakThai, thaiSpeechEnabled]);

  const value = useMemo(() => ({ thaiSpeechEnabled, setThaiSpeechEnabled, speakThai, stopSpeaking, speechSupported }), [thaiSpeechEnabled, setThaiSpeechEnabled, speakThai, stopSpeaking, speechSupported]);
  return <SpeechSettingsContext.Provider value={value}>{children}</SpeechSettingsContext.Provider>;
}

export function useSpeechSettings() {
  const context = useContext(SpeechSettingsContext);
  if (!context) throw new Error("useSpeechSettings must be used within SpeechSettingsProvider");
  return context;
}
