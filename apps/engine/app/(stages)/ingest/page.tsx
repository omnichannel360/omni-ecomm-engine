import { supa } from "@/lib/supabase";
import { createSku } from "./actions";

export const dynamic = "force-dynamic";

type Row = { id: string; client_id: string; source_url: string; status: string; created_at: string };

export default async function IngestPage() {
  let recent: Row[] = [];
  try {
    const db = supa();
    const { data } = await db.from("skus").select("id, client_id, source_url, status, created_at").order("created_at", { ascending: false }).limit(10);
    if (data) recent = data as Row[];
  } catch {}

  return (
    <>
      <h2 className="h">Stage 1 · Ingest</h2>
      <p className="sub">Upload product URL + Excel. Triggers Playwright scrape via <code>scrape</code> queue.</p>
      <div className="card" style={{ maxWidth: 640 }}>
        <form action={createSku}>
          <div className="field"><label>Client ID</label><input name="client_id" required defaultValue="omnichannel" /></div>
          <div className="field"><label>Source URL</label><input name="source_url" type="url" required placeholder="https://example.com/product/sku-123" /></div>
          <div className="field"><label>Excel path (optional)</label><input name="excel_path" placeholder="storage://ecomm-assets/sku.xlsx" /></div>
          <button className="btn" type="submit">Queue Ingest</button>
        </form>
      </div>
      <div className="card">
        <h3 style={{ margin: "0 0 12px" }}>Recent</h3>
        {recent.length === 0 ? <p style={{ color: "var(--muted)" }}>None yet.</p> : (
          <table>
            <thead><tr><th>ID</th><th>Client</th><th>URL</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>{recent.map((s) => (<tr key={s.id}><td><code>{s.id.slice(0, 8)}</code></td><td>{s.client_id}</td><td style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.source_url}</td><td><span className="tag warn">{s.status}</span></td><td style={{ color: "var(--muted)" }}>{new Date(s.created_at).toLocaleString()}</td></tr>))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
