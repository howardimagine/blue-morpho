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

  /* ── Add to Brevo list + 寄一封「訂閱成功」歡迎信(失敗不擋使用者)──── */
  if (env.BREVO_API_KEY && env.BREVO_LIST_ID) {
    const listId = Number(env.BREVO_LIST_ID);
    try {
      // 1) 加入名單
      await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          attributes: nickname ? { NICKNAME: nickname } : {},
          listIds: [listId],
          updateEnabled: true
        })
      });
      // 2) 寄歡迎信(transactional;sender 用已驗證寄件人)
      const sender = env.BREVO_SENDER
        ? { email: env.BREVO_SENDER, name: env.BREVO_SENDER_NAME || 'Blue Morpho' }
        : null;
      if (sender) {
        const hi = nickname ? `${nickname},` : '朋友,';
        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({
            sender,
            to: [{ email, name: nickname || undefined }],
            subject: '訂閱成功 · Blue Morpho 美股週報',
            htmlContent: welcomeHtml(hi)
          })
        });
      }
    } catch (err) {
      console.error('[subscribe] Brevo failed:', err?.message ?? err);
    }
  }

  /* ── Success ────────────────────────────────────── */
  return json({ ok: true, message: '訂閱成功' }, 200);
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

/* 訂閱成功歡迎信(table 排版、email-safe、深底亮字)*/
function welcomeHtml(hi) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#02020a" style="background:#02020a;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;font-family:-apple-system,'PingFang TC','Noto Sans TC',Arial,sans-serif;">
  <tr><td align="center" style="padding-bottom:18px;">
    <div style="font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:bold;letter-spacing:.16em;color:#00f3ff;">BLUE&nbsp;MORPHO</div>
    <div style="font-family:Georgia,serif;font-style:italic;font-size:13px;color:#9fb2c6;margin-top:6px;">Seeking the blue glimmers hidden within the market forest.</div>
  </td></tr>
  <tr><td style="border-top:1px solid #1a2238;padding-top:24px;color:#e0f7fa;font-size:15px;line-height:1.9;">
    ${hi}<br>
    <strong style="color:#00ff9d;">訂閱成功!</strong> 你已加入 Blue Morpho 美股週報。<br>
    之後每期的引擎週報會直接送進這個信箱。
  </td></tr>
  <tr><td align="center" style="padding:28px 0 6px;">
    <a href="https://lin.ee/xt0mgJH" style="display:block;width:280px;max-width:80%;margin:0 auto;background:#00ff9d;color:#02020a;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:bold;letter-spacing:.04em;text-decoration:none;padding:16px 0;border-radius:6px;text-align:center;">加入我們的 LINE</a>
  </td></tr>
  <tr><td align="center" style="padding:12px 0 6px;">
    <a href="https://bluemorpho.art/weekly.html" style="display:block;width:280px;max-width:80%;margin:0 auto;background:#00f3ff;color:#02020a;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:bold;letter-spacing:.04em;text-decoration:none;padding:16px 0;border-radius:6px;text-align:center;">看最新週報</a>
  </td></tr>
  <tr><td style="padding-top:24px;color:#8a9bb0;font-size:11px;line-height:1.7;">
    本報告為引擎觀點,僅供市場資訊與教育用途,非投資建議。
  </td></tr>
</table>
</td></tr></table>`;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
