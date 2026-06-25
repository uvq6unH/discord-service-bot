# Discord Service Bot & Community Operations Platform

> Một hệ thống bot Discord đa chức năng và bảng quản trị (Dashboard) trực quan giúp tự động hóa và vận hành máy chủ Discord hiệu quả.

Hệ thống được thiết kế theo kiến trúc **mô-đun hóa** (split-mode) và **dữ liệu tập trung** qua Redis, đảm bảo tính ổn định và khả năng mở rộng tối đa.

---

## 🚀 Tính năng nổi bật

- **Quản trị server (Moderation)**: Cảnh cáo, kick, ban, xóa tin nhắn (purge), tự động kiểm duyệt link/từ cấm (Anti-spam/AutoMod), và hệ thống Ticket hỗ trợ thành viên.
- **Kinh tế & Giải trí (Economy & Games)**: Đồng bạc (Silver) và vàng (Gold/Diamond), quà tặng hàng ngày (`/daily`), cá cược giải trí (Blackjack, Coinflip, Slots).
- **Hệ thống cấp độ (XP & Leveling)**: Tự động cộng XP khi tương tác trong kênh chat và hiển thị bảng xếp hạng trực tiếp.
- **Tích hợp Riot Games (League & TFT)**: Liên kết tài khoản bằng Riot ID (`puuid`), kiểm tra lịch sử đấu, thông tin người chơi nhanh chóng.
- **Hệ thống nhạc (Music)**: Nghe nhạc chất lượng cao thông qua kết nối Lavalink (hỗ trợ tìm kiếm nhanh từ YouTube, Spotify, v.v.).
- **Bảng điều khiển trực quan (Dashboard)**: Cấu hình bot, quản lý thành viên, xem thông số vận hành (Heartbeat, Slash command sync status, PM2 telemetry).

---

## 🛠️ Công nghệ sử dụng

- **Core**: Node.js (ESM), Discord.js v14
- **Database / Cache**: Upstash Redis (REST client tự thiết kế qua `fetch`, không phụ thuộc SDK ngoài)
- **Dashboard Backend**: Express.js v5, Helmet (CSP whitelists), Session Store qua Redis
- **Dashboard Frontend**: React (SPA), Vite, Tailwind-free Vanilla CSS với Design System tokenized, Framer Motion
- **Music Server**: Lavalink v4 (Java)

---

## 📐 Kiến trúc hệ thống

Dự án hỗ trợ hai chế độ chạy linh hoạt:

1. **Mode A — Monolith (1 process)**: Thích hợp cho môi trường local dev hoặc gói host miễn phí (ví dụ Render Free).
   - Chạy cả Bot và Dashboard API trong cùng 1 process (`src/index.js`).
2. **Mode B — Split (2 processes)**: Đề xuất cho Production.
   - **Bot service** (`src/index.bot.js`) phụ trách các tác vụ thời gian thực qua Gateway và nhạc.
   - **Dashboard service** (`src/index.server.js`) đóng vai trò là Web Server phục vụ API và static React app.
   - **Giao tiếp bất đồng bộ**: Mọi tương tác, config lưu trữ, danh sách guild cache và đồng bộ slash commands (`slash_sync_queue`) được truyền tải thông qua Upstash Redis.

---

## 💻 Hướng dẫn khởi chạy Local

### 1. Chuẩn bị môi trường

- Cài đặt **Node.js** 20+ và **pnpm** (`npm i -g pnpm`).
- Bản sao cấu hình biến môi trường:
  ```bash
  cp .env.example .env
  ```
  *Mở file `.env` và điền đầy đủ các thông tin cần thiết (Token bot, Upstash URL/Token, Client ID/Secret).*

### 2. Cài đặt Dependencies
```bash
pnpm install --no-frozen-lockfile
```

### 3. Build phần giao diện Dashboard
```bash
pnpm build:ui
```

### 4. Khởi chạy dự án

#### Chạy Monolith (Chung 1 process - Khuyên dùng khi dev nhanh):
```bash
pnpm dev
```

#### Chạy Split Mode (Tách biệt bot và server):
- **Terminal 1 (Bot service)**:
  ```bash
  pnpm dev:bot
  ```
- **Terminal 2 (Server API)**:
  ```bash
  pnpm dev:server
  ```
- **Terminal 3 (Frontend dev server với Hot Reload)**:
  ```bash
  pnpm dev:ui
  ```
  *Vite dev server sẽ chạy trên cổng `5173` và tự động proxy các request `/api` sang server ở cổng `10001`.*

---

## 📦 Triển khai Production

### 1. Render.com
Dự án được định nghĩa sẵn cấu hình trong file [render.yaml](file:///d:/CODE/Code/discord-bot/render.yaml). Chỉ cần import repo vào Render, hệ thống sẽ tự động khởi chạy 2 service độc lập kết nối chung tới Upstash Redis.

### 2. VPS (PM2)
Dự án cung cấp file cấu hình PM2 [pm2.config.cjs](file:///d:/CODE/Code/discord-bot/pm2.config.cjs):
```bash
# Khởi động cả bot và dashboard
pnpm prod

# Các lệnh quản lý PM2
pnpm prod:status     # Xem trạng thái hoạt động
pnpm prod:logs       # Xem log real-time
pnpm prod:restart    # Khởi động lại hệ thống
```

---

## 📘 Tài liệu tham khảo sâu
- Kiến trúc & luồng dữ liệu: [ARCHITECTURE.md](file:///d:/CODE/Code/discord-bot/ARCHITECTURE.md)
- Quá trình quyết định thiết kế: [ADR.md](file:///d:/CODE/Code/discord-bot/ADR.md)
- Hướng dẫn deploy chi tiết: [DEPLOYMENT.md](file:///d:/CODE/Code/discord-bot/DEPLOYMENT.md)
- Khắc phục sự cố (Troubleshooting): [SYSTEM_DEBUG.md](file:///d:/CODE/Code/discord-bot/SYSTEM_DEBUG.md)
- Sao lưu & Phục hồi dữ liệu: [BACKUP.md](file:///d:/CODE/Code/discord-bot/BACKUP.md)
