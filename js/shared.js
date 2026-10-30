/* =========================================================
   境界の召喚士 — ゲームと編集ページで共通の定義
   ========================================================= */

const WORLDS = { myth: "神話", fan: "幻想", mech: "機械" };
const TYPES = { char: "キャラクター", spell: "魔法" };

/* キャラクターの能力（キーワード） */
const KEYWORDS = {
  haste:   { label: "速攻", short: "速", text: "場に出したターンから攻撃できる。" },
  pierce:  { label: "直撃", short: "直", text: "相手の守護を無視して、好きな相手キャラや相手プレイヤーを攻撃できる。" },
  trample: { label: "貫通", short: "貫", text: "キャラを攻撃して倒したとき、余ったダメージを相手プレイヤーに与える。" },
  guard:   { label: "守護", short: "守", text: "このキャラがいる間、相手は守護を持つキャラしか攻撃できない。" }
};
/* 装甲は数値つきの能力（card.armor） */
const ARMOR_TEXT = n => `装甲${n}：受けるダメージを${n}減らす。`;

/* 代償（card.pay）：使うときに支払う */
const PAYS = {
  life:      { label: "自分の体力を払う", text: n => `代償：自分の体力を${n}払う。` },
  sacrifice: { label: "自分のキャラ1体を破壊する", text: () => "代償：自分のキャラ1体を選んで破壊する。" }
};

/* 効果の種類。キャラは「登場時」、魔法は「使ったとき」に発動する。
   target があるものは、使うときに対象のキャラを選ぶ（相手側と自分側を1体ずつまで）。
   noN は数値を使わない効果、min は数値の下限。 */
const EFFECTS = {
  draw:        { group: "ドロー", label: "カードを引く",                  text: n => `カードを${n}枚引く。` },
  refresh:     { group: "ドロー", label: "手札を入れ替える",              text: n => n ? `手札をすべて山札に戻して切り直し、その枚数より${n}枚多く引く。` : "手札をすべて山札に戻して切り直し、同じ枚数を引く。", min: 0 },
  discard:     { group: "妨害",   label: "相手の手札を捨てさせる",        text: n => `相手の手札をランダムに${n}枚捨てさせる。` },
  dmgTarget:   { group: "ダメージ", label: "選んだ相手キャラにダメージ",  text: n => `相手キャラ1体に${n}ダメージ。`, target: "enemyUnit" },
  dmgRandom:   { group: "ダメージ", label: "ランダムな相手キャラにダメージ", text: n => `ランダムな相手キャラ1体に${n}ダメージ。` },
  dmgAll:      { group: "ダメージ", label: "相手キャラ全体にダメージ",    text: n => `相手キャラ全体に${n}ダメージ。` },
  dmgAllBoth:  { group: "ダメージ", label: "全キャラにダメージ（自分側も）", text: n => `すべてのキャラ（自分のキャラも含む）に${n}ダメージ。` },
  dmgFace:     { group: "ダメージ", label: "相手プレイヤーにダメージ",    text: n => `相手プレイヤーに${n}ダメージ。` },
  destroyTarget: { group: "除去", label: "選んだ相手キャラを破壊",       text: () => "相手キャラ1体を破壊する。", target: "enemyUnit", noN: true },
  destroyAll:  { group: "除去",   label: "全キャラを破壊（自分側も）",    text: () => "すべてのキャラ（自分のキャラも含む）を破壊する。", noN: true },
  freezeTarget:{ group: "妨害",   label: "選んだ相手キャラを行動不能に",  text: () => "相手キャラ1体は、次の相手のターンに攻撃できない。", target: "enemyUnit", noN: true },
  freezeAll:   { group: "妨害",   label: "相手キャラ全体を行動不能に",    text: () => "相手キャラ全体は、次の相手のターンに攻撃できない。", noN: true },
  debuffTarget:{ group: "妨害",   label: "選んだ相手キャラの攻撃力を下げる", text: n => `相手キャラ1体の攻撃力を-${n}する。`, target: "enemyUnit" },
  debuffAll:   { group: "妨害",   label: "相手キャラ全体の攻撃力を下げる", text: n => `相手キャラ全体の攻撃力を-${n}する。` },
  buffAtk:     { group: "強化",   label: "自分のキャラの攻撃力を上げる",  text: n => `自分のキャラ1体の攻撃力を+${n}する。`, target: "ownUnit" },
  buffHp:      { group: "強化",   label: "自分のキャラの体力を上げる",    text: n => `自分のキャラ1体の体力を+${n}する。`, target: "ownUnit" },
  buffBoth:    { group: "強化",   label: "自分のキャラを+N/+N",           text: n => `自分のキャラ1体を+${n}/+${n}する。`, target: "ownUnit" },
  buffAllAtk:  { group: "強化",   label: "自分のキャラ全体の攻撃力を上げる", text: n => `自分のキャラ全体の攻撃力を+${n}する。` },
  buffAllBoth: { group: "強化",   label: "自分のキャラ全体を+N/+N",       text: n => `自分のキャラ全体を+${n}/+${n}する。` },
  heal:        { group: "回復",   label: "自分の体力を回復",              text: n => `自分の体力を${n}回復する。` },
  healUnits:   { group: "回復",   label: "自分のキャラ全体を回復",        text: n => `自分のキャラ全体の体力を${n}回復する。` },
  ramp:        { group: "エナジー", label: "エナジー最大値を増やす",      text: n => `エナジーの最大値を${n}増やす（上限まで）。` },
  energyNow:   { group: "エナジー", label: "このターンのエナジーを増やす", text: n => `このターンだけ、エナジーを${n}得る。` },
  discount:    { group: "エナジー", label: "次に使うカードのコストを下げる", text: n => `次に使うカード1枚のコストを${n}下げる。` },
  summon:      { group: "召喚",   label: "山札からキャラを無料で出す",    text: n => `山札からコスト${n}以下のキャラをランダムに1体、コストを払わずに出す。` }
};

const DEFAULT_CONFIG = {
  PLAYER_HP: 20, START_HAND: 5, ENERGY_MAX: 10, FIELD_MAX: 4, HAND_MAX: 10, FATIGUE: 2, SECOND_BONUS: 0, SECOND_COIN: 1, DECK_SIZE: 30, COPY_MAX: 3, DECK_MAX: 10,
  // ここから下はゲームの裏側（報酬・配布）
  STARTING_GOLD: 100, REWARD_EASY: 30, REWARD_NORMAL: 60, REWARD_HARD: 120, REWARD_ONLINE: 80,
  SEASON: "beta", STARTER_DECK: "starter",
  SAMPLE_DECKS: true   // ベータ用：所持に関係なく全カードで組める「サンプルデッキ」を許可
};

/* レア度（パック開封で使う） */
const RARITY = { common: "コモン", rare: "レア", sr: "スーパーレア", ur: "ウルトラレア", legend: "レジェンド" };
const RARITY_SHORT = { common: "C", rare: "R", sr: "SR", ur: "UR", legend: "L" };

const CONFIG_INFO = {
  PLAYER_HP:  { label: "プレイヤーの体力",           min: 1, max: 99 },
  START_HAND: { label: "初期手札",                   min: 0, max: 10 },
  ENERGY_MAX: { label: "エナジー上限",               min: 1, max: 15 },
  FIELD_MAX:  { label: "場に置けるキャラの数",       min: 1, max: 6 },
  HAND_MAX:   { label: "手札の上限",                 min: 1, max: 12 },
  SECOND_BONUS: { label: "後攻が最初に多く引く枚数",   min: 0, max: 3 },
  SECOND_COIN: { label: "後攻に配る「境界の欠片」の枚数", min: 0, max: 2 },
  FATIGUE:    { label: "山札切れで引けないときのダメージ", min: 0, max: 20 },
  DECK_SIZE:  { label: "デッキの枚数",               min: 10, max: 60 },
  COPY_MAX:   { label: "同じカードを入れられる上限", min: 1, max: 10 },
  DECK_MAX:   { label: "作れるデッキの数（通常・サンプルそれぞれ）", min: 1, max: 50, group: "eco" },
  STARTING_GOLD: { label: "始めたときに配るG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_EASY:   { label: "CPU初級に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_NORMAL: { label: "CPU中級に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_HARD:   { label: "CPU上級に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_ONLINE: { label: "対人戦に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 }
};

/* パックの標準の排出率（%）。最後の1枚はレア以上確定 */
const DEFAULT_ODDS = {
  normal: { common: 70, rare: 22, sr: 6, ur: 1.5, legend: 0.5 },
  last:   { common: 0, rare: 70, sr: 20, ur: 7, legend: 3 }
};

const DRAFT_KEY = "kyokai-draft-v1";

/* ---------- シリアルコード ---------- */
/* 端末の日付（YYYY-MM-DD）。有効期限は日本時間などその人の日付で判定する */
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const SERIAL_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const serialNorm = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const serialFmt = s => serialNorm(s).replace(/(.{4})(?=.)/g, "$1-");
function serialMake() {
  const a = new Uint32Array(12); crypto.getRandomValues(a);
  return Array.from(a, n => SERIAL_CHARS[n % SERIAL_CHARS.length]).join("");
}
async function serialHash(code) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("kyokai-serial:" + serialNorm(code)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* カードの対象（効果のうち、最初に見つかった対象付きのもの） */
function cardTarget(card) {
  for (const e of card.effects || []) { const t = EFFECTS[e.kind] && EFFECTS[e.kind].target; if (t) return t; }
  return null;
}
/* カードを使うときに選ぶ対象の並び：代償で破壊する自分のキャラ → 相手キャラ → 自分のキャラ */
function cardTargetRoles(card) {
  const roles = [];
  const sac = card.pay && card.pay.kind === "sacrifice";
  if (sac) roles.push("sacrifice");
  const kinds = (card.effects || []).map(e => EFFECTS[e.kind] && EFFECTS[e.kind].target).filter(Boolean);
  if (kinds.includes("enemyUnit")) roles.push("enemy");
  if (kinds.includes("ownUnit") && !sac) roles.push("own");
  return roles;
}

/* 後攻の人だけが最初に持つ、使い切りのカード（パックやデッキには入らない） */
const COIN_CARD = {
  id: "coin", name: "境界の欠片", world: "fan", type: "spell", cost: 0, glyph: "欠", limit: 0, rarity: "common",
  keywords: [], effects: [{ kind: "energyNow", n: 1 }], note: "後攻の人だけが最初に持っている。好きなときに1回だけ使える。"
};

/* 効果テキストを自動で作る */
function effectsText(card) {
  // 同じ効果が続くときは「〜を4回」にまとめる（天罰の光など）
  const list = (card.effects || []).filter(e => EFFECTS[e.kind]);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    let k = 1;
    while (i + k < list.length && list[i + k].kind === e.kind && list[i + k].n === e.n) k++;
    let t = EFFECTS[e.kind].text(e.n);
    // キャラの登場時効果で「自分のキャラ1体」を選ぶものは、そのキャラ自身は選べない
    if (card.type === "char" && EFFECTS[e.kind].target === "ownUnit") t = t.replace("自分のキャラ1体", "このキャラ以外の自分のキャラ1体");
    if (k > 1) t = e.kind === "dmgRandom" ? `ランダムな相手キャラに${e.n}ダメージを${k}回与える（1回ごとに選び直す。倒れたキャラは選ばれない）。` : `${t.replace(/。$/, "")}（${k}回）。`;
    out.push(t);
    i += k - 1;
  }
  return out.join("");
}
function cardTextLines(card) {
  const lines = [];
  if (card.type === "char") {
    (card.keywords || []).forEach(k => KEYWORDS[k] && lines.push(`${KEYWORDS[k].label}：${KEYWORDS[k].text}`));
    if (card.armor) lines.push(ARMOR_TEXT(card.armor));
  }
  if (card.pay && PAYS[card.pay.kind]) lines.push(PAYS[card.pay.kind].text(card.pay.n));
  const eff = effectsText(card);
  if (eff) lines.push(card.type === "char" ? `登場時：${eff}` : eff);
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
  // o.hidden：まだ持っていないカード。イラストを隠して「？」を出す（名前・数値・効果は見せる）
  const art = o.hidden ? `<span class="glyph">？</span>`
    : card.art ? `<img src="${esc(card.art)}" alt="" draggable="false">`
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
  const marks = card.type === "char"
    ? (card.keywords || []).filter(k => KEYWORDS[k]).map(k => `<i class="mk mk-${k}">${KEYWORDS[k].short}</i>`).join("")
      + (card.armor ? `<i class="mk mk-armor">甲${card.armor}</i>` : "")
    : "";
  const cost = o.cost != null ? o.cost : card.cost;
  const guard = card.type === "char" && (card.keywords || []).includes("guard");
  return `<${tag} ${o.static ? "" : 'type="button"'} class="card w-${esc(card.world)} rar-${esc(card.rarity || "common")} ${card.type} ${card.art && !o.hidden ? "has-art" : ""} ${o.hidden ? "unknown" : ""} ${guard ? "guard" : ""} ${u && u.frozen ? "frozen" : ""} ${o.cls || ""}" ${o.attrs || ""} aria-label="${esc(card.name)}">
    <span class="art">${art}</span>
    <span class="frame" aria-hidden="true"></span><span class="crest" aria-hidden="true"></span>
    ${["ur", "legend"].includes(card.rarity) ? `<span class="shine" aria-hidden="true"></span>` : ""}
    ${o.showCost === false ? "" : `<span class="cost ${cost < card.cost ? "down" : ""}"><i>${cost}</i></span>`}
    ${marks ? `<span class="marks">${marks}</span>` : ""}
    ${u && u.frozen ? `<span class="frz">凍結</span>` : ""}
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
    // 1デッキに入れられる上限（0なら使えない）。古い形式の copies（共通山札の枚数）からも読める
    limit: Math.max(0, c.limit != null ? +c.limit || 0 : c.copies != null ? Math.min(3, +c.copies || 0) : 3),
    rarity: RARITY[c.rarity] ? c.rarity : (+c.cost >= 7 ? "legend" : +c.cost >= 5 ? "rare" : "common"),
    keywords: Array.isArray(c.keywords) ? c.keywords.filter(k => KEYWORDS[k]) : [],
    armor: c.type === "spell" ? 0 : Math.max(0, Math.min(9, +c.armor || 0)),
    pay: c.pay && PAYS[c.pay.kind] ? { kind: c.pay.kind, n: Math.max(1, +c.pay.n || 1) } : null,
    effects: Array.isArray(c.effects) ? c.effects.filter(e => EFFECTS[e.kind]).map(e => ({ kind: e.kind, n: Math.max(EFFECTS[e.kind].min ?? 1, +e.n || 0) })) : [],
    note: c.note ? String(c.note) : "",
    art: c.art ? String(c.art) : ""
  })).filter(c => c.id);
  const decks = (Array.isArray(d.decks) ? d.decks : []).filter(x => x && x.id && x.cards).map(x => ({
    id: String(x.id), name: String(x.name || "デッキ"), cards: cleanDeckCards(x.cards),
    level: ["easy", "normal", "hard"].includes(x.level) ? x.level : "normal"
  }));
  const packs = (Array.isArray(d.packs) ? d.packs : []).filter(x => x && x.id).map(x => ({
    id: String(x.id), name: String(x.name || "パック"), price: Math.max(0, +x.price || 0), size: Math.max(1, Math.min(10, +x.size || 5)),
    cards: Array.isArray(x.cards) ? x.cards.map(String) : [],
    odds: {
      normal: Object.assign({}, DEFAULT_ODDS.normal, (x.odds && x.odds.normal) || {}),
      last: Object.assign({}, DEFAULT_ODDS.last, (x.odds && x.odds.last) || {})
    },
    open: x.open !== false
  }));
  config.SAMPLE_DECKS = config.SAMPLE_DECKS !== false;
  config.SEASON = String(config.SEASON || "beta").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "beta";
  // シリアルコード。コードそのものは入れず、ハッシュ（h）だけを公開データに置く
  const serials = (Array.isArray(d.serials) ? d.serials : []).filter(x => x && /^[0-9a-f]{64}$/.test(x.h)).map(x => ({
    h: x.h, label: String(x.label || "シリアルコード").slice(0, 30),
    gold: Math.max(0, Math.floor(+x.gold || 0)), cards: cleanDeckCards(x.cards),
    until: /^\d{4}-\d{2}-\d{2}$/.test(x.until || "") ? x.until : "", created: x.created || ""
  }));
  return { version: +d.version || 1, updated: d.updated || "", config, cards, decks, packs, serials };
}

function cleanDeckCards(cards) {
  const o = {};
  Object.entries(cards || {}).forEach(([k, v]) => { v = Math.floor(+v || 0); if (v > 0) o[String(k)] = v; });
  return o;
}

/* デッキの枚数とルール違反を調べる。cardsById は id→カード */
function deckCount(deck) { return Object.values(deck.cards || {}).reduce((s, n) => s + n, 0); }
function deckProblems(deck, cardsById, config, owned) {
  const probs = [];
  if (deck.free) {
    if (!config.SAMPLE_DECKS) probs.push("サンプルデッキは今は使えません（ベータ期間が終わりました）");
    owned = null; // サンプルデッキは所持数を問わない
  }
  const total = deckCount(deck);
  if (total !== config.DECK_SIZE) probs.push(`${config.DECK_SIZE}枚ちょうどにしてください（今 ${total}枚）`);
  Object.entries(deck.cards || {}).forEach(([id, n]) => {
    const c = cardsById[id];
    if (!c || c.limit <= 0) probs.push("今は使えないカードが入っています");
    else if (n > cardLimit(c, config, deck)) probs.push(`${c.name}は${cardLimit(c, config, deck)}枚までです`);
    else if (owned && n > owned(id)) probs.push(`${c.name}を${n}枚持っていません（所持${owned(id)}枚）`);
  });
  return [...new Set(probs)];
}
function cardLimit(c, config, deck) {
  // サンプルデッキでは、カードごとの上限に関係なく「同じカードを入れられる上限」まで入れられる
  if (deck && deck.free && config.SAMPLE_DECKS) return config.COPY_MAX;
  return Math.min(c.limit, config.COPY_MAX);
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

/* デッキコード（デッキを文字列にして受け渡す） */
/* デッキコード
   KYK2:<名前とカードをbase64url>  … 短く、URLやLINEに貼っても壊れにくい形（2026-10〜）
   KYK1:<JSONをbase64>              … 以前の形。読み込みだけ対応 */
const b64urlEnc = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDec = str => decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4))));
function deckToCode(deck) {
  const body = String(deck.name || "デッキ").replace(/[|]/g, "") + "|" + Object.entries(deck.cards || {}).filter(([, n]) => n > 0).map(([id, n]) => n > 1 ? `${id}*${n}` : id).join(",");
  return "KYK2:" + b64urlEnc(body);
}
function codeToDeck(code) {
  // 貼り付けたときに入りがちな改行・空白・全角のコロンを取り除き、文章の中からコードの部分だけを探す
  const t = String(code || "").replace(/[\s\u200b]+/g, "").replace(/：/g, ":");
  let m = t.match(/KYK2:([A-Za-z0-9_-]+)/);
  if (m) {
    try {
      const body = b64urlDec(m[1]);
      const i = body.indexOf("|"); if (i < 0) return null;
      const cards = {};
      body.slice(i + 1).split(",").filter(Boolean).forEach(x => { const [id, n] = x.split("*"); cards[id] = (cards[id] || 0) + Math.max(1, Math.min(99, +n || 1)); });
      return { name: body.slice(0, i).slice(0, 16) || "デッキ", cards: cleanDeckCards(cards) };
    } catch { return null; }
  }
  m = t.match(/KYK1:([A-Za-z0-9+/=]+)/);
  if (!m) return null;
  try { const o = JSON.parse(decodeURIComponent(escape(atob(m[1])))); return { name: String(o.n || "デッキ").slice(0, 16), cards: cleanDeckCards(o.c) }; }
  catch { return null; }
}

/* クリップボードにコピー。使えない環境では、選択してコピーする方法に切り替える */
function copyText(text) {
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; ta.style.top = "0";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    return ok;
  };
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallback());
  return Promise.resolve(fallback());
}
