import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { parse as parseCookie } from "cookie";
import type { User } from "../drizzle/schema";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { LOCAL_SESSION_APP_ID, sdk } from "./_core/sdk";
import * as db from "./db";

const deriveKey = (password: string | Buffer, salt: Buffer, keyLength: number) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, keyLength, SCRYPT_OPTIONS, (error, derived) => {
    if (error) reject(error);
    else resolve(derived as Buffer);
  });
});
const DISCORD_STATE_COOKIE = "craftpanel_discord_oauth_state";
const DISCORD_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1 } as const;

export const DISCORD_CALLBACK_PATH = "/api/auth/discord/callback";

export async function getAuthDiagnostics(req: Request) {
  const cookies = parseCookie(req.headers.cookie ?? "");
  const cookieToken = cookies[COOKIE_NAME];
  const bearerToken = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
  const sessionToken = cookieToken || bearerToken;
  const rawSession = await sdk.verifySession(sessionToken);
  const session = rawSession?.appId === LOCAL_SESSION_APP_ID ? rawSession : null;
  const user = session ? await db.getUserByOpenId(session.openId) : undefined;
  return {
    sessionCookiePresent: Boolean(cookieToken),
    bearerSessionPresent: Boolean(bearerToken),
    sessionValid: Boolean(session),
    userFound: Boolean(user),
    provider: user?.loginMethod || null,
    discordStateCookiePresent: Boolean(cookies[DISCORD_STATE_COOKIE]),
  };
}

export function toSafeUser(user: User | null | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSignedIn: user.lastSignedIn,
  };
}

function isHttpsRequest(req: Request) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  return typeof forwardedProto === "string" && forwardedProto.split(",").some(value => value.trim() === "https");
}

function requestOrigin(req: Request) {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = typeof forwardedHost === "string" ? forwardedHost.split(",")[0].trim() : req.get("host");
  return `${isHttpsRequest(req) ? "https" : "http"}://${host || "localhost"}`;
}

export function getDiscordRedirectUri(req: Request) {
  return process.env.DISCORD_REDIRECT_URI || `${requestOrigin(req)}${DISCORD_CALLBACK_PATH}`;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmailPassword(email: string, password: string) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Введите корректный email");
  if (password.length < 8 || password.length > 128) throw new Error("Пароль должен содержать от 8 до 128 символов");
  return normalized;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const [algorithm, saltText, hashText] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    const actual = Buffer.from(await deriveKey(password, salt, expected.length));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function registerEmailAccount(input: { name: string; email: string; password: string }) {
  const email = validateEmailPassword(input.email, input.password);
  const existing = await db.getUserByEmail(email);
  if (existing) throw new Error("Пользователь с таким email уже зарегистрирован");
  const name = input.name.trim().slice(0, 120) || email.split("@")[0];
  const user = await db.createLocalAuthUser({
    name,
    email,
    passwordHash: await hashPassword(input.password),
    loginMethod: "email",
  });
  if (!user) throw new Error("Не удалось создать пользователя");
  return user;
}

export async function authenticateEmailAccount(input: { email: string; password: string }) {
  const email = validateEmailPassword(input.email, input.password);
  const user = await db.getUserByEmail(email);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new Error("Неверный email или пароль");
  await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
  const authenticated = await db.getUserByOpenId(user.openId);
  if (!authenticated) throw new Error("Пользователь не найден");
  return authenticated;
}

export async function setLocalSessionCookie(req: Request, res: Response, user: User) {
  const token = await sdk.signSession({
    openId: user.openId,
    appId: LOCAL_SESSION_APP_ID,
    name: user.name?.trim() || user.email || user.openId,
  }, { expiresInMs: ONE_YEAR_MS });
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions,
    sameSite: cookieOptions.secure ? "none" : "lax",
    maxAge: ONE_YEAR_MS,
  });
}

export function buildDiscordSuccessRedirect() {
  return "/auth/success?provider=discord";
}

export function buildDiscordAuthErrorRedirect(reason: string) {
  return `/diagnostics/oauth?auth=error&reason=${encodeURIComponent(reason)}`;
}

function redirectWithAuthError(res: Response, reason: string) {
  res.redirect(buildDiscordAuthErrorRedirect(reason));
}

export function describeDiscordOAuthError(status: number, body: string, redirectUri: string) {
  let detail = "unknown_error";
  try {
    const parsed = JSON.parse(body) as { error?: string; error_description?: string };
    detail = parsed.error_description || parsed.error || detail;
  } catch {
    detail = body.slice(0, 160) || detail;
  }
  return `Discord token exchange failed (${status}: ${detail}; redirect_uri=${redirectUri})`;
}

export function buildDiscordAuthorizationUrl(req: Request, state: string) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) throw new Error("Discord OAuth is not configured");
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getDiscordRedirectUri(req));
  url.searchParams.set("scope", "identify email");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeDiscordCode(req: Request, code: string) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Discord OAuth is not configured");
  const redirectUri = getDiscordRedirectUri(req);
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!response.ok) {
    throw new Error(describeDiscordOAuthError(response.status, await response.text(), redirectUri));
  }
  const payload = await response.json() as { access_token?: string; token_type?: string };
  if (!payload.access_token) throw new Error("Discord token missing");
  return payload.access_token;
}

async function getDiscordUser(accessToken: string) {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Discord user lookup failed");
  return response.json() as Promise<{ id: string; username?: string; global_name?: string | null; email?: string | null; verified?: boolean }>;
}

export function registerCustomAuthRoutes(app: Express) {
  app.get("/api/auth/discord/start", (req, res) => {
    try {
      const state = randomBytes(32).toString("hex");
      res.cookie(DISCORD_STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: "lax",
        secure: isHttpsRequest(req),
        path: "/",
        maxAge: DISCORD_STATE_MAX_AGE_MS,
      });
      res.redirect(buildDiscordAuthorizationUrl(req, state));
    } catch {
      redirectWithAuthError(res, "discord_config");
    }
  });

  app.get(DISCORD_CALLBACK_PATH, async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const expectedState = parseCookie(req.headers.cookie ?? "")[DISCORD_STATE_COOKIE];
    res.clearCookie(DISCORD_STATE_COOKIE, { httpOnly: true, sameSite: "lax", secure: isHttpsRequest(req), path: "/" });
    if (!code || !state || !expectedState || state.length !== expectedState.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) {
      redirectWithAuthError(res, "discord_state");
      return;
    }
    try {
      const discordUser = await getDiscordUser(await exchangeDiscordCode(req, code));
      const email = discordUser.email && discordUser.verified ? normalizeEmail(discordUser.email) : null;
      let user = await db.getUserByDiscordId(discordUser.id);
      if (!user && email) user = await db.getUserByEmail(email);
      if (user) {
        user = await db.updateUserAuthIdentity(user.id, {
          name: discordUser.global_name || discordUser.username || user.name || "Discord user",
          email: email || user.email,
          discordId: discordUser.id,
          loginMethod: "discord",
        });
      } else {
        user = await db.createLocalAuthUser({
          name: discordUser.global_name || discordUser.username || "Discord user",
          email: email || `discord-${discordUser.id}@users.invalid`,
          discordId: discordUser.id,
          loginMethod: "discord",
        });
      }
      if (!user) throw new Error("Discord user provisioning failed");
      await setLocalSessionCookie(req, res, user);
      res.redirect(buildDiscordSuccessRedirect());
    } catch (error) {
      console.error("[Discord OAuth] Callback failed", error);
      redirectWithAuthError(res, "discord_callback");
    }
  });
}
