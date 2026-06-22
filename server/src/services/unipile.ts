/**
 * Unipile — send an IG DM.
 *
 * Same provider the ig-dm-system pipeline READS DMs from; here we use it to SEND a reply
 * (the AI-drafted message the operator approves on the dashboard). Credentials come from
 * env (UNIPILE_DSN, UNIPILE_TOKEN) — injected by dashboard-web/web_run.py from
 * ~/Desktop/.env.secrets. Never hardcode (public repo).
 *
 * Sending is gated to localhost in the route layer — see routes/funnel.ts. This module
 * only performs the HTTP call.
 */
const DSN = process.env.UNIPILE_DSN || '';
const TOKEN = process.env.UNIPILE_TOKEN || '';

// Dedup guard: reject an identical (chat + text) send within this window. Protects against
// double-clicks / a retried request delivering the DM twice. (Observed: Node's fetch with a
// streaming FormData body double-TRANSMITTED to this endpoint, sending the DM twice from one
// call — fixed below by using a fully-buffered body; this guard is belt-and-suspenders.)
const DEDUP_MS = 30_000;
const recentSends = new Map<string, number>();

export async function sendIgMessage(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!DSN || !TOKEN) return { ok: false, error: 'UNIPILE_DSN/UNIPILE_TOKEN 未设置（见 ~/Desktop/.env.secrets）' };
  if (!chatId || !text || !text.trim()) return { ok: false, error: 'chat_id 和 text 必填' };

  const key = `${chatId}::${text.trim()}`;
  const now = Date.now();
  const prev = recentSends.get(key);
  if (prev && now - prev < DEDUP_MS) {
    return { ok: false, error: '刚刚已发过相同内容（防重复），请稍候再试' };
  }
  recentSends.set(key, now);
  // opportunistic cleanup so the map can't grow unbounded
  for (const [k, t] of recentSends) if (now - t > DEDUP_MS) recentSends.delete(k);

  // Build the multipart body as ONE buffered payload (NOT a FormData stream). Node's undici
  // fetch was observed re-transmitting a streaming FormData body to this endpoint, delivering
  // the message twice from a single call; a fully-buffered body sends exactly once (matches
  // the Python pipeline's behavior). POST /api/v1/chats/{chat_id}/messages, field `text`.
  const boundary = '----dash' + now.toString(16) + Math.floor(Math.random() * 1e9).toString(16);
  const body = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="text"\r\n\r\n${text}\r\n--${boundary}--\r\n`,
    'utf8',
  );
  try {
    const r = await fetch(`https://${DSN}/api/v1/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      headers: {
        'X-API-KEY': TOKEN,
        accept: 'application/json',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    if (!r.ok) {
      recentSends.delete(key); // failed → allow an immediate retry
      const b = await r.text().catch(() => '');
      return { ok: false, error: `Unipile ${r.status}: ${b.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    recentSends.delete(key);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
