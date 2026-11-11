"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** A number that glides to its new value instead of jumping. */
export function Counter({ value, format }: { value: number; format: (value: number) => string }) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(value);
  const last = useRef(value);

  useEffect(() => {
    if (reduceMotion) {
      last.current = value;
      setShown(value);
      return;
    }
    const controls = animate(last.current, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        last.current = latest;
        setShown(latest);
      },
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

  return <>{format(shown)}</>;
}
