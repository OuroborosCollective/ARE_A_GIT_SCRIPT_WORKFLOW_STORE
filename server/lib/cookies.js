import crypto from "node:crypto";

// Minimal HMAC-signed session cookie. The cookie carries only an opaque session
// id plus an integrity tag; the GitHub token stays server-side.
export function signValue(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function packCookie(sid, secret) {
  return `${sid}.${signValue(sid, secret)}`;
}

export function unpackCookie(raw, secret) {
  if (!raw || typeof raw !== "string") return null;
  const idx = raw.lastIndexOf(".");
  if (idx === -1) return null;
  const sid = raw.slice(0, idx);
  const tag = raw.slice(idx + 1);
  const expected = signValue(sid, secret);
  const a = Buffer.from(tag);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return sid;
}

export function sessionSecret() {
  return process.env.ARE_SESSION_SECRET || "are-store-dev-session-secret";
}
