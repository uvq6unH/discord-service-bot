/**
 * src/design/tokens/motion.ts
 * Animation constants for transitions.
 */

export const motion = {
  // Durations
  fast:    '100ms',
  base:    '180ms',
  slow:    '280ms',

  // Snappy easings
  ease:        'cubic-bezier(0.16, 1, 0.3, 1)',
  easeOut:     'cubic-bezier(0, 0, 0.2, 1)',
  easeIn:      'cubic-bezier(0.4, 0, 1, 1)',
  easeInOut:   'cubic-bezier(0.4, 0, 0.2, 1)',

  // Spring configs for motion
  spring: {
    snappy:  { type: 'spring', stiffness: 500, damping: 35 },
    smooth:  { type: 'spring', stiffness: 300, damping: 28 },
  },

  // Page transitions
  page: {
    initial:  { opacity: 0, y: 2 },
    animate:  { opacity: 1, y: 0 },
    exit:     { opacity: 0 },
    transition: { duration: 0.12, ease: 'easeOut' },
  },
} as const;
