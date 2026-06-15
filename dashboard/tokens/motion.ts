/**
 * tokens/motion.ts — Community Operations Platform
 * MOTION_INTENSITY: 5 — purposeful, not cinematic
 */

export const motion = {
  // Durations
  fast:    '120ms',
  base:    '200ms',
  slow:    '300ms',
  slower:  '400ms',

  // Easing
  ease:        'cubic-bezier(0.16, 1, 0.3, 1)',   // snappy spring
  easeOut:     'cubic-bezier(0, 0, 0.2, 1)',
  easeIn:      'cubic-bezier(0.4, 0, 1, 1)',
  easeInOut:   'cubic-bezier(0.4, 0, 0.2, 1)',

  // Spring configs for motion/react
  spring: {
    snappy:  { type: 'spring', stiffness: 400, damping: 30 },
    smooth:  { type: 'spring', stiffness: 260, damping: 25 },
    gentle:  { type: 'spring', stiffness: 180, damping: 20 },
  },

  // Page transition
  page: {
    initial:  { opacity: 0, y: 4 },
    animate:  { opacity: 1, y: 0 },
    exit:     { opacity: 0 },
    transition: { duration: 0.15 },
  },
} as const;
