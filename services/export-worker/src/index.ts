import { Worker } from "bullmq";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import { createWriteStream } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import archiver from "archiver";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }, db: { schema: "ecomm_engine" }
});

const EXPORT_DIR = process.env.EXPORT_DIR || "/data/exports";
const IMAGES_DIR = process.env.IMAGES_DIR || "/data/images";

async function transition(sku_id: string, to_state: string, current_stage: string, metadata: Record<string, unknown> = {}) {
  const { data: prev } = await supa.from("skus").select("status").eq("id", sku_id).single();
  await supa.from("skus").update({ status: to_state, current_stage }).eq("id", sku_id);
  await supa.from("sku_events").insert({ sku_id, from_state: prev?.status ?? null, to_state, actor: "export-worker", metadata });
}

function csvEscape(s: unknown): string {
  const v = String(s ?? "");
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function buildZip(zipPath: string, csvPath: string, sku_id: string, imageFiles: Array<{ slot: string; abs_path: string }>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(zipPath);
    const arc = archiver("zip", { zlib: { level: 9 } });
    out.on("close", () => resolve());
    arc.on("error", reject);
    arc.pipe(out);
    arc.file(csvPath, { name: `${sku_id}.csv` });
    for (const f of imageFiles) arc.file(f.abs_path, { name: `images/${f.slot}.png` });
    arc.finalize();
  });
}

const w = new Worker(
  "export",
  async (job) => {
    const { sku_id } = job.data as { sku_id: string };
    console.log(`[export] ${sku_id}`);
    await mkdir(EXPORT_DIR, { recursive: true });

    const { data: skuRow } = await supa.from("skus").select("client_id, source_url").eq("id", sku_id).single();
    const { data: out } = await supa.from("ai_outputs").select("copy_jsonb, edited_copy_jsonb").eq("sku_id", sku_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: imgs } = await supa.from("generated_images").select("slot, file_path, prompt, model").eq("sku_id", sku_id);
    const final = (out?.edited_copy_jsonb as Record<string, unknown> | null) ?? (out?.copy_jsonb as Record<string, unknown> | null) ?? {};
    const finalAny = final as { headers?: string[]; body?: string; bullets?: string[]; trust_badges?: Array<{ label: string; icon?: string }> };

    const rows: Array<Array<string>> = [];
    rows.push(["sku_id", "client_id", "source_url", "slot", "image_file", "prompt", "model"]);
    for (const i of (imgs ?? []) as Array<{ slot: string; file_path: string | null; prompt: string | null; model: string }>) {
      rows.push([sku_id, skuRow?.client_id ?? "", skuRow?.source_url ?? "", i.slot, `images/${i.slot}.png`, i.prompt ?? "", i.model]);
    }
    rows.push([]);
    rows.push(["FIELD", "VALUE"]);
    rows.push(["headers", (finalAny.headers ?? []).join(" | ")]);
    rows.push(["body", finalAny.body ?? ""]);
    rows.push(["bullets", (finalAny.bullets ?? []).join(" | ")]);
    rows.push(["trust_badges", (finalAny.trust_badges ?? []).map((b) => b.label).join(" | ")]);

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
    const csvPath = join(EXPORT_DIR, `${sku_id}.csv`);
    await writeFile(csvPath, csv, "utf8");

    const imageFiles: Array<{ slot: string; abs_path: string }> = [];
    for (const i of (imgs ?? []) as Array<{ slot: string; file_path: string | null }>) {
      if (i.file_path) imageFiles.push({ slot: i.slot, abs_path: join(IMAGES_DIR, i.file_path) });
    }
    const zipPath = join(EXPORT_DIR, `${sku_id}.zip`);
    await buildZip(zipPath, csvPath, sku_id, imageFiles);

    await supa.from("exports").insert({ sku_id, format: "canva_csv", file_path: `${sku_id}.csv` });
    await supa.from("exports").insert({ sku_id, format: "zip", file_path: `${sku_id}.zip` });
    await transition(sku_id, "FINALIZED", "export", { csv: `${sku_id}.csv`, zip: `${sku_id}.zip`, images: imageFiles.length });
  },
  { connection: conn, concurrency: Number(process.env.EXPORT_CONCURRENCY ?? 2) }
);

w.on("ready", () => console.log("[export-worker] ready"));
w.on("failed", (job, err) => console.error(`[export] ${job?.id}:`, err.message));
process.on("SIGTERM", async () => { await w.close(); await conn.quit(); process.exit(0); });
