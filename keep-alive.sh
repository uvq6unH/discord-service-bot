#!/usr/bin/env bash
# Fallback keep-alive wrapper (use PM2 if possible — it's better).
# Usage: bash keep-alive.sh
# Daemonize: nohup bash keep-alive.sh >> logs/keepalive.log 2>&1 &

set -euo pipefail
BOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGDIR="$BOT_DIR/logs"
mkdir -p "$LOGDIR"

RESTART_COUNT=0
MAX_RESTARTS=50

echo "[keep-alive] Starting discord-service-bot at $(date)"

while [ "$RESTART_COUNT" -lt "$MAX_RESTARTS" ]; do
  node "$BOT_DIR/src/index.js" >> "$LOGDIR/out.log" 2>> "$LOGDIR/err.log"
  EXIT_CODE=$?
  RESTART_COUNT=$((RESTART_COUNT + 1))
  echo "[keep-alive] Process exited with code $EXIT_CODE. Restart #$RESTART_COUNT at $(date)" | tee -a "$LOGDIR/keepalive.log"
  sleep 5
done

echo "[keep-alive] Too many restarts ($MAX_RESTARTS). Giving up." | tee -a "$LOGDIR/keepalive.log"
exit 1
