import { json, readJson, url, HttpError, errorPayload } from "../lib/http.js";
import { getProvider } from "../lib/github.js";
import { buildPackage, getPackage, readPackageArchive } from "../lib/packaging.js";
import {
  saveDraft,
  updateProduct,
  getProduct,
  listProducts,
  listPublicProducts,
  transitionProduct,
  publicProductView,
  adminProductView,
} from "../lib/products.js";
import { configureMarketing, approveMarketing, recordSync, listReceipts, buildActionPreview } from "../lib/marketing.js";
import { appendLedger } from "../lib/ledger.js";

export const productRoutes = [
  // --- Discovery packaging -------------------------------------------------
  {
    method: "POST",
    path: "/api/products/package",
    handler: async (req, res) => {
      const body = await readJson(req);
      const provider = getProvider();
      try {
        const record = await buildPackage({
          provider,
          repository: body.repository,
          ref: body.branch || body.ref,
          revision: body.revision,
          ruleVersion: body.rule_version,
          artifacts: body.artifacts,
          title: body.title,
        });
        await appendLedger({
          change: `Evidence archive ${record.id} built`,
          insight: "Packaged only the scanned revision's selected blobs.",
          evidence: {
            repository: record.repository,
            sourceRevision: record.source_revision,
            artifactCount: record.artifact_count,
            archiveSha256: record.archive_sha256,
            manifestFormat: record.manifest_format,
          },
          result: "verified",
        });
        json(res, 200, {
          package_id: record.id,
          manifest_version: record.manifest_format,
          manifest: record.manifest,
          artifact_count: record.artifact_count,
          archive_url: record.archive_url,
          archive_path: record.archive_path,
          archive_sha256: record.archive_sha256,
          source_revision: record.source_revision,
          image_url: record.image_url,
        });
      } catch (err) {
        if (err.status === 409) {
          json(res, 409, {
            error: err.code,
            message: "The source changed since the scan. Run a fresh scan before packaging.",
            expectedSha: err.expectedSha || null,
            actualSha: err.actualSha || null,
            path: err.path || null,
            requiresRescan: true,
          });
          return;
        }
        throw err;
      }
    },
  },
  {
    method: "GET",
    path: "/api/products/package/:id",
    handler: async (req, res, params) => {
      const { record, buf } = await readPackageArchive(params.id);
      if (!record) throw new HttpError(404, "package_not_found");
      if (!buf) throw new HttpError(410, "package_archive_unavailable");
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${record.archive_filename}"`,
        "content-length": buf.length,
        "x-are-package-id": record.id,
        "x-are-source-revision": record.source_revision,
        "x-are-sha256": record.archive_sha256,
      });
      res.end(buf);
    },
  },
  {
    method: "GET",
    path: "/api/products/package/:id/manifest",
    handler: async (req, res, params) => {
      const record = await getPackage(params.id);
      if (!record) throw new HttpError(404, "package_not_found");
      json(res, 200, record.manifest);
    },
  },

  // --- Product lifecycle ---------------------------------------------------
  {
    method: "POST",
    path: "/api/products/save",
    handler: async (req, res) => {
      const body = await readJson(req);
      const product = await saveDraft(body);
      await appendLedger({
        change: `Product draft ${product.id} saved`,
        insight: "Draft is owner-visible only until an explicit publish.",
        evidence: { productId: product.id, repository: product.repository, sourceRevision: product.source_revision },
      });
      json(res, 200, {
        id: product.id,
        status: product.status,
        artifact_paths: product.artifact_paths,
        repository: product.repository,
        source_revision: product.source_revision,
      });
    },
  },
  {
    method: "GET",
    path: "/api/products/list",
    handler: async (req, res) => {
      const products = await listProducts();
      json(res, 200, { products: products.map(adminProductView) });
    },
  },
  {
    method: "GET",
    path: "/api/products/public",
    handler: async (req, res) => {
      const id = url(req).searchParams.get("product_id");
      if (!id) throw new HttpError(400, "product_id_required");
      const product = await getProduct(id);
      // Drafts and archived products are never exposed publicly.
      if (!product || product.status !== "published") throw new HttpError(404, "published_product_not_found");
      json(res, 200, { product: publicProductView(product) });
    },
  },
  {
    method: "GET",
    path: "/api/products/catalog",
    handler: async (req, res) => {
      const products = await listPublicProducts();
      json(res, 200, {
        schema_version: "are-public-catalog.v1",
        products: products.map(publicProductView),
      });
    },
  },
  {
    method: "GET",
    path: "/api/products/admin",
    handler: async (req, res) => {
      const id = url(req).searchParams.get("product_id");
      const product = await getProduct(id);
      if (!product) throw new HttpError(404, "product_not_found");
      json(res, 200, { product: adminProductView(product), marketing_preview: buildActionPreview(product) });
    },
  },
  {
    method: "POST",
    path: "/api/products/update",
    handler: async (req, res) => {
      const body = await readJson(req);
      if (!body.id) throw new HttpError(400, "product_id_required");
      const product = await updateProduct(body.id, body);
      json(res, 200, { product: adminProductView(product) });
    },
  },
  {
    method: "POST",
    path: "/api/products/publish",
    handler: async (req, res) => {
      const body = await readJson(req);
      if (!body.product_id) throw new HttpError(400, "product_id_required");
      // Explicit publish/unpublish action only. Marketing authority is never
      // implied by publishing.
      const next = body.status || "published";
      const product = await transitionProduct(body.product_id, next, { actor: body.actor || "owner" });
      await appendLedger({
        change: `Product ${product.id} -> ${product.status}`,
        insight: "Publishing is an explicit owner action; marketing authority is unaffected.",
        evidence: {
          productId: product.id,
          status: product.status,
          stateLog: product.state_log.slice(-1),
          marketingApproval: product.marketing?.approval || "not_requested",
        },
      });
      json(res, 200, { product: adminProductView(product) });
    },
  },

  // --- Marketing consent boundary -----------------------------------------
  {
    method: "POST",
    path: "/api/products/marketing",
    handler: async (req, res) => {
      const body = await readJson(req);
      if (!body.product_id) throw new HttpError(400, "product_id_required");
      const result = await configureMarketing(body.product_id, body);
      json(res, 200, { product: adminProductView(result.product), preview: result.preview });
    },
  },
  {
    method: "POST",
    path: "/api/products/marketing-approval",
    handler: async (req, res) => {
      const body = await readJson(req);
      if (!body.product_id) throw new HttpError(400, "product_id_required");
      const product = await approveMarketing(body.product_id, { approval: Boolean(body.approval), actor: body.actor });
      json(res, 200, { product: adminProductView(product) });
    },
  },
  {
    method: "POST",
    path: "/api/products/marketing-sync",
    handler: async (req, res) => {
      const body = await readJson(req);
      if (!body.product_id) throw new HttpError(400, "product_id_required");
      const product = await recordSync(body.product_id, body);
      json(res, 200, { product: adminProductView(product) });
    },
  },
  {
    method: "GET",
    path: "/api/products/receipts",
    handler: async (req, res) => {
      const productId = url(req).searchParams.get("product_id") || undefined;
      json(res, 200, { receipts: await listReceipts({ productId }) });
    },
  },

  // --- Operational status --------------------------------------------------
  {
    method: "GET",
    path: "/api/admin/status",
    handler: async (req, res) => {
      const products = await listProducts();
      json(res, 200, {
        products: products.length,
        published: products.filter((p) => p.status === "published").length,
        drafts: products.filter((p) => p.status === "draft").length,
        archived: products.filter((p) => p.status === "archived").length,
        receipts: (await listReceipts()).length,
      });
    },
  },
];

export { errorPayload };
