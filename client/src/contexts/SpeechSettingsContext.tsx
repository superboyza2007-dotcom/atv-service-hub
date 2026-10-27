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

  const value = useMemo(() => ({ thaiSpeechEnabled, setThaiSpeechEnabled, speakThai, stopSpeaking, speechSupported }), [thaiSpeechEnabled, setThaiSpeechEnabled, speakThai, stopSpeaking, speechSupported]);
  return <SpeechSettingsContext.Provider value={value}>{children}</SpeechSettingsContext.Provider>;
}

export function useSpeechSettings() {
  const context = useContext(SpeechSettingsContext);
  if (!context) throw new Error("useSpeechSettings must be used within SpeechSettingsProvider");
  return context;
}
