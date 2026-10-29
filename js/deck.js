/* =========================================================
   デッキ編成
   ・デッキはアカウントに保存（試遊モードのときだけ、この端末に保存）
   ・入れられる枚数は「所持数」と「1デッキの投入上限」の少ないほう
   ========================================================= */

const DECKS_KEY = "kyokai-decks-v1";
const DECK_SEL_KEY = "kyokai-deck-sel";
const COST_BANDS = { all: "全コスト", "0-2": "0〜2", "3-4": "3〜4", "5-6": "5〜6", "7+": "7以上" };

const Decks = {
  editing: null,     // 編集中のデッキ（コピー）
  viewing: null,     // 閲覧中のデッキid
  detail: null,      // 詳細を開いているカードid
  filter: { type: "all", world: "all", cost: "all", rarity: "all", owned: true, q: "" },

  free() { return Account.status === "free"; },
  mine() {
    if (this.free()) {
      try { const v = JSON.parse(localStorage.getItem(DECKS_KEY)); return Array.isArray(v) ? v.map(d => ({ ...d, cards: cleanDeckCards(d.cards) })) : []; }
      catch { return []; }
    }
    return Account.decks().map(d => ({ ...d, cards: { ...d.cards } }));
  },
  saveMine(list) {
    if (this.free()) { try { localStorage.setItem(DECKS_KEY, JSON.stringify(list)); return true; } catch { return false; } }
    if (Account.status === "none") return false;
    return Account.setDecks(list);
  },
  find(id) { return this.mine().find(d => d.id === id) || (this.free() ? PRESETS.find(d => d.id === id) : null) || null; },
  owned(id) { return Account.owned(id); },
  problems(deck) { return deckProblems(deck, DEF, CONFIG, this.free() ? null : id => this.owned(id)); },
  isValid(deck) { return !!deck && this.problems(deck).length === 0; },
  maxFor(c) { return Math.min(cardLimit(c, CONFIG), this.owned(c.id)); },

  selectedId() { try { return localStorage.getItem(DECK_SEL_KEY); } catch { return null; } },
  select(id) { try { localStorage.setItem(DECK_SEL_KEY, id); } catch {} },
  selected() {
    const d = this.find(this.selectedId());
    if (d) return d;
    const mine = this.mine();
    return mine.find(x => this.isValid(x)) || mine[0] || (this.free() ? PRESETS.find(p => this.isValid(p)) : null) || null;
  },
  readyDeck(onFail) {
    const d = this.selected();
    if (!d) { onFail("デッキがありません。デッキ編成で作ってください。"); return null; }
    const pr = this.problems(d);
    if (pr.length) { onFail(`「${d.name}」はまだ使えません：${pr[0]}`); return null; }
    return { name: d.name, cards: { ...d.cards } };
  },
  randomPreset(level) {
    const ok0 = PRESETS.filter(p => deckProblems(p, DEF, CONFIG).length === 0);
    let ok = ok0.filter(p => !level || p.level === level);
    if (!ok.length) ok = ok0;
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  },

  /* 並べるときの順番（コスト→名前） */
  sorted(cards) {
    return Object.entries(cards).map(([id, n]) => ({ c: DEF[id], id, n }))
      .sort((a, b) => (a.c ? a.c.cost : 99) - (b.c ? b.c.cost : 99) || (a.c && b.c ? a.c.name.localeCompare(b.c.name, "ja") : 0));
  },
  curveHTML(cards) {
    const curve = Array(9).fill(0);
    let chars = 0, total = 0;
    this.sorted(cards).forEach(({ c, n }) => { if (c) { curve[Math.min(8, c.cost)] += n; if (c.type === "char") chars += n; } total += n; });
    const max = Math.max(1, ...curve);
    return `<div class="dsum">
      <div class="dcurve">${curve.map((k, i) => `<div><span class="n">${k || ""}</span><span class="fill" style="height:${(k / max) * 40}px"></span><span class="c">${i === 8 ? "8+" : i}</span></div>`).join("")}</div>
      <div class="dsplit">キャラ <b>${chars}</b> ・ 魔法 <b>${total - chars}</b></div>
    </div>`;
  },
  tileHTML(c, badge, cls = "", act = "deckDetail") {
    return `<button type="button" class="dtile ${cls}" data-act="${act}" data-id="${esc(c.id)}" aria-label="${esc(c.name)}">
      ${cardHTML(c, { static: true })}${badge}</button>`;
  },

  /* ---------- 一覧 ---------- */
  showList(msg) {
    this.editing = null; this.viewing = null; this.detail = null;
    const sel = this.selected();
    const mine = this.mine();
    const row = (d, isPreset) => {
      const pr = this.problems(d), n = deckCount(d);
      const using = sel && sel.id === d.id;
      const top = this.sorted(d.cards).filter(x => x.c).sort((a, b) => b.c.cost - a.c.cost).slice(0, 5);
      return `<li class="drow ${using ? "using" : ""}">
        <button type="button" class="drow-open" data-act="deckView" data-id="${esc(d.id)}">
          <span class="drow-thumbs">${top.map(x => cardHTML(x.c, { static: true, showCost: false })).join("")}</span>
          <span class="drow-main"><b>${esc(d.name)}${isPreset ? `<small class="ptag">サンプル</small>` : ""}</b>
            <span class="${pr.length ? "bad" : "ok"}">${n}/${CONFIG.DECK_SIZE}枚${pr.length ? " ・ " + esc(pr[0]) : ""}</span></span>
        </button>
        <div class="drow-acts">${using ? `<span class="usingtag">使用中</span>` : `<button type="button" class="btn sm" data-act="deckUse" data-id="${esc(d.id)}" ${pr.length ? "disabled" : ""}>使う</button>`}</div>
      </li>`;
    };
    openOverlay(`<div class="panel wide">
      <h2 class="title sm">デッキ編成</h2>
      <p class="lead small">デッキは${CONFIG.DECK_SIZE}枚。同じカードは${CONFIG.COPY_MAX}枚まで（カードによってはそれより少ない）。${this.free() ? "試遊モードなので、すべてのカードを使えます。" : "持っている枚数までしか入れられません。"}</p>
      ${msg ? `<p class="onl-msg">${esc(msg)}</p>` : ""}
      <ul class="dlist">${mine.length ? mine.map(d => row(d, false)).join("") : `<li class="hint">デッキがありません。新しく作ってください。</li>`}</ul>
      <div class="pre-btns">
        <button type="button" class="btn" data-act="deckNew">＋ 新しいデッキ</button>
        <button type="button" class="btn" data-act="deckImport">デッキコードから作る</button>
      </div>
      ${this.free() ? `<h3 class="sec">サンプルデッキ（CPU用）</h3><ul class="dlist">${PRESETS.map(d => row(d, true)).join("")}</ul>` : ""}
      <button type="button" class="btn primary" data-act="deckBack">戻る</button>
    </div>`, "start", true);
  },

  showImport(msg) {
    openOverlay(`<div class="panel">
      <h2 class="title sm">デッキコードから作る</h2>
      <p class="lead small">友達が「デッキコードをコピー」で送ってくれたコードを貼り付けてください。持っていないカードは、あとで入れ替えが必要です。</p>
      <textarea class="otxt" id="deck-code" rows="4" placeholder="KYK1:..."></textarea>
      ${msg ? `<p class="onl-msg">${esc(msg)}</p>` : ""}
      <div class="pre-btns"><button type="button" class="btn" data-act="decks">やめる</button><button type="button" class="btn primary" data-act="deckImportGo">作る</button></div>
    </div>`, "start", true);
  },

  /* ---------- 閲覧 ---------- */
  showView(id) {
    const d = this.find(id); if (!d) return this.showList();
    this.viewing = id;
    const pr = this.problems(d), n = deckCount(d);
    const isPreset = !this.mine().some(x => x.id === id);
    const sel = this.selected();
    openOverlay(`<div class="panel wide">
      <div class="dview-head"><h2 class="title sm">${esc(d.name)}</h2><span class="dcount ${n === CONFIG.DECK_SIZE ? "ok" : "bad"}">${n}<small>/${CONFIG.DECK_SIZE}</small></span></div>
      <p class="dprob ${pr.length ? "bad" : "ok"}">${pr.length ? pr.map(esc).join("<br>") : "このデッキで対戦できます"}</p>
      ${this.curveHTML(d.cards)}
      <div class="dgrid">${this.sorted(d.cards).map(({ c, n, id }) => c
        ? this.tileHTML(c, `<span class="dbadge">×${n}</span>`)
        : `<div class="dtile missing"><span>使えないカード</span><span class="dbadge">×${n}</span></div>`).join("")}</div>
      <div class="dview-acts">
        ${sel && sel.id === id ? `<span class="usingtag big">使用中</span>` : `<button type="button" class="btn primary" data-act="deckUse" data-id="${esc(id)}" ${pr.length ? "disabled" : ""}>このデッキを使う</button>`}
        ${isPreset ? `<button type="button" class="btn" data-act="deckCopy" data-id="${esc(id)}">コピーして編集</button>`
          : `<button type="button" class="btn" data-act="deckEdit" data-id="${esc(id)}">編集</button>
             <button type="button" class="btn" data-act="deckCopy" data-id="${esc(id)}">複製</button>`}
        <button type="button" class="btn" data-act="deckCode" data-id="${esc(id)}">デッキコードをコピー</button>
        <button type="button" class="btn" data-act="decks">一覧に戻る</button>
      </div>
      ${this.detailHTML(false)}
    </div>`, "start", true);
  },

  /* ---------- 編集 ---------- */
  startEdit(deck, isNew) {
    this.editing = { id: deck.id, name: deck.name, cards: { ...deck.cards }, isNew, confirmDel: false };
    this.detail = null;
    this.renderEdit();
  },

  poolCards() {
    const f = this.filter, q = f.q.trim();
    return CARDS.filter(c => c.limit > 0)
      .filter(c => f.type === "all" || c.type === f.type)
      .filter(c => f.world === "all" || c.world === f.world)
      .filter(c => f.rarity === "all" || c.rarity === f.rarity)
      .filter(c => f.cost === "all" || (f.cost === "7+" ? c.cost >= 7 : (([a, b]) => c.cost >= a && c.cost <= b)(f.cost.split("-").map(Number))))
      .filter(c => !f.owned || this.free() || this.owned(c.id) > 0)
      .filter(c => !q || c.name.includes(q) || cardText(c).includes(q))
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));
  },
  poolHTML() {
    const ed = this.editing, list = this.poolCards();
    return list.length ? list.map(c => {
      const k = ed.cards[c.id] || 0, own = this.owned(c.id), max = this.maxFor(c);
      const none = own <= 0;
      return this.tileHTML(c, `<span class="dbadge ${k ? "in" : ""}">${k}/${max}</span>${this.free() ? "" : `<span class="obadge">所持${own}</span>`}`, none ? "unowned" : k ? "has" : "");
    }).join("") : `<p class="hint">条件に合うカードがありません。</p>`;
  },

  renderEdit() {
    const ed = this.editing; if (!ed) return;
    const n = deckCount(ed), pr = this.problems(ed);
    const f = this.filter;
    const seg = (key, val, label) => `<button type="button" data-act="deckFilter" data-k="${key}" data-v="${val}" aria-pressed="${f[key] === val}">${label}</button>`;
    const o = $("#overlay");
    const keepScroll = o.scrollTop;
    openOverlay(`<div class="panel wide dedit">
      <div class="dedit-top">
        <input class="otxt dname" id="deck-name" maxlength="16" value="${esc(ed.name)}" aria-label="デッキの名前">
        <span class="dcount ${n === CONFIG.DECK_SIZE ? "ok" : "bad"}">${n}<small>/${CONFIG.DECK_SIZE}</small></span>
      </div>
      <p class="dprob ${pr.length ? "bad" : "ok"}">${pr.length ? esc(pr[0]) : "このデッキで対戦できます"}</p>
      ${this.curveHTML(ed.cards)}
      <h3 class="sec">デッキの中身 <small class="hint">（タップで詳細・枚数の変更）</small></h3>
      <div class="dgrid">${n ? this.sorted(ed.cards).map(({ c, n, id }) => c
        ? this.tileHTML(c, `<span class="dbadge">×${n}</span>`)
        : `<button type="button" class="dtile missing" data-act="deckDec" data-id="${esc(id)}"><span>使えないカード</span><span class="dbadge">×${n}</span></button>`).join("")
        : `<p class="hint">下のカードから選んで入れてください。</p>`}</div>

      <h3 class="sec">カードを選ぶ</h3>
      <div class="dfilters">
        <input class="otxt dsearch" id="deck-q" type="search" placeholder="名前や効果で検索（例：守護、ドロー）" value="${esc(f.q)}" autocomplete="off">
        <div class="seg">${seg("type", "all", "すべて")}${seg("type", "char", "キャラ")}${seg("type", "spell", "魔法")}</div>
        <div class="seg">${seg("world", "all", "全世界")}${Object.entries(WORLDS).map(([k, v]) => seg("world", k, v)).join("")}</div>
        <div class="seg">${Object.entries(COST_BANDS).map(([k, v]) => seg("cost", k, v)).join("")}</div>
        <div class="seg">${seg("rarity", "all", "全レア")}${Object.keys(RARITY).map(k => seg("rarity", k, RARITY_SHORT[k])).join("")}</div>
        ${this.free() ? "" : `<label class="ownchk"><input type="checkbox" id="deck-owned" ${f.owned ? "checked" : ""}> 持っているカードだけ</label>`}
      </div>
      <div class="dgrid pool" id="deck-pool">${this.poolHTML()}</div>

      ${this.detailHTML(true)}

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

  /* カードの詳細（編集中は枚数を変えられる） */
  detailHTML(editable) {
    const c = this.detail && DEF[this.detail];
    if (!c) return "";
    const ed = this.editing;
    const k = ed ? ed.cards[c.id] || 0 : 0, max = this.maxFor(c);
    const full = ed && deckCount(ed) >= CONFIG.DECK_SIZE;
    return `<div class="dmodal" data-act="deckDetailClose">
      <div class="dmodal-in" role="dialog" aria-label="${esc(c.name)}" data-act="noop">
        <div class="dmodal-card">${cardHTML(c, { static: true })}</div>
        <div class="dmodal-body">
          <b class="dm-name">${esc(c.name)}</b>
          <span class="pmeta">${RARITY[c.rarity]} ・ ${WORLDS[c.world]} ・ ${TYPES[c.type]} ・ コスト${c.cost}${c.type === "char" ? ` ・ ${c.atk}/${c.hp}` : ""}</span>
          <p class="dm-text">${esc(cardText(c))}</p>
          <span class="pmeta">${this.free() ? "" : `所持 ${this.owned(c.id)}枚 ・ `}1デッキに${cardLimit(c, CONFIG)}枚まで</span>
          ${editable ? `<div class="dm-step">
            <button type="button" class="btn" data-act="deckDec" data-id="${esc(c.id)}" ${k ? "" : "disabled"}>−</button>
            <span class="dm-k">デッキに <b>${k}</b> 枚</span>
            <button type="button" class="btn primary" data-act="deckInc" data-id="${esc(c.id)}" ${k >= max || full ? "disabled" : ""}>＋</button>
          </div>
          ${k >= max && max < cardLimit(c, CONFIG) ? `<span class="hint">持っている枚数までしか入れられません。</span>` : ""}
          ${full && k < max ? `<span class="hint">デッキが${CONFIG.DECK_SIZE}枚になっています。</span>` : ""}` : ""}
          <button type="button" class="btn" data-act="deckDetailClose">閉じる</button>
        </div>
      </div>
    </div>`;
  },

  rerender() { if (this.editing) this.renderEdit(); else if (this.viewing) this.showView(this.viewing); },

  handleAct(act, el) {
    const id = el && el.dataset.id;
    const ed = this.editing;
    switch (act) {
      case "decks": this.showList(); return true;
      case "deckBack": this.editing = null; this.viewing = null; showStart(); return true;
      case "deckUse": this.select(id); if (this.viewing) this.showView(this.viewing); else this.showList(); return true;
      case "deckView": this.detail = null; this.showView(id); return true;
      case "deckNew": this.startEdit({ id: "d" + Date.now().toString(36), name: "新しいデッキ", cards: {} }, true); return true;
      case "deckImport": this.showImport(); return true;
      case "deckImportGo": {
        const d = codeToDeck($("#deck-code") ? $("#deck-code").value : "");
        if (!d) { this.showImport("デッキコードを読み取れませんでした。KYK1: から始まる文字をすべて貼り付けてください。"); return true; }
        this.startEdit({ id: "d" + Date.now().toString(36), name: d.name, cards: d.cards }, true);
        return true;
      }
      case "deckCode": {
        const d = this.find(id); if (!d) return true;
        navigator.clipboard?.writeText(deckToCode(d)).then(() => toast("デッキコードをコピーしました"), () => toast("コピーできませんでした"));
        return true;
      }
      case "deckCopy": {
        const p = this.find(id); if (!p) return true;
        this.startEdit({ id: "d" + Date.now().toString(36), name: (p.name + "（複製）").slice(0, 16), cards: p.cards }, true);
        return true;
      }
      case "deckEdit": { const d = this.find(id); if (d) { this.viewing = null; this.startEdit(d, false); } return true; }
      case "deckDetail": this.detail = id; this.rerender(); return true;
      case "deckDetailClose": this.detail = null; this.rerender(); return true;
      case "deckFilter": this.filter[el.dataset.k] = el.dataset.v; this.renderEdit(); return true;
      case "deckInc": {
        const c = DEF[id]; if (!c || !ed) return true;
        if ((ed.cards[id] || 0) < this.maxFor(c) && deckCount(ed) < CONFIG.DECK_SIZE) { ed.cards[id] = (ed.cards[id] || 0) + 1; Sound.play("click"); }
        this.renderEdit(); return true;
      }
      case "deckDec": {
        if (!ed || !ed.cards[id]) return true;
        ed.cards[id]--; if (ed.cards[id] <= 0) delete ed.cards[id];
        Sound.play("click");
        this.renderEdit(); return true;
      }
      case "deckSave": {
        const nameEl = $("#deck-name");
        ed.name = (nameEl ? nameEl.value : ed.name).trim().slice(0, 16) || "デッキ";
        const list = this.mine().filter(d => d.id !== ed.id);
        list.push({ id: ed.id, name: ed.name, cards: ed.cards });
        if (!this.saveMine(list)) { this.editing = null; this.showList("保存できませんでした（サーバーに接続できていません）"); return true; }
        if (this.isValid(ed) && (ed.isNew || !this.isValid(this.selected()))) this.select(ed.id);
        const saved = ed;
        this.editing = null; this.detail = null;
        this.showView(saved.id);
        toast(this.isValid(saved) ? "保存しました" : `保存しました（${this.problems(saved)[0]}）`);
        return true;
      }
      case "deckCancel": { const back = ed && !ed.isNew ? ed.id : null; this.editing = null; this.detail = null; back ? this.showView(back) : this.showList(); return true; }
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

/* 名前・検索・所持のみの切り替え */
document.addEventListener("input", e => {
  if (e.target.id === "deck-name" && Decks.editing) Decks.editing.name = e.target.value;
  if (e.target.id === "deck-q" && Decks.editing) {
    Decks.filter.q = e.target.value;
    const pool = $("#deck-pool"); if (pool) pool.innerHTML = Decks.poolHTML();
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "deck-owned" && Decks.editing) { Decks.filter.owned = e.target.checked; Decks.renderEdit(); }
});
