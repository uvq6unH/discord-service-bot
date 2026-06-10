# Backup & Recovery

> Redis là single source of truth. Mất Redis = mất toàn bộ config và state.  
> Tài liệu này ghi rõ những gì có thể mất, cách backup, và cách phục hồi.

---

## Dữ liệu nào quan trọng

| Dữ liệu | Redis key pattern | Mất thì sao |
|---------|------------------|-------------|
| Guild config | `config:guild:{id}` | Bot dùng default config — prefix, commands, welcome reset về mặc định |
| Economy | `guild:{id}:economy:{userId}` | Mất số dư silver/gold/diamond của người dùng |
| Levels / XP | `guild:{id}:levels:{userId}` | Mất level và XP tích lũy |
| Warnings | `guild:{id}:warnings:{userId}` | Mất lịch sử cảnh cáo |
| Riot accounts | `guild:{id}:lolAccount:{userId}` | Người dùng phải link lại |
| Sessions | `sess:{id}` | Người dùng bị logout — tự login lại, không mất data |
| Guild cache | `guild_cache:{id}` | Dashboard 503 tạm thời — bot tự rebuild khi restart |
| Stats counters | `stats:*` | Mất counters — không ảnh hưởng chức năng |
| Slash queue | `slash_sync_queue` | Mất jobs đang chờ — cần trigger lại từ dashboard |

**Quan trọng nhất:** `config:guild:*`, `guild:{id}:economy:*`, `guild:{id}:levels:*`

---

## Upstash built-in protection

Upstash tự động có:
- **Replication:** Data được replicate trong cùng region
- **Daily backup** (Upstash Pro): snapshot tự động, giữ 7 ngày
- **Point-in-time restore** (Upstash Pro): khôi phục về bất kỳ thời điểm nào trong 7 ngày

Kiểm tra plan hiện tại tại [console.upstash.com](https://console.upstash.com) → Database → Settings.

> **Nếu đang dùng Upstash Free:** không có auto-backup. Phụ thuộc vào export thủ công bên dưới.

---

## Export thủ công (config per guild)

Thêm endpoint này vào dashboard để export config của một guild ra JSON:

```
GET /api/config/export?guildId={id}
→ trả về JSON config object
→ download về máy, lưu như file backup
```

Cách thực hiện đơn giản nhất (trong browser):
1. Mở dashboard → chọn guild
2. Gọi `GET /api/config?guildId={id}` (đã có sẵn)
3. Copy JSON từ browser → lưu file

Tần suất khuyến nghị: backup config trước mỗi lần thay đổi lớn.

---

## Export toàn bộ Redis (thủ công)

Khi cần snapshot toàn bộ database:

**Từ Upstash console:**
1. [console.upstash.com](https://console.upstash.com) → chọn database
2. Tab **Backup** (nếu có) → Export → Download `.rdb` hoặc JSON

**Bằng script (nếu cần automation):**
```bash
# List tất cả keys (cẩn thận với database lớn)
curl https://<UPSTASH_URL>/keys/* \
  -H "Authorization: Bearer <TOKEN>"

# Hoặc dùng redis-cli nếu có Upstash Redis Compatibility endpoint
redis-cli -u rediss://<user>:<password>@<host>:<port> --scan --pattern 'config:guild:*'
```

---

## Phục hồi khi mất dữ liệu

### Mất config guild

**Từ file backup JSON:**
```bash
curl -X PUT https://<dashboard-url>/api/config \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b "dsession=<session>" \
  -d '{ "guildId": "...", ...config... }'
```

Hoặc paste JSON vào dashboard config UI (nếu có import endpoint).

**Không có backup:** Bot sẽ dùng `defaultConfig` từ `src/configDefaults.js`. Admin phải cấu hình lại từ đầu qua dashboard.

### Mất economy / levels / warnings

Không có cách phục hồi tự động nếu không có backup — dữ liệu này chỉ tồn tại trong Redis.

Nếu đang dùng Upstash Pro với Point-in-Time Restore:
1. Console → Database → Backups → chọn snapshot trước thời điểm mất dữ liệu → Restore

### Mất toàn bộ Redis database

1. Tạo Upstash database mới (hoặc restore từ snapshot nếu có)
2. Cập nhật `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN` trên cả hai service
3. Restart cả hai service
4. Bot sẽ tự populate lại `guild_cache` khi `ClientReady`
5. Config và state phải restore từ backup file nếu có

---

## Phòng ngừa

| Hành động | Khi nào |
|-----------|---------|
| Nâng lên Upstash Pro | Khi bot có > 5 guild hoặc economy đang được dùng thực tế |
| Export config JSON | Trước mỗi lần thay đổi lớn (sửa command list, thay đổi cấu hình) |
| Test restore | Ít nhất một lần sau khi setup để biết quy trình hoạt động |
| Monitor Redis usage | Upstash console → Database → Metrics — đảm bảo không vượt quota |

---

## Những thứ KHÔNG cần backup

- `guild_cache:*` — bot tự rebuild khi restart
- `heartbeat:*` — ephemeral, TTL 90 s
- `stats:*` — counters, mất không ảnh hưởng chức năng
- `sess:*` — sessions, người dùng tự login lại
- `slash_sync_queue` — jobs tạm thời
- `lock:*` — distributed locks, TTL ngắn, tự expire
