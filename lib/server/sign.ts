// Signed image links. /api/scan signs every picture address it finds; /api/image only fetches an
// address that carries a fresh signature, so the image relay can't be used for anything else.
// Uses Web Crypto, which both Cloudflare and Node 22 provide. Tested in tests/sign.test.ts.

/** How long a scan's links stay usable. */
export const LINK_SECONDS = 15 * 60;

const encoder = new TextEncoder();

const toBase64Url = (bytes: ArrayBuffer) => {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string) => {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const keyFor = (secret: string) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

/** A token for one address: "<expiry in seconds>.<signature>". */
export async function signLink(secret: string, address: string, nowMs = Date.now()) {
  const expires = Math.floor(nowMs / 1000) + LINK_SECONDS;
  const signature = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(`${expires}.${address}`));
  return `${expires}.${toBase64Url(signature)}`;
}

/** True when the token was made for this exact address with this secret and hasn't expired. */
export async function verifyLink(secret: string, address: string, token: string | null, nowMs = Date.now()) {
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{20,})$/.exec(token ?? "");
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires < Math.floor(nowMs / 1000) || expires > Math.floor(nowMs / 1000) + LINK_SECONDS + 60) return false;
  try {
    // crypto.subtle.verify compares in constant time.
    return await crypto.subtle.verify("HMAC", await keyFor(secret), fromBase64Url(match[2]), encoder.encode(`${expires}.${address}`));
  } catch {
    return false;
  }
}
