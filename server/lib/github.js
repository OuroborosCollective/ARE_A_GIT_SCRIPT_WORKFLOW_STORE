import { config } from "./config.js";
import { HttpError } from "./http.js";
import { gitBlobSha } from "./evidence.js";

// Provider boundary for GitHub. The store's pipeline logic never talks to the
// network directly; it depends on this interface. The production provider is a
// real HTTP client; tests can supply a deterministic fixture provider.
export class GitHubProvider {
  constructor({ token, apiBase = config.github.apiBase } = {}) {
    this.token = token || "";
    this.apiBase = apiBase;
  }

  async request(path, { method = "GET", body, raw = false } = {}) {
    const headers = {
      accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
      "user-agent": "are-store",
      "x-github-api-version": "2022-11-28",
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new HttpError(res.status === 401 || res.status === 403 ? 401 : 502, "github_request_failed", {
        status: res.status,
        path,
        detail: detail.slice(0, 300),
      });
    }
    if (raw) return Buffer.from(await res.arrayBuffer());
    return res.json();
  }

  async listRepositories(query = "") {
    const repos = [];
    for (let page = 1; page <= 5; page++) {
      const batch = await this.request(`/user/repos?per_page=100&sort=updated&page=${page}`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      repos.push(...batch);
      if (batch.length < 100) break;
    }
    const q = query.trim().toLowerCase();
    return repos
      .filter((r) => !q || r.full_name.toLowerCase().includes(q))
      .map((r) => ({
        full_name: r.full_name,
        default_branch: r.default_branch,
        private: Boolean(r.private),
        language: r.language || null,
        updated_at: r.updated_at,
      }));
  }

  async resolveRevision(ownerRepo, ref) {
    const [owner, repo] = splitRepo(ownerRepo);
    const target = ref || (await this.request(`/repos/${owner}/${repo}`)).default_branch;
    const commit = await this.request(`/repos/${owner}/${repo}/commits/${encodeURIComponent(target)}`);
    return { ref: target, revision: commit.sha };
  }

  // Complete recursive Git tree at a concrete revision. GitHub truncates very
  // large trees; when that happens we fail loudly instead of silently selling
  // a partial inventory.
  async fetchTree(ownerRepo, revision) {
    const [owner, repo] = splitRepo(ownerRepo);
    const tree = await this.request(`/repos/${owner}/${repo}/git/trees/${revision}?recursive=1`);
    if (tree.truncated) {
      throw new HttpError(502, "github_tree_truncated", {
        message: "GitHub truncated the repository tree; a complete inventory cannot be guaranteed.",
        requiresRescan: true,
      });
    }
    return (tree.tree || [])
      .filter((entry) => entry.type === "blob")
      .map((entry) => ({
        path: entry.path,
        blobSha: entry.sha,
        sizeBytes: entry.size ?? 0,
      }));
  }

  async fetchBlob(ownerRepo, blobSha) {
    const [owner, repo] = splitRepo(ownerRepo);
    const content = await this.request(`/repos/${owner}/${repo}/git/blobs/${blobSha}`, { raw: true });
    return content;
  }
}

// Deterministic provider backed by an in-memory repository description. Used
// by tests to exercise the real inventory/packaging pipeline without network.
export class FixtureProvider extends GitHubProvider {
  constructor(repos) {
    super({ token: "fixture" });
    this.repos = repos; // { "owner/name": { default_branch, revisions: { rev: [{path, content}] } } }
  }

  _repo(ownerRepo) {
    const repo = this.repos[ownerRepo];
    if (!repo) throw new HttpError(404, "repository_not_found");
    return repo;
  }

  async listRepositories(query = "") {
    const q = query.trim().toLowerCase();
    return Object.keys(this.repos)
      .filter((name) => !q || name.toLowerCase().includes(q))
      .map((name) => ({
        full_name: name,
        default_branch: this.repos[name].default_branch,
        private: false,
        language: null,
        updated_at: null,
      }));
  }

  async resolveRevision(ownerRepo, ref) {
    const repo = this._repo(ownerRepo);
    const target = ref || repo.default_branch;
    const revision = repo.refs?.[target] || target;
    if (!repo.revisions[revision]) throw new HttpError(404, "revision_not_found");
    return { ref: target, revision };
  }

  async fetchTree(ownerRepo, revision) {
    const repo = this._repo(ownerRepo);
    const files = repo.revisions[revision];
    if (!files) throw new HttpError(404, "revision_not_found");
    return files.map((f) => ({
      path: f.path,
      blobSha: gitBlobSha(f.content),
      sizeBytes: Buffer.byteLength(f.content),
    }));
  }

  async fetchBlob(ownerRepo, blobSha) {
    const repo = this._repo(ownerRepo);
    for (const files of Object.values(repo.revisions)) {
      for (const f of files) {
        if (gitBlobSha(f.content) === blobSha) return Buffer.from(f.content);
      }
    }
    throw new HttpError(404, "blob_not_found");
  }
}

function splitRepo(ownerRepo) {
  const [owner, repo] = String(ownerRepo || "").split("/");
  if (!owner || !repo) throw new HttpError(400, "invalid_repository", { repository: ownerRepo });
  return [owner, repo];
}

let activeProvider = null;
export function getProvider() {
  if (!activeProvider) {
    activeProvider = new GitHubProvider({ token: config.github.readToken });
  }
  return activeProvider;
}

export function setProvider(provider) {
  activeProvider = provider;
}
