# ai-canary

Cloudflare Worker that logs when anything fetches a tracked URL to catch AI crawlers, bots, and browsers server-side, after which you redirect the visitor.

Flow: `GET /webhook` → classify User-Agent → `INSERT` into D1 → `302` redirect.

## Config

### wrangler.toml

| Key | Value | Description |
|-----|-------|-------------|
| `name` | `cdn-assets` | Worker name |
| `main` | `worker.js` | Entry point |

### Secrets

Set via `npx wrangler secret put <NAME>` (encrypted, not stored in the repo):

| Key | Example | Description |
|-----|---------|-------------|
| `REDIRECT_WHITELIST` | `https://zapparov.dev,https://example.com/page` | Comma-separated full URLs allowed for `?redirect=` (exact match, no wildcards) |

### D1 binding

Configured in `wrangler.toml`. The `database_id` is already filled in with
the real ID for this project's D1 database. If you want a fresh database,
run `npm run db:create`, then replace the `database_id` value in
`wrangler.toml` with the new one.

The `database_name` is also hardcoded in several `package.json` scripts
(`db:create`, `db:apply:*`, `db:query`, `db:read`, `logs`). If you rename
the database, update those scripts too — or just keep the name `ai-canary`
regardless of the Worker name (the code uses the `DB` binding, not the
name).

| Key | Value |
|-----|-------|
| `binding` | `DB` |
| `database_name` | `ai-canary` |
| `database_id` | Set in `wrangler.toml` (replace if creating a new database) |

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

Opens a browser — authorize wrangler with your Cloudflare account. One-time.

### 3. Create the D1 database (if needed)

The `database_id` in `wrangler.toml` is already configured for this
project. If you're deploying to your own Cloudflare account, create a new
one:

```bash
npm run db:create
```

This prints a `database_id` — replace the existing value in
`wrangler.toml` with it.

### 4. Apply the schema

```bash
npm run db:apply:remote
```

Creates the `hits` table on the remote D1.

### 5. Deploy

```bash
npm run deploy
```

Live at `https://cdn-assets.<your-subdomain>.workers.dev`.

### Deploy via GitHub (Workers Builds)

Alternative to step 5 — auto-deploys on every push:

1. Push the repo to GitHub
2. Cloudflare dashboard → Workers & Pages → Create application → Create Worker → Import a repository
3. Select repo, branch `main`, build command `npx wrangler deploy`

### Test locally

```bash
cp .dev.vars.example .dev.vars    # add REDIRECT_WHITELIST for local `wrangler dev`
npm run dev                       # http://localhost:8787
npm run db:apply:local            # creates hits table in local D1
```

## Usage

Only `/webhook` triggers tracking. All other paths return 404.
Only a URL that exactly matches an entry in `REDIRECT_WHITELIST` can be redirected to. There is no default redirect.

| URL | Result |
|-----|--------|
| `/webhook` | 404 (no `?redirect=` param) |
| `/webhook?redirect=https://zapparov.dev` | `302` → `https://zapparov.dev` |
| `/webhook?redirect=https://evil.com` | `400` (not in whitelist) |
| `/anything-else` | 404 |

`?redirect=` must exactly match a URL listed in `REDIRECT_WHITELIST`
(a comma-separated list of full URLs set as a Cloudflare secret via
`npx wrangler secret put REDIRECT_WHITELIST`, e.g.
`https://zapparov.dev,https://example.com/page`).
No domain wildcard or subdomain matching — each allowed destination must be
listed explicitly. Non-matching URLs are rejected with `400`. Update the
secret and redeploy to change it. The full query string is
logged in the `query` field.

### Viewing logs

```bash
npm run tail    # live stream of Worker requests (wrangler tail)
npm run logs    # last 200 hits from D1
```

`npm run logs` queries D1 directly via wrangler (already authenticated) —
returns the last 200 hits. For arbitrary read-only queries:

```bash
npm run db:read -- "SELECT * FROM hits WHERE recordcategory LIKE 'ai:%' ORDER BY id DESC LIMIT 50"
```

`db:read` rejects any statement that isn't `SELECT` / `WITH` / `EXPLAIN` /
`PRAGMA` — a footgun guard against accidental `DELETE` / `UPDATE` / `DROP`.
For schema changes or intentional writes, use `npm run db:query -- "<SQL>"`
(full access).

## D1 schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment primary key |
| `timestamp` | TEXT | ISO 8601 request time |
| `ip` | TEXT | Visitor IP |
| `country` | TEXT | Country (from Cloudflare) |
| `asn` | INTEGER | Network ASN |
| `network_org` | TEXT | Network org (e.g. "OpenAI", "Anthropic") |
| `method` | TEXT | HTTP method |
| `usedlink` | TEXT | Path that was hit (`webhook`) |
| `query` | TEXT | Full query string (includes `?redirect=`) |
| `referer` | TEXT | Referer header (absence is a signal) |
| `useragent` | TEXT | User-Agent string |
| `accept` | TEXT | Accept header |
| `recordcategory` | TEXT | Classification: `ai:ClaudeBot`, `bot-generic`, `browser`, `unknown-no-user-agent` |
| `headers` | TEXT | Full header dump as JSON |

## Classification

| Category | Meaning |
|----------|---------|
| `ai:<name>` | Matched a known AI agent (see list below) |
| `bot-generic` | Matched HTTP client patterns (python, curl, axios, node-fetch, etc.) |
| `browser` | Didn't match either check |
| `unknown-no-user-agent` | No User-Agent header at all |

Known AI agents (matched case-insensitively against the User-Agent):
ClaudeBot, Claude-User, Claude-SearchBot, anthropic-ai, GPTBot,
OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User,
Google-Extended, Googlebot, Bingbot, Applebot, Bytespider, Amazonbot,
CCBot, meta-externalagent, FacebookBot, DuckAssistBot, cohere-ai, YouBot,
Diffbot. See `AI_AGENTS` in `worker.js` for the source list.

## Notes

- `network_org` is the most useful field — names the network even when UA is blank or spoofed.
- Redirect whitelist: `?redirect=` only accepts URLs that exactly match an entry in `REDIRECT_WHITELIST` (a Cloudflare secret, comma-separated full URLs). No domain wildcard or subdomain matching — list each destination explicitly. Update the secret (`npx wrangler secret put REDIRECT_WHITELIST`) and redeploy to change the set.
- There is no retention/decay policy — rows accumulate in D1 indefinitely.
