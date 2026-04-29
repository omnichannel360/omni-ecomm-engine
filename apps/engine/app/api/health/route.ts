import { NextResponse } from "next/server";
import IORedis from "ioredis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const stages = ["dashboard", "ingest", "process", "generate", "audit", "queue", "review", "notify", "export", "settings"];
  const startedAt = process.env.STARTED_AT || new Date().toISOString();

  let redisOk = false;
  let queueDepths: Record<string, number> = {};
  try {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    const r = new IORedis(url, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 1500 });
    await r.connect();
    for (const name of ["scrape", "process", "generate", "audit", "notify", "export"]) {
      const n = await r.llen(`bull:${name}:wait`);
      queueDepths[name] = Number(n) || 0;
    }
    redisOk = true;
    r.disconnect();
  } catch {}

  let dbOk = false;
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const r = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/`, {
        headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY }
      });
      dbOk = r.ok || r.status === 401 || r.status === 404;
    }
  } catch {}

  return NextResponse.json({
    ok: true,
    service: "omni-ecomm-engine",
    version: "1.1.0",
    startedAt,
    stages,
    redis: { ok: redisOk, queueDepths },
    db: { ok: dbOk },
    timestamp: new Date().toISOString()
  });
}
