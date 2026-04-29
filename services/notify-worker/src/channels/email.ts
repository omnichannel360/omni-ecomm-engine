import { Resend } from "resend";

let r: Resend | null = null;
function client(): Resend | null {
  if (r) return r;
  if (!process.env.RESEND_API_KEY) return null;
  r = new Resend(process.env.RESEND_API_KEY);
  return r;
}

export async function sendEmail(to: string, subject: string, body: string) {
  const c = client();
  if (!c) { console.log(`[email:stub] to=${to} subject=${subject}`); return { stub: true }; }
  return c.emails.send({ from: process.env.RESEND_FROM || "engine@omnichannelsol.com", to, subject, text: body });
}
