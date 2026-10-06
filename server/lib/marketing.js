import { store, newId, nowIso } from "./store.js";
import { HttpError } from "./http.js";
import { getProduct } from "./products.js";

// OneUp Today is an external agent capability. This module only records the
// product-level configuration, the explicit approval, and the action receipts.
// It never fabricates an outbound send or an external readback.
export const MARKETING_MODES = ["draft_for_review"];
export const APPROVAL_STATES = ["not_requested", "pending", "approved", "revoked"];

export function defaultMarketingState() {
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

export function buildActionPreview(product, config = {}) {
  const marketing = { ...defaultMarketingState(), ...(product.marketing || {}), ...config };
  return {
    platform: "reddit",
    productId: product.id,
    productTitle: product.title,
    campaignId: marketing.oneup_campaign_id || null,
    oneupProductId: marketing.oneup_product_id || null,
    mode: marketing.mode,
    frequency: marketing.frequency,
    terms: marketing.terms,
    targeting: marketing.targeting,
    // The preview is what the owner reviews before granting anything. It is not
    // an outbound action and carries no send authority.
    consequence:
      "Saves a draft campaign for review in OneUp Today. No message is sent automatically from this action.",
  };
}

export async function configureMarketing(productId, config) {
  const product = await getProduct(productId);
  if (!product) throw new HttpError(404, "product_not_found");
  const mode = config.mode || "draft_for_review";
  if (!MARKETING_MODES.includes(mode)) throw new HttpError(400, "invalid_marketing_mode", { mode });

  const enabled = Boolean(config.enabled);
  const marketing = {
    ...defaultMarketingState(),
    ...product.marketing,
    enabled,
    oneup_product_id: config.oneup_product_id ?? product.marketing?.oneup_product_id ?? null,
    oneup_campaign_id: config.oneup_campaign_id ?? product.marketing?.oneup_campaign_id ?? null,
    mode,
    frequency: config.frequency || product.marketing?.frequency || "daily",
    terms: Array.isArray(config.terms) ? config.terms : product.marketing?.terms || [],
    targeting: config.targeting ?? product.marketing?.targeting ?? "",
    // Configuration alone never implies approval or send authority.
    status: enabled ? "needs_oneup_link" : "unconfigured",
    approval: enabled ? "pending" : "not_requested",
  };

  const updated = await store.products.mutate((data) => {
    const p = data[productId];
    if (!p) throw new HttpError(404, "product_not_found");
    p.marketing = marketing;
    p.updated_at = nowIso();
    return p;
  });

  await recordReceipt({
    action: "marketing_configuration",
    productId,
    mode: marketing.mode,
    actor: config.actor || "owner",
    externalId: marketing.oneup_campaign_id,
    result: marketing.status,
  });

  return { product: updated, preview: buildActionPreview(updated) };
}

// Approval is a separate, explicit action. Approving moves a draft-for-review
// configuration to an approved state; it never silently becomes standing send
// authority and never fires an outbound message.
export async function approveMarketing(productId, { approval, actor = "owner" } = {}) {
  const product = await getProduct(productId);
  if (!product) throw new HttpError(404, "product_not_found");
  if (!product.marketing?.enabled) throw new HttpError(409, "marketing_not_configured");

  const nextApproval = approval ? "approved" : "revoked";
  const updated = await store.products.mutate((data) => {
    const p = data[productId];
    if (!p) throw new HttpError(404, "product_not_found");
    p.marketing = {
      ...p.marketing,
      approval: nextApproval,
      // Approval to review a draft is not send authority.
      sendAuthority: false,
    };
    p.updated_at = nowIso();
    return p;
  });

  await recordReceipt({
    action: approval ? "marketing_approval" : "marketing_revocation",
    productId,
    mode: updated.marketing.mode,
    actor,
    externalId: updated.marketing.oneup_campaign_id,
    result: nextApproval,
  });

  return updated;
}

// The external capability is provisioned outside this runtime. This records the
// readback the owner reports back, so the UI never shows a fabricated sync.
export async function recordSync(productId, { lastSyncAt, actor = "owner", externalId } = {}) {
  const product = await getProduct(productId);
  if (!product) throw new HttpError(404, "product_not_found");
  const at = lastSyncAt || nowIso();
  const updated = await store.products.mutate((data) => {
    const p = data[productId];
    if (!p) throw new HttpError(404, "product_not_found");
    p.marketing = { ...p.marketing, last_sync_at: at };
    p.updated_at = nowIso();
    return p;
  });
  await recordReceipt({
    action: "marketing_sync_readback",
    productId,
    mode: updated.marketing.mode,
    actor,
    externalId: externalId || updated.marketing.oneup_campaign_id,
    result: "readback_recorded",
    at,
  });
  return updated;
}

export async function recordReceipt({ action, productId, mode, actor, externalId, result, at }) {
  const receipt = {
    id: newId("rcpt"),
    action,
    productId,
    product_id: productId,
    mode: mode || null,
    actor: actor || "owner",
    externalId: externalId || null,
    external_id: externalId || null,
    result: result || null,
    at: at || nowIso(),
  };
  await store.receipts.mutate((data) => {
    data[receipt.id] = receipt;
  });
  return receipt;
}

export async function listReceipts({ productId } = {}) {
  return store.receipts.read((data) =>
    Object.values(data)
      .filter((r) => !productId || r.product_id === productId)
      .sort((a, b) => (a.at < b.at ? 1 : -1)),
  );
}
