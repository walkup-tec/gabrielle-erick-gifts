import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnv("/app/.env");
loadEnv(new URL("./.env", import.meta.url).pathname);

process.env.HOST = "0.0.0.0";
process.env.NITRO_HOST = "0.0.0.0";

const extra = Number.parseInt(process.env.PORT || process.env.NITRO_PORT || "", 10);
const ports = [...new Set([80, 3000, Number.isFinite(extra) && extra > 0 ? extra : 3000])];

console.log("[gabrielle] starting", {
  cwd: process.cwd(),
  PORT: process.env.PORT,
  NITRO_PORT: process.env.NITRO_PORT,
  HOST: process.env.HOST,
  ports,
});

globalThis.__srvxLoader__ = ({ server }) => {
  const nitroHandler = server.node?.handler;
  if (typeof nitroHandler !== "function") {
    console.error("[gabrielle] nitro handler missing");
    process.exit(1);
  }

  const handler = (req, res) => {
    const url = req.url || "/";
    if (url === "/healthz" || url.startsWith("/healthz?")) {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("ok");
      return;
    }
    return nitroHandler(req, res);
  };

  for (const port of ports) {
    const httpServer = createServer(handler);
    httpServer.on("error", (error) => {
      console.error(`[gabrielle] bind 0.0.0.0:${port} failed:`, error.code || error.message);
    });
    httpServer.listen(port, "0.0.0.0", () => {
      console.log(`[gabrielle] listening on http://0.0.0.0:${port}/`);
    });
  }
};

await import(new URL("./.output/server/index.mjs", import.meta.url).href);
