import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { falixGetStatus, falixListFiles, falixSendPower } from "./falix";

const fetchMock = vi.fn();

describe("Falix provider bridge", () => {
  beforeEach(() => {
    process.env.FALIX_API_KEY = "test-key";
    process.env.FALIX_SERVER_ID = "3409521";
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    process.env.FALIX_API_KEY = "test-key";
    process.env.FALIX_SERVER_ID = "3409521";
  });

  it("reads status with server-only bearer auth", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { state: "running" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(falixGetStatus()).resolves.toMatchObject({ state: "running" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://client.falixnodes.net/api/v2/servers/3409521/status",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect((request.headers as Headers).get("Authorization")).toBe("Bearer test-key");
  });

  it("sends replay-safe power signals", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { state: "starting" } }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(falixSendPower("start")).resolves.toMatchObject({ state: "starting" });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toEqual({ signal: "start" });
    expect((request.headers as Headers).get("Idempotency-Key")).toMatch(/^craftpanel-3409521-start-/);
  });

  it("resolves a mapped local server to its own Falix server", async () => {
    process.env.FALIX_SERVER_MAP = JSON.stringify({ "2": 3409522 });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { state: "offline" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await falixGetStatus(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://client.falixnodes.net/api/v2/servers/3409522/status");
    delete process.env.FALIX_SERVER_MAP;
  });

  it("lists remote files for the requested directory", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ name: "server.properties", path: "/server.properties", is_file: true, is_directory: false, size: 105, modified_at: "2026-08-27T16:53:22Z" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(falixListFiles("/")).resolves.toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://client.falixnodes.net/api/v2/servers/3409521/files?path=%2F");
  });
});
