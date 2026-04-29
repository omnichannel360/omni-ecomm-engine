"use server";
import { revalidatePath } from "next/cache";
import { supa } from "@/lib/supabase";
import { q } from "@/lib/queue";

export async function decide(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const comments = String(formData.get("comments") ?? "").trim();
  if (!token || !["approved", "regenerate", "rejected"].includes(decision)) throw new Error("invalid");

  const db = supa();
  const { data: a } = await db.from("approvals").select("id, sku_id, expires_at").eq("token", token).maybeSingle();
  if (!a) throw new Error("not_found");
  if (new Date(a.expires_at).getTime() < Date.now()) throw new Error("expired");

  await db.from("approvals").update({ decision, approver_email: email, comments_jsonb: comments ? { text: comments } : null, approved_at: decision === "approved" ? new Date().toISOString() : null }).eq("id", a.id);

  if (decision === "approved") {
    await db.from("skus").update({ status: "APPROVED", current_stage: "export" }).eq("id", a.sku_id);
    await db.from("sku_events").insert({ sku_id: a.sku_id, from_state: "PENDING_CLIENT", to_state: "APPROVED", actor: email, metadata: {} });
    await q("export").add("export", { sku_id: a.sku_id });
    await q("notify").add("notify", { event: "client.approved", sku_id: a.sku_id, payload: { email, comments } });
  } else if (decision === "regenerate") {
    await db.from("skus").update({ status: "GENERATING", current_stage: "generate" }).eq("id", a.sku_id);
    await db.from("sku_events").insert({ sku_id: a.sku_id, from_state: "PENDING_CLIENT", to_state: "GENERATING", actor: email, metadata: { reason: comments } });
    await q("generate").add("regenerate", { sku_id: a.sku_id, reason: comments });
    await q("notify").add("notify", { event: "client.regenerate_requested", sku_id: a.sku_id, payload: { email, comments } });
  } else {
    await db.from("skus").update({ status: "REJECTED" }).eq("id", a.sku_id);
    await db.from("sku_events").insert({ sku_id: a.sku_id, from_state: "PENDING_CLIENT", to_state: "REJECTED", actor: email, metadata: { reason: comments } });
  }
  revalidatePath(`/omni-approval/${token}`);
}
