/* ============================================================
   チュートリアル戦（2026-11-13）
   決まった手札・決まった CPU の動きで1戦。場面ごとに吹き出しで「次はこれ」と案内する。
   ・案内中は、案内した操作だけできる（違う操作はトーストで教える）
   ・はじめての人には、ホームに入ったときに一度だけ誘う（スキップ可）。一人で対戦からいつでも遊べる
   ・初めて勝つと報酬（TUT_REWARD）。受け取ったら Account.data.tut = "done"
   教えること：じゃんけん・先攻後攻・マリガン／エナジーとコスト／キャラを出す・攻撃・ターン終了／
              守護・魔法・速攻・キャラどうしの戦い・凍結・毒・登場時の効果／勝ち方
   ============================================================ */
const TUT_REWARD = { tickets: 1, gold: 300 };   // 初回クリアの報酬（パック券1枚＋300G）

const Tut = {
  i: 0,          // いまの案内の番号
  timer: 0,
  cpuN: 0,       // CPU の何ターン目か

  active: false,   // start() で true（newGame の途中は S.battle がまだ無いので、こちらで見分ける）
  on() { return !!(this.active && S && MODE === "cpu" && (!S.battle || S.battle.kind === "tutorial")); },
  done() { return !!(Account.data && Account.data.tut === "done"); },
  me() { return S.players[ME]; },
  op() { return S.players[OP]; },
  myUnit(id) { return this.me().field.find(u => u.id === id); },
  opUnit(id) { return this.op().field.find(u => u.id === id); },
  idOfUid(uid) { for (const p of S.players) { const u = p.field.find(x => x.uid === uid); if (u) return u.id; } return null; },

  /* ---------- デッキ（山札は pop で上から引くので、引く順の逆に並べる） ---------- */
  HAND: ["squire", "st-spark", "n-thornwarden", "pegasus", "st-water"],
  DRAWS: ["sage", "stargaze", "n-flowergirl", "garm"],   // 3・5・7・9ターン目に引くカード（先攻は1ターン目に引かない）。最後に強襲機ガルムで逆転
  FILL: ["stargaze", "eye", "st-knight", "archer", "n-flowergirl", "rally", "st-giant", "pegasus", "sage", "st-water"],   // 相手のカードと名前がかぶらないものだけ
  OPP_HAND: ["st-recruit", "st-golem", "turret", "x-rush", "f-blizzard"],
  OPP_FILL: ["st-knight", "st-rockman", "st-giant", "pegasus", "st-guard", "st-golem", "archer", "st-wolf", "sentinel", "sage"],
  pile(top, fill) {   // top：上から引く順
    const rest = []; while (rest.length + top.length < CONFIG.DECK_SIZE) rest.push(fill[rest.length % fill.length]);
    return [...rest, ...top.slice().reverse()].filter(id => DEF[id]);
  },
  deckOf(top, fill, name) { const cards = {}; this.pile(top, fill).forEach(id => cards[id] = (cards[id] || 0) + 1); return { name, cards }; },

  /* ---------- 始める ---------- */
  start() {
    if (!this.HAND.concat(this.DRAWS, this.OPP_HAND).every(id => DEF[id])) { toast("チュートリアルの準備ができていません（カードデータを確認してください）"); return; }
    this.i = 0; this.cpuN = 0; this.shown = false; this.active = true;
    const mine = { ...this.deckOf([...this.HAND, ...this.DRAWS], this.FILL, "チュートリアル用デッキ"), sample: true };
    const opp = { ...this.deckOf([...this.OPP_HAND], this.OPP_FILL, "訓練の相手"), key: "st-golem", icon: "st-golem" };
    startBattle({ kind: "tutorial", level: "easy", mine, opp, oppName: "訓練の相手", reward: 0, streak: false,
      setup: s => {
        s.players[0].deck = this.pile([...this.HAND, ...this.DRAWS], this.FILL);
        s.players[1].deck = this.pile([...this.OPP_HAND], this.OPP_FILL);
        s.players[0].hp = 4; s.players[0].maxHp = 4;    // 最後に「残り1」から逆転する筋書きのため、体力を少なくする
        s.players[1].hp = 9; s.players[1].maxHp = 9;
        s.mySample = false;   // 報酬は Tut.reward で別に出す（G は 0）
      } });
    this.loop();
  },
  loop() {
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (!this.on()) { this.hide(); clearInterval(this.timer); return; } this.update(); }, 300);
    this.update();
  },

  /* ---------- 案内の台本 ----------
     show(S)：この案内を出してよいか（出すまで待つ）
     done(S)：終わったか（終わると次へ）。next：true なら「次へ」ボタンで進む
     allow：この案内のあいだにできる操作 { play: カードID, to: 相手のカードID } / { attack: カードID, to: "player"|カードID } / { end: true } / { rps } / { first } / { keep }
     hl：光らせる場所（CSS セレクタを返す関数） */
  steps() {
    const T = this;
    const myTurn = () => S.phase === "play" && S.turn === ME && !busy;
    const turnIs = n => myTurn() && S.turnNo === n;
    const hand = id => `.hand [data-hand="${T.me().hand.indexOf(id)}"]`;
    const unitSel = (side, id) => { const u = (side === "me" ? T.me() : T.op()).field.find(x => x.id === id); return u ? `[data-uid="${u.uid}"]` : ""; };
    const face = () => `[data-player="${OP}"]`;
    const end = ".endbtn";
    return [
      { say: "ようこそ、召喚士！対戦の流れを1戦しながら覚えます。<br>対戦は<b>じゃんけん</b>から。好きな手を選んでください。",
        show: () => S.phase === "rps", done: () => S.phase !== "rps", allow: { rps: true }, hl: () => ".pg-hand" },
      { say: "勝つと<b>先攻・後攻</b>を選べます。<b>先攻</b>は先に動ける（最初のターンは引かない）。<b>後攻</b>は「境界の欠片」で1回だけエナジー+1。<br>今回は<b>先攻</b>を選びましょう。",
        show: () => S.phase === "choose" && S.rpsWinner === ME, done: () => S.phase !== "choose", allow: { first: true }, hl: () => ".pg-opt.first" },
      { say: "最初の手札は5枚。気に入らなければ<b>1回だけ全部引き直せます</b>（マリガン）。<br>今回は「<b>このまま始める</b>」を押しましょう。",
        show: () => S.phase === "mulligan" && S.mull[ME] == null, done: () => S.mull[ME] != null, allow: { keep: true }, hl: () => '[data-act="mull"][data-v="0"]' },
      { say: "あなたのターンです。カードを出すには<b>エナジー</b>を使います。毎ターン1ずつ増え、カードの<b>左上の数字（コスト）</b>だけ減ります。今は<b>1</b>。<br>※このチュートリアルでは、体力は<b>あなた4・相手9</b>から始まります。",
        show: () => turnIs(1), next: true, hl: () => `[data-player="${ME}"] .energy` },
      { say: "コスト1の<b>見習い剣士</b>を出しましょう。手札から自分の場へ<b>ドラッグ</b>するか、<b>タップ</b>して「出す」。",
        show: () => turnIs(1), done: () => !!T.myUnit("squire"), allow: { play: "squire" }, hl: () => hand("squire") },
      { say: "出したキャラは、ふつう<b>そのターンは攻撃できません</b>。「<b>ターン終了</b>」を押しましょう。",
        show: () => turnIs(1) && !!T.myUnit("squire"), done: () => S.turn !== ME, allow: { end: true }, hl: () => end },

      { say: "相手は<b>見習い兵</b>を出しました。見習い兵は<b>守護</b>持ち。守護がいる間は、ほかのキャラや相手本体を攻撃できません。<b>先に倒しましょう</b>。",
        show: () => turnIs(3) && !!T.opUnit("st-recruit"), next: true, hl: () => unitSel("op", "st-recruit") },
      { say: "<b>魔法</b>「小さな火花」で、見習い兵に2ダメージ。<br>魔法は、カードを<b>相手の見習い兵の上までドラッグして離す</b>と使えます（カードをタップ→見習い兵をタップでもOK）。",
        show: () => turnIs(3), done: () => !T.opUnit("st-recruit"), allow: { play: "st-spark", to: "st-recruit" }, hl: () => T.me().hand.includes("st-spark") ? `${hand("st-spark")}, ${unitSel("op", "st-recruit")}` : unitSel("op", "st-recruit") },
      { say: "魔法は使うとすぐ効果が出て、捨て札へ。<br>守護がいなくなったので、<b>見習い剣士</b>を<b>相手の顔までドラッグ</b>して攻撃しましょう（タップ→相手の顔でもOK）。",
        show: () => turnIs(3) && !T.opUnit("st-recruit"), done: () => T.op().hp <= 7, allow: { attack: "squire", to: "player" }, hl: () => `${unitSel("me", "squire")}, ${face()}` },
      { say: "<b>攻撃力（左下の数字）</b>のぶん、相手の体力が減りました。<b>相手の体力を0にすれば勝ち</b>です。「<b>ターン終了</b>」。",
        show: () => turnIs(3) && T.op().hp <= 7, done: () => S.turn !== ME, allow: { end: true }, hl: () => end },

      { say: "相手は<b>訓練用ゴーレム</b>（攻撃2・体力3）を出しました。キャラは<b>左下が攻撃力、右下が体力</b>。<br>守りに<b>茨の番人</b>を出しましょう。<b>守護</b>で相手の攻撃を引きつけ、<b>毒</b>で戦った相手を必ず破壊します。",
        show: () => turnIs(5), done: () => !!T.myUnit("n-thornwarden"), allow: { play: "n-thornwarden" }, hl: () => `${hand("n-thornwarden")}, ${unitSel("op", "st-golem")}` },
      { say: "<b>見習い剣士</b>でもう一度、相手本体を攻撃しましょう。",
        show: () => turnIs(5) && !!T.myUnit("n-thornwarden"), done: () => T.op().hp <= 5, allow: { attack: "squire", to: "player" }, hl: () => `${unitSel("me", "squire")}, ${face()}` },
      { say: "「<b>ターン終了</b>」。相手のゴーレムは、守護の茨の番人を攻撃するしかありません。",
        show: () => turnIs(5) && T.op().hp <= 5, done: () => S.turn !== ME, allow: { end: true }, hl: () => end },

      { say: "ゴーレムは守護の茨の番人を攻撃し、<b>毒で破壊</b>されました（番人も相打ち）。<br>相手は<b>境界の欠片</b>でエナジーを増やし、<b>砲台ユニット</b>（登場時：あなたに2ダメージ）と<b>突撃ドローン</b>を出しました。体力が<b>2</b>に…！",
        show: () => turnIs(7), next: true, hl: () => [unitSel("op", "turret"), unitSel("op", "x-rush"), `[data-player="${ME}"] .hp, [data-player="${ME}"] .hpgem`].filter(Boolean).join(", ") },
      { say: "キャラどうしを戦わせましょう。<b>見習い剣士</b>を<b>突撃ドローン</b>までドラッグして攻撃。<br>戦うと、<b>お互いに相手の攻撃力ぶんのダメージ</b>を受けます。",
        show: () => turnIs(7), done: () => !T.opUnit("x-rush"), allow: { attack: "squire", to: "x-rush" }, hl: () => `${unitSel("me", "squire")}, ${unitSel("op", "x-rush")}` },
      { say: "相打ちです。体力が0になったキャラは破壊されます。<br>次に備えて<b>天馬の騎士</b>を出しておきましょう。",
        show: () => turnIs(7) && !T.opUnit("x-rush"), done: () => !!T.myUnit("pegasus"), allow: { play: "pegasus" }, hl: () => hand("pegasus") },
      { say: "「<b>ターン終了</b>」を押しましょう。",
        show: () => turnIs(7) && !!T.myUnit("pegasus"), done: () => S.turn !== ME, allow: { end: true }, hl: () => end },

      { say: "<b>ピンチ！</b>相手の<b>吹雪</b>で、天馬の騎士が<b>凍結</b>（このターン攻撃できない）。砲台の攻撃で、あなたの体力は<b>残り1</b>。<br>相手の体力は<b>5</b>。次のターンを迎えたら負けです…",
        show: () => turnIs(9), next: true, hl: () => [unitSel("me", "pegasus"), unitSel("op", "turret"), face()].filter(Boolean).join(", ") },
      { say: "でも、引いたのは<b>強襲機ガルム</b>（攻撃5）！ガルムは<b>速攻</b>：<b>出したターンにすぐ攻撃できます</b>。<br>出しましょう。",
        show: () => turnIs(9), done: () => !!T.myUnit("garm"), allow: { play: "garm" }, hl: () => hand("garm") },
      { say: "<b>ガルムで相手本体を攻撃して、逆転勝利だ！</b>",
        show: () => turnIs(9) && !!T.myUnit("garm"), done: () => S.over, allow: { attack: "garm", to: "player" }, hl: () => `${unitSel("me", "garm")}, ${face()}` }
    ];
  },
  cur() { const st = this.steps(); return st[this.i] || null; },

  /* ---------- 操作の制限（game.js の doPlay・doAttack・doEnd などから呼ぶ） ----------
     返り値 true：やってよい */
  allow(kind, a = {}) {
    if (!this.on()) return true;
    const st = this.cur();
    if (!st || !st.allow || !this.shown) { this.nudge("今は吹き出しの案内を読んでね"); return false; }
    const w = st.allow;
    let ok = false;
    if (kind === "rps") ok = !!w.rps;
    else if (kind === "choose") ok = !!w.first && a.first;
    else if (kind === "mull") ok = !!w.keep && !a.redraw;
    else if (kind === "end") ok = !!w.end;
    else if (kind === "begin") ok = w.play === a.id;
    else if (kind === "play") ok = w.play === a.id && (!w.to || Object.values(a.targets || {}).some(uid => this.idOfUid(uid) === w.to));
    else if (kind === "attack") ok = w.attack === a.id && (w.to === "player" ? a.target === "player" : this.idOfUid(a.target) === w.to);
    if (!ok) this.nudge();
    return ok;
  },
  nudge(msg) {
    toast(msg || "今は、吹き出しで案内している操作をしてみてね");
    const b = document.getElementById("tutbox"); if (b) { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); }
  },

  /* ---------- 相手（決まった動き） ---------- */
  CPU: [
    [{ play: "st-recruit" }],
    [{ play: "st-golem" }],
    [{ attack: "st-golem", to: "n-thornwarden" }, { play: "coin" }, { play: "turret" }, { play: "x-rush" }],
    [{ attack: "turret", to: "player" }, { play: "f-blizzard" }]
  ],
  cpuActions() {
    const plan = this.CPU[this.cpuN++] || null;
    if (!plan) return null;   // 台本が終わったら、ふつうの CPU（初級）に任せる
    const op = S.players[1], me = S.players[0], out = [];
    plan.forEach(x => {
      if (x.play) { const idx = op.hand.indexOf(x.play); if (idx >= 0) out.push({ t: "play", id: x.play }); }
      if (x.attack) out.push({ t: "attack", id: x.attack, to: x.to });
    });
    return out.map(x => () => {   // その時点の場で、手札の位置・キャラの番号を探す
      if (x.t === "play") { const idx = op.hand.indexOf(x.id); return idx >= 0 ? { t: "play", idx, id: x.id, targets: {} } : null; }
      const u = op.field.find(v => v.id === x.id && v.ready); if (!u) return null;
      if (x.to === "player") return { t: "attack", uid: u.uid, target: "player" };
      const tgt = me.field.find(v => v.id === x.to) || me.field[0];
      return tgt ? { t: "attack", uid: u.uid, target: tgt.uid } : { t: "attack", uid: u.uid, target: "player" };
    });
  },

  /* ---------- 吹き出しと光 ---------- */
  update() {
    if (!this.on()) return this.hide();
    const st = this.steps();
    // 終わった案内は先へ（いくつ進んでもよい）
    for (let k = 0; k < 4; k++) {
      const s = st[this.i];
      if (!s) break;
      if (this.shown && s.done && s.done()) { this.i++; this.shown = false; continue; }
      break;
    }
    const s = st[this.i];
    if (S.over) { this.hide(); return; }
    if (!s) return this.hide();
    const can = s.show ? s.show() : true;
    if (!can || (typeof Cinema !== "undefined" && Cinema.busy && Cinema.busy())) { this.hide(true); return; }
    this.shown = true;
    this.draw(s);
    // カードをドラッグしている間は、吹き出しを薄くして下が見えるように（指の邪魔をしない）
    const b = document.getElementById("tutbox");
    if (b) b.classList.toggle("faded", typeof drag !== "undefined" && !!(drag && drag.started));
  },
  draw(s) {
    let b = document.getElementById("tutbox");
    if (!b) { b = document.createElement("div"); b.id = "tutbox"; b.setAttribute("role", "status"); document.body.appendChild(b); }
    const key = this.i + (s.next ? "n" : "");
    if (b.dataset.k !== key) {
      b.dataset.k = key;
      b.innerHTML = `<div class="tut-in"><span class="tut-face" aria-hidden="true" ${DEF.squire && DEF.squire.art ? `style="background-image:url('${esc(DEF.squire.art)}')"` : ""}></span><div class="tut-txt"><small>チュートリアル ${this.i + 1}/${this.steps().length}</small><p>${s.say}</p>
        ${s.next ? `<button type="button" class="btn sm primary" data-act="tutNext">次へ</button>` : ""}</div>
        <button type="button" class="tut-x" data-act="tutQuit" aria-label="チュートリアルをやめる">やめる</button></div>`;
      b.classList.remove("in"); void b.offsetWidth; b.classList.add("in");
    }
    // いまの場面に合わせて、上か下に置く（相手の場を指すときは下、それ以外は上）
    b.hidden = false;
    this.place(b, s);
    // 光らせる
    document.querySelectorAll(".tut-hl").forEach(e => e.classList.remove("tut-hl"));
    const sel = s.hl ? s.hl() : "";
    if (sel) sel.split(",").map(x => x.trim()).filter(Boolean).forEach(q => { try { document.querySelectorAll(q).forEach(e => e.classList.add("tut-hl")); } catch (e) {} });
  },
  /* 吹き出しの置き場所：光らせる場所（と話題の相手のキャラ）に重ならない所を、上・真ん中・手札の上から選ぶ */
  safeTop() {   // iPhone の時計・電池の表示の下から（env(safe-area-inset-top) を測る）
    if (this._sat == null) { const d = document.createElement("div"); d.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none"; document.body.appendChild(d); this._sat = d.offsetHeight || 0; d.remove(); }
    return this._sat;
  },
  place(b, s) {
    const H = window.innerHeight, h = b.offsetHeight || 120, sat = this.safeTop();
    const rects = [...document.querySelectorAll(".tut-hl")].map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);
    const hand = document.querySelector("#app .hand"), mid = document.querySelector("#app .mid"), opBar = document.querySelector("#app .pbar");
    const handTop = hand ? hand.getBoundingClientRect().top : H - 200;
    const cands = S.phase !== "play" ? [sat + 8, H - h - 12] : [
      opBar ? opBar.getBoundingClientRect().bottom + 4 : 64,
      mid ? mid.getBoundingClientRect().top + mid.getBoundingClientRect().height / 2 - h / 2 : H * 0.38,
      handTop - h - 6
    ];
    const over = top => rects.reduce((a, r) => a + Math.max(0, Math.min(top + h, r.bottom) - Math.max(top, r.top)) * Math.max(0, Math.min(window.innerWidth, r.right) - Math.max(0, r.left)), 0);
    let best = cands[0], bv = Infinity;
    cands.forEach(t => { t = Math.max(sat + 4, Math.min(H - h - 4, t)); const v = over(t); if (v < bv - 1) { bv = v; best = t; } });
    b.style.top = Math.round(best) + "px";
  },
  hide(keep) {
    const b = document.getElementById("tutbox"); if (b) b.hidden = true;
    if (!keep) document.querySelectorAll(".tut-hl").forEach(e => e.classList.remove("tut-hl"));
  },
  next() { const s = this.cur(); if (s && s.next) { this.i++; this.shown = false; this.update(); } },
  quit() {
    this.hide(); clearInterval(this.timer); this.active = false;
    S = null; MODE = null; app.classList.remove("battle", "pre"); app.innerHTML = "";
    showSolo();
  },

  /* ---------- 報酬（初めて勝ったとき） ---------- */
  reward(res) {
    if (res !== "win" || !Account.data || !["ready", "offline"].includes(Account.status)) return null;
    if (this.done()) return { already: true };
    Account.data.tut = "done";
    Account.data.tickets = Account.tickets + TUT_REWARD.tickets;
    if (TUT_REWARD.gold) Account.addGold(TUT_REWARD.gold); else Account.saveNow();
    return { ...TUT_REWARD };
  },
  resultHTML(r) {
    if (!r) return `<p class="callout">チュートリアルは、いつでも「一人で対戦」から遊び直せます。</p>`;
    if (r.already) return `<p class="callout">チュートリアルの報酬は受け取り済みです。</p>`;
    return `<div class="callout tut-reward"><b>チュートリアルクリア！</b>報酬：パック券${r.tickets}枚${r.gold ? `・${r.gold}G` : ""}<br>次はクエスト掲示板の「進め方」を見て、カードを集めていきましょう。</div>`;
  },

  /* ---------- はじめての人を誘う（ホームに入ったとき一度だけ） ---------- */
  invite() {
    if (!Account.data || Account.data.tut || this.invited || !["ready", "offline"].includes(Account.status)) return false;
    this.invited = true;
    const box = document.createElement("div");
    box.className = "dmodal tut-invite";
    box.innerHTML = `<div class="dmodal-in confirmbox" role="alertdialog" aria-label="チュートリアル">
      <b class="dm-name">チュートリアルで遊び方を覚えよう</b>
      <p class="dm-text">1戦しながら、カードの出し方・攻撃・魔法・キーワードを案内します（5分ほど）。<br>クリアすると<b>パック券${TUT_REWARD.tickets}枚${TUT_REWARD.gold ? `と${TUT_REWARD.gold}G` : ""}</b>がもらえます。</p>
      <div class="pre-btns"><button type="button" class="btn primary" data-act="tutGo">始める</button><button type="button" class="btn" data-act="tutSkip">スキップ</button></div>
      <p class="hint">スキップしても、「一人で対戦」からいつでも遊べます（報酬も受け取れます）。</p></div>`;
    document.body.appendChild(box);
    return true;
  },
  closeInvite() { document.querySelectorAll(".tut-invite").forEach(e => e.remove()); },

  handleAct(act) {
    switch (act) {
      case "tutorial": this.closeInvite(); this.start(); return true;
      case "tutGo": this.closeInvite(); this.start(); return true;
      case "tutSkip": this.closeInvite(); if (Account.data && !Account.data.tut) { Account.data.tut = "skip"; Account.saveNow(); } toast("「一人で対戦」からいつでも遊べます"); return true;
      case "tutNext": this.next(); return true;
      case "tutQuit": this.quit(); return true;
    }
    return false;
  }
};
