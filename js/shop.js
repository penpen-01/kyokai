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
  // 準備中の売り場（絵付きで「準備中」として並べる）
  { id: "info", ready: true },
  { id: "skin", ready: true },
  { id: "limited", ready: false, ic: "star", name: "限定カード", sub: "いまだけ・ここだけのカード" }
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
  /* 両替：魔石 → G（rate 個で 1G。損をする交換にして、パック→分解→両替でGが増え続けないようにする） */
  exch: null,
  rate() { return Math.max(1, Math.floor(CONFIG.STONE_PER_GOLD || 3)); },
  exchHTML() {
    const e = this.exch; if (!e) return "";
    const r = this.rate(), max = Math.floor(Account.stones / r), g = Math.max(0, Math.min(max, e.g || 0));
    return `<div class="dmodal" data-act="exchClose"><div class="dmodal-in confirmbox" role="dialog" aria-label="両替" data-act="noop">
      <b class="dm-name">魔石を G に両替</b>
      <p class="dm-text">魔石${r}個で 1G になります。G を魔石に戻すことはできません。</p>
      <div class="exch-now"><span>${curIcon("stone")}<b>${(g * r).toLocaleString()}</b></span><i>→</i><span>${curIcon("gold")}<b>${g.toLocaleString()}G</b></span></div>
      <div class="exch-btns">${[-100, -10, 10, 100, 1000].map(v => `<button type="button" class="btn sm" data-act="exchAdd" data-v="${v}">${v > 0 ? "+" : ""}${v}G</button>`).join("")}<button type="button" class="btn sm" data-act="exchAdd" data-v="max">最大（${max.toLocaleString()}G）</button></div>
      <p class="hint">所持 魔石 ${Account.stones.toLocaleString()} → ${(Account.stones - g * r).toLocaleString()} ・ G ${Account.gold.toLocaleString()} → ${(Account.gold + g).toLocaleString()}</p>
      <div class="pre-btns"><button type="button" class="btn primary" data-act="exchYes" ${g > 0 && this.usable() ? "" : "disabled"}>両替する</button><button type="button" class="btn" data-act="exchClose">やめる</button></div>
    </div></div>`;
  },
  exchange() {
    const e = this.exch; if (!e || !this.usable()) return;
    const r = this.rate(), g = Math.max(0, Math.min(Math.floor(Account.stones / r), e.g || 0));
    if (!g) return;
    Account.data.stones -= g * r; Account.data.gold = (Account.data.gold || 0) + g; Titles.bump("stoneUse", g * r);
    Account.saveNow(); Sound.play("click");
    this.exch = null; Keeper.react("buy", "happy");
    this.show(`魔石${(g * r).toLocaleString()}個を、${g.toLocaleString()}G に両替しました。`);
  },
  /* そのカードの交換に要る魔石（今日のおすすめは割引） */
  offPct() { return Math.max(0, Math.min(90, CONFIG.SHOP_FEATURE_OFF ?? 20)); },
  costOf(c) { const base = this.costRate(c.rarity), f = this.feature(); return f && f.id === c.id && this.offPct() ? Math.ceil(base * (100 - this.offPct()) / 100) : base; },
  ticketCost() { return Math.max(0, CONFIG.STONE_TICKET || 0); },
  cap() { return CONFIG.COPY_MAX || 3; },
  /* 交換できるカードを全部、上限まで持っている */
  complete() { const cap = this.cap(), p = this.pool(); return p.length > 0 && p.every(c => Account.owned(c.id) >= cap); },

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
    Titles.bump("dis", n);
    Account.data.stones = Account.stones + s;
    Account.saveNow();
    Sound.play("flip");
    this.sel = {};
    Keeper.react("dis", "happy");
    this.showDismantle(`${n}枚を分解して、魔石を${s}個手に入れました（所持 ${Account.stones}）。`);
  },

  buyTicket() {
    if (!this.usable()) return;
    const cost = this.ticketCost();
    if (Account.stones < cost) { Keeper.react("poor", "trouble"); return this.show(`魔石が足りません（あと${cost - Account.stones}個）。`); }
    Account.data.stones -= cost;
    Keeper.react("buy", "happy");
    Account.data.tickets = Account.tickets + 1; Titles.bump("stoneUse", cost);
    Account.saveNow();
    Sound.play("click");
    this.show(`パック券を1枚手に入れました（所持${Account.tickets}枚）。パックの画面で使えます。`);
  },

  /* デッキ枠を1つ増やす（マイデッキ・限定構築の上限がそれぞれ1つ増える） */
  buySlot() {
    if (!this.usable()) return;
    const cost = CONFIG.DECK_SLOT_COST ?? 1500;
    if (Account.deckSlots >= (CONFIG.DECK_SLOT_MAX ?? 10)) return this.show("デッキ枠はもう増やせません。");
    if (Account.stones < cost) { Keeper.react("poor", "trouble"); return this.show(`魔石が足りません（あと${cost - Account.stones}個）。`); }
    Account.data.stones -= cost;
    Keeper.react("buy", "happy");
    Account.data.deckSlots = Account.deckSlots + 1; Titles.bump("stoneUse", cost);
    Account.saveNow();
    Sound.play("click");
    this.show(`デッキ枠が1つ増えました（マイデッキ・限定構築とも ${Decks.max("mine")}個まで）。`);
  },
  buy(id) {
    const c = DEF[id];
    if (!this.usable() || !c) return;
    const cost = this.costOf(c);
    if (Account.owned(id) >= this.cap()) return this.showTrade(`${c.name}はもう${this.cap()}枚持っています。`);
    if (Account.stones < cost) { Keeper.react("poor", "trouble"); return this.showTrade(`魔石が足りません（あと${cost - Account.stones}個）。`); }
    Keeper.react("buy", "happy");
    Account.data.stones -= cost;
    Account.data.cards[id] = (Account.data.cards[id] || 0) + 1;
    if (typeof Quest !== "undefined") Quest.add("trade", 1);
    Titles.bump("trade"); Titles.bump("stoneUse", cost);
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
    const own = Account.owned(c.id), cost = this.costOf(c), cap = this.cap();
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
    const cost = this.costOf(c);
    if (Account.owned(id) >= this.cap()) toast(`${c.name}はもう${this.cap()}枚持っています`);
    else if (Account.stones < cost) toast(`魔石が足りません（あと${cost - Account.stones}個）`);
    else {
      Account.data.stones -= cost;
      Account.data.cards[id] = (Account.data.cards[id] || 0) + 1;
      if (typeof Quest !== "undefined") Quest.add("trade", 1);
      Titles.bump("trade"); Titles.bump("stoneUse", cost);
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
  /* 今日のおすすめ（after＝何日後か。情報屋の「明日のおすすめ」は 1） */
  feature(after = 0) {
    const cap = this.cap(), pool = this.pool();
    const pick = rs => pool.filter(c => rs.includes(c.rarity) && Account.owned(c.id) < cap);
    const list = pick(["legend", "ur"]).length ? pick(["legend", "ur"]) : pick(["sr", "ur", "legend"]);
    if (!list.length) return null;
    const day = localDate(new Date(Date.now() + after * 864e5)); let h = 0; for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
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
      ${Keeper.stageHTML()}
      <div class="sh-cats">
        <button type="button" class="sh-cat art wide c-trade" data-act="shopTrade" ${use ? "" : "disabled"}>
          <span class="sh-art" style="background-image:url('ui/shop-trade.webp')" aria-hidden="true"></span><b>カードと交換</b><small>好きなカードを魔石で1枚ずつ</small><span class="go" aria-hidden="true">›</span></button>
        <button type="button" class="sh-cat art c-dis" data-act="shopDis" ${use ? "" : "disabled"}>
          <span class="sh-art" style="background-image:url('ui/shop-dis.webp')" aria-hidden="true"></span><b>分解</b><small>${surN ? `ダブり${surN}枚 ・ 最大+${surS}` : "ダブりはありません"}</small>${surN ? `<i class="sh-badge">${surN}</i>` : ""}</button>
        <div class="sh-cat art c-ticket">
          <span class="sh-art" style="background-image:url('ui/shop-ticket.webp')" aria-hidden="true"></span><b>パック券</b><small>魔石${tc}で1枚 ・ 所持${Account.tickets}枚</small>
          <button type="button" class="btn sm primary" data-act="shopTicket" ${use && Account.stones >= tc ? "" : "disabled"}>交換する</button></div>
        <div class="sh-cat art c-slot">
          <span class="sh-art" style="background-image:url('ui/shop-slot.webp')" aria-hidden="true"></span><b>デッキ枠</b><small>${slotLeft > 0 ? `魔石${slotCost}で1つ増やす ・ 今${Decks.max("mine")}個` : `もう増やせません（${Decks.max("mine")}個）`}</small>
          <button type="button" class="btn sm primary" data-act="shopSlot" ${use && slotLeft > 0 && Account.stones >= slotCost ? "" : "disabled"}>増やす</button></div>
        <button type="button" class="sh-cat art c-exch" data-act="exchOpen" ${use ? "" : "disabled"}><span class="sh-art exch-art" aria-hidden="true"><img src="ui/cur-stone.webp" alt=""><i>→</i><img src="ui/cur-gold.webp" alt=""></span><b>両替</b><small>魔石${this.rate()}個で1G</small></button>
        <button type="button" class="sh-cat art c-info" data-act="shopInfo" ${use ? "" : "disabled"}><span class="sh-art" style="background-image:url('ui/shop-info.webp')" aria-hidden="true"></span><b>情報屋</b><small>攻略の情報や、ボス戦の品をGで</small></button>
        ${CONFIG.SKIN_ON || adminOn() ? `<button type="button" class="sh-cat art c-skin" data-act="shopSkins" ${use ? "" : "disabled"}><span class="sh-art" style="background-image:url('ui/shop-skin.webp')" aria-hidden="true"></span><b>スキン</b><small>スリーブ・背景・店員などの見た目を魔石で</small>${CONFIG.SKIN_ON ? "" : `<i class="sh-soon">運営のみ</i>`}</button>`
          : `<div class="sh-cat art soon"><span class="sh-art" style="background-image:url('ui/shop-skin.webp')" aria-hidden="true"></span><b>スキン</b><small>店員やカードの見た目を変える</small><i class="sh-soon">準備中</i></div>`}
        ${fut.map(x => `<div class="sh-cat art soon"><span class="sh-art" style="background-image:url('ui/shop-${x.id}.webp')" aria-hidden="true"></span><b>${esc(x.name)}</b><small>${esc(x.sub)}</small><i class="sh-soon">準備中</i></div>`).join("")}
      </div>
      <p class="hint sh-foot">魔石は、ダブったカードの分解とログインボーナスで手に入ります。パック券1枚で、どのパックでも1パック開けられます（パックの画面で使います）。</p>
      ${this.detailHTML()}
      ${this.hubAskHTML(tc, slotCost)}
      ${this.exchHTML()}
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
      ${Keeper.miniHTML()}
      ${this.msg ? `<p class="shopmsg" role="status">${esc(this.msg)}</p>` : ""}
      <section class="shopsec">
        <p class="rates">${RARITY_ORDER.map(r => `<span><i class="rtag r-${r}">${RARITY_SHORT[r]}</i>${this.costRate(r)}</span>`).join("")}</p>
        <div class="shopfilter">
          ${["all", ...RARITY_ORDER].map(r => `<button type="button" class="chip ${this.rar === r ? "on" : ""}" data-act="shopRar" data-v="${r}">${r === "all" ? "すべて" : RARITY_SHORT[r]}</button>`).join("")}
          <label class="shopneed"><input type="checkbox" data-act="shopNeed" ${this.onlyNeed ? "checked" : ""}> ${cap}枚持っているカードを隠す</label>
        </div>
        <div class="dgrid">${list.length ? list.map(c => {
          const own = Account.owned(c.id), cost = this.costOf(c);
          return `<button type="button" class="dtile ${own >= cap ? "unowned" : ""}" data-act="shopDetail" data-id="${esc(c.id)}" aria-label="${esc(c.name)}">
            ${cardHTML(c, { static: true, cls: own <= 0 ? "dim" : "" })}<span class="dbadge ${Account.stones >= cost && own < cap ? "in" : ""}">${cost}</span>${cost < this.costRate(c.rarity) ? `<span class="offb">${this.offPct()}%引き</span>` : ""}</button>`;
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
      ${Keeper.miniHTML()}
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
    const own = Account.owned(c.id), cost = this.costOf(c), cap = this.cap();
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
      case "kpTap": Keeper.tap(); return true;
      case "exchOpen": this.exch = { g: Math.min(100, Math.floor(Account.stones / this.rate())) }; this.show(); return true;
      case "exchClose": this.exch = null; this.show(); return true;
      case "exchAdd": if (this.exch) { const max = Math.floor(Account.stones / this.rate()); const v = el.dataset.v; this.exch.g = v === "max" ? max : Math.max(0, Math.min(max, this.exch.g + +v)); this.show(); } return true;
      case "exchYes": this.exchange(); return true;
      case "shopInfo": this.infoAsk = null; this.infoRead = null; this.msg = null; this.showInfo(); return true;
      case "infoAsk": this.infoAsk = { kind: el.dataset.kind, id: el.dataset.id }; this.showInfo(); return true;
      case "infoNo": this.infoAsk = null; this.showInfo(); return true;
      case "infoYes": this.infoBuy(); return true;
      case "infoRead": this.infoRead = { id: el.dataset.id }; this.showInfo(); return true;
      case "infoClose": this.infoRead = null; this.showInfo(); return true;
      case "infoGo": this.infoChallenge(el.dataset.v); return true;
      case "kpNext": Keeper.next(); return true;
      case "shop": Keeper.enter(); this.msg = null; this.detailId = null; this.hubAsk = null; this.show(); return true;
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

/* ---------- ショップの店員 ----------
   背景の上に店員の絵を重ね、まばたき・口パク・表情で動かす。セリフは工房の「ショップの店員」（KEEPERS）から。
   絵は ui/keeper/<店員のid>-<表情>.webp（idle まばたき前の顔 / blink / talk1 / talk2 / happy / trouble / offer） */
const KEEPER_FRAMES = ["idle", "blink", "talk1", "talk2", "happy", "trouble", "offer"];
const KEEPER_ART = ["dorgan", "weiss"];   // 絵がそろっている店員
const KEEPER_RICH = 5000;        // これ以上魔石を持っていると「魔石が多い」のあいさつが出ることがある
const Keeper = {
  q: [], text: "", extra: "", shown: "", mood: null, moodUntil: 0, talking: false, timers: [], cache: {},
  cur() {
    const L = (typeof KEEPERS !== "undefined" ? KEEPERS : []).filter(k => KEEPER_ART.includes(k.id) || (k.art && k.art.idle));
    const want = Account.data && Account.data.keeper;
    return L.find(k => k.id === want) || L[0] || null;
  },
  src(k, f) { return (k.art && k.art[f]) || `ui/keeper/${k.id}-${f}.webp`; },
  preload(k) { if (this.cache[k.id]) return; this.cache[k.id] = KEEPER_FRAMES.map(f => { const im = new Image(); im.src = this.src(k, f); return im; }); },
  /* セリフを1つ選ぶ（{card}・{off} を置き換える） */
  line(scene, vars = {}) {
    const k = this.cur(); const L = (k && k.lines && k.lines[scene]) || [];
    if (!L.length) return "";
    const t = L[Math.floor(Math.random() * L.length)];
    return t.replace(/\{card\}/g, vars.card || "").replace(/\{off\}/g, vars.off ?? "");
  },
  /* 店に入ったとき：あいさつ → 今日のおすすめ */
  enter() {
    const k = this.cur(); if (!k) return;
    const seen = this.seen(k);
    const h = new Date().getHours(), st = Account.stones || 0;
    // はじめての来店だけは必ず自己紹介。ほかは「ふだんのあいさつ」を重さ2、当てはまる特別なあいさつ（朝・夜・魔石が多い）を重さ1ずつで抽選する
    //  例：魔石が多いだけ → ふだん2/3・魔石1/3。朝で魔石も多い → ふだん1/2・朝1/4・魔石1/4（どの人もふだんのあいさつが一番多く出る）
    let scene = "first";
    if (seen) {
      const bag = ["enter", "enter"];
      if (st >= KEEPER_RICH) bag.push("rich");
      if (h >= 5 && h < 11) bag.push("morning");
      if (h >= 22 || h < 5) bag.push("night");
      scene = bag[Math.floor(Math.random() * bag.length)];
    }
    this.q = [{ scene }];
    const f = Shop.feature();
    if (!f && Shop.complete()) this.q.push({ scene: "complete", mood: "happy" });   // 全部集めた人には、おすすめの代わりにひとこと
    if (f && Shop.offPct()) this.q.push({ scene: "feature", mood: "offer", vars: { card: f.name, off: Shop.offPct() }, extra: `<button type="button" class="kp-go" data-act="shopFeature" data-id="${esc(f.id)}">《${esc(f.name)}》を見る ›</button>` });
    this.shown = ""; this.extra = ""; this.typing = false; this.talking = false;
  },
  /* 買い物・分解などの反応（次に描かれた画面で話す） */
  /* 店員ごとに「初めて会った」かどうか。初めてなら覚える（ドルガンは前からの記録も見る） */
  seen(k) {
    const key = "kyokai-shop-seen-" + k.id;
    try {
      const was = localStorage.getItem(key) === "1" || (k.id === "dorgan" && localStorage.getItem("kyokai-shop-seen") === "1");
      localStorage.setItem(key, "1"); return was;
    } catch (e) { return true; }
  },
  /* 買い物などの反応。ただし、その店員に初めて会ったとき（店員を着替えた直後など）は、反応より自己紹介を先に */
  react(scene, mood) {
    const k = this.cur(); if (!k) return;
    this.q = this.seen(k) ? [{ scene, mood }] : [{ scene: "first" }];
    this.shown = ""; this.extra = ""; this.typing = false; this.talking = false;
  },
  tap() {
    if (Date.now() < (this.tapUntil || 0)) return;   // 連打で表情がパタパタ変わらないように、少し間をあける
    this.tapUntil = Date.now() + 900;
    const el = document.querySelector(".kp-man"); if (el) { el.classList.remove("hop"); void el.offsetWidth; el.classList.add("hop"); }
    if (typeof Sound !== "undefined") Sound.play("click");
    this.q = [{ scene: "tap" }]; this.next(true);
  },
  /* 吹き出しを押した：書いている途中なら全部出す。書き終わっていたら次のセリフへ */
  next(force) {
    if (!force && this.typing) { this.finishTyping(); return; }
    const it = this.q.shift(); if (!it) return;
    const t = this.line(it.scene, it.vars); if (!t) return this.next(true);
    this.say(t, it.mood, it.extra || "");
  },
  say(t, mood, extra) {
    this.text = t; this.extra = extra; this.shown = ""; this.typing = true; this.talking = true;
    if (mood) { this.mood = mood; this.moodUntil = Date.now() + Math.max(1800, t.length * 45 + 1400); } else this.mood = null;
    this.paintText();
  },
  finishTyping() { this.shown = this.text; this.typing = false; this.talking = false; this.paintText(); },
  paintText() {
    document.querySelectorAll(".kp-text").forEach(el => { el.textContent = this.shown; });
    document.querySelectorAll(".kp-extra").forEach(el => { el.innerHTML = !this.typing ? this.extra : ""; });
  },
  stageHTML() {
    const k = this.cur(); if (!k) return "";
    this.preload(k); setTimeout(() => this.mount(), 0);
    return `<div class="kp-stage">
      <button type="button" class="kp-man" data-act="kpTap" aria-label="${esc(k.name)}に話しかける"><img class="kp-img" src="${esc(this.src(k, "idle"))}" alt="" draggable="false"></button>
      <div class="kp-bubble" data-act="kpNext" role="status" aria-live="polite"><b class="kp-name">${esc(k.name)}${k.title ? `<small>${esc(k.title)}</small>` : ""}</b><span class="kp-text">${esc(this.shown)}</span><span class="kp-extra">${this.typing ? "" : this.extra}</span><i class="kp-more" aria-hidden="true"></i></div>
    </div>`;
  },
  /* 交換・分解の画面：話すことがあるときだけ、小さく顔と吹き出しを出す */
  miniHTML() {
    const k = this.cur(); if (!k || (!this.q.length && !this.shown)) return "";
    this.preload(k); setTimeout(() => this.mount(), 0);
    return `<div class="kp-mini"><button type="button" class="kp-man" data-act="kpTap" aria-label="${esc(k.name)}に話しかける"><img class="kp-img" src="${esc(this.src(k, "idle"))}" alt="" draggable="false"></button>
      <div class="kp-bubble" data-act="kpNext" role="status" aria-live="polite"><span class="kp-text">${esc(this.shown)}</span><span class="kp-extra"></span></div></div>`;
  },
  /* 描かれた画面で動かし始める（画面が描き直されると止まる） */
  mount() {
    const img = document.querySelector(".kp-img"); if (!img) return;
    this.timers.forEach(clearInterval); this.timers = [];
    const k = this.cur();
    if (this.q.length && !this.typing) this.next(true); else this.paintText();
    let blinkAt = Date.now() + 1500 + Math.random() * 3000, blinkTo = 0, tick = 0;
    const loop = setInterval(() => {
      if (!img.isConnected) { clearInterval(loop); clearInterval(typer); return; }
      const now = Date.now(); tick++;
      if (this.mood && now > this.moodUntil) this.mood = null;
      let f = "idle";
      if (this.mood) f = this.mood;
      else if (this.talking) f = ["talk1", "idle", "talk2", "idle"][Math.floor(tick / 3) % 4];   // 口だけ、約0.27秒ごとにゆっくり動かす
      else {
        if (now > blinkAt) { blinkTo = now + 130; blinkAt = now + 2200 + Math.random() * 3800; }
        if (now < blinkTo) f = "blink";
      }
      const want = this.src(k, f); if (img.getAttribute("src") !== want) img.setAttribute("src", want);
    }, 90);
    const typer = setInterval(() => {
      if (!img.isConnected) return;
      if (!this.typing) return;
      this.shown = this.text.slice(0, this.shown.length + 1);
      document.querySelectorAll(".kp-text").forEach(el => { el.textContent = this.shown; });
      if (this.shown.length >= this.text.length) {
        this.typing = false; this.talking = false; this.paintText();
        if (this.q.length) setTimeout(() => { if (!this.typing && img.isConnected) this.next(true); }, 1800);
      }
    }, 40);
    this.timers.push(loop, typer);
  }
};

/* ---------- 情報屋 ----------
   攻略の情報（買ってから INFO_HOURS 時間読める）、今の状態（買ったその時だけ）、ボス戦の品（弱体の御札・挑戦状） */
Object.assign(Shop, {
  infoAsk: null, infoRead: null,
  // 「超級のみ」の情報は、超級のボスを公開している間だけ。超級の「今の状態」は、超級を開放した人にだけ
  infoList() { const exo = typeof exOpen !== "function" || exOpen(); return (typeof INFO !== "undefined" ? INFO : []).filter(x => !x.ex || (bossExOn() && (x.cat !== "peek" || exo))); },
  canRead(id) { const t = Account.data && Account.data.infoBuy && Account.data.infoBuy[id]; return t && t > Date.now() ? t : 0; },
  weekKey() { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return localDate(d); },   // その週の月曜日
  weekBought(lv) { const w = Account.data && Account.data.btkWeek; return w && w.w === this.weekKey() ? (w[lv] || 0) : 0; },
  /* ボス戦の品：lv＝hard / ex、kind＝charm（御札）/ bchal（挑戦状） */
  goods() {
    const ex = bossExOn() && (typeof exOpen !== "function" || exOpen());
    return [["hard", "上級", "ネザル"], ...(ex ? [["ex", "超級", "黄泉丸"]] : [])].flatMap(([lv, L, who]) => [
      { kind: "charm", lv, id: "charm-" + lv, title: `弱体の御札（${L}）`, sub: `次の${L}のボス戦だけ、${who}の体力が${CONFIG.CHARM_HP || 20}になる`, price: CONFIG["CHARM_" + lv.toUpperCase()] || 0 },
      { kind: "bchal", lv, id: "bchal-" + lv, title: `挑戦状（${L}）`, sub: `今すぐ${who}と戦える。勝てばふだんどおりの報酬（1週間に${CONFIG.BCHAL_WEEK ?? 3}枚まで）`, price: CONFIG["BCHAL_" + lv.toUpperCase()] || 0 }]);
  },
  /* 本文の {BOSS_RATE} などを設定の数字に置き換える */
  infoText(t) { return String(t || "").replace(/\{([A-Z_]+)\}/g, (m, k) => CONFIG[k] != null ? String(CONFIG[k]) : m); },
  peekText(x) {
    if (x.peek === "tomorrow") {
      const f = this.feature(1);
      return f ? `明日の交換所のおすすめは《${f.name}》（${RARITY[f.rarity]}）。\n交換に必要な魔石が、${this.costRate(f.rarity)}から${Math.ceil(this.costRate(f.rarity) * (100 - this.offPct()) / 100)}になる。\n\n※今日の持ち物で選んだ結果です。今日このカードを${this.cap()}枚そろえると、明日のおすすめは別のカードに変わります。`
        : "明日のおすすめはありません（交換所のカードを、もう全部そろえています）。";
    }
    const lv = x.peek === "pityEx" ? "ex" : "hard", B = BOSSES[lv], L = lv === "ex" ? "超級" : "上級";
    if (Account.data[B.next]) return `次の${L}の戦いで、${B.name}が必ず現れる。\n準備を整えてから挑むといい。`;
    const pity = Account.data[B.pity] || 0, max = CONFIG[B.cfg + "PITY"] || 20, left = Math.max(1, max - pity);
    return `${B.name}は、${L}であと最大${left}回勝てば必ず現れる（今は${pity}回）。\nそれより前でも、${L}に勝つたびに${CONFIG[B.cfg + "RATE"] || 0}%の確率で現れることがある。`;
  },
  infoBuy() {
    const a = this.infoAsk; this.infoAsk = null;
    if (!a || !this.usable()) return this.showInfo();
    if (a.kind === "info") {
      const x = this.infoList().find(i => i.id === a.id); if (!x) return this.showInfo();
      if (Account.gold < x.price) return this.showInfo(`G が足りません（あと${x.price - Account.gold}G）。`);
      Account.data.gold -= x.price; Titles.bump("info");
      if (x.cat === "peek") { this.infoRead = { id: x.id, peek: this.peekText(x) }; }
      else { Account.data.infoBuy = Account.data.infoBuy || {}; Account.data.infoBuy[x.id] = Date.now() + (CONFIG.INFO_HOURS || 24) * 3600e3; this.infoRead = { id: x.id }; }
      Account.saveNow(); Sound.play("click");
      return this.showInfo(`「${x.title}」を買いました。`);
    }
    const g = this.goods().find(x => x.id === a.id); if (!g) return this.showInfo();
    if (Account.gold < g.price) return this.showInfo(`G が足りません（あと${g.price - Account.gold}G）。`);
    if (g.kind === "charm") {
      if (Account.data.charm && Account.data.charm[g.lv]) return this.showInfo("その御札は、もう持っています（次のボス戦で使われます）。");
      Account.data.charm = { ...(Account.data.charm || {}), [g.lv]: true };
    } else {
      const max = CONFIG.BCHAL_WEEK ?? 3, wk = this.weekKey();
      if (this.weekBought(g.lv) >= max) return this.showInfo(`今週はもう${max}枚買いました（月曜日にまた買えます）。`);
      const w = Account.data.btkWeek && Account.data.btkWeek.w === wk ? Account.data.btkWeek : { w: wk, hard: 0, ex: 0 };
      w[g.lv] = (w[g.lv] || 0) + 1; Account.data.btkWeek = w;
      Account.data.btk = { hard: 0, ex: 0, ...(Account.data.btk || {}) }; Account.data.btk[g.lv]++;
    }
    Account.data.gold -= g.price; Titles.bump("info");
    Account.saveNow(); Sound.play("click");
    this.showInfo(`「${g.title}」を買いました。`);
  },
  /* 挑戦状で、今すぐボスと戦う */
  infoChallenge(lv) {
    const B = BOSSES[lv]; if (!B || !this.usable()) return;
    if (!(Account.data.btk && Account.data.btk[lv] > 0)) return this.showInfo("挑戦状を持っていません。");
    const mine = Decks.readyDeck(msg => Decks.showList(msg)); if (!mine) return;
    if (mine.sample) return this.showInfo("サンプルデッキでは、ボスに挑めません。自分のデッキを選んでください。");
    Account.data.btk[lv]--; Account.saveNow();
    CPU_LEVEL = lv === "ex" ? "ex" : "hard";
    $("#overlay").hidden = true;
    startBossGame(mine, lv, false, true);
  },
  showInfo(msg) {
    this.view = "info";
    if (msg !== undefined) this.msg = msg;
    const g = Account.gold || 0, list = this.infoList();
    const row = (x, right) => `<li class="inf-row"><span class="inf-main"><b>${esc(x.title)}</b><small>${esc(x.sub || "")}</small></span><span class="inf-acts">${right}</span></li>`;
    const buyBtn = (kind, x, label) => `<button type="button" class="btn sm ${g >= x.price ? "primary" : ""}" data-act="infoAsk" data-kind="${kind}" data-id="${esc(x.id)}" ${this.usable() && g >= x.price ? "" : "disabled"}>${label || `${x.price.toLocaleString()}G`}</button>`;
    const goods = this.goods().map(x => {
      if (x.kind === "charm") { const on = Account.data.charm && Account.data.charm[x.lv]; return row(x, on ? `<span class="inf-on">次のボス戦で使います</span>` : buyBtn("goods", x)); }
      const have = (Account.data.btk && Account.data.btk[x.lv]) || 0, left = Math.max(0, (CONFIG.BCHAL_WEEK ?? 3) - this.weekBought(x.lv));
      return row({ ...x, sub: `${x.sub} ・ 所持${have}枚 ・ 今週あと${left}枚` }, `${have ? `<button type="button" class="btn sm primary" data-act="infoGo" data-v="${x.lv}">挑む</button>` : ""}${left ? buyBtn("goods", x) : `<span class="inf-on">今週は売り切れ</span>`}`);
    }).join("");
    const cats = Object.entries(INFO_CATS).map(([k, label]) => {
      const L = list.filter(x => x.cat === k); if (!L.length) return "";
      return `<section class="inf-sec"><h3>${esc(label)}</h3><ul class="inf-list">${L.map(x => {
        const t = x.cat !== "peek" && this.canRead(x.id);
        return row(x, t ? `<button type="button" class="btn sm" data-act="infoRead" data-id="${esc(x.id)}">読む<small>あと${Math.max(1, Math.ceil((t - Date.now()) / 3600e3))}時間</small></button>` : buyBtn("info", x));
      }).join("")}</ul></section>`;
    }).join("");
    const a = this.infoAsk, ax = a && (a.kind === "info" ? list.find(x => x.id === a.id) : this.goods().find(x => x.id === a.id));
    const rd = this.infoRead, rx = rd && list.find(x => x.id === rd.id);
    openOverlay(`<div class="panel wide shop">
      <div class="topbar"><button type="button" class="btn sm" data-act="shopMain">← ショップ</button><b>情報屋</b>${goldTag(g)}</div>
      ${this.noteHTML()}
      ${this.msg ? `<p class="shopmsg" role="status">${esc(this.msg)}</p>` : ""}
      <p class="hint">攻略の情報は、買ってから${CONFIG.INFO_HOURS || 24}時間読めます。「今の状態」は、買ったその時だけ見られます。</p>
      <section class="inf-sec"><h3>ボス戦の品</h3><ul class="inf-list">${goods}</ul></section>
      ${cats}
      ${ax ? `<div class="dmodal" data-act="infoNo"><div class="dmodal-in confirmbox" role="alertdialog" aria-label="買う前の確認" data-act="noop">
          <b class="dm-name">「${esc(ax.title)}」を買いますか？</b>
          <p class="dm-text">${ax.price.toLocaleString()}G を使います（所持 ${g.toLocaleString()}G → ${(g - ax.price).toLocaleString()}G）。${a.kind === "info" ? (ax.cat === "peek" ? "買ったその時だけ見られます。" : `買ってから${CONFIG.INFO_HOURS || 24}時間読めます。`) : ""}</p>
          <div class="pre-btns"><button type="button" class="btn primary" data-act="infoYes">買う</button><button type="button" class="btn" data-act="infoNo">やめる</button></div>
        </div></div>` : ""}
      ${rx ? `<div class="dmodal" data-act="infoClose"><div class="dmodal-in inf-read" role="dialog" aria-label="${esc(rx.title)}" data-act="noop">
          <b class="dm-name">${esc(rx.title)}</b>
          <p class="inf-body">${esc(rd.peek || this.infoText(rx.body))}</p>
          ${rd.peek ? `<p class="hint">この画面を閉じると、もう一度は見られません。</p>` : ""}
          <button type="button" class="btn" data-act="infoClose">閉じる</button>
        </div></div>` : ""}
    </div>`, "start", true);
  }
});
