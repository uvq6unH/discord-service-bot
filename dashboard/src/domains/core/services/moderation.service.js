export const moderationService = {
  validateThreshold: (val) => {
    const num = Number(val);
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(num, 100));
  },
  validateSelfRoleLabel: (label) => {
    return (label || '').trim().slice(0, 32);
  }
};
