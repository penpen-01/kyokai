/* =========================================================
   境界の召喚士 — 対戦画面
   カードとルールの数値は game-data.json（編集ページで作成）から読み込みます。
   ========================================================= */

const CPU_DELAY = 700; // CPUの行動間隔（ミリ秒）

let CONFIG = { ...DEFAULT_CONFIG };
let CARDS = [];
let DEF = {};
let DATA_INFO = { updated: "", draft: false };

const $ = s => document.querySelector(s);
const app = $("#app");
let S = null, uidN = 0, busy = false;
let ui = { sel: null, mode: null };
let overlayFrom = "start";

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const opp = i => 1 - i;
const playerSel = pi => `[data-player="${pi}"]`;
const unitSel = uid => `[data-uid="${uid}"]`;
const cname = id => esc(DEF[id].name);

/* ---------- データ読み込み ---------- */
async function boot() {
  const wantDraft = new URLSearchParams(location.search).has("draft");
  let raw = null;
  if (wantDraft) {
    raw = readDraft();
    if (raw) DATA_INFO.draft = true;
  }
  if (!raw) {
    try { raw = await fetchPublished(); }
    catch (e) {
      openOverlay(`<div class="panel"><h1 class="title sm">読み込みエラー</h1>
        <p class="lead">カードデータを読み込めませんでした。通信状態を確認して、ページを再読み込みしてください。</p>
        <p class="lead">${esc(e.message)}</p></div>`, "start", true);
      return;
    }
  }
  const data = normalizeData(raw);
  CONFIG = data.config;
  CARDS = data.cards;
  DEF = Object.fromEntries(CARDS.map(c => [c.id, c]));
  DATA_INFO.updated = data.updated;
  showStart();
}

/* ---------- ゲーム進行 ---------- */
function newGame() {
  const pile = [];
  CARDS.forEach(c => { for (let i = 0; i < c.copies; i++) pile.push(c.id); });
  shuffle(pile);
  S = { pile, discard: [], players: [mkPlayer("あなた"), mkPlayer("CPU")], turn: 0, turnNo: 0, over: false, result: null, log: [] };
  ui = { sel: null, mode: null };
  busy = false;
  const first = Math.random() < 0.5 ? 0 : 1;
  for (let i = 0; i < CONFIG.START_HAND; i++) { draw(0, true); draw(1, true); }
  S.log.push({ sep: true, msg: "対戦開始" });
  log(first === 0 ? "あなたの先攻です。" : "CPUの先攻です。");
  startTurn(first, true);
}
function mkPlayer(name) { return { name, hp: CONFIG.PLAYER_HP, maxE: 0, e: 0, hand: [], field: [] }; }

function log(msg) { S.log.push({ msg, who: S.turn }); if (S.log.length > 400) S.log.shift(); }

function draw(pi, silent) {
  const p = S.players[pi];
  if (!S.pile.length) {
    if (CONFIG.FATIGUE > 0) {
      p.hp -= CONFIG.FATIGUE;
      log(`山札切れ！${p.name}に${CONFIG.FATIGUE}ダメージ。`);
      fx(playerSel(pi), "-" + CONFIG.FATIGUE, "dmg");
    }
    return;
  }
  const id = S.pile.pop();
  if (p.hand.length >= CONFIG.HAND_MAX) {
    S.discard.push(id);
    if (!silent) log(`${p.name}の手札があふれ、${cname(id)}は捨て札へ。`);
    return;
  }
  p.hand.push(id);
  if (!silent) log(pi === 0 ? `あなたは${cname(id)}を引いた。` : "CPUはカードを1枚引いた。");
}

function startTurn(pi, skipDraw) {
  if (S.over) return;
  S.turn = pi; S.turnNo++;
  const p = S.players[pi];
  p.maxE = Math.min(CONFIG.ENERGY_MAX, p.maxE + 1);
  p.e = p.maxE;
  p.field.forEach(u => u.ready = true);
  S.log.push({ sep: true, msg: `ターン${S.turnNo}：${p.name}（エナジー${p.e}）` });
  if (!skipDraw) draw(pi);
  if (checkWin()) return;
  render();
  if (pi === 1) cpuTurn();
}

function endTurn(pi) {
  if (S.over || S.turn !== pi) return;
  ui = { sel: null, mode: null };
  startTurn(opp(pi), false);
}

function canPlay(pi, idx) {
  const p = S.players[pi], d = DEF[p.hand[idx]];
  if (!d) return { ok: false, reason: "そのカードはありません" };
  if (S.over || S.turn !== pi) return { ok: false, reason: "自分のターンではありません" };
  if (d.cost > p.e) return { ok: false, reason: "エナジーが足りません" };
  if (d.type === "char" && p.field.length >= CONFIG.FIELD_MAX) return { ok: false, reason: "場がいっぱいです" };
  const t = cardTarget(d);
  // 魔法は対象がいないと使えない。キャラは対象がいなくても出せる（効果だけ空振り）
  if (d.type === "spell" && t === "enemyUnit" && !S.players[opp(pi)].field.length) return { ok: false, reason: "対象の相手キャラがいません" };
  if (d.type === "spell" && t === "ownUnit" && !p.field.length) return { ok: false, reason: "対象の自分のキャラがいません" };
  return { ok: true };
}

/* 対象を選ぶ必要があるか（キャラで対象がいない場合は選ばずに出す） */
function needsTarget(pi, d) {
  const t = cardTarget(d);
  if (!t) return null;
  const side = t === "enemyUnit" ? opp(pi) : pi;
  return S.players[side].field.length ? side : null;
}

function playCard(pi, idx, targetUid) {
  const p = S.players[pi], id = p.hand[idx], d = DEF[id];
  if (!canPlay(pi, idx).ok) return;
  p.hand.splice(idx, 1);
  p.e -= d.cost;
  let tName = "";
  const t = cardTarget(d);
  if (t && targetUid != null) {
    const side = t === "enemyUnit" ? S.players[opp(pi)] : p;
    const u = side.field.find(x => x.uid === targetUid);
    if (u) tName = `（対象：${cname(u.id)}）`;
  }
  log(`${p.name}：${cname(id)}を${d.type === "char" ? "召喚" : "使用"}${tName}。`);
  let newUnit = null;
  if (d.type === "char") {
    newUnit = { uid: ++uidN, id, atk: d.atk, hp: d.hp, maxHp: d.hp, ready: d.keywords.includes("haste") };
    p.field.push(newUnit);
  } else {
    S.discard.push(id);
  }
  d.effects.forEach(e => effect(pi, e, targetUid, newUnit));
  cleanup();
  if (!checkWin()) render();
}

function effect(pi, e, target, self) {
  const me = S.players[pi], en = S.players[opp(pi)], n = e.n;
  switch (e.kind) {
    case "draw": for (let i = 0; i < n; i++) draw(pi); break;
    case "dmgRandom":
      if (en.field.length) {
        const u = en.field[Math.floor(Math.random() * en.field.length)];
        log(`${cname(u.id)}に${n}ダメージ。`);
        hitUnit(u, n);
      }
      break;
    case "dmgAll": if (en.field.length) { log(`相手キャラ全体に${n}ダメージ。`); en.field.forEach(u => hitUnit(u, n)); } break;
    case "dmgTarget": { const u = en.field.find(x => x.uid === target); if (u) hitUnit(u, n); break; }
    case "dmgFace": log(`${en.name}に${n}ダメージ。`); hitPlayer(opp(pi), n); break;
    case "heal": me.hp += n; log(`${me.name}の体力が${n}回復。`); fx(playerSel(pi), "+" + n, "heal"); break;
    case "ramp": {
      const before = me.maxE;
      me.maxE = Math.min(CONFIG.ENERGY_MAX, me.maxE + n);
      if (me.maxE > before) { log(`${me.name}のエナジー最大値が${me.maxE}に。`); fx(playerSel(pi), `エナジー+${me.maxE - before}`, "heal"); }
      break;
    }
    case "buffAtk": {
      const u = me.field.find(x => x.uid === target && x !== self);
      if (u) { u.atk += n; log(`${cname(u.id)}の攻撃力+${n}。`); fx(unitSel(u.uid), `攻撃+${n}`, "heal"); }
      break;
    }
    case "buffHp": {
      const u = me.field.find(x => x.uid === target && x !== self);
      if (u) { u.hp += n; u.maxHp += n; log(`${cname(u.id)}の体力+${n}。`); fx(unitSel(u.uid), `体力+${n}`, "heal"); }
      break;
    }
  }
}

function hitUnit(u, n) { u.hp -= n; fx(unitSel(u.uid), "-" + n, "dmg"); }
function hitPlayer(pi, n) { S.players[pi].hp -= n; fx(playerSel(pi), "-" + n, "dmg"); }

function cleanup() {
  S.players.forEach(p => {
    p.field = p.field.filter(u => {
      if (u.hp > 0) return true;
      S.discard.push(u.id);
      log(`${p.name}の${cname(u.id)}は倒れた。`);
      return false;
    });
  });
}

/* 相手の場にキャラがいる間は、相手プレイヤーを直接攻撃できない（直撃を持つキャラは例外） */
function canAttackPlayer(pi, u) { return S.players[opp(pi)].field.length === 0 || !!(u && DEF[u.id].keywords.includes("pierce")); }
function selectedUnit() {
  return ui.sel && ui.sel.kind === "unit" ? S.players[ui.sel.owner].field.find(u => u.uid === ui.sel.uid) : null;
}

function attack(pi, uid, target) {
  if (S.over || S.turn !== pi) return;
  const me = S.players[pi], en = S.players[opp(pi)];
  const a = me.field.find(u => u.uid === uid);
  if (!a || !a.ready) return;
  if (target === "player") {
    if (!canAttackPlayer(pi, a)) return;
    a.ready = false;
    log(`${cname(a.id)}が${en.name}に${a.atk}ダメージ！`);
    hitPlayer(opp(pi), a.atk);
  } else {
    const d = en.field.find(u => u.uid === target);
    if (!d) return;
    a.ready = false;
    log(`${cname(a.id)}（${a.atk}）が${cname(d.id)}（${d.atk}）を攻撃。`);
    hitUnit(d, a.atk);
    hitUnit(a, d.atk);
  }
  cleanup();
  if (!checkWin()) render();
}

function checkWin() {
  const [a, b] = S.players;
  if (a.hp > 0 && b.hp > 0) return false;
  S.over = true;
  ui = { sel: null, mode: null };
  const res = a.hp <= 0 && b.hp <= 0 ? "draw" : a.hp <= 0 ? "lose" : "win";
  S.log.push({ sep: true, msg: `決着：${{ win: "あなたの勝利", lose: "CPUの勝利", draw: "引き分け" }[res]}` });
  render();
  const g = S;
  setTimeout(() => { if (S !== g) return; S.result = res; render(); showResult(res); }, 700);
  return true;
}

/* ---------- CPU ---------- */
async function cpuTurn() {
  const g = S;
  busy = true; render();
  await sleep(CPU_DELAY);
  if (S !== g) return;
  const me = S.players[1];
  for (let guard = 0; guard < 20 && !S.over; guard++) {
    const c = cpuChoosePlay();
    if (!c) break;
    playCard(1, c.idx, c.target);
    await sleep(CPU_DELAY);
    if (S !== g) return;
  }
  for (const u of [...me.field]) {
    if (S.over) break;
    const cur = me.field.find(x => x.uid === u.uid);
    if (!cur || !cur.ready) continue;
    const t = cpuChooseAttack(cur);
    if (t == null) continue;
    attack(1, cur.uid, t);
    await sleep(CPU_DELAY);
    if (S !== g) return;
  }
  busy = false;
  if (!S.over) endTurn(1);
}

/* 効果1つぶんの価値と、選ぶ対象を見積もる */
function cpuEffectValue(e, isChar) {
  const me = S.players[1], en = S.players[0], n = e.n;
  switch (e.kind) {
    case "draw": return { v: me.hand.length <= 4 ? 4 * n : n };
    case "dmgRandom": return { v: en.field.length ? 3 * Math.min(n, 3) : 0 };
    case "dmgAll": {
      let v = 0;
      en.field.forEach(u => { v += u.hp <= n ? 5 + DEF[u.id].cost : 1; });
      return { v };
    }
    case "dmgTarget": {
      const kill = en.field.filter(u => u.hp <= n).sort((a, b) => DEF[b.id].cost - DEF[a.id].cost || b.atk - a.atk)[0];
      if (kill) return { v: 12 + DEF[kill.id].cost, t: kill.uid };
      const any = en.field.slice().sort((a, b) => b.atk - a.atk)[0];
      return any ? { v: isChar ? 2 : -1, t: any.uid } : { v: isChar ? 0 : -1 };
    }
    case "dmgFace": return { v: en.hp <= n ? 100 : 2 * n };
    case "heal": return { v: me.hp <= CONFIG.PLAYER_HP - 6 ? 3 * n + 3 : isChar ? 0 : -1 };
    case "ramp": return { v: me.maxE <= CONFIG.ENERGY_MAX - 3 ? 6 * n : 0 };
    case "buffAtk": case "buffHp": {
      const t = me.field.slice().sort((a, b) => (b.ready - a.ready) || (b.atk - a.atk))[0];
      return t ? { v: (t.ready ? 3 : 2) * n, t: t.uid } : { v: isChar ? 0 : -1 };
    }
  }
  return { v: 0 };
}

function cpuChoosePlay() {
  const me = S.players[1];
  const best = { s: 0 };
  me.hand.forEach((id, idx) => {
    if (!canPlay(1, idx).ok) return;
    const d = DEF[id], isChar = d.type === "char";
    let s = isChar ? 10 + d.cost * 2 : 0, target, bad = false;
    d.effects.forEach(e => {
      const r = cpuEffectValue(e, isChar);
      if (r.v < 0) bad = true;
      s += Math.max(0, r.v);
      if (r.t != null && target == null) target = r.t;
    });
    if (bad || (!isChar && s < 5)) return;
    if (s > best.s) Object.assign(best, { s, idx, target });
  });
  return best.idx === undefined ? null : best;
}

function cpuChooseAttack(u) {
  const en = S.players[0];
  if (canAttackPlayer(1, u)) {
    // 直撃持ちでも、相手を倒せないならまず有利な相打ちを狙う…ではなく、本体を殴る方針
    return "player";
  }
  const kills = en.field.filter(t => u.atk >= t.hp);
  const safe = kills.filter(t => t.atk < u.hp).sort((a, b) => b.atk - a.atk);
  if (safe.length) return safe[0].uid;
  const trades = kills.filter(t => DEF[t.id].cost >= DEF[u.id].cost - 1).sort((a, b) => DEF[b.id].cost - DEF[a.id].cost);
  if (trades.length) return trades[0].uid;
  const chip = en.field.filter(t => t.atk < u.hp).sort((a, b) => a.hp - b.hp);
  if (chip.length) return chip[0].uid;
  return null;
}

/* ---------- 描画 ---------- */
function pbarHTML(pi) {
  const p = S.players[pi];
  const tgt = ui.mode === "attack" && pi === 1 && canAttackPlayer(0, selectedUnit());
  let pips = "";
  for (let i = 0; i < CONFIG.ENERGY_MAX; i++) {
    pips += `<span class="pip ${i < p.e ? "on" : i < p.maxE ? "used" : ""}"></span>`;
  }
  const side = pi === 1
    ? `<div class="side"><button type="button" class="chip" data-act="menu">メニュー</button><span>手札 ${p.hand.length}</span></div>`
    : `<div class="side">${DATA_INFO.draft ? '<span class="draftbadge">試遊中</span>' : ""}<span>手札 ${p.hand.length}/${CONFIG.HAND_MAX}</span></div>`;
  return `<div class="pbar ${S.turn === pi && !S.over ? "active" : ""}">
    <button type="button" class="avatar ${tgt ? "tgt" : ""}" data-player="${pi}" aria-label="${p.name}の体力 ${p.hp}">
      <span class="hpv">${Math.max(0, p.hp)}</span><span class="hpl">体力</span></button>
    <div class="pinfo"><div class="pname">${p.name}${S.turn === pi && !S.over ? "<small>行動中</small>" : ""}</div>
      <div class="pips">${pips}<span class="etext">${p.e}/${p.maxE}</span></div></div>
    ${side}</div>`;
}

function fieldHTML(pi) {
  const p = S.players[pi];
  const myTurn = S.turn === 0 && !S.over;
  const tgtSide = ui.mode === "attack" ? 1 : ui.mode === "spell" ? ui.spellSide : -1;
  let s = "";
  for (let i = 0; i < CONFIG.FIELD_MAX; i++) {
    const u = p.field[i];
    if (!u) { s += `<div class="slot"><span class="empty"></span></div>`; continue; }
    const cls = [
      pi === 0 && myTurn && !busy && u.ready ? "ready" : "",
      pi === 0 && myTurn && !u.ready ? "rest" : "",
      pi === tgtSide ? "tgt" : "",
      ui.sel && ui.sel.kind === "unit" && ui.sel.uid === u.uid ? "sel" : ""
    ].join(" ");
    s += `<div class="slot">${cardHTML(DEF[u.id], { unit: u, cls, showCost: false, attrs: `data-uid="${u.uid}" data-owner="${pi}"` })}</div>`;
  }
  return `<div class="field" data-zone="${pi}" style="--cols:${CONFIG.FIELD_MAX}">${s}</div>`;
}

function render() {
  if (!S) return;
  hidePreview();
  const me = S.players[0];
  const canEnd = S.turn === 0 && !S.over && !busy;
  const lines = S.log.filter(l => !l.sep).slice(-2);
  app.innerHTML = `
    ${pbarHTML(1)}
    ${fieldHTML(1)}
    <div class="mid">
      <div class="pile" aria-label="共通山札"><b>${S.pile.length}</b><span>山札</span></div>
      <button type="button" class="log" data-act="log" aria-label="プレイログを開く">${lines.map((l, i) => `<div class="${i < lines.length - 1 ? "old" : ""}">${l.msg}</div>`).join("")}</button>
      ${S.over && S.result
        ? `<button type="button" class="endbtn" data-act="showResult">結果画面へ</button>`
        : `<button type="button" class="endbtn" data-act="end" ${canEnd ? "" : "disabled"}>${busy ? "CPU行動中" : "ターン終了"}</button>`}
    </div>
    ${fieldHTML(0)}
    ${pbarHTML(0)}
    <div class="hand">${me.hand.map((id, i) => {
      const dim = S.turn !== 0 || DEF[id].cost > me.e;
      const sel = ui.sel && ui.sel.kind === "hand" && ui.sel.idx === i;
      return cardHTML(DEF[id], { cls: `${dim ? "dim" : ""} ${sel ? "sel" : ""}`, attrs: `data-hand="${i}"` });
    }).join("")}</div>`;
  layoutHand();
  renderSheet();
}

/* 手札が多いときはカードを重ねて、全部が手札の幅に収まるようにする */
function layoutHand() {
  const h = app.querySelector(".hand");
  if (!h || !h.children.length) return;
  const cs = [...h.children], n = cs.length;
  const w = cs[0].getBoundingClientRect().width, box = h.clientWidth, gap = 6;
  const step = n > 1 ? Math.min(w + gap, (box - w) / (n - 1)) : 0;
  cs.forEach((c, i) => { c.style.marginLeft = i ? (step - w) + "px" : "0"; c.style.zIndex = i + 1; });
}

function detailHTML(id, unit, owner) {
  const d = DEF[id];
  const statLine = d.type === "char"
    ? `<div class="sh-stats">攻撃 ${unit ? unit.atk : d.atk} ／ 体力 ${unit ? `${unit.hp}/${unit.maxHp}` : d.hp}${unit && !unit.ready && owner === 0 ? "（このターンは攻撃できません）" : ""}</div>`
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
    if (ui.mode === "spell") {
      const d = DEF[S.players[0].hand[ui.sel.idx]];
      msg = `${esc(d.name)}の対象にする${ui.spellSide === 1 ? "相手" : "自分"}のキャラをタップしてください`;
    } else {
      const u = selectedUnit();
      msg = !S.players[1].field.length ? "相手の体力（上の丸）をタップして直接攻撃"
        : canAttackPlayer(0, u) ? "直撃：相手キャラか、相手の体力（上の丸）をタップ"
        : "攻撃する相手キャラをタップしてください";
    }
    el.className = "sheet banner";
    el.innerHTML = `<p>${msg}</p><button type="button" class="btn" data-act="cancel">やめる</button>`;
    el.hidden = false;
    return;
  }
  let id, unit = null, playable = null;
  if (ui.sel.kind === "hand") {
    id = S.players[0].hand[ui.sel.idx];
    if (!id) { ui.sel = null; el.hidden = true; return; }
    playable = busy ? { ok: false, reason: "CPUの行動中です" } : canPlay(0, ui.sel.idx);
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
  if (card.dataset.hand != null) { const id = S.players[0].hand[+card.dataset.hand]; return id ? { id, unit: null, owner: 0 } : null; }
  if (card.dataset.uid != null) {
    const owner = +card.dataset.owner;
    const unit = S.players[owner].field.find(u => u.uid === +card.dataset.uid);
    return unit ? { id: unit.id, unit, owner } : null;
  }
  return null;
}
function showPreview(card) {
  const info = cardInfoFromEl(card);
  if (!info) return;
  const p = $("#preview");
  p.innerHTML = detailHTML(info.id, info.unit, info.owner) + "</div>";
  p.hidden = false;
  const r = card.getBoundingClientRect(), ph = p.offsetHeight;
  const top = r.top > innerHeight / 2 ? r.top - ph - 14 : r.bottom + 14;
  p.style.top = Math.max(8, Math.min(innerHeight - ph - 8, top)) + "px";
}
function hidePreview() { const p = $("#preview"); if (p) p.hidden = true; hoverEl = null; }

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
let drag = null, press = null, suppressClick = false;

document.addEventListener("pointerdown", e => {
  if (!S || S.over || e.button > 0) return;
  const card = e.target.closest("#app .card");
  if (!card) return;
  if (e.pointerType !== "mouse") {
    press = { x: e.clientX, y: e.clientY, shown: false };
    press.timer = setTimeout(() => {
      if (press && !(drag && drag.started)) { press.shown = true; showPreview(card); }
    }, 380);
  }
  if (S.turn !== 0 || busy) return;
  if (card.dataset.hand != null) {
    drag = { kind: "hand", idx: +card.dataset.hand, el: card, sx: e.clientX, sy: e.clientY, started: false };
  } else if (card.dataset.owner === "0") {
    const u = S.players[0].field.find(x => x.uid === +card.dataset.uid);
    if (u && u.ready) drag = { kind: "unit", uid: u.uid, el: card, sx: e.clientX, sy: e.clientY, started: false };
  }
});

document.addEventListener("pointermove", e => {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) clearTimeout(press.timer);
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
    if (press.shown) { hidePreview(); blockClick(); }
    press = null;
  }
  if (drag && drag.started) {
    const action = commit ? dropAction(e.clientX, e.clientY) : null;
    endDrag();
    blockClick();
    if (action) action();
  }
  drag = null;
}
function blockClick() { suppressClick = true; setTimeout(() => suppressClick = false, 0); }

/* 手札をドラッグしたときに、どこへ落とせば使えるか */
function handDropSide(d) {
  if (d.type === "char") return { field: true };
  const side = needsTarget(0, d);
  return side == null ? { field: true } : { units: side };
}

function startDrag() {
  drag.started = true;
  hidePreview();
  ui = { sel: null, mode: null };
  renderSheet();
  const zones = [];
  if (drag.kind === "hand") {
    const d = DEF[S.players[0].hand[drag.idx]];
    const z = handDropSide(d);
    if (z.field) zones.push(app.querySelector('.field[data-zone="0"]'));
    else app.querySelectorAll(`[data-owner="${z.units}"]`).forEach(el => zones.push(el));
    const r = drag.el.getBoundingClientRect();
    const g = drag.el.cloneNode(true);
    g.classList.remove("dim", "sel");
    g.classList.add("ghost");
    g.style.width = r.width + "px"; g.style.height = r.height + "px"; g.style.margin = "0";
    $("#fx").appendChild(g);
    drag.ghost = g;
    drag.el.classList.add("lifted");
  } else {
    app.querySelectorAll('[data-owner="1"]').forEach(el => zones.push(el));
    const u = S.players[0].field.find(x => x.uid === drag.uid);
    if (canAttackPlayer(0, u)) zones.push(app.querySelector('[data-player="1"]'));
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
    const idx = drag.idx, d = DEF[S.players[0].hand[idx]], chk = canPlay(0, idx);
    const z = handDropSide(d);
    if (z.units != null) {
      if (!unitEl || +unitEl.dataset.owner !== z.units) return null;
      if (!chk.ok) return () => toast(chk.reason);
      const uid = +unitEl.dataset.uid;
      return () => playCard(0, idx, uid);
    }
    if (!fieldEl || fieldEl.dataset.zone !== "0") return null;
    if (!chk.ok) return () => toast(chk.reason);
    // 対象付きの効果を持つキャラ：場に置いたあと対象を選ぶ
    const side = needsTarget(0, d);
    if (side != null) return () => { ui = { sel: { kind: "hand", idx }, mode: "spell" }; ui.spellSide = side; render(); };
    return () => playCard(0, idx);
  }
  const uid = drag.uid;
  if (unitEl && unitEl.dataset.owner === "1") { const t = +unitEl.dataset.uid; return () => attack(0, uid, t); }
  if (plEl && plEl.dataset.player === "1") {
    const u = S.players[0].field.find(x => x.uid === uid);
    if (!canAttackPlayer(0, u)) return () => toast("相手の場にキャラがいるので、直接攻撃できません");
    return () => attack(0, uid, "player");
  }
  return null;
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  $("#fx").appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

function fx(sel, text, cls) {
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
    <h3>山札</h3><p>2人で1つの共通山札から引きます。強いカードが相手に渡ることもあります。山札が尽きたら、引くたびに${CONFIG.FATIGUE}ダメージ。</p>
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
  else if (overlayFrom === "result" && S && S.result) showResult(S.result);
  else if (overlayFrom === "game") $("#overlay").hidden = true;
  else showStart();
}

function showStart() {
  const info = DATA_INFO.draft
    ? `<p class="datainfo">編集中のカードデータで試遊しています</p>`
    : DATA_INFO.updated ? `<p class="datainfo">カードデータ更新日：${esc(DATA_INFO.updated)}</p>` : "";
  openOverlay(`<div class="panel">
    <h1 class="title"><small>試作版 0.4</small>境界の召喚士</h1>
    <p class="lead">神話・幻想・機械。崩れた世界の境界から英雄を呼び出し、相手の召喚士を倒せ。</p>
    <div class="worlds"><span class="w-myth">神話</span><span class="w-fan">幻想</span><span class="w-mech">機械</span></div>
    <button type="button" class="btn primary" data-act="start">CPUと対戦する</button>
    <button type="button" class="btn" data-act="cards">カード一覧</button>
    <button type="button" class="btn" data-act="rules">ルールを読む</button>
    ${info}
  </div>`, "start", true);
}

function showMenu() {
  openOverlay(`<div class="panel">
    <h2 class="title sm">メニュー</h2>
    <div class="menu">
      <button type="button" class="btn primary" data-act="closeOverlay">対戦に戻る</button>
      <button type="button" class="btn" data-act="log">プレイログ</button>
      <button type="button" class="btn" data-act="cards">カード一覧</button>
      <button type="button" class="btn" data-act="rules">ルール</button>
      <button type="button" class="btn" data-act="toTitle">タイトルに戻る（この対戦は終了します）</button>
    </div>
  </div>`, "game");
  overlayFrom = "menu";
}

function showRules() {
  openOverlay(`<div class="panel"><h2 class="title sm">ルール</h2>${RULES_HTML()}
    <button type="button" class="btn primary" data-act="back">戻る</button></div>`, null, !S);
}

function showCardList() {
  const inDeck = CARDS.filter(c => c.copies > 0);
  const byCost = (a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja");
  const total = inDeck.reduce((n, c) => n + c.copies, 0);
  const group = (type, label) => {
    const list = inDeck.filter(c => c.type === type).sort(byCost);
    const n = list.reduce((s, c) => s + c.copies, 0);
    return `<h3 class="sec">${label}（${list.length}種・${n}枚）</h3>
      <div class="clist">${list.map(c => `
        <div class="citem">
          ${cardHTML(c, { static: true })}
          <div class="cbody">
            <div class="chead"><span class="cname">${esc(c.name)}</span><span class="ccount">×${c.copies}</span></div>
            <div class="cmeta">${WORLDS[c.world]} ・ コスト${c.cost}${c.type === "char" ? ` ・ 攻撃${c.atk} ／ 体力${c.hp}` : ""}</div>
            <div class="ctext">${esc(cardText(c))}</div>
          </div>
        </div>`).join("")}</div>`;
  };
  const worldCount = w => inDeck.filter(c => c.world === w).reduce((s, c) => s + c.copies, 0);
  openOverlay(`<div class="panel wide">
    <h2 class="title sm">カード一覧</h2>
    <div class="totals"><span>共通山札 <b>${inDeck.length}</b>種・<b>${total}</b>枚</span>
      <span>神話 <b>${worldCount("myth")}</b>枚</span><span>幻想 <b>${worldCount("fan")}</b>枚</span><span>機械 <b>${worldCount("mech")}</b>枚</span></div>
    ${group("char", "キャラクター")}
    ${group("spell", "魔法")}
    <button type="button" class="btn primary" data-act="back">戻る</button>
  </div>`, null, !S);
}

function showLog() {
  if (!S) return;
  const rows = S.log.map(l => l.sep
    ? `<div class="sep">${l.msg}</div>`
    : `<div class="${l.who === 1 ? "cpu" : ""}">${l.msg}</div>`).join("");
  openOverlay(`<div class="panel wide">
    <h2 class="title sm">プレイログ</h2>
    <div class="loglist" id="loglist">${rows}</div>
    <button type="button" class="btn primary" data-act="back">戻る</button>
  </div>`);
  const ll = $("#loglist"); ll.scrollTop = ll.scrollHeight;
}

function showResult(res) {
  const label = { win: "勝利", lose: "敗北", draw: "引分" }[res];
  openOverlay(`<div class="panel">
    <p class="result ${res}">${label}</p>
    <p class="lead" style="text-align:center">${S.turnNo}ターンで決着。残り体力 あなた ${Math.max(0, S.players[0].hp)} ／ CPU ${Math.max(0, S.players[1].hp)}</p>
    <button type="button" class="btn primary" data-act="start">もう一度対戦する</button>
    <button type="button" class="btn" data-act="log">プレイログを見る</button>
    <button type="button" class="btn" data-act="closeOverlay">盤面を見る</button>
    <button type="button" class="btn" data-act="toTitle">タイトルに戻る</button>
  </div>`, "result");
}

function toTitle() {
  S = null; busy = false; ui = { sel: null, mode: null };
  app.innerHTML = "";
  $("#sheet").hidden = true;
  hidePreview();
  showStart();
}

/* ---------- 入力（タップ操作） ---------- */
function handleAct(act) {
  switch (act) {
    case "start": $("#overlay").hidden = true; newGame(); break;
    case "rules": if (!S) overlayFrom = "start"; else if (overlayFrom !== "menu" && overlayFrom !== "result") overlayFrom = "game"; showRules(); break;
    case "cards": if (!S) overlayFrom = "start"; showCardList(); break;
    case "log": if ($("#overlay").hidden) overlayFrom = "game"; showLog(); break;
    case "back": goBack(); break;
    case "menu": showMenu(); break;
    case "toTitle": toTitle(); break;
    case "closeOverlay": $("#overlay").hidden = true; break;
    case "showResult": if (S && S.result) showResult(S.result); break;
    case "cancel": ui = { sel: null, mode: null }; render(); break;
    case "end": if (S && S.turn === 0 && !busy) endTurn(0); break;
    case "play": {
      if (!ui.sel || ui.sel.kind !== "hand" || busy) return;
      const idx = ui.sel.idx;
      if (!canPlay(0, idx).ok) return;
      const d = DEF[S.players[0].hand[idx]];
      const side = needsTarget(0, d);
      if (side != null) { ui.mode = "spell"; ui.spellSide = side; render(); return; }
      ui = { sel: null, mode: null };
      playCard(0, idx);
      break;
    }
  }
}

document.addEventListener("click", e => {
  if (suppressClick) { suppressClick = false; return; }
  const act = e.target.closest("[data-act]");
  if (act) { if (!act.disabled) handleAct(act.dataset.act); return; }
  if (!S || S.over) return;
  const myTurn = S.turn === 0 && !busy;

  const h = e.target.closest("[data-hand]");
  if (h) { hidePreview(); ui = { sel: { kind: "hand", idx: +h.dataset.hand }, mode: null }; render(); return; }

  const c = e.target.closest("[data-uid]");
  if (c) {
    const uid = +c.dataset.uid, owner = +c.dataset.owner;
    if (myTurn && ui.mode === "attack" && owner === 1) { const a = ui.sel.uid; ui = { sel: null, mode: null }; attack(0, a, uid); return; }
    if (myTurn && ui.mode === "spell" && owner === ui.spellSide) { const i = ui.sel.idx; ui = { sel: null, mode: null }; playCard(0, i, uid); return; }
    const u = S.players[owner].field.find(x => x.uid === uid);
    if (myTurn && owner === 0 && u && u.ready) { ui = { sel: { kind: "unit", owner, uid }, mode: "attack" }; render(); return; }
    ui = { sel: { kind: "unit", owner, uid }, mode: null }; render(); return;
  }

  const pl = e.target.closest("[data-player]");
  if (pl && myTurn && ui.mode === "attack" && +pl.dataset.player === 1 && canAttackPlayer(0, selectedUnit())) {
    const a = ui.sel.uid; ui = { sel: null, mode: null }; attack(0, a, "player");
  }
});

window.addEventListener("resize", () => { if (S && !(drag && drag.started)) render(); });
registerSW();
boot();
