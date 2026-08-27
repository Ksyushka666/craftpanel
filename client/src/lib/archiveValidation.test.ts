import { describe, expect, it } from "vitest";
import { validateArchiveFile } from "./archiveValidation";

const fakeFile = (name: string, bytes: number[], size = bytes.length) => ({
  name,
  size,
  slice: (start = 0, end = size) => ({
    arrayBuffer: async () => Uint8Array.from(bytes.slice(start, end)).buffer,
  }),
});

const minimalEmptyZip = [0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)];

describe("archive validation", () => {
  it("accepts a structurally valid empty ZIP", async () => {
    await expect(validateArchiveFile(fakeFile("world.zip", minimalEmptyZip))).resolves.toEqual({ valid: true });
  });

  it("rejects a truncated ZIP even when the magic header is valid", async () => {
    const result = await validateArchiveFile(fakeFile("world.zip", [0x50, 0x4b, 0x03, 0x04]));
    expect(result.valid).toBe(false);
  });

  it("rejects an empty archive upload", async () => {
    await expect(validateArchiveFile(fakeFile("world.jar", [], 0))).resolves.toMatchObject({ valid: false });
  });

  it("does not inspect non-archive files", async () => {
    await expect(validateArchiveFile(fakeFile("server.properties", [0x00]))).resolves.toEqual({ valid: true });
  });

  it("accepts a TAR header with the ustar marker", async () => {
    const bytes = new Array(262).fill(0);
    bytes.splice(257, 5, ...Array.from(new TextEncoder().encode("ustar")));
    await expect(validateArchiveFile(fakeFile("world.tar", bytes))).resolves.toEqual({ valid: true });
  });
});
