"use server";
import { revalidatePath } from "next/cache";
import { supa } from "@/lib/supabase";
import { q } from "@/lib/queue";

export async function createSku(formData: FormData) {
  const client_id = String(formData.get("client_id") ?? "").trim();
  const source_url = String(formData.get("source_url") ?? "").trim();
  const excel_path = String(formData.get("excel_path") ?? "").trim() || null;
  if (!client_id || !source_url) throw new Error("missing_fields");

  const db = supa();
  const { data, error } = await db.from("skus").insert({ client_id, source_url, excel_path, status: "INGESTED", current_stage: "ingest" }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "db_insert_failed");

  await db.from("sku_events").insert({ sku_id: data.id, from_state: null, to_state: "INGESTED", actor: "ui/ingest", metadata: { source_url } });
  await q("scrape").add("scrape", { sku_id: data.id, source_url });
  revalidatePath("/ingest");
  revalidatePath("/dashboard");
}
