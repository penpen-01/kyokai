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
  HAND: ["squire", "st-spark", "thunder", "n-mist", "n-thornwarden"],
  DRAWS: ["pegasus", "sage", "dragon", "st-water"],   // 2〜5ターン目に引くカード（先攻は1ターン目に引かない）
  FILL: ["stargaze", "eye", "st-knight", "archer", "n-flowergirl", "rally", "st-giant", "pegasus", "sage", "st-water"],   // 相手のカードと名前がかぶらないものだけ
  OPP_HAND: ["st-recruit", "st-golem", "st-wolf", "st-infantry", "st-guard"],
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
        s.players[1].hp = 12; s.players[1].maxHp = 12;
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
      { say: "ようこそ、召喚士！ここでは対戦の流れを、1戦しながら覚えます。<br>対戦は<b>じゃんけん</b>から始まります。好きな手を選んでください。",
        show: () => S.phase === "rps", done: () => S.phase !== "rps", allow: { rps: true }, hl: () => ".pg-hand" },
      { say: "じゃんけんに勝つと<b>先攻・後攻</b>を選べます。<br><b>先攻</b>：先に動ける（最初のターンはカードを引かない）<br><b>後攻</b>：「境界の欠片」で1回だけエナジー+1<br>今回は<b>先攻</b>を選びましょう。",
        show: () => S.phase === "choose" && S.rpsWinner === ME, done: () => S.phase !== "choose", allow: { first: true }, hl: () => ".pg-opt.first" },
      { say: "最初の手札は5枚。気に入らなければ<b>1回だけ全部引き直せます</b>（マリガン）。<br>今回はいい手札なので「<b>このまま始める</b>」を押しましょう。",
        show: () => S.phase === "mulligan" && S.mull[ME] == null, done: () => S.mull[ME] != null, allow: { keep: true }, hl: () => '[data-act="mull"][data-v="0"]' },
      { say: "あなたのターンです。<br>カードを出すには<b>エナジー</b>を使います。エナジーは毎ターン1ずつ増え（最大10）、カードの<b>左上の数字（コスト）</b>だけ減ります。今は<b>1</b>です。",
        show: () => turnIs(1), next: true, hl: () => `[data-player="${ME}"] .ebox, [data-player="${ME}"] .energy` },
      { say: "コスト1の<b>見習い剣士</b>を場に出しましょう。<br>手札から自分の場へ<b>ドラッグ</b>するか、カードを<b>タップ</b>して「出す」を押します。",
        show: () => turnIs(1), done: () => !!T.myUnit("squire"), allow: { play: "squire" }, hl: () => hand("squire") },
      { say: "出したキャラは、ふつう<b>そのターンは攻撃できません</b>。<br>エナジーを使い切ったので「<b>ターン終了</b>」を押しましょう。",
        show: () => turnIs(1) && !!T.myUnit("squire"), done: () => S.turn !== ME, allow: { end: true }, hl: () => end },

      { say: "相手のターンが終わりました。相手は<b>見習い兵</b>を出しています。<br>見習い兵は<b>守護</b>を持っています。守護のキャラがいる間、ほかのキャラや相手本体は攻撃できません。<b>先に守護を倒しましょう</b>。",
        show: () => turnIs(3) && !!T.opUnit("st-recruit"), next: true, hl: () => unitSel("op", "st-recruit") },
      { say: "<b>魔法</b>「小さな火花」（コスト1）で見習い兵に2ダメージを与えます。<br>カードを出して、相手の<b>見習い兵</b>を選んでください。",
        show: () => turnIs(3), done: () => !T.opUnit("st-recruit"), allow: { play: "st-spark", to: "st-recruit" }, hl: () => T.me().hand.includes("st-spark") ? `${hand("st-spark")}, ${unitSel("op", "st-recruit")}` : unitSel("op", "st-recruit") },
      { say: "魔法は、使うとすぐに効果が出て捨て札に行きます。<br>守護がいなくなったので、<b>見習い剣士</b>で<b>相手本体</b>を攻撃しましょう。剣士を相手の顔へドラッグ（またはタップ→相手の顔）。",
        show: () => turnIs(3) && !T.opUnit("st-recruit"), done: () => T.op().hp <= 10, allow: { attack: "squire", to: "player" }, hl: () => `${unitSel("me", "squire")}, ${face()}` },
      { say: "攻撃力（左下の数字）のぶん、相手の体力が減りました。<b>相手の体力を0にすれば勝ち</b>です。<br>「<b>ターン終了</b>」を押しましょう。",
        show: () => turnIs(3) && T.op().hp <= 10, done: () => S.turn !== ME, allow: { end: true }, hl: () => end },

      { say: "相手は<b>訓練用ゴーレム</b>を出しました。キャラの<b>左下が攻撃力、右下が体力</b>です。<br><b>雷霆の戦士</b>は<b>速攻</b>を持っています。速攻のキャラは、<b>出したターンにすぐ攻撃できます</b>。出しましょう。",
        show: () => turnIs(5), done: () => !!T.myUnit("thunder"), allow: { play: "thunder" }, hl: () => `${hand("thunder")}, ${unitSel("op", "st-golem")}` },
      { say: "<b>雷霆の戦士</b>で相手本体を攻撃しましょう。<br>（ゴーレムは守護ではないので、相手本体をねらえます）",
        show: () => turnIs(5) && !!T.myUnit("thunder"), done: () => T.op().hp <= 7, allow: { attack: "thunder", to: "player" }, hl: () => `${unitSel("me", "thunder")}, ${face()}` },
      { say: "<b>見習い剣士</b>も攻撃しましょう。",
        show: () => turnIs(5) && T.op().hp <= 7, done: () => T.op().hp <= 5, allow: { attack: "squire", to: "player" }, hl: () => `${unitSel("me", "squire")}, ${face()}` },
      { say: "いい調子です！「<b>ターン終了</b>」を押しましょう。",
        show: () => turnIs(5) && T.op().hp <= 5, done: () => S.turn !== ME, allow: { end: true }, hl: () => end },

      { say: "相手のゴーレムが、雷霆の戦士を攻撃してきました。<br>キャラどうしで戦うと、<b>お互いに相手の攻撃力ぶんのダメージ</b>を受けます。体力が0になると破壊。今回は相打ちでした。",
        show: () => turnIs(7), next: true },
      { say: "相手の<b>森の狼</b>（攻撃4）は強力です。魔法「<b>迷いの霧</b>」で<b>凍結</b>させましょう。<br>凍結したキャラは<b>次のターン攻撃できません</b>。さらにカードを1枚引けます。",
        show: () => turnIs(7), done: () => { const w = T.opUnit("st-wolf"); return !w || w.frozen; }, allow: { play: "n-mist", to: "st-wolf" }, hl: () => T.me().hand.includes("n-mist") ? `${hand("n-mist")}, ${unitSel("op", "st-wolf")}` : unitSel("op", "st-wolf") },
      { say: "次は<b>茨の番人</b>を出しましょう。<br><b>守護</b>：相手はこのキャラを先に攻撃しなければならない<br><b>毒</b>：戦った相手のキャラを、体力に関係なく破壊する",
        show: () => turnIs(7) && T.opUnit("st-wolf") && T.opUnit("st-wolf").frozen, done: () => !!T.myUnit("n-thornwarden"), allow: { play: "n-thornwarden" }, hl: () => hand("n-thornwarden") },
      { say: "<b>見習い剣士</b>で相手本体を攻撃しましょう。",
        show: () => turnIs(7) && !!T.myUnit("n-thornwarden"), done: () => T.op().hp <= 3, allow: { attack: "squire", to: "player" }, hl: () => `${unitSel("me", "squire")}, ${face()}` },
      { say: "「<b>ターン終了</b>」を押しましょう。凍結した狼は、次の相手のターンに攻撃できません。",
        show: () => turnIs(7) && T.op().hp <= 3, done: () => S.turn !== ME, allow: { end: true }, hl: () => end },

      { say: "手札の<b>炎竜</b>（コスト5）は、<b>登場時</b>に「相手のキャラすべてに2ダメージ」を与えます。<br>「登場時」の効果は、<b>場に出したときに1回</b>発動します。出しましょう。",
        show: () => turnIs(9), done: () => !!T.myUnit("dragon"), allow: { play: "dragon" }, hl: () => [hand("dragon"), unitSel("op", "st-wolf"), unitSel("op", "st-infantry")].filter(Boolean).join(", ") },
      { say: "相手の場が崩れました。<b>とどめ</b>です！<br><b>見習い剣士</b>で相手本体を攻撃しましょう。",
        show: () => turnIs(9) && !!T.myUnit("dragon"), done: () => T.op().hp <= 1, allow: { attack: "squire", to: "player" }, hl: () => `${unitSel("me", "squire")}, ${face()}` },
      { say: "最後に<b>茨の番人</b>で攻撃！",
        show: () => turnIs(9) && T.op().hp <= 1, done: () => S.over, allow: { attack: "n-thornwarden", to: "player" }, hl: () => `${unitSel("me", "n-thornwarden")}, ${face()}` }
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
    [{ attack: "st-golem", to: "thunder" }, { play: "st-wolf" }],
    [{ play: "st-infantry" }]
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
  place(b, s) {
    const H = window.innerHeight, h = b.offsetHeight || 120;
    const rects = [...document.querySelectorAll(".tut-hl")].map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);
    const hand = document.querySelector("#app .hand"), mid = document.querySelector("#app .mid"), opBar = document.querySelector("#app .pbar");
    const handTop = hand ? hand.getBoundingClientRect().top : H - 200;
    const cands = S.phase !== "play" ? [8, H - h - 12] : [
      opBar ? opBar.getBoundingClientRect().bottom + 4 : 64,
      mid ? mid.getBoundingClientRect().top + mid.getBoundingClientRect().height / 2 - h / 2 : H * 0.38,
      handTop - h - 6
    ];
    const over = top => rects.reduce((a, r) => a + Math.max(0, Math.min(top + h, r.bottom) - Math.max(top, r.top)) * Math.max(0, Math.min(window.innerWidth, r.right) - Math.max(0, r.left)), 0);
    let best = cands[0], bv = Infinity;
    cands.forEach(t => { t = Math.max(4, Math.min(H - h - 4, t)); const v = over(t); if (v < bv - 1) { bv = v; best = t; } });
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
