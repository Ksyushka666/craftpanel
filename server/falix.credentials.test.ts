import { describe, expect, it } from "vitest";

describe.skipIf(process.env.RUN_FALIX_SMOKE_TESTS !== "1")("Falix credentials", () => {
  it("authenticates against the Falix API", async () => {
    const apiKey = process.env.FALIX_API_KEY;
    expect(apiKey, "FALIX_API_KEY must be configured").toBeTruthy();

    const response = await fetch("https://client.falixnodes.net/api/v2/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.ok, `Falix API responded with ${response.status}`).toBe(true);
    const payload = (await response.json()) as { data?: unknown };
    expect(payload.data).toBeDefined();
  }, 20_000);

  it("resolves the configured Falix server status", async () => {
    const apiKey = process.env.FALIX_API_KEY;
    const serverId = process.env.FALIX_SERVER_ID;
    expect(apiKey, "FALIX_API_KEY must be configured").toBeTruthy();
    expect(serverId, "FALIX_SERVER_ID must be configured").toMatch(/^\d+$/);

    const response = await fetch(`https://client.falixnodes.net/api/v2/servers/${serverId}/status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.ok, `Falix server status responded with ${response.status}`).toBe(true);
    const payload = (await response.json()) as { data?: { state?: string } };
    expect(payload.data?.state).toBeDefined();
  }, 20_000);
});
