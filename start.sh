#!/bin/sh
set -e

if [ -f /app/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /app/.env
  set +a
fi

# EasyPanel sets HOST to the public domain. Nitro binds to HOST, the
# process exits, and Traefik returns 502. Always listen on all interfaces.
export HOST=0.0.0.0
export NITRO_HOST=0.0.0.0
export PORT="${PORT:-3000}"
export NITRO_PORT="${PORT}"

echo "[gabrielle] starting Nitro on 0.0.0.0:${PORT}"

if [ ! -f /app/.output/server/index.mjs ]; then
  echo "[gabrielle] missing /app/.output/server/index.mjs"
  ls -la /app /app/.output /app/.output/server 2>/dev/null || true
  exit 1
fi

exec bun /app/.output/server/index.mjs
