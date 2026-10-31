// ブラウザのページ内で実行する：CPU同士の対戦シミュレーター
window.SimDev = {  // ゲーム側の js/simlab.js の SimLab と名前がぶつからないよう別名
  variant: "current",
  deck(cards, name) { return { name, cards }; },
  setRules(v) {
    this.variant = v.rule || "current";
    Object.assign(CONFIG, v.config || {});
    Object.entries(v.cards || {}).forEach(([id, ch]) => Object.assign(DEF[id], ch));
    if (!this._orig) this._orig = { canAttackPlayer, canAttackUnit, evaluate };
    if (this.variant === "open") {
      // 新ルール案：守護がいなければいつでも本体を攻撃できる。直撃（pierce）は守護を無視できる
      window.canAttackPlayer = function (pi, u) { return !guards(opp(pi)).length || !!(u && kw(u, "pierce")); };
      window.canAttackUnit = function (pi, target, u) { const g = guards(opp(pi)); return !g.length || g.includes(target) || !!(u && kw(u, "pierce")); };
      // CPUの盤面評価も新ルールに合わせる（守護がいなければ全員が本体に届く）
      const src = this._orig.evaluate.toString()
        .replace(/\(\(!me\.field\.length \|\| \(DEF\[u\.id\] && DEF\[u\.id\]\.keywords\.includes\("pierce"\)\)\) && !u\.frozen \? u\.atk : 0\)/, "(!u.frozen ? u.atk : 0)")
        .replace(/\(\(!en\.field\.length \|\| \(DEF\[u\.id\] && DEF\[u\.id\]\.keywords\.includes\("pierce"\)\)\) \? u\.atk : 0\)/, "u.atk");
      window.evaluate = (0, eval)("(" + src + ")");
      this.evalPatched = src !== this._orig.evaluate.toString();
    } else {
      window.canAttackPlayer = this._orig.canAttackPlayer; window.canAttackUnit = this._orig.canAttackUnit; window.evaluate = this._orig.evaluate;
    }
  },
  game(da, db, level) {
    CPU_LEVEL = level || "normal"; MODE = "sim"; SIM = true;
    S = { gid: "sim", phase: "play", players: [mkPlayer("A", da), mkPlayer("B", db)], rps: { picks: [null, null], round: 1, last: null },
      rpsWinner: null, first: Math.random() < 0.5 ? 0 : 1, mull: [true, true], decks: [da, db], turn: 0, turnNo: 0, over: false, winner: null, log: [], uidN: 0, seq: 0 };
    const played = [[], []];
    for (let i = 0; i < CONFIG.START_HAND; i++) { draw(0, true); draw(1, true); }
    for (const pi of [0, 1]) { const p = S.players[pi]; if (p.hand.filter(id => DEF[id].cost <= 3).length < 2) { p.deck.push(...p.hand); p.hand = []; shuffle(p.deck); for (let i = 0; i < CONFIG.START_HAND; i++) draw(pi, true); } }
    // 後攻の補正（設定があれば）
    if (CONFIG.SECOND_BONUS) for (let i = 0; i < CONFIG.SECOND_BONUS; i++) draw(1 - S.first, true);
    for (let i = 0; i < (CONFIG.SECOND_COIN || 0); i++) S.players[1 - S.first].hand.push("coin");
    if (CONFIG.SECOND_ENERGY && !this._wrapped) {
      const orig = window.startTurn; this._wrapped = true;
      window.startTurn = function (pi, skip) { orig(pi, skip); if (S && CONFIG.SECOND_ENERGY && pi !== S.first && S.players[pi].maxE === 1) S.players[pi].e += CONFIG.SECOND_ENERGY; };
    }
    startTurn(S.first, true);
    let maxE = [0, 0];
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
    const w = S.over ? S.winner : "draw";
    return { winner: w, turns: S.turnNo, first: S.first, hp: S.players.map(p => p.hp), played };
  },
  run(decks, n, level) {
    const names = Object.keys(decks), res = { games: 0, turns: 0, firstWins: 0, draws: 0, deck: {}, card: {}, matrix: {} };
    names.forEach(k => { res.deck[k] = { w: 0, g: 0 }; });
    for (const a of names) for (const b of names) {
      if (a === b) continue;
      for (let i = 0; i < n; i++) {
        const r = this.game(decks[a], decks[b], level);
        res.games++; res.turns += r.turns;
        if (r.winner === "draw") { res.draws++; continue; }
        if (r.winner === r.first) res.firstWins++;
        const wn = r.winner === 0 ? a : b, ln = r.winner === 0 ? b : a;
        res.deck[wn].w++; res.deck[wn].g++; res.deck[ln].g++;
        const key = a + ">" + b; res.matrix[key] = (res.matrix[key] || 0) + (r.winner === 0 ? 1 : 0);
        [0, 1].forEach(pi => new Set(r.played[pi]).forEach(id => { const c = res.card[id] || (res.card[id] = { w: 0, g: 0 }); c.g++; if (r.winner === pi) c.w++; }));
      }
    }
    return res;
  }
};
