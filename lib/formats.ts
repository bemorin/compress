// Formats, file signatures and names. Pure functions, tested in tests/formats.test.ts.

export type SourceFormat = "jpeg" | "png" | "webp" | "avif" | "gif" | "bmp" | "heic";
export type TargetFormat = "webp" | "avif" | "jpeg" | "png";
export type TargetChoice = TargetFormat | "same";

export const TARGETS: { id: TargetChoice; label: string; note: string }[] = [
  { id: "webp", label: "WebP", note: "Every browser shows it. The safe choice for a website." },
  { id: "avif", label: "AVIF", note: "Often the smallest. Slower to make." },
  { id: "jpeg", label: "JPEG", note: "Opens anywhere, email included." },
  { id: "png", label: "PNG", note: "Lossless. For screenshots, logos and flat colour." },
  { id: "same", label: "Same", note: "Keeps each file's own format." },
];

export const MIME: Record<TargetFormat, string> = {
  webp: "image/webp",
  avif: "image/avif",
  jpeg: "image/jpeg",
  png: "image/png",
};

export const EXTENSION: Record<TargetFormat, string> = { webp: "webp", avif: "avif", jpeg: "jpg", png: "png" };

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value);

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

/** Reads the first bytes of a file and says what it really is, whatever its name says. */
export function sniff(bytes: Uint8Array): SourceFormat | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (ascii(bytes, 0, 4) === "GIF8") return "gif";
  if (startsWith(bytes, [0x42, 0x4d])) return "bmp";
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brands = ascii(bytes, 8, Math.min(bytes.length, 32));
    if (/avif|avis/.test(brands)) return "avif";
    if (/heic|heix|hevc|heim|heis|mif1|msf1/.test(brands)) return "heic";
  }
  return null;
}

/** The format a file is saved in, once the choice is made. GIF, BMP and HEIC become WebP. */
export function targetFor(source: SourceFormat, choice: TargetChoice): TargetFormat {
  if (choice !== "same") return choice;
  if (source === "jpeg" || source === "png" || source === "webp" || source === "avif") return source;
  return "webp";
}

/** "holiday photo.HEIC" + jpeg → "holiday photo.jpg". */
export function outputName(name: string, target: TargetFormat) {
  const base = name.replace(/\.[^./\\]+$/, "") || "image";
  return `${base}.${EXTENSION[target]}`;
}

/** Makes every name in a ZIP unique: a.webp, a (2).webp, a (3).webp. */
export function uniqueNames(names: string[]) {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
  });
}

/** A file name from an image address: https://x.com/a/b/photo.jpg?w=2 → photo.jpg */
export function nameFromUrl(address: string, index: number) {
  try {
    const last = decodeURIComponent(new URL(address).pathname.split("/").filter(Boolean).pop() ?? "");
    const clean = last.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);
    return clean || `image-${index + 1}`;
  } catch {
    return `image-${index + 1}`;
  }
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
}

/** −73% when smaller, +12% when larger, 0% when equal. */
export function formatChange(before: number, after: number) {
  if (!before) return "0%";
  const change = Math.round(((after - before) / before) * 100);
  if (change === 0) return "0%";
  return change < 0 ? `−${Math.abs(change)}%` : `+${change}%`;
}
