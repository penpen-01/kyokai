/* =========================================================
   デッキ編成（自分のデッキはこの端末に保存する）
   ========================================================= */

const DECKS_KEY = "kyokai-decks-v1";
const DECK_SEL_KEY = "kyokai-deck-sel";

const Decks = {
  editing: null,     // 編集中のデッキ（コピー）
  filter: { type: "all", world: "all" },

  mine() {
    try { const v = JSON.parse(localStorage.getItem(DECKS_KEY)); return Array.isArray(v) ? v.map(d => ({ ...d, cards: cleanDeckCards(d.cards) })) : []; }
    catch { return []; }
  },
  saveMine(list) {
    try { localStorage.setItem(DECKS_KEY, JSON.stringify(list)); return true; } catch { return false; }
  },
  find(id) { return this.mine().find(d => d.id === id) || PRESETS.find(d => d.id === id) || null; },
  problems(deck) { return deckProblems(deck, DEF, CONFIG); },
  isValid(deck) { return !!deck && this.problems(deck).length === 0; },

  selectedId() { try { return localStorage.getItem(DECK_SEL_KEY); } catch { return null; } },
  select(id) { try { localStorage.setItem(DECK_SEL_KEY, id); } catch {} },
  /* 使うデッキ。選んだものが無いときは、使える最初のサンプルデッキ */
  selected() {
    const d = this.find(this.selectedId());
    if (d) return d;
    return PRESETS.find(p => this.isValid(p)) || PRESETS[0] || null;
  },
  /* 対戦に使える状態のデッキを返す。使えなければ理由を表示して null */
  readyDeck(onFail) {
    const d = this.selected();
    if (!d) { onFail("デッキがありません。デッキ編成で作ってください。"); return null; }
    const pr = this.problems(d);
    if (pr.length) { onFail(`「${d.name}」はまだ使えません：${pr[0]}`); return null; }
    return { name: d.name, cards: { ...d.cards } };
  },
  randomPreset(level) {
    let ok = PRESETS.filter(p => this.isValid(p) && (!level || p.level === level));
    if (!ok.length) ok = PRESETS.filter(p => this.isValid(p));
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  },

  /* ---------- 一覧画面 ---------- */
  showList(msg) {
    const sel = this.selected();
    const row = (d, isPreset) => {
      const pr = this.problems(d), n = deckCount(d);
      const using = sel && sel.id === d.id;
      return `<li class="drow ${using ? "using" : ""}">
        <div class="drow-main">
          <b>${esc(d.name)}</b>
          <span class="${pr.length ? "bad" : "ok"}">${n}/${CONFIG.DECK_SIZE}枚${pr.length ? " ・ " + esc(pr[0]) : ""}</span>
        </div>
        <div class="drow-acts">
          ${using ? `<span class="usingtag">使用中</span>` : `<button type="button" class="btn sm" data-act="deckUse" data-id="${esc(d.id)}" ${pr.length ? "disabled" : ""}>使う</button>`}
          ${isPreset
            ? `<button type="button" class="btn sm" data-act="deckCopy" data-id="${esc(d.id)}">コピーして編集</button>`
            : `<button type="button" class="btn sm" data-act="deckEdit" data-id="${esc(d.id)}">編集</button>`}
        </div>
      </li>`;
    };
    const mine = this.mine();
    openOverlay(`<div class="panel wide">
      <h2 class="title sm">デッキ編成</h2>
      <p class="lead">デッキは${CONFIG.DECK_SIZE}枚。同じカードは${CONFIG.COPY_MAX}枚まで（カードによってはそれより少ない）。デッキはこの端末に保存されます。</p>
      ${msg ? `<p class="onl-msg">${esc(msg)}</p>` : ""}
      <h3 class="sec">あなたのデッキ</h3>
      <ul class="dlist">${mine.length ? mine.map(d => row(d, false)).join("") : `<li class="hint">まだありません。サンプルデッキをコピーするか、新しく作ってください。</li>`}</ul>
      <button type="button" class="btn" data-act="deckNew">＋ 新しいデッキを作る</button>
      <h3 class="sec">サンプルデッキ</h3>
      <ul class="dlist">${PRESETS.map(d => row(d, true)).join("")}</ul>
      <button type="button" class="btn primary" data-act="deckBack">戻る</button>
    </div>`, "start", true);
  },

  /* ---------- 編集画面 ---------- */
  startEdit(deck, isNew) {
    this.editing = { id: deck.id, name: deck.name, cards: { ...deck.cards }, isNew, confirmDel: false };
    this.renderEdit();
  },

  renderEdit() {
    const ed = this.editing; if (!ed) return;
    const n = deckCount(ed), pr = this.problems(ed);
    const f = this.filter;
    const pool = CARDS.filter(c => c.limit > 0)
      .filter(c => f.type === "all" || c.type === f.type)
      .filter(c => f.world === "all" || c.world === f.world)
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));
    const inDeck = Object.entries(ed.cards).map(([id, k]) => ({ c: DEF[id], k, id }))
      .sort((a, b) => (a.c ? a.c.cost : 99) - (b.c ? b.c.cost : 99));
    const curve = Array(9).fill(0);
    inDeck.forEach(({ c, k }) => { if (c) curve[Math.min(8, c.cost)] += k; });
    const max = Math.max(1, ...curve);
    const chars = inDeck.filter(x => x.c && x.c.type === "char").reduce((s, x) => s + x.k, 0);
    const seg = (key, val, label) => `<button type="button" data-act="deckFilter" data-k="${key}" data-v="${val}" aria-pressed="${f[key] === val}">${label}</button>`;
    const o = $("#overlay");
    const keepScroll = o.scrollTop;
    openOverlay(`<div class="panel wide dedit">
      <div class="dedit-top">
        <input class="otxt dname" id="deck-name" maxlength="16" value="${esc(ed.name)}" aria-label="デッキの名前">
        <span class="dcount ${n === CONFIG.DECK_SIZE ? "ok" : "bad"}">${n}<small>/${CONFIG.DECK_SIZE}</small></span>
      </div>
      <p class="dprob ${pr.length ? "bad" : "ok"}">${pr.length ? esc(pr[0]) : "このデッキで対戦できます"}</p>
      <div class="dsum">
        <div class="dcurve">${curve.map((k, i) => `<div><span class="n">${k || ""}</span><span class="fill" style="height:${(k / max) * 40}px"></span><span class="c">${i === 8 ? "8+" : i}</span></div>`).join("")}</div>
        <div class="dsplit">キャラ <b>${chars}</b> ・ 魔法 <b>${n - chars}</b></div>
      </div>
      <div class="dchips">${inDeck.length ? inDeck.map(({ c, k, id }) => `<button type="button" class="dchip ${c ? "w-" + c.world : ""}" data-act="deckDec" data-id="${esc(id)}" aria-label="${esc(c ? c.name : "不明なカード")}を1枚減らす">
          <span class="dc-cost">${c ? c.cost : "?"}</span><span class="dc-name">${esc(c ? c.name : "使えないカード")}</span><span class="dc-k">×${k}</span><span class="dc-minus">−</span></button>`).join("")
        : `<p class="hint">下の一覧から「＋」でカードを入れてください。</p>`}</div>

      <div class="dfilters">
        <div class="seg">${seg("type", "all", "すべて")}${seg("type", "char", "キャラ")}${seg("type", "spell", "魔法")}</div>
        <div class="seg">${seg("world", "all", "全世界")}${Object.entries(WORLDS).map(([k, v]) => seg("world", k, v)).join("")}</div>
      </div>
      <ul class="dpool">${pool.map(c => {
        const k = ed.cards[c.id] || 0, lim = cardLimit(c, CONFIG);
        return `<li class="prow ${k ? "has" : ""}">
          ${cardHTML(c, { static: true })}
          <div class="prow-main">
            <b>${esc(c.name)}</b>
            <span class="pmeta">${WORLDS[c.world]} ・ コスト${c.cost}${c.type === "char" ? ` ・ ${c.atk}/${c.hp}` : " ・ 魔法"}</span>
            <span class="ptext">${esc(cardText(c))}</span>
          </div>
          <div class="pstep">
            <button type="button" data-act="deckInc" data-id="${esc(c.id)}" ${k >= lim || n >= CONFIG.DECK_SIZE ? "disabled" : ""} aria-label="${esc(c.name)}を1枚入れる">＋</button>
            <span>${k}<small>/${lim}</small></span>
            <button type="button" data-act="deckDec" data-id="${esc(c.id)}" ${k ? "" : "disabled"} aria-label="${esc(c.name)}を1枚減らす">−</button>
          </div>
        </li>`;
      }).join("")}</ul>

      <div class="dedit-bar">
        ${ed.confirmDel
          ? `<span class="bad" style="flex:1">このデッキを削除します。元に戻せません。</span>
             <button type="button" class="btn danger" data-act="deckDelYes">削除する</button>
             <button type="button" class="btn" data-act="deckDelNo">やめる</button>`
          : `${ed.isNew ? "" : `<button type="button" class="btn danger" data-act="deckDel">削除</button>`}
             <button type="button" class="btn" data-act="deckCancel">保存せずに戻る</button>
             <button type="button" class="btn primary" data-act="deckSave">保存</button>`}
      </div>
    </div>`, "start", true);
    o.scrollTop = keepScroll;
  },

  handleAct(act, el) {
    const id = el && el.dataset.id;
    const ed = this.editing;
    switch (act) {
      case "decks": this.showList(); return true;
      case "deckBack": showStart(); return true;
      case "deckUse": this.select(id); this.showList(); return true;
      case "deckNew": this.startEdit({ id: "d" + Date.now().toString(36), name: "新しいデッキ", cards: {} }, true); return true;
      case "deckCopy": {
        const p = this.find(id); if (!p) return true;
        this.startEdit({ id: "d" + Date.now().toString(36), name: (p.name + "（コピー）").slice(0, 16), cards: p.cards }, true);
        return true;
      }
      case "deckEdit": { const d = this.find(id); if (d) this.startEdit(d, false); return true; }
      case "deckFilter": this.filter[el.dataset.k] = el.dataset.v; this.renderEdit(); return true;
      case "deckInc": {
        const c = DEF[id]; if (!c || !ed) return true;
        if ((ed.cards[id] || 0) < cardLimit(c, CONFIG) && deckCount(ed) < CONFIG.DECK_SIZE) ed.cards[id] = (ed.cards[id] || 0) + 1;
        this.renderEdit(); return true;
      }
      case "deckDec": {
        if (!ed || !ed.cards[id]) return true;
        ed.cards[id]--; if (ed.cards[id] <= 0) delete ed.cards[id];
        this.renderEdit(); return true;
      }
      case "deckSave": {
        const nameEl = $("#deck-name");
        ed.name = (nameEl ? nameEl.value : ed.name).trim().slice(0, 16) || "デッキ";
        const list = this.mine().filter(d => d.id !== ed.id);
        list.push({ id: ed.id, name: ed.name, cards: ed.cards });
        if (!this.saveMine(list)) { this.showList("保存できませんでした（ブラウザの保存領域がいっぱいか、使えない設定です）"); return true; }
        if (this.isValid(ed) && (ed.isNew || !this.isValid(this.selected()))) this.select(ed.id);
        this.editing = null;
        this.showList(this.isValid(ed) ? `「${ed.name}」を保存しました` : `「${ed.name}」を保存しました（${this.problems(ed)[0]}）`);
        return true;
      }
      case "deckCancel": this.editing = null; this.showList(); return true;
      case "deckDel": ed.confirmDel = true; this.renderEdit(); return true;
      case "deckDelNo": ed.confirmDel = false; this.renderEdit(); return true;
      case "deckDelYes": {
        this.saveMine(this.mine().filter(d => d.id !== ed.id));
        if (this.selectedId() === ed.id) this.select("");
        this.editing = null; this.showList("削除しました"); return true;
      }
    }
    return false;
  }
};

/* 名前の入力は保存時に読むので、入力中は何もしない */
document.addEventListener("input", e => {
  if (e.target.id === "deck-name" && Decks.editing) Decks.editing.name = e.target.value;
});
