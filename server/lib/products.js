import { store, newId, nowIso } from "./store.js";
import { HttpError } from "./http.js";

// Product lifecycle is an explicit state machine. Publishing and marketing are
// independent: publishing a product never grants marketing send authority.
export const PRODUCT_STATES = ["draft", "published", "archived"];

export const TRANSITIONS = {
  draft: ["published", "archived"],
  published: ["draft", "archived"],
  archived: [],
};

export function assertTransition(from, to) {
  if (from === to) return;
  if (!PRODUCT_STATES.includes(to)) throw new HttpError(400, "invalid_product_state", { to });
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new HttpError(409, "invalid_product_state_transition", { from, to, allowed });
  }
}

export function defaultMarketing() {
  return {
    enabled: false,
    oneup_product_id: null,
    oneup_campaign_id: null,
    mode: "draft_for_review",
    frequency: "daily",
    terms: [],
    targeting: "",
    status: "unconfigured",
    approval: "not_requested",
    last_sync_at: null,
  };
}

function normalizeProduct(input) {
  const marketing = { ...defaultMarketing(), ...(input.marketing || {}) };
  return {
    id: input.id,
    title: String(input.title || "Untitled automation package").slice(0, 200),
    description: String(input.description || ""),
    generated_description: String(input.generated_description || ""),
    guide: String(input.guide || ""),
    price_cents: Math.max(0, Math.round(Number(input.price_cents || 0))),
    special_features: Array.isArray(input.special_features) ? input.special_features.slice(0, 40) : [],
    tools: Array.isArray(input.tools) ? input.tools.slice(0, 40) : [],
    image_url: input.image_url || null,
    image_path: input.image_path || null,
    repository: input.repository || null,
    source_revision: input.source_revision || null,
    artifact_paths: Array.isArray(input.artifact_paths) ? input.artifact_paths : [],
    rule_version: input.rule_version || null,
    inventory_schema: input.inventory_schema || null,
    package_id: input.package_id || null,
    archive_path: input.archive_path || null,
    archive_url: input.archive_url || null,
    manifest: input.manifest || null,
    license: input.license || "Single-repository reuse. Verify portability findings before applying.",
    status: input.status || "draft",
    marketing,
    state_log: Array.isArray(input.state_log) ? input.state_log : [],
    created_at: input.created_at,
    updated_at: input.updated_at,
    published_at: input.published_at || null,
    archived_at: input.archived_at || null,
  };
}

export async function saveDraft(input) {
  const id = input.id || newId("prod");
  const timestamp = nowIso();
  const product = normalizeProduct({
    ...input,
    id,
    status: "draft",
    created_at: input.created_at || timestamp,
    updated_at: timestamp,
    state_log: [{ from: null, to: "draft", action: "save_draft", at: timestamp, actor: input.actor || "owner" }],
  });
  await store.products.mutate((data) => {
    data[id] = product;
  });
  return product;
}

export async function updateProduct(id, patch) {
  return store.products.mutate((data) => {
    const existing = data[id];
    if (!existing) throw new HttpError(404, "product_not_found");
    const merged = normalizeProduct({ ...existing, ...patch, id, updated_at: nowIso() });
    data[id] = merged;
    return merged;
  });
}

export async function getProduct(id) {
  return store.products.read((data) => data[id] || null);
}

export async function listProducts({ includeArchived = true } = {}) {
  return store.products.read((data) => {
    const all = Object.values(data);
    const filtered = includeArchived ? all : all.filter((p) => p.status !== "archived");
    return filtered.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  });
}

export async function listPublicProducts() {
  return store.products.read((data) =>
    Object.values(data)
      .filter((p) => p.status === "published")
      .sort((a, b) => (a.published_at < b.published_at ? 1 : -1)),
  );
}

export async function transitionProduct(id, nextStatus, { actor = "owner" } = {}) {
  return store.products.mutate((data) => {
    const product = data[id];
    if (!product) throw new HttpError(404, "product_not_found");
    const from = product.status;
    assertTransition(from, nextStatus);
    const at = nowIso();
    product.status = nextStatus;
    product.updated_at = at;
    if (nextStatus === "published") product.published_at = at;
    if (nextStatus === "archived") product.archived_at = at;
    product.state_log = [
      ...(product.state_log || []),
      { from, to: nextStatus, action: `transition:${from}->${nextStatus}`, at, actor },
    ];
    return product;
  });
}

export function publicProductView(product) {
  return {
    id: product.id,
    title: product.title,
    description: product.description || product.generated_description,
    price_cents: product.price_cents,
    repository: product.repository,
    source_revision: product.source_revision,
    artifact_count: product.artifact_paths.length,
    artifact_paths: product.artifact_paths,
    rule_version: product.rule_version,
    package_id: product.package_id,
    special_features: product.special_features,
    tools: product.tools,
    guide: product.guide,
    image_url: product.image_url,
    license: product.license,
    published_at: product.published_at,
    public_url: `/product.html?product_id=${encodeURIComponent(product.id)}`,
    manifest_format: product.manifest?.format || null,
  };
}

export function adminProductView(product) {
  return {
    ...product,
    package_state: product.package_id ? "packaged" : "not_packaged",
    marketing_state: product.marketing?.status || "unconfigured",
  };
}
