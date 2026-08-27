import { describe, expect, it } from "vitest";

const hasRenderApiKey = Boolean(process.env.RENDER_API_KEY);

describe.skipIf(!hasRenderApiKey)("Render API credentials", () => {
  it("can read the configured CraftPanel service without exposing the API key", async () => {
    const apiKey = process.env.RENDER_API_KEY!;
    const response = await fetch("https://api.render.com/v1/services/srv-da7ufrid0e5s739s4ivg", {
      headers: { authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(200);
    expect(response.url).not.toContain(apiKey);
  }, 15_000);
});
