/* =========================================================
   デッキ編成
   ・デッキはアカウントに保存（試遊モードのときだけ、この端末に保存）
   ・入れられる枚数は「所持数」と「1デッキの投入上限」の少ないほう
   ・ベータ中（SAMPLE_DECKS）は、所持に関係なく全カードで組める「サンプルデッキ」も作れる
   ・操作：一覧のカードをタップで1枚追加、デッキの中のカードをタップで1枚減らす、長押しで詳細
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
  sampleOK() { return !!CONFIG.SAMPLE_DECKS; },
  /* このデッキは所持数を気にせず組めるか */
  unbound(deck) { return this.free() || !!(deck && deck.free && this.sampleOK()); },
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
  /* 作れるデッキの数の上限。いっぱいなら知らせて true を返す（新しく作るときだけ使う） */
  full(sample) {
    const n = this.mine().filter(d => !!d.free === !!sample).length;
    if (n < (CONFIG.DECK_MAX || 10)) return false;
    toast(`${sample ? "サンプルデッキ" : "デッキ"}は${CONFIG.DECK_MAX}個までです。いらないデッキを消してから作ってください`);
    return true;
  },
  find(id) { return this.mine().find(d => d.id === id) || (this.free() ? PRESETS.find(d => d.id === id) : null) || null; },
  owned(id) { return Account.owned(id); },
  problems(deck) { return deckProblems(deck, DEF, CONFIG, this.unbound(deck) ? null : id => this.owned(id)); },
  isValid(deck) { return !!deck && this.problems(deck).length === 0; },
  maxFor(c, deck) { return this.unbound(deck) ? cardLimit(c, CONFIG, deck) : Math.min(cardLimit(c, CONFIG, deck), this.owned(c.id)); },

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
  topbar(title, backAct) {
    return `<div class="topbar"><button type="button" class="btn sm" data-act="${backAct}">← 戻る</button><b>${title}</b></div>`;
  },

  /* ---------- 一覧 ---------- */
  showList(msg) {
    this.editing = null; this.viewing = null; this.detail = null;
    const sel = this.selected();
    const all = this.mine();
    const mine = all.filter(d => !d.free), samples = all.filter(d => d.free);
    const row = (d, tag) => {
      const pr = this.problems(d), n = deckCount(d);
      const using = sel && sel.id === d.id;
      const top = this.sorted(d.cards).filter(x => x.c).sort((a, b) => b.c.cost - a.c.cost).slice(0, 5);
      return `<li class="drow ${using ? "using" : ""}">
        <button type="button" class="drow-open" data-act="deckView" data-id="${esc(d.id)}">
          <span class="drow-thumbs">${top.map(x => cardHTML(x.c, { static: true, showCost: false })).join("")}</span>
          <span class="drow-main"><b>${esc(d.name)}${tag ? `<small class="ptag">${tag}</small>` : ""}</b>
            <span class="${pr.length ? "bad" : "ok"}">${n}/${CONFIG.DECK_SIZE}枚${pr.length ? " ・ " + esc(pr[0]) : ""}</span></span>
        </button>
        <div class="drow-acts">${using ? `<span class="usingtag">使用中</span>` : `<button type="button" class="btn sm" data-act="deckUse" data-id="${esc(d.id)}" ${pr.length ? "disabled" : ""}>使う</button>`}</div>
      </li>`;
    };
    openOverlay(`<div class="panel wide">
      ${this.topbar("デッキ編成", "deckBack")}
      <p class="lead small">デッキは${CONFIG.DECK_SIZE}枚。同じカードは${CONFIG.COPY_MAX}枚まで（カードによってはそれより少ない）。${this.free() ? "試遊モードなので、すべてのカードを使えます。" : "持っている枚数までしか入れられません。"}</p>
      ${msg ? `<p class="onl-msg">${esc(msg)}</p>` : ""}
      <h3 class="sec">あなたのデッキ <small class="hint">${mine.length}/${CONFIG.DECK_MAX}</small></h3>
      <ul class="dlist">${mine.length ? mine.map(d => row(d, "")).join("") : `<li class="hint">デッキがありません。新しく作ってください。</li>`}</ul>
      <div class="pre-btns">
        <button type="button" class="btn" data-act="deckNew">＋ 新しいデッキ</button>
        <button type="button" class="btn" data-act="deckImport">デッキコードから作る</button>
      </div>
      ${this.sampleOK() && !this.free() ? `
        <h3 class="sec">サンプルデッキ <small class="hint">${samples.length}/${CONFIG.DECK_MAX} ・ 全カード使用可・ベータ限定</small></h3>
        <p class="lead small">持っていないカードも含めて、すべてのカードで組めるデッキです。カードの強さを試すためのもので、ベータ期間が終わると使えなくなります。</p>
        <ul class="dlist">${samples.length ? samples.map(d => row(d, "サンプル")).join("") : `<li class="hint">まだありません。</li>`}</ul>
        <div class="pre-btns">
          <button type="button" class="btn" data-act="deckNewSample">＋ 新しいサンプルデッキ</button>
          <button type="button" class="btn" data-act="deckPresets">用意されたデッキから作る</button>
        </div>` : ""}
      ${this.free() ? `<h3 class="sec">CPU用のデッキ</h3><ul class="dlist">${PRESETS.map(d => row(d, "CPU用")).join("")}</ul>` : ""}
    </div>`, "start", true);
  },

  showPresets() {
    openOverlay(`<div class="panel wide">
      ${this.topbar("用意されたデッキから作る", "decks")}
      <p class="lead small">CPUが使っているデッキをコピーして、サンプルデッキとして編集できます。</p>
      <ul class="dlist">${PRESETS.map(d => `<li class="drow"><span class="drow-main"><b>${esc(d.name)}</b><span class="hint">${{ easy: "初級", normal: "中級", hard: "上級" }[d.level] || ""}CPU用 ・ ${deckCount(d)}枚</span></span>
        <div class="drow-acts"><button type="button" class="btn sm" data-act="deckFromPreset" data-id="${esc(d.id)}">コピーして編集</button></div></li>`).join("")}</ul>
    </div>`, "start", true);
  },

  showImport(msg) {
    openOverlay(`<div class="panel">
      ${this.topbar("デッキコードから作る", "decks")}
      <p class="lead small">友達が「デッキコードをコピー」で送ってくれたコードを貼り付けてください。メッセージごと貼り付けても、コードの部分だけを読み取ります。</p>
      <textarea class="otxt" id="deck-code" rows="4" placeholder="KYK2:..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
      ${this.sampleOK() && !this.free() ? `<label class="ownchk"><input type="checkbox" id="deck-code-sample"> サンプルデッキとして作る（全カード使用可）</label>` : ""}
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
      ${this.topbar("デッキ", "decks")}
      <div class="dview-head"><h2 class="title sm">${esc(d.name)}${d.free ? `<small class="ptag">サンプル</small>` : ""}</h2><span class="dcount ${n === CONFIG.DECK_SIZE ? "ok" : "bad"}">${n}<small>/${CONFIG.DECK_SIZE}</small></span></div>
      <p class="dprob ${pr.length ? "bad" : "ok"}">${pr.length ? pr.map(esc).join("<br>") : "このデッキで対戦できます"}</p>
      ${this.curveHTML(d.cards)}
      <div class="dview-acts">
        ${sel && sel.id === id ? `<span class="usingtag big">使用中</span>` : `<button type="button" class="btn primary" data-act="deckUse" data-id="${esc(id)}" ${pr.length ? "disabled" : ""}>このデッキを使う</button>`}
        ${isPreset ? `<button type="button" class="btn" data-act="deckCopy" data-id="${esc(id)}">コピーして編集</button>`
          : `<button type="button" class="btn" data-act="deckEdit" data-id="${esc(id)}">編集</button>
             <button type="button" class="btn" data-act="deckCopy" data-id="${esc(id)}">複製</button>`}
        <button type="button" class="btn" data-act="deckCode" data-id="${esc(id)}">デッキコードをコピー</button>
      </div>
      <p class="hint">カードを長押しすると、効果を見られます。</p>
      <div class="dgrid">${this.sorted(d.cards).map(({ c, n }) => c
        ? this.tileHTML(c, `<span class="dbadge">×${n}</span>`)
        : `<div class="dtile missing"><span>使えないカード</span><span class="dbadge">×${n}</span></div>`).join("")}</div>
      ${this.detailHTML(false)}
    </div>`, "start", true);
  },

  /* ---------- 編集 ---------- */
  startEdit(deck, isNew) {
    this.editing = { id: deck.id, name: deck.name, cards: { ...deck.cards }, isNew, free: !!deck.free, confirmDel: false };
    this.detail = null;
    this.renderEdit();
  },

  poolCards() {
    const f = this.filter, q = f.q.trim(), ed = this.editing;
    const unb = this.unbound(ed);
    return CARDS.filter(c => c.limit > 0)
      .filter(c => f.type === "all" || c.type === f.type)
      .filter(c => f.world === "all" || c.world === f.world)
      .filter(c => f.rarity === "all" || c.rarity === f.rarity)
      .filter(c => f.cost === "all" || (f.cost === "7+" ? c.cost >= 7 : (([a, b]) => c.cost >= a && c.cost <= b)(f.cost.split("-").map(Number))))
      .filter(c => !f.owned || unb || this.owned(c.id) > 0)
      .filter(c => !q || c.name.includes(q) || cardText(c).includes(q))
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));
  },
  poolHTML() {
    const ed = this.editing, list = this.poolCards(), unb = this.unbound(ed);
    return list.length ? list.map(c => {
      const k = ed.cards[c.id] || 0, own = this.owned(c.id), max = this.maxFor(c, ed);
      const none = !unb && own <= 0;
      return this.tileHTML(c, `<span class="dbadge ${k ? "in" : ""}">${k}/${max}</span>${unb ? "" : `<span class="obadge">所持${own}</span>`}`,
        `${none ? "unowned" : k ? "has" : ""} ${k >= max ? "maxed" : ""}`, "deckTapAdd");
    }).join("") : `<p class="hint">条件に合うカードがありません。</p>`;
  },

  renderEdit() {
    const ed = this.editing; if (!ed) return;
    const n = deckCount(ed), pr = this.problems(ed);
    const f = this.filter, unb = this.unbound(ed);
    const seg = (key, val, label) => `<button type="button" data-act="deckFilter" data-k="${key}" data-v="${val}" aria-pressed="${f[key] === val}">${label}</button>`;
    const o = $("#overlay");
    const keepScroll = o.scrollTop;
    openOverlay(`<div class="panel wide dedit">
      <div class="dedit-top">
        <input class="otxt dname" id="deck-name" maxlength="16" value="${esc(ed.name)}" aria-label="デッキの名前">
        <span class="dcount ${n === CONFIG.DECK_SIZE ? "ok" : "bad"}">${n}<small>/${CONFIG.DECK_SIZE}</small></span>
      </div>
      ${ed.free ? `<p class="hint">サンプルデッキ：持っていないカードも入れられます（ベータ限定）。</p>` : ""}
      <p class="dprob ${pr.length ? "bad" : "ok"}">${pr.length ? esc(pr[0]) : "このデッキで対戦できます"}</p>
      ${this.curveHTML(ed.cards)}
      <h3 class="sec">デッキの中身 <small class="hint">タップで1枚減らす・長押しで詳細</small></h3>
      <div class="dgrid" id="deck-in">${n ? this.sorted(ed.cards).map(({ c, n, id }) => c
        ? this.tileHTML(c, `<span class="dbadge">×${n}</span>`, "", "deckTapDec")
        : `<button type="button" class="dtile missing" data-act="deckDec" data-id="${esc(id)}"><span>使えないカード</span><span class="dbadge">×${n}</span></button>`).join("")
        : `<p class="hint">下のカードをタップして入れてください。</p>`}</div>

      <h3 class="sec">カードを選ぶ <small class="hint">タップで1枚入れる・長押しで詳細</small></h3>
      <div class="dfilters">
        <input class="otxt dsearch" id="deck-q" type="search" placeholder="名前や効果で検索（例：守護、ドロー）" value="${esc(f.q)}" autocomplete="off">
        <div class="seg">${seg("type", "all", "すべて")}${seg("type", "char", "キャラ")}${seg("type", "spell", "魔法")}</div>
        <div class="seg">${seg("world", "all", "全世界")}${Object.entries(WORLDS).map(([k, v]) => seg("world", k, v)).join("")}</div>
        <div class="seg">${Object.entries(COST_BANDS).map(([k, v]) => seg("cost", k, v)).join("")}</div>
        <div class="seg">${seg("rarity", "all", "全レア")}${Object.keys(RARITY).map(k => seg("rarity", k, RARITY_SHORT[k])).join("")}</div>
        ${unb ? "" : `<label class="ownchk"><input type="checkbox" id="deck-owned" ${f.owned ? "checked" : ""}> 持っているカードだけ</label>`}
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
             <button type="button" class="btn primary" data-act="deckSave" ${pr.length ? "disabled" : ""}>${n === CONFIG.DECK_SIZE ? "保存" : `保存（${CONFIG.DECK_SIZE}枚にすると押せます）`}</button>`}
      </div>
    </div>`, "start", true);
    o.scrollTop = keepScroll;
  },

  /* カードの詳細（編集中は枚数を変えられる） */
  detailHTML(editable) {
    const c = this.detail && DEF[this.detail];
    if (!c) return "";
    const ed = this.editing, unb = this.unbound(ed || this.find(this.viewing));
    const k = ed ? ed.cards[c.id] || 0 : 0, max = this.maxFor(c, ed);
    return `<div class="dmodal" data-act="deckDetailClose">
      <div class="dmodal-in" role="dialog" aria-label="${esc(c.name)}" data-act="noop">
        <div class="dmodal-card">${cardHTML(c, { static: true })}</div>
        <div class="dmodal-body">
          <b class="dm-name">${esc(c.name)}</b>
          <span class="pmeta">${RARITY[c.rarity]} ・ ${WORLDS[c.world]} ・ ${TYPES[c.type]} ・ コスト${c.cost}${c.type === "char" ? ` ・ ${c.atk}/${c.hp}` : ""}</span>
          <p class="dm-text">${esc(cardText(c))}</p>
          <span class="pmeta">${unb ? "" : `所持 ${this.owned(c.id)}枚 ・ `}1デッキに${cardLimit(c, CONFIG, ed)}枚まで</span>
          ${editable ? `<div class="dm-step">
            <button type="button" class="btn" data-act="deckDec" data-id="${esc(c.id)}" ${k ? "" : "disabled"}>−</button>
            <span class="dm-k">デッキに <b>${k}</b> 枚</span>
            <button type="button" class="btn primary" data-act="deckInc" data-id="${esc(c.id)}" ${k >= max ? "disabled" : ""}>＋</button>
          </div>
          ${k >= max && max < cardLimit(c, CONFIG, ed) ? `<span class="hint">持っている枚数までしか入れられません。</span>` : ""}` : ""}
          <button type="button" class="btn" data-act="deckDetailClose">閉じる</button>
        </div>
      </div>
    </div>`;
  },

  rerender() { if (this.editing) this.renderEdit(); else if (this.viewing) this.showView(this.viewing); },

  inc(id, quick) {
    const ed = this.editing, c = DEF[id]; if (!c || !ed) return;
    const k = ed.cards[id] || 0, max = this.maxFor(c, ed);
    if (k >= max) {
      if (quick) {
        const own = this.owned(id);
        toast(!this.unbound(ed) && own <= k && k < cardLimit(c, CONFIG, ed)
          ? (own ? `${c.name}は${own}枚しか持っていません` : `${c.name}はまだ持っていません`)
          : `${c.name}は1デッキに${cardLimit(c, CONFIG, ed)}枚までです`);
      }
      return;
    }
    ed.cards[id] = k + 1;
    Sound.play("click");
    this.renderEdit();
    if (quick) this.pulse(id);
  },
  dec(id) {
    const ed = this.editing; if (!ed || !ed.cards[id]) return;
    ed.cards[id]--; if (ed.cards[id] <= 0) delete ed.cards[id];
    Sound.play("click");
    this.renderEdit();
  },
  /* 入れたカードがデッキのどこに入ったか分かるように光らせる */
  pulse(id) {
    const el = document.querySelector(`#deck-in [data-id="${CSS.escape(id)}"]`);
    if (el) { el.classList.add("pulse"); setTimeout(() => el.classList.remove("pulse"), 500); }
  },

  handleAct(act, el) {
    const id = el && el.dataset.id;
    const ed = this.editing;
    switch (act) {
      case "decks": this.showList(); return true;
      case "deckBack": this.editing = null; this.viewing = null; showStart(); return true;
      case "deckUse": this.select(id); if (this.viewing) this.showView(this.viewing); else this.showList(); return true;
      case "deckView": this.detail = null; this.showView(id); return true;
      case "deckNew": if (this.full(false)) return true; this.startEdit({ id: "d" + Date.now().toString(36), name: "新しいデッキ", cards: {} }, true); return true;
      case "deckNewSample": if (this.full(true)) return true; this.startEdit({ id: "s" + Date.now().toString(36), name: "サンプルデッキ", cards: {}, free: true }, true); return true;
      case "deckPresets": this.showPresets(); return true;
      case "deckFromPreset": {
        const p = PRESETS.find(x => x.id === id); if (!p || this.full(true)) return true;
        this.startEdit({ id: "s" + Date.now().toString(36), name: p.name.slice(0, 16), cards: p.cards, free: true }, true);
        return true;
      }
      case "deckImport": this.showImport(); return true;
      case "deckImportGo": {
        const d = codeToDeck($("#deck-code") ? $("#deck-code").value : "");
        if (!d) { this.showImport("デッキコードを読み取れませんでした。KYK2:（または KYK1:）から始まる文字を、途中で切れないようにすべて貼り付けてください。"); return true; }
        const asSample = !!($("#deck-code-sample") && $("#deck-code-sample").checked);
        if (this.full(asSample)) return true;
        // 今は使えないカード・持っていないカードは外して、何を外したかを知らせる
        const draftDeck = { free: asSample };
        const cards = {}, missing = [];
        Object.entries(d.cards).forEach(([cid, n]) => {
          const c = DEF[cid];
          if (!c || c.limit <= 0) { missing.push(`（今は使えないカード）×${n}`); return; }
          const k = Math.min(n, this.maxFor(c, draftDeck));
          if (k > 0) cards[cid] = k;
          if (k < n) missing.push(`${c.name}×${n - k}`);
        });
        this.startEdit({ id: (asSample ? "s" : "d") + Date.now().toString(36), name: d.name, cards, free: asSample }, true);
        if (missing.length) toast(`持っていないカードを外しました：${missing.slice(0, 4).join("、")}${missing.length > 4 ? " ほか" : ""}`);
        return true;
      }
      case "deckCode": {
        const d = this.find(id); if (!d) return true;
        copyText(deckToCode(d)).then(ok => toast(ok ? "デッキコードをコピーしました" : "コピーできませんでした"));
        return true;
      }
      case "deckCopy": {
        const p = this.find(id); if (!p || this.full(!!p.free)) return true;
        this.startEdit({ id: (p.free ? "s" : "d") + Date.now().toString(36), name: (p.name + "（複製）").slice(0, 16), cards: p.cards, free: !!p.free }, true);
        return true;
      }
      case "deckEdit": { const d = this.find(id); if (d) { this.viewing = null; this.startEdit(d, false); } return true; }
      case "deckDetail": this.detail = id; this.rerender(); return true;
      case "deckDetailClose": this.detail = null; this.rerender(); return true;
      case "deckFilter": this.filter[el.dataset.k] = el.dataset.v; this.renderEdit(); return true;
      case "deckTapAdd": this.inc(id, true); return true;
      case "deckTapDec": this.dec(id); return true;
      case "deckInc": this.inc(id, false); return true;
      case "deckDec": this.dec(id); return true;
      case "deckSave": {
        const nameEl = $("#deck-name");
        ed.name = (nameEl ? nameEl.value : ed.name).trim().slice(0, 16) || "デッキ";
        const pr = this.problems(ed);
        if (pr.length) { toast(pr[0]); return true; }
        const list = this.mine().filter(d => d.id !== ed.id);
        list.push({ id: ed.id, name: ed.name, cards: ed.cards, ...(ed.free ? { free: true } : {}) });
        if (!this.saveMine(list)) { this.editing = null; this.showList("保存できませんでした（サーバーに接続できていません）"); return true; }
        if (ed.isNew || !this.isValid(this.selected())) this.select(ed.id);
        const saved = ed;
        this.editing = null; this.detail = null;
        this.showView(saved.id);
        toast("保存しました");
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

/* カードの長押しで詳細を開く（デッキ編成・パック開封の画面） */
(() => {
  let t = null, sx = 0, sy = 0, fired = false;
  const clear = () => { if (t) { clearTimeout(t); t = null; } };
  // 長押しで詳細を開いたあと、指を離したときの「タップ」で閉じたり1枚追加されたりしないようにする
  document.addEventListener("pointerup", () => { if (fired) { fired = false; blockClick(); } }, true);
  document.addEventListener("pointerdown", e => {
    const tile = e.target.closest("#overlay .dtile[data-id], #overlay .oslot.up[data-id]");
    if (!tile) return;
    sx = e.clientX; sy = e.clientY;
    clear();
    t = setTimeout(() => {
      t = null;
      fired = true;
      blockClick();
      const id = tile.dataset.id;
      if (tile.classList.contains("oslot")) Packs.showDetail(id);
      else { Decks.detail = id; Decks.rerender(); }
    }, 420);
  });
  document.addEventListener("pointermove", e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear(); });
  ["pointerup", "pointercancel", "scroll"].forEach(ev => document.addEventListener(ev, clear, true));
  document.addEventListener("contextmenu", e => { if (e.target.closest("#overlay .dtile, #overlay .oslot")) e.preventDefault(); });
})();
