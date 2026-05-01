import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { bananaGenerate } from "./banana.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }, db: { schema: "ecomm_engine" }
});
const auditQueue = new Queue("audit", { connection: conn });

const SLOTS = ["hero", "lifestyle_1", "lifestyle_2", "lifestyle_3", "feature_infographic", "trust_slide"] as const;
type Slot = typeof SLOTS[number];
const IMAGES_DIR = process.env.IMAGES_DIR || "/data/images";

type PromptItem = { slot?: string; scene?: string; alt_text?: string; palette_hint?: string; negative_prompt?: string };

async function transition(sku_id: string, to_state: string, current_stage: string, metadata: Record<string, unknown> = {}) {
  const { data: prev } = await supa.from("skus").select("status").eq("id", sku_id).single();
  await supa.from("skus").update({ status: to_state, current_stage }).eq("id", sku_id);
  await supa.from("sku_events").insert({ sku_id, from_state: prev?.status ?? null, to_state, actor: "generate-worker", metadata });
}

async function genOneSlot(args: { sku_id: string; slot: Slot; prompts: PromptItem[]; productImage: string | null; productTitle: string; headerHint: string; }) {
  const { sku_id, slot, prompts, productImage, productTitle, headerHint } = args;
  const dir = join(IMAGES_DIR, sku_id);
  await mkdir(dir, { recursive: true });

  const p = prompts.find((x) => x.slot === slot);
  const productHint = productTitle ? ` Product: "${productTitle}".` : "";
  const prompt = p?.scene
    ? `${p.scene}.${productHint}${headerHint} Square 2000x2000, photo-real, brand-safe, high contrast, e-commerce hero quality, clean background.`
    : `Premium e-commerce product image for slot "${slot}".${productHint} Square 2000x2000.`;
  const negative = p?.negative_prompt ?? null;

  let model = "gemini-2.5-flash-image";
  let file_path: string | null = null;
  let fallback_reason: string | null = null;

  try {
    const refForSlot = (slot === "feature_infographic" || slot === "trust_slide") ? null : productImage;
    const out = await bananaGenerate(prompt, refForSlot, negative);
    if (out?.data) {
      const buf = Buffer.from(out.data, "base64");
      const fname = `${slot}.png`;
      await writeFile(join(dir, fname), buf);
      file_path = `${sku_id}/${fname}`;
    } else {
      fallback_reason = "no_image_returned";
      model = "stub";
    }
  } catch (e) {
    fallback_reason = e instanceof Error ? e.message : String(e);
    model = "stub";
  }

  // wipe prior row + audits for this slot, insert fresh
  const { data: existing } = await supa.from("generated_images").select("id").eq("sku_id", sku_id).eq("slot", slot);
  const ids = (existing ?? []).map((r: { id: string }) => r.id);
  if (ids.length) {
    await supa.from("audit_results").delete().in("image_id", ids);
    await supa.from("generated_images").delete().in("id", ids);
  }
  await supa.from("generated_images").insert({ sku_id, slot, model, prompt, file_path, width: 2000, height: 2000, fallback_reason });
}

const w = new Worker(
  "generate",
  async (job) => {
    const { sku_id, slot } = job.data as { sku_id: string; slot?: Slot };
    console.log(`[generate] ${sku_id}${slot ? ` slot=${slot}` : ""}`);

    const { data: out } = await supa.from("ai_outputs").select("image_prompts_jsonb, copy_jsonb").eq("sku_id", sku_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: scrape } = await supa.from("raw_assets").select("content_jsonb").eq("sku_id", sku_id).eq("type", "scrape").order("created_at", { ascending: false }).limit(1).maybeSingle();

    const prompts = Array.isArray(out?.image_prompts_jsonb) ? (out!.image_prompts_jsonb as PromptItem[]) : [];
    const copy = (out?.copy_jsonb as { headers?: string[] } | null) ?? null;
    const ctx = (scrape?.content_jsonb ?? {}) as { title?: string; product_image?: string };
    const productImage = ctx.product_image || null;
    const productTitle = ctx.title?.replace(/^Amazon\.com\s*:\s*/i, "").slice(0, 200) ?? "";
    const headerHint = copy?.headers?.[0] ? ` Brand headline context: "${copy.headers[0]}".` : "";

    if (slot && SLOTS.includes(slot)) {
      // single-slot regenerate — leave other slots untouched
      await genOneSlot({ sku_id, slot, prompts, productImage, productTitle, headerHint });
      // re-trigger audit for this SKU
      await transition(sku_id, "AUDITING", "audit", { single_slot: slot });
      await auditQueue.add("audit", { sku_id });
      return;
    }

    // full regenerate — wipe folder
    for (const s of SLOTS) {
      try { await unlink(join(IMAGES_DIR, sku_id, `${s}.png`)); } catch {}
    }
    for (const s of SLOTS) {
      await genOneSlot({ sku_id, slot: s, prompts, productImage, productTitle, headerHint });
    }
    await transition(sku_id, "AUDITING", "audit");
    await auditQueue.add("audit", { sku_id });
  },
  { connection: conn, concurrency: Number(process.env.GENERATE_CONCURRENCY ?? 2) }
);

w.on("ready", () => console.log("[generate-worker] ready"));
w.on("failed", (job, err) => console.error(`[generate] ${job?.id} failed:`, err.message));
process.on("SIGTERM", async () => { await w.close(); await conn.quit(); process.exit(0); });
