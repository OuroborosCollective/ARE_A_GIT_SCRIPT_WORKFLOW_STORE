import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/index.js";
import { setProvider } from "../server/lib/github.js";
import { makeFixtureProvider, withTempDataDir } from "./support/fixtures.js";

async function startServer() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    close: () => new Promise((resolve) => server.close(resolve)),
    get: (p) => fetch(base + p),
    post: (p, body) =>
      fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  };
}

test("end-to-end: scan -> package -> save draft -> publish -> public catalog", async () => {
  await withTempDataDir(async () => {
    setProvider(makeFixtureProvider());
    const s = await startServer();
    try {
      // Scan
      const scanRes = await s.post("/api/github/scan", { owner_repo: "acme/alpha" });
      assert.equal(scanRes.status, 200);
      const scan = await scanRes.json();
      assert.equal(scan.inventory.candidate_count, 2);
      assert.ok(scan.revision);

      const selection = scan.artifacts.map((a) => ({ path: a.path, sha: a.sha }));

      // Package
      const pkgRes = await s.post("/api/products/package", {
        repository: "acme/alpha",
        branch: scan.ref,
        revision: scan.revision,
        rule_version: scan.rule_version,
        artifacts: selection,
      });
      assert.equal(pkgRes.status, 200);
      const pkg = await pkgRes.json();
      assert.equal(pkg.manifest_version, "ARE-PACKAGE-V2");
      assert.ok(pkg.package_id);
      assert.match(pkg.archive_sha256, /^[0-9a-f]{64}$/);

      // The archive is really downloadable and is a zip.
      const dl = await s.get(`/api/products/package/${pkg.package_id}`);
      assert.equal(dl.status, 200);
      assert.equal(dl.headers.get("x-are-source-revision"), scan.revision);
      const buf = Buffer.from(await dl.arrayBuffer());
      assert.equal(buf.readUInt32LE(0), 0x04034b50);

      // Save draft
      const saveRes = await s.post("/api/products/save", {
        title: "Alpha automation package",
        repository: "acme/alpha",
        source_revision: scan.revision,
        artifact_paths: selection.map((a) => a.path),
        package_id: pkg.package_id,
        price_cents: 1500,
        rule_version: scan.rule_version,
      });
      const saved = await saveRes.json();
      assert.equal(saved.status, "draft");

      // Draft is not public.
      assert.equal((await (await s.get(`/api/products/public?product_id=${saved.id}`)).json()).error, "published_product_not_found");

      // Publish explicitly.
      const pubRes = await s.post("/api/products/publish", { product_id: saved.id, status: "published" });
      assert.equal(pubRes.status, 200);

      // Now public.
      const publicRes = await s.get(`/api/products/public?product_id=${saved.id}`);
      assert.equal(publicRes.status, 200);
      const publicProduct = (await publicRes.json()).product;
      assert.equal(publicProduct.repository, "acme/alpha");
      assert.equal(publicProduct.source_revision, scan.revision);

      const catalog = await (await s.get("/api/products/catalog")).json();
      assert.equal(catalog.schema_version, "are-public-catalog.v1");
      assert.equal(catalog.products.length, 1);
    } finally {
      await s.close();
    }
  });
});

test("end-to-end: stale source returns 409 through the HTTP layer", async () => {
  await withTempDataDir(async () => {
    const provider = makeFixtureProvider();
    setProvider(provider);
    const s = await startServer();
    try {
      const scan = await (await s.post("/api/github/scan", { owner_repo: "acme/alpha" })).json();
      const selection = scan.artifacts.map((a) => ({ path: a.path, sha: a.sha }));
      // Change a file after the scan.
      provider.repos["acme/alpha"].revisions[scan.revision][0].content += "\n# drift\n";
      const res = await s.post("/api/products/package", {
        repository: "acme/alpha",
        branch: scan.ref,
        revision: scan.revision,
        artifacts: selection,
      });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.error, "source_changed_since_scan");
      assert.equal(body.requiresRescan, true);
      assert.ok(body.expectedSha && body.actualSha);
    } finally {
      await s.close();
    }
  });
});

test("end-to-end: two-repository flow resets state and never leaks artifacts", async () => {
  await withTempDataDir(async () => {
    setProvider(makeFixtureProvider());
    const s = await startServer();
    try {
      const alpha = await (await s.post("/api/github/scan", { owner_repo: "acme/alpha" })).json();
      const beta = await (await s.post("/api/github/scan", { owner_repo: "acme/beta" })).json();
      // The two scans share no artifact paths or blob SHAs.
      const alphaPaths = new Set(alpha.artifacts.map((a) => a.path));
      for (const a of beta.artifacts) {
        assert.ok(!alphaPaths.has(a.path), "no artifact path leaks across repositories");
      }
      // Packaging a beta artifact against the alpha revision must fail cleanly.
      const res = await s.post("/api/products/package", {
        repository: "acme/alpha",
        branch: alpha.ref,
        revision: alpha.revision,
        artifacts: [{ path: beta.artifacts[0].path, sha: beta.artifacts[0].sha }],
      });
      assert.equal(res.status, 409);
    } finally {
      await s.close();
    }
  });
});

test("static storefront assets are served", async () => {
  await withTempDataDir(async () => {
    setProvider(makeFixtureProvider());
    const s = await startServer();
    try {
      for (const path of ["/", "/discover.html", "/product.html", "/admin.html", "/styles.css", "/shared.js", "/discover.js"]) {
        const res = await s.get(path);
        assert.equal(res.status, 200, `${path} should be served`);
      }
      const missing = await s.get("/does-not-exist.html");
      assert.equal(missing.status, 404);
    } finally {
      await s.close();
    }
  });
});
