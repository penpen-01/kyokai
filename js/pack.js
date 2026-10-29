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
    Account.data.gold -= pack.price;
    Account.addCards(ids);
    this.last = { pack, cards, flipped: cards.map(() => false) };
    return { ok: true };
  },

  /* ---------- 画面 ---------- */
  showShop(msg) {
    const open = PACKS.filter(p => p.open);
    const acctNote = Account.status === "ready" ? "" : Account.status === "offline" ? `<p class="datainfo">オフラインです。開けたカードは、通信できるようになったら保存されます。</p>`
      : Account.status === "free" ? `<p class="onl-msg">試遊モードではパックを開けません（すべてのカードを使えます）。</p>`
      : `<p class="onl-msg">アカウントを読み込めていません。通信状態を確認して、開き直してください。</p>`;
    openOverlay(`<div class="panel wide">
      <div class="shophead"><h2 class="title sm">パック</h2><span class="goldtag">${Account.gold}G</span></div>
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
    const all = L.flipped.every(Boolean);
    openOverlay(`<div class="panel wide">
      <div class="shophead"><h2 class="title sm">${esc(L.pack.name)}</h2><span class="goldtag">${Account.gold}G</span></div>
      <p class="lead">${all ? "開封結果" : "カードをタップしてめくってください"}</p>
      <div class="opened">${L.cards.map((x, i) => {
        const c = DEF[x.id];
        return L.flipped[i]
          ? `<div class="oslot up r-${c.rarity}"><span class="rtag">${RARITY_SHORT[c.rarity]}</span>${x.isNew ? `<span class="newtag">NEW</span>` : ""}${cardHTML(c, { static: true })}</div>`
          : `<button type="button" class="oslot down" data-act="packFlip" data-i="${i}" aria-label="${i + 1}枚目をめくる"><span>${i === L.cards.length - 1 ? "レア以上" : ""}</span></button>`;
      }).join("")}</div>
      ${all ? `<ul class="olist">${L.cards.map(x => { const c = DEF[x.id]; return `<li><span class="rtag r-${c.rarity}">${RARITY_SHORT[c.rarity]}</span>${esc(c.name)}${x.isNew ? ` <b class="newtxt">NEW</b>` : ` <small>（所持${Account.owned(x.id)}枚）</small>`}</li>`; }).join("")}</ul>` : ""}
      <div class="pre-btns">
        ${all ? `<button type="button" class="btn primary" data-act="packOpen" data-id="${esc(L.pack.id)}" ${Account.gold < L.pack.price ? "disabled" : ""}>もう1パック（${L.pack.price}G）</button>
                 <button type="button" class="btn" data-act="packs">パック一覧へ</button>`
              : `<button type="button" class="btn primary" data-act="packFlipAll">すべてめくる</button>
                 <span></span>`}
      </div>
    </div>`, "start", true);
  },

  flip(i) {
    const L = this.last; if (!L || L.flipped[i]) return;
    L.flipped[i] = true;
    const c = DEF[L.cards[i].id];
    Sound.play(RARITY_ORDER.indexOf(c.rarity) >= 2 ? "rare" : "flip", RARITY_ORDER.indexOf(c.rarity));
    this.showOpening();
  },

  handleAct(act, el) {
    switch (act) {
      case "packs": this.showShop(); return true;
      case "packOpen": {
        const p = PACKS.find(x => x.id === (el && el.dataset.id));
        if (!p) return true;
        const r = this.open(p);
        if (!r.ok) { this.showShop(r.msg); return true; }
        Sound.play("open");
        this.showOpening();
        return true;
      }
      case "packFlip": this.flip(+el.dataset.i); return true;
      case "packFlipAll": {
        const L = this.last; if (!L) return true;
        let best = 0;
        L.cards.forEach((x, i) => { if (!L.flipped[i]) { best = Math.max(best, RARITY_ORDER.indexOf(DEF[x.id].rarity)); L.flipped[i] = true; } });
        Sound.play(best >= 2 ? "rare" : "flip", best);
        this.showOpening();
        return true;
      }
    }
    return false;
  }
};
