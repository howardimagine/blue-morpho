/**
 * RIDEWELL 看路開 · /api/line — LINE Messaging API webhook(Cloudflare Pages Function)
 * 只處理 follow:有人加好友就回一張「本週油門」卡(內容來自 /ridewell_card.json,引擎每次收盤後重寫)。
 * Pages 環境變數:RIDEWELL_LINE_TOKEN(channel access token)、RIDEWELL_LINE_SECRET(channel secret,驗簽章)。
 */
export async function onRequestPost({ request, env }) {
  const body = await request.text();
  const sig = request.headers.get('x-line-signature') || '';
  if (!env.RIDEWELL_LINE_SECRET || !env.RIDEWELL_LINE_TOKEN) return new Response('not configured', { status: 500 });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RIDEWELL_LINE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (expected !== sig) return new Response('bad signature', { status: 403 });
  let events = [];
  try { events = JSON.parse(body).events || []; } catch { return new Response('bad json', { status: 400 }); }
  // 交易確認按鈕(schwab-mcp LINE approval):postback data = approval=<id>&decision=<approved|denied>&sig=<hmac16>
  const posts = events.filter(e => e.type === 'postback' && e.postback && /^approval=/.test(e.postback.data || ''));
  for (const e of posts) {
    const q = new URLSearchParams(e.postback.data); const id = q.get('approval'), dec = q.get('decision'), sig = q.get('sig');
    const from = e.source && e.source.userId; const ok = env.RIDEWELL_APPROVER && from === env.RIDEWELL_APPROVER && env.RIDEWELL_APPROVAL_SECRET && env.SUBSCRIBERS;
    let msg = '這個按鈕不是給你的。';
    if (ok && id && (dec === 'approved' || dec === 'denied')) {
      const k2 = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RIDEWELL_APPROVAL_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const m2 = new Uint8Array(await crypto.subtle.sign('HMAC', k2, new TextEncoder().encode(`${id}:${dec}`)));
      const want = Array.from(m2).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      if (want === sig) {
        const prev = await env.SUBSCRIBERS.get('approval:' + id);
        if (!prev) { await env.SUBSCRIBERS.put('approval:' + id, JSON.stringify({ decision: dec, at: new Date().toISOString() }), { expirationTtl: 3600 }); msg = dec === 'approved' ? '收到,核准下單。' : '收到,已拒絕。'; }
        else msg = '這筆已經決定過了。';
      } else msg = '簽章不符,忽略。';
    }
    if (e.replyToken) await fetch('https://api.line.me/v2/bot/message/reply', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RIDEWELL_LINE_TOKEN }, body: JSON.stringify({ replyToken: e.replyToken, messages: [{ type: 'text', text: msg }] }) });
  }
  const follows = events.filter(e => e.type === 'follow' && e.replyToken);
  if (!follows.length) return new Response('ok');
  let card;
  try { card = await (await fetch(new URL('/ridewell_card.json', request.url), { cf: { cacheTtl: 60 } })).json(); }
  catch { card = null; }
  const messages = card ? [{ type: 'flex', altText: card.alt.slice(0, 380), contents: card.bubble }]
                        : [{ type: 'text', text: '歡迎加入看路開。每週一早上會收到本週油門,美股盤後若有切換會再提醒。\nhttps://bluemorpho.art/leverage' }];
  await Promise.all(follows.map(e => fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RIDEWELL_LINE_TOKEN },
    body: JSON.stringify({ replyToken: e.replyToken, messages }) })));
  return new Response('ok');
}
export function onRequestGet() { return new Response('ridewell line webhook', { headers: { 'content-type': 'text/plain' } }); }
