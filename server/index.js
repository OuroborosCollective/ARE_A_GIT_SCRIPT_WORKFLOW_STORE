import http from "node:http";
import fsp from "node:fs/promises";
import path from "node:path";
import { config, PUBLIC_DIR } from "./lib/config.js";
import { matchRoute } from "./router.js";
import { sendError, text, HttpError } from "./lib/http.js";
import { authRoutes } from "./routes/github.js";
import { productRoutes } from "./routes/products.js";
import { ensureDataDir } from "./lib/store.js";
import { listLedger } from "./lib/ledger.js";

const routes = [
  ...authRoutes,
  ...productRoutes,
  {
    method: "GET",
    path: "/api/ledger",
    handler: async (req, res) => {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ entries: await listLedger() }));
    },
  },
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

async function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) throw new HttpError(403, "forbidden");
  try {
    const data = await fsp.readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "content-length": data.length,
      "cache-control": "no-cache",
    });
    res.end(data);
  } catch {
    throw new HttpError(404, "not_found");
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const pathname = (req.url || "/").split("?")[0];
    try {
      if (pathname.startsWith("/api/")) {
        const match = matchRoute(routes, req.method, pathname);
        if (!match) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "function_not_found", path: pathname }));
          return;
        }
        await match.route.handler(req, res, match.params);
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "method_not_allowed");
      await serveStatic(req, res, pathname);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      sendError(res, err);
    }
  });
}

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) {
  ensureDataDir();
  const server = createServer();
  server.listen(config.port, () => {
    console.log(`ARE Store listening on ${config.publicOrigin}`);
  });
}
