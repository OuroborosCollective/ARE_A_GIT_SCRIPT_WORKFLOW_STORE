# ARE Store — runtime and deployment

The store runs as a single dependency-free Node.js service (Node >= 20). It
serves the Store View from `public/` and the JSON API from `server/`.

## Run locally

```bash
npm start                      # http://localhost:3000
PORT=8080 npm start
```

No install step is required: the project has no runtime dependencies.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default `3000`). |
| `ARE_PUBLIC_ORIGIN` | Absolute origin used for archive and product URLs. |
| `ARE_DATA_DIR` | Directory for the JSON store (default `./data`). |
| `ARE_ARCHIVE_DIR` | Directory for generated evidence archives (default `<data>/archives`). |
| `ARE_SESSION_SECRET` | HMAC secret for the session cookie. Set a long random value in production. |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth app for interactive login (Authorization Code + PKCE, S256). |
| `GITHUB_OAUTH_READ_SCOPE` / `GITHUB_OAUTH_WRITE_SCOPE` | Separate read/write grant boundaries (default `read:user repo`). |
| `ARE_GITHUB_READ_TOKEN` | Server-side read token for discovery when no interactive session is used. Never sent to the browser. |

## Deployment

`Dockerfile` builds a minimal image and runs the server as a non-root user.
Persist `/data` (mounted volume) so products, packages and receipts survive
restarts.

```bash
docker build -t are-store .
docker run -p 3000:3000 -v are-data:/data -e ARE_SESSION_SECRET=... are-store
```

## API surface

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/github/oauth/config` | GET | Whether OAuth is configured. |
| `/api/github/oauth/start` | POST | Begin PKCE authorization. |
| `/api/github/callback` | GET | Exchange code, set session cookie. |
| `/api/github/session` | GET | Current connection card data. |
| `/api/github/disconnect` | POST | Revoke the server-side session. |
| `/api/github/repos` | GET | Repository list for discovery. |
| `/api/github/scan` | POST | Complete inventory at a concrete revision. |
| `/api/products/package` | POST | Build ARE-PACKAGE-V2 archive (409 on source drift). |
| `/api/products/package/:id` | GET | Download the real archive. |
| `/api/products/package/:id/manifest` | GET | Read the manifest. |
| `/api/products/save` | POST | Save a draft. |
| `/api/products/list` | GET | Admin list (drafts included). |
| `/api/products/public` | GET | One published product. |
| `/api/products/catalog` | GET | Published catalog only. |
| `/api/products/publish` | POST | Explicit state transition. |
| `/api/products/marketing` | POST | Configure OneUp (draft-for-review). |
| `/api/products/marketing-approval` | POST | Separate approval/revocation. |
| `/api/products/marketing-sync` | POST | Record an external readback. |
| `/api/products/receipts` | GET | Action receipts. |
| `/api/admin/status` | GET | Operational counts. |
| `/api/ledger` | GET | Evidence ledger entries. |

## Tests

```bash
npm test
```

The suite runs the real inventory, packaging, lifecycle and consent modules.
The only substitute is a deterministic GitHub fixture provider, used in place
of the network; production uses the real `GitHubProvider`.
