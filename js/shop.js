/* =========================================================
   ショップ（魔石）
   ・上限（COPY_MAX）を超えて持っているカードを分解して「魔石」にする
   ・魔石で、好きなカード1枚かパック券と交換する
   ・Gではカードを直接買えない（パックを開ける意味を残すため）
   ・未所持のカードは、一覧では手札の「使えないカード」と同じ色あせで見せる（絵は隠さない。買う前に見られるように）
   ・レートはすべて CONFIG（カード工房の「報酬・CPU・シーズン」）で変えられる
   ========================================================= */

/* 売り場の一覧。ready:false はまだ無い売り場（?shopsoon を付けたときだけ「準備中」で並ぶ） */
const SHOP_CATS = [
  { id: "trade", ready: true }, { id: "dis", ready: true }, { id: "ticket", ready: true },
  { id: "slot", ready: true },
  { id: "skin", ready: false, ic: "skin", name: "カードのスキン", sub: "好きなカードの絵を変える" },
  { id: "icon", ready: false, ic: "icon", name: "アイコン", sub: "プレイヤーの顔を変える" },
  { id: "sleeve", ready: false, ic: "sleeve", name: "スリーブ", sub: "カードの裏の模様" },
  { id: "field", ready: false, ic: "field", name: "バトル場", sub: "対戦の舞台を変える" },
  { id: "limited", ready: false, ic: "star", name: "期間限定", sub: "いまだけの交換" }
];
const SHOP_IC = {
  trade: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="9" height="13" rx="1.5"/><rect x="12" y="6" width="9" height="13" rx="1.5" transform="rotate(8 16.5 12.5)"/><path d="M7.5 9.5l1.5 2-1.5 2-1.5-2z"/></svg>',
  dis: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l6 7-6 11-6-11z"/><path d="M6 10h12M3 6l2 1M21 6l-2 1M4 15l2-1M20 15l-2-1"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M15 7v10" stroke-dasharray="2 2"/></svg>',
  slot: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="10" height="14" rx="1.5"/><path d="M18 9v8M14 13h8"/></svg>',
  skin: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 15l3-4 2 2.5 1.5-1.5L17 15z"/><circle cx="10" cy="8" r="1.5"/></svg>',
  icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5c1.2-2.4 3.2-3.5 5.5-3.5s4.3 1.1 5.5 3.5"/></svg>',
  sleeve: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="12" rx="1"/><path d="M12 9l2 3-2 3-2-3z"/></svg>',
  field: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19h18M5 19V9l3-3 3 3v10M13 19v-6l4-3 4 3v6"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/></svg>'
};
const STONE_KEY = { common: "COMMON", rare: "RARE", sr: "SR", ur: "UR", legend: "LEGEND" };

const Shop = {
  rar: "all",      // 交換一覧の絞り込み（レア度）
  onlyNeed: true,  // 上限まで持っていないカードだけ出す
  detailId: null,
  msg: null,
  view: "main",    // main（交換） | dis（分解）
  sel: {},         // 分解の画面で選んだ枚数 { カードID: 枚数 }

  usable() { return ["ready", "offline"].includes(Account.status); },
  getRate(r) { return Math.max(0, CONFIG["STONE_GET_" + STONE_KEY[r]] || 0); },
  costRate(r) { return Math.max(0, CONFIG["STONE_COST_" + STONE_KEY[r]] || 0); },
  ticketCost() { return Math.max(0, CONFIG.STONE_TICKET || 0); },
  cap() { return CONFIG.COPY_MAX || 3; },

  /* 上限を超えている分（分解できるカード） */
  surplus() {
    const cap = this.cap();
    return CARDS.filter(c => DEF[c.id] && Account.owned(c.id) > cap)
      .map(c => ({ c, n: Account.owned(c.id) - cap, stones: (Account.owned(c.id) - cap) * this.getRate(c.rarity) }))
      .sort((a, b) => RARITY_ORDER.indexOf(b.c.rarity) - RARITY_ORDER.indexOf(a.c.rarity) || a.c.cost - b.c.cost);
  },

  /* 交換できるカード：今買えるパックに入っているカード（パックに出ないカードは交換でも出さない） */
  pool() {
    const seen = new Set(), out = [];
    PACKS.filter(p => p.open && setOpen(p.set)).forEach(p => Packs.pool(p).forEach(c => { if (!seen.has(c.id)) { seen.add(c.id); out.push(c); } }));
    return out.sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.cost - b.cost);
  },

  /* ---------- 操作 ---------- */
  /* 分解する。picks = { カードID: 枚数 }（省略するとダブり全部） */
  dismantle(picks) {
    if (!this.usable()) return;
    const sur = this.surplus();
    const list = sur.map(x => ({ ...x, k: picks ? Math.min(x.n, Math.max(0, picks[x.c.id] || 0)) : x.n })).filter(x => x.k > 0);
    if (!list.length) return this.showDismantle(picks ? "分解するカードを選んでください。" : "分解できるカードはありません。");
    let n = 0, s = 0;
    list.forEach(x => { Account.data.cards[x.c.id] -= x.k; n += x.k; s += x.k * this.getRate(x.c.rarity); });
    if (typeof Quest !== "undefined") Quest.add("dis", n);
    Account.data.stones = Account.stones + s;
    Account.saveNow();
    Sound.play("flip");
    this.sel = {};
    this.showDismantle(`${n}枚を分解して、魔石を${s}個手に入れました（所持 ${Account.stones}）。`);
  },

  buyTicket() {
    if (!this.usable()) return;
    const cost = this.ticketCost();
    if (Account.stones < cost) return this.show(`魔石が足りません（あと${cost - Account.stones}個）。`);
    Account.data.stones -= cost;
    Account.data.tickets = Account.tickets + 1;
    Account.saveNow();
    Sound.play("click");
    this.show(`パック券を1枚手に入れました（所持${Account.tickets}枚）。パックの画面で使えます。`);
  },

  /* デッキ枠を1つ増やす（マイデッキ・限定構築の上限がそれぞれ1つ増える） */
  buySlot() {
    if (!this.usable()) return;
    const cost = CONFIG.DECK_SLOT_COST ?? 1500;
    if (Account.deckSlots >= (CONFIG.DECK_SLOT_MAX ?? 10)) return this.show("デッキ枠はもう増やせません。");
    if (Account.stones < cost) return this.show(`魔石が足りません（あと${cost - Account.stones}個）。`);
    Account.data.stones -= cost;
    Account.data.deckSlots = Account.deckSlots + 1;
    Account.saveNow();
    Sound.play("click");
    this.show(`デッキ枠が1つ増えました（マイデッキ・限定構築とも ${Decks.max("mine")}個まで）。`);
  },
  buy(id) {
    const c = DEF[id];
    if (!this.usable() || !c) return;
    const cost = this.costRate(c.rarity);
    if (Account.owned(id) >= this.cap()) return this.showTrade(`${c.name}はもう${this.cap()}枚持っています。`);
    if (Account.stones < cost) return this.showTrade(`魔石が足りません（あと${cost - Account.stones}個）。`);
    Account.data.stones -= cost;
    Account.data.cards[id] = (Account.data.cards[id] || 0) + 1;
    if (typeof Quest !== "undefined") Quest.add("trade", 1);
    Account.saveNow();
    Sound.play(RARITY_ORDER.indexOf(c.rarity) >= 2 ? "rare" : "flip", RARITY_ORDER.indexOf(c.rarity));
    this.detailId = null;
    this.showTrade(`${c.name}を手に入れました（所持${Account.owned(id)}枚）。`);
  },

  /* ---------- カード一覧・デッキ編成の詳細から交換する ----------
     ショップに行かなくても、その場で魔石と交換できる。間違えて押さないように、1回確かめてから交換する */
  tradeAsk: null,
  canTrade(c) { return this.usable() && !!c && this.pool().some(x => x.id === c.id); },
  tradeHTML(c) {
    if (!this.canTrade(c)) return "";
    const own = Account.owned(c.id), cost = this.costRate(c.rarity), cap = this.cap();
    if (own >= cap) return "";
    const short = Account.stones < cost;
    if (this.tradeAsk === c.id) return `<div class="trade ask">
        <p><span>魔石 <b>${cost}</b> を使って、${esc(c.name)}を1枚手に入れます。</span><small>所持 ${curIcon("stone")}${Account.stones} → ${Account.stones - cost}</small></p>
        <div class="pre-btns"><button type="button" class="btn" data-act="tradeNo">やめる</button><button type="button" class="btn primary" data-act="tradeYes" data-id="${esc(c.id)}">交換する</button></div>
      </div>`;
    return `<div class="trade">
        <button type="button" class="btn trade-btn" data-act="tradeAsk" data-id="${esc(c.id)}" ${short ? "disabled" : ""}>${curIcon("stone")}${short ? `魔石が足りません（あと${cost - Account.stones}）` : `魔石${cost}で${own ? "もう1枚" : ""}交換する`}</button>
        <small class="hint">所持 ${curIcon("stone")}${Account.stones}</small>
      </div>`;
  },
  /* 交換して、開いていた画面を描き直す */
  trade(id) {
    const c = DEF[id]; this.tradeAsk = null;
    if (!this.canTrade(c)) return;
    const cost = this.costRate(c.rarity);
    if (Account.owned(id) >= this.cap()) toast(`${c.name}はもう${this.cap()}枚持っています`);
    else if (Account.stones < cost) toast(`魔石が足りません（あと${cost - Account.stones}個）`);
    else {
      Account.data.stones -= cost;
      Account.data.cards[id] = (Account.data.cards[id] || 0) + 1;
      if (typeof Quest !== "undefined") Quest.add("trade", 1);
      Account.saveNow();
      Sound.play(RARITY_ORDER.indexOf(c.rarity) >= 2 ? "rare" : "flip", RARITY_ORDER.indexOf(c.rarity));
      toast(`${c.name}を手に入れました（所持${Account.owned(id)}枚）`);
    }
    this.tradeRedraw();
  },
  tradeRedraw() {
    if (Decks.editing || Decks.viewing) Decks.rerender();
    else if (typeof CL !== "undefined" && CL.detail) showCardList();
  },

  /* ---------- 画面 ---------- */
  noteHTML() {
    return this.usable() ? (Account.status === "offline" ? `<p class="datainfo">オフラインです。交換した内容は、通信できるようになったら保存されます。</p>` : "")
      : Account.status === "free" ? `<p class="onl-msg">試遊モードではショップを使えません（すべてのカードを使えます）。</p>`
      : `<p class="onl-msg">アカウントを読み込めていません。通信状態を確認して、開き直してください。</p>`;
  },

  /* ---------- ショップの入口 ----------
     上に「今日のおすすめ」、その下に売り場のタイル。売り場が増えたら SHOP_CATS に足すだけで並ぶ */
  feature() {
    const cap = this.cap(), pool = this.pool();
    const pick = rs => pool.filter(c => rs.includes(c.rarity) && Account.owned(c.id) < cap);
    const list = pick(["legend", "ur"]).length ? pick(["legend", "ur"]) : pick(["sr", "ur", "legend"]);
    if (!list.length) return null;
    const day = localDate(new Date()); let h = 0; for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return list[h % list.length];   // 日ごとに変わる（その日は同じカード）
  },
  show(msg) {
    this.view = "hub";
    this.msg = msg === undefined ? this.msg : msg;
    const sur = this.surplus();
    const surN = sur.reduce((a, x) => a + x.n, 0), surS = sur.reduce((a, x) => a + x.stones, 0);
    const tc = this.ticketCost(), f = this.feature(), use = this.usable();
    const slotCost = CONFIG.DECK_SLOT_COST ?? 1500, slotLeft = (CONFIG.DECK_SLOT_MAX ?? 10) - Account.deckSlots;
    const soon = /[?&]shopsoon\b/.test(location.search);
    const fut = SHOP_CATS.filter(x => !x.ready);
    openOverlay(`<div class="panel wide shop shophub">
      <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>ショップ</b>${stoneTag(Account.stones)}</div>
      ${this.noteHTML()}
      ${this.msg ? `<p class="shopmsg" role="status">${esc(this.msg)}</p>` : ""}
      ${f ? `<button type="button" class="sh-hero r-${f.rarity}" data-act="shopFeature" data-id="${esc(f.id)}" ${f.art ? `style="--art:url('${esc(f.art)}')"` : ""}>
        <span class="sh-hero-bg" ${f.art ? `style="background-image:url('${esc(f.art)}')"` : ""}></span>
        <span class="sh-hero-in"><small>今日のおすすめ</small><b>${esc(f.name)}</b>
          <span class="sh-hero-meta"><i class="rtag r-${f.rarity}">${RARITY_SHORT[f.rarity]}</i>${curIcon("stone")}${this.costRate(f.rarity)}${Account.owned(f.id) ? ` ・ 所持${Account.owned(f.id)}枚` : " ・ 未所持"}</span>
          <span class="sh-hero-go">見る ›</span></span>
      </button>` : ""}
      <div class="sh-cats">
        <button type="button" class="sh-cat wide c-trade" data-act="shopTrade" ${use ? "" : "disabled"}>
          <span class="sh-ic">${SHOP_IC.trade}</span><b>カードと交換</b><small>好きなカードを魔石で1枚ずつ</small><span class="go" aria-hidden="true">›</span></button>
        <button type="button" class="sh-cat c-dis" data-act="shopDis" ${use ? "" : "disabled"}>
          <span class="sh-ic">${SHOP_IC.dis}</span><b>分解</b><small>${surN ? `ダブり${surN}枚 ・ 最大+${surS}` : "ダブりはありません"}</small>${surN ? `<i class="sh-badge">${surN}</i>` : ""}</button>
        <div class="sh-cat c-ticket">
          <span class="sh-ic">${SHOP_IC.ticket}</span><b>パック券</b><small>魔石${tc}で1枚 ・ 所持${Account.tickets}枚</small>
          <button type="button" class="btn sm primary" data-act="shopTicket" ${use && Account.stones >= tc ? "" : "disabled"}>交換する</button></div>
        <div class="sh-cat c-slot">
          <span class="sh-ic">${SHOP_IC.slot}</span><b>デッキ枠</b><small>${slotLeft > 0 ? `魔石${slotCost}で1つ増やす（マイデッキ・限定構築とも）・今 ${Decks.max("mine")}個` : `もう増やせません（${Decks.max("mine")}個）`}</small>
          <button type="button" class="btn sm primary" data-act="shopSlot" ${use && slotLeft > 0 && Account.stones >= slotCost ? "" : "disabled"}>増やす</button></div>
        ${soon ? fut.map(x => `<div class="sh-cat soon"><span class="sh-ic">${SHOP_IC[x.ic] || SHOP_IC.star}</span><b>${esc(x.name)}</b><small>${esc(x.sub)}</small><i class="sh-soon">準備中</i></div>`).join("") : ""}
      </div>
      <p class="hint sh-foot">魔石は、ダブったカードの分解とログインボーナスで手に入ります。パック券1枚で、どのパックでも1パック開けられます（パックの画面で使います）。</p>
      ${this.detailHTML()}
      ${this.hubAskHTML(tc, slotCost)}
    </div>`, "start", true);
  },
  /* パック券・デッキ枠を交換する前の確認（魔石は戻せないので） */
  hubAskHTML(tc, slotCost) {
    const k = this.hubAsk; if (!k) return "";
    const t = k === "slot"
      ? { title: "デッキ枠を1つ増やしますか？", body: `魔石<b>${slotCost}</b>個を使います（所持 ${Account.stones} → ${Account.stones - slotCost}）。マイデッキ・限定構築の枠が、それぞれ ${Decks.max("mine")} → ${Decks.max("mine") + 1}個になります。`, yes: "増やす" }
      : { title: "パック券と交換しますか？", body: `魔石<b>${tc}</b>個を使って、パック券を1枚手に入れます（魔石 ${Account.stones} → ${Account.stones - tc}）。`, yes: "交換する" };
    return `<div class="dmodal" data-act="shopHubNo">
      <div class="dmodal-in confirmbox" role="alertdialog" aria-label="交換の確認" data-act="noop">
        <b class="dm-name">${t.title}</b>
        <p class="dm-text">${t.body}使った魔石は元に戻せません。</p>
        <div class="pre-btns"><button type="button" class="btn primary" data-act="shopHubYes">${t.yes}</button><button type="button" class="btn" data-act="shopHubNo">やめる</button></div>
      </div></div>`;
  },

  /* カードと交換の売り場 */
  showTrade(msg) {
    this.view = "trade";
    this.msg = msg === undefined ? this.msg : msg;
    const sur = this.surplus();
    const surN = sur.reduce((a, x) => a + x.n, 0), surS = sur.reduce((a, x) => a + x.stones, 0);
    const cap = this.cap(), tc = this.ticketCost();
    const list = this.pool().filter(c => (this.rar === "all" || c.rarity === this.rar) && (!this.onlyNeed || Account.owned(c.id) < cap));
    openOverlay(`<div class="panel wide shop">
      <div class="topbar"><button type="button" class="btn sm" data-act="shopMain">← ショップ</button><b>カードと交換</b>${stoneTag(Account.stones)}</div>
      ${this.noteHTML()}
      ${this.msg ? `<p class="shopmsg" role="status">${esc(this.msg)}</p>` : ""}
      <section class="shopsec">
        <p class="rates">${RARITY_ORDER.map(r => `<span><i class="rtag r-${r}">${RARITY_SHORT[r]}</i>${this.costRate(r)}</span>`).join("")}</p>
        <div class="shopfilter">
          ${["all", ...RARITY_ORDER].map(r => `<button type="button" class="chip ${this.rar === r ? "on" : ""}" data-act="shopRar" data-v="${r}">${r === "all" ? "すべて" : RARITY_SHORT[r]}</button>`).join("")}
          <label class="shopneed"><input type="checkbox" data-act="shopNeed" ${this.onlyNeed ? "checked" : ""}> ${cap}枚持っているカードを隠す</label>
        </div>
        <div class="dgrid">${list.length ? list.map(c => {
          const own = Account.owned(c.id), cost = this.costRate(c.rarity);
          return `<button type="button" class="dtile ${own >= cap ? "unowned" : ""}" data-act="shopDetail" data-id="${esc(c.id)}" aria-label="${esc(c.name)}">
            ${cardHTML(c, { static: true, cls: own <= 0 ? "dim" : "" })}<span class="dbadge ${Account.stones >= cost && own < cap ? "in" : ""}">${cost}</span></button>`;
        }).join("") : `<p class="hint">条件に合うカードはありません。</p>`}</div>
      </section>
      ${this.detailHTML()}
    </div>`, "start", true);
  },

  /* 分解の画面：カードごとに枚数を選んで分解、またはまとめて分解 */
  showDismantle(msg) {
    const ov = $("#overlay"), y = this.view === "dis" && !ov.hidden ? ov.scrollTop : 0;   // 選ぶたびに一番上へ戻らないように
    this.view = "dis";
    if (msg !== undefined) this.msg = msg;
    const sur = this.surplus(), cap = this.cap();
    this.sel = Object.fromEntries(Object.entries(this.sel || {}).filter(([id, k]) => k > 0 && sur.some(x => x.c.id === id)));
    const allN = sur.reduce((a, x) => a + x.n, 0), allS = sur.reduce((a, x) => a + x.stones, 0);
    const pick = x => Math.min(x.n, this.sel[x.c.id] || 0);
    const selN = sur.reduce((a, x) => a + pick(x), 0), selS = sur.reduce((a, x) => a + pick(x) * this.getRate(x.c.rarity), 0);
    openOverlay(`<div class="panel wide shop">
      <div class="topbar"><button type="button" class="btn sm" data-act="shopMain">← ショップ</button><b>分解</b>${stoneTag(Account.stones)}</div>
      ${this.noteHTML()}
      ${this.msg ? `<p class="shopmsg" role="status">${esc(this.msg)}</p>` : ""}
      <p class="callout"><b>分解できるのはダブりだけ</b>同じカードを${cap}枚より多く持っている分だけを、魔石にできます。デッキに入れられるのは${cap}枚までなので、分解しても遊び方は変わりません。</p>
      <p class="rates">${RARITY_ORDER.map(r => `<span><i class="rtag r-${r}">${RARITY_SHORT[r]}</i>${this.getRate(r)}</span>`).join("")}</p>
      ${sur.length ? `
        <ul class="dislist">${sur.map(x => {
          const k = pick(x), rate = this.getRate(x.c.rarity);
          return `<li class="${k ? "on" : ""}">
            <button type="button" class="disthumb" data-act="shopPickAll" data-id="${esc(x.c.id)}" aria-label="${esc(x.c.name)}をすべて選ぶ">${cardHTML(x.c, { static: true })}</button>
            <div class="disinfo"><span><i class="rtag r-${x.c.rarity}">${RARITY_SHORT[x.c.rarity]}</i>${esc(x.c.name)}</span><small>所持${Account.owned(x.c.id)}枚 ・ ダブり${x.n}枚 ・ 1枚 +${rate}</small></div>
            <div class="stepper">
              <button type="button" class="btn sm" data-act="shopPick" data-id="${esc(x.c.id)}" data-v="-1" ${k ? "" : "disabled"} aria-label="1枚減らす">−</button>
              <b>${k}</b>
              <button type="button" class="btn sm" data-act="shopPick" data-id="${esc(x.c.id)}" data-v="1" ${k < x.n ? "" : "disabled"} aria-label="1枚増やす">＋</button>
            </div>
          </li>`;
        }).join("")}</ul>
        <div class="disbar">
          <div class="disbar-sum">${selN ? `<b>${selN}枚</b>を選択中 ・ 魔石 <b>+${selS}</b>` : "分解するカードを選んでください"}${selN ? `<button type="button" class="linkbtn" data-act="shopSelClear">解除</button>` : ""}</div>
          <div class="disbar-btns">
            <button type="button" class="btn" data-act="shopDisAllAsk" ${this.usable() ? "" : "disabled"}>ダブりを全部（${allN}枚）</button>
            <button type="button" class="btn primary" data-act="shopDisSelAsk" ${this.usable() && selN ? "" : "disabled"}>選んだ分を分解</button>
          </div>
        </div>`
        : `<p class="callout">今は分解できるカードがありません。</p>`}
      ${this.ask ? `<div class="dmodal" data-act="shopAskNo">
        <div class="dmodal-in confirmbox" role="alertdialog" aria-label="分解の確認" data-act="noop">
          <b class="dm-name">${this.ask.n}枚を分解しますか？</b>
          <p class="dm-text">魔石を<b>${this.ask.s}</b>個手に入れます。分解したカードは元に戻せません。</p>
          <ul class="asklist">${this.ask.list.map(x => `<li><i class="rtag r-${x.c.rarity}">${RARITY_SHORT[x.c.rarity]}</i>${esc(x.c.name)}<span>×${x.k}</span></li>`).join("")}</ul>
          <div class="pre-btns"><button type="button" class="btn danger" data-act="shopAskYes">分解する</button><button type="button" class="btn" data-act="shopAskNo">やめる</button></div>
        </div></div>` : ""}
    </div>`, "start", true);
    ov.scrollTop = y;
  },

  detailHTML() {
    const c = this.detailId && DEF[this.detailId];
    if (!c) return "";
    const own = Account.owned(c.id), cost = this.costRate(c.rarity), cap = this.cap();
    const ok = this.usable() && own < cap && Account.stones >= cost;
    const label = own >= cap ? `${cap}枚持っています` : Account.stones < cost ? `魔石が足りません（あと${cost - Account.stones}）` : `魔石${cost}で交換する`;
    return `<div class="dmodal" data-act="shopDetailClose">
      <div class="dmodal-in" role="dialog" aria-label="${esc(c.name)}" data-act="noop">
        <div class="dmodal-card">${cardHTML(c, { static: true, cls: Account.owned(c.id) <= 0 ? "dim" : "" })}</div>
        <div class="dmodal-body">
          <b class="dm-name">${esc(c.name)}</b>
          <span class="pmeta">${RARITY[c.rarity]} ・ ${WORLDS[c.world]} ・ ${TYPES[c.type]} ・ コスト${c.cost}${c.type === "char" ? ` ・ ${c.atk}/${c.hp}` : ""}</span>
          <p class="dm-text">${cardTextHTML(c)}</p>
          <span class="pmeta">所持 ${own}枚 ・ 魔石 ${Account.stones}</span>
          <button type="button" class="btn primary" data-act="shopBuy" data-id="${esc(c.id)}" ${ok ? "" : "disabled"}>${label}</button>
          <button type="button" class="btn" data-act="shopDetailClose">閉じる</button>
        </div>
      </div>
    </div>`;
  },

  handleAct(act, el) {
    switch (act) {
      case "shop": this.msg = null; this.detailId = null; this.hubAsk = null; this.show(); return true;
      case "shopMain": this.msg = null; this.detailId = null; this.show(); return true;
      case "shopTrade": this.msg = null; this.detailId = null; this.showTrade(); return true;
      case "shopFeature": this.msg = null; this.rar = "all"; this.detailId = el.dataset.id; this.showTrade(); return true;
      case "shopDis": this.msg = null; this.sel = {}; this.showDismantle(); return true;
      case "shopPick": {
        const id = el.dataset.id, x = this.surplus().find(y => y.c.id === id);
        if (x) this.sel[id] = Math.max(0, Math.min(x.n, (this.sel[id] || 0) + (+el.dataset.v)));
        this.msg = null; this.showDismantle(); return true;
      }
      case "shopPickAll": {
        const id = el.dataset.id, x = this.surplus().find(y => y.c.id === id);
        if (x) this.sel[id] = (this.sel[id] || 0) >= x.n ? 0 : x.n;
        this.msg = null; this.showDismantle(); return true;
      }
      case "shopSelClear": this.sel = {}; this.msg = null; this.showDismantle(); return true;
      case "shopDisSel": this.dismantle(this.sel); return true;
      case "shopDisAll": this.dismantle(null); return true;
      case "shopDisSelAsk": case "shopDisAllAsk": {
        const all = act === "shopDisAllAsk", sur = this.surplus();
        const list = sur.map(x => ({ c: x.c, k: all ? x.n : Math.min(x.n, this.sel[x.c.id] || 0) })).filter(x => x.k > 0);
        if (!list.length) return true;
        this.ask = { all, list, n: list.reduce((a, x) => a + x.k, 0), s: list.reduce((a, x) => a + x.k * this.getRate(x.c.rarity), 0) };
        this.showDismantle(); return true;
      }
      case "shopAskNo": this.ask = null; this.showDismantle(); return true;
      case "shopAskYes": { const a = this.ask; this.ask = null; if (a) this.dismantle(a.all ? null : this.sel); return true; }
      case "shopTicket": this.hubAsk = "ticket"; this.show(); return true;
      case "shopSlot": this.hubAsk = "slot"; this.show(); return true;
      case "shopHubNo": this.hubAsk = null; this.show(); return true;
      case "shopHubYes": { const k = this.hubAsk; this.hubAsk = null; if (k === "slot") this.buySlot(); else if (k === "ticket") this.buyTicket(); else this.show(); return true; }
      case "shopRar": this.rar = el.dataset.v; this.showTrade(); return true;
      case "shopNeed": this.onlyNeed = !!el.checked; this.showTrade(); return true;
      case "shopDetail": this.detailId = el.dataset.id; this.showTrade(); return true;
      case "shopDetailClose": this.detailId = null; if (this.view === "hub") this.show(); else this.showTrade(); return true;
      case "shopBuy": this.buy(el.dataset.id); return true;
      case "tradeAsk": this.tradeAsk = el.dataset.id; this.tradeRedraw(); return true;
      case "tradeNo": this.tradeAsk = null; this.tradeRedraw(); return true;
      case "tradeYes": this.trade(el.dataset.id); return true;
    }
    return false;
  }
};
