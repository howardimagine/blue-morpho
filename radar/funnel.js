/* BLUE MORPHO · SEPA Radar · 層級判定
 * ⚠ 與 stock-radar/agents/minervini.py evaluate() 逐行對應(tests/test_minervini.py 用 node 對帳)。
 * 改任何一邊都要改另一邊。純函數:symbols(latest.json 的 symbols)+ params → {levels, counts, fail, l4}
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadarFunnel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function c17(m, t) {
    const v = [m.px, m.m50, m.m150, m.m200, m.m200p, m.hi, m.lo];
    if (v.some(x => x == null)) return [false, false, false, false, false, false, false];
    const [px, m50, m150, m200, m200p, hi, lo] = v;
    return [
      px > m150 && px > m200,            // c1
      m150 > m200,                       // c2
      m200 > m200p,                      // c3 200MA 上彎
      m50 > m150 && m50 > m200,          // c4
      px > m50,                          // c5
      px >= lo * t.above_low_mult,       // c6
      px >= hi * t.below_high_mult,      // c7
    ];
  }

  // 強力拉升直通(與 Python _pp_ok 逐行對應)
  function ppOk(m, t, cs) {
    const P = t.power_play || {}, pp = m.pp;
    if (!P.enabled || !pp) return false;
    const vol = (P.run_vol_def || 'peak') === 'peak' ? pp.vpk : pp.vr;
    return (pp.g || 0) >= (P.min_gain_pct ?? 100)
      && (P.min_consol_bars ?? 10) <= pp.cd && pp.cd <= (P.max_consol_bars ?? 45)
      && pp.corr != null && pp.corr <= (P.max_correction_pct ?? 20)
      && pp.dh != null && pp.dh >= -(P.max_correction_pct ?? 20) && pp.dh <= (P.max_above_run_high_pct ?? 0)
      && pp.t10 != null && pp.t10 <= (P.max_tight10_pct ?? 25)
      && pp.one != null && pp.one <= (P.max_single_day_pct ?? 40)
      && vol != null && vol >= (P.run_vol_mult ?? 3)
      && pp.vr != null && pp.vr >= (P.run_vol_mean_min ?? 1.5)
      && (m.adr || 0) >= (P.min_adr_pct ?? 2)
      && cs[0] && cs[4] && cs[5] && cs[6] && (m.rs || 0) >= t.rs_min;
  }

  function earnWithin(m, days, today) {
    const nxt = m.e && m.e.next;
    if (!nxt) return false;
    const d = (Date.parse(nxt) - Date.parse(today)) / 86400000;
    return d >= 0 && d <= days;
  }

  function evaluate(symbols, P, today) {
    today = today || new Date().toISOString().slice(0, 10);
    const t = P.trend, fu = P.fundamental, ca = P.catalyst, vp = P.vcp, u = P.universe;
    // 每層 enabled=false → 整層略過(上一層通過的全部放行);缺鍵視為 true —— 與 Python 一致
    const on = { trend: t.enabled !== false, fundamental: fu.enabled !== false, catalyst: ca.enabled !== false, vcp: vp.enabled !== false };
    const levels = {}, fail = {}, tag = {}, pool = [];   // tag:v2 標籤(pp/hvc/cheat),永遠不是失敗碼
    for (const m of symbols) {
      const s = m.s;
      if ((m.st == null ? 99 : m.st) > u.max_stale_days || m.px == null) { fail[s] = 'stale'; continue; }
      if (m.bad) { fail[s] = 'data:' + m.bad; continue; }
      levels[s] = 0;
      if (on.trend) {
        if (m.m200 == null || m.hi == null) { fail[s] = 'hist'; continue; }   // 歷史不足 200/252 根:算不出來,不是 c1 沒過
        const cs = c17(m, t);
        const bad = cs.indexOf(false);
        const pok = ppOk(m, t, cs);                 // 強力拉升直通
        if (bad >= 0 && !pok) { fail[s] = 'c' + (bad + 1); continue; }
        if ((m.rs || 0) < t.rs_min) { fail[s] = 'c8'; continue; }
        const tdShort = (m.td || 0) < t.min_trend_days;
        if (tdShort && !pok) { fail[s] = 'trend_days'; continue; }
        if (pok && (bad >= 0 || tdShort)) tag[s] = 'pp';
      }
      levels[s] = 1;
      if (on.fundamental) {
        const f = m.f || {};
        if (!f.ok) { fail[s] = 'L2:no_data'; continue; }
        const revOk = f.rev_g != null && f.rev_g >= fu.rev_growth_min;
        const epsOk = (f.eps_g != null && f.eps_g >= fu.eps_growth_min) || (fu.accept_turnaround && f.turn);
        const accel = (f.rev_g != null && f.rev_g_prev != null && f.rev_g > f.rev_g_prev) ||
                      (f.eps_g != null && f.eps_g_prev != null && f.eps_g > f.eps_g_prev);
        const gmOk = f.gm != null && f.gm >= fu.gross_margin_min;
        if (!revOk) { fail[s] = f.rev_g != null ? 'L2:rev' : 'L2:rev_na'; continue; }
        if (!epsOk) { fail[s] = f.eps_g != null ? 'L2:eps' : 'L2:eps_na'; continue; }
        if (fu.require_acceleration && !accel) { fail[s] = 'L2:accel'; continue; }
        if (!gmOk) { fail[s] = f.gm != null ? 'L2:gm' : 'L2:gm_na'; continue; }
      }
      levels[s] = 2;
      if (on.catalyst) {
        if ((m.rs || 0) < ca.rs_min) { fail[s] = 'L3:rs'; continue; }
        if (m.hi && (m.px / m.hi - 1) * 100 < -ca.max_dist_from_high_pct) { fail[s] = 'L3:dist'; continue; }
        if (ca.min_adr_pct && (m.adr || 0) < ca.min_adr_pct) { fail[s] = 'L3:adr'; continue; }
        const ev_ = ca.event_consecutive_days ? ((m.lu || 0) >= ca.event_consecutive_days) : ((m.gap || 0) > ca.max_single_day_gap_pct);   // 台股:連續漲停 ≥ N 天;美股:單日 > N%
        if (ca.exclude_event_driven && ev_) { fail[s] = 'L3:event'; continue; }
        if (ca.exclude_earnings_window && earnWithin(m, ca.earnings_within_days, today)) { fail[s] = 'L3:earnings'; continue; }
      }
      pool.push(m);
    }
    // 產業上限:(-rs, 代號) 排序、floor —— 與 Python 一致;L3 關閉 → 不設上限
    pool.sort((a, b) => ((b.rs || 0) - (a.rs || 0)) || (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
    const cap = on.catalyst ? Math.max(ca.sector_cap_min | 0, Math.floor(pool.length * ca.sector_cap_pct / 100)) : pool.length + 1;
    const per = {}, l4 = [];
    for (const m of pool) {
      const sec = m.sec || '?';
      if ((per[sec] || 0) >= cap) { fail[m.s] = 'L3:sector_cap'; continue; }
      per[sec] = (per[sec] || 0) + 1;
      levels[m.s] = 3;
      if (on.vcp) {
        const vc = m.v;
        if (!vc) { fail[m.s] = 'L4:no_vcp'; continue; }
        if (vc.n < vp.min_contractions) { fail[m.s] = 'L4:n'; continue; }
        if (vc.q < vp.min_quality) { fail[m.s] = 'L4:quality'; continue; }
        if (vc.dp < -vp.max_below_pivot_pct) { fail[m.s] = 'L4:below_pivot'; continue; }
      }
      levels[m.s] = 4;
      l4.push(m.s);
    }
    const vals = Object.values(levels);
    const counts = [0, 1, 2, 3, 4].map(i => vals.filter(x => x >= i).length);
    return { levels, counts, fail, l4, tag };
  }

  return { evaluate, c17 };
});
