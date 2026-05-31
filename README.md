# Blue Morpho — 美股前沿觀察（自架網站）

引擎驅動的美股週報與個股分析。靜態網站，部署於 Cloudflare Pages，網域 `bluemorpho.art`。

## 結構

```
index.html         首頁(hero / 最新一期 / 精選 grid / 訂閱 / 主題)
weekly.html        週報頁(期數下拉切換 ?d=YYYY-MM-DD)
stock.html         個股頁(個股下拉切換 ?t=TICKER)
style.css          設計系統(Bloomberg × TRON 暗底青色)
assets/            icon / hero 圖
functions/
  subscribe.js     Cloudflare Pages Function — 收訂閱 email+nickname,存 KV(SUBSCRIBERS),日後接 Brevo
data/              引擎產出的真實資料(由 stock-radar/scripts/build_web.py 生成)
  report_cards.json        最新一期
  weekly/<date>.json       歷史各期 + index.json
  stocks/<TICKER>.json     每檔個股 + index.json
```

## 資料來源（不手刻、不放假資料）

所有頁面以 `fetch('/data/...')` 讀引擎真實輸出。沒有的欄位留空/隱藏，不補假值。
資料由後端引擎 `stock-radar/scripts/build_web.py` 產生並提交。

## 部署

- Cloudflare Pages：Build command 無、Output 目錄 `/`（根）。
- `/functions` 自動成為 Pages Functions。
- 訂閱需在 Pages 專案綁定 KV namespace，變數名 `SUBSCRIBERS`。
- 自訂網域 `bluemorpho.art`。
