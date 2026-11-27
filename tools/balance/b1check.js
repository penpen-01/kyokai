// 第1回の調整（b1.py）を当てたデータで、動きを確かめる（サーバー不要）
// node tools/balance/b1check.js [当てたあとの game-data.json]（省略するとリポジトリの game-data.json）
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'); const ROOT = path.resolve(__dirname, '../..'), GD = process.argv[2] ? path.resolve(process.argv[2]) : null;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route('http://kyokai.local/**', r => { const u = new URL(r.request().url()); let f = path.join(ROOT, decodeURIComponent(u.pathname)); if (u.pathname === '/game-data.json' && GD) f = GD; if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' }); const e = path.extname(f); r.fulfill({ status: 200, contentType: { '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' }[e] || 'application/octet-stream', body: fs.readFileSync(f) }); });
  await p.route(/^(?!http:\/\/kyokai\.local)/, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); }); await p.goto('http://kyokai.local/index.html?draft'); try { await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0, null, { timeout: 15000 }); } catch (e) { console.log('LOAD FAIL', errs); await b.close(); return; }
  const out = await p.evaluate(() => {
    const R = [], ok = (n, c, i) => R.push((c ? 'OK   ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i) : ''));
    const filler = Object.fromEntries(['squire', 'st-recruit', 'pegasus', 'archer', 'st-golem'].map(id => [id, 6]));
    function fresh() { MODE = 'sim'; SIM = true; S = { gid: 't', phase: 'play', players: [mkPlayer('A', { name: 'A', cards: filler }), mkPlayer('B', { name: 'B', cards: filler })], rps: { picks: [null, null], round: 1, last: null }, rpsWinner: null, first: 0, mull: [true, true], decks: [], turn: 0, turnNo: 1, over: false, winner: null, log: [], uidN: 0, seq: 0 }; S.players.forEach(pl => { pl.maxE = 10; pl.e = 10; pl.hp = 20; pl.hand = []; pl.gy = []; pl.grave = []; }); }
    const hand = (pi, id) => { S.players[pi].hand.push(id); return S.players[pi].hand.length - 1; };
    // 文
    ['f-whisper', 'f2-tamamo', 'f-horn', 'x-reboot', 'm2-transfer', 'm2-reboot', 'm2-selfdestruct', 'y2-kensei', 'f2-dancer'].forEach(id => R.push('     ' + DEF[id].name + '（' + DEF[id].cost + '）' + (DEF[id].type === 'char' ? ` ${DEF[id].atk}/${DEF[id].hp}` : '') + '：' + cardText(DEF[id]).replace(/\n/g, ' ／ ')));
    // 囁き：このターンだけ
    fresh(); let i = hand(0, 'f-whisper'); hand(0, 'pegasus'); playCard(0, i, {});
    const c1 = effCost(0, DEF.pegasus, S.players[0].hand.indexOf('pegasus'));
    endTurn(0); endTurn(1); const c2 = effCost(0, DEF.pegasus, S.players[0].hand.indexOf('pegasus'));
    ok('囁き：そのターンは-1、次のターンには残らない', c1 === DEF.pegasus.cost - 1 && c2 === DEF.pegasus.cost, [c1, c2]);
    // 化かし：狐火だけ
    fresh(); hand(0, 'f2-tamamo'); i = hand(0, 'f-whisper'); playCard(0, i, {});
    const t1 = effCost(0, DEF['f2-tamamo'], S.players[0].hand.indexOf('f2-tamamo'));
    i = hand(0, 'tk-foxfire'); playCard(0, i, {}); const t2 = effCost(0, DEF['f2-tamamo'], S.players[0].hand.indexOf('f2-tamamo'));
    ok('タマモ：囁きでは下がらず（囁きの-1は次の1枚に効く）、狐火で下がる', t1 === 12 - 1 && t2 === 12 - 1, [t1, t2]);
    fresh(); hand(0, 'f2-tamamo'); i = hand(0, 'tk-foxfire'); playCard(0, i, {}); i = hand(0, 'tk-foxfire'); playCard(0, i, {});
    ok('タマモ：狐火2枚で-2', effCost(0, DEF['f2-tamamo'], 0) === 10, effCost(0, DEF['f2-tamamo'], 0));
    fresh(); hand(0, 'f2-tamamo'); i = hand(0, 'f2-walpurgis'); if (DEF['f2-walpurgis']) { S.players[0].e = 10; i = hand(0, 'f-blizzard'); }
    // タマモ：登場時のダメージなし
    fresh(); for (let k = 0; k < 3; k++) { const u = addUnit(1, 'squire'); u.born = 0; } S.players[0].played = 5; i = hand(0, 'f2-tamamo'); playCard(0, i, {}); cleanup();
    ok('タマモ：登場時に相手キャラへダメージを与えない', S.players[1].field.length === 3 && S.players[1].field.every(u => u.hp === DEF.squire.hp));
    // 角笛：体力2
    fresh(); i = hand(0, 'f-horn'); playCard(0, i, {}); ok('角笛：体力2を払う', S.players[0].hp === 18, S.players[0].hp);
    fresh(); S.players[0].hp = 2; i = hand(0, 'f-horn'); ok('角笛：体力2以下なら使えない', !canPlay(0, i).ok);
    // 再起動：同じ枚数
    fresh(); ['squire', 'pegasus', 'archer'].forEach(id => hand(0, id)); i = hand(0, 'x-reboot'); playCard(0, i, {}); ok('再起動：入れ替えて同じ枚数', S.players[0].hand.length === 3, S.players[0].hand.length);
    ok('押し出しが有効', pushOn());
    return R;
  });
  out.forEach(x => console.log(x)); if (errs.length) console.log('PAGE ERRORS', [...new Set(errs)].slice(0, 5));
  await b.close();
})();
