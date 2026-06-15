/**
 * tokens/spacing.ts — Community Operations Platform
 */

export const spacing = {
  s1:  '4px',
  s2:  '8px',
  s3:  '12px',
  s4:  '16px',
  s5:  '20px',
  s6:  '24px',
  s8:  '32px',
  s10: '40px',
  s12: '48px',
} as const;

export const radius = {
  r1: '4px',
  r2: '6px',
  r3: '8px',
  r4: '10px',
  r5: '12px',
  r6: '16px',
  r7: '20px',
  r8: '24px',
  outer: '18px',
  inner: '14px',
} as const;

export const layout = {
  railW:      '68px',
  navW:       '212px',
  contentMax: '920px',
} as const;

export type SpacingToken = keyof typeof spacing;
export type RadiusToken  = keyof typeof radius;
