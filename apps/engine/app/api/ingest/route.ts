import { NextResponse } from "next/server";
import { z } from "zod";
import { supa } from "@/lib/supabase";
import { q } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IngestSchema = z.object({
  client_id: z.string().min(1),
  source_url: z.string().url(),
  excel_path: z.string().optional()
});

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });

  const db = supa();
  const { data, error } = await db
    .from("skus")
    .insert({ client_id: parsed.data.client_id, source_url: parsed.data.source_url, excel_path: parsed.data.excel_path ?? null, status: "INGESTED", current_stage: "ingest" })
    .select("id")
    .single();

  if (error || !data) return NextResponse.json({ error: "db_insert_failed", detail: error?.message }, { status: 500 });

  await db.from("sku_events").insert({ sku_id: data.id, from_state: null, to_state: "INGESTED", actor: "api/ingest", metadata: { source_url: parsed.data.source_url } });
  await q("scrape").add("scrape", { sku_id: data.id, source_url: parsed.data.source_url });

  return NextResponse.json({ ok: true, sku_id: data.id, queued: "scrape" }, { status: 202 });
}
