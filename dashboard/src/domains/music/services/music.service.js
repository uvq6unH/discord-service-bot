export const musicService = {
  validateVolume: (volume) => {
    const num = Number(volume);
    if (isNaN(num)) return 70;
    return Math.max(0, Math.min(num, 100));
  },
  validatePrefix: (prefix) => {
    return (prefix || '').trim().slice(0, 5);
  }
};
