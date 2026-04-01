# Cloudflare DDNS

A Cloudflare Worker that keeps DNS records in sync with your changing public IP address. Designed for Synology NAS devices but works with any HTTP client.

When your NAS or a cron script calls this worker, it reads the caller's IP from the request, compares it to the existing Cloudflare DNS record, and creates or patches the record if needed. Responses follow the DynDNS2 protocol so Synology DSM recognizes them natively.

## Features

- Synology DSM custom DDNS provider compatibility (`GET /nic/update`)
- JSON API for scripts and automation (`POST /update` with OpenAPI docs)
- IPv4 (A) and IPv6 (AAAA) support
- D1-backed audit log with automatic cleanup
- Hostname allowlist to limit what records can be changed
- Configurable proxied/DNS-only mode and TTL

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- A domain with its DNS managed by Cloudflare
- A [Cloudflare API token](https://dash.cloudflare.com/profile/api-tokens) with **Zone > DNS > Edit** permission for your zone
- [Node.js](https://nodejs.org/) 18+ and [pnpm](https://pnpm.io/)

## Setup

### 1. Clone and install

```sh
git clone https://github.com/<your-org>/cloudflare-ddns.git
cd cloudflare-ddns
pnpm install
```

### 2. Create the D1 database

```sh
npx wrangler d1 create cloudflare-ddns-db
```

Copy the `database_id` from the output and paste it into `wrangler.jsonc` replacing the placeholder `00000000-0000-0000-0000-000000000000`.

### 3. Set secrets

```sh
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put CF_ZONE_ID
npx wrangler secret put DDNS_SHARED_SECRET
npx wrangler secret put DDNS_ALLOWED_HOSTNAMES
```

| Secret | Description |
|---|---|
| `CF_API_TOKEN` | Cloudflare API token with DNS:Edit for your zone |
| `CF_ZONE_ID` | Zone ID (visible on your domain's overview page in the dashboard) |
| `DDNS_SHARED_SECRET` | A password you choose. Callers must send this to authenticate. |
| `DDNS_ALLOWED_HOSTNAMES` | Comma-separated hostnames this worker may update, e.g. `nas.example.com,home.example.com`. Wildcard companions such as `*.nas.example.com` are supported as explicit entries. |

### 4. Deploy

```sh
pnpm deploy
```

This runs D1 migrations automatically before deploying.

## Environment variables

These non-secret variables have defaults in `wrangler.jsonc` and can be overridden per-environment:

| Variable | Default | Description |
|---|---|---|
| `DDNS_PROXIED` | `"false"` | Whether DNS records are proxied through Cloudflare. Most NAS setups need `"false"` (DNS-only) for direct IP access on non-standard ports. |
| `DDNS_TTL` | `"1"` | DNS record TTL in seconds. `"1"` means automatic. Valid range: 60-86400. |
| `DDNS_LOG_RETENTION_DAYS` | `"30"` | How many days of update logs to keep in D1. A cron job runs every 6 hours to prune older rows. |

## Usage

### Synology DSM

In **Control Panel > External Access > DDNS > Customize**:

| Field | Value |
|---|---|
| Service Provider | Any name, e.g. `Cloudflare DDNS` |
| Query URL | `https://<your-worker>.workers.dev/nic/update?hostname=__HOSTNAME__&myip=__MYIP__&username=__USERNAME__&password=__PASSWORD__` |

Then add a DDNS entry:

| Field | Value |
|---|---|
| Service Provider | The custom provider you just created |
| Hostname | `nas.example.com` (must be in your allowed list) |
| Username | Anything (not used, but DSM requires a value) |
| Password | Your `DDNS_SHARED_SECRET` |

DSM will call the worker whenever it detects an IP change. The worker responds with `good <ip>` or `nochg <ip>` on success.

If you want one request for `nas.example.com` to also update `*.nas.example.com`, include both in `DDNS_ALLOWED_HOSTNAMES`, for example `nas.example.com,*.nas.example.com`. The worker treats the wildcard entry as a second managed DNS record and updates both records together.

### JSON API

```sh
curl -X POST https://<your-worker>.workers.dev/update \
  -H "Content-Type: application/json" \
  -H "X-DDNS-Secret: <your-secret>" \
  -d '{"hostname": "nas.example.com", "ip": "203.0.113.1"}'
```

Omit `ip` to use the caller's public IP (from Cloudflare's `CF-Connecting-IP` header). Omit `hostname` to default to the first hostname in your allowed list.

Wildcard records work the same way here: if `DDNS_ALLOWED_HOSTNAMES` contains both `nas.example.com` and `*.nas.example.com`, a JSON update request for `nas.example.com` updates both records and returns per-target results in the response.

OpenAPI documentation is served at the worker's root URL (`/`).

### Health check

```
GET /health  ->  {"ok": true}
```

## Development

```sh
pnpm dev     # starts wrangler dev with local D1 migrations
pnpm test    # runs vitest with Miniflare
```

## How it works

1. The caller authenticates with a shared secret (query param or header).
2. The worker validates the hostname against the configured allowlist.
3. It resolves the IP from the request body/query, falling back to `CF-Connecting-IP`.
4. It resolves the request to one or more managed hostnames. For example, `nas.example.com` can fan out to both `nas.example.com` and `*.nas.example.com` when both are explicitly allowed.
5. It queries Cloudflare's DNS API for an existing A or AAAA record matching each target hostname.
6. If a target record already has the same IP, proxied state, and TTL, no change is made for that target (`nochg`).
7. Otherwise it creates or patches that target record (`good`).
8. The outcome is logged to D1 once per concrete DNS record (fire-and-forget, so the response is not delayed).
9. A cron job (every 6 hours) prunes log rows older than the retention period.

## Wildcard notes

- Cloudflare wildcard DNS records only wildcard the first label. `*.nas.example.com` is a wildcard record, but `subdomain.*.example.com` is not.
- Exact DNS records take precedence over wildcard records on Cloudflare. `nas.example.com` and `*.nas.example.com` are separate records with different jobs.
- This worker only auto-updates a wildcard companion when that wildcard record is explicitly present in `DDNS_ALLOWED_HOSTNAMES`.

## Project structure

```
src/
  index.ts             Main app, route wiring, scheduled handler
  types.ts             DdnsEnv interface, response/action constants
  ddns.ts              Shared update logic (findRecord, compare, create/patch)
  cloudflare-api.ts    Typed wrapper around Cloudflare DNS REST API
  validation.ts        IP validation, config parsing (no dependencies)
  logging.ts           D1-backed audit logging and cleanup
  endpoints/
    synology.ts        GET /nic/update  (DynDNS2 text responses)
    update.ts          POST /update     (JSON, OpenAPI via Chanfana)
    health.ts          GET /health
migrations/
  0001_ddns_logs.sql   D1 table for update history
tests/
  helpers.ts           Mock Cloudflare DNS API for tests
  integration/         Integration tests (health, synology, update)
```
