/* =========================================================
   ショップ（魔石）
   ・上限（COPY_MAX）を超えて持っているカードを分解して「魔石」にする
   ・魔石で、好きなカード1枚かパック券と交換する
   ・Gではカードを直接買えない（パックを開ける意味を残すため）
   ・レートはすべて CONFIG（カード工房の「報酬・CPU・シーズン」）で変えられる
   ========================================================= */

const STONE_KEY = { common: "COMMON", rare: "RARE", sr: "SR", ur: "UR", legend: "LEGEND" };

const Shop = {
  rar: "all",      // 交換一覧の絞り込み（レア度）
  onlyNeed: true,  // 上限まで持っていないカードだけ出す
  detailId: null,
  msg: null,

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
    PACKS.filter(p => p.open).forEach(p => Packs.pool(p).forEach(c => { if (!seen.has(c.id)) { seen.add(c.id); out.push(c); } }));
    return out.sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.cost - b.cost);
  },

  /* ---------- 操作 ---------- */
  dismantle() {
    if (!this.usable()) return;
    const list = this.surplus();
    if (!list.length) return this.show("分解できるカードはありません。");
    let n = 0, s = 0;
    list.forEach(x => { Account.data.cards[x.c.id] -= x.n; n += x.n; s += x.stones; });
    Account.data.stones = Account.stones + s;
    Account.saveNow();
    Sound.play("flip");
    this.show(`${n}枚を分解して、魔石を${s}個手に入れました。`);
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

  buy(id) {
    const c = DEF[id];
    if (!this.usable() || !c) return;
    const cost = this.costRate(c.rarity);
    if (Account.owned(id) >= this.cap()) return this.show(`${c.name}はもう${this.cap()}枚持っています。`);
    if (Account.stones < cost) return this.show(`魔石が足りません（あと${cost - Account.stones}個）。`);
    Account.data.stones -= cost;
    Account.data.cards[id] = (Account.data.cards[id] || 0) + 1;
    Account.saveNow();
    Sound.play(RARITY_ORDER.indexOf(c.rarity) >= 2 ? "rare" : "flip", RARITY_ORDER.indexOf(c.rarity));
    this.detailId = null;
    this.show(`${c.name}を手に入れました（所持${Account.owned(id)}枚）。`);
  },

  /* ---------- 画面 ---------- */
  show(msg) {
    this.msg = msg === undefined ? this.msg : msg;
    const note = this.usable() ? (Account.status === "offline" ? `<p class="datainfo">オフラインです。交換した内容は、通信できるようになったら保存されます。</p>` : "")
      : Account.status === "free" ? `<p class="onl-msg">試遊モードではショップを使えません（すべてのカードを使えます）。</p>`
      : `<p class="onl-msg">アカウントを読み込めていません。通信状態を確認して、開き直してください。</p>`;
    const sur = this.surplus();
    const surN = sur.reduce((a, x) => a + x.n, 0), surS = sur.reduce((a, x) => a + x.stones, 0);
    const cap = this.cap();
    const list = this.pool().filter(c => (this.rar === "all" || c.rarity === this.rar) && (!this.onlyNeed || Account.owned(c.id) < cap));
    const tc = this.ticketCost();
    openOverlay(`<div class="panel wide shop">
      <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>ショップ</b><span class="stonetag">魔石 ${Account.stones}</span></div>
      ${note}
      ${this.msg ? `<p class="shopmsg" role="status">${esc(this.msg)}</p>` : ""}

      <section class="shopsec">
        <h3>分解する</h3>
        <p class="hint">同じカードを${cap}枚より多く持っている分を、魔石にできます。デッキに入れられるのは${cap}枚までなので、分解しても遊び方は変わりません。</p>
        <p class="rates">${RARITY_ORDER.map(r => `<span><i class="rtag r-${r}">${RARITY_SHORT[r]}</i>${this.getRate(r)}</span>`).join("")}</p>
        ${sur.length ? `<ul class="olist surlist">${sur.map(x => `<li><span class="rtag r-${x.c.rarity}">${RARITY_SHORT[x.c.rarity]}</span>${esc(x.c.name)} <small>×${x.n}</small><b>+${x.stones}</b></li>`).join("")}</ul>
          <button type="button" class="btn primary" data-act="shopDismantle" ${this.usable() ? "" : "disabled"}>${surN}枚を分解して魔石 +${surS}</button>`
          : `<p class="hint">今は分解できるカードがありません。</p>`}
      </section>

      <section class="shopsec">
        <h3>パック券</h3>
        <p class="hint">パック券1枚で、どのパックでもGを使わずに1パック開けられます。所持 <b>${Account.tickets}枚</b></p>
        <button type="button" class="btn" data-act="shopTicket" ${this.usable() && Account.stones >= tc ? "" : "disabled"}>魔石${tc}でパック券と交換</button>
      </section>

      <section class="shopsec">
        <h3>カードと交換</h3>
        <p class="rates">${RARITY_ORDER.map(r => `<span><i class="rtag r-${r}">${RARITY_SHORT[r]}</i>${this.costRate(r)}</span>`).join("")}</p>
        <div class="shopfilter">
          ${["all", ...RARITY_ORDER].map(r => `<button type="button" class="chip ${this.rar === r ? "on" : ""}" data-act="shopRar" data-v="${r}">${r === "all" ? "すべて" : RARITY_SHORT[r]}</button>`).join("")}
          <label class="shopneed"><input type="checkbox" data-act="shopNeed" ${this.onlyNeed ? "checked" : ""}> ${cap}枚持っているカードを隠す</label>
        </div>
        <div class="dgrid">${list.length ? list.map(c => {
          const own = Account.owned(c.id), cost = this.costRate(c.rarity);
          return `<button type="button" class="dtile ${own >= cap ? "unowned" : ""}" data-act="shopDetail" data-id="${esc(c.id)}" aria-label="${esc(c.name)}">
            ${cardHTML(c, { static: true, hidden: own <= 0 })}<span class="dbadge ${Account.stones >= cost && own < cap ? "in" : ""}">${cost}</span></button>`;
        }).join("") : `<p class="hint">条件に合うカードはありません。</p>`}</div>
      </section>

      <button type="button" class="btn" data-act="back">戻る</button>
      ${this.detailHTML()}
    </div>`, "start", true);
  },

  detailHTML() {
    const c = this.detailId && DEF[this.detailId];
    if (!c) return "";
    const own = Account.owned(c.id), cost = this.costRate(c.rarity), cap = this.cap();
    const ok = this.usable() && own < cap && Account.stones >= cost;
    const label = own >= cap ? `${cap}枚持っています` : Account.stones < cost ? `魔石が足りません（あと${cost - Account.stones}）` : `魔石${cost}で交換する`;
    return `<div class="dmodal" data-act="shopDetailClose">
      <div class="dmodal-in" role="dialog" aria-label="${esc(c.name)}" data-act="noop">
        <div class="dmodal-card">${cardHTML(c, { static: true, hidden: own <= 0 })}</div>
        <div class="dmodal-body">
          <b class="dm-name">${esc(c.name)}</b>
          <span class="pmeta">${RARITY[c.rarity]} ・ ${WORLDS[c.world]} ・ ${TYPES[c.type]} ・ コスト${c.cost}${c.type === "char" ? ` ・ ${c.atk}/${c.hp}` : ""}</span>
          <p class="dm-text">${esc(cardText(c))}</p>
          <span class="pmeta">所持 ${own}枚 ・ 魔石 ${Account.stones}</span>
          <button type="button" class="btn primary" data-act="shopBuy" data-id="${esc(c.id)}" ${ok ? "" : "disabled"}>${label}</button>
          <button type="button" class="btn" data-act="shopDetailClose">閉じる</button>
        </div>
      </div>
    </div>`;
  },

  handleAct(act, el) {
    switch (act) {
      case "shop": this.msg = null; this.detailId = null; this.show(); return true;
      case "shopDismantle": this.dismantle(); return true;
      case "shopTicket": this.buyTicket(); return true;
      case "shopRar": this.rar = el.dataset.v; this.show(); return true;
      case "shopNeed": this.onlyNeed = !!el.checked; this.show(); return true;
      case "shopDetail": this.detailId = el.dataset.id; this.show(); return true;
      case "shopDetailClose": this.detailId = null; this.show(); return true;
      case "shopBuy": this.buy(el.dataset.id); return true;
    }
    return false;
  }
};
