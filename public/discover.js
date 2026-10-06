import { api, esc, el, setStatus } from "/shared.js";

// Discovery state. Every repository change resets the entire workspace so no
// artifact, package, manifest, metadata or OneUp state leaks between sessions.
const state = {
  selectedRepo: null,
  scan: null,
  package: null,
  confirmed: false,
  saving: false,
};

function defaultMarketingState() {
  return {
    enabled: false,
    oneup_product_id: null,
    oneup_campaign_id: null,
    mode: "draft_for_review",
    frequency: "daily",
    terms: [],
    targeting: "",
    status: "unconfigured",
  };
}

function selected() {
  return [...document.querySelectorAll("#artifacts input:checked")]
    .map((x) => state.scan?.artifacts?.[Number(x.dataset.i)])
    .filter(Boolean);
}

function resetWorkspace({ keepMessage = false } = {}) {
  state.selectedRepo = null;
  state.scan = null;
  state.package = null;
  state.confirmed = false;

  el("#selected").textContent = "None selected";
  el("#scanState").textContent = "Connect GitHub to begin.";
  el("#inventoryReadback").textContent = "";
  el("#confirmRepo").hidden = true;
  el("#confirmRepo").disabled = false;
  el("#confirmRepo").textContent = "Confirm & analyze repository";
  el("#artifacts").innerHTML = "";
  el("#package").disabled = true;
  el("#packageState").textContent = "";
  el("#packageError").innerHTML = "";
  el("#archiveUrl").hidden = true;
  el("#archiveUrl").removeAttribute("href");
  el("#manifest").textContent = "";
  el("#productForm").hidden = true;

  for (const id of ["#pTitle", "#pDescription", "#pFeatures", "#pTools", "#pGuide", "#pPrice", "#archivePath"]) {
    const node = el(id);
    if (node) node.value = "";
  }
  el("#archivePath").textContent = "";
  el("#marketingEnabled").checked = false;
  el("#oneupProductId").value = "";
  el("#oneupCampaignId").value = "";
  el("#marketingMode").value = "draft_for_review";
  el("#marketingFrequency").value = "daily";
  el("#marketingTerms").value = "";
  el("#marketingTargeting").value = "";
  el("#saveState").textContent = "";
  el("#saveState").className = "form-hint";
  el("#saveProduct").disabled = false;
  state.marketing = defaultMarketingState();
  if (!keepMessage) setStatus(el("#saveState"), "");
}

function metadata() {
  const picked = selected();
  const features = [...new Set(picked.flatMap((a) => a.features || []))];
  const tools = [...new Set(picked.flatMap((a) => a.tools || []))];
  const portable = picked.filter((a) => a.portability === "portable").length;
  const review = picked.length - portable;
  const revision = state.scan?.revision || "unknown";
  const rule = state.scan?.rule_version || "are-portability-v2";
  const desc =
    `Evidence-bound automation package extracted from ${state.selectedRepo}. ` +
    `The current GitHub inventory contains ${state.scan?.inventory?.candidate_count || picked.length} real automation candidate(s); ` +
    `this product selects ${picked.length}. ${portable} selected candidate(s) are portable under the current rule set and ` +
    `${review} require adaptation review. The package preserves source paths and blob SHAs.`;
  const guide =
    `1. Inspect ARE-MANIFEST.json after download.\n` +
    `2. Copy only the selected files to the target repository using their original relative paths.\n` +
    `3. Address every portability finding before reuse.\n` +
    `4. Run and verify the automation in the target repository.\n\n` +
    `Source repository: ${state.selectedRepo}\nSource revision: ${revision}\nRule set: ${rule}`;
  return { features, tools, description: desc, guide, revision, rule };
}

function fillMetadata() {
  const m = metadata();
  el("#pDescription").value = m.description;
  el("#pGuide").value = m.guide;
  el("#pFeatures").value = m.features.join("\n");
  el("#pTools").value = m.tools.join("\n");
}

async function loadConnection() {
  try {
    const { authenticated, session } = await api("/github/session");
    if (authenticated) {
      el("#connectionStatus").textContent = `Connected as ${session.login}`;
      el("#connectionDetail").textContent =
        `Read scope: ${(session.readGrant?.scopes || []).join(" ") || "none"} · ` +
        `Write scope: ${(session.writeGrant?.scopes || []).join(" ") || "not granted"} · ` +
        `Last used: ${session.lastUsedAt}`;
      el("#disconnect").hidden = false;
      el("#connect").textContent = "Reconnect GitHub";
    } else {
      el("#connectionStatus").textContent = "Not connected";
      el("#disconnect").hidden = true;
    }
  } catch {
    el("#connectionStatus").textContent = "Connection status unavailable";
  }
}

async function loadRepos() {
  const q = el("#repoSearch").value || "";
  el("#repos").innerHTML = `<div class="skeleton" role="status" aria-label="Loading repositories"></div>`;
  try {
    const { repositories } = await api(`/github/repos?q=${encodeURIComponent(q)}`);
    el("#repos").innerHTML =
      repositories
        .map(
          (r) =>
            `<button class="repo-row" type="button" data-repo="${esc(r.full_name)}">
              <span><b>${esc(r.full_name)}</b><small>${esc(r.language || "mixed")} · ${r.private ? "private" : "public"}</small></span>
              <span>Inspect →</span>
            </button>`,
        )
        .join("") || `<p class="form-hint">No repositories found.</p>`;
    document.querySelectorAll(".repo-row").forEach((b) => (b.onclick = () => selectRepo(b.dataset.repo)));
  } catch (e) {
    el("#repos").innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

function selectRepo(repo) {
  resetWorkspace();
  state.selectedRepo = repo;
  el("#selected").textContent = repo;
  el("#scanState").textContent = "Repository selected — confirm analysis before scanning.";
  el("#confirmRepo").hidden = false;
}

function renderArtifacts() {
  const d = state.scan;
  const artifacts = d.artifacts || [];
  el("#artifacts").innerHTML =
    artifacts
      .map(
        (a, i) =>
          `<label class="artifact-row">
            <input type="checkbox" ${a.portability === "portable" ? "checked" : ""} data-i="${i}">
            <span>
              <b>${esc(a.name)}</b>
              <small class="mono">${esc(a.path)} · ${esc(a.kind)} · ${a.size_bytes || 0} bytes · <span class="status-badge ${a.portability === "portable" ? "status-portable" : "status-review"}">${esc(a.portability === "portable" ? "PORTABLE" : "REVIEW REQUIRED")}</span></small>
              <small class="mono">SHA ${esc((a.sha || "").slice(0, 12))}</small>
              <em>${esc((a.portability_reasons || []).join(" · ") || "No portability blockers detected by ARE v2")}</em>
              <em>Tools: ${esc((a.tools || []).join(", ") || "none")} · Features: ${esc((a.features || []).join(", ") || "none")}</em>
            </span>
          </label>`,
      )
      .join("") || `<p class="form-hint">No supported automation candidates found in this repository revision.</p>`;
  const count = selected().length;
  el("#package").disabled = count === 0;
  el("#productForm").hidden = count === 0;
  if (count) fillMetadata();
}

async function scan() {
  if (!state.selectedRepo || state.confirmed) return;
  try {
    state.confirmed = true;
    state.package = null;
    el("#confirmRepo").disabled = true;
    el("#scanState").textContent = "Building complete GitHub inventory…";
    const d = await api("/github/scan", { method: "POST", body: JSON.stringify({ owner_repo: state.selectedRepo }) });
    state.scan = d;
    const i = d.inventory || {};
    el("#scanState").textContent = `${i.candidate_count || 0} real candidates · ${i.workflow_candidates || 0} workflows · ${i.script_candidates || 0} scripts`;
    el("#inventoryReadback").textContent =
      `Git tree: ${d.revision} · total blobs: ${i.total_blobs} · portable: ${i.portable_candidates || 0} · ` +
      `review: ${i.review_required_candidates || 0} · excluded generated/vendor: ${i.excluded_generated_or_vendor || 0}`;
    renderArtifacts();
  } catch (e) {
    state.confirmed = false;
    el("#scanState").textContent = "Scan failed: " + e.message;
    el("#confirmRepo").disabled = false;
  }
}

el("#connect").onclick = async () => {
  try {
    const { authorize_url } = await api("/github/oauth/start", { method: "POST", body: JSON.stringify({ scope: "read" }) });
    location.assign(authorize_url);
  } catch (e) {
    setStatus(el("#connectionDetail"), `Connect failed: ${e.message}`, "error");
  }
};
el("#disconnect").onclick = async () => {
  await api("/github/disconnect", { method: "POST", body: JSON.stringify({}) });
  await loadConnection();
  resetWorkspace();
};
el("#search").onclick = loadRepos;
el("#repoSearch").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    loadRepos();
  }
});
el("#confirmRepo").onclick = scan;
el("#newProduct").onclick = () => resetWorkspace();

el("#package").onclick = async () => {
  try {
    const picked = selected();
    if (!picked.length) throw new Error("Select at least one artifact.");
    el("#package").disabled = true;
    el("#packageError").innerHTML = "";
    el("#packageState").textContent = "Building evidence archive bound to scanned revision…";
    const d = await api("/products/package", {
      method: "POST",
      body: JSON.stringify({
        repository: state.selectedRepo,
        branch: state.scan.ref,
        revision: state.scan.revision,
        artifacts: picked.map((a) => ({ path: a.path, sha: a.sha })),
        title: el("#pTitle").value || state.selectedRepo,
        rule_version: state.scan.rule_version,
      }),
    });
    state.package = d;
    el("#archivePath").textContent = d.archive_path;
    el("#packageState").textContent = `Archive ready · ${d.artifact_count} selected file(s) · revision bound`;
    el("#manifest").textContent = JSON.stringify(d.manifest, null, 2);
    el("#archiveUrl").href = d.archive_url;
    el("#archiveUrl").hidden = false;
  } catch (e) {
    if (e.status === 409 && e.body) {
      el("#packageError").innerHTML =
        `<div class="inline-error">The source changed since the scan. Packaging stopped. ` +
        `Expected SHA ${esc(e.body.expectedSha || "?")}, actual SHA ${esc(e.body.actualSha || "?")}. ` +
        `Run a fresh scan before packaging.</div>`;
      state.confirmed = false;
      el("#confirmRepo").disabled = false;
      el("#confirmRepo").hidden = false;
    } else {
      el("#packageError").innerHTML = `<div class="inline-error">${esc(e.message)}</div>`;
    }
    el("#packageState").textContent = "Package failed.";
  } finally {
    el("#package").disabled = selected().length === 0;
  }
};

el("#saveProduct").onclick = async () => {
  if (state.saving) return;
  try {
    const picked = selected();
    if (!picked.length) throw new Error("Select at least one artifact.");
    if (!state.package) throw new Error("Build the archive first.");
    state.saving = true;
    el("#saveProduct").disabled = true;
    const m = metadata();
    const title = el("#pTitle").value.trim() || `${state.selectedRepo} automation package`;
    const terms = (el("#marketingTerms").value || "").split(",").map((s) => s.trim()).filter(Boolean);
    const enabled = el("#marketingEnabled").checked;
    const body = {
      repository: state.selectedRepo,
      artifact_paths: picked.map((a) => a.path),
      title,
      description: el("#pDescription").value || m.description,
      generated_description: m.description,
      guide: el("#pGuide").value || m.guide,
      price_cents: Math.round(Number(el("#pPrice").value || 0) * 100),
      special_features: m.features,
      tools: m.tools,
      archive_path: state.package.archive_path,
      archive_url: state.package.archive_url,
      package_id: state.package.package_id,
      manifest: state.package.manifest,
      rule_version: m.rule,
      source_revision: m.revision,
      inventory_schema: state.scan.schema,
      marketing_enabled: enabled,
      oneup_product_id: el("#oneupProductId").value.trim() || null,
      oneup_campaign_id: el("#oneupCampaignId").value.trim() || null,
      marketing_mode: "draft_for_review",
      marketing_frequency: el("#marketingFrequency").value,
      marketing_terms: terms,
      marketing_targeting: el("#marketingTargeting").value || "",
      marketing_status: enabled ? "needs_oneup_link" : "unconfigured",
    };
    const d = await api("/products/save", { method: "POST", body: JSON.stringify(body) });
    resetWorkspace({ keepMessage: true });
    setStatus(el("#saveState"), `Saved product ${d.id} · ${d.artifact_paths.length} real source file(s) · ready for another repository`, "success");
  } catch (e) {
    setStatus(el("#saveState"), "Save failed: " + e.message, "error");
  } finally {
    state.saving = false;
    el("#saveProduct").disabled = false;
  }
};

document.addEventListener("change", (e) => {
  if (e.target.matches("#artifacts input") && state.scan) {
    const n = selected().length;
    el("#package").disabled = n === 0;
    el("#productForm").hidden = n === 0;
    if (n) fillMetadata();
  }
});

resetWorkspace();
loadConnection();
loadRepos();
