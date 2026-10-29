# 境界の召喚士

神話・幻想・機械の英雄を呼び出して戦う、1対1・共通山札のカードゲーム（趣味の試作）。

- 遊ぶ：`index.html`（スマホは「ホーム画面に追加」でアプリのように使えます）
- カードを作る：`editor.html`（カード工房・オーナー用）

## ファイル構成

| ファイル | 中身 |
| --- | --- |
| `game-data.json` | カードとルールの数値。カード工房で書き出して上書きする |
| `index.html` / `js/game.js` / `css/game.css` | 対戦画面とCPU |
| `js/online.js` / `js/net.js` | 対人戦（部屋の作成・参加・同期）。`net.js` に Firebase の接続情報 |
| `vendor/` | Firebase の SDK（npm の firebase@10.12.2 から取り出したもの） |
| `database.rules.json` | Firebase Realtime Database のルール（Firebaseの画面に貼り付けて使う） |
| `editor.html` / `js/editor.js` / `css/editor.css` | カード工房 |
| `js/deck.js` | デッキ編成（絵で一覧・絞り込み・検索・デッキコード） |
| `js/account.js` | アカウント（引き継ぎコード）。所持カード・G・デッキを `seasons/<シーズン>/accounts/<コード>` に保存 |
| `js/pack.js` | パック開封 |
| `js/sound.js` | 効果音（Web Audioでその場で合成） |
| `js/admin.js` | カード工房の管理者タブ（パック・報酬・CPUデッキ・シーズン） |
| `js/publish.js` | カード工房から GitHub へ直接公開・公開履歴 |
| `js/shared.js` / `css/base.css` | 両方で使う定義（効果の種類、カードの見た目、デッキのルール） |
| `manifest.webmanifest` / `sw.js` / `icons/` | アプリ化（PWA）用 |

## カードを更新する流れ

1. `editor.html`（カード工房）で編集する（このブラウザに自動保存される）
2. 「この内容で試遊」で確認する
3. 「公開する」を押す → GitHub の `game-data.json` が直接書き換わり、1〜2分でサイトに反映される

- 初回だけ「その他 → 公開設定」で GitHub の Fine-grained アクセストークン（kyokai リポジトリの Contents: Read and write）を登録する。トークンはそのブラウザにだけ保存される
- 「その他 → 公開履歴」から、以前に公開した内容を読み込んで戻せる
- トークンを使わない場合は「その他 → ファイルに書き出す」で `game-data.json` を作り、GitHub に手動でアップロードする

## 対人戦のしくみ

- 部屋を作った人（ホスト）の端末が対戦処理をすべて行い、盤面を Firebase に書き込む
- 参加した人（ゲスト）は操作を Firebase 経由でホストに送り、盤面を受け取って表示する
- 盤面データは2人とも読めるので、詳しい人なら相手の手札を見ることはできる（友達同士で遊ぶ前提）
- ホストの接続が切れている間、対戦は止まる。ページを開き直すと「前回の対戦に戻る」から再開できる

## デッキ構築ルール（v0.6〜）

- 各自が組んだデッキ（`DECK_SIZE` 枚、同名 `COPY_MAX` 枚まで。カードごとの `limit` がそれより少なければそちら）で戦う
- 開始時：じゃんけん → 勝った人が先攻・後攻を選ぶ → お互い `START_HAND` 枚引き、1回だけ全部引き直せる（マリガン）
- 先攻は最初のターンにカードを引かない
- `game-data.json` の `decks` はサンプルデッキ（CPUもここから選ぶ）

## 所持カードとパック（ベータ版0.8〜）

- 初回起動で16文字の引き継ぎコードを発行し、スターターデッキ一式と `STARTING_GOLD` を配る
- CPU戦の勝利で `REWARD_EASY/NORMAL/HARD`、対人戦の勝利で `REWARD_ONLINE` のGを獲得（負けは0G）
- パックは `game-data.json` の `packs`。最後の1枚は `odds.last`（レア以上）で抽選。被りは所持数に加算
- `config.SEASON` を変えると全員が新規スタート（前のシーズンのデータはFirebaseに残る）
- カード工房での試遊（`?draft`）は、アカウントを使わず全カードを使える
