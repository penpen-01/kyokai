/* =========================================================
   ショップ（魔石）
   ・上限（COPY_MAX）を超えて持っているカードを分解して「魔石」にする
   ・魔石で、好きなカード1枚かパック券と交換する
   ・Gではカードを直接買えない（パックを開ける意味を残すため）
   ・未所持のカードは、一覧では手札の「使えないカード」と同じ色あせで見せる（絵は隠さない。買う前に見られるように）
   ・レートはすべて CONFIG（カード工房の「報酬・CPU・シーズン」）で変えられる
   ========================================================= */

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
    PACKS.filter(p => p.open).forEach(p => Packs.pool(p).forEach(c => { if (!seen.has(c.id)) { seen.add(c.id); out.push(c); } }));
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
  noteHTML() {
    return this.usable() ? (Account.status === "offline" ? `<p class="datainfo">オフラインです。交換した内容は、通信できるようになったら保存されます。</p>` : "")
      : Account.status === "free" ? `<p class="onl-msg">試遊モードではショップを使えません（すべてのカードを使えます）。</p>`
      : `<p class="onl-msg">アカウントを読み込めていません。通信状態を確認して、開き直してください。</p>`;
  },

  /* ショップの入口：カードとの交換が主役。分解とパック券は上の2つのボタンから */
  show(msg) {
    this.view = "main";
    this.msg = msg === undefined ? this.msg : msg;
    const sur = this.surplus();
    const surN = sur.reduce((a, x) => a + x.n, 0), surS = sur.reduce((a, x) => a + x.stones, 0);
    const cap = this.cap(), tc = this.ticketCost();
    const list = this.pool().filter(c => (this.rar === "all" || c.rarity === this.rar) && (!this.onlyNeed || Account.owned(c.id) < cap));
    openOverlay(`<div class="panel wide shop">
      <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>ショップ</b><span class="stonetag">魔石 ${Account.stones}</span></div>
      ${this.noteHTML()}
      ${this.msg ? `<p class="shopmsg" role="status">${esc(this.msg)}</p>` : ""}
      <div class="shopacts">
        <button type="button" class="shopact" data-act="shopDis" ${this.usable() ? "" : "disabled"}>
          <b>分解する</b><small>${surN ? `ダブり${surN}枚 ・ 最大 +${surS}` : "ダブりはありません"}</small><span class="go" aria-hidden="true">›</span></button>
        <button type="button" class="shopact" data-act="shopTicket" ${this.usable() && Account.stones >= tc ? "" : "disabled"}>
          <b>パック券と交換</b><small>魔石${tc} ・ 所持${Account.tickets}枚</small></button>
      </div>
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
            ${cardHTML(c, { static: true, cls: own <= 0 ? "dim" : "" })}<span class="dbadge ${Account.stones >= cost && own < cap ? "in" : ""}">${cost}</span></button>`;
        }).join("") : `<p class="hint">条件に合うカードはありません。</p>`}</div>
        <p class="hint">パック券1枚で、どのパックでもGを使わずに1パック開けられます（パックの画面で使います）。</p>
      </section>
      <button type="button" class="btn" data-act="back">戻る</button>
      ${this.detailHTML()}
    </div>`, "start", true);
  },

  /* 分解の画面：カードごとに枚数を選んで分解、またはまとめて分解 */
  showDismantle(msg) {
    this.view = "dis";
    if (msg !== undefined) this.msg = msg;
    const sur = this.surplus(), cap = this.cap();
    this.sel = Object.fromEntries(Object.entries(this.sel || {}).filter(([id, k]) => k > 0 && sur.some(x => x.c.id === id)));
    const allN = sur.reduce((a, x) => a + x.n, 0), allS = sur.reduce((a, x) => a + x.stones, 0);
    const pick = x => Math.min(x.n, this.sel[x.c.id] || 0);
    const selN = sur.reduce((a, x) => a + pick(x), 0), selS = sur.reduce((a, x) => a + pick(x) * this.getRate(x.c.rarity), 0);
    openOverlay(`<div class="panel wide shop">
      <div class="topbar"><button type="button" class="btn sm" data-act="shopMain">← ショップ</button><b>分解</b><span class="stonetag">魔石 ${Account.stones}</span></div>
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
  },

  detailHTML() {
    const c = this.detailId && DEF[this.detailId];
    if (!c) return "";
    const own = Account.owned(c.id), cost = this.costRate(c.rarity), cap = this.cap();
    const ok = this.usable() && own < cap && Account.stones >= cost;
    const label = own >= cap ? `${cap}枚持っています` : Account.stones < cost ? `魔石が足りません（あと${cost - Account.stones}）` : `魔石${cost}で交換する`;
    return `<div class="dmodal" data-act="shopDetailClose">
      <div class="dmodal-in" role="dialog" aria-label="${esc(c.name)}" data-act="noop">
        <div class="dmodal-card">${cardHTML(c, { static: true })}</div>
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
      case "shopMain": this.msg = null; this.show(); return true;
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
