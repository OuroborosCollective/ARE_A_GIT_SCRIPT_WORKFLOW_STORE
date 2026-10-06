import test from "node:test";
import assert from "node:assert/strict";
import { withTempDataDir } from "./support/fixtures.js";
import {
  saveDraft,
  getProduct,
  transitionProduct,
  listPublicProducts,
  listProducts,
  publicProductView,
} from "../server/lib/products.js";
import { assertTransition } from "../server/lib/products.js";

test("draft -> published is an explicit transition and appears in the public catalog", async () => {
  await withTempDataDir(async () => {
    const p = await saveDraft({ title: "Alpha automation", repository: "acme/alpha", price_cents: 900 });
    assert.equal(p.status, "draft");
    assert.equal((await listPublicProducts()).length, 0, "draft stays private");
    const pub = await transitionProduct(p.id, "published");
    assert.equal(pub.status, "published");
    assert.ok(pub.published_at);
    const catalog = await listPublicProducts();
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].id, p.id);
  });
});

test("published -> draft (unpublish) is explicit and removes from public catalog", async () => {
  await withTempDataDir(async () => {
    const p = await saveDraft({ title: "Beta", repository: "acme/beta" });
    await transitionProduct(p.id, "published");
    const unpub = await transitionProduct(p.id, "draft");
    assert.equal(unpub.status, "draft");
    assert.equal((await listPublicProducts()).length, 0);
  });
});

test("invalid transitions are rejected", async () => {
  await withTempDataDir(async () => {
    const p = await saveDraft({ title: "Gamma" });
    assert.throws(() => assertTransition("archived", "published"), /invalid_product_state_transition/);
    await transitionProduct(p.id, "archived");
    await assert.rejects(() => transitionProduct(p.id, "published"), (e) => e.code === "invalid_product_state_transition");
  });
});

test("every status change is recorded as a server-side mutation in the state log", async () => {
  await withTempDataDir(async () => {
    const p = await saveDraft({ title: "Log" });
    await transitionProduct(p.id, "published");
    await transitionProduct(p.id, "draft");
    const stored = await getProduct(p.id);
    const actions = stored.state_log.map((s) => s.action);
    assert.ok(actions.includes("save_draft"));
    assert.ok(actions.includes("transition:draft->published"));
    assert.ok(actions.includes("transition:published->draft"));
    for (const entry of stored.state_log) assert.ok(entry.at && entry.actor);
  });
});

test("publishing does not imply marketing approval", async () => {
  await withTempDataDir(async () => {
    const p = await saveDraft({ title: "Marketing independence" });
    await transitionProduct(p.id, "published");
    const stored = await getProduct(p.id);
    assert.equal(stored.marketing.approval, "not_requested");
    assert.equal(stored.marketing.enabled, false);
  });
});

test("admin list keeps drafts visible while the public view hides them", async () => {
  await withTempDataDir(async () => {
    const draft = await saveDraft({ title: "Owner draft" });
    const published = await saveDraft({ title: "Public" });
    await transitionProduct(published.id, "published");
    const admin = await listProducts();
    assert.equal(admin.length, 2);
    assert.equal((await listPublicProducts()).length, 1);
    assert.equal(publicProductView(draft).public_url.includes(draft.id), true);
  });
});
