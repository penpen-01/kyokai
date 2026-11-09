# 引き継ぎメモ（新しいチャットはまずここ）

## 読む順番
1. このファイル（約束ごと）
2. `docs/next-plan.md`（今の状態と次にやること。短い）
3. 必要なときだけ：`README.md`（仕様）／`docs/decisions.md`（決めた理由）／`docs/effects-plan.md`（効果の仕組み）／`docs/balance-notes.md`（強さの調整）／`docs/ideas.md`（いつかやること）／`docs/history.md`（過去の経緯。長いので探すときだけ）

## このプロジェクト
- 趣味のスマホ向けカードゲーム「境界の召喚士」。1対1、デッキ構築、プレイヤー体力制。ベータ版を友達と試している
- 遊ぶ：https://penpen-01.github.io/kyokai/ ／ 管理：https://penpen-01.github.io/kyokai/editor.html（カード工房）
- GitHub：penpen-01/kyokai（main に push すると GitHub Pages に反映）。Firebase：kyokai-41803（Realtime Database・匿名ログイン・無料プラン）

## オーナーとの約束
- 日本語で、忖度せず率直に。NO ならはっきり NO
- 日本語を含む図はかならず日本語フォントで
- 強さの数値はオーナーが決める。Claude は案やシミュレーション結果を出すだけで、指定されたカードしか変えない
- 見た目が変わるものは `kakunin` ブランチ（1本だけを上書き）で見せて、OK をもらってから main へ。カードやデータだけの変更は main へ直接でよい。オーナーが実機で触る必要があるものは main に入れる（kakunin は公開されない）
- ブランチの削除をオーナーに頼まない
- GitHub のトークンはゲームのデータを書き換えられる鍵。オーナーは紙で保管している。絶対に表示・記録しない
- 透かし入り・有料の画像素材（PIXTA など）は使わない

## 作業の約束
- push の前に必ず `git fetch` → rebase（オーナーがカード工房から game-data.json を直接公開するため）。オーナーが工房で編集中のときは、game-data.json を先に書き換えない（上書きされる）
- リリースごとに `sw.js` の `CACHE` の番号を上げる
- イラストは `tools/art/put.py` で入れる（400×560 の WebP、`art/<ID>-<ハッシュ>.webp`、version を上げる）。依頼文の作り方とコツは `tools/art/README.md`
- シミュレーションは `tools/sim/`（README あり）。開放戦デッキの勝率は `node tools/sim/gate_eval.js 試合数 出力.json`（先に `python3 -m http.server 8765`）
- Firebase のルール（database.rules.json）を変えたら、オーナーに Firebase の画面へ貼り直してもらう

## 現在のルール
- デッキ30枚・同名3枚・体力20・エナジー上限10・場は4体まで・初期手札5枚・手札上限10枚
- 守護がいなければ本体を攻撃できる。直撃＝守護を無視。後攻は「境界の欠片」を持って始まる

## 知っておくこと
- アカウント・G・カードは各自の端末が Firebase に書き込む。詳しい人ならズルできるが、友達だけの間は対策しない（オーナー決定）
- iPhone のホーム画面アプリは Safari と別にデータを持つ。削除して追加し直すと新しいアカウントになる。案内するときは先に引き継ぎコードを控えてもらう
- テストは Playwright とモックの Firebase で行う（作業環境からは Firebase と github.io に届かない）
