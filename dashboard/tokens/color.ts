/**
 * tokens/color.ts — Community Operations Platform
 * Design: Command Center / Tactical Operations Console
 * Inspiration: Riot Client, Esports Analytics, Mission Control
 */

export const color = {
  // ── Base surfaces ──────────────────────────────────────
  bg:          '#08080b',
  surface0:    '#0c0c10',
  surface1:    '#101014',
  surface2:    '#16161d',
  surface3:    '#1e1e28',
  surface4:    '#252534',

  // ── Borders ────────────────────────────────────────────
  border:        'rgba(255,255,255,0.06)',
  borderStrong:  'rgba(255,255,255,0.11)',
  borderAccent:  'rgba(88,101,242,0.35)',

  // ── Text ───────────────────────────────────────────────
  text1: '#f0f0f4',
  text2: '#9898b8',
  text3: '#555570',

  // ── Accent — Discord blurple ───────────────────────────
  accent:       '#5865f2',
  accentHover:  '#4752c4',
  accentDim:    'rgba(88,101,242,0.12)',
  accentGlow:   'rgba(88,101,242,0.22)',
  accentShadow: 'rgba(88,101,242,0.28)',

  // ── Status ─────────────────────────────────────────────
  green:     '#22c55e',
  yellow:    '#eab308',
  red:       '#ef4444',
  greenDim:  'rgba(34,197,94,0.1)',
  redDim:    'rgba(239,68,68,0.1)',
  yellowDim: 'rgba(234,179,8,0.1)',
} as const;

export type ColorToken = keyof typeof color;
