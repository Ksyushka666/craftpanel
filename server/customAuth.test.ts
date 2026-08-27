import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDiscordAuthErrorRedirect, buildDiscordAuthorizationUrl, buildDiscordSuccessRedirect, describeDiscordOAuthError, getAuthDiagnostics, getDiscordRedirectUri, hashPassword, registerCustomAuthRoutes, verifyPassword } from "./customAuth";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";

const nativeFetch = globalThis.fetch.bind(globalThis);

describe("custom authentication", () => {
  let server: Server | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    server = undefined;
  });

  async function startCallbackFlow() {
    const app = express();
    registerCustomAuthRoutes(app);
    server = app.listen(0);
    await new Promise<void>(resolve => server!.once("listening", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");
    const origin = `http://127.0.0.1:${address.port}`;
    const startResponse = await nativeFetch(`${origin}/api/auth/discord/start`, { redirect: "manual" });
    const location = startResponse.headers.get("location");
    const cookie = startResponse.headers.get("set-cookie");
    if (!location || !cookie) throw new Error("Discord start response did not set state");
    const state = new URL(location).searchParams.get("state");
    if (!state) throw new Error("Discord start response did not include state");
    return { origin, state, cookie: cookie.split(";", 1)[0] };
  }
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

  it("describes Discord token errors without exposing OAuth secrets or authorization codes", () => {
    const message = describeDiscordOAuthError(400, JSON.stringify({ error: "invalid_grant", error_description: "Invalid OAuth2 code" }), "https://craftpanel-7d9t.onrender.com/api/auth/discord/callback");
    expect(message).toContain("400: Invalid OAuth2 code");
    expect(message).toContain("redirect_uri=https://craftpanel-7d9t.onrender.com/api/auth/discord/callback");
    expect(message).not.toContain("client_secret");
    expect(message).not.toContain("authorization_code");
  });

  it("creates a local session and redirects after a successful Discord callback", async () => {
    process.env.DISCORD_CLIENT_ID = "test-discord-client-id";
    process.env.DISCORD_CLIENT_SECRET = "test-discord-client-secret";
    const user = { id: 42, openId: "discord_openid", name: "Discord Tester", email: "tester@example.com", loginMethod: "discord", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), passwordHash: null, discordId: "discord-42" } as never;
    const flow = await startCallbackFlow();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "discord-42", username: "tester", email: "tester@example.com", verified: true }), { status: 200 })));
    vi.spyOn(db, "getUserByDiscordId").mockResolvedValue(undefined);
    vi.spyOn(db, "getUserByEmail").mockResolvedValue(undefined);
    vi.spyOn(db, "createLocalAuthUser").mockResolvedValue(user);
    vi.spyOn(sdk, "signSession").mockResolvedValue("signed-session-token");
    const callback = await nativeFetch(`${flow.origin}/api/auth/discord/callback?code=oauth-code&state=${flow.state}`, { headers: { cookie: flow.cookie }, redirect: "manual" });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/auth/success?provider=discord");
    expect(callback.headers.get("set-cookie")).toContain(`${COOKIE_NAME}=signed-session-token`);
  });

  it("redirects to diagnostics when Discord token exchange fails", async () => {
    process.env.DISCORD_CLIENT_ID = "test-discord-client-id";
    process.env.DISCORD_CLIENT_SECRET = "test-discord-client-secret";
    const flow = await startCallbackFlow();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid OAuth2 code" }), { status: 400 })));
    const callback = await nativeFetch(`${flow.origin}/api/auth/discord/callback?code=oauth-code&state=${flow.state}`, { headers: { cookie: flow.cookie }, redirect: "manual" });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/diagnostics/oauth?auth=error&reason=discord_callback");
  });
});
