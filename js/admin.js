/* =========================================================
   カード工房：管理者向けの設定（パック・報酬・CPUデッキ・シーズン）
   editor.js から呼ばれる。DATA / saveDraft / renderStatus / stepper は editor.js のもの
   ========================================================= */

const RARITY_KEYS = ["common", "rare", "sr", "ur", "legend"];

const Admin = {
  packId: null,
  confirm: null,   // { kind, id }
  importMsg: "",
  sd: { label: "", gold: 0, cards: {}, until: "" },   // 作りかけのシリアルコード
  serialMsg: "",
  lastCode: null,

  pack() { return (DATA.packs || []).find(p => p.id === this.packId) || (DATA.packs || [])[0] || null; },
  touch(re) { saveDraft(); renderStatus(); if (re) re.call(this); },

  /* ---------- パック ---------- */
  renderPacks() {
    const el = $("#tab-packs"); if (!el) return;
    if (!DATA.packs) DATA.packs = [];
    const p = this.pack();
    if (p) this.packId = p.id;
    const sumN = p ? RARITY_KEYS.reduce((a, r) => a + (+p.odds.normal[r] || 0), 0) : 0;
    const sumL = p ? RARITY_KEYS.reduce((a, r) => a + (+p.odds.last[r] || 0), 0) : 0;
    const inPack = p ? new Set(p.cards) : new Set();
    const pset = p ? p.set || "1" : "1";
    const byR = r => DATA.cards.filter(c => c.rarity === r && c.limit > 0 && (c.set || "1") === pset);   // このパックの弾のカードだけ並べる
    el.innerHTML = `
      <h2>パック</h2>
      <p class="hint">パックの中身・値段・排出率を決めます。「販売中」を外すと、ゲームのパック一覧に出なくなります（持っているカードは消えません）。</p>
      <div class="packtabs">
        ${DATA.packs.map(x => `<button type="button" class="chipbtn ${p && x.id === p.id ? "on" : ""}" data-act="packSel" data-id="${esc(x.id)}">${esc(x.name)}${x.open ? "" : "（停止中）"}</button>`).join("")}
        <button type="button" class="btn sm" data-act="packAdd">＋ 新しいパック</button>
      </div>
      ${!p ? `<p class="hint">パックがありません。</p>` : `
      <div class="fgroup">
        <span class="gl">基本</span>
        <div class="frow">
          <div class="field grow"><label for="pk-name">名前</label><input class="txt" id="pk-name" data-admin="pk-name" value="${esc(p.name)}" maxlength="24"></div>
          <div class="field"><span class="lab">値段（G）</span>${stepper("pk-price", p.price, "値段")}</div>
          <div class="field"><span class="lab">1パックの枚数</span>${stepper("pk-size", p.size, "枚数")}</div>
        </div>
        <label class="check" style="max-width:320px"><input type="checkbox" data-admin="pk-open" ${p.open ? "checked" : ""}><span><b>販売中</b><span>ゲームのパック一覧に表示する</span></span></label>
        <div class="field"><span class="lab">弾</span><div class="seg" role="group" aria-label="パックの弾">${SET_KEYS.map(k => [k, SETS[k]]).map(([k, v]) => `<button type="button" data-act="pkSet" data-v="${k}" aria-pressed="${pset === k}">${v}</button>`).join("")}</div>
          <span class="hint small">下のカード一覧は、この弾のカードだけ出ます。第2弾は世界ごとに 2-1・2-2・2-3 の3つに分かれます。</span></div>
      </div>
      ${pset !== "1" ? `<div class="fgroup">
        <span class="gl">パック開放戦</span>
        <p class="hint">このパックは、プレイヤーが開放戦に勝つまでショップに出ません（${esc(setName(pset))}のカードも、一覧や交換に出ません）。開放戦はパックごとにルールを決めます。プレイヤーには「指定されたルールのもとで戦う」ことと、このパックのルールを毎回表示します。</p>
        <div class="field"><span class="lab">ルール</span><div class="seg" role="group" aria-label="開放戦のルール">${Object.entries(GATE_RULES).map(([k, v]) => `<button type="button" data-act="pkGRule" data-v="${k}" aria-pressed="${(p.gateRule || "world") === k}">${v.label}</button>`).join("")}</div></div>
        ${(p.gateRule || "world") === "world" ? `<div class="field"><span class="lab">世界</span><div class="seg" role="group" aria-label="世界限定の世界">${Object.entries(WORLDS).map(([k, v]) => `<button type="button" data-act="pkGWorld" data-v="${k}" aria-pressed="${p.gateWorld === k}">${v}</button>`).join("")}</div>
          ${p.gateWorld ? "" : `<span class="hint small warn">世界を決めてください（決めないと、だれも挑めません）。</span>`}</div>` : ""}
        <p class="hint">プレイヤーに見えるルール：${esc(GATE_RULES[p.gateRule || "world"].text(p))}</p>
        <div class="frow">
          <div class="field grow"><label for="pk-gdeck">相手（CPU のデッキ）</label>
            <select class="txt" id="pk-gdeck" data-admin="pk-gdeck"><option value="">自動（世界限定なら、その世界だけの CPU デッキ。なければ上級のデッキ）</option>${(DATA.decks || []).filter(d => d.level !== "test").map(d => `<option value="${esc(d.id)}" ${p.gateDeck === d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>
          <div class="field"><span class="lab">強さ</span><div class="seg" role="group" aria-label="開放戦の強さ">${[["easy", "初級"], ["normal", "中級"], ["hard", "上級"]].map(([k, v]) => `<button type="button" data-act="pkGLevel" data-v="${k}" aria-pressed="${(p.gateLevel || "hard") === k}">${v}</button>`).join("")}</div></div>
        </div>
      </div>` : ""}
      <div class="fgroup">
        <span class="gl">排出率（%）</span>
        <div class="oddsgrid">
          <span></span>${RARITY_KEYS.map(r => `<b>${RARITY[r]}</b>`).join("")}<b>合計</b>
          <span>1〜${p.size - 1}枚目</span>${RARITY_KEYS.map(r => `<input class="txt num" type="number" step="0.1" min="0" data-num="pk-odds-normal-${r}" id="f-pk-odds-normal-${r}" value="${p.odds.normal[r]}" aria-label="通常枠の${RARITY[r]}">`).join("")}<span class="${Math.abs(sumN - 100) < 0.01 ? "ok" : "bad"}">${+sumN.toFixed(2)}%</span>
          <span>${p.size}枚目</span>${RARITY_KEYS.map(r => `<input class="txt num" type="number" step="0.1" min="0" data-num="pk-odds-last-${r}" id="f-pk-odds-last-${r}" value="${p.odds.last[r]}" aria-label="最後の枠の${RARITY[r]}">`).join("")}<span class="${Math.abs(sumL - 100) < 0.01 ? "ok" : "bad"}">${+sumL.toFixed(2)}%</span>
        </div>
        <p class="hint">合計が100%でなくても動きます（比率として使います）が、表示が分かりにくくなるので100%にそろえるのがおすすめです。入っていないレア度が出たときは、1つ下のレア度から選ばれます。</p>
      </div>
      <div class="fgroup">
        <span class="gl">入っているカード（${p.cards.length}種）</span>
        <div class="frow">
          <button type="button" class="btn sm" data-act="pkAll">すべて入れる</button>
          <button type="button" class="btn sm" data-act="pkNoStarter">スターター用（効果なしの st- カード）以外を入れる</button>
          <button type="button" class="btn sm" data-act="pkNone">すべて外す</button>
        </div>
        ${RARITY_KEYS.map(r => `<div class="pkr"><b>${RARITY[r]}（${byR(r).filter(c => inPack.has(c.id)).length}/${byR(r).length}）</b>
          <div class="pkcards">${byR(r).map(c => `<label class="pkc ${inPack.has(c.id) ? "on" : ""}"><input type="checkbox" data-pk-card="${esc(c.id)}" ${inPack.has(c.id) ? "checked" : ""}>${esc(c.name)}<small>${c.cost}</small></label>`).join("")}</div></div>`).join("")}
      </div>
      <div class="frow">
        ${this.confirm && this.confirm.kind === "pack" ? `<span class="warn">「${esc(p.name)}」を削除します。</span><button type="button" class="btn sm danger" data-act="packDelYes">削除する</button><button type="button" class="btn sm" data-act="cancelConfirm">やめる</button>`
          : `<button type="button" class="btn sm danger" data-act="packDel">このパックを削除</button>`}
      </div>`}`;
  },

  /* ---------- 報酬・CPU・シーズン ---------- */
  renderEco() {
    const el = $("#tab-eco"); if (!el) return;
    const cfg = DATA.config;
    const decks = DATA.decks || [];
    const cards = Object.fromEntries(DATA.cards.map(c => [c.id, c]));
    const SUBS = [["money", "G・ログインボーナス"], ["cpu", "CPU・デッキ"], ["mail", "メール・お知らせ・配布"], ["season", "シーズン（リセット）"]];
    const sub = this.ecoSub || "money";
    const nav = `<div class="seg ecosub" role="tablist">${SUBS.map(([k, l]) => `<button type="button" role="tab" data-act="ecoSub" data-v="${k}" aria-pressed="${sub === k}">${l}</button>`).join("")}</div>`;
    const S = {};
    S.money = `
      <div class="fgroup">
        <span class="gl">G（ゴールド）</span>
        <div class="cfg">
          ${Object.entries(CONFIG_INFO).filter(([, v]) => v.group === "eco").map(([k, v]) => `<div class="item">
            <label for="f-cfg-${k}">${v.label}<small>初期値 ${DEFAULT_CONFIG[k]}</small></label>
            ${stepper("cfg-" + k, cfg[k], v.label)}
          </div>`).join("")}
        </div>
        <p class="hint">負けたときは0Gです。「始めたときに配るG」は、新しく始めた人にだけ配られます。</p>
      </div>
      <div class="fgroup">
        <span class="gl">ログインボーナス</span>
        <p class="hint">1日1回、ホームを開いたときにもらえます。上から順に1日ずつ進み、最後まで行ったら最初に戻ります。休んでも進んだ分は消えません。</p>
        <table class="lbtbl"><tr><th>日</th><th>G</th><th>魔石</th><th>パック券</th></tr>
          ${(DATA.login || []).map((x, i) => `<tr><td>${i + 1}日目</td>${["gold", "stones", "tickets"].map(k => `<td><input class="txt" type="number" min="0" step="${k === "tickets" ? 1 : 10}" value="${x[k] || 0}" data-login="${i}" data-k="${k}" style="width:90px" aria-label="${i + 1}日目の${k}"></td>`).join("")}</tr>`).join("")}
        </table>
      </div>`;
    S.cpu = `
      <div class="fgroup">
        <span class="gl">サンプルデッキ（ベータ用）</span>
        <label class="check" style="max-width:560px"><input type="checkbox" data-admin="sample" ${cfg.SAMPLE_DECKS ? "checked" : ""}><span><b>全カードで組める「サンプルデッキ」を許可する</b><span>オンの間は、遊ぶ人が持っていないカードも使ってデッキを組めます（カードの調整用）。オフにすると、サンプルデッキは対戦に使えなくなります（所持カード・Gには影響しません）。</span></span></label>
      </div>
      <div class="fgroup">
        <span class="gl">スターターデッキ（新しく始めた人に配るカード）</span>
        <select class="txt" data-admin="starter" aria-label="スターターデッキ">
          ${decks.map(d => `<option value="${esc(d.id)}" ${cfg.STARTER_DECK === d.id ? "selected" : ""}>${esc(d.name)}（${deckCount(d)}枚）</option>`).join("")}
        </select>
        <p class="hint">下の「CPU・サンプルデッキ」の中から選びます。中身は「デッキ」タブで組めます。</p>
      </div>
      <div class="fgroup">
        <span class="gl">CPU・サンプルデッキ</span>
        <p class="hint">CPUは、選ばれた強さのデッキの中からランダムに1つ使います。<b>中身の編集・新しいデッキは「デッキ」タブ</b>でできます。 <button type="button" class="btn sm" data-tab="decks">デッキタブを開く</button></p>
        <div class="cpudecks">${decks.map(d => {
          const pr = deckProblems(d, cards, cfg);
          const isStarter = cfg.STARTER_DECK === d.id;
          return `<div class="cpudeck">
            <div class="frow">
              <input class="txt" data-admin="deck-name" data-id="${esc(d.id)}" value="${esc(d.name)}" maxlength="16" aria-label="デッキ名" style="flex:1;min-width:140px">
              <select class="txt" data-admin="deck-level" data-id="${esc(d.id)}" aria-label="CPUの強さ" style="width:auto">
                ${["easy", "normal", "hard", "ex", "gift"].map(l => `<option value="${l}" ${d.level === l ? "selected" : ""}>${{ easy: "初級", normal: "中級", hard: "上級", ex: "超級", gift: "初心者の贈り物" }[l]}</option>`).join("")}
              </select>
              ${isStarter ? `<span class="tagS">スターター</span>` : ""}
            </div>
            <div class="frow"><label class="small" for="dk-key-${esc(d.id)}">代表カード</label>
              <select class="txt" id="dk-key-${esc(d.id)}" data-admin="deck-key" data-id="${esc(d.id)}" style="flex:1;min-width:160px">
                <option value="">おまかせ（いちばんレアで重いキャラ）</option>
                ${Object.keys(d.cards).map(id => cards[id]).filter(c => c && c.type === "char").sort((a, b) => b.cost - a.cost).map(c => `<option value="${esc(c.id)}" ${d.key === c.id ? "selected" : ""}>${esc(c.name)}（${RARITY[c.rarity] || ""}・${c.cost}）</option>`).join("")}
              </select></div>
            <span class="${pr.length ? "bad" : "ok"} small">${deckCount(d)}枚${pr.length ? " ・ " + esc(pr[0]) : ""}</span>
            <details><summary>中身を見る</summary><p class="hint">${Object.entries(d.cards).map(([id, n]) => `${esc(cards[id] ? cards[id].name : "（不明）")}×${n}`).join("、")}</p></details>
            <div class="frow">
              <button type="button" class="btn sm" data-act="cpuCopyCode" data-id="${esc(d.id)}">デッキコードをコピー</button>
              ${this.confirm && this.confirm.kind === "deck" && this.confirm.id === d.id
                ? `<button type="button" class="btn sm danger" data-act="cpuDelYes" data-id="${esc(d.id)}">削除する</button><button type="button" class="btn sm" data-act="cancelConfirm">やめる</button>`
                : `<button type="button" class="btn sm danger" data-act="cpuDel" data-id="${esc(d.id)}" ${isStarter ? "disabled title=\"スターターに選ばれているデッキは削除できません\"" : ""}>削除</button>`}
            </div>
          </div>`;
        }).join("")}</div>
        <div class="field">
          <label for="cpu-code">デッキコードから追加</label>
          <textarea class="txt" id="cpu-code" rows="3" placeholder="KYK1:..."></textarea>
          <div class="frow">
            <select class="txt" id="cpu-level" style="width:auto">
              <option value="easy">初級</option><option value="normal" selected>中級</option><option value="hard">上級</option><option value="ex">超級</option>
            </select>
            <button type="button" class="btn sm primary" data-act="cpuAdd">追加</button>
            <span class="warn">${esc(this.importMsg)}</span>
          </div>
        </div>
      </div>`;
    S.mail = `
      <div class="fgroup ecoguide">
        <span class="gl">どれを使う？</span>
        <ul class="hint">
          <li><b>カードの調整を知らせたい</b> → ①「お知らせの下書き」。変わったカードが自動で並ぶので、確かめて「メールにする」→ 上の「公開する」</li>
          <li><b>文だけのお知らせ・G やカードを配るメール</b> → ②「お知らせ・メールを書く」</li>
          <li><b>決まった人にだけ配りたい</b>（友達に教えるコード） → ③「シリアルコード」</li>
          <li><b>クエストを変えたい・期間限定を出したい</b> → 上の「クエスト」タブ</li>
        </ul>
        <p class="hint">どれも、上の「公開する」を押すまでゲームには届きません。</p>
      </div>
      <div class="fgroup" id="notice-box">${Notice.html()}</div>
      <div class="fgroup" id="inbox-box">${this.inboxHTML()}</div>
      <div class="fgroup" id="serial-box">${this.serialHTML()}</div>
      <div class="fgroup"><span class="gl">④ クエスト</span><p class="hint">デイリー・初心者歓迎・期間限定は、上の「クエスト」タブで作ります。</p><button type="button" class="btn sm" data-tab="quests">クエストタブを開く</button></div>`;
    S.season = `
      <div class="fgroup">
        <span class="gl">シーズン</span>
        <p class="hint">シーズン名を変えて書き出し・アップロードすると、<b>全員の所持カード・G・デッキがリセット</b>され、新規スタートになります（前のシーズンのデータはFirebaseに残ります）。正式公開のときに使います。</p>
        <div class="frow">
          <input class="txt" id="season-in" value="${esc(cfg.SEASON)}" maxlength="24" style="max-width:220px" aria-label="シーズン名">
          ${this.confirm && this.confirm.kind === "season"
            ? `<span class="warn">本当に「${esc(this.confirm.id)}」に変えますか？</span><button type="button" class="btn sm danger" data-act="seasonYes">変える</button><button type="button" class="btn sm" data-act="cancelConfirm">やめる</button>`
            : `<button type="button" class="btn sm" data-act="seasonSet">シーズン名を変える</button>`}
        </div>
        <p class="hint">今のシーズン：<b>${esc(cfg.SEASON)}</b>（半角英数字と - _ のみ）</p>
      </div>`;
    el.innerHTML = `<h2>報酬・CPU・シーズン</h2>${nav}${S[sub]}`;
  },

  /* ---------- シリアルコード ---------- */
  localCodes() { try { return JSON.parse(localStorage.getItem("kyokai-serial-codes")) || {}; } catch { return {}; } },
  saveLocalCode(h, code) { const m = this.localCodes(); m[h] = code; try { localStorage.setItem("kyokai-serial-codes", JSON.stringify(m)); } catch {} },
  readSerialForm() {
    const v = id => { const el = $("#" + id); return el ? el.value : ""; };
    this.sd.label = v("sd-label").slice(0, 30);
    this.sd.gold = Math.max(0, Math.floor(+v("sd-gold") || 0));
    this.sd.until = v("sd-until");
  },
  /* ---------- クエストタブ：デイリーの候補・初心者歓迎・期間限定 ----------
     どれも「内容（type）・CPUの強さ（winLv のとき）・回数・報酬（G・魔石・パック券）」。行の欄を変えるとすぐ反映 */
  qRowHTML(list, i, x, opts = {}) {
    const k = `${list}:${i}`;
    const opt = (o, cur) => Object.entries(o).map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${esc(typeof l === "string" ? l : l.label)}</option>`).join("");
    return `<div class="qe-row">
      ${opts.order ? `<span class="qe-no">${i + 1}</span>` : ""}
      <select class="txt" data-qe="${k}:type" aria-label="内容">${opt(QUEST_TYPES, x.type)}</select>
      ${x.type === "winLv" ? `<select class="txt" data-qe="${k}:lv" aria-label="CPUの強さ">${opt(CPU_LV_NAMES, x.lv)}</select>` : ""}
      <label class="small">回数<input class="txt" type="number" min="1" max="999" data-qe="${k}:n" value="${x.n}"></label>
      <label class="small">G<input class="txt" type="number" min="0" step="100" data-qe="${k}:gold" value="${x.gold || 0}"></label>
      <label class="small">魔石<input class="txt" type="number" min="0" step="50" data-qe="${k}:stones" value="${x.stones || 0}"></label>
      <label class="small">券<input class="txt" type="number" min="0" data-qe="${k}:tickets" value="${x.tickets || 0}"></label>
      ${opts.dates ? `<label class="small">始まり<input class="txt" type="date" data-qe="${k}:from" value="${esc(x.from || "")}"></label><label class="small">終わり<input class="txt" type="date" data-qe="${k}:until" value="${esc(x.until || "")}"></label>` : ""}
      <input class="txt qe-title" data-qe="${k}:title" maxlength="30" placeholder="名前（空なら内容が名前）" value="${esc(x.title || "")}">
      <span class="qe-prev hint">${esc(questText(x))} → ${esc(questReward(x) || "報酬なし")}</span>
      <span class="qe-btns">${opts.order ? `<button type="button" class="btn sm" data-act="qeUp" data-k="${k}" ${i ? "" : "disabled"} aria-label="上へ">↑</button>` : ""}<button type="button" class="btn sm danger" data-act="qeDel" data-k="${k}">消す</button></span>
    </div>`;
  },
  renderQuests() {
    const el = $("#tab-quests"); if (!el) return;
    if (!DATA.daily || !DATA.daily.length) DATA.daily = DAILY_POOL.map(x => ({ ...x }));
    if (!DATA.beginner || !DATA.beginner.length) DATA.beginner = BEGINNER.map(x => ({ ...x }));
    DATA.quests = DATA.quests || [];
    const gifts = (DATA.decks || []).filter(d => d.level === "gift");
    el.innerHTML = `<h2>クエスト</h2>
      <p class="hint">ゲームのホームの掲示板に出ます。どれも上の「公開する」でゲームに届きます。報酬を受け取ったかどうかはプレイヤーごとに残るので、すでに受け取ったクエストの報酬を変えても、もう一度はもらえません。</p>
      <div class="fgroup">
        <span class="gl">デイリー（毎日この中から抽選）</span>
        <div class="cfg"><div class="item"><label for="f-cfg-DAILY_N">${CONFIG_INFO.DAILY_N.label}<small>初期値 ${DEFAULT_CONFIG.DAILY_N}</small></label>${stepper("cfg-DAILY_N", DATA.config.DAILY_N || 3, CONFIG_INFO.DAILY_N.label)}</div></div>
        <p class="hint">人ごと・日ごとに、この候補から ${DATA.config.DAILY_N || 3} 個がランダムに出ます。日付が変わると入れ替わります。候補は ${DATA.daily.length} 個。</p>
        <div class="qe-list">${DATA.daily.map((x, i) => this.qRowHTML("daily", i, x)).join("")}</div>
        <button type="button" class="btn sm" data-act="qeAdd" data-v="daily">＋ 候補を足す</button>
      </div>
      <div class="fgroup">
        <span class="gl">初心者歓迎（上から順に表示）</span>
        <p class="hint">全部の報酬を受け取ると、贈り物のデッキ（${gifts.map(d => `「${esc(d.name)}」`).join("") || "まだありません"}）から1つ選べます。贈り物のデッキは「報酬・CPU・シーズン」→「CPU・デッキ」で強さを「初心者の贈り物」にしたデッキです。</p>
        <div class="qe-list">${DATA.beginner.map((x, i) => this.qRowHTML("beginner", i, x, { order: true })).join("")}</div>
        <button type="button" class="btn sm" data-act="qeAdd" data-v="beginner">＋ クエストを足す</button>
      </div>
      <div class="fgroup">
        <span class="gl">期間限定</span>
        <p class="hint">期間中だけ「期間限定」に出ます。日付を空にすると、始まり＝すぐ／終わり＝ずっと。</p>
        <div class="qe-list">${DATA.quests.length ? DATA.quests.map((x, i) => this.qRowHTML("quests", i, x, { dates: true })).join("") : `<p class="hint">まだありません。</p>`}</div>
        <button type="button" class="btn sm" data-act="qeAdd" data-v="quests">＋ 期間限定クエストを足す</button>
      </div>`;
  },
  qeSet(key, value) {
    const [list, i, f] = key.split(":"), x = DATA[list] && DATA[list][+i]; if (!x) return;
    if (["n", "gold", "stones", "tickets"].includes(f)) x[f] = Math.max(f === "n" ? 1 : 0, Math.floor(+value || 0));
    else if (f === "type") { x.type = value; if (value === "winLv") x.lv = x.lv || "normal"; else delete x.lv; }
    else if (f === "title") { if (value.trim()) x.title = value.trim().slice(0, 30); else delete x.title; }
    else x[f] = value;
    this.touch();
    if (f === "type") this.renderQuests();
    else { const row = document.querySelector(`[data-qe="${key}"]`); const pv = row && row.closest(".qe-row").querySelector(".qe-prev"); if (pv) pv.textContent = `${questText(x)} → ${questReward(x) || "報酬なし"}`; }
  },
  /* ---------- 期間限定クエスト（前の形。今は使っていない） ---------- */
  qd: { title: "", type: "winLv", lv: "hard", n: 3, from: "", until: "", gold: 1000, stones: 0, tickets: 0 },
  questHTML() {
    const q = this.qd, list = DATA.quests || [];
    const opt = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${esc(typeof v === "string" ? v : v.label)}</option>`).join("");
    return `<span class="gl">④ 期間限定クエスト</span>
      <p class="hint">ホームの掲示板の「期間限定」に、期間中だけ出ます。デイリー（毎日3つ）と初心者歓迎は自動で出るので、作らなくてかまいません。</p>
      ${list.length ? `<ul class="qadm">${list.map(x => `<li><b>${esc(x.title || questText(x))}</b> <span class="hint">${esc(questText(x))}・${esc(questReward(x) || "報酬なし")}・${esc(x.from || "今日")}〜${esc(x.until || "ずっと")}</span>
        <button type="button" class="btn sm danger" data-act="qDel" data-id="${esc(x.id)}">消す</button></li>`).join("")}</ul>` : `<p class="hint">まだありません。</p>`}
      <div class="frow"><input class="txt" id="qd-title" placeholder="名前（空なら内容がそのまま名前）" maxlength="30" value="${esc(q.title)}" style="flex:1;min-width:180px"></div>
      <div class="frow"><select class="txt" id="qd-type" style="width:auto">${opt(QUEST_TYPES, q.type)}</select>
        <select class="txt" id="qd-lv" style="width:auto" aria-label="CPUの強さ（CPUに勝つのときだけ）">${opt(CPU_LV_NAMES, q.lv)}</select>
        <label class="small">回数 <input class="txt" type="number" id="qd-n" min="1" max="999" value="${q.n}" style="width:80px"></label></div>
      <div class="frow"><label class="small">始まり <input class="txt" type="date" id="qd-from" value="${esc(q.from)}"></label><label class="small">終わり <input class="txt" type="date" id="qd-until" value="${esc(q.until)}"></label></div>
      <div class="frow"><label class="small">G <input class="txt" type="number" id="qd-gold" min="0" step="100" value="${q.gold}" style="width:100px"></label>
        <label class="small">魔石 <input class="txt" type="number" id="qd-stones" min="0" step="50" value="${q.stones}" style="width:90px"></label>
        <label class="small">パック券 <input class="txt" type="number" id="qd-tickets" min="0" value="${q.tickets}" style="width:70px"></label></div>
      <button type="button" class="btn primary sm" data-act="qAdd">このクエストを足す</button>
      <p class="hint">足したあと、上の「公開する」で届きます。</p>`;
  },
  serialHTML() {
    if (!DATA.serials) DATA.serials = [];
    const cards = Object.fromEntries(DATA.cards.map(c => [c.id, c]));
    const codes = this.localCodes();
    const rew = s => [s.gold ? `${s.gold}G` : "", ...Object.entries(s.cards).map(([id, n]) => `${cards[id] ? cards[id].name : "（不明）"}×${n}`)].filter(Boolean).join("、") || "（なし）";
    const today = localDate();
    const sd = this.sd;
    return `
      <span class="gl">③ シリアルコード（G・カードの配布）</span>
      <p class="hint">作ったコードを友達に教えると、ゲームの「オプション → シリアルコード」で入力して受け取れます。<b>1つのアカウントにつき1回まで</b>。公開しないとゲームでは使えません。公開されるデータにはコードそのものは入りません（暗号化した形だけ）。<b>コードはこのブラウザにだけ控えられる</b>ので、作ったらすぐコピーしてください。</p>
      <div class="cpudeck">
        <div class="frow">
          <label class="small" for="sd-label" style="min-width:70px">名前</label>
          <input class="txt" id="sd-label" maxlength="30" value="${esc(sd.label)}" placeholder="例：ベータ参加のお礼" style="flex:1;min-width:160px">
        </div>
        <div class="frow">
          <label class="small" for="sd-gold" style="min-width:70px">配るG</label>
          <input class="txt" id="sd-gold" type="number" min="0" step="10" value="${sd.gold}" style="max-width:120px">
          <label class="small" for="sd-until">有効期限</label>
          <input class="txt" id="sd-until" type="date" value="${esc(sd.until)}" min="${today}" style="max-width:170px">
          <span class="hint">空欄なら期限なし</span>
        </div>
        <div class="frow">
          <label class="small" for="sd-card" style="min-width:70px">配るカード</label>
          <select class="txt" id="sd-card" style="flex:1;min-width:160px">${DATA.cards.filter(c => c.limit > 0).map(c => `<option value="${esc(c.id)}">${esc(c.name)}（${RARITY[c.rarity] || ""}）</option>`).join("")}</select>
          <input class="txt" id="sd-n" type="number" min="1" max="9" value="1" style="max-width:70px" aria-label="枚数">
          <button type="button" class="btn sm" data-act="sdAddCard">追加</button>
        </div>
        ${Object.keys(sd.cards).length ? `<div class="frow">${Object.entries(sd.cards).map(([id, n]) => `<span class="tagS">${esc(cards[id] ? cards[id].name : id)}×${n} <button type="button" class="btn sm" data-act="sdDelCard" data-id="${esc(id)}" aria-label="外す">×</button></span>`).join("")}</div>` : ""}
        <div class="frow">
          <button type="button" class="btn sm primary" data-act="sdCreate">コードを作る</button>
          <span class="warn">${esc(this.serialMsg)}</span>
        </div>
        ${this.lastCode ? `<div class="frow"><span>作ったコード：</span><b style="font-size:20px;letter-spacing:.08em">${esc(serialFmt(this.lastCode))}</b><button type="button" class="btn sm" data-act="sdCopy" data-code="${esc(this.lastCode)}">コピー</button></div>` : ""}
      </div>
      ${DATA.serials.length ? `<div class="cpudecks">${DATA.serials.map(s => {
        const expired = s.until && s.until < today;
        return `<div class="cpudeck">
          <div class="frow"><b style="flex:1">${esc(s.label)}</b>${expired ? `<span class="bad small">期限切れ</span>` : s.until ? `<span class="small">${esc(s.until)}まで</span>` : `<span class="small">期限なし</span>`}</div>
          <span class="small">中身：${esc(rew(s))}</span>
          <div class="frow">
            ${codes[s.h] ? `<code>${esc(serialFmt(codes[s.h]))}</code><button type="button" class="btn sm" data-act="sdCopy" data-code="${esc(codes[s.h])}">コピー</button>` : `<span class="hint">コードはこのブラウザに控えがありません</span>`}
            ${this.confirm && this.confirm.kind === "serial" && this.confirm.id === s.h
              ? `<button type="button" class="btn sm danger" data-act="sdDelYes" data-id="${s.h}">削除する</button><button type="button" class="btn sm" data-act="cancelConfirm">やめる</button>`
              : `<button type="button" class="btn sm danger" data-act="sdDel" data-id="${s.h}">削除</button>`}
          </div>
        </div>`;
      }).join("")}</div>` : `<p class="hint">まだシリアルコードはありません。</p>`}`;
  },
  renderSerials() { const el = $("#serial-box"); if (el) el.innerHTML = this.serialHTML(); },

  /* ---------- お知らせ・メール（ゲームのホーム右上に届く） ---------- */
  ib: { kind: "news", title: "", body: "", gold: 0, stones: 0, tickets: 0, until: "", cards: {}, picks: {}, to: "before" },
  pk: { name: "", rarity: "legend", sets: ["1"] },
  readIb() {
    const v = id => { const el = $("#" + id); return el ? el.value : ""; };
    const b = this.ib; b.title = v("ib-title").slice(0, 40); b.body = v("ib-body").slice(0, 4000);
    if (b.kind === "mail") { b.gold = Math.max(0, Math.floor(+v("ib-gold") || 0)); b.stones = Math.max(0, Math.floor(+v("ib-stones") || 0)); b.tickets = Math.max(0, Math.floor(+v("ib-tickets") || 0)); b.until = v("ib-until"); b.to = v("ib-to") || "before"; }
  },
  inboxHTML() {
    if (!DATA.news) DATA.news = []; if (!DATA.mail) DATA.mail = [];
    const b = this.ib, cards = Object.fromEntries(DATA.cards.map(c => [c.id, c]));
    if (!DATA.picks) DATA.picks = [];
    const pickName = id => (DATA.picks.find(p => p.id === id) || {}).name || id;
    const gift = m => [m.gold ? `${m.gold}G` : "", m.stones ? `魔石${m.stones}` : "", m.tickets ? `パック券${m.tickets}` : "", ...Object.entries(m.cards || {}).map(([id, n]) => `${cards[id] ? cards[id].name : id}×${n}`), ...Object.entries(m.picks || {}).map(([id, n]) => `${pickName(id)}×${n}`)].filter(Boolean).join("、");
    const item = (m, kind) => `<div class="cpudeck"><div class="frow"><span class="small">${esc(m.date)}</span><b style="flex:1">${esc(m.title)}</b>
        ${this.confirm && this.confirm.kind === kind && this.confirm.id === m.id ? `<button type="button" class="btn sm danger" data-act="ibDelYes" data-k="${kind}" data-id="${esc(m.id)}">削除する</button><button type="button" class="btn sm" data-act="cancelConfirm">やめる</button>`
          : `<button type="button" class="btn sm danger" data-act="ibDel" data-k="${kind}" data-id="${esc(m.id)}">削除</button>`}</div>
        ${kind === "mail" ? `<span class="small">宛先：${esc(MAIL_TO[m.to || "all"])} ・ ${gift(m) ? `付けたもの：${esc(gift(m))}` : "付けたものなし"}${m.until && m.to !== "new" ? ` ・ ${esc(m.until)}まで` : ""}</span>` : ""}
        <span class="hint" style="white-space:pre-wrap">${esc(m.body.slice(0, 120))}${m.body.length > 120 ? "…" : ""}</span></div>`;
    return `<span class="gl">② お知らせ・メールを書く</span>
      <p class="hint">ゲームのホーム右上に届きます。<b>お知らせ</b>はアップデート内容など読むだけのもの。<b>メール</b>は宛先を選べ、G・魔石・パック券・カード・選択券を付けると1アカウント1回だけ受け取れます。公開するとゲームに届きます。</p>
      <div class="cpudeck">
        <div class="seg"><button type="button" data-act="ibKind" data-v="news" aria-pressed="${b.kind === "news"}">お知らせ</button><button type="button" data-act="ibKind" data-v="mail" aria-pressed="${b.kind === "mail"}">メール</button></div>
        <div class="frow"><label class="small" for="ib-title" style="min-width:70px">題名</label><input class="txt" id="ib-title" maxlength="40" value="${esc(b.title)}" placeholder="${b.kind === "news" ? "例：ver.1.2 アップデート" : "例：ベータ参加のお礼"}" style="flex:1;min-width:160px"></div>
        <div class="frow"><label class="small" for="ib-body" style="min-width:70px">本文</label><textarea class="txt" id="ib-body" rows="5" maxlength="4000" style="flex:1;min-width:200px" placeholder="改行もそのまま表示されます">${esc(b.body)}</textarea></div>
        ${b.kind === "mail" ? `<div class="frow"><label class="small" for="ib-to" style="min-width:70px">宛先</label>
            <select class="txt" id="ib-to" style="flex:1;min-width:200px">${Object.entries(MAIL_TO).map(([k, t]) => `<option value="${k}" ${b.to === k ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
          <p class="hint">お詫び・告知は「送った日までに始めた人だけ」。歓迎のプレゼントは「送った日から後に始めた人」（期限は付かず、ずっと届く）。</p>
          <div class="frow">
            <label class="small" for="ib-gold">G</label><input class="txt" id="ib-gold" type="number" min="0" step="10" value="${b.gold}" style="max-width:100px">
            <label class="small" for="ib-stones">魔石</label><input class="txt" id="ib-stones" type="number" min="0" step="10" value="${b.stones}" style="max-width:100px">
            <label class="small" for="ib-tickets">パック券</label><input class="txt" id="ib-tickets" type="number" min="0" value="${b.tickets}" style="max-width:80px">
            <label class="small" for="ib-until">受け取り期限</label><input class="txt" id="ib-until" type="date" value="${esc(b.until)}" style="max-width:170px"><span class="hint">空欄なら期限なし</span></div>
          <div class="frow"><label class="small" for="ib-card" style="min-width:70px">カード</label>
            <select class="txt" id="ib-card" style="flex:1;min-width:160px">${DATA.cards.filter(c => c.limit > 0).map(c => `<option value="${esc(c.id)}">${esc(c.name)}（${RARITY[c.rarity] || ""}）</option>`).join("")}</select>
            <input class="txt" id="ib-n" type="number" min="1" max="9" value="1" style="max-width:70px" aria-label="枚数"><button type="button" class="btn sm" data-act="ibAddCard">追加</button></div>
          ${DATA.picks.length ? `<div class="frow"><label class="small" for="ib-pick" style="min-width:70px">選択券</label>
            <select class="txt" id="ib-pick" style="flex:1;min-width:160px">${DATA.picks.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select><button type="button" class="btn sm" data-act="ibAddPick">追加</button></div>` : ""}
          ${Object.keys(b.picks).length ? `<div class="frow">${Object.entries(b.picks).map(([id, n]) => `<span class="tagS">${esc(pickName(id))}×${n} <button type="button" class="btn sm" data-act="ibDelPick" data-id="${esc(id)}" aria-label="外す">×</button></span>`).join("")}</div>` : ""}
          ${Object.keys(b.cards).length ? `<div class="frow">${Object.entries(b.cards).map(([id, n]) => `<span class="tagS">${esc(cards[id] ? cards[id].name : id)}×${n} <button type="button" class="btn sm" data-act="ibDelCard" data-id="${esc(id)}" aria-label="外す">×</button></span>`).join("")}</div>` : ""}` : ""}
        <div class="frow"><button type="button" class="btn sm primary" data-act="ibCreate">${b.kind === "news" ? "お知らせを追加" : "メールを追加"}</button><span class="warn">${esc(this.ibMsg || "")}</span></div>
      </div>
      ${this.pickHTML()}
      <b class="small">お知らせ（${DATA.news.length}件）</b>
      ${DATA.news.length ? `<div class="cpudecks">${DATA.news.slice().reverse().map(m => item(m, "news")).join("")}</div>` : `<p class="hint">まだありません。</p>`}
      <b class="small">メール（${DATA.mail.length}件）</b>
      ${DATA.mail.length ? `<div class="cpudecks">${DATA.mail.slice().reverse().map(m => item(m, "mail")).join("")}</div>` : `<p class="hint">まだありません。</p>`}`;
  },
  renderInbox() { const el = $("#inbox-box"); if (el) el.innerHTML = this.inboxHTML(); },
  /* 選択券：好きなカード1枚と交換できる券。特別なものなので、作るたびに名前を付ける（例：リリース記念レジェンド選択券） */
  pickHTML() {
    const k = this.pk, n = c => pickPool({ rarity: [k.rarity], sets: k.sets }, DATA.cards).length;
    return `<b class="small">選択券（${DATA.picks.length}種類）</b>
      <p class="hint">メールに付けると、受け取った人が決められたレア度・弾から好きなカード1枚と交換できます。作るたびに名前を変えてください（例：リリース記念レジェンド選択券）。一度メールで配ったものは消さないでください。</p>
      ${DATA.picks.length ? `<div class="cpudecks">${DATA.picks.map(p => `<div class="cpudeck"><div class="frow"><b style="flex:1">${esc(p.name)}</b><span class="small">${p.rarity.map(r => RARITY[r]).join("・")} ／ ${p.sets.length ? p.sets.map(setName).join("・") : "全部の弾"} ／ ${pickPool(p, DATA.cards).length}種類から選ぶ</span></div></div>`).join("")}</div>` : ""}
      <div class="cpudeck"><div class="frow"><label class="small" for="pk-name" style="min-width:70px">名前</label><input class="txt" id="pk-name" maxlength="30" value="${esc(k.name)}" placeholder="例：リリース記念レジェンド選択券" style="flex:1;min-width:200px"></div>
        <div class="frow"><label class="small" for="pk-rar" style="min-width:70px">レア度</label><select class="txt" id="pk-rar" style="max-width:160px">${Object.keys(RARITY).map(r => `<option value="${r}" ${k.rarity === r ? "selected" : ""}>${RARITY[r]}</option>`).join("")}</select>
          <span class="small">弾</span>${SET_KEYS.map(s => `<label class="small"><input type="checkbox" class="pk-set" value="${s}" ${k.sets.includes(s) ? "checked" : ""}> ${esc(setName(s))}</label>`).join("")}</div>
        <div class="frow"><button type="button" class="btn sm primary" data-act="pkCreate">選択券を作る</button><span class="hint">今の設定で選べるのは ${n()} 種類</span><span class="warn">${esc(this.pkMsg || "")}</span></div></div>`;
  },

  /* ---------- 値の変更 ---------- */
  step(name, d) {
    if (name === "pk-price") { const p = this.pack(); p.price = Math.max(0, p.price + d * 10); this.touch(this.renderPacks); return true; }
    if (name === "pk-size") { const p = this.pack(); p.size = Math.max(1, Math.min(10, p.size + d)); this.touch(this.renderPacks); return true; }
    return false;
  },
  setNum(name, value) {
    const p = this.pack();
    if (name === "pk-price") { p.price = Math.max(0, Math.round(+value || 0)); this.touch(this.renderPacks); return true; }
    if (name === "pk-size") { p.size = Math.max(1, Math.min(10, Math.round(+value || 1))); this.touch(this.renderPacks); return true; }
    const m = name.match(/^pk-odds-(normal|last)-(\w+)$/);
    if (m) { p.odds[m[1]][m[2]] = Math.max(0, Math.round((+value || 0) * 100) / 100); this.touch(this.renderPacks); return true; }
    if (name.startsWith("cfg-") && CONFIG_INFO[name.slice(4)] && ["eco", "quest"].includes(CONFIG_INFO[name.slice(4)].group)) {
      const k = name.slice(4), info = CONFIG_INFO[k];
      DATA.config[k] = Math.max(info.min, Math.min(info.max, Math.round(+value || 0)));
      this.touch(info.group === "quest" ? this.renderQuests : this.renderEco); return true;
    }
    return false;
  },

  act(name, el) {
    const id = el && el.dataset.id;
    switch (name) {
      case "packSel": this.packId = id; this.confirm = null; this.renderPacks(); return true;
      case "packAdd": {
        const p = { id: "pack" + Date.now().toString(36), name: "新しいパック", price: 100, size: 5, cards: [], open: false,
          odds: { normal: { ...DEFAULT_ODDS.normal }, last: { ...DEFAULT_ODDS.last } } };
        DATA.packs.push(p); this.packId = p.id; this.touch(this.renderPacks); return true;
      }
      case "packDel": this.confirm = { kind: "pack" }; this.renderPacks(); return true;
      case "packDelYes": DATA.packs = DATA.packs.filter(p => p.id !== this.packId); this.packId = null; this.confirm = null; this.touch(this.renderPacks); return true;
      case "pkAll": { const ps = this.pack().set || "1"; this.pack().cards = DATA.cards.filter(c => c.limit > 0 && (c.set || "1") === ps).map(c => c.id); this.touch(this.renderPacks); return true; }
      case "pkGWorld": this.pack().gateWorld = el.dataset.v; this.touch(this.renderPacks); return true;
      case "pkGRule": this.pack().gateRule = el.dataset.v; this.touch(this.renderPacks); return true;
      case "pkGLevel": this.pack().gateLevel = el.dataset.v; this.touch(this.renderPacks); return true;
      case "pkSet": { const p = this.pack(), n = normSet(el.dataset.v); if (n) { p.set = n; p.gateRule = p.gateRule || "world"; } else delete p.set; this.touch(this.renderPacks); return true; }
      case "pkNoStarter": this.pack().cards = DATA.cards.filter(c => c.limit > 0 && !c.id.startsWith("st-")).map(c => c.id); this.touch(this.renderPacks); return true;
      case "pkNone": this.pack().cards = []; this.touch(this.renderPacks); return true;
      case "cancelConfirm": this.confirm = null; this.renderPacks(); this.renderEco(); return true;
      case "ibKind": this.readIb(); this.ib.kind = el.dataset.v; this.ibMsg = ""; this.renderInbox(); return true;
      case "ibAddCard": { this.readIb(); const cid = $("#ib-card").value, n = Math.max(1, Math.min(9, +$("#ib-n").value || 1)); this.ib.cards[cid] = Math.min(9, (this.ib.cards[cid] || 0) + n); this.renderInbox(); return true; }
      case "ibDelCard": this.readIb(); delete this.ib.cards[id]; this.renderInbox(); return true;
      case "ibAddPick": { this.readIb(); const pid = $("#ib-pick").value; this.ib.picks[pid] = Math.min(9, (this.ib.picks[pid] || 0) + 1); this.renderInbox(); return true; }
      case "ibDelPick": this.readIb(); delete this.ib.picks[id]; this.renderInbox(); return true;
      case "pkCreate": {
        this.readIb();
        const k = this.pk; k.name = ($("#pk-name").value || "").trim().slice(0, 30); k.rarity = $("#pk-rar").value; k.sets = [...document.querySelectorAll(".pk-set:checked")].map(x => x.value);
        if (!k.name) { this.pkMsg = "名前を入れてください"; this.renderInbox(); return true; }
        if (DATA.picks.some(p => p.name === k.name)) { this.pkMsg = "同じ名前の選択券があります。名前を変えてください"; this.renderInbox(); return true; }
        if (!pickPool({ rarity: [k.rarity], sets: k.sets }, DATA.cards).length) { this.pkMsg = "選べるカードがありません"; this.renderInbox(); return true; }
        DATA.picks.push({ id: "pick" + Date.now().toString(36), name: k.name, rarity: [k.rarity], sets: [...k.sets] });
        this.pk = { name: "", rarity: "legend", sets: ["1"] }; this.pkMsg = "作りました。メールに付けて配れます";
        this.touch(this.renderInbox); return true;
      }
      case "ibCreate": {
        this.readIb(); const b = this.ib;
        if (!b.title.trim()) { this.ibMsg = "題名を入れてください"; this.renderInbox(); return true; }
        const base = { id: (b.kind === "news" ? "n" : "m") + Date.now().toString(36), date: localDate(), title: b.title.trim(), body: b.body };
        if (b.kind === "news") DATA.news.push(base);
        else DATA.mail.push({ ...base, to: b.to, until: b.to === "new" ? "" : b.until, gold: b.gold, stones: b.stones, tickets: b.tickets, cards: { ...b.cards }, picks: { ...b.picks } });
        this.ib = { kind: b.kind, title: "", body: "", gold: 0, stones: 0, tickets: 0, until: "", cards: {}, picks: {}, to: b.to };
        this.ibMsg = "追加しました。「公開する」でゲームに届きます"; this.touch(this.renderInbox); return true;
      }
      case "ibDel": this.confirm = { kind: el.dataset.k, id }; this.renderInbox(); return true;
      case "ibDelYes": { const k = el.dataset.k; DATA[k] = DATA[k].filter(m => m.id !== id); this.confirm = null; this.touch(this.renderInbox); return true; }
      case "cpuDel": this.confirm = { kind: "deck", id }; this.renderEco(); return true;
      case "cpuDelYes": DATA.decks = DATA.decks.filter(d => d.id !== id); this.confirm = null; this.touch(this.renderEco); return true;
      case "cpuCopyCode": {
        const d = DATA.decks.find(x => x.id === id); if (!d) return true;
        copyText(deckToCode(d)).then(ok => { this.importMsg = ok ? "コピーしました" : "コピーできませんでした"; this.renderEco(); });
        return true;
      }
      case "ecoSub": this.ecoSub = el.dataset.v; this.renderEco(); return true;
      case "cpuAdd": {
        const d = codeToDeck($("#cpu-code").value);
        if (!d) { this.importMsg = "デッキコードを読み取れませんでした"; this.renderEco(); return true; }
        DATA.decks.push({ id: "cpu" + Date.now().toString(36), name: d.name, cards: d.cards, level: $("#cpu-level").value });
        this.importMsg = `「${d.name}」を追加しました`;
        this.touch(this.renderEco); return true;
      }
      case "seasonSet": {
        const v = ($("#season-in").value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
        if (!v || v === DATA.config.SEASON) return true;
        this.confirm = { kind: "season", id: v }; this.renderEco(); return true;
      }
      case "qeAdd": { const L = el.dataset.v; DATA[L] = DATA[L] || []; DATA[L].push({ id: (L === "daily" ? "d" : L === "beginner" ? "b" : "q") + Date.now().toString(36), type: "winLv", lv: "normal", n: 1, gold: 300, stones: 0, tickets: 0 }); this.touch(this.renderQuests); return true; }
      case "qeDel": { const [L, i] = el.dataset.k.split(":"); DATA[L].splice(+i, 1); this.touch(this.renderQuests); return true; }
      case "qeUp": { const [L, i] = el.dataset.k.split(":"); const a = DATA[L], j = +i; if (j > 0) [a[j - 1], a[j]] = [a[j], a[j - 1]]; this.touch(this.renderQuests); return true; }
      case "qAdd": {
        const v = id => { const el = $("#" + id); return el ? el.value : ""; };
        const q = { title: v("qd-title").trim().slice(0, 30), type: v("qd-type"), lv: v("qd-lv"), n: Math.max(1, Math.floor(+v("qd-n") || 1)), from: v("qd-from"), until: v("qd-until"),
          gold: Math.max(0, Math.floor(+v("qd-gold") || 0)), stones: Math.max(0, Math.floor(+v("qd-stones") || 0)), tickets: Math.max(0, Math.floor(+v("qd-tickets") || 0)) };
        this.qd = { ...q };
        if (!QUEST_TYPES[q.type]) return true;
        if (q.type !== "winLv") delete q.lv;
        DATA.quests = [...(DATA.quests || []), { id: "q" + Date.now().toString(36), ...q }];
        this.touch(); this.renderEco(); return true;
      }
      case "qDel": DATA.quests = (DATA.quests || []).filter(x => x.id !== el.dataset.id); this.touch(); this.renderEco(); return true;
      case "sdAddCard": {
        this.readSerialForm();
        const id = $("#sd-card").value, n = Math.max(1, Math.min(9, Math.floor(+$("#sd-n").value || 1)));
        if (id) this.sd.cards[id] = n;
        this.renderSerials(); return true;
      }
      case "sdDelCard": this.readSerialForm(); delete this.sd.cards[id]; this.renderSerials(); return true;
      case "sdCreate": {
        this.readSerialForm();
        const sd = this.sd;
        if (!sd.gold && !Object.keys(sd.cards).length) { this.serialMsg = "Gかカードを1つ以上入れてください"; this.renderSerials(); return true; }
        const code = serialMake();
        serialHash(code).then(h => {
          DATA.serials.push({ h, label: sd.label || "シリアルコード", gold: sd.gold, cards: { ...sd.cards }, until: sd.until, created: localDate() });
          this.saveLocalCode(h, code);
          this.lastCode = code;
          this.sd = { label: "", gold: 0, cards: {}, until: "" };
          this.serialMsg = "作りました。公開すると使えるようになります";
          this.touch(this.renderSerials);
        });
        return true;
      }
      case "sdCopy": {
        const c = serialFmt(el.dataset.code);
        copyText(c).then(ok => { this.serialMsg = ok ? "コピーしました" : "コピーできませんでした。手で控えてください"; this.renderSerials(); });
        return true;
      }
      case "sdDel": this.readSerialForm(); this.confirm = { kind: "serial", id }; this.renderSerials(); return true;
      case "sdDelYes": DATA.serials = DATA.serials.filter(s => s.h !== id); this.confirm = null; this.touch(this.renderSerials); return true;
      case "seasonYes": DATA.config.SEASON = this.confirm.id; this.confirm = null; this.touch(this.renderEco); return true;
    }
    return false;
  }
};

function renderPacks() { Admin.renderPacks(); }
function renderEco() { Admin.renderEco(); }

document.addEventListener("input", e => {
  const t = e.target, k = t.dataset && t.dataset.admin;
  if (!k) return;
  if (k === "pk-name") {
    Admin.pack().name = t.value; saveDraft(); renderStatus();
    const chip = document.querySelector(`.chipbtn.on`); if (chip) chip.textContent = t.value;
  }
  if (k === "deck-name") { const d = DATA.decks.find(x => x.id === t.dataset.id); if (d) { d.name = t.value; saveDraft(); renderStatus(); } }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset && t.dataset.pkCard) {
    const p = Admin.pack(), id = t.dataset.pkCard;
    p.cards = t.checked ? [...new Set([...p.cards, id])] : p.cards.filter(x => x !== id);
    Admin.touch(Admin.renderPacks); return;
  }
  const k = t.dataset && t.dataset.admin;
  if (k === "pk-open") { Admin.pack().open = t.checked; Admin.touch(Admin.renderPacks); }
  if (k === "pk-gdeck") { const p = Admin.pack(); if (t.value) p.gateDeck = t.value; else delete p.gateDeck; Admin.touch(Admin.renderPacks); }
  if (k === "starter") { DATA.config.STARTER_DECK = t.value; Admin.touch(Admin.renderEco); }
  if (k === "sample") { DATA.config.SAMPLE_DECKS = t.checked; Admin.touch(Admin.renderEco); }
  if (k === "deck-key") { const d = DATA.decks.find(x => x.id === t.dataset.id); if (d) { if (t.value) d.key = t.value; else delete d.key; Admin.touch(); } }
  if (k === "deck-level") { const d = DATA.decks.find(x => x.id === t.dataset.id); if (d) { d.level = t.value; Admin.touch(); } }
});

document.addEventListener("change", e => {
  const t = e.target; if (t.dataset.login == null) return;
  const x = DATA.login[+t.dataset.login]; if (!x) return;
  x[t.dataset.k] = Math.max(0, Math.floor(+t.value || 0)); t.value = x[t.dataset.k];
  saveDraft(); renderStatus();
});

/* クエストタブの欄を変えたら、その場で反映 */
document.addEventListener("change", e => { const k = e.target && e.target.dataset && e.target.dataset.qe; if (k) Admin.qeSet(k, e.target.value); });
