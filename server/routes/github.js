import { json, readJson, url, HttpError } from "../lib/http.js";
import { config, hasOAuth } from "../lib/config.js";
import { beginAuth, completeAuth, revokeSession, publicSession } from "../lib/auth.js";
import { currentSession, sessionCookie, sessionIdFromRequest } from "../lib/session.js";
import { getProvider } from "../lib/github.js";
import { buildInventory } from "../lib/inventory.js";
import { store, nowIso } from "../lib/store.js";

function originFrom(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${config.port}`;
  return `${proto}://${host}`;
}

export const authRoutes = [
  {
    method: "GET",
    path: "/api/github/oauth/config",
    handler: async (req, res) => {
      json(res, 200, {
        oauth_configured: hasOAuth(),
        read_scope: config.github.readScope,
        write_scope: config.github.writeScope,
      });
    },
  },
  {
    method: "POST",
    path: "/api/github/oauth/start",
    handler: async (req, res) => {
      const body = await readJson(req).catch(() => ({}));
      const { authorizeUrl } = await beginAuth({ origin: originFrom(req), scope: body.scope || "read" });
      json(res, 200, { authorize_url: authorizeUrl });
    },
  },
  {
    method: "GET",
    path: "/api/github/callback",
    handler: async (req, res) => {
      const q = url(req).searchParams;
      const { sid, session } = await completeAuth({
        code: q.get("code"),
        state: q.get("state"),
        origin: originFrom(req),
      });
      const cookie = sessionCookie(sid, { secure: originFrom(req).startsWith("https") });
      res.writeHead(302, {
        location: "/discover.html?connected=1",
        "set-cookie": `${cookie.name}=${encodeURIComponent(cookie.value)}; Max-Age=${Math.floor(config.sessionTtlMs / 1000)}; Path=/; HttpOnly; SameSite=Lax${cookie.options.secure ? "; Secure" : ""}`,
      });
      res.end();
      void session;
    },
  },
  {
    method: "GET",
    path: "/api/github/session",
    handler: async (req, res) => {
      const session = await currentSession(req, { touch: false });
      json(res, 200, { authenticated: Boolean(session), session: publicSession(session) });
    },
  },
  {
    method: "POST",
    path: "/api/github/disconnect",
    handler: async (req, res) => {
      const sid = sessionIdFromRequest(req);
      const result = await revokeSession(sid);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": `${config.cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
      });
      res.end(JSON.stringify({ revoked: result.revoked }));
    },
  },
  {
    method: "GET",
    path: "/api/github/repos",
    handler: async (req, res) => {
      const session = await currentSession(req);
      const q = url(req).searchParams.get("q") || "";
      const provider = getProvider();
      // When an owner read token is configured, discovery works without an
      // interactive session. Otherwise the session's read grant is required.
      if (!provider.token && !session) throw new HttpError(401, "github_not_connected");
      const repositories = await provider.listRepositories(q);
      json(res, 200, { repositories });
    },
  },
  {
    method: "POST",
    path: "/api/github/scan",
    handler: async (req, res) => {
      const body = await readJson(req);
      if (!body.owner_repo) throw new HttpError(400, "owner_repo_required");
      const provider = getProvider();
      if (!provider.token) {
        const session = await currentSession(req);
        if (!session?.readGrant?.granted) throw new HttpError(401, "github_not_connected");
      }
      const { ref, revision } = await provider.resolveRevision(body.owner_repo, body.ref);
      const blobs = await provider.fetchTree(body.owner_repo, revision);
      const byPath = new Map(blobs.map((b) => [b.path, b]));
      const cache = new Map();
      const readFile = async (path) => {
        if (cache.has(path)) return cache.get(path);
        const meta = byPath.get(path);
        if (!meta) return "";
        const content = await provider.fetchBlob(body.owner_repo, meta.blobSha);
        const text = content.toString("utf8");
        cache.set(path, text);
        return text;
      };
      const inventory = await buildInventory({ ownerRepo: body.owner_repo, ref, revision, blobs, readFile });
      inventory.scanned_at = nowIso();
      json(res, 200, inventory);
    },
  },
];
