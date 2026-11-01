/* =========================================================
   ホームの飾り棚：持っているカードが輪になって、奥と手前を回る
   ・レア度の高い順に最大8枚。カードは常にこちらを向いたまま、輪の上を回る（奥ほど小さく暗い）
   ・ゆっくり自動で回る。指で左右になぞると回せて、離すと少し惰性で回ってから元の速さに戻る
   ・カードをタップすると詳しく見られる
   ========================================================= */

const Showcase = {
  cards: [],
  angle: 0,
  vel: 0,
  raf: 0,
  last: 0,
  drag: null,
  blockClickUntil: 0,
  AUTO: (Math.PI * 2) / 48,   // 1周48秒

  pick() {
    const R = RARITY_ORDER;
    return CARDS.filter(c => c.art && c.limit > 0 && Account.owned(c.id) > 0)
      .sort((a, b) => R.indexOf(b.rarity) - R.indexOf(a.rarity) || b.cost - a.cost || a.id.localeCompare(b.id))
      .slice(0, 8);
  },

  html() {
    this.cards = this.pick();
    if (!this.cards.length) return "";
    const list = CARDS.filter(c => c.limit > 0);
    const have = list.filter(c => Account.owned(c.id) > 0).length;
    return `<div class="showcase" id="showcase" aria-label="持っているカード。左右になぞると回ります">
      <div class="sc-stage" aria-hidden="true"></div>
      ${this.cards.map((c, i) => `<button type="button" class="sc-item r-${c.rarity}" data-act="scDetail" data-id="${esc(c.id)}" data-i="${i}" aria-label="${esc(c.name)}">${cardHTML(c, { static: true })}</button>`).join("")}
    </div>
    <button type="button" class="sc-count" data-act="cards">集めたカード <b>${have}</b> / ${list.length}種</button>`;
  },

  /* ホームを描いたあとに呼ぶ */
  start() {
    cancelAnimationFrame(this.raf);
    const el = document.getElementById("showcase");
    if (!el) return;
    this.el = el;
    this.items = [...el.querySelectorAll(".sc-item")];
    this.vel = Motion.reduced ? 0 : this.AUTO;
    this.last = performance.now();
    this.bind(el);
    this.layout();
    const tick = t => {
      if (!this.el || !this.el.isConnected) return;   // ホームから離れたら止める
      const dt = Math.min(.05, (t - this.last) / 1000);
      this.last = t;
      if (!this.drag) {
        const target = Motion.reduced ? 0 : this.AUTO;
        this.vel += (target - this.vel) * Math.min(1, dt * 1.6);   // 惰性からいつもの速さへ戻る
        this.angle += this.vel * dt;
      }
      this.layout();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },

  layout() {
    const el = this.el, items = this.items, n = items.length;
    if (!el || !n) return;
    const w = el.clientWidth, h = el.clientHeight;
    const cardW = Math.max(70, Math.min(w * 0.38, h * 0.66 * 5 / 7, 175));
    const R = n === 1 ? 0 : Math.min(w * 0.42, cardW * 1.6);
    let front = null, best = -2;
    items.forEach((it, i) => {
      const th = this.angle + (i / n) * Math.PI * 2;
      const x = Math.sin(th) * R, z = Math.cos(th);
      const depth = (z + 1) / 2;                       // 手前1 〜 奥0
      const sc = 0.4 + 0.6 * depth;
      const y = h * 0.06 - (1 - depth) * h * 0.26;               // 奥は少し上に（輪を斜め上から見ている）
      it.style.width = cardW + "px";
      it.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
      it.style.zIndex = String(Math.round(depth * 100));
      it.style.filter = `brightness(${(0.32 + 0.68 * depth).toFixed(2)})`;
      if (z > best) { best = z; front = it; }
    });
    items.forEach(it => it.classList.toggle("front", it === front));
  },

  bind(el) {
    el.addEventListener("pointerdown", e => {
      this.drag = { x: e.clientX, t: performance.now(), moved: false, id: e.pointerId };
      this.vel = 0;
    });
    el.addEventListener("pointermove", e => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) < 6) return;
      if (!d.moved) { d.moved = true; try { el.setPointerCapture(e.pointerId); } catch {} }
      const now = performance.now(), dt = Math.max(1, now - d.t) / 1000;
      const dA = dx / Math.max(160, el.clientWidth * 0.8) * Math.PI;   // 画面の幅ほどなぞると約半周
      this.angle += dA;
      this.vel = dA / dt;
      d.x = e.clientX; d.t = now;
    });
    const end = e => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      if (d.moved) this.blockClickUntil = Date.now() + 250;   // なぞったあとの「タップ」は無視する
      this.vel = Math.max(-6, Math.min(6, this.vel));
      this.drag = null;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("click", e => {
      if (Date.now() < this.blockClickUntil) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  },

  showDetail(id) {
    const c = DEF[id];
    if (!c) return;
    this.closeDetail();
    const box = document.querySelector(".panel.home");
    if (!box) return;
    box.insertAdjacentHTML("beforeend", `<div class="dmodal sc-modal" data-act="scClose">
      <div class="dmodal-in" role="dialog" aria-label="${esc(c.name)}" data-act="noop">
        <div class="dmodal-card">${cardHTML(c, { static: true })}</div>
        <div class="dmodal-body">
          <b class="dm-name">${esc(c.name)}</b>
          <span class="pmeta">${RARITY[c.rarity]} ・ ${WORLDS[c.world]} ・ ${TYPES[c.type]} ・ コスト${c.cost}${c.type === "char" ? ` ・ ${c.atk}/${c.hp}` : ""}</span>
          <p class="dm-text">${esc(cardText(c))}</p>
          <span class="pmeta">所持 ${Account.owned(c.id)}枚</span>
          <button type="button" class="btn" data-act="scClose">閉じる</button>
        </div>
      </div>
    </div>`);
    Sound.play("click");
  },
  closeDetail() { document.querySelectorAll(".sc-modal").forEach(m => m.remove()); },

  handleAct(act, el) {
    switch (act) {
      case "scDetail": this.showDetail(el.dataset.id); return true;
      case "scClose": this.closeDetail(); return true;
    }
    return false;
  }
};
