import { createServer } from "node:http";

const requested = Number.parseInt(process.env.PORT || process.env.NITRO_PORT || "3000", 10);
const ports = [...new Set([Number.isFinite(requested) && requested > 0 ? requested : 3000, 3000])];

globalThis.__srvxLoader__ = ({ server }) => {
  const handler = server.node?.handler;
  if (typeof handler !== "function") {
    console.error("[gabrielle] nitro handler missing");
    process.exit(1);
  }

  for (const port of ports) {
    const httpServer = createServer(handler);
    httpServer.on("error", (error) => {
      console.error(`[gabrielle] failed to bind 0.0.0.0:${port}`, error);
      if (port === 3000) process.exit(1);
    });
    httpServer.listen(port, "0.0.0.0", () => {
      console.log(`[gabrielle] listening on http://0.0.0.0:${port}/`);
    });
  }
};

await import("./.output/server/index.mjs");
