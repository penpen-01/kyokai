// 強さの比較：A の強さ（LA）と B の強さ（LB）で、同じデッキの組み合わせを先後入れ替えて戦わせる
// node duel.js 組あたり試合数 LA LB [デッキの絞り込み正規表現]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = '/home/user/kyokai';
const [,, nStr, LA, LB, filt] = process.argv;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('http://kyokai.local/**', r => {
    const u = new URL(r.request().url()); let f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await p.route(/^(?!http:\/\/kyokai\.local)/, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://kyokai.local/index.html?draft');
  await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0);
  await p.addScriptTag({ content: fs.readFileSync(ROOT + '/tools/sim/harness.js', 'utf8') });
  if (process.env.EVAL) await p.evaluate(process.env.EVAL);
  const out = await p.evaluate(([n, LA, LB, filt]) => {
    const re = filt ? new RegExp(filt) : null;
    const decks = PRESETS.filter(d => ['hard', 'gate', 'ex'].includes(d.level) && (!re || re.test(d.id + d.name)));
    let w = 0, l = 0, dr = 0, ms = 0, calls = 0; const per = {};
    const orig = window.cpuChoose;
    const t0 = performance.now();
    for (let i = 0; i < decks.length; i++) for (let j = 0; j < decks.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < n; k++) {
        // 0 番が LA、1 番が LB
        window.cpuChoose = pi => { CPU_LEVEL = pi === 0 ? LA : LB; const t = performance.now(); const r = orig(pi); if (pi === 0) { ms += performance.now() - t; calls++; } return r; };
        let r; try { r = SimDev.game(decks[i], decks[j], LA); } catch (e) { continue; }
        const key = decks[i].name; per[key] = per[key] || [0, 0];
        per[key][1]++;
        if (r.winner === 0) { w++; per[key][0]++; } else if (r.winner === 1) l++; else dr++;
      }
    }
    window.cpuChoose = orig;
    return { w, l, dr, decks: decks.length, total: Math.round(performance.now() - t0), msPerCall: +(ms / Math.max(1, calls)).toFixed(1), per };
  }, [+nStr || 2, LA, LB, filt || '']);
  console.log(`${LA} vs ${LB}: ${out.w}勝 ${out.l}敗 ${out.dr}分  勝率 ${(out.w / (out.w + out.l) * 100).toFixed(1)}%  デッキ${out.decks}  ${(out.total / 1000).toFixed(0)}秒  1手 ${out.msPerCall}ms`);
  if (process.env.PER) console.log(out.per);
  if (errs.length) console.log('PAGE ERRORS', [...new Set(errs)].slice(0, 5));
  await b.close();
})();
