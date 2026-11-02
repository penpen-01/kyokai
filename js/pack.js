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

  /* パックの表の絵。パックごとに art があればそれ、なければ第1弾の絵（Gemini：ui/pack-art.webp） */
  art(pack) { return pack.art || (pack.id === "pack1" ? "ui/pack-art.webp" : ""); },

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

  /* n パックまとめて開ける（10連は n=10）。結果は1パックずつ（rows）にも分けて持つ */
  open(pack, byTicket, n = 1) {
    if (Account.status !== "ready" && Account.status !== "offline") return { ok: false, msg: "アカウントを読み込めていないため、パックを開けられません。" };
    if (byTicket && Account.tickets < n) return { ok: false, msg: n > 1 ? `パック券が${n}枚ありません。` : "パック券を持っていません。" };
    if (!byTicket && Account.gold < pack.price * n) return { ok: false, msg: `Gが足りません（あと${pack.price * n - Account.gold}G）` };
    const before = { ...Account.data.cards };
    const seen = {};
    const rows = [], ids = [];
    for (let k = 0; k < n; k++) {
      const row = [];
      for (let i = 0; i < pack.size; i++) {
        const id = this.rollCard(pack, i === pack.size - 1 ? pack.odds.last : pack.odds.normal);
        if (!id) continue;
        const isNew = !before[id] && !seen[id]; seen[id] = true;
        row.push({ id, isNew }); ids.push(id);
      }
      rows.push(row);
    }
    // 開封の履歴（直近100パック分）。カードと同じ保存で一緒に残す
    const log = Array.isArray(Account.data.packLog) ? Account.data.packLog : [];
    const t = Date.now();
    rows.forEach(row => log.push({ t, p: pack.id, c: row.map(x => x.id) }));
    Account.data.packLog = log.slice(-100);
    if (n > 1) {
      if (byTicket) Account.data.tickets -= n; else Account.data.gold -= pack.price * n;
      Account.addCards(ids);
      this.last = { pack, rows, multi: n, stage: "pack", shown: false, byTicket: !!byTicket };
      this.detailId = null;
      return { ok: true };
    }
    const cards = rows[0];
    // めくる順番：レア度の低い順（いちばんレアなカードが最後に出る）
    const rank = x => RARITY_ORDER.indexOf(DEF[x.id].rarity);
    cards.sort((a, b) => rank(a) - rank(b));
    if (byTicket) Account.data.tickets -= 1; else Account.data.gold -= pack.price;
    Account.addCards(cards.map(x => x.id));
    // stage: pack（未開封）→ reveal（1枚ずつ）→ done（一覧）
    this.last = { pack, cards, stage: "pack", idx: 0, faceUp: false, byTicket: !!byTicket };
    this.detailId = null;
    return { ok: true };
  },

  /* ---------- 画面 ---------- */
  showShop(msg) {
    this.logOpen = false;
    const open = PACKS.filter(p => p.open);
    const acctNote = Account.status === "ready" ? "" : Account.status === "offline" ? `<p class="callout warn"><b>オフラインです</b>通信できるところで開き直してから、パックを開けてください。</p>`
      : Account.status === "free" ? `<p class="callout"><b>試遊モード</b>パックは開けません（すべてのカードを使えます）。</p>`
      : `<p class="callout warn"><b>アカウントを読み込めていません</b>通信状態を確認して、開き直してください。</p>`;
    const can = ["ready", "offline"].includes(Account.status);
    openOverlay(`<div class="panel wide">
      <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>パック</b><span class="goldtag">${Account.gold}G</span></div>
      ${acctNote}
      ${msg ? `<p class="callout warn">${esc(msg)}</p>` : ""}
      ${open.length ? open.map(p => {
        const pool = this.pool(p);
        const cnt = r => pool.filter(c => c.rarity === r).length;
        const ten = p.price * 10;
        return `<section class="pk">
          <div class="pk-hero">
            <div class="pk-art ${this.art(p) ? "has-art" : ""}" ${this.art(p) ? `style="background-image:url('${esc(this.art(p))}')"` : ""}><span>${esc(p.name)}</span></div>
          </div>
          <div class="pk-info">
            <h3>${esc(p.name)}</h3>
            <div class="pk-chips"><span>${pool.length}種</span><span>1パック${p.size}枚</span><span>最後の1枚はレア以上</span></div>
            <div class="pk-rar">${RARITY_ORDER.map(r => `<span class="r-${r}"><i class="rtag r-${r}">${RARITY_SHORT[r]}</i>${cnt(r)}種</span>`).join("")}</div>
            <button type="button" class="linkbtn pk-listbtn" data-act="packLog">開封履歴</button>
            <button type="button" class="linkbtn pk-listbtn" data-act="packList" data-id="${esc(p.id)}">封入カードを見る（${pool.length}種）</button>
            <details class="pk-odds"><summary>排出率を見る</summary>
              <table><tr><th></th>${RARITY_ORDER.map(r => `<th>${RARITY_SHORT[r]}</th>`).join("")}</tr>
                <tr><td>1〜${p.size - 1}枚目</td>${RARITY_ORDER.map(r => `<td>${p.odds.normal[r]}%</td>`).join("")}</tr>
                <tr><td>${p.size}枚目</td>${RARITY_ORDER.map(r => `<td>${p.odds.last[r]}%</td>`).join("")}</tr></table>
            </details>
          </div>
          <div class="pk-buy">
            <button type="button" class="pk-btn one" data-act="packOpen" data-id="${esc(p.id)}" ${Account.gold < p.price || !can ? "disabled" : ""}><small>1パック</small><b>${p.price}G</b></button>
            <button type="button" class="pk-btn ten" data-act="packOpen10" data-id="${esc(p.id)}" ${Account.gold < ten || !can ? "disabled" : ""}><small>10パック</small><b>${ten}G</b></button>
            ${Account.tickets > 0 ? `<button type="button" class="pk-btn tk" data-act="packOpenTicket" data-id="${esc(p.id)}" ${can ? "" : "disabled"}><small>パック券で1パック</small><b>残り${Account.tickets}枚</b></button>` : ""}
            ${Account.tickets >= 10 ? `<button type="button" class="pk-btn tk" data-act="packOpenTicket10" data-id="${esc(p.id)}" ${can ? "" : "disabled"}><small>パック券で10パック</small><b>10枚使う</b></button>` : ""}
          </div>
        </section>`;
      }).join("") : `<p class="callout">今は買えるパックがありません。</p>`}
    </div>`, "start", true);
  },

  /* 開封履歴：直近100パック。新しい順、10連は1つにまとめる */
  showLog() {
    this.listId = null;
    const log = (Account.data && Account.data.packLog) || [];
    const groups = [];
    log.slice().reverse().forEach(e => { const g = groups[groups.length - 1]; if (g && g.t === e.t && g.p === e.p) g.rows.push(e.c); else groups.push({ t: e.t, p: e.p, rows: [e.c] }); });
    const fmt = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
    openOverlay(`<div class="panel wide">
      <div class="topbar"><button type="button" class="btn sm" data-act="packs">← パック</button><b>開封履歴</b></div>
      <p class="lead small">直近${Math.min(log.length, 100)}パック分（最大100パック）。新しい順です。名前を押すと効果を見られます。</p>
      ${groups.length ? groups.map(g => {
        const all = g.rows.flat(), pk = PACKS.find(x => x.id === g.p);
        return `<section class="lg-item"><div class="lg-head"><b>${g.rows.length > 1 ? `${g.rows.length}パック` : "1パック"}</b><span>${esc(pk ? pk.name : g.p)}</span><time>${fmt(g.t)}</time></div>
          <div class="lg-cards">${[...all].sort((a, b) => RARITY_ORDER.indexOf((DEF[b] || {}).rarity) - RARITY_ORDER.indexOf((DEF[a] || {}).rarity)).map(id => DEF[id] ? `<button type="button" class="lg-c r-${DEF[id].rarity}" data-act="packDetail" data-id="${esc(id)}"><i class="rtag r-${DEF[id].rarity}">${RARITY_SHORT[DEF[id].rarity]}</i>${esc(DEF[id].name)}</button>` : "").join("")}</div></section>`;
      }).join("") : `<p class="callout">まだ履歴はありません（この機能を入れたあとに開けたパックから残ります）。</p>`}
      ${this.detailHTML()}
    </div>`, "start", true);
    this.logOpen = true;
  },

  /* 封入カードの一覧（レア度ごと） */
  showList(id) {
    const p = PACKS.find(x => x.id === id); if (!p) return this.showShop();
    this.listId = id; this.logOpen = false;
    const pool = this.pool(p);
    const byCost = (a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja");
    openOverlay(`<div class="panel wide">
      <div class="topbar"><button type="button" class="btn sm" data-act="packs">← パック</button><b>封入カード</b></div>
      <p class="lead small">「${esc(p.name)}」から出るカード、全${pool.length}種です。カードを押すと効果を見られます。</p>
      ${[...RARITY_ORDER].reverse().map(r => {
        const list = pool.filter(c => c.rarity === r).sort(byCost);
        if (!list.length) return "";
        return `<h3 class="sec"><i class="rtag r-${r}">${RARITY_SHORT[r]}</i>${RARITY[r]}<small class="hint">${list.length}種</small></h3>
          <div class="pl-grid">${list.map(c => `<button type="button" class="pl-card" data-act="packDetail" data-id="${esc(c.id)}" aria-label="${esc(c.name)}">${cardHTML(c, { static: true })}${Account.owned(c.id) ? `<span class="pl-own">所持${Account.owned(c.id)}</span>` : ""}</button>`).join("")}</div>`;
      }).join("")}
      ${this.detailHTML()}
    </div>`, "start", true);
  },

  showOpening() {
    const L = this.last; if (!L) return;
    if (L.multi) return L.stage === "pack" ? this.showPack() : this.showMulti();
    if (L.stage === "pack") return this.showPack();
    if (L.stage === "reveal") return this.showReveal();
    this.showSummary();
  },

  /* 未開封のパック。タップで破る */
  showPack() {
    const L = this.last;
    openOverlay(`<div class="openstage">
      <div class="os-top"><span class="goldtag">${Account.gold}G</span></div>
      <div class="bp-wrap">${L.multi ? Array.from({ length: L.multi - 1 }, (_, i) => `<span class="bp-ghost" style="--i:${L.multi - 1 - i}${this.art(L.pack) ? `;background-image:url('${esc(this.art(L.pack))}')` : ""}"></span>`).join("") : ""}
      <button type="button" class="bigpack ${L.multi ? "multi" : ""}" data-act="packTear" aria-label="パックを開ける">
        <span class="bp-tear"></span>
        <span class="bp-body ${this.art(L.pack) ? "has-art" : ""}" ${this.art(L.pack) ? `style="background-image:url('${esc(this.art(L.pack))}')"` : ""}>
          <span class="bp-bands"><i class="w-myth"></i><i class="w-fan"></i><i class="w-mech"></i></span>
          <span class="bp-logo"><small>境界の召喚士</small><b>${esc(L.pack.name)}</b><em>${L.multi ? `${L.multi}パック分 ・ ${L.multi * L.pack.size}枚` : `${L.pack.size}枚入り`}</em></span>
        </span>
      </button></div>
      <p class="os-hint">${L.multi ? `${L.multi}パックまとめて開ける` : "タップして開ける"}</p>
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
        ${Account.tickets > 0 ? `<button type="button" class="btn primary" data-act="packOpenTicket" data-id="${esc(L.pack.id)}">もう1パック（パック券 残り${Account.tickets}枚）</button>`
          : `<button type="button" class="btn primary" data-act="packOpen" data-id="${esc(L.pack.id)}" ${Account.gold < L.pack.price ? "disabled" : ""}>もう1パック（${L.pack.price}G）</button>`}
        <button type="button" class="btn" data-act="packs">パック一覧へ</button>
      </div>
      ${this.detailHTML()}
    </div>`, "start", true);
  },

  /* 10連の結果：1パック＝1行で、上から順に一気にめくれる。SR 以上は光る。上に当たりのまとめ */
  showMulti(anim) {
    this.logOpen = false;
    const L = this.last;
    const all = L.rows.flat();
    const cnt = r => all.filter(x => DEF[x.id].rarity === r).length;
    const newN = all.filter(x => x.isNew).length;
    const best = all.filter(x => RARITY_ORDER.indexOf(DEF[x.id].rarity) >= 2).sort((a, b) => RARITY_ORDER.indexOf(DEF[b.id].rarity) - RARITY_ORDER.indexOf(DEF[a.id].rarity));
    const play = anim && !L.shown && !Motion.reduced;
    L.shown = true;
    let k = 0;
    const cell = x => { const c = DEF[x.id];
      return `<button type="button" class="mslot r-${c.rarity} ${play ? "wait" : ""}" data-n="${k++}" data-act="packDetail" data-id="${esc(c.id)}" aria-label="${esc(c.name)}">${x.isNew ? `<span class="newtag">NEW</span>` : ""}${cardHTML(c, { static: true })}</button>`; };
    const again = L.byTicket
      ? `<button type="button" class="btn primary" data-act="packOpenTicket10" data-id="${esc(L.pack.id)}" ${Account.tickets >= 10 ? "" : "disabled"}>もう10パック（パック券 残り${Account.tickets}枚）</button>`
      : `<button type="button" class="btn primary" data-act="packOpen10" data-id="${esc(L.pack.id)}" ${Account.gold >= L.pack.price * 10 ? "" : "disabled"}>もう10パック（${L.pack.price * 10}G）</button>`;
    openOverlay(`<div class="panel wide">
      <div class="topbar"><button type="button" class="btn sm" data-act="packs">← パック</button><b>10パックの結果</b><span class="goldtag">${Account.gold}G</span></div>
      <div class="ms-sum">
        <div class="ms-counts">${RARITY_ORDER.map(r => `<span class="r-${r}"><i class="rtag r-${r}">${RARITY_SHORT[r]}</i>${cnt(r)}</span>`).join("")}<span class="ms-new">NEW ${newN}</span></div>
        ${best.length ? `<div class="ms-best"><small>SR以上</small><div>${best.map(x => `<button type="button" class="ms-b r-${DEF[x.id].rarity}" data-act="packDetail" data-id="${esc(x.id)}">${esc(DEF[x.id].name)}</button>`).join("")}</div></div>` : ""}
      </div>
      <div class="ms-grid">${L.rows.map((row, i) => `<div class="ms-row"><span class="ms-no">${i + 1}</span>${row.map(cell).join("")}</div>`).join("")}</div>
      <div class="pre-btns">${again}<button type="button" class="btn" data-act="packs">パック一覧へ</button></div>
      ${this.detailHTML()}
    </div>`, "start", true);
    if (play) this.revealMulti(all);
  },

  /* 10連：上から順にめくる。UR・レジェンドの番が来たら、めくる直前にカットインを入れる。画面をタップすると残りを一気に表示 */
  stopReveal() { if (this.revealStop) this.revealStop(); this.revealStop = null; const c = document.getElementById("cutin"); if (c) c.remove(); },
  revealMulti(all) {
    this.stopReveal();
    const L = this.last, slots = [...document.querySelectorAll(".mslot.wait")];
    let i = 0, stop = false, t = null;
    const finish = () => { stop = true; clearTimeout(t); document.querySelectorAll(".mslot.wait").forEach(el => el.classList.remove("wait")); };
    this.revealStop = () => { stop = true; clearTimeout(t); };
    document.querySelector(".ms-grid").addEventListener("click", e => { if (document.querySelector(".mslot.wait")) { e.stopPropagation(); finish(); } }, { capture: true, once: true });
    const step = () => {
      if (stop || this.last !== L || i >= slots.length) return;
      const x = all[i], el = slots[i], c = DEF[x.id], r = RARITY_ORDER.indexOf(c.rarity);
      i++;
      const show = () => { el.classList.remove("wait"); el.classList.add("pop"); if (r >= 2) Sound.play("rare", r); t = setTimeout(step, r >= 2 ? 160 : 45); };
      if (r >= 3) { el.scrollIntoView({ block: "center", behavior: "smooth" }); Motion.cutin(x.id, ME, x.isNew ? "NEW 獲得！" : "獲得！"); t = setTimeout(show, 760); }
      else show();
    };
    step();
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
      setTimeout(() => { this.busy = false; if (L.multi) { L.stage = "done"; this.showMulti(true); } else { L.stage = "reveal"; L.idx = 0; L.faceUp = false; this.showReveal(); } }, 700);
    } else if (L.multi) { L.stage = "done"; this.showMulti(true); } else { L.stage = "reveal"; this.showReveal(); }
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
      case "packs": this.listId = null; this.stopReveal(); this.showShop(); return true;
      case "packLog": this.stopReveal(); this.showLog(); return true;
      case "packOpen": case "packOpenTicket": case "packOpen10": case "packOpenTicket10": {
        const p = PACKS.find(x => x.id === (el && el.dataset.id));
        if (!p) return true;
        // 連打で2回開けないように（2026-11-03：10連のあと「もう10パック」でGだけ減った報告への対策）
        if (Date.now() < (this.lockUntil || 0)) return true;
        this.lockUntil = Date.now() + 1200;
        this.stopReveal();
        this.listId = null;
        const r = this.open(p, act.startsWith("packOpenTicket"), act.endsWith("10") ? 10 : 1);
        if (!r.ok) { this.showShop(r.msg); return true; }
        this.showOpening();
        return true;
      }
      case "packTear": this.tear(); return true;
      case "packFlip": this.flip(); return true;
      case "packNext": this.next(); return true;
      case "packSkip": this.skip(); return true;
      case "packDetail": { this.detailId = el.dataset.id; const o = $("#overlay"), y = o.scrollTop; if (this.logOpen) this.showLog(); else if (this.listId) this.showList(this.listId); else this.showOpening(); o.scrollTop = y; return true; }
      case "packDetailClose": this.detailId = null; if (this.logOpen) this.showLog(); else if (this.listId) this.showList(this.listId); else this.showOpening(); return true;
      case "packList": this.listId = el.dataset.id; this.detailId = null; this.showList(this.listId); return true;
    }
    return false;
  }
};
