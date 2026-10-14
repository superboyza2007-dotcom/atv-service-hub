import { randomBytes } from "node:crypto";
import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState, encodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

const LOCAL_OAUTH_STATE_COOKIE = "oauth_state_local";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/start", (req: Request, res: Response) => {
    if (!ENV.appId || !ENV.oAuthPortalUrl) {
      res.status(503).json({ error: "OAuth is not configured on this server" });
      return;
    }
    const host = req.get("host");
    if (!host) {
      res.status(400).json({ error: "Missing request host" });
      return;
    }
    try {
      const cookieOptions = getSessionCookieOptions(req);
      const redirectUri = `${cookieOptions.secure ? "https" : "http"}://${host}/api/oauth/callback`;
      const nonce = randomBytes(24).toString("hex");
      res.cookie(cookieOptions.secure ? OAUTH_STATE_COOKIE : LOCAL_OAUTH_STATE_COOKIE, nonce, {
        httpOnly: true, path: "/", secure: cookieOptions.secure,
        sameSite: cookieOptions.secure ? "none" : "lax", maxAge: 600_000,
      });
      const state = encodeOAuthState({ redirectUri, nonce });
      const url = new URL("/app-auth", ENV.oAuthPortalUrl);
      url.searchParams.set("appId", ENV.appId);
      url.searchParams.set("redirectUri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("type", "signIn");
      res.redirect(302, url.toString());
    } catch {
      res.status(503).json({ error: "OAuth portal configuration is invalid" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the HttpOnly cookie that
    // this server set when login began. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const cookieOptions = getSessionCookieOptions(req);
    const stateCookieName = cookieOptions.secure ? OAUTH_STATE_COOKIE : LOCAL_OAUTH_STATE_COOKIE;
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[stateCookieName];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(stateCookieName, { path: "/", secure: cookieOptions.secure, sameSite: cookieOptions.secure ? "none" : "lax" });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
