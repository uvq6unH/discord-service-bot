/**
 * src/design/tokens/color.ts
 * Rebuilt for Bot Operations Platform — Tactical/Industrial Vibe
 */

export const color = {
  // ── Base surfaces ──────────────────────────────────────
  bg:          '#0A0A0A', // Matte off-black background
  surface0:    '#121212', // Primary panel background
  surface1:    '#181818',
  surface2:    '#202020',
  surface3:    '#2A2A2A',

  // ── Borders ────────────────────────────────────────────
  border:        'rgba(255, 255, 255, 0.08)',
  borderStrong:  'rgba(255, 255, 255, 0.16)',

  // ── Text ───────────────────────────────────────────────
  text1: '#EAEAEA', // Primary text
  text2: '#A0A0A0', // Secondary text
  text3: '#808080', // Muted text/metadata

  // ── Domain Branding Accents ───────────────────────────
  accentCore:     '#FFFFFF', // White/Slate for Core Operations
  accentRiot:     '#FF2A2A', // Tactical Red for Riot Services
  accentMusic:    '#F5A623', // Heavy Amber for Music Services
  accentReminder: '#2F80ED', // Console Blue for Reminder Services

  // ── Status ─────────────────────────────────────────────
  green:     '#4AF626', // Terminal Green
  yellow:    '#F6AD26',
  red:       '#FF2A2A', // Aviation Red
  greenDim:  'rgba(74, 246, 38, 0.1)',
  redDim:    'rgba(255, 42, 42, 0.1)',
  yellowDim: 'rgba(246, 173, 38, 0.1)',
} as const;

export type ColorToken = keyof typeof color;
