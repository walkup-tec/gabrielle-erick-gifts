#!/bin/sh
set -e

if [ -f /app/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /app/.env
  set +a
fi

# EasyPanel injects HOST=<public domain>. Nitro would bind that and die (502).
export HOST=0.0.0.0
export NITRO_HOST=0.0.0.0
export PORT="${PORT:-3000}"
export NITRO_PORT="${PORT}"

echo "[gabrielle] starting on 0.0.0.0:${PORT} (and 3000)"

if [ ! -f /app/.output/server/index.mjs ]; then
  echo "[gabrielle] missing /app/.output/server/index.mjs"
  ls -la /app /app/.output /app/.output/server 2>/dev/null || true
  exit 1
fi

exec bun /app/listen.mjs
