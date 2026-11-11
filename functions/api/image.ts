// GET /api/image?url=...: fetches one picture from another site for this page, because most sites
// don't let other sites read their images. Only raster pictures come back (never SVG, which can
// carry a script, nor HTML), at most 20 MB, with headers that keep the browser from running
// anything in them. Nothing is stored.
import { checkAddress } from "../../lib/server/urls.ts";

const MAX_BYTES = 20 * 1024 * 1024;
const PICTURES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/bmp"]);
const SAFE = {
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

const refuse = (message: string, status: number) =>
  new Response(message, { status, headers: { ...SAFE, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export const onRequestGet = async ({ request }: { request: Request }) => {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") return refuse("This service only answers its own page.", 403);

  const checked = checkAddress(new URL(request.url).searchParams.get("url") ?? "");
  if (!checked.ok) return refuse(checked.reason, 400);

  let upstream: Response;
  try {
    upstream = await fetch(checked.url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8", "User-Agent": "Mozilla/5.0 (compatible; Compress image checker)" },
    });
  } catch {
    return refuse("The picture didn't arrive in time.", 502);
  }
  if (!upstream.ok || !upstream.body) return refuse(`The site answered with an error (${upstream.status}).`, 502);
  const type = (upstream.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!PICTURES.has(type)) return refuse("Not a picture this tool can compress.", 415);
  if (Number(upstream.headers.get("Content-Length") ?? 0) > MAX_BYTES) return refuse("That picture is larger than 20 MB.", 413);

  const reader = upstream.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return refuse("That picture is larger than 20 MB.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new Response(bytes, {
    headers: { ...SAFE, "Content-Type": type, "Content-Disposition": "inline", "Cache-Control": "private, max-age=300" },
  });
};
