import { config } from "./config.js";
import { parseCookies } from "./http.js";
import { unpackCookie, packCookie, sessionSecret } from "./cookies.js";
import { getSession, publicSession, touchSession } from "./auth.js";

export function sessionIdFromRequest(req) {
  const cookies = parseCookies(req);
  return unpackCookie(cookies[config.cookieName], sessionSecret());
}

export async function currentSession(req, { touch = true } = {}) {
  const sid = sessionIdFromRequest(req);
  const session = await getSession(sid);
  if (session && touch) await touchSession(sid);
  return session;
}

export function sessionCookie(sid, { secure = false } = {}) {
  return {
    name: config.cookieName,
    value: packCookie(sid, sessionSecret()),
    options: { httpOnly: true, secure, sameSite: "Lax", path: "/", maxAge: config.sessionTtlMs },
  };
}

export { publicSession };
