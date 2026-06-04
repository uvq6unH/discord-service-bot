/**
 * express-session store backed by Upstash Redis REST API.
 * Extends expressSession.Store so all required methods (createSession, etc.)
 * are inherited correctly — no manual EventEmitter wiring needed.
 */

import expressSession from 'express-session';

const SESSION_PREFIX = 'sess:';
const DEFAULT_TTL    = 7 * 24 * 60 * 60; // 7 days in seconds

export class UpstashSessionStore extends expressSession.Store {
  constructor(client, opts = {}) {
    super();
    this.client = client;
    this.ttl    = opts.ttl ?? DEFAULT_TTL;
  }

  _key(sid) { return `${SESSION_PREFIX}${sid}`; }

  get(sid, cb) {
    this.client.get(this._key(sid))
      .then((raw) => {
        if (!raw) return cb(null, null);
        try { cb(null, JSON.parse(raw)); }
        catch (e) { cb(e); }
      })
      .catch(cb);
  }

  set(sid, session, cb) {
    const ttl = this._getTTL(session);
    this.client.set(this._key(sid), JSON.stringify(session), 'EX', ttl)
      .then(() => cb(null))
      .catch(cb);
  }

  destroy(sid, cb) {
    this.client.del(this._key(sid))
      .then(() => cb(null))
      .catch(cb);
  }

  touch(sid, session, cb) {
    const ttl = this._getTTL(session);
    this.client.expire(this._key(sid), ttl)
      .then(() => cb(null))
      .catch(cb);
  }

  _getTTL(session) {
    if (session?.cookie?.expires) {
      const ms = new Date(session.cookie.expires) - Date.now();
      if (ms > 0) return Math.ceil(ms / 1000);
    }
    return this.ttl;
  }
}
