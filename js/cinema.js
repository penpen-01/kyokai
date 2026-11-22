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

  /* ---------- 試合開始：VS（2026-11-23 作り直し） ----------
     1 暗転して、真ん中に斜めの光の裂け目（境界）が走る
     2 上から相手、下から自分の帯がすべり込む（代表カードの絵を大きく。名前・称号・デッキ名）
     3 VS の紋章が叩きつけられる（白い光・衝撃の輪・火花・帯が揺れる）
     4 帯が上下に割れて退場し、「BATTLE START」 */
  intro() {
    Sound.play("open");
    // 絵は要素に直接（変数に url() を入れると、CSS のファイルの場所から探してしまい出なかった）
    const art = pi => { const c = this.keyCard(pi); return c && c.art ? `style="background-image:url('${esc(c.art)}')"` : ""; };
    const side = (pi, cls) => { const p = S.players[pi];
      return `<div class="bi-side ${cls}"><i class="bi-art" ${art(pi)}></i><i class="bi-tint"></i>
        <div class="bi-plate">${this.face(pi)}<span class="cv-name"><b>${esc(p.name)}</b>${p.title ? `<em>${esc(p.title)}</em>` : ""}<small>${esc(p.deckName || "")}</small></span></div></div>`; };
    const sparks = Array.from({ length: 24 }, () => `<i style="--a:${Math.round(Math.random() * 360)}deg;--d:${Math.round(70 + Math.random() * 130)}px;--t:${(Math.random() * .2).toFixed(2)}s;--c:${Math.random() < .5 ? "#ffd27a" : "#9fd8ff"}"></i>`).join("");
    const el = this.layer("intro2", `${side(OP, "op")}${side(ME, "me")}<div class="bi-rift"></div>
      <div class="bi-vs"><i class="bi-ring"></i><i class="bi-ring r2"></i><img src="ui/bt/vs.webp" alt="VS" draggable="false"><span class="bi-sparks">${sparks}</span></div>
      <div class="bi-start"><span>BATTLE START</span></div>`);
    el.style.setProperty("--ang", `${(Math.atan2(-0.112 * innerHeight, innerWidth) * 180 / Math.PI).toFixed(2)}deg`);
    if (!Motion.reduced) {
      setTimeout(() => Sound.play("hit"), 820);
      setTimeout(() => Sound.play("destroy"), 860);
      setTimeout(() => Sound.play("rare", 1), 2150);
      setTimeout(() => { try { navigator.vibrate && navigator.vibrate(30); } catch (e) {} }, 820);
    }
    return Motion.reduced ? 1200 : 3100;
  },

  /* ---------- じゃんけん：お互いのカードが裏から表へめくれて、勝った方が光り、負けた方は砕ける ---------- */
  rps(last) {
    const v = last.winner == null ? "tie" : last.winner === ME ? "win" : "lose";
    const verdict = v === "tie" ? "あいこ！" : v === "win" ? "あなたの勝ち！" : "相手の勝ち";
    const card = (pi, cls) => `<div class="br-card ${cls} ${last.winner === pi ? "won" : last.winner == null ? "tie" : "lost"}"><div class="br-in">
        <i class="br-back"></i><img class="br-front" src="ui/bt/rps-${last.hands[pi]}.webp" alt="${RPS[last.hands[pi]]}" draggable="false"></div></div>`;
    this.layer("rps2 " + v, `<i class="br-bg"></i>${card(OP, "op")}${card(ME, "me")}
      <div class="br-verdict ${v}"><b>${verdict}</b><small>相手：${RPS[last.hands[OP]]} ／ あなた：${RPS[last.hands[ME]]}</small></div>`);
    if (!Motion.reduced) {
      setTimeout(() => Sound.play("flip"), 380);
      setTimeout(() => Sound.play(v === "tie" ? "click" : "hit"), 820);
      setTimeout(() => Sound.play(v === "win" ? "rare" : v === "lose" ? "destroy" : "click"), 1000);
    }
    return Motion.reduced ? 1300 : 2300;
  },

  /* ---------- 先攻／後攻：紋章が叩きつけられ、後ろで光が回り、光の輪が広がる ---------- */
  order() {
    const meFirst = S.first === ME, k = meFirst ? "first" : "second";
    this.layer("order2 " + k, `<i class="bo-rays"></i>
      <div class="bo-emb"><i class="bi-ring"></i><i class="bi-ring r2"></i><img src="ui/bt/${k}.webp" alt="" draggable="false"></div>
      <div class="bo-txt"><span>${meFirst ? "FIRST" : "SECOND"}</span><b>${meFirst ? "先攻" : "後攻"}</b><small>${meFirst ? "最初のターンはカードを引きません" : "「境界の欠片」を持って始めます"}</small></div>`);
    if (!Motion.reduced) {
      setTimeout(() => { Sound.play("hit"); Sound.play(meFirst ? "rare" : "buff"); }, 560);
      setTimeout(() => { try { navigator.vibrate && navigator.vibrate(25); } catch (e) {} }, 560);
    }
    return Motion.reduced ? 1400 : 2700;
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
