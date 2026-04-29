import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;
function ai() {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  client = new GoogleGenAI({ apiKey });
  return client;
}

type Part = { text: string } | { inlineData: { data: string; mimeType: string } };

async function tryOnce(parts: Part[]): Promise<{ data: string; mime: string } | null> {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const res = await ai().models.generateContent({ model, contents: [{ role: "user", parts }] });
  const out = res.candidates?.[0]?.content?.parts ?? [];
  for (const p of out) {
    const inline = (p as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
    if (inline?.data) return { data: inline.data, mime: inline.mimeType || "image/png" };
  }
  return null;
}

export async function bananaGenerate(prompt: string, referenceImageUrl?: string | null): Promise<{ data: string; mime: string } | null> {
  let refPart: Part | null = null;
  if (referenceImageUrl) {
    try {
      const res = await fetch(referenceImageUrl, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
        if (buf.byteLength > 0 && buf.byteLength < 6 * 1024 * 1024) {
          refPart = { inlineData: { data: buf.toString("base64"), mimeType: mime } };
        }
      }
    } catch {}
  }

  const variants = [
    prompt,
    `${prompt}\nRender the actual product visually — do not return text.`,
    `Generate a high-quality square photograph (2000x2000). Subject: ${prompt}`
  ];

  for (let i = 0; i < variants.length; i++) {
    const parts: Part[] = [];
    if (refPart) parts.push(refPart);
    parts.push({ text: refPart ? `Use the attached image as the EXACT product reference. Keep the same product, colours, pattern and shape. ${variants[i]}` : variants[i]! });
    try {
      const out = await tryOnce(parts);
      if (out) return out;
    } catch (e) {
      if (i === variants.length - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}
