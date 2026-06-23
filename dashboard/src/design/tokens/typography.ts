/**
 * src/design/tokens/typography.ts
 * Fonts locked down by contract: display, monospace, body.
 */

export const typography = {
  fontDisplay: "'Bebas Neue', 'Space Grotesk', system-ui, sans-serif",
  fontBody:    "'IBM Plex Sans', system-ui, sans-serif",
  fontMono:    "'JetBrains Mono', 'IBM Plex Mono', monospace",

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
