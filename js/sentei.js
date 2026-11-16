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
const SEN_W_BOOST = { common: 30, rare: 30, sr: 24, ur: 12, legend: 4 };   // 最後の CPU のデッキ
/* その回の1枚目のレア度の下限（0〜9回目） */
const senFloor = (r, boost) => r >= 9 ? "legend" : r >= 8 ? "ur" : r >= 6 ? "sr" : boost && r >= 4 ? "sr" : "";
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
    const w = boost ? SEN_W_BOOST : SEN_W, used = new Set(), sets = [];
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
  /* CPU の選び方：レア度が高いほど、重いカードが多すぎないほどよい */
  score(set, deck) {
    const heavy = Object.entries(deck).reduce((a, [id, n]) => a + (DEF[id] && DEF[id].cost >= 5 ? n : 0), 0);
    return set.reduce((a, id) => { const c = DEF[id]; if (!c) return a;
      return a + RARITY_ORDER.indexOf(c.rarity) * 1.2 + (c.cost >= 5 && heavy >= 8 ? -1.5 : 0) + (c.cost <= 2 ? .3 : 0); }, 0) + Math.random() * .8;
  },
  botDeck(boost = false) {
    const deck = {}, pool = this.pool();
    for (let r = 0; r < SEN_ROUNDS; r++) {
      const sets = this.offer(r, deck, boost, pool);
      const pick = sets.length > 1 && this.score(sets[1], deck) > this.score(sets[0], deck) ? sets[1] : sets[0];
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
    const opp = { name: last ? "選定戦 最後の相手" : `選定戦 ${n}戦目`, cards: this.botDeck(last) }; const k = this.keyOf(opp.cards); if (k) { opp.key = k; opp.icon = k; }
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
    return `<div class="sen-list">${L.map(([c, n]) => `<button type="button" class="sen-row r-${c.rarity}" data-tk="${esc(c.id)}"><i>${c.cost}</i><b>${esc(c.name)}</b><small>${RARITY_SHORT[c.rarity] || ""}</small><em>×${n}</em></button>`).join("")}</div>`;
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
          <div class="sen-cards">${set.map(id => DEF[id] ? `<button type="button" class="sen-card" data-tk="${esc(id)}" aria-label="${esc(DEF[id].name)}（押すと効果）">${cardHTML(DEF[id], { static: true })}${R.deck[id] ? `<span class="sen-have">×${R.deck[id]}</span>` : ""}</button>` : "").join("")}</div>
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
    return false;
  }
};
