# CLAUDE.md — Omni Ecomm Engine

**Project:** Omni Ecomm Engine v1.1
**Owner:** OmniChannel Digital Marketing
**Repo:** `github.com/omnichannel360/omni-ecomm-engine`
**Host:** Hetzner VPS (`5.78.187.35` / `5-78-187-35.sslip.io`)
**Domain (prod v1):** `engine.5-78-187-35.sslip.io` (live, auto-TLS via Caddy)
**Domain (target):** `engine.omnichannelsol.com` — pending DNS A record swap to `5.78.187.35` (currently points to WordPress 192.0.78.x)
**Mode:** YOLO — no confirmation prompts, auto-fix all issues, ship to prod
**Source of truth:** `omni_ecomm_engine_blueprint.md` (v1.1, decisions locked 2026-04-27)

---

## ⚡ Prime Directive — Stage Isolation

Every stage is a **sealed vertical slice**. Fixing one stage MUST NOT touch another stage.

When the user says "fix the `<stage>` stage":
- Read **only** `apps/engine/app/(stages)/<stage>/` and `services/<stage>-worker/`.
- Cross-stage shared code lives in `packages/*` — touch it only when the user explicitly says so.
- If a fix needs cross-stage changes, **stop and ask first**. Do not silently mutate sibling stages.
- Each stage owns its own queue, its own worker container, its own prompts, its own DB writes.

**Rule of thumb:** if two stages need the same change, the change belongs in `packages/`, not duplicated in each stage.

---

## 🧱 Stage → Tool/System Map (Isolation Contract)

Each stage runs on a **distinct primary tool/system**. Swap or break one, others keep running.

| # | Slug | Folder (UI) | Folder (Worker) | Primary Tool/System | Queue | DB Tables Owned |
|---|------|-------------|-----------------|---------------------|-------|-----------------|
| 1 | `/ingest` | `app/(stages)/ingest/` | `services/scrape-worker/` | **Playwright** (UA: `OmniBot/1.0`) + `xlsx` parser | `scrape` | `skus`, `raw_assets` |
| 2 | `/process` | `app/(stages)/process/` | `services/process-worker/` | **Anthropic SDK** — Claude Sonnet 4.6 default, Opus 4.7 for complex SKUs, tool-use JSON mode | `process` | `ai_outputs` |
| 3 | `/generate` | `app/(stages)/generate/` | `services/generate-worker/` | **Gemini 2.5 Flash Image (Nano Banana)** primary. FLUX/ComfyUI deferred (no GPU on Hetzner host) — re-enable when GPU node added. | `generate` | `generated_images` |
| 4 | `/audit` | `app/(stages)/audit/` | `services/audit-worker/` | **Claude Opus 4.7 Vision** + `sharp-phash` perceptual hash + brand-rule engine | `audit` | `audit_results` |
| 5 | `/queue` | `app/(stages)/queue/` | (UI only) | **BullMQ + `@bull-board/api`** on shared Redis :6379 | (manages all) | (read-only) |
| 6 | `/review` | `app/(stages)/review/` | (none — server actions) | **TipTap** editor + side-by-side viewer | (none) | `ai_outputs.edited_copy` |
| 7 | `/omni-approval/[token]` | `app/(client)/omni-approval/[token]/` | (none) | **Magic-link JWT** (signed, 7-day expiry), Omni white-label shell | (none) | `approvals` |
| 8 | `/notify` | `app/(stages)/notify/` | `services/notify-worker/` | **Resend** (email) + **Slack Web API + Block Kit** — adapter pattern, YAML rules engine | `notify` | `notifications` |
| 9 | `/export` | `app/(stages)/export/` | `services/export-worker/` | **Canva Connect API** + Bulk Create CSV generator + ZIP packager | `export` | `exports` |
| 10 | `/dashboard` | `app/(stages)/dashboard/` | (none) | **Recharts** + Supabase server-side aggregations | (none) | (read-only) |
| 11 | `/settings` | `app/(stages)/settings/` | (none) | Native Next.js admin UI — prompt templates, brand memory, API keys | (none) | `settings`, `prompt_templates`, `brand_settings` |

**Why distinct tools per stage:** swapping Banana → FLUX, or Resend → Postmark, or Claude → other LLM, must be a single-folder change. No stage owns another stage's vendor lock-in.

---

## 📁 Folder Structure (canonical)

```
omni-ecomm-engine/
├── apps/engine/                       # Next.js 15 App Router
│   ├── app/
│   │   ├── (stages)/                  # Internal stage routes — one folder each
│   │   │   ├── dashboard/  ingest/  process/  generate/  audit/
│   │   │   ├── queue/  review/  notify/  export/  settings/
│   │   ├── (client)/omni-approval/[token]/   # Client-facing, token-gated
│   │   └── api/                       # Webhooks + health
│   └── next.config.ts
├── services/                          # Worker containers — one per stage that has heavy lifting
│   ├── scrape-worker/  process-worker/  generate-worker/
│   ├── audit-worker/   notify-worker/   export-worker/
├── packages/                          # Cross-stage shared libs ONLY
│   ├── db/        # Supabase client + schema + migrations
│   ├── queue/     # BullMQ wrappers
│   ├── claude/    # Anthropic SDK wrapper (used by process + audit)
│   ├── images/    # banana.ts + flux.ts (used by generate)
│   ├── notifications/  # channel adapters (used by notify)
│   ├── ui/        # shadcn + Omni theme
│   └── types/     # shared TypeScript types
├── infra/
│   ├── docker-compose.yml
│   ├── nginx/engine.conf              # :8004 reverse proxy
│   └── supabase/migrations/
├── .env.example
├── turbo.json
└── package.json
```

---

## 🗄️ Database — Supabase schema `ecomm_engine`

Self-hosted Supabase already running on Hetzner port **5433**. New schema only — no new instance.

Tables: `skus`, `raw_assets`, `ai_outputs`, `generated_images`, `audit_results`, `approvals`, `notifications`, `exports`, `sku_events` (audit trail), `settings`, `prompt_templates`, `brand_settings`.

State machine on `skus.status`:
`INGESTED → SCRAPING → PROCESSING → GENERATING → AUDITING → PENDING_REVIEW → PENDING_CLIENT → APPROVED → EXPORTING → FINALIZED`
Terminal: `FAILED`, `REJECTED` (with retry policy).

**Stage DB ownership rule:** a stage writes only to its owned tables (column 6 of map above). Reading from sibling tables OK; writing — no.

---

## 🔌 Ports (Hetzner — additive to existing map)

| Service | Port | Status |
|---|---|---|
| OmniSpark | 8001 | existing |
| OmniFlare | 8002 | existing |
| OmniCrawl | 3002 | existing |
| OmniDash | 8003 | existing |
| **Omni Ecomm Engine (Next.js)** | **8005** | **new** (8004 occupied by existing `node /root/omni`) |
| **ComfyUI (FLUX fallback)** | deferred | no GPU on host — Banana-only in v1 |
| Supabase Postgres | 5433 | shared existing |
| Redis (BullMQ) | 6379 | shared existing |

**Caddy** (existing on host, ports 80/443) terminates TLS. Site block routes `engine.5-78-187-35.sslip.io` → `host.docker.internal:8005`. Auto-TLS via Let's Encrypt. Site block lives in `infra/caddy/engine.caddy` and is appended to existing Caddyfile inside `caddy` container at `/etc/caddy/Caddyfile`.

---

## 🚀 Deployment Contract — YOLO to Production

**Target:** `https://engine.omnichannelsol.com` live on Hetzner. Not staging. Not local. Prod.

Pipeline:
1. GitHub Actions on push to `main` → docker build per service.
2. Push images to Hetzner registry.
3. SSH into `5.78.187.35` → `docker compose up -d` (or `--no-deps <worker>` for hot-swap).
4. Nginx config: `infra/nginx/engine.conf` → reload nginx.
5. DNS: `engine.omnichannelsol.com` A record → `5.78.187.35`.
6. TLS: Let's Encrypt via certbot, auto-renew.
7. Health check: `GET /api/health` returns 200 + version + queue depth per stage.

**Per-stage hot-swap:** any worker can be redeployed without touching the others:
```
docker compose up -d --no-deps generate-worker
docker compose up -d --no-deps audit-worker
```

The Next.js web container restarts only when `apps/engine/` changes.

---

## 🔐 Environment Variables (template — `.env.example`)

```
# Database
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=postgres://...:5433/postgres

# Redis
REDIS_URL=redis://localhost:6379

# Stage 2 — process
ANTHROPIC_API_KEY=
CLAUDE_DEFAULT_MODEL=claude-sonnet-4-6
CLAUDE_COMPLEX_MODEL=claude-opus-4-7

# Stage 3 — generate
GEMINI_API_KEY=
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
COMFYUI_URL=http://localhost:8188
FLUX_MODEL=flux1-schnell

# Stage 4 — audit (uses ANTHROPIC_API_KEY above + Opus 4.7)
AUDIT_VISION_MODEL=claude-opus-4-7

# Stage 8 — notify
RESEND_API_KEY=
SLACK_BOT_TOKEN=
SLACK_DEFAULT_CHANNEL=

# Stage 9 — export
CANVA_CLIENT_ID=
CANVA_CLIENT_SECRET=

# Storage
STORAGE_PROVIDER=supabase   # or minio
STORAGE_BUCKET=ecomm-assets

# Auth
JWT_SECRET=
APPROVAL_TOKEN_TTL_DAYS=7

# App
APP_URL=https://engine.omnichannelsol.com
NODE_ENV=production
```

**Rule:** each stage reads only its own env vars. New env var for stage X → goes in stage X's worker, documented here.

---

## 🤖 Agent Behavior Rules (READ EVERY RESPONSE)

1. **Stage isolation is sacred.** Fix only the requested stage's folder pair.
2. **No cross-stage refactors without explicit approval.**
3. **Shared code goes in `packages/`** — never duplicate across stages, never inline a sibling stage's util.
4. **Vendor swap = single folder change.** If swapping Banana → another model touches more than `services/generate-worker/` + `packages/images/`, the abstraction is wrong — fix it.
5. **Every queue is independent.** Pausing `audit` must not stall `scrape`.
6. **Every worker is independently deployable** via `docker compose up -d --no-deps <worker>`.
7. **DB writes scoped to owned tables** (see Stage Map column 6). Cross-table writes go through `packages/db/`.
8. **Prompts are versioned** in `services/process-worker/src/prompts/` and editable from `/settings` UI — never hardcode in business logic.
9. **Notifications are event-driven**, not stage-coupled. Stages emit events; `notify-worker` decides routing via YAML.
10. **Tests follow the same isolation** — `services/<stage>-worker/__tests__/` covers only that stage.

---

## 🧪 Stage Health Checklist (run before merging any stage PR)

- [ ] Type checks pass (`turbo run typecheck --filter=<stage>`)
- [ ] Stage tests pass (`turbo run test --filter=<stage>`)
- [ ] Worker boots in isolation (`docker compose up <stage>-worker` — no sibling deps)
- [ ] Queue produces/consumes a sample job end-to-end
- [ ] DB writes only to owned tables (verify via `sku_events` audit log)
- [ ] No imports from sibling `services/*-worker/` or sibling `app/(stages)/*/`
- [ ] `.env.example` updated if new env vars added
- [ ] Doc block at top of each stage's `page.tsx` and worker `index.ts` matches this CLAUDE.md

---

## 📦 Locked Decisions (2026-04-27 — do not relitigate without PR)

| # | Decision | Resolution |
|---|---|---|
| 1 | Image gen | Banana primary, FLUX fallback. Auto-failover on 429. |
| 2 | Client portal | Slug only — `/omni-approval/[token]`. No subdomain. |
| 3 | WhatsApp | Removed from v1. Adapter pattern preserved for later. |
| 4 | CMS | Skipped. Supabase tables hold prompts/brand/settings. |
| 5 | Branding | Single Omni white-label for v1. `brand_settings` table reserved for later per-client theming. |

---

## 🔄 When You (Claude) Start Work

1. Read this file.
2. Read `omni_ecomm_engine_blueprint.md` if available.
3. Identify the requested stage from the user's message.
4. Open **only** that stage's folder pair: `apps/engine/app/(stages)/<stage>/` + `services/<stage>-worker/`.
5. If shared lib edit needed → confirm with user first.
6. Run the stage health checklist before declaring done.
7. Log episodic outcome (per global memory rules) for next session.

---

*This CLAUDE.md is the operational contract. The blueprint is the architectural source of truth. Update both together if architecture changes.*
