export class GoogleFreeProvider {
  constructor() {
    this.name = 'GoogleFree';
  }

  async translate(text, targetLang, sourceLang = 'auto') {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    
    let attempt = 0;
    const maxAttempts = 2; // initial attempt + 1 retry

    while (attempt < maxAttempts) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout

      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`HTTP status ${res.status}`);
        }

        const data = await res.json();
        if (!data || !Array.isArray(data[0])) {
          throw new Error("Invalid response format");
        }

        const translatedText = data[0]
          .map(chunk => chunk && typeof chunk[0] === 'string' ? chunk[0] : '')
          .join('');
        const detectedLang = data[2];

        return { translatedText, detectedLang };
      } catch (err) {
        clearTimeout(timeoutId);
        
        const isTimeout = err.name === 'AbortError';
        const errorMessage = isTimeout ? 'Request timed out (5s)' : err.message;
        console.warn(`[GoogleFreeProvider] Translation attempt ${attempt} failed: ${errorMessage}`);

        if (attempt >= maxAttempts) {
          throw new Error(`Google translation failed after ${maxAttempts} attempts: ${errorMessage}`);
        }
        
        // Wait 500ms before retry
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
}
