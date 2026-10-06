import test from "node:test";
import assert from "node:assert/strict";
import { withTempDataDir } from "./support/fixtures.js";
import { saveDraft, getProduct } from "../server/lib/products.js";
import {
  configureMarketing,
  approveMarketing,
  recordSync,
  listReceipts,
  buildActionPreview,
  defaultMarketingState,
} from "../server/lib/marketing.js";

test("default marketing mode is draft_for_review and unconfigured", () => {
  const state = defaultMarketingState();
  assert.equal(state.mode, "draft_for_review");
  assert.equal(state.status, "unconfigured");
  assert.equal(state.approval, "not_requested");
  assert.equal(state.enabled, false);
});

test("configuration alone does not grant approval or send authority", async () => {
  await withTempDataDir(async () => {
    const p = await saveDraft({ title: "OneUp" });
    const { product, preview } = await configureMarketing(p.id, {
      enabled: true,
      oneup_product_id: "oneup-prod-1",
      oneup_campaign_id: "camp-9",
      terms: ["github actions", "ci/cd"],
    });
    assert.equal(product.marketing.mode, "draft_for_review");
    assert.equal(product.marketing.approval, "pending");
    assert.equal(product.marketing.status, "needs_oneup_link");
    assert.notEqual(product.marketing.approval, "approved");
    assert.equal(preview.platform, "reddit");
    assert.equal(preview.mode, "draft_for_review");
    assert.equal(preview.campaignId, "camp-9");
  });
});

test("action preview carries platform, target, campaign, product and mode", async () => {
  await withTempDataDir(async () => {
    const p = await saveDraft({ title: "Preview" });
    const preview = buildActionPreview(p, { oneup_campaign_id: "c1", terms: ["devops"], targeting: "backend devs" });
    for (const key of ["platform", "productId", "campaignId", "mode", "terms", "targeting"]) {
      assert.ok(key in preview, `preview has ${key}`);
    }
    assert.equal(preview.mode, "draft_for_review");
  });
});

test("approval is a separate action and never becomes standing send authority", async () => {
  await withTempDataDir(async () => {
    const p = await saveDraft({ title: "Approve" });
    await assert.rejects(() => approveMarketing(p.id, { approval: true }), (e) => e.code === "marketing_not_configured");
    await configureMarketing(p.id, { enabled: true, oneup_campaign_id: "c2" });
    const approved = await approveMarketing(p.id, { approval: true });
    assert.equal(approved.marketing.approval, "approved");
    assert.equal(approved.marketing.sendAuthority, false);
    const revoked = await approveMarketing(p.id, { approval: false });
    assert.equal(revoked.marketing.approval, "revoked");
  });
});

test("every consequential action creates a receipt with the required fields", async () => {
  await withTempDataDir(async () => {
    const p = await saveDraft({ title: "Receipts" });
    await configureMarketing(p.id, { enabled: true, oneup_campaign_id: "c3" });
    await approveMarketing(p.id, { approval: true });
    await recordSync(p.id, { externalId: "c3" });
    const receipts = await listReceipts({ productId: p.id });
    const actions = receipts.map((r) => r.action).sort();
    assert.deepEqual(actions, ["marketing_approval", "marketing_configuration", "marketing_sync_readback"]);
    for (const r of receipts) {
      assert.ok(r.action && r.at && r.product_id && r.mode && r.actor && "external_id" in r && "result" in r);
    }
  });
});

test("marketing config is independent from publishing status", async () => {
  await withTempDataDir(async () => {
    const p = await saveDraft({ title: "Independent" });
    await configureMarketing(p.id, { enabled: true });
    const stored = await getProduct(p.id);
    assert.equal(stored.status, "draft", "product remains a draft");
    assert.equal(stored.marketing.enabled, true);
  });
});
