import Link from "next/link";
import { supa } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type E = { id: string; sku_id: string; format: string; file_path: string; created_at: string };
type Sku = { id: string; client_id: string };

export default async function ExportPage() {
  let rows: E[] = [];
  let skuMap: Record<string, Sku> = {};
  try {
    const db = supa();
    const { data } = await db.from("exports").select("id, sku_id, format, file_path, created_at").order("created_at", { ascending: false }).limit(50);
    if (data) {
      rows = data as E[];
      const ids = Array.from(new Set(rows.map((r) => r.sku_id)));
      if (ids.length) {
        const { data: ss } = await db.from("skus").select("id, client_id").in("id", ids);
        for (const s of (ss ?? []) as Sku[]) skuMap[s.id] = s;
      }
    }
  } catch {}

  return (
    <>
      <h2 className="h">Stage 8 · Export</h2>
      <p className="sub">Canva CSV + ZIP packages. Auto-built on client approval.</p>
      <div className="card">
        {rows.length === 0 ? <p style={{ color: "var(--muted)" }}>No exports yet. Approve a SKU in <Link href="/review">Review</Link> to trigger.</p> : (
          <table>
            <thead><tr><th>SKU</th><th>Client</th><th>Format</th><th>Created</th><th>Download</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/review/${r.sku_id}`}><code>{r.sku_id.slice(0, 8)}</code></Link></td>
                <td>{skuMap[r.sku_id]?.client_id ?? "—"}</td>
                <td><span className="tag">{r.format}</span></td>
                <td style={{ color: "var(--muted)" }}>{new Date(r.created_at).toLocaleString()}</td>
                <td><a className="btn secondary" href={`/api/export/${r.sku_id}?format=${r.format === "zip" ? "zip" : "csv"}`}>Download</a></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
