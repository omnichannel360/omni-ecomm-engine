import { supa } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type N = { id: string; sku_id: string | null; event: string; channel: string; recipient: string | null; status: string; sent_at: string | null; error: string | null; created_at: string };

export default async function NotifyPage() {
  let rows: N[] = [];
  try {
    const db = supa();
    const { data } = await db.from("notifications").select("id, sku_id, event, channel, recipient, status, sent_at, error, created_at").order("created_at", { ascending: false }).limit(50);
    if (data) rows = data as N[];
  } catch {}

  return (
    <>
      <h2 className="h">Stage 7 · Notify</h2>
      <p className="sub">Latest 50 notifications. Channels: console (default), email (Resend), slack (Slack API).</p>
      <div className="card">
        {rows.length === 0 ? <p style={{ color: "var(--muted)" }}>No notifications yet.</p> : (
          <table>
            <thead><tr><th>Time</th><th>Event</th><th>Channel</th><th>Recipient</th><th>SKU</th><th>Status</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString()}</td>
                <td><code>{r.event}</code></td>
                <td><span className="tag">{r.channel}</span></td>
                <td>{r.recipient ?? "—"}</td>
                <td>{r.sku_id ? <code>{r.sku_id.slice(0, 8)}</code> : "—"}</td>
                <td><span className={`tag ${r.status === "sent" ? "good" : r.status === "failed" ? "bad" : "warn"}`}>{r.status}</span>{r.error && <div style={{ fontSize: 11, color: "var(--bad)", marginTop: 2 }}>{r.error}</div>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
