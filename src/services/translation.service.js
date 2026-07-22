import { GoogleFreeProvider } from './translation/providers/googleFree.provider.js';
import { SUPPORTED_LANGUAGES } from './translation/languages.js';

class SimpleCache {
  constructor(maxSize = 100, ttlMs = 600000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    this.store.delete(key);
    this.store.set(key, item);
    return item.value;
  }

  set(key, value) {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    this.store.set(key, { value, timestamp: Date.now() });
  }
}

export class TranslationService {
  constructor(provider = new GoogleFreeProvider()) {
    this.provider = provider;
    this.cache = new SimpleCache(100, 10 * 60 * 1000); // 100 entries, 10 minutes TTL
  }

  async translate(text, targetLang, sourceLang = 'auto', userSpecifiedTarget = false) {
    // 1. Truncate text to 1000 characters to prevent URL size limits and keep Discord Embed safe
    const truncatedText = text.length > 1000 ? text.slice(0, 1000) : text;

    const cacheKey = `${sourceLang}:${targetLang}:${truncatedText}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`[TranslationService] Cache hit for key: ${cacheKey}`);
      return cached;
    }

    // 2. Perform translation via provider
    let result = await this.provider.translate(truncatedText, targetLang, sourceLang);

    // 3. Smart Auto Default Correction:
    // If the user did not specify a target lang, sourceLang is 'auto', and the text is auto-detected as Vietnamese (detectedLang === 'vi'),
    // we fetch again with targetLang = 'en' (English).
    // Note: This requires a second network call because the Google Free API requires specifying 'tl' upfront.
    if (sourceLang === 'auto' && !userSpecifiedTarget && result.detectedLang === 'vi') {
      const enTargetKey = `auto:en:${truncatedText}`;
      const enCached = this.cache.get(enTargetKey);
      if (enCached) {
        return enCached;
      }
      
      console.log(`[TranslationService] Source text detected as 'vi' with default 'vi' target. Performing second fetch for 'en'.`);
      const secondResult = await this.provider.translate(truncatedText, 'en', 'auto');
      
      const finalResult = {
        translatedText: secondResult.translatedText,
        detectedLang: secondResult.detectedLang,
        actualTargetLang: 'en'
      };
      this.cache.set(enTargetKey, finalResult);
      return finalResult;
    }

    const finalResult = {
      translatedText: result.translatedText,
      detectedLang: result.detectedLang,
      actualTargetLang: targetLang
    };

    this.cache.set(cacheKey, finalResult);
    return finalResult;
  }
}

// Single global instance for reuse
export const translationService = new TranslationService();
