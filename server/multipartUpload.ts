import type { Express, Request, Response } from "express";
import Busboy from "busboy";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { falixIsConfigured, falixUploadFileFromPath } from "./falix";
import { getServerAccess, logServerAction } from "./db";
import { sdk } from "./_core/sdk";

export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
export const MAX_FIELD_BYTES = 2_048;
const roleRank: Record<"owner" | "admin" | "operator" | "viewer", number> = { owner: 3, admin: 2, operator: 1, viewer: 0 };

export function validateMultipartPath(path: string) {
  if (!path.startsWith("/") || path.includes("..") || path.includes("\\0")) throw new Error("Invalid server path");
  return path;
}

export function validateMultipartFilename(name: string) {
  if (!name || name.length > 160 || name.includes("..") || name.includes("/") || name.includes("\\")) throw new Error("Invalid upload filename");
  return name;
}

export function parseMultipartServerId(value: string | undefined) {
  const serverId = Number(value);
  if (!Number.isInteger(serverId) || serverId <= 0) throw new Error("Invalid serverId");
  return serverId;
}

export function registerMultipartUploadRoute(app: Express) {
  app.post("/api/upload/multipart", async (req: Request, res: Response) => {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try { user = await sdk.authenticateRequest(req); } catch { res.status(401).json({ error: "Authentication required" }); return; }
    if (!falixIsConfigured()) { res.status(503).json({ error: "Remote file provider is not configured" }); return; }
    const contentType = req.headers["content-type"];
    if (typeof contentType !== "string" || !contentType.toLowerCase().startsWith("multipart/form-data")) { res.status(415).json({ error: "multipart/form-data is required" }); return; }
    const declaredLength = Number(req.headers["content-length"] ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) { res.status(413).json({ error: `Upload is limited to ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB` }); return; }

    const tempPath = join(tmpdir(), `craftpanel-upload-${randomUUID()}`);
    const fields: Record<string, string> = {};
    let fileName = "";
    let fileMimeType = "application/octet-stream";
    let totalBytes = 0;
    let fileSeen = false;
    let limitError: string | null = null;
    let writeError: Error | null = null;
    let writeDone: Promise<void> = Promise.resolve();
    let writer: ReturnType<typeof createWriteStream> | null = null;

    let parser: Busboy.Busboy;
    try {
      parser = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD_BYTES, fields: 8, fieldSize: MAX_FIELD_BYTES, files: 1 } });
    } catch { res.status(400).json({ error: "Invalid multipart request" }); return; }

    parser.on("field", (name, value) => { fields[name] = value; });
    parser.on("file", (_fieldName, file, info) => {
      fileSeen = true;
      fileName = info.filename;
      fileMimeType = info.mimeType || fileMimeType;
      writer = createWriteStream(tempPath, { flags: "w" });
      writeDone = new Promise<void>((resolve, reject) => {
        writer!.once("finish", resolve);
        writer!.once("error", reject);
      });
      file.on("data", (chunk: Buffer) => { totalBytes += chunk.length; });
      file.on("limit", () => { limitError = `Upload is limited to ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB`; });
      file.on("error", error => { writeError = error; });
      file.pipe(writer);
    });
    parser.on("error", error => { limitError ??= error instanceof Error ? error.message : "Malformed multipart request"; });

    parser.on("finish", async () => {
      try {
        await writeDone.catch(error => { writeError ??= error instanceof Error ? error : new Error("Upload write failed"); });
        if (writer && !writer.destroyed) writer.destroy();
        if (limitError || totalBytes > MAX_UPLOAD_BYTES) { res.status(413).json({ error: limitError ?? `Upload is limited to ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB` }); return; }
        if (writeError) { res.status(400).json({ error: writeError.message }); return; }
        if (!fileSeen || totalBytes === 0) { res.status(400).json({ error: "A file field is required" }); return; }
        const serverId = parseMultipartServerId(fields.serverId);
        const parentPath = validateMultipartPath(fields.parentPath || "/");
        const safeName = validateMultipartFilename(fields.name || fileName);
        const access = await getServerAccess(user.id, serverId);
        if (!access?.server || roleRank[access.role] < roleRank.operator) { res.status(403).json({ error: "Server access denied" }); return; }
        await falixUploadFileFromPath(parentPath, safeName, tempPath, totalBytes, fields.mimeType || fileMimeType, serverId);
        await logServerAction(user.id, serverId, "file_upload", safeName, `${safeName} uploaded via multipart`);
        res.status(201).json({ success: true, requestId: randomUUID(), bytes: totalBytes });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Multipart upload failed";
        const status = /access denied/i.test(message) ? 403 : /invalid|limited/i.test(message) ? 400 : 500;
        if (!res.headersSent) res.status(status).json({ error: message });
      } finally { await fs.rm(tempPath, { force: true }).catch(() => undefined); }
    });
    req.pipe(parser);
  });
}
