export const commandService = {
  validateCommandName: (name) => {
    return (name || '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');
  },
  validateKeyword: (kw) => {
    return (kw || '').trim().toLowerCase();
  }
};
