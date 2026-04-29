export const dynamic = "force-dynamic";
export default function GeneratePage() {
  return (
    <>
      <h2 className="h">Stage 3 · Generate</h2>
      <p className="sub">Gemini 2.5 Flash Image (Nano Banana). FLUX/ComfyUI fallback deferred — no GPU on host.</p>
      <div className="card"><strong>Worker:</strong> <code>services/generate-worker</code> · <strong>Queue:</strong> <code>generate</code> · <strong>Owns:</strong> <code>generated_images</code></div>
      <div className="card">Generates 6 slots per SKU: hero, lifestyle_1-3, feature_infographic, trust_slide.</div>
    </>
  );
}
