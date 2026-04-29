import { Worker } from "bullmq";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }, db: { schema: "ecomm_engine" }
});

const EXPORT_DIR = process.env.EXPORT_DIR || "/data/exports";

async function transition(sku_id: string, to_state: string, current_stage: string, metadata: Record<string, unknown> = {}) {
  const { data: prev } = await supa.from("skus").select("status").eq("id", sku_id).single();
  await supa.from("skus").update({ status: to_state, current_stage }).eq("id", sku_id);
  await supa.from("sku_events").insert({ sku_id, from_state: prev?.status ?? null, to_state, actor: "export-worker", metadata });
}

const w = new Worker(
  "export",
  async (job) => {
    const { sku_id } = job.data as { sku_id: string };
    console.log(`[export] ${sku_id}`);
    await mkdir(EXPORT_DIR, { recursive: true });

    const { data: out } = await supa.from("ai_outputs").select("copy_jsonb, edited_copy_jsonb").eq("sku_id", sku_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: imgs } = await supa.from("generated_images").select("slot, file_path").eq("sku_id", sku_id);

    const final = out?.edited_copy_jsonb ?? out?.copy_jsonb ?? {};
    const csvHeader = "slot,prompt_or_text\n";
    const csvBody = (imgs ?? []).map((i) => `${i.slot},${(i.file_path ?? "").replace(/,/g, " ")}`).join("\n");
    const csv = csvHeader + csvBody + "\n# COPY\n" + JSON.stringify(final).replace(/\n/g, " ");

    const path = join(EXPORT_DIR, `${sku_id}.csv`);
    await writeFile(path, csv, "utf8");

    await supa.from("exports").insert({ sku_id, format: "canva_csv", file_path: path });
    await transition(sku_id, "FINALIZED", "export", { format: "canva_csv", path });
  },
  { connection: conn, concurrency: Number(process.env.EXPORT_CONCURRENCY ?? 2) }
);

w.on("ready", () => console.log("[export-worker] ready"));
w.on("failed", (job, err) => console.error(`[export] ${job?.id}:`, err.message));
process.on("SIGTERM", async () => { await w.close(); await conn.quit(); process.exit(0); });
