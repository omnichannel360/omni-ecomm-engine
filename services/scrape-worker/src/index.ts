import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }, db: { schema: "ecomm_engine" }
});
const processQueue = new Queue("process", { connection: conn });

async function transition(sku_id: string, to_state: string, current_stage: string, metadata: Record<string, unknown> = {}) {
  const { data: prev } = await supa.from("skus").select("status").eq("id", sku_id).single();
  await supa.from("skus").update({ status: to_state, current_stage }).eq("id", sku_id);
  await supa.from("sku_events").insert({ sku_id, from_state: prev?.status ?? null, to_state, actor: "scrape-worker", metadata });
}

const w = new Worker(
  "scrape",
  async (job) => {
    const { sku_id, source_url } = job.data as { sku_id: string; source_url: string };
    console.log(`[scrape] ${sku_id} → ${source_url}`);
    await transition(sku_id, "SCRAPING", "ingest");

    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
      const ctx = await browser.newContext({ userAgent: "OmniBot/1.0 (+https://omnichannelsol.com/bot)" });
      const page = await ctx.newPage();
      await page.goto(source_url, { waitUntil: "domcontentloaded", timeout: 30_000 });

      const title = await page.title();
      const html = await page.content();

      const description = await page.locator('meta[name="description"]').first().getAttribute("content").catch(() => null);
      const og_title = await page.locator('meta[property="og:title"]').first().getAttribute("content").catch(() => null);
      const og_description = await page.locator('meta[property="og:description"]').first().getAttribute("content").catch(() => null);
      const og_image = await page.locator('meta[property="og:image"]').first().getAttribute("content").catch(() => null);

      const imgEls = await page.locator("img").elementHandles();
      const images: string[] = [];
      for (const h of imgEls.slice(0, 12)) {
        const src = await h.getAttribute("src").catch(() => null);
        if (src) images.push(src);
      }

      await ctx.close();

      const meta = { description, og_title, og_description, og_image };
      await supa.from("raw_assets").insert({
        sku_id,
        type: "scrape",
        content_jsonb: { title, meta, images, html_length: html.length, scraped_at: new Date().toISOString() }
      });
      await transition(sku_id, "PROCESSING", "process", { title });
      await processQueue.add("process", { sku_id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[scrape] failed ${sku_id}:`, msg);
      await supa.from("skus").update({ status: "FAILED", error_message: msg }).eq("id", sku_id);
      await supa.from("sku_events").insert({ sku_id, to_state: "FAILED", actor: "scrape-worker", metadata: { error: msg } });
      throw e;
    } finally {
      await browser.close();
    }
  },
  { connection: conn, concurrency: Number(process.env.SCRAPE_CONCURRENCY ?? 4) }
);

w.on("ready", () => console.log("[scrape-worker] ready"));
w.on("failed", (job, err) => console.error(`[scrape] job ${job?.id} failed:`, err.message));
process.on("SIGTERM", async () => { await w.close(); await conn.quit(); process.exit(0); });
