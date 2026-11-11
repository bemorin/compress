"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";

interface Option<T> {
  value: T;
  label: string;
  title?: string;
}

/** A row of choices with a pill that slides to the selected one. Arrow keys move the choice. */
export function Segmented<T extends string | number>({
  name,
  options,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div className={`segmented ${disabled ? "is-disabled" : ""}`} role="radiogroup" aria-label={name} aria-disabled={disabled || undefined}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            ref={(element) => { buttons.current[index] = element; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            title={option.title}
            disabled={disabled}
            className={`segment ${selected ? "is-selected" : ""}`}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {selected && (
              <motion.span
                layoutId={`pill-${name}`}
                className="segment-pill"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span className="segment-text">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
