import { URL } from "node:url";

export function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

export function text(res, status, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

export async function readJson(req, { limit = 1024 * 1024 } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error("payload_too_large");
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("invalid_json");
    err.status = 400;
    throw err;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  return parts.join("; ");
}

export function url(req) {
  return new URL(req.url, "http://localhost");
}

export class HttpError extends Error {
  constructor(status, code, details = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Structured error contract. Errors always carry a stable machine code plus a
// human-readable message so the UI can attach an inline explanation to the
// affected action (Designer.md section 15).
export function errorPayload(err) {
  if (err instanceof HttpError) {
    return { error: err.code, message: err.message, ...err.details };
  }
  return { error: err.code || "internal_error", message: err.message || "Unexpected error" };
}

export function sendError(res, err) {
  const status = err.status || 500;
  json(res, status, errorPayload(err));
}
