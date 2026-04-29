import { Worker } from "bullmq";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "./channels/email.js";
import { sendSlack } from "./channels/slack.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }, db: { schema: "ecomm_engine" }
});

type Rule = { event: string; channel: "email" | "slack" | "console"; recipient: string };
const RULES: Rule[] = [
  { event: "review.ready", channel: "console", recipient: "internal" },
  { event: "client.approval_requested", channel: "email", recipient: "client" },
  { event: "client.approved", channel: "slack", recipient: process.env.SLACK_DEFAULT_CHANNEL || "#omni-ecomm" },
  { event: "client.regenerate_requested", channel: "slack", recipient: process.env.SLACK_DEFAULT_CHANNEL || "#omni-ecomm" },
  { event: "audit.failed", channel: "slack", recipient: process.env.SLACK_DEFAULT_CHANNEL || "#omni-ecomm" }
];

const w = new Worker(
  "notify",
  async (job) => {
    const { event, sku_id, payload } = job.data as { event: string; sku_id?: string; payload?: Record<string, unknown> };
    const matches = RULES.filter((r) => r.event === event);
    for (const r of matches) {
      const text = `[${event}] sku=${sku_id ?? "n/a"} ${JSON.stringify(payload ?? {})}`;
      let status = "sent";
      let err: string | null = null;
      try {
        if (r.channel === "email") await sendEmail(r.recipient === "client" ? "client@example.com" : r.recipient, `Omni Ecomm: ${event}`, text);
        else if (r.channel === "slack") await sendSlack(r.recipient, text);
        else console.log(`[notify:console] ${text}`);
      } catch (e) { status = "failed"; err = e instanceof Error ? e.message : String(e); }
      await supa.from("notifications").insert({ sku_id: sku_id ?? null, event, channel: r.channel, recipient: r.recipient, status, error: err, payload_jsonb: payload ?? null, sent_at: new Date().toISOString() });
    }
  },
  { connection: conn, concurrency: Number(process.env.NOTIFY_CONCURRENCY ?? 10) }
);

w.on("ready", () => console.log("[notify-worker] ready"));
w.on("failed", (job, err) => console.error(`[notify] ${job?.id}:`, err.message));
process.on("SIGTERM", async () => { await w.close(); await conn.quit(); process.exit(0); });
