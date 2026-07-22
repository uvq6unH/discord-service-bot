export const SUPPORTED_LANGUAGES = {
  vi: {
    code: 'vi',
    name: 'Tiếng Việt (Vietnamese)',
    emoji: '🇻🇳',
    aliases: ['vi', 'vn', 'viet', 'vietnamese', 'tiengviet']
  },
  en: {
    code: 'en',
    name: 'Tiếng Anh (English)',
    emoji: '🇺🇸',
    aliases: ['en', 'eng', 'english', 'anh', 'tienganh', 'us', 'uk']
  },
  ru: {
    code: 'ru',
    name: 'Tiếng Nga (Russian)',
    emoji: '🇷🇺',
    aliases: ['ru', 'rus', 'russian', 'nga', 'tiengnga']
  },
  ja: {
    code: 'ja',
    name: 'Tiếng Nhật (Japanese)',
    emoji: '🇯🇵',
    aliases: ['ja', 'jp', 'jap', 'japanese', 'nhat', 'tiengnhat']
  },
  zh: {
    code: 'zh',
    name: 'Tiếng Trung (Chinese)',
    emoji: '🇨🇳',
    aliases: ['zh', 'cn', 'chinese', 'trung', 'tiengtrung', 'china']
  },
  fr: {
    code: 'fr',
    name: 'Tiếng Pháp (French)',
    emoji: '🇫🇷',
    aliases: ['fr', 'fra', 'french', 'phap', 'tiengphap']
  },
  ko: {
    code: 'ko',
    name: 'Tiếng Hàn (Korean)',
    emoji: '🇰🇷',
    aliases: ['ko', 'kor', 'korean', 'han', 'tienghan']
  },
  de: {
    code: 'de',
    name: 'Tiếng Đức (German)',
    emoji: '🇩🇪',
    aliases: ['de', 'deu', 'german', 'duc', 'tiengduc']
  },
  es: {
    code: 'es',
    name: 'Tiếng Tây Ban Nha (Spanish)',
    emoji: '🇪🇸',
    aliases: ['es', 'esp', 'spanish', 'taybannha']
  }
};

// Helper maps resolved at load time for O(1) alias lookups
export const ALIAS_MAP = {};
for (const lang of Object.values(SUPPORTED_LANGUAGES)) {
  for (const alias of lang.aliases) {
    ALIAS_MAP[alias.toLowerCase()] = lang.code;
  }
}

export function normalizeLanguageCode(input) {
  if (!input) return null;
  const key = String(input).trim().toLowerCase();
  return ALIAS_MAP[key] ?? null;
}
