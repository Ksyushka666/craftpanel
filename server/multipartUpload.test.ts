import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  parseMultipartServerId,
  validateMultipartFilename,
  validateMultipartPath,
} from "./multipartUpload";

describe("multipart upload boundaries", () => {
  it("accepts safe absolute directories and filenames", () => {
    expect(validateMultipartPath("/world/datapacks")).toBe("/world/datapacks");
    expect(validateMultipartFilename("world.zip")).toBe("world.zip");
    expect(parseMultipartServerId("42")).toBe(42);
  });

  it("rejects traversal and absolute upload filenames", () => {
    expect(() => validateMultipartPath("../secrets")).toThrow("Invalid server path");
    expect(() => validateMultipartPath("/world/../secrets")).toThrow("Invalid server path");
    expect(() => validateMultipartFilename("/tmp/world.zip")).toThrow("Invalid upload filename");
    expect(() => validateMultipartFilename("../world.zip")).toThrow("Invalid upload filename");
  });

  it("rejects malformed server ids and exposes a bounded upload limit", () => {
    expect(() => parseMultipartServerId("0")).toThrow("Invalid serverId");
    expect(() => parseMultipartServerId("not-a-number")).toThrow("Invalid serverId");
    expect(MAX_UPLOAD_BYTES).toBe(512 * 1024 * 1024);
  });
});
