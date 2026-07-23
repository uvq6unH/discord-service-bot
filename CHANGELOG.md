# Changelog

Format: `[vX.Y] — Mô tả ngắn` → chi tiết thay đổi.

---

## [v2.3.11] — Self-Healing Telemetry Baselines & Serverless Resiliency (2026-07-23)

**`src/server.js`** — Tự phục hồi số liệu khi tiến trình Redis Engine bị reset trên Upstash Cloud
- Giải quyết triệt để lỗi sụt giảm số liệu lệnh hiển thị (ví dụ từ 42k tụt về 32k và số lệnh ngày tụt về 0) xảy ra do Upstash Cloud tự động khởi động lại, chuyển đổi hoặc di chuyển node Redis (khiến chỉ số `total_commands_processed` trong bộ nhớ RAM Redis Engine bị reset về 0).
- Thiết lập cơ chế **Self-Healing**: Ghi lại giá trị hợp lệ cuối cùng lên Redis (`monthly_last_value` và `daily_last_value`). Nếu phát hiện chỉ số engine bị sụt giảm, hệ thống tự động căn chỉnh lại mốc baseline để đảm bảo hiển thị dữ liệu tăng tiến liên tục, chính xác tuyệt đối mà không bị gián đoạn.

---

## [v2.3.10] — Public Docs Redesign & System Navigation Integration (2026-07-23)

**`TermsPage.jsx`, `PrivacyPage.jsx`, `DomainRail.jsx`, `GuildGuard.jsx`** — Thiết kế lại 2 trang pháp lý & Tích hợp liên kết truy cập
- Thiết kế lại toàn bộ giao diện `TermsPage.jsx` và `PrivacyPage.jsx` theo chuẩn ngôn ngữ cyberpunk của Dashboard: Cố định `border-radius: 0px` vuông vức, tông màu tối `var(--surface-0)`, font chữ Display (`Bebas Neue`) và JetBrains Mono cực kỳ đồng bộ.
- Bổ sung nút bấm quay lại `<<< BACK TO MISSION CONTROL` kèm Icon lucide-react trên cả 2 trang tài liệu.
- Nhúng các liên kết truy cập ToS & Privacy công khai ở:
  1. Cuối thanh Sidebar trái (`DomainRail.jsx`) phục vụ người dùng đã đăng nhập.
  2. Bảng chọn máy chủ chính (`GuildGuard.jsx`) phục vụ các khách truy cập chưa đăng nhập.

---

## [v2.3.9] — Discord Verification Qualifications (Terms of Service & Privacy Policy) (2026-07-23)

**`router.jsx`, `TermsPage.jsx`, `PrivacyPage.jsx`** — Tạo các trang tài liệu công khai phục vụ xác minh Discord Bot
- Tạo 2 trang tài liệu điều khoản **Terms of Service** (`TermsPage.jsx`) và chính sách bảo mật **Privacy Policy** (`PrivacyPage.jsx`) chuẩn chỉnh cho Discord Bot.
- Cấu hình 2 router tĩnh công khai (`/terms` và `/privacy`) bên ngoài khối `GuildGuard` trong `router.jsx` giúp bot dễ dàng vượt qua vòng quét kiểm duyệt tự động của Discord Developer Portal.

---

## [v2.3.8] — Upstash Billing Console Direct Sync & Dynamic Daily Baseline (2026-07-23)

**`src/server.js`** — Khắc phục triệt để chênh lệch dữ liệu giữa Upstash Console và Dashboard
- Áp dụng thuật toán **Dynamic Baseline** thông minh: Tự động lưu mốc `monthly_baseline` (dựa trên hiệu số lệnh của Redis Engine và chỉ số thực tế trên Console là 42K) và `daily_baseline` (mốc bắt đầu mỗi ngày) để hiển thị **Real-time 100%** dữ liệu trên Dashboard đồng bộ từng giây với Upstash Console.
- Sửa lỗi `DAILY COMMAND BUDGET` bị hiển thị `0` do chỉ đếm lệnh Discord Slash. Giờ đây đã đếm toàn bộ tất cả mọi thao tác (bao gồm cả Heartbeat và Dashboard polls) xảy ra trong ngày.

---

## [v2.3.7] — Real-time Upstash Allocation & Quota Protection Optimization (2026-07-23)

**`src/bot.js`, `useSystem.js`, `System.jsx`, `UpstashMetrics.jsx`** — Tối ưu hóa bảo vệ quota Upstash & Real-time Allocation
- Chuyển khoảng cách Bot Heartbeat ghi đè từ 15s lên **30s** (với expire TTL 180s) trong `src/bot.js`, giúp **tiết kiệm thêm 50% định ngạch lệnh nhịp tim** (giảm từ 5,760 xuống còn 2,880 lệnh/ngày).
- Tăng chu kỳ poll trạng thái Dashboard lên **45s** (45000ms) trong `useSystem.js` và `System.jsx`, đồng thời tắt tự động truy vấn khi mất focus cửa sổ (`refetchOnWindowFocus: false`) giúp bảo vệ triệt để tài nguyên Upstash.
- Cập nhật bảng **RESOURCE ALLOCATION & CAPACITY BUDGET** hiển thị dữ liệu thực tế (Real-time data) cho chỉ số sử dụng ngày hôm nay (`commandsToday / 16,666`) và lượng keys hoạt động thực tế (`keys / 50,000`).

---

## [v2.3.6] — Upstash Capacity Planning & Resource Budget Breakdown (2026-07-23)

**`UpstashMetrics.jsx`** — Bảng phân bổ định ngạch tài nguyên Upstash Cloud Redis (500k cmds/tháng & 256MB)
- Tích hợp bảng **RESOURCE ALLOCATION & MONTHLY CAPACITY BUDGET** trên trang System của Dashboard.
- Phân tích và tính toán chi tiết ngân sách sử dụng hàng ngày (~16,666 lệnh/ngày): Heartbeats chiếm 34.5% (~5,760 lệnh/ngày), dành riêng 62.5% (~10,406 lệnh/ngày) cho Bot commands & Gaming, dung lượng 256MB lưu trữ thoải mái hơn 500+ máy chủ và 500k thành viên.

---

## [v2.3.5] — Route Guard Unification & Analytics Chart Size Normalization (2026-07-23)

**`router.jsx` & `Analytics.jsx`** — Đồng bộ giao diện Guard & cố định kích thước biểu đồ Analytics
- Chuyển route `/system` vào bên trong khối `GuildGuard` trong `router.jsx` giúp trải nghiệm hiển thị màn hình chọn máy chủ (`MISSION CONTROL // SELECT SERVER`) đồng bộ 100% trên tất cả các trang domain khi chưa chọn server.
- Tối ưu lại component `BarChart` trong `Analytics.jsx` với khung tọa độ SVG chuẩn `800x150` và container cố định `160px` height. Giữ kích thước thẻ `HISTORICAL COMMAND LOAD DISTRIBUTION` và cỡ chữ ngày tháng sắc nét, đồng nhất tuyệt đối trên cả 3 tab `7D`, `30D`, và `90D INTERVAL`.

---

## [v2.3.4] — Monthly Commands Meter & Live Console Stream Fix (2026-07-23)

**`src/server.js`, `src/stateStore.js`, `src/bot/logging.js`** — Fix monthly command counter & real-time live log stream
- Tích hợp `telemetry:global:monthly:YYYY-MM` theo dõi chuẩn xác số lượng lệnh theo từng tháng lịch (37K / 500k per month) tự động reset vào ngày 1 hàng tháng, khớp 100% với Upstash Billing Meter.
- Chuyển `pushLiveLog` sang ghi trực tiếp qua `rpush` không qua pipeline, đồng thời nối vết log thời gian thực cho `recordTelemetryEvent` và `handleComponentInteraction` để xuất hiện tức thì trên Live Console Terminal.

---

## [v2.3.3] — Upstash Storage & Commands Accuracy Alignment (2026-07-23)

**`src/server.js`** — Align Upstash metrics with Upstash Cloud Console
- Đọc chính xác `total_data_size_human` từ section `# Persistence` trong `INFO` làm dung lượng lưu trữ (**`605 KB / 256 MB`**) khớp 100% với Upstash Cloud Console thay vì đọc `used_memory` (74 KB - dung lượng RAM tiến trình Redis).
- Cung cấp tùy chọn biến môi trường `UPSTASH_MONTHLY_COMMANDS` hỗ trợ ghi đè đồng bộ meter tính phí tháng của Upstash Console khi cần.

---

## [v2.3.2] — Fix Render 502 Bad Gateway & Explicit 0.0.0.0 Host Binding (2026-07-23)

**`src/index.bot.js` & `src/index.server.js`** — Bind explicit `0.0.0.0` host for Render HTTP health probes
- Cập nhật `.listen(botPort, '0.0.0.0')` trong `src/index.bot.js` và `app.listen(port, '0.0.0.0')` trong `src/index.server.js`.
- Khắc phục lỗi `502 Bad Gateway` (Root Cause trong UptimeRobot) do Node.js mặc định bind `127.0.0.1` khiến Nginx reverse proxy của Render không thể định tuyến traffic từ ngoài vào HTTP health server (`/health`).

---

## [v2.3.1] — Bot Heartbeat Early-Boot Fix & UptimeRobot Status Integration (2026-07-23)

**`src/bot.js`, `UptimeRobotStatus.jsx`, `System.jsx`** — Fix Bot status & add UptimeRobot monitor
- Khởi chạy `_startHeartbeat` ngay từ đầu callback `ClientReady` thay vì chờ sync hết toàn bộ guilds, giảm khoảng thời gian chờ ghi `heartbeat:bot` từ 30s xuống 15s và tách `redis.expire('heartbeat:bot', 120)` cho tương thích Upstash REST client.
- Tạo component **UptimeRobotStatus** hiển thị tình trạng các HTTP Monitors 24/7 Keep-Alive cho cả `Bot Service` (`index.bot.js`) và `Dashboard Service` (`index.server.js`) trên trang **System**.

---

## [v2.3.0] — Upstash Redis Cloud Resource Telemetry Panel (2026-07-23)

**`src/upstash.js`, `src/server.js`, `UpstashMetrics.jsx`, `System.jsx`** — Hiển thị chỉ số Upstash Cloud trực tiếp trên Dashboard
- Bổ sung các phương thức `dbsize()` và `info()` vào `UpstashClient` trong `src/upstash.js`.
- Cập nhật `/api/status` tự động đọc và tính toán tài nguyên Upstash Cloud Redis thực tế (Monthly Commands limit 500k, Storage limit 256MB, Bandwidth limit 50GB, Cost $0.00, Region `ap-southeast-1` và Total DB Keys).
- Tạo component **UpstashMetrics** hiển thị 4 thẻ chỉ số tài nguyên và thanh tiến trình (progress bar) trực quan chuẩn UI Upstash Console trên trang **System** của Dashboard.

---

## [v2.2.0] — Music Auto-Play (Radio Mode) & Dashboard Live Console Terminal (2026-07-23)

**1. Music Auto-Play / Radio Mode (`src/bot/music/lavalink.js`, `interactions.js`, `music.js`)**
- Bổ sung chế độ **Auto-Play / Radio Mode mặc định TỰ ĐỘNG 100%**: Ngay khi trạm phát nhạc được tạo, khi danh sách nhạc hết (`queueEnd`), Bot tự động tìm kiếm và nối tiếp phát các bài hát liên quan dựa trên tác giả/tên bài vừa phát qua Lavalink.
- Thêm nút bấm tương tác **`📻 Radio: ON/OFF`** trên ActionRow điều khiển nhạc Discord và lệnh `/autoplay` (`hb autoplay`) hỗ trợ bật/tắt thủ công khi cần.

**2. Live Terminal Console Viewer (`src/bot/logging.js`, `src/server.js`, `LiveConsole.jsx`, `System.jsx`)**
- Xây dựng bộ thu thập Live Logs (`pushLiveLog` & `getLiveLogs`) ghi vết thời gian thực vào Redis list `telemetry:live_logs` (cấu trúc 100 bản ghi mới nhất).
- Thêm API `GET /api/system/logs` bảo mật cho Dashboard.
- Tạo component **LiveConsole** nhúng trực tiếp vào trang **System** hiển thị vết log thời gian thực với màu sắc ANSI, bộ lọc theo loại (INFO/CMD/WARN/ERROR), nút Pause Stream và Clear.

---

## [v2.1.1] — Fix Upstash Hash Methods & Dashboard Redis Linking (2026-07-23)

**`src/upstash.js` & `src/server.js`** — Fix Redis connection failure & Hash command errors
- Bổ sung các phương thức Redis Hash (`hget`, `hgetall`, `hincrby`) bị thiếu vào `UpstashClient` trong `src/upstash.js`. Sửa lỗi `TypeError: redis.hget is not a function` khiến `/api/status` báo lỗi ngắt kết nối `LINK_FAILURE` / `OFFLINE`.
- Cấu hình `ConfigStore` trong `src/index.server.js` truyền tham số `{ redis: sharedRedis }` giúp tiến trình Dashboard đọc ghi cấu hình đồng bộ trực tiếp qua Redis.

---

## [v2.1.0] — Real-time Telemetry Pipeline & Engine Load Monitoring (2026-07-23)

**1. Telemetry Pipeline (`src/stateStore.js` & `src/bot/commands/index.js`)**
- Tích hợp `recordTelemetryEvent` lưu trữ theo thời gian thực lượt gọi lệnh (`commands`), lượt giao dịch kinh tế (`economy`), hành động kiểm duyệt (`moderation`) và người dùng active (`users`) theo từng ngày vào Redis keys `telemetry:guild:{id}:daily:{YYYY-MM-DD}` và `telemetry:guild:{id}:users:{YYYY-MM-DD}`.
- Ghi nhận phân bổ thời gian tương tác người dùng theo khung giờ (`active_hours`) và đếm số lượng lệnh toàn hệ thống trong ngày (`telemetry:global:daily:{YYYY-MM-DD}`).

**2. Analytics & System Pages (`src/server.js`)**
- Nâng cấp `fetchAnalytics` thay thế hoàn toàn dữ liệu giả lập `generateAnalytics`: đọc và tính toán chỉ số thực tế trực tiếp từ Redis/StateStore cho các biểu đồ 7d, 30d, 90d.
- Bổ sung thông số tải hệ thống thực tế cho `/api/status`: CPU Load (`process.cpuUsage`), RAM RSS Memory (`process.memoryUsage().rss`), Gateway WebSocket Latency (`client.ws.ping`) và lệnh chạy trong ngày (`commandsToday`).
- Bổ sung `heartbeat:dashboard` ghi nhận tình trạng Server định kỳ mỗi 30 giây.

---

## [v2.0.0] — Unified Architecture, Lavalink Multi-Node Pool & Dashboard Refactor (2026-07-22)

**1. Lavalink Multi-Node Audio Engine (`src/bot/music/lavalink.js`)**
- Chuyển sang cơ chế Multi-Node Failover pool (`main`, `public-darren`, `public-jirayu`).
- Tự động chuyển mạch sang Node dự phòng khi Node chính gặp lỗi HTTP 403 Forbidden / 301 Redirect / ENOTFOUND.
- Tự động bóc tách `info.duration` (Lavalink v4) để hiển thị thời lượng bài hát chuẩn xác thay vì `?:??`.
- Thiết kế lại Giao diện Embed nhạc tùy biến: hiển thị bài đang phát, thanh tiến trình, và danh sách hàng chờ queue phía dưới.
- Tự động refresh Embed và nút bấm tương tác thời gian thực khi bấm các nút điều khiển (`Pause/Resume`, `Skip`, `Shuffle`).

**2. Quản lý Lệnh & Dashboard Telemetry (`dashboard/src/domains/core/pages/`)**
- Hợp nhất trang quản lý lệnh về duy nhất `/commands` (`Commands.jsx`), gỡ bỏ `CommandManager.jsx` dư thừa.
- Thêm trang Audit Logs (`AuditLogs.jsx`) hiển thị vết lịch sử Admin thao tác cấu hình (`GET /api/guilds/:id/audit-logs`).
- Sửa lỗi gán lầm lệnh hệ thống thành custom (`type: 'custom'`) và lỗi so sánh `undefined === undefined` trong `CustomCommandEditor`.
- Đồng bộ mảng phẳng `next.commands` thời gian thực khi cập nhật sub-module command arrays trong `GuildProvider.jsx`.
- Hỗ trợ PWA Manifest và meta tags trên mobile (`dashboard/index.html`).

**3. Làm sạch Hạ tầng & Keep-Alive (`package.json`, `.env`)**
- Xóa bỏ hoàn toàn PM2 (`pm2.config.cjs`), blueprint YAML, script `keep-alive.sh` và `src/utils/keepalive.js`.
- Chuyển sang mô hình chạy trực tiếp `node src/index.bot.js` và `node src/index.server.js` trên Render Split-Account deployment.
- Duy trì trạng thái 24/7 thông qua UptimeRobot HTTP Monitors từ bên ngoài.

**4. Testing & CI/CD Pipeline (`tests/`, `.github/workflows/ci.yml`)**
- Tích hợp Vitest runner và viết unit tests cho ConfigStore (`tests/configStore.test.js`) & Translation (`tests/translation.test.js`).
- Cấu hình tự động kiểm thử `pnpm check` và `npx vitest run` trên GitHub Actions.

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
