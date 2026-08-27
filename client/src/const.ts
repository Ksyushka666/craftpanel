import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
export const OAUTH_LOGIN_TIMEOUT_MS = 45_000;

// Start the Manus OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately — so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns void by design, so there is no URL to
// stash across renders.
export const buildOAuthLoginUrl = (oauthPortalUrl: string, appId: string, redirectUri: string, state: string) => {
  const url = new URL(`${oauthPortalUrl.replace(/\/$/, "")}/login`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("redirect_url", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
};

export const createOAuthLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  if (!oauthPortalUrl || !appId) {
    console.error("[OAuth] Missing VITE_OAUTH_PORTAL_URL or VITE_APP_ID");
    return null;
  }

  const nonce = crypto.randomUUID();
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
  const state = encodeOAuthState({ redirectUri, nonce });
  return buildOAuthLoginUrl(oauthPortalUrl, appId, redirectUri, state);
};

export const startLogin = () => {
  const url = createOAuthLoginUrl();
  if (url) window.location.href = url;
};
