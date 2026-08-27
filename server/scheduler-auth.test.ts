import { describe, expect, it } from "vitest";
import { getSessionCredential } from "./routers";

describe("scheduler session credentials", () => {
  it("prefers Authorization Bearer when available", () => {
    expect(getSessionCredential({ headers: { authorization: "Bearer bearer-token", cookie: "app_session_id=cookie-token" } })).toBe("bearer-token");
  });

  it("falls back to the session cookie", () => {
    expect(getSessionCredential({ headers: { cookie: "app_session_id=cookie-token" } })).toBe("cookie-token");
  });
});
