"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Three picture frames that press together when files are dragged over the page. */
export function FrameMark({ active = false }: { active?: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      className="frame-mark"
      animate={reduceMotion ? undefined : { y: active ? -3 : [0, -3, 0] }}
      transition={active ? { type: "spring", stiffness: 260, damping: 20 } : { duration: 5.5, ease: "easeInOut", repeat: Infinity }}
    >
      {[2, 1, 0].map((layer) => (
        <motion.svg
          key={layer}
          viewBox="0 0 100 72"
          className={`frame-layer frame-layer-${layer}`}
          fill="none"
          initial={false}
          animate={
            reduceMotion
              ? undefined
              : {
                  x: active ? layer * 3 : layer * 9,
                  y: active ? layer * -3 : layer * -9,
                  scale: active ? 1.04 - layer * 0.02 : 1 - layer * 0.04,
                  opacity: layer === 0 ? 1 : active ? 0.7 - layer * 0.15 : 0.55 - layer * 0.18,
                }
          }
          transition={{ type: "spring", stiffness: 220, damping: 18, delay: layer * 0.04 }}
        >
          <rect x="3" y="3" width="94" height="66" rx="10" stroke="currentColor" strokeWidth="1.6" className="frame-fill" />
          {layer === 0 && (
            <>
              <circle cx="31" cy="25" r="6.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 58 39 35l17 14 12-10 20 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
        </motion.svg>
      ))}
      <motion.span
        className="frame-glow"
        initial={false}
        animate={reduceMotion ? undefined : { opacity: active ? 0.45 : 0.12, scale: active ? 1.35 : 1 }}
      />
    </motion.div>
  );
}
