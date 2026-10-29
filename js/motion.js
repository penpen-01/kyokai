/* =========================================================
   対戦中の動きのある演出
   - 攻撃：キャラが相手に向かって飛び込み、ぶつかった瞬間にダメージが出て、元の位置に戻る
   - 相手がカードを使った：そのカードを画面の真ん中に大きく見せてから効果が出る
   - 召喚：場に出たキャラが上から降りてくる
   - 撃破：カードが砕けて消える
   - 直接攻撃：画面が揺れる
   - ターンの始め：「あなたのターン」「相手のターン」の帯
   ぶつかる瞬間まで盤面の描き直しとダメージ表示を待たせる（hold）ことで、順番どおりに見せる。
   ========================================================= */

const Motion = {
  until: 0,
  queue: [],
  timer: null,
  renderPending: false,
  ret: null,
  seen: new Set(),
  seenGid: null,
  reduced: !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches),

  holding() { return Date.now() < this.until; },
  hold(ms) {
    this.until = Date.now() + ms;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.release(), ms);
  },
  release() {
    this.until = 0;
    while (this.queue.length) {
      const q = this.queue.shift();
      runFx(q[0], q[1], q[2]);
      if (this.holding()) return; // 次の演出が始まった。描き直しはその後
    }
    if (this.renderPending) { this.renderPending = false; render(); }
  },
  /* 演出が全部終わるまで待つ（CPUの行動の間に使う） */
  idle() {
    return new Promise(res => {
      const chk = () => (this.holding() || this.queue.length || this.renderPending ? setTimeout(chk, 50) : res());
      chk();
    });
  },
  /* 対局が変わったら演出の状態を捨てる */
  reset() {
    clearTimeout(this.timer);
    this.until = 0; this.queue = []; this.renderPending = false; this.ret = null;
  },

  /* ---------- 攻撃 ---------- */
  lunge(fromSel, toSel) {
    const el = document.querySelector("#app " + fromSel), tg = document.querySelector("#app " + toSel);
    if (!el || !tg) return;
    Sound.play("swing");
    if (this.reduced) return;
    const a = el.getBoundingClientRect(), b = tg.getBoundingClientRect();
    const dx = (b.left + b.width / 2 - (a.left + a.width / 2)) * 0.8;
    const dy = (b.top + b.height / 2 - (a.top + a.height / 2)) * 0.8;
    this.lift(el);
    const OUT = 300;
    el.animate([
      { transform: "none" },
      { transform: `translate(${-dx * 0.07}px, ${-dy * 0.07}px) scale(1.08)`, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(1.12) rotate(${dx >= 0 ? 5 : -5}deg)` }
    ], { duration: OUT, easing: "cubic-bezier(.55,0,.85,.45)", fill: "forwards" });
    this.ret = { sel: fromSel, dx, dy, end: Date.now() + OUT + 260 };
    this.hold(OUT);
  },
  /* 他のカードより手前に出す */
  lift(el) {
    const slot = el.closest(".slot");
    if (slot) { slot.style.position = "relative"; slot.style.zIndex = "20"; }
  },

  /* ---------- 相手が使ったカードを見せる ---------- */
  cast(id, pi) {
    if (pi === ME || !DEF[id]) return;
    const d = DEF[id];
    const w = document.createElement("div");
    w.className = "castshow";
    w.innerHTML = `<div class="castlabel">${esc(S && S.players[pi] ? S.players[pi].name : "相手")}が${d.type === "char" ? "召喚" : "使用"}</div>
      <div class="castcard">${cardHTML(d)}</div>`;
    $("#fx").appendChild(w);
    setTimeout(() => w.remove(), this.reduced ? 900 : 1250);
    this.hold(this.reduced ? 500 : 800);
  },

  /* ---------- 撃破：砕けて消える ---------- */
  shatter(el) {
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const layer = $("#fx");
    const ghost = el.cloneNode(true);
    ghost.removeAttribute("data-uid");
    ghost.classList.add("ghostcard");
    Object.assign(ghost.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px" });
    layer.appendChild(ghost);
    if (!this.reduced) {
      ghost.animate([
        { transform: "none", opacity: 1, filter: "brightness(1.8)" },
        { transform: "translateY(10px) scale(.9) rotate(-6deg)", opacity: .8, filter: "grayscale(1) brightness(.9)", offset: .35 },
        { transform: "translateY(36px) scale(.6) rotate(10deg)", opacity: 0, filter: "grayscale(1) brightness(.5)" }
      ], { duration: 620, easing: "ease-in", fill: "forwards" });
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const color = getComputedStyle(el).getPropertyValue("--wc") || "#e7c873";
      for (let i = 0; i < 12; i++) {
        const p = document.createElement("i");
        p.className = "shard";
        const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.4, dist = 40 + Math.random() * 46;
        Object.assign(p.style, { left: cx + "px", top: cy + "px", background: color });
        layer.appendChild(p);
        p.animate([
          { transform: "translate(-50%,-50%) rotate(45deg) scale(1)", opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) rotate(${200 + Math.random() * 300}deg) scale(.3)`, opacity: 0 }
        ], { duration: 520 + Math.random() * 200, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" });
        setTimeout(() => p.remove(), 800);
      }
    }
    setTimeout(() => ghost.remove(), 680);
  },

  /* ---------- ぶつかった所に光の輪 ---------- */
  spark(r) {
    if (this.reduced) return;
    const s = document.createElement("i");
    s.className = "spark";
    Object.assign(s.style, { left: r.left + r.width / 2 + "px", top: r.top + r.height / 2 + "px" });
    $("#fx").appendChild(s);
    setTimeout(() => s.remove(), 450);
  },

  /* ---------- 直接攻撃で画面が揺れる ---------- */
  shake() {
    if (this.reduced) return;
    app.animate([
      { transform: "none" }, { transform: "translate(-7px, 3px)" }, { transform: "translate(6px, -4px)" },
      { transform: "translate(-4px, 2px)" }, { transform: "translate(3px, 0)" }, { transform: "none" }
    ], { duration: 340, easing: "ease-out" });
  },

  /* ---------- ターンの始めの帯 ---------- */
  banner(mine) {
    const b = document.createElement("div");
    b.className = "turnbanner " + (mine ? "mine" : "theirs");
    b.innerHTML = `<span>${mine ? "あなたのターン" : "相手のターン"}</span>`;
    $("#fx").appendChild(b);
    setTimeout(() => b.remove(), 1300);
  },

  /* ---------- 描き直しの後：戻る動き・召喚の動き ---------- */
  afterRender() {
    if (!S) return;
    if (this.ret) {
      const r = this.ret; this.ret = null;
      const el = document.querySelector("#app " + r.sel);
      if (el && !this.reduced) {
        this.lift(el);
        const ms = Math.max(140, r.end - Date.now());
        el.animate([
          { transform: `translate(${r.dx * 0.85}px, ${r.dy * 0.85}px) scale(1.05)` },
          { transform: "none" }
        ], { duration: ms, easing: "cubic-bezier(.2,.8,.3,1)" }).finished
          .then(() => { const s = el.closest(".slot"); if (s) { s.style.zIndex = ""; s.style.position = ""; } }, () => {});
      }
    }
    if (S.gid !== this.seenGid) { this.seenGid = S.gid; this.seen = new Set(); }
    document.querySelectorAll("#app .field [data-uid]").forEach(el => {
      const uid = +el.dataset.uid;
      if (this.seen.has(uid)) return;
      this.seen.add(uid);
      if (this.reduced) return;
      el.animate([
        { transform: "translateY(-26px) scale(1.3)", opacity: 0, filter: "brightness(2.2)" },
        { transform: "translateY(2px) scale(.97)", opacity: 1, filter: "brightness(1.3)", offset: .7 },
        { transform: "none", opacity: 1, filter: "none" }
      ], { duration: 420, easing: "cubic-bezier(.3,.7,.4,1)" });
    });
  }
};
