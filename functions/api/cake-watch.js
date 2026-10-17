/**
 * 供應鏈雷達 · /api/cake-watch — 網頁上的「追蹤」名單,存 KV(SUBSCRIBERS,key cake:watch)。
 * GET  → {"watch":[...]}(公開讀;引擎每天早上抓這份合併計算)
 * POST {sym, action:"add"|"remove", key} → 需 key === CAKE_WATCH_KEY(Cloudflare Pages 環境變數;Howard 本人),回新名單。
 */
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });
async function read(env) { try { return JSON.parse((await env.SUBSCRIBERS.get('cake:watch')) || '[]'); } catch { return []; } }

export async function onRequestGet({ env }) {
  if (!env.SUBSCRIBERS) return J({ watch: [], error: 'no kv' }, 500);
  return J({ watch: await read(env) });
}

export async function onRequestPost({ request, env }) {
  const K = env.CAKE_WATCH_KEY || env.RIDEWELL_APPROVAL_SECRET;
  if (!env.SUBSCRIBERS || !K) return J({ error: 'not configured: set CAKE_WATCH_KEY in Pages env' }, 500);
  let b; try { b = await request.json(); } catch { return J({ error: 'bad json' }, 400); }
  if (!b || b.key !== K) return J({ error: 'forbidden' }, 403);
  const sym = String(b.sym || '').toUpperCase().trim();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(sym)) return J({ error: 'bad symbol' }, 400);
  const cur = new Set(await read(env));
  if (b.action === 'remove') cur.delete(sym); else cur.add(sym);
  const out = [...cur].sort();
  await env.SUBSCRIBERS.put('cake:watch', JSON.stringify(out));
  return J({ watch: out });
}
