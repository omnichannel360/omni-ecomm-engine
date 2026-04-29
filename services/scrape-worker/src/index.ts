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

async function safeAttr(loc: import("playwright").Locator, name: string): Promise<string | null> {
  try { return await loc.first().getAttribute(name, { timeout: 1500 }); } catch { return null; }
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
      try { await page.waitForLoadState("networkidle", { timeout: 8_000 }); } catch {}

      const title = await page.title();
      const html = await page.content();

      const description = await safeAttr(page.locator('meta[name="description"]'), "content");
      const og_title = await safeAttr(page.locator('meta[property="og:title"]'), "content");
      const og_description = await safeAttr(page.locator('meta[property="og:description"]'), "content");
      const og_image = await safeAttr(page.locator('meta[property="og:image"]'), "content");

      // Site-aware product image extraction
      const productImageCandidates: Array<string | null> = [
        await safeAttr(page.locator("#landingImage"), "data-old-hires"),
        await safeAttr(page.locator("#landingImage"), "src"),
        await safeAttr(page.locator('img[data-a-image-name="landingImage"]'), "src"),
        await safeAttr(page.locator('[data-a-image-source-density] img'), "src"),
        await safeAttr(page.locator('img[data-zoom-hires]'), "data-zoom-hires"),
        await safeAttr(page.locator('img[itemprop="image"]'), "src"),
        await safeAttr(page.locator('meta[property="product:image"]'), "content"),
        og_image
      ];
      let product_image: string | null = null;
      for (const c of productImageCandidates) {
        if (c && /^https?:\/\//.test(c) && !/share-icons|amazon\.com\/.*amazon\.png|sprite|placeholder/i.test(c)) { product_image = c; break; }
      }

      // Top-N largest images on page (heuristic: width attr or naturalWidth)
      const imgEls = await page.locator("img").elementHandles();
      const allImages: Array<{ src: string; w: number }> = [];
      for (const h of imgEls.slice(0, 30)) {
        const src = await h.getAttribute("src").catch(() => null);
        const w = await h.evaluate((el) => (el as HTMLImageElement).naturalWidth || Number((el as HTMLElement).getAttribute("width")) || 0).catch(() => 0);
        if (src && /^https?:\/\//.test(src)) allImages.push({ src, w: Number(w) || 0 });
      }
      const images = allImages.sort((a, b) => b.w - a.w).slice(0, 12).map((x) => x.src);
      if (!product_image && images.length > 0) product_image = images[0]!;

      await ctx.close();

      const meta = { description, og_title, og_description, og_image };
      await supa.from("raw_assets").insert({
        sku_id, type: "scrape",
        content_jsonb: { title, meta, product_image, images, html_length: html.length, scraped_at: new Date().toISOString() }
      });
      await transition(sku_id, "PROCESSING", "process", { title, has_product_image: !!product_image });
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
