// 押し出し（場がいっぱいのとき、自分のキャラを墓地へ押し出して出す）の確認（開発用）
// python3 -m http.server 8765 を立ててから node tools/sim/pushtest.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(process.env.URL || 'http://localhost:8765/index.html?draft');
  await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0 && typeof DEF !== 'undefined');
  const out = await p.evaluate(() => {
    const R = [], ok = (n, c, i) => R.push((c ? 'OK   ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i) : ''));
    const filler = Object.fromEntries(['squire', 'st-recruit', 'pegasus', 'archer', 'st-golem'].map(id => [id, 6]));
    function fresh() {
      MODE = 'sim'; SIM = true; CPU_LEVEL = 'hard';
      S = { gid: 't', phase: 'play', players: [mkPlayer('A', { name: 'A', cards: filler }), mkPlayer('B', { name: 'B', cards: filler })], rps: { picks: [null, null], round: 1, last: null },
        rpsWinner: null, first: 0, mull: [true, true], decks: [], turn: 0, turnNo: 1, over: false, winner: null, log: [], uidN: 0, seq: 0 };
      S.players.forEach(pl => { pl.maxE = 10; pl.e = 10; pl.hp = 20; pl.hand = []; pl.gy = []; pl.grave = []; });
    }
    const put = (pi, id) => { const u = addUnit(pi, id); u.born = 0; u.ready = true; return u; };
    const hand = (pi, id) => { S.players[pi].hand.push(id); return S.players[pi].hand.length - 1; };
    const full = () => [put(0, 'x3-kirai'), put(0, 'm3-charon'), put(0, 'squire'), put(0, 'pegasus')];
    try {
      // 1. 切っているとき：これまでどおり出せない
      CONFIG.PUSH_OUT = 0; fresh(); full(); let i = hand(0, 'garm');
      ok('PUSH_OUT=0：場がいっぱいなら出せない', !canPlay(0, i).ok && !neededRoles(0, DEF.garm).includes('push'));
      // 2. 入れたとき：押し出して出す。倒されたとき（機雷の3ダメージ）・味方が倒されたとき（カロンのドロー）は発動しない
      CONFIG.PUSH_OUT = 1; fresh(); const [mine, ch] = full(); const foe = put(1, 'st-golem'); const fh = foe.hp, ehp = S.players[1].hp, hn = S.players[0].hand.length;
      i = hand(0, 'garm');
      ok('PUSH_OUT=1：出せる・押し出しを選ぶ', canPlay(0, i).ok && neededRoles(0, DEF.garm)[0] === 'push');
      ok('押し出しを選ばないと出せない', playCard(0, i, {}) === false);
      const r = playCard(0, i, { push: mine.uid }); cleanup();
      const f = S.players[0].field.map(u => u.id);
      ok('押し出して出た', r && f.includes('garm') && !f.includes('x3-kirai') && f.length === 4, f);
      ok('押し出したキャラは墓地へ', S.players[0].gy.includes('x3-kirai'));
      ok('倒されたときの効果は出ない', foe.hp === fh && S.players[1].hp === ehp, [foe.hp, S.players[1].hp]);
      ok('味方が倒されたとき（カロン）も出ない', S.players[0].hand.length === hn, S.players[0].hand.length);
      ok('倒した数・倒された数に入らない', !((S.stats || [{}, {}])[0].lost) && !((S.stats || [{}, {}])[1].kill));
      // 3. 効果でキャラを出す魔法（泡の揺りかご）：押し出すか選べる
      // 揺りかごは場にクラゲがいるときだけ使える：4体目をクラゲにする
      const fullJ = () => { const L = full(); S.players[0].field = S.players[0].field.filter(u => u !== L[3]); return [...L.slice(0, 3), put(0, 'f3-puka')]; };
      fresh(); fullJ(); i = hand(0, 'tk-j-cradle');
      ok('揺りかご：押し出すか選べる（押し出さないも選べる）', neededRoles(0, DEF['tk-j-cradle'])[0] === 'pushFx' && targetOpts(0, 'pushFx').includes('skip'));
      const hp0 = S.players[0].hp; const rs = playCard(0, i, { pushFx: 'skip' }); cleanup();
      ok('押し出さない：使えて、ちびクラゲは出ない（回復はする）', rs && !S.players[0].field.some(u => u.id === 'tk-chibi') && S.players[0].field.length === 4 && S.players[0].hp > hp0 - 1);
      fresh(); const [m2] = fullJ(); i = hand(0, 'tk-j-cradle'); playCard(0, i, { pushFx: m2.uid }); cleanup();
      ok('押し出す：ちびクラゲが出る', S.players[0].field.some(u => u.id === 'tk-chibi') && !S.players[0].field.includes(m2), S.players[0].field.map(u => u.id));
      // 4. キャラで、出たときにトークンも出す（連結ボット）：キャラの押し出し＋効果の押し出し
      fresh(); const [a1, a2] = full(); i = hand(0, 'x3-renketsu');
      const rr = neededRoles(0, DEF['x3-renketsu']);
      ok('連結ボット：2回選べる', rr[0] === 'push' && rr[1] === 'pushFx', rr);
      ok('同じキャラを2回押し出せない', playCard(0, i, { push: a1.uid, pushFx: a1.uid }) === false);
      playCard(0, i, { push: a1.uid, pushFx: a2.uid }); cleanup();
      ok('連結ボットと船幽霊が出る', S.players[0].field.some(u => u.id === 'x3-renketsu') && S.players[0].field.some(u => u.id === 'tk-funa'), S.players[0].field.map(u => u.id));
      // 5. 奪ったキャラは元の持ち主の墓地へ
      fresh(); full(); const st = S.players[0].field[3]; st.owner = 1; i = hand(0, 'garm'); playCard(0, i, { push: st.uid }); cleanup();
      ok('奪ったキャラは元の持ち主の墓地', S.players[1].gy.includes('pegasus') && !S.players[0].gy.includes('pegasus'));
      // 6. 空きがあるときは聞かない
      fresh(); put(0, 'squire'); ok('空きがあれば押し出しは出ない', !neededRoles(0, DEF.garm).length && !neededRoles(0, DEF['tk-j-cradle']).length);
      // 7. CPU：攻撃力0にされて動けないキャラで埋まっていても、押し出して強いキャラを出す
      fresh(); for (let k = 0; k < 4; k++) { const u = put(1, 'squire'); u.atk = 0; } S.turn = 1; S.players[1].hand = ['y2-dragonking']; S.players[1].e = 10;
      const a = cpuChoose(1);
      ok('CPU：押し出して出す', a && a.t === 'play' && a.targets && a.targets.push != null, a);
      if (a) { applyAction(1, a); cleanup(); }
      ok('CPU：出た', S.players[1].field.some(u => u.id === 'y2-dragonking'));
      // 8. 運営用アカウントは PUSH_OUT=0 でも CPU 戦で試せる（対人戦は不可）
      CONFIG.PUSH_OUT = 0; Ops.admin = true; MODE = 'cpu'; ok('運営：CPU戦で使える', pushOn()); MODE = 'online'; ok('運営：対人戦では使えない', !pushOn()); Ops.admin = false; MODE = 'sim';
    } catch (e) { R.push('FAIL 例外 ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
    return R;
  });
  out.forEach(x => console.log(x));
  if (errs.length) console.log('PAGE ERRORS', [...new Set(errs)].slice(0, 5));
  await b.close();
})();
