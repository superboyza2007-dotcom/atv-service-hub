export const COOKIE_NAME = "webdev_app_session";
export const CRON_COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// Server-issued, HttpOnly one-time nonce cookie binding an OAuth login to its
// initiating browser session; application JavaScript cannot read or write it.
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";

// `state` carries the callback redirect URI (used at token exchange) plus the
// CSRF nonce. The server creates and validates both values.
export type OAuthState = { redirectUri: string; nonce?: string };

export const encodeOAuthState = (state: OAuthState): string =>
  btoa(JSON.stringify(state));

export const decodeOAuthState = (state: string): OAuthState => {
  let decoded: string;
  try {
    decoded = atob(state);
  } catch {
    // Malformed base64 (e.g. attacker-supplied garbage). Return no nonce so the
    // callback's CSRF guard rejects it with 403 — never throw, since the caller
    // runs outside the request handler's try/catch.
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
    // Legacy links: `state` was a bare base64(redirectUri) with no nonce.
  }
  return { redirectUri: decoded };
};


export const SPECIAL_ACCESS_NAME = "ผู้ดูแลและพัฒนาระบบ";
export const SPECIAL_ACCESS_GROUP = "ผู้ดูแลและพัฒนาระบบ";
