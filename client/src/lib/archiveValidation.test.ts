import { describe, expect, it } from "vitest";
import { getArchivePreview, validateArchiveFile } from "./archiveValidation";

const fakeFile = (name: string, bytes: number[], size = bytes.length) => ({
  name,
  size,
  slice: (start = 0, end = size) => ({
    arrayBuffer: async () => Uint8Array.from(bytes.slice(start, end)).buffer,
  }),
});

const le16 = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
const le32 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
const minimalEmptyZip = [0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)];

function storedZip(name: string, content: number[]) {
  const filename = Array.from(new TextEncoder().encode(name));
  const local = [0x50, 0x4b, 0x03, 0x04, ...le16(20), ...new Array(8).fill(0), ...new Array(4).fill(0), ...le32(content.length), ...le32(content.length), ...le16(filename.length), 0, 0, ...filename, ...content];
  const central = [0x50, 0x4b, 0x01, 0x02, ...le16(20), ...le16(20), ...new Array(8).fill(0), ...new Array(4).fill(0), ...le32(content.length), ...le32(content.length), ...le16(filename.length), 0, 0, 0, 0, ...new Array(8).fill(0), ...le32(0), ...filename];
  const eocd = [0x50, 0x4b, 0x05, 0x06, ...new Array(4).fill(0), ...le16(1), ...le16(1), ...le32(central.length), ...le32(local.length), 0, 0];
  return [...local, ...central, ...eocd];
}

describe("archive validation and preview", () => {
  it("accepts a structurally valid empty ZIP", async () => {
    await expect(validateArchiveFile(fakeFile("world.zip", minimalEmptyZip))).resolves.toEqual({ valid: true });
  });

  it("rejects a truncated ZIP even when the magic header is valid", async () => {
    const result = await validateArchiveFile(fakeFile("world.zip", [0x50, 0x4b, 0x03, 0x04]));
    expect(result.valid).toBe(false);
  });

  it("returns file names and total uncompressed size for a valid ZIP", async () => {
    const bytes = storedZip("server.properties", [97, 98, 99]);
    const preview = await getArchivePreview(fakeFile("bundle.jar", bytes));
    expect(preview.previewAvailable).toBe(true);
    expect(preview.totalEntries).toBe(1);
    expect(preview.totalUncompressedSize).toBe(3);
    expect(preview.entries[0]).toMatchObject({ name: "server.properties", size: 3, compressedSize: 3, directory: false });
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
