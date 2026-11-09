/* =========================================================
   カード工房：デッキタブ
   ・CPU（初級・中級・上級）と検証用のデッキを、ここで一覧・編集する（DATA.decks）
   ・編集は、カードをタップで1枚入れる・デッキの中のカードをタップで1枚減らす
   ・「このデッキで検証」で、検証タブの対戦シミュレーションに送る
   ・検証用（level: "test"）のデッキは、CPUもプレイヤーも使わない（検証タブだけで使う）
   editor.js の DATA / saveDraft / renderStatus、lab.js の Lab を使う
   ========================================================= */

const WD_LEVELS = { easy: "CPU初級", normal: "CPU中級", hard: "CPU上級", boss: "隠しボス", test: "検証用", gate: "開放戦用" };

const WDecks = {
  id: null,          // 開いているデッキ
  f: { type: "all", world: "all", rarity: "all", cost: "all", q: "" },
  confirmDel: null,
  msg: "",

  deck() { return (DATA.decks || []).find(d => d.id === this.id) || null; },
  touch(re = true) { saveDraft(); renderStatus(); if (re) this.render(); },
  newId() { return "dk" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); },
  limitOf(c) { return Math.min(c.limit, DATA.config.COPY_MAX); },

  /* デッキの中身の内訳（コスト・種類・世界・レア度） */
  stats(d) {
    const cards = Object.entries(d.cards).map(([id, n]) => [DATA.cards.find(c => c.id === id), n]).filter(([c]) => c);
    const sum = f => cards.reduce((a, [c, n]) => a + (f(c) ? n : 0), 0);
    const curve = Array(9).fill(0);
    cards.forEach(([c, n]) => { curve[Math.min(8, Math.max(0, c.cost))] += n; });
    return {
      curve, chars: sum(c => c.type === "char"), spells: sum(c => c.type === "spell"),
      world: Object.fromEntries(Object.keys(WORLDS).map(w => [w, sum(c => c.world === w)])),
      rar: Object.fromEntries(RARITY_KEYS.map(r => [r, sum(c => c.rarity === r)])),
      avg: cards.length ? (cards.reduce((a, [c, n]) => a + c.cost * n, 0) / Math.max(1, deckCount(d))).toFixed(1) : "0"
    };
  },
  problems(d) {
    const byId = Object.fromEntries(DATA.cards.map(c => [c.id, c]));
    return deckProblems(d, byId, DATA.config, null);
  },

  render() {
    const el = $("#tab-decks"); if (!el) return;
    if (!DATA.decks) DATA.decks = [];
    const d = this.deck();
    el.innerHTML = `
      <h2>デッキ</h2>
      <p class="hint">CPUが使うデッキと、検証用のデッキをここで組みます。CPUは、対戦で選ばれた強さのデッキの中からランダムに1つ使います。「検証用」はCPUもプレイヤーも使わず、検証タブだけで使えます。変更は「公開する」までゲームには出ません。</p>
      <div class="wd-wrap ${d ? "has" : ""}">
        <div class="wd-listcol">${this.listHTML()}</div>
        <div class="wd-editcol">${d ? this.editHTML(d) : `<div class="fgroup"><p class="hint">左の一覧からデッキを選ぶか、新しく作ってください。</p></div>`}</div>
      </div>`;
  },

  listHTML() {
    const decks = DATA.decks;
    const starter = DATA.config.STARTER_DECK;
    const groups = Object.keys(WD_LEVELS).map(lv => [lv, decks.filter(d => (d.level || "normal") === lv)]);
    return `
      <div class="frow" style="margin-bottom:10px">
        <button type="button" class="btn sm primary" data-act="wdNew">＋ 新しいデッキ</button>
      </div>
      <details class="wd-import"><summary class="small">デッキコードから追加</summary>
        <textarea class="txt" id="wd-code" rows="3" placeholder="KYK2:..."></textarea>
        <div class="frow"><button type="button" class="btn sm" data-act="wdImport">追加</button></div>
      </details>
      ${this.msg ? `<p class="warn">${esc(this.msg)}</p>` : ""}
      ${groups.map(([lv, list]) => `
        <div class="wd-group"><b class="small">${WD_LEVELS[lv]} <span class="hint">${list.length}個</span></b>
          ${list.length ? list.map(d => {
            const n = deckCount(d), pr = this.problems(d);
            return `<button type="button" class="wd-row ${d.id === this.id ? "on" : ""}" data-act="wdOpen" data-id="${esc(d.id)}">
              <b>${esc(d.name)}${d.id === starter ? ` <span class="wd-tag">スターター</span>` : ""}</b>
              <span class="${pr.length ? "bad" : "ok"} small">${n}/${DATA.config.DECK_SIZE}枚${pr.length ? " ・ " + esc(pr[0]) : ""}</span>
            </button>`;
          }).join("") : `<p class="hint small">なし</p>`}
        </div>`).join("")}`;
  },

  editHTML(d) {
    const n = deckCount(d), pr = this.problems(d), s = this.stats(d), size = DATA.config.DECK_SIZE;
    const max = Math.max(1, ...s.curve);
    const inDeck = Object.entries(d.cards).map(([id, k]) => [DATA.cards.find(c => c.id === id), k, id])
      .sort((a, b) => (a[0] ? a[0].cost : 99) - (b[0] ? b[0].cost : 99) || (a[0] ? a[0].name : "").localeCompare(b[0] ? b[0].name : "", "ja"));
    const isStarter = DATA.config.STARTER_DECK === d.id;
    const seg = (k, v, label) => `<button type="button" data-act="wdFilter" data-k="${k}" data-v="${v}" aria-pressed="${this.f[k] === v}">${label}</button>`;
    const conf = this.confirmDel === d.id;
    return `<button type="button" class="m-back" data-act="wdBack">← デッキ一覧に戻る</button>
    <div class="fgroup">
      <div class="frow">
        <div class="field grow"><label for="wd-name">名前</label><input class="txt" id="wd-name" data-wd="name" value="${esc(d.name)}" maxlength="16"></div>
        <div class="field"><label for="wd-level">使い道</label>
          <select class="txt" id="wd-level" data-wd="level" style="width:auto">${Object.entries(WD_LEVELS).map(([k, v]) => `<option value="${k}" ${(d.level || "normal") === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <span class="wd-count ${n === size ? "ok" : "bad"}"><b>${n}</b>/${size}</span>
      </div>
      <p class="${pr.length ? "bad" : "ok"} small">${pr.length ? pr.map(esc).join("<br>") : (d.level === "test" ? "検証で使えます" : "CPUが使えるデッキです")}</p>
      <div class="wd-stats">
        <div class="wd-curve">${s.curve.map((k, i) => `<div><span class="n">${k || ""}</span><span class="fill" style="height:${k / max * 44}px"></span><span class="c">${i === 8 ? "8+" : i}</span></div>`).join("")}</div>
        <div class="small wd-mix">
          <span>キャラ <b>${s.chars}</b> ・ 魔法 <b>${s.spells}</b> ・ 平均コスト <b>${s.avg}</b></span>
          <span>${Object.entries(WORLDS).map(([w, v]) => `<span style="color:var(--w-${w})">${v} <b>${s.world[w]}</b></span>`).join(" ・ ")}</span>
          <span>${RARITY_KEYS.map(r => `${RARITY_SHORT[r]} <b>${s.rar[r]}</b>`).join(" ・ ")}</span>
        </div>
      </div>
      <div class="frow">
        <button type="button" class="btn sm primary" data-act="wdLab" ${n < 1 ? "disabled" : ""}>このデッキで検証</button>
        <button type="button" class="btn sm" data-act="wdDup">複製</button>
        <button type="button" class="btn sm" data-act="wdCode">デッキコードをコピー</button>
        <button type="button" class="btn sm" data-act="wdClear" ${n ? "" : "disabled"}>空にする</button>
        ${conf
          ? `<span class="bad small">削除しますか？</span><button type="button" class="btn sm danger" data-act="wdDelYes">削除する</button><button type="button" class="btn sm" data-act="wdDelNo">やめる</button>`
          : `<button type="button" class="btn sm danger" data-act="wdDel" ${isStarter ? `disabled title="スターターに選ばれているデッキは削除できません"` : ""}>削除</button>`}
      </div>
      <span class="gl">デッキの中身 <span class="hint">タップで1枚減らす</span></span>
      <div class="wd-grid">${inDeck.length ? inDeck.map(([c, k, id]) => c
        ? `<button type="button" class="wd-tile" data-act="wdDec" data-id="${esc(id)}" title="${esc(c.name)}">${cardHTML(c, { static: true })}<span class="wd-badge">×${k}</span></button>`
        : `<button type="button" class="wd-tile missing" data-act="wdDec" data-id="${esc(id)}">使えないカード<span class="wd-badge">×${k}</span></button>`).join("")
        : `<p class="hint small">下のカードをタップして入れてください。</p>`}</div>
      <span class="gl">カードを選ぶ <span class="hint">タップで1枚入れる</span></span>
      <div class="wd-filters">
        <input class="txt" id="wd-q" data-wd="q" type="search" placeholder="名前や効果で検索" value="${esc(this.f.q)}" style="max-width:260px">
        <div class="seg">${seg("type", "all", "すべて")}${seg("type", "char", "キャラ")}${seg("type", "spell", "魔法")}</div>
        <div class="seg">${seg("world", "all", "全世界")}${Object.entries(WORLDS).map(([k, v]) => seg("world", k, v)).join("")}</div>
        <div class="seg">${seg("cost", "all", "全コスト")}${["0-2", "3-4", "5-6", "7+"].map(k => seg("cost", k, k)).join("")}</div>
        <div class="seg">${seg("rarity", "all", "全レア")}${RARITY_KEYS.map(k => seg("rarity", k, RARITY_SHORT[k])).join("")}</div>
      </div>
      <div class="wd-grid pool" id="wd-pool">${this.poolHTML(d)}</div>
    </div>`;
  },

  poolHTML(d) {
    const f = this.f, q = f.q.trim();
    const list = DATA.cards.filter(c => c.limit > 0)
      .filter(c => f.type === "all" || c.type === f.type)
      .filter(c => f.world === "all" || c.world === f.world)
      .filter(c => f.rarity === "all" || c.rarity === f.rarity)
      .filter(c => f.cost === "all" || (f.cost === "7+" ? c.cost >= 7 : (([a, b]) => c.cost >= a && c.cost <= b)(f.cost.split("-").map(Number))))
      .filter(c => !q || c.name.includes(q) || cardText(c).includes(q))
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));
    return list.length ? list.map(c => {
      const k = d.cards[c.id] || 0, max = this.limitOf(c);
      return `<button type="button" class="wd-tile ${k ? "has" : ""} ${k >= max ? "maxed" : ""}" data-act="wdInc" data-id="${esc(c.id)}" title="${esc(c.name)}：${esc(cardText(c))}">${cardHTML(c, { static: true })}<span class="wd-badge ${k ? "in" : ""}">${k}/${max}</span></button>`;
    }).join("") : `<p class="hint small">条件に合うカードがありません。</p>`;
  },

  handleAct(act, el) {
    const id = el && el.dataset.id, d = this.deck();
    switch (act) {
      case "wdOpen": this.id = id; this.confirmDel = null; this.msg = ""; this.render(); if (matchMedia("(max-width:820px)").matches) window.scrollTo(0, 0); return true;
      case "wdBack": this.id = null; this.confirmDel = null; this.render(); return true;
      case "wdNew": {
        const nd = { id: this.newId(), name: "新しいデッキ", cards: {}, level: "test" };
        DATA.decks.push(nd); this.id = nd.id; this.msg = ""; this.touch(); return true;
      }
      case "wdImport": {
        const r = codeToDeck($("#wd-code") ? $("#wd-code").value : "");
        if (!r) { this.msg = "デッキコードを読み取れませんでした"; this.render(); return true; }
        const nd = { id: this.newId(), name: r.name, cards: r.cards, level: "test" };
        DATA.decks.push(nd); this.id = nd.id; this.msg = ""; this.touch(); return true;
      }
      case "wdDup": {
        if (!d) return true;
        const nd = { id: this.newId(), name: (d.name + "（複製）").slice(0, 16), cards: { ...d.cards }, level: d.level || "normal" };
        DATA.decks.push(nd); this.id = nd.id; this.touch(); return true;
      }
      case "wdCode": {
        if (!d) return true;
        copyText(deckToCode(d)).then(ok => { this.msg = ok ? "デッキコードをコピーしました" : "コピーできませんでした"; this.render(); });
        return true;
      }
      case "wdClear": if (d) { d.cards = {}; this.touch(); } return true;
      case "wdDel": this.confirmDel = id || (d && d.id); this.render(); return true;
      case "wdDelNo": this.confirmDel = null; this.render(); return true;
      case "wdDelYes": {
        if (!d) return true;
        DATA.decks = DATA.decks.filter(x => x.id !== d.id); this.id = null; this.confirmDel = null; this.touch(); return true;
      }
      case "wdInc": {
        if (!d) return true;
        const c = DATA.cards.find(x => x.id === id); if (!c) return true;
        const k = d.cards[id] || 0;
        if (k >= this.limitOf(c)) { this.msg = `${c.name}は1デッキに${this.limitOf(c)}枚までです`; this.render(); return true; }
        if (deckCount(d) >= DATA.config.DECK_SIZE) { this.msg = `${DATA.config.DECK_SIZE}枚になっています。先に何かを減らしてください`; this.render(); return true; }
        d.cards[id] = k + 1; this.msg = ""; this.touch(); return true;
      }
      case "wdDec": {
        if (!d || !d.cards[id]) return true;
        if (--d.cards[id] <= 0) delete d.cards[id];
        this.msg = ""; this.touch(); return true;
      }
      case "wdFilter": this.f[el.dataset.k] = el.dataset.v; this.render(); return true;
      case "wdLab": {
        if (!d) return true;
        // 検証タブへ：このデッキと、試験用の4つの型を選んだ状態にする
        Lab.sel = new Set([d.id, "t-aggro", "t-ramp", "t-control", "t-mid"]);
        showTab("sim");
        return true;
      }
    }
    return false;
  },

  /* 名前・使い道・検索の入力 */
  input(t) {
    const k = t.dataset.wd, d = this.deck();
    if (k === "q") { this.f.q = t.value; const p = $("#wd-pool"); if (p && d) p.innerHTML = this.poolHTML(d); return true; }
    if (!d) return false;
    if (k === "name") { d.name = t.value.slice(0, 16) || "デッキ"; saveDraft(); renderStatus(); return true; }
    if (k === "level") { d.level = t.value; this.touch(); return true; }
    return false;
  }
};
