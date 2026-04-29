import { supa } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type SkuRow = { id: string; client_id: string; status: string; current_stage: string; updated_at: string };

export default async function DashboardPage() {
  const counts = { total: 0, finalized: 0, pending: 0, failed: 0 };
  let recent: SkuRow[] = [];
  try {
    const db = supa();
    const { data: c } = await db.from("skus").select("status");
    if (c) {
      const arr = c as Array<{ status: string }>;
      counts.total = arr.length;
      counts.finalized = arr.filter((x) => x.status === "FINALIZED").length;
      counts.pending = arr.filter((x) => !["FINALIZED", "FAILED", "REJECTED"].includes(x.status)).length;
      counts.failed = arr.filter((x) => x.status === "FAILED").length;
    }
    const { data: r } = await db.from("skus").select("id, client_id, status, current_stage, updated_at").order("updated_at", { ascending: false }).limit(15);
    if (r) recent = r as SkuRow[];
  } catch {}

  return (
    <>
      <h2 className="h">Dashboard</h2>
      <p className="sub">KPIs across all stages — live from <code>ecomm_engine</code> schema.</p>
      <div className="row">
        <div className="kpi"><div className="l">SKUs total</div><div className="v">{counts.total}</div></div>
        <div className="kpi"><div className="l">In flight</div><div className="v">{counts.pending}</div></div>
        <div className="kpi"><div className="l">Finalized</div><div className="v">{counts.finalized}</div></div>
        <div className="kpi"><div className="l">Failed</div><div className="v">{counts.failed}</div></div>
      </div>
      <div className="card">
        <h3 style={{ margin: "0 0 12px" }}>Recent SKUs</h3>
        {recent.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No SKUs yet. Submit one in <a href="/ingest">Ingest</a>.</p>
        ) : (
          <table>
            <thead><tr><th>ID</th><th>Client</th><th>Stage</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id}>
                  <td><code>{s.id.slice(0, 8)}</code></td>
                  <td>{s.client_id}</td>
                  <td><span className="tag">{s.current_stage}</span></td>
                  <td><span className={`tag ${s.status === "FINALIZED" ? "good" : s.status === "FAILED" ? "bad" : "warn"}`}>{s.status}</span></td>
                  <td style={{ color: "var(--muted)" }}>{new Date(s.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
