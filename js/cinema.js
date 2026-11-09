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
    if (this.q.length && typeof Mull !== "undefined" && Mull.busy) { this.playing = "wait"; this.timer = setTimeout(() => this.next(), 100); return; }   // 手札を配り終わってから
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
  /* デッキの代表カード（なければアイコンのカード） */
  keyCard(pi) {
    const d = S.decks && S.decks[pi];
    // デッキ編成で決めた代表カード（★）。決めていなければ、いちばんレアで重いカード
    if (d && d.key && DEF[d.key] && DEF[d.key].art && (d.cards || {})[d.key]) return DEF[d.key];
    const R = ["common", "rare", "sr", "ur", "legend"];
    const k = d && Object.keys(d.cards || {}).map(id => DEF[id]).filter(c => c && c.art).sort((a, b) => R.indexOf(b.rarity) - R.indexOf(a.rarity) || b.cost - a.cost)[0];
    if (k) return k;
    const id = typeof playerIcon === "function" ? playerIcon(pi) : null;
    return id && DEF[id] && DEF[id].art ? DEF[id] : null;
  },
  /* 帯の中の大きな絵（代表カードの絵をぼかして敷く） */
  art(pi) {
    const c = this.keyCard(pi);
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
  /* お互いのデッキの代表カードが斜めから飛び込んでぶつかり、はじけて左右に分かれ、VS */
  intro() {
    Sound.play("open");
    const kc = (pi, cls) => { const c = this.keyCard(pi); return c ? `<div class="cv-kc ${cls}">${cardHTML(c, { static: true })}</div>` : ""; };
    this.layer("intro", this.bands(`<div class="cv-clash">${kc(OP, "op")}${kc(ME, "me")}<i class="cv-boom"></i></div><div class="cv-vs" aria-label="VS">VS</div>`));
    if (!Motion.reduced) { setTimeout(() => Sound.play("destroy"), 480); setTimeout(() => Sound.play("hit"), 1050); }
    return Motion.reduced ? 1200 : 2900;
  },

  /* ---------- じゃんけん：お互いの手が上と下から飛び出して、すぐ結果 ---------- */
  rps(last) {
    const v = last.winner == null ? "tie" : last.winner === ME ? "win" : "lose";
    const verdict = v === "tie" ? "あいこ！" : v === "win" ? "あなたの勝ち！" : "相手の勝ち";
    const hands = `相手：${RPS[last.hands[OP]]} ／ あなた：${RPS[last.hands[ME]]}`;
    const sub = hands;
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
  /* 先攻／後攻：大きな紋章が叩きつけられて、光の輪が広がる */
  order() {
    const meFirst = S.first === ME;
    // 光が集まる → 紋章のコインが高速で回る → 減速して表が決まる → 閃光と光の輪 → 説明
    this.layer("orderc", this.bands(`<div class="cv-emb ${meFirst ? "first" : "second"}">
        <i class="cv-gather"></i><i class="cv-ring"></i><i class="cv-ring r2"></i><i class="cv-ring r3"></i>
        <div class="cv-coin"><div class="cv-coin-in">
          <div class="cv-medal cv-face-back"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 10 62 38 90 50 62 62 50 90 38 62 10 50 38 38z" fill="none" stroke="#e9c873" stroke-width="3"/><circle cx="50" cy="50" r="9" fill="#e9c873"/></svg></div>
          <div class="cv-medal cv-face-front"><span>${meFirst ? "FIRST" : "SECOND"}</span><b>${meFirst ? "先攻" : "後攻"}</b></div>
        </div></div>
        <i class="cv-burst"></i>
        <p class="cv-emb-sub">${meFirst ? "最初のターンはカードを引きません" : "「境界の欠片」を持って始めます"}</p>
      </div>`));
    if (!Motion.reduced) {
      [200, 420, 640, 860, 1060].forEach(t => setTimeout(() => Sound.play("flip"), t));
      setTimeout(() => { Sound.play("hit"); Sound.play(meFirst ? "rare" : "buff"); }, 1450);
    }
    return Motion.reduced ? 1400 : 3300;
  },

  /* ---------- マリガンのあと：決まった手札を見せる ---------- */
  hand() {
    const p = S.players[ME];
    const ids = handOrder(p).map(i => p.hand[i]).filter(id => DEF[id]);
    this.layer("handc", `<div class="cv-hand-show"><b>あなたの手札はこれになりました</b>
      <div class="pg-hand5">${ids.map((id, k) => `<div class="pg-hc" style="--i:${k}">${cardHTML(DEF[id], { static: true })}</div>`).join("")}</div>
      <small>タップで進む</small></div>`);
    return Motion.reduced ? 1500 : 2600;
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
