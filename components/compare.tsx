"use client";

import { LoaderCircle, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface CompareProps {
  before: string;
  after: string | null;
  beforeLabel: string;
  afterLabel: string;
  busy: boolean;
  /** The result shown is from earlier settings while the new one is made. */
  stale?: boolean;
  /** Width / height of the original, to reserve the right space before it loads. */
  ratio: number | null;
}

const ZOOM = 3;

/**
 * The original on the left of the line, the result on the right. Drag the line, click anywhere,
 * or use the arrow keys. The magnifier (or a double click) shows pixels at three times their size;
 * while zoomed, click and drag to move around the picture. Both pictures always move together.
 */
export function Compare({ before, after, beforeLabel, afterLabel, busy, stale = false, ratio }: CompareProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50);
  const [zoomed, setZoomed] = useState(false);
  /** Top-left offset of the zoomed picture, in pixels of the frame (always ≤ 0). */
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [gesture, setGesture] = useState<null | { kind: "split" } | { kind: "pan"; startX: number; startY: number; from: { x: number; y: number } }>(null);

  const box = () => frame.current?.getBoundingClientRect() ?? null;

  const clampOffset = useCallback((x: number, y: number) => {
    const rect = box();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(0, Math.max(-(ZOOM - 1) * rect.width, x)),
      y: Math.min(0, Math.max(-(ZOOM - 1) * rect.height, y)),
    };
  }, []);

  const splitAt = useCallback((clientX: number) => {
    const rect = box();
    if (!rect || rect.width === 0) return;
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  /** Zooms in so that the point under (clientX, clientY) stays where it is. */
  const zoomInAt = useCallback(
    (clientX: number, clientY: number) => {
      const rect = box();
      if (!rect) return;
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      setOffset(clampOffset(px - px * ZOOM, py - py * ZOOM));
      setZoomed(true);
    },
    [clampOffset],
  );

  const toggleZoom = () => {
    if (zoomed) {
      setZoomed(false);
      setOffset({ x: 0, y: 0 });
      return;
    }
    const rect = box();
    if (rect) zoomInAt(rect.left + (rect.width * split) / 100, rect.top + rect.height / 2);
  };

  useEffect(() => {
    if (!gesture) return;
    const move = (event: PointerEvent) => {
      if (gesture.kind === "split") splitAt(event.clientX);
      else setOffset(clampOffset(gesture.from.x + event.clientX - gesture.startX, gesture.from.y + event.clientY - gesture.startY));
    };
    const stop = () => setGesture(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [gesture, splitAt, clampOffset]);

  // Keep the zoomed picture inside the frame when the window changes size.
  useEffect(() => {
    if (!zoomed) return;
    const fit = () => setOffset((current) => clampOffset(current.x, current.y));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [zoomed, clampOffset]);

  const onKey = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft") setSplit((value) => Math.max(0, value - step));
    else if (event.key === "ArrowRight") setSplit((value) => Math.min(100, value + step));
    else if (event.key === "Home") setSplit(0);
    else if (event.key === "End") setSplit(100);
    else return;
    event.preventDefault();
  };

  const stage = { transform: zoomed ? `translate(${offset.x}px, ${offset.y}px) scale(${ZOOM})` : "translate(0px, 0px) scale(1)" };
  const panning = gesture?.kind === "pan";

  return (
    <div className="compare">
      <div
        ref={frame}
        className={`compare-frame ${zoomed ? "is-zoomed" : ""} ${gesture ? "is-dragging" : ""} ${panning ? "is-panning" : ""}`}
        style={ratio ? ({ ["--ratio" as string]: String(ratio) } as React.CSSProperties) : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest(".compare-tool, .compare-handle")) return;
          event.preventDefault();
          if (zoomed) {
            setGesture({ kind: "pan", startX: event.clientX, startY: event.clientY, from: offset });
          } else {
            splitAt(event.clientX);
            setGesture({ kind: "split" });
          }
        }}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest(".compare-tool, .compare-handle")) return;
          if (zoomed) toggleZoom();
          else zoomInAt(event.clientX, event.clientY);
        }}
      >
        <div className={`compare-layer ${stale ? "is-stale" : ""}`}>
          <div className="compare-stage" style={stage}>
            {/* A new result fades in from a light blur, so each change of setting is visible. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {after ? <img key={after} className="compare-image is-result" src={after} alt="" draggable={false} /> : <img className="compare-image is-waiting" src={before} alt="" draggable={false} />}
          </div>
        </div>
        <div className="compare-layer compare-before" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          <div className="compare-stage" style={stage}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="compare-image" src={before} alt="" draggable={false} />
          </div>
        </div>

        <div className="compare-line" style={{ left: `${split}%` }}>
          <div
            className="compare-handle"
            role="slider"
            tabIndex={0}
            aria-label="Move the line between the original and the result"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(split)}
            aria-valuetext={`${Math.round(split)}% original`}
            onKeyDown={onKey}
            onPointerDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
              setGesture({ kind: "split" });
            }}
          >
            <span />
            <span />
          </div>
        </div>

        <span className="compare-tag compare-tag-before">{beforeLabel}</span>
        <span className="compare-tag compare-tag-after">
          {busy && <LoaderCircle size={11} className="spin" aria-hidden="true" />}
          {afterLabel}
        </span>

        {zoomed && <span className="compare-hint">Drag to move around &middot; double-click to zoom out</span>}

        <button
          type="button"
          className="compare-tool"
          aria-pressed={zoomed}
          aria-label={zoomed ? "Back to the whole picture" : "Look closer, three times the size"}
          title={zoomed ? "Whole picture" : "Look closer (3×), or double-click the picture"}
          onClick={toggleZoom}
        >
          {zoomed ? <ZoomOut size={15} strokeWidth={1.8} /> : <ZoomIn size={15} strokeWidth={1.8} />}
        </button>
      </div>
    </div>
  );
}
