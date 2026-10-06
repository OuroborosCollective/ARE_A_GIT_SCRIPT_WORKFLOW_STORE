import test from "node:test";
import assert from "node:assert/strict";
import { buildPackage, getPackage } from "../server/lib/packaging.js";
import { makeFixtureProvider, withTempDataDir } from "./support/fixtures.js";
import { createZip, buildManifest, MANIFEST_FORMAT } from "../server/lib/evidence.js";
import zlib from "node:zlib";

async function scan(provider, repo) {
  const { ref, revision } = await provider.resolveRevision(repo);
  const blobs = await provider.fetchTree(repo, revision);
  return { ref, revision, blobs };
}

test("packaging produces a real archive bound to the scanned revision with verified SHAs", async () => {
  await withTempDataDir(async () => {
    const provider = makeFixtureProvider();
    const { ref, revision, blobs } = await scan(provider, "acme/alpha");
    const selection = blobs
      .filter((b) => b.path === ".github/workflows/ci.yml" || b.path === "scripts/deploy.sh")
      .map((b) => ({ path: b.path, sha: b.blobSha }));

    const record = await buildPackage({
      provider,
      repository: "acme/alpha",
      ref,
      revision,
      ruleVersion: "are-portability-v2",
      artifacts: selection,
    });

    assert.equal(record.manifest_format, MANIFEST_FORMAT);
    assert.equal(record.source_revision, revision);
    assert.equal(record.artifact_count, 2);
    assert.match(record.archive_sha256, /^[0-9a-f]{64}$/);
    assert.equal(record.manifest.format, "ARE-PACKAGE-V2");
    assert.deepEqual(
      record.manifest.artifacts.map((a) => a.path).sort(),
      [".github/workflows/ci.yml", "scripts/deploy.sh"],
    );
    // Persisted and re-readable.
    const again = await getPackage(record.id);
    assert.equal(again.id, record.id);
  });
});

test("identical input produces a consistent manifest content hash", async () => {
  await withTempDataDir(async () => {
    const provider = makeFixtureProvider();
    const { ref, revision, blobs } = await scan(provider, "acme/alpha");
    const selection = blobs.map((b) => ({ path: b.path, sha: b.blobSha }));
    const a = await buildPackage({ provider, repository: "acme/alpha", ref, revision, artifacts: selection });
    const b = await buildPackage({ provider, repository: "acme/alpha", ref, revision, artifacts: selection });
    assert.equal(a.manifest.contentHash, b.manifest.contentHash);
  });
});

test("source changed after scan -> 409 and packaging stops", async () => {
  await withTempDataDir(async () => {
    const provider = makeFixtureProvider();
    const { ref, revision, blobs } = await scan(provider, "acme/alpha");
    const target = blobs.find((b) => b.path === "scripts/deploy.sh");
    // Mutate the repository so the blob SHA no longer matches the scan.
    provider.repos["acme/alpha"].revisions[revision].find((f) => f.path === "scripts/deploy.sh").content =
      "#!/usr/bin/env bash\necho changed\n";

    await assert.rejects(
      () =>
        buildPackage({
          provider,
          repository: "acme/alpha",
          ref,
          revision,
          artifacts: [{ path: target.path, sha: target.blobSha }],
        }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.code, "source_changed_since_scan");
        assert.equal(err.expectedSha, target.blobSha);
        assert.notEqual(err.actualSha, target.blobSha);
        assert.equal(err.requiresRescan, true);
        return true;
      },
    );
  });
});

test("missing blob after scan -> 409", async () => {
  await withTempDataDir(async () => {
    const provider = makeFixtureProvider();
    const { ref, revision, blobs } = await scan(provider, "acme/alpha");
    const target = blobs.find((b) => b.path === "scripts/deploy.sh");
    provider.repos["acme/alpha"].revisions[revision] = provider.repos["acme/alpha"].revisions[revision].filter(
      (f) => f.path !== "scripts/deploy.sh",
    );
    await assert.rejects(
      () => buildPackage({ provider, repository: "acme/alpha", ref, revision, artifacts: [{ path: target.path, sha: target.blobSha }] }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.code, "source_blob_missing");
        return true;
      },
    );
  });
});

test("created zip is a valid archive containing the manifest and selected files", async () => {
  const zip = createZip([
    { path: "ARE-MANIFEST.json", content: Buffer.from('{"format":"ARE-PACKAGE-V2"}') },
    { path: "files/.github/workflows/ci.yml", content: Buffer.from("name: CI\n") },
  ]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50, "local file header signature");
  // End-of-central-directory record is present and names two entries.
  const eocdIndex = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocdIndex > 0);
  assert.equal(zip.readUInt16LE(eocdIndex + 10), 2);
  // Round-trips through a real zip reader (python) in CI; here we confirm the
  // stored payload survives and is byte-identical for a known entry.
  assert.ok(zip.includes(Buffer.from("name: CI\n")));
  void zlib;
});

test("manifest hashing is order-independent", () => {
  const base = { sourceRevision: "r1", ruleVersion: "v2" };
  const a = buildManifest({ ...base, packageId: "p1", repository: "x/y", artifacts: [
    { path: "b", blobSha: "2", sizeBytes: 1 }, { path: "a", blobSha: "1", sizeBytes: 1 },
  ] });
  const b = buildManifest({ ...base, packageId: "p2", repository: "x/y", artifacts: [
    { path: "a", blobSha: "1", sizeBytes: 1 }, { path: "b", blobSha: "2", sizeBytes: 1 },
  ] });
  assert.equal(a.contentHash, b.contentHash);
  assert.deepEqual(a.artifacts.map((x) => x.path), ["a", "b"]);
});
