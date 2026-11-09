/* =========================================================
   最初の手札（マリガン）：対戦の画面の上で行う
   1. 先攻・後攻が決まったら対戦の画面になり、山札から手札へ1枚ずつ配る
   2. 配り終わったら、手札を真ん中に大きく並べて「このまま始める／引き直す」
   3. 引き直すと、手札が山札に戻り、もう一度1枚ずつ配り直す
   ========================================================= */
const Mull = {
  dealt: new Set(), busy: false, landed: 0, el: null,

  after() {
    if (!S) { this.close(); return; }
    // 引き直したあと、相手がもう決めていて対戦が始まっていても、配り直しは見せる
    if (this.redeal === S.gid && !this.dealt.has(`${S.gid}-re`)) { this.dealt.add(`${S.gid}-re`); this.close(); this.deal(); return; }
    if (this.busy || this.waiting) { this.hideUnlanded(); return; }
    if (S.phase !== "mulligan") { this.close(); return; }
    const key = `${S.gid}-${S.mull[ME] ? "re" : "first"}`;
    if (!this.dealt.has(key)) { this.dealt.add(key); this.deal(); return; }
    this.panel();
  },
  cards() { return [...document.querySelectorAll("#app .hand > .card")]; },
  hideUnlanded() { this.cards().forEach((c, i) => { c.style.visibility = i < this.landed ? "" : "hidden"; }); },

  async deal() {
    this.waiting = true; this.landed = 0; this.close();
    this.hideUnlanded();
    if (typeof Cinema !== "undefined" && S.phase === "mulligan") await Cinema.idle();   // 先攻・後攻の演出が終わってから（配り直しは待たない）
    this.waiting = false;
    if (!S) return;
    this.busy = true;
    const n = this.cards().length, step = Motion.reduced ? 0 : 130;
    for (let i = 0; i < n; i++) {
      const c = this.cards()[i];
      if (!c) break;
      this.landed = i + 1; this.hideUnlanded();
      Motion.flyIn(c);
      Sound.play("flip");
      await new Promise(r => setTimeout(r, step));
    }
    await new Promise(r => setTimeout(r, Motion.reduced ? 0 : 320));
    this.busy = false;
    this.after();
  },

  panel() {
    const me = S.players[ME], done = S.mull[ME];
    const wait = typeof Online !== "undefined" && MODE === "online" && Online.blocked();
    const key = `${S.gid}|${done}|${me.hand.join(",")}|${wait}`;
    if (this.el && this.el.dataset.key === key) return;
    const fresh = !this.el;
    if (!this.el) { this.el = document.createElement("div"); this.el.className = "mullp"; document.body.appendChild(this.el); }
    this.el.dataset.key = key;
    this.el.classList.toggle("in", fresh);
    const dots = `<span class="pg-dots"><i></i><i></i><i></i></span>`;
    this.el.innerHTML = `<div class="mullp-in">
      <div class="pg-title sm"><span class="pg-chip ${S.first === ME ? "first" : "second"}">${S.first === ME ? "先攻" : "後攻"}</span><b>最初の手札</b></div>
      <div class="pg-hand5">${handOrder(me).map((i, k) => `<div class="pg-hc" style="--i:${k}">${cardHTML(DEF[me.hand[i]], { static: true })}</div>`).join("")}</div>
      ${done == null ? `<div class="pg-btns">
          <button type="button" class="btn primary" data-act="mull" data-v="0" ${wait ? "disabled" : ""}>このまま始める</button>
          <button type="button" class="btn pg-redo" data-act="mull" data-v="1" ${wait ? "disabled" : ""}>${RES_IC.again}引き直す</button>
        </div><p class="pg-hint">引き直しは1回だけ（全部入れ替え）</p>`
      : `<p class="pg-wait">${done ? "引き直しました。" : ""}相手を待っています${dots}</p>`}
    </div>`;
  },

  /* ボタンを押したとき：引き直すなら手札を山札へ戻してから */
  choose(redraw, go) {
    if (redraw) { this.redeal = S.gid; this.busy = true; }   // 配り直しが終わるまで、ターンの帯を待たせる
    if (!redraw || Motion.reduced) { this.close(); if (Motion.reduced) this.busy = false; return go(); }
    const pile = document.querySelector("#app .pile .pback") || document.querySelector("#app .pile");
    const cs = this.el ? [...this.el.querySelectorAll(".pg-hc")] : [];
    if (pile) {
      const a = pile.getBoundingClientRect();
      cs.forEach((c, i) => {
        const b = c.getBoundingClientRect();
        c.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${a.left - b.left}px,${a.top - b.top}px) scale(.3) rotate(-20deg)`, opacity: 0 }],
          { duration: 380, delay: i * 40, easing: "cubic-bezier(.5,0,.8,.6)", fill: "forwards" });
      });
    }
    if (this.el) this.el.classList.add("out");
    Sound.play("flip");
    setTimeout(() => { this.close(); go(); }, 380 + cs.length * 40);
  },

  close() { if (this.el) { this.el.remove(); this.el = null; } }
};
