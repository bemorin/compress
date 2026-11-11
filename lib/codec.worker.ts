/// <reference lib="webworker" />
// Decodes, resizes and encodes one image at a time, off the main thread, so the page stays smooth.
// Every codec is WebAssembly loaded from this site (libwebp, libavif, MozJPEG, Oxipng, Squoosh's
// resizer), the first time it is needed.
import type { TargetFormat } from "./formats.ts";
import { fitInside, MAX_PIXELS } from "./plan.ts";

export interface EncodeJob {
  kind: "encode";
  job: number;
  /** The file itself, or already-decoded pixels when this browser can't decode in a worker. */
  file?: Blob;
  pixels?: ImageData;
  target: TargetFormat;
  quality: number;
  /** Longest side in pixels, 0 to keep the size. */
  maxSide: number;
}

export type WorkerReply =
  | { kind: "ready"; decodeHere: boolean }
  | {
      kind: "done";
      job: number;
      bytes: ArrayBuffer;
      sourceWidth: number;
      sourceHeight: number;
      width: number;
      height: number;
      alphaFlattened: boolean;
      ms: number;
    }
  | { kind: "failed"; job: number; message: string };

declare const self: DedicatedWorkerGlobalScope;

const decodeHere = typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function";

async function decode(file: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser can't read pixels in the background.");
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

function hasTransparency(pixels: ImageData) {
  const data = pixels.data;
  for (let index = 3; index < data.length; index += 4) if (data[index] < 255) return true;
  return false;
}

/** JPEG has no transparency: put transparent pixels on white, as most viewers would show them. */
function flattenOnWhite(pixels: ImageData) {
  const data = pixels.data;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha === 1) continue;
    data[index] = Math.round(data[index] * alpha + 255 * (1 - alpha));
    data[index + 1] = Math.round(data[index + 1] * alpha + 255 * (1 - alpha));
    data[index + 2] = Math.round(data[index + 2] * alpha + 255 * (1 - alpha));
    data[index + 3] = 255;
  }
  return pixels;
}

async function resizeTo(pixels: ImageData, width: number, height: number) {
  if (pixels.width === width && pixels.height === height) return pixels;
  const { default: resize } = await import("@jsquash/resize");
  return resize(pixels, { width, height, method: "lanczos3", premultiply: true, linearRGB: true, fitMethod: "stretch" });
}

async function encode(pixels: ImageData, target: TargetFormat, quality: number): Promise<ArrayBuffer> {
  if (target === "webp") {
    const { encode: webp } = await import("@jsquash/webp");
    return webp(pixels, { quality, method: 4 });
  }
  if (target === "avif") {
    const { encode: avif } = await import("@jsquash/avif");
    // AVIF is slow in a single thread: above 4 megapixels, trade a little size for speed.
    return avif(pixels, { quality, speed: pixels.width * pixels.height > 4_000_000 ? 8 : 6 });
  }
  if (target === "jpeg") {
    const { encode: jpeg } = await import("@jsquash/jpeg");
    return jpeg(pixels, { quality, progressive: true, optimize_coding: true });
  }
  const { optimise } = await import("@jsquash/oxipng");
  return optimise(pixels, { level: 2, interlace: false, optimiseAlpha: true });
}

self.onmessage = async (event: MessageEvent<EncodeJob>) => {
  const message = event.data;
  const started = performance.now();
  try {
    let pixels = message.pixels ?? null;
    if (!pixels) {
      if (!message.file || !decodeHere) throw new Error("Nothing to read.");
      pixels = await decode(message.file);
    }
    if (pixels.width * pixels.height > MAX_PIXELS) throw new Error("This image is too large to handle in a browser tab.");
    const sourceWidth = pixels.width;
    const sourceHeight = pixels.height;
    const size = fitInside(sourceWidth, sourceHeight, message.maxSide);
    pixels = await resizeTo(pixels, size.width, size.height);
    let alphaFlattened = false;
    if (message.target === "jpeg" && hasTransparency(pixels)) {
      pixels = flattenOnWhite(pixels);
      alphaFlattened = true;
    }
    const bytes = await encode(pixels, message.target, message.quality);
    const reply: WorkerReply = {
      kind: "done",
      job: message.job,
      bytes,
      sourceWidth,
      sourceHeight,
      width: pixels.width,
      height: pixels.height,
      alphaFlattened,
      ms: Math.round(performance.now() - started),
    };
    self.postMessage(reply, [bytes]);
  } catch (cause) {
    const reply: WorkerReply = { kind: "failed", job: message.job, message: cause instanceof Error ? cause.message : String(cause) };
    self.postMessage(reply);
  }
};

const ready: WorkerReply = { kind: "ready", decodeHere };
self.postMessage(ready);
