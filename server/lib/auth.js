import crypto from "node:crypto";
import { config, hasOAuth } from "./config.js";
import { HttpError } from "./http.js";
import { store, newId, nowIso } from "./store.js";

// GitHub OAuth: Authorization Code + PKCE (S256). The access token never
// reaches the browser; the browser only holds an opaque server-side session id.

function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createCodeVerifier() {
  return base64url(crypto.randomBytes(32));
}

export function sha256Base64Url(value) {
  return base64url(crypto.createHash("sha256").update(value).digest());
}

export function createState() {
  return base64url(crypto.randomBytes(16));
}

export function createNonce() {
  return base64url(crypto.randomBytes(16));
}

export async function beginAuth({ origin, scope = "read" } = {}) {
  if (!hasOAuth()) {
    throw new HttpError(503, "github_oauth_not_configured", {
      message: "GitHub OAuth is not configured on this deployment.",
    });
  }
  const verifier = createCodeVerifier();
  const challenge = sha256Base64Url(verifier);
  const state = createState();
  const nonce = createNonce();
  const requestedScope = scope === "write" ? config.github.writeScope : config.github.readScope;

  await store.oauthStates.mutate((data) => {
    data[state] = {
      verifier,
      nonce,
      scope,
      requestedScope,
      origin,
      createdAt: nowIso(),
      used: false,
    };
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.github.clientId,
    redirect_uri: `${origin}/api/github/callback`,
    scope: requestedScope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return { authorizeUrl: `${config.github.authorizeUrl}?${params.toString()}`, state };
}

async function consumeState(state) {
  return store.oauthStates.mutate((data) => {
    const entry = data[state];
    if (!entry || entry.used) return null;
    entry.used = true;
    entry.usedAt = nowIso();
    return entry;
  });
}

async function exchangeCode({ code, verifier, origin }) {
  const body = new URLSearchParams({
    client_id: config.github.clientId,
    code,
    redirect_uri: `${origin}/api/github/callback`,
    code_verifier: verifier,
  });
  if (config.github.clientSecret) body.set("client_secret", config.github.clientSecret);
  const res = await fetch(config.github.tokenUrl, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    throw new HttpError(401, "github_oauth_exchange_failed", {
      detail: data.error_description || data.error || "token_exchange_failed",
    });
  }
  return data;
}

export async function completeAuth({ code, state, origin }) {
  if (!code || !state) throw new HttpError(400, "oauth_callback_incomplete");
  const entry = await consumeState(state);
  if (!entry) throw new HttpError(400, "oauth_state_invalid", { message: "State is unknown or already used." });

  const token = await exchangeCode({ code, verifier: entry.verifier, origin });
  const grantedScopes = String(token.scope || "").split(/[,\s]+/).filter(Boolean);

  // Separate the read grant from the write grant. Write authority is only
  // present when the returned scope actually contains repo-write capability.
  const hasRepo = grantedScopes.includes("repo");
  const readGrant = { scopes: entry.requestedScope.split(" "), granted: true };
  const writeGrant = hasRepo ? { scopes: grantedScopes, granted: true } : { scopes: [], granted: false };

  const profile = await fetchGitHubUser(token.access_token);
  const sid = newId("sess");
  const session = {
    id: sid,
    createdAt: nowIso(),
    lastUsedAt: nowIso(),
    expiresAt: new Date(Date.now() + config.sessionTtlMs).toISOString(),
    origin,
    github: {
      login: profile.login,
      id: profile.id,
      avatarUrl: profile.avatar_url,
      name: profile.name || profile.login,
    },
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    tokenType: token.token_type || "bearer",
    grantedScopes,
    readGrant,
    writeGrant,
    revoked: false,
  };
  await store.sessions.mutate((data) => {
    data[sid] = session;
  });
  return { sid, session: publicSession(session) };
}

async function fetchGitHubUser(accessToken) {
  const res = await fetch(`${config.github.apiBase}/user`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/vnd.github+json", "user-agent": "are-store" },
  });
  if (!res.ok) throw new HttpError(401, "github_user_fetch_failed");
  return res.json();
}

export function publicSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    login: session.github?.login || null,
    name: session.github?.name || null,
    avatarUrl: session.github?.avatarUrl || null,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    grantedScopes: session.grantedScopes,
    readGrant: session.readGrant,
    writeGrant: session.writeGrant,
    revoked: Boolean(session.revoked),
  };
}

export async function getSession(sid) {
  if (!sid) return null;
  const session = await store.sessions.read((data) => data[sid]);
  if (!session || session.revoked) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  return session;
}

export async function touchSession(sid) {
  await store.sessions.mutate((data) => {
    if (data[sid]) data[sid].lastUsedAt = nowIso();
  });
}

export async function revokeSession(sid) {
  if (!sid) return { revoked: false };
  return store.sessions.mutate((data) => {
    const session = data[sid];
    if (!session) return { revoked: false };
    session.revoked = true;
    session.revokedAt = nowIso();
    session.accessToken = null;
    session.refreshToken = null;
    return { revoked: true };
  });
}

// Read access is required for discovery; write access is a separate boundary
// used only for actions the owner explicitly authorizes.
export function requireReadGrant(session) {
  if (!session?.readGrant?.granted) throw new HttpError(403, "github_read_grant_required");
  return session;
}

export function requireWriteGrant(session) {
  if (!session?.writeGrant?.granted) throw new HttpError(403, "github_write_grant_required");
  return session;
}
