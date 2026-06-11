# Architecture Decision Records

> Tài liệu này ghi lại các quyết định kiến trúc quan trọng: lý do chọn, lý do không chọn phương án khác, và hệ quả lâu dài.  
> Khi sau này tự hỏi "tại sao lại làm vậy?" — đọc ở đây trước.

---

## ADR-001 — Redis-first persistence (không dùng file storage)

**Quyết định:** Mọi persistent state (config, economy, levels, sessions, locks) lưu trong Upstash Redis. File JSON (`data/configs.json`, `data/state.json`) chỉ là local-dev fallback khi Redis không có.

**Lý do chọn Redis:**
- Render.com không có persistent disk trên plan thấp, và disk không thể share giữa 2 service
- Redis cho phép cả bot và dashboard đọc/ghi cùng một data mà không cần IPC
- Atomic operations (`SET`, `INCR`, `EVAL` Lua) tự nhiên hơn file locking
- TTL built-in cho sessions, cache, locks — không cần cleanup job

**Lý do không dùng file:**
- File không share được giữa 2 process trên Render (ephemeral filesystem)
- File locking phức tạp khi scale hoặc khi 2 process cùng ghi
- Restart mất state nếu không flush đúng lúc

**Hệ quả:**
- `CONFIG_PATH` và `STATE_PATH` env vars chỉ set khi chạy local dev
- Production: không set hai biến này — stateStore tự detect và dùng Redis
- Upstash free tier đủ dùng ở quy mô hiện tại (~512 MB, 10K req/ngày)

---

## ADR-002 — Split mode (2 process) thay vì monolith

**Quyết định:** Bot và dashboard chạy như 2 process độc lập, giao tiếp qua Redis.

**Lý do chọn split:**
- Music/voice (Lavalink) có thể gây memory leak hoặc crash — không kéo dashboard theo
- Bot có thể restart (sau Discord disconnect, rate limit, crash) mà không ngắt dashboard session người dùng
- Log tách biệt — dễ debug hơn khi chỉ một service có vấn đề
- Về lâu dài: shard-ready, scale độc lập

**Lý do không quay lại monolith:**
- Phần khó nhất của split (Redis-first, guild cache, slash queue, heartbeat) đã xong
- Quay lại monolith rồi vài tháng sau lại split = làm lại toàn bộ phần này

**Trade-off chấp nhận được:**
- Render Starter ($7/tháng/service) thay vì Free
- Deploy phức tạp hơn một chút (2 service thay vì 1)
- Cần cả hai service online để dashboard hoạt động đầy đủ

**Hệ quả:**
- `render.yaml` là canonical config cho 2 service
- Dashboard hoạt động ngay cả khi bot offline (đọc từ Redis cache)
- 503 chỉ xuất hiện khi cache lạnh VÀ bot offline cùng lúc

---

## ADR-003 — Guild cache lưu Redis thay vì fetch Discord trực tiếp từ dashboard

**Quyết định:** Bot ghi snapshot guild data (channels, roles, members) vào Redis. Dashboard đọc từ cache — không gọi Discord API trực tiếp.

**Lý do:**
- Dashboard process không có Discord token/session — không thể gọi Discord API
- Bot Gateway connection là luồng liên tục, có đầy đủ guild data trong memory
- Fetch Discord trực tiếp từ dashboard sẽ cần bot token trong dashboard process (security concern) hoặc internal HTTP call giữa 2 service (complexity)
- Cache 15 phút đủ cho use case: admin thay đổi config không cần realtime channel list

**Hai key tách biệt (ADR-003b):**
- `guild_cache:{id}` → meta (channels, roles, ~5–20 KB) — dùng cho config dropdowns
- `guild_cache:{id}:members` → members[] riêng — dùng chỉ cho member list
- Lý do tách: Upstash REST giới hạn 1 MB/request; guild lớn (~5000 members) sẽ vượt giới hạn nếu gộp

**Hệ quả:**
- Bot phải online ít nhất một lần để populate cache trước khi dashboard dùng được
- Cache có thể stale tối đa 15 phút — chấp nhận được cho config UI
- Nếu guild thêm channel mới, dashboard có thể không thấy ngay — bot refresh khi `GuildUpdate` fire

---

## ADR-004 — Slash sync dùng queue thay vì HTTP call trực tiếp

**Quyết định:** Dashboard push job vào `slash_sync_queue` Redis list. Bot poll và xử lý bất đồng bộ. Không có HTTP call trực tiếp từ dashboard → bot.

**Lý do:**
- 2 service không biết URL của nhau (Render assign URL động)
- HTTP call trực tiếp giữa 2 service cần service discovery hoặc hardcode URL — fragile
- Queue tự nhiên hơn: dashboard fire-and-forget, bot xử lý khi sẵn sàng
- Retry built-in trong bot worker (tối đa 3 lần với backoff)
- Monolith mode: queue bị bypass, sync trực tiếp — không cần code path riêng

**Hệ quả:**
- Slash sync có độ trễ tối đa 5 s (poll interval)
- Nếu bot offline, job nằm trong queue cho đến khi bot restart — không mất
- `LLEN slash_sync_queue` > 0 sau vài phút = dấu hiệu bot có vấn đề

---

## ADR-005 — Heartbeat qua Redis thay vì health endpoint polling

**Quyết định:** Mỗi service chủ động ghi heartbeat vào Redis mỗi 30 s với TTL 90 s. Dashboard đọc `heartbeat:bot` để biết bot còn sống — không poll `/health` của bot.

**Lý do:**
- Dashboard không biết URL của bot service (xem ADR-004)
- Push-based heartbeat đơn giản hơn pull-based health check giữa 2 service
- TTL 90 s = tự động "offline" nếu service crash mà không cleanup
- Bot health endpoint (`/health`) vẫn giữ để Render health check — đây là mục đích khác

**Hệ quả:**
- `botReady: false` trong `/api/status` nghĩa là `heartbeat:bot` null hoặc stale > 90 s
- Độ trễ phát hiện bot down: tối đa 90 s (TTL) + 30 s (poll interval dashboard)
- Stats counters (`stats:*`) được đọc cùng lúc với heartbeat trong `/api/status`

---

## ADR-006 — puuid làm persistent identifier cho Riot accounts (không dùng summonerId)

**Quyết định:** Lưu `puuid` trong account records. Không lưu `summonerId`.

**Lý do:**
- Riot deprecated summoner ID-based endpoints trong League-v4 và Mastery-v4 (2024)
- puuid là stable cross-region identifier — không thay đổi khi account đổi tên
- Tất cả endpoints còn active đều hỗ trợ puuid path

**Hệ quả:**
- Redis key: `guild:{id}:lolAccount:{userId}` → `{ riotId, puuid, region, linkedAt }`
- Không cần migration nếu account đổi riot ID (puuid không đổi)
- Các account đã link trước migration cần re-link nếu lưu summonerId cũ

---

## ADR-006 — Bot.js middleware pipeline (tách sub-modules)

**Quyết định:** Tách các concern trong `bot.js` (reminder, XP, automod, mention-react, emoji map) thành các module riêng tại `src/bot/`.

**Lý do:**
- `bot.js` gốc có 687 dòng, ôm quá nhiều trách nhiệm trong một file — khó test, khó đọc
- Mỗi concern (XP, reminder, automod) có state và lifecycle khác nhau: nên độc lập
- `EMOJI_MAP` hardcode 120 entries ở top-level `bot.js` → load cùng file dù không dùng tới
- Sub-modules có thể import và unit test độc lập mà không cần Discord client

**Lý do không dùng EventEmitter pattern:**
- Discord.js đã dùng EventEmitter — thêm một lớp nữa sẽ tăng complexity không cần thiết
- Các handlers đã có đủ context qua tham số — không cần global event bus
- Pipeline đơn giản (automod → mention-react → music → prefix → XP → autoReply) dễ trace hơn event bus

**Hệ quả:**
- `bot.js` còn ~220 dòng — chỉ giữ Discord event registration và wiring
- `reminderWorker.js`, `xpHandler.js`, `autoMod.js` test được mà không cần Discord client mock
- `emojiMap.js` lazy-loaded — không tốn memory khi không dùng reminder feature

---

## ADR-007 — Upstash client dùng `fetch` thay `https.request`

**Quyết định:** Rewrite `UpstashClient._request()` và `pipeline()` dùng `fetch` + `AbortController` thay vì `https.request` thủ công.

**Lý do:**
- `fetch` built-in từ Node 18+ — không cần import, ít boilerplate hơn ~60 dòng
- `AbortController` cho timeout sạch hơn `req.setTimeout` (không cần gọi `req.destroy()`)
- Retry logic gọn hơn — không cần nested callback
- Thêm được `keys()`, `ttl()`, `srem()` dễ dàng hơn

**Lý do không dùng `@upstash/redis` SDK:**
- SDK thêm ~50 KB dependency
- Custom client đủ nhỏ (~100 dòng) và cover đủ commands cần dùng
- Không muốn phụ thuộc vào SDK update/breaking change

**Hệg quả:**
- Yêu cầu Node 18+ (đã dùng sẵn)
- `keys(pattern)`, `ttl(key)`, `srem(key, members)` available → purgeStaleGameSessions() dùng được KEYS
- Exponential backoff (50 ms → 200 ms → 400 ms) thay vì fixed 200 ms/400 ms

---

## ADR-008 — Game sessions TTL trên Redis

**Quyết định:** `setGameSession()` thêm `EX 10800` (3 giờ) khi SET vào Redis. `purgeStaleGameSessions()` dùng `KEYS guild:*:game:*:*` để tìm và refund sessions còn tồn tại khi bot khởi động.

**Lý do:**
- **Trước:** Game sessions không có TTL → nếu bot crash, sessions tồn tại mãi trong Redis, bet không được refund
- **Trước:** `purgeStaleGameSessions()` Redis branch là no-op (comment "TODO")
- TTL 3 giờ đủ dài để player hoàn thành game, đủ ngắn để không chiếm Redis memory mãi mãi
- `purgeStaleGameSessions()` chạy lúc bot startup → refund ngay trước khi nhận button click mới

**Lý do không dùng SCAN:**
- Upstash REST hỗ trợ `KEYS` trực tiếp
- Số lượng active game sessions thấp (<<1000) → `KEYS` không gây performance issue
- `SCAN` cursor phức tạp hơn và không cần thiết ở quy mô này

**Hệ quả:**
- Bot restart không còn mất bet: sessions auto-expire sau 3 giờ nếu bot crash giữa chừng
- `purgeStaleGameSessions()` thực sự refund tất cả active sessions cũ khi bot startup
- Redis memory: game sessions chiếm ~1 KB/session × max vài chục sessions = negligible
