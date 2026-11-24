// 第3弾のデッキで CPU 同士を対戦させて、エラーと勝率を見る（開発用）
// node tools/sim/set3sim.js 試合数 強さ [old]   old を付けると、上級・開放戦・超級の既存デッキとも当てる
const { chromium } = require('playwright');
const fs = require('fs');
const [,, nStr, level, withOld] = process.argv;
const D3 = {
  ghost: { name: "幽霊船団", cards: { "m3-eirei": 3, "f3-nakimushi": 3, "x3-sabineji": 3, "x3-renketsu": 3, "m3-hakamori": 2, "f3-gaikotsu": 3, "m3-suihei": 2, "x3-dock": 2, "f3-tamayobi": 2, "m3-charon": 2, "f3-veil": 2, "m3-hatamochi": 2, "f3-grave": 1 } },
  ghost2: { name: "亡霊（重め）", cards: { "m3-eirei": 2, "x3-kirai": 2, "m3-hakamori": 3, "x3-yoduri": 2, "x3-renketsu": 3, "m3-hatamochi": 2, "m3-charon": 2, "x3-dock": 2, "m3-eiji": 2, "x3-shinsui": 2, "m3-hotaru": 2, "x3-rusty": 2, "f3-veil": 2, "x3-senkan": 1, "f3-grave": 1 } },
  jelly: { name: "クラゲ", cards: { "f3-komoriuta": 3, "x3-shingou": 3, "f3-puka": 3, "f3-yurameki": 3, "x3-houden": 2, "x3-chikuden": 2, "f3-tomoshibi": 3, "x3-baiyou": 2, "x3-buoy": 2, "x3-hikari": 2, "f3-nocto": 1, "f3-octa": 1, "x3-daihouden": 2, "f3-uzumaki": 1 } },
  beast: { name: "海獣", cards: { "m3-harpoon": 3, "m3-fue": 3, "m3-siren": 3, "m3-yadokari": 3, "m3-uni": 2, "m3-trident": 3, "m3-aspido": 2, "m3-shoukan": 2, "m3-scylla": 2, "m3-hippo": 2, "m3-kraken": 1, "m3-charybdis": 1, "m3-leviathan": 1, "m3-ikari": 2 } },
  mechsea: { name: "機械の海", cards: { "x3-iruka": 3, "x3-yoduri": 2, "x3-hamasouji": 3, "x3-kyunan": 2, "x3-gyorai": 3, "x3-crane": 2, "x3-gearshark": 2, "x3-lux": 2, "x3-orca": 1, "x3-shouha": 2, "x3-bunkai": 2, "x3-nikyaku": 2, "x3-kanshou": 1, "x3-nautilus": 1, "x3-pururu": 2 } },
  dayfan: { name: "昼の海", cards: { "f3-kodako": 3, "f3-tobiuo": 3, "f3-tobinori": 3, "f3-shabon": 2, "f3-sango": 2, "f3-marina": 2, "f3-tayori": 2, "f3-tsunousagi": 3, "f3-hugh": 3, "f3-naminori": 2, "f3-sumi": 3, "f3-suiryu": 1, "f3-borg": 1 } }
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html?draft');
  await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0);
  await p.addScriptTag({ content: fs.readFileSync(__dirname + '/harness.js', 'utf8') });
  if (process.env.GHASTE) await p.evaluate(() => { window.__haste = 1; });
  if (process.env.GBUFF) await p.evaluate(v => { window.__buff = v.split(',').map(Number); }, process.env.GBUFF);
  const out = await p.evaluate(([D3, n, level, withOld]) => {
    const bad = [];
    Object.entries(D3).forEach(([k, d]) => { const t = Object.values(d.cards).reduce((a, x) => a + x, 0); if (t !== 30) bad.push(k + ':' + t); Object.keys(d.cards).forEach(id => { if (!DEF[id]) bad.push(k + ':' + id); }); });
    if (bad.length) return { bad };
    if (window.__buff) CARDS.filter(c => c.set === '3' && c.keywords.includes('ghost')).forEach(c => { DEF[c.id].atk += window.__buff[0]; DEF[c.id].hp += window.__buff[1]; });
    if (window.__haste) { const o = window.resolvePick; window.resolvePick = function (pi, sel, inl) { const before = new Set(S.players[pi].field); const r = o(pi, sel, inl); S.players[pi].field.forEach(u => { if (!before.has(u)) u.ready = true; }); return r; }; }
    const decks = { ...D3 };
    if (withOld) PRESETS.filter(d => ['hard', 'gate', 'ex'].includes(d.level)).forEach(d => { decks[d.id] = d; });
    const names = Object.keys(decks), res = {}, card = {}, ex = [];
    names.forEach(k => res[k] = { w: 0, g: 0, name: decks[k].name });
    const t0 = performance.now();
    for (const a of names) for (const b of names) {
      if (a >= b) continue;
      if (withOld && !D3[a] && !D3[b]) continue;
      for (let i = 0; i < n; i++) {
        let r;
        try { r = SimDev.game(decks[a], decks[b], level); } catch (e) { ex.push(a + ' vs ' + b + ': ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]); continue; }
        res[a].g++; res[b].g++;
        if (r.winner === 0) res[a].w++; else if (r.winner === 1) res[b].w++;
        r.played.forEach((L, pi) => L.forEach(id => { const c = card[id] || (card[id] = { n: 0, w: 0 }); c.n++; if (r.winner === pi) c.w++; }));
      }
    }
    return { ms: Math.round(performance.now() - t0), res, ex: ex.slice(0, 30), exN: ex.length, card: Object.fromEntries(Object.entries(card).filter(([id]) => DEF[id] && DEF[id].set === '3').map(([id, c]) => [DEF[id].name, Math.round(c.w / c.n * 100) + '% / ' + c.n])) };
  }, [D3, +nStr || 10, level || 'normal', !!withOld]);
  if (out.bad) { console.log('BAD', out.bad); await b.close(); return; }
  console.log('ms', out.ms, 'exceptions', out.exN); out.ex.forEach(x => console.log('  ', x));
  Object.entries(out.res).sort((x, y) => y[1].w / y[1].g - x[1].w / x[1].g).forEach(([k, r]) => console.log((r.w / r.g * 100).toFixed(0).padStart(4) + '%', String(r.g).padStart(4), k, r.name));
  if (process.env.CARDS) console.log(out.card);
  if (errs.length) console.log('PAGE ERRORS', [...new Set(errs)].slice(0, 10));
  await b.close();
})();
