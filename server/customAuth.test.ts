import { describe, expect, it } from "vitest";
import { buildDiscordAuthErrorRedirect, buildDiscordAuthorizationUrl, buildDiscordSuccessRedirect, getAuthDiagnostics, getDiscordRedirectUri, hashPassword, verifyPassword } from "./customAuth";

describe("custom authentication", () => {
  it("hashes passwords and rejects wrong credentials", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("builds Discord authorization URL without exposing the client secret", () => {
    const previousClientId = process.env.DISCORD_CLIENT_ID;
    const previousClientSecret = process.env.DISCORD_CLIENT_SECRET;
    process.env.DISCORD_CLIENT_ID = "test-discord-client-id";
    process.env.DISCORD_CLIENT_SECRET = "test-discord-client-secret";
    try {
      const request = {
        protocol: "https",
        headers: { "x-forwarded-proto": "https", "x-forwarded-host": "craftpanel-7d9t.onrender.com" },
        get: () => "craftpanel-7d9t.onrender.com",
      } as never;
      const url = new URL(buildDiscordAuthorizationUrl(request, "state-check"));
      expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("scope")).toBe("identify email");
      expect(url.searchParams.get("state")).toBe("state-check");
      expect(url.searchParams.get("redirect_uri")).toBe("https://craftpanel-7d9t.onrender.com/api/auth/discord/callback");
      expect(url.toString()).not.toContain("test-discord-client-secret");
    } finally {
      if (previousClientId === undefined) delete process.env.DISCORD_CLIENT_ID;
      else process.env.DISCORD_CLIENT_ID = previousClientId;
      if (previousClientSecret === undefined) delete process.env.DISCORD_CLIENT_SECRET;
      else process.env.DISCORD_CLIENT_SECRET = previousClientSecret;
    }
  });

  it("uses a configured request origin for local callback construction", () => {
    const request = { protocol: "http", headers: {}, get: () => "localhost:3000" } as never;
    expect(getDiscordRedirectUri(request)).toMatch(/\/api\/auth\/discord\/callback$/);
  });

  it("returns safe diagnostics when no auth cookie exists", async () => {
    const result = await getAuthDiagnostics({ headers: {} } as never);
    expect(result.sessionCookiePresent).toBe(false);
    expect(result.bearerSessionPresent).toBe(false);
    expect(result.sessionValid).toBe(false);
    expect(result.userFound).toBe(false);
    expect(result.discordStateCookiePresent).toBe(false);
  });

  it("routes Discord through a visible success screen and diagnostics errors", () => {
    expect(buildDiscordSuccessRedirect()).toBe("/auth/success?provider=discord");
    expect(buildDiscordAuthErrorRedirect("discord_state")).toBe("/diagnostics/oauth?auth=error&reason=discord_state");
  });
});
