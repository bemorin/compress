# Compress by Ben Morin

Make images lighter in your browser. Drop JPEG, PNG, WebP, AVIF, GIF or HEIC files (or a whole folder), pick a format, a quality and a longest side, and compare the result with the original before you download it. The pictures never leave the browser tab.

A second mode checks a web page: give it an address, and it lists the page's pictures heaviest first, with what each would weigh once compressed.

Live at `https://compress.bemorin.com` (once deployed). Code under the MIT License.

## What it does

- **Formats out:** WebP, AVIF, JPEG (MozJPEG), PNG (lossless, Oxipng), or "Same" to keep each file's own format. GIF, BMP and HEIC become WebP.
- **One quality slider** for every format, with a plain hint of what the number means. PNG ignores it.
- **Longest side:** keep the size, or fit inside 3840, 2560, 1920, 1280 or 800 pixels (never enlarged). Resizing uses a Lanczos filter in linear light.
- **Before and after:** drag the line, click anywhere, or use the arrow keys. The magnifier shows pixels at three times their size where you point.
- **Never worse:** when compressing again in the same format, at the same size, gives a bigger file, the original is kept.
- **Location and camera data are dropped**, since every file is re-encoded from its pixels (except a file whose original is kept, see the next point but one). Photos are turned upright first, following their EXIF orientation.
- **Transparency:** kept in WebP, AVIF and PNG. JPEG has none, so transparent parts become white, and the app says so.
- **Animated GIF:** only the first frame is kept, and the app says so.
- **HEIC** opens where the browser can read it (Safari). Elsewhere the app says so.
- **Downloads:** one file, or everything in a ZIP. Names keep the original base name with the new extension.
- **Limits:** 200 images at a time, 80 MB per file, 60 megapixels per image.

## How it works

Everything heavy runs in Web Workers (up to four, depending on the device), so the page stays smooth. Each worker decodes a file with the browser's own `createImageBitmap`, resizes and encodes it with WebAssembly builds of libwebp, libavif/libaom, MozJPEG and Oxipng from [jSquash](https://github.com/jamsinclair/jSquash), and sends the bytes back. The image you are looking at goes first in the queue; work made useless by a new setting is dropped.

The codecs are served from the site itself (no third-party CDN) and loaded the first time a format is used. AVIF is the slowest: a 12-megapixel photo takes several seconds.

### Reading a web page

This needs a server, because most sites don't let another site read their pictures. Two Cloudflare Pages Functions handle it:

- `functions/api/scan.ts` (`POST /api/scan`) reads the page's HTML once (15-second limit, first 3 MB) and lists up to 80 pictures: `img` (`src`, `srcset`, common lazy-loading attributes), `picture` sources, `og:image`, preloaded images, inline `background-image` and video posters. SVG and icons are skipped.
- `functions/api/image.ts` (`GET /api/image?url=`) fetches one picture (20-second limit, 20 MB) and passes it on with headers that keep the browser from running anything in it. Only JPEG, PNG, WebP, AVIF, GIF and BMP come back.

Both refuse private and local addresses (`localhost`, `10.x`, `192.168.x`, `169.254.x`, IPv6 local ranges and so on), addresses with a user name or password, and non-standard ports. Both answer only their own page. Nothing is stored. Pictures that a page adds later with JavaScript can't be seen this way.

The compression itself still happens in the browser.

## Run it

Needs Node.js 22 or later.

**Windows, no commands:** double-click `START.bat`. It installs what's needed, starts the app and opens the browser at `http://localhost:3000`.

**Terminal:**

```text
npm install
npm run dev          # the app at http://localhost:3000 (without the web-page mode)
npm run pages:dev    # the built app with its Pages Functions at http://localhost:8788
```

**Checks:**

```text
npm run test:unit
npm run typecheck
npm run build
```

## Deploy on Cloudflare Pages

Connect the repository to a Cloudflare Pages project with these settings:

| Setting | Value |
|---|---|
| Framework preset | `Next.js (Static HTML Export)` |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `out` |
| Environment variable | `NODE_VERSION` = `22` |

Cloudflare picks up the `functions/` folder on its own and deploys it with the site. `public/_headers` sets a strict Content Security Policy (scripts, workers and WebAssembly from the site only) and long caching for the hashed files. The largest file is the AVIF encoder, about 3.5 MB, well under the 25 MiB Pages limit.

To put a ceiling on the web-page mode, add a rate-limiting rule for `/api/*` in the Cloudflare dashboard (Security, WAF, Rate limiting rules).

## Your own copy

Names and links shown on the page are in `lib/site.ts`. Change them, and the favicon in `public/icon.svg`.

## Files

- `components/studio.tsx`: the page: adding files, the queue, the summary, downloads, the web-page mode
- `components/compare.tsx`: the before and after view
- `components/segmented.tsx`, `counter.tsx`, `frame-mark.tsx`: small animated pieces
- `lib/codec.worker.ts`: decoding, resizing and encoding, in a worker
- `lib/pool.ts`: the workers, the queue, priorities and cancelling
- `lib/formats.ts`, `lib/plan.ts`: file signatures, names, sizes and settings (pure, tested)
- `lib/server/urls.ts`: address checks and HTML attribute parsing for the functions (pure, tested)
- `functions/api/`: the two Pages Functions
- `scripts/notices.mjs`: writes the third-party notices before each build

## License

The app's own code is under the MIT License, in [`LICENSE`](./LICENSE). The codecs and libraries it ships keep their own licenses, all permissive (BSD, MIT, Apache 2.0, ISC, IJG, zlib, and the Alliance for Open Media Patent License for libaom). Their full texts are in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md), served with the site as `/third-party-notices.txt`, and summed up on the `/licenses` page.
