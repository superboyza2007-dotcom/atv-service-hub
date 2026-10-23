export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** Start server-managed OAuth; browser JavaScript never writes auth state. */
export const startLogin = () => {
  window.location.href = "/api/oauth/start";
};
