import test from "node:test";
import assert from "node:assert/strict";
import { formatBytes, formatChange, nameFromUrl, outputName, sniff, targetFor, uniqueNames } from "../lib/formats.ts";

const bytes = (...values: (number | string)[]) => {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "string") for (const char of value) out.push(char.charCodeAt(0));
    else out.push(value);
  }
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
};

test("files are recognised by their bytes, not their names", () => {
  assert.equal(sniff(bytes(0xff, 0xd8, 0xff, 0xe0)), "jpeg");
  assert.equal(sniff(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a)), "png");
  assert.equal(sniff(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 ")), "webp");
  assert.equal(sniff(bytes("GIF89a")), "gif");
  assert.equal(sniff(bytes(0, 0, 0, 0x1c, "ftypavif")), "avif");
  assert.equal(sniff(bytes(0, 0, 0, 0x18, "ftypheic")), "heic");
  assert.equal(sniff(bytes("<svg xmlns")), null);
  assert.equal(sniff(new Uint8Array(4)), null);
});

test("'Same' keeps the common formats and turns the others into WebP", () => {
  assert.equal(targetFor("jpeg", "same"), "jpeg");
  assert.equal(targetFor("png", "same"), "png");
  assert.equal(targetFor("heic", "same"), "webp");
  assert.equal(targetFor("gif", "same"), "webp");
  assert.equal(targetFor("png", "avif"), "avif");
});

test("names", () => {
  assert.equal(outputName("holiday photo.HEIC", "jpeg"), "holiday photo.jpg");
  assert.equal(outputName("archive.tar.png", "webp"), "archive.tar.webp");
  assert.equal(outputName(".png", "webp"), "image.webp");
  assert.deepEqual(uniqueNames(["a.webp", "A.webp", "b.webp", "a.webp"]), ["a.webp", "A (2).webp", "b.webp", "a (3).webp"]);
  assert.equal(nameFromUrl("https://x.com/a/b/photo%20one.jpg?w=2", 0), "photo one.jpg");
  assert.equal(nameFromUrl("https://x.com/", 4), "image-5");
});

test("sizes and changes read naturally", () => {
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(300), "1 KB");
  assert.equal(formatBytes(512 * 1024), "512 KB");
  assert.equal(formatBytes(3.5 * 1024 * 1024), "3.50 MB");
  assert.equal(formatBytes(23.25 * 1024 * 1024), "23.3 MB");
  assert.equal(formatChange(1000, 270), "−73%");
  assert.equal(formatChange(1000, 1120), "+12%");
  assert.equal(formatChange(1000, 1000), "0%");
});
