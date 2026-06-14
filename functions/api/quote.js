// Cloudflare Pages Function — 同源即時(延遲)報價代理。
// 路徑:GET /api/quote?symbol=NVDA
// 金鑰留在伺服器端(Cloudflare Pages → Settings → Environment variables 設 FMP_API_KEY),
// 不會出現在前端;同源呼叫,無 CORS 問題;15 分快取,省 API 額度。
//
// 前端 build_site 注入的 script 會打這支;打不到/沒設 key 時前端維持靜態價,不會壞。
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const sym = (url.searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z.]/g, "");
  const J = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=900", // 15 分延遲即可(對外不需即時)
        "access-control-allow-origin": "*",
      },
    });

  if (!sym) return J({ error: "no symbol" }, 400);
  const key = env.FMP_API_KEY;
  if (!key) return J({ symbol: sym, price: null, note: "FMP_API_KEY not set" });

  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/quote?symbol=${sym}&apikey=${key}`,
      { cf: { cacheTtl: 900, cacheEverything: true } }
    );
    const d = await r.json();
    const price = Array.isArray(d) && d[0] && typeof d[0].price === "number" ? d[0].price : null;
    return J({ symbol: sym, price });
  } catch (e) {
    return J({ symbol: sym, price: null, error: "fetch failed" });
  }
}
