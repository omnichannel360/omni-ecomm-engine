import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompts/system.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }, db: { schema: "ecomm_engine" }
});
const generateQueue = new Queue("generate", { connection: conn });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function transition(sku_id: string, to_state: string, current_stage: string, metadata: Record<string, unknown> = {}) {
  const { data: prev } = await supa.from("skus").select("status").eq("id", sku_id).single();
  await supa.from("skus").update({ status: to_state, current_stage }).eq("id", sku_id);
  await supa.from("sku_events").insert({ sku_id, from_state: prev?.status ?? null, to_state, actor: "process-worker", metadata });
}

const w = new Worker(
  "process",
  async (job) => {
    const { sku_id } = job.data as { sku_id: string };
    console.log(`[process] ${sku_id}`);

    const { data: assets } = await supa.from("raw_assets").select("content_jsonb").eq("sku_id", sku_id).eq("type", "scrape").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const ctx = assets?.content_jsonb ?? {};

    const model = process.env.CLAUDE_DEFAULT_MODEL || "claude-sonnet-4-6";
    const res = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Scraped context:\n${JSON.stringify(ctx).slice(0, 8000)}\n\nReturn the structured JSON now.` }]
    });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    let copy: unknown = null;
    try { copy = JSON.parse(text); } catch { copy = { raw: text }; }

    const imagePrompts = (copy as { image_prompts?: unknown })?.image_prompts ?? [];
    await supa.from("ai_outputs").insert({ sku_id, copy_jsonb: copy, image_prompts_jsonb: imagePrompts, model_used: model, tokens_in: res.usage?.input_tokens ?? null, tokens_out: res.usage?.output_tokens ?? null });
    await transition(sku_id, "GENERATING", "generate", { model });
    await generateQueue.add("generate", { sku_id });
  },
  { connection: conn, concurrency: Number(process.env.PROCESS_CONCURRENCY ?? 6) }
);

w.on("ready", () => console.log("[process-worker] ready"));
w.on("failed", async (job, err) => {
  console.error(`[process] failed:`, err.message);
  if (job?.data?.sku_id) {
    await supa.from("skus").update({ status: "FAILED", error_message: err.message }).eq("id", job.data.sku_id);
  }
});
process.on("SIGTERM", async () => { await w.close(); await conn.quit(); process.exit(0); });
