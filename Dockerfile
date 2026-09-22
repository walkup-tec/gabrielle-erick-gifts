FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
ENV NITRO_PRESET=node-server
RUN bun run build && bun -e 'import { readFileSync, writeFileSync } from "fs"; const p = ".output/server/index.mjs"; const from = "var host = process.env.NITRO_HOST || process.env.HOST;"; const t = readFileSync(p, "utf8"); if (!t.includes(from)) { console.error("nitro bind line missing"); process.exit(1); } writeFileSync(p, t.replace(from, "var host = \"0.0.0.0\";")); console.log("patched nitro to bind 0.0.0.0");'

FROM oven/bun:1 AS runner
USER root
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=80
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=80
COPY --from=build /app/.output /app/.output
COPY --from=build /app/.env /app/.env
COPY --from=build /app/data /app/data
COPY listen.mjs /app/listen.mjs
COPY start.sh /app/start.sh
COPY package.json /app/package.json
RUN chmod +x /app/start.sh && mkdir -p /data && chmod 777 /data
ENV LOCAL_STORE_PATH=/data/local-store.json
ENV LOCAL_STORE_SEED=/app/data/local-store.seed.json
ENV SKIP_SUPABASE=true
VOLUME ["/data"]
EXPOSE 80 3000
CMD ["bun", "/app/listen.mjs"]
