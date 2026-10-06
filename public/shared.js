// Shared client helpers for the ARE Store View.
export const API = "/api";

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function textBlock(value) {
  return esc(value || "").replace(/\n/g, "<br>");
}

export function money(cents) {
  return "$" + (Number(cents || 0) / 100).toFixed(2);
}

export async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || body.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export function el(selector) {
  return document.querySelector(selector);
}

export function setStatus(node, message, kind = "") {
  if (!node) return;
  node.textContent = message;
  node.className = kind === "error" ? "error" : kind === "success" ? "success" : "form-hint";
}

export function chipList(values) {
  if (!Array.isArray(values) || !values.length) return "<span class='muted'>None listed.</span>";
  return values.map((v) => `<span class="chip">${esc(v)}</span>`).join("");
}
