/**
 * express-session store backed by Upstash Redis REST API.
 * No extra npm packages — uses the UpstashClient already in the project.
 */

const SESSION_PREFIX = 'sess:';
const DEFAULT_TTL    = 7 * 24 * 60 * 60; // 7 days in seconds

export class UpstashSessionStore {
  /**
   * @param {import('./upstash.js').UpstashClient} client
   * @param {{ ttl?: number }} [opts]
   */
  constructor(client, opts = {}) {
    this.client = client;
    this.ttl    = opts.ttl ?? DEFAULT_TTL;
  }

  _key(sid) { return `${SESSION_PREFIX}${sid}`; }

  /** express-session: load session */
  get(sid, cb) {
    this.client.get(this._key(sid))
      .then((raw) => {
        if (!raw) return cb(null, null);
        try { cb(null, JSON.parse(raw)); }
        catch (e) { cb(e); }
      })
      .catch(cb);
  }

  /** express-session: save/update session */
  set(sid, session, cb) {
    const ttl = this._getTTL(session);
    this.client.set(this._key(sid), JSON.stringify(session), 'EX', ttl)
      .then(() => cb(null))
      .catch(cb);
  }

  /** express-session: destroy session */
  destroy(sid, cb) {
    this.client.del(this._key(sid))
      .then(() => cb(null))
      .catch(cb);
  }

  /** express-session: refresh TTL */
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
