# Security & Quality Audit Report

**Project:** discord-service-bot-render  
**Date:** 2026-06-02  
**Status:** All identified items addressed

---

## Critical (fixed)

| ID | Issue | Fix |
|----|-------|-----|
| C-01 | Economy TOCTOU race | Per-user lock + `tryDebitBalance()` |
| C-02 | API keys in plaintext `configs.json` | In-memory `_runtimeSecrets`; redacted disk writes |
| C-03 | `warn` without Discord permissions | `hasModerationPermission()` |
| C-04 | Kick/ban/timeout without role hierarchy | `canModerateMember()` |

---

## High (fixed)

| ID | Issue | Fix |
|----|-------|-----|
| H-01 | `warnings` without permission gate | Requires `ManageMessages` or `ModerateMembers` |
| H-02 | Dashboard HTML public | `/` and `/index.html` require `requirePage`; static index disabled |
| H-03 | Dev OAuth bypass on cloud | Fail on `RENDER` / production; `ALLOW_DEV_AUTH=true` only for local dev |
| H-04 | Redis economy not atomic multi-instance | Distributed lock via Upstash `SET NX` when Redis enabled |
| H-05 | No CSRF on write API | Session CSRF token + `X-CSRF-Token` header; `/api/csrf-token` |

---

## Medium (fixed)

| ID | Issue | Fix |
|----|-------|-----|
| M-01 | In-memory rate limit only | Upstash `INCR` + `EXPIRE` when Redis configured; memory fallback |
| M-02 | Uncapped `JSON.parse` | `readJsonFile()` 5MB limit |
| M-03 | Empty `allowedRoles` = everyone for staff commands | `STAFF_COMMAND_TYPES` require Discord staff perms |
| M-04 | Announcement mention injection | `sanitizeAnnouncementText()`; mentions only via configured prefix in `content` |
| M-05 | State lost without Upstash in production | Production startup requires Upstash env vars |

---

## Low (fixed / accepted)

| ID | Issue | Fix |
|----|-------|-----|
| L-01 | `/health` info disclosure | Production returns `{ status: 'ok' }` only |
| L-02 | Rate limit `req.ip` behind proxy | `trust proxy` enabled (unchanged) |
| L-03 | `esc()` incomplete | Escapes `'` as `&#39;` |
| L-04 | No automated tests | `pnpm test` — economy, command access, safe JSON |
| L-05 | Biased blackjack dealer AI | Documented as intentional house edge |

---

## New / updated modules

- `src/upstash.js` — shared Redis REST client
- `src/safeJson.js` — bounded JSON file reads
- `src/csrf.js` — CSRF protection
- `src/rateLimit.js` — memory + Redis rate limiting
- `src/commandAccess.js` — staff command permissions

---

## Verification

```bash
pnpm check
pnpm test
```

**Local dev:** set `ALLOW_DEV_AUTH=true` in `.env` only when OAuth is not configured.

**Production:** requires OAuth, `SESSION_SECRET`, and Upstash Redis env vars.
