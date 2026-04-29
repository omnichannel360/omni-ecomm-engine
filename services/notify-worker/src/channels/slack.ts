export async function sendSlack(channel: string, text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) { console.log(`[slack:stub] channel=${channel} text=${text}`); return { stub: true }; }
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ channel, text })
  });
  return r.json();
}
