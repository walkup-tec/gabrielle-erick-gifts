#!/bin/sh
set -e

if [ -f /app/.output/server/index.mjs ]; then
  exec bun /app/.output/server/index.mjs
fi

if [ -f /app/.output/server/index.js ]; then
  exec bun /app/.output/server/index.js
fi

exec bun run preview --host 0.0.0.0 --port 3000
