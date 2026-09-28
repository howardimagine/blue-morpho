/**
 * RIDEWELL · /api/approval?id=<approval id>&key=<secret> — schwab-mcp 本機輪詢交易確認結果。
 * 決定由 /api/line 的 postback 寫進 KV(SUBSCRIBERS,key approval:<id>,1 小時過期)。
 */
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url); const id = u.searchParams.get('id') || ''; const key = u.searchParams.get('key') || '';
  if (!env.RIDEWELL_APPROVAL_SECRET || key !== env.RIDEWELL_APPROVAL_SECRET) return new Response('forbidden', { status: 403 });
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(id) || !env.SUBSCRIBERS) return new Response('{"decision":null}', { headers: { 'content-type': 'application/json' } });
  const v = await env.SUBSCRIBERS.get('approval:' + id);
  return new Response(v || '{"decision":null}', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
