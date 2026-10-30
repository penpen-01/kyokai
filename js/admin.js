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
    const byR = r => DATA.cards.filter(c => c.rarity === r && c.limit > 0);
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
      </div>
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
    el.innerHTML = `
      <h2>報酬・CPU・シーズン</h2>
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
        <span class="gl">サンプルデッキ（ベータ用）</span>
        <label class="check" style="max-width:560px"><input type="checkbox" data-admin="sample" ${cfg.SAMPLE_DECKS ? "checked" : ""}><span><b>全カードで組める「サンプルデッキ」を許可する</b><span>オンの間は、遊ぶ人が持っていないカードも使ってデッキを組めます（カードの調整用）。オフにすると、サンプルデッキは対戦に使えなくなります（所持カード・Gには影響しません）。</span></span></label>
      </div>
      <div class="fgroup">
        <span class="gl">スターターデッキ（新しく始めた人に配るカード）</span>
        <select class="txt" data-admin="starter" aria-label="スターターデッキ">
          ${decks.map(d => `<option value="${esc(d.id)}" ${cfg.STARTER_DECK === d.id ? "selected" : ""}>${esc(d.name)}（${deckCount(d)}枚）</option>`).join("")}
        </select>
        <p class="hint">下の「CPU・サンプルデッキ」の中から選びます。中身を変えるときは、ゲーム側の試遊モードでデッキを組んで「デッキコードをコピー」し、下で登録してください。</p>
      </div>
      <div class="fgroup">
        <span class="gl">CPU・サンプルデッキ</span>
        <p class="hint">CPUは、選ばれた強さのデッキの中からランダムに1つ使います。</p>
        <div class="cpudecks">${decks.map(d => {
          const pr = deckProblems(d, cards, cfg);
          const isStarter = cfg.STARTER_DECK === d.id;
          return `<div class="cpudeck">
            <div class="frow">
              <input class="txt" data-admin="deck-name" data-id="${esc(d.id)}" value="${esc(d.name)}" maxlength="16" aria-label="デッキ名" style="flex:1;min-width:140px">
              <select class="txt" data-admin="deck-level" data-id="${esc(d.id)}" aria-label="CPUの強さ" style="width:auto">
                ${["easy", "normal", "hard"].map(l => `<option value="${l}" ${d.level === l ? "selected" : ""}>${{ easy: "初級", normal: "中級", hard: "上級" }[l]}</option>`).join("")}
              </select>
              ${isStarter ? `<span class="tagS">スターター</span>` : ""}
            </div>
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
              <option value="easy">初級</option><option value="normal" selected>中級</option><option value="hard">上級</option>
            </select>
            <button type="button" class="btn sm primary" data-act="cpuAdd">追加</button>
            <span class="warn">${esc(this.importMsg)}</span>
          </div>
        </div>
      </div>
      <div class="fgroup" id="serial-box">${this.serialHTML()}</div>
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
  serialHTML() {
    if (!DATA.serials) DATA.serials = [];
    const cards = Object.fromEntries(DATA.cards.map(c => [c.id, c]));
    const codes = this.localCodes();
    const rew = s => [s.gold ? `${s.gold}G` : "", ...Object.entries(s.cards).map(([id, n]) => `${cards[id] ? cards[id].name : "（不明）"}×${n}`)].filter(Boolean).join("、") || "（なし）";
    const today = localDate();
    const sd = this.sd;
    return `
      <span class="gl">シリアルコード（G・カードの配布）</span>
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
    if (name.startsWith("cfg-") && CONFIG_INFO[name.slice(4)] && CONFIG_INFO[name.slice(4)].group === "eco") {
      const k = name.slice(4), info = CONFIG_INFO[k];
      DATA.config[k] = Math.max(info.min, Math.min(info.max, Math.round(+value || 0)));
      this.touch(this.renderEco); return true;
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
      case "pkAll": this.pack().cards = DATA.cards.filter(c => c.limit > 0).map(c => c.id); this.touch(this.renderPacks); return true;
      case "pkNoStarter": this.pack().cards = DATA.cards.filter(c => c.limit > 0 && !c.id.startsWith("st-")).map(c => c.id); this.touch(this.renderPacks); return true;
      case "pkNone": this.pack().cards = []; this.touch(this.renderPacks); return true;
      case "cancelConfirm": this.confirm = null; this.renderPacks(); this.renderEco(); return true;
      case "cpuDel": this.confirm = { kind: "deck", id }; this.renderEco(); return true;
      case "cpuDelYes": DATA.decks = DATA.decks.filter(d => d.id !== id); this.confirm = null; this.touch(this.renderEco); return true;
      case "cpuCopyCode": {
        const d = DATA.decks.find(x => x.id === id); if (!d) return true;
        navigator.clipboard?.writeText(deckToCode(d)).then(() => { this.importMsg = "コピーしました"; this.renderEco(); }, () => { this.importMsg = "コピーできませんでした"; this.renderEco(); });
        return true;
      }
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
        navigator.clipboard?.writeText(c).then(() => { this.serialMsg = "コピーしました"; this.renderSerials(); }, () => { this.serialMsg = "コピーできませんでした。手で控えてください"; this.renderSerials(); });
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
  if (k === "starter") { DATA.config.STARTER_DECK = t.value; Admin.touch(Admin.renderEco); }
  if (k === "sample") { DATA.config.SAMPLE_DECKS = t.checked; Admin.touch(Admin.renderEco); }
  if (k === "deck-level") { const d = DATA.decks.find(x => x.id === t.dataset.id); if (d) { d.level = t.value; Admin.touch(); } }
});
