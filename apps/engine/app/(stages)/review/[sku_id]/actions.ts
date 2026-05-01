"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { supa } from "@/lib/supabase";
import { q } from "@/lib/queue";

const SLOTS = ["hero", "lifestyle_1", "lifestyle_2", "lifestyle_3", "feature_infographic", "trust_slide"] as const;
type Slot = typeof SLOTS[number];

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

async function loadCurrentPrompts(sku_id: string): Promise<Array<{ slot: string; scene: string; alt_text?: string; palette_hint?: string; negative_prompt?: string }>> {
  const db = supa();
  const { data } = await db.from("ai_outputs").select("image_prompts_jsonb").eq("sku_id", sku_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const arr = Array.isArray(data?.image_prompts_jsonb) ? (data!.image_prompts_jsonb as Array<{ slot?: string; scene?: string; alt_text?: string; palette_hint?: string; negative_prompt?: string }>) : [];
  return arr.filter((x) => typeof x?.slot === "string" && (SLOTS as readonly string[]).includes(x.slot!)).map((x) => ({
    slot: x.slot!, scene: x.scene ?? "", alt_text: x.alt_text, palette_hint: x.palette_hint, negative_prompt: x.negative_prompt
  }));
}

export async function savePrompts(formData: FormData) {
  const sku_id = String(formData.get("sku_id") ?? "");
  if (!sku_id) throw new Error("missing_sku_id");
  const current = await loadCurrentPrompts(sku_id);
  const merged: Array<{ slot: string; scene: string; alt_text?: string; palette_hint?: string; negative_prompt?: string }> = [];
  for (const slot of SLOTS) {
    const existing = current.find((x) => x.slot === slot) ?? { slot, scene: "" };
    const scene = String(formData.get(`scene_${slot}`) ?? existing.scene);
    const negative_prompt = String(formData.get(`negative_${slot}`) ?? existing.negative_prompt ?? "");
    merged.push({ slot, scene, alt_text: existing.alt_text, palette_hint: existing.palette_hint, negative_prompt });
  }

  const db = supa();
  const { data: latest } = await db.from("ai_outputs").select("id, copy_jsonb, model_used, tokens_in, tokens_out").eq("sku_id", sku_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latest?.id) {
    await db.from("ai_outputs").update({ image_prompts_jsonb: merged }).eq("id", latest.id);
  } else {
    await db.from("ai_outputs").insert({ sku_id, copy_jsonb: {}, image_prompts_jsonb: merged, model_used: "manual" });
  }
  await db.from("sku_events").insert({ sku_id, to_state: "PROMPTS_EDITED", actor: "ui/review", metadata: {} });
  revalidatePath(`/review/${sku_id}`);
}

export async function regenerateAll(formData: FormData) {
  const sku_id = String(formData.get("sku_id") ?? "");
  if (!sku_id) throw new Error("missing_sku_id");
  await savePrompts(formData);
  const db = supa();
  await db.from("skus").update({ status: "GENERATING", current_stage: "generate" }).eq("id", sku_id);
  await db.from("sku_events").insert({ sku_id, to_state: "GENERATING", actor: "ui/review", metadata: { reason: "regenerate_all" } });
  await q("generate").add("regenerate-all", { sku_id });
  revalidatePath(`/review/${sku_id}`);
  redirect(`/review/${sku_id}`);
}

export async function regenerateSlot(formData: FormData) {
  const sku_id = String(formData.get("sku_id") ?? "");
  const slot = String(formData.get("slot") ?? "") as Slot;
  if (!sku_id || !(SLOTS as readonly string[]).includes(slot)) throw new Error("invalid");
  await savePrompts(formData);
  const db = supa();
  await db.from("skus").update({ status: "GENERATING", current_stage: "generate" }).eq("id", sku_id);
  await db.from("sku_events").insert({ sku_id, to_state: "GENERATING", actor: "ui/review", metadata: { reason: "regenerate_slot", slot } });
  await q("generate").add("regenerate-slot", { sku_id, slot });
  revalidatePath(`/review/${sku_id}`);
  redirect(`/review/${sku_id}`);
}
