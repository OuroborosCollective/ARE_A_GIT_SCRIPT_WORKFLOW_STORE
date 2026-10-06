// Automated responsive verification against a real Chromium via CDP.
// Checks that no page produces horizontal overflow at the target widths and
// that interactive controls meet the 44px minimum touch target.
//
// Usage: node tests/responsive.mjs [baseUrl]
import { spawn } from "node:child_process";
import process from "node:process";

const BASE = process.argv[2] || process.env.ARE_BASE_URL || "http://127.0.0.1:3210";
const WIDTHS = [360, 412, 768, 1200];
const PAGES = ["/", "/discover.html", "/admin.html"];
const PORT = 9222 + Math.floor(Math.random() * 500);

function launchChromium() {
  const binary = process.env.CHROME_BIN || process.env.ARE_CHROME_BIN || "chromium";
  const child = spawn(
    binary,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${PORT}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  return child;
}

async function waitForDevtools() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Chromium DevTools endpoint did not become ready");
}

function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  return {
    ready,
    send(method, params = {}) {
      const msgId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    },
    close: () => ws.close(),
  };
}

async function openTarget(url) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  return res.json();
}

const OVERFLOW_PROBE = `(() => {
  const doc = document.documentElement;
  const overflow = doc.scrollWidth - window.innerWidth;
  // A control meets the touch-target requirement when its own box or an
  // associated <label> reaches 44px, which is the effective clickable area.
  const targetHeight = (el) => {
    const r = el.getBoundingClientRect();
    const label = el.closest('label');
    const lr = label ? label.getBoundingClientRect() : null;
    return Math.max(r.height, lr ? lr.height : 0);
  };
  const small = [...document.querySelectorAll('button, a, input, select, textarea, [role="button"]')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && targetHeight(el) < 44;
    })
    .map((el) => el.tagName + '.' + (el.className || '') + ':' + Math.round(targetHeight(el)));
  return JSON.stringify({ overflow, innerWidth: window.innerWidth, small: small.slice(0, 10) });
})()`;

async function main() {
  const chromium = launchChromium();
  let failures = 0;
  const results = [];
  try {
    await waitForDevtools();
    for (const path of PAGES) {
      const target = await openTarget(BASE + path);
      const client = cdpClient(target.webSocketDebuggerUrl);
      await client.ready;
      await client.send("Page.enable");
      await client.send("Runtime.enable");
      for (const width of WIDTHS) {
        await client.send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await client.send("Page.navigate", { url: BASE + path });
        await new Promise((r) => setTimeout(r, 700));
        const { result } = await client.send("Runtime.evaluate", { expression: OVERFLOW_PROBE, returnByValue: true });
        const data = JSON.parse(result.value);
        const ok = data.overflow <= 1 && data.small.length === 0;
        if (!ok) failures++;
        results.push({ path, width, overflow: data.overflow, small: data.small, ok });
      }
      client.close();
    }
  } finally {
    chromium.kill("SIGKILL");
  }

  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.path} @ ${r.width}px  overflow=${r.overflow} small=${r.small.length}`);
    if (!r.ok && r.small.length) console.log("      sub-44px:", r.small.join(", "));
  }
  if (failures) {
    console.error(`\n${failures} responsive check(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} responsive checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
