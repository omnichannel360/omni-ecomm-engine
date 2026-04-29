import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import { bananaGenerate } from "./banana.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }, db: { schema: "ecomm_engine" }
});
const auditQueue = new Queue("audit", { connection: conn });

const SLOTS = ["hero", "lifestyle_1", "lifestyle_2", "lifestyle_3", "feature_infographic", "trust_slide"] as const;

async function transition(sku_id: string, to_state: string, current_stage: string, metadata: Record<string, unknown> = {}) {
  const { data: prev } = await supa.from("skus").select("status").eq("id", sku_id).single();
  await supa.from("skus").update({ status: to_state, current_stage }).eq("id", sku_id);
  await supa.from("sku_events").insert({ sku_id, from_state: prev?.status ?? null, to_state, actor: "generate-worker", metadata });
}

const w = new Worker(
  "generate",
  async (job) => {
    const { sku_id } = job.data as { sku_id: string };
    console.log(`[generate] ${sku_id}`);

    const { data: out } = await supa.from("ai_outputs").select("image_prompts_jsonb").eq("sku_id", sku_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const prompts = Array.isArray(out?.image_prompts_jsonb) ? (out!.image_prompts_jsonb as Array<{ slot?: string; scene?: string; alt_text?: string }>) : [];

    for (const slot of SLOTS) {
      const p = prompts.find((x) => x.slot === slot);
      const prompt = p?.scene ? `${p.scene}. Square 2000x2000, photo-real, brand-safe, high contrast.` : `Product hero shot for slot ${slot}, square 2000x2000.`;
      let bucketPath: string | null = null;
      let model = "gemini-2.5-flash-image";
      let fallback_reason: string | null = null;
      try {
        const out = await bananaGenerate(prompt);
        if (out) {
          bucketPath = `data:${out.mime};base64,${out.data.slice(0, 64)}…`;
        } else {
          fallback_reason = "no_image_returned";
        }
      } catch (e) {
        fallback_reason = e instanceof Error ? e.message : String(e);
        model = "stub";
      }
      await supa.from("generated_images").insert({ sku_id, slot, model, prompt, file_path: bucketPath, width: 2000, height: 2000, fallback_reason });
    }

    await transition(sku_id, "AUDITING", "audit");
    await auditQueue.add("audit", { sku_id });
  },
  { connection: conn, concurrency: Number(process.env.GENERATE_CONCURRENCY ?? 2) }
);

w.on("ready", () => console.log("[generate-worker] ready"));
w.on("failed", (job, err) => console.error(`[generate] ${job?.id} failed:`, err.message));
process.on("SIGTERM", async () => { await w.close(); await conn.quit(); process.exit(0); });
