import test from "node:test";
import assert from "node:assert/strict";
import { checkAddress, cssUrls, resolveImage, srcsetCandidates } from "../lib/server/urls.ts";

test("public addresses pass, a bare domain gets https", () => {
  const checked = checkAddress("example.com/blog");
  assert.equal(checked.ok, true);
  if (checked.ok) assert.equal(checked.url.toString(), "https://example.com/blog");
  assert.equal(checkAddress("http://example.com").ok, true);
});

test("private, local and odd addresses are refused", () => {
  for (const address of [
    "http://localhost/", "http://127.0.0.1/", "http://10.0.0.8/", "http://172.20.1.1/", "http://192.168.1.1/",
    "http://169.254.169.254/latest", "http://[::1]/", "http://[fd00::1]/", "http://[::ffff:127.0.0.1]/",
    "http://printer.local/", "ftp://example.com/", "https://user:pw@example.com/", "https://example.com:8080/",
    "javascript:alert(1)", "intranet", "",
  ]) {
    assert.equal(checkAddress(address).ok, false, address);
  }
  assert.equal(checkAddress("http://172.32.0.1/").ok, true);
});

test("srcset: largest candidate first, commas inside CDN addresses kept", () => {
  assert.deepEqual(srcsetCandidates("a.jpg 1x, b.jpg 2x"), ["b.jpg", "a.jpg"]);
  assert.deepEqual(srcsetCandidates("small.jpg 480w, big.jpg 1600w, mid.jpg 800w"), ["big.jpg", "mid.jpg", "small.jpg"]);
  assert.deepEqual(
    srcsetCandidates("https://cdn.x/w_400,h_300/a.jpg 400w, https://cdn.x/w_800,h_600/a.jpg 800w"),
    ["https://cdn.x/w_800,h_600/a.jpg", "https://cdn.x/w_400,h_300/a.jpg"],
  );
  assert.deepEqual(srcsetCandidates("only.jpg"), ["only.jpg"]);
  // As in browsers: a comma right after an address ends it, a comma inside one doesn't.
  assert.deepEqual(srcsetCandidates("one.jpg, two.jpg 2x"), ["two.jpg", "one.jpg"]);
  assert.deepEqual(srcsetCandidates("one.jpg,two.jpg 2x"), ["one.jpg,two.jpg"]);
});

test("inline styles and relative addresses resolve; data, SVG and icons are skipped", () => {
  assert.deepEqual(cssUrls("background: url('/hero.jpg') center, url(x.png)"), ["/hero.jpg", "x.png"]);
  assert.equal(resolveImage("/hero.jpg", "https://example.com/blog/post"), "https://example.com/hero.jpg");
  assert.equal(resolveImage("../a.png#x", "https://example.com/blog/post/"), "https://example.com/blog/a.png");
  assert.equal(resolveImage("data:image/png;base64,AAA", "https://example.com/"), null);
  assert.equal(resolveImage("/logo.svg", "https://example.com/"), null);
  assert.equal(resolveImage("/favicon.ico", "https://example.com/"), null);
});
