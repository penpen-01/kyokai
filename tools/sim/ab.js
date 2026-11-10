// node ab.js <試合数> [デッキ名,...] : 新しい考え方（0番）× 前の考え方（1番）。同じデッキどうし・各デッキ×相手全体
const { chromium } = require('playwright'); const fs = require('fs');
const N = +process.argv[2] || 20, ONLY = process.argv[3] ? process.argv[3].split(",") : null, K = process.argv[4] ? JSON.parse(process.argv[4]) : null;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', e => console.error('ERR', e.message));
  await p.goto('http://localhost:8765/index.html?draft'); await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0);
  await p.addScriptTag({ content: fs.readFileSync('/home/claude/kyokai/tools/sim/harness.js', 'utf8') });
  const out = await p.evaluate(([N, ONLY, K]) => {
    SimDev.setRules({ rule: "current" }); if (K) Object.assign(CTRL_K, K);
    const all = PRESETS.filter(d => ["hard", "gate", "ex"].includes(d.level));
    const mine = ONLY ? all.filter(d => ONLY.includes(d.name)) : all;
    const res = {};
    for (const A of mine) {
      let w = 0, n = 0, wo = 0, no = 0;
      for (const B of all) for (let i = 0; i < N; i++) {
        // 新（A）vs 旧（B）
        window.CPU_TUNE = [true, false]; let r = SimDev.game(A, B, "hard"); if (r.winner !== "draw") { n++; if (r.winner === 0) w++; }
        // 旧（A）vs 旧（B）：比較用
        window.CPU_TUNE = [false, false]; r = SimDev.game(A, B, "hard"); if (r.winner !== "draw") { no++; if (r.winner === 0) wo++; }
      }
      res[A.name] = { new: Math.round(w / n * 100), old: Math.round(wo / no * 100) };
    }
    window.CPU_TUNE = null; return res;
  }, [N, ONLY, K]);
  console.log(JSON.stringify(out)); await b.close();
})();
