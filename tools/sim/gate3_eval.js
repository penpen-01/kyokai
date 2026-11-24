// 第3弾の開放戦：相手（gate-sea・上級）と、ルールに合わせたプレイヤー側デッキ（第2弾まで・L1/UR2/SR6）の勝率
// node tools/sim/gate3_eval.js 試合数 [L,UR,SR]
const { chromium } = require('playwright'); const fs = require('fs');
const N = +process.argv[2] || 20, CAP = (process.argv[3] || '1,2,6').split(',').map(Number);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html?draft'); await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0);
  await p.addScriptTag({ content: fs.readFileSync(__dirname + '/harness.js', 'utf8') });
  const out = await p.evaluate(([N, CAP]) => {
    const cap = { legend: CAP[0], ur: CAP[1], sr: CAP[2] };
    const FILL = ['squire', 'st-golem', 'st-recruit', 'archer', 'pegasus', 'st-guard'];
    function capDeck(d) {
      const c = { ...d.cards };
      Object.keys(c).forEach(id => { if (!DEF[id] || !['1', '2-1', '2-2', '2-3'].includes(DEF[id].set || '1')) delete c[id]; });
      for (const r of ['legend', 'ur', 'sr']) {
        let n = Object.entries(c).filter(([id]) => DEF[id].rarity === r).reduce((a, [, k]) => a + k, 0);
        const L = Object.keys(c).filter(id => DEF[id].rarity === r).sort((a, b) => DEF[b].cost - DEF[a].cost);
        while (n > cap[r] && L.length) { const id = L[0]; c[id]--; n--; if (!c[id]) { delete c[id]; L.shift(); } }
      }
      let tot = Object.values(c).reduce((a, k) => a + k, 0);
      const low = Object.keys(c).filter(id => ['common', 'rare'].includes(DEF[id].rarity)).sort((a, b) => DEF[a].cost - DEF[b].cost);
      for (const id of [...low, ...FILL]) { while (tot < 30 && (c[id] || 0) < 3) { c[id] = (c[id] || 0) + 1; tot++; } }
      return { name: d.name + '（制限）', cards: c };
    }
    const G = PRESETS.find(d => d.id === 'gate-sea');
    const P = PRESETS.filter(d => ['normal', 'hard', 'gate', 'ex'].includes(d.level) && d.id !== 'gate-sea').map(capDeck);
    const res = {}; let W = 0, T = 0;
    for (const o of P) { let w = 0, n = 0; for (let i = 0; i < N; i++) { const r = SimDev.game(G, o, 'hard'); if (r.winner === 'draw') continue; n++; if (r.winner === 0) w++; } res[o.name] = Math.round(w / n * 100) + '%'; W += w; T += n; }
    return { res, all: Math.round(W / T * 100) + '%' };
  }, [N, CAP]);
  console.log('開放戦デッキ（gate-sea）の勝率', out.all); Object.entries(out.res).forEach(([k, v]) => console.log('  ', v.padStart(4), k));
  if (errs.length) console.log('ERR', [...new Set(errs)].slice(0, 5));
  await b.close();
})();
