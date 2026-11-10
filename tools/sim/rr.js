// node rr.js <試合数> <出力.json> : 上級・開放戦・超級デッキの総当たり（上級CPUどうし）。途中経過も書き出す
const { chromium } = require('playwright'); const fs = require('fs');
const N = +process.argv[2] || 20, OUT = process.argv[3];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', e => console.error('ERR', e.message));
  await p.goto('http://localhost:8765/index.html?draft'); await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0);
  await p.addScriptTag({ content: fs.readFileSync('/home/claude/kyokai/tools/sim/harness.js', 'utf8') });
  const ids = await p.evaluate(() => { SimDev.setRules({ rule: "current" }); return PRESETS.filter(d => ["hard", "gate", "ex"].includes(d.level)).map(d => d.id); });
  const res = {}; const t0 = Date.now();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const r = await p.evaluate(([a, c, N]) => {
      const A = PRESETS.find(d => d.id === a), C = PRESETS.find(d => d.id === c); let w = 0, n = 0, turns = 0;
      for (let k = 0; k < N; k++) { const r = k % 2 ? SimDev.game(C, A, "hard") : SimDev.game(A, C, "hard"); if (r.winner === "draw") continue; n++; turns += r.turns || 0; if ((k % 2 ? 1 : 0) === r.winner) w++; }
      return { w, n, turns: n ? +(turns / n).toFixed(1) : 0 };
    }, [ids[i], ids[j], N]);
    res[ids[i] + "|" + ids[j]] = r;
    fs.writeFileSync(OUT, JSON.stringify({ N, ids, res, sec: Math.round((Date.now() - t0) / 1000) }, null, 1));
  }
  console.log("done", Math.round((Date.now() - t0) / 1000)); await b.close();
})();
