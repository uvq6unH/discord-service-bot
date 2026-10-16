import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SUPPORTED_LANGUAGES, normalizeLanguageCode } from '../src/services/translation/languages.js';
import { GoogleFreeProvider } from '../src/services/translation/providers/googleFree.provider.js';

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

describe('GoogleFreeProvider (src/services/translation/providers/googleFree.provider.js)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('translates text successfully and detects source language', async () => {
    const mockData = [
      [['Xin chào', 'Hello', null, null]],
      null,
      'en',
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    const provider = new GoogleFreeProvider();
    const result = await provider.translate('Hello', 'vi', 'en');

    expect(result.translatedText).toBe('Xin chào');
    expect(result.detectedLang).toBe('en');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on transient HTTP error and succeeds on second attempt', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 503 };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [[['Привет', 'Hello']]],
      };
    });

    const provider = new GoogleFreeProvider();
    const result = await provider.translate('Hello', 'ru', 'auto');

    expect(callCount).toBe(2);
    expect(result.translatedText).toBe('Привет');
  });

  it('throws error after exhausting retry attempts on repeated failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const provider = new GoogleFreeProvider();
    await expect(provider.translate('Test', 'vi')).rejects.toThrow(/Google translation failed after 2 attempts/);
  });

  it('handles invalid response format by throwing an error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: 'format' }),
    });

    const provider = new GoogleFreeProvider();
    await expect(provider.translate('Test', 'vi')).rejects.toThrow(/Google translation failed after 2 attempts/);
  });
});
