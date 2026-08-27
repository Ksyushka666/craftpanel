import { describe, expect, it } from "vitest";

const hasDiscordCredentials = Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

describe.skipIf(!hasDiscordCredentials)("Discord OAuth credentials", () => {
  it("are accepted by Discord OAuth token endpoint", async () => {
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code: "craftpanel-credential-check",
      redirect_uri: "https://craftpanel-7d9t.onrender.com/api/auth/discord/callback",
    });
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await response.json() as { error?: string; error_description?: string };

    // Discord should reject only the deliberately invalid code. An invalid_client
    // response means the supplied client ID/secret pair is not accepted.
    expect(response.status).not.toBe(401);
    expect(payload.error).not.toBe("invalid_client");
  }, 15_000);
});
