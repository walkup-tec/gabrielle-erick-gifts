#!/bin/sh
set -e
mkdir -p /data
if [ ! -s /data/local-store.json ] && [ -f /app/data/local-store.seed.json ]; then
  cp /app/data/local-store.seed.json /data/local-store.json
fi
export LOCAL_STORE_PATH="${LOCAL_STORE_PATH:-/data/local-store.json}"
export LOCAL_STORE_SEED="${LOCAL_STORE_SEED:-/app/data/local-store.seed.json}"
export SKIP_SUPABASE="${SKIP_SUPABASE:-true}"
export HOST=0.0.0.0
export NITRO_HOST=0.0.0.0
export PORT="${PORT:-80}"
export NITRO_PORT="${PORT}"
exec bun /app/listen.mjs
