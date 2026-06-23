export const riotService = {
  validateApiKey: (key) => {
    const trimmed = (key || '').trim();
    if (!trimmed) return '';
    return trimmed;
  }
};
