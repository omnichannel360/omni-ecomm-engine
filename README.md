# Omni Ecomm Engine

Production: `https://engine.5-78-187-35.sslip.io` (auto-TLS via Caddy on Hetzner)

10-stage e-commerce content engine. Per-stage isolation contract — see [CLAUDE.md](./CLAUDE.md).

## Stages
1. `/ingest` — Playwright scrape + Excel parse
2. `/process` — Claude Sonnet 4.6 reasoning, Opus 4.7 for complex SKUs
3. `/generate` — Gemini 2.5 Flash Image (Nano Banana)
4. `/audit` — Claude Opus 4.7 Vision + perceptual hash
5. `/queue` — BullMQ board
6. `/review` — internal QA editor (TipTap)
7. `/omni-approval/[token]` — client portal
8. `/notify` — Resend + Slack
9. `/export` — Canva CSV + ZIP
10. `/dashboard` — KPIs

## Quickstart (Hetzner host)

```bash
git clone https://github.com/omnichannel360/omni-ecomm-engine /root/omni-ecomm-engine
cd /root/omni-ecomm-engine
cp .env.example .env
# fill keys
docker compose up -d --build
```

## Stage isolation

Edit only `apps/engine/app/(stages)/<stage>/` + `services/<stage>-worker/` per fix. Shared code → `packages/`.
