"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Download, FolderOpen, Globe, ImagePlus, LoaderCircle, LockKeyhole, Shrink, Trash2, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Compare } from "./compare";
import { Counter } from "./counter";
import { FrameMark } from "./frame-mark";
import { Segmented } from "./segmented";
import { filesFromDrop, saveBlob } from "../lib/drop.ts";
import {
  MIME,
  TARGETS,
  formatBytes,
  formatChange,
  nameFromUrl,
  outputName,
  sniff,
  targetFor,
  uniqueNames,
  type SourceFormat,
  type TargetChoice,
  type TargetFormat,
} from "../lib/formats.ts";
import { DEFAULT_SETTINGS, MAX_FILES, MAX_FILE_BYTES, SIZES, clampQuality, encoderQuality, keepOriginal, qualityHint, resultKey, type Settings } from "../lib/plan.ts";
import { CancelledError, EncoderPool } from "../lib/pool.ts";
import { SITE } from "../lib/site.ts";

type Mode = "files" | "page";

interface Item {
  id: number;
  file: File;
  source: SourceFormat;
  origin: Mode;
  address?: string;
  preview: string;
  signature: string;
}

interface Result {
  key: string;
  target: TargetFormat;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  kept: boolean;
  alphaFlattened: boolean;
}

interface Row {
  item: Item;
  key: string;
  target: TargetFormat;
  result: Result | null;
  error: string | null;
  busy: boolean;
}

type Scan =
  | { state: "idle" }
  | { state: "reading"; address: string }
  | { state: "fetching"; page: string; total: number; done: number; failed: number }
  | { state: "done"; page: string; total: number; failed: number; truncated: boolean };

const SOURCE_LABEL: Record<SourceFormat, string> = { jpeg: "JPEG", png: "PNG", webp: "WebP", avif: "AVIF", gif: "GIF", bmp: "BMP", heic: "HEIC" };
const TARGET_LABEL: Record<TargetFormat, string> = { webp: "WebP", avif: "AVIF", jpeg: "JPEG", png: "PNG" };
const sizeLabel = (size: number) => (size === 0 ? "Full" : size === 3840 ? "4K" : String(size));
const ease = [0.22, 1, 0.36, 1] as const;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function friendlyError(error: unknown, item: Item) {
  const text = error instanceof Error ? error.message : String(error);
  if (/too large/i.test(text)) return text;
  if (item.source === "heic") return "This browser can't open HEIC photos. Safari can, or save them as JPEG first.";
  if (/decod|source image|InvalidState|EncodingError/i.test(text)) return "This image couldn't be read. It may be damaged, or in a form this browser can't open.";
  if (/memory|allocation|Aborted/i.test(text)) return "The browser ran out of memory on this one. Try a smaller longest side.";
  return "This image couldn't be compressed.";
}

function pageHost(page: string) {
  try {
    return new URL(page).hostname.replace(/^www\./, "");
  } catch {
    return "page";
  }
}

export function Studio() {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>("files");
  const [items, setItems] = useState<Item[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const [scan, setScan] = useState<Scan>({ state: "idle" });
  const [address, setAddress] = useState("");
  const [mac, setMac] = useState(false);
  const [version, bump] = useReducer((value: number) => value + 1, 0);

  const pool = useRef<EncoderPool | null>(null);
  const cache = useRef(new Map<string, Result>());
  const errors = useRef(new Map<string, string>());
  const inflight = useRef(new Set<string>());
  const known = useRef(new Set<string>());
  const nextId = useRef(1);
  const picker = useRef<HTMLInputElement>(null);
  const folderPicker = useRef<HTMLInputElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);
  const activeRef = useRef<number | null>(null);
  activeRef.current = activeId;

  useEffect(() => {
    pool.current = new EncoderPool();
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    folderPicker.current?.setAttribute("webkitdirectory", "");
    return () => {
      pool.current?.destroy();
      pool.current = null;
    };
  }, []);

  // ---- Adding files -------------------------------------------------------------------------

  const ingest = useCallback(async (files: File[], origin: Mode, addresses: (string | undefined)[] = []) => {
    const added: Item[] = [];
    let unreadable = 0;
    let tooLarge = 0;
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const signature = `${file.name}:${file.size}:${file.lastModified}:${addresses[index] ?? ""}`;
      if (known.current.has(signature)) continue;
      if (file.size > MAX_FILE_BYTES) {
        tooLarge++;
        continue;
      }
      const source = sniff(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
      if (!source) {
        unreadable++;
        continue;
      }
      known.current.add(signature);
      added.push({ id: nextId.current++, file, source, origin, address: addresses[index], preview: URL.createObjectURL(file), signature });
    }
    let overflow = 0;
    setItems((old) => {
      const room = Math.max(0, MAX_FILES - old.length);
      const accepted = added.slice(0, room);
      overflow = added.length - accepted.length;
      for (const item of added.slice(room)) {
        URL.revokeObjectURL(item.preview);
        known.current.delete(item.signature);
      }
      return [...old, ...accepted];
    });
    // A page's pictures arrive in any order: until you pick one, the heaviest (first row) is shown.
    if (added.length > 0 && origin === "files") setActiveId((current) => current ?? added[0].id);
    const problems = [
      unreadable ? `${plural(unreadable, "file")} skipped: not a picture this tool reads (JPEG, PNG, WebP, AVIF, GIF, BMP or HEIC).` : "",
      tooLarge ? `${plural(tooLarge, "file")} over ${MAX_FILE_BYTES / 1024 / 1024} MB skipped.` : "",
      overflow ? `Up to ${MAX_FILES} images at a time: ${overflow} left out.` : "",
    ].filter(Boolean);
    if (problems.length) setNotice(problems.join(" "));
    if (added.length && origin === "files") setAnnouncement(`${plural(added.length, "image")} added.`);
  }, []);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = async (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      setNotice(null);
      void ingest(await filesFromDrop(event.dataTransfer), "files");
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [ingest]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        picker.current?.click();
      }
      if (event.key === "Escape") setDragging(false);
    };
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      const stamp = Date.now();
      // Pasted screenshots are all called image.png: give each its own name.
      const named = files.map((file, index) =>
        /^image\.(png|jpe?g|webp)$/i.test(file.name) ? new File([file], `pasted-${stamp}-${index + 1}.${file.name.split(".").pop()}`, { type: file.type, lastModified: stamp }) : file,
      );
      void ingest(named, "files");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [ingest]);

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    setNotice(null);
    void ingest(Array.from(event.target.files ?? []), "files");
    event.target.value = "";
  };

  // ---- Compressing --------------------------------------------------------------------------

  const trimCache = (id: number, keep: string) => {
    const keys = [...cache.current.keys()].filter((key) => key.startsWith(`${id}:`) && key !== keep);
    for (const key of keys.slice(0, Math.max(0, keys.length - 3))) {
      URL.revokeObjectURL(cache.current.get(key)!.url);
      cache.current.delete(key);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = pool.current;
      if (!current) return;
      const wanted = new Map<string, Item>();
      for (const item of items) wanted.set(resultKey(item.id, item.source, settings), item);
      current.cancel((tag) => !wanted.has(tag));
      for (const tag of [...inflight.current]) if (!wanted.has(tag)) inflight.current.delete(tag);
      for (const [key, item] of wanted) {
        if (cache.current.has(key) || errors.current.has(key) || inflight.current.has(key)) continue;
        const target = targetFor(item.source, settings.target);
        inflight.current.add(key);
        current
          .run({
            tag: key,
            file: item.file,
            target,
            quality: encoderQuality(target, settings.quality),
            maxSide: settings.maxSide,
            priority: item.id === activeRef.current ? 1000 : -item.id,
          })
          .then((reply) => {
            const blob = new Blob([reply.bytes], { type: MIME[target] });
            const resized = reply.width !== reply.sourceWidth || reply.height !== reply.sourceHeight;
            cache.current.set(key, {
              key,
              target,
              blob,
              url: URL.createObjectURL(blob),
              width: reply.width,
              height: reply.height,
              sourceWidth: reply.sourceWidth,
              sourceHeight: reply.sourceHeight,
              kept: keepOriginal(item.source, target, item.file.size, blob.size, resized),
              alphaFlattened: reply.alphaFlattened,
            });
            trimCache(item.id, key);
          })
          .catch((error) => {
            if (!(error instanceof CancelledError)) errors.current.set(key, friendlyError(error, item));
          })
          .finally(() => {
            inflight.current.delete(key);
            bump();
          });
      }
      bump();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [items, settings]);

  useEffect(() => {
    if (activeId !== null) pool.current?.prioritise((tag) => tag.startsWith(`${activeId}:`));
  }, [activeId]);

  const rows: Row[] = useMemo(
    () =>
      // A page's pictures are listed heaviest first: that's where the savings are.
      [...items].sort((a, b) => (a.origin === "page" && b.origin === "page" ? b.file.size - a.file.size : 0)).map((item) => {
        const key = resultKey(item.id, item.source, settings);
        return {
          item,
          key,
          target: targetFor(item.source, settings.target),
          result: cache.current.get(key) ?? null,
          error: errors.current.get(key) ?? null,
          busy: inflight.current.has(key),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, settings, version],
  );

  const ready = rows.filter((row) => row.result);
  const failed = rows.filter((row) => row.error);
  const pending = rows.length - ready.length - failed.length;
  const before = ready.reduce((sum, row) => sum + row.item.file.size, 0);
  const after = ready.reduce((sum, row) => sum + (row.result!.kept ? row.item.file.size : row.result!.blob.size), 0);
  const saved = before ? (1 - after / before) * 100 : 0;
  const active = rows.find((row) => row.item.id === activeId) ?? rows[0] ?? null;
  // While a new setting is being applied, keep showing the last result instead of a blank.
  const shown = (() => {
    if (!active) return null;
    if (active.result) return { result: active.result, stale: false };
    const earlier = [...cache.current.values()].filter((result) => result.key.startsWith(`${active.item.id}:`)).pop();
    return earlier ? { result: earlier, stale: true } : null;
  })();
  const fromPage = items.some((item) => item.origin === "page");

  const wasPending = useRef(0);
  useEffect(() => {
    if (wasPending.current > 0 && pending === 0 && ready.length > 0) {
      setAnnouncement(`${plural(ready.length, "image")} ready: ${formatBytes(before)} down to ${formatBytes(after)}.`);
    }
    wasPending.current = pending;
  }, [pending, ready.length, before, after]);

  // ---- Removing -----------------------------------------------------------------------------

  const forget = (item: Item) => {
    URL.revokeObjectURL(item.preview);
    known.current.delete(item.signature);
    for (const [key, result] of [...cache.current]) {
      if (!key.startsWith(`${item.id}:`)) continue;
      URL.revokeObjectURL(result.url);
      cache.current.delete(key);
    }
    for (const key of [...errors.current.keys()]) if (key.startsWith(`${item.id}:`)) errors.current.delete(key);
    pool.current?.cancel((tag) => tag.startsWith(`${item.id}:`));
  };

  const remove = (id: number) => {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    forget(items[index]);
    const rest = items.filter((item) => item.id !== id);
    setItems(rest);
    if (activeId === id) setActiveId(rest[Math.min(index, rest.length - 1)]?.id ?? null);
    setAnnouncement(`${items[index].file.name} removed.`);
  };

  const clearAll = () => {
    for (const item of items) forget(item);
    setItems([]);
    setActiveId(null);
    setScan({ state: "idle" });
    setNotice(null);
    setAnnouncement("All images removed.");
  };

  // ---- Downloading --------------------------------------------------------------------------

  const fileFor = (row: Row) => {
    const result = row.result!;
    return result.kept
      ? { blob: row.item.file as Blob, name: row.item.file.name }
      : { blob: result.blob, name: outputName(row.item.file.name, result.target) };
  };

  const downloadOne = (row: Row) => {
    if (!row.result) return;
    const { blob, name } = fileFor(row);
    saveBlob(blob, name);
    setAnnouncement(`${name} downloading.`);
  };

  const downloadAll = async () => {
    if (zipProgress !== null || ready.length === 0) return;
    if (ready.length === 1) return downloadOne(ready[0]);
    setZipProgress(0);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const files = ready.map(fileFor);
      const names = uniqueNames(files.map((file) => file.name));
      files.forEach((file, index) => zip.file(names[index], file.blob));
      // Pictures are already compressed: storing them as they are is faster and no bigger.
      const archive = await zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) => setZipProgress(meta.percent / 100));
      const page = scan.state === "done" || scan.state === "fetching" ? scan.page : null;
      saveBlob(archive, fromPage && page ? `${pageHost(page)}-images.zip` : "compressed-images.zip");
      setAnnouncement("ZIP ready and downloading.");
    } catch {
      setNotice("The ZIP couldn't be made. Download the images one at a time instead.");
    } finally {
      setZipProgress(null);
    }
  };

  // ---- Reading a web page -------------------------------------------------------------------

  const busyScanning = scan.state === "reading" || scan.state === "fetching";

  const runScan = async (event: FormEvent) => {
    event.preventDefault();
    const value = address.trim();
    if (!value || busyScanning) return;
    setNotice(null);
    setScan({ state: "reading", address: value });
    let data: { page: string; images: { url: string }[]; truncated: boolean };
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value }) });
      if (response.status === 404 || response.status === 405) throw new Error("Reading pages needs this app's small server part, which isn't running here. Locally, use npm run pages:dev.");
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "The page couldn't be read.");
      data = body;
    } catch (error) {
      setScan({ state: "idle" });
      setNotice(error instanceof Error ? error.message : "The page couldn't be read.");
      return;
    }
    if (data.images.length === 0) {
      setScan({ state: "done", page: data.page, total: 0, failed: 0, truncated: false });
      setNotice("No pictures in that page's HTML. Pictures that scripts add later can't be seen this way.");
      return;
    }
    let done = 0;
    let lost = 0;
    setScan({ state: "fetching", page: data.page, total: data.images.length, done, failed: lost });
    const queue = data.images.map((image, index) => ({ ...image, index }));
    const fetchNext = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        try {
          const response = await fetch(`/api/image?url=${encodeURIComponent(next.url)}`);
          if (!response.ok) throw new Error(String(response.status));
          const blob = await response.blob();
          await ingest([new File([blob], nameFromUrl(next.url, next.index), { type: blob.type, lastModified: 0 })], "page", [next.url]);
        } catch {
          lost++;
        }
        done++;
        setScan((state) => (state.state === "fetching" ? { ...state, done, failed: lost } : state));
      }
    };
    await Promise.all([fetchNext(), fetchNext(), fetchNext(), fetchNext()]);
    setScan({ state: "done", page: data.page, total: data.images.length, failed: lost, truncated: data.truncated });
    setAnnouncement(`${plural(data.images.length - lost, "picture")} fetched from ${pageHost(data.page)}.`);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setNotice(null);
    if (next === "page") window.setTimeout(() => addressInput.current?.focus(), 260);
  };

  // ---- Pieces -------------------------------------------------------------------------------

  const status = pending > 0
    ? `Working · ${ready.length + failed.length}/${rows.length}`
    : mode === "files"
      ? "Nothing leaves this device"
      : "Pages are read through this site";

  const target = settings.target;
  const qualityOff = target === "png" || (target === "same" && items.length > 0 && items.every((item) => item.source === "png"));
  const biggest = items.length ? Math.max(...ready.map((row) => Math.max(row.result!.sourceWidth, row.result!.sourceHeight)), 0) : 0;

  const scanLine = (() => {
    if (scan.state === "reading") return `Reading ${scan.address}…`;
    if (scan.state === "fetching") return `Fetching pictures · ${scan.done}/${scan.total}`;
    if (scan.state === "done" && scan.total > 0)
      return `${plural(scan.total - scan.failed, "picture")} from ${pageHost(scan.page)}${scan.failed ? ` · ${scan.failed} couldn't be fetched` : ""}${scan.truncated ? " · first 80 only" : ""}`;
    return null;
  })();

  const addressForm = (compact: boolean) => (
    <form className={`address-form ${compact ? "is-compact" : ""}`} onSubmit={runScan} role="search">
      <Globe size={15} strokeWidth={1.8} aria-hidden="true" />
      <label className="visually-hidden" htmlFor={compact ? "address-compact" : "address"}>Page address</label>
      <input
        id={compact ? "address-compact" : "address"}
        ref={compact ? undefined : addressInput}
        type="text"
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        placeholder="example.com/blog"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        disabled={busyScanning}
      />
      <button type="submit" disabled={busyScanning || !address.trim()}>
        {busyScanning ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <ArrowRight size={14} aria-hidden="true" />}
        <span>{busyScanning ? "Reading" : "Check"}</span>
      </button>
    </form>
  );

  const appear = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 14, filter: "blur(4px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, exit: { opacity: 0, y: -10, filter: "blur(4px)" } };

  return (
    <main className="app-shell">
      <div className="workspace">
        <header className="topbar">
          <a className="brand" href={SITE.home} target="_blank" rel="noopener noreferrer" aria-label={`${SITE.homeLabel} website`}>
            <span className="brand-icon" aria-hidden="true"><Shrink size={16} strokeWidth={1.8} /></span>
            <span className="brand-name">{SITE.homeLabel}<span className="brand-period">.</span></span>
            <span className="brand-divider" />
            <span className="brand-description">{SITE.short}</span>
          </a>
          <Segmented
            name="Where the pictures come from"
            options={[{ value: "files", label: "Files" }, { value: "page", label: "A web page" }]}
            value={mode}
            onChange={(value) => switchMode(value as Mode)}
          />
          <div className="topbar-right" aria-live="polite">
            <span className={`topbar-led ${pending > 0 ? "is-working" : ""}`} />
            <span>{status}</span>
          </div>
        </header>

        <section className={`drop-frame ${dragging ? "dragging" : ""} ${items.length ? "has-files" : ""}`} aria-label="Images">
          <AnimatePresence>
            {dragging && (
              <motion.div
                className="drag-halo"
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease }}
              />
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait" initial={false}>
            {items.length === 0 ? (
              <motion.div key={`empty-${mode}`} className="empty-state" {...appear} transition={{ duration: 0.38, ease }}>
                <FrameMark active={dragging} />
                {mode === "files" ? (
                  <>
                    <div className="empty-copy">
                      <h1>Make images lighter.</h1>
                      <p>JPEG, PNG, WebP, AVIF, GIF or HEIC. It all happens in this tab, and nothing is uploaded.</p>
                    </div>
                    <div className="empty-actions">
                      <button type="button" className="browse-button" onClick={() => picker.current?.click()}>
                        <ImagePlus size={15} strokeWidth={1.8} aria-hidden="true" />
                        Choose images
                        <span className="button-shortcut" aria-hidden="true">{mac ? "⌘" : "Ctrl"} O</span>
                      </button>
                      <button type="button" className="quiet-button" onClick={() => folderPicker.current?.click()}>
                        <FolderOpen size={15} strokeWidth={1.8} aria-hidden="true" />
                        A whole folder
                      </button>
                    </div>
                    <p className="paste-copy">
                      <span className="paste-or">or</span> drop them anywhere, or paste with <kbd>{mac ? "⌘" : "Ctrl"}</kbd>
                      <kbd>V</kbd>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="empty-copy">
                      <h1>How heavy are a page&rsquo;s pictures?</h1>
                      <p>Enter an address. This site reads the page and fetches its pictures, then your browser compresses them. Nothing is kept.</p>
                    </div>
                    {addressForm(false)}
                    <AnimatePresence>
                      {scanLine && (
                        <motion.p className="scan-line" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                          {scanLine}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div key="desk" className="desk" {...appear} transition={{ duration: 0.42, ease }}>
                <div className="desk-main">
                  {active && (
                    <>
                      <div className="viewer-head">
                        <div className="viewer-title">
                          <p className="file-kicker">
                            {SOURCE_LABEL[active.item.source]}
                            {active.result ? ` · ${active.result.sourceWidth}×${active.result.sourceHeight}` : ""}
                            {active.item.address ? ` · ${pageHost(active.item.address)}` : ""}
                          </p>
                          <h1 title={active.item.file.name}>{active.item.file.name}</h1>
                        </div>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={!active.result}
                          onClick={() => downloadOne(active)}
                        >
                          <Download size={14} strokeWidth={1.9} aria-hidden="true" />
                          <span>{active.result ? (active.result.kept ? "Original" : TARGET_LABEL[active.result.target]) : "…"}</span>
                        </button>
                      </div>

                      <Compare
                        key={active.item.id}
                        before={active.item.preview}
                        after={shown ? (shown.result.kept ? active.item.preview : shown.result.url) : null}
                        stale={Boolean(shown?.stale)}
                        ratio={shown ? shown.result.sourceWidth / shown.result.sourceHeight : null}
                        busy={!active.result && !active.error}
                        beforeLabel={`Original · ${formatBytes(active.item.file.size)}`}
                        afterLabel={
                          active.error
                            ? "Couldn't compress"
                            : active.result
                              ? active.result.kept
                                ? `Original kept · ${formatBytes(active.item.file.size)}`
                                : `${TARGET_LABEL[active.result.target]} · ${formatBytes(active.result.blob.size)}`
                              : "Working"
                        }
                      />

                      <AnimatePresence initial={false}>
                        {(active.error || active.result?.kept || active.result?.alphaFlattened || active.item.source === "gif") && (
                          <motion.p className={`viewer-note ${active.error ? "is-error" : ""}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                            {active.error ??
                              (active.result?.kept
                                ? "Compressing this one again made it bigger, so the original is kept as it is."
                                : active.result?.alphaFlattened
                                  ? "JPEG has no transparency: transparent parts are now white. Choose WebP or PNG to keep them."
                                  : "Only the first frame of an animated GIF is kept.")}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </>
                  )}

                  <div className="settings">
                    <div className="setting">
                      <div className="setting-label">
                        <span>Format</span>
                      </div>
                      <Segmented
                        name="Format"
                        options={TARGETS.map((option) => ({ value: option.id, label: option.label }))}
                        value={target}
                        onChange={(value) => setSettings((old) => ({ ...old, target: value as TargetChoice }))}
                      />
                      <p className="setting-hint">{TARGETS.find((option) => option.id === target)?.note}</p>
                    </div>
                    <div className="setting">
                      <div className="setting-label">
                        <label htmlFor="quality">Quality</label>
                      </div>
                      <div className={`quality-row ${qualityOff ? "is-disabled" : ""}`}>
                        <input
                          id="quality"
                          type="range"
                          min={40}
                          max={100}
                          step={1}
                          value={settings.quality}
                          disabled={qualityOff}
                          style={{ ["--fill" as string]: `${((settings.quality - 40) / 60) * 100}%` }}
                          onChange={(event) => setSettings((old) => ({ ...old, quality: clampQuality(Number(event.target.value)) }))}
                        />
                        <output htmlFor="quality">{qualityOff ? "—" : settings.quality}</output>
                      </div>
                      <p className="setting-hint">{qualityOff ? "PNG stays lossless: every pixel is kept" : qualityHint(settings.quality)}</p>
                    </div>
                    <div className="setting">
                      <div className="setting-label">
                        <span>Longest side</span>
                      </div>
                      <Segmented
                        name="Longest side"
                        options={SIZES.map((size) => ({ value: size, label: sizeLabel(size), title: size ? `${size} pixels` : "Keep the size" }))}
                        value={settings.maxSide}
                        onChange={(value) => setSettings((old) => ({ ...old, maxSide: Number(value) }))}
                      />
                      <p className="setting-hint">
                        {settings.maxSide === 0
                          ? biggest > 2560
                            ? `Largest is ${biggest} px. 1920 is plenty for most pages`
                            : "Pixels as they are"
                          : `At most ${settings.maxSide} px, never enlarged`}
                      </p>
                    </div>
                  </div>
                </div>

                <aside className="desk-side" aria-label="Your images">
                  <div className="summary">
                    <div className="summary-top">
                      <span className="eyebrow">{saved >= 0 ? "Lighter by" : "Heavier by"}</span>
                      <span className="eyebrow">{pending > 0 ? `${ready.length}/${rows.length} ready` : failed.length ? `${failed.length} failed` : "All ready"}</span>
                    </div>
                    <div className="summary-figure">
                      <Counter value={Math.abs(saved)} format={(value) => `${Math.round(value)}%`} />
                    </div>
                    <div className="summary-bars">
                      <span className="summary-key">Before</span>
                      <span className="summary-track" aria-hidden="true"><span className="summary-fill is-before" /></span>
                      <span className="summary-value"><Counter value={before} format={formatBytes} /></span>
                      <span className="summary-key">After</span>
                      <span className="summary-track" aria-hidden="true">
                        <motion.span
                          className="summary-fill"
                          initial={reduceMotion ? false : { width: "100%" }}
                          animate={{ width: `${before ? Math.max(1.5, Math.min(100, (after / before) * 100)) : 100}%` }}
                          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 20 }}
                        />
                      </span>
                      <strong className="summary-value"><Counter value={after} format={formatBytes} /></strong>
                    </div>
                    {fromPage && <p className="summary-note">Sizes of the files as the page serves them. A page can show them smaller.</p>}
                  </div>

                  <div className="list-head">
                    <span className="eyebrow">{plural(rows.length, "image")}</span>
                    {mode === "files" ? (
                      <span className="list-actions">
                        <button type="button" className="tiny-button" onClick={() => picker.current?.click()}>
                          <ImagePlus size={13} aria-hidden="true" /> Add
                        </button>
                        <button type="button" className="tiny-button" onClick={() => folderPicker.current?.click()}>
                          <FolderOpen size={13} aria-hidden="true" /> Folder
                        </button>
                      </span>
                    ) : null}
                  </div>
                  {mode === "page" && (
                    <div className="side-scan">
                      {addressForm(true)}
                      {scanLine && <p className="scan-line">{scanLine}</p>}
                    </div>
                  )}

                  <ul className="file-list">
                    <AnimatePresence initial={false}>
                      {rows.map((row, index) => {
                        const isActive = active?.item.id === row.item.id;
                        const size = row.result ? (row.result.kept ? row.item.file.size : row.result.blob.size) : 0;
                        return (
                          <motion.li
                            key={row.item.id}
                            layout={reduceMotion ? false : "position"}
                            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14, transition: { duration: 0.18 } }}
                            transition={{ duration: 0.32, ease, delay: Math.min(index, 10) * 0.025 }}
                            className="file-item"
                          >
                            <button type="button" className={`file-row ${isActive ? "is-active" : ""}`} aria-current={isActive || undefined} onClick={() => setActiveId(row.item.id)}>
                              <span className="file-thumb" aria-hidden="true">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={row.item.preview} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
                              </span>
                              <span className="file-text">
                                <span className="file-name">{row.item.file.name}</span>
                                <span className="file-meta">
                                  {SOURCE_LABEL[row.item.source]} {formatBytes(row.item.file.size)}
                                  {row.result && !row.result.kept ? ` → ${TARGET_LABEL[row.result.target]}` : ""}
                                  {row.result && row.result.width !== row.result.sourceWidth ? ` · ${row.result.width}×${row.result.height}` : ""}
                                </span>
                              </span>
                              <span className="file-size">
                                {row.result ? (
                                  <motion.span className="file-result" initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} key={row.key}>
                                    <span className="file-after">{formatBytes(size)}</span>
                                    <span className={`file-change ${row.result.kept ? "is-kept" : size > row.item.file.size ? "is-worse" : "is-better"}`}>
                                      {row.result.kept ? "kept" : formatChange(row.item.file.size, size)}
                                    </span>
                                  </motion.span>
                                ) : row.error ? (
                                  <TriangleAlert size={14} className="file-error-icon" aria-label="Couldn't compress" />
                                ) : (
                                  <LoaderCircle size={14} className="spin file-wait" aria-label="Working" />
                                )}
                              </span>
                              {!row.result && !row.error && <span className="file-progress" aria-hidden="true" />}
                            </button>
                            <button type="button" className="file-remove" aria-label={`Remove ${row.item.file.name}`} onClick={() => remove(row.item.id)}>
                              <X size={13} aria-hidden="true" />
                            </button>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>

                  <div className="side-actions">
                    <button type="button" className="primary-button" disabled={ready.length === 0 || zipProgress !== null} onClick={() => void downloadAll()}>
                      {zipProgress !== null && <motion.span className="primary-progress" initial={{ width: 0 }} animate={{ width: `${zipProgress * 100}%` }} />}
                      <Download size={15} strokeWidth={1.9} aria-hidden="true" />
                      <span>
                        {zipProgress !== null
                          ? "Packing…"
                          : ready.length <= 1
                            ? "Download"
                            : pending > 0
                              ? `Download ${ready.length} ready`
                              : `Download all · ZIP`}
                      </span>
                      {ready.length > 0 && zipProgress === null && <span className="primary-size">{formatBytes(after)}</span>}
                    </button>
                    <button type="button" className="icon-button" onClick={clearAll} aria-label="Remove every image" title="Remove every image">
                      <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                </aside>
              </motion.div>
            )}
          </AnimatePresence>

          {items.length === 0 && mode === "files" && (
            <div className="drag-caption" aria-hidden="true">
              <span className="caption-dot" /> DROP IMAGES OR A FOLDER <span className="caption-dot" />
            </div>
          )}
        </section>

        <AnimatePresence>
          {notice && (
            <motion.div className="notice" role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
                <X size={13} aria-hidden="true" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="bottom-bar">
          <div className="footer-left">
            <LockKeyhole size={12} strokeWidth={1.7} aria-hidden="true" />
            <span>{mode === "files" ? "NO UPLOADS" : "NOTHING KEPT"}</span>
            <span className="footer-dot">&middot;</span>
            <span>OPEN SOURCE</span>
          </div>
          <div className="footer-right">
            <a className="footer-licenses" href={SITE.source} target="_blank" rel="noopener noreferrer">Source</a>
            <a className="footer-licenses" href="/licenses/">Licenses</a>
            <span className="footer-mark">B<span>.</span></span>
          </div>
        </footer>
      </div>

      <input ref={picker} type="file" accept="image/*,.heic,.heif,.avif" multiple hidden onChange={choose} />
      <input ref={folderPicker} type="file" multiple hidden onChange={choose} />
      <div className="visually-hidden" aria-live="polite">{announcement}</div>
    </main>
  );
}
