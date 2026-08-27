import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { validFalixSignature } from "./falixWebhook";

describe("Falix webhook signatures", () => {
  it("accepts the exact raw body signed with the webhook secret", () => {
    const body = Buffer.from('{"event":"server.started","occurred_at":1}');
    const signature = `sha256=${crypto.createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(validFalixSignature("secret", body, signature)).toBe(true);
  });

  it("rejects missing, altered, or differently serialized bodies", () => {
    const body = Buffer.from('{"a":1,"b":2}');
    const signature = `sha256=${crypto.createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(validFalixSignature("secret", body, undefined)).toBe(false);
    expect(validFalixSignature("wrong", body, signature)).toBe(false);
    expect(validFalixSignature("secret", Buffer.from('{"b":2,"a":1}'), signature)).toBe(false);
  });
});
