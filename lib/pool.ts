// A few background workers share the queue. The file you are looking at goes first, and work
// made useless by a new setting is dropped (a busy worker is stopped and replaced).
import type { TargetFormat } from "./formats.ts";
import type { EncodeJob, WorkerReply } from "./codec.worker.ts";

export interface PoolTask {
  /** Anything that identifies the work, used to cancel it. */
  tag: string;
  file: Blob;
  target: TargetFormat;
  quality: number;
  maxSide: number;
  priority: number;
}

export type PoolResult = Extract<WorkerReply, { kind: "done" }>;

interface Pending extends PoolTask {
  job: number;
  resolve: (result: PoolResult) => void;
  reject: (error: Error) => void;
}

interface Slot {
  worker: Worker;
  busy: Pending | null;
  decodeHere: Promise<boolean>;
}

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
  }
}

async function decodeOnMainThread(file: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser can't read the pixels of this image.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export class EncoderPool {
  private slots: Slot[] = [];
  private queue: Pending[] = [];
  private nextJob = 1;

  constructor(private size = Math.min(4, Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1))) {}

  private spawn(): Slot {
    const worker = new Worker(new URL("./codec.worker.ts", import.meta.url), { type: "module" });
    let markReady: (value: boolean) => void = () => {};
    const slot: Slot = { worker, busy: null, decodeHere: new Promise((resolve) => { markReady = resolve; }) };
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.kind === "ready") { markReady(reply.decodeHere); return; }
      const task = slot.busy;
      slot.busy = null;
      if (task && task.job === reply.job) {
        if (reply.kind === "done") task.resolve(reply);
        else task.reject(new Error(reply.message));
      }
      this.pump();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      const task = slot.busy;
      this.replace(slot);
      task?.reject(new Error(event.message || "The image encoder stopped."));
      this.pump();
    };
    return slot;
  }

  private replace(slot: Slot) {
    slot.worker.terminate();
    const index = this.slots.indexOf(slot);
    if (index >= 0) this.slots[index] = this.spawn();
  }

  private ensureSlots() {
    while (this.slots.length < this.size) this.slots.push(this.spawn());
  }

  run(task: PoolTask): Promise<PoolResult> {
    this.ensureSlots();
    return new Promise((resolve, reject) => {
      this.queue.push({ ...task, job: this.nextJob++, resolve, reject });
      this.pump();
    });
  }

  /** Moves matching queued work to the front. */
  prioritise(match: (tag: string) => boolean) {
    for (const task of this.queue) if (match(task.tag)) task.priority = Math.max(task.priority, 1000);
    this.pump();
  }

  /** Drops queued and running work whose tag matches. */
  cancel(match: (tag: string) => boolean) {
    this.queue = this.queue.filter((task) => {
      if (!match(task.tag)) return true;
      task.reject(new CancelledError());
      return false;
    });
    for (const slot of [...this.slots]) {
      if (slot.busy && match(slot.busy.tag)) {
        const task = slot.busy;
        slot.busy = null;
        this.replace(slot);
        task.reject(new CancelledError());
      }
    }
    this.pump();
  }

  private pump() {
    for (const slot of this.slots) {
      if (slot.busy || this.queue.length === 0) continue;
      this.queue.sort((a, b) => b.priority - a.priority || a.job - b.job);
      const task = this.queue.shift()!;
      slot.busy = task;
      void this.send(slot, task);
    }
  }

  private async send(slot: Slot, task: Pending) {
    const base: EncodeJob = { kind: "encode", job: task.job, target: task.target, quality: task.quality, maxSide: task.maxSide };
    try {
      if (await slot.decodeHere) {
        slot.worker.postMessage({ ...base, file: task.file });
      } else {
        const pixels = await decodeOnMainThread(task.file);
        if (slot.busy !== task) return;
        slot.worker.postMessage({ ...base, pixels }, [pixels.data.buffer]);
      }
    } catch (cause) {
      if (slot.busy === task) slot.busy = null;
      task.reject(cause instanceof Error ? cause : new Error(String(cause)));
      this.pump();
    }
  }

  destroy() {
    this.cancel(() => true);
    for (const slot of this.slots) slot.worker.terminate();
    this.slots = [];
  }
}
