import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { dataDir } from "./config.js";

// A tiny durable JSON store. One file per collection keeps writes small and
// lets tests point ARE_DATA_DIR at a temp directory for a clean ledger.
const COLLECTIONS = ["products", "scans", "sessions", "receipts", "ledger", "oauth_states"];

class Collection {
  constructor(name) {
    this.name = name;
    this.queue = Promise.resolve();
    this.data = null;
    this.loadedDir = null;
  }

  // The file path is resolved per call so ARE_DATA_DIR can change between runs.
  get file() {
    return path.join(dataDir(), `${this.name}.json`);
  }

  async load() {
    // Reload when the data directory changed (e.g. a test pointed it at a
    // fresh temp dir) so stale in-memory state never leaks across runs.
    if (this.data && this.loadedDir === dataDir()) return this.data;
    try {
      this.data = JSON.parse(await fsp.readFile(this.file, "utf8"));
    } catch {
      this.data = {};
    }
    this.loadedDir = dataDir();
    return this.data;
  }

  // Serialize read-modify-write so concurrent requests cannot lose updates.
  async mutate(fn) {
    const run = this.queue.then(async () => {
      const data = await this.load();
      const result = await fn(data);
      await this.persist(data);
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async read(fn) {
    const data = await this.load();
    return fn(data);
  }

  async persist(data) {
    await fsp.mkdir(dataDir(), { recursive: true });
    const tmp = `${this.file}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
    await fsp.rename(tmp, this.file);
  }
}

const collections = Object.fromEntries(COLLECTIONS.map((c) => [c, new Collection(c)]));

export const store = {
  products: collections.products,
  scans: collections.scans,
  sessions: collections.sessions,
  receipts: collections.receipts,
  ledger: collections.ledger,
  oauthStates: collections.oauth_states,
};

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("hex")}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function ensureDataDir() {
  fs.mkdirSync(dataDir(), { recursive: true });
  return dataDir();
}
