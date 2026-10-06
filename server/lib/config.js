import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
export const PUBLIC_DIR = path.join(ROOT, "public");

// Resolved lazily so tests can point ARE_DATA_DIR at a temp directory.
export function dataDir() {
  return process.env.ARE_DATA_DIR ? path.resolve(process.env.ARE_DATA_DIR) : path.join(ROOT, "data");
}

export const config = {
  port: Number(process.env.PORT || 3000),
  // Public origin used to build archive / product URLs.
  publicOrigin: (process.env.ARE_PUBLIC_ORIGIN || `http://localhost:${Number(process.env.PORT || 3000)}`).replace(/\/$/, ""),
  // GitHub OAuth app (Authorization Code + PKCE, S256).
  github: {
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || "",
    // Read and write are separate grant boundaries (Designer.md section 12).
    readScope: process.env.GITHUB_OAUTH_READ_SCOPE || "read:user repo",
    writeScope: process.env.GITHUB_OAUTH_WRITE_SCOPE || "read:user repo",
    apiBase: process.env.GITHUB_API_BASE || "https://api.github.com",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    // Owner read token for the discovery flow. Never exposed to the browser.
    readToken: process.env.ARE_GITHUB_READ_TOKEN || process.env.GITHUB_TOKEN || "",
  },
  sessionTtlMs: Number(process.env.ARE_SESSION_TTL_MS || 8 * 60 * 60 * 1000),
  cookieName: "are_session",
};

export function archiveDir() {
  return process.env.ARE_ARCHIVE_DIR || path.join(dataDir(), "archives");
}

export function hasOAuth() {
  return Boolean(config.github.clientId && config.github.clientSecret);
}
