// Settings and the decisions made from them. Pure functions, tested in tests/plan.test.ts.
import type { SourceFormat, TargetChoice, TargetFormat } from "./formats.ts";
import { targetFor } from "./formats.ts";

export interface Settings {
  target: TargetChoice;
  /** 40 to 100. Ignored for PNG, which is lossless. */
  quality: number;
  /** Longest side in pixels, or 0 to keep the original size. */
  maxSide: number;
}

export const DEFAULT_SETTINGS: Settings = { target: "webp", quality: 80, maxSide: 0 };

export const SIZES = [0, 3840, 2560, 1920, 1280, 800] as const;

/** Above this many pixels a browser tab can run out of memory while encoding. */
export const MAX_PIXELS = 60_000_000;
/** Files larger than this are refused before they are read. */
export const MAX_FILE_BYTES = 80 * 1024 * 1024;
export const MAX_FILES = 200;

export function clampQuality(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.quality;
  return Math.min(100, Math.max(40, Math.round(value)));
}

/** Fits width × height inside a square of maxSide, never enlarging. */
export function fitInside(width: number, height: number, maxSide: number) {
  if (!maxSide || (width <= maxSide && height <= maxSide)) return { width, height, resized: false };
  const scale = maxSide / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

/** The quality numbers each encoder understands, from the one slider. */
export function encoderQuality(target: TargetFormat, quality: number) {
  const q = clampQuality(quality);
  if (target === "avif") return Math.round(20 + ((q - 40) * 65) / 60); // 40→20, 80→63, 100→85
  return q;
}

/** What the slider means, in a few words. */
export function qualityHint(quality: number) {
  const q = clampQuality(quality);
  if (q < 60) return "Small files, visibly softer";
  if (q < 75) return "Good for thumbnails";
  if (q < 88) return "The usual sweet spot for photos";
  if (q < 96) return "Hard to tell from the original";
  return "Large files, little to gain";
}

/** A cache key: the same file with the same settings is never encoded twice. */
export function resultKey(id: number, source: SourceFormat, settings: Settings) {
  const target = targetFor(source, settings.target);
  const quality = target === "png" ? "lossless" : encoderQuality(target, settings.quality);
  return `${id}:${target}:${quality}:${settings.maxSide}`;
}

/**
 * When re-encoding in the same format gives a bigger file and nothing was resized,
 * the original is the better file: keep it.
 */
export function keepOriginal(source: SourceFormat, target: TargetFormat, before: number, after: number, resized: boolean) {
  return !resized && source === target && after >= before;
}
