import { describe, expect, it } from "vitest";
import { OAUTH_SUCCESS_REDIRECT_PATH, resolveSessionName } from "./oauth";
import { decodeOAuthState, encodeOAuthState } from "@shared/const";

describe("OAuth callback contracts", () => {
  it("uses the server workspace as the post-login destination", () => {
    expect(OAUTH_SUCCESS_REDIRECT_PATH).toBe("/servers");
  });

  it("always resolves a non-empty session name", () => {
    expect(resolveSessionName({ openId: "openid-1", name: "  Alex  ", email: "alex@example.com" })).toBe("Alex");
    expect(resolveSessionName({ openId: "openid-2", name: " ", email: "alex@example.com" })).toBe("alex@example.com");
    expect(resolveSessionName({ openId: "openid-3", name: "", email: "" })).toBe("openid-3");
  });

  it("round-trips nonce state and rejects malformed state without throwing", () => {
    const encoded = encodeOAuthState({ redirectUri: "https://craftpanel.example/api/oauth/callback", nonce: "nonce-1" });
    expect(decodeOAuthState(encoded)).toEqual({ redirectUri: "https://craftpanel.example/api/oauth/callback", nonce: "nonce-1" });
    expect(decodeOAuthState("%%%" )).toEqual({ redirectUri: "" });
  });
});
