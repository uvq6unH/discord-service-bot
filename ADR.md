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

## ADR-007 — Bot.js middleware pipeline (tách sub-modules)

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
- `emojiMap.js` tách riêng — không load vào memory khi không dùng reminder feature
- `loginWithRetry` và `startKeepalive` tách ra `src/utils/` — dùng chung giữa các entry points mà không gây coupling sai (`index.server.js` không còn import `bot.js`)

---

## ADR-008 — Upstash client dùng `fetch` thay `https.request`

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

**Hệ quả:**
- Yêu cầu Node 18+ (đã dùng sẵn)
- `keys(pattern)`, `ttl(key)`, `srem(key, members)` available → purgeStaleGameSessions() dùng được KEYS
- Exponential backoff thật sự: `200ms * 2^attempt` (200ms → 400ms → 800ms) thay vì linear (200ms → 400ms)

---

## ADR-009 — Game sessions TTL trên Redis

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

---

## ADR-010 — Phân loại Command theo Module và Tùy biến Music Command

**Quyết định:** Cấu trúc danh sách commands trong config được chia nhỏ theo từng module chuyên biệt (`core`, `moderation`, `levels`, `economy`, `riot`, `music`) thay vì lưu chung một danh mục phẳng. Riêng Music commands được cấu hình động tên và mô tả, chạy qua prefix text (`hb`) và bị loại trừ khỏi danh sách slash commands. Cho phép lưu custom command với response rỗng để nháp.

**Lý do chọn:**
- Gộp chung commands vào một chỗ làm phình to payload cấu hình và gây khó khăn khi quản trị giao diện theo từng cụm tính năng.
- Người dùng thường nhầm lẫn gọi các lệnh nhạc dạng slash (như `/play`), trong khi bot chỉ hỗ trợ chơi nhạc dạng text prefix (như `hb play`) do giới hạn kiến trúc kết nối voice. Lọc bỏ lệnh nhạc khỏi slash commands giải quyết triệt để vấn đề này.
- Khi người dùng muốn lưu nháp custom command mà chưa nghĩ ra câu trả lời, hệ thống cũ sẽ chặn hoặc xóa mất command. Cho phép lưu rỗng giúp cải thiện UX, đi kèm fallback hiển thị thông báo lỗi thân thiện khi gọi lệnh.

**Hệ quả:**
- `ConfigStore` và API layer được tái cấu trúc để normalize/sanitize config commands theo từng phân vùng module tương ứng.
- Phía bot xử lý commands động theo cấu hình tên mới được kéo về từ Redis.
- File `slash.js` loại trừ toàn bộ các lệnh nhạc khi đồng bộ slash commands với Discord API.
- Nếu template custom command trống, helper `responses.js` trả về chuỗi rỗng và bot trả lời tin nhắn cảnh báo thay vì crash hoặc gửi tin nhắn lỗi.

---

## ADR-011 — Distributed Locking (withRedisLock) via Redis and Lua

**Quyết định:** Sử dụng distributed locks dựa trên Redis (`EVAL` + Lua script) với TTL ngắn (15–30s) và cơ chế exponential backoff retry cho các thao tác ghi đồng thời nhạy cảm như Economy (cộng trừ số dư), Tickets (tăng counter number), và Game Sessions ( Blackjack/Poker/Slots). Bản monolith chạy local dev dùng `asyncMutex` làm in-process mutex fallback.

**Lý do chọn:**
- Khi chạy split mode hoặc scale ngang nhiều bot instances, các thao tác thay đổi số dư tài chính hoặc thao tác tạo ticket có thể bị race condition nếu người dùng spam click interaction buttons hoặc gọi API đồng thời.
- Cơ chế locking phân tán bằng Redis Lua script đảm bảo tính nguyên tử (atomicity) khi thay đổi dữ liệu của cùng một user/guild qua các tiến trình khác nhau.

**Hệ quả:**
- Mọi thao tác ghi đè trạng thái tài chính hoặc phiên trò chơi phải chạy qua hàm bảo vệ `withRedisLock()`.
- Thời gian chờ lock (retry backoff) được tính toán thông minh để tránh spam băng thông Upstash Redis.

---

## ADR-012 — Redis Schema Versioning & Data Migration Strategy

**Quyết định:** Quản lý phiên bản dữ liệu Redis bằng một key global `schema_version`. Sử dụng cơ chế startup checks (bot/server boot check) hoặc logic chuyển đổi tự động khi đọc/ghi dữ liệu (transparent migration) trong các lớp cổng của Data Layer (ví dụ: `getGuildConfig` tự động chuyển đổi cấu hình cũ sang định dạng phân rã module mới).

**Lý do chọn:**
- Redis là schemaless database, không có các công cụ migration schema chính quy như SQL.
- Chuyển đổi dữ liệu trực tiếp trong mã nguồn khi đọc dữ liệu giúp hệ thống nâng cấp mượt mà, không gián đoạn dịch vụ và giảm thiểu rủi ro lỗi dữ liệu cũ bị stale.

**Hệ quả:**
- Lập trình viên phải viết mã tương thích ngược và logic tự động chuyển đổi dữ liệu khi thay đổi cấu trúc key Redis.
- Tránh chạy các tác vụ migration nặng, tốn quét toàn bộ Redis (`SCAN`/`KEYS`) trên production.

---

## ADR-013 — Disaster Recovery & Backup Strategy for Upstash Redis

**Quyết định:** Sử dụng tính năng replication và daily auto-backup (giữ 7 ngày) của Upstash Pro ở production làm rào chắn an toàn chính. Cung cấp API xuất/nhập cấu hình (`GET /api/config?guildId={id}`) ra file JSON thủ công làm phương án dự phòng.

**Lý do chọn:**
- Redis là single source of truth cho toàn bộ config và state. Mất Redis tương đương mất trắng dữ liệu server.
- Sử dụng replication và snapshot tự động của cloud provider giúp giảm thiểu công sức vận hành mà vẫn đạt được RTO dưới 1 giờ và RPO dưới 24 giờ.

**Hệ quả:**
- Chi phí vận hành tăng nhẹ (Upstash Pro).
- Các key tạm thời như `guild_cache`, `heartbeat`, `slash_sync_queue` không cần backup để tối ưu hóa tài nguyên.

---

## ADR-014 — Rate Limiting & Retry Policies for Discord and Riot APIs

**Quyết định:**
- **Riot API**: Định luồng toàn bộ yêu cầu qua một hàng đợi throttle tập trung (20 req/s, 100 req/2 min - free tier) kết hợp cache in-memory 2 phút cho thông tin trận đấu/profile để giảm số lượng request.
- **Discord API**: Sử dụng cơ chế retry tự động tích hợp sẵn của Discord.js và exponential backoff trong `loginWithRetry` (tối đa 10 lần, trì hoãn tăng dần từ 5s đến 30s) đối với các lỗi mạng tạm thời hoặc Discord Gateway ngắt kết nối.

**Lý do chọn:**
- Riot API kiểm soát rate limit rất nghiêm ngặt ở free tier; việc spam request sẽ dẫn đến lỗi 429 và block API key.
- Discord API thường gặp sự cố kết nối gián đoạn tạm thời; cơ chế reconnect thông minh giúp bot tự phục hồi mà không cần can thiệp thủ công.

**Hệ quả:**
- Các lệnh gọi Riot API có độ trễ hàng đợi nhỏ khi có nhiều người dùng gọi lệnh đồng thời; bot tự động phục hồi kết nối mà không bị crash.

---

## ADR-015 — Lavalink Multi-Node Pool & Automatic Failover

**Quyết định:** Sử dụng mảng danh sách nhiều Node Lavalink v4 (`main`, `public-darren`, `public-jirayu`) trong `buildNodeConfigs()` thay vì chỉ dùng một Node đơn lẻ.

**Lý do chọn:**
- Các Lavalink Node công cộng hoặc tự host trên cloud có thể bị sập, thay đổi IP, hoặc ngắt kết nối với mã lỗi HTTP `403 Forbidden` / `301 Redirect`.
- Việc cấu hình Multi-Node cho phép `lavalink-client` v2 tự động chuyển mạch (Failover) sang Node dự phòng đang hoạt động mà không làm sập tiến trình Bot hoặc ngắt tính năng nghe nhạc.

**Hệ quả:**
- Tính năng phát nhạc (`/play`, `/skip`, `/stop`...) đạt độ sẵn sàng cao.
- Khi Node chính bị ngắt, Bot tự động dùng Node tiếp theo trong danh sách mà không ảnh hưởng tới người dùng Discord.

---

## ADR-016 — Hợp nhất Quản lý Lệnh (Unified Commands Hub) & Nhật ký Audit Logs

**Quyết định:** Hợp nhất giao diện quản lý lệnh về một trang duy nhất [Commands.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/domains/core/pages/Commands.jsx) (`/commands`), loại bỏ file `CommandManager.jsx` dư thừa. Bổ sung trang [AuditLogs.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/domains/core/pages/AuditLogs.jsx) (`/audit-logs`) sử dụng Telemetry Design System để xem vết lịch sử thay đổi cấu hình.

**Lý do chọn:**
- Việc duy trì 2 trang quản lý lệnh trùng lặp gây lệch Design System và xung đột state khi bật/tắt lệnh.
- Admin cần một nơi lưu vết (`Audit Logs`) để theo dõi ai đã thay đổi cấu hình hoặc bật/tắt tính năng nào trên Dashboard.

**Hệ quả:**
- Giao diện Dashboard gọn gàng, đồng bộ 100% về mặt thẩm mỹ và kiến trúc định tuyến (React Router).
- Mọi thao tác lưu cấu hình hoặc toggle lệnh đều được ghi log bất đồng bộ vào Redis buffer `guild:{id}:audit_logs`.

---

## ADR-017 — Loại bỏ PM2 & Self-Ping Script (Duy trì 24/7 qua UptimeRobot)

**Quyết định:** Xóa bỏ hoàn toàn PM2 (`pm2.config.cjs`), script self-ping (`keep-alive.sh`, `src/utils/keepalive.js`), và file blueprint Render YAML. Chạy trực tiếp `node src/index.bot.js` và `node src/index.server.js` trên Render Split-Account deployment. Duy trì keep-alive bằng UptimeRobot HTTP Monitors từ bên ngoài.

**Lý do chọn:**
- Script self-ping nội bộ gây tốn CPU/băng thông và không hiệu quả khi instance bị Render tạm dừng.
- Render Blueprint YAML tạo 2 service trên 1 account làm cạn kiệt 750 giờ free tier trong 15 ngày.
- Triển khai thủ công `discord-bot` trên Acc Render A và `discord-dashboard` trên Acc Render B giúp cả 2 services hoạt động 100% miễn phí trọn đời.

**Hệ quả:**
- Mã nguồn sạch sẽ, không còn file rác PM2 hoặc script tự ping.
- UptimeRobot đảm bảo gửi HTTP request mỗi 5 phút giữ cho Web Services luôn active.

---

## ADR-018 — Real-time Telemetry Pipeline & Redis Aggregation

**Quyết định:** Thay thế toàn bộ dữ liệu giả lập (pseudo-random) bằng hệ thống thu thập dữ liệu thời gian thực `recordTelemetryEvent` lưu trữ theo dạng Hash và Set nguyên tử trong Redis (`telemetry:guild:{id}:daily:{date}`, `telemetry:guild:{id}:users:{date}`, `telemetry:guild:{id}:active_hours`).

**Lý do chọn:**
- Dữ liệu ngẫu nhiên giả lập không phản ánh đúng lượt tương tác thực tế của server và gây hiểu nhầm cho Quản trị viên.
- Kiến trúc lưu trữ nguyên tử theo ngày qua Redis Hash/Set cho phép tổng hợp cực nhanh các mốc 7d, 30d, 90d mà không cần quét cơ sở dữ liệu lớn hay tốn chi phí tính toán CPU.

**Hệ quả:**
- Trang Analytics và System hiển thị 100% chỉ số thực tế (lượt chạy lệnh, RAM, CPU load, Ping, active users).
- Hoạt động bất đồng bộ, không tạo độ trễ cho quá trình xử lý lệnh Discord.

---

## ADR-019 — Music Auto-Play (Radio Mode) Mechanism

**Quyết định:** Tích hợp tính năng Radio Auto-Play trong `queueEnd` event handler của Lavalink: khi hết danh sách phát, nếu `autoplay` bật, Bot sử dụng metadata của bài vừa phát để truy vấn bài liên quan và tự động thêm vào hàng chờ.

**Lý do chọn:**
- Ngắt nhạc đột ngột khi hết danh sách chờ gây gián đoạn trải nghiệm người dùng trong Voice Channel.
- Tự động tiếp nối các bài hát tương thích tác giả/thể loại giúp giữ chân người dùng nghe nhạc mượt mà.

**Hệ quả:**
- Thêm nút bấm tương tác `📻 Radio: ON/OFF` và lệnh `/autoplay`.
- Nhạc tự động nối tiếp khi bật chế độ này mà không cần người dùng nhập URL thủ công.

---

## ADR-020 — Dashboard Live Console Terminal Viewer

**Quyết định:** Lưu vết 100 log hệ thống mới nhất vào danh sách Redis `telemetry:live_logs` (thông qua `pushLiveLog`) và cung cấp API `GET /api/system/logs` cho component `<LiveConsole />` trên Dashboard.

**Lý do chọn:**
- Quản trị viên cần theo dõi trực tiếp các sự kiện của Bot (lịch sử lệnh, kết nối Lavalink, lỗi hệ thống) trực tiếp từ Dashboard mà không cần mở console của Render/Cloud Host.

**Hệ quả:**
- Trang System có thêm khung Terminal trực quan hỗ trợ lọc theo loại log (INFO, CMD, WARN, ERROR), tạm dừng luồng log và xóa bộ đệm.


