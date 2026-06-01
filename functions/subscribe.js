/**
 * BLUE MORPHO · /subscribe
 * Cloudflare Pages Function
 *
 * Receives { email, nickname } via POST JSON.
 * Stores to Cloudflare KV (namespace: SUBSCRIBERS).
 *
 * Setup:
 *   1. Create a KV namespace in Cloudflare dashboard
 *   2. In Pages project → Settings → Functions → KV namespace bindings
 *      Variable name: SUBSCRIBERS   →  your namespace
 *
 * Future: swap KV write for Brevo API call to add contact.
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  /* ── Parse body ─────────────────────────────────── */
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const email    = (body.email    ?? '').trim().toLowerCase();
  const nickname = (body.nickname ?? '').trim().slice(0, 30);

  /* ── Validate email ─────────────────────────────── */
  if (!email || !email.includes('@')) {
    return json({ error: 'Invalid email' }, 422);
  }

  /* ── Store to KV ────────────────────────────────── */
  const record = {
    email,
    nickname,
    subscribed_at: new Date().toISOString(),
    source:        request.headers.get('Referer') ?? 'direct'
  };

  try {
    // KV key = email (de-dupe); value = JSON record
    // TTL intentionally omitted — keep indefinitely
    if (env.SUBSCRIBERS) await env.SUBSCRIBERS.put(email, JSON.stringify(record));
  } catch (err) {
    // KV not bound yet (local dev) — log and continue
    console.error('[subscribe] KV write failed:', err?.message ?? err);
  }

  /* ── Add to Brevo list (寄送名單;失敗不擋使用者)──────── */
  // Cloudflare Pages → Settings → Variables：BREVO_API_KEY + BREVO_LIST_ID
  if (env.BREVO_API_KEY && env.BREVO_LIST_ID) {
    try {
      await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          attributes: nickname ? { NICKNAME: nickname } : {},
          listIds: [Number(env.BREVO_LIST_ID)],
          updateEnabled: true
        })
      });
    } catch (err) {
      console.error('[subscribe] Brevo add failed:', err?.message ?? err);
    }
  }

  /* ── Success ────────────────────────────────────── */
  return json({ ok: true, message: '已加入名單' }, 200);
}

/* ── CORS pre-flight ────────────────────────────────── */
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

/* ── Helpers ─────────────────────────────────────────── */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
