function value(...keys: string[]): string {
  for (const key of keys) {
    const candidate = process.env[key];
    if (candidate) return candidate;
  }
  return "";
}

// Read environment values lazily so tests can safely stub them and managed
// WebDev values are used without hard-coded local-only variable names.
export const ENV = {
  get appId() { return value("MANUS_PROJECT_ID", "VITE_APP_ID"); },
  // Used only for Manus-issued OAuth/cron session JWTs.
  get cookieSecret() { return value("MANUS_JWT_SECRET"); },
  // Private application-owned session key; never reuse the platform signing key.
  get directorySessionSecret() { return value("ATV_APP_SESSION_SECRET"); },
  get databaseUrl() { return value("DATABASE_URL"); },
  get oAuthServerUrl() { return value("MANUS_OAUTH_API_URL", "OAUTH_SERVER_URL"); },
  get oAuthPortalUrl() { return value("MANUS_OAUTH_PORTAL_URL", "VITE_OAUTH_PORTAL_URL"); },
  get ownerOpenId() { return value("OWNER_OPEN_ID"); },
  get specialAccessCode() { return value("APP_SPECIAL_ACCESS_CODE"); },
  get repairLogScriptUrl() { return value("APP_REPAIR_LOG_SCRIPT_URL"); },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return value("MANUS_API_URL"); },
  get forgeApiKey() { return value("MANUS_API_KEY"); },
};
