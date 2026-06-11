# Changelog

Format: `[vX.Y] — Mô tả ngắn` → chi tiết thay đổi.

---

## [v1.7.0] — Dashboard refactor: bug fixes + light theme

**`dashboard/src/contexts/GuildContext.jsx`** — fix race condition khi switch guild nhanh
- Thêm `fetchIdRef` (useRef counter) để track fetch in-flight
- Nếu user click guild B trong khi đang fetch guild A: kết quả của fetch A bị bỏ qua, không ghi đè config của guild B đang hiển thị
- `setConfigLoading(false)` cũng chỉ chạy nếu fetch còn valid — tránh spinner stuck

**`dashboard/src/pages/System.jsx`** — fix CSS token mismatch (broken UI)
- Thay toàn bộ `var(--color-success/danger/warning/muted/text/border/surface-2/radius-md)` bằng token đúng từ `globals.css`:
  - `--color-success` → `--green`
  - `--color-danger` → `--red`
  - `--color-warning` → `--yellow`
  - `--color-muted` → `--text-3`
  - `--color-text` → `--text-1`
  - `--color-border` → `--border`
  - `--color-surface-2` → `--surface-2`
  - `--radius-md` → `--r3`
- Status dots, text màu và card backgrounds trong System page giờ render đúng

**`dashboard/src/pages/Members.jsx`** — debounce search + BigInt guard
- `handleSearch` trước đây gọi `load()` mỗi keystroke (1 HTTP request/ký tự)
- Đổi sang debounce 300ms dùng `useRef` timer — giảm ~90% API calls khi gõ nhanh
- Cleanup timer khi unmount tránh memory leak
- `BigInt(member.id)` throw nếu id là undefined/non-numeric → wrap trong try/catch, fallback về index 0

**`dashboard/src/pages/Overview.jsx`** — fix timezone bug trong ReminderEditor
- `new Date(...).toISOString().slice(0, 16)` trả về UTC string → datetime-local input hiển thị sai giờ
- Đổi sang `localISOString()` helper tính theo local timezone của user
- Cũng fix `var(--color-warning)` / `var(--color-muted)` → `--yellow` / `--text-3`

**`dashboard/src/api.js`** — CSRF retry thông minh hơn
- Retry CSRF trước đây chạy mù khi bất kỳ 403 nào — kể cả 403 do `requireGuildAccess` (thiếu quyền guild)
- Đổi sang đọc response body: chỉ retry khi error message match `/csrf/i`
- User thiếu quyền giờ thấy error ngay sau 1 request thay vì 2

**`dashboard/src/styles/globals.css`** — thêm light theme
- Thêm token set đầy đủ cho light mode trong `@media (prefers-color-scheme: light)` — tự động theo OS
- Thêm class override `.theme-light` / `.theme-dark` cho toggle thủ công bằng JS
- Thêm CSS class `.theme-toggle` cho nút toggle
- `--shadow-*` tokens mới: dark dùng shadow nặng, light dùng shadow nhẹ — dùng thống nhất trong save-bar, modal, login card
- `datetime-local` color-scheme giờ theo theme thay vì hardcode `dark`
- Select arrow stroke đổi sang `#888899` — hoạt động tốt cả hai theme
- Thêm `color-scheme: dark` cho `html.theme-dark` để browser chrome (scrollbar, input) match
- Bỏ import Google Fonts Inter không dùng (file đã dùng Geist)

---


**`src/bot.js`** — fix `commandCooldowns` scope
- `CommandCooldowns` instance được tạo ở module scope (ngoài factory) → tất cả bot instance trong cùng process share chung cooldown state
- Chuyển vào bên trong `createBot()` → mỗi instance có tracker riêng, dễ unit test (inject mock, assert state)

**`src/server.js`** — thêm validation layer ở `PUT /api/config`
- Trước: validation chỉ check array length; type error được configStore handle ngầm (không có error message rõ ràng cho client)
- Sau: validate type của array fields, string fields, và numeric range (`xpPerMessage 1–100`, `dailyCooldownHours 1–168`) ở API layer — client nhận `400` với message cụ thể thay vì lỗi generic
- configStore vẫn là source of truth cho sanitization — API layer chỉ fail fast với lỗi rõ ràng

---

## [v1.5.2] — Patch: fix race condition rate limit + anti-link regex + build env

**`src/rateLimit.js`** — fix race condition quan trọng
- `INCR` + `EXPIRE` tách biệt → thay bằng Lua script atomic: nếu crash giữa 2 lệnh, key không còn sống mãi không có TTL
- `Retry-After` header giờ dùng TTL thực của key (`redis.ttl()`) thay vì luôn trả `windowMs` cố định

**`src/bot/autoMod.js`** — fix anti-link regex quá broad
- Regex cũ `/https?:\/\//i` match cả URL không có domain (false-positive)
- Regex mới `/https?:\/\/\S+\.\S+/i` yêu cầu có domain thực sau protocol

**`package.json`**
- `build:ui`: đổi `NODE_ENV=development` → `NODE_ENV=production` — Vite giờ tree-shake đúng

---



**`src/rateLimit.js`** — fix race condition quan trọng
- `INCR` + `EXPIRE` tách biệt → thay bằng Lua script atomic: nếu crash giữa 2 lệnh, key không còn sống mãi không có TTL
- `Retry-After` header giờ dùng TTL thực của key (`redis.ttl()`) thay vì luôn trả `windowMs` cố định

**`src/bot/autoMod.js`** — fix anti-link regex quá broad
- Regex cũ `/https?:\/\//i` match cả URL không có domain (false-positive)
- Regex mới `/https?:\/\/\S+\.\S+/i` yêu cầu có domain thực sau protocol
- `discord.gg/` pattern cũng được tighten: phải có path sau slash

**`package.json`**
- `build:ui`: đổi `NODE_ENV=development` → `NODE_ENV=production` — Vite giờ tree-shake đúng, bundle nhỏ hơn

---

## [v1.5.1] — Patch: fix comment delay sai + CHANGELOG đầy đủ

**`src/upstash.js`**
- Comment delay sửa thành `// 200ms (attempt=0) → 400ms (attempt=1)` — trước đó ghi sai `800ms` (chỉ đạt được nếu `MAX_RETRIES=3`, thực tế là 2)
- Header comment cập nhật: `200 ms → 400 ms (tối đa 2 lần, MAX_RETRIES=2)`

**`CHANGELOG.md`**
- Thêm entry v1.5 đầy đủ
- Viết lại entry v1.4 với đúng nội dung (bị paste nhầm nội dung v1.3)
- Xóa block v1.4 duplicate ở cuối file

---

## [v1.5] — Patch: sửa toàn bộ vấn đề tồn đọng từ v1.4

**`src/utils/loginWithRetry.js`** _(mới)_
- Extract `loginWithRetry` ra shared utility — xóa bỏ ~20 dòng duplicate giữa `index.js` và `index.bot.js`
- Signature mới: `loginWithRetry(client, token, { maxRetries, baseDelay, logPrefix })` — `logPrefix` phân biệt log `[app:login]` vs `[bot:login]`

**`src/utils/keepalive.js`** _(mới)_
- Extract `startKeepalive` ra khỏi `bot.js` — `index.server.js` không còn kéo theo Discord client dependency graph

**`src/index.server.js`**
- Import `startKeepalive` từ `utils/keepalive.js` thay vì `bot.js` — coupling sai đã được fix

**`src/upstash.js`**
- Delay đổi thành `200 * 2^attempt` — exponential thật sự thay vì linear
- Comment header cập nhật

**`src/bot/emojiMap.js`**
- Sửa comment "Lazy-loaded" → "module-separated" kèm giải thích rõ sự khác biệt và migration path

**`src/bot/reminderWorker.js`**
- Thêm `⚠️ SINGLE-INSTANCE ASSUMPTION` block — document rõ rủi ro double-fire nếu horizontal scale

**`ADR.md`**
- Fix đánh số: ADR-006 (pipeline) → ADR-007, shift ADR-007→008, ADR-008→009
- Sửa typo "Hệg quả" → "Hệ quả"

---



**`src/utils/loginWithRetry.js`** _(mới)_
- Extract `loginWithRetry` ra shared utility — xóa bỏ ~20 dòng duplicate giữa `index.js` và `index.bot.js`
- Signature mới: `loginWithRetry(client, token, { maxRetries, baseDelay, logPrefix })` — `logPrefix` phân biệt log `[app:login]` vs `[bot:login]`

**`src/utils/keepalive.js`** _(mới)_
- Extract `startKeepalive` ra khỏi `bot.js` — `index.server.js` không còn kéo theo Discord client dependency graph

**`src/index.server.js`**
- Import `startKeepalive` từ `utils/keepalive.js` thay vì `bot.js` — coupling sai đã được fix

**`src/upstash.js`**
- Fix comment: delay là `200ms → 400ms` (không phải `200ms → 400ms → 800ms` như comment cũ ghi sai)
- Header comment cập nhật để phản ánh đúng `MAX_RETRIES=2`

**`src/bot/emojiMap.js`**
- Sửa comment "Lazy-loaded" → "module-separated" kèm giải thích rõ sự khác biệt và migration path nếu cần lazy thật

**`src/bot/reminderWorker.js`**
- Thêm `⚠️ SINGLE-INSTANCE ASSUMPTION` block — document rõ rủi ro double-fire nếu horizontal scale, để lại migration path (`withRedisLock`)

**`ADR.md`**
- Fix đánh số: ADR-006 (pipeline) → ADR-007, ADR-007 → ADR-008, ADR-008 → ADR-009
- Sửa typo "Hệg quả" → "Hệ quả" trong ADR-008
- Cập nhật nội dung ADR-007 và ADR-008 phản ánh các fix trong v1.5

---

## [v1.4] — Refactor: tách module bot.js + fix game session loss

**`src/bot.js`** — giảm từ 687 → 486 dòng
- Tách `reminderWorker.js`, `xpHandler.js`, `autoMod.js`, `emojiMap.js` ra `src/bot/`
- Pipeline MessageCreate rõ ràng: `runAutoMod → runMentionReact → music → prefix → handleXp → autoReply`

**`src/upstash.js`** — rewrite
- Đổi `https.request` → `fetch` + `AbortController` (~30 dòng ít hơn)
- Thêm `ttl()`, `keys()`, `srem()` — cần cho purge game sessions
- Retry: fixed delay → pseudo-exponential (200ms → 400ms)

**`src/distributedLock.js`**
- Đổi fixed 25ms polling → exponential backoff `50ms → 75ms → ... → 400ms`
- Giảm ~8–13× Upstash requests khi nhiều operation tranh lock đồng thời

**`src/stateStore.js`** — fix lỗi quan trọng
- `setGameSession()` thêm `EX 10800` (3 giờ TTL) — trước đây sessions tồn tại mãi khi bot crash
- `purgeStaleGameSessions()` Redis branch implement đầy đủ thay vì TODO no-op — refund bet khi bot restart

**`src/server.js`**
- 2 Map cache riêng biệt (`_guildCache`, `_guildDataCache`) → 1 unified `_memCache` với namespace key
- Prune interval `.unref()` để tránh memory leak

**`src/index.js` / `src/index.bot.js`**
- `loginWithRetry`: string match `err.message` → `TRANSIENT_CODES` Set + `err.status >= 500 || 429`

---

## [v1.3] — Riot API puuid migration + Documentation freeze

**Bot (`src/bot.js`):**
- `heartbeat:bot` — ghi Redis mỗi 30 s, TTL 90 s, payload `{ ts, uptimeS, guilds, ready }`
- Stats counters: `stats:slash_sync_processed`, `stats:guild_cache_refresh`, `stats:discord_errors`

**Dashboard (`src/server.js`):**
- `heartbeat:dashboard` — ghi Redis mỗi 30 s
- `GET /api/status` — trả về bot/dashboard online status + stats + `slashQueueLength`

**Dashboard UI (`src/pages/System.jsx`):**
- System page mới: bot/dashboard online indicator, uptime, heartbeat age, slash queue length, stats counters

---

## [v1.1] — Slash Sync Queue + Members Key Split

**Slash sync queue (`src/bot.js`, `src/server.js`):**
- `POST /api/slash-sync` → `rpush slash_sync_queue { guildId, requestedAt }` (thay vì 503 khi botClient null)
- Bot poll `lpop slash_sync_queue` mỗi 5 s
- Monolith mode: sync trực tiếp, bỏ qua queue

**Members key split (`src/bot.js`):**
- `guild_cache:{guildId}` — không còn chứa `members[]`
- `guild_cache:{guildId}:members` — key riêng, TTL riêng
- Tránh giới hạn 1 MB của Upstash REST trên guild lớn

**Dashboard (`src/server.js`):**
- `GET /api/members` đọc `guild_cache:{guildId}:members` thay vì botClient
- `GET /api/guild-data` đọc `guild_cache:{guildId}` (meta only)

---

## [v1.0] — Split Architecture + Guild Cache Layer

**Kiến trúc:**
- Tách monolith (`src/index.js`) thành 2 process:
  - `src/index.bot.js` — Discord client
  - `src/index.server.js` — Express dashboard
- Giao tiếp qua Upstash Redis (không có direct IPC)

**Guild cache (`src/bot.js`):**
- Bot ghi `guild_cache:{guildId}` khi `ClientReady`, `GuildCreate`, `GuildUpdate`, và mỗi 10 phút
- Dashboard đọc cache — không còn phụ thuộc `botClient.guilds.cache`

**Redis-first data layer:**
- `ConfigStore` — config lưu Redis, JSON file chỉ là local-dev fallback
- `StateStore` — state lưu Redis (economy, levels, warnings, tickets, games)
- `UpstashSessionStore` — sessions lưu Redis thay vì memory

**Auth (`src/auth.js`):**
- `requireGuildAccess` dùng optional chaining `botClient?.guilds?.cache` — null-safe

**Infra:**
- `render.yaml` — 3 services: discord-bot, discord-dashboard, lavalink
- `pm2.config.cjs` — 2 processes, memory limits, log rotation
- `src/distributedLock.js` — Redis-based distributed lock (Lua atomic)
- `src/asyncMutex.js` — in-process fallback cho local dev
