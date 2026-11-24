// 第3弾の画面の確認（開発用）：選んで出す画面・2体選ぶ対象・結界の表示を、iPhone の大きさで撮る
// python3 -m http.server 8765 を立ててから node tools/sim/set3ui.js 出力フォルダ
const { chromium, devices } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1 });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html?draft');
  await p.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 0);
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    try { Splash.shown = false; } catch (e) {}
    Account.status = 'ready'; Account.data = Account.fix({ gold: 50000, stones: 5000, tickets: 3 }); Account.data.loginLast = localDate(); Account.data.tut = 1;
    Account.save = () => {}; Account.saveNow = () => {};
    Motion.reduced = true; document.documentElement.classList.add('nofx');
    const deck = { name: '試し', cards: { 'm3-eirei': 3, 'f3-nakimushi': 3, 'x3-sabineji': 3, 'm3-suihei': 3, 'f3-gaikotsu': 3, 'm3-hotaru': 3, 'x3-bunkai': 3, 'm3-minato': 3, 'f3-komoriuta': 3, 'm3-trident': 3 } };
    startBattle({ kind: 'cpu', level: 'normal', mine: deck, opp: { name: '相手', cards: { squire: 6, pegasus: 6, archer: 6, 'st-golem': 6, garm: 6 } }, streak: false });
  });
  // 対戦の始まりを進める
  for (let i = 0; i < 80; i++) {
    const st = await p.evaluate(() => {
      if (typeof Cinema !== 'undefined' && Cinema.busy()) { Cinema.next(); return 'cinema'; }
      if (S.phase === 'rps' && !S.rps.picks[ME]) { doRps('g'); return 'rps'; }
      if (S.phase === 'choose' && S.rpsWinner === ME) { handleAct('choose', { dataset: { v: '1' } }); return 'choose'; }
      if (S.phase === 'mulligan' && S.mull[ME] == null) { handleAct('mull', { dataset: { v: '0' } }); return 'mull'; }
      if (S.phase === 'play' && S.turn !== ME && !busy) { return 'opp'; }
      return S.phase === 'play' && canAct() ? 'ready' : S.phase;
    });
    if (st === 'ready') break;
    await p.waitForTimeout(400);
  }
  const shot = async n => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${n}.png` }); };
  // 盤面を作る
  await p.evaluate(() => {
    const me = S.players[ME], en = S.players[OP];
    me.maxE = 10; me.e = 10; me.hand = ['m3-hotaru', 'x3-bunkai', 'm3-minato', 'f3-takarabako', 'tk-j-needle']; me.gy = ['m3-eirei', 'm3-suihei', 'f3-nakimushi', 'x3-sabineji', 'f3-gaikotsu']; me.field = [];
    en.field = []; ['squire', 'pegasus', 'archer'].forEach(id => { const u = addUnit(OP, id); u.born = 0; });
    render();
  });
  await shot('1-board');
  await p.evaluate(() => beginPlay(S.players[ME].hand.indexOf('m3-hotaru')));
  await shot('2-pick');
  await p.click('.pickp [data-act="pickT"][data-i="1"]'); await p.click('.pickp [data-act="pickT"][data-i="4"]');
  await shot('3-pick-selected');
  await p.click('.pickp [data-act="pickGo"]');
  await p.waitForTimeout(600);
  const f1 = await p.evaluate(() => S.players[ME].field.map(u => u.id));
  await p.evaluate(() => beginPlay(S.players[ME].hand.indexOf('x3-bunkai')));
  await shot('4-bunkai-1');
  await p.evaluate(() => pickTarget(S.players[OP].field[0].uid));
  await shot('5-bunkai-2');
  await p.evaluate(() => pickTarget(S.players[OP].field[1].uid));
  await p.waitForTimeout(600);
  const en = await p.evaluate(() => S.players[OP].field.map(u => u.id));
  await p.evaluate(() => beginPlay(S.players[ME].hand.indexOf('m3-minato')));
  await p.waitForTimeout(800);
  await shot('6-ward');
  await p.evaluate(() => { const id = 'f3-takarabako'; if (typeof peekAt === 'function') { const el = document.querySelector(`.hand [data-id="${id}"]`); } handleAct('cardInfo', { dataset: { id } }); });
  console.log(JSON.stringify({ afterHotaru: f1, enemyAfterBunkai: en, ward: await p.evaluate(() => S.players[ME].ward), errs }));
  await b.close();
})();
