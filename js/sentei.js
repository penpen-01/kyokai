/* 選定戦（2026-11-17）
   入場料（G）を払って、3枚ずつの2つのセットから1つを選ぶのを10回くり返し、その場で30枚のデッキを作る。
   そのデッキで CPU と戦い、7勝するか2敗したら終わり。勝った数で報酬が決まる。
   ・候補に出るカード：開放している弾のカード（持っていなくてもよい）。ボス限定・トークンと、工房で「出さない」にしたカードは出ない
   ・同じカードは3枚まで（3枚選んだカードは、もう候補に出ない）
   ・後半は、各セットの1枚目のレア度が確定（7・8回目＝SR以上、9回目＝UR以上、10回目＝レジェンド）
   ・CPU のデッキも同じ決まりで毎回作り直す。勝つほど CPU が強くなり、最後（7勝目をかけた戦い）だけ CPU のカードの質が上がる
   ・対戦の途中でやめて戻ると、その対戦は負けに数える（やり直しで負けを消せないように）
   ピックの仕組み（Sentei.offer / Sentei.botDeck）は、友達との選定戦（取り合い）でも使う */

const SEN_SET = 3, SEN_ROUNDS = 10, SEN_WIN = 7, SEN_LOSE = 2;
const SEN_W = { common: 50, rare: 30, sr: 14, ur: 5, legend: 1 };          // ふだんのレア度の重み
/* CPU のデッキの質（boost）：0＝プレイヤーと同じ、1＝2勝目から、2＝5勝目から、3＝最後の相手 */
const SEN_W_BOOSTS = [SEN_W, { common: 42, rare: 31, sr: 19, ur: 6, legend: 2 }, { common: 36, rare: 31, sr: 22, ur: 8, legend: 3 }, { common: 30, rare: 30, sr: 24, ur: 12, legend: 4 }];
const senBoost = w => w >= SEN_WIN - 1 ? 3 : w >= 5 ? 2 : w >= 2 ? 1 : 0;
/* その回の1枚目のレア度の下限（0〜9回目） */
const senFloor = (r, boost) => r >= 9 ? "legend" : r >= 8 ? "ur" : r >= 6 ? "sr" : (+boost >= 2 && r >= 4) || (+boost >= 3 && r >= 2) ? "sr" : "";
/* 勝ち数ごとの CPU の強さ */
const senLevel = w => w >= 5 ? (typeof exOpen !== "function" || exOpen() ? "ex" : "hard") : w >= 2 ? "hard" : "normal";
let SEN = { rewards: [], ban: [] };   // 工房の「選定戦」（報酬・出さないカード）

const Sentei = {
  on() { return !!(CONFIG.SEN_ON || adminOn()); },
  fee() { return Math.max(0, CONFIG.SEN_FEE ?? 500); },
  run() { return Account.data && Account.data.sen; },
  rewardOf(w) { const L = SEN.rewards || []; return L[Math.min(w, L.length - 1)] || {}; },

  /* ---------- ピック ---------- */
  pool() {
    const ban = new Set(SEN.ban || []);
    return CARDS.filter(c => c.limit > 0 && !c.token && !c.boss && !ban.has(c.id) && cardShown(c));
  },
  band(c) { return c.cost <= 2 ? 0 : c.cost <= 4 ? 1 : 2; },   // 軽い・中くらい・重い
  rollRar(w, min) {
    const L = RARITY_ORDER.slice(Math.max(0, RARITY_ORDER.indexOf(min || "common")));
    const tot = L.reduce((a, k) => a + (w[k] || 0), 0);
    let x = Math.random() * tot;
    for (const k of L) { x -= w[k] || 0; if (x < 0) return k; }
    return L[L.length - 1];
  },
  /* r回目の候補：3枚のセットを2つ。deck は今までに選んだカード（3枚に達したカードは出さない） */
  offer(r, deck = {}, boost = false, pool = this.pool()) {
    const w = SEN_W_BOOSTS[Math.max(0, Math.min(3, +boost || 0))], used = new Set(), sets = [];
    const free = c => (deck[c.id] || 0) < 3 && !used.has(c.id);
    for (let s = 0; s < 2; s++) {
      const set = [], bands = [0, 1, 2].sort(() => Math.random() - .5);
      for (let k = 0; k < SEN_SET; k++) {
        const floor = k === 0 ? senFloor(r, boost) : "";
        let rar = this.rollRar(w, floor), c = null;
        // 決めたレア度・コストの帯 → 帯をゆるめる → レア度を1つずつ下げる（下限は守る）→ 何でも
        for (let tries = 0; tries < 6 && !c; tries++) {
          const L = pool.filter(x => free(x) && x.rarity === rar && (tries > 0 || this.band(x) === bands[k]));
          if (L.length) c = L[Math.floor(Math.random() * L.length)];
          else if (tries > 0) { const i = RARITY_ORDER.indexOf(rar); rar = i > Math.max(0, RARITY_ORDER.indexOf(floor || "common")) ? RARITY_ORDER[i - 1] : RARITY_ORDER[Math.min(4, i + 1)]; }
        }
        if (!c) { const L = pool.filter(free); c = L.length ? L[Math.floor(Math.random() * L.length)] : null; }
        if (c) { set.push(c.id); used.add(c.id); }
      }
      sets.push(set);
    }
    return sets;
  },
  /* CPU の選び方：レア度が高いほど、重いカードが多すぎないほど、今までに選んだカードと同じ世界が多いほどよい
     （世界：4回目までは気にせず、5回目からは多い2つの世界に寄せる） */
  score(set, deck, r = 0) {
    let heavy = 0; const wc = {};
    Object.entries(deck).forEach(([id, n]) => { const c = DEF[id]; if (!c) return; if (c.cost >= 5) heavy += n; wc[c.world] = (wc[c.world] || 0) + n; });
    const top = Object.entries(wc).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
    return set.reduce((a, id) => { const c = DEF[id]; if (!c) return a;
      const world = r >= 4 ? (top.includes(c.world) ? .9 : -.6) : (wc[c.world] || 0) * .05;
      return a + RARITY_ORDER.indexOf(c.rarity) * 1.2 + (c.cost >= 5 && heavy >= 8 ? -1.5 : 0) + (c.cost <= 2 ? .3 : 0) + world; }, 0) + Math.random() * .8;
  },
  botDeck(boost = 0) {
    const deck = {}, pool = this.pool();
    for (let r = 0; r < SEN_ROUNDS; r++) {
      const sets = this.offer(r, deck, boost, pool);
      const pick = sets.length > 1 && this.score(sets[1], deck, r) > this.score(sets[0], deck, r) ? sets[1] : sets[0];
      pick.forEach(id => { deck[id] = (deck[id] || 0) + 1; });
    }
    return deck;
  },
  /* 始まりの演出に使う代表カード：いちばんレア度が高く、重いキャラ */
  keyOf(deck) {
    return Object.keys(deck).filter(id => DEF[id] && DEF[id].art).sort((a, b) => RARITY_ORDER.indexOf(DEF[b].rarity) - RARITY_ORDER.indexOf(DEF[a].rarity) || (DEF[b].type === "char") - (DEF[a].type === "char") || DEF[b].cost - DEF[a].cost)[0] || null;
  },
  count(deck) { return Object.values(deck || {}).reduce((a, n) => a + n, 0); },

  /* ---------- 進め方 ---------- */
  start() {
    if (!this.on() || this.run()) return this.show();
    const fee = this.fee();
    if (Account.gold < fee) { toast(`Gが足りません（あと${fee - Account.gold}G）`); return this.show(); }
    if (this.pool().length < 40) { toast("候補に出せるカードが足りません"); return this.show(); }
    Account.data.gold -= fee;
    Account.data.sen = { st: "pick", r: 0, deck: {}, offer: this.offer(0, {}), w: 0, l: 0 };
    Account.saveNow(); Sound.play("click");
    this.show();
  },
  pick(i) {
    const R = this.run(); if (!R || R.st !== "pick") return this.show();
    const set = R.offer && R.offer[i]; if (!set) return this.show();
    set.forEach(id => { R.deck[id] = (R.deck[id] || 0) + 1; });
    R.r++;
    if (R.r >= SEN_ROUNDS || this.count(R.deck) >= SEN_ROUNDS * SEN_SET) { R.st = "play"; delete R.offer; }
    else R.offer = this.offer(R.r, R.deck);
    Account.saveNow(); Sound.play("flip", 1);
    this.show();
  },
  myDeck() {
    const R = this.run(), icon = Account.icon(), title = typeof Titles !== "undefined" ? Titles.curName() : "";
    const key = this.keyOf(R.deck);
    return { name: "選定戦のデッキ", cards: { ...R.deck }, ...(key ? { key } : {}), ...(icon ? { icon } : {}), ...(title ? { title } : {}), ...(typeof Skins !== "undefined" ? Skins.deckLook(R.deck) : {}) };
  },
  fight() {
    let R = this.run(); if (!R || R.st !== "play") return this.show();
    if (R.fight) { const q = this.settleQuit(true); if (q && q.done) return this.showEnd(q); R = this.run(); if (!R) return this.show(); }   // 前の対戦を途中でやめていた
    const lv = senLevel(R.w), last = R.w === SEN_WIN - 1, n = R.w + R.l + 1;
    R.fight = 1; Account.saveNow();   // 途中でやめたら負けに数える目印
    const opp = { name: last ? "選定戦 最後の相手" : `選定戦 ${n}戦目`, cards: this.botDeck(senBoost(R.w)) }; const k = this.keyOf(opp.cards); if (k) { opp.key = k; opp.icon = k; }
    startBattle({ kind: "sen", level: lv, mine: this.myDeck(), opp, reward: 0, streak: false, extra: { senN: n, senLast: last } });
  },
  /* 対戦が終わった（giveReward から1回だけ） */
  onGame(res) {
    const R = this.run(); if (!R || R.st !== "play") return null;
    delete R.fight;
    if (res === "win") R.w++; else if (res === "lose") R.l++;   // 引き分けは数えない（もう一度同じ相手の強さで）
    if (R.w >= SEN_WIN || R.l >= SEN_LOSE) return this.finish();
    return { w: R.w, l: R.l };
  },
  /* 終わり：勝った数の報酬を配る */
  finish(retire) {
    const R = this.run(); if (!R) return null;
    const w = R.w, x = this.rewardOf(w), d = Account.data;
    d.gold = (d.gold || 0) + (x.gold || 0); d.stones = (d.stones || 0) + (x.stones || 0);
    d.tickets = (d.tickets || 0) + (x.tickets || 0); d.srTickets = (d.srTickets || 0) + (x.srTickets || 0);
    const best = Math.max(d.senBest || 0, w); d.senBest = best;
    d.senRuns = (d.senRuns || 0) + 1;
    delete d.sen; Account.saveNow();
    return { done: true, w, l: R.l, retire: !!retire, reward: x };
  },
  /* 前の対戦を途中でやめていたら、負けに数える */
  settleQuit(force) {
    const R = this.run(); if (!R || !R.fight || (!force && S && S.battle && S.battle.kind === "sen" && !S.over)) return null;
    delete R.fight; R.l++;
    const out = R.l >= SEN_LOSE ? this.finish() : null;
    Account.saveNow();
    return out || { quit: true };
  },

  /* ---------- 画面 ---------- */
  rewardHTML(x) {
    const p = [x.gold ? `${curIcon("gold")}${x.gold.toLocaleString()}G` : "", x.stones ? `${curIcon("stone")}魔石${x.stones.toLocaleString()}` : "",
      x.tickets ? `パック券×${x.tickets}` : "", x.srTickets ? `SR以上確定パック券×${x.srTickets}` : ""].filter(Boolean);
    return p.length ? p.join("・") : "なし";
  },
  tableHTML(cur) {
    return `<div class="sen-table">${Array.from({ length: SEN_WIN + 1 }, (_, w) => `<div class="sen-tr ${cur === w ? "on" : ""}"><b>${w}勝</b><span>${this.rewardHTML(this.rewardOf(w))}</span></div>`).join("")}</div>`;
  },
  pipsHTML(R) {
    return `<div class="sen-pips"><span class="sen-w" aria-label="${R.w}勝">${Array.from({ length: SEN_WIN }, (_, i) => `<i class="${i < R.w ? "on" : ""}"></i>`).join("")}</span>
      <span class="sen-l" aria-label="${R.l}敗">${Array.from({ length: SEN_LOSE }, (_, i) => `<i class="${i < R.l ? "on" : ""}">✕</i>`).join("")}</span></div>`;
  },
  curveHTML(deck) {
    const b = [0, 0, 0, 0, 0, 0, 0, 0];
    Object.entries(deck).forEach(([id, n]) => { const c = DEF[id]; if (c) b[Math.min(7, c.cost)] += n; });
    const mx = Math.max(1, ...b);
    return `<div class="sen-curve" aria-label="コストの分布">${b.map((n, i) => `<span><i style="height:${Math.round(n / mx * 100)}%"></i><b>${n || ""}</b><small>${i === 7 ? "7+" : i}</small></span>`).join("")}</div>`;
  },
  listHTML(deck) {
    const L = Object.entries(deck).map(([id, n]) => [DEF[id], n]).filter(([c]) => c).sort((a, b) => a[0].cost - b[0].cost || RARITY_ORDER.indexOf(b[0].rarity) - RARITY_ORDER.indexOf(a[0].rarity));
    return `<div class="sen-list">${L.map(([c, n]) => `<button type="button" class="sen-row cdlink r-${c.rarity}" data-tk="${esc(c.id)}"><i>${c.cost}</i><b>${esc(c.name)}</b><small>${RARITY_SHORT[c.rarity] || ""}</small><em>×${n}</em></button>`).join("")}</div>`;
  },
  show(msg) {
    const quit = this.settleQuit();
    if (quit && quit.done) return this.showEnd(quit);
    if (quit && quit.quit) msg = "前の対戦を途中でやめたので、負けとして数えました。";
    const R = this.run(), fee = this.fee();
    let body;
    if (!R) {
      body = `<p class="callout"><b>選定戦とは</b>3枚ずつの2つのセットから1つを選ぶのを${SEN_ROUNDS}回くり返して、その場で${SEN_ROUNDS * SEN_SET}枚のデッキを作ります。そのデッキで CPU と戦い、<b>${SEN_WIN}勝</b>するか<b>${SEN_LOSE}敗</b>したら終わり。勝った数で報酬が決まります。</p>
        <ul class="sen-rules">
          <li>候補には、開放している弾のカードが出ます（持っていないカードも使えます）</li>
          <li>後半は、レア度の高いカードが必ず並びます（最後はレジェンド）</li>
          <li>CPU のデッキも同じ決まりで毎回作られます。勝ち進むほど CPU が強くなります</li>
          <li>作ったデッキは、この選定戦が終わるまで使えます</li>
        </ul>
        <span class="gl">報酬</span>${this.tableHTML(-1)}
        ${Account.data && Account.data.senBest ? `<p class="hint">これまでの最高：${Account.data.senBest}勝</p>` : ""}
        <button type="button" class="btn primary sen-go" data-act="senStart" ${Account.gold >= fee ? "" : "disabled"}>${curIcon("gold")}${fee.toLocaleString()}G で始める</button>
        ${Account.gold < fee ? `<p class="hint">Gが足りません（所持 ${Account.gold.toLocaleString()}G）</p>` : ""}`;
    } else if (R.st === "pick") {
      const n = this.count(R.deck), floor = senFloor(R.r);
      body = `<div class="sen-head"><b>${R.r + 1} / ${SEN_ROUNDS} 回目</b><span>デッキ ${n} / ${SEN_ROUNDS * SEN_SET}枚</span></div>
        ${floor ? `<p class="sen-floor">この回は、どちらのセットにも<b>${RARITY[floor]}${floor === "legend" ? "" : "以上"}</b>が入っています</p>` : ""}
        <div class="sen-offer">${(R.offer || []).map((set, i) => `<div class="sen-set ${this.sel === i ? "sel" : ""}">
          <div class="sen-cards">${set.map(id => DEF[id] ? `<button type="button" class="sen-card cdlink" data-tk="${esc(id)}" aria-label="${esc(DEF[id].name)}（押すと効果）">${cardHTML(DEF[id], { static: true })}${R.deck[id] ? `<span class="sen-have">×${R.deck[id]}</span>` : ""}</button>` : "").join("")}</div>
          <button type="button" class="btn ${this.sel === i ? "primary" : ""}" data-act="senPick" data-v="${i}">${this.sel === i ? "このセットに決める" : "このセットを選ぶ"}</button></div>`).join("")}</div>
        ${this.sel != null ? `<p class="hint sen-confirm">もう一度押すと決まります。もう片方を押すと、選び直せます。</p>` : ""}
        <p class="hint">カードを押すと効果を見られます。</p>
        ${n ? `<span class="gl">今のデッキ</span>${this.curveHTML(R.deck)}${this.listHTML(R.deck)}` : ""}`;
    } else {
      const lv = senLevel(R.w), last = R.w === SEN_WIN - 1;
      body = `${this.pipsHTML(R)}
        <div class="sen-next"><small>次の相手</small><b>${last ? "最後の相手（カードの質が上がる）" : `${R.w + R.l + 1}戦目`}</b><span>CPU の強さ：${CPU_LEVELS[lv] ? CPU_LEVELS[lv].label : lv}</span></div>
        <button type="button" class="btn primary sen-go" data-act="senFight">対戦する</button>
        <p class="hint">今 やめると：${this.rewardHTML(this.rewardOf(R.w))}</p>
        <span class="gl">選定戦のデッキ（${this.count(R.deck)}枚）</span>${this.curveHTML(R.deck)}${this.listHTML(R.deck)}
        <span class="gl">報酬</span>${this.tableHTML(R.w)}
        ${this.retireAsk ? `<div class="dmodal" data-act="senRetireNo"><div class="dmodal-in confirmbox" role="alertdialog" aria-label="選定戦をやめる" data-act="noop">
            <b class="dm-name">選定戦をやめますか？</b><p class="dm-text">${R.w}勝の報酬（${this.rewardHTML(this.rewardOf(R.w))}）を受け取って終わります。デッキはなくなります。</p>
            <div class="pre-btns"><button type="button" class="btn" data-act="senRetireNo">続ける</button><button type="button" class="btn danger" data-act="senRetireYes">やめる</button></div></div></div>` : ""}
        <button type="button" class="btn sm" data-act="senRetire">ここでやめる</button>`;
    }
    openOverlay(`<div class="panel sen">
      <div class="topbar"><button type="button" class="btn sm" data-act="solo">← 戻る</button><b>選定戦</b>${goldTag(Account.gold)}</div>
      ${msg ? `<p class="shopmsg" role="status">${esc(msg)}</p>` : ""}
      ${body}
    </div>`, "start", true);
  },
  showEnd(x) {
    Sound.play(x.w >= 5 ? "rare" : "click", x.w >= 5 ? 3 : 0);
    openOverlay(`<div class="panel sen sen-end">
      <div class="res-head"><span class="res-en">FINISH</span><b class="res-ja">${x.w}勝 ${x.l}敗</b></div>
      ${x.w >= SEN_WIN ? `<p class="sen-perfect">${SEN_WIN}勝達成！</p>` : x.retire ? `<p class="hint">ここでやめました。</p>` : ""}
      <div class="sen-got"><small>報酬</small><b>${this.rewardHTML(x.reward)}</b></div>
      <div class="pre-btns"><button type="button" class="btn primary" data-act="senOpen">選定戦へ</button><button type="button" class="btn" data-act="toTitle">ホームへ</button></div>
    </div>`, "start", true);
  },
  /* 結果画面に出す */
  resultHTML(x) {
    if (!x) return "";
    if (x.done) return `<div class="sen-res"><b>選定戦 終了：${x.w}勝 ${x.l}敗</b><small>報酬：${this.rewardHTML(x.reward)}</small></div>`;
    return `<div class="sen-res">${this.pipsHTML(x)}<small>${x.w}勝 ${x.l}敗（${SEN_WIN}勝か${SEN_LOSE}敗で終わり）</small></div>`;
  },
  handleAct(act, el) {
    switch (act) {
      case "senOpen": this.retireAsk = false; this.show(); return true;
      case "senStart": this.start(); return true;
      case "senPick": { const i = +el.dataset.v; if (this.sel === i) { this.sel = null; this.pick(i); } else { this.sel = i; Sound.play("click"); this.show(); } return true; }   // 押し間違えないように、2回押して決める
      case "senFight": this.fight(); return true;
      case "senRetire": this.retireAsk = true; this.show(); return true;
      case "senRetireNo": this.retireAsk = false; this.show(); return true;
      case "senRetireYes": { this.retireAsk = false; const x = this.finish(true); if (x) this.showEnd(x); else this.show(); return true; }
    }
    if (typeof SenDraft !== "undefined") return SenDraft.handleAct(act, el);
    return false;
  }
};

/* ---------- 友達との選定戦（取り合い）2026-11-17 ----------
   部屋を作るときに「選定戦ルール」を選ぶ。デッキは持ち込まない。
   1) じゃんけん：勝った人が1回目に選ぶ（そのあと1回ずつ交代）
   2) 3枚ずつのセットが2つ並び、選ぶ番の人が1つ取る。残りのセットは相手のデッキに入る。10回で30枚ずつ
   3) 対戦：じゃんけんに負けた人が、ハンデとして先攻・後攻を選ぶ。あとはふつうの対戦
   候補は「2人とも開放している弾」のカード（選定戦に出さないカード・ボス限定は出ない）。同じカードは2人とも3枚まで。
   進行は部屋を作った人（ホスト）の端末が持ち、盤面（S）として参加者に届ける。作ったデッキは、その1試合だけ */
const SD_PICK_SEC = 45, SD_RPS_SEC = 20, SD_CHECK_SEC = 60, SD_SHOW_SEC = 3;   // 選ぶ・じゃんけん・デッキの確認（秒）、渡されたカードを見せる（秒）
const SenDraft = {
  /* 開放している弾（自分の端末で） */
  openedSets() { return [...new Set(CARDS.map(c => c.set || "1"))].filter(s => setOpen(s)); },
  poolFor(a, b) {
    const ban = new Set(SEN.ban || []), A = new Set(a || []), B = new Set(b || []);
    return CARDS.filter(c => c.limit > 0 && !c.token && !c.boss && !ban.has(c.id) && A.has(c.set || "1") && B.has(c.set || "1") && !(typeof BOSS_EX_CARDS !== "undefined" && BOSS_EX_CARDS.includes(c.id)));
  },
  /* ホスト：取り合いを始める（再戦のときも、ここからやり直す） */
  begin() {
    const O = Online, g = O.guestDeck || {}, m = O.myDeck || {};
    const pl = (name, d) => ({ name, deckName: "選定戦", ...(d.icon ? { icon: d.icon } : {}), ...(d.title ? { title: d.title } : {}) });
    if (typeof Motion !== "undefined") Motion.reset();
    if (typeof Finale !== "undefined") Finale.reset();   // 前の対戦の「負けで灰色」を消す
    resultShown = false; ui = { sel: null, mode: null };
    S = { gid: Math.random().toString(36).slice(2, 10), phase: "draft", seq: 0, over: false, winner: null, log: [], turn: 0, turnNo: 0,
      players: [pl(O.room.hostName || "部屋主", m), pl(O.room.guestName || "参加者", g)],
      rps: { picks: [null, null], round: 1, last: null },
      draft: { st: "rps", hands: [null, null], last: null, first: null, r: 0, chooser: null, offer: null, decks: [{}, {}], ready: [false, false], dl: Date.now() + SD_RPS_SEC * 1000,
        sets: this.openedSets().filter(s => (g.opened || []).includes(s)) } };
    MODE = "online"; setPerspective(0); $("#overlay").hidden = true;
    this.startTick();
    render();
  },
  pool() { return this.poolFor(S.draft.sets, S.draft.sets); },
  /* 2人とも3枚まで：どちらのデッキにも3枚未満のカードだけ候補にする */
  offer() {
    const D = S.draft, both = {};
    Object.keys({ ...D.decks[0], ...D.decks[1] }).forEach(id => { both[id] = Math.max(D.decks[0][id] || 0, D.decks[1][id] || 0); });
    return Sentei.offer(D.r, both, 0, this.pool());
  },
  /* pi の操作（ホストだけが呼ぶ）。a = { t: "drps", v } | { t: "dpick", i } */
  act(pi, a) {
    const D = S && S.phase === "draft" && S.draft; if (!D || D.gone) return false;
    if (a.t === "drps" && D.st === "rps" && RPS[a.v] && !D.hands[pi]) {
      D.hands[pi] = a.v;
      const [x, y] = D.hands;
      if (x && y) {
        if (x === y) { D.last = { hands: [x, y], winner: null }; D.hands = [null, null]; D.dl = Date.now() + SD_RPS_SEC * 1000; }
        else {
          const w = RPS_WIN[x] === y ? 0 : 1;
          D.last = { hands: [x, y], winner: w }; D.first = w; D.st = "pick"; D.r = 0; D.chooser = w;
          D.offer = this.offer(); D.dl = Date.now() + (SD_PICK_SEC + SD_SHOW_SEC) * 1000;   // じゃんけんの結果を見せる分だけ足す
        }
      }
      render(); return true;
    }
    if (a.t === "dpick" && D.st === "pick" && pi === D.chooser && D.offer && D.offer[a.i]) {
      const take = D.offer[a.i], rest = D.offer[1 - a.i] || [];
      take.forEach(id => { D.decks[pi][id] = (D.decks[pi][id] || 0) + 1; });
      rest.forEach(id => { D.decks[1 - pi][id] = (D.decks[1 - pi][id] || 0) + 1; });
      D.lastPick = { by: pi, take, rest, r: D.r };
      D.r++;
      if (D.r >= SEN_ROUNDS) { D.st = "check"; D.offer = null; D.ready = [false, false]; D.dl = Date.now() + (SD_CHECK_SEC + SD_SHOW_SEC) * 1000; render(); return true; }
      D.chooser = (D.first + D.r) % 2; D.offer = this.offer(); D.dl = Date.now() + (SD_PICK_SEC + SD_SHOW_SEC) * 1000;   // 渡されたカードを見せる時間の分だけ足す
      render(); return true;
    }
    if (a.t === "dready" && D.st === "check" && !D.ready[pi]) {
      D.ready[pi] = true;
      if (D.ready[0] && D.ready[1]) { this.finish(); return true; }
      render(); return true;
    }
    return false;
  },
  /* 10回終わった：作ったデッキで対戦を始める。じゃんけんに負けた人が先攻・後攻を選ぶ */
  finish() {
    const O = Online, D = S.draft, loser = 1 - D.first;
    const mk = (src, cards) => ({ name: "選定戦のデッキ", cards: { ...cards }, ...(src.icon ? { icon: src.icon } : {}), ...(src.title ? { title: src.title } : {}),
      ...(src.sleeve ? { sleeve: src.sleeve } : {}), ...(src.frame ? { frame: src.frame } : {}),
      ...(Sentei.keyOf(cards) ? { key: Sentei.keyOf(cards) } : {}),
      ...(src.look ? { look: Object.fromEntries(Object.entries(src.look).filter(([id]) => cards[id])) } : {}) });
    const me = O.myDeck || {}, myLook = typeof Skins !== "undefined" ? Skins.looks(Object.keys(D.decks[0])) : {};
    const decks = [mk({ ...me, look: myLook }, D.decks[0]), mk(O.guestDeck || {}, D.decks[1])];
    this.stopTick();
    newGame([O.room.hostName || "部屋主", O.room.guestName || "参加者"], decks);
    S.sen = true; S.phase = "choose"; S.rpsWinner = loser;
    log(`選定戦：じゃんけんに負けた${pname(loser)}が、先攻・後攻を選ぶ。`);
    render();
  },
  /* 持ち時間：過ぎたら、ホストが代わりに選ぶ（じゃんけんは手をランダム、セットは1つ目） */
  startTick() { this.stopTick(); this.timer = setInterval(() => this.tick(), 1000); },
  stopTick() { clearInterval(this.timer); this.timer = null; },
  tick() {
    if (!S || S.phase !== "draft") return this.stopTick();
    this.paintTime();
    if (Online.role !== "host" || !S.draft || S.draft.gone || Date.now() < S.draft.dl) return;
    const D = S.draft;
    if (D.st === "rps") { [0, 1].forEach(pi => { if (!D.hands[pi] && S.phase === "draft" && S.draft.st === "rps") this.act(pi, { t: "drps", v: "gcp"[Math.floor(Math.random() * 3)] }); }); }
    else if (D.st === "pick") this.act(D.chooser, { t: "dpick", i: Math.random() < .5 ? 0 : 1 });
    else if (D.st === "check") this.finish();
  },
  left() { const D = S && S.draft; if (!D) return 0; const now = Date.now() - (Online.role === "guest" ? Online.skew || 0 : 0); return Math.max(0, Math.ceil((D.dl - now) / 1000)); },
  paintTime() { const el = document.querySelector(".sd-time"); if (el) { const s = this.left(); el.textContent = `残り ${s}秒`; el.classList.toggle("low", s <= 10); } },
  /* 自分の操作 */
  send(a) {
    if (Online.role === "host") return this.act(0, a);
    if (Online.blocked()) return;
    Online.send(a);
  },
  /* ---------- 画面：対戦の舞台は使わず、取り合い専用の画面（自分の名前は出さず、相手の名前だけ上に） ---------- */
  mini(d) {
    const L = Object.entries(d).map(([id, n]) => [DEF[id], n]).filter(([c]) => c).sort((a, b) => a[0].cost - b[0].cost || a[0].name.localeCompare(b[0].name));
    return `<div class="sd-mini">${L.map(([c, n]) => `<button type="button" class="sd-chip cdlink r-${c.rarity}" data-tk="${esc(c.id)}"><i>${c.cost}</i>${esc(c.name)}${n > 1 ? `<em>×${n}</em>` : ""}</button>`).join("") || `<span class="hint">まだありません</span>`}</div>`;
  },
  /* デッキを、コストの順に絵つきで並べる（同じカードは1枚にまとめて ×枚数） */
  gridHTML(d) {
    const L = Object.entries(d).map(([id, n]) => [DEF[id], n]).filter(([c]) => c).sort((a, b) => a[0].cost - b[0].cost || RARITY_ORDER.indexOf(b[0].rarity) - RARITY_ORDER.indexOf(a[0].rarity));
    return `<div class="sd-grid">${L.map(([c, n]) => `<button type="button" class="sen-card cdlink" data-tk="${esc(c.id)}" aria-label="${esc(c.name)} ${n}枚">${cardHTML(c, { static: true, look: null })}${n > 1 ? `<span class="sen-have">×${n}</span>` : ""}</button>`).join("")}</div>`;
  },
  cards(ids, sel) { return `<div class="sen-cards">${ids.map(id => DEF[id] ? `<button type="button" class="sen-card cdlink" data-tk="${esc(id)}" aria-label="${esc(DEF[id].name)}（押すと効果）">${cardHTML(DEF[id], { static: true, look: null })}</button>` : "").join("")}</div>`; },
  screenHTML() {
    const D = S.draft, me = ME, op = OP, P = S.players[op], dots = `<span class="pg-dots"><i></i><i></i><i></i></span>`;
    if (!this.timer) this.startTick();
    if (S.gid !== this.gid) { this.gid = S.gid; this.tab = null; this.seenPick = undefined; this.seenRps = false; this.sel = null; this.show = null; }
    // じゃんけんの結果（どちらが勝ったか）を見せる
    if (D.st !== "rps" && D.last && D.last.winner != null && !this.seenRps) {
      this.seenRps = true;
      if (D.r === 0) { this.show = { rps: D.last, until: Date.now() + SD_SHOW_SEC * 1000 - 300 }; clearTimeout(this.showT); this.showT = setTimeout(() => { this.show = null; if (S && S.phase === "draft") render(); }, SD_SHOW_SEC * 1000 - 300); }
    }   // 再戦：前の取り合いの続きを持ち越さない
    // 演出を毎回やり直さない（相手が選んだだけで、じゃんけんの手などが出直さないように）
    const key = `${S.gid}|${D.st}|${D.r}|${D.last ? D.last.hands.join("") : ""}`, anim = key !== this.animKey; this.animKey = key;
    // 前の回で自分に入ったカードを、次の候補の前に見せる
    if (D.lastPick && D.lastPick.r !== this.seenPick) {
      const first = this.seenPick === undefined && D.r > 1 && !(this.show && this.show.rps); this.seenPick = D.lastPick.r;
      if (!first) { const lp = D.lastPick, mine = lp.by === me ? lp.take : lp.rest, theirs = lp.by === me ? lp.rest : lp.take;
        this.show = { mine, theirs, by: lp.by, until: Date.now() + SD_SHOW_SEC * 1000 - 300 };
        clearTimeout(this.showT); this.showT = setTimeout(() => { this.show = null; if (S && S.phase === "draft") render(); }, SD_SHOW_SEC * 1000 - 300); }
    }
    const wait = Online.blocked();
    const time = `<span class="sd-time">残り ${this.left()}秒</span>`;
    let main;
    if (D.gone) main = `<div class="sd-h"><b>相手が退出しました</b><small>選定戦は中止です</small></div><button type="button" class="btn" data-act="toTitle">部屋を出る</button>`;
    else if (D.st === "rps") {
      const mine = D.hands[me];
      main = `<div class="sd-h"><b>${D.last ? "あいこ！" : "じゃんけん"}</b><small>${D.last ? "もう一度" : "勝てば先にピック／負ければ先攻・後攻を選べる"}</small></div>
        ${mine ? `<div class="pg-chosen">${rpsImg(mine)}<span>${RPS[mine]}</span></div><p class="pg-wait">相手を待っています${dots}</p>`
          : `<div class="pg-rps">${Object.entries(RPS).map(([k, v], i) => `<button type="button" class="pg-hand" style="--i:${i}" data-act="sdRps" data-v="${k}" ${wait ? "disabled" : ""}>${rpsImg(k)}<span>${v}</span></button>`).join("")}</div>`}
        <p class="sd-st">${D.hands[op] ? "相手は選びました" : `相手は考え中${dots}`}</p>${time}`;
    } else if (D.st === "pick") {
      const my = D.chooser === me, floor = senFloor(D.r), n = Sentei.count(D.decks[me]);
      main = `<div class="sd-row sd-pickhead"><b class="sd-round">${D.r + 1}<small>/${SEN_ROUNDS}</small></b><b class="sd-whose ${my ? "me" : ""}">${my ? "あなたの番" : "相手の番"}</b>${floor ? `<span class="sd-floor">${RARITY_SHORT[floor]}${floor === "legend" ? "" : "以上"}確定</span>` : ""}${time}</div>
        <div class="sd-offer">${(D.offer || []).map((set, i) => `<div class="sd-set ${my && this.sel === i ? "sel" : ""}">
          ${this.cards(set)}
          ${my ? `<button type="button" class="btn sm ${this.sel === i ? "primary" : ""}" data-act="sdPick" data-v="${i}" ${wait ? "disabled" : ""}>${this.sel === i ? "決定" : "これを取る"}</button>` : ""}</div>`).join("")}</div>
        <div class="sd-row sd-foot"><span class="sd-st">${my ? (this.sel != null ? "もう一度押すと決定" : "") : `相手が選んでいます${dots}`}</span><span class="sd-cnt">デッキ ${n}/${SEN_ROUNDS * SEN_SET}</span></div>
        <div class="sd-curve">${Sentei.curveHTML(D.decks[me])}</div>`;
    } else {
      const ok = D.ready[me], tab = this.tab === "op" ? op : me;
      main = `<div class="sd-h"><b>デッキ完成</b></div>
        <div class="sd-row"><span class="sd-st">${D.ready[op] ? "相手は確認済み" : `相手は確認中${dots}`}</span>${time}</div>
        <div class="seg sd-tabs" role="tablist"><button type="button" role="tab" data-act="sdTab" data-v="me" aria-pressed="${tab === me}">あなた</button><button type="button" role="tab" data-act="sdTab" data-v="op" aria-pressed="${tab === op}">相手</button></div>
        ${Sentei.curveHTML(D.decks[tab])}${this.gridHTML(D.decks[tab])}
        <button type="button" class="btn primary sd-ready" data-act="sdReady" ${ok || wait ? "disabled" : ""}>${ok ? "相手を待っています" : "確認した"}</button>`;
    }
    const sh = this.show && Date.now() < this.show.until ? this.show : null;
    const reveal = !sh ? "" : sh.rps ? `<div class="sd-reveal" role="status" data-act="sdShowClose">
        <div class="sd-rv-in sd-rv-rps ${sh.rps.winner === me ? "win" : ""}"><b>${sh.rps.winner === me ? "あなたの勝ち！" : "相手の勝ち"}</b>
          <div class="sd-rv-hands"><span>${rpsImg(sh.rps.hands[me])}<small>あなた</small></span><i>VS</i><span>${rpsImg(sh.rps.hands[op])}<small>相手</small></span></div>
          <small>${sh.rps.winner === me ? "あなたが最初にセットを選びます" : "相手が最初に選びます。対戦の先攻・後攻は、あなたが選べます"}</small></div></div>`
      : `<div class="sd-reveal" role="status" data-act="sdShowClose">
        <div class="sd-rv-in"><b>あなたのデッキに入ったカード</b>${this.cards(sh.mine)}
        <small>${sh.by === me ? "相手には、もう片方のセットが入りました" : "相手が選んだ残りのセットです"}</small></div></div>`;
    return `<div class="sd-screen ${anim ? "anim" : ""}">
      <div class="sd-top"><span class="sd-tag">選定戦</span><span class="sd-vs"><small>VS</small><b>${esc(P.name)}</b>${P.title ? `<em>${esc(P.title)}</em>` : ""}</span>
        <button type="button" class="chip" data-act="menu">メニュー</button></div>
      <div class="sd-main st-${D.gone ? "gone" : D.st}">${main}</div>${reveal}
      ${typeof Online !== "undefined" ? Online.bannerHTML() : ""}
    </div>`;
  },
  handleAct(act, el) {
    switch (act) {
      case "sdRps": this.send({ t: "drps", v: el.dataset.v }); return true;
      case "sdPick": { const i = +el.dataset.v; if (this.sel === i) { this.sel = null; this.send({ t: "dpick", i }); } else { this.sel = i; Sound.play("click"); render(); } return true; }
      case "sdReady": this.send({ t: "dready" }); return true;
      case "sdTab": this.tab = el.dataset.v; render(); return true;
      case "sdShowClose": this.show = null; render(); return true;
    }
    return false;
  }
};
