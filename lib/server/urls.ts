// Address checks and HTML attribute parsing for the two Pages Functions. Pure functions, tested in
// tests/urls.test.ts. They run on Cloudflare, never in the browser.

export type AddressCheck = { ok: true; url: URL } | { ok: false; reason: string };

const PRIVATE_V4 = [
  [0, 8], [10, 8], [100, 64, 10], [127, 8], [169, 254, 16], [172, 16, 12], [192, 0, 0, 24], [192, 168, 16], [198, 18, 15], [224, 4], [240, 4],
] as const;

function privateV4(host: string) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const value = ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  return PRIVATE_V4.some((range) => {
    const bits = range[range.length - 1];
    const base = range.slice(0, -1).concat([0, 0, 0]).slice(0, 4) as number[];
    const start = ((base[0] << 24) >>> 0) + (base[1] << 16) + (base[2] << 8) + base[3];
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((value & mask) >>> 0) === ((start & mask) >>> 0);
  });
}

function privateV6(host: string) {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!bare.includes(":")) return false;
  if (bare === "::" || bare === "::1") return true;
  if (/^f[cd]/.test(bare) || /^fe[89ab]/.test(bare)) return true;
  const dotted = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return privateV4(dotted[1]);
  // The URL parser writes ::ffff:127.0.0.1 as ::ffff:7f00:1.
  const hex = bare.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return privateV4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return false;
}

/** Accepts a public http(s) address only. A bare domain gets https:// in front. */
export function checkAddress(raw: string): AddressCheck {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "Enter the address of a page." };
  if (text.length > 2048) return { ok: false, reason: "That address is too long." };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: "That doesn't look like a web address." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "Only http and https addresses work." };
  if (url.username || url.password) return { ok: false, reason: "Addresses with a user name or password aren't accepted." };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "Only the standard web ports work." };
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") && !host.includes(":")) return { ok: false, reason: "That address has no domain." };
  if (host === "localhost" || /\.(localhost|local|internal|lan|home|arpa)$/.test(host)) return { ok: false, reason: "Private addresses aren't accepted." };
  if (privateV4(host) || privateV6(host)) return { ok: false, reason: "Private addresses aren't accepted." };
  url.hash = "";
  return { ok: true, url };
}

/**
 * Every address in a srcset, largest first (by its w or x descriptor). Follows the HTML parsing
 * rules, so commas inside an address (common with image CDNs) don't split it.
 */
export function srcsetCandidates(value: string) {
  const text = String(value ?? "");
  const candidates: { address: string; weight: number }[] = [];
  let index = 0;
  while (index < text.length) {
    while (index < text.length && /[\s,]/.test(text[index])) index++;
    if (index >= text.length) break;
    const start = index;
    while (index < text.length && !/\s/.test(text[index])) index++;
    let address = text.slice(start, index);
    let descriptor = "";
    if (address.endsWith(",")) {
      address = address.replace(/,+$/, "");
    } else {
      const from = index;
      while (index < text.length && text[index] !== ",") index++;
      descriptor = text.slice(from, index).trim();
      index++;
    }
    if (!address) continue;
    const amount = Number.parseFloat(descriptor) || 1;
    candidates.push({ address, weight: /w$/i.test(descriptor) ? amount : amount * 1000 });
  }
  return candidates.sort((a, b) => b.weight - a.weight).map((candidate) => candidate.address);
}

/** Addresses inside url(...) in an inline style. */
export function cssUrls(style: string) {
  const found: string[] = [];
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(String(style ?? "")))) found.push(match[2].trim());
  return found;
}

/** Turns a value from the page into an absolute public address, or null. Skips data:, SVG and icons. */
export function resolveImage(value: string, base: string) {
  const text = String(value ?? "").trim();
  if (!text || /^(data|blob|javascript):/i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text, base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (/\.(svg|svgz|ico)$/i.test(url.pathname)) return null;
  url.hash = "";
  return url.toString();
}
