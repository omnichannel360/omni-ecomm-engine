import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;
function ai() {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  client = new GoogleGenAI({ apiKey });
  return client;
}

async function tryOnce(prompt: string): Promise<{ data: string; mime: string } | null> {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const res = await ai().models.generateContent({ model, contents: prompt });
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = (p as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
    if (inline?.data) return { data: inline.data, mime: inline.mimeType || "image/png" };
  }
  return null;
}

export async function bananaGenerate(prompt: string): Promise<{ data: string; mime: string } | null> {
  const variants = [
    prompt,
    `${prompt} Render the actual product visually — do not return text.`,
    `Generate a high-quality square photograph (2000x2000). Subject: ${prompt}`
  ];
  for (let i = 0; i < variants.length; i++) {
    try {
      const out = await tryOnce(variants[i]!);
      if (out) return out;
    } catch (e) {
      if (i === variants.length - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}
