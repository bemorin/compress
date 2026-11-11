// POST /api/scan {"url": "..."}: lists the pictures a page shows, from its HTML.
// The page is read once, with a time limit and at most 3 MB of it. Nothing is stored.
// Each picture comes with a short-lived signed token, the only way /api/image will fetch it
// (when the IMAGE_LINK_SECRET variable is set, which it should be in production).
import { signLink } from "../../lib/server/sign.ts";
import { checkAddress, cssUrls, resolveImage, srcsetCandidates } from "../../lib/server/urls.ts";

const MAX_HTML = 3 * 1024 * 1024;
const MAX_IMAGES = 80;

type Source = "img" | "picture" | "og:image" | "preload" | "css" | "poster";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });

async function readCapped(response: Response, limit: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size >= limit) {
      await reader.cancel();
      break;
    }
  }
  const bytes = new Uint8Array(Math.min(size, limit));
  let at = 0;
  for (const chunk of chunks) {
    const room = bytes.length - at;
    if (room <= 0) break;
    bytes.set(chunk.subarray(0, room), at);
    at += Math.min(room, chunk.byteLength);
  }
  return new TextDecoder().decode(bytes);
}

export const onRequestPost = async ({ request, env }: { request: Request; env: { IMAGE_LINK_SECRET?: string } }) => {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "This service only answers its own page." }, 403);

  const payload = (await request.json().catch(() => null)) as { url?: string } | null;
  const checked = checkAddress(payload?.url ?? "");
  if (!checked.ok) return json({ error: checked.reason }, 400);

  let response: Response;
  try {
    response = await fetch(checked.url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; Compress image checker)",
      },
    });
  } catch {
    return json({ error: "The page didn't answer in time." }, 502);
  }
  if (!response.ok) return json({ error: `The page answered with an error (${response.status}).` }, 502);
  const type = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!type.includes("html")) return json({ error: "That address isn't a web page." }, 415);

  const finalUrl = checkAddress(response.url || checked.url.toString());
  if (!finalUrl.ok) return json({ error: finalUrl.reason }, 400);

  const html = await readCapped(response, MAX_HTML);
  let base = finalUrl.url.toString();
  const found = new Map<string, Source>();
  const add = (value: string | null | undefined, source: Source) => {
    if (!value || found.size >= MAX_IMAGES) return;
    const address = resolveImage(value, base);
    if (address && checkAddress(address).ok && !found.has(address)) found.set(address, source);
  };

  const rewriter = new HTMLRewriter()
    .on("base[href]", {
      element(element) {
        const href = element.getAttribute("href");
        if (href) try { base = new URL(href, base).toString(); } catch { /* keep the page address */ }
      },
    })
    .on("img", {
      element(element) {
        const srcset = element.getAttribute("srcset") ?? element.getAttribute("data-srcset");
        if (srcset) add(srcsetCandidates(srcset)[0], "img");
        add(element.getAttribute("src"), "img");
        add(element.getAttribute("data-src"), "img");
        add(element.getAttribute("data-lazy-src"), "img");
        add(element.getAttribute("data-original"), "img");
      },
    })
    .on("picture source[srcset]", {
      element(element) {
        add(srcsetCandidates(element.getAttribute("srcset") ?? "")[0], "picture");
      },
    })
    .on('meta[property="og:image"], meta[name="twitter:image"]', {
      element(element) {
        add(element.getAttribute("content"), "og:image");
      },
    })
    .on('link[rel~="preload"][as="image"]', {
      element(element) {
        const set = element.getAttribute("imagesrcset");
        add(set ? srcsetCandidates(set)[0] : element.getAttribute("href"), "preload");
      },
    })
    .on("video[poster]", {
      element(element) {
        add(element.getAttribute("poster"), "poster");
      },
    })
    .on("[style]", {
      element(element) {
        for (const address of cssUrls(element.getAttribute("style") ?? "")) add(address, "css");
      },
    });

  await rewriter.transform(new Response(html, { headers: { "Content-Type": "text/html" } })).arrayBuffer();

  const secret = env.IMAGE_LINK_SECRET;
  const images = await Promise.all(
    [...found].map(async ([url, source]) => ({ url, source, token: secret ? await signLink(secret, url) : null })),
  );
  return json({ page: finalUrl.url.toString(), images, truncated: found.size >= MAX_IMAGES });
};
