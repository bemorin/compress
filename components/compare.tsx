"use client";

import { motion, useReducedMotion } from "framer-motion";
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

/**
 * The original on the left of the line, the result on the right. Drag the line, click anywhere,
 * or use the arrow keys. The magnifier shows pixels at three times their size where you point.
 */
export function Compare({ before, after, beforeLabel, afterLabel, busy, stale = false, ratio }: CompareProps) {
  const reduceMotion = useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [focus, setFocus] = useState({ x: 50, y: 50 });

  const place = useCallback((clientX: number, clientY: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const x = Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - box.top) / box.height) * 100));
    return { x, y };
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const point = place(event.clientX, event.clientY);
      if (point) setSplit(point.x);
    };
    const stop = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging, place]);

  const onKey = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft") setSplit((value) => Math.max(0, value - step));
    else if (event.key === "ArrowRight") setSplit((value) => Math.min(100, value + step));
    else if (event.key === "Home") setSplit(0);
    else if (event.key === "End") setSplit(100);
    else return;
    event.preventDefault();
  };

  const layer = zoom
    ? { transform: "scale(3)", transformOrigin: `${focus.x}% ${focus.y}%` }
    : { transform: "scale(1)", transformOrigin: `${focus.x}% ${focus.y}%` };

  return (
    <div className="compare">
      <div
        ref={frame}
        className={`compare-frame ${zoom ? "is-zoomed" : ""} ${dragging ? "is-dragging" : ""}`}
        style={ratio ? { aspectRatio: String(ratio) } : undefined}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest(".compare-tool")) return;
          const point = place(event.clientX, event.clientY);
          if (point) setSplit(point.x);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!zoom) return;
          const point = place(event.clientX, event.clientY);
          if (point) setFocus(point);
        }}
      >
        <div className={`compare-layer ${stale ? "is-stale" : ""}`} style={layer}>
          {/* A new result fades in from a light blur, so each change of setting is visible. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {after ? <img key={after} className="compare-image is-result" src={after} alt="" draggable={false} /> : <img className="compare-image is-waiting" src={before} alt="" draggable={false} />}
        </div>
        <div className="compare-layer compare-before" style={{ ...layer, clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="compare-image" src={before} alt="" draggable={false} />
        </div>

        <motion.div
          className="compare-line"
          style={{ left: `${split}%` }}
          animate={reduceMotion ? undefined : { opacity: 1 }}
        >
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
              setDragging(true);
            }}
          >
            <span />
            <span />
          </div>
        </motion.div>

        <span className="compare-tag compare-tag-before">{beforeLabel}</span>
        <span className="compare-tag compare-tag-after">
          {busy && <LoaderCircle size={11} className="spin" aria-hidden="true" />}
          {afterLabel}
        </span>

        <button
          type="button"
          className="compare-tool"
          aria-pressed={zoom}
          aria-label={zoom ? "Back to the whole picture" : "Look closer, three times the size"}
          title={zoom ? "Whole picture" : "Look closer (3×)"}
          onClick={() => setZoom((value) => !value)}
        >
          {zoom ? <ZoomOut size={15} strokeWidth={1.8} /> : <ZoomIn size={15} strokeWidth={1.8} />}
        </button>
      </div>
    </div>
  );
}
