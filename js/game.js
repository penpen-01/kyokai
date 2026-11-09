/* =========================================================
   境界の召喚士 — 対戦画面（CPU戦・対人戦共通）
   カードとルールの数値は game-data.json（カード工房で作成）から読み込みます。

   視点：ME が自分のプレイヤー番号、OP が相手。CPU戦は常に ME=0。
   対人戦では部屋を作った人（ホスト）が 0 で、対戦処理もホストが行う。
   参加した人（ゲスト）は 1 で、操作をホストに送り、結果の盤面を受け取る。
   ========================================================= */

const CPU_DELAY = 800; // CPUの行動間隔（ミリ秒）。700→1000（2026-11-02 未明）→ オーナー「少し遅い」で 800

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
  DEF.coin = COIN_CARD;
  PRESETS = data.decks;
  PACKS = data.packs;
  SERIALS = data.serials;
  NEWS = data.news; MAIL = data.mail; LOGIN = data.login; PICKS = data.picks || [];
  DATA_INFO.updated = data.updated;
  DATA_INFO.version = data.version;
}
const dataKey = () => `${DATA_INFO.version}-${DATA_INFO.updated}-${CARDS.length}`;
let SERIALS = []; // シリアルコード（ハッシュ）
let NEWS = [], MAIL = [], LOGIN = [], PICKS = [];   // お知らせ・メール（js/inbox.js）
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
    decks: decks.map(d => ({ name: d.name, cards: d.cards, ...(d.icon ? { icon: d.icon } : {}) })),
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
  const icon = deck.icon && DEF[deck.icon] && DEF[deck.icon].type === "char" && DEF[deck.icon].art ? deck.icon : null;
  return { name, deckName: deck.name, deck: buildPile(deck), hp: CONFIG.PLAYER_HP, maxE: 0, e: 0, hand: [], field: [], ...(icon ? { icon } : {}) };
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
  for (let i = 0; i < (CONFIG.SECOND_BONUS || 0); i++) draw(opp(S.first), true);
  // 後攻の人には「境界の欠片」（エナジー+1を1回だけ）を配る
  for (let i = 0; i < (CONFIG.SECOND_COIN || 0); i++) S.players[opp(S.first)].hand.push("coin");
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
    // 境界の欠片は山札に戻さず、手元に残す
    const coins = p.hand.filter(id => id === "coin");
    p.deck.push(...p.hand.filter(id => id !== "coin")); p.hand = coins; handReset(p);
    shuffle(p.deck);
    const k = CONFIG.START_HAND + (pi !== S.first ? (CONFIG.SECOND_BONUS || 0) : 0);
    for (let i = 0; i < k; i++) draw(pi, true);
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
    setTimeout(() => { if (S === g) chooseOrder(1, Math.random() < 0.5); }, 900);   // 後攻も強い（境界の欠片）ので、半々で選ぶ
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
  if (!silent && S.phase === "play") fx("draw", String(pi), "draw");   // 山札から手札へ飛ぶ（自分が引いたときだけ見せる。どのカードかは送らない）
  if (S.phase === "play") trigUnits(pi, "drawn");
  if (!silent) log(`${pname(pi)}はカードを1枚引いた。`, { pi, msg: `${pname(pi)}は${cname(id)}を引いた。` });
}

function startTurn(pi, skipDraw) {
  if (S.over) return;
  S.turn = pi; S.turnNo++;
  const p = S.players[pi];
  p.played = 0;
  p.maxE = Math.min(CONFIG.ENERGY_MAX, p.maxE + 1);
  p.e = p.maxE;
  returnFromVoid(pi);   // 亜空間のキャラは、元から場にいた扱いで戻る
  // 行動不能のキャラは、このターンだけ攻撃できない
  p.field.forEach(u => { u.swings = 0; u.thawed = false; if (u.frozen) { u.ready = false; u.frozen = false; u.thawed = true; } else u.ready = !kw(u, "noattack"); });
  // 特殊勝利：場にいるまま、自分のターンの始めを決めた回数むかえると勝ち
  for (const u of p.field) {
    if (u.wakeIn != null && !u.silenced) { u.wakeIn--; if (u.wakeIn <= 0) { u.wakeIn = null; silenceUnit(u); if (!u.thawed) u.ready = true; log(`${cname(u.id)}が目覚めた（沈黙して不動が解けた）。このターンから攻撃できる。`); } else fx(unitSel(u.uid), `目覚めまで${u.wakeIn}`, "trig"); }
    if (u.winIn == null || u.silenced) continue;
    u.winIn--;
    if (u.winIn <= 0) { log(`${cname(u.id)}の力で、${pname(pi)}の勝利！`); S.specialWin = pi; break; }
    log(`${cname(u.id)}：勝利まであと${u.winIn}回。`); fx(unitSel(u.uid), `勝利まで${u.winIn}`, "trig");
  }
  if (S.specialWin != null && checkWin()) return;
  S.log.push({ sep: true, msg: `ターン${S.turnNo}：${pname(pi)}（エナジー${p.e}）` });
  if (!skipDraw) draw(pi);
  trigUnits(pi, "turnStart");
  cleanup();
  if (checkWin()) return;
  render();
  if (pi === 1 && MODE === "cpu") cpuTurn();
}

function endTurn(pi) {
  if (S.over || S.phase !== "play" || S.turn !== pi) return;
  if (pi === ME) ui = { sel: null, mode: null };
  S.players[pi].field.forEach(u => {
    if (kw(u, "regen") && u.hp > 0 && u.hp < u.maxHp) { fx(unitSel(u.uid), "+" + (u.maxHp - u.hp), "heal"); u.hp = u.maxHp; log(`${cname(u.id)}は再生した。`); }
    if (kw(u, "doom")) { if (u.doomArmed) { log(`${cname(u.id)}は死の宣告で破壊された。`); destroyUnit(u); } else u.doomArmed = true; }
  });
  trigUnits(pi, "turnEnd");
  trigUnits(opp(pi), "oppTurnEnd");   // 相手のターンの終わりに発動する効果
  cleanup();
  if (checkWin()) return;
  // 「このターンだけ」の能力・装甲・コスト低下を消す
  S.players.forEach(p => {
    p.handCutT = [];
    p.handGrow = [];   // 妖気はそのターンだけ
    p.field.forEach(u => {
      if (u.tmpKws) { u.kws = (u.kws || []).filter(k => !u.tmpKws.includes(k)); delete u.tmpKws; }
      if (u.tmpArmor) { u.armorPlus = Math.max(0, (u.armorPlus || 0) - u.tmpArmor); delete u.tmpArmor; }
      if (u.tmpAtk) { u.atk = Math.max(0, u.atk - u.tmpAtk); delete u.tmpAtk; }   // このターンだけの攻撃力
    });
  });
  startTurn(opp(pi), false);
}

/* ---------- 亜空間（自分のキャラを一時的に場から外す） ----------
   p.voidU = [{ u: キャラ, slot: 元の場所 }]。外れている間、その場所にはキャラを出せない。
   次のその人のターン開始時に、元の場所に戻る（状態はそのまま・登場時効果なし・そのターンから攻撃できる） */
const voidOf = p => p.voidU || [];
/* 場の4つの場所に、何が入っているか（亜空間で空けている場所も含む）。{ u, void } か null */
function slotLayout(p) {
  const slots = Array(CONFIG.FIELD_MAX).fill(null);
  voidOf(p).forEach(v => { if (v.slot < slots.length && !slots[v.slot]) slots[v.slot] = { u: v.u, void: true }; else { const i = slots.indexOf(null); if (i >= 0) slots[i] = { u: v.u, void: true }; } });
  let i = 0;
  p.field.forEach(u => { while (i < slots.length && slots[i]) i++; if (i < slots.length) slots[i++] = { u, void: false }; });
  return slots;
}
const fieldFull = p => p.field.length + voidOf(p).length >= CONFIG.FIELD_MAX;
function banishOwn(pi) {
  const p = S.players[pi];
  if (!p.field.length) return;
  const slots = slotLayout(p);
  p.voidU = slots.map((x, slot) => x ? { u: x.u, slot } : null).filter(Boolean);
  p.field.forEach(u => fx(unitSel(u.uid), "亜空間へ", "heal"));
  p.field = [];
  log(`${pname(pi)}のキャラは亜空間に送られた（次の${pname(pi)}のターンに戻る）。`);
}
/* キャラ1体だけを亜空間に送る（持ち主の次のターンの始めに戻る） */
function banishUnit(side, u) {
  const p = S.players[side];
  const slot = slotLayout(p).findIndex(x => x && !x.void && x.u === u);
  if (slot < 0) return;
  p.field = p.field.filter(x => x !== u);
  (p.voidU || (p.voidU = [])).push({ u, slot });
  fx(unitSel(u.uid), "亜空間へ", "heal");
  log(`${cname(u.id)}は亜空間に送られた（次の${pname(side)}のターンに戻る）。`);
}
function returnFromVoid(pi) {
  const p = S.players[pi];
  if (!voidOf(p).length) return;
  const slots = slotLayout(p);
  const back = voidOf(p).map(v => v.u);
  p.field = slots.filter(Boolean).map(x => x.u);
  p.voidU = [];
  log(`${pname(pi)}のキャラが亜空間から戻った。`);
  back.forEach(u => queueTrig(pi, "voidBack", u));
}

/* ---------- カードを使う ---------- */
/* キャラの能力：カードの能力＋効果で与えられた能力（u.kws）。沈黙したキャラは何も持たない */
const kw = (u, k) => !!(u && !u.silenced && DEF[u.id] && (DEF[u.id].keywords.includes(k) || (u.kws || []).includes(k)));
const armorOf = u => (u.silenced ? 0 : ((DEF[u.id] && DEF[u.id].armor) || 0) + (u.armorPlus || 0));
/* 隠密（攻撃するまで）・聖盾（1回使うまで） */
const hidden = u => kw(u, "stealth") && !u.revealed;
const shielded = u => kw(u, "shield") && !u.shieldUsed;
/* 相手が対象に選べるか（隠密・呪文耐性は選べない） */
const canTarget = u => !hidden(u) && !kw(u, "elusive");
/* ランダムな1体に選ばれるか（隠密は選ばれない。呪文耐性は選ばれる） */
const canRandom = u => !hidden(u);
/* 対象を選ぶ役割で、選べるキャラ */
/* カード d の効果が、その役割の対象を世界で絞っているか（「自分の神話のキャラ1体」など） */
function roleWorld(d, role) {
  const e = d && (d.effects || []).find(e => e.kind === "unit" && e.world && UTOS[e.to] && UTOS[e.to].role === role && whenOf(e) === "play");
  return e ? e.world : null;
}
const worldOK = (u, w) => !w || (DEF[u.id] && DEF[u.id].world === w);
function targetables(pi, role, d) {
  const w = roleWorld(d, role);
  if (role === "any") return [...S.players[pi].field, ...S.players[opp(pi)].field.filter(canTarget)].filter(u => worldOK(u, w));
  const f = S.players[roleSide(pi, role)].field.filter(u => worldOK(u, w));
  return role === "enemy" || role === "enemyF" ? f.filter(canTarget) : f;
}
/* その役割で選べるもの（uid の並び。「相手（キャラかプレイヤー）」は "face" も選べる） */
function targetOpts(pi, role, d) {
  const u = targetables(pi, role, d).map(x => x.uid);
  return role === "enemyF" ? [...u, "face"] : u;
}
/* 役割ごとに、そのキャラ（またはプレイヤー）を選べるか */
function roleAllows(pi, role, owner, u, d) {
  if (!worldOK(u, roleWorld(d, role))) return false;
  if (role === "any") return owner === pi || canTarget(u);
  if (owner !== roleSide(pi, role)) return false;
  return role === "enemy" || role === "enemyF" ? canTarget(u) : true;
}
/* コスト：次の1枚だけ下げる（discount）＋「コストを下げる」効果。
   コストを下げる効果は、そのとき手札にあるカード1枚ずつに付く（p.handCut＝ずっと、p.handCutT＝このターンだけ。手札と同じ並び）。
   山札にあるカードや、あとから引いたカードは下がらない。手札から出ると消える */
function handCutAt(p, idx) { return idx == null ? 0 : ((p.handCut || [])[idx] || 0) + ((p.handCutT || [])[idx] || 0); }
function effCost(pi, d, idx) {
  const p = S.players[pi];
  return Math.max(0, d.cost - (p.discount || 0) - handCutAt(p, idx));
}
/* 手札から idx のカードを抜く（コスト低下の並びも一緒に） */
function handTake(p, idx) {
  const [id] = p.hand.splice(idx, 1);
  if (p.handCut) p.handCut.splice(idx, 1);
  if (p.handGrow) p.handGrow.splice(idx, 1);
  if (p.handCutT) p.handCutT.splice(idx, 1);
  return id;
}
/* 手札を作り直したとき（入れ替え・マリガン）は、コスト低下も消す */
function handReset(p) { p.handCut = []; p.handCutT = []; p.handGrow = []; }
const handGrowAt = (p, idx) => (p.handGrow || [])[idx] || 0;

/* 対象を選ぶ役割ごとに、どちらのプレイヤーのキャラから選ぶか（any は両方） */
function roleSide(pi, role) { return role === "enemy" || role === "enemyF" ? opp(pi) : pi; }
/* 実際に選ぶ必要がある対象（キャラで、その側にキャラがいない効果は選ばずに空振り） */
function neededRoles(pi, d) {
  return cardTargetRoles(d).filter(r => targetOpts(pi, r, d).length > 0);
}

/* 使える条件（card.req）：自分の場に（世界の）キャラが N 体以上、または（orEmpty）自分の場が空 */
function reqOK(pi, r) {
  const f = S.players[pi].field;
  const n = f.filter(u => !r.world || (DEF[u.id] && DEF[u.id].world === r.world)).length;
  return n >= (r.n || 0) || (r.orEmpty && f.length === 0);
}
function canPlay(pi, idx) {
  const p = S.players[pi], d = DEF[p.hand[idx]];
  if (!d) return { ok: false, reason: "そのカードはありません" };
  if (d.id === GEAR_ID) return { ok: false, reason: "歯車はこれだけでは使えません" };
  if (d.req && !reqOK(pi, d.req)) return { ok: false, reason: reqText(d.req) };
  if (S.over || S.phase !== "play" || S.turn !== pi) return { ok: false, reason: "自分のターンではありません" };
  if (effCost(pi, d, idx) > p.e) return { ok: false, reason: "エナジーが足りません" };
  const sac = d.pay && d.pay.kind === "sacrifice";
  if (sac && !p.field.length) return { ok: false, reason: "代償にする自分のキャラがいません" };
  if (d.pay && d.pay.kind === "life" && p.hp <= d.pay.n) return { ok: false, reason: "代償の体力が足りません" };
  if (d.type === "char" && fieldFull(p) && !sac) return { ok: false, reason: voidOf(p).length ? "空いている場所がありません（亜空間のキャラが戻る場所です）" : "場がいっぱいです" };
  if (d.type === "spell" && d.effects.some(e => e.kind === "banishOwn") && d.effects.every(e => e.kind === "banishOwn") && !p.field.length) return { ok: false, reason: "自分の場にキャラがいません" };
  if (d.type === "spell" && d.effects.length && d.effects.every(e => e.kind === "merge") && !d.effects.some(e => p.field.filter(u => u.id === e.card).length >= e.n)) return { ok: false, reason: "合体に必要なキャラがそろっていません" };
  // 相手のキャラにしか効かない魔法（天罰の光・吹雪など）は、相手の場が空なら使えない（無駄打ち防止）
  const enemyOnly = e => e.kind === "unit" && sideOfTo(e.to) === "enemy" && e.to !== "enemyF" && ["dmg", "destroy", "freeze", "atk"].includes(e.act) && (e.act !== "atk" || e.n < 0);
  if (d.type === "spell" && d.effects.length && d.effects.every(enemyOnly) && !S.players[opp(pi)].field.length)
    return { ok: false, reason: "相手の場にキャラがいません" };
  // 魔法は対象がいないと使えない（キャラは対象がいなくても出せる）
  if (d.type === "spell") {
    for (const r of cardTargetRoles(d)) {
      if (!targetOpts(pi, r, d).length) return { ok: false, reason: roleWorld(d, r) ? `対象にできる${WORLDS[roleWorld(d, r)]}のキャラがいません` : r === "enemy" ? (S.players[opp(pi)].field.length ? "対象に選べる相手キャラがいません（隠密・呪文耐性）" : "対象の相手キャラがいません") : "対象の自分のキャラがいません" };
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

/* 歯車を「使ってもよい」カードで、いま選べるか（手札の歯車が足りるときだけ聞く） */
function gearChoice(pi, idx) {
  const p = S.players[pi], d = DEF[p.hand[idx]];
  return !!(d && typeof d.gear === "number" && gearsOf(p) >= d.gear);
}
function playCard(pi, idx, targetsIn, useGear) {
  const p = S.players[pi], id = p.hand[idx], d = DEF[id];
  if (!d || !canPlay(pi, idx).ok) return false;
  const targets = normTargets(pi, d, targetsIn);
  const roles = neededRoles(pi, d);
  for (const r of roles) {
    if (!targetOpts(pi, r, d).includes(targets[r])) return false;
  }
  const cost = effCost(pi, d, idx);
  const grow = handGrowAt(p, idx);
  const spend = d.gear === "all" ? gearsOf(p) : useGear && gearChoice(pi, idx) ? d.gear : 0;
  handTake(p, idx);
  p.e -= cost;
  p.played = (p.played || 0) + 1;   // このターンに使ったカードの数（コンボの条件）
  p.discount = 0;
  const tnames = roles.filter(r => r !== "sacrifice").map(r => { if (targets[r] === "face") return pname(opp(pi)); const u = findUnit(targets[r]); return u ? cname(u.id) : ""; }).filter(Boolean);
  log(`${pname(pi)}：${cname(id)}を${d.type === "char" ? "召喚" : "使用"}${tnames.length ? `（対象：${tnames.join("・")}）` : ""}。`);
  sfx("play");
  if (["ur", "legend"].includes(d.rarity) && !d.token) fx("cutin", id, "cutin" + pi);   // UR・レジェンドはカットイン
  else fx("cast", id, "cast" + pi);
  // 代償
  if (d.pay && d.pay.kind === "life") { p.hp -= d.pay.n; log(`代償として${pname(pi)}の体力を${d.pay.n}払った。`); fx(playerSel(pi), "-" + d.pay.n, "dmg"); }
  if (d.pay && d.pay.kind === "sacrifice") {
    const u = p.field.find(x => x.uid === targets.sacrifice);
    if (u) { log(`代償として${cname(u.id)}を破壊した。`); u.hp = 0; u.destroyed = true; fx(unitSel(u.uid), "破壊", "dmg"); p.field = p.field.filter(x => x !== u); onDeath(pi, u); }
  }
  if (spend) { spendGears(p, spend); log(`歯車を${spend}枚使った。`); }
  else if (d.gear === "all") log("使える歯車がなかった。");
  let self = null;
  if (d.type === "char") {
    self = addUnit(pi, id);
    if (grow && d.grow.stat) { self.atk += grow; self.hp += grow; self.maxHp += grow; }
    // 先にキャラが場に降り立つのを見せてから、登場時効果を発動する
    if (playEffects(d).length) fx(unitSel(self.uid), id, "land");
  }
  S.gearSpent = spend; S.bouncedNow = 0;
  S.dmgBonus = grow && d.grow.dmg ? grow : 0;
  S.numBonus = grow && d.grow.num ? grow : 0;
  try { runEffects(pi, d, targets, self); } finally { S.gearSpent = 0; S.dmgBonus = 0; S.numBonus = 0; S.recycled = 0; }
  if (d.type === "spell") trigUnits(pi, "spell");
  trigUnits(pi, "cardPlay", self, { card: id });
  // 手札で小さくなるカード：使ったカードの世界・種類が合えば、手札にある間ずっとコストが下がる
  p.hand.forEach((hid, i) => { const h = DEF[hid], k = h && h.shrink;
    if (k && (!k.world || k.world === d.world) && (!k.ctype || k.ctype === d.type)) { (p.handCut || (p.handCut = []))[i] = ((p.handCut[i]) || 0) + k.n; }
    const g = h && h.grow;
    if (g && (!g.world || g.world === d.world) && (!g.ctype || g.ctype === d.type)) { (p.handGrow || (p.handGrow = []))[i] = ((p.handGrow[i]) || 0) + g.n; } });
  cleanup();
  if (!checkWin()) render();
  return true;
}

function addUnit(pi, id) {
  const d = DEF[id];
  const u = { uid: ++S.uidN, id, atk: d.atk, hp: d.hp, maxHp: d.hp, born: S.turnNo, ready: (d.keywords.includes("haste") || d.keywords.includes("rush")) && !d.keywords.includes("noattack") };
  S.players[pi].field.push(u);
  trigUnits(pi, "allyEnter", u);
  return u;
}

function runEffects(pi, d, targets, self) {
  playEffects(d).forEach(e => effect(pi, e, targets, self));
}

/* 効果の条件を満たしているか */
function condOK(pi, e, self) {
  const p = S.players[pi];
  switch (e.cond) {
    case "hpLE": return p.hp <= e.cn;
    case "worldGE": return p.field.filter(u => u.hp > 0 && (!e.cworld || (DEF[u.id] && DEF[u.id].world === e.cworld))).length >= e.cn;
    case "combo": return (p.played || 0) >= 2;   // いま使っているカードを含めて2枚目以上
    case "playedGE": return (p.played || 0) - 1 >= e.cn;   // 詠唱N：このカードより先に N 枚
    case "handZero": return p.hand.length === 0;
    case "handGE": return p.hand.length >= e.cn;
    case "maxEGE": return p.maxE >= e.cn;
    case "gearPaid": return (S.gearSpent || 0) > 0;
    case "recycled": return (S.recycled || 0) > 0;
    case "bounced": return (S.bouncedNow || 0) > 0;
    case "gearNone": return !(S.gearSpent > 0);
  }
  return true;
}
/* uid から場のキャラを探す（どちらの場でも） */
function findUnit(uid) { for (const p of S.players) { const u = p.field.find(x => x.uid === uid); if (u) return u; } return null; }
function sideOf(u) { return S.players.findIndex(p => p.field.includes(u)); }
/* 汎用「キャラに効果」の対象を集める */
function unitTargets(pi, e, targets, self) {
  const me = S.players[pi], en = S.players[opp(pi)];
  const wf = u => !e.world || (DEF[u.id] && DEF[u.id].world === e.world);
  const rnd = a => a.length ? [a[Math.floor(Math.random() * a.length)]] : [];
  switch (e.to) {
    case "enemy1": { const u = en.field.find(x => x.uid === targets.enemy && wf(x)); return u ? [u] : []; }
    case "own1": { const u = me.field.find(x => x.uid === targets.own && x !== self && wf(x)); return u ? [u] : []; }
    case "any1": { const u = findUnit(targets.any); return u && u !== self && wf(u) ? [u] : []; }
    case "enemyF": { if (targets.enemyF === "face") return ["face"]; const u = en.field.find(x => x.uid === targets.enemyF); return u ? [u] : []; }
    case "enemyRand": return rnd(en.field.filter(x => x.hp > 0 && canRandom(x) && wf(x)));
    case "enemyRandF": return rnd([...en.field.filter(x => x.hp > 0 && canRandom(x) && wf(x)), "face"]);
    case "anyRand": return rnd([...en.field.filter(x => x.hp > 0 && canRandom(x)), ...me.field.filter(x => x.hp > 0 && x !== self)].filter(wf));
    case "ownRand": return rnd(me.field.filter(x => x.hp > 0 && x !== self && wf(x)));
    case "enemyAll": return en.field.filter(wf);
    case "ownAll": return me.field.filter(wf);
    case "all": return [...en.field, ...me.field].filter(wf);
    case "self": return self && (self.hp > 0 || (DEF[self.id] && DEF[self.id].hp === 0 && !self.destroyed)) && me.field.includes(self) ? [self] : [];   // 0/0 から歯車で強くなるキャラも対象にする
  }
  return [];
}
function unitEffect(pi, e, targets, self) {
  const me = S.players[pi], n = e.n;
  const list = unitTargets(pi, e, targets, self);
  if (!list.length) return;
  if (["enemyAll", "ownAll", "all"].includes(e.to)) log(`${e.to === "enemyAll" ? "相手キャラ全体" : e.to === "ownAll" ? "自分のキャラ全体" : "すべてのキャラ"}に効果。`);
  list.forEach(u => {
    if (u === "face") {
      if (e.act === "dmg") { log(`${pname(opp(pi))}に${n}ダメージ。`); hitPlayer(opp(pi), n); }
      return;
    }
    const side = sideOf(u); if (side < 0) return;
    switch (e.act) {
      case "dmg": if (e.to === "enemyRand" || e.to === "enemyRandF") log(`${cname(u.id)}に${n}ダメージ。`); hitUnit(u, n); break;
      case "destroy": destroyUnit(u); break;
      case "freeze": freezeUnit(u); break;
      case "unfreeze": {
        if (!u.frozen && !u.thawed) break;   // 行動不能でないキャラには何もしない
        u.frozen = false;
        if (u.thawed && S.turn === side && !u.swings && !kw(u, "noattack")) { u.ready = true; u.thawed = false; }
        u.thawed = false;
        log(`${cname(u.id)}の行動不能が解けた。`); fx(unitSel(u.uid), "解除", "heal");
        if (n > 0) buff(u, n, 0);   // 解除できたキャラだけ攻撃力を上げる
        break;
      }
      case "atk": if (n >= 0) { buff(u, n, 0); if (e.turn) u.tmpAtk = (u.tmpAtk || 0) + n; } else debuff(u, -n); break;
      case "hp": if (n >= 0) buff(u, 0, n); else shrinkHp(u, -n); break;
      case "both": if (n >= 0) buff(u, n, n); else { debuff(u, -n); shrinkHp(u, -n); } break;
      case "heal": { const h = Math.min(n, u.maxHp - u.hp); if (h > 0) { u.hp += h; fx(unitSel(u.uid), "+" + h, "heal"); } break; }
      case "grant": grant(u, e); break;
      case "silence": silenceUnit(u); break;
      case "bounce": bounce(side, u, "hand"); break;
      case "shuffle": bounce(side, u, "deck"); break;
      case "banish": banishUnit(side, u); break;
      case "swap": swapStats(u); break;
      case "transform": {
        const t = DEF[e.card], before = cname(u.id);
        if (t && t.type === "char") { u.id = t.id; u.atk = t.atk; u.hp = t.hp; u.maxHp = t.hp; u.silenced = false; }
        else { u.atk = 1; u.hp = 1; u.maxHp = 1; u.silenced = true; }
        u.kws = []; u.armorPlus = 0; u.frozen = false; u.winIn = null;
        log(`${before}は${t ? cname(t.id) : "1/1"}に変身した。`); fx(unitSel(u.uid), "変身", "dmg");
        break;
      }
      case "copy": {
        if (fieldFull(me)) { log("場に空いている場所がなく、複製できなかった。"); break; }
        const c = addUnit(pi, u.id);
        // 受けたダメージ・強化・与えられた能力・沈黙も写す（行動不能と、特殊勝利の数は写さない）
        Object.assign(c, { atk: u.atk, hp: u.hp, maxHp: u.maxHp, kws: [...(u.kws || [])], armorPlus: u.armorPlus || 0, silenced: !!u.silenced, shieldUsed: !!u.shieldUsed,
          ...(u.tmpKws ? { tmpKws: [...u.tmpKws] } : {}), ...(u.tmpArmor ? { tmpArmor: u.tmpArmor } : {}) });
        c.ready = false;
        log(`${cname(u.id)}の複製が現れた。`); fx(unitSel(c.uid), "複製", "heal");
        break;
      }
      case "steal": {
        if (side === pi) break;
        if (fieldFull(me)) { log("自分の場に空きがなく、奪えなかった。"); break; }
        S.players[side].field = S.players[side].field.filter(x => x !== u);
        u.ready = false; u.frozen = false;
        if (u.owner == null) u.owner = side;   // 元の持ち主（手札・山札に戻すときは持ち主へ）
        me.field.push(u);
        log(`${pname(pi)}は${cname(u.id)}を奪った！`); fx(unitSel(u.uid), "奪った", "heal");
        break;
      }
    }
  });
}
/* 体力を下げる（最大値も下がる。0以下になったら倒れる） */
function shrinkHp(u, n) { u.maxHp = Math.max(0, u.maxHp - n); u.hp = Math.min(u.hp, u.maxHp); fx(unitSel(u.uid), `体力-${n}`, "dmg"); if (u.hp <= 0) u.destroyed = true; }
function playerEffect(pi, e) {
  const who = e.who === "self" ? [pi] : e.who === "both" ? [pi, opp(pi)] : [opp(pi)], n = e.n;
  who.forEach(q => {
    const p = S.players[q];
    switch (e.act) {
      case "dmg": log(`${pname(q)}に${n}ダメージ。`); hitPlayer(q, n); break;
      case "heal": p.hp += n; log(`${pname(q)}の体力が${n}回復。`); fx(playerSel(q), "+" + n, "heal"); trigUnits(q, "healed"); break;
      case "draw": for (let i = 0; i < n; i++) draw(q); break;
      case "discard":
        for (let i = 0; i < n && p.hand.length; i++) discardRandom(q, pi);
        break;
    }
  });
}
/* 歯車：手札に1枠だけ置き、枚数は p.gears で数える */
const gearsOf = p => (p.hand.includes(GEAR_ID) ? (p.gears || 0) : 0);
function addGears(pi, n) {
  const p = S.players[pi];
  if (!p.hand.includes(GEAR_ID)) {
    if (p.hand.length >= CONFIG.HAND_MAX) { log(`${pname(pi)}の手札がいっぱいで、歯車を加えられなかった。`); return; }
    p.hand.push(GEAR_ID); p.gears = 0;
  }
  p.gears = (p.gears || 0) + n;
  log(`${pname(pi)}は歯車を${n}枚手札に加えた（${p.gears}枚）。`);
}
function spendGears(p, n) {
  p.gears = Math.max(0, (p.gears || 0) - n);
  if (!p.gears) { const i = p.hand.indexOf(GEAR_ID); if (i >= 0) handTake(p, i); }
}
/* 手札をランダムに1枚捨てる。重なった歯車に当たったら、歯車を1枚だけ失う */
function discardRandom(q, pi) {
  const p = S.players[q];
  if (!p.hand.length) return;
  const i = Math.floor(Math.random() * p.hand.length);
  if (p.hand[i] === GEAR_ID) { spendGears(p, 1); log(`${pname(q)}は歯車を1枚捨て${q === pi ? "た" : "させられた"}（残り${p.gears || 0}枚）。`); return; }
  const id = handTake(p, i);
  log(`${pname(q)}は${cname(id)}を捨て${q === pi ? "た" : "させられた"}。`);
}
function effect(pi, e, targets, self) {
  if (e.cond && !condOK(pi, e, self)) return;
  if (e.per === "gear") { const k = S.gearSpent || 0; if (!k) return; e = { ...e, n: e.n * k }; }
  if (e.per === "played") { const k = Math.max(0, (S.players[pi].played || 0) - 1); if (!k) return; e = { ...e, n: e.n * k }; }
  if (S.dmgBonus && e.act === "dmg" && (e.kind === "unit" || e.kind === "player")) e = { ...e, n: e.n + S.dmgBonus };   // 妖気（ダメージ）
  else if (S.numBonus && e.n > 0 && e.act !== "dmg" && !["costDown", "winTimer", "merge", "tutor"].includes(e.kind)) e = { ...e, n: e.n + S.numBonus };   // 妖気（そのほかの数）
  if (e.kind === "unit") return unitEffect(pi, e, targets, self);
  if (e.kind === "player") return playerEffect(pi, e);
  const me = S.players[pi], en = S.players[opp(pi)], n = e.n;
  const enemyT = () => en.field.find(x => x.uid === targets.enemy);
  const ownT = () => me.field.find(x => x.uid === targets.own && x !== self);
  switch (e.kind) {
    case "draw": for (let i = 0; i < n; i++) draw(pi); break;
    case "refresh": {
      const coins = me.hand.filter(id => id === "coin" || id === GEAR_ID);   // コインと歯車は手札に残す
      const k = me.hand.length - coins.length;
      me.deck.push(...me.hand.filter(id => id !== "coin" && id !== GEAR_ID)); me.hand = coins; handReset(me); shuffle(me.deck);
      for (let i = 0; i < k + n; i++) draw(pi, true);
      log(`${pname(pi)}は手札を入れ替えた（${me.hand.length}枚）。`);
      break;
    }
    case "discard": {
      for (let i = 0; i < n && en.hand.length; i++) discardRandom(opp(pi), pi);
      break;
    }
    case "dmgTarget": { const u = enemyT(); if (u) hitUnit(u, n); break; }
    case "dmgRandom": {
      // すでに倒れている（体力0以下の）キャラは選ばない
      const alive = en.field.filter(x => x.hp > 0 && canRandom(x));
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
    case "heal": me.hp += n; log(`${pname(pi)}の体力が${n}回復。`); fx(playerSel(pi), "+" + n, "heal"); trigUnits(pi, "healed"); break;
    case "buffSelfAtk": if (self && self.hp > 0) buff(self, n, 0); break;
    case "buffSelfBoth": if (self && self.hp > 0) buff(self, n, n); break;
    case "readySelf": if (self && self.hp > 0 && me.field.includes(self) && !self.ready) { self.ready = true; log(`${cname(self.id)}はもう一度攻撃できる。`); fx(unitSel(self.uid), "もう一度", "heal"); } break;
    case "healUnits": me.field.forEach(u => { const h = Math.min(n, u.maxHp - u.hp); if (h > 0) { u.hp += h; fx(unitSel(u.uid), "+" + h, "heal"); } }); break;
    case "ramp": {
      const before = me.maxE;
      me.maxE = Math.min(CONFIG.ENERGY_MAX, me.maxE + n);
      if (me.maxE > before) { log(`${pname(pi)}のエナジー最大値が${me.maxE}に。`); fx(playerSel(pi), `エナジー+${me.maxE - before}`, "heal"); }
      break;
    }
    case "energyNow": me.e += n; log(`${pname(pi)}はエナジーを${n}得た。`); fx(playerSel(pi), `エナジー+${n}`, "heal"); break;
    case "banishOwn": banishOwn(pi); break;
    case "merge": {
      const parts = me.field.filter(u => u.id === e.card && u.hp > 0);
      if (parts.length < n || !DEF[e.into]) { log("合体に必要なキャラがそろっていなかった。"); break; }
      parts.slice(0, n).forEach(u => { u.hp = 0; u.destroyed = true; fx(unitSel(u.uid), "合体", "heal"); });
      me.field = me.field.filter(u => !parts.slice(0, n).includes(u));
      parts.slice(0, n).forEach(u => onDeath(pi, u));
      const c = addUnit(pi, e.into);
      log(`${cname(e.card)}が${n}体合体して、${cname(e.into)}になった！`); fx(unitSel(c.uid), "合体！", "heal");
      // 合体してできたキャラは、登場時の効果も発動する（対象を選ぶ効果はランダム）
      runEffects(pi, DEF[e.into], autoTargets(pi, c), c);
      break;
    }
    case "costDown": {
      const key = e.dur === "game" ? "handCut" : "handCutT";
      const arr = me[key] || (me[key] = []);
      let k = 0;
      me.hand.forEach((id, i) => { const c = DEF[id]; if (c && (!e.world || c.world === e.world) && (!e.ctype || c.type === e.ctype)) { arr[i] = (arr[i] || 0) + n; k++; } });
      log(k ? `${pname(pi)}の手札の${e.world ? WORLDS[e.world] + "の" : ""}${e.ctype === "char" ? "キャラ" : e.ctype === "spell" ? "魔法" : "カード"}${k}枚のコストが${n}下がった${e.dur === "game" ? "" : "（このターン）"}。` : "コストが下がるカードが手札になかった。");
      if (k) fx(playerSel(pi), `コスト-${n}`, "heal");
      break;
    }
    case "wakeTimer": if (self && self.hp > 0) { self.wakeIn = n; fx(unitSel(self.uid), `目覚めまで${n}`, "trig"); } break;
    case "recycle": {
      const g = me.grave || [];
      const pick = g.filter(id => DEF[id] && !DEF[id].token && (!e.world || DEF[id].world === e.world)).slice(-n);
      pick.forEach(id => { g.splice(g.lastIndexOf(id), 1); me.deck.splice(Math.floor(Math.random() * (me.deck.length + 1)), 0, id); });
      S.recycled = pick.length;
      log(pick.length ? `倒された${pick.map(cname).join("・")}を山札に混ぜた。` : "山札に戻せるキャラがいなかった。");
      break;
    }
    case "peekDiscard": {
      const q = opp(pi), h = S.players[q].hand;
      if (!h.length) { log(`${pname(q)}の手札は0枚だった。`); break; }
      log(`${pname(q)}の手札：${h.map(cname).join("・")}`);
      const top = Math.max(...h.map(id => (DEF[id] ? DEF[id].cost : 0)));
      const cands = h.map((id, i) => i).filter(i => (DEF[h[i]] ? DEF[h[i]].cost : 0) === top);
      const i = cands[Math.floor(Math.random() * cands.length)];
      if (h[i] === GEAR_ID) { spendGears(S.players[q], 1); log(`${pname(q)}は歯車を1枚捨てさせられた。`); break; }
      const id = handTake(S.players[q], i); log(`${pname(q)}は${cname(id)}を捨てさせられた。`);
      break;
    }
    case "winTimer": if (self && self.hp > 0) { self.winIn = n; log(`${cname(self.id)}：あと${n}回、自分のターンの始めをむかえると勝利。`); fx(unitSel(self.uid), `勝利まで${n}`, "trig"); } break;
    case "grantSelf": if (self && self.hp > 0) grant(self, e); break;
    case "grantOwn": { const u = ownT(); if (u) grant(u, e); break; }
    case "grantAll": me.field.filter(u => !e.world || (DEF[u.id] && DEF[u.id].world === e.world)).forEach(u => grant(u, e)); break;
    case "tokenField": {
      const t = DEF[e.card];
      if (!t || t.type !== "char") break;
      let k = 0;
      for (let i = 0; i < n && !fieldFull(me); i++) { addUnit(pi, t.id); k++; }
      log(k ? `${cname(t.id)}が${k}体現れた。` : "場に空いている場所がなく、トークンを出せなかった。");
      break;
    }
    case "tokenHand": {
      if (!DEF[e.card]) break;
      if (e.card === GEAR_ID) { addGears(pi, n); break; }
      let k = 0;
      for (let i = 0; i < n && me.hand.length < CONFIG.HAND_MAX; i++) { me.hand.push(e.card); k++; }
      if (k) log(`${pname(pi)}は${cname(e.card)}を${k}枚手札に加えた。`);
      break;
    }
    case "tutor": {
      const cands = me.deck.map((id, i) => ({ id, i })).filter(x => { const c = DEF[x.id]; return c && c.cost <= n && (!e.world || c.world === e.world) && (!e.ctype || c.type === e.ctype); });
      if (!cands.length) { log("条件に合うカードが山札になかった。"); break; }
      const pick = cands[Math.floor(Math.random() * cands.length)];
      me.deck.splice(pick.i, 1);
      if (me.hand.length >= CONFIG.HAND_MAX) { log(`手札がいっぱいで、${cname(pick.id)}は捨て札へ。`); break; }
      me.hand.push(pick.id);
      log(`${pname(pi)}は山札からカードを1枚手札に加えた。`, { pi, msg: `${pname(pi)}は山札から${cname(pick.id)}を手札に加えた。` });
      break;
    }
    case "bounceEnemy": { const u = enemyT(); if (u) bounce(opp(pi), u, "hand"); break; }
    case "bounceOwn": { const u = ownT(); if (u) bounce(pi, u, "hand"); break; }
    case "shuffleEnemy": { const u = enemyT(); if (u) bounce(opp(pi), u, "deck"); break; }
    case "steal": {
      const u = enemyT(); if (!u) break;
      if (fieldFull(me)) { log("自分の場に空きがなく、奪えなかった。"); break; }
      en.field = en.field.filter(x => x !== u);
      u.ready = false; u.frozen = false;
      if (u.owner == null) u.owner = opp(pi);   // 元の持ち主（手札・山札に戻すときは持ち主へ）
      me.field.push(u);
      log(`${pname(pi)}は${cname(u.id)}を奪った！`); fx(unitSel(u.uid), "奪った", "heal");
      break;
    }
    case "silence": { const u = enemyT(); if (u) silenceUnit(u); break; }
    case "silenceAll": if (en.field.length) { log("相手キャラ全体が沈黙した。"); en.field.forEach(silenceUnit); } break;
    case "silenceOwn": { const u = ownT(); if (u) silenceUnit(u); break; }
    case "transform": {
      const u = enemyT(); if (!u) break;
      const t = DEF[e.card], before = cname(u.id);
      if (t && t.type === "char") { u.id = t.id; u.atk = t.atk; u.hp = t.hp; u.maxHp = t.hp; u.silenced = false; }
      else { u.atk = 1; u.hp = 1; u.maxHp = 1; u.silenced = true; }
      u.kws = []; u.armorPlus = 0; u.frozen = false;
      log(`${before}は${t ? cname(t.id) : "1/1"}に変身した。`); fx(unitSel(u.uid), "変身", "dmg");
      break;
    }
    case "swapEnemy": { const u = enemyT(); if (u) swapStats(u); break; }
    case "swapOwn": { const u = ownT(); if (u) swapStats(u); break; }
    case "revive": {
      if (fieldFull(me)) { log("場に空いている場所がなく、復活できなかった。"); break; }
      const g = me.grave || [];
      const cands = g.map((id, i) => ({ id, i })).filter(x => DEF[x.id] && DEF[x.id].type === "char" && !DEF[x.id].token && DEF[x.id].cost <= n);
      if (!cands.length) { log("復活できるキャラがいなかった。"); break; }
      const pick = cands[Math.floor(Math.random() * cands.length)];
      g.splice(pick.i, 1);
      addUnit(pi, pick.id);
      log(`${cname(pick.id)}が復活した！`);
      break;
    }
    case "discount": me.discount = (me.discount || 0) + n; log(`${pname(pi)}の次のカードのコストが${n}下がる。`); break;
    case "summon": {
      if (fieldFull(me)) { log("場に空いている場所がなく、キャラを出せなかった。"); break; }
      const cands = me.deck.map((id, i) => ({ id, i })).filter(x => DEF[x.id] && DEF[x.id].type === "char" && DEF[x.id].cost <= n);
      if (!cands.length) { log("条件に合うキャラが山札にいなかった。"); break; }
      const pick = cands[Math.floor(Math.random() * cands.length)];
      me.deck.splice(pick.i, 1);
      const u = addUnit(pi, pick.id);
      log(`山札から${cname(pick.id)}が現れた！`);
      // 出てきたキャラの登場時効果は、対象をランダムに選んで発動する
      const auto = {};
      const et = en.field.filter(canRandom);
      if (et.length) auto.enemy = et[Math.floor(Math.random() * et.length)].uid;
      const others = me.field.filter(x => x !== u);
      if (others.length) auto.own = others[Math.floor(Math.random() * others.length)].uid;
      playEffects(DEF[pick.id]).filter(x => x.kind !== "summon").forEach(x => effect(pi, x, auto, u));
      break;
    }
  }
}

/* 能力を与える（装甲は数値を足す） */
function grant(u, e) {
  if (e.kw === "armor") { u.armorPlus = (u.armorPlus || 0) + e.n; if (e.turn) u.tmpArmor = (u.tmpArmor || 0) + e.n; log(`${cname(u.id)}は装甲${e.n}を得た${e.turn ? "（このターンだけ）" : ""}。`); fx(unitSel(u.uid), `装甲+${e.n}`, "heal"); return; }
  if (!KEYWORDS[e.kw]) return;
  if (e.turn && !(u.kws || []).includes(e.kw)) u.tmpKws = [...new Set([...(u.tmpKws || []), e.kw])];   // このターンだけ：ターンの終わりに消す
  log(`${cname(u.id)}は${KEYWORDS[e.kw].label}を得た。`);
  u.kws = [...new Set([...(u.kws || []), e.kw])];
  if ((e.kw === "haste" || e.kw === "rush") && !u.frozen && !kw(u, "noattack") && !u.swings) u.ready = true;
  if (e.kw === "shield") u.shieldUsed = false;
  if (e.kw === "stealth") u.revealed = false;
  // 効果で与えた死の宣告：相手のキャラなら、その持ち主の次のターンの終わりに破壊（自分のキャラなら次の自分のターンの終わり）
  if (e.kw === "doom") u.doomArmed = sideOf(u) !== S.turn;
  if (e.kw === "noattack") u.ready = false;
  fx(unitSel(u.uid), KEYWORDS[e.kw].label, "heal");
}
/* 場のキャラを手札（to="hand"）か山札（"deck"）へ。トークンは消える。手札があふれたら捨て札 */
function bounce(pi, u, to) {
  S.players[pi].field = S.players[pi].field.filter(x => x !== u);
  // 奪われたキャラは、元の持ち主の手札・山札に戻る（2026-11-04）
  if (u.owner != null) pi = u.owner;
  const p = S.players[pi];
  fx(unitSel(u.uid), to === "hand" ? "手札へ" : "山札へ", "heal");
  if (DEF[u.id] && DEF[u.id].token) { log(`${cname(u.id)}（トークン）は消えた。`); return; }
  if (to === "deck") { p.deck.splice(Math.floor(Math.random() * (p.deck.length + 1)), 0, u.id); log(`${cname(u.id)}は${pname(pi)}の山札に混ざった。`); return; }
  if (p.hand.length >= CONFIG.HAND_MAX) { log(`${pname(pi)}の手札がいっぱいで、${cname(u.id)}は捨て札へ。`); return; }
  p.hand.push(u.id); log(`${cname(u.id)}は${pname(pi)}の手札に戻った。`);
  S.bouncedNow = (S.bouncedNow || 0) + 1;   // 「戻せたら」の条件用
  // 場から手札に戻ったとき の効果（対象はランダム。戻す効果が続けて起きすぎないように3回まで）
  const back = (DEF[u.id].effects || []).filter(e => whenOf(e) === "back");
  if (back.length && (S.backDepth || 0) < 3) {
    S.backDepth = (S.backDepth || 0) + 1;
    log(`${cname(u.id)}の効果（場から手札に戻ったとき）。`);
    try { back.forEach(e => effect(pi, e, autoTargets(pi, null), null)); } finally { S.backDepth--; }
  }
}
/* 沈黙：効果と能力をすべて失う（上がった攻撃力・体力はそのまま） */
function silenceUnit(u) {
  u.winIn = null;
  u.silenced = true; u.kws = []; u.armorPlus = 0;
  log(`${cname(u.id)}は沈黙した。`); fx(unitSel(u.uid), "沈黙", "dmg");
}
function swapStats(u) {
  const a = u.atk; u.atk = Math.max(0, u.hp); u.hp = a; u.maxHp = Math.max(u.maxHp, a);
  log(`${cname(u.id)}の攻撃力と体力が入れ替わった（${u.atk}/${u.hp}）。`); fx(unitSel(u.uid), "入れ替え", "heal");
}

function hitUnit(u, n) {
  if (n > 0 && shielded(u)) { u.shieldUsed = true; fx(unitSel(u.uid), "聖盾", "heal"); log(`${cname(u.id)}の聖盾がダメージを防いだ。`); return 0; }
  const dmg = Math.max(0, n - armorOf(u));
  u.hp -= dmg;
  fx(unitSel(u.uid), dmg < n ? `-${dmg}（装甲）` : "-" + dmg, "dmg");
  if (dmg > 0 && u.hp > 0) { const pi = S.players.findIndex(p => p.field.includes(u)); if (pi >= 0) queueTrig(pi, "survive", u); }
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

/* ---------- 効果の連鎖（倒されたとき・ターンの始めなど） ----------
   発動を S.q に積んでおき、cleanup で順番に処理する。倒れたキャラを場から外すと「倒されたとき」が積まれるので、
   積まれたものがなくなるまで繰り返す（無限に続く組み合わせは 60 回で打ち切る） */
const hasTrig = (u, when) => !!(u && !u.silenced && DEF[u.id] && DEF[u.id].effects.some(e => whenOf(e) === when));
function queueTrig(pi, when, u, extra) {
  if (!hasTrig(u, when)) return;
  (S.q || (S.q = [])).push({ pi, when, uid: u.uid, snap: when === "death" ? JSON.parse(JSON.stringify(u)) : null, ...(extra || {}) });
}
/* pi の場のキャラ全員（except 以外）に、そのタイミングの発動を積む */
function trigUnits(pi, when, except, extra) {
  if (!S || S.phase !== "play") return;
  S.players[pi].field.forEach(u => { if (u !== except) queueTrig(pi, when, u, extra); });
}
/* 登場時以外の効果の対象：ランダムに選ぶ（倒れかけのキャラは選ばない） */
function autoTargets(pi, self) {
  const pick = a => a.length ? a[Math.floor(Math.random() * a.length)] : undefined;
  const ens = S.players[opp(pi)].field.filter(x => x.hp > 0 && canRandom(x)).map(x => x.uid);
  const owns = S.players[pi].field.filter(x => x.hp > 0 && x !== self).map(x => x.uid);
  return { enemy: pick(ens), own: pick(owns), any: pick([...ens, ...owns]), enemyF: pick([...ens, "face"]) };
}
function fireTrig(t) {
  const p = S.players[t.pi];
  const u = t.snap || p.field.find(x => x.uid === t.uid);
  if (!u || u.silenced || !DEF[u.id]) return;
  if (t.when === "survive" && u.hp <= 0) return;
  const cd = t.card && DEF[t.card];
  const list = DEF[u.id].effects.filter(e => whenOf(e) === t.when && (t.when !== "cardPlay" || (cd && (!e.pw || cd.world === e.pw) && (!e.pt || cd.type === e.pt))));
  if (!list.length) return;
  log(`${cname(u.id)}の効果（${t.when === "cardPlay" ? cardPlayHead(list[0]) : WHENS[t.when].label}）。`);
  fx(unitSel(u.uid), WHENS[t.when].label, "trig");
  const auto = autoTargets(t.pi, u);
  list.forEach(e => effect(t.pi, e, auto, u));
}
/* キャラが場から消えたとき（倒れた・代償で破壊された） */
function onDeath(pi, u) {
  const p = S.players[u.owner != null ? u.owner : pi];   // 奪われたキャラは元の持ち主の墓地へ
  (p.grave || (p.grave = [])).push(u.id);   // この対戦で破壊された自分のキャラ（復活の効果で使う）
  queueTrig(pi, "death", u);
  trigUnits(pi, "allyDeath", u);
}
function reap() {
  let any = false;
  S.players.forEach((p, pi) => {
    const dead = p.field.filter(u => u.hp <= 0);
    if (!dead.length) return;
    any = true;
    p.field = p.field.filter(u => u.hp > 0);
    dead.forEach(u => {
      fx(unitSel(u.uid), "", "die");
      log(`${pname(pi)}の${cname(u.id)}は${u.destroyed ? "破壊された" : "倒れた"}。`);
      onDeath(pi, u);
    });
  });
  return any;
}
function cleanup() {
  for (let loop = 0; loop < 60; loop++) {
    if (reap()) continue;   // 先に倒れたキャラを場から外す（「倒されたとき」が積まれる）
    if (!S.q || !S.q.length) break;
    fireTrig(S.q.shift());
  }
  if (S.q && S.q.length) log("効果の連鎖が長すぎるため、ここで打ち切った。");
  S.q = [];
}

/* ---------- 攻撃 ---------- */
const guards = pi => S.players[pi].field.filter(u => kw(u, "guard") && !hidden(u));
/* 相手プレイヤーは、相手の場に守護がいなければいつでも攻撃できる（2026-10 ルール変更）。
   直撃を持つキャラは守護を無視できる */
/* 突進：場に出たターンは、キャラにしか攻撃できない（速攻も持っていれば制限なし） */
const rushOnly = u => !!(u && kw(u, "rush") && !kw(u, "haste") && u.born === S.turnNo);
function canAttackPlayer(pi, u) {
  if (rushOnly(u)) return false;
  if (!guards(opp(pi)).length) return true;
  return !!(u && kw(u, "pierce"));
}
/* 守護がいる間は、守護を持つキャラしか攻撃できない（直撃を持つキャラ u は例外） */
function canAttackUnit(pi, target, u) {
  if (hidden(target)) return false;
  const g = guards(opp(pi));
  return !g.length || g.includes(target) || !!(u && kw(u, "pierce"));
}
function selectedUnit() {
  return ui.sel && ui.sel.kind === "unit" ? S.players[ui.sel.owner].field.find(u => u.uid === ui.sel.uid) : null;
}

function attack(pi, uid, target) {
  if (S.over || S.phase !== "play" || S.turn !== pi) return false;
  const me = S.players[pi], en = S.players[opp(pi)];
  const a = me.field.find(u => u.uid === uid);
  if (!a || !a.ready || kw(a, "noattack")) return false;
  if (target === "player") {
    if (!canAttackPlayer(pi, a)) return false;
  } else {
    const d0 = en.field.find(u => u.uid === target);
    if (!d0 || !canAttackUnit(pi, d0, a)) return false;
  }
  // 2回攻撃は1ターンに2回まで。攻撃すると隠密は解ける
  a.swings = (a.swings || 0) + 1;
  a.ready = kw(a, "twice") && a.swings < 2;
  if (hidden(a)) { a.revealed = true; log(`${cname(a.id)}の隠密が解けた。`); }
  const steal = (u, pIdx, n) => { if (n > 0 && kw(u, "lifesteal")) { S.players[pIdx].hp += n; log(`吸収！${pname(pIdx)}の体力が${n}回復。`); fx(playerSel(pIdx), "+" + n, "heal"); trigUnits(pIdx, "healed"); } };
  if (target === "player") {
    fx(unitSel(a.uid), playerSel(opp(pi)), "lunge");
    log(`${cname(a.id)}が${pname(opp(pi))}に${a.atk}ダメージ！`);
    hitPlayer(opp(pi), a.atk);
    queueTrig(pi, "attack", a);
    if (a.atk > 0) queueTrig(pi, "face", a);
  } else {
    const d = en.field.find(u => u.uid === target);
    fx(unitSel(a.uid), unitSel(d.uid), "lunge");
    log(`${cname(a.id)}（${a.atk}）が${cname(d.id)}（${d.atk}）を攻撃。`);
    const before = d.hp;
    const dealt = hitUnit(d, a.atk);
    const dRealHit = Math.min(dealt, Math.max(0, before));   // 吸収は相手の残りの体力まで
    if (kw(a, "trample") && dealt > before && before > 0) {
      const over = dealt - before;
      log(`貫通！${pname(opp(pi))}に${over}ダメージ。`);
      hitPlayer(opp(pi), over);
    }
    if (dealt > 0 && kw(a, "poison") && d.hp > 0) { log(`毒！${cname(d.id)}は破壊される。`); destroyUnit(d); }
    steal(a, pi, dRealHit);
    const back = hitUnit(a, d.atk);
    if (back > 0 && kw(d, "poison") && a.hp > 0) { log(`毒！${cname(a.id)}は破壊される。`); destroyUnit(a); }
    // 吸収は自分から攻撃したときだけ（反撃では回復しない。オーナー 11-10）
    queueTrig(pi, "attack", a);
    if (before > 0 && d.hp <= 0) queueTrig(pi, "kill", a);
    if (kw(a, "trample") && dealt > before && before > 0) queueTrig(pi, "face", a);
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
  if (a.hp > 0 && b.hp > 0 && S.specialWin == null) return false;
  S.over = true;
  S.winner = S.specialWin != null ? S.specialWin : a.hp <= 0 && b.hp <= 0 ? "draw" : a.hp <= 0 ? 1 : 0;
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
  // 最後の攻撃などの演出が終わるのを待ってから、決着の演出（Finale）→ タップで結果の画面
  resultTimer = setTimeout(async () => {
    if (S !== g || !S.over) return;
    await Motion.idle();
    if (S !== g) return;
    Finale.play(myResult(), () => { if (S !== g) return; resultShown = true; render(); showResult(myResult()); });
  }, 450);
}

/* ---------- CPU ----------
   強さは3段階。中級・上級は「その手を打ったら盤面がどうなるか」を実際に試算して、一番よい手を選ぶ。
   初級はおおざっぱに、出せるカードを出して適当に攻撃する。 */
let SIM = false;      // 試算中は演出・描画・ログの確定をしない
let CPU_LEVEL = "normal";
const CPU_LEVELS = {
  easy:   { label: "初級", desc: "のんびり遊べる相手" },
  normal: { label: "中級", desc: "それなりに考えて戦う" },
  hard:   { label: "上級", desc: "先を読んで最善手を狙う" },
  ex:     { label: "超級", desc: "第2弾のカードを使いこなす強敵" }   // 考え方は上級と同じ。デッキが強い。第2弾をすべて開放すると出る
};
const REWARD_KEY = { easy: "REWARD_EASY", normal: "REWARD_NORMAL", hard: "REWARD_HARD", ex: "REWARD_EX" };
/* 選べる強さ（超級は開いた人だけ）。AI だけを選ぶ画面（練習・世界限定）は超級を出さない */
const cpuLevels = (withEx) => Object.entries(CPU_LEVELS).filter(([k]) => k !== "ex" || (withEx && exOpen()));

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
/* 効果1つのおおまかな価値（CPU の盤面評価用。体力1点≒1） */
function effValue(e) {
  const n = Math.abs(e.n || 1), k = e.kind;
  if (k === "unit") {
    const many = ["enemyAll", "ownAll", "all"].includes(e.to), mine = sideOfTo(e.to) === "own", good = { dmg: !mine, destroy: !mine, freeze: !mine, silence: !mine, bounce: !mine, shuffle: !mine, transform: !mine, steal: true, copy: true, heal: true, grant: true, unfreeze: true, swap: true, banish: true, atk: (e.n > 0) === mine, hp: (e.n > 0) === mine, both: (e.n > 0) === mine }[e.act];
    const base = { dmg: n * 0.9, destroy: 3, freeze: 1.2, unfreeze: 0.8, atk: n * 0.9, hp: n * 0.9, both: n * 1.6, heal: n * 0.5, grant: 1.2, silence: 1.5, bounce: 2.5, shuffle: 3, transform: 3, swap: 1, copy: 3, steal: 3.5, banish: 0.6 }[e.act] || 0.8;
    const v = base * (many ? 1.8 : 1) * (e.to === "all" ? 0.4 : 1);
    return good ? v : -v * 0.6;
  }
  if (k === "player") {
    const v = { dmg: n * 0.8, heal: n * 0.45, draw: n * 1.2, discard: n * 0.9 }[e.act] || 0.8;
    const good = e.who === "self" ? e.act !== "dmg" && e.act !== "discard" : e.who === "opp" ? e.act === "dmg" || e.act === "discard" : e.act === "draw";
    return good ? v : -v * 0.6;
  }
  if (k === "merge") return 4;
  if (k === "costDown") return n * (e.dur === "game" ? 2 : 0.8);
  if (k === "winTimer") return 6;
  if (/^dmg(Target|Random)$/.test(k)) return n * 0.9;
  if (k === "dmgAll") return n * 1.6;
  if (k === "dmgFace") return n * 0.8;
  if (k === "draw" || k === "tutor") return n * 1.2;
  if (k === "heal") return n * 0.45;
  if (k === "healUnits") return n * 0.6;
  if (/^buff(Self)?(Atk|Hp)$/.test(k)) return n * 0.9;
  if (/^buff(Self)?Both$/.test(k)) return n * 1.6;
  if (/^buffAll/.test(k)) return n * 2.2;
  if (k === "tokenField") { const t = DEF[e.card]; return t ? n * (t.atk * 1.2 + t.hp * 0.9 + 1) : 0; }
  if (k === "tokenHand") return n * 1.0;
  if (k === "readySelf") return 1.5;
  if (/^(destroyTarget|transform|steal|bounceEnemy|shuffleEnemy|silence)$/.test(k)) return 3;
  if (k === "revive") return 3;
  if (/^(grant|freeze|debuff)/.test(k)) return 1.2;
  if (k === "ramp" || k === "energyNow") return n * 0.8;
  return 0.8;
}
/* 登場時以外の効果の価値。何度も働くタイミングは高く、倒されたときは1回分 */
const TRIG_WEIGHT = { death: 0.8, voidBack: 0.3, allyDeath: 0.6, kill: 0.6, survive: 0.7 };
function trigValue(d) {
  return d.effects.filter(e => whenOf(e) !== "play").reduce((a, e) => a + effValue(e) * (TRIG_WEIGHT[whenOf(e)] ?? 1) * (e.cond ? 0.6 : 1), 0);
}
function unitValue(u) {
  const d = DEF[u.id]; if (!d) return 0;
  let v = u.atk * 1.2 + Math.max(0, u.hp) * 0.9 + 1;
  if (kw(u, "guard")) v += 1.5 + u.hp * 0.2;
  if (kw(u, "pierce")) v += u.atk * 0.4;
  if (kw(u, "trample")) v += 0.5;
  if (hidden(u)) v += 1 + u.atk * 0.3;
  if (kw(u, "twice")) v += u.atk * 0.8;
  if (shielded(u)) v += 1 + u.atk * 0.5;
  if (kw(u, "poison")) v += 2;
  if (kw(u, "lifesteal")) v += u.atk * 0.4;
  if (kw(u, "elusive")) v += 1;
  if (kw(u, "noattack")) v -= u.atk * 1.0;
  if (kw(u, "regen")) v += 1 + u.maxHp * 0.15;
  if (kw(u, "doom")) v -= (u.atk + u.hp) * (u.doomArmed ? 0.6 : 0.3);
  v += armorOf(u) * 1.5;
  if (!u.silenced) v += trigValue(d);   // 場に残ると働く効果（倒されたとき・ターンの終わりなど）
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
  // 亜空間のキャラは、相手に倒されずに戻ってくる（少しだけ割り引いて数える）
  s += voidOf(me).reduce((a, v) => a + unitValue(v.u) * 0.9, 0) - voidOf(en).reduce((a, v) => a + unitValue(v.u), 0) * 1.0;
  s += Math.min(me.hand.length, 7) * 0.7 - en.hand.length * 0.35;
  s += gearsOf(me) * 0.3 - gearsOf(en) * 0.15;   // 手札の歯車（重なっている分）
  s += me.maxE * 0.9;
  // 相手の次の攻撃で負けそうなら大きく減点
  // 相手の次のターンに本体へ届きそうなダメージ（守護がいれば防げる）
  const myGuard = me.field.some(u => kw(u, "guard") && !hidden(u));
  const reach = en.field.reduce((a, u) => a + ((!myGuard || kw(u, "pierce")) && !u.frozen && !kw(u, "noattack") ? u.atk * (kw(u, "twice") ? 2 : 1) : 0), 0);
  if (reach >= me.hp) s -= 60;
  else s -= reach * 0.4;
  // 自分の次のターンに届くダメージ（とどめを狙う）
  const enGuard = en.field.some(u => kw(u, "guard") && !hidden(u));
  const myReach = me.field.reduce((a, u) => a + ((!enGuard || kw(u, "pierce")) && !kw(u, "noattack") ? u.atk * (kw(u, "twice") ? 2 : 1) : 0), 0);
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
      const opts = targetOpts(pi, r, DEF[id]);
      combos = combos.flatMap(c => opts.map(o => ({ ...c, [r]: o })));
    });
    const gearOpts = gearChoice(pi, idx) ? [true, false] : [false];
    combos.slice(0, 24).forEach(t => gearOpts.forEach(g => acts.push({ t: "play", idx, id, targets: t, ...(g ? { gear: true } : {}) })));
  });
  me.field.forEach(u => {
    if (!u.ready) return;
    if (canAttackPlayer(pi, u)) acts.push({ t: "attack", uid: u.uid, target: "player" });
    en.field.forEach(d => { if (canAttackUnit(pi, d, u)) acts.push({ t: "attack", uid: u.uid, target: d.uid }); });
  });
  return acts;
}
function applyAction(pi, a) {
  return a.t === "play" ? playCard(pi, a.idx, a.targets, !!a.gear) : attack(pi, a.uid, a.target);
}

function cpuChoose(pi) {
  const acts = legalActions(pi);
  if (!acts.length) return null;
  // 初級：手の良し悪しはざっくり見るが、得になる手の上位3つからでたらめに選ぶ（2026-11-02：前の「完全にでたらめ」は弱すぎた）
  const easy = CPU_LEVEL === "easy";
  const base = evaluate(S, pi);
  const hard = CPU_LEVEL === "hard" || CPU_LEVEL === "ex";
  const tries = hard ? 2 : 1; // ランダムな効果があるので、上級は複数回試して平均をとる
  // 上級は「この手のあとに続けて打てる一番よい手」まで読む（2手先）
  // エナジーを増やすだけのカード（境界の欠片・双子の妖精の効果など）は、それだけでは盤面が変わらないので、
  // 「そのあとに打てる一番よい手」まで読んで価値を決める（中級でも）
  const isResource = a => a.t === "play" && DEF[a.id] && DEF[a.id].type === "spell" && DEF[a.id].effects.length > 0 && DEF[a.id].effects.every(e => ["energyNow", "discount", "costDown"].includes(e.kind));
  const look = (st, force) => {
    let best = evaluate(st, pi);
    if ((!hard && !force) || st.over) return best;
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
      sum += look(st, isResource(a));
    }
    // 盤面の点数に表れない得（山札から選んで手札に加える＝手札の質が上がる）
    const bonus = a.t === "play" && DEF[a.id] ? playEffects(DEF[a.id]).filter(e => e.kind === "tutor").length * 0.9 : 0;
    return { a, v: sum / tries + bonus };
  }).sort((x, y) => y.v - x.v);
  if (easy) {
    const ok = scored.filter(x => x.v > base + 0.05).slice(0, 3);
    return ok.length ? ok[Math.floor(Math.random() * ok.length)].a : null;
  }
  if (CPU_LEVEL === "normal") {
    // 中級：ときどき2番目以降の手を選ぶ
    const ok = scored.filter(x => x.v > base - 0.5 && !(isResource(x.a) && x.v <= base + 0.05));
    if (!ok.length) return null;
    if (ok.length > 1 && Math.random() < 0.3) return ok[1 + Math.floor(Math.random() * Math.min(2, ok.length - 1))].a;
    return ok[0].v > base + 0.05 ? ok[0].a : null;
  }
  return scored[0].v > base + 0.05 ? scored[0].a : null;
}

async function cpuTurn() {
  const g = S;
  busy = true; render();
  await sleep(300);
  if (typeof Cinema !== "undefined") await Cinema.idle();   // 「相手のターン」の表示が終わってから動く
  await sleep(CPU_DELAY * 0.6);
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
function doPlay(idx, targets, gear) {
  if (!canAct()) return;
  if (MODE === "online" && Online.role === "guest") return Online.send({ t: "play", idx, targets: targets || {}, hand: S.players[ME].hand[idx], ...(gear ? { gear: true } : {}) });
  playCard(ME, idx, targets || {}, !!gear);
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
/* プレイヤーの顔（アイコン）にするカード。p.icon があればそれ、なければデッキでいちばんレアな絵付きキャラ */
function playerIcon(pi) {
  const p = S.players[pi];
  if (p.icon && DEF[p.icon] && DEF[p.icon].art) return p.icon;
  const deck = (S.decks && S.decks[pi] && S.decks[pi].cards) || {};
  const cands = Object.keys(deck).map(id => DEF[id]).filter(d => d && d.type === "char" && d.art);
  cands.sort((x, y) => RARITY_ORDER.indexOf(y.rarity) - RARITY_ORDER.indexOf(x.rarity) || y.cost - x.cost);
  return cands[0] ? cands[0].id : null;
}
const MENU_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
function pbarHTML(pi) {
  const p = S.players[pi];
  const tgt = (ui.mode === "attack" && pi === OP && canAttackPlayer(ME, selectedUnit())) || (ui.mode === "target" && pi === OP && curRole() === "enemyF");
  let pips = "";
  for (let i = 0; i < CONFIG.ENERGY_MAX; i++) {
    pips += `<span class="pip ${i < p.e ? "on" : i < p.maxE ? "used" : ""}"></span>`;
  }
  const icon = playerIcon(pi), art = icon && DEF[icon].art;
  const status = typeof Online !== "undefined" && MODE === "online" && pi === OP ? Online.oppStatusHTML() : "";
  const left = pi === OP
    ? `<button type="button" class="menubtn" data-act="menu" aria-label="メニュー">${MENU_ICON}</button><span class="counts"><i>手札 ${p.hand.length}</i><i>山札 ${p.deck.length}</i></span>`
    : `${DATA_INFO.draft ? '<span class="draftbadge">試遊中</span>' : ""}<span class="counts"><i>手札 ${p.hand.length}/${CONFIG.HAND_MAX}</i></span>`;
  const hp = Math.max(0, p.hp);
  return `<div class="pbar ${pi === OP ? "op" : "me"} ${S.turn === pi && !S.over ? "active" : ""}">
    <div class="pl-left">${left}</div>
    <button type="button" class="avatar ${tgt ? "tgt" : ""} ${S.over && resultShown && S.winner !== "draw" && S.winner !== pi ? "fin-broken" : ""}" data-player="${pi}" aria-label="${esc(p.name)}の体力 ${hp}">
      <span class="halo" aria-hidden="true"></span>
      <span class="face">${art ? iconImgHTML(icon) : `<span class="glyph">召</span>`}</span>
      <span class="hpgem ${hp <= 5 ? "low" : ""}"><b class="hpv">${hp}</b></span>
    </button>
    <div class="pl-right">
      <div class="pname"><b>${esc(p.name)}</b>${S.turn === pi && !S.over ? `<span class="acting">行動中</span>` : ""}${status}</div>
      <div class="energy" aria-label="エナジー ${p.e}/${p.maxE}"><span class="pips">${pips}</span><span class="etext">${p.e}<small>/${p.maxE}</small></span></div>
    </div></div>`;
}

/* 対象選択中の「今選んでいる役割」 */
function curRole() { return ui.mode === "target" ? ui.roles[Object.keys(ui.picked).length] : null; }
function isTargetable(pi, u) {
  if (ui.mode === "attack") return pi === OP && canAttackUnit(ME, u, selectedUnit());
  const r = curRole();
  return !!r && roleAllows(ME, r, pi, u, DEF[S.players[ME].hand[ui.sel.idx]]);
}
/* 手札のカードを使う操作を始める（対象が要るなら選択モードへ） */
function beginPlay(idx, gear) {
  const d = DEF[S.players[ME].hand[idx]];
  // 歯車を使うか選べるカードは、先に選んでもらう（詳細の「歯車を使って出す／使わずに出す」）
  if (gear == null && gearChoice(ME, idx)) { ui = { sel: { kind: "hand", idx }, mode: null }; render(); toast("歯車を使うかどうか選んでください"); return; }
  const roles = neededRoles(ME, d);
  if (roles.length) { ui = { sel: { kind: "hand", idx }, mode: "target", roles, picked: {}, gear: !!gear }; render(); return; }
  ui = { sel: null, mode: null };
  doPlay(idx, {}, !!gear);
}
function pickTarget(uid) {
  const r = curRole(); if (!r) return;
  ui.picked[r] = uid;
  if (Object.keys(ui.picked).length >= ui.roles.length) {
    const idx = ui.sel.idx, t = ui.picked, g = ui.gear;
    ui = { sel: null, mode: null };
    doPlay(idx, t, g);
  } else render();
}

function fieldHTML(pi) {
  const p = S.players[pi];
  const myTurn = S.turn === ME && !S.over;
  let s = "";
  const layout = slotLayout(p);
  for (let i = 0; i < CONFIG.FIELD_MAX; i++) {
    const x = layout[i], u = x && x.u;
    if (!u) { s += `<div class="slot"><span class="empty"></span></div>`; continue; }
    if (x.void) {
      s += `<div class="slot voidslot" title="亜空間：次の${esc(p.name)}のターンに戻る">${cardHTML(DEF[u.id], { unit: u, cls: "voided", showCost: false })}<span class="voidtag">亜空間</span></div>`;
      continue;
    }
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
  if (S.over && resultShown) return `<button type="button" class="endbtn" data-act="showResult"><span>結果<br>画面へ</span></button>`;
  if (S.over) return `<button type="button" class="endbtn" disabled><span>決着</span></button>`;
  if (S.turn !== ME) {
    const label = MODE === "cpu" ? "CPU<br>行動中" : "相手の<br>ターン";
    return `<button type="button" class="endbtn" disabled aria-label="${label.replace("<br>", "")}"><span>${label}</span></button>`;
  }
  if (typeof Online !== "undefined" && Online.blocked()) return `<button type="button" class="endbtn" disabled><span>送信中</span></button>`;
  return `<button type="button" class="endbtn" data-act="end" aria-label="ターン終了" ${canAct() ? "" : "disabled"}><span>ターン<br>終了</span></button>`;
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
  if (typeof Cinema !== "undefined") Cinema.watch();   // 試合開始・じゃんけん・先攻後攻・ターンの始めの大きな演出
  app.classList.add("battle");                       // 対戦前（じゃんけんなど）も同じ舞台を敷く
  app.classList.toggle("pre", S.phase !== "play");    // 対戦前は暗めに
  if (S.phase !== "play") { app.innerHTML = pregameHTML(); $("#sheet").hidden = true; return; }
  const tk = `${S.gid}-${S.turnNo}`;
  if (S.turn === ME && !S.over && tk !== lastTurnKey) { lastTurnKey = tk; }
  const me = S.players[ME];
  const lines = S.log.filter(l => !l.sep).slice(-2);
  app.innerHTML = `
    ${pbarHTML(OP)}
    ${fieldHTML(OP)}
    <div class="mid">
      <div class="pile" aria-label="自分の山札 ${me.deck.length}枚"><span class="pback"></span><b>${me.deck.length}</b></div>
      <button type="button" class="log" data-act="log" aria-label="プレイログを開く">${lines.map((l, i) => `<div class="${i < lines.length - 1 ? "old" : ""}">${logText(l)}</div>`).join("")}</button>
      ${endButtonHTML()}
    </div>
    ${fieldHTML(ME)}
    <div class="hand">${handOrder(me).map(i => {
      const id = me.hand[i];
      // 自分のターンに使えないカードは色を薄くする（相手のターン中は普通に見せる）
      const dim = !DEF[id] || (id !== GEAR_ID && S.turn === ME && !S.over && !canPlay(ME, i).ok);
      const sel = ui.sel && ui.sel.kind === "hand" && ui.sel.idx === i;
      return cardHTML(DEF[id], { cost: DEF[id] ? effCost(ME, DEF[id], i) : undefined, cls: `${dim ? "dim" : ""} ${sel ? "sel" : ""} ${id === GEAR_ID ? "gearstack" : ""}`, attrs: `data-hand="${i}"`, ...(id === GEAR_ID ? { count: me.gears || 0, showCost: false } : {}), ...(handGrowAt(me, i) ? { grow: handGrowAt(me, i) } : {}) });
    }).join("")}</div>
    ${pbarHTML(ME)}
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
/* じゃんけんの手（Gemini の絵を切り分けたもの：ui/rps-g/c/p.webp） */
const rpsImg = k => `<img class="rpsimg" src="ui/rps-${k}.webp" alt="" draggable="false">`;
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
  // じゃんけんの結果は大きな演出（js/cinema.js）で見せるので、ここでは一行だけ
  const lastLine = last ? `<p class="datainfo">相手：${RPS[last.hands[OP]]} ／ あなた：${RPS[last.hands[ME]]}</p>` : "";
  if (S.phase === "rps") {
    const mine = S.rps.picks[ME];
    body = `<h2 class="pre-title">${last ? "あいこ！ もう一度" : "じゃんけん"}</h2>
      ${last ? lastLine : `<p class="lead">勝った人が、先攻か後攻かを選べます。</p>`}
      ${mine ? `<p class="pre-wait">${RPS[mine] ? `あなたは${RPS[mine]}。` : "選びました。"}相手を待っています…</p>` : `
      <div class="rps">${Object.entries(RPS).map(([k, v]) => `<button type="button" class="rpsbtn" data-act="rps" data-v="${k}" ${wait ? "disabled" : ""}>${rpsImg(k)}<span>${v}</span></button>`).join("")}</div>`}
      ${S.rps.picks[OP] ? `<p class="datainfo">相手は選び終わっています</p>` : ""}`;
  } else if (S.phase === "choose") {
    body = `<h2 class="pre-title">${S.rpsWinner === ME ? "あなたの勝ち！" : "相手の勝ち"}</h2>
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
  const key = i => p.hand[i] === GEAR_ID ? 100 : DEF[p.hand[i]] ? effCost(ME, DEF[p.hand[i]], i) : 99;   // 歯車はいちばん右
  return p.hand.map((id, i) => i).sort((a, b) => {
    const A = p.hand[a], B = p.hand[b];
    return key(a) - key(b) || (DEF[A] && DEF[B] ? (DEF[A].type === DEF[B].type ? 0 : DEF[A].type === "char" ? -1 : 1) || DEF[A].name.localeCompare(DEF[B].name, "ja") : 0) || a - b;
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
      ${unit && unit.silenced ? `<p class="sh-text">沈黙：効果と能力をすべて失っています。</p>` : `<p class="sh-text">${esc(cardText(d))}</p>`}
      ${unit && !unit.silenced && ((unit.kws || []).length || unit.armorPlus) ? `<p class="sh-text">与えられた能力：${[...(unit.kws || []).filter(k => KEYWORDS[k]).map(k => `${KEYWORDS[k].label}（${KEYWORDS[k].text}）`), ...(unit.armorPlus ? [`装甲+${unit.armorPlus}`] : [])].join("／")}</p>` : ""}`;
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
        : r === "enemyF" ? `${esc(d.name)}の対象にする相手キャラか、上の相手の顔をタップしてください`
        : r === "any" ? `${esc(d.name)}の対象にするキャラ（自分か相手）をタップしてください`
        : `${esc(d.name)}の対象にする${r === "enemy" ? "相手" : "自分"}のキャラをタップしてください`;
    } else {
      const u = selectedUnit();
      msg = !S.players[OP].field.length ? "上の相手の顔をタップして直接攻撃"
        : guards(OP).length && u && kw(u, "pierce") ? "直撃：守護を無視して、好きな相手キャラか上の相手の顔をタップ"
        : guards(OP).length ? "守護を持つ相手キャラをタップしてください（守護がいる間は、ほかのキャラも本体も攻撃できません）"
        : "攻撃する相手キャラか、上の相手の顔をタップ";
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
        ${playable && playable.ok && gearChoice(ME, ui.sel.idx) ? `<button type="button" class="btn primary" data-act="playGear">歯車を${DEF[id].gear}枚使って出す</button><button type="button" class="btn" data-act="play">使わずに出す</button>`
          : playable ? `<button type="button" class="btn primary" data-act="play" ${playable.ok ? "" : "disabled"}>${playable.ok ? "出す" : playable.reason}</button>` : ""}
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
  if (d.type === "spell" && roles.length === 1 && ["enemy", "own"].includes(roles[0])) return { units: roleSide(ME, roles[0]), role: roles[0] };
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
      const uid = +unitEl.dataset.uid, tu = S.players[z.units].field.find(x => x.uid === uid);
      if (z.role === "enemy" && tu && !canTarget(tu)) return () => toast(hidden(tu) ? "隠密のキャラは対象に選べません" : "呪文耐性のキャラは対象に選べません");
      if (tu && !worldOK(tu, roleWorld(d, z.role))) return () => toast(`${WORLDS[roleWorld(d, z.role)]}のキャラを選んでください`);
      return () => gearChoice(ME, idx) ? beginPlay(idx) : doPlay(idx, { [z.role]: uid });
    }
    if (!fieldEl || +fieldEl.dataset.zone !== ME) return null;
    if (!chk.ok) return () => toast(chk.reason);
    // 対象（や代償）が必要なカード：場に置いたあと対象を選ぶ
    return () => beginPlay(idx);
  }
  const uid = drag.uid;
  if (unitEl && +unitEl.dataset.owner === OP) {
    const t = +unitEl.dataset.uid, tu = S.players[OP].field.find(x => x.uid === t);
    if (tu && !canAttackUnit(ME, tu, S.players[ME].field.find(x => x.uid === uid))) return () => toast(hidden(tu) ? "隠密のキャラは攻撃できません" : "守護を持つキャラを先に攻撃してください");
    return () => doAttack(uid, t);
  }
  if (plEl && +plEl.dataset.player === OP) {
    const u = S.players[ME].field.find(x => x.uid === uid);
    if (!canAttackPlayer(ME, u)) return () => toast(rushOnly(u) ? "突進：場に出たターンは、キャラにしか攻撃できません" : "守護を持つキャラがいるので、相手の本体は攻撃できません");
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
  if (sel === "cutin") { Motion.cutin(text, +cls.slice(5)); return; }
  if (sel === "draw") { Motion.draw(+text); return; }
  if (cls === "land") { Motion.land(); return; }
  if (cls === "die") { const el = document.querySelector(sel); if (el) Motion.shatter(el); return; }
  if (cls === "dmg") Sound.play(text === "破壊" ? "destroy" : sel.startsWith("[data-player") ? "face" : "hit");
  else if (cls === "trig") Sound.play("flip");
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
  if (cls === "trig") {
    // 効果の札はカードの上の縁に出す。画面の端からはみ出さないように寄せる
    const w = t.offsetWidth, vw = document.documentElement.clientWidth;
    t.style.left = Math.min(Math.max(r.left + r.width / 2, w / 2 + 6), vw - w / 2 - 6) + "px";
    t.style.top = Math.max(r.top + 4, 14) + "px";
  }
  setTimeout(() => t.remove(), cls === "trig" ? 1350 : 1000);
}

/* ---------- 画面（開始・メニュー・ルール・カード一覧・ログ・結果） ---------- */
const RULES_HTML = () => `
  <div class="rules">
    <h3>勝利条件</h3><p>相手の体力（初期${CONFIG.PLAYER_HP}）を0にすれば勝ち。</p>
    <h3>デッキ</h3><p>それぞれが自分で組んだ${CONFIG.DECK_SIZE}枚のデッキで戦います。同じカードは${CONFIG.COPY_MAX}枚まで（カードによってはそれより少ない）。山札が尽きたら、引くたびに${CONFIG.FATIGUE}ダメージ。</p>
    <h3>対戦の始め方</h3>
    <ul>
      <li>じゃんけんをして、勝った人が先攻か後攻かを選ぶ</li>
      <li>お互い${CONFIG.START_HAND}枚引く${CONFIG.SECOND_BONUS ? `（後攻は${CONFIG.START_HAND + CONFIG.SECOND_BONUS}枚）` : ""}。1回だけ、手札を全部山札に戻して引き直せる（マリガン）</li>
      ${CONFIG.SECOND_COIN ? `<li>後攻の人は「境界の欠片」を持って始まる。好きなときに使うと、そのターンだけエナジーが1増える（1回きり）</li>` : ""}
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
      <li>攻撃先は、相手のキャラか相手プレイヤー（本体）を選べる</li>
      <li>相手の場に守護を持つキャラがいる間は、守護を持つキャラしか攻撃できない（直撃を除く）</li>
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
  shop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 18.5 9 12 21.2 5.5 9z"/><path d="M5.5 9h13M12 2.8 9.2 9 12 21.2 14.8 9z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>',
  envelope: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="5.5" width="17.6" height="13" rx="1.6"/><path d="m3.8 6.5 8.2 6.3 8.2-6.3"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 1.8H4.4z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>'
};

/* ホーム：上の段（所持・アイコン・設定）→ 背景の絵を見せる空き → 対戦の2つのボタン → 下のメニュー（片手で届くように下へ寄せる） */
function showStart() {
  if (typeof Inbox !== "undefined" && Inbox.checkLogin()) return;   // 今日初めて開いたら、先にログインボーナス
  const deck = Decks.selected();
  const goldOK = Account.status !== "none" && Account.status !== "free";
  const icon = goldOK ? Account.icon() : null;
  const tickets = goldOK ? Account.tickets : 0;
  const dupes = goldOK && typeof Shop !== "undefined" ? Shop.surplus().reduce((a, x) => a + x.n, 0) : 0;
  const badge = (n, label) => n ? `<span class="navbadge" aria-label="${label}">${n > 99 ? "99+" : n}</span>` : "";
  openOverlay(`<div class="homebg" aria-hidden="true"></div>
  <div class="panel home">
    <div class="homebar">
      <div class="hb-left">${goldOK ? `${goldTag(Account.gold)}${stoneTag(Account.stones)}` : ""}</div>
      <div class="hb-me">
        ${goldOK ? `<button type="button" class="homeicon" data-act="icons" data-from="start" aria-label="アイコンを変える">
          <span class="halo" aria-hidden="true"></span><span class="hface">${icon ? iconImgHTML(icon) : `<span class="glyph">任</span>`}</span></button>` : ""}
        <button type="button" class="deckplate" data-act="decks" aria-label="使うデッキ：${esc(deck ? deck.name : "未選択")}（デッキ編成へ）">${HOME_ICON.decks}<span>${esc(deck ? deck.name : "デッキ未選択")}</span></button>
      </div>
      <div class="hb-right">
        ${goldOK ? `<button type="button" class="iconbtn" data-act="inboxMail" aria-label="メール">${HOME_ICON.envelope}${Inbox.mailBadge()}</button>` : ""}
        <button type="button" class="iconbtn" data-act="inboxNews" aria-label="お知らせ">${HOME_ICON.bell}${Inbox.newsBadge()}</button>
        <button type="button" class="iconbtn" data-act="options" aria-label="オプション">${HOME_ICON.gear}</button>
      </div>
    </div>
    <div class="homemain">
      ${Showcase.html()}
      ${Account.status === "none" ? `<p class="onl-msg">サーバーに接続できないため、スターターデッキだけで遊べます（カードやGは保存されません）。</p>` : ""}
      ${DATA_INFO.draft ? `<p class="datainfo">編集中のカードデータで試遊しています（対人戦は使えません）</p>` : ""}
    </div>
    <div class="battles">
      <button type="button" class="battlebtn cpu" data-act="solo">
        <span class="bicon">${HOME_ICON.cpu}</span><b>一人で対戦</b><small>CPU戦・世界限定戦など</small>
      </button>
      ${DATA_INFO.draft ? "" : `<button type="button" class="battlebtn online" data-act="online">
        <span class="bicon">${HOME_ICON.online}</span><b>友達と対戦</b><small>合言葉で部屋に入る</small>
      </button>`}
    </div>
    <nav class="homenav" aria-label="メニュー">
      <button type="button" class="navbtn" data-act="decks">${HOME_ICON.decks}<b>デッキ</b></button>
      <button type="button" class="navbtn" data-act="packs">${HOME_ICON.packs}<b>パック</b>${badge(tickets, `パック券${tickets}枚`)}</button>
      ${goldOK ? `<button type="button" class="navbtn" data-act="shop">${HOME_ICON.shop}<b>ショップ</b>${badge(dupes, `分解できるカード${dupes}枚`)}</button>` : ""}
      <button type="button" class="navbtn" data-act="cards">${HOME_ICON.cards}<b>カード</b></button>
    </nav>
  </div>`, "start", true);
  Showcase.start();
}

/* 歯車ボタン：ルール・アカウント・音などの事務的なもの */
/* プレイヤー名：アカウントに保存（なければこの端末に覚えた友達対戦の名前）。決めていなければ「あなた」 */
function playerName(fallback = "あなた") {
  const a = Account.data && Account.data.name;
  let l = ""; try { l = localStorage.getItem("kyokai-name") || ""; } catch {}
  return (a || l) ? (a || l).slice(0, 10) : fallback;
}
function setPlayerName(n) {
  n = String(n || "").replace(/\s+/g, " ").trim().slice(0, 10);
  try { if (n) localStorage.setItem("kyokai-name", n); } catch {}
  if (Account.data && n) { Account.data.name = n; Account.saveNow(); }
  return n;
}
function showName(msg) {
  openOverlay(`<div class="panel">
    <div class="topbar"><button type="button" class="btn sm" data-act="options">← 戻る</button><b>プレイヤー名</b></div>
    <p class="lead small">対戦で表示される名前です（10文字まで）。友達と対戦するときも、この名前が相手に見えます。</p>
    <div class="obox"><div class="ofield"><label for="pl-name">名前</label>
      <input class="otxt" id="pl-name" maxlength="10" placeholder="例：ペンペン" value="${esc(playerName(""))}" autocomplete="nickname"></div>
      <button type="button" class="btn primary" data-act="nameSave">決定</button>
      ${msg ? `<p class="callout">${esc(msg)}</p>` : ""}</div>
  </div>`, "options", true);
}
function showOptions() {
  const info = DATA_INFO.updated ? `カードデータ：v${DATA_INFO.version}（${esc(DATA_INFO.updated)} 更新）` : "";
  openOverlay(`<div class="panel">
    <div class="topbar"><button type="button" class="btn sm" data-act="optBack">← 戻る</button><b>オプション</b></div>
    <div class="optlist">
      <button type="button" class="optrow" data-act="nameEdit"><b>プレイヤー名</b><small>現在：${esc(playerName("（未設定・対戦では「あなた」）"))}</small></button>
      <button type="button" class="optrow" data-act="rules"><b>ルール</b><small>遊び方・カードの能力</small></button>
      ${DATA_INFO.draft ? "" : `<button type="button" class="optrow" data-act="serial"><b>シリアルコード</b><small>配られたコードでGやカードを受け取る</small></button>`}
      ${Account.status === "none" ? "" : `<button type="button" class="optrow" data-act="icons" data-from="options"><b>アイコン</b><small>対戦で表示される顔を、持っているキャラカードの絵から選ぶ</small></button>`}
      <button type="button" class="optrow" data-act="account"><b>アカウント</b><small>引き継ぎコードの確認・別の端末から引き継ぐ</small></button>
      ${DATA_INFO.draft ? "" : `<button type="button" class="optrow" data-act="fbOpen"><b>ご意見・感想</b><small>不具合の報告や、ほしい機能を送る</small></button>`}
      <button type="button" class="optrow" data-act="soundPanel"><b>音の設定</b><small>現在：${Sound.on ? "オン" : "オフ"}</small></button>
      <button type="button" class="optrow" data-act="fxToggle" aria-pressed="${Fx.on}"><b>カードの光の動き</b><small>現在：${Fx.on ? "オン" : "オフ（UR・レジェンドの光を止めて軽くする）"}</small></button>
    </div>
    <p class="datainfo">${info}</p>
    <p class="datainfo">ベータ版のカードやGは、正式公開のときにリセットされます。</p>
  </div>`, "options", true);
}

function showMenu() {
  const online = MODE === "online";
  openOverlay(`<div class="panel">
    <h2 class="title sm">メニュー</h2>
    ${online ? `<div class="roombox"><span>部屋の合言葉</span><b class="roomcode-inline">${esc(Online.code || "")}</b></div>` : ""}
    <button type="button" class="btn primary" data-act="closeOverlay">対戦に戻る</button>
    <div class="menu list">
      <button type="button" class="mi" data-act="log"><span>プレイログ<small>これまでの行動を見る</small></span></button>
      <button type="button" class="mi" data-act="cards"><span>カード一覧<small>すべてのカードの効果</small></span></button>
      <button type="button" class="mi" data-act="rules"><span>ルール<small>遊び方・カードの能力</small></span></button>
      ${online && S && !S.over
        ? `<button type="button" class="mi danger" data-act="surrender"><span>降参してタイトルに戻る<small>この対戦は負けになります</small></span></button>`
        : `<button type="button" class="mi" data-act="toTitle"><span>タイトルに戻る<small>この対戦は終了します</small></span></button>`}
    </div>
  </div>`, "game");
  overlayFrom = "menu";
}

function showRules() {
  openOverlay(`<div class="panel"><div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>ルール</b></div>${RULES_HTML()}
    <button type="button" class="btn primary" data-act="back">戻る</button></div>`, null, !S);
}

/* 図鑑：カードを絵で並べる（検索・絞り込み）。押すと効果。「効果も表示」で前の1行ずつの一覧にもできる */
const CL = { q: "", w: "", t: "", own: "", text: false, detail: null, ids: [] };
/* 詳細の窓の左右の矢印：開いたときの一覧（ids）の並びで、前後のカードへ移る。端まで行ったら反対の端へ回る */
function detailNavHTML(ids, cur, act) {
  const i = ids.indexOf(cur);
  if (i < 0 || ids.length < 2) return "";
  return `<button type="button" class="dm-nav prev" data-act="${act}" data-v="-1" aria-label="前のカード"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4 7 12l8 8"/></svg></button>
    <button type="button" class="dm-nav next" data-act="${act}" data-v="1" aria-label="次のカード"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l8 8-8 8"/></svg></button>
    <span class="dm-pos">${i + 1} / ${ids.length}</span>`;
}
function stepId(ids, cur, d) { const i = ids.indexOf(cur); return i < 0 ? cur : ids[(i + d + ids.length) % ids.length]; }
function showCardList() {
  const usable = CARDS.filter(c => c.limit > 0 && cardShown(c));
  const collect = ["ready", "offline"].includes(Account.status);
  const hide = c => collect && Account.owned(c.id) <= 0;
  const ownedN = usable.filter(c => Account.owned(c.id) > 0).length;
  const q = CL.q.trim();
  const list = usable.filter(c => (!CL.w || c.world === CL.w) && (!CL.t || c.type === CL.t)
      && (!CL.own || (CL.own === "y" ? Account.owned(c.id) > 0 : Account.owned(c.id) <= 0))
      && (!q || c.name.includes(q) || cardText(c).includes(q)))
    .sort((a, b) => a.cost - b.cost || (a.type > b.type ? 1 : -1) || a.name.localeCompare(b.name, "ja"));
  const chip = (k, v, label) => `<button type="button" data-act="clFilter" data-k="${k}" data-v="${v}" aria-pressed="${CL[k] === v}">${label}</button>`;
  const ownTxt = c => Account.status === "free" ? "" : `所持${Account.owned(c.id)}`;
  const grid = `<div class="dgrid cl-grid">${list.map(c => `<button type="button" class="dtile ${hide(c) ? "unowned" : ""}" data-act="clDetail" data-id="${esc(c.id)}" aria-label="${esc(c.name)}">
      ${cardHTML(c, { static: true, hidden: hide(c) })}<span class="dmeta"><span class="obadge">${ownTxt(c)}</span></span></button>`).join("")}</div>`;
  const rows = `<div class="clist">${list.map(c => `
      <div class="citem ${hide(c) ? "unowned" : ""}">
        ${cardHTML(c, { static: true, hidden: hide(c) })}
        <div class="cbody">
          <div class="chead"><span class="cname">${esc(c.name)}</span><span class="ccount">${ownTxt(c)}</span></div>
          <div class="cmeta">${WORLDS[c.world]} ・ ${RARITY[c.rarity]} ・ コスト${c.cost}${c.type === "char" ? ` ・ 攻撃${c.atk} ／ 体力${c.hp}` : ""}</div>
          <div class="ctext">${esc(cardText(c))}</div>
        </div>
      </div>`).join("")}</div>`;
  const d = CL.detail && DEF[CL.detail];
  const o = $("#overlay"), y = o.hidden ? 0 : o.scrollTop, keep = !o.hidden && o.querySelector(".cl-tools");
  openOverlay(`<div class="panel wide">
    <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>カード一覧</b></div>
    <div class="totals"><span>${collect ? `集めたカード <b>${ownedN}</b> / ${usable.length}種` : `全<b>${usable.length}</b>種`}</span><span>デッキ${CONFIG.DECK_SIZE}枚・同じカードは${CONFIG.COPY_MAX}枚まで</span></div>
    <div class="cl-tools">
      <input class="otxt" id="cl-q" type="search" placeholder="名前や効果で探す（例：守護、ドロー）" value="${esc(CL.q)}" autocomplete="off">
      <div class="seg wide">${chip("w", "", "全世界")}${chip("w", "myth", "神話")}${chip("w", "fan", "幻想")}${chip("w", "mech", "機械")}</div>
      <div class="seg wide">${chip("t", "", "全種類")}${chip("t", "char", "キャラ")}${chip("t", "spell", "魔法")}${collect ? chip("own", "", "すべて") + chip("own", "y", "所持") + chip("own", "n", "未所持") : ""}</div>
      <label class="cl-text"><input type="checkbox" data-act="clText" ${CL.text ? "checked" : ""}> 効果も一覧で表示</label>
    </div>
    <p class="hint">${list.length}種 ・ ${CL.text ? "" : "カードを押すと効果を見られます"}</p>
    ${list.length ? (CL.text ? rows : grid) : `<p class="callout">条件に合うカードがありません。</p>`}
    ${d ? `<div class="dmodal" data-act="clClose"><div class="dmodal-in" role="dialog" aria-label="${esc(d.name)}" data-act="noop">
      ${detailNavHTML(CL.ids, d.id, "clStep")}
      <div class="dmodal-card">${cardHTML(d, { static: true, hidden: hide(d) })}</div>
      <div class="dmodal-body"><b class="dm-name">${esc(d.name)}</b>
        <span class="pmeta">${RARITY[d.rarity]} ・ ${WORLDS[d.world]} ・ ${TYPES[d.type]} ・ コスト${d.cost}${d.type === "char" ? ` ・ ${d.atk}/${d.hp}` : ""}</span>
        <p class="dm-text">${esc(cardText(d))}</p>
        <span class="pmeta">${Account.status === "free" ? "" : `所持 ${Account.owned(d.id)}枚 ・ `}1デッキに${cardLimit(d, CONFIG)}枚まで</span>
        ${d.boss ? `<span class="boss-only">ボス限定：隠しボスを倒すと手に入る</span>` : ""}
        ${typeof Shop !== "undefined" && !S ? Shop.tradeHTML(d) : ""}
        <button type="button" class="btn" data-act="clClose">閉じる</button></div></div></div>` : ""}
  </div>`, null, !S);
  if (keep) o.scrollTop = y;
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

/* 勝ったときのG（1試合につき1回だけ）。CPU戦は強さごとの連勝ボーナスを足す */
const rewarded = {};
function giveReward(res) {
  if (!S) return { g: 0 };
  if (rewarded[S.gid]) return rewarded[S.gid];
  const r = { g: 0, bonus: 0, wins: 0, prev: 0, cpu: false, sample: false };
  // サンプルデッキで戦った試合は、Gも連勝もなし（全カードを試すための機能なので）
  r.sample = MODE === "online" ? !!(typeof Online !== "undefined" && Online.mySample) : !!S.mySample;
  const counts = Account.status !== "free" && Account.status !== "none" && !r.sample;
  const B = MODE === "cpu" && S.battle ? S.battle : null;   // 一人で対戦の設定（startBattle）
  const streak = MODE === "cpu" && (!B || B.streak);
  if (streak && counts) {
    Object.assign(r, Account.streakEnd(CPU_LEVEL, res === "win"), { cpu: true });
  }
  if (res === "win" && counts) {
    const base = MODE === "online" ? CONFIG.REWARD_ONLINE
      : B && B.reward != null ? B.reward
      : CONFIG[REWARD_KEY[CPU_LEVEL]] || 0;
    r.bonus = r.cpu ? Account.streakBonus(r.wins) : 0;
    r.g = Math.round(base * (100 + r.bonus) / 100);
  }
  // 隠しボス：上級に勝つたびに、次の上級戦でボスが出るかを決める（天井つき）。ボスに勝つと報酬
  if (counts && B) {
    if (B.kind === "cpu" && CPU_LEVEL === "hard" && res === "win" && !Account.data.bossNext) {
      const pity = (Account.data.bossPity || 0) + 1;
      if (pity >= (CONFIG.BOSS_PITY || 20) || Math.random() * 100 < (CONFIG.BOSS_RATE || 0)) { Account.data.bossNext = true; Account.data.bossPity = 0; r.bossSign = true; }
      else Account.data.bossPity = pity;
    }
    if (B.kind === "boss" && res === "win") r.boss = bossReward();
    if (B.kind === "gate" && res === "win") r.gate = gateReward();
  }
  if (r.g) Account.addGold(r.g);       // 連勝数も一緒に保存される
  else if (counts) Account.saveNow();   // 負け：連勝が0になったこと・ボスの天井などを保存
  rewarded[S.gid] = r;   // 勝ち負けの音は決着の演出（Finale）で鳴らす
  return r;
}

/* 結果画面の連勝の表示 */
function streakHTML(r, res) {
  if (!r.cpu) return "";
  if (res === "win") {
    const next = Account.streakBonus(r.wins + 1);
    const now = r.wins >= 2 ? `${r.wins}連勝！${r.bonus ? `ボーナス +${r.bonus}%` : ""}` : "連勝スタート";
    const tail = next > r.bonus ? `次も勝てば +${next}%` : next ? `ボーナスは最大の +${next}%` : "";
    const n = Math.min(r.wins, 10);
    const flames = Array.from({ length: n }, (_, i) => `<i class="flame" style="--i:${i}"></i>`).join("") + (r.wins > 10 ? `<em>+${r.wins - 10}</em>` : "");
    return `<div class="streak res-streak"><span class="flames" aria-hidden="true">${flames}</span><b>${now}</b>${tail ? `<small>${tail}</small>` : ""}</div>`;
  }
  return r.prev >= 2 ? `<p class="streak lost">${r.prev}連勝で途切れました</p>` : "";
}

function showResult(res) {
  if (!res) return;
  const online = MODE === "online";
  const r = giveReward(res), g = r.g;
  const en = { win: "VICTORY", lose: "DEFEAT", draw: "DRAW" }[res], ja = { win: "勝利", lose: "敗北", draw: "引き分け" }[res];
  const B = S && S.battle;
  const notes = [
    B && B.kind === "world" && !r.sample ? "世界限定戦（連勝ボーナスはありません）" : "",
    S && S.practice ? "練習対戦なので、Gと連勝はつきません" : r.sample && res === "win" ? "サンプルデッキの対戦なので、Gはもらえません" : ""
  ].filter(Boolean);
  // 次にすること：大きいボタン1つ＋小さいボタン
  const again = online
    ? (Online.role === "host" ? `<button type="button" class="btn primary res-main" data-act="rematch">同じ相手ともう一度</button>` : `<p class="datainfo">もう一度対戦するときは、部屋を作った人が「同じ相手ともう一度」を押します</p>`)
    : B && B.kind === "gate" ? (r.gate ? "" : `<button type="button" class="btn primary res-main" data-act="cpuAgain">もう一度挑む</button>`)
    : `<button type="button" class="btn primary res-main" data-act="cpuAgain">同じ強さでもう一度</button>`;
  const sub = [
    !online && !(B && B.kind === "gate" && r.gate) ? `<button type="button" class="res-sub" data-act="cpuReselect">${RES_IC.again}<span>${B && ["world", "gate"].includes(B.kind) ? "選び直す" : "強さを選ぶ"}</span></button>` : "",
    `<button type="button" class="res-sub" data-act="log">${RES_IC.log}<span>ログ</span></button>`,
    `<button type="button" class="res-sub" data-act="closeOverlay">${RES_IC.board}<span>盤面</span></button>`,
    `<button type="button" class="res-sub" data-act="toTitle">${RES_IC.home}<span>${online ? "部屋を出る" : "タイトル"}</span></button>`
  ].join("");
  openOverlay(`<div class="panel res-panel res-${res}">
    <div class="res-head"><span class="res-en">${en}</span><b class="res-ja">${ja}</b></div>
    ${g ? `<div class="res-reward">${curIcon("gold", "res-coin")}<b class="res-g" data-to="${g}">+0</b><span class="res-gl">G</span><small>所持 ${Account.gold.toLocaleString()}G</small></div>` : ""}
    ${streakHTML(r, res)}
    ${r.boss ? bossRewardHTML(r.boss) : ""}
    ${r.gate ? `<div class="gate-open"><b>「${esc(r.gate.name)}」が開放されました！</b><small>ショップに並びました。このパックのカードもカード一覧に出ます</small></div>` : ""}
    ${r.bossSign ? `<p class="boss-sign">……境界が、揺らいでいる。<small>次の上級戦で、何かが起こるかもしれない</small></p>` : ""}
    ${notes.map(t => `<p class="streak lost">${t}</p>`).join("")}
    <div class="res-acts">${again}<div class="res-subs">${sub}</div></div>
  </div>`, "result");
  // G を 0 から数え上げる
  const el = document.querySelector(".res-g");
  if (el) {
    const to = +el.dataset.to, t0 = performance.now(), dur = Motion.reduced ? 1 : 900;
    const step = t => { const k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (!el.isConnected) return; el.textContent = "+" + v.toLocaleString(); if (k < 1) requestAnimationFrame(step); else el.classList.add("done"); };
    requestAnimationFrame(step);
    Sound.play("rare", 1);
  }
}
const RES_IC = {
  again: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 3v4h-4M6 21v-4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  log: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 11h7M9 15h7M9 7h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  board: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M9 5v14M15 5v14" stroke="currentColor" stroke-width="1.6"/></svg>`,
  home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`
};

function toTitle() {
  if (MODE === "online") Online.leave();
  // CPU戦：決着していれば報酬と連勝を確定。途中でやめたら連勝は途切れる
  if (MODE === "cpu" && S && S.over) giveReward(myResult());
  else if (MODE === "cpu" && S && !S.mySample) Account.streakAbandon();
  MODE = "cpu"; setPerspective(0);
  S = null; busy = false; ui = { sel: null, mode: null };
  Motion.reset();
  Finale.reset();
  if (typeof Cinema !== "undefined") Cinema.reset();
  clearTimeout(resultTimer);
  app.innerHTML = ""; app.classList.remove("battle", "pre");
  $("#sheet").hidden = true;
  hidePreview();
  showStart();
}

/* 強さ選択に出す「◯連勝中」 */
function streakTag(level) {
  const w = Account.streak(level);
  if (!w) return "";
  const next = Account.streakBonus(w + 1);
  return `<span class="lvl-streak">${w}連勝中${next ? `・次は+${next}%` : ""}</span>`;
}

function showCpuSelect() {
  if (!Decks.readyDeck(msg => Decks.showList(msg))) return;
  const deck = Decks.selected(), key = Decks.keyCard(deck);
  // 強さごとの見本の絵：その強さの CPU デッキの代表カード
  // 強さごとの見本の絵（オーナー指定：初級＝見習い剣士・中級＝戦神の化身・上級＝審判の熾天使）
  const FACE = { easy: "squire", normal: "wargod", hard: "n-seraph", ex: "f2-tamamo" };
  const face = lv => { const c = DEF[FACE[lv]]; return c && c.art ? c.art : ""; };
  const stars = { easy: 1, normal: 2, hard: 3, ex: 3 };
  openOverlay(`<div class="panel">
    ${Decks.topbar("CPU戦", "solo")}
    <div class="cs-deck">
      <span class="cs-deck-art" ${key ? `style="background-image:url('${esc(key.art)}')"` : ""}></span>
      <span class="cs-deck-txt"><small>使うデッキ</small><b>${esc(deck.name)}</b></span>
      <button type="button" class="btn sm" data-act="decks">変更</button>
    </div>
    ${deck.free && Decks.sampleOK() && CONFIG.SAMPLE_CPU ? `<p class="callout warn"><b>サンプルデッキです</b>勝ってもGはもらえず、連勝や隠しボスにも数えません（ベータの間だけ CPU戦でも使えます）。</p>` : ""}
    ${deck.free && Decks.sampleOK() && !CONFIG.SAMPLE_CPU ? `<p class="callout warn"><b>サンプルデッキは CPU戦で使えません</b>サンプルデッキが使えるのは、練習対戦と友達との対戦だけです。「変更」から、自分のカードで組んだデッキを選んでください。</p>` : ""}
    <div class="lvls ${deck.free && Decks.sampleOK() && !CONFIG.SAMPLE_CPU ? "lvls-off" : ""}">${cpuLevels(true).map(([k, v]) => `
      <button type="button" class="lvl lvl-${k}" data-act="cpuLevel" data-v="${k}" ${deck.free && Decks.sampleOK() && !CONFIG.SAMPLE_CPU ? "disabled" : ""}>
        <span class="lvl-art" ${face(k) ? `style="background-image:url('${esc(face(k))}')"` : ""}></span>
        <span class="lvl-body">
          <span class="lvl-head"><b>${v.label}</b><i class="lvl-stars" aria-label="難しさ${stars[k]}">${"★".repeat(stars[k])}<s>${"★".repeat(3 - stars[k])}</s></i></span>
          <span class="lvl-desc">${v.desc}</span>
          <span class="lvl-foot"><em class="lvl-g">勝利で <b>${CONFIG[REWARD_KEY[k]]}</b>G</em>${streakTag(k)}</span>
        </span>
        <span class="lvl-go" aria-hidden="true">›</span>
      </button>`).join("")}</div>
    <div class="callout"><b>報酬のきまり</b>負けたときは0Gです。${CONFIG.STREAK_STEP && CONFIG.STREAK_MAX ? `同じ強さで連勝すると、2連勝目から報酬が${CONFIG.STREAK_STEP}%ずつ増えます（最大${CONFIG.STREAK_MAX}%）。負けるか、途中でやめると0に戻ります。` : ""}${Account.status === "free" || Account.status === "none" ? "（今の状態では、Gは保存されません）" : ""}</div>
  </div>`, "start", true);
}

/* 練習対戦：CPU に使わせるデッキ（自分のデッキ・サンプルデッキ・CPU用のデッキ）と強さを選ぶ。報酬・連勝なし */
const PRACTICE = { deck: null, level: "normal" };
function showPractice() {
  if (!Decks.readyDeck(msg => Decks.showList(msg))) return;
  const mine = Decks.mine().filter(d => !Decks.problems(d).length);
  const cpu = PRESETS.filter(p => !hiddenDeck(p) && !deckProblems(p, DEF, CONFIG).length);
  if (!PRACTICE.deck || ![...mine, ...cpu].some(d => d.id === PRACTICE.deck)) PRACTICE.deck = (mine[0] || cpu[0] || {}).id;
  const row = (d, tag) => { const k = Decks.keyCard(d);
    return `<button type="button" class="pr-deck ${PRACTICE.deck === d.id ? "on" : ""}" data-act="prDeck" data-id="${esc(d.id)}">
      <span class="cs-deck-art" ${k ? `style="background-image:url('${esc(k.art)}')"` : ""}></span>
      <span class="cs-deck-txt"><small>${tag}</small><b>${esc(d.name)}</b></span>${PRACTICE.deck === d.id ? `<span class="usingtag">CPU が使う</span>` : ""}</button>`; };
  const lv = cpuLevels(false).map(([k, v]) => `<button type="button" data-act="prLevel" data-v="${k}" aria-pressed="${PRACTICE.level === k}">${v.label}</button>`).join("");
  openOverlay(`<div class="panel">
    ${Decks.topbar("練習対戦", "solo")}
    <p class="lead small">CPU に使わせるデッキと、CPU の強さを選んでください。あなたは「${esc(Decks.selected().name)}」で戦います。練習なので、Gと連勝はつきません。</p>
    <h3 class="sec">CPU の強さ</h3>
    <div class="seg wide">${lv}</div>
    <h3 class="sec">CPU に使わせるデッキ</h3>
    <div class="pr-list">${mine.map(d => row(d, d.free ? "サンプルデッキ" : "あなたのデッキ")).join("") || `<p class="hint">使えるデッキがありません。</p>`}</div>
    <details class="pr-more"><summary>CPU 用のデッキから選ぶ</summary><div class="pr-list">${cpu.map(d => row(d, `${CPU_LEVELS[d.level] ? CPU_LEVELS[d.level].label : ""}CPU用`)).join("")}</div></details>
    <button type="button" class="btn primary" data-act="prStart" ${PRACTICE.deck ? "" : "disabled"}>練習対戦をはじめる</button>
  </div>`, "start", true);
}
function startPractice() {
  const mine = Decks.readyDeck(msg => Decks.showList(msg));
  if (!mine) return;
  const d = Decks.mine().find(x => x.id === PRACTICE.deck) || PRESETS.find(x => x.id === PRACTICE.deck);
  if (!d) return showPractice();
  // 練習：報酬・連勝の対象外（サンプルデッキと同じ扱い）
  startBattle({ kind: "practice", level: PRACTICE.level, mine, opp: d, oppName: `練習CPU（${(CPU_LEVELS[PRACTICE.level] || CPU_LEVELS.normal).label}）`, practice: true, streak: false });
}

function startCpuGame(level) {
  const mine = Decks.readyDeck(msg => Decks.showList(msg));
  if (!mine) return;
  if (mine.sample && !CONFIG.SAMPLE_CPU) { toast("サンプルデッキは CPU戦では使えません（練習対戦と友達との対戦だけ）"); return showCpuSelect(); }
  const lv = CPU_LEVELS[level] && (level !== "ex" || exOpen()) ? level : "normal";
  if (lv === "hard" && Account.data && Account.data.bossNext && !mine.sample && ["ready", "offline"].includes(Account.status)) return startBossGame(mine);
  const cpu = Decks.randomPreset(lv);
  if (!cpu) return Decks.showList("CPU用のサンプルデッキがありません");
  startBattle({ kind: "cpu", level: lv, mine, opp: cpu, streak: true });
}

/* ---------- 一人で対戦の共通の土台 ----------
   対戦の設定を1つにまとめて始める。spec：
     kind    … "cpu" | "world" | "practice"（あとで "unlock"（パック開放戦）・"boss"・"tutorial" を足す）
     level   … CPU の強さ（easy / normal / hard）
     mine    … 自分のデッキ（Decks.readyDeck の形）、opp … 相手のデッキ { name, cards }
     oppName … 相手の名前（省略すると「CPU（強さ）」）
     reward  … 勝ったときの G（省略すると強さごとの報酬）、streak … 連勝に数えるか
     practice… 報酬・連勝なしの練習
     setup(S)… 対戦を作った直後に呼ぶ（体力を変える・最初から場に出すなど、ボスやチュートリアル用） */
function startBattle(spec) {
  CPU_LEVEL = CPU_LEVELS[spec.level] ? spec.level : "normal";
  MODE = "cpu"; setPerspective(0);
  $("#overlay").hidden = true;
  newGame([playerName(), spec.oppName || `CPU（${CPU_LEVELS[CPU_LEVEL].label}）`], [spec.mine, { name: spec.opp.name, cards: { ...spec.opp.cards }, ...(spec.opp.icon ? { icon: spec.opp.icon } : {}) }]);
  S.battle = { kind: spec.kind, level: CPU_LEVEL, ...(spec.reward != null ? { reward: spec.reward } : {}), streak: !!spec.streak, ...(spec.extra || {}) };
  if (spec.practice) { S.practice = true; S.mySample = true; }
  else S.mySample = !!spec.mine.sample;
  // サンプルデッキの試合は連勝に数えない（伸びも途切れもしない）
  if (spec.streak && !S.mySample) Account.streakStart(CPU_LEVEL);
  if (spec.setup) spec.setup(S);
}
/* 結果画面の「もう一度」「選び直す」 */
function battleAgain() {
  const k = S && S.battle ? S.battle.kind : (S && S.practice ? "practice" : "cpu");
  if (k === "practice") startPractice();
  else if (k === "world") startWorldGame(CPU_LEVEL);
  else if (k === "gate") { if (gatePacks().some(p => p.id === GATE.pack)) startGateGame(); else showGate(); }
  else startCpuGame(k === "boss" ? "hard" : CPU_LEVEL);
}

/* ---------- 隠しボス ----------
   上級に勝つと BOSS_RATE% で（BOSS_PITY 回勝てば必ず）、次の上級戦にボスが乱入する。
   ボス：体力 BOSS_HP、最初から「境界の裂け目」が場にいる。勝つと SR以上確定パック券1枚＋ボス限定レジェンド1枚（3枚そろったら魔石） */
const BOSS = { deck: "boss-nezal", name: "虚ろなる境界王ネザル", rift: "b-rift", face: "b-nezal" };
function startBossGame(mine) {
  const deck = PRESETS.find(p => p.id === BOSS.deck);
  if (!deck) { Account.data.bossNext = false; return startCpuGame("hard"); }
  Account.data.bossNext = false; Account.saveNow();   // 会ったら消える（途中でやめても、もう一度は出ない）
  bossIntro(() => startBattle({ kind: "boss", level: "hard", mine, opp: { ...deck, icon: BOSS.face }, oppName: BOSS.name, reward: CONFIG.REWARD_HARD, streak: false,
    setup: S => {
      const b = S.players[1];
      b.hp = CONFIG.BOSS_HP || 25; b.maxHp = b.hp;
      if (DEF[BOSS.rift]) { const u = addUnit(1, BOSS.rift); u.ready = false; }
    } }));
}
/* 乱入の演出（約5秒・タップで飛ばせる）
   1. 上下に警告の帯が走り、画面のふちが心臓の鼓動のように赤く脈打つ
   2. 右上から左下へ、画面の端から端まで光の亀裂が走る
   3. 白く光って画面が揺れ、亀裂にそって世界が2つにずれて割れる。割れ目の奥（虚ろ）からボスの顔
   4. 「境界が裂ける──」と、ボスの名前（ノイズのように揺れる）
   5. 最後に2つの世界が画面の外まで割れて、ボスの全体が見える */
function bossIntro(done) {
  const v = document.createElement("div");
  v.className = "bossin"; v.setAttribute("role", "alert");
  const face = DEF[BOSS.face] && DEF[BOSS.face].art;
  const w = innerWidth, h = innerHeight;
  const ang = -Math.atan2(h, w) * 180 / Math.PI;            // 右上→左下の対角線の角度
  const nx = h / Math.hypot(w, h), ny = w / Math.hypot(w, h); // 対角線に垂直な向き（右下向き）
  const gap = Math.min(w, h) * 0.11;
  v.style.cssText = `--ang:${ang}deg;--dx:${nx * gap}px;--dy:${ny * gap}px;--diag:${Math.hypot(w, h) + 40}px`;
  const tape = `<span>${"WARNING ▲ 境界干渉 ▲ ".repeat(8)}</span>`;
  v.innerHTML = `
    <div class="bi-void">${face ? `<div class="bi-face" style="background-image:url('${esc(face)}')"></div><div class="bi-face full" style="background-image:url('${esc(face)}')"></div>` : ""}</div>
    <div class="bi-half a"></div><div class="bi-half b"></div>
    <div class="bi-crack"></div><div class="bi-edge a"></div><div class="bi-edge b"></div>
    <div class="bi-flash"></div>
    <div class="bi-pulse"></div>
    <div class="bi-tape top">${tape}</div><div class="bi-tape bottom">${tape}</div>
    <div class="bi-text">
      <p class="bi-warn">WARNING</p>
      <p class="bi-t">境界が裂ける──</p>
      <p class="bi-n" data-t="${esc(BOSS.name)}">${esc(BOSS.name)}</p>
      <p class="bi-s">が乱入した！</p>
    </div>
    <small class="bi-skip">タップで進む</small>`;
  let fin = false;
  const go = () => { if (fin) return; fin = true; v.classList.add("out"); setTimeout(() => { v.remove(); done(); }, 260); };
  v.addEventListener("click", go);
  document.body.appendChild(v);
  if (typeof Sound !== "undefined") { try { Sound.play("lose"); } catch (e) {} }
  if (navigator.vibrate) { try { navigator.vibrate([60, 120, 60, 500, 200]); } catch (e) {} }
  setTimeout(go, 5200);
}
function bossReward() {
  Account.data.srTickets = Account.srTickets + 1;
  const legends = CARDS.filter(c => c.boss && c.limit > 0);
  const want = legends.filter(c => Account.owned(c.id) < (CONFIG.COPY_MAX || 3));
  if (want.length) {
    const c = want[Math.floor(Math.random() * want.length)];
    Account.addCards([c.id]);
    return { card: c.id };
  }
  const st = CONFIG.STONE_GET_LEGEND || 0;
  Account.data.stones = Account.stones + st;
  return { stones: st };
}
function bossRewardHTML(b) {
  const c = b.card && DEF[b.card];
  return `<div class="boss-reward">
    <p class="boss-win">境界王を退けた！</p>
    <p>SR以上確定パック券 ×1（パックの画面で使えます）</p>
    ${c ? `<div class="boss-card">${cardHTML(c, { static: true })}</div><p>ボス限定レジェンド「${esc(c.name)}」を手に入れた！</p>`
      : `<p>ボス限定レジェンドはすべて3枚そろっているので、代わりに魔石 ${b.stones} 個</p>`}
  </div>`;
}
function battleReselect() {
  const k = S && S.battle ? S.battle.kind : "cpu";
  overlayFrom = "start";
  if (k === "practice") showPractice(); else if (k === "world") showWorldSelect(); else if (k === "gate") showGatePack(); else showCpuSelect();
}

/* ---------- 一人で対戦：モードを選ぶ画面 ---------- */
function showSolo() {
  const tile = (act, title, desc, opts = {}) => `<button type="button" class="lvl lvl-mode ${opts.cls || ""}" data-act="${act}" ${opts.off ? "disabled" : ""}>
      ${opts.art ? `<span class="lvl-art" style="background-image:url('${esc(opts.art)}')"></span>` : ""}
      <span class="lvl-body"><span class="lvl-head"><b>${title}</b>${opts.tag ? `<small class="ptag">${opts.tag}</small>` : ""}</span><span class="lvl-desc">${desc}</span></span>
      <span class="lvl-go" aria-hidden="true">${opts.off ? "" : "›"}</span></button>`;
  const art = id => (DEF[id] && DEF[id].art) || "";
  openOverlay(`<div class="panel">
    ${Decks.topbar("一人で対戦", "back")}
    <div class="lvls">
      ${tile("start", "CPU戦", "初級・中級・上級の CPU と戦う。勝つとGがもらえる", { art: art("wargod"), cls: "m-cpu" })}
      ${tile("worldMode", "世界限定戦", "限定構築（30枚すべて同じ世界のカード）のデッキ同士で戦う。勝つとGがもらえる", { off: !WORLD_MODE_OPEN, tag: WORLD_MODE_OPEN ? "" : "準備中", art: WORLD_MODE_OPEN ? art("x-gigas") || art("omega") : "", cls: WORLD_MODE_OPEN ? "m-world" : "m-off" })}
      ${tile("practice", "練習対戦", "自分で作ったデッキを CPU に使わせて戦う（Gと連勝はなし）", { cls: "m-prac" })}
      ${tile("noop", "チュートリアル", "遊び方を、実際に対戦しながら覚える", { off: true, tag: "準備中", cls: "m-off" })}
      ${(() => { const g = gatePacks(), all = gatePacks(true);
        return tile("gate", "パック開放戦", "パックごとに決められたルールのもとで勝つと、新しいパックが開く",
          { off: !g.length, tag: !all.length ? "第2弾から" : !g.length ? "すべて開放ずみ" : `あと${g.length}つ`, cls: g.length ? "m-gate" : "m-off", art: g.length ? gateArt(g[0]) : "" }); })()}
    </div>
  </div>`, "start", true);
}

/* ---------- パック開放戦：第1弾以外のパックは、開放戦に勝つとショップに並ぶ ----------
   第1弾を集めずに新しいパックから集める人を避けるため。サンプルデッキでは挑めない。
   開放はパックの弾ごと（第2弾は 2-1・2-2・2-3 の3つ）。ルールはパックごとに決める（GATE_RULES：今は世界限定・制限なし）。
   相手：カード工房のパックで決めた CPU デッキ（gateDeck・gateLevel）。決めていなければ自動 */
const GATE = { pack: null, deck: null };
const gateOpened = p => !!(Account.data && (Account.data.opened || []).includes(p.set));
/* 開放戦のあるパック（all=true なら開放ずみも含む） */
/* オーナーの試し用：アドレスの末尾に ?gatetest を付けると、販売前のパックの開放戦にも挑める。
   試しでは勝っても開放しない（自分のアカウントに第2弾が開かないように）。何度でも挑める */
const GATE_TEST = /[?&]gatetest\b/.test(location.search);
function gatePacks(all) {
  return PACKS.filter(p => (p.open || GATE_TEST) && p.set && p.set !== "1" && (all || GATE_TEST || !gateOpened(p)));
}
function gateArt(p) {
  const c = (p.cards || []).map(id => DEF[id]).filter(c => c && c.art && ["legend", "ur"].includes(c.rarity))[0];
  return c ? c.art : "";
}
const gateRule = p => GATE_RULES[p.gateRule] || GATE_RULES.world;
function gateDecks(p) {
  return Decks.mine().filter(d => !d.free && !Decks.problems(d).length && gateRule(p).deckOK(p, d));
}
function gateOpponent(p) {
  const ok = d => d && d.level !== "test" && d.level !== "boss" && !deckProblems(d, DEF, CONFIG).length;
  const fixed = PRESETS.find(d => d.id === p.gateDeck);
  if (ok(fixed)) return fixed;
  const pool = PRESETS.filter(d => ok(d) && (gateRule(p) !== GATE_RULES.world || deckWorld(d) === p.gateWorld));
  return pool.find(d => d.level === "gate") || pool.find(d => d.level === "hard") || pool[0] || PRESETS.find(d => ok(d) && d.level === "hard") || null;
}
/* 1つめの画面：どのパックの開放戦に挑むか */
function showGate() {
  const all = gatePacks(true);
  const row = x => { const done = gateOpened(x) && !GATE_TEST, art = gateArt(x);
    return `<button type="button" class="pr-deck gate-row ${done ? "done" : ""}" data-act="gatePack" data-id="${esc(x.id)}" ${done ? "disabled" : ""}>
      <span class="cs-deck-art" ${art ? `style="background-image:url('${esc(art)}')"` : ""}></span>
      <span class="cs-deck-txt"><small>${esc(setName(x.set))}・${gateRule(x).label}${x.gateRule !== "free" && x.gateWorld ? `（${WORLDS[x.gateWorld]}）` : ""}</small><b>${esc(x.name)}</b></span>
      ${done ? `<span class="usingtag done">開放ずみ</span>` : `<span class="lvl-go" aria-hidden="true">›</span>`}</button>`; };
  openOverlay(`<div class="panel">
    ${Decks.topbar("パック開放戦", "solo")}
    ${GATE_TEST ? `<p class="callout">試しモード（?gatetest）：販売前のパックにも挑めます。勝っても開放はされません。CPU戦の超級も出ます。</p>` : ""}
    <p class="lead small">新しいパックは、そのパックの開放戦に勝つとショップに並びます。それまでは、そのパックのカードはカード一覧にも出ず、交換もできません。</p>
    ${all.length ? `<h3 class="sec">挑むパックを選ぶ</h3><div class="pr-list">${all.map(row).join("")}</div>` : `<p class="callout">開放戦のあるパックは、まだありません。</p>`}
  </div>`, "start", true);
}
/* 2つめの画面：ルールの説明・デッキを選ぶ・挑む */
function showGatePack() {
  const p = gatePacks().find(x => x.id === GATE.pack);
  if (!p) return showGate();
  const decks = gateDecks(p);
  if (!decks.some(d => d.id === GATE.deck)) GATE.deck = (decks[0] || {}).id || null;
  const lv = p.gateLevel || "hard", rule = gateRule(p);
  const deckRow = d => { const k = Decks.keyCard(d), w = deckWorld(d);
    return `<button type="button" class="pr-deck ${GATE.deck === d.id ? "on" : ""}" data-act="gateDeck" data-id="${esc(d.id)}">
      <span class="cs-deck-art" ${k ? `style="background-image:url('${esc(k.art)}')"` : ""}></span>
      <span class="cs-deck-txt">${w ? `<small class="wtag w-${w}">${WORLDS[w]}だけ</small>` : `<small>いろいろな世界</small>`}<b>${esc(d.name)}</b></span>${GATE.deck === d.id ? `<span class="usingtag">使う</span>` : ""}</button>`; };
  const art = gateArt(p);
  openOverlay(`<div class="panel">
    ${Decks.topbar("パック開放戦", "gateBack")}
    <div class="gate-head" ${art ? `style="--gart:url('${esc(art)}')"` : ""}><small>${esc(setName(p.set))}</small><b>${esc(p.name)}</b></div>
    <div class="gate-rule">
      <p class="gr-common">パック開放戦は、パックごとに決められたルールのもとで戦います。</p>
      <p class="gr-this"><span>今回のルール：${esc(rule.label)}</span>${esc(rule.text(p))}</p>
      <p class="gr-misc">サンプルデッキでは挑めません。相手は CPU（${CPU_LEVELS[lv].label}）。勝つとパックが開き、Gももらえます（${CONFIG[REWARD_KEY[lv]]}G）。負けても何度でも挑めます。</p>
    </div>
    <h3 class="sec">使うデッキ</h3>
    ${decks.length ? `<div class="pr-list">${decks.map(deckRow).join("")}</div>`
      : `<p class="callout warn"><b>ルールに合うデッキがありません</b>${esc(rule.text(p))}デッキ編成で作ってください（限定構築でも、ふつうのデッキでも構いません）。</p>
         <button type="button" class="btn" data-act="decks">デッキ編成へ</button>`}
    <button type="button" class="btn primary" data-act="gateGo" ${decks.length ? "" : "disabled"}>開放戦に挑む</button>
  </div>`, "start", true);
}
function startGateGame() {
  const p = gatePacks().find(x => x.id === GATE.pack);
  const d = p && gateDecks(p).find(x => x.id === GATE.deck);
  if (!p || !d) return showGatePack();
  const opp = gateOpponent(p);
  if (!opp) { toast("開放戦の相手のデッキが見つかりません"); return showGatePack(); }
  const icon = Account.icon();
  const lv = p.gateLevel || "hard";
  startBattle({ kind: "gate", level: lv, mine: { name: d.name, cards: { ...d.cards }, ...(icon ? { icon } : {}) }, opp,
    oppName: "開放戦の番人", streak: false, extra: { pack: p.id, key: p.set } });
}
/* 開放戦に勝ったら、そのパックの弾を開く（結果画面で1回だけ呼ばれる） */
function gateReward() {
  const B = S && S.battle; if (!B || !B.key) return null;
  if (GATE_TEST) { toast("試しモードなので、パックは開放しません"); return null; }
  const o = Account.data.opened || (Account.data.opened = []);
  if (!o.includes(B.key)) o.push(B.key);
  const p = PACKS.find(x => x.id === B.pack);
  return { name: p ? p.name : "新しいパック" };
}

/* ---------- 世界限定戦：30枚すべて同じ世界のデッキ同士で戦う ----------
   CPU 用の世界限定デッキをオーナーが作るまでは、入口を閉じておく（中身はできている） */
const WORLD_MODE_OPEN = false;
const WORLDB = { deck: null };
function worldDecks() {
  return Decks.mine().filter(d => Decks.isWorld(d) && !Decks.problems(d).length);
}
function showWorldSelect() {
  const list = worldDecks();
  if (!list.some(d => d.id === WORLDB.deck)) {
    const sel = Decks.selected();
    WORLDB.deck = (sel && list.some(d => d.id === sel.id) ? sel : list[0] || {}).id || null;
  }
  const row = d => { const k = Decks.keyCard(d), w = deckWorld(d);
    return `<button type="button" class="pr-deck ${WORLDB.deck === d.id ? "on" : ""}" data-act="wbDeck" data-id="${esc(d.id)}">
      <span class="cs-deck-art" ${k ? `style="background-image:url('${esc(k.art)}')"` : ""}></span>
      <span class="cs-deck-txt"><small class="wtag w-${w}">${WORLDS[w]}${d.free ? "・サンプル" : ""}</small><b>${esc(d.name)}</b></span>${WORLDB.deck === d.id ? `<span class="usingtag">使う</span>` : ""}</button>`; };
  const stars = { easy: 1, normal: 2, hard: 3 };
  openOverlay(`<div class="panel">
    ${Decks.topbar("世界限定戦", "solo")}
    <p class="lead small">30枚すべて同じ世界のカードで組んだデッキだけで戦います。相手の CPU も、1つの世界だけのデッキを使います。勝ったときのGは CPU戦と同じで、連勝ボーナスはありません。</p>
    <h3 class="sec">使うデッキ</h3>
    ${list.length ? `<div class="pr-list">${list.map(row).join("")}</div>`
      : `<p class="callout">使える限定構築のデッキがありません。デッキ編成の「限定構築」で作ってください。</p>
         <button type="button" class="btn" data-act="decks">デッキ編成へ</button>`}
    ${list.length ? `<h3 class="sec">相手の強さ</h3>
    <div class="lvls">${cpuLevels(false).map(([k, v]) => `
      <button type="button" class="lvl lvl-${k}" data-act="wbLevel" data-v="${k}">
        <span class="lvl-body">
          <span class="lvl-head"><b>${v.label}</b><i class="lvl-stars" aria-label="難しさ${stars[k]}">${"★".repeat(stars[k])}<s>${"★".repeat(3 - stars[k])}</s></i></span>
          <span class="lvl-foot"><em class="lvl-g">勝利で <b>${CONFIG[REWARD_KEY[k]]}</b>G</em></span>
        </span><span class="lvl-go" aria-hidden="true">›</span>
      </button>`).join("")}</div>` : ""}
  </div>`, "start", true);
}
/* 相手：その強さの CPU 用デッキのうち、1つの世界だけのもの（なければ、ほかの強さから） */
function worldOpponent(level) {
  const ok = PRESETS.filter(p => !hiddenDeck(p) && deckWorld(p) && !deckProblems(p, DEF, CONFIG).length);
  const at = ok.filter(p => p.level === level);
  const pool = at.length ? at : ok;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
function startWorldGame(level) {
  const d = worldDecks().find(x => x.id === WORLDB.deck);
  if (!d) return showWorldSelect();
  const icon = Account.icon();
  const mine = { name: d.name, cards: { ...d.cards }, ...(d.free && Decks.sampleOK() ? { sample: true } : {}), ...(icon ? { icon } : {}) };
  const lv = CPU_LEVELS[level] ? level : "normal";
  const opp = worldOpponent(lv);
  if (!opp) return showWorldSelect();
  startBattle({ kind: "world", level: lv, mine, opp, oppName: `CPU（${CPU_LEVELS[lv].label}・${WORLDS[deckWorld(opp)]}）`, streak: false });
}

/* ---------- 入力（タップ操作） ---------- */
function handleAct(act, el) {
  switch (act) {
    case "practice": showPractice(); return;
    case "prDeck": PRACTICE.deck = el.dataset.id; showPractice(); return;
    case "prLevel": PRACTICE.level = el.dataset.v; showPractice(); return;
    case "prStart": startPractice(); return;
    case "cpu": showCpuSelect(); return;
    case "clFilter": CL[el.dataset.k] = el.dataset.v; showCardList(); return;
    case "clText": CL.text = !!el.checked; showCardList(); return;
    case "clStep": CL.detail = stepId(CL.ids, CL.detail, +el.dataset.v); if (typeof Shop !== "undefined") Shop.tradeAsk = null; showCardList(); return;
    case "clDetail": CL.detail = el.dataset.id; CL.ids = [...document.querySelectorAll("#overlay [data-act=clDetail]")].map(x => x.dataset.id).filter((v, k, a) => a.indexOf(v) === k); if (typeof Shop !== "undefined") Shop.tradeAsk = null; showCardList(); return;
    case "clClose": CL.detail = null; if (typeof Shop !== "undefined") Shop.tradeAsk = null; showCardList(); return;
    case "start": showCpuSelect(); break;
    case "cpuLevel": startCpuGame(el && el.dataset.v); break;
    case "cpuAgain": battleAgain(); break;
    case "cpuReselect": battleReselect(); break;
    case "solo": showSolo(); return;
    case "worldMode": showWorldSelect(); return;
    case "gate": showGate(); return;
    case "gatePack": GATE.pack = el.dataset.id; showGatePack(); return;
    case "gateBack": showGate(); return;
    case "gateDeck": GATE.deck = el.dataset.id; showGatePack(); return;
    case "gateGo": startGateGame(); return;
    case "wbDeck": WORLDB.deck = el.dataset.id; showWorldSelect(); return;
    case "wbLevel": startWorldGame(el.dataset.v); return;
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
    case "play": case "playGear": {
      if (!ui.sel || ui.sel.kind !== "hand" || !canAct()) return;
      const idx = ui.sel.idx;
      if (!canPlay(ME, idx).ok) return;
      beginPlay(idx, act === "playGear");
      break;
    }
    case "account": Account.showScreen(); break;
    case "soundPanel": Sound.showPanel(); break;
    case "fxToggle": Fx.toggle(); showOptions(); break;
    case "nameEdit": showName(); break;
    case "nameSave": { const n = setPlayerName($("#pl-name") && $("#pl-name").value); showName(n ? `「${n}」にしました` : "名前を入れてください"); break; }
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
      if (Shop.handleAct(act, el)) return;
      if (Inbox.handleAct(act, el)) return;
      if (Showcase.handleAct(act, el)) return;
      if (Decks.handleAct(act, el)) return;
      if (typeof Online !== "undefined") Online.handleAct(act, el);
  }
}

/* 詳細に出ているカードをタップすると、効果や枠のないイラストだけを大きく見られる（もう一度タップで閉じる） */
function showArtView(card) {
  const img = card.querySelector(".art img"); if (!img) return;
  const v = document.createElement("div");
  v.className = "artview"; v.setAttribute("role", "dialog"); v.setAttribute("aria-label", card.getAttribute("aria-label") || "イラスト");
  v.innerHTML = `<img src="${esc(img.getAttribute("src"))}" alt="${esc(card.getAttribute("aria-label") || "")}"><b>${esc(card.getAttribute("aria-label") || "")}</b><small>タップで閉じる</small>`;
  v.addEventListener("click", ev => { ev.stopPropagation(); v.remove(); });
  document.body.appendChild(v);
}
document.addEventListener("click", e => {
  if (Date.now() < suppressClickUntil) { e.preventDefault(); return; }
  const zc = e.target.closest(".dmodal-card .card.has-art, #sheet .sheet-card .card.has-art");
  if (zc) { showArtView(zc); return; }
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
      if (tu && !canAttackUnit(ME, tu, selectedUnit())) { toast(hidden(tu) ? "隠密のキャラは攻撃できません" : "守護を持つキャラを先に攻撃してください"); return; }
      const a = ui.sel.uid; ui = { sel: null, mode: null }; doAttack(a, uid); return;
    }
    if (myTurn && ui.mode === "target") {
      const r = curRole();
      const tu = S.players[owner].field.find(x => x.uid === uid);
      if (r && tu && (r === "any" || owner === roleSide(ME, r))) {
        if (!roleAllows(ME, r, owner, tu, DEF[S.players[ME].hand[ui.sel.idx]])) { if (tu && !worldOK(tu, roleWorld(DEF[S.players[ME].hand[ui.sel.idx]], r))) { toast(`${WORLDS[roleWorld(DEF[S.players[ME].hand[ui.sel.idx]], r)]}のキャラを選んでください`); return; } toast(hidden(tu) ? "隠密のキャラは対象に選べません" : "呪文耐性のキャラは対象に選べません"); return; }
        pickTarget(uid); return;
      }
      return;
    }
    const u = S.players[owner].field.find(x => x.uid === uid);
    if (myTurn && owner === ME && u && u.ready) { ui = { sel: { kind: "unit", owner, uid }, mode: "attack" }; render(); return; }
    ui = { sel: { kind: "unit", owner, uid }, mode: null }; render(); return;
  }

  const pl = e.target.closest("[data-player]");
  if (pl && myTurn && ui.mode === "target" && curRole() === "enemyF" && +pl.dataset.player === OP) { pickTarget("face"); return; }
  if (pl && myTurn && ui.mode === "attack" && +pl.dataset.player === OP && canAttackPlayer(ME, selectedUnit())) {
    const a = ui.sel.uid; ui = { sel: null, mode: null }; doAttack(a, "player");
  }
});

window.addEventListener("resize", () => { if (S && !(drag && drag.started)) render(); });

/* 図鑑の検索：入力のたびに絞り込む（文字入力中にカーソルが飛ばないよう、入力欄を戻す） */
document.addEventListener("input", e => {
  if (e.target.id !== "cl-q") return;
  CL.q = e.target.value; const pos = e.target.selectionStart;
  showCardList();
  const n = document.getElementById("cl-q"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".artview").forEach(v => v.remove()); });

/* ---- カードの光の動き（UR・レジェンド）を軽くする ----
   ・オプションでオフにできる（この端末だけ。html に nofx を付ける）
   ・一覧（カード一覧・デッキ編成・ショップ・パックの中身）では、画面に見えているカードだけ光らせる（vis）
   ・スクロールしている間は、すべて止める（scrolling。止まって 0.2 秒で戻る） */
const Fx = {
  on: (() => { try { return localStorage.getItem("kyokai-fx") !== "off"; } catch (e) { return true; } })(),
  apply() { document.documentElement.classList.toggle("nofx", !this.on); },
  toggle() { this.on = !this.on; try { localStorage.setItem("kyokai-fx", this.on ? "on" : "off"); } catch (e) {} this.apply(); }
};
Fx.apply();
(() => {
  const o = document.getElementById("overlay"); if (!o) return;
  let t = 0;
  o.addEventListener("scroll", () => {
    o.classList.add("scrolling"); clearTimeout(t);
    t = setTimeout(() => o.classList.remove("scrolling"), 200);
  }, { passive: true });
  if (!("IntersectionObserver" in window)) { document.documentElement.classList.add("noio"); return; }
  const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle("vis", e.isIntersecting)), { root: o, rootMargin: "120px 0px" });
  new MutationObserver(ms => {
    if (ms.some(m => m.target === o)) io.disconnect();   // 画面ごと作り直したら、前の一覧の見張りをやめる
    o.querySelectorAll(".dgrid > :not([data-io]), .pl-grid > :not([data-io])").forEach(el => { el.dataset.io = "1"; io.observe(el); });
  }).observe(o, { childList: true, subtree: true });
})();

/* 詳細の窓を左右にスワイプしても、前後のカードへ移れる */
(() => {
  let sx = 0, sy = 0, on = false;
  document.addEventListener("pointerdown", e => { on = !!e.target.closest(".dmodal-in") && !!document.querySelector(".dmodal .dm-nav"); sx = e.clientX; sy = e.clientY; }, true);
  document.addEventListener("pointerup", e => {
    if (!on) return; on = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const b = document.querySelector(`.dmodal .dm-nav.${dx < 0 ? "next" : "prev"}`);
    if (b) { blockClick(); handleAct(b.dataset.act, b); }
  }, true);
})();
