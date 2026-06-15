/**
 * tokens/typography.ts — Community Operations Platform
 * Display: Space Grotesk (Command Center feel)
 * Body: IBM Plex Sans (operational clarity)
 * Mono: Geist Mono (data/numbers)
 */

export const typography = {
  fontDisplay: "'Space Grotesk', 'Geist', system-ui, sans-serif",
  fontBody:    "'IBM Plex Sans', 'Geist', system-ui, sans-serif",
  fontMono:    "'Geist Mono', 'IBM Plex Mono', monospace",

  // Scale
  xs:   '11px',
  sm:   '12px',
  base: '13px',
  md:   '14px',
  lg:   '16px',
  xl:   '18px',
  '2xl': '22px',
  '3xl': '28px',
  '4xl': '36px',

  // Weight
  regular:   400,
  medium:    500,
  semibold:  600,
  bold:      700,
} as const;

export type TypographyToken = keyof typeof typography;
