import crypto from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createCsrfProtection() {
  function ensureToken(req) {
    if (!req.session) return null;
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
    }
    return req.session.csrfToken;
  }

  function issueToken(req, res) {
    const token = ensureToken(req);
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({ csrfToken: token });
  }

  function validate(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    if (req.path.startsWith('/auth/')) {
      next();
      return;
    }

    const expected = ensureToken(req);
    const provided = req.get('x-csrf-token') ?? req.body?.csrfToken;
    if (!expected || typeof provided !== 'string' || provided !== expected) {
      res.status(403).json({ error: 'Invalid or missing CSRF token.' });
      return;
    }
    next();
  }

  return { issueToken, validate, ensureToken };
}
