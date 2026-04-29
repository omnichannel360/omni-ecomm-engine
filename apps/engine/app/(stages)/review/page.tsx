export const dynamic = "force-dynamic";
export default function ReviewPage() {
  return (
    <>
      <h2 className="h">Stage 6 · Review</h2>
      <p className="sub">TipTap editor + side-by-side viewer. Approve to send to client.</p>
      <div className="card"><strong>Owns:</strong> <code>ai_outputs.edited_copy</code> · transitions <code>PENDING_REVIEW</code> → <code>PENDING_CLIENT</code>.</div>
      <div className="card">Editor UI lands in v1.2.</div>
    </>
  );
}
