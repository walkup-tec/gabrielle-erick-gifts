#!/bin/sh
set -e
export HOST=0.0.0.0
export NITRO_HOST=0.0.0.0
export PORT="${PORT:-80}"
export NITRO_PORT="${PORT}"
exec bun /app/listen.mjs
