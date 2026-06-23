export const economyService = {
  validateBet: (val, min, max) => {
    const num = Number(val);
    if (isNaN(num)) return min;
    return Math.max(min, Math.min(num, max));
  },
  validateAmount: (val) => {
    const num = Number(val);
    if (isNaN(num)) return 0;
    return Math.max(0, num);
  }
};
