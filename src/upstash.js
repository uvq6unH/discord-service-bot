/**
 * Minimal Upstash Redis REST client (shared by state + rate limiting).
 *
 * Sử dụng fetch thay vì https.request — gọn hơn, timeout qua AbortController.
 * Retry logic: exponential backoff 200 ms → 400 ms (tối đa 2 lần, MAX_RETRIES=2).
 */

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class UpstashClient {
  constructor(url, token) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
  }

  async _request(body, retries = MAX_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data.result;
    } catch (err) {
      if (retries > 0) {
        const attempt = MAX_RETRIES - retries; // 0-based: 0, 1 (MAX_RETRIES=2 → tối đa 2 lần retry)
        const delay = 200 * Math.pow(2, attempt); // 200ms (attempt=0) → 400ms (attempt=1)
        await sleep(delay);
        return this._request(body, retries - 1);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async pipeline(commands, retries = MAX_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
        signal: controller.signal,
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const failed = Array.isArray(data) ? data.find((item) => item?.error) : null;
      if (failed) throw new Error(failed.error);
      return data;
    } catch (err) {
      if (retries > 0) {
        const attempt = MAX_RETRIES - retries; // 0-based: 0, 1 (MAX_RETRIES=2 → tối đa 2 lần retry)
        const delay = 200 * Math.pow(2, attempt); // 200ms (attempt=0) → 400ms (attempt=1)
        await sleep(delay);
        return this.pipeline(commands, retries - 1);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── String / key commands ──────────────────────────────────────────────────

  get(key)                          { return this._request(['GET', key]); }
  mget(...keys)                     { return this._request(['MGET', ...keys]); }
  set(key, value, ...options)       { return this._request(['SET', key, String(value), ...options]); }
  del(key)                          { return this._request(['DEL', key]); }
  incr(key)                         { return this._request(['INCR', key]); }
  expire(key, seconds)              { return this._request(['EXPIRE', key, String(seconds)]); }
  ttl(key)                          { return this._request(['TTL', key]); }

  /** Trả về mảng key khớp với pattern (dùng scan khi có; Upstash REST hỗ trợ KEYS). */
  keys(pattern)                     { return this._request(['KEYS', pattern]); }
  dbsize()                          { return this._request(['DBSIZE']); }
  info(section)                     { return section ? this._request(['INFO', section]) : this._request(['INFO']); }

  // ── Hash commands ──────────────────────────────────────────────────────────

  hget(key, field)                  { return this._request(['HGET', key, field]); }
  hgetall(key)                      { return this._request(['HGETALL', key]); }
  hincrby(key, field, increment)    { return this._request(['HINCRBY', key, field, String(increment)]); }

  // ── Set commands ───────────────────────────────────────────────────────────

  smembers(key)                     { return this._request(['SMEMBERS', key]); }
  sadd(key, ...members)             { return this._request(['SADD', key, ...members]); }
  srem(key, ...members)             { return this._request(['SREM', key, ...members]); }

  // ── List commands ──────────────────────────────────────────────────────────

  lpop(key)                         { return this._request(['LPOP', key]); }
  blpop(key, timeoutSeconds = 1)    { return this._request(['BLPOP', key, String(timeoutSeconds)]); }
  rpush(key, ...values)             { return this._request(['RPUSH', key, ...values]); }
  llen(key)                         { return this._request(['LLEN', key]); }

  // ── Scripting ──────────────────────────────────────────────────────────────

  eval(script, numKeys, ...keysAndArgs) {
    return this._request(['EVAL', script, numKeys, ...keysAndArgs]);
  }
}

export function createUpstashFromEnv(env = process.env) {
  const url   = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new UpstashClient(url, token);
}
