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
