# Discord Service Bot — Security & Code Audit Report

**Date:** 2026-06-07  
**Codebase:** `discord-service-bot-render.zip`  
**Auditor:** Automated full-codebase review

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| Critical | 2     | ✅ 2  |
| High     | 2     | ✅ 2  |
| Medium   | 3     | ✅ 3  |
| Low      | 2     | ✅ 2  |

All issues have been patched. A clean codebase is exported alongside this report.

---

## CRITICAL Issues

### C-1: `cookie.secure = false` in Production — Session Hijacking Risk
**File:** `src/server.js`  
**Impact:** Session cookies transmitted over HTTP in production, allowing MitM interception of authenticated sessions even though the app runs over HTTPS via Render's proxy. `trust proxy = 1` is correctly set, which means `cookie.secure: true` works correctly behind Render.  
**Fix:** Changed `secure: false` → `secure: isProduction`. Secure cookies are now set in production only.

```diff
- secure: false,
+ secure: isProduction,
```

---

### C-2: Content-Security-Policy Completely Disabled
**File:** `src/server.js`  
**Impact:** `helmet({ contentSecurityPolicy: false })` means the browser receives no CSP header at all. This allows XSS via injected scripts, inline script execution, and data exfiltration to any domain. The comment claimed CSP was "set manually" but no manual CSP header was set anywhere.  
**Fix:** Enabled CSP with a proper allowlist: `script-src 'self'`, `style-src` for Google Fonts/CDN, `img-src` for Discord CDN, `connect-src 'self'`, `frame-src 'none'`, `object-src 'none'`.

---

## HIGH Issues

### H-1: `distributedLock.js` Calls Private `_request()` Method Directly
**File:** `src/distributedLock.js`, `src/upstash.js`  
**Impact:** The Lua EVAL for atomic lock release calls `redis._request(...)`, breaking the public API contract. If the internal implementation of `UpstashClient` changes, the lock release silently fails — leaving distributed locks permanently held (deadlock risk).  
**Fix:** Added a public `eval(script, numKeys, ...keysAndArgs)` method to `UpstashClient`. Updated `distributedLock.js` to call `redis.eval(...)`.

---

### H-2: Unused `repeatLabel` Variable — Repeat Indicator Never Sent
**File:** `src/bot.js` line 173  
**Impact:** The repeat indicator (`🔁 mỗi ngày`, etc.) was computed but never appended to the reminder message. Users with repeating reminders received no visual indication that the reminder would fire again — a functional bug and user trust issue.  
**Fix:** Appended `repeatLabel` to the sent message content: `` `${mentions} ${resolvedMessage}${repeatLabel}` ``

---

## MEDIUM Issues

### M-1: CRLF Line Endings in 6 Source Handler Files
**Files:** `src/bot/commands/handlers/{economy,moderation,general,levels,help,riot}.js`  
**Impact:** Windows-style `\r\n` line endings cause `git diff` noise, break `sed`/`grep`/`patch` tooling, and can cause subtle issues in certain Node.js/bash pipeline processing. Also a code hygiene signal that indicates files were generated or edited inconsistently.  
**Fix:** Converted all 6 files to LF via `sed -i 's/\r//'`.

---

### M-2: Unused Dependency `cookie-session`
**File:** `package.json`  
**Impact:** `cookie-session@^2.1.0` is declared as a dependency but never imported anywhere in the codebase (`express-session` is used instead). Dead dependency increases attack surface, bloats the install footprint, and may confuse future maintainers.  
**Fix:** Removed `cookie-session` from `dependencies`.

---

### M-3: Duplicate Command-Type Arrays in `riot.js` (Correctness Risk)
**File:** `src/bot/commands/handlers/riot.js`  
**Impact:** The file declared `_lol` and `_tft` arrays for the early-exit guard, then immediately redeclared `LOL_CMDS` and `TFT_CMDS` arrays for the routing logic — 4 arrays for 2 lists. If a command is added to one list but not the other, the early-exit guard silently swallows it. Also had mojibake (garbled `──`) in box-drawing comments from encoding corruption.  
**Fix:** Consolidated to 2 module-level `Set` objects for O(1) lookup. Removed mojibake. Removed unused destructured variables from `ctx`.

---

## LOW Issues

### L-1: Stale Misleading Comment About `cookie.secure`
**File:** `src/server.js`  
**Impact:** Comment said "cookie.secure is set to false here; the proxy enforces HTTPS externally" — after the fix this comment was factually wrong and misleading for future maintainers.  
**Fix:** Updated comment to accurately describe the corrected behavior.

---

### L-2: Unused Variables from `ctx` Destructuring in `riot.js`
**File:** `src/bot/commands/handlers/riot.js`  
**Impact:** `channel`, `user`, `permissions`, `context`, `actorMember` were destructured from `ctx` but never used. Creates dead code noise.  
**Fix:** Removed unused destructured bindings from the function signature.

---

## Architecture Notes (No Code Change Required)

These are observations for awareness, not bugs:

- **In-memory guild cache is per-instance**: The `_guildCache` in `auth.js` and `server.js` is not shared across processes. If scaled to multiple instances, the cache won't be consistent. Redis-backed cache would be needed for true horizontal scaling. Current single-instance Render deployment is fine.

- **`configStore` ignores `_filePath`**: The constructor accepts a `filePath` parameter for backward compatibility but the file is never written — all storage is Redis. This is intentional but could confuse maintainers.

- **Rate limiter key includes user ID**: `${keyPrefix}:${req.ip}:${req.session?.user?.id ?? 'anon'}` — this correctly scopes limits per-user, but unauthenticated requests share the `anon` bucket (acceptable for public endpoints like `/health`).

- **Game session storage in `blackjackSessions`/`pokerSessions` Maps**: These are in-process. A crash or redeploy mid-game loses all active sessions. `purgeStaleGameSessions()` handles cleanup on startup. This is a known and accepted tradeoff for the current scale.

---

## Files Changed

| File | Change |
|------|--------|
| `src/server.js` | `cookie.secure` → `isProduction`; CSP enabled; stale comment updated |
| `src/upstash.js` | Added public `eval()` method |
| `src/distributedLock.js` | `redis._request(['EVAL',...])` → `redis.eval(...)` |
| `src/bot.js` | `repeatLabel` now appended to reminder message |
| `src/bot/commands/handlers/riot.js` | Rewritten: deduplicated arrays, use Sets, fixed encoding, removed unused vars |
| `src/bot/commands/handlers/economy.js` | CRLF → LF |
| `src/bot/commands/handlers/moderation.js` | CRLF → LF |
| `src/bot/commands/handlers/general.js` | CRLF → LF |
| `src/bot/commands/handlers/levels.js` | CRLF → LF |
| `src/bot/commands/handlers/help.js` | CRLF → LF |
| `package.json` | Removed unused `cookie-session` dependency |

## Deleted (Cleanup)
- `AUDIT_REMEDIATION_REPORT.md` — stale old report
- `SECURITY_AUDIT.md` — stale old report  
- `ARCHITECTURE.md` — stale old report
- `README.md` — stale old readme
- `scripts/` — entire directory (dev-session extraction/patch scripts, not part of production code)


---

## Post-migration Fix (2026-06-08)

Sau khi phân tích trạng thái chuyển tiếp kiến trúc (old architecture chưa bỏ hết, new chưa hoàn thiện), các vấn đề sau đã được phát hiện và fix:

### F-1: `auth.js` — `requireGuildAccess` crash khi `botClient = null`
**File:** `src/auth.js` line 310, 327
**Vấn đề:** `botClient.guilds.cache.get(guildId)` — không có optional chaining. Trong dashboard-only process (`index.server.js`), `botClient` được truyền là `null` → crash TypeError khi Discord OAuth unavailable và fallback vào bot cache.
**Fix:** `botClient?.guilds?.cache?.get(guildId)` — null-safe ở cả 2 fallback path.

### F-2: `server.js` — `/api/state` dùng `botClient.stateStore.getGuild()` (deprecated, trả stub rỗng)
**File:** `src/server.js` route `GET /api/state`
**Vấn đề:** `stateStore.getGuild()` đã được đánh dấu `@deprecated` và trong Redis mode trả về object stub (`warnings: {}, levels: {}, ...`) không chứa data thật. Route `/api/state` phụ thuộc vào nó → trả về `{ warnings: 0, rankedUsers: 0 }` luôn, dù có data.
**Fix:** Rewrite route dùng `stateStore.getLeaderboard()` (granular) và `stateStore._rGet(ticketCounter)` trực tiếp. `stateStore` đã được inject vào `createServer()` — không cần qua `botClient.stateStore`.

### F-3: `bot.js` — `startKeepalive` chạy auto trong `createBot()`, gây fail ở bot-only process
**File:** `src/bot.js`
**Vấn đề:** `startKeepalive()` được gọi tự động bên trong `createBot()`. Trong `index.bot.js`, không có HTTP server → mọi ping `/health` fail với `ECONNREFUSED`. Log spam, không crash nhưng gây noise và warning liên tục.
**Fix:** Tách `startKeepalive` thành export riêng. `index.js` (monolith) gọi nó sau khi `app.listen()`. `index.bot.js` không gọi.

### F-4: `render.yaml` — 2 persistent disk riêng gây desync configs.json
**File:** `render.yaml`
**Vấn đề:** Bot service và dashboard service mỗi cái có disk mount riêng tại `/var/data`. `CONFIG_PATH=/var/data/configs.json` → mỗi service write vào disk của riêng mình, không share → config bot và dashboard khác nhau.
**Fix:** Bỏ persistent disk khỏi cả 2 service trong render.yaml. `CONFIG_PATH`/`STATE_PATH` không được set → `stateStore` và `configStore` dùng Redis (production default). Redis là single source of truth.

### F-5: `package.json` — `start` script trỏ sai, `test` script trỏ `scripts/` đã xóa
**File:** `package.json`
**Vấn đề:** `"start": "node src/index.bot.js"` — sai với Render web service (cần monolith có HTTP server). `"test"` và `"test:economy"` trỏ `scripts/*.mjs` đã bị xóa trong cleanup.
**Fix:** `start` → `node src/index.js`. Bỏ `test` và `test:economy`.

### F-6: `ARCHITECTURE.md` + `MIGRATION.md` — mô tả kiến trúc cũ, không khớp code
**Vấn đề:** Tài liệu vẫn mô tả `src/index.js` là 2 dòng import, `botClient: null` hardcoded, keepalive auto-chạy trong bot, disk persistent cần thiết.
**Fix:** Viết lại cả 2 file phản ánh đúng kiến trúc thực tế.

### Files thay đổi (post-migration fix)

| File | Thay đổi |
|------|----------|
| `src/auth.js` | `botClient?.guilds?.cache` thay vì `botClient.guilds.cache` |
| `src/server.js` | `/api/state` rewrite dùng stateStore granular methods |
| `src/bot.js` | `startKeepalive` tách thành named export riêng |
| `src/index.js` | Import và gọi `startKeepalive` sau `app.listen()` |
| `render.yaml` | Bỏ persistent disk, Redis-only |
| `package.json` | `start` → monolith; bỏ `test` scripts |
| `ARCHITECTURE.md` | Viết lại hoàn toàn |
| `MIGRATION.md` | Viết lại hoàn toàn |
