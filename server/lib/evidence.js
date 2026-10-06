import crypto from "node:crypto";

export const MANIFEST_FORMAT = "ARE-PACKAGE-V2";

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Git object hash for a blob: sha1("blob <byteLength>\0" + content).
export function gitBlobSha(content) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${body.length}\0`, "utf8");
  return crypto.createHash("sha1").update(Buffer.concat([header, body])).digest("hex");
}

// Deterministic content fingerprint over revision + sorted path:sha pairs.
// Repeating the same selection over the same revision yields the same value,
// which is what "consistent manifest data" means for regression purposes.
export function manifestFingerprint({ sourceRevision, ruleVersion, artifacts }) {
  const rows = [...artifacts]
    .map((a) => `${a.path}\u0000${a.blobSha}`)
    .sort()
    .join("\n");
  return sha256Hex(`${sourceRevision}\u0000${ruleVersion}\u0000${rows}`);
}

export function buildManifest({ packageId, repository, ref, sourceRevision, ruleVersion, artifacts, createdAt }) {
  const sorted = [...artifacts]
    .map((a) => ({
      path: a.path,
      blobSha: a.blobSha,
      sizeBytes: a.sizeBytes,
      kind: a.kind || "unknown",
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    format: MANIFEST_FORMAT,
    packageId,
    sourceRepository: repository,
    sourceRef: ref || null,
    sourceRevision,
    ruleVersion,
    artifactCount: sorted.length,
    contentHash: manifestFingerprint({ sourceRevision, ruleVersion, artifacts: sorted }),
    createdAt: createdAt || null,
    artifacts: sorted,
  };
}

// ---------------------------------------------------------------------------
// Minimal deterministic ZIP writer (store method, no compression).
// Keeps packaging dependency-free and byte-stable across runs.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date || new Date("2020-01-01T00:00:00Z");
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xffff;
  const day = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  return { time, day };
}

// entries: [{ path, content: Buffer }]
export function createZip(entries, { date } = {}) {
  const { time, day } = dosDateTime(date);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.path, "utf8");
    const data = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10); // store
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, end]);
}

// ---------------------------------------------------------------------------
// Stale-source protection.
// ---------------------------------------------------------------------------

export class SourceChangedError extends Error {
  constructor(expectedSha, actualSha, path) {
    super("source_changed_since_scan");
    this.code = "source_changed_since_scan";
    this.status = 409;
    this.expectedSha = expectedSha;
    this.actualSha = actualSha;
    this.path = path;
    this.requiresRescan = true;
  }
}

export class MissingBlobError extends Error {
  constructor(path, expectedSha) {
    super("source_blob_missing");
    this.code = "source_blob_missing";
    this.status = 409;
    this.path = path;
    this.expectedSha = expectedSha;
    this.requiresRescan = true;
  }
}
