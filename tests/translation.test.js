import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES, normalizeLanguageCode } from '../src/services/translation/languages.js';

describe('Translation Languages Utility', () => {
  it('should list supported languages', () => {
    expect(SUPPORTED_LANGUAGES).toBeDefined();
    expect(SUPPORTED_LANGUAGES.ru).toBeDefined();
    expect(SUPPORTED_LANGUAGES.vi).toBeDefined();
    expect(SUPPORTED_LANGUAGES.en).toBeDefined();
  });

  it('should normalize language codes correctly', () => {
    expect(normalizeLanguageCode('ru')).toBe('ru');
    expect(normalizeLanguageCode('Russian')).toBe('ru');
    expect(normalizeLanguageCode('vi')).toBe('vi');
    expect(normalizeLanguageCode('viet')).toBe('vi');
    expect(normalizeLanguageCode('vn')).toBe('vi');
  });
});
