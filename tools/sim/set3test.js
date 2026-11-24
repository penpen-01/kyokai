// 第3弾の仕組みの確認（開発用）。python3 -m http.server 8765 を立ててから node tools/sim/set3test.js [texts]
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html?draft');
  await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0 && typeof DEF !== 'undefined');
  const out = await p.evaluate((wantTexts) => {
    const R = [];
    const ok = (name, cond, info) => R.push((cond ? 'OK   ' : 'FAIL ') + name + (info ? '  ' + JSON.stringify(info) : ''));
    const filler = Object.fromEntries(['squire', 'st-recruit', 'pegasus', 'archer', 'st-golem'].map(id => [id, 6]));
    function fresh(first = 0) {
      MODE = 'sim'; SIM = true; CPU_LEVEL = 'hard';
      S = { gid: 't', phase: 'play', players: [mkPlayer('A', { name: 'A', cards: filler }), mkPlayer('B', { name: 'B', cards: filler })], rps: { picks: [null, null], round: 1, last: null },
        rpsWinner: null, first, mull: [true, true], decks: [], turn: first, turnNo: 1, over: false, winner: null, log: [], uidN: 0, seq: 0 };
      S.players.forEach(pl => { pl.maxE = 10; pl.e = 10; pl.hp = 20; pl.hand = []; pl.gy = []; pl.grave = []; });
      return S;
    }
    const put = (pi, id, o = {}) => { const u = addUnit(pi, id); u.born = 0; u.ready = true; Object.assign(u, o); return u; };
    const hand = (pi, id) => { S.players[pi].hand.push(id); return S.players[pi].hand.length - 1; };
    const play = (pi, id, t) => { const i = hand(pi, id); const r = playCard(pi, i, t || {}); return r; };
    const lastLog = () => S.log.slice(-6).map(l => l.msg).join(' / ');
    try {
      // 1. 亡霊：攻撃したあと破壊される
      fresh(); let g = put(0, 'm3-suihei');
      attack(0, g.uid, 'player');
      ok('亡霊は攻撃後に破壊', !S.players[0].field.includes(g) && S.players[0].gy.includes('m3-suihei') && S.players[1].hp === 18);
      // 2. ホタル：コスト3以下の亡霊を2体まで（CPUは自動）。墓地から出たときの効果
      fresh(); S.players[0].gy = ['m3-eirei', 'm3-suihei', 'm3-centurion', 'f3-gaikotsu']; S.players[0].grave = [...S.players[0].gy];
      play(0, 'm3-hotaru');
      const f0 = S.players[0].field.map(u => u.id);
      ok('ホタルで亡霊2体（コスト3以下）', f0.length >= 3 && !f0.includes('m3-centurion') && f0.filter(x => x !== 'm3-hotaru' && x !== 'tk-hero').length === 2, f0);
      ok('墓地から出たとき（骸骨甲板員+2 か 水兵の英霊）', S.players[0].field.some(u => u.id === 'f3-gaikotsu' && u.atk === 4) || f0.includes('tk-hero'), S.players[0].field.map(u => [u.id, u.atk]));
      // 2b. 人が選ぶ流れ（pick を直接）
      fresh(); S.players[0].gy = ['m3-eirei', 'x3-sabineji', 'f3-nakimushi']; S.pick = { pi: 0, kind: 'revive', ids: ['m3-eirei', 'x3-sabineji', 'f3-nakimushi'], max: 2, total: 5, mod: '' };
      ok('pick：上限を超える選び方は通らない', resolvePick(0, [0, 1, 2]) === false && !!S.pick);
      ok('pick：2体選ぶ', resolvePick(0, [0, 2]) === true && S.players[0].field.length === 2 && !S.pick);
      // 3. ラスティ：亡霊を失って装甲1
      fresh(); S.players[0].gy = ['m3-centurion']; play(0, 'x3-rusty');
      const ru = S.players[0].field.find(u => u.id === 'm3-centurion');
      ok('ラスティ：亡霊を失い装甲1', ru && !kw(ru, 'ghost') && armorOf(ru) === 1);
      // 4. 結界
      fresh(); play(0, 'm3-minato'); hitPlayer(0, 5);
      ok('結界で1回防ぐ', S.players[0].hp === 20 && !S.players[0].ward); hitPlayer(0, 3); ok('2回目は通る', S.players[0].hp === 17);
      // 5. 凪
      fresh(1); put(0, 'm3-nagisa'); S.turn = 1; S.turnNo = 5; const ri = hand(1, 'x-rush'); playCard(1, ri, {});
      const rr = S.players[1].field.find(u => u.id === 'x-rush');
      ok('凪：相手の速攻・突進は出たターン攻撃できない', rr && !rr.ready && attack(1, rr.uid, 'player') === false, rr && { ready: rr.ready });
      // 6. 不屈
      fresh(); const sg = put(1, 'f3-sango'); freezeUnit(sg); debuff(sg, 2); shrinkHp(sg, 3);
      ok('不屈：凍結・弱体を受けない', !sg.frozen && sg.atk === 2 && sg.maxHp === 9);
      // 7. 不壊
      fresh(); const sr = put(1, 'f3-suiryu'); play(0, 'x3-bunkai', {}); fxDestroy(sr); cleanup();
      ok('不壊：破壊されない', S.players[1].field.includes(sr)); hitUnit(sr, 7); cleanup(); ok('不壊：ダメージでは倒れる', !S.players[1].field.includes(sr));
      // 8. 岩殻
      fresh(); const gt = put(1, 'm3-gantetsu'); play(0, 'm3-trident', { enemy: gt.uid });
      ok('岩殻：効果ダメージ0', gt.hp === 7); const at = put(0, 'f3-suiryu'); attack(0, at.uid, gt.uid); ok('岩殻：攻撃は通る', gt.hp === 1, gt.hp);
      // 9. クラゲ魔法
      fresh(); let i = hand(0, 'tk-j-needle'); ok('クラゲ魔法：クラゲがいないと使えない', !canPlay(0, i).ok);
      S.players[0].hand = []; play(0, 'f3-komoriuta');
      ok('子守唄：ちびクラゲと魔法1枚', S.players[0].field.some(u => u.id === 'tk-chibi') && S.players[0].hand.some(id => JELLY_POOL.includes(id)), S.players[0].hand);
      put(1, 'squire'); S.players[0].hand = [];
      play(0, 'tk-j-cradle'); play(0, 'tk-j-flash');
      ok('使ったクラゲ魔法を数える', S.players[0].jellyN === 2);
      play(0, 'tk-j-tide'); ok('満ち潮：2×2=4', S.players[1].hp === 16, S.players[1].hp);
      // 10. オクタ（コスト-2）・ノクトの力
      fresh(); put(0, 'f3-octa'); i = hand(0, 'tk-j-tide'); ok('オクタ：満ち潮が4→2', effCost(0, DEF['tk-j-tide'], i) === 2);
      i = hand(0, 'tk-j-needle'); ok('オクタ：0より下がらない', effCost(0, DEF['tk-j-needle'], i) === 0);
      fresh(); const ch = put(0, 'tk-chibi'); play(0, 'f3-nocto'); ok('ノクト：ほかのクラゲ+1', ch.atk === 2);
      const nc = S.players[0].field.find(u => u.id === 'f3-nocto'); destroyUnit(nc); cleanup(); ok('ノクトが去ると戻る', ch.atk === 1);
      ok('ノクト：満ち潮を手札に', S.players[0].hand.includes('tk-j-tide'));
      // 11. 水夫長（墓地の亡霊の数）
      fresh(); S.players[0].gy = ['m3-eirei', 'm3-suihei', 'f3-nakimushi', 'x3-kirai', 'x3-sabineji', 'squire']; play(0, 'f3-suifucho');
      ok('水夫長：墓地の亡霊で攻撃+4（最大）', S.players[0].field[0].atk === 8, S.players[0].field[0].atk);
      // 12. 揺らぎ
      fresh(); put(1, 'st-golem'); const hp0 = S.players[0].hand.length; play(0, 'f3-takarabako');
      ok('揺らぎ：どれかが起きる', /揺らぎ/.test(S.log.map(l => l.msg).join()), lastLog());
      // 13. 潜航と次元干渉ブイ
      fresh(); const nt = put(0, 'x3-nautilus'); put(1, 'x3-kanshou'); endTurn(0);
      ok('潜航：ターンの終わりに亜空間へ', !S.players[0].field.includes(nt) && voidOf(S.players[0]).length === 1);
      endTurn(1); ok('戻ってきて、ブイの4ダメージ', S.players[0].field.includes(nt) && nt.hp === 3, nt.hp); ok('戻ったターンも攻撃できる', nt.ready);
      // 14. 道連れ
      fresh(); const a1 = put(0, 'm3-eirei'), a2 = put(0, 'squire'); put(1, 'x-gigas'); put(1, 'garm'); put(1, 'dragon');
      S.pick = { pi: 0, kind: 'pact', uids: [a1.uid, a2.uid], max: 2 }; resolvePick(0, [0, 1]);
      ok('道連れ：2体壊して相手も2体', S.players[0].field.length === 0 && S.players[1].field.length === 1, S.players[1].field.map(u => u.id));
      // 15. 天秤
      fresh(); put(0, 'squire'); put(0, 'x-gigas'); put(1, 'garm'); put(1, 'squire'); play(0, 'm3-tenbin');
      ok('天秤：両方の一番高いキャラ', !S.players[0].field.some(u => u.id === 'x-gigas') && !S.players[1].field.some(u => u.id === 'garm'));
      // 16. カリブディス
      fresh(); put(0, 'm3-charybdis'); put(1, 'squire'); put(1, 'garm'); endTurn(0);
      ok('カリブディス：一番安い相手キャラ', !S.players[1].field.some(u => u.id === 'squire') && S.players[1].field.some(u => u.id === 'garm'));
      // 17. スカーレット・ボルグ・召喚歌
      fresh(); S.players[1].hand = ['x-gigas']; play(0, 'm3-scarlet');
      const gi = S.players[0].hand.indexOf('x-gigas');
      ok('スカーレット：奪ってコスト-5', gi >= 0 && effCost(0, DEF['x-gigas'], gi) === Math.max(0, DEF['x-gigas'].cost - 5));
      fresh(); S.players[1].hand = ['squire']; play(0, 'f3-borg'); ok('ボルグ：相手のカードのコスト+1', effCost(1, DEF.squire, 0) === DEF.squire.cost + 1);
      fresh(); S.players[0].hand = ['m3-leviathan', 'm3-siren']; put(1, 'squire'); play(0, 'm3-shoukan');
      const lv = S.players[0].field.find(u => u.id === 'm3-leviathan');
      ok('召喚歌：一番重い海獣を出して登場時効果', lv && S.players[1].field.length === 0 && S.players[0].hp === 15 && lv.frozen);
      endTurn(0); endTurn(1); ok('召喚歌：次の自分のターンも攻撃できない', lv && !lv.ready);
      // 18. 分解砲（2体まで）
      fresh(); const e1 = put(1, 'squire'), e2 = put(1, 'pegasus'), e3 = put(1, 'x-gigas');
      i = hand(0, 'x3-bunkai'); ok('分解砲：2体目も選ぶ', neededRoles(0, DEF['x3-bunkai']).join() === 'enemy,enemy2', neededRoles(0, DEF['x3-bunkai']));
      ok('分解砲：コスト4以上は選べない', !targetOpts(0, 'enemy', DEF['x3-bunkai']).includes(e3.uid));
      ok('分解砲：同じキャラ2回は不可', playCard(0, i, { enemy: e1.uid, enemy2: e1.uid }) === false);
      playCard(0, i, { enemy: e1.uid, enemy2: e2.uid }); ok('分解砲：2体破壊', S.players[1].field.length === 1);
      // 19. アズーリア：回復した分のダメージ
      fresh(); const tg = put(1, 'x-gigas'); const h0 = tg.hp; play(0, 'm3-azuria');
      ok('アズーリア：回復5 → 相手に5ダメージ', S.players[0].hp === 25 && tg.hp === h0 - 5 + armorOf(tg), [S.players[0].hp, tg.hp]);
      // 20. カロン：1ターンに2回まで
      fresh(); put(0, 'm3-charon'); const gs = [put(0, 'm3-eirei'), put(0, 'f3-nakimushi'), put(0, 'x3-sabineji')]; const hn = S.players[0].hand.length;
      gs.forEach(destroyUnit); cleanup(); ok('カロン：引くのは2回まで', S.players[0].hand.length - hn === 2, S.players[0].hand.length - hn);
      // 21. 宿借り（攻撃されたとき）・角兎
      fresh(); const yd = put(1, 'm3-yadokari'); const atk1 = put(0, 'pegasus'); const ahp = atk1.hp; attack(0, atk1.uid, yd.uid);
      ok('宿借り：攻撃してきたキャラに1', atk1.hp === ahp - 1 - yd.atk || !S.players[0].field.includes(atk1), [atk1.hp, ahp]);
      // 22. 波乗りの唄
      fresh(); const sf = put(0, 'pegasus'); play(0, 'f3-naminori', { own: sf.uid }); attack(0, sf.uid, 'player');
      ok('波乗り：攻撃後に手札へ', !S.players[0].field.includes(sf) && S.players[0].hand.includes('pegasus'));
      // 23. 手招き（墓地へ・亡霊がいれば引く）
      fresh(); S.players[0].deck = ['squire', 'm3-eirei', 'squire', 'squire']; const hn2 = S.players[0].hand.length; play(0, 'f3-temaneki');
      ok('手招き：3枚墓地へ・亡霊がいたので1枚', S.players[0].gy.length >= 3 && S.players[0].hand.length === hn2 + 1, S.players[0].gy);
      // 24. 大行進の条件
      fresh(); put(0, 'm3-eirei'); S.players[0].gy = ['squire', 'squire', 'squire', 'squire', 'squire']; i = hand(0, 'f3-daikoushin');
      ok('大行進：墓地5体では使えない', !canPlay(0, i).ok); S.players[0].gy.push('pegasus'); ok('大行進：6体で使える', canPlay(0, i).ok);
      // 25. 舟唄：捨てるキャラがないと使えない
      fresh(); i = hand(0, 'm3-funauta'); ok('舟唄：手札にキャラがないと不可', !canPlay(0, i).ok); hand(0, 'squire'); ok('舟唄：キャラがあれば可', canPlay(0, i).ok);
      // 25b. 舟唄（CPU）：捨ててから2枚引く・銛打ち
      fresh(); S.players[0].hand = ['squire', 'm3-eirei', 'garm']; S.players[0].deck = ['pegasus', 'archer', 'dragon']; play(0, 'm3-funauta');
      ok('舟唄：亡霊を選んで捨て、2枚引く', S.players[0].gy.includes('m3-eirei') && S.players[0].hand.length === 4, S.players[0].hand);
      fresh(); S.players[0].hand = ['m3-siren', 'm3-leviathan']; play(0, 'm3-harpoon');
      ok('銛打ち：重い海獣のコスト-1', effCost(0, DEF['m3-leviathan'], 1) === 8);
      // 26. 亡霊に「攻撃されたとき」がない普通の攻撃で、反撃で倒れた亡霊も墓地へ
      fresh(); const gg = put(0, 'm3-centurion'); const big = put(1, 'x-gigas'); attack(0, gg.uid, big.uid);
      ok('亡霊：反撃で倒れても墓地へ（1枚だけ）', S.players[0].gy.filter(x => x === 'm3-centurion').length === 1);
    } catch (e) { R.push('EXCEPTION ' + e.message + '\n' + e.stack); }
    const texts = wantTexts ? CARDS.filter(c => c.set === '3').map(c => `[${c.id}] ${c.name}（${c.cost}${c.type === 'char' ? ` ${c.atk}/${c.hp}` : ''}）\n  ${cardText(c).replace(/\n/g, '\n  ')}`) : [];
    return { R, texts };
  }, process.argv[2] === 'texts');
  console.log(out.R.join('\n'));
  if (out.texts.length) console.log('\n' + out.texts.join('\n'));
  if (errs.length) console.log('PAGE ERRORS', errs);
  await b.close();
})();
