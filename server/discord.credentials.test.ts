import { describe, expect, it } from "vitest";

const hasDiscordCredentials = Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

describe.skipIf(!hasDiscordCredentials)("Discord OAuth credentials", () => {
  it("reaches Discord OAuth token endpoint without exposing the client secret", async () => {
    const clientId = process.env.DISCORD_CLIENT_ID!;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET!;
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: "craftpanel-credential-check",
        redirect_uri: "https://craftpanel-7d9t.onrender.com/api/auth/discord/callback",
      }),
    });
    const payload = await response.json() as { error?: string };

    // The deliberately invalid code should be rejected, but valid credentials
    // must not produce Discord's invalid_client response.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(payload.error).not.toBe("invalid_client");
    expect(response.url).not.toContain(clientSecret);
  }, 15_000);
});
