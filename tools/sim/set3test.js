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
      ok('亡霊は攻撃後に破壊', !S.players[0].field.includes(g) && S.players[0].gy.includes('m3-suihei') && S.players[1].hp === 17);
      // 2. ホタル：コスト3以下の亡霊を2体まで（CPUは自動）。墓地から出たときの効果
      fresh(); S.players[0].gy = ['m3-eirei', 'm3-suihei', 'm3-centurion', 'f3-gaikotsu']; S.players[0].grave = [...S.players[0].gy];
      play(0, 'm3-hotaru');
      const f0 = S.players[0].field.map(u => u.id);
      ok('ホタルで亡霊2体（コスト3以下）', f0.length >= 3 && !f0.includes('m3-centurion') && f0.filter(x => x !== 'm3-hotaru' && x !== 'tk-funa').length === 2, f0);
      ok('墓地から出たとき（骸骨甲板員+2 か 水兵の英霊）', S.players[0].field.some(u => u.id === 'f3-gaikotsu' && u.atk === 5) || f0.includes('tk-funa'), S.players[0].field.map(u => [u.id, u.atk]));
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
      ok('岩殻：効果ダメージ0', gt.hp === 7); const at = put(0, 'f3-suiryu'); attack(0, at.uid, gt.uid); ok('岩殻：攻撃は通る', gt.hp === 7 - DEF['f3-suiryu'].atk, gt.hp);
      // 9. クラゲ魔法
      fresh(); let i = hand(0, 'tk-j-needle'); ok('クラゲ魔法：クラゲがいないと使えない', !canPlay(0, i).ok);
      S.players[0].hand = []; play(0, 'f3-komoriuta');
      ok('子守唄：ちびクラゲと魔法1枚', S.players[0].field.some(u => u.id === 'tk-chibi') && S.players[0].hand.some(id => JELLY_POOL.includes(id)), S.players[0].hand);
      put(1, 'squire'); S.players[0].hand = [];
      play(0, 'tk-j-cradle'); play(0, 'tk-j-flash');
      ok('使ったクラゲ魔法を数える', S.players[0].jellyN === 2);
      { S.players[0].gy.push('f3-puka', 'tk-chibi'); const jn = S.players[0].gy.filter(id => DEF[id] && DEF[id].type === 'char' && DEF[id].tribe === 'jelly').length; const h0 = S.players[1].hp; play(0, 'tk-j-tide'); ok('満ち潮：墓地のクラゲの数だけダメージ', jn > 0 && h0 - S.players[1].hp === jn, { jn, d: h0 - S.players[1].hp }); }
      // 10. オクタ（コスト-2）・ノクトの力
      fresh(); S.players[0].deck = ['squire', 'm3-kraken']; const gj = put(0, 'm3-gyojin'); S.players[0].hand = []; gj.hp = 0; cleanup(); ok('魚人兵：倒されると山札から海獣', S.players[0].hand.includes('m3-kraken'), S.players[0].hand);
      fresh(); const ub = put(1, 'm3-umibouzu'); const ua = put(0, 'pegasus'); attack(0, ua.uid, ub.uid); ok('海坊主：攻撃してきたキャラを行動不能', ua.frozen || !S.players[0].field.includes(ua), { frozen: ua.frozen, hp: ua.hp });
      fresh(); put(0, 'f3-octa'); i = hand(0, 'tk-j-tide'); ok('オクタ：満ち潮が4→2', effCost(0, DEF['tk-j-tide'], i) === 2);
      i = hand(0, 'tk-j-needle'); ok('オクタ：0より下がらない', effCost(0, DEF['tk-j-needle'], i) === 0);
      fresh(); const ch = put(0, 'tk-chibi'); play(0, 'f3-nocto'); ok('ノクト：ほかのクラゲ+1', ch.atk === 2);
      const nc = S.players[0].field.find(u => u.id === 'f3-nocto'); destroyUnit(nc); cleanup(); ok('ノクトが去ると戻る', ch.atk === 1);
      ok('ノクト：満ち潮を手札に', S.players[0].hand.includes('tk-j-tide'));
      // 11. 水夫長（墓地の亡霊の数）
      fresh(); S.players[0].gy = ['m3-eirei', 'm3-suihei', 'f3-nakimushi', 'x3-kirai', 'x3-sabineji', 'squire']; play(0, 'f3-suifucho');
      ok('水夫長：墓地の亡霊で攻撃+4（最大）', S.players[0].field[0].atk === 9, S.players[0].field[0].atk);
      // 12. 使ったときに中身が決まる魔法
      fresh(); put(1, 'st-golem'); const hp0 = S.players[0].hand.length; play(0, 'f3-takarabako');
      ok('ランダムな中身：どれかが起きる', /の中身は「/.test(S.log.map(l => l.msg).join()), lastLog());
      // 13. 潜航と次元干渉ブイ
      fresh(); const nt = put(0, 'x3-nautilus'); put(1, 'x3-kanshou'); endTurn(0);
      ok('潜航：ターンの終わりに亜空間へ', !S.players[0].field.includes(nt) && voidOf(S.players[0]).length === 1);
      endTurn(1); ok('戻ってきて、ブイのダメージ', S.players[0].field.includes(nt) && nt.hp === 7 - DEF['x3-kanshou'].effects[0].n, nt.hp); ok('戻ったターンも攻撃できる', nt.ready);
      S.players[1].field = []; endTurn(0); endTurn(1); endTurn(0); ok('潜航：3回目は潜らない', S.players[0].field.includes(nt) && nt.dives === 2, nt.dives);
      // 13b. 幽霊ドック：ターンの始めに亡霊を出して突進
      fresh(); put(0, 'x3-dock'); S.players[0].gy = ['m3-eirei', 'm3-centurion']; endTurn(0); endTurn(1);
      const dk = S.players[0].field.find(u => u.id === 'm3-eirei');
      ok('ドック：コスト2以下の亡霊を出して突進', dk && kw(dk, 'rush') && !S.players[0].field.some(u => u.id === 'm3-centurion'));
      // 13c. 魂呼び：コスト3以下を3体まで（合計7以下）
      fresh(); S.players[0].gy = ['m3-eirei', 'f3-nakimushi', 'x3-sabineji', 'x3-renketsu', 'm3-suihei', 'm3-centurion']; play(0, 'f3-tamayobi');
      const tf = S.players[0].field.filter(u => !DEF[u.id].token);
      ok('魂呼び：3体・合計7以下・5コストは出ない', tf.length === 3 && tf.reduce((a, u) => a + DEF[u.id].cost, 0) <= 7 && !tf.some(u => u.id === 'm3-centurion'), tf.map(u => u.id));
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
      ok('スカーレット：奪ってコストを下げる', gi >= 0 && effCost(0, DEF['x-gigas'], gi) === Math.max(0, DEF['x-gigas'].cost - DEF['m3-scarlet'].effects[0].n));
      fresh(); S.players[1].hand = ['squire']; play(0, 'f3-borg'); ok('ボルグ：相手のカードのコストを上げる', effCost(1, DEF.squire, 0) === DEF.squire.cost + DEF['f3-borg'].effects[0].n);
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
      gs.forEach(destroyUnit); cleanup(); ok('カロン：引くのは1ターンに1回', S.players[0].hand.length - hn === 1, S.players[0].hand.length - hn);
      // 21. 宿借り（攻撃されたとき）・角兎
      fresh(); const yd = put(1, 'm3-yadokari'); const atk1 = put(0, 'pegasus'); const ahp = atk1.hp; attack(0, atk1.uid, yd.uid);
      ok('宿借り：攻撃してきたキャラに1', atk1.hp === ahp - 1 - yd.atk || !S.players[0].field.includes(atk1), [atk1.hp, ahp]);
      // 22. 波乗りの唄
      fresh(); const sf = put(0, 'pegasus'); play(0, 'f3-naminori', { own: sf.uid }); attack(0, sf.uid, 'player');
      ok('波乗り：攻撃後に手札へ', !S.players[0].field.includes(sf) && S.players[0].hand.includes('pegasus'));
      // 23. 手招き（墓地へ・亡霊がいれば引く）
      fresh(); S.players[0].gy = ['squire', 'm3-eirei', 'm3-suihei']; play(0, 'f3-temaneki');
      ok('手招き：墓地のコスト2以下の亡霊を出す', S.players[0].field.some(u => u.id === 'm3-eirei') && !S.players[0].field.some(u => u.id === 'm3-suihei'), S.players[0].field.map(u => u.id));
      fresh(); const sq = put(0, 'squire'); S.players[0].gy = ['m3-eirei', 'x-gigas', 'x3-sabineji']; play(0, 'x3-kinkyu', { sacrifice: sq.uid }); ok('緊急再起動：墓地の機械（コスト5以下）を出す', S.players[0].field.some(u => DEF[u.id].world === 'mech' && DEF[u.id].cost <= 5) && !S.players[0].field.some(u => u.id === 'm3-eirei'), S.players[0].field.map(u => u.id));
      fresh(); put(1, 'squire'); const bigS = put(1, 'dragon'); S.players[0].gy = ['x3-senkan']; play(0, 'f3-grave'); ok('幽霊戦艦：戻ると攻撃力が一番高い相手を破壊', !S.players[1].field.includes(bigS));
      // 24. 大行進の条件
      fresh(); put(0, 'f3-grave'); S.players[0].gy = ['squire', 'squire', 'squire', 'squire', 'm3-eirei', 'm3-suihei', 'f3-nakimushi', 'x3-sabineji']; i = hand(0, 'f3-daikoushin');
      ok('大行進：墓地の亡霊4体では使えない', !canPlay(0, i).ok); S.players[0].gy.push('x3-kirai'); ok('大行進：亡霊5体なら（亡霊でないキャラが場にいても）使える', canPlay(0, i).ok);
      // 24b. 11-25 の調整
      fresh(); put(0, 'f3-octa'); ok('オクタ：魔法すべて-2（0まで）', effCost(0, DEF['bolt'], 0) === 0 && effCost(0, DEF['m3-trident'], 0) === 1 && effCost(0, DEF['tk-j-tide'], 0) === 2 && effCost(0, DEF['squire'], 0) === DEF['squire'].cost);
      fresh(); put(0, 'm3-aspido'); ok('アスピドケロン：手札の海獣-1', effCost(0, DEF['m3-leviathan'], 0) === DEF['m3-leviathan'].cost - DEF['m3-aspido'].aura.n && effCost(0, DEF['m3-trident'], 0) === DEF['m3-trident'].cost);
      fresh(); put(0, 'm3-kraken'); put(0, 'm3-scylla'); play(0, 'm3-hippo'); const hp = S.players[0].field.find(u => u.id === 'm3-hippo');
      ok('ヒッポ：ほかの海獣2体で+2/+2（スキュラで攻撃+1）', hp && hp.atk === 8 && hp.hp === 7, hp && [hp.atk, hp.hp]);
      fresh(); const chb = put(0, 'tk-chibi'); chb.hp = 0; cleanup(); ok('ちびクラゲ：倒されると墓地へ（満ち潮で数える）', S.players[0].gy.includes('tk-chibi'));
      fresh(); put(0, 'tk-chibi'); const fz = put(1, 'squire'); fz.hp = 5; play(0, 'tk-j-flash'); ok('青い閃光：全体1ダメージ＋行動不能', fz.hp === 4 && (fz.frozen || fz.ready === false));
      fresh(); S.players[0].gy = ['m3-eirei']; play(0, 'm3-centurion'); ok('百人隊長：登場時に亡霊を出す', S.players[0].field.some(u => u.id === 'm3-eirei'));
      // 25. 舟唄：捨てるキャラがないと使えない
      fresh(); i = hand(0, 'm3-funauta'); ok('舟唄：手札にキャラがないと不可', !canPlay(0, i).ok); hand(0, 'squire'); ok('舟唄：キャラ1枚では不可', !canPlay(0, i).ok); hand(0, 'archer'); ok('舟唄：キャラ2枚あれば可', canPlay(0, i).ok);
      // 25b. 舟唄（CPU）：捨ててから2枚引く・銛打ち
      fresh(); S.players[0].hand = ['squire', 'm3-eirei', 'garm']; S.players[0].deck = ['pegasus', 'archer', 'dragon']; play(0, 'm3-funauta');
      ok('舟唄：2枚選んで捨て、2枚引く（亡霊を優先）', S.players[0].gy.includes('m3-eirei') && S.players[0].hand.length === 3, S.players[0].hand);
      fresh(); put(0, 'squire'); i = hand(0, 'm3-tenbin'); ok('天秤：相手の場が空なら使えない', !canPlay(0, i).ok); put(1, 'squire'); ok('天秤：おたがいにいれば使える', canPlay(0, i).ok);
      fresh(); S.players[0].gy = ['squire', 'm3-shoukan']; play(0, 'f3-selkie'); ok('セルキー：墓地の召喚歌を手札へ', S.players[0].hand.includes('m3-shoukan'));
      fresh(); S.players[0].deck = ['squire', 'm3-shoukan', 'archer']; play(0, 'm3-siren'); ok('セイレーン：山札の召喚歌を手札へ', S.players[0].hand.includes('m3-shoukan'));
      fresh(); S.players[0].hand = []; play(0, 'f3-barba'); ok('バルバ：宝箱をコスト0で', S.players[0].hand[0] === 'f3-takarabako' && effCost(0, DEF['f3-takarabako'], 0) === 0);
      fresh(); S.players[0].gy = ['dragon', 'm3-eirei']; S.players[0].hand = []; play(0, 'x3-haizai'); ok('廃材あさり：墓地のキャラを選んで手札へ', S.players[0].hand.length === 1 && !S.players[0].gy.includes(S.players[0].hand[0]));
      fresh(); S.players[0].hand = ['m3-siren', 'm3-leviathan']; play(0, 'm3-harpoon');
      ok('銛打ち：重い海獣のコスト-1', effCost(0, DEF['m3-leviathan'], 1) === DEF['m3-leviathan'].cost - 1);
      play(0, 'm3-harpoon'); const li = S.players[0].hand.indexOf('m3-leviathan');
      ok('銛打ち2回目：同じ海獣がさらに-1', li >= 0 && effCost(0, DEF['m3-leviathan'], li) === DEF['m3-leviathan'].cost - 2, { hand: S.players[0].hand, cut: S.players[0].handCut });
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
