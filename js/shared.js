/* =========================================================
   境界の召喚士 — ゲームと編集ページで共通の定義
   ========================================================= */

const WORLDS = { myth: "神話", fan: "幻想", mech: "機械" };
const TYPES = { char: "キャラクター", spell: "魔法" };

/* キャラクターの能力（キーワード） */
const KEYWORDS = {
  haste:  { label: "速攻", text: "場に出したターンから攻撃できる。" },
  pierce: { label: "直撃", text: "相手の場にキャラがいても、相手プレイヤーを攻撃できる。" }
};

/* 効果の種類。キャラは「登場時」、魔法は「使ったとき」に発動する。
   target があるものは、使うときに対象のキャラを選ぶ（1枚につき1つまで）。 */
const EFFECTS = {
  draw:      { label: "カードを引く",                 text: n => `カードを${n}枚引く。` },
  dmgTarget: { label: "選んだ相手キャラにダメージ",   text: n => `相手キャラ1体に${n}ダメージ。`, target: "enemyUnit" },
  dmgRandom: { label: "ランダムな相手キャラにダメージ", text: n => `ランダムな相手キャラ1体に${n}ダメージ。` },
  dmgAll:    { label: "相手キャラ全体にダメージ",     text: n => `相手キャラ全体に${n}ダメージ。` },
  dmgFace:   { label: "相手プレイヤーにダメージ",     text: n => `相手プレイヤーに${n}ダメージ。` },
  heal:      { label: "自分の体力を回復",             text: n => `自分の体力を${n}回復する。` },
  ramp:      { label: "エナジー最大値を増やす",       text: n => `エナジーの最大値を${n}増やす（上限まで）。` },
  buffAtk:   { label: "自分のキャラの攻撃力を上げる", text: n => `自分のキャラ1体の攻撃力を+${n}する。`, target: "ownUnit" },
  buffHp:    { label: "自分のキャラの体力を上げる",   text: n => `自分のキャラ1体の体力を+${n}する。`, target: "ownUnit" }
};

const DEFAULT_CONFIG = { PLAYER_HP: 20, START_HAND: 6, ENERGY_MAX: 8, FIELD_MAX: 4, HAND_MAX: 8, FATIGUE: 2 };

const CONFIG_INFO = {
  PLAYER_HP:  { label: "プレイヤーの体力",           min: 1, max: 99 },
  START_HAND: { label: "初期手札",                   min: 0, max: 10 },
  ENERGY_MAX: { label: "エナジー上限",               min: 1, max: 15 },
  FIELD_MAX:  { label: "場に置けるキャラの数",       min: 1, max: 6 },
  HAND_MAX:   { label: "手札の上限",                 min: 1, max: 12 },
  FATIGUE:    { label: "山札切れで引けないときのダメージ", min: 0, max: 20 }
};

const DRAFT_KEY = "kyokai-draft-v1";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* カードの対象（最初に見つかった対象付き効果で決まる） */
function cardTarget(card) {
  for (const e of card.effects || []) { const t = EFFECTS[e.kind] && EFFECTS[e.kind].target; if (t) return t; }
  return null;
}

/* 効果テキストを自動で作る */
function cardTextLines(card) {
  const lines = [];
  if (card.type === "char") {
    (card.keywords || []).forEach(k => KEYWORDS[k] && lines.push(`${KEYWORDS[k].label}：${KEYWORDS[k].text}`));
    const eff = (card.effects || []).filter(e => EFFECTS[e.kind]).map(e => EFFECTS[e.kind].text(e.n)).join("");
    if (eff) lines.push(`登場時：${eff}`);
  } else {
    const eff = (card.effects || []).filter(e => EFFECTS[e.kind]).map(e => EFFECTS[e.kind].text(e.n)).join("");
    if (eff) lines.push(eff);
  }
  if (card.note) lines.push(card.note);
  return lines;
}
function cardText(card) {
  const l = cardTextLines(card);
  return l.length ? l.join("\n") : "特殊能力なし。";
}

/* カードの見た目。unit を渡すと場のキャラの現在値を表示する */
function cardHTML(card, o = {}) {
  const u = o.unit;
  const art = card.art
    ? `<img src="${esc(card.art)}" alt="" draggable="false">`
    : `<span class="glyph">${esc(card.glyph || "？")}</span>`;
  let stats;
  if (card.type === "char") {
    const atk = u ? u.atk : card.atk, hp = u ? u.hp : card.hp;
    stats = `<span class="stats"><span class="atk ${u && u.atk > card.atk ? "up" : ""}">${atk}</span>`
      + `<span class="hp ${u && u.hp < u.maxHp ? "hurt" : u && u.maxHp > card.hp ? "up" : ""}">${hp}</span></span>`;
  } else {
    stats = `<span class="stats spelltag">魔法</span>`;
  }
  const tag = o.static ? "div" : "button";
  return `<${tag} ${o.static ? "" : 'type="button"'} class="card w-${esc(card.world)} ${card.type} ${card.art ? "has-art" : ""} ${o.cls || ""}" ${o.attrs || ""} aria-label="${esc(card.name)}">
    <span class="art">${art}</span>
    ${o.showCost === false ? "" : `<span class="cost">${card.cost}</span>`}
    <span class="foot"><span class="nm">${esc(card.name)}</span>${stats}</span></${tag}>`;
}

/* 読み込んだデータの欠けを補う */
function normalizeData(data) {
  const d = data && typeof data === "object" ? data : {};
  const config = Object.assign({}, DEFAULT_CONFIG, d.config || {});
  const cards = (Array.isArray(d.cards) ? d.cards : []).map(c => ({
    id: String(c.id || ""),
    name: String(c.name || "名前なし"),
    world: WORLDS[c.world] ? c.world : "fan",
    type: c.type === "spell" ? "spell" : "char",
    cost: +c.cost || 0,
    atk: c.type === "spell" ? undefined : (+c.atk || 0),
    hp: c.type === "spell" ? undefined : Math.max(1, +c.hp || 1),
    glyph: String(c.glyph || "？"),
    copies: Math.max(0, +c.copies || 0),
    keywords: Array.isArray(c.keywords) ? c.keywords.filter(k => KEYWORDS[k]) : [],
    effects: Array.isArray(c.effects) ? c.effects.filter(e => EFFECTS[e.kind]).map(e => ({ kind: e.kind, n: Math.max(1, +e.n || 1) })) : [],
    note: c.note ? String(c.note) : "",
    art: c.art ? String(c.art) : ""
  })).filter(c => c.id);
  return { version: +d.version || 1, updated: d.updated || "", config, cards };
}

function readDraft() {
  try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}

async function fetchPublished() {
  const r = await fetch("game-data.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("game-data.json を読み込めませんでした（" + r.status + "）");
  return r.json();
}

/* サービスワーカー登録（PWA） */
function registerSW() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
