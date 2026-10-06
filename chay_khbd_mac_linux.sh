#!/usr/bin/env bash
# Chạy Trợ lý KHBD trên máy cá nhân (macOS / Linux). Cần Node.js 20+ (https://nodejs.org).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Chưa cài Node.js. Hãy tải bản LTS tại https://nodejs.org rồi chạy lại."; exit 1
fi
[ -d node_modules ] || { echo "Đang cài đặt lần đầu…"; npm install --omit=dev || exit 1; }
URL="http://localhost:${PORT:-3000}"
( sleep 2; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) >/dev/null 2>&1 &
echo "Đang chạy tại $URL — nhấn Ctrl+C để dừng."
exec node src/server.js
