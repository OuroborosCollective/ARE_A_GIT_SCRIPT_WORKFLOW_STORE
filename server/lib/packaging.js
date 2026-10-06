import fsp from "node:fs/promises";
import path from "node:path";
import { archiveDir, config } from "./config.js";
import { HttpError } from "./http.js";
import { newId, nowIso, store } from "./store.js";
import { buildManifest, createZip, sha256Hex, MissingBlobError, SourceChangedError, MANIFEST_FORMAT } from "./evidence.js";

// Builds an evidence archive bound to the exact scanned revision. Before
// writing anything it re-reads the CURRENT tree for the repository ref and
// verifies every selected path against its scanned blob SHA. A drift or a
// missing blob aborts with 409 and requires a fresh scan (no silent refresh).
export async function buildPackage({ provider, repository, ref, revision, ruleVersion, artifacts, title }) {
  if (!repository || !revision) throw new HttpError(400, "package_requires_repository_and_revision");
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new HttpError(400, "package_requires_selection");
  }

  // Current state of the branch. If the branch moved, the selected files are
  // checked individually so an unrelated change elsewhere does not block reuse.
  const current = await provider.resolveRevision(repository, ref);
  const currentTree = await provider.fetchTree(repository, current.revision);
  const currentByPath = new Map(currentTree.map((b) => [b.path, b]));

  const verified = [];
  for (const artifact of artifacts) {
    const entry = currentByPath.get(artifact.path);
    if (!entry) throw new MissingBlobError(artifact.path, artifact.sha);
    if (entry.blobSha !== artifact.sha) {
      throw new SourceChangedError(artifact.sha, entry.blobSha, artifact.path);
    }
    verified.push({ path: artifact.path, blobSha: entry.blobSha, sizeBytes: entry.sizeBytes });
  }

  // Fetch the verified contents only after every check passed.
  for (const v of verified) {
    v.content = await provider.fetchBlob(repository, v.blobSha);
  }

  const packageId = newId("pkg");
  const createdAt = nowIso();
  const manifest = buildManifest({
    packageId,
    repository,
    ref: ref || null,
    sourceRevision: revision,
    ruleVersion: ruleVersion || "are-portability-v2",
    createdAt,
    artifacts: verified.map((v) => ({
      path: v.path,
      blobSha: v.blobSha,
      sizeBytes: v.sizeBytes,
      kind: artifacts.find((a) => a.path === v.path)?.kind || "unknown",
    })),
  });

  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  const entries = [
    { path: "ARE-MANIFEST.json", content: manifestBytes },
    ...verified.map((v) => ({ path: `files/${v.path}`, content: v.content })),
  ];
  const zip = createZip(entries, { date: new Date(createdAt) });
  const archiveSha256 = sha256Hex(zip);
  const archiveFilename = `${packageId}.zip`;
  const archivePath = path.join(archiveDir(), archiveFilename);

  await fsp.mkdir(archiveDir(), { recursive: true });
  await fsp.writeFile(archivePath, zip);

  const record = {
    id: packageId,
    manifest_format: MANIFEST_FORMAT,
    repository,
    ref: ref || null,
    source_revision: revision,
    rule_version: manifest.ruleVersion,
    title: title || repository,
    artifact_count: verified.length,
    artifact_paths: verified.map((v) => v.path),
    content_hash: manifest.contentHash,
    archive_sha256: archiveSha256,
    archive_path: archivePath,
    archive_filename: archiveFilename,
    archive_url: `${config.publicOrigin}/api/products/package/${packageId}`,
    image_url: null,
    manifest,
    created_at: createdAt,
  };

  await store.scans.mutate((data) => {
    data[packageId] = record;
  });

  return record;
}

export async function getPackage(packageId) {
  return store.scans.read((data) => data[packageId] || null);
}

export async function readPackageArchive(packageId) {
  const record = await getPackage(packageId);
  if (!record) return null;
  try {
    const buf = await fsp.readFile(record.archive_path);
    return { record, buf };
  } catch {
    return { record, buf: null };
  }
}
