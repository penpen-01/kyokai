// node tools/sim/gate_eval.js <試合数> <出力.json>   開放戦デッキ（gate-mech/myth/fan）× 上級CPUデッキ3＋ほかの開放戦デッキ2 を上級CPUどうしで。歯車・化かし・妖気のカードの使われ方も記録
const { chromium } = require('playwright'); const fs = require('fs');
const N = +process.argv[2] || 30, OUT = process.argv[3];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', e => console.error('ERR', e.message));
  await p.goto('http://localhost:8765/index.html?draft'); await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0);
  await p.addScriptTag({ content: fs.readFileSync('/home/claude/kyokai/tools/sim/harness.js', 'utf8') });
  const out = await p.evaluate((N) => {
    SimDev.setRules({ rule: "current" });
    const G = ["gate-mech", "gate-myth", "gate-fan"].map(id => PRESETS.find(d => d.id === id));
    const H = ["h-gods", "h-frost", "h-steel"].map(id => PRESETS.find(d => d.id === id));
    // 記録：0番（開放戦デッキ）が出したカードのコスト・歯車
    const st = {}; const orig = window.playCard; let depth = 0; const os = window.simulate; window.simulate = function (fn) { depth++; try { return os(fn); } finally { depth--; } };
    window.playCard = function (pi, idx, t, g) {
      const pl = S.players[pi], id = pl.hand[idx], d = DEF[id];
      const rec = depth === 0 && pi === 0 && d && (d.shrink || d.gear || d.grow);
      const cost = rec ? effCost(pi, d, idx) : 0, grow = rec ? handGrowAt(pl, idx) : 0, gears = rec ? gearsOf(pl) : 0;
      const ok = orig.apply(this, arguments);
      if (ok && rec) { const r = st[id] || (st[id] = { n: 0, cost: 0, turn: 0, grow: 0, gearUse: 0, gearCan: 0 }); r.n++; r.cost += cost; r.turn += pl.maxE; r.grow += grow; r.gh = (r.gh || 0) + gears;
        if (typeof d.gear === "number" && gears >= d.gear) { r.gearCan++; if (gearsOf(pl) < gears || !pl.hand.includes(GEAR_ID)) r.gearUse++; } }
      return ok;
    };
    const res = {};
    for (const g of G) for (const o of [...H, ...G.filter(x => x !== g)]) {
      let w = 0, n = 0;
      for (let i = 0; i < N; i++) { const r = SimDev.game(g, o, "hard"); if (r.winner === "draw") continue; n++; if (r.winner === 0) w++; }
      res[g.id + " vs " + o.id] = Math.round(w / n * 100);
    }
    window.playCard = orig; window.simulate = os;
    const named = {}; for (const [id, r] of Object.entries(st)) named[DEF[id].name] = { n: r.n, cost: +(r.cost / r.n).toFixed(1), base: DEF[id].cost, E: +(r.turn / r.n).toFixed(1), grow: +(r.grow / r.n).toFixed(1), gh: +((r.gh||0) / r.n).toFixed(1), gear: r.gearCan ? `${r.gearUse}/${r.gearCan}` : "" };
    return { res, named };
  }, N);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out.res)); await b.close();
})();
