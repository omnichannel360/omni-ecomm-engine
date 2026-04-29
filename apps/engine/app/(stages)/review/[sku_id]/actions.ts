"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { supa } from "@/lib/supabase";
import { q } from "@/lib/queue";

export async function sendToClient(formData: FormData) {
  const sku_id = String(formData.get("sku_id") ?? "");
  if (!sku_id) throw new Error("missing_sku_id");
  const db = supa();
  const token = randomBytes(24).toString("hex");
  const ttl = Number(process.env.APPROVAL_TOKEN_TTL_DAYS ?? 7);
  const expires_at = new Date(Date.now() + ttl * 86400_000).toISOString();
  await db.from("approvals").insert({ sku_id, token, decision: "pending", expires_at });
  await db.from("skus").update({ status: "PENDING_CLIENT", current_stage: "review" }).eq("id", sku_id);
  await db.from("sku_events").insert({ sku_id, to_state: "PENDING_CLIENT", actor: "ui/review", metadata: { token: token.slice(0, 8) } });
  await q("notify").add("notify", { event: "client.approval_requested", sku_id, payload: { token } });
  revalidatePath(`/review/${sku_id}`);
  redirect(`/review/${sku_id}`);
}

export async function regenerate(formData: FormData) {
  const sku_id = String(formData.get("sku_id") ?? "");
  if (!sku_id) throw new Error("missing_sku_id");
  const db = supa();
  await db.from("skus").update({ status: "GENERATING", current_stage: "generate" }).eq("id", sku_id);
  await db.from("sku_events").insert({ sku_id, to_state: "GENERATING", actor: "ui/review", metadata: { reason: "manual_regenerate" } });
  await q("generate").add("regenerate", { sku_id });
  revalidatePath(`/review/${sku_id}`);
  redirect(`/review/${sku_id}`);
}
