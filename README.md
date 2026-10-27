# 境界の召喚士

神話・幻想・機械の英雄を呼び出して戦う、1対1・共通山札のカードゲーム（趣味の試作）。

- 遊ぶ：`index.html`（スマホは「ホーム画面に追加」でアプリのように使えます）
- カードを作る：`editor.html`（カード工房・オーナー用）

## ファイル構成

| ファイル | 中身 |
| --- | --- |
| `game-data.json` | カードとルールの数値。カード工房で書き出して上書きする |
| `index.html` / `js/game.js` / `css/game.css` | 対戦画面とCPU |
| `editor.html` / `js/editor.js` / `css/editor.css` | カード工房 |
| `js/shared.js` / `css/base.css` | 両方で使う定義（効果の種類、カードの見た目） |
| `manifest.webmanifest` / `sw.js` / `icons/` | アプリ化（PWA）用 |

## カードを更新する流れ

1. `editor.html` でカードを編集する（このブラウザに自動保存される）
2. 「この内容で試遊」で確認する
3. 「書き出す」で `game-data.json` をダウンロードする
4. GitHub で `game-data.json` を上書きアップロードする（1〜2分でサイトに反映）

カード工房での編集は、書き出してアップロードするまで遊ぶ人には反映されません。
