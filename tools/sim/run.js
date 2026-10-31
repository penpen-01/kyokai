const { chromium } = require('playwright');
const fs = require('fs');
const [,, variantJson, nStr, level, which] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.error('ERR', e.message));
  await p.goto('http://localhost:8765/index.html?draft');
  await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0);
  await p.addScriptTag({ content: fs.readFileSync(__dirname + '/harness.js', 'utf8') });
  await p.addScriptTag({ content: fs.readFileSync(__dirname + '/decks.js', 'utf8') });
  const out = await p.evaluate(([v, n, level, which]) => {
    const err = [];
    Object.entries(SIM_DECKS).forEach(([k, d]) => Object.entries(d.cards).forEach(([id, c]) => { if (!DEF[id]) err.push(k + ':' + id); }));
    if (err.length) return { err };
    SimDev.setRules(JSON.parse(v));
    const decks = which === 'presets' ? Object.fromEntries(PRESETS.filter(d => d.id !== 'starter').map(d => [d.id, d])) : SIM_DECKS;
    const t0 = performance.now();
    const r = SimDev.run(decks, +n, level);
    r.ms = Math.round(performance.now() - t0); r.patched = SimDev.evalPatched;
    return r;
  }, [variantJson, nStr, level || 'normal', which || 'arch']);
  console.log(JSON.stringify(out));
  await b.close();
})();
