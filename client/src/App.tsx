/**
 * Style contract: dark operational dashboard; ATV Signal Green marks confirmation and readiness.
 * Operational data and identity come from authenticated server endpoints.
 */
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import GuideModule3 from "./pages/GuideModule3";
import MechanicModule from "./pages/MechanicModule";
import SupervisorModule from "./pages/SupervisorModule";
import FutureDiceGame from "./components/FutureDiceGame";
import FutureDiceResultToast from "./components/FutureDiceResultToast";
import { PttRoomProvider } from "./components/PttRoom";
import AppAccessGate from "./components/AppAccessGate";
import type { AppModule } from "@/lib/app-access";

export default function App() {
  const module = new URLSearchParams(window.location.search).get("module");
  const isMechanicModule = module === "mechanic";
  const isSupervisorModule = module === "supervisor";
  const requestedModule: AppModule | null = isMechanicModule ? "mechanic" : isSupervisorModule ? "supervisor" : module === "guide" ? "guide" : null;
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <Toaster />
        <AppAccessGate requestedModule={requestedModule}>
          <PttRoomProvider>
            <FutureDiceResultToast />
            {isMechanicModule ? <MechanicModule /> : isSupervisorModule ? <SupervisorModule /> : <GuideModule3 />}
            {!isSupervisorModule && <FutureDiceGame />}
          </PttRoomProvider>
        </AppAccessGate>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
