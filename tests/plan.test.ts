import test from "node:test";
import assert from "node:assert/strict";
import { clampQuality, encoderQuality, fitInside, keepOriginal, resultKey, DEFAULT_SETTINGS } from "../lib/plan.ts";

test("resizing fits the longest side and never enlarges", () => {
  assert.deepEqual(fitInside(4032, 3024, 1920), { width: 1920, height: 1440, resized: true });
  assert.deepEqual(fitInside(3024, 4032, 1920), { width: 1440, height: 1920, resized: true });
  assert.deepEqual(fitInside(800, 600, 1920), { width: 800, height: 600, resized: false });
  assert.deepEqual(fitInside(4032, 3024, 0), { width: 4032, height: 3024, resized: false });
  assert.deepEqual(fitInside(10000, 3, 800), { width: 800, height: 1, resized: true });
});

test("one slider, each encoder's own scale", () => {
  assert.equal(clampQuality(12), 40);
  assert.equal(clampQuality(140), 100);
  assert.equal(clampQuality(Number.NaN), DEFAULT_SETTINGS.quality);
  assert.equal(encoderQuality("webp", 80), 80);
  assert.equal(encoderQuality("avif", 40), 20);
  assert.equal(encoderQuality("avif", 100), 85);
});

test("a cache key changes with what changes the output, and only that", () => {
  const base = { target: "webp" as const, quality: 80, maxSide: 0 };
  assert.equal(resultKey(1, "jpeg", base), "1:webp:80:0");
  assert.equal(resultKey(1, "png", { ...base, target: "png" }), resultKey(1, "png", { ...base, target: "png", quality: 50 }));
  assert.notEqual(resultKey(1, "jpeg", base), resultKey(1, "jpeg", { ...base, maxSide: 1920 }));
});

test("a bigger file in the same format and size gives way to the original", () => {
  assert.equal(keepOriginal("jpeg", "jpeg", 100, 120, false), true);
  assert.equal(keepOriginal("jpeg", "jpeg", 100, 120, true), false);
  assert.equal(keepOriginal("png", "webp", 100, 120, false), false);
  assert.equal(keepOriginal("jpeg", "jpeg", 100, 80, false), false);
});
