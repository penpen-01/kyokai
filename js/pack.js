/* =========================================================
   パック開封
   ・1パック size 枚（標準5枚）。最後の1枚はレア以上の排出率表（odds.last）で引く
   ・被ったカードもそのまま所持数に加算（ストック）
   ・パックの中身はこの端末で決めるため、詳しい人ならズルはできる（友達同士で遊ぶ前提）
   ========================================================= */

let PACKS = [];
const RARITY_ORDER = ["common", "rare", "sr", "ur", "legend"];

const Packs = {
  last: null, // 直前に開けた結果 { pack, cards: [{id, isNew}] , flipped: [] }

  pool(pack) {
    const ids = pack.cards.length ? pack.cards : CARDS.map(c => c.id);
    return ids.map(id => DEF[id]).filter(c => c && c.limit > 0);
  },

  rollRarity(table) {
    const ent = RARITY_ORDER.map(r => [r, Math.max(0, +table[r] || 0)]);
    const total = ent.reduce((a, [, w]) => a + w, 0);
    let x = Math.random() * (total || 1);
    for (const [r, w] of ent) { if ((x -= w) < 0) return r; }
    return "common";
  },

  rollCard(pack, table) {
    const pool = this.pool(pack);
    let r = this.rollRarity(table);
    // そのレア度のカードが入っていなければ、1つ下のレア度から選ぶ
    for (let i = RARITY_ORDER.indexOf(r); i >= 0; i--) {
      const list = pool.filter(c => c.rarity === RARITY_ORDER[i]);
      if (list.length) return list[Math.floor(Math.random() * list.length)].id;
    }
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
  },

  open(pack) {
    if (Account.status !== "ready" && Account.status !== "offline") return { ok: false, msg: "アカウントを読み込めていないため、パックを開けられません。" };
    if (Account.gold < pack.price) return { ok: false, msg: `Gが足りません（あと${pack.price - Account.gold}G）` };
    const ids = [];
    for (let i = 0; i < pack.size; i++) {
      const id = this.rollCard(pack, i === pack.size - 1 ? pack.odds.last : pack.odds.normal);
      if (id) ids.push(id);
    }
    const before = { ...Account.data.cards };
    const seen = {};
    const cards = ids.map(id => { const isNew = !before[id] && !seen[id]; seen[id] = true; return { id, isNew }; });
    // めくる順番：レア度の低い順（いちばんレアなカードが最後に出る）
    const rank = x => RARITY_ORDER.indexOf(DEF[x.id].rarity);
    cards.sort((a, b) => rank(a) - rank(b));
    Account.data.gold -= pack.price;
    Account.addCards(ids);
    // stage: pack（未開封）→ reveal（1枚ずつ）→ done（一覧）
    this.last = { pack, cards, stage: "pack", idx: 0, faceUp: false };
    this.detailId = null;
    return { ok: true };
  },

  /* ---------- 画面 ---------- */
  showShop(msg) {
    const open = PACKS.filter(p => p.open);
    const acctNote = Account.status === "ready" ? "" : Account.status === "offline" ? `<p class="datainfo">オフラインです。開けたカードは、通信できるようになったら保存されます。</p>`
      : Account.status === "free" ? `<p class="onl-msg">試遊モードではパックを開けません（すべてのカードを使えます）。</p>`
      : `<p class="onl-msg">アカウントを読み込めていません。通信状態を確認して、開き直してください。</p>`;
    openOverlay(`<div class="panel wide">
      <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>パック</b><span class="goldtag">${Account.gold}G</span></div>
      ${acctNote}
      ${msg ? `<p class="onl-msg">${esc(msg)}</p>` : ""}
      <div class="packs">${open.length ? open.map(p => {
        const pool = this.pool(p);
        const cnt = r => pool.filter(c => c.rarity === r).length;
        return `<div class="packcard">
          <div class="packart"><span>${esc(p.name)}</span></div>
          <div class="packbody">
            <b>${esc(p.name)}</b>
            <span class="pmeta">${pool.length}種 ・ 1パック${p.size}枚 ・ 最後の1枚はレア以上</span>
            <span class="pmeta">${RARITY_ORDER.map(r => `${RARITY_SHORT[r]} ${cnt(r)}種`).join(" ／ ")}</span>
            <details class="odds"><summary>排出率</summary>
              <table><tr><th></th>${RARITY_ORDER.map(r => `<th>${RARITY_SHORT[r]}</th>`).join("")}</tr>
                <tr><td>1〜${p.size - 1}枚目</td>${RARITY_ORDER.map(r => `<td>${p.odds.normal[r]}%</td>`).join("")}</tr>
                <tr><td>${p.size}枚目</td>${RARITY_ORDER.map(r => `<td>${p.odds.last[r]}%</td>`).join("")}</tr></table>
            </details>
            <button type="button" class="btn primary" data-act="packOpen" data-id="${esc(p.id)}" ${Account.gold < p.price || !["ready", "offline"].includes(Account.status) ? "disabled" : ""}>${p.price}Gで開ける</button>
          </div>
        </div>`;
      }).join("") : `<p class="hint">今は買えるパックがありません。</p>`}</div>
      <button type="button" class="btn" data-act="back">戻る</button>
    </div>`, "start", true);
  },

  showOpening() {
    const L = this.last; if (!L) return;
    if (L.stage === "pack") return this.showPack();
    if (L.stage === "reveal") return this.showReveal();
    this.showSummary();
  },

  /* 未開封のパック。タップで破る */
  showPack() {
    const L = this.last;
    openOverlay(`<div class="openstage">
      <div class="os-top"><span class="goldtag">${Account.gold}G</span></div>
      <button type="button" class="bigpack" data-act="packTear" aria-label="パックを開ける">
        <span class="bp-tear"></span>
        <span class="bp-body">
          <span class="bp-bands"><i class="w-myth"></i><i class="w-fan"></i><i class="w-mech"></i></span>
          <span class="bp-logo"><small>境界の召喚士</small><b>${esc(L.pack.name)}</b><em>${L.pack.size}枚入り</em></span>
        </span>
      </button>
      <p class="os-hint">タップして開ける</p>
    </div>`, "start", true);
  },

  /* 1枚ずつめくる */
  showReveal(burst) {
    const L = this.last, x = L.cards[L.idx], c = DEF[x.id];
    const r = RARITY_ORDER.indexOf(c.rarity);
    const isLast = L.idx === L.cards.length - 1;
    openOverlay(`<div class="openstage">
      <div class="os-top">
        <span class="os-count">${L.idx + 1} / ${L.cards.length}</span>
        <button type="button" class="btn sm" data-act="packSkip">スキップ</button>
      </div>
      <div class="os-slot r-${c.rarity} ${L.faceUp ? "shown" : ""} ${burst ? "burst" : ""}">
        ${L.faceUp
          ? `<button type="button" class="os-card" data-act="packNext" aria-label="次へ">${cardHTML(c, { static: true })}</button>
             <div class="os-info">
               <span class="rtag r-${c.rarity}">${RARITY[c.rarity]}</span>${x.isNew ? `<span class="newtag">NEW</span>` : ""}
               <b>${esc(c.name)}</b>
             </div>`
          : `<button type="button" class="os-back ${r >= 2 ? "glow" : ""} ${isLast && L.cards.length > 1 ? "last" : ""}" data-act="packFlip" aria-label="めくる">
               <span class="cb-ring"></span><span class="cb-mark">境</span>
             </button>`}
      </div>
      <p class="os-hint">${L.faceUp ? (isLast ? "タップで結果を見る" : "タップで次のカード") : isLast && L.cards.length > 1 ? "最後の1枚（レア以上）" : "タップしてめくる"}</p>
      <div class="os-dots">${L.cards.map((_, i) => `<i class="${i < L.idx || (i === L.idx && L.faceUp) ? "on" : ""}"></i>`).join("")}</div>
    </div>`, "start", true);
  },

  /* 開封結果の一覧 */
  showSummary() {
    const L = this.last;
    openOverlay(`<div class="panel wide">
      <div class="shophead"><h2 class="title sm">${esc(L.pack.name)}</h2><span class="goldtag">${Account.gold}G</span></div>
      <p class="lead">開封結果（カードをタップすると効果を見られます）</p>
      <div class="opened">${L.cards.map(x => {
        const c = DEF[x.id];
        return `<button type="button" class="oslot up r-${c.rarity}" data-act="packDetail" data-id="${esc(c.id)}" aria-label="${esc(c.name)}の効果を見る"><span class="rtag r-${c.rarity}">${RARITY_SHORT[c.rarity]}</span>${x.isNew ? `<span class="newtag">NEW</span>` : ""}${cardHTML(c, { static: true })}</button>`;
      }).join("")}</div>
      <ul class="olist">${L.cards.map(x => { const c = DEF[x.id]; return `<li><span class="rtag r-${c.rarity}">${RARITY_SHORT[c.rarity]}</span>${esc(c.name)}${x.isNew ? ` <b class="newtxt">NEW</b>` : ` <small>（所持${Account.owned(x.id)}枚）</small>`}</li>`; }).join("")}</ul>
      <div class="pre-btns">
        <button type="button" class="btn primary" data-act="packOpen" data-id="${esc(L.pack.id)}" ${Account.gold < L.pack.price ? "disabled" : ""}>もう1パック（${L.pack.price}G）</button>
        <button type="button" class="btn" data-act="packs">パック一覧へ</button>
      </div>
      ${this.detailHTML()}
    </div>`, "start", true);
  },

  showDetail(id) { this.detailId = id; this.showOpening(); },
  detailHTML() {
    const c = this.detailId && DEF[this.detailId];
    if (!c) return "";
    return `<div class="dmodal" data-act="packDetailClose">
      <div class="dmodal-in" role="dialog" aria-label="${esc(c.name)}" data-act="noop">
        <div class="dmodal-card">${cardHTML(c, { static: true })}</div>
        <div class="dmodal-body">
          <b class="dm-name">${esc(c.name)}</b>
          <span class="pmeta">${RARITY[c.rarity]} ・ ${WORLDS[c.world]} ・ ${TYPES[c.type]} ・ コスト${c.cost}${c.type === "char" ? ` ・ ${c.atk}/${c.hp}` : ""}</span>
          <p class="dm-text">${esc(cardText(c))}</p>
          <span class="pmeta">所持 ${Account.owned(c.id)}枚 ・ 1デッキに${cardLimit(c, CONFIG)}枚まで</span>
          <button type="button" class="btn" data-act="packDetailClose">閉じる</button>
        </div>
      </div>
    </div>`;
  },

  tear() {
    const L = this.last; if (!L || L.stage !== "pack" || this.busy) return;
    const bp = $(".bigpack");
    Sound.play("open");
    if (bp && !Motion.reduced) {
      this.busy = true;
      bp.classList.add("tearing");
      setTimeout(() => { this.busy = false; L.stage = "reveal"; L.idx = 0; L.faceUp = false; this.showReveal(); }, 700);
    } else { L.stage = "reveal"; this.showReveal(); }
  },

  flip() {
    const L = this.last; if (!L || L.stage !== "reveal" || L.faceUp || this.busy) return;
    const c = DEF[L.cards[L.idx].id], r = RARITY_ORDER.indexOf(c.rarity);
    const go = () => { L.faceUp = true; Sound.play(r >= 2 ? "rare" : "flip", r); this.showReveal(r >= 2); };
    // SR以上は、めくる前に少しためる
    const back = $(".os-back");
    if (r >= 2 && back && !Motion.reduced) {
      this.busy = true;
      back.classList.add("charge");
      setTimeout(() => { this.busy = false; go(); }, 650);
    } else go();
  },

  next() {
    const L = this.last; if (!L || L.stage !== "reveal" || !L.faceUp) return;
    if (L.idx >= L.cards.length - 1) { L.stage = "done"; this.showSummary(); return; }
    L.idx++; L.faceUp = false; this.showReveal();
  },

  skip() {
    const L = this.last; if (!L) return;
    const best = Math.max(...L.cards.map(x => RARITY_ORDER.indexOf(DEF[x.id].rarity)));
    Sound.play(best >= 2 ? "rare" : "flip", best);
    L.stage = "done"; this.showSummary();
  },

  handleAct(act, el) {
    switch (act) {
      case "packs": this.showShop(); return true;
      case "packOpen": {
        const p = PACKS.find(x => x.id === (el && el.dataset.id));
        if (!p) return true;
        const r = this.open(p);
        if (!r.ok) { this.showShop(r.msg); return true; }
        this.showOpening();
        return true;
      }
      case "packTear": this.tear(); return true;
      case "packFlip": this.flip(); return true;
      case "packNext": this.next(); return true;
      case "packSkip": this.skip(); return true;
      case "packDetail": this.showDetail(el.dataset.id); return true;
      case "packDetailClose": this.detailId = null; this.showOpening(); return true;
    }
    return false;
  }
};
