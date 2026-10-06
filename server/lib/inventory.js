// Deterministic repository inventory + portability classification.
// Rule set: are-portability-v2. "Portable" is a finding derived from the file
// content and path, never an assertion invented for a product template.

export const RULE_VERSION = "are-portability-v2";
export const INVENTORY_SCHEMA = "are-repository-inventory.v2";

const EXCLUDED_DIRS = [
  "node_modules/",
  "vendor/",
  "dist/",
  "build/",
  "out/",
  "target/",
  "coverage/",
  ".next/",
  ".nuxt/",
  ".venv/",
  "venv/",
  "__pycache__/",
  ".git/",
  "Pods/",
  ".gradle/",
  ".terraform/",
  "site-packages/",
  "third_party/",
  "3rdparty/",
];

const EXCLUDED_FILE_PATTERNS = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.lock$/,
  /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|mp4|mp3|zip|gz|tgz|tar|jar|war|class|exe|dll|so|dylib|wasm|pdf|bin)$/i,
];

const SCRIPT_EXTENSIONS = {
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".js": "node",
  ".mjs": "node",
  ".cjs": "node",
  ".ts": "typescript",
  ".py": "python",
  ".rb": "ruby",
  ".ps1": "powershell",
  ".groovy": "groovy",
};

const TOOL_SIGNATURES = [
  ["docker", /\bdocker(\s|-)?(compose|build|run|push)\b|\bDockerfile\b/i],
  ["kubernetes", /\bkubectl\b|\bhelm\b|apiVersion:\s*(apps|batch|v1)/i],
  ["terraform", /\bterraform\b/i],
  ["ansible", /\bansible(-playbook)?\b/i],
  ["node", /\bnode\b|\bnpm\b|\byarn\b|\bpnpm\b/i],
  ["python", /\bpython3?\b|\bpip3?\b|\bpoetry\b|\buv\b/i],
  ["go", /\bgo\s+(build|test|run|mod)\b/i],
  ["rust", /\bcargo\b/i],
  ["java", /\bmvn\b|\bgradle\b|\bmaven\b/i],
  ["aws", /\baws\s+(s3|ecr|ecs|lambda|cloudformation)\b/i],
  ["gcp", /\bgcloud\b/i],
  ["azure", /\baz\s+(login|acr|aks|webapp)\b/i],
  ["gh-cli", /\bgh\s+(release|pr|api|workflow)\b/i],
];

const FEATURE_SIGNATURES = [
  ["ci", /\b(test|ci|lint|build)\b/i],
  ["release", /\b(release|publish|tag|version)\b/i],
  ["deploy", /\b(deploy|deployment|rollout)\b/i],
  ["verification", /\b(verify|verification|smoke|health|check)\b/i],
  ["scheduled", /schedule:|cron:/i],
  ["matrix-build", /matrix:/i],
  ["artifact-upload", /upload-artifact|actions\/upload/i],
  ["caching", /actions\/cache|cache:/i],
  ["container", /container:|docker/i],
  ["secret-use", /secrets\.[A-Za-z0-9_]+/],
];

// Findings that require a human adaptation decision before reuse.
const PORTABILITY_RULES = [
  {
    id: "repository-coupling",
    weight: "review",
    reason: "References a specific repository owner/name and needs retargeting.",
    test: (content, ctx) => {
      const owners = ctx.owner && new RegExp(`\\b${escapeRe(ctx.owner)}\\b`, "i").test(content);
      const repo = ctx.repo && new RegExp(`\\b${escapeRe(ctx.repo)}\\b`, "i").test(content);
      return Boolean(owners || repo);
    },
  },
  {
    id: "secret-dependency",
    weight: "review",
    reason: "Requires repository secrets to be provisioned in the target repository.",
    test: (content) => /secrets\.[A-Za-z0-9_]+/.test(content) || /\$\{\{\s*secrets\./i.test(content),
  },
  {
    id: "machine-path",
    weight: "review",
    reason: "Contains an absolute machine path that will not exist elsewhere.",
    test: (content) => /(^|[\s"'=:(])\/(home|Users|opt|mnt|var\/www)\//m.test(content),
  },
  {
    id: "third-party-action",
    weight: "review",
    reason: "Depends on a pinned third-party action or external image.",
    test: (content) => /uses:\s*[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@/.test(content) || /image:\s*[A-Za-z0-9_.:/-]+/.test(content),
  },
  {
    id: "hardcoded-credential",
    weight: "blocker",
    reason: "Contains a hardcoded credential-like literal.",
    test: (content) => /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,})/.test(content),
  },
  {
    id: "network-mutation",
    weight: "review",
    reason: "Performs a mutating external network action that should be reviewed before reuse.",
    test: (content) => /\b(curl|wget)\b[^\n]*(-X\s*(POST|PUT|DELETE|PATCH)|--data|--upload-file)/i.test(content),
  },
];

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Path-only prefilter. A file can only become a candidate when its path shows
// it is automation; this keeps large repositories from requiring a content
// fetch for every blob.
export function candidateKindForPath(path) {
  const lower = path.toLowerCase();
  if (/^\.github\/workflows\/.+\.(ya?ml)$/.test(lower)) return "github_workflow";
  if (/^\.github\/actions\/.+\/action\.(ya?ml)$/.test(lower)) return "composite_action";
  if (/(^|\/)action\.(ya?ml)$/.test(lower)) return "composite_action";
  if (/(^|\/)dockerfile(\..*)?$/.test(lower)) return "dockerfile";
  if (/(^|\/)makefile$/.test(lower)) return "makefile";
  if (/(^|\/)\.gitlab-ci\.ya?ml$/.test(lower)) return "gitlab_ci";
  const ext = lower.slice(lower.lastIndexOf("."));
  if (SCRIPT_EXTENSIONS[ext]) {
    const inScriptDir = /(^|\/)(scripts?|bin|tools?|hooks?|automation)\//.test(lower);
    // A bare source file needs a shebang to qualify; that requires content, so
    // such files are marked "maybe" and confirmed after the content fetch.
    return inScriptDir ? "script" : "maybe_script";
  }
  return null;
}

export function isExcluded(path) {
  if (EXCLUDED_DIRS.some((dir) => path.startsWith(dir) || path.includes(`/${dir}`))) return true;
  return EXCLUDED_FILE_PATTERNS.some((re) => re.test(path));
}

export function classifyPath(path, content) {
  const kind = candidateKindForPath(path);
  if (kind === "maybe_script") {
    return /^#!/.test(content) ? "script" : null;
  }
  return kind;
}

export function detectTools(content) {
  return TOOL_SIGNATURES.filter(([, re]) => re.test(content)).map(([name]) => name);
}

export function detectFeatures(content) {
  return FEATURE_SIGNATURES.filter(([, re]) => re.test(content)).map(([name]) => name);
}

export function assessPortability({ path, content, owner, repo }) {
  const ctx = { owner, repo };
  const reasons = [];
  let blocker = false;
  for (const rule of PORTABILITY_RULES) {
    if (rule.test(content, ctx)) {
      reasons.push(rule.reason);
      if (rule.weight === "blocker") blocker = true;
    }
  }
  return {
    portability: blocker ? "review_required" : reasons.length ? "review_required" : "portable",
    reasons,
  };
}

// Builds the complete inventory for a repository revision. `blobs` is the
// recursive tree metadata; `readFile(path)` returns the file content.
export async function buildInventory({ ownerRepo, ref, revision, blobs, readFile, concurrency = 10 }) {
  const [owner, repo] = String(ownerRepo).split("/");
  const counters = {
    total_blobs: blobs.length,
    workflow_candidates: 0,
    script_candidates: 0,
    excluded_generated_or_vendor: 0,
    portable_candidates: 0,
    review_required_candidates: 0,
  };

  // Step 1: path-only prefilter. Only plausible automation files are fetched.
  const potential = [];
  for (const blob of blobs) {
    if (isExcluded(blob.path)) {
      counters.excluded_generated_or_vendor += 1;
      continue;
    }
    const kind = candidateKindForPath(blob.path);
    if (kind) potential.push({ ...blob, kind });
  }

  // Step 2: bounded-concurrency content fetch so large repositories stay fast
  // without hammering the GitHub API.
  const contents = new Array(potential.length);
  let cursor = 0;
  async function worker() {
    while (cursor < potential.length) {
      const i = cursor++;
      contents[i] = await readFile(potential[i].path);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, potential.length || 1) }, worker));

  // Step 3: classify and assess.
  const artifacts = [];
  for (let i = 0; i < potential.length; i++) {
    const blob = potential[i];
    const content = contents[i];
    const kind = classifyPath(blob.path, content);
    if (!kind) continue;
    if (kind === "github_workflow" || kind === "gitlab_ci") counters.workflow_candidates += 1;
    else counters.script_candidates += 1;

    const { portability, reasons } = assessPortability({ path: blob.path, content, owner, repo });
    if (portability === "portable") counters.portable_candidates += 1;
    else counters.review_required_candidates += 1;

    artifacts.push({
      name: blob.path.split("/").pop(),
      path: blob.path,
      sha: blob.blobSha,
      blob_sha: blob.blobSha,
      size_bytes: blob.sizeBytes,
      kind,
      language: SCRIPT_EXTENSIONS[blob.path.slice(blob.path.lastIndexOf(".")).toLowerCase()] || kind,
      portability,
      portability_reasons: reasons,
      tools: detectTools(content),
      features: detectFeatures(content),
    });
  }

  artifacts.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    schema: INVENTORY_SCHEMA,
    rule_version: RULE_VERSION,
    repository: ownerRepo,
    ref: ref || null,
    revision,
    inventory: {
      ...counters,
      candidate_count: artifacts.length,
    },
    artifacts,
  };
}
