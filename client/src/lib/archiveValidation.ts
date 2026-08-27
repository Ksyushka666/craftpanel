const ARCHIVE_EXTENSIONS = new Set([
  "zip", "jar", "war", "ear", "7z", "rar", "gz", "tgz", "bz2", "xz", "zst", "tar",
]);

type Signature = { extensions: string[]; bytes: number[] };
const SIGNATURES: Signature[] = [
  { extensions: ["zip", "jar", "war", "ear"], bytes: [0x50, 0x4b] },
  { extensions: ["7z"], bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { extensions: ["rar"], bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  { extensions: ["gz", "tgz"], bytes: [0x1f, 0x8b] },
  { extensions: ["bz2"], bytes: [0x42, 0x5a, 0x68] },
  { extensions: ["xz"], bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00] },
  { extensions: ["zst"], bytes: [0x28, 0xb5, 0x2f, 0xfd] },
];

const extensionOf = (name: string) => name.toLowerCase().split(".").pop() ?? "";
export const isArchiveFileName = (name: string) => ARCHIVE_EXTENSIONS.has(extensionOf(name));
const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((value, index) => bytes[index] === value);
const u16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const u32 = (bytes: Uint8Array, offset: number) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
const zipBytes = (extension: string) => ["zip", "jar", "war", "ear"].includes(extension);

export type ArchiveValidation = { valid: true } | { valid: false; reason: string };
export type ArchivePreview = {
  archiveSize: number;
  totalUncompressedSize: number;
  entries: Array<{ name: string; size: number; compressedSize: number; directory: boolean }>;
  totalEntries: number;
  previewAvailable: boolean;
};

async function validateZipStructure(file: Pick<File, "size" | "slice">): Promise<ArchiveValidation> {
  const tailStart = Math.max(0, file.size - 65_557);
  const tail = new Uint8Array(await file.slice(tailStart, file.size).arrayBuffer());
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (u32(tail, index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) return { valid: false, reason: "ZIP-архив обрезан: не найден конец каталога" };
  const commentLength = u16(tail, eocd + 20);
  if (eocd + 22 + commentLength > tail.length) return { valid: false, reason: "ZIP-архив повреждён: обрезан комментарий" };
  const entryCount = u16(tail, eocd + 10);
  const directorySize = u32(tail, eocd + 12);
  const directoryOffset = u32(tail, eocd + 16);
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) return { valid: false, reason: "ZIP64-архив не поддерживается этим быстрым проверяющим" };
  const eocdOffset = tailStart + eocd;
  if (directoryOffset + directorySize !== eocdOffset || directoryOffset + directorySize > file.size) return { valid: false, reason: "ZIP-архив повреждён: каталог выходит за границы файла" };
  if (directorySize > 32 * 1024 * 1024) return { valid: false, reason: "Каталог ZIP слишком велик для проверки в браузере" };
  const directory = new Uint8Array(await file.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer());
  let offset = 0;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 46 > directory.length || u32(directory, offset) !== 0x02014b50) return { valid: false, reason: "ZIP-архив повреждён: неверная запись каталога" };
    const compressedSize = u32(directory, offset + 20);
    const nameLength = u16(directory, offset + 28);
    const extraLength = u16(directory, offset + 30);
    const commentLengthInEntry = u16(directory, offset + 32);
    const recordLength = 46 + nameLength + extraLength + commentLengthInEntry;
    if (offset + recordLength > directory.length) return { valid: false, reason: "ZIP-архив повреждён: запись каталога обрезана" };
    const localOffset = u32(directory, offset + 42);
    if (localOffset + 30 > file.size) return { valid: false, reason: "ZIP-архив повреждён: локальный заголовок отсутствует" };
    const local = new Uint8Array(await file.slice(localOffset, localOffset + 30).arrayBuffer());
    if (local.length < 30 || u32(local, 0) !== 0x04034b50) return { valid: false, reason: "ZIP-архив повреждён: неверный локальный заголовок" };
    const localNameLength = u16(local, 26);
    const localExtraLength = u16(local, 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart > file.size || dataStart + compressedSize > file.size) return { valid: false, reason: "ZIP-архив обрезан: содержимое записи отсутствует" };
    offset += recordLength;
  }
  return offset === directory.length ? { valid: true } : { valid: false, reason: "ZIP-архив повреждён: каталог содержит лишние данные" };
}

export async function validateArchiveFile(file: Pick<File, "name" | "size" | "slice">): Promise<ArchiveValidation> {
  const extension = extensionOf(file.name);
  if (!ARCHIVE_EXTENSIONS.has(extension)) return { valid: true };
  if (file.size === 0) return { valid: false, reason: "Архив пустой или повреждён" };
  const header = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (zipBytes(extension)) {
    if (!startsWith(header, [0x50, 0x4b])) return { valid: false, reason: "Файл имеет неверную сигнатуру и может быть повреждён" };
    return validateZipStructure(file);
  }
  if (extension === "tar") {
    const tarMarker = new TextDecoder().decode(header.slice(257, 262));
    return tarMarker === "ustar" ? { valid: true } : { valid: false, reason: "Не удалось подтвердить структуру TAR-архива" };
  }
  const signature = SIGNATURES.find(item => item.extensions.includes(extension));
  return signature && startsWith(header, signature.bytes) ? { valid: true } : { valid: false, reason: "Файл имеет неверную сигнатуру и может быть повреждён" };
}

export async function getArchivePreview(file: Pick<File, "name" | "size" | "slice">): Promise<ArchivePreview> {
  const validation = await validateArchiveFile(file);
  if (!validation.valid) throw new Error(validation.reason);
  const extension = extensionOf(file.name);
  if (!zipBytes(extension)) {
    return { archiveSize: file.size, totalUncompressedSize: file.size, entries: [], totalEntries: 0, previewAvailable: false };
  }
  const tailStart = Math.max(0, file.size - 65_557);
  const tail = new Uint8Array(await file.slice(tailStart, file.size).arrayBuffer());
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (u32(tail, index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("ZIP-архив повреждён: не найден каталог");
  const totalEntries = u16(tail, eocd + 10);
  const directorySize = u32(tail, eocd + 12);
  const directoryOffset = u32(tail, eocd + 16);
  const directory = new Uint8Array(await file.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer());
  const entries: ArchivePreview["entries"] = [];
  let offset = 0;
  let totalUncompressedSize = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    const nameLength = u16(directory, offset + 28);
    const extraLength = u16(directory, offset + 30);
    const commentLength = u16(directory, offset + 32);
    const compressedSize = u32(directory, offset + 20);
    const size = u32(directory, offset + 24);
    const name = new TextDecoder().decode(directory.slice(offset + 46, offset + 46 + nameLength));
    totalUncompressedSize += size;
    if (entries.length < 500) entries.push({ name, size, compressedSize, directory: name.endsWith("/") });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { archiveSize: file.size, totalUncompressedSize, entries, totalEntries, previewAvailable: true };
}
