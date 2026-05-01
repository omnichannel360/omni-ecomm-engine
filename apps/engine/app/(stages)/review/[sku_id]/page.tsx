import Link from "next/link";
import { supa } from "@/lib/supabase";
import { sendToClient, savePrompts, regenerateAll, regenerateSlot } from "./actions";

export const dynamic = "force-dynamic";

type Sku = { id: string; client_id: string; source_url: string; status: string; current_stage: string };
type AiOut = { copy_jsonb: { headers?: string[]; body?: string; bullets?: string[]; trust_badges?: Array<{ label: string }> } | null; image_prompts_jsonb: unknown; model_used: string | null; tokens_in: number | null; tokens_out: number | null };
type Img = { id: string; slot: string; model: string; prompt: string | null; file_path: string | null; fallback_reason: string | null };
type Audit = { image_id: string; check_name: string; passed: boolean; score: number | null; reason: string | null };
type Approval = { token: string; decision: string | null; expires_at: string };
type PromptItem = { slot?: string; scene?: string; alt_text?: string; palette_hint?: string; negative_prompt?: string };

const SLOT_ORDER = ["hero", "lifestyle_1", "lifestyle_2", "lifestyle_3", "feature_infographic", "trust_slide"] as const;

export default async function ReviewSkuPage({ params }: { params: Promise<{ sku_id: string }> }) {
  const { sku_id } = await params;
  const db = supa();
  const [sR, aR, iR, apR] = await Promise.all([
    db.from("skus").select("id, client_id, source_url, status, current_stage").eq("id", sku_id).maybeSingle(),
    db.from("ai_outputs").select("copy_jsonb, image_prompts_jsonb, model_used, tokens_in, tokens_out").eq("sku_id", sku_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("generated_images").select("id, slot, model, prompt, file_path, fallback_reason").eq("sku_id", sku_id),
    db.from("approvals").select("token, decision, expires_at").eq("sku_id", sku_id).order("created_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  const sku = sR.data as Sku | null;
  const ai = aR.data as AiOut | null;
  const imgs = (iR.data ?? []) as Img[];
  const approval = apR.data as Approval | null;
  const prompts: PromptItem[] = Array.isArray(ai?.image_prompts_jsonb) ? (ai!.image_prompts_jsonb as PromptItem[]) : [];

  const auditByImg: Record<string, Audit[]> = {};
  if (imgs.length) {
    const { data } = await db.from("audit_results").select("image_id, check_name, passed, score, reason").in("image_id", imgs.map((i) => i.id));
    for (const r of (data ?? []) as Audit[]) {
      (auditByImg[r.image_id] ||= []).push(r);
    }
  }

  if (!sku) return (<><h2 className="h">Not found</h2></>);
  const sortedImgs = [...imgs].sort((a, b) => SLOT_ORDER.indexOf(a.slot as typeof SLOT_ORDER[number]) - SLOT_ORDER.indexOf(b.slot as typeof SLOT_ORDER[number]));
  const copy = ai?.copy_jsonb ?? null;
  const isFinalized = sku.status === "FINALIZED";
  const isGenerating = sku.status === "GENERATING" || sku.status === "AUDITING" || sku.status === "PROCESSING" || sku.status === "SCRAPING";

  return (
    <>
      <h2 className="h">Review · <code>{sku.id.slice(0, 8)}</code></h2>
      <p className="sub">{sku.client_id} · <a href={sku.source_url} target="_blank" rel="noreferrer">{sku.source_url}</a> · <span className={`tag ${isFinalized ? "good" : isGenerating ? "warn" : ""}`}>{sku.status}</span></p>

      <div className="card">
        <h3 style={{ margin: "0 0 12px" }}>Generated A+ Copy {ai?.model_used && <span className="tag">{ai.model_used}</span>}</h3>
        {!copy ? <p style={{ color: "var(--muted)" }}>No copy yet.</p> : (
          <div>
            {copy.headers && copy.headers.length > 0 && (<div style={{ marginBottom: 12 }}><div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>Headers</div>{copy.headers.map((h, i) => <div key={i} style={{ fontWeight: 600, fontSize: 16 }}>{h}</div>)}</div>)}
            {copy.body && (<div style={{ marginBottom: 12 }}><div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>Body</div><div>{copy.body}</div></div>)}
            {copy.bullets && copy.bullets.length > 0 && (<div style={{ marginBottom: 12 }}><div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>Bullets</div><ul>{copy.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul></div>)}
            {copy.trust_badges && copy.trust_badges.length > 0 && (<div><div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>Trust badges</div>{copy.trust_badges.map((b, i) => <span key={i} className="tag" style={{ marginRight: 6 }}>{b.label}</span>)}</div>)}
          </div>
        )}
      </div>

      <form action={regenerateAll}>
        <input type="hidden" name="sku_id" value={sku.id} />
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>6 Image Slots — edit prompt + negative prompt per slot</h3>
            <div>
              <button className="btn secondary" formAction={savePrompts}>Save Prompts</button>{" "}
              <button className="btn" type="submit" disabled={isGenerating}>Regenerate All ({isGenerating ? "running…" : "click"})</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
            {SLOT_ORDER.map((slot) => {
              const img = sortedImgs.find((i) => i.slot === slot);
              const audits = img ? auditByImg[img.id] ?? [] : [];
              const visionAudit = audits.find((a) => a.check_name === "vision_qa");
              const p = prompts.find((x) => x.slot === slot);
              return (
                <div key={slot} style={{ background: "#0e1118", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div style={{ aspectRatio: "1/1", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {img?.file_path ? (<img src={`/api/images/${sku.id}/${slot}`} alt={slot} style={{ width: "100%", height: "100%", objectFit: "cover" }} />) : (<span style={{ color: "var(--muted)", fontSize: 12 }}>{img?.fallback_reason ?? "no image"}</span>)}
                  </div>
                  <div style={{ padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{slot}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{img?.model ?? "—"}</div>
                    </div>
                    {visionAudit && (<div style={{ margin: "6px 0" }}><span className={`tag ${visionAudit.passed ? "good" : "bad"}`}>{visionAudit.passed ? "vision pass" : "vision fail"}</span> {visionAudit.score !== null && <span style={{ fontSize: 11, color: "var(--muted)" }}>score {Number(visionAudit.score).toFixed(2)}</span>}{visionAudit.reason && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{visionAudit.reason}</div>}</div>)}
                    <label style={{ marginTop: 8 }}>Prompt (scene)</label>
                    <textarea name={`scene_${slot}`} rows={4} defaultValue={p?.scene ?? ""} placeholder="Describe what should appear in this slot..." style={{ width: "100%", fontFamily: "inherit", fontSize: 12, padding: 8, background: "#0b0d12", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 6 }} />
                    <label style={{ marginTop: 8 }}>Negative prompt (avoid)</label>
                    <textarea name={`negative_${slot}`} rows={2} defaultValue={p?.negative_prompt ?? ""} placeholder="e.g. text errors, watermarks, hands, blurry, deformed product..." style={{ width: "100%", fontFamily: "inherit", fontSize: 12, padding: 8, background: "#0b0d12", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 6 }} />
                    <div style={{ marginTop: 10 }}>
                      <button className="btn secondary" formAction={regenerateSlot} name="slot" value={slot} disabled={isGenerating} style={{ fontSize: 12 }}>Regenerate this slot</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </form>

      {!isFinalized && (
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Send to Client</h3>
          <form action={sendToClient}>
            <input type="hidden" name="sku_id" value={sku.id} />
            <button className="btn" type="submit">Generate Client Approval Link</button>
          </form>
        </div>
      )}

      {approval && (
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Client Approval Link</h3>
          <div>Token: <code>{approval.token.slice(0, 12)}…</code> · expires {new Date(approval.expires_at).toLocaleString()} · <span className={`tag ${approval.decision === "approved" ? "good" : "warn"}`}>{approval.decision ?? "pending"}</span></div>
          <div style={{ marginTop: 8 }}><Link className="btn" href={`/omni-approval/${approval.token}`} target="_blank">Open client portal</Link></div>
        </div>
      )}

      {isFinalized && (
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Export</h3>
          <a className="btn" href={`/api/export/${sku.id}?format=zip`}>Download ZIP (CSV + 6 images)</a>
          <a className="btn secondary" href={`/api/export/${sku.id}?format=csv`} style={{ marginLeft: 8 }}>Download CSV only</a>
        </div>
      )}
    </>
  );
}
