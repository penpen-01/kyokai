/* =========================================================
   検証ラボ（カード工房の「検証」タブから使う）
   カード工房が index.html?draft&sim を見えない枠（iframe）で開き、そこでゲームの本物の処理を使って
   ・CPU同士の対戦を何百回も行い、デッキごとの勝率やカードごとの成績を集める
   ・パックを何千個も開けて、実際の排出率を確かめる
   カード工房とは postMessage でやりとりする。編集中のカード（下書き）がそのまま使われる。
   ========================================================= */

const SimLab = {
  /* 型ごとの試験用デッキ（存在しないカードは自動で外す） */
  TEST_DECKS: [
    { id: "t-aggro", name: "試験：速攻", cards: { squire: 3, "st-recruit": 3, pegasus: 3, archer: 3, "x-rush": 3, thunder: 3, shadow: 3, "m-valkyrie": 3, rally: 2, bolt: 2, berserker: 3 } },
    { id: "t-ramp", name: "試験：ランプ", cards: { crystal: 3, "f-twins": 3, priestess: 3, "f-whisper": 3, "x-drone": 3, "m-shield": 3, "f-treeguard": 2, bolt: 3, "f-spirit": 1, endragon: 2, omega: 2, "x-gigas": 1, "f-dragonwake": 1 } },
    { id: "t-control", name: "試験：コントロール", cards: { "x-drone": 3, "m-shield": 3, sentinel: 3, "f-icewitch": 3, bolt: 3, "f-curse": 3, "m-hammer": 2, "f-blizzard": 2, "m-inferno": 2, "f-treeguard": 3, "x-executor": 2, sage: 1 } },
    { id: "t-mid", name: "試験：ミッドレンジ", cards: { "m-prayer": 3, archer: 3, "x-armored": 3, "m-oracle": 3, "m-phoenix": 3, dragon: 2, garm: 2, "f-unicorn": 2, wargod: 2, "x-repair": 3, bolt: 3, "m-order": 1 } }
  ],
  stop: false,

  testDecks() {
    return this.TEST_DECKS.map(d => ({ ...d, cards: Object.fromEntries(Object.entries(d.cards).filter(([id]) => DEF[id] && DEF[id].limit > 0)) }));
  },

  /* 1試合（演出なし） */
  game(da, db) {
    MODE = "sim"; SIM = true;
    S = {
      gid: "sim", phase: "play", players: [mkPlayer("A", da), mkPlayer("B", db)], rps: { picks: [null, null], round: 1, last: null },
      rpsWinner: null, first: Math.random() < 0.5 ? 0 : 1, mull: [true, true], decks: [da, db],
      turn: 0, turnNo: 0, over: false, winner: null, log: [], uidN: 0, seq: 0
    };
    const played = [[], []];
    for (let i = 0; i < CONFIG.START_HAND; i++) { draw(0, true); draw(1, true); }
    const second = 1 - S.first;
    for (let i = 0; i < (CONFIG.SECOND_BONUS || 0); i++) draw(second, true);
    // マリガン（安いカードが2枚未満なら引き直す）
    for (const pi of [0, 1]) {
      const p = S.players[pi];
      if (p.hand.filter(id => DEF[id].cost <= 3).length < 2) {
        const n = p.hand.length;
        p.deck.push(...p.hand); p.hand = []; shuffle(p.deck);
        for (let i = 0; i < n; i++) draw(pi, true);
      }
    }
    for (let i = 0; i < (CONFIG.SECOND_COIN || 0); i++) S.players[second].hand.push("coin");
    startTurn(S.first, true);
    while (!S.over && S.turnNo < 60) {
      const pi = S.turn;
      for (let g = 0; g < 30 && !S.over; g++) {
        const a = cpuChoose(pi);
        if (!a) break;
        if (a.t === "play") played[pi].push(S.players[pi].hand[a.idx]);
        if (!applyAction(pi, a)) break;
      }
      if (S.over) break;
      endTurn(pi);
    }
    return { winner: S.over ? S.winner : "draw", turns: S.turnNo, first: S.first, played };
  },

  /* 総当たり（それぞれの組み合わせを、席を入れ替えて n 試合ずつ） */
  async battle(job, report) {
    const tests = this.testDecks();
    const decks = job.decks.map(d => d.testId ? tests.find(t => t.id === d.testId) : d).filter(d => d && Object.keys(d.cards || {}).length);
    CPU_LEVEL = job.level || "normal";
    const pairs = [];
    decks.forEach((a, i) => decks.forEach((b, j) => { if (i !== j) pairs.push([i, j]); }));
    const total = pairs.length * job.n;
    const res = { games: 0, turns: 0, firstWins: 0, draws: 0, deck: decks.map(d => ({ name: d.name, w: 0, g: 0 })), vs: {}, card: {} };
    let done = 0;
    this.stop = false;
    for (const [i, j] of pairs) {
      for (let k = 0; k < job.n; k++) {
        if (this.stop) return { ...res, stopped: true };
        const r = this.game(decks[i], decks[j]);
        res.games++; res.turns += r.turns;
        if (r.winner === "draw") res.draws++;
        else {
          if (r.winner === r.first) res.firstWins++;
          const wi = r.winner === 0 ? i : j, li = r.winner === 0 ? j : i;
          res.deck[wi].w++; res.deck[wi].g++; res.deck[li].g++;
          const key = `${i}-${j}`; res.vs[key] = (res.vs[key] || 0) + (r.winner === 0 ? 1 : 0);
          [0, 1].forEach(pi => new Set(r.played[pi]).forEach(id => {
            const c = res.card[id] || (res.card[id] = { w: 0, g: 0 });
            c.g++; if (r.winner === pi) c.w++;
          }));
        }
        done++;
        // 画面が固まらないように、ときどき処理を返す
        if (done % 2 === 0) { report(done, total); await new Promise(r => setTimeout(r, 0)); }
      }
    }
    report(total, total);
    return res;
  },

  /* パックを n 個開ける（アカウントには何も保存しない） */
  async packs(job, report) {
    const pack = PACKS.find(p => p.id === job.packId);
    if (!pack) return { error: "パックが見つかりません" };
    const R = RARITY_ORDER;
    const res = { n: job.n, size: pack.size, normal: Object.fromEntries(R.map(r => [r, 0])), last: Object.fromEntries(R.map(r => [r, 0])), card: {}, firstLegend: [] };
    let sinceLegend = 0;
    for (let i = 0; i < job.n; i++) {
      let gotLegend = false;
      for (let s = 0; s < pack.size; s++) {
        const isLast = s === pack.size - 1;
        const id = Packs.rollCard(pack, isLast ? pack.odds.last : pack.odds.normal);
        if (!id) continue;
        const r = DEF[id].rarity;
        res[isLast ? "last" : "normal"][r]++;
        res.card[id] = (res.card[id] || 0) + 1;
        if (r === "legend") gotLegend = true;
      }
      sinceLegend++;
      if (gotLegend) { res.firstLegend.push(sinceLegend); sinceLegend = 0; }
      if (i % 200 === 0) { report(i, job.n); await new Promise(r => setTimeout(r, 0)); }
    }
    report(job.n, job.n);
    return res;
  }
};

window.addEventListener("message", async e => {
  if (e.origin !== location.origin || !e.data || e.data.to !== "simlab") return;
  const reply = msg => e.source.postMessage({ from: "simlab", ...msg }, e.origin);
  if (e.data.type === "stop") { SimLab.stop = true; return; }
  if (e.data.type !== "run") return;
  const job = e.data.job;
  try {
    const report = (done, total) => reply({ type: "progress", done, total });
    const data = job.kind === "packs" ? await SimLab.packs(job, report) : await SimLab.battle(job, report);
    reply({ type: "result", kind: job.kind, data });
  } catch (err) {
    reply({ type: "error", message: String(err && err.message || err) });
  }
});
