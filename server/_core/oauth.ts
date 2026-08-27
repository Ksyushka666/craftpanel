/**
 * Legacy external OAuth routes are intentionally disabled.
 * Browser authentication is handled by local email/password sessions and
 * Discord OAuth in `server/customAuth.ts`.
 */
export const OAUTH_SUCCESS_REDIRECT_PATH = "/auth/success?provider=discord";

export function resolveSessionName(userInfo: { openId: string; name?: string | null; email?: string | null }) {
  return userInfo.name?.trim() || userInfo.email?.trim() || userInfo.openId;
}
