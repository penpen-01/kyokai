/* =========================================================
   対戦の大きな演出（画面全体）
   ・試合開始：両者の絵が斜めの帯で入ってきて、真ん中で「VS」とぶつかる
   ・じゃんけん：お互いの手が上と下から出てきて「じゃん・けん・ぽん」、結果を大きく出す
   ・先攻／後攻：裏向きのカードがめくれて「先攻」「後攻」が出る
   ・ターンの始め：「あなたのターン」「相手のターン」を大きく出して少し止まる
   状態（S）の変化を render のたびに見て、新しい出来事があれば順番に流す。
   対人戦でも、部屋を作った人・参加した人それぞれの画面で同じものが流れる。タップで飛ばせる
   ========================================================= */

const Cinema = {
  q: [], playing: null, seen: new Set(), gid: null, endAt: 0, timer: null,

  busy() { return !!this.playing || this.q.length > 0; },
  idle() {
    return new Promise(res => { const chk = () => (this.busy() ? setTimeout(chk, 80) : res()); chk(); });
  },
  reset() {
    clearTimeout(this.timer); clearTimeout(this.fadeT);
    this.q = []; this.playing = null; this.seen = new Set();
    const el = document.getElementById("cine"); if (el) el.remove();
  },

  /* render から呼ぶ：まだ見せていない出来事を探して並べる */
  watch() {
    if (!S || SIM) return;
    if (S.gid !== this.gid) { this.reset(); this.gid = S.gid; }
    const add = (key, fn) => { if (!this.seen.has(key)) { this.seen.add(key); this.q.push(fn); } };
    if (!S.turnNo) add("intro", () => this.intro());
    const last = S.rps && S.rps.last;
    if (last) add(`rps-${S.rps.round}-${last.hands.join("")}-${last.winner}`, () => this.rps(last));
    if (S.first != null) add("order", () => this.order());
    if (S.phase === "play" && S.turnNo && !S.over) add(`turn-${S.turnNo}`, () => this.turn());
    if (!this.playing) this.next();
  },

  next() {
    clearTimeout(this.timer); clearTimeout(this.fadeT);
    const old = document.getElementById("cine"); if (old) old.remove();
    const fn = this.q.shift();
    if (!fn) { this.playing = null; return; }
    this.playing = fn;
    const ms = fn();
    if (!ms) { this.playing = null; return this.next(); }
    // 次の演出が控えていれば消えずにそのまま切り替える（下の画面が一瞬見えないように）。
    // 何もなければ最後の 0.35 秒で薄くして、下の画面へ戻す
    const fade = Math.max(0, ms - 350);
    this.fadeT = setTimeout(() => { const el = document.getElementById("cine"); if (el && !this.q.length) el.classList.add("out"); }, fade);
    this.timer = setTimeout(() => this.next(), ms);
  },
  skip() { if (this.playing && this.playing.skippable !== false) this.next(); },

  /* 画面全体を覆う層を作る（tap で飛ばす） */
  layer(cls, html, skippable = true) {
    const el = document.createElement("div");
    el.id = "cine"; el.className = "cine " + cls + (Motion.reduced ? " reduced" : "");
    el.innerHTML = html;
    if (skippable) el.addEventListener("click", e => { e.stopPropagation(); this.skip(); });
    document.body.appendChild(el);
    return el;
  },
  /* 帯の中の大きな絵（アイコンのカードの絵） */
  art(pi) {
    const id = typeof playerIcon === "function" ? playerIcon(pi) : null;
    const c = id && DEF[id];
    return c && c.art ? `style="background-image:url('${esc(c.art)}')"` : "";
  },
  face(pi) {
    const id = typeof playerIcon === "function" ? playerIcon(pi) : null;
    return `<span class="cv-face">${id ? iconImgHTML(id) : `<span class="glyph">召</span>`}</span>`;
  },
  bands(extra = "") {
    const me = S.players[ME], op = S.players[OP];
    return `<div class="cv-band op" ${this.art(OP)}><div class="cv-plate">${this.face(OP)}<span class="cv-name"><b>${esc(op.name)}</b><small>${esc(op.deckName || "")}</small></span></div></div>
      <div class="cv-band me" ${this.art(ME)}><div class="cv-plate">${this.face(ME)}<span class="cv-name"><b>${esc(me.name)}</b><small>${esc(me.deckName || "")}</small></span></div></div>
      <div class="cv-seam" aria-hidden="true"></div>${extra}`;
  },

  /* ---------- 試合開始：VS ---------- */
  intro() {
    Sound.play("open");
    this.layer("intro", this.bands(`<div class="cv-vs" aria-label="VS">VS</div>`));
    setTimeout(() => Sound.play("hit"), Motion.reduced ? 0 : 650);
    return Motion.reduced ? 1200 : 2600;
  },

  /* ---------- じゃんけん：お互いの手が上と下から飛び出して、すぐ結果 ---------- */
  rps(last) {
    const v = last.winner == null ? "tie" : last.winner === ME ? "win" : "lose";
    const verdict = v === "tie" ? "あいこ！" : v === "win" ? "あなたの勝ち！" : "相手の勝ち";
    const hands = `相手：${RPS[last.hands[OP]]} ／ あなた：${RPS[last.hands[ME]]}`;
    const sub = hands + "　" + (v === "tie" ? "もう一度" : v === "win" ? "先攻か後攻かを選べます" : "相手が先攻か後攻かを選びます");
    const hand = (pi, cls) => `<div class="cv-hand ${cls} ${last.winner === pi ? "won" : last.winner == null ? "" : "lost"}">
        <img class="real" src="ui/rps-${last.hands[pi]}.webp" alt="" draggable="false"></div>`;
    this.layer("rpsc " + v, this.bands(`
      ${hand(OP, "op")}${hand(ME, "me")}
      <div class="cv-verdict ${v}"><b>${verdict}</b><small>${sub}</small></div>`));
    if (!Motion.reduced) {
      setTimeout(() => Sound.play("hit"), 260);
      setTimeout(() => Sound.play(v === "win" ? "rare" : v === "lose" ? "flip" : "click"), 560);
    }
    return Motion.reduced ? 1300 : 2000;
  },

  /* ---------- 先攻／後攻 ---------- */
  order() {
    const meFirst = S.first === ME;
    const card = (pi, cls) => `<div class="cv-ocard ${cls}"><div class="cv-oin">
        <span class="cv-oback"></span><span class="cv-ofront ${S.first === pi ? "first" : "second"}"><b>${S.first === pi ? "先攻" : "後攻"}</b></span></div></div>`;
    this.layer("orderc", this.bands(`${card(OP, "op")}${card(ME, "me")}
      <div class="cv-verdict ${meFirst ? "win" : "tie"}"><b>あなたは${meFirst ? "先攻" : "後攻"}</b><small>${meFirst ? "最初のターンはカードを引きません" : "「境界の欠片」（エナジー+1を1回）を持って始めます"}</small></div>`));
    if (!Motion.reduced) setTimeout(() => Sound.play("flip"), 700);
    return Motion.reduced ? 1500 : 2700;
  },

  /* ---------- ターンの始め ---------- */
  turn() {
    const mine = S.turn === ME;
    // その人にとって何ターン目か
    const own = Math.ceil(S.turnNo / 2);
    const el = this.layer("turnc " + (mine ? "mine" : "theirs"),
      `<div class="cv-turn"><b>${mine ? "あなたのターン" : "相手のターン"}</b><small>ターン${own}${mine ? ` ・ エナジー ${S.players[ME].e}` : ""}</small></div>`, false);
    el.style.pointerEvents = "none";
    if (mine) Sound.play("turn");
    return Motion.reduced ? 600 : 900;
  }
};
