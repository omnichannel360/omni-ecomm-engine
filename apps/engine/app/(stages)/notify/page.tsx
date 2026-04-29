export const dynamic = "force-dynamic";
export default function NotifyPage() {
  return (
    <>
      <h2 className="h">Stage 7 · Notify</h2>
      <p className="sub">Resend (email) + Slack Web API. YAML rules engine. Console fallback in v1.</p>
      <div className="card"><strong>Worker:</strong> <code>services/notify-worker</code> · <strong>Queue:</strong> <code>notify</code> · <strong>Owns:</strong> <code>notifications</code></div>
    </>
  );
}
