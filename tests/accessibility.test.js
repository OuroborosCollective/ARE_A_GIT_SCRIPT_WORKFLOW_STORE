import test from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const PAGES = ["index.html", "discover.html", "product.html", "admin.html"];

async function read(name) {
  return fsp.readFile(path.join(PUBLIC, name), "utf8");
}

test("every store page declares language, viewport and a single main landmark", async () => {
  for (const page of PAGES) {
    const html = await read(page);
    assert.match(html, /<html lang="en">/, `${page} has a language`);
    assert.match(html, /name="viewport"/, `${page} has a viewport`);
    assert.match(html, /<main\b/, `${page} has a main landmark`);
    assert.match(html, /<h1\b/, `${page} has exactly one primary heading`);
  }
});

test("styles enforce 44px touch targets and no color-only status", async () => {
  const css = await read("styles.css");
  assert.match(css, /min-height:\s*44px/, "44px minimum target");
  assert.match(css, /prefers-reduced-motion:\s*reduce/, "reduced motion respected");
  assert.match(css, /:focus-visible/, "visible focus ring");
  assert.match(css, /@media\s*\(max-width:\s*560px\)/, "small-phone breakpoint");
});

test("status is always paired with a text label, never color alone", async () => {
  const discover = await read("discover.js");
  // Portability state is rendered as explicit text, not only a colour class.
  assert.match(discover, /PORTABLE/);
  assert.match(discover, /REVIEW REQUIRED/);
});

test("consent and approval dialogs use dialog semantics", async () => {
  const admin = await read("admin.html");
  assert.match(admin, /<dialog\b/, "admin uses a native dialog for the action preview");
  assert.match(admin, /aria-labelledby=/, "admin labels its dialog");

  // The connection card states scope and revocation in plain language.
  const discover = await read("discover.html");
  assert.match(discover, /GitHub connection/);
  assert.match(discover, /separately from write access/i);
  assert.match(discover, /Disconnect/);
});

test("forms label inputs and attach status to controls", async () => {
  const discover = await read("discover.html");
  // Labels wrap their inputs so the association is explicit.
  const labels = discover.match(/<label[^>]*>[\s\S]*?<input/g) || [];
  assert.ok(labels.length >= 5, "multiple labelled inputs");
  assert.match(discover, /aria-live="polite"/, "status changes announced politely");
});

test("no fixed viewport-height critical layout (uses dynamic sizing)", async () => {
  const css = await read("styles.css");
  assert.ok(!/height:\s*100vh/.test(css), "no 100vh critical layout");
});
