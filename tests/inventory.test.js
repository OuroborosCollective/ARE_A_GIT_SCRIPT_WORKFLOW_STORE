import test from "node:test";
import assert from "node:assert/strict";
import { buildInventory, RULE_VERSION } from "../server/lib/inventory.js";
import { makeFixtureProvider } from "./support/fixtures.js";

async function scanFixture(provider, repo) {
  const { ref, revision } = await provider.resolveRevision(repo);
  const blobs = await provider.fetchTree(repo, revision);
  const readFile = async (path) => {
    const meta = blobs.find((b) => b.path === path);
    return (await provider.fetchBlob(repo, meta.blobSha)).toString("utf8");
  };
  return buildInventory({ ownerRepo: repo, ref, revision, blobs, readFile });
}

test("complete inventory exposes real counters and excludes vendor paths", async () => {
  const provider = makeFixtureProvider();
  const inv = await scanFixture(provider, "acme/alpha");
  assert.equal(inv.schema, "are-repository-inventory.v2");
  assert.equal(inv.rule_version, RULE_VERSION);
  assert.equal(inv.inventory.excluded_generated_or_vendor, 1, "node_modules is excluded");
  assert.equal(inv.inventory.workflow_candidates, 1);
  assert.equal(inv.inventory.script_candidates, 1);
  // README.md is not automation and must not be a candidate.
  assert.equal(inv.inventory.candidate_count, 2);
  assert.ok(!inv.artifacts.some((a) => a.path === "README.md"));
});

test("candidates are never capped to a synthetic top-three list", async () => {
  const files = [];
  for (let i = 0; i < 12; i++) {
    files.push({
      path: `.github/workflows/wf-${i}.yml`,
      content: `name: wf${i}\non: [push]\njobs:\n  b:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ${i}\n`,
    });
  }
  const provider = makeFixtureProvider();
  provider.repos["acme/many"] = { default_branch: "main", refs: { main: "rev-many" }, revisions: { "rev-many": files } };
  const inv = await scanFixture(provider, "acme/many");
  assert.equal(inv.inventory.candidate_count, 12);
  assert.equal(inv.artifacts.length, 12);
});

test("every candidate carries path, sha, revision, kind, size, portability, reasons, tools and features", async () => {
  const provider = makeFixtureProvider();
  const inv = await scanFixture(provider, "acme/alpha");
  for (const a of inv.artifacts) {
    assert.ok(a.path, "path");
    assert.match(a.sha, /^[0-9a-f]{40}$/, "real git blob sha");
    assert.ok(a.size_bytes >= 0, "size");
    assert.ok(a.kind, "kind");
    assert.ok(["portable", "review_required"].includes(a.portability), "portability state");
    assert.ok(Array.isArray(a.portability_reasons), "reasons");
    assert.ok(Array.isArray(a.tools), "tools");
    assert.ok(Array.isArray(a.features), "features");
  }
  const deploy = inv.artifacts.find((a) => a.path === "scripts/deploy.sh");
  assert.equal(deploy.portability, "review_required");
  assert.ok(deploy.portability_reasons.length > 0, "deploy.sh has real adaptation findings");
});

test("deterministic: scanning the same revision twice yields identical inventory", async () => {
  const provider = makeFixtureProvider();
  const a = await scanFixture(provider, "acme/alpha");
  const b = await scanFixture(provider, "acme/alpha");
  assert.deepEqual(a, b);
});
