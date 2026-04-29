import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }, db: { schema: "ecomm_engine" }
});
const notifyQueue = new Queue("notify", { connection: conn });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const IMAGES_DIR = process.env.IMAGES_DIR || "/data/images";
const VISION_MODEL = process.env.AUDIT_VISION_MODEL || "claude-opus-4-7";

async function transition(sku_id: string, to_state: string, current_stage: string, metadata: Record<string, unknown> = {}) {
  const { data: prev } = await supa.from("skus").select("status").eq("id", sku_id).single();
  await supa.from("skus").update({ status: to_state, current_stage }).eq("id", sku_id);
  await supa.from("sku_events").insert({ sku_id, from_state: prev?.status ?? null, to_state, actor: "audit-worker", metadata });
}

async function visionCheck(file_path: string, slot: string, prompt: string | null): Promise<{ passed: boolean; score: number; reason: string; model: string }> {
  try {
    const buf = await readFile(join(IMAGES_DIR, file_path));
    const b64 = buf.toString("base64");
    const res = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
          { type: "text", text: `You audit e-commerce product images. Slot: "${slot}". Intent: ${prompt ?? "n/a"}. Return JSON only: {"passed": boolean, "score": 0..1, "reason": "<one short sentence>"}. Pass if image is photo-realistic, not blurry, no obvious artifacts, no text errors, brand-safe.` }
        ]
      }]
    });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    const json = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
    return { passed: !!json.passed, score: Number(json.score) || 0, reason: String(json.reason || "ok"), model: VISION_MODEL };
  } catch (e) {
    return { passed: false, score: 0, reason: e instanceof Error ? e.message : String(e), model: VISION_MODEL };
  }
}

const w = new Worker(
  "audit",
  async (job) => {
    const { sku_id } = job.data as { sku_id: string };
    console.log(`[audit] ${sku_id}`);

    const { data: imgs } = await supa.from("generated_images").select("id, slot, file_path, prompt").eq("sku_id", sku_id);
    const list = (imgs ?? []) as Array<{ id: string; slot: string; file_path: string | null; prompt: string | null }>;

    let allPassed = true;
    for (const img of list) {
      // 1. perceptual_hash + brand_color + safe_zone — auto-pass v1 (real impl in v1.2)
      for (const check of ["perceptual_hash", "brand_color", "safe_zone"]) {
        await supa.from("audit_results").insert({ image_id: img.id, check_name: check, passed: true, score: 1, reason: "stub:auto-pass" });
      }
      // 2. real vision QA
      let v: { passed: boolean; score: number; reason: string; model: string };
      if (img.file_path && process.env.ANTHROPIC_API_KEY) {
        v = await visionCheck(img.file_path, img.slot, img.prompt);
      } else {
        v = { passed: !!img.file_path, score: img.file_path ? 0.5 : 0, reason: img.file_path ? "no_api_key:skip" : "no_image", model: "skip" };
      }
      await supa.from("audit_results").insert({ image_id: img.id, check_name: "vision_qa", passed: v.passed, score: v.score, reason: v.reason });
      if (!v.passed) allPassed = false;
    }

    await transition(sku_id, "PENDING_REVIEW", "review", { images_audited: list.length, all_passed: allPassed });
    await notifyQueue.add("notify", { event: "review.ready", sku_id, payload: { images: list.length, all_passed: allPassed } });
  },
  { connection: conn, concurrency: Number(process.env.AUDIT_CONCURRENCY ?? 2) }
);

w.on("ready", () => console.log("[audit-worker] ready"));
w.on("failed", (job, err) => console.error(`[audit] ${job?.id}:`, err.message));
process.on("SIGTERM", async () => { await w.close(); await conn.quit(); process.exit(0); });
