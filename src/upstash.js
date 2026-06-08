/**
 * Minimal Upstash Redis REST client (shared by state + rate limiting).
 */
import https from 'node:https';
import { URL } from 'node:url';

export class UpstashClient {
  constructor(url, token) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
  }

  _request(body, retries = 2) {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        const parsed = new URL(this.url);
        const payload = JSON.stringify(body);
        const req = https.request({
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString());
              if (data.error) return reject(new Error(data.error));
              resolve(data.result);
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', (err) => {
          if (retries > 0) {
            const delay = 200 * (3 - retries);
            setTimeout(() => { retries--; attempt(); }, delay);
          } else {
            reject(err);
          }
        });
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('Upstash timeout')); });
        req.write(payload);
        req.end();
      };
      attempt();
    });
  }

  pipeline(commands, retries = 2) {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        const parsed = new URL(`${this.url}/pipeline`);
        const payload = JSON.stringify(commands.map((cmd) => cmd));
        const req = https.request({
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString());
              if (data.error) return reject(new Error(data.error));
              const failed = Array.isArray(data) ? data.find((item) => item?.error) : null;
              if (failed) return reject(new Error(failed.error));
              resolve(data);
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', (err) => {
          if (retries > 0) {
            const delay = 200 * (3 - retries);
            setTimeout(() => { retries--; attempt(); }, delay);
          } else {
            reject(err);
          }
        });
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('Upstash pipeline timeout')); });
        req.write(payload);
        req.end();
      };
      attempt();
    });
  }

  get(key) {
    return this._request(['GET', key]);
  }

  set(key, value, ...args) {
    return this._request(['SET', key, value, ...args]);
  }

  del(key) {
    return this._request(['DEL', key]);
  }

  incr(key) {
    return this._request(['INCR', key]);
  }

  expire(key, seconds) {
    return this._request(['EXPIRE', key, String(seconds)]);
  }

  smembers(key) {
    return this._request(['SMEMBERS', key]);
  }

  sadd(key, ...members) {
    return this._request(['SADD', key, ...members]);
  }

  eval(script, numKeys, ...keysAndArgs) {
    return this._request(['EVAL', script, numKeys, ...keysAndArgs]);
  }

  lpop(key) {
    return this._request(['LPOP', key]);
  }

  rpush(key, ...values) {
    return this._request(['RPUSH', key, ...values]);
  }

  llen(key) {
    return this._request(['LLEN', key]);
  }
}

export function createUpstashFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new UpstashClient(url, token);
}