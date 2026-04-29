import { supa } from "@/lib/supabase";
import { decide } from "./actions";

export const dynamic = "force-dynamic";

export default async function OmniApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let approval: { id: string; sku_id: string; decision: string | null; expires_at: string } | null = null;
  let sku: { id: string; client_id: string; source_url: string; status: string } | null = null;
  try {
    const db = supa();
    const { data: a } = await db.from("approvals").select("id, sku_id, decision, expires_at").eq("token", token).maybeSingle();
    if (a) {
      approval = a as typeof approval;
      const { data: s } = await db.from("skus").select("id, client_id, source_url, status").eq("id", a.sku_id).maybeSingle();
      if (s) sku = s as typeof sku;
    }
  } catch {}

  if (!approval) {
    return (<div className="main"><h2 className="h">Invalid or expired link</h2><p className="sub">Contact your OmniChannel account manager.</p></div>);
  }
  const expired = new Date(approval.expires_at).getTime() < Date.now();

  return (
    <div style={{ padding: 32, maxWidth: 880, margin: "0 auto" }}>
      <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-2)" }}>OmniChannel · Client Approval</div>
        <h1 style={{ margin: "6px 0 0" }}>Review & Approve</h1>
      </div>
      <div className="card">
        <div><strong>Client:</strong> {sku?.client_id}</div>
        <div><strong>Source:</strong> <code>{sku?.source_url}</code></div>
        <div><strong>Status:</strong> <span className="tag warn">{sku?.status}</span></div>
        <div><strong>Token expires:</strong> {new Date(approval.expires_at).toLocaleString()} {expired && <span className="tag bad">expired</span>}</div>
      </div>
      {!expired && approval.decision !== "approved" && (
        <form action={decide} className="card">
          <input type="hidden" name="token" value={token} />
          <div className="field"><label>Approver email</label><input name="email" type="email" required /></div>
          <div className="field"><label>Comments (optional)</label><textarea name="comments" rows={3} /></div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" name="decision" value="approved">Approve</button>
            <button className="btn secondary" name="decision" value="regenerate">Regenerate</button>
            <button className="btn secondary" name="decision" value="rejected">Reject</button>
          </div>
        </form>
      )}
      {approval.decision && (<div className="card"><strong>Decision:</strong> <span className={`tag ${approval.decision === "approved" ? "good" : "warn"}`}>{approval.decision}</span></div>)}
    </div>
  );
}
