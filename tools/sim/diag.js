// 魔女のお茶会（0番）が使ったカードと、その対象の価値を記録
const { chromium } = require('playwright'); const fs = require('fs');
const N = +process.argv[2] || 40, DECK = process.argv[3] || "魔女のお茶会";
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', e => console.error('ERR', e.message));
  await p.goto('http://localhost:8765/index.html?draft'); await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0);
  await p.addScriptTag({ content: fs.readFileSync('/home/claude/kyokai/tools/sim/harness.js', 'utf8') });
  const out = await p.evaluate(([N, DECK]) => {
    SimDev.setRules({ rule: "current" });
    const W = PRESETS.find(d => d.name === DECK), opps = PRESETS.filter(d => ["hard", "ex", "gate"].includes(d.level) && d !== W);
    const st = {}; let depth = 0; const os = window.simulate; window.simulate = function (fn) { depth++; try { return os(fn); } finally { depth--; } };
    const orig = window.playCard;
    window.playCard = function (pi, idx, t, g) {
      if (depth || pi !== 0) return orig.apply(this, arguments);
      const pl = S.players[0], id = pl.hand[idx], d = DEF[id];
      let tv = null; const tg = t && (t.enemy || t.enemyF); if (tg && tg !== "face") { const u = S.players[1].field.find(x => x.uid === tg); if (u) tv = +unitValue(u).toFixed(1); }
      const ok = orig.apply(this, arguments);
      if (ok) { const r = st[d.name] || (st[d.name] = { n: 0, turn: 0, tv: [], hand: 0 }); r.n++; r.turn += S.turnNo; if (tv != null) r.tv.push(tv); r.hand += pl.hand.length; }
      return ok;
    };
    let w = 0, n = 0, turns = 0, maxE = 0, endHand = 0;
    for (const o of opps) for (let i = 0; i < N; i++) { const r = SimDev.game(W, o, "hard"); if (r.winner === "draw") continue; n++; if (r.winner === 0) w++; turns += S.turnNo; endHand += S.players[0].hand.length; }
    window.playCard = orig; window.simulate = os;
    const named = {}; for (const [k, r] of Object.entries(st)) named[k] = { n: r.n, turn: +(r.turn / r.n).toFixed(1), tv: r.tv.length ? +(r.tv.reduce((a, b) => a + b, 0) / r.tv.length).toFixed(1) : null, small: r.tv.filter(x => x < 6).length };
    return { win: Math.round(w / n * 100), turns: +(turns / n).toFixed(1), endHand: +(endHand / n).toFixed(1), named };
  }, [N, DECK]);
  console.log(JSON.stringify(out, null, 1)); await b.close();
})();
