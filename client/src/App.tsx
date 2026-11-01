/**
 * Style contract: dark operational dashboard; ATV Signal Green marks confirmation and readiness.
 * Operational data and identity come from authenticated server endpoints.
 */
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SpeechSettingsProvider } from "./contexts/SpeechSettingsContext";
import GuideModule3 from "./pages/GuideModule3";
import MechanicModule from "./pages/MechanicModule";
import SupervisorModule from "./pages/SupervisorModule";
import FullAppDemoModule from "./pages/FullAppDemoModule";
import FutureDiceResultToast from "./components/FutureDiceResultToast";
import FutureDiceGame from "./components/FutureDiceGame";
import { PttRoomProvider } from "./components/PttRoom";
import AppAccessGate from "./components/AppAccessGate";
import type { AppAccessTarget } from "@/lib/app-access";

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const module = params.get("module");
  const isMechanicDemo = params.get("demo") === "mechanic-board";
  const isFullAppDemo = params.get("demo") === "full-app";
  const isMechanicModule = module === "mechanic";
  const isSupervisorModule = module === "supervisor";
  const isMechanicTipsAccess = isMechanicModule && params.get("tab") === "tips";
  const requestedModule: AppAccessTarget | null = isMechanicTipsAccess ? "mechanicTips" : isMechanicModule ? "mechanic" : isSupervisorModule ? "supervisor" : module === "guide" ? "guide" : null;
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <SpeechSettingsProvider>
          <Toaster />
          {isMechanicDemo || isFullAppDemo ? <PttRoomProvider>{isFullAppDemo && !isMechanicModule && !isSupervisorModule && module !== "guide" ? <FullAppDemoModule /> : isMechanicModule ? <MechanicModule /> : isSupervisorModule ? <SupervisorModule /> : <GuideModule3 />}</PttRoomProvider> : <AppAccessGate requestedModule={requestedModule}>
            <PttRoomProvider>
              <FutureDiceResultToast />
              <FutureDiceGame />
              {isMechanicModule ? <MechanicModule guideTipsOnly={isMechanicTipsAccess} /> : isSupervisorModule ? <SupervisorModule /> : <GuideModule3 />}
            </PttRoomProvider>
          </AppAccessGate>}
        </SpeechSettingsProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
