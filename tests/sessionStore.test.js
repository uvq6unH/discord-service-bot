import { describe, it, expect, vi } from 'vitest';
import { UpstashSessionStore } from '../src/sessionStore.js';

describe('UpstashSessionStore (src/sessionStore.js)', () => {
  function createMockClient() {
    const store = new Map();
    return {
      store,
      get: vi.fn(async (key) => store.get(key) ?? null),
      set: vi.fn(async (key, val, ex, ttl) => {
        store.set(key, val);
        return 'OK';
      }),
      del: vi.fn(async (key) => {
        store.delete(key);
        return 1;
      }),
      expire: vi.fn(async (key, ttl) => {
        return 1;
      }),
    };
  }

  it('sets and gets session correctly with default TTL', async () => {
    const client = createMockClient();
    const store = new UpstashSessionStore(client, { ttl: 3600 });
    const sessionData = { user: { id: 'user_123', name: 'Alice' } };

    await new Promise((resolve, reject) => {
      store.set('sid_abc', sessionData, (err) => (err ? reject(err) : resolve()));
    });

    expect(client.set).toHaveBeenCalledWith('sess:sid_abc', JSON.stringify(sessionData), 'EX', 3600);

    const retrieved = await new Promise((resolve, reject) => {
      store.get('sid_abc', (err, sess) => (err ? reject(err) : resolve(sess)));
    });

    expect(retrieved).toEqual(sessionData);
  });

  it('calculates cookie TTL when cookie.expires is set in the future', async () => {
    const client = createMockClient();
    const store = new UpstashSessionStore(client);
    const expires = new Date(Date.now() + 120_000).toISOString(); // 120 seconds in future
    const sessionData = { cookie: { expires }, foo: 'bar' };

    await new Promise((resolve, reject) => {
      store.set('sid_exp', sessionData, (err) => (err ? reject(err) : resolve()));
    });

    expect(client.set).toHaveBeenCalledTimes(1);
    const calledTTL = client.set.mock.calls[0][3];
    expect(calledTTL).toBeGreaterThanOrEqual(118);
    expect(calledTTL).toBeLessThanOrEqual(122);
  });

  it('handles get for non-existent session by returning null without error', async () => {
    const client = createMockClient();
    const store = new UpstashSessionStore(client);

    const result = await new Promise((resolve, reject) => {
      store.get('sid_nonexistent', (err, sess) => (err ? reject(err) : resolve(sess)));
    });

    expect(result).toBeNull();
  });

  it('handles corrupted JSON in store by passing error to callback', async () => {
    const client = createMockClient();
    client.store.set('sess:sid_corrupt', '{invalid json');
    const store = new UpstashSessionStore(client);

    const error = await new Promise((resolve) => {
      store.get('sid_corrupt', (err, sess) => resolve(err));
    });

    expect(error).toBeInstanceOf(SyntaxError);
  });

  it('destroys session via Redis del', async () => {
    const client = createMockClient();
    client.store.set('sess:sid_del', '{"foo":1}');
    const store = new UpstashSessionStore(client);

    await new Promise((resolve, reject) => {
      store.destroy('sid_del', (err) => (err ? reject(err) : resolve()));
    });

    expect(client.del).toHaveBeenCalledWith('sess:sid_del');
    expect(client.store.has('sess:sid_del')).toBe(false);
  });

  it('touches session to refresh Redis expiration', async () => {
    const client = createMockClient();
    const store = new UpstashSessionStore(client, { ttl: 1800 });

    await new Promise((resolve, reject) => {
      store.touch('sid_touch', {}, (err) => (err ? reject(err) : resolve()));
    });

    expect(client.expire).toHaveBeenCalledWith('sess:sid_touch', 1800);
  });

  it('propagates Redis client errors to callback', async () => {
    const client = createMockClient();
    client.get.mockRejectedValue(new Error('Redis connection failure'));
    const store = new UpstashSessionStore(client);

    const error = await new Promise((resolve) => {
      store.get('sid_err', (err, sess) => resolve(err));
    });

    expect(error.message).toContain('Redis connection failure');
  });
});
