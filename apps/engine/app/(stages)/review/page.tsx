import Link from "next/link";
import { supa } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Row = { id: string; client_id: string; source_url: string; status: string; current_stage: string; updated_at: string };

export default async function ReviewListPage() {
  let rows: Row[] = [];
  try {
    const db = supa();
    const { data } = await db.from("skus").select("id, client_id, source_url, status, current_stage, updated_at").in("status", ["PENDING_REVIEW", "PENDING_CLIENT", "GENERATING", "AUDITING", "APPROVED", "FINALIZED"]).order("updated_at", { ascending: false }).limit(30);
    if (data) rows = data as Row[];
  } catch {}

  return (
    <>
      <h2 className="h">Stage 6 · Review</h2>
      <p className="sub">Click an SKU to review copy + 6 generated images. Approve to send to client.</p>
      <div className="card">
        {rows.length === 0 ? <p style={{ color: "var(--muted)" }}>Nothing to review.</p> : (
          <table>
            <thead><tr><th>ID</th><th>Client</th><th>Source</th><th>Status</th><th>Updated</th><th></th></tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id}>
                <td><code>{s.id.slice(0, 8)}</code></td>
                <td>{s.client_id}</td>
                <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.source_url}</td>
                <td><span className={`tag ${s.status === "FINALIZED" ? "good" : s.status === "FAILED" ? "bad" : "warn"}`}>{s.status}</span></td>
                <td style={{ color: "var(--muted)" }}>{new Date(s.updated_at).toLocaleString()}</td>
                <td><Link className="btn secondary" href={`/review/${s.id}`}>Open</Link></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
