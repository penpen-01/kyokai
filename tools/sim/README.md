# 対戦シミュレーター（開発用）

カード工房の「検証」タブと同じ計算を、パソコンからまとめて回すためのスクリプト。

1. リポジトリのフォルダで `python3 -m http.server 8765`
2. `node tools/sim/run.js '{"rule":"current"}' 40 normal` → 型別デッキで総当たり（組み合わせごと40試合）
   - 4つ目の引数に `presets` を付けると CPU 用デッキで総当たり
   - `"config":{...}` で設定を、`"cards":{"crystal":{"cost":3}}` でカードの数値を一時的に変えて試せる
3. 結果の JSON を `python3 tools/sim/rep.py 結果.json` で要約

`harness.js` の `"rule":"open"` は旧ルールから新ルールを試すためのもの。今のゲームはすでに新ルールなので `"current"` でよい。
