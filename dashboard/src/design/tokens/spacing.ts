/**
 * src/design/tokens/spacing.ts
 * Spacing, strictly 0px radius, and layout blueprint dimensions.
 */

export const spacing = {
  half: '2px',
  s3px: '3px',
  s1:   '4px',
  s1_5: '6px',
  s2:   '8px',
  s2_5: '10px',
  s3:   '12px',
  s3_5: '14px',
  s4:   '16px',
  s5:   '20px',
  s6:   '24px',
  s8:   '32px',
  s10:  '40px',
  s12:  '48px',
} as const;

export const radius = {
  // Rigid 90-degree corners mandated by the contract
  r0: '0px',
  r1: '0px',
  r2: '0px',
  r3: '0px',
  r4: '0px',
  r5: '0px',
  r6: '0px',
  r7: '0px',
  r8: '0px',
  outer: '0px',
  inner: '0px',
} as const;

export const layout = {
  // Flexible target sizes for layout grids
  guildRail: {
    target: '64px',
    min: '64px',
    max: '80px',
  },
  domainRail: {
    target: '280px',
    min: '240px',
    max: '320px',
  },
  header: {
    target: '72px',
    min: '64px',
    max: '88px',
  },
} as const;

export type SpacingToken = keyof typeof spacing;
export type RadiusToken  = keyof typeof radius;
