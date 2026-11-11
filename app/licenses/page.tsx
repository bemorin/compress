import type { Metadata } from "next";
import { SITE } from "../../lib/site.ts";

export const metadata: Metadata = { title: `Licenses · ${SITE.title}` };

const PARTS = [
  { name: "libwebp", use: "WebP encoder", license: "BSD 3-Clause", home: "https://chromium.googlesource.com/webm/libwebp" },
  { name: "libavif with libaom", use: "AVIF encoder", license: "BSD 2-Clause (libavif, libaom), Alliance for Open Media Patent License 1.0 (libaom)", home: "https://github.com/AOMediaCodec/libavif" },
  { name: "MozJPEG (libjpeg-turbo)", use: "JPEG encoder", license: "IJG License, BSD 3-Clause, zlib", home: "https://github.com/mozilla/mozjpeg" },
  { name: "Oxipng", use: "PNG optimiser", license: "MIT", home: "https://github.com/shssoichiro/oxipng" },
  { name: "resize (PistonDevelopers)", use: "Lanczos resizing", license: "MIT", home: "https://github.com/PistonDevelopers/resize" },
  { name: "jSquash", use: "WebAssembly builds of the codecs above", license: "Apache 2.0", home: "https://github.com/jamsinclair/jSquash" },
  { name: "Squoosh", use: "Codec build code that jSquash derives from", license: "Apache 2.0", home: "https://github.com/GoogleChromeLabs/squoosh" },
  { name: "wasm-feature-detect", use: "Checks for WebAssembly features", license: "Apache 2.0", home: "https://github.com/GoogleChromeLabs/wasm-feature-detect" },
  { name: "JSZip", use: "ZIP downloads", license: "MIT (dual MIT or GPL 3.0, used under MIT)", home: "https://github.com/Stuk/jszip" },
  { name: "Next.js, React", use: "The page itself", license: "MIT", home: "https://github.com/vercel/next.js" },
  { name: "Motion (framer-motion)", use: "Animation", license: "MIT", home: "https://github.com/motiondivision/motion" },
  { name: "Lucide", use: "Icons", license: "ISC", home: "https://github.com/lucide-icons/lucide" },
];

export default function Licenses() {
  return (
    <main className="app-shell">
      <div className="workspace licenses">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-name">{SITE.homeLabel}<span className="brand-period">.</span></span>
            <span className="brand-divider" />
            <span className="brand-description">{SITE.short}</span>
          </a>
        </header>
        <article className="licenses-body">
          <h1>Licenses</h1>
          <p>
            This app&rsquo;s own code is under the MIT License (see <a href={`${SITE.source}/blob/main/LICENSE`}>LICENSE</a>). It runs on the open-source
            parts below, each under its own license. The full texts are in <a href="/third-party-notices.txt">third-party-notices.txt</a> (also in the repository) and
            in each package.
          </p>
          <table>
            <thead>
              <tr><th>Part</th><th>What it does here</th><th>License</th></tr>
            </thead>
            <tbody>
              {PARTS.map((part) => (
                <tr key={part.name}>
                  <td><a href={part.home}>{part.name}</a></td>
                  <td>{part.use}</td>
                  <td>{part.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><a href="/">Back to {SITE.short}</a></p>
        </article>
      </div>
    </main>
  );
}
