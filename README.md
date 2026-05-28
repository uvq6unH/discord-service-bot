# Discord Service Bot

Bot Discord cơ bản kèm web dashboard để custom config theo server.

## Cài đặt

```bash
pnpm install
copy .env.example .env   # Windows
# cp .env.example .env   # Linux/Mac
```

Sửa `.env`:

```env
DISCORD_TOKEN=token_bot_cua_ban
PORT=3000
CONFIG_PATH=./data/configs.json
```

## Chạy (dev)

```bash
pnpm dev
```

Mở dashboard: `http://localhost:3000`

---

## Chạy liên tục (production)

### Cách 1: PM2 (khuyến nghị)

PM2 là process manager — tự restart khi crash, giữ bot sống vĩnh viễn, quản lý log.

```bash
# Cài PM2 global (chỉ cần làm một lần)
npm install -g pm2

# Khởi động bot
pnpm prod           # hoặc: pm2 start pm2.config.cjs

# Tự khởi động lại khi reboot server
pm2 save
pm2 startup         # chạy lệnh mà PM2 in ra

# Xem trạng thái
pnpm prod:status    # hoặc: pm2 status

# Xem log
pnpm prod:logs      # hoặc: pm2 logs discord-service-bot

# Dừng
pnpm prod:stop
```

### Cách 2: keep-alive.sh (không cần PM2)

```bash
# Chạy trực tiếp (giữ terminal)
bash keep-alive.sh

# Hoặc chạy nền (detached)
mkdir -p logs
nohup bash keep-alive.sh >> logs/keepalive.log 2>&1 &
echo "PID: $!"
```

### Cách 3: systemd (Linux server)

Tạo file `/etc/systemd/system/discord-bot.service`:

```ini
[Unit]
Description=Discord Service Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/discord-service-bot
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable discord-bot
sudo systemctl start discord-bot
sudo journalctl -u discord-bot -f   # xem log
```

---

## Mời bot vào server

Trong Discord Developer Portal:

1. Tạo application và bot.
2. Bật `Message Content Intent` và `Server Members Intent` trong tab Bot.
3. Tạo invite URL với scope `bot`, permissions có quyền đọc/gửi tin nhắn.
4. Nếu muốn Discord hiện command trong menu `/`, invite bot với thêm scope `applications.commands`.

---

## Tính năng

- Config riêng cho từng `guildId`.
- Lệnh prefix: `!ping`, `!config`, `!help`.
- Custom command từ dashboard, gồm cả `ping`, `help`, `config`.
- Native slash command suggestions từ danh sách command trên dashboard.
- Built-in command types: ping, help, config, server, user, avatar, say, purge, warn, kick, ban, timeout, warnings, clearwarns, rank, leaderboard, announce, ticketpanel, rolepanel.
- Module pages: Commands, Moderation, AutoMod, Roles, Tickets, Levels, Announcements, Welcome, Auto replies, Advanced.
- Runtime state is stored in `data/state.json` for warnings, XP/levels, and ticket numbering.
- Welcome message khi có member mới.
- Auto reply theo keyword.
- Web API + dashboard để sửa config.

## Command variables

Trong response của command có thể dùng:

`{user}`, `{username}`, `{server}`, `{channel}`, `{prefix}`, `{ping}`, `{args}`, `{commands}`, `{welcomeStatus}`, `{autoReplyStatus}`, `{commandCount}`
