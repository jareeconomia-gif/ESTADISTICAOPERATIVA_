#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
( sleep 2; command -v xdg-open >/dev/null && xdg-open http://localhost:3000 >/dev/null 2>&1 || true ) &
node server.js
