import { describe, expect, it } from "vitest";
import { buildOAuthLoginUrl, OAUTH_LOGIN_TIMEOUT_MS } from "./const";

describe("Manus OAuth URL", () => {
  it("uses a bounded authorization timeout", () => {
    expect(OAUTH_LOGIN_TIMEOUT_MS).toBe(45_000);
  });

  it("uses the canonical login endpoint and preserves callback state", () => {
    const url = new URL(buildOAuthLoginUrl("https://manus.im/", "app-123", "https://craftpanel.example/api/oauth/callback", "encoded-state"));
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("app_id")).toBe("app-123");
    expect(url.searchParams.get("redirect_url")).toBe("https://craftpanel.example/api/oauth/callback");
    expect(url.searchParams.get("state")).toBe("encoded-state");
    expect(url.searchParams.has("appId")).toBe(false);
  });
});
