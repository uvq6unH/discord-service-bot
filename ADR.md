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
