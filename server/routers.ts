import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { appendAppOperationsSnapshotItem, appendLiveMessage, appendOperationalHistory, clearLiveMessages, getAppOperationsSnapshot, getOnlineAppDirectoryUserIds, listLiveMessages, listAppDirectoryUsers, listOperationalHistory, mergeAppOperationsSnapshot, replaceAppDirectoryUsers, setAppDirectoryCodeHash, touchAppDirectoryPresence, upsertAppOperationsSnapshot } from "./db";
import { appDirectorySessionCookieOptions, createDirectorySession, createSpecialDirectorySession, hashDirectoryCode, verifyDirectoryCode, verifySpecialAccessCode, APP_DIRECTORY_SESSION_COOKIE } from "./appDirectoryAuth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";
import { SPECIAL_ACCESS_GROUP, SPECIAL_ACCESS_NAME } from "@shared/const";
import {
  activateVehicleSession,
  cancelVehicleSession,
  completeVehicleSession,
  completeVehicleRepairWithoutPickup,
  createVehicleSession,
  getUnreadPickupNotifications,
  listActiveQueue,
  listVehicleSummary,
  markVehicleForPickup,
  receivePickupVehicle,
  reportVehicleRepair,
} from "./vehicleFlowService";
import { completeNextActiveQueue, reconcileActiveQueue } from "./activeQueueMirror";
import { isRepairLogSheetConfigured, repairLogPayloadSchema, submitRepairLogSheetPayload } from "./repairLogGoogleSheets";
import { cancelFutureDiceSession, chooseFutureDiceOutcome, createFutureDiceSession, getFutureDiceInvitationForUser, getFutureDiceSession, isFutureDiceRuleError, listFutureDiceSessions, rollFutureDice, setFutureDiceOutcomeType, type FutureDiceActor } from "./futureDiceService";

const vehicleActor = (user: { id: number; role: "user" | "guide" | "mechanic" | "supervisor" | "admin" }) => ({
  id: user.id,
  role: user.role,
});

const appProtectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.appUser && !ctx.user && !ctx.appSpecialAccess) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "App session required" });
  }
  return next({ ctx });
});

const RUN_QUEUE_SNAPSHOT_KEY = "atv-run-queue-v1";

function actorFromContext(ctx: TrpcContext) {
  if (ctx.user) return vehicleActor(ctx.user);
  if (ctx.appUser) {
    const group = ctx.appUser.userGroup;
    const role = group.includes("ช่าง") ? "mechanic" : group.includes("หัวหน้า") ? "supervisor" : "guide";
    return vehicleActor({ id: ctx.appUser.id, role });
  }
  throw new TRPCError({ code: "UNAUTHORIZED", message: "App session required" });
}

function futureDiceActorFromContext(ctx: TrpcContext): FutureDiceActor {
  const group = ctx.appUser?.userGroup ?? "";
  const isSupervisor = ctx.appSpecialAccess || ctx.user?.role === "admin" || ctx.user?.role === "supervisor" || group.includes("หัวหน้า");
  return {
    directoryUserId: ctx.appUser?.id,
    name: ctx.appUser?.name ?? ctx.user?.name ?? "ผู้ควบคุมเกม",
    isSupervisor,
  };
}

function futureDiceMessageModule(ctx: TrpcContext): "guide" | "mechanic" | "supervisor" {
  const group = ctx.appUser?.userGroup ?? "";
  if (ctx.appSpecialAccess || ctx.user?.role === "admin" || ctx.user?.role === "supervisor" || group.includes("หัวหน้า")) return "supervisor";
  if (group.includes("ช่าง")) return "mechanic";
  return "guide";
}

async function announceFutureDice(ctx: TrpcContext, body: string) {
  try {
    await appendLiveMessage({
      channelType: "room",
      channelId: "future-dice",
      senderDirectoryUserId: ctx.appUser?.id,
      senderModule: futureDiceMessageModule(ctx),
      senderName: ctx.appUser?.name ?? ctx.user?.name ?? "ระบบ Future Dice",
      body,
    });
  } catch (error) {
    // A committed game transition remains valid even when an auxiliary announcement is unavailable.
    console.warn("[FutureDice] Could not append live announcement", error);
  }
}

function throwFutureDiceError(error: unknown): never {
  if (isFutureDiceRuleError(error)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const appRouter = router({
  system: systemRouter,
  directory: router({
    list: publicProcedure.query(async () => (await listAppDirectoryUsers()).map(user => ({ id: user.id, name: user.name, group: user.userGroup, hasCode: Boolean(user.codeHash && user.codeSalt) }))),
    specialAuthenticate: publicProcedure.input(z.object({ code: z.string().trim().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      if (!verifySpecialAccessCode(input.code)) return null;
      const token = await createSpecialDirectorySession();
      ctx.res.cookie(APP_DIRECTORY_SESSION_COOKIE, token, appDirectorySessionCookieOptions(ctx.req));
      return { name: SPECIAL_ACCESS_NAME, group: SPECIAL_ACCESS_GROUP, special: true as const };
    }),
    authenticate: publicProcedure.input(z.object({ code: z.string().trim().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const user = (await listAppDirectoryUsers()).find(candidate => verifyDirectoryCode(input.code, candidate));
      if (!user) return null;
      if (!user.codeHash || !user.codeSalt) {
        const hashed = hashDirectoryCode(input.code);
        await setAppDirectoryCodeHash(user.id, hashed.hash, hashed.salt);
      }
      const token = await createDirectorySession(user);
      ctx.res.cookie(APP_DIRECTORY_SESSION_COOKIE, token, appDirectorySessionCookieOptions(ctx.req));
      return { id: user.id, name: user.name, group: user.userGroup };
    }),
    me: publicProcedure.query(({ ctx }) => ctx.appSpecialAccess ? { name: SPECIAL_ACCESS_NAME, group: SPECIAL_ACCESS_GROUP, special: true as const } : ctx.appUser ? { id: ctx.appUser.id, name: ctx.appUser.name, group: ctx.appUser.userGroup, special: false as const } : null),
    heartbeat: appProtectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.appUser) return { tracked: false } as const;
      await touchAppDirectoryPresence(ctx.appUser.id);
      return { tracked: true } as const;
    }),
    verifyCurrentCode: appProtectedProcedure.input(z.object({ code: z.string().trim().min(1).max(128) })).mutation(({ ctx, input }) => {
      if (ctx.appSpecialAccess) return verifySpecialAccessCode(input.code);
      return ctx.appUser ? verifyDirectoryCode(input.code, ctx.appUser) : false;
    }),
    sync: appProtectedProcedure.input(z.object({
      users: z.array(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(1).max(128), code: z.string().trim().max(128), group: z.string().trim().min(1).max(64) })).max(500),
    })).mutation(async ({ ctx, input }) => {
      const group = ctx.appUser?.userGroup ?? "";
      const isPrivileged = ctx.appSpecialAccess || ctx.user?.role === "admin" || group.includes("หัวหน้า");
      if (!isPrivileged) throw new TRPCError({ code: "FORBIDDEN", message: "Supervisor permission required" });
      const users = await replaceAppDirectoryUsers(input.users.map(user => ({ id: user.id, name: user.name, code: user.code, userGroup: user.group })));
      return users.map(user => ({ id: user.id, name: user.name, group: user.userGroup, hasCode: Boolean(user.codeHash && user.codeSalt) }));
    }),
  }),
  repairLog: router({
    status: appProtectedProcedure.query(() => ({ configured: isRepairLogSheetConfigured() })),
    submit: appProtectedProcedure.input(repairLogPayloadSchema).mutation(async ({ ctx, input }) => {
      const group = ctx.appUser?.userGroup ?? "";
      if (!ctx.appSpecialAccess && ctx.user?.role !== "admin" && !group.includes("ช่าง") && !group.includes("หัวหน้า")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Mechanic or supervisor permission required" });
      }
      if (!isRepairLogSheetConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google Sheets repair-log integration is not configured" });
      }
      try {
        await submitRepairLogSheetPayload(input);
        return { ok: true as const, sentAt: new Date().toISOString() };
      } catch (error) {
        console.error("[RepairLog] Server-side Google Sheets submission failed");
        throw new TRPCError({ code: "BAD_GATEWAY", message: "Google Sheets could not confirm the repair-log export" });
      }
    }),
  }),
  futureDice: router({
    invitation: appProtectedProcedure.query(async ({ ctx }) => {
      if (!ctx.appUser) return null;
      try {
        return await getFutureDiceInvitationForUser(ctx.appUser.id);
      } catch (error) {
        return throwFutureDiceError(error);
      }
    }),
    roster: appProtectedProcedure.query(async () => {
      const [directoryUsers, onlineUserIds] = await Promise.all([listAppDirectoryUsers(), getOnlineAppDirectoryUserIds()]);
      return directoryUsers.map(user => ({ id: user.id, name: user.name, group: user.userGroup, isOnline: onlineUserIds.has(Number(user.id)) }));
    }),
    list: appProtectedProcedure.input(z.object({ limit: z.number().int().min(1).max(30).optional() }).optional()).query(async ({ input }) => {
      try {
        return await listFutureDiceSessions(input?.limit ?? 12);
      } catch (error) {
        return throwFutureDiceError(error);
      }
    }),
    get: appProtectedProcedure.input(z.object({ sessionId: z.number().int().positive() })).query(async ({ input }) => {
      try {
        const session = await getFutureDiceSession(input.sessionId);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบเกมที่เลือก" });
        return session;
      } catch (error) {
        return throwFutureDiceError(error);
      }
    }),
    create: appProtectedProcedure.input(z.object({
      gameMode: z.enum(["one_vs_one", "two_vs_two"]),
      outcomeType: z.enum(["minutes", "go_no_go"]),
      directoryUserIds: z.array(z.number().int().positive()).min(2).max(4),
    })).mutation(async ({ ctx, input }) => {
      const actor = futureDiceActorFromContext(ctx);
      try {
        return await createFutureDiceSession({ actor, ...input });
      } catch (error) {
        return throwFutureDiceError(error);
      }
    }),
    roll: appProtectedProcedure.input(z.object({ sessionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const actor = futureDiceActorFromContext(ctx);
      try {
        return await rollFutureDice({ sessionId: input.sessionId, actor });
      } catch (error) {
        return throwFutureDiceError(error);
      }
    }),
    chooseOutcome: appProtectedProcedure.input(z.object({
      sessionId: z.number().int().positive(),
      selectedOutcome: z.string().trim().min(1).max(16),
    })).mutation(async ({ ctx, input }) => {
      const actor = futureDiceActorFromContext(ctx);
      try {
        const session = await chooseFutureDiceOutcome({ ...input, actor });
        const winningTeam = session.winningTeam;
        const losingTeam = winningTeam === "A" ? "B" : winningTeam === "B" ? "A" : null;
        const winnerNames = winningTeam
          ? session.players.filter(player => player.team === winningTeam).map(player => player.name).join(" และ ")
          : "ไม่ระบุ";
        const loserNames = losingTeam
          ? session.players.filter(player => player.team === losingTeam).map(player => player.name).join(" และ ")
          : "ไม่ระบุ";
        const winnerScore = winningTeam ? session.scores[winningTeam] : 0;
        const loserScore = losingTeam ? session.scores[losingTeam] : 0;
        await announceFutureDice(ctx, `ผู้ชนะ: ${winnerNames} (ทีม ${winningTeam}) ได้ ${winnerScore} แต้ม · ผู้แพ้: ${loserNames} (ทีม ${losingTeam}) ได้ ${loserScore} แต้ม · ผลลัพธ์ที่ผู้ชนะเลือก: ${session.selectedOutcome}`);
        return session;
      } catch (error) {
        return throwFutureDiceError(error);
      }
    }),
    setOutcomeType: appProtectedProcedure.input(z.object({
      sessionId: z.number().int().positive(),
      outcomeType: z.enum(["minutes", "go_no_go"]),
    })).mutation(async ({ ctx, input }) => {
      const actor = futureDiceActorFromContext(ctx);
      if (!actor.isSupervisor) throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะหัวหน้าหรือสิทธิ์พิเศษเท่านั้นที่เลือกผลลัพธ์ได้" });
      try {
        return await setFutureDiceOutcomeType(input);
      } catch (error) {
        return throwFutureDiceError(error);
      }
    }),
    cancel: appProtectedProcedure.input(z.object({ sessionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const actor = futureDiceActorFromContext(ctx);
      try {
        return await cancelFutureDiceSession({ sessionId: input.sessionId, actor });
      } catch (error) {
        return throwFutureDiceError(error);
      }
    }),
  }),
  liveMessages: router({
    list: appProtectedProcedure.input(z.object({ channelType: z.enum(["active", "room"]), channelId: z.string().trim().min(1).max(128) })).query(({ input }) => listLiveMessages(input.channelType, input.channelId)),
    send: appProtectedProcedure.input(z.object({ channelType: z.enum(["active", "room"]), channelId: z.string().trim().min(1).max(128), sessionId: z.number().int().positive().optional(), module: z.enum(["guide", "mechanic", "supervisor"]), body: z.string().trim().min(1).max(4_000) })).mutation(({ ctx, input }) => appendLiveMessage({ channelType: input.channelType, channelId: input.channelId, sessionId: input.sessionId, senderModule: input.module, body: input.body, senderDirectoryUserId: ctx.appUser?.id, senderName: ctx.appUser?.name ?? ctx.user?.name ?? "ผู้ใช้งาน" })),
    clear: appProtectedProcedure.mutation(({ ctx }) => {
      const group = ctx.appUser?.userGroup ?? "";
      const isPrivileged = ctx.appSpecialAccess || ctx.user?.role === "admin" || group.includes("หัวหน้า");
      if (!isPrivileged) throw new TRPCError({ code: "FORBIDDEN", message: "Supervisor permission required" });
      return clearLiveMessages();
    }),
  }),
  operationalHistory: router({
    list: appProtectedProcedure.input(z.object({ limit: z.number().int().min(1).max(500).optional() }).optional()).query(({ input }) => listOperationalHistory(input?.limit ?? 200)),
    record: appProtectedProcedure.input(z.object({ eventType: z.string().trim().min(1).max(64), module: z.enum(["guide", "mechanic", "supervisor", "system"]), sessionId: z.number().int().positive().optional(), vehicleId: z.number().int().positive().optional(), payload: z.string().max(32_000) })).mutation(({ ctx, input }) => appendOperationalHistory({ ...input, actorDirectoryUserId: ctx.appUser?.id })),
  }),
  operationsSnapshots: router({
    get: appProtectedProcedure.input(z.object({ key: z.string().trim().min(1).max(64) })).query(async ({ input }) => (await getAppOperationsSnapshot(input.key)) ?? null),
    save: appProtectedProcedure.input(z.object({ key: z.string().trim().min(1).max(64), payload: z.string().max(2_000_000) })).mutation(async ({ input }) => {
      await upsertAppOperationsSnapshot(input.key, input.payload);
      return { success: true } as const;
    }),
    merge: appProtectedProcedure.input(z.object({ key: z.string().trim().min(1).max(64), payload: z.string().max(2_000_000) })).mutation(async ({ input }) => {
      const payload = await mergeAppOperationsSnapshot(input.key, input.payload);
      return { success: true, payload } as const;
    }),
    append: appProtectedProcedure.input(z.object({ key: z.string().trim().min(1).max(64), field: z.string().trim().min(1).max(64), item: z.string().max(32_000), maxItems: z.number().int().min(1).max(500).optional() })).mutation(async ({ input }) => {
      const payload = await appendAppOperationsSnapshotItem(input.key, input.field, input.item, input.maxItems);
      return { success: true, payload } as const;
    }),
  }),
  runQueue: router({
    get: appProtectedProcedure.query(async () => (await getAppOperationsSnapshot(RUN_QUEUE_SNAPSHOT_KEY)) ?? null),
    save: appProtectedProcedure.input(z.object({ payload: z.string().max(2_000_000) })).mutation(async ({ input }) => {
      await upsertAppOperationsSnapshot(RUN_QUEUE_SNAPSHOT_KEY, input.payload);
      return { success: true } as const;
    }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(APP_DIRECTORY_SESSION_COOKIE, { ...appDirectorySessionCookieOptions(ctx.req), maxAge: 0 });
      return { success: true } as const;
    }),
  }),
  vehicleFlow: router({
    summary: appProtectedProcedure.query(() => listVehicleSummary()),
    activeQueue: appProtectedProcedure.query(() => listActiveQueue()),
    reconcileActiveQueue: appProtectedProcedure.input(z.object({
      previousEventId: z.string().max(512).optional(),
    })).query(({ input }) => reconcileActiveQueue(input.previousEventId)),
    completeNextActiveQueue: appProtectedProcedure.mutation(({ ctx }) => completeNextActiveQueue(actorFromContext(ctx))),
    pickupNotifications: appProtectedProcedure.query(({ ctx }) => getUnreadPickupNotifications(actorFromContext(ctx).id)),
    reportRepair: appProtectedProcedure.input(z.object({
      vehicleId: z.number().int().positive(),
      description: z.string().trim().min(3).max(2_000),
    })).mutation(({ ctx, input }) => reportVehicleRepair({
      vehicleId: input.vehicleId,
      actor: actorFromContext(ctx),
      description: input.description,
    })),
    markPickup: appProtectedProcedure.input(z.object({
      vehicleId: z.number().int().positive(),
      note: z.string().trim().min(3).max(2_000),
    })).mutation(({ ctx, input }) => markVehicleForPickup({
      vehicleId: input.vehicleId,
      actor: actorFromContext(ctx),
      note: input.note,
    })),
    completeRepairWithoutPickup: appProtectedProcedure.input(z.object({
      vehicleNumber: z.number().int().positive(),
      note: z.string().trim().min(3).max(2_000),
    })).mutation(({ ctx, input }) => completeVehicleRepairWithoutPickup({
      vehicleNumber: input.vehicleNumber,
      actor: actorFromContext(ctx),
      note: input.note,
    })),
    receivePickup: appProtectedProcedure.input(z.object({
      vehicleId: z.number().int().positive(),
    })).mutation(({ ctx, input }) => receivePickupVehicle({
      vehicleId: input.vehicleId,
      actor: actorFromContext(ctx),
    })),
    createSession: appProtectedProcedure.input(z.object({
      sessionCode: z.string().trim().min(4).max(64),
      durationMinutes: z.number().int().min(1).max(720),
      vehicleIds: z.array(z.number().int().positive()).min(1).max(50),
      startImmediately: z.boolean(),
    })).mutation(({ ctx, input }) => createVehicleSession({
      ...input,
      actor: actorFromContext(ctx),
    })),
    activateSession: appProtectedProcedure.input(z.object({
      sessionId: z.number().int().positive(),
    })).mutation(({ ctx, input }) => activateVehicleSession({
      ...input,
      actor: actorFromContext(ctx),
    })),
    completeSession: appProtectedProcedure.input(z.object({
      sessionId: z.number().int().positive(),
    })).mutation(({ ctx, input }) => completeVehicleSession({
      ...input,
      actor: actorFromContext(ctx),
    })),
    cancelSession: appProtectedProcedure.input(z.object({
      sessionId: z.number().int().positive(),
    })).mutation(({ ctx, input }) => cancelVehicleSession({
      ...input,
      actor: actorFromContext(ctx),
    })),
  }),
});

export type AppRouter = typeof appRouter;
