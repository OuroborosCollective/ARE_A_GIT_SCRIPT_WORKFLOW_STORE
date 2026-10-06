import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import { FixtureProvider } from "../../server/lib/github.js";

// A deterministic two-repository fixture. The provider is the only thing
// swapped out; the inventory, packaging and product logic under test are the
// real production modules.
export function makeFixtureProvider() {
  return new FixtureProvider({
    "acme/alpha": {
      default_branch: "main",
      refs: { main: "rev-alpha-1" },
      revisions: {
        "rev-alpha-1": [
          {
            path: ".github/workflows/ci.yml",
            content: "name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n",
          },
          {
            path: "scripts/deploy.sh",
            content: "#!/usr/bin/env bash\nset -euo pipefail\necho deploying ${{ secrets.DEPLOY_TOKEN }} to /home/runner/app\n",
          },
          {
            path: "node_modules/left-pad/index.js",
            content: "module.exports = () => {};\n",
          },
          {
            path: "README.md",
            content: "# Alpha\n",
          },
        ],
      },
    },
    "acme/beta": {
      default_branch: "main",
      refs: { main: "rev-beta-1" },
      revisions: {
        "rev-beta-1": [
          {
            path: ".github/workflows/release.yml",
            content: "name: Release\non:\n  push:\n    tags: ['v*']\njobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: softprops/action-gh-release@v2\n",
          },
        ],
      },
    },
  });
}

export async function withTempDataDir(fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "are-test-"));
  const prev = process.env.ARE_DATA_DIR;
  process.env.ARE_DATA_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.ARE_DATA_DIR;
    else process.env.ARE_DATA_DIR = prev;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}
