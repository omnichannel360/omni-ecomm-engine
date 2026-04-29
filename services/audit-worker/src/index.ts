import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }, db: { schema: "ecomm_engine" }
});
const notifyQueue = new Queue("notify", { connection: conn });

async function transition(sku_id: string, to_state: string, current_stage: string, metadata: Record<string, unknown> = {}) {
  const { data: prev } = await supa.from("skus").select("status").eq("id", sku_id).single();
  await supa.from("skus").update({ status: to_state, current_stage }).eq("id", sku_id);
  await supa.from("sku_events").insert({ sku_id, from_state: prev?.status ?? null, to_state, actor: "audit-worker", metadata });
}

const w = new Worker(
  "audit",
  async (job) => {
    const { sku_id } = job.data as { sku_id: string };
    console.log(`[audit] ${sku_id}`);
    const { data: imgs } = await supa.from("generated_images").select("id").eq("sku_id", sku_id);
    const list = imgs ?? [];
    for (const img of list) {
      // v1: stub all 4 checks pass. Real Claude Vision + perceptual hash arrives in v1.2.
      for (const check of ["perceptual_hash", "brand_color", "safe_zone", "vision_qa"]) {
        await supa.from("audit_results").insert({ image_id: img.id, check_name: check, passed: true, score: 1, reason: "stub:auto-pass" });
      }
    }
    await transition(sku_id, "PENDING_REVIEW", "review", { images_audited: list.length });
    await notifyQueue.add("notify", { event: "review.ready", sku_id });
  },
  { connection: conn, concurrency: Number(process.env.AUDIT_CONCURRENCY ?? 4) }
);

w.on("ready", () => console.log("[audit-worker] ready"));
w.on("failed", (job, err) => console.error(`[audit] ${job?.id}:`, err.message));
process.on("SIGTERM", async () => { await w.close(); await conn.quit(); process.exit(0); });
