/* =========================================================
   境界の召喚士 — 対戦画面（CPU戦・対人戦共通）
   カードとルールの数値は game-data.json（カード工房で作成）から読み込みます。

   視点：ME が自分のプレイヤー番号、OP が相手。CPU戦は常に ME=0。
   対人戦では部屋を作った人（ホスト）が 0 で、対戦処理もホストが行う。
   参加した人（ゲスト）は 1 で、操作をホストに送り、結果の盤面を受け取る。
   ========================================================= */

const CPU_DELAY = 700; // CPUの行動間隔（ミリ秒）

let CONFIG = { ...DEFAULT_CONFIG };
let CARDS = [];
let DEF = {};
let DATA_INFO = { updated: "", version: 0, draft: false };

const $ = s => document.querySelector(s);
const app = $("#app");
let S = null, busy = false;
let MODE = "cpu";          // "cpu" | "online"
let ME = 0, OP = 1;
let ui = { sel: null, mode: null };
let resultShown = false;
let overlayFrom = "start";

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const opp = i => 1 - i;
const playerSel = pi => `[data-player="${pi}"]`;
const unitSel = uid => `[data-uid="${uid}"]`;
const cname = id => esc(DEF[id] ? DEF[id].name : "？");
const pname = pi => esc(S.players[pi].name);

function setPerspective(me) { ME = me; OP = 1 - me; }

/* ---------- データ読み込み ---------- */
async function loadCardData() {
  const wantDraft = new URLSearchParams(location.search).has("draft");
  let raw = null;
  if (wantDraft) {
    raw = readDraft();
    if (raw) DATA_INFO.draft = true;
  }
  if (!raw) raw = await fetchPublished();
  const data = normalizeData(raw);
  CONFIG = data.config;
  CARDS = data.cards;
  DEF = Object.fromEntries(CARDS.map(c => [c.id, c]));
  PRESETS = data.decks;
  PACKS = data.packs;
  SERIALS = data.serials;
  DATA_INFO.updated = data.updated;
  DATA_INFO.version = data.version;
}
const dataKey = () => `${DATA_INFO.version}-${DATA_INFO.updated}-${CARDS.length}`;
let SERIALS = []; // シリアルコード（ハッシュ）
let PRESETS = []; // サンプルデッキ（game-data.json の decks）

/* デッキ（{id: 枚数}）を、シャッフルした山札（idの並び）にする */
function buildPile(deck) {
  const pile = [];
  Object.entries(deck.cards).forEach(([id, n]) => { if (DEF[id]) for (let i = 0; i < n; i++) pile.push(id); });
  return shuffle(pile);
}

/* ---------- ゲーム進行（ここから下の処理は、CPU戦とホストだけが実行する） ----------
   流れ：じゃんけん（rps）→ 勝った人が先攻・後攻を選ぶ（choose）→ マリガン（mulligan）→ 対戦（play） */
function newGame(names, decks) {
  if (!SIM && typeof Motion !== "undefined") Motion.reset();
  S = {
    gid: Math.random().toString(36).slice(2, 10),
    phase: "rps",
    players: [mkPlayer(names[0], decks[0]), mkPlayer(names[1], decks[1])],
    rps: { picks: [null, null], round: 1, last: null }, rpsWinner: null, first: null, mull: [null, null],
    decks: [{ name: decks[0].name, cards: decks[0].cards }, { name: decks[1].name, cards: decks[1].cards }],
    turn: 0, turnNo: 0, over: false, winner: null, log: [], uidN: 0, seq: 0
  };
  ui = { sel: null, mode: null };
  busy = false;
  resultShown = false;
  S.log.push({ sep: true, msg: "対戦開始" });
  log(`${pname(0)}のデッキ：${esc(decks[0].name)} ／ ${pname(1)}のデッキ：${esc(decks[1].name)}`);
  render();
  if (MODE === "cpu") cpuPreGame();
}
function mkPlayer(name, deck) {
  return { name, deckName: deck.name, deck: buildPile(deck), hp: CONFIG.PLAYER_HP, maxE: 0, e: 0, hand: [], field: [] };
}

const RPS = { g: "グー", c: "チョキ", p: "パー" };
const RPS_WIN = { g: "c", c: "p", p: "g" };

function rpsPick(pi, hand) {
  if (!S || S.phase !== "rps" || !RPS[hand] || S.rps.picks[pi]) return false;
  S.rps.picks[pi] = hand;
  const [a, b] = S.rps.picks;
  if (a && b) {
    if (a === b) {
      S.rps.last = { hands: [a, b], winner: null };
      log(`じゃんけん：${pname(0)} ${RPS[a]}、${pname(1)} ${RPS[b]}。あいこ`);
      S.rps.picks = [null, null]; S.rps.round++;
    } else {
      const w = RPS_WIN[a] === b ? 0 : 1;
      S.rps.last = { hands: [a, b], winner: w };
      S.rpsWinner = w; S.phase = "choose";
      log(`じゃんけん：${pname(0)} ${RPS[a]}、${pname(1)} ${RPS[b]}。${pname(w)}の勝ち`);
    }
  }
  render();
  if (MODE === "cpu") cpuPreGame();
  return true;
}

function chooseOrder(pi, goFirst) {
  if (!S || S.phase !== "choose" || S.rpsWinner !== pi) return false;
  S.first = goFirst ? pi : opp(pi);
  log(`${pname(pi)}が${goFirst ? "先攻" : "後攻"}を選んだ。${pname(S.first)}の先攻です。`);
  for (let i = 0; i < CONFIG.START_HAND; i++) { draw(0, true); draw(1, true); }
  S.phase = "mulligan";
  render();
  if (MODE === "cpu") cpuPreGame();
  return true;
}

/* マリガン：最初の手札を全部山札に戻して引き直すか、1回だけ選べる */
function mulligan(pi, redraw) {
  if (!S || S.phase !== "mulligan" || S.mull[pi] != null) return false;
  const p = S.players[pi];
  if (redraw) {
    p.deck.push(...p.hand); p.hand = [];
    shuffle(p.deck);
    for (let i = 0; i < CONFIG.START_HAND; i++) draw(pi, true);
  }
  S.mull[pi] = !!redraw;
  log(`${pname(pi)}は${redraw ? "手札を引き直した" : "手札をそのまま使う"}。`);
  if (S.mull[0] != null && S.mull[1] != null) {
    S.phase = "play";
    startTurn(S.first, true);
  } else {
    render();
    if (MODE === "cpu") cpuPreGame();
  }
  return true;
}

/* CPU の開始前の判断 */
function cpuPreGame() {
  if (!S || MODE !== "cpu") return;
  if (S.phase === "rps" && !S.rps.picks[1]) {
    const g = S;
    setTimeout(() => { if (S === g) rpsPick(1, "gcp"[Math.floor(Math.random() * 3)]); }, 250);
  } else if (S.phase === "choose" && S.rpsWinner === 1) {
    const g = S;
    setTimeout(() => { if (S === g) chooseOrder(1, true); }, 900);
  } else if (S.phase === "mulligan" && S.mull[1] == null) {
    const cheap = S.players[1].hand.filter(id => DEF[id].cost <= 3).length;
    mulligan(1, CPU_LEVEL !== "easy" && cheap < 2);
  }
}

/* priv を付けると、その番号のプレイヤーにだけ pmsg が見える（引いたカード名など） */
function log(msg, priv) {
  const e = { msg, who: S.turn };
  if (priv) { e.priv = priv.pi; e.pmsg = priv.msg; }
  S.log.push(e);
  const max = MODE === "online" ? 160 : 400;
  if (S.log.length > max) S.log.splice(0, S.log.length - max);
}
const logText = l => (l.priv != null && l.priv === ME ? l.pmsg : l.msg);

function draw(pi, silent) {
  const p = S.players[pi];
  if (!p.deck.length) {
    if (CONFIG.FATIGUE > 0) {
      p.hp -= CONFIG.FATIGUE;
      log(`${pname(pi)}の山札切れ！${CONFIG.FATIGUE}ダメージ。`);
      fx(playerSel(pi), "-" + CONFIG.FATIGUE, "dmg");
    }
    return;
  }
  const id = p.deck.pop();
  if (p.hand.length >= CONFIG.HAND_MAX) {
    if (!silent) log(`${pname(pi)}の手札があふれ、${cname(id)}は捨て札へ。`);
    return;
  }
  p.hand.push(id);
  if (!silent) log(`${pname(pi)}はカードを1枚引いた。`, { pi, msg: `${pname(pi)}は${cname(id)}を引いた。` });
}

function startTurn(pi, skipDraw) {
  if (S.over) return;
  S.turn = pi; S.turnNo++;
  const p = S.players[pi];
  p.maxE = Math.min(CONFIG.ENERGY_MAX, p.maxE + 1);
  p.e = p.maxE;
  // 行動不能のキャラは、このターンだけ攻撃できない
  p.field.forEach(u => { if (u.frozen) { u.ready = false; u.frozen = false; } else u.ready = true; });
  S.log.push({ sep: true, msg: `ターン${S.turnNo}：${pname(pi)}（エナジー${p.e}）` });
  if (!skipDraw) draw(pi);
  if (checkWin()) return;
  render();
  if (pi === 1 && MODE === "cpu") cpuTurn();
}

function endTurn(pi) {
  if (S.over || S.phase !== "play" || S.turn !== pi) return;
  if (pi === ME) ui = { sel: null, mode: null };
  startTurn(opp(pi), false);
}

/* ---------- カードを使う ---------- */
const kw = (u, k) => !!(DEF[u.id] && DEF[u.id].keywords.includes(k));
const armorOf = u => (DEF[u.id] && DEF[u.id].armor) || 0;
function effCost(pi, d) { return Math.max(0, d.cost - (S.players[pi].discount || 0)); }

/* 対象を選ぶ役割ごとに、どちらのプレイヤーのキャラから選ぶか */
function roleSide(pi, role) { return role === "enemy" ? opp(pi) : pi; }
/* 実際に選ぶ必要がある対象（キャラで、その側にキャラがいない効果は選ばずに空振り） */
function neededRoles(pi, d) {
  return cardTargetRoles(d).filter(r => S.players[roleSide(pi, r)].field.length > 0);
}

function canPlay(pi, idx) {
  const p = S.players[pi], d = DEF[p.hand[idx]];
  if (!d) return { ok: false, reason: "そのカードはありません" };
  if (S.over || S.phase !== "play" || S.turn !== pi) return { ok: false, reason: "自分のターンではありません" };
  if (effCost(pi, d) > p.e) return { ok: false, reason: "エナジーが足りません" };
  const sac = d.pay && d.pay.kind === "sacrifice";
  if (sac && !p.field.length) return { ok: false, reason: "代償にする自分のキャラがいません" };
  if (d.pay && d.pay.kind === "life" && p.hp <= d.pay.n) return { ok: false, reason: "代償の体力が足りません" };
  if (d.type === "char" && p.field.length >= CONFIG.FIELD_MAX && !sac) return { ok: false, reason: "場がいっぱいです" };
  // 相手のキャラにしか効かない魔法（天罰の光・吹雪など）は、相手の場が空なら使えない（無駄打ち防止）
  const ENEMY_ONLY = ["dmgRandom", "dmgAll", "freezeAll", "debuffAll", "dmgTarget", "destroyTarget", "freezeTarget", "debuffTarget"];
  if (d.type === "spell" && d.effects.length && d.effects.every(e => ENEMY_ONLY.includes(e.kind)) && !S.players[opp(pi)].field.length)
    return { ok: false, reason: "相手の場にキャラがいません" };
  // 魔法は対象がいないと使えない（キャラは対象がいなくても出せる）
  if (d.type === "spell") {
    for (const r of cardTargetRoles(d)) {
      if (!S.players[roleSide(pi, r)].field.length) return { ok: false, reason: r === "enemy" ? "対象の相手キャラがいません" : "対象の自分のキャラがいません" };
    }
  }
  return { ok: true };
}

/* 古い形式（対象のuidだけ）も受け付ける */
function normTargets(pi, d, t) {
  if (t && typeof t === "object") return t;
  const roles = neededRoles(pi, d);
  return t == null || !roles.length ? {} : { [roles[0]]: t };
}

function playCard(pi, idx, targetsIn) {
  const p = S.players[pi], id = p.hand[idx], d = DEF[id];
  if (!d || !canPlay(pi, idx).ok) return false;
  const targets = normTargets(pi, d, targetsIn);
  const roles = neededRoles(pi, d);
  for (const r of roles) {
    if (!S.players[roleSide(pi, r)].field.some(u => u.uid === targets[r])) return false;
  }
  const cost = effCost(pi, d);
  p.hand.splice(idx, 1);
  p.e -= cost;
  p.discount = 0;
  const tnames = roles.filter(r => r !== "sacrifice").map(r => { const u = S.players[roleSide(pi, r)].field.find(x => x.uid === targets[r]); return u ? cname(u.id) : ""; }).filter(Boolean);
  log(`${pname(pi)}：${cname(id)}を${d.type === "char" ? "召喚" : "使用"}${tnames.length ? `（対象：${tnames.join("・")}）` : ""}。`);
  sfx("play");
  fx("cast", id, "cast" + pi);
  // 代償
  if (d.pay && d.pay.kind === "life") { p.hp -= d.pay.n; log(`代償として${pname(pi)}の体力を${d.pay.n}払った。`); fx(playerSel(pi), "-" + d.pay.n, "dmg"); }
  if (d.pay && d.pay.kind === "sacrifice") {
    const u = p.field.find(x => x.uid === targets.sacrifice);
    if (u) { log(`代償として${cname(u.id)}を破壊した。`); u.hp = 0; u.destroyed = true; fx(unitSel(u.uid), "破壊", "dmg"); p.field = p.field.filter(x => x !== u); }
  }
  let self = null;
  if (d.type === "char") {
    self = addUnit(pi, id);
    // 先にキャラが場に降り立つのを見せてから、登場時効果を発動する
    if (d.effects.length) fx(unitSel(self.uid), id, "land");
  }
  runEffects(pi, d, targets, self);
  cleanup();
  if (!checkWin()) render();
  return true;
}

function addUnit(pi, id) {
  const d = DEF[id];
  const u = { uid: ++S.uidN, id, atk: d.atk, hp: d.hp, maxHp: d.hp, ready: d.keywords.includes("haste") };
  S.players[pi].field.push(u);
  return u;
}

function runEffects(pi, d, targets, self) {
  d.effects.forEach(e => effect(pi, e, targets, self));
}

function effect(pi, e, targets, self) {
  const me = S.players[pi], en = S.players[opp(pi)], n = e.n;
  const enemyT = () => en.field.find(x => x.uid === targets.enemy);
  const ownT = () => me.field.find(x => x.uid === targets.own && x !== self);
  switch (e.kind) {
    case "draw": for (let i = 0; i < n; i++) draw(pi); break;
    case "refresh": {
      const k = me.hand.length;
      me.deck.push(...me.hand); me.hand = []; shuffle(me.deck);
      for (let i = 0; i < k + n; i++) draw(pi, true);
      log(`${pname(pi)}は手札を入れ替えた（${me.hand.length}枚）。`);
      break;
    }
    case "discard": {
      for (let i = 0; i < n && en.hand.length; i++) {
        const [id] = en.hand.splice(Math.floor(Math.random() * en.hand.length), 1);
        log(`${pname(opp(pi))}は${cname(id)}を捨てさせられた。`);
      }
      break;
    }
    case "dmgTarget": { const u = enemyT(); if (u) hitUnit(u, n); break; }
    case "dmgRandom": {
      // すでに倒れている（体力0以下の）キャラは選ばない
      const alive = en.field.filter(x => x.hp > 0);
      if (alive.length) {
        const u = alive[Math.floor(Math.random() * alive.length)];
        log(`${cname(u.id)}に${n}ダメージ。`);
        hitUnit(u, n);
      }
      break;
    }
    case "dmgAll": if (en.field.length) { log(`相手キャラ全体に${n}ダメージ。`); en.field.forEach(u => hitUnit(u, n)); } break;
    case "dmgAllBoth": log(`すべてのキャラに${n}ダメージ。`); [...en.field, ...me.field].forEach(u => hitUnit(u, n)); break;
    case "dmgFace": log(`${pname(opp(pi))}に${n}ダメージ。`); hitPlayer(opp(pi), n); break;
    case "destroyTarget": { const u = enemyT(); if (u) destroyUnit(u); break; }
    case "destroyAll": log("すべてのキャラが破壊された。"); [...en.field, ...me.field].forEach(destroyUnit); break;
    case "freezeTarget": { const u = enemyT(); if (u) freezeUnit(u); break; }
    case "freezeAll": en.field.forEach(freezeUnit); break;
    case "debuffTarget": { const u = enemyT(); if (u) debuff(u, n); break; }
    case "debuffAll": en.field.forEach(u => debuff(u, n)); break;
    case "buffAtk": { const u = ownT(); if (u) buff(u, n, 0); break; }
    case "buffHp": { const u = ownT(); if (u) buff(u, 0, n); break; }
    case "buffBoth": { const u = ownT(); if (u) buff(u, n, n); break; }
    case "buffAllAtk": me.field.forEach(u => buff(u, n, 0)); break;
    case "buffAllBoth": me.field.forEach(u => buff(u, n, n)); break;
    case "heal": me.hp += n; log(`${pname(pi)}の体力が${n}回復。`); fx(playerSel(pi), "+" + n, "heal"); break;
    case "healUnits": me.field.forEach(u => { const h = Math.min(n, u.maxHp - u.hp); if (h > 0) { u.hp += h; fx(unitSel(u.uid), "+" + h, "heal"); } }); break;
    case "ramp": {
      const before = me.maxE;
      me.maxE = Math.min(CONFIG.ENERGY_MAX, me.maxE + n);
      if (me.maxE > before) { log(`${pname(pi)}のエナジー最大値が${me.maxE}に。`); fx(playerSel(pi), `エナジー+${me.maxE - before}`, "heal"); }
      break;
    }
    case "energyNow": me.e += n; log(`${pname(pi)}はエナジーを${n}得た。`); fx(playerSel(pi), `エナジー+${n}`, "heal"); break;
    case "discount": me.discount = (me.discount || 0) + n; log(`${pname(pi)}の次のカードのコストが${n}下がる。`); break;
    case "summon": {
      if (me.field.length >= CONFIG.FIELD_MAX) { log("場がいっぱいで、キャラを出せなかった。"); break; }
      const cands = me.deck.map((id, i) => ({ id, i })).filter(x => DEF[x.id] && DEF[x.id].type === "char" && DEF[x.id].cost <= n);
      if (!cands.length) { log("条件に合うキャラが山札にいなかった。"); break; }
      const pick = cands[Math.floor(Math.random() * cands.length)];
      me.deck.splice(pick.i, 1);
      const u = addUnit(pi, pick.id);
      log(`山札から${cname(pick.id)}が現れた！`);
      // 出てきたキャラの登場時効果は、対象をランダムに選んで発動する
      const auto = {};
      if (en.field.length) auto.enemy = en.field[Math.floor(Math.random() * en.field.length)].uid;
      const others = me.field.filter(x => x !== u);
      if (others.length) auto.own = others[Math.floor(Math.random() * others.length)].uid;
      DEF[pick.id].effects.filter(x => x.kind !== "summon").forEach(x => effect(pi, x, auto, u));
      break;
    }
  }
}

function hitUnit(u, n) {
  const dmg = Math.max(0, n - armorOf(u));
  u.hp -= dmg;
  fx(unitSel(u.uid), dmg < n ? `-${dmg}（装甲）` : "-" + dmg, "dmg");
  return dmg;
}
function hitPlayer(pi, n) { S.players[pi].hp -= n; fx(playerSel(pi), "-" + n, "dmg"); }
function destroyUnit(u) { u.hp = 0; u.destroyed = true; fx(unitSel(u.uid), "破壊", "dmg"); }
function freezeUnit(u) { u.frozen = true; u.ready = false; fx(unitSel(u.uid), "凍結", "heal"); }
function debuff(u, n) { const b = u.atk; u.atk = Math.max(0, u.atk - n); fx(unitSel(u.uid), `攻撃-${b - u.atk}`, "dmg"); }
function buff(u, a, h) {
  u.atk += a; u.hp += h; u.maxHp += h;
  fx(unitSel(u.uid), a && h ? `+${a}/+${h}` : a ? `攻撃+${a}` : `体力+${h}`, "heal");
}

function cleanup() {
  S.players.forEach((p, pi) => {
    p.field = p.field.filter(u => {
      if (u.hp > 0) return true;
      fx(unitSel(u.uid), "", "die");
      log(`${pname(pi)}の${cname(u.id)}は${u.destroyed ? "破壊された" : "倒れた"}。`);
      return false;
    });
  });
}

/* ---------- 攻撃 ---------- */
const guards = pi => S.players[pi].field.filter(u => kw(u, "guard"));
/* 相手の場にキャラがいる間は、相手プレイヤーを直接攻撃できない（直撃は例外。ただし守護がいると不可） */
function canAttackPlayer(pi, u) {
  const en = S.players[opp(pi)];
  if (!en.field.length) return true;
  if (guards(opp(pi)).length) return false;
  return !!(u && kw(u, "pierce"));
}
/* 守護がいる間は、守護を持つキャラしか攻撃できない */
function canAttackUnit(pi, target) {
  const g = guards(opp(pi));
  return !g.length || g.includes(target);
}
function selectedUnit() {
  return ui.sel && ui.sel.kind === "unit" ? S.players[ui.sel.owner].field.find(u => u.uid === ui.sel.uid) : null;
}

function attack(pi, uid, target) {
  if (S.over || S.phase !== "play" || S.turn !== pi) return false;
  const me = S.players[pi], en = S.players[opp(pi)];
  const a = me.field.find(u => u.uid === uid);
  if (!a || !a.ready) return false;
  if (target === "player") {
    if (!canAttackPlayer(pi, a)) return false;
    a.ready = false;
    fx(unitSel(a.uid), playerSel(opp(pi)), "lunge");
    log(`${cname(a.id)}が${pname(opp(pi))}に${a.atk}ダメージ！`);
    hitPlayer(opp(pi), a.atk);
  } else {
    const d = en.field.find(u => u.uid === target);
    if (!d || !canAttackUnit(pi, d)) return false;
    a.ready = false;
    fx(unitSel(a.uid), unitSel(d.uid), "lunge");
    log(`${cname(a.id)}（${a.atk}）が${cname(d.id)}（${d.atk}）を攻撃。`);
    const before = d.hp;
    const dealt = hitUnit(d, a.atk);
    if (kw(a, "trample") && dealt > before && before > 0) {
      const over = dealt - before;
      log(`貫通！${pname(opp(pi))}に${over}ダメージ。`);
      hitPlayer(opp(pi), over);
    }
    hitUnit(a, d.atk);
  }
  cleanup();
  if (!checkWin()) render();
  return true;
}

/* 降参・退出による決着 */
function forfeit(pi, reason) {
  if (!S || S.over) return;
  S.over = true;
  S.winner = opp(pi);
  S.log.push({ sep: true, msg: `決着：${pname(pi)}が${reason}。${pname(opp(pi))}の勝利` });
  finishGame();
}

function checkWin() {
  const [a, b] = S.players;
  if (a.hp > 0 && b.hp > 0) return false;
  S.over = true;
  S.winner = a.hp <= 0 && b.hp <= 0 ? "draw" : a.hp <= 0 ? 1 : 0;
  if (SIM) return true;
  S.log.push({ sep: true, msg: `決着：${S.winner === "draw" ? "引き分け" : pname(S.winner) + "の勝利"}` });
  finishGame();
  return true;
}

function finishGame() {
  ui = { sel: null, mode: null };
  busy = false;
  render();
  scheduleResult();
}

/* 自分から見た勝敗 */
function myResult() {
  if (!S || !S.over) return null;
  return S.winner === "draw" ? "draw" : S.winner === ME ? "win" : "lose";
}
let resultTimer = null;
function scheduleResult() {
  clearTimeout(resultTimer);
  const g = S;
  resultTimer = setTimeout(() => { if (S !== g || !S.over) return; resultShown = true; render(); showResult(myResult()); }, 700);
}

/* ---------- CPU ----------
   強さは3段階。中級・上級は「その手を打ったら盤面がどうなるか」を実際に試算して、一番よい手を選ぶ。
   初級はおおざっぱに、出せるカードを出して適当に攻撃する。 */
let SIM = false;      // 試算中は演出・描画・ログの確定をしない
let CPU_LEVEL = "normal";
const CPU_LEVELS = {
  easy:   { label: "初級", desc: "のんびり遊べる相手" },
  normal: { label: "中級", desc: "それなりに考えて戦う" },
  hard:   { label: "上級", desc: "先を読んで最善手を狙う" }
};

function simulate(fn) {
  const real = S, wasSim = SIM;
  const clone = JSON.parse(JSON.stringify({ ...real, log: [] }));
  S = clone; SIM = true;
  try { fn(); } catch (e) { console.error(e); }
  const result = S;
  S = real; SIM = wasSim;
  return result;
}

/* 盤面の評価（pi から見て大きいほど有利） */
function unitValue(u) {
  const d = DEF[u.id]; if (!d) return 0;
  let v = u.atk * 1.2 + Math.max(0, u.hp) * 0.9 + 1;
  if (d.keywords.includes("guard")) v += 1.5 + u.hp * 0.2;
  if (d.keywords.includes("pierce")) v += u.atk * 0.4;
  if (d.keywords.includes("trample")) v += 0.5;
  v += (d.armor || 0) * 1.5;
  if (u.frozen) v -= u.atk * 0.6;
  return v;
}
function evaluate(st, pi) {
  const me = st.players[pi], en = st.players[1 - pi];
  if (en.hp <= 0 && me.hp > 0) return 100000;
  if (me.hp <= 0) return -100000;
  let s = 0;
  s += me.hp * 1.0 - en.hp * 1.6;
  s += me.field.reduce((a, u) => a + unitValue(u), 0) - en.field.reduce((a, u) => a + unitValue(u), 0) * 1.1;
  s += Math.min(me.hand.length, 7) * 0.7 - en.hand.length * 0.35;
  s += me.maxE * 0.9;
  // 相手の次の攻撃で負けそうなら大きく減点
  // 相手の次のターンに本体へ届きそうなダメージ（守護がいれば防げる）
  const myGuard = me.field.some(u => DEF[u.id] && DEF[u.id].keywords.includes("guard"));
  const reach = myGuard ? 0 : en.field.reduce((a, u) => a + ((!me.field.length || (DEF[u.id] && DEF[u.id].keywords.includes("pierce"))) && !u.frozen ? u.atk : 0), 0);
  if (reach >= me.hp) s -= 60;
  else s -= reach * 0.4;
  // 自分の次のターンに届くダメージ（とどめを狙う）
  const enGuard = en.field.some(u => DEF[u.id] && DEF[u.id].keywords.includes("guard"));
  const myReach = enGuard ? 0 : me.field.reduce((a, u) => a + ((!en.field.length || (DEF[u.id] && DEF[u.id].keywords.includes("pierce"))) ? u.atk : 0), 0);
  if (myReach >= en.hp) s += 25;
  return s;
}

/* 打てる手をすべて挙げる */
function legalActions(pi) {
  const acts = [];
  const me = S.players[pi], en = S.players[opp(pi)];
  me.hand.forEach((id, idx) => {
    if (!canPlay(pi, idx).ok) return;
    const roles = neededRoles(pi, DEF[id]);
    let combos = [{}];
    roles.forEach(r => {
      const opts = S.players[roleSide(pi, r)].field.map(u => u.uid);
      combos = combos.flatMap(c => opts.map(o => ({ ...c, [r]: o })));
    });
    combos.slice(0, 24).forEach(t => acts.push({ t: "play", idx, id, targets: t }));
  });
  me.field.forEach(u => {
    if (!u.ready) return;
    if (canAttackPlayer(pi, u)) acts.push({ t: "attack", uid: u.uid, target: "player" });
    en.field.forEach(d => { if (canAttackUnit(pi, d)) acts.push({ t: "attack", uid: u.uid, target: d.uid }); });
  });
  return acts;
}
function applyAction(pi, a) {
  return a.t === "play" ? playCard(pi, a.idx, a.targets) : attack(pi, a.uid, a.target);
}

function cpuChoose(pi) {
  const acts = legalActions(pi);
  if (!acts.length) return null;
  if (CPU_LEVEL === "easy") {
    // 出せるカードがあれば7割の確率で出す。攻撃は対象を適当に選ぶ
    const plays = acts.filter(a => a.t === "play"), atks = acts.filter(a => a.t === "attack");
    if (plays.length && Math.random() < 0.7) return plays[Math.floor(Math.random() * plays.length)];
    if (atks.length) {
      const face = atks.find(a => a.target === "player");
      return face && Math.random() < 0.6 ? face : atks[Math.floor(Math.random() * atks.length)];
    }
    return null;
  }
  const base = evaluate(S, pi);
  const hard = CPU_LEVEL === "hard";
  const tries = hard ? 2 : 1; // ランダムな効果があるので、上級は複数回試して平均をとる
  // 上級は「この手のあとに続けて打てる一番よい手」まで読む（2手先）
  const look = st => {
    let best = evaluate(st, pi);
    if (!hard || st.over) return best;
    const real = S, wasSim = SIM; S = st; SIM = true;
    try {
      legalActions(pi).slice(0, 40).forEach(b => {
        const st2 = simulate(() => applyAction(pi, b));
        best = Math.max(best, evaluate(st2, pi));
      });
    } finally { S = real; SIM = wasSim; }
    return best;
  };
  const scored = acts.map(a => {
    let sum = 0;
    for (let i = 0; i < tries; i++) {
      const st = simulate(() => applyAction(pi, a));
      sum += look(st);
    }
    return { a, v: sum / tries };
  }).sort((x, y) => y.v - x.v);
  if (CPU_LEVEL === "normal") {
    // 中級：ときどき2番目以降の手を選ぶ
    const ok = scored.filter(x => x.v > base - 0.5);
    if (!ok.length) return null;
    if (ok.length > 1 && Math.random() < 0.3) return ok[1 + Math.floor(Math.random() * Math.min(2, ok.length - 1))].a;
    return ok[0].v > base + 0.05 ? ok[0].a : null;
  }
  return scored[0].v > base + 0.05 ? scored[0].a : null;
}

async function cpuTurn() {
  const g = S;
  busy = true; render();
  await sleep(CPU_DELAY);
  if (S !== g) return;
  for (let guard = 0; guard < 30 && !S.over; guard++) {
    const a = cpuChoose(1);
    if (!a) break;
    if (!applyAction(1, a)) break;
    await sleep(CPU_DELAY);
    await Motion.idle();
    if (S !== g) return;
  }
  busy = false;
  if (!S.over) endTurn(1);
}

/* ---------- 自分の操作（CPU戦・ホストはその場で処理、ゲストはホストに送る） ---------- */
function canAct() {
  return S && !S.over && S.phase === "play" && S.turn === ME && !busy && !(typeof Online !== "undefined" && Online.blocked());
}
function doPlay(idx, targets) {
  if (!canAct()) return;
  if (MODE === "online" && Online.role === "guest") return Online.send({ t: "play", idx, targets: targets || {}, hand: S.players[ME].hand[idx] });
  playCard(ME, idx, targets || {});
}
function doAttack(uid, target) {
  if (!canAct()) return;
  if (MODE === "online" && Online.role === "guest") return Online.send({ t: "attack", uid, target });
  attack(ME, uid, target);
}
function doEnd() {
  if (!canAct()) return;
  ui = { sel: null, mode: null };
  if (MODE === "online" && Online.role === "guest") return Online.send({ t: "end" });
  endTurn(ME);
}

/* ---------- 描画 ---------- */
function pbarHTML(pi) {
  const p = S.players[pi];
  const tgt = ui.mode === "attack" && pi === OP && canAttackPlayer(ME, selectedUnit());
  let pips = "";
  for (let i = 0; i < CONFIG.ENERGY_MAX; i++) {
    pips += `<span class="pip ${i < p.e ? "on" : i < p.maxE ? "used" : ""}"></span>`;
  }
  const status = typeof Online !== "undefined" && MODE === "online" && pi === OP ? Online.oppStatusHTML() : "";
  const side = pi === OP
    ? `<div class="side"><button type="button" class="chip" data-act="menu">メニュー</button><span>手札 ${p.hand.length} ・ 山札 ${p.deck.length}</span></div>`
    : `<div class="side">${DATA_INFO.draft ? '<span class="draftbadge">試遊中</span>' : ""}<span>手札 ${p.hand.length}/${CONFIG.HAND_MAX}</span></div>`;
  return `<div class="pbar ${S.turn === pi && !S.over ? "active" : ""}">
    <button type="button" class="avatar ${tgt ? "tgt" : ""}" data-player="${pi}" aria-label="${esc(p.name)}の体力 ${p.hp}">
      <span class="hpv">${Math.max(0, p.hp)}</span><span class="hpl">体力</span></button>
    <div class="pinfo"><div class="pname">${esc(p.name)}${S.turn === pi && !S.over ? "<small>行動中</small>" : ""}${status}</div>
      <div class="pips">${pips}<span class="etext">${p.e}/${p.maxE}</span></div></div>
    ${side}</div>`;
}

/* 対象選択中の「今選んでいる役割」 */
function curRole() { return ui.mode === "target" ? ui.roles[Object.keys(ui.picked).length] : null; }
function isTargetable(pi, u) {
  if (ui.mode === "attack") return pi === OP && canAttackUnit(ME, u);
  const r = curRole();
  return !!r && roleSide(ME, r) === pi;
}
/* 手札のカードを使う操作を始める（対象が要るなら選択モードへ） */
function beginPlay(idx) {
  const d = DEF[S.players[ME].hand[idx]];
  const roles = neededRoles(ME, d);
  if (roles.length) { ui = { sel: { kind: "hand", idx }, mode: "target", roles, picked: {} }; render(); return; }
  ui = { sel: null, mode: null };
  doPlay(idx, {});
}
function pickTarget(uid) {
  const r = curRole(); if (!r) return;
  ui.picked[r] = uid;
  if (Object.keys(ui.picked).length >= ui.roles.length) {
    const idx = ui.sel.idx, t = ui.picked;
    ui = { sel: null, mode: null };
    doPlay(idx, t);
  } else render();
}

function fieldHTML(pi) {
  const p = S.players[pi];
  const myTurn = S.turn === ME && !S.over;
  let s = "";
  for (let i = 0; i < CONFIG.FIELD_MAX; i++) {
    const u = p.field[i];
    if (!u) { s += `<div class="slot"><span class="empty"></span></div>`; continue; }
    const cls = [
      pi === ME && myTurn && canAct() && u.ready ? "ready" : "",
      pi === ME && myTurn && !u.ready ? "rest" : "",
      ui.mode && isTargetable(pi, u) ? "tgt" : "",
      ui.mode === "target" && Object.values(ui.picked).includes(u.uid) ? "sel" : "",
      ui.sel && ui.sel.kind === "unit" && ui.sel.uid === u.uid ? "sel" : ""
    ].join(" ");
    s += `<div class="slot">${cardHTML(DEF[u.id], { unit: u, cls, showCost: false, attrs: `data-uid="${u.uid}" data-owner="${pi}"` })}</div>`;
  }
  return `<div class="field" data-zone="${pi}" style="--cols:${CONFIG.FIELD_MAX}">${s}</div>`;
}

function endButtonHTML() {
  if (S.over && resultShown) return `<button type="button" class="endbtn" data-act="showResult">結果画面へ</button>`;
  if (S.over) return `<button type="button" class="endbtn" disabled>決着</button>`;
  if (S.turn !== ME) {
    const label = MODE === "cpu" ? "CPU行動中" : "相手のターン";
    return `<button type="button" class="endbtn" disabled>${label}</button>`;
  }
  if (typeof Online !== "undefined" && Online.blocked()) return `<button type="button" class="endbtn" disabled>送信中…</button>`;
  return `<button type="button" class="endbtn" data-act="end" ${canAct() ? "" : "disabled"}>ターン終了</button>`;
}

let renderDeferred = false;
let lastTurnKey = "";
let lastBannerKey = "";
function render() {
  if (!S || SIM) return;
  if (MODE === "online" && Online.role === "host") Online.publish();
  // ドラッグ中に盤面を作り直すと、指の下のカードが消えて指を離した合図が届かなくなる（iPhoneなど）。
  // そのためドラッグが終わるまで描き直しを待つ
  if ((drag && drag.started) || (press && press.shown)) { renderDeferred = true; return; }
  // 攻撃の演出中は、ぶつかる瞬間まで盤面を描き直さない
  if (Motion.holding()) { Motion.renderPending = true; return; }
  renderDeferred = false;
  clearDragLeftovers();
  hidePreview();
  if (S.phase !== "play") { app.innerHTML = pregameHTML(); $("#sheet").hidden = true; return; }
  const tk = `${S.gid}-${S.turnNo}`;
  if (S.turn === ME && !S.over && tk !== lastTurnKey) { lastTurnKey = tk; Sound.play("turn"); }
  if (!S.over && tk !== lastBannerKey) { lastBannerKey = tk; Motion.banner(S.turn === ME); }
  const me = S.players[ME];
  const lines = S.log.filter(l => !l.sep).slice(-2);
  app.innerHTML = `
    ${pbarHTML(OP)}
    ${fieldHTML(OP)}
    <div class="mid">
      <div class="pile" aria-label="自分の山札"><b>${me.deck.length}</b><span>山札</span></div>
      <button type="button" class="log" data-act="log" aria-label="プレイログを開く">${lines.map((l, i) => `<div class="${i < lines.length - 1 ? "old" : ""}">${logText(l)}</div>`).join("")}</button>
      ${endButtonHTML()}
    </div>
    ${fieldHTML(ME)}
    ${pbarHTML(ME)}
    <div class="hand">${handOrder(me).map(i => {
      const id = me.hand[i];
      // 自分のターンに使えないカードは色を薄くする（相手のターン中は普通に見せる）
      const dim = !DEF[id] || (S.turn === ME && !S.over && !canPlay(ME, i).ok);
      const sel = ui.sel && ui.sel.kind === "hand" && ui.sel.idx === i;
      return cardHTML(DEF[id], { cost: DEF[id] ? effCost(ME, DEF[id]) : undefined, cls: `${dim ? "dim" : ""} ${sel ? "sel" : ""}`, attrs: `data-hand="${i}"` });
    }).join("")}</div>
    ${typeof Online !== "undefined" && MODE === "online" ? Online.bannerHTML() : ""}`;
  layoutHand();
  renderSheet();
  Motion.afterRender();
}

/* ---------- 対戦前の画面（じゃんけん・先攻後攻・マリガン） ---------- */
const RPS_ICON = {
  g: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 22c0-3 2-5 4.5-5S23 19 23 22v-1c0-3 2-5 4.5-5s4.5 2 4.5 5v1c0-2.5 2-4 4-4s4 1.5 4 4v8c0 7-5 12-12 12h-4c-6 0-11-5-11-11v-6c0-2 1.5-3.5 3.5-3.5"/><path d="M18 17v9M23 21v6M28 20v6M10 30c3-1 7-1 9 2"/></svg>',
  c: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M19 27 14 7.5c-.6-2.4 1-4.5 3.2-4.5 1.6 0 2.9 1.1 3.3 2.7L25 22"/><path d="M27 22 31 5.5c.4-1.6 1.8-2.7 3.4-2.5 2.1.3 3.4 2.4 2.8 4.4L32 26"/><path d="M12 30c0-3 2-4.5 4.5-4.5h15c3 0 5 2 5 5v3c0 6-5 11-11 11h-3c-6 0-10.5-4.5-10.5-10.5z"/><path d="M17 33h13"/></svg>',
  p: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 27V12c0-1.7 1.3-3 3-3s3 1.3 3 3v11M20 22V7c0-1.7 1.3-3 3-3s3 1.3 3 3v15M26 22V8c0-1.7 1.3-3 3-3s3 1.3 3 3v15M32 24v-9c0-1.7 1.3-3 3-3s3 1.3 3 3v15c0 8-6 14-14 14h-1c-5 0-8-2.5-11-6l-5-7c-1-1.5-.6-3.4.9-4.4 1.4-.9 3.2-.6 4.2.7L14 29"/></svg>'
};
function pregameHTML() {
  const me = S.players[ME], op = S.players[OP];
  const wait = typeof Online !== "undefined" && MODE === "online" && Online.blocked();
  const head = `<div class="pre-head">
      <div class="pre-p op"><b>${esc(op.name)}</b><span>${esc(op.deckName || "")}</span></div>
      <span class="pre-vs">VS</span>
      <div class="pre-p me"><b>${esc(me.name)}</b><span>${esc(me.deckName || "")}</span></div>
    </div>`;
  let body = "";
  const last = S.rps.last;
  // じゃんけんの結果：お互いの手を並べて、勝ち・負け・あいこを大きく出す
  const lastLine = last ? (() => {
    const v = last.winner == null ? "tie" : last.winner === ME ? "win" : "lose";
    const side = (pi, who) => `<div class="rp ${last.winner === pi ? "won" : last.winner == null ? "" : "lost"}">
        <span class="rp-who">${who}</span>${RPS_ICON[last.hands[pi]]}<b>${RPS[last.hands[pi]]}</b></div>`;
    return `<div class="rpsres ${v}">
        ${side(ME, "あなた")}<span class="rp-vs">VS</span>${side(OP, esc(op.name))}
      </div>
      <p class="rpsverdict ${v}">${v === "tie" ? "あいこ！ もう一度" : v === "win" ? "あなたの勝ち！" : "相手の勝ち"}</p>`;
  })() : "";
  if (S.phase === "rps") {
    const mine = S.rps.picks[ME];
    body = `<h2 class="pre-title">じゃんけん</h2>
      ${last ? "" : `<p class="lead">勝った人が、先攻か後攻かを選べます。</p>`}
      ${lastLine}
      ${mine ? `<p class="pre-wait">${RPS[mine] ? `あなたは${RPS[mine]}。` : "選びました。"}相手を待っています…</p>` : `
      <div class="rps">${Object.entries(RPS).map(([k, v]) => `<button type="button" class="rpsbtn" data-act="rps" data-v="${k}" ${wait ? "disabled" : ""}>${RPS_ICON[k]}<span>${v}</span></button>`).join("")}</div>`}
      ${S.rps.picks[OP] ? `<p class="datainfo">相手は選び終わっています</p>` : ""}`;
  } else if (S.phase === "choose") {
    body = `<h2 class="pre-title">じゃんけんの結果</h2>
      ${lastLine}
      ${S.rpsWinner === ME ? `
        <p class="lead">先攻か後攻かを選んでください。先攻は最初のターンにカードを引きません。</p>
        <div class="pre-btns">
          <button type="button" class="btn primary" data-act="choose" data-v="1" ${wait ? "disabled" : ""}>先攻をとる</button>
          <button type="button" class="btn" data-act="choose" data-v="0" ${wait ? "disabled" : ""}>後攻をとる</button>
        </div>` : `<p class="pre-wait">相手が先攻・後攻を選んでいます…</p>`}`;
  } else if (S.phase === "mulligan") {
    const done = S.mull[ME];
    body = `<h2 class="pre-title">最初の手札</h2>
      <p class="lead">あなたは<b>${S.first === ME ? "先攻" : "後攻"}</b>です。${done == null ? "この手札で始めるか、1回だけ全部引き直せます。" : ""}</p>
      <div class="mull-hand">${me.hand.map((id, i) => cardHTML(DEF[id], { static: true, attrs: `data-hand="${i}"` })).join("")}</div>
      ${done == null ? `
        <div class="pre-btns">
          <button type="button" class="btn primary" data-act="mull" data-v="0" ${wait ? "disabled" : ""}>このまま始める</button>
          <button type="button" class="btn" data-act="mull" data-v="1" ${wait ? "disabled" : ""}>全部引き直す</button>
        </div>
        <p class="datainfo">引き直すと、手札をすべて山札に戻して切り直し、${CONFIG.START_HAND}枚引きます。</p>`
      : `<p class="pre-wait">${done ? "引き直しました。" : "この手札で始めます。"}相手を待っています…</p>`}`;
  }
  const net = typeof Online !== "undefined" && MODE === "online" ? Online.bannerHTML() : "";
  return `<div class="pre">
    <div class="pre-top"><button type="button" class="chip" data-act="menu">メニュー</button></div>
    ${head}<div class="pre-body">${body}</div>${net}</div>`;
}

function doRps(v) {
  if (MODE === "online" && Online.role === "guest") return Online.send({ t: "rps", v });
  rpsPick(ME, v);
}
function doChoose(first) {
  if (MODE === "online" && Online.role === "guest") return Online.send({ t: "choose", first });
  chooseOrder(ME, first);
}
function doMull(redraw) {
  if (MODE === "online" && Online.role === "guest") return Online.send({ t: "mull", redraw });
  mulligan(ME, redraw);
}

/* 手札が多いときはカードを重ねて、全部が手札の幅に収まるようにする */
/* 手札はコストの安い順に表示する（実際の手札の順番は変えない。data-hand は元の位置） */
function handOrder(p) {
  const key = id => DEF[id] ? effCost(ME, DEF[id]) : 99;
  return p.hand.map((id, i) => i).sort((a, b) => {
    const A = p.hand[a], B = p.hand[b];
    return key(A) - key(B) || (DEF[A] && DEF[B] ? (DEF[A].type === DEF[B].type ? 0 : DEF[A].type === "char" ? -1 : 1) || DEF[A].name.localeCompare(DEF[B].name, "ja") : 0) || a - b;
  });
}

function layoutHand() {
  const h = app.querySelector(".hand");
  if (!h || !h.children.length) return;
  const cs = [...h.children], n = cs.length;
  const w = cs[0].offsetWidth, box = h.clientWidth, gap = 6;
  // 扇形に並べる：横の間隔を決め、中央から離れるほど傾けて少し下げる
  // 傾けると端のカードが外に少しはみ出すので、その分だけ内側に詰める
  const step = n > 1 ? Math.min(w + gap, (box - w - 24) / (n - 1)) : 0;
  const fan = step < w; // 重なるときだけ扇にする
  const per = fan && n > 1 ? Math.min(4.5, 26 / (n - 1)) : 0;
  cs.forEach((c, i) => {
    const t = i - (n - 1) / 2;
    c.style.marginLeft = i ? (step - w) + "px" : "0";
    c.style.zIndex = i + 1;
    c.style.setProperty("--rot", (t * per).toFixed(2) + "deg");
    c.style.setProperty("--dy", (fan ? Math.abs(t) * Math.abs(t) * 1.3 : 0).toFixed(1) + "px");
  });
}

function detailHTML(id, unit, owner) {
  const d = DEF[id];
  const statLine = d.type === "char"
    ? `<div class="sh-stats">攻撃 ${unit ? unit.atk : d.atk} ／ 体力 ${unit ? `${unit.hp}/${unit.maxHp}` : d.hp}${unit && unit.frozen ? "（凍結：次のターンは攻撃できません）" : unit && !unit.ready && owner === ME ? "（このターンは攻撃できません）" : ""}</div>`
    : "";
  return `
    <div class="sheet-card">${cardHTML(d, { unit, static: true })}</div>
    <div class="sheet-body">
      <div class="sh-name">${esc(d.name)}</div>
      <div class="sh-meta">${WORLDS[d.world]} ・ ${TYPES[d.type]} ・ コスト${d.cost}</div>
      ${statLine}
      <p class="sh-text">${esc(cardText(d))}</p>`;
}

function renderSheet() {
  const el = $("#sheet");
  if (!S || !ui.sel || S.over) { el.hidden = true; return; }
  if (ui.mode) {
    let msg;
    if (ui.mode === "target") {
      const d = DEF[S.players[ME].hand[ui.sel.idx]];
      if (!d) { ui = { sel: null, mode: null }; el.hidden = true; return; }
      const r = curRole();
      msg = r === "sacrifice" ? `${esc(d.name)}：代償として破壊する自分のキャラをタップしてください`
        : `${esc(d.name)}の対象にする${r === "enemy" ? "相手" : "自分"}のキャラをタップしてください`;
    } else {
      const u = selectedUnit();
      msg = !S.players[OP].field.length ? "相手の体力（上の丸）をタップして直接攻撃"
        : guards(OP).length ? "守護を持つ相手キャラをタップしてください（守護がいる間は、ほかを攻撃できません）"
        : canAttackPlayer(ME, u) ? "直撃：相手キャラか、相手の体力（上の丸）をタップ"
        : "攻撃する相手キャラをタップしてください";
    }
    el.className = "sheet banner";
    el.innerHTML = `<p>${msg}</p><button type="button" class="btn" data-act="cancel">やめる</button>`;
    el.hidden = false;
    return;
  }
  let id, unit = null, playable = null;
  if (ui.sel.kind === "hand") {
    id = S.players[ME].hand[ui.sel.idx];
    if (!id) { ui.sel = null; el.hidden = true; return; }
    playable = !canAct() ? { ok: false, reason: S.turn === ME ? "送信中です" : "相手のターンです" } : canPlay(ME, ui.sel.idx);
  } else {
    unit = S.players[ui.sel.owner].field.find(u => u.uid === ui.sel.uid);
    if (!unit) { ui.sel = null; el.hidden = true; return; }
    id = unit.id;
  }
  el.className = "sheet";
  el.innerHTML = detailHTML(id, unit, ui.sel.owner) + `
      <div class="sh-actions">
        ${playable ? `<button type="button" class="btn primary" data-act="play" ${playable.ok ? "" : "disabled"}>${playable.ok ? "出す" : playable.reason}</button>` : ""}
        <button type="button" class="btn" data-act="cancel">閉じる</button>
      </div>
    </div>`;
  el.hidden = false;
}

/* ---------- ホバー（PC）／長押し（スマホ）で効果を表示 ---------- */
function cardInfoFromEl(card) {
  if (!S) return null;
  if (card.dataset.hand != null) { const id = S.players[ME].hand[+card.dataset.hand]; return id ? { id, unit: null, owner: ME } : null; }
  if (card.dataset.uid != null) {
    const owner = +card.dataset.owner;
    const unit = S.players[owner].field.find(u => u.uid === +card.dataset.uid);
    return unit ? { id: unit.id, unit, owner } : null;
  }
  return null;
}
function showPreview(card) {
  const info = cardInfoFromEl(card);
  if (!info || !DEF[info.id]) return;
  const p = $("#preview");
  p.innerHTML = detailHTML(info.id, info.unit, info.owner) + "</div>";
  p.hidden = false;
  const r = card.getBoundingClientRect(), ph = p.offsetHeight;
  const top = r.top > innerHeight / 2 ? r.top - ph - 14 : r.bottom + 14;
  p.style.top = Math.max(8, Math.min(innerHeight - ph - 8, top)) + "px";
}
function hidePreview() {
  const p = $("#preview"); if (p) p.hidden = true; hoverEl = null;
  document.querySelectorAll("#app .card.peek").forEach(c => c.classList.remove("peek"));
}

let hoverEl = null;
document.addEventListener("pointerover", e => {
  if (e.pointerType !== "mouse" || (drag && drag.started)) return;
  const c = e.target.closest("#app .card");
  if (c && c !== hoverEl) { hoverEl = c; showPreview(c); }
});
document.addEventListener("pointerout", e => {
  if (e.pointerType !== "mouse") return;
  const c = e.target.closest("#app .card");
  if (c && !c.contains(e.relatedTarget)) hidePreview();
});

/* ---------- ドラッグ＆ドロップ ---------- */
let drag = null, press = null, suppressClickUntil = 0;
const LONG_PRESS = 350;

/* 長押しで効果を見る（スマホ）。見ている間に指を滑らせると、指の下のカードの効果に切り替わる */
function peekAt(card) {
  if (!card || card === press.card) return;
  press.card = card;
  document.querySelectorAll("#app .card.peek").forEach(c => c.classList.remove("peek"));
  card.classList.add("peek");
  showPreview(card);
}

document.addEventListener("pointerdown", e => {
  if (!S || S.over || e.button > 0) return;
  const card = e.target.closest("#app .card");
  if (!card) return;
  if (e.pointerType !== "mouse") {
    press = { x: e.clientX, y: e.clientY, shown: false, card: null };
    press.timer = setTimeout(() => {
      if (!press || (drag && drag.started)) return;
      press.shown = true;
      drag = null; // 効果を見始めたら、このタッチではカードを動かさない
      ui = { sel: null, mode: null }; renderSheet();
      peekAt(card);
    }, LONG_PRESS);
  }
  if (!canAct()) return;
  if (card.dataset.hand != null) {
    drag = { kind: "hand", idx: +card.dataset.hand, el: card, sx: e.clientX, sy: e.clientY, started: false };
  } else if (+card.dataset.owner === ME) {
    const u = S.players[ME].field.find(x => x.uid === +card.dataset.uid);
    if (u && u.ready) drag = { kind: "unit", uid: u.uid, el: card, sx: e.clientX, sy: e.clientY, started: false };
  }
});

document.addEventListener("pointermove", e => {
  if (press) {
    if (press.shown) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const c = el && el.closest("#app .card");
      if (c) peekAt(c);
      return;
    }
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; }
  }
  if (!drag) return;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
    if (press && press.shown) { drag = null; return; }
    startDrag();
  }
  moveDrag(e.clientX, e.clientY);
});

document.addEventListener("pointerup", e => finishPointer(e, true));
document.addEventListener("pointercancel", e => finishPointer(e, false));

function finishPointer(e, commit) {
  if (press) {
    clearTimeout(press.timer);
    const wasPeek = press.shown;
    press = null;
    if (wasPeek) { hidePreview(); blockClick(); if (renderDeferred) render(); }
  }
  if (drag && drag.started) {
    const action = commit ? dropAction(e.clientX, e.clientY) : null;
    endDrag();
    drag = null;
    blockClick();
    if (action) action();
    if (renderDeferred) render();
  }
  drag = null;
}

/* ドラッグの途中で取り残された絵（指を離した合図が届かなかった場合など）を片付ける */
function clearDragLeftovers() {
  document.querySelectorAll("#fx .ghost, #fx .arrow").forEach(el => el.remove());
}
function cancelDrag() {
  if (drag && drag.started) { endDrag(); drag = null; if (renderDeferred) render(); }
  drag = null;
  if (press) { clearTimeout(press.timer); press = null; }
  hidePreview();
  if (renderDeferred) render();
}
document.addEventListener("visibilitychange", () => { if (document.hidden) cancelDrag(); });
window.addEventListener("blur", cancelDrag);
/* 指を離した直後に届く「タップ」を無視する（iPhoneは少し遅れて届くので時間で判断する） */
function blockClick() { suppressClickUntil = Date.now() + 450; }

/* 手札をドラッグしたときに、どこへ落とせば使えるか */
function handDropSide(d) {
  const roles = neededRoles(ME, d);
  // 対象が1つだけの魔法は、対象のキャラに直接落とす。それ以外は自分の場に落として、必要なら対象を選ぶ
  if (d.type === "spell" && roles.length === 1) return { units: roleSide(ME, roles[0]), role: roles[0] };
  return { field: true };
}

function startDrag() {
  clearDragLeftovers();
  drag.started = true;
  hidePreview();
  ui = { sel: null, mode: null };
  renderSheet();
  const zones = [];
  if (drag.kind === "hand") {
    const d = DEF[S.players[ME].hand[drag.idx]];
    if (!d) { drag = null; return; }
    const z = handDropSide(d);
    if (z.field) zones.push(app.querySelector(`.field[data-zone="${ME}"]`));
    else app.querySelectorAll(`[data-owner="${z.units}"]`).forEach(el => zones.push(el));
    const r = drag.el.getBoundingClientRect();
    const g = drag.el.cloneNode(true);
    g.classList.remove("dim", "sel");
    g.classList.add("ghost");
    g.style.width = drag.el.offsetWidth + "px"; g.style.height = drag.el.offsetHeight + "px"; g.style.margin = "0";
    $("#fx").appendChild(g);
    drag.ghost = g;
    drag.el.classList.add("lifted");
  } else {
    app.querySelectorAll(`[data-owner="${OP}"]`).forEach(el => zones.push(el));
    const u = S.players[ME].field.find(x => x.uid === drag.uid);
    if (canAttackPlayer(ME, u)) zones.push(app.querySelector(`[data-player="${OP}"]`));
    const r = drag.el.getBoundingClientRect();
    drag.ox = r.left + r.width / 2; drag.oy = r.top + r.height / 2;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "arrow");
    svg.innerHTML = `<defs><marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#e2675a"/></marker></defs>
      <line x1="${drag.ox}" y1="${drag.oy}" x2="${drag.ox}" y2="${drag.oy}" stroke="#e2675a" stroke-width="4" stroke-linecap="round" marker-end="url(#ah)"/>`;
    $("#fx").appendChild(svg);
    drag.svg = svg;
    drag.el.classList.add("sel");
  }
  drag.zones = zones.filter(Boolean);
  drag.zones.forEach(z => z.classList.add(z.classList.contains("field") ? "drop" : "tgt"));
}

function moveDrag(x, y) {
  if (!drag) return;
  if (drag.ghost) { drag.ghost.style.left = x + "px"; drag.ghost.style.top = y + "px"; }
  if (drag.svg) { const l = drag.svg.querySelector("line"); l.setAttribute("x2", x); l.setAttribute("y2", y); }
  const el = document.elementFromPoint(x, y);
  const over = el ? drag.zones.find(z => z.contains(el)) : null;
  if (over !== drag.over) {
    if (drag.over) drag.over.classList.remove("over");
    if (over) over.classList.add("over");
    drag.over = over;
  }
}

function endDrag() {
  if (drag.ghost) drag.ghost.remove();
  if (drag.svg) drag.svg.remove();
  drag.el.classList.remove("lifted", "sel");
  (drag.zones || []).forEach(z => z.classList.remove("drop", "tgt", "over"));
}

function dropAction(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const unitEl = el.closest("[data-uid]"), plEl = el.closest("[data-player]"), fieldEl = el.closest(".field");
  if (drag.kind === "hand") {
    const idx = drag.idx, d = DEF[S.players[ME].hand[idx]], chk = canPlay(ME, idx);
    const z = handDropSide(d);
    if (z.units != null) {
      if (!unitEl || +unitEl.dataset.owner !== z.units) return null;
      if (!chk.ok) return () => toast(chk.reason);
      const uid = +unitEl.dataset.uid;
      return () => doPlay(idx, { [z.role]: uid });
    }
    if (!fieldEl || +fieldEl.dataset.zone !== ME) return null;
    if (!chk.ok) return () => toast(chk.reason);
    // 対象（や代償）が必要なカード：場に置いたあと対象を選ぶ
    return () => beginPlay(idx);
  }
  const uid = drag.uid;
  if (unitEl && +unitEl.dataset.owner === OP) {
    const t = +unitEl.dataset.uid, tu = S.players[OP].field.find(x => x.uid === t);
    if (tu && !canAttackUnit(ME, tu)) return () => toast("守護を持つキャラを先に攻撃してください");
    return () => doAttack(uid, t);
  }
  if (plEl && +plEl.dataset.player === OP) {
    const u = S.players[ME].field.find(x => x.uid === uid);
    if (!canAttackPlayer(ME, u)) return () => toast(guards(OP).length ? "守護を持つキャラがいるので、直接攻撃できません" : "相手の場にキャラがいるので、直接攻撃できません");
    return () => doAttack(uid, "player");
  }
  return null;
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  $("#fx").appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

/* 演出。対人戦のホストでは、相手の画面でも同じ演出を出すために記録しておく */
function fx(sel, text, cls) {
  if (SIM) return;
  if (MODE === "online" && Online.role === "host") Online.queueFx(sel, text, cls);
  playFx(sel, text, cls);
}
/* 効果音だけを鳴らす（対人戦では相手の画面でも鳴る） */
function sfx(name) { fx("sfx", name, "sfx"); }
function playFx(sel, text, cls) {
  if (Motion.holding()) { Motion.queue.push([sel, text, cls]); return; }
  runFx(sel, text, cls);
}
function runFx(sel, text, cls) {
  if (sel === "sfx") { Sound.play(text); return; }
  if (cls === "lunge") { Motion.lunge(sel, text); return; }
  if (sel === "cast") { Motion.cast(text, +cls.slice(4)); return; }
  if (cls === "land") { Motion.land(); return; }
  if (cls === "die") { const el = document.querySelector(sel); if (el) Motion.shatter(el); return; }
  if (cls === "dmg") Sound.play(text === "破壊" ? "destroy" : sel.startsWith("[data-player") ? "face" : "hit");
  else if (cls === "heal") Sound.play(/^[+＋]\d+$/.test(text) ? "heal" : "buff");
  const el = document.querySelector(sel);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const layer = $("#fx");
  if (cls === "dmg") {
    const f = document.createElement("div");
    f.className = "flash";
    Object.assign(f.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    if (el.classList.contains("avatar")) f.style.borderRadius = "50%";
    layer.appendChild(f);
    setTimeout(() => f.remove(), 500);
    if (el.classList.contains("avatar")) Motion.shake();
    else Motion.spark(r);
  }
  const t = document.createElement("span");
  t.className = "float " + cls;
  t.textContent = text;
  t.style.left = r.left + r.width / 2 + "px";
  t.style.top = r.top + r.height / 2 + "px";
  layer.appendChild(t);
  setTimeout(() => t.remove(), 1000);
}

/* ---------- 画面（開始・メニュー・ルール・カード一覧・ログ・結果） ---------- */
const RULES_HTML = () => `
  <div class="rules">
    <h3>勝利条件</h3><p>相手の体力（初期${CONFIG.PLAYER_HP}）を0にすれば勝ち。</p>
    <h3>デッキ</h3><p>それぞれが自分で組んだ${CONFIG.DECK_SIZE}枚のデッキで戦います。同じカードは${CONFIG.COPY_MAX}枚まで（カードによってはそれより少ない）。山札が尽きたら、引くたびに${CONFIG.FATIGUE}ダメージ。</p>
    <h3>対戦の始め方</h3>
    <ul>
      <li>じゃんけんをして、勝った人が先攻か後攻かを選ぶ</li>
      <li>お互い${CONFIG.START_HAND}枚引く。1回だけ、手札を全部山札に戻して引き直せる（マリガン）</li>
    </ul>
    <h3>ターンの流れ</h3>
    <ul>
      <li>エナジーが1増えて全回復（上限${CONFIG.ENERGY_MAX}）</li>
      <li>カードを1枚引く（先攻の最初のターンは引かない）</li>
      <li>エナジーを払ってカードを出す</li>
      <li>キャラで攻撃して、ターン終了</li>
    </ul>
    <h3>キャラクター</h3>
    <ul>
      <li>場に置けるのは${CONFIG.FIELD_MAX}体まで</li>
      <li>出したターンは攻撃できない（速攻を除く）</li>
      <li>攻撃すると、お互いの攻撃力ぶんのダメージを与え合う</li>
      <li>相手の場にキャラがいる間は、相手プレイヤーを直接攻撃できない（直撃を除く）</li>
    </ul>
    <h3>能力</h3>
    <ul>
      ${Object.values(KEYWORDS).map(k => `<li>${k.label}：${k.text}</li>`).join("")}
      <li>登場時：場に出たときに一度だけ発動する</li>
    </ul>
    <h3>操作</h3>
    <ul>
      <li>カードを出す：手札を自分の場までドラッグ。対象を選ぶ魔法は、対象のキャラまでドラッグ</li>
      <li>攻撃する：光っている自分のキャラを、攻撃先までドラッグ</li>
      <li>効果を見る：PCはカードにマウスを乗せる。スマホはカードを長押し</li>
      <li>タップで選んでから操作することもできます</li>
    </ul>
  </div>`;

function openOverlay(html, from, solid) {
  const o = $("#overlay");
  o.className = "overlay" + (solid ? " solid" : "");
  o.innerHTML = html;
  o.hidden = false;
  o.scrollTop = 0;
  if (from) overlayFrom = from;
}
function goBack() {
  if (overlayFrom === "menu") showMenu();
  else if (overlayFrom === "result" && S && S.over) showResult(myResult());
  else if (overlayFrom === "game") $("#overlay").hidden = true;
  else if (overlayFrom === "lobby" && typeof Online !== "undefined") Online.showLobby();
  else if (overlayFrom === "options") showOptions();
  else showStart();
}

/* ホーム画面のアイコン（線画のSVG） */
const HOME_ICON = {
  cpu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 6.5 13 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/></svg>',
  online: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M2.5 19.5c.6-3.4 2.8-5.3 5.5-5.3s4.9 1.9 5.5 5.3M13.6 14.6c.9-.6 1.9-.9 2.9-.9 2.3 0 4.2 1.6 4.8 4.6"/></svg>',
  decks: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="11" height="15" rx="1.6"/><path d="M4.5 16.5V4.8c0-.9.7-1.6 1.6-1.6h8.6"/><path d="M10.5 12.5l2 -2.5 2 2.5-2 2.5z"/></svg>',
  packs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5h14l-1.2 13H6.2z"/><path d="M5 7.5 7 3h10l2 4.5M9.5 12.5h5"/></svg>',
  cards: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/><circle cx="12" cy="12" r="6.6"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>'
};

function showStart() {
  const deck = Decks.selected();
  const goldOK = Account.status !== "none" && Account.status !== "free";
  openOverlay(`<div class="homebg" aria-hidden="true"><div class="sp-bg">${Splash.bandsHTML()}</div><div class="homeshade"></div></div>
  <div class="panel home">
    <div class="homebar">
      ${goldOK ? `<span class="goldtag">${Account.gold}G</span>` : `<span></span>`}
      <button type="button" class="iconbtn" data-act="options" aria-label="オプション">${HOME_ICON.gear}</button>
    </div>
    <div class="homemain">
    <div class="homelogo"><small>神話 ・ 幻想 ・ 機械</small><b>境界の召喚士</b></div>
    ${Account.status === "none" ? `<p class="onl-msg">サーバーに接続できないため、スターターデッキだけで遊べます（カードやGは保存されません）。</p>` : ""}
    ${DATA_INFO.draft ? `<p class="datainfo">編集中のカードデータで試遊しています（対人戦は使えません）</p>` : ""}
    <div class="battles">
      <button type="button" class="battlebtn cpu" data-act="start">
        <span class="bicon">${HOME_ICON.cpu}</span><span class="btxt"><b>CPUと対戦</b><small>3つの強さ・勝つとGがもらえる</small></span>
      </button>
      ${DATA_INFO.draft ? "" : `<button type="button" class="battlebtn online" data-act="online">
        <span class="bicon">${HOME_ICON.online}</span><span class="btxt"><b>友達と対戦</b><small>合言葉で部屋に入る</small></span>
      </button>`}
    </div>
    <div class="hometiles">
      <button type="button" class="hometile" data-act="decks">${HOME_ICON.decks}<b>デッキ編成</b><small>${esc(deck ? deck.name : "未選択")}</small></button>
      <button type="button" class="hometile" data-act="packs">${HOME_ICON.packs}<b>パック</b><small>${goldOK ? `所持 ${Account.gold}G` : "開封する"}</small></button>
      <button type="button" class="hometile" data-act="cards">${HOME_ICON.cards}<b>カード一覧</b><small>全${CARDS.filter(c => c.limit > 0).length}種</small></button>
    </div>
    ${DATA_INFO.draft ? "" : `<button type="button" class="btn fbbtn" data-act="fbOpen"><span class="fbline">${HOME_ICON.mail}ご意見・感想を送る</span><small>改善案・不具合・良かった所・いまいちな所など</small></button>`}
    </div>
  </div>`, "start", true);
}

/* 歯車ボタン：ルール・アカウント・音などの事務的なもの */
function showOptions() {
  const info = DATA_INFO.updated ? `カードデータ：v${DATA_INFO.version}（${esc(DATA_INFO.updated)} 更新）` : "";
  openOverlay(`<div class="panel">
    <div class="topbar"><button type="button" class="btn sm" data-act="optBack">← 戻る</button><b>オプション</b></div>
    <div class="optlist">
      <button type="button" class="optrow" data-act="rules"><b>ルール</b><small>遊び方・カードの能力</small></button>
      ${DATA_INFO.draft ? "" : `<button type="button" class="optrow" data-act="serial"><b>シリアルコード</b><small>配られたコードでGやカードを受け取る</small></button>`}
      <button type="button" class="optrow" data-act="account"><b>アカウント</b><small>引き継ぎコードの確認・別の端末から引き継ぐ</small></button>
      <button type="button" class="optrow" data-act="soundPanel"><b>音の設定</b><small>現在：${Sound.on ? "オン" : "オフ"}</small></button>
    </div>
    <p class="datainfo">${info}</p>
    <p class="datainfo">ベータ版のカードやGは、正式公開のときにリセットされます。</p>
  </div>`, "options", true);
}

function showMenu() {
  const online = MODE === "online";
  openOverlay(`<div class="panel">
    <h2 class="title sm">メニュー</h2>
    ${online ? `<p class="lead">部屋の合言葉：<b class="roomcode-inline">${esc(Online.code || "")}</b></p>` : ""}
    <div class="menu">
      <button type="button" class="btn primary" data-act="closeOverlay">対戦に戻る</button>
      <button type="button" class="btn" data-act="log">プレイログ</button>
      <button type="button" class="btn" data-act="cards">カード一覧</button>
      <button type="button" class="btn" data-act="rules">ルール</button>
      ${online && S && !S.over
        ? `<button type="button" class="btn danger" data-act="surrender">降参してタイトルに戻る</button>`
        : `<button type="button" class="btn" data-act="toTitle">タイトルに戻る（この対戦は終了します）</button>`}
    </div>
  </div>`, "game");
  overlayFrom = "menu";
}

function showRules() {
  openOverlay(`<div class="panel"><div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>ルール</b></div>${RULES_HTML()}
    <button type="button" class="btn primary" data-act="back">戻る</button></div>`, null, !S);
}

function showCardList() {
  const usable = CARDS.filter(c => c.limit > 0);
  const byCost = (a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja");
  const group = (type, label) => {
    const list = usable.filter(c => c.type === type).sort(byCost);
    return `<h3 class="sec">${label}（${list.length}種）</h3>
      <div class="clist">${list.map(c => `
        <div class="citem">
          ${cardHTML(c, { static: true })}
          <div class="cbody">
            <div class="chead"><span class="cname">${esc(c.name)}</span><span class="ccount" title="1デッキに入れられる枚数">${Account.status === "free" ? "" : `所持${Account.owned(c.id)} ・ `}上限${cardLimit(c, CONFIG)}</span></div>
            <div class="cmeta">${WORLDS[c.world]} ・ ${RARITY[c.rarity]} ・ コスト${c.cost}${c.type === "char" ? ` ・ 攻撃${c.atk} ／ 体力${c.hp}` : ""}</div>
            <div class="ctext">${esc(cardText(c))}</div>
          </div>
        </div>`).join("")}</div>`;
  };
  openOverlay(`<div class="panel wide">
    <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>カード一覧</b></div>
    <div class="totals"><span>全<b>${usable.length}</b>種</span><span>デッキ${CONFIG.DECK_SIZE}枚・同じカードは${CONFIG.COPY_MAX}枚まで</span></div>
    ${group("char", "キャラクター")}
    ${group("spell", "魔法")}
    <button type="button" class="btn primary" data-act="back">戻る</button>
  </div>`, null, !S);
}

function showLog() {
  if (!S) return;
  const rows = S.log.map(l => l.sep
    ? `<div class="sep">${l.msg}</div>`
    : `<div class="${l.who === OP ? "cpu" : ""}">${logText(l)}</div>`).join("");
  openOverlay(`<div class="panel wide">
    <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>プレイログ</b></div>
    <div class="loglist" id="loglist">${rows}</div>
    <button type="button" class="btn primary" data-act="back">戻る</button>
  </div>`);
  const ll = $("#loglist"); ll.scrollTop = ll.scrollHeight;
}

/* 勝ったときのG（1試合につき1回だけ） */
const rewarded = {};
function giveReward(res) {
  if (!S || rewarded[S.gid] != null) return rewarded[S && S.gid] || 0;
  let g = 0;
  if (res === "win" && Account.status !== "free" && Account.status !== "none") {
    g = MODE === "online" ? CONFIG.REWARD_ONLINE
      : { easy: CONFIG.REWARD_EASY, normal: CONFIG.REWARD_NORMAL, hard: CONFIG.REWARD_HARD }[CPU_LEVEL] || 0;
    if (g) Account.addGold(g);
  }
  rewarded[S.gid] = g;
  Sound.play(res === "win" ? "win" : res === "lose" ? "lose" : "click");
  return g;
}

function showResult(res) {
  if (!res) return;
  const label = { win: "勝利", lose: "敗北", draw: "引分" }[res];
  const online = MODE === "online";
  const g = giveReward(res);
  openOverlay(`<div class="panel">
    <p class="result ${res}">${label}</p>
    ${g ? `<p class="reward">+${g}G <small>（所持 ${Account.gold}G）</small></p>` : ""}
    <p class="lead" style="text-align:center">${S.turnNo}ターンで決着。残り体力 ${esc(S.players[ME].name)} ${Math.max(0, S.players[ME].hp)} ／ ${esc(S.players[OP].name)} ${Math.max(0, S.players[OP].hp)}</p>
    ${online
      ? (Online.role === "host" ? `<button type="button" class="btn primary" data-act="rematch">同じ相手ともう一度</button>` : `<p class="datainfo">もう一度対戦するときは、部屋を作った人が「同じ相手ともう一度」を押します</p>`)
      : `<button type="button" class="btn primary" data-act="cpuAgain">同じ強さでもう一度</button>
         <button type="button" class="btn" data-act="start">強さを選び直す</button>`}
    <button type="button" class="btn" data-act="log">プレイログを見る</button>
    <button type="button" class="btn" data-act="closeOverlay">盤面を見る</button>
    <button type="button" class="btn" data-act="toTitle">${online ? "部屋を出てタイトルに戻る" : "タイトルに戻る"}</button>
  </div>`, "result");
}

function toTitle() {
  if (MODE === "online") Online.leave();
  MODE = "cpu"; setPerspective(0);
  S = null; busy = false; ui = { sel: null, mode: null };
  Motion.reset();
  clearTimeout(resultTimer);
  app.innerHTML = "";
  $("#sheet").hidden = true;
  hidePreview();
  showStart();
}

function showCpuSelect() {
  if (!Decks.readyDeck(msg => Decks.showList(msg))) return;
  openOverlay(`<div class="panel">
    <h2 class="title sm">CPUの強さ</h2>
    <p class="lead">使うデッキ：${esc(Decks.selected().name)}</p>
    <div class="lvls">${Object.entries(CPU_LEVELS).map(([k, v]) => `
      <button type="button" class="lvl lvl-${k}" data-act="cpuLevel" data-v="${k}">
        <b>${v.label}</b><span>${v.desc}</span><em class="lvl-g">勝利で ${CONFIG[{ easy: "REWARD_EASY", normal: "REWARD_NORMAL", hard: "REWARD_HARD" }[k]]}G</em>
      </button>`).join("")}</div>
    <p class="datainfo">負けたときは0Gです。${Account.status === "free" || Account.status === "none" ? "（今の状態では、Gは保存されません）" : ""}</p>
    <button type="button" class="btn" data-act="back">戻る</button>
  </div>`, "start", true);
}

function startCpuGame(level) {
  const mine = Decks.readyDeck(msg => Decks.showList(msg));
  if (!mine) return;
  CPU_LEVEL = CPU_LEVELS[level] ? level : "normal";
  const cpu = Decks.randomPreset(CPU_LEVEL);
  if (!cpu) return Decks.showList("CPU用のサンプルデッキがありません");
  MODE = "cpu"; setPerspective(0);
  $("#overlay").hidden = true;
  newGame(["あなた", `CPU（${CPU_LEVELS[CPU_LEVEL].label}）`], [mine, { name: cpu.name, cards: cpu.cards }]);
}

/* ---------- 入力（タップ操作） ---------- */
function handleAct(act, el) {
  switch (act) {
    case "start": showCpuSelect(); break;
    case "cpuLevel": startCpuGame(el && el.dataset.v); break;
    case "cpuAgain": startCpuGame(CPU_LEVEL); break;
    case "online": Online.showLobby(); break;
    case "rules": if (!S) { if (overlayFrom !== "lobby" && overlayFrom !== "options") overlayFrom = "start"; } else if (overlayFrom !== "menu" && overlayFrom !== "result") overlayFrom = "game"; showRules(); break;
    case "cards": if (!S) overlayFrom = "start"; showCardList(); break;
    case "log": if ($("#overlay").hidden) overlayFrom = "game"; showLog(); break;
    case "back": goBack(); break;
    case "menu": showMenu(); break;
    case "toTitle": toTitle(); break;
    case "surrender": Online.surrender(); break;
    case "closeOverlay": $("#overlay").hidden = true; break;
    case "showResult": if (S && S.over) showResult(myResult()); break;
    case "cancel": ui = { sel: null, mode: null }; render(); break;
    case "end": doEnd(); break;
    case "rps": if (S && el) doRps(el.dataset.v); break;
    case "choose": if (S && el) doChoose(el.dataset.v === "1"); break;
    case "mull": if (S && el) doMull(el.dataset.v === "1"); break;
    case "play": {
      if (!ui.sel || ui.sel.kind !== "hand" || !canAct()) return;
      const idx = ui.sel.idx;
      if (!canPlay(ME, idx).ok) return;
      beginPlay(idx);
      break;
    }
    case "account": Account.showScreen(); break;
    case "soundPanel": Sound.showPanel(); break;
    case "options": showOptions(); break;
    case "optBack": showStart(); break;
    case "sound": Sound.toggle(); Sound.showPanel(); break;
    case "soundTest": Sound.unlock(); Sound.play("win"); setTimeout(() => Sound.showPanel(), 300); break;
    case "soundLoud": Sound.toggleLoud(); Sound.showPanel(); break;
    default:
      if (Splash.handleAct(act, el)) return;
      if (Account.handleAct(act, el)) return;
      if (Feedback.handleAct(act, el)) return;
      if (Serial.handleAct(act, el)) return;
      if (Packs.handleAct(act, el)) return;
      if (Decks.handleAct(act, el)) return;
      if (typeof Online !== "undefined") Online.handleAct(act, el);
  }
}

document.addEventListener("click", e => {
  if (Date.now() < suppressClickUntil) { e.preventDefault(); return; }
  const act = e.target.closest("[data-act]");
  if (act) { if (!act.disabled) handleAct(act.dataset.act, act); return; }
  if (!S || S.over) return;
  const myTurn = canAct();

  const h = e.target.closest("[data-hand]");
  if (h) { hidePreview(); ui = { sel: { kind: "hand", idx: +h.dataset.hand }, mode: null }; render(); return; }

  const c = e.target.closest("[data-uid]");
  if (c) {
    const uid = +c.dataset.uid, owner = +c.dataset.owner;
    if (myTurn && ui.mode === "attack" && owner === OP) {
      const tu = S.players[OP].field.find(x => x.uid === uid);
      if (tu && !canAttackUnit(ME, tu)) { toast("守護を持つキャラを先に攻撃してください"); return; }
      const a = ui.sel.uid; ui = { sel: null, mode: null }; doAttack(a, uid); return;
    }
    if (myTurn && ui.mode === "target") {
      const r = curRole();
      if (r && owner === roleSide(ME, r)) { pickTarget(uid); return; }
      return;
    }
    const u = S.players[owner].field.find(x => x.uid === uid);
    if (myTurn && owner === ME && u && u.ready) { ui = { sel: { kind: "unit", owner, uid }, mode: "attack" }; render(); return; }
    ui = { sel: { kind: "unit", owner, uid }, mode: null }; render(); return;
  }

  const pl = e.target.closest("[data-player]");
  if (pl && myTurn && ui.mode === "attack" && +pl.dataset.player === OP && canAttackPlayer(ME, selectedUnit())) {
    const a = ui.sel.uid; ui = { sel: null, mode: null }; doAttack(a, "player");
  }
});

window.addEventListener("resize", () => { if (S && !(drag && drag.started)) render(); });
