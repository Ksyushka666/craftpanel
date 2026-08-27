import express from "express";
import { createServer, request as httpRequest, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authenticateRequest = vi.fn();
const falixUploadFileFromPath = vi.fn();
const falixIsConfigured = vi.fn(() => true);
const getServerAccess = vi.fn(async () => ({ role: "operator" as const, server: { id: 42 } }));
const logServerAction = vi.fn(async () => undefined);

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest } }));
vi.mock("./falix", () => ({ falixIsConfigured, falixUploadFileFromPath }));
vi.mock("./db", () => ({ getServerAccess, logServerAction }));

const { registerMultipartUploadRoute } = await import("./multipartUpload");

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  authenticateRequest.mockResolvedValue({ id: 7 });
  falixUploadFileFromPath.mockResolvedValue({ success: true });
  const app = express();
  registerMultipartUploadRoute(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not start");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  vi.clearAllMocks();
});

describe("POST /api/upload/multipart", () => {
  it("rejects unauthenticated requests", async () => {
    authenticateRequest.mockRejectedValueOnce(new Error("unauthorized"));
    const response = await fetch(`${baseUrl}/api/upload/multipart`, { method: "POST" });
    expect(response.status).toBe(401);
  });

  it("requires multipart/form-data", async () => {
    const response = await fetch(`${baseUrl}/api/upload/multipart`, { method: "POST", body: "not multipart" });
    expect(response.status).toBe(415);
  });

  it("rejects an oversized declared multipart request with 413", async () => {
    const result = await new Promise<{ status: number }>((resolve, reject) => {
      const url = new URL(`${baseUrl}/api/upload/multipart`);
      const request = httpRequest({ hostname: url.hostname, port: Number(url.port), path: url.pathname, method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": String(512 * 1024 * 1024 + 1) } }, response => { response.resume(); response.once("end", () => resolve({ status: response.statusCode ?? 0 })); });
      request.once("error", reject);
      request.end("x");
    });
    expect(result.status).toBe(413);
  });

  it("delegates a valid upload to the provider without tRPC base64", async () => {
    const form = new FormData();
    form.append("serverId", "42");
    form.append("parentPath", "/world");
    form.append("name", "world.zip");
    form.append("mimeType", "application/zip");
    form.append("file", new Blob(["archive bytes"], { type: "application/zip" }), "world.zip");
    const response = await fetch(`${baseUrl}/api/upload/multipart`, { method: "POST", body: form });
    expect(response.status).toBe(201);
    expect(falixUploadFileFromPath).toHaveBeenCalledWith("/world", "world.zip", expect.any(String), 13, "application/zip", 42);
    expect(logServerAction).toHaveBeenCalledWith(7, 42, "file_upload", "world.zip", expect.stringContaining("multipart"));
  });

  it("rejects traversal in multipart fields", async () => {
    const form = new FormData();
    form.append("serverId", "42");
    form.append("parentPath", "/world");
    form.append("name", "../world.zip");
    form.append("file", new Blob(["x"]), "world.zip");
    const response = await fetch(`${baseUrl}/api/upload/multipart`, { method: "POST", body: form });
    expect(response.status).toBe(400);
    expect(falixUploadFileFromPath).not.toHaveBeenCalled();
  });
});
