import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerPttSignaling } from "../ptt-signaling";
import { cleanupLiveMessagesHandler } from "../scheduledCleanup";
import { reconcileVehicleSessionsHandler } from "../scheduledVehicleReconcile";
import { ensureDailyRetentionCleanupSchedule } from "../dailyRetentionSchedule";
import { ensureVehicleFlowReconciliationSchedule } from "../vehicleFlowSchedule";
import { publicPlatformScript } from "./publicConfig";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function provisionVehicleFlowReconciliationSchedule(attempt = 1) {
  void ensureVehicleFlowReconciliationSchedule()
    .then(({ taskUid, created }) => console.log(`[vehicle-session-reconcile] ${created ? "created" : "verified"} heartbeat task ${taskUid}`))
    .catch(error => {
      console.error(`[vehicle-session-reconcile] heartbeat provisioning attempt ${attempt} failed`, error);
      if (attempt < 5) {
        const delayMs = Math.min(60_000, 5_000 * 2 ** (attempt - 1));
        setTimeout(() => provisionVehicleFlowReconciliationSchedule(attempt + 1), delayMs);
      }
    });
}

function provisionDailyRetentionCleanupSchedule(attempt = 1) {
  void ensureDailyRetentionCleanupSchedule()
    .then(({ taskUid, created }) => console.log(`[daily-retention-cleanup] ${created ? "created" : "verified"} heartbeat task ${taskUid}`))
    .catch(error => {
      console.error(`[daily-retention-cleanup] heartbeat provisioning attempt ${attempt} failed`, error);
      if (attempt < 5) {
        const delayMs = Math.min(60_000, 5_000 * 2 ** (attempt - 1));
        setTimeout(() => provisionDailyRetentionCleanupSchedule(attempt + 1), delayMs);
      }
    });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  registerPttSignaling(server);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.get("/api/platform/config.js", (_req, res) => {
    res.type("application/javascript").setHeader("Cache-Control", "no-store").send(publicPlatformScript());
  });
  app.post("/api/scheduled/cleanup-live-messages", cleanupLiveMessagesHandler);
  app.post("/api/scheduled/reconcile-vehicle-sessions", reconcileVehicleSessionsHandler);
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    if (process.env.NODE_ENV === "production") {
      provisionVehicleFlowReconciliationSchedule();
      provisionDailyRetentionCleanupSchedule();
    }
  });
}

startServer().catch(console.error);
