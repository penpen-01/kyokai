/* =========================================================
   境界の召喚士 — ゲームと編集ページで共通の定義
   ========================================================= */

/* 日本語の変換中か（入力欄の作り直しは変換が終わってから） */
const IME = { on: false };
if (typeof document !== "undefined") {
  document.addEventListener("compositionstart", () => { IME.on = true; }, true);
  document.addEventListener("compositionend", () => { IME.on = false; }, true);
}
/* 検索用：カタカナをひらがなに、英字を小文字にそろえる（「どらごん」で「ドラゴン」も見つかるように） */
const kanaFold = s => String(s || "").normalize("NFKC").toLowerCase().replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
const textHas = (text, q) => !q || kanaFold(text).includes(kanaFold(q));
const WORLDS = { myth: "神話", fan: "幻想", mech: "機械" };
// 無属性（境界の欠片など）。表示の名前だけ引けるようにして、一覧や絞り込み（Object.keys など）には出さない
Object.defineProperty(WORLDS, "none", { value: "無属性", enumerable: false });
const TYPES = { char: "キャラクター", spell: "魔法" };
/* 弾（カードとパックの区分）。第2弾以降は、パック開放戦に勝つまでプレイヤーには見せない */
/* 弾は「1」「2-1」「2-2」「2-3」「3」のような文字。第2弾は世界ごとに3つ（2-1・2-2・2-3）に分かれて出る。
   第1弾以外は、その弾のパック開放戦に勝つまでプレイヤーに見せない（開放はパックの弾ごと） */
const SETS = { "1": "第1弾", "2-1": "第2弾-1", "2-2": "第2弾-2", "2-3": "第2弾-3", "3": "第3弾" };
const SET_KEYS = ["1", "2-1", "2-2", "2-3", "3"];   // 並び順（SETS を Object.entries で回すと "1","3" が先に来てしまうので、必ずこちらを使う）
const setName = s => SETS[s || "1"] || `第${String(s).replace("-", "弾-")}${String(s).includes("-") ? "" : "弾"}`;
const normSet = v => { const s = String(v ?? "").trim(); return /^\d{1,2}(-\d{1,2})?$/.test(s) && s !== "1" ? s : ""; };
/* 運営用アカウント（工房に登録した引き継ぎコードのアカウント。2026-11-16）
   メンテナンス中も入れる・全カードを3枚ずつ持っている扱い・まだ開放していない弾や非公開のボスも見える */
const Ops = { admin: false };   // 運営用アカウントで入っているか（工房の Admin とは別）
const adminOn = () => !!Ops.admin;
async function adminHash(code) {
  const c = String(code || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("kyokai-admin:" + c));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function setOpen(s) {
  if (!s || s === "1") return true;
  if (adminOn()) return true;
  if (typeof DATA_INFO !== "undefined" && DATA_INFO.draft) return true;   // 試遊中（?draft）はすべて見える
  return typeof Account !== "undefined" && !!(Account.data && (Account.data.opened || []).includes(s));
}
/* プレイヤーに見せてよいカード（開放していない弾のカードは、一覧・デッキ作り・交換に出さない。持っていれば見せる） */
/* 超級の隠しボス（冥府の剣鬼）の限定レジェンド：BOSS_EX_ON が 0 の間は、どこにも出さない（できあがるまで隠す。2026-11-13 オーナー） */
const BOSS_EX_CARDS = ["b-y-valk", "b-y-murasame", "b-y-zantetsu"];
const bossExOn = () => adminOn() || !!(typeof CONFIG !== "undefined" && CONFIG.BOSS_EX_ON);
/* ショップ限定カード（店員のカードなど）：LIMITED_ON が 0 の間は、持っている人と運営にしか見せない（2026-11-18） */
const limitedOn = () => adminOn() || !!(typeof CONFIG !== "undefined" && CONFIG.LIMITED_ON);
const cardShown = c => !!c && !(BOSS_EX_CARDS.includes(c.id) && !bossExOn()) && !(c.shop && !limitedOn() && !(typeof Account !== "undefined" && Account.data && Account.owned(c.id) > 0)) && (setOpen(c.set) || (typeof Account !== "undefined" && Account.data && Account.owned(c.id) > 0));
/* パック開放戦のルール（パックごとに決める）。今は「世界限定」と「制限なし」。あとでレア度の制限・相手の特殊ルールなどを足す */
const GATE_RULES = {
  world: { label: "世界限定", text: p => `使えるのは、30枚すべて${WORLDS[p.gateWorld] || "決めた世界"}のカードで組んだデッキだけ。`, deckOK: (p, d) => deckWorld(d) === p.gateWorld },
  free:  { label: "制限なし", text: () => "自分のデッキなら、どれでも使える。", deckOK: () => true },
  // 第3弾（2026-11-24）：第2弾までのカードだけ・レア度ごとに枚数の上限（p.gateCap で変えられる）
  set2cap: { label: "第2弾まで・レア度制限", text: p => { const c = gateCapOf(p); return `使えるのは、第1弾と第2弾のカードだけで組んだデッキ。さらに、レジェンドは${c.legend}枚・URは${c.ur}枚・SRは${c.sr}枚まで。`; },
    deckOK: (p, d) => { const c = gateCapOf(p), n = { legend: 0, ur: 0, sr: 0 }; let ok = true;
      Object.entries((d && d.cards) || {}).forEach(([id, k]) => { const x = cardRef(id); if (!x || !(+k > 0)) return; if (!["1", "2-1", "2-2", "2-3"].includes(x.set || "1")) ok = false; if (n[x.rarity] != null) n[x.rarity] += +k; });
      return ok && n.legend <= c.legend && n.ur <= c.ur && n.sr <= c.sr; } }
};
const gateCapOf = p => ({ legend: 1, ur: 2, sr: 6, ...((p && p.gateCap) || {}) });

/* キャラクターの能力（キーワード） */
const KEYWORDS = {
  haste:   { label: "速攻", short: "速", text: "場に出したターンから攻撃できる（効果で複製したキャラは除く）。" },
  rush:    { label: "突進", short: "突", text: "場に出したターンから、相手のキャラにだけ攻撃できる（相手プレイヤーへの攻撃は次のターンから）。" },
  pierce:  { label: "直撃", short: "直", text: "相手の守護を無視して、好きな相手キャラや相手プレイヤーを攻撃できる。" },
  trample: { label: "貫通", short: "貫", text: "キャラを攻撃して倒したとき、余ったダメージを相手プレイヤーに与える。" },
  guard:   { label: "守護", short: "守", text: "このキャラがいる間、相手は守護を持つキャラしか攻撃できない。" },
  stealth: { label: "隠密", short: "隠", text: "このキャラが攻撃するまで、相手はこのキャラを攻撃することも、効果の対象に選ぶこともできない（ランダムや全体への効果は受ける。隠密の守護は相手の攻撃をさえぎらない）。" },
  twice:   { label: "2回攻撃", short: "二", text: "1ターンに2回攻撃できる。" },
  shield:  { label: "聖盾", short: "盾", text: "最初に受けるダメージを1回だけ0にする（破壊の効果は防げない）。" },
  poison:  { label: "毒", short: "毒", text: "攻撃や反撃でダメージを与えたキャラを破壊する。" },
  lifesteal:{ label: "吸収", short: "吸", text: "自分から攻撃してキャラにダメージを与えたとき、その分（相手の残りの体力まで）自分の体力を回復する。反撃やプレイヤーへの攻撃では回復しない。" },
  elusive: { label: "呪文耐性", short: "耐", text: "相手の魔法や効果で対象に選ばれない（ランダムな1体や全体への効果は受ける）。" },
  noattack:{ label: "不動", short: "不", text: "攻撃できない。" },
  regen:   { label: "再生", short: "再", text: "自分のターンの終わりに、体力が最大まで回復する。" },
  doom:    { label: "死の宣告", short: "死", text: "場に出した次の自分のターンの終わりに破壊される。" },
  // 第3弾（2026-11-24）
  ghost:   { label: "亡霊", short: "霊", text: "攻撃したあと、破壊される。墓地の亡霊は「墓地から選んで出す」効果で呼び戻せる。" },
  steadfast:{ label: "不屈", short: "屈", text: "攻撃力・体力を下げる効果と、行動不能（攻撃できなくする効果）を受けない（沈黙は受ける）。" },
  unbreakable:{ label: "不壊", short: "壊", text: "効果で破壊されない（ダメージで体力が0になると倒れる）。" },
  // 1枚だけの能力は「名前のついた能力」にしない（オーナー 11-24）。仕組みは能力と同じで、カードには plain の文だけを出す
  reef:    { label: "効果ダメージ無効", short: "", plain: "魔法や効果のダメージを受けない（攻撃と反撃のダメージは受ける）。", text: "魔法や効果のダメージを受けない（攻撃と反撃のダメージは受ける）。" },
  calm:    { label: "出たターンの攻撃を封じる", short: "", plain: "このキャラが場にいる間、相手は場に出したターンのキャラで攻撃できない（速攻・突進も）。", text: "このキャラが場にいる間、相手は場に出したターンのキャラで攻撃できない（速攻・突進も）。" },
  dive:    { label: "亜空間に潜る", short: "", plain: "自分のターンの終わりに亜空間へ潜り、次の自分のターンの始めに同じ場所へ戻る（戻ったターンも攻撃できる。潜るのは2回まで）。潜っている間は、攻撃も効果も受けない。", text: "自分のターンの終わりに亜空間へ潜り、次の自分のターンの始めに同じ場所へ戻る（戻ったターンも攻撃できる）。" },
  surf:    { label: "攻撃したあと手札に戻る", short: "", plain: "攻撃したあと、持ち主の手札に戻る（トークンは消える）。", text: "攻撃したあと、持ち主の手札に戻る（トークンは消える）。" }
};
const kwPlain = k => !!(KEYWORDS[k] && KEYWORDS[k].plain);
/* 種族（第3弾）：card.tribe。効果の絞り込み（e.tribe）や数える条件で使う */
const TRIBES = { jelly: "クラゲ", beast: "海獣" };
const tribeOf = c => (c && c.tribe) || "";
/* クラゲ魔法：tribe が jelly の魔法。ランダムに手に入るのは pool の3種類（満ち潮の夜は入らない） */
const JELLY_POOL = ["tk-j-needle", "tk-j-cradle", "tk-j-flash"];
const isJellySpell = c => !!c && c.type === "spell" && c.tribe === "jelly";
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
/* 効果の文で使う：カード名（ゲームでは DEF、工房では DATA から探す）・世界・能力の名前 */
const cardRef = id => (typeof DEF !== "undefined" && DEF[id]) || (typeof DATA !== "undefined" && DATA && Array.isArray(DATA.cards) && DATA.cards.find(c => c.id === id)) || null;
const tokName = e => { const c = e && e.card && cardRef(e.card); return c ? c.name : "（トークン未設定）"; };
/* 「名前」（攻撃/体力） */
const tokDesc = e => { const c = e && e.card && cardRef(e.card); return `「${tokName(e)}」${c && c.type === "char" ? `（${c.atk}/${c.hp}）` : ""}`; };
const worldNo = e => (e && WORLDS[e.world] ? WORLDS[e.world] + "の" : "");
/* コストの範囲（n＝上限。10以上なら上限なし。cmin＝下限）："コスト3以下の" "コスト3以上の" "コスト3〜5の" */
const costRange = (n, e, keepHi) => { const lo = e && +e.cmin > 0 ? +e.cmin : 0, hi = n >= 10 && !keepHi ? 0 : n;
  return lo && hi ? (lo >= hi ? `コスト${hi}の` : `コスト${lo}〜${hi}の`) : lo ? `コスト${lo}以上の` : hi ? `コスト${hi}以下の` : ""; };
const inCost = (c, n, e) => c.cost <= (n >= 10 ? 99 : n) && c.cost >= (e && +e.cmin > 0 ? +e.cmin : 0);
const ctypeName = e => (e && e.ctype === "char" ? "キャラ" : e && e.ctype === "spell" ? "魔法" : "カード");
const kwName = e => (!e ? "能力" : e.kw === "armor" ? `装甲${e.n}` : KEYWORDS[e.kw] ? KEYWORDS[e.kw].label : "（能力未設定）");
const effNoN = (def, e) => (typeof def.noN === "function" ? def.noN(e) : !!def.noN);

const EFFECTS = {
  /* 汎用：「何をするか（act）」と「だれに（to / who）」を選ぶ。2026-11-05 から効果はこの形が基本（古い種類は読み込むときにこの形へ置き換える） */
  unit:        { group: "キャラ", label: "キャラに効果（何をするか・対象を選ぶ）", text: (n, e) => unitText(e), opts: ["act", "to"], min: -20, noN: e => !UACTS[e && e.act] || (!UACTS[e.act].n && !(e.act === "grant" && e.kw === "armor")) },
  player:      { group: "プレイヤー", label: "プレイヤーに効果（ダメージ・回復・ドロー・捨てる）", text: (n, e) => playerText(e), opts: ["pact", "who"] },
  merge:       { group: "トークン", label: "合体（場の部品を破壊して、キャラを出す）", text: (n, e) => `自分の場に「${tokName(e)}」が${n}体以上いれば、それを${n}体破壊して、${intoDesc(e)}を出す（登場時の効果も発動する）。`, opts: ["token", "into"], tokenType: "char" },
  costDown:    { group: "エナジー", label: "手札のカードのコストを下げる（このターン・ずっと）", text: (n, e) => `${e && e.dur === "game" ? "" : "このターン、"}今の自分の手札の${worldNo(e)}${ctypeName(e)}すべてのコストを${n}下げる（0より下がらない${e && e.dur === "game" ? "。手札にある間ずっと" : ""}）。`, opts: ["world", "ctype", "dur"] },
  wakeTimer:   { group: "このキャラ", label: "目覚め（自分のターンの始めをN回むかえると、このキャラは沈黙する＝不動などが解ける）", text: n => `自分のターンの始めを${n}回むかえると、このキャラは沈黙する（不動などの能力が消え、攻撃できるようになる）。`, self: true },
  recycle:     { group: "ドロー", label: "自分の墓地のキャラを山札に戻す（N枚）", text: (n, e) => `自分の墓地の${worldNo(e)}キャラを${n}枚まで、山札に混ぜる。`, opts: ["world"] },
  peekDiscard: { group: "妨害", label: "相手の手札を見て、いちばんコストの高いカードを捨てさせる", text: () => "相手の手札をすべて見て、いちばんコストの高いカード1枚を捨てさせる。", noN: true },
  winTimer:    { group: "このキャラ", label: "特殊勝利（場にいるまま、自分のターンの始めをN回むかえると勝ち）", text: n => `このキャラが場にいるまま、自分のターンの始めを${n}回むかえると、勝利する（場を離れると数え直し）。`, self: true },
  draw:        { legacy: true, group: "ドロー", label: "カードを引く",                  text: n => `カードを${n}枚引く。` },
  refresh:     { group: "ドロー", label: "手札を入れ替える",              text: n => n ? `手札をすべて山札に戻して切り直し、その枚数より${n}枚多く引く。` : "手札をすべて山札に戻して切り直し、同じ枚数を引く。", min: 0 },
  discard:     { legacy: true, group: "妨害",   label: "相手の手札を捨てさせる",        text: n => `相手の手札をランダムに${n}枚捨てさせる。` },
  dmgTarget:   { legacy: true, group: "ダメージ", label: "選んだ相手キャラにダメージ",  text: n => `相手キャラ1体に${n}ダメージ。`, target: "enemyUnit" },
  dmgRandom:   { legacy: true, group: "ダメージ", label: "ランダムな相手キャラにダメージ", text: n => `ランダムな相手キャラ1体に${n}ダメージ。` },
  dmgAll:      { legacy: true, group: "ダメージ", label: "相手キャラ全体にダメージ",    text: n => `相手キャラ全体に${n}ダメージ。` },
  dmgAllBoth:  { legacy: true, group: "ダメージ", label: "全キャラにダメージ（自分側も）", text: n => `すべてのキャラ（自分のキャラも含む）に${n}ダメージ。` },
  dmgFace:     { legacy: true, group: "ダメージ", label: "相手プレイヤーにダメージ",    text: n => `相手プレイヤーに${n}ダメージ。` },
  destroyTarget: { legacy: true, group: "除去", label: "選んだ相手キャラを破壊",       text: () => "相手キャラ1体を破壊する。", target: "enemyUnit", noN: true },
  destroyAll:  { legacy: true, group: "除去",   label: "全キャラを破壊（自分側も）",    text: () => "すべてのキャラ（自分のキャラも含む）を破壊する。", noN: true },
  freezeTarget:{ legacy: true, group: "妨害",   label: "選んだ相手キャラを行動不能に",  text: () => "相手キャラ1体は、次の相手のターンに攻撃できない。", target: "enemyUnit", noN: true },
  freezeAll:   { legacy: true, group: "妨害",   label: "相手キャラ全体を行動不能に",    text: () => "相手キャラ全体は、次の相手のターンに攻撃できない。", noN: true },
  debuffTarget:{ legacy: true, group: "妨害",   label: "選んだ相手キャラの攻撃力を下げる", text: n => `相手キャラ1体の攻撃力を-${n}する。`, target: "enemyUnit" },
  debuffAll:   { legacy: true, group: "妨害",   label: "相手キャラ全体の攻撃力を下げる", text: n => `相手キャラ全体の攻撃力を-${n}する。` },
  buffAtk:     { legacy: true, group: "強化",   label: "自分のキャラの攻撃力を上げる",  text: n => `自分のキャラ1体の攻撃力を+${n}する。`, target: "ownUnit" },
  buffHp:      { legacy: true, group: "強化",   label: "自分のキャラの体力を上げる",    text: n => `自分のキャラ1体の体力を+${n}する。`, target: "ownUnit" },
  buffBoth:    { legacy: true, group: "強化",   label: "自分のキャラを+N/+N",           text: n => `自分のキャラ1体を+${n}/+${n}する。`, target: "ownUnit" },
  buffAllAtk:  { legacy: true, group: "強化",   label: "自分のキャラ全体の攻撃力を上げる", text: (n, e) => `自分の${worldNo(e)}キャラ全体の攻撃力を+${n}する。`, opts: ["world"] },
  buffAllBoth: { legacy: true, group: "強化",   label: "自分のキャラ全体を+N/+N",       text: (n, e) => `自分の${worldNo(e)}キャラ全体を+${n}/+${n}する。`, opts: ["world"] },
  heal:        { legacy: true, group: "回復",   label: "自分の体力を回復",              text: n => `自分の体力を${n}回復する。` },
  healUnits:   { legacy: true, group: "回復",   label: "自分のキャラ全体を回復",        text: n => `自分のキャラ全体の体力を${n}回復する。` },
  ramp:        { group: "エナジー", label: "エナジー最大値を増やす",      text: n => `エナジーの最大値を${n}増やす（上限まで）。` },
  energyNow:   { group: "エナジー", label: "このターンのエナジーを増やす", text: n => `このターンだけ、エナジーを${n}得る。` },
  discount:    { group: "エナジー", label: "次に使うカードのコストを下げる", text: n => `次に使うカード1枚のコストを${n}下げる。` },
  summon:      { group: "召喚",   label: "山札からキャラを無料で出す",    text: (n, e) => `山札から${costRange(n, e, true)}キャラをランダムに1体、コストを払わずに出す。`, opts: ["cmin"] },
  buffSelfAtk: { legacy: true, group: "このキャラ", label: "このキャラの攻撃力を上げる", text: n => `このキャラの攻撃力を+${n}する。`, self: true },
  buffSelfBoth:{ legacy: true, group: "このキャラ", label: "このキャラを+N/+N",          text: n => `このキャラを+${n}/+${n}する。`, self: true },
  readySelf:   { group: "このキャラ", label: "このキャラはもう一度攻撃できる", text: () => "このキャラは、このターンもう一度攻撃できる。", self: true, noN: true },
  grantSelf:   { legacy: true, group: "このキャラ", label: "このキャラに能力を与える",   text: (n, e) => `このキャラに「${kwName(e)}」を与える。`, self: true, opts: ["kw"], noN: e => !e || e.kw !== "armor" },
  grantOwn:    { legacy: true, group: "能力",   label: "自分のキャラ1体に能力を与える", text: (n, e) => `自分のキャラ1体に「${kwName(e)}」を与える。`, target: "ownUnit", opts: ["kw"], noN: e => !e || e.kw !== "armor" },
  grantAll:    { legacy: true, group: "能力",   label: "自分のキャラ全体に能力を与える", text: (n, e) => `自分の${worldNo(e)}キャラ全体に「${kwName(e)}」を与える。`, opts: ["kw", "world"], noN: e => !e || e.kw !== "armor" },
  tokenField:  { group: "トークン", label: "トークンを場に出す",         text: (n, e) => `${tokDesc(e)}を${n}体出す。`, opts: ["token"], tokenType: "char" },
  tokenHand:   { group: "トークン", label: "トークンを手札に加える",     text: (n, e) => `${tokDesc(e)}を${n}枚手札に加える。`, opts: ["token"] },
  dig:         { group: "ドロー", label: "山札の上からN枚見て、1枚を選んで手札に加える", text: (n, e) => `山札の上から${n}枚を見て、1枚を選んで手札に加える（残りは${e && e.rest === "grave" ? "墓地" : "山札の下"}へ）。`, min: 2 },
  buffCard:    { group: "トークン", label: "決めたカード（トークン）を強化する", text: (n, e) => `自分の${tokDesc(e).replace(/（[^）]*）$/, "")}を+${n}/+${n}する。`, opts: ["token"], tokenType: "char" },
  mendCard:    { group: "トークン", label: "決めたカード（トークン）を全回復して強化する（いなければ出す）", text: (n, e) => `自分の${tokDesc(e).replace(/（[^）]*）$/, "")}の体力を全回復させ、+${n}/+${n}する。場にいなければ、${tokDesc(e)}を1体出す。`, opts: ["token"], tokenType: "char" },
  callCard:    { group: "トークン", label: "決めたカード（トークン）が場にいなければ出す", text: (n, e) => `自分の場に${tokDesc(e).replace(/（[^）]*）$/, "")}がいなければ、${tokDesc(e)}を1体出す。`, opts: ["token"], tokenType: "char" },
  tutor:       { group: "ドロー", label: "山札から種類を指定して手札に加える", text: (n, e) => `山札から${costRange(n, e)}${worldNo(e)}${e && e.tribe && TRIBES[e.tribe] ? `【${TRIBES[e.tribe]}】の` : ""}${ctypeName(e)}をランダムに1枚手札に加える。`, opts: ["world", "ctype", "cmin"], min: 0 },
  bounceEnemy: { legacy: true, group: "除去",   label: "相手キャラを手札に戻す",       text: () => "相手キャラ1体を持ち主の手札に戻す（トークンは消える）。", target: "enemyUnit", noN: true },
  shuffleEnemy:{ legacy: true, group: "除去",   label: "相手キャラを相手の山札に混ぜる", text: () => "相手キャラ1体を相手の山札に混ぜる（トークンは消える）。", target: "enemyUnit", noN: true },
  transform:   { legacy: true, group: "除去",   label: "相手キャラを変身させる",       text: (n, e) => e && e.card ? `相手キャラ1体を${tokDesc(e)}に変身させる。` : "相手キャラ1体を、効果も能力もない1/1に変身させる。", target: "enemyUnit", noN: true, opts: ["token"], tokenType: "char", tokenOptional: true },
  steal:       { legacy: true, group: "除去",   label: "相手キャラを奪う",             text: () => "相手キャラ1体を奪う（自分の場に空きがあるときだけ。奪ったターンは攻撃できない）。", target: "enemyUnit", noN: true },
  silence:     { legacy: true, group: "妨害",   label: "相手キャラを沈黙させる",       text: () => "相手キャラ1体を沈黙させる（効果と能力をすべて失う）。", target: "enemyUnit", noN: true },
  silenceAll:  { legacy: true, group: "妨害",   label: "相手キャラ全体を沈黙させる",   text: () => "相手キャラ全体を沈黙させる（効果と能力をすべて失う）。", noN: true },
  silenceOwn:  { legacy: true, group: "強化",   label: "自分のキャラを沈黙させる",     text: () => "自分のキャラ1体を沈黙させる（効果と能力をすべて失う。不動や死の宣告も消える）。", target: "ownUnit", noN: true },
  swapEnemy:   { legacy: true, group: "妨害",   label: "相手キャラの攻撃力と体力を入れ替える", text: () => "相手キャラ1体の攻撃力と体力を入れ替える。", target: "enemyUnit", noN: true },
  swapOwn:     { legacy: true, group: "強化",   label: "自分のキャラの攻撃力と体力を入れ替える", text: () => "自分のキャラ1体の攻撃力と体力を入れ替える。", target: "ownUnit", noN: true },
  bounceOwn:   { legacy: true, group: "強化",   label: "自分のキャラを手札に戻す",     text: () => "自分のキャラ1体を手札に戻す（トークンは消える）。", target: "ownUnit", noN: true },
  revive:      { group: "召喚",   label: "自分の墓地のキャラを復活させる", text: (n, e) => `自分の墓地の${costRange(n, e, true)}キャラをランダムに1体、場に出す（登場時効果は発動しない）。`, opts: ["cmin"] },
  banishOwn:   { group: "亜空間", label: "自分のキャラをすべて亜空間に送る", text: () => "自分のキャラをすべて亜空間に送る。次の自分のターンの開始時に、元の場所に戻る（受けたダメージや強化はそのまま。登場時効果は発動しない）。戻るまで、その場所にはキャラを出せない。", noN: true },
  // ---- 第3弾（2026-11-24）。工房ではまだ細かい設定（種族・亡霊など）を変えられない。数値とトークンだけ ----
  toss:        { group: "墓地", label: "自分の手札の（種類の）カードを1枚選んで捨てる", text: (n, e) => `自分の手札の${ctypeName(e)}を1枚選んで捨てる。`, opts: ["ctype"] },
  mill:        { group: "墓地", label: "自分の山札の上からN枚を墓地へ送る", text: n => `自分の山札の上から${n}枚を墓地へ送る。` },
  peekMill:    { group: "墓地", label: "山札の上1枚を見て、亡霊のキャラなら墓地へ送る", text: () => "自分の山札の上1枚を見る。それが【亡霊】のキャラなら墓地へ送る（ちがえば、そのまま山札の上に残す）。", noN: true },
  reviveSel:   { group: "召喚", label: "自分の墓地の亡霊を選んで出す", text: (n, e) => reviveSelText(e) },
  graveHand:   { group: "墓地", label: "自分の墓地の亡霊のキャラを手札に戻す", text: n => `自分の墓地の【亡霊】のキャラをランダムに${n}体、手札に戻す。` },
  ward:        { group: "プレイヤー", label: "自分に結界を張る", text: () => "自分に【結界】を張る（次に自分が受けるダメージを1回だけ0にする。重ねて張れない）。", noN: true },
  jellyHand:   { group: "トークン", label: "クラゲ魔法をランダムに手札に加える", text: n => `「クラゲ魔法」をランダムに${n}枚手札に加える（痺れ針・泡の揺りかご・青い閃光のどれか）。` },
  tide:        { group: "ダメージ", label: "満ち潮の夜（使ったクラゲ魔法の数×N）", text: n => `この対戦で自分が先に使ったクラゲ魔法1枚につき${n}、相手プレイヤーにダメージ（最大12）。` },
  cutOne:      { group: "エナジー", label: "手札の（種族の）カード1枚のコストを下げる", text: (n, e) => `自分の手札の${e && e.tribe ? `【${TRIBES[e.tribe]}】の` : ""}${ctypeName(e)}を1枚選んで、そのコストを${n}下げる。` },
  handSteal:   { group: "妨害", label: "相手の手札をランダムに1枚奪う（コストを下げる）", text: n => `相手の手札からランダムに1枚を奪って手札に加え、そのカードのコストを${n}下げる。` },
  handTax:     { group: "妨害", label: "相手の手札を1枚見て、コストを上げる", text: n => `相手の手札をランダムに1枚見て、そのカードのコストを${n}上げる。` },
  cheat:       { group: "召喚", label: "手札の（種族の）キャラを無料で出す（次の自分のターンも攻撃できない）", text: (n, e) => `自分の手札の${e && e.tribe ? `【${TRIBES[e.tribe]}】の` : ""}キャラを1体選んで、コストを払わずに出す（登場時の効果も発動する。対象はランダム）。そのキャラは次の自分のターンの終わりまで攻撃できない。`, noN: true },
  pact:        { group: "除去", label: "自分のキャラを好きな数破壊し、同じ数の相手キャラを破壊", text: () => "自分のキャラを好きな数選んで破壊する。同じ数だけ、相手キャラをランダムに破壊する。", noN: true },
  scales:      { group: "除去", label: "おたがいの、元のコストが一番高いキャラを破壊", text: () => "おたがいの場で、元のコストが一番高いキャラを1体ずつ破壊する（同じなら、その中からランダム）。", noN: true }
};
/* 墓地から選んで出す効果の文（cnt：体数、n：1体ごとのコストの上限、total：合計コストの上限） */
function reviveSelText(e) {
  e = e || {};
  const cnt = e.cnt || 1, each = e.n && e.n < 10 ? `コスト${e.n}以下の` : "", tot = e.total ? `（合計コスト${e.total}以下）` : "";
  const what = `自分の墓地の${each}【亡霊】のキャラ`;
  const mod = e.mod === "rusty" ? "そのキャラは【亡霊】を失い、装甲1を得る。" : e.mod === "rush" ? "出したキャラは「突進」を得る。" : "";
  return `${what}を${cnt > 1 ? `${cnt}体まで` : "1体"}選んで、場に出す（${tot ? tot.slice(1, -1) + "。" : ""}登場時の効果は発動しない）。${mod}`;
}

/* 汎用「キャラに効果」の、何をするか（act）。n：数値を使う、signed：マイナスも使える、faceOK：「リーダーかキャラ」を選べる */
const UACTS = {
  dmg:       { label: "ダメージを与える", n: true, faceOK: true },
  destroy:   { label: "破壊する" },
  freeze:    { label: "行動不能にする（次のターン攻撃できない）" },
  unfreeze:  { label: "行動不能を解除する（N＝解除したキャラの攻撃力を上げる量。0なら上げない）", n: true, zero: true },
  atk:       { label: "攻撃力を変える（−で下げる）", n: true, signed: true },
  hp:        { label: "体力を変える（−で下げる）", n: true, signed: true },
  both:      { label: "攻撃力と体力を変える（+N/+N、−も）", n: true, signed: true },
  heal:      { label: "体力を回復する", n: true },
  grant:     { label: "能力を与える", kw: true },
  silence:   { label: "沈黙させる（効果と能力を消す）" },
  bounce:    { label: "手札に戻す" },
  shuffle:   { label: "山札に混ぜる" },
  banish:    { label: "亜空間に送る（持ち主の次のターンの始めに戻る）" },
  transform: { label: "変身させる", token: true },
  swap:      { label: "攻撃力と体力を入れ替える" },
  reset:     { label: "攻撃力と体力を元の数値に戻す（強化・弱化が消える。受けたダメージは残る）" },
  copy:      { label: "複製を自分の場に出す（今の状態ごと）" },
  steal:     { label: "奪う（相手キャラだけ）", enemyOnly: true },
  bottom:    { label: "持ち主の山札の一番下に戻す" }
};
/* だれに（to）。role：使うときに選ぶ対象の役割（enemy / own / any / enemyF） */
const UTOS = {
  enemy1:    { label: "選んだ相手キャラ", role: "enemy", side: "enemy" },
  own1:      { label: "選んだ自分のキャラ", role: "own", side: "own" },
  any1:      { label: "選んだキャラ（自分か相手）", role: "any" },
  enemyF:    { label: "選んだ相手（キャラか相手プレイヤー）", role: "enemyF", side: "enemy", faceOnly: true },
  enemyRand: { label: "ランダムな相手キャラ", side: "enemy" },
  enemyRandF:{ label: "ランダムな相手（キャラか相手プレイヤー）", side: "enemy" },
  anyRand:   { label: "このキャラ以外のランダムなキャラ（自分か相手）" },
  ownRand:   { label: "ランダムな自分のキャラ", side: "own" },
  enemyAll:  { label: "相手キャラ全体", side: "enemy", world: true },
  ownAll:    { label: "自分のキャラ全体", side: "own", world: true },
  all:       { label: "すべてのキャラ（自分のキャラも）", world: true },
  self:      { label: "このキャラ", side: "own", charOnly: true },
  foe:       { label: "攻撃する相手キャラ（「キャラを攻撃するとき」だけ）", side: "enemy", charOnly: true },
  enemy2:    { label: "選んだ2体目の相手キャラ（1体目とちがうキャラ。「2体まで」）", role: "enemy2", side: "enemy" },
  enemyLow:  { label: "元のコストが一番低い相手キャラ（同じならランダム）", side: "enemy" }
};
/* 効果の対象の絞り込み（第3弾）：e.cmax＝元のコストの上限、e.tribe＝種族、e.kwf＝能力（亡霊など） */
const filtNo = e => `${e && e.cmax != null ? `コスト${e.cmax}以下の` : ""}${worldNo(e)}${e && e.tribe && TRIBES[e.tribe] ? `【${TRIBES[e.tribe]}】の` : ""}${e && e.kwf && KEYWORDS[e.kwf] ? `【${KEYWORDS[e.kwf].label}】の` : ""}`;
/* 汎用「プレイヤーに効果」 */
const PACTS = { dmg: "ダメージを与える", heal: "体力を回復する", draw: "カードを引かせる", discard: "手札をランダムに捨てさせる" };
const PWHO = { opp: "相手", self: "自分", both: "おたがい" };
const intoDesc = e => { const c = e && e.into && cardRef(e.into); return c ? `「${c.name}」${c.type === "char" ? `（${c.atk}/${c.hp}）` : ""}` : "（合体先未設定）"; };
/* 対象の言い方。own は、キャラの効果ならそのキャラ自身は選べない */
function toPhrase(e, isChar, auto) {
  const w = filtNo(e), to = e.to;
  if (auto && to === "enemy1") return "ランダムな相手キャラ1体";
  if (auto && to === "own1") return isChar ? "このキャラ以外のランダムな自分のキャラ1体" : "ランダムな自分のキャラ1体";
  if (auto && to === "any1") return "ランダムなキャラ1体";
  if (auto && to === "enemyF") return "ランダムな相手キャラ1体か相手プレイヤー";
  return {
    enemy1: w ? `相手の${w}キャラ1体` : "相手キャラ1体", own1: isChar ? `このキャラ以外の自分の${w}キャラ1体` : `自分の${w}キャラ1体`, any1: isChar ? `このキャラ以外の${w}キャラ1体（自分か相手）` : `${w}キャラ1体（自分か相手）`,
    enemy2: w ? `もう1体の相手の${w}キャラ` : "もう1体の相手キャラ", enemyLow: `元のコストが一番低い相手の${w}キャラ1体`.replace("相手のキャラ", "相手キャラ"),
    foe: e.when === "attacked" ? "攻撃してきたキャラ" : e.when === "foeBack" ? "戻ってきたキャラ" : "攻撃する相手キャラ", enemyF: "相手キャラ1体か相手プレイヤー", enemyRand: "ランダムな相手キャラ1体", enemyRandF: "ランダムな相手キャラ1体か相手プレイヤー", anyRand: isChar ? "このキャラ以外のランダムなキャラ1体（自分か相手）" : "ランダムなキャラ1体（自分か相手）", ownRand: isChar ? "このキャラ以外のランダムな自分のキャラ1体" : "ランダムな自分のキャラ1体",
    enemyAll: `相手の${w}キャラ全体`.replace("相手のキャラ全体", "相手キャラ全体"), ownAll: `自分の${w}キャラ全体`, all: w ? `すべての${w}キャラ（自分のキャラも含む）` : "すべてのキャラ（自分のキャラも含む）", self: "このキャラ"
  }[to] || "（対象未設定）";
}
const sideOfTo = to => (UTOS[to] && UTOS[to].side) || "";
function unitText(e, T) {
  const a = e && e.act, n = e ? e.n : 0, sg = v => (v >= 0 ? "+" + v : String(v));
  T = T || toPhrase(e || {}, false, false);
  const side = sideOfTo(e && e.to);
  switch (a) {
    case "dmg": return `${T}に${n}ダメージ。`;
    case "destroy": return `${T}を破壊する。`;
    case "freeze": return side === "enemy" ? `${T}は、次の相手のターンに攻撃できない。` : side === "own" ? `${T}は、次の自分のターンに攻撃できない。` : `${T}は、持ち主の次のターンに攻撃できない。`;
    case "unfreeze": return e.n > 0 ? `${T}の行動不能を解除し、解除したキャラの攻撃力を+${e.n}する（このターンに攻撃できなかったキャラは、攻撃できるようになる）。` : `${T}の行動不能を解除する（このターンに攻撃できなかったキャラは、攻撃できるようになる）。`;
    case "atk": return `${T}の攻撃力を${sg(n)}する${e.turn ? "（このターンだけ）" : ""}。`;
    case "hp": return `${T}の体力を${sg(n)}する。`;
    case "both": return `${T}を${sg(n)}/${sg(n)}する。`;
    case "heal": return `${T}の体力を${n}回復する。`;
    case "grant": return `${T}に「${kwName(e)}」を与える${e.turn ? "（このターンだけ）" : e.mine ? "（次の自分のターンの始めまで）" : e.kw === "doom" ? "（持ち主の次のターンの終わりに破壊される）" : ""}。`;
    case "silence": return side === "own" ? `${T}を沈黙させる（効果と能力をすべて失う。不動や死の宣告も消える）。` : `${T}を沈黙させる（効果と能力をすべて失う）。`;
    case "bounce": return side === "own" ? `${T}を手札に戻す（トークンは消える）。` : `${T}を持ち主の手札に戻す（トークンは消える）。`;
    case "shuffle": return side === "enemy" ? `${T}を相手の山札に混ぜる（トークンは消える）。` : `${T}を持ち主の山札に混ぜる（トークンは消える）。`;
    case "transform": return e.card ? `${T}を${tokDesc(e)}に変身させる。` : `${T}を、効果も能力もない1/1に変身させる。`;
    case "swap": return `${T}の攻撃力と体力を入れ替える。`;
    case "reset": return `${T}の攻撃力と体力が、カードに書かれた元の数値に戻る（強化も弱化も消える。体力が元より減っていれば、減ったまま）。`;
    case "banish": return side === "own" ? `${T}を亜空間に送る（次の自分のターンの始めに、同じ場所に戻る）。` : side === "enemy" ? `${T}を亜空間に送る（相手の次のターンの始めに戻る）。` : `${T}を亜空間に送る（持ち主の次のターンの始めに戻る）。`;
    case "copy": return `${T}の複製を、自分の場に1体出す（受けたダメージ・強化・与えられた能力もそのまま写す。登場時の効果は発動しない）。`;
    case "steal": return `${T}を奪う（自分の場に空きがあるときだけ。奪ったターンは攻撃できない）。`;
    case "bottom": return `${T}を持ち主の山札の一番下に戻す（トークンは消える）。`;
  }
  return "（効果未設定）";
}
function playerText(e) {
  const n = e.n, w = e.who || "opp";
  switch (e.act) {
    case "dmg": return w === "opp" ? `相手プレイヤーに${n}ダメージ。` : w === "self" ? `自分に${n}ダメージ。` : `おたがいのプレイヤーに${n}ダメージ。`;
    case "heal": return w === "self" ? `自分の体力を${n}回復する。` : w === "opp" ? `相手の体力を${n}回復する。` : `おたがいの体力を${n}回復する。`;
    case "draw": return w === "self" ? `カードを${n}枚引く。` : w === "opp" ? `相手はカードを${n}枚引く。` : `おたがいにカードを${n}枚引く。`;
    case "discard": return w === "opp" ? `相手の手札をランダムに${n}枚捨てさせる。` : w === "self" ? `自分の手札をランダムに${n}枚捨てる。` : `おたがいの手札をランダムに${n}枚捨てる。`;
  }
  return "（効果未設定）";
}
/* 古い種類の効果を、汎用の形に置き換える（読み込むとき） */
const LEGACY_MAP = {
  draw: ["player", "draw", "self"], discard: ["player", "discard", "opp"], dmgFace: ["player", "dmg", "opp"], heal: ["player", "heal", "self"],
  dmgTarget: ["unit", "dmg", "enemy1"], dmgRandom: ["unit", "dmg", "enemyRand"], dmgAll: ["unit", "dmg", "enemyAll"], dmgAllBoth: ["unit", "dmg", "all"],
  destroyTarget: ["unit", "destroy", "enemy1"], destroyAll: ["unit", "destroy", "all"], freezeTarget: ["unit", "freeze", "enemy1"], freezeAll: ["unit", "freeze", "enemyAll"],
  debuffTarget: ["unit", "atk", "enemy1", -1], debuffAll: ["unit", "atk", "enemyAll", -1], buffAtk: ["unit", "atk", "own1"], buffHp: ["unit", "hp", "own1"], buffBoth: ["unit", "both", "own1"],
  buffAllAtk: ["unit", "atk", "ownAll"], buffAllBoth: ["unit", "both", "ownAll"], healUnits: ["unit", "heal", "ownAll"], buffSelfAtk: ["unit", "atk", "self"], buffSelfBoth: ["unit", "both", "self"],
  grantSelf: ["unit", "grant", "self"], grantOwn: ["unit", "grant", "own1"], grantAll: ["unit", "grant", "ownAll"], bounceEnemy: ["unit", "bounce", "enemy1"], bounceOwn: ["unit", "bounce", "own1"],
  shuffleEnemy: ["unit", "shuffle", "enemy1"], transform: ["unit", "transform", "enemy1"], steal: ["unit", "steal", "enemy1"], silence: ["unit", "silence", "enemy1"], silenceAll: ["unit", "silence", "enemyAll"],
  silenceOwn: ["unit", "silence", "own1"], swapEnemy: ["unit", "swap", "enemy1"], swapOwn: ["unit", "swap", "own1"]
};
function migrateEffect(e) {
  const m = LEGACY_MAP[e.kind]; if (!m) return e;
  const o = { ...e, kind: m[0], act: m[1] };
  if (m[0] === "unit") o.to = m[2]; else o.who = m[2];
  if (m[3] === -1) o.n = -Math.abs(+e.n || 1);
  return o;
}

/* キャラの効果が発動するタイミング（effect.when）。魔法はいつも「使ったとき」（play）。
   play 以外で対象を選ぶ効果は、対象をランダムに選ぶ */
const WHENS = {
  play:      { label: "登場時",                       head: "登場時" },
  death:     { label: "倒されたとき",                 head: "倒されたとき" },
  turnStart: { label: "自分のターンの始め",           head: "自分のターンの始めに" },
  turnEnd:   { label: "自分のターンの終わり",         head: "自分のターンの終わりに" },
  oppTurnEnd:{ label: "相手のターンの終わり",         head: "相手のターンの終わりに" },
  attack:    { label: "攻撃したとき",                 head: "攻撃したとき" },
  strike:    { label: "キャラを攻撃するとき（ダメージの前。対象は「攻撃する相手キャラ」）", head: "キャラを攻撃するとき、ダメージの前に" },
  kill:      { label: "攻撃で敵キャラを倒したとき",   head: "攻撃で敵キャラを倒したとき" },
  survive:   { label: "ダメージを受けて生き残ったとき", head: "ダメージを受けて生き残ったとき" },
  allyEnter: { label: "ほかの味方が出たとき",         head: "ほかの自分のキャラが出たとき" },
  allyDeath: { label: "ほかの味方が倒されたとき",     head: "ほかの自分のキャラが倒されたとき" },
  spell:     { label: "自分が魔法を使ったとき",       head: "自分が魔法を使ったとき" },
  cardPlay:  { label: "自分がカードを使ったとき（世界・種類で絞れる）", head: "自分がカードを使ったとき" },
  face:      { label: "相手プレイヤーにダメージを与えたとき", head: "このキャラが相手プレイヤーにダメージを与えたとき" },
  drawn:     { label: "自分がカードを引いたとき",     head: "自分がカードを引いたとき" },
  healed:    { label: "自分の体力が回復したとき",     head: "自分の体力が回復したとき" },
  voidBack:  { label: "亜空間から戻ったとき",         head: "亜空間から戻ったとき" },
  back:      { label: "場から手札に戻ったとき",       head: "場から手札に戻ったとき" },
  wake:      { label: "目覚めたとき（目覚めを持つキャラ）", head: "目覚めたとき" },
  // 第3弾
  revived:   { label: "墓地から出たとき", head: "墓地から出たとき" },
  attacked:  { label: "攻撃されたとき（対象は「攻撃してきたキャラ」）", head: "攻撃されたとき" },
  foeBack:   { label: "相手のキャラが亜空間から戻ったとき（対象は「戻ったキャラ」）", head: "相手のキャラが亜空間から戻ったとき" }
};
/* 効果ごとの条件（effect.cond）。満たしていないとその効果は発動しない。cn＝数値、cworld＝世界 */
const CONDS = {
  hpLE:    { label: "自分の体力がN以下",          text: e => `自分の体力が${e.cn}以下なら` },
  worldGE: { label: "自分の場に（世界の）キャラがN体以上", text: (e, isChar) => `自分の場に${WORLDS[e.cworld] ? WORLDS[e.cworld] + "の" : ""}キャラが${e.cn}体以上いれば${isChar ? "（このキャラも数える）" : ""}` , world: true },
  combo:   { label: "このターン、すでにほかのカードを使った（コンボ）", text: () => "このターン、すでにほかのカードを使っていれば", noN: true },
  playedGE:{ label: "詠唱N（このターン、先にカードをN枚以上使った）", text: e => `詠唱${e.cn}（このターン、先にカードを${e.cn}枚以上使っていれば）` },
  hurtLT:  { label: "（このキャラが）ダメージを受けて生き残ったのがN回目より前", text: e => `${e.cn - 1}回目までは` },
  hurtEQ:  { label: "（このキャラが）ダメージを受けて生き残ったのがN回目", text: e => `${e.cn}回目なら` },
  handZero:{ label: "手札が0枚",                  text: () => "自分の手札が0枚なら", noN: true },
  handGE:  { label: "手札がN枚以上",              text: e => `自分の手札が${e.cn}枚以上なら` },
  maxEGE:  { label: "最大エナジーがN以上",        text: e => `自分のエナジーの最大値が${e.cn}以上なら` },
  bounced: { label: "手札に戻せた", text: () => "手札に戻せたら", noN: true },
  hitEnemy:{ label: "（直前までの効果が）相手キャラに当たった", text: () => "相手キャラに効果を与えたら", noN: true },
  recycled:{ label: "山札に戻せた", text: () => "1枚でも戻せたら", noN: true },
  gearPaid:{ label: "出すときに歯車を使った",     text: () => "歯車を使ったなら", noN: true },
  gearNone:{ label: "出すときに歯車を使わなかった", text: () => "歯車を使わなかったなら", noN: true },
  // 第3弾
  milledGhost: { label: "（直前に）墓地へ送ったカードに亡霊のキャラがいた", text: () => "その中に【亡霊】のキャラがいれば", noN: true },
  killedNow:   { label: "（直前の効果で）キャラを倒した", text: () => "それで倒したら", noN: true },
  tribeGE:     { label: "自分の場に（種族の）キャラがN体以上", text: (e, isChar) => `自分の場に【${TRIBES[e.ctribe] || "？"}】のキャラが${e.cn}体以上いれば${isChar ? "（このキャラも数える）" : ""}` },
  ghostArmy:   { label: "自分の場のキャラがすべて亡霊で、墓地にキャラがN体以上", text: e => `自分の場のキャラがすべて【亡霊】で、自分の墓地にキャラが${e.cn}体以上いれば` }
};
/* 歯車：手札で重なるカード（何枚あっても手札1枠。枚数は p.gears）。これだけでは使えず、「歯車を使う」カードの材料になる */
const GEAR_ID = "tk-gear";
/* 使える条件の文 */
const reqText = r => r.tribe === "jelly" && r.n === 1 && !r.world ? "クラゲ魔法：自分の場に【クラゲ】のキャラがいるときだけ使える" : `使える条件：自分の場に${r.world ? WORLDS[r.world] + "の" : ""}${r.tribe && TRIBES[r.tribe] ? `【${TRIBES[r.tribe]}】の` : ""}キャラが${r.n}体以上いる${r.orEmpty ? "か、自分の場にキャラが1体もいない" : ""}とき`;
/* 場にいる間ずっと働く力（第3弾。card.aura）。
   kind：stat（ほかの味方を強くする。world／tribe で絞る・atk／hp）、self（墓地の亡霊の数だけ自分の攻撃力が上がる）、cost（クラゲ魔法のコストを下げる） */
function auraText(a) {
  if (a.kind === "self") return `場にいる間、自分の墓地の【亡霊】のキャラ1体につき、このキャラの攻撃力+1（最大+${a.max || 4}）。`;
  if (a.kind === "cost") return `場にいる間、自分のクラゲ魔法（満ち潮の夜も）のコストが${a.n}下がる（0まで）。`;
  const who = `${a.world ? WORLDS[a.world] + "の" : ""}${a.tribe && TRIBES[a.tribe] ? `【${TRIBES[a.tribe]}】の` : ""}`;
  return `場にいる間、自分のほかの${who}キャラ全体の${a.atk && a.hp ? `攻撃力と体力を+${a.atk}` : a.atk ? `攻撃力を+${a.atk}` : `体力を+${a.hp}`}する。`;
}
const condText = (e, isChar = true) => (e && CONDS[e.cond] ? CONDS[e.cond].text(e, isChar) : "");
const whenOf = e => (e && WHENS[e.when] ? e.when : "play");
/* 使ったとき（登場時）の効果だけ */
const playEffects = card => (card.effects || []).filter(e => whenOf(e) === "play");

const DEFAULT_CONFIG = {
  PLAYER_HP: 20, START_HAND: 5, ENERGY_MAX: 10, FIELD_MAX: 4, HAND_MAX: 10, FATIGUE: 2, SECOND_BONUS: 0, SECOND_COIN: 1, DECK_SIZE: 30, COPY_MAX: 3, DECK_MAX: 10, DECK_SLOT_COST: 1500, DECK_SLOT_MAX: 10, DAILY_N: 3,
  // ここから下はゲームの裏側（報酬・配布）
  STARTING_GOLD: 100, REWARD_EASY: 30, REWARD_NORMAL: 60, REWARD_HARD: 120, REWARD_EX: 450, REWARD_ONLINE: 300, REWARD_ONLINE_LOSE: 100, ONLINE_MIN_TURNS: 6, ONLINE_DAY_MAX: 10,
  STREAK_STEP: 10, STREAK_MAX: 50,
  BOSS_RATE: 5, BOSS_PITY: 20, BOSS_HP: 25, MAINT: 0, BOSS_EX_ON: 0, BOSS_EX_RATE: 5, BOSS_EX_PITY: 20, BOSS_EX_HP: 30, SAMPLE_ONLINE_DAY: 3, SAMPLE_CPU: 1,
  // ショップ：上限を超えたカードを分解したときの魔石と、交換に必要な魔石（レア度ごと）・パック券
  STONE_GET_COMMON: 5, STONE_GET_RARE: 20, STONE_GET_SR: 50, STONE_GET_UR: 150, STONE_GET_LEGEND: 400,
  STONE_COST_COMMON: 40, STONE_COST_RARE: 100, STONE_COST_SR: 400, STONE_COST_UR: 1000, STONE_COST_LEGEND: 3000,
  STONE_TICKET: 150, SHOP_FEATURE_OFF: 20, STONE_PER_GOLD: 3, MAKO_U: 3000, MAKO_L: 5000, SEN_ON: 0, SEN_BETA: 1, SEN_FEE: 500, SKIN_ON: 0, LIMITED_ON: 0, INFO_HOURS: 24, CHARM_HARD: 3000, CHARM_EX: 5000, CHARM_HP: 20, BCHAL_HARD: 6000, BCHAL_EX: 10000, BCHAL_WEEK: 3,   // CPU戦の連勝ボーナス（%）。2連勝目から1勝ごとに STEP% ずつ、最大 MAX%
  SEASON: "beta", STARTER_DECK: "starter", MAINT_NOTE: "", ADMINS: [],
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
  DECK_SLOT_COST: { label: "デッキ枠を1つ増やす魔石", min: 0, max: 100000, group: "eco" },
  DECK_SLOT_MAX:  { label: "ショップで増やせるデッキ枠の数", min: 0, max: 50, group: "eco" },
  DAILY_N:        { label: "デイリークエストの1日の数", min: 1, max: 6, group: "quest" },
  STARTING_GOLD: { label: "始めたときに配るG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_EASY:   { label: "CPU初級に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_NORMAL: { label: "CPU中級に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_HARD:   { label: "CPU上級に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_EX:     { label: "CPU超級に勝ったときのG（第2弾をすべて開放すると出る）", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_ONLINE: { label: "対人戦に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_ONLINE_LOSE: { label: "対人戦に負けたとき（引き分けも）のG", min: 0, max: 100000, group: "eco", step: 10 },
  ONLINE_MIN_TURNS: { label: "対人戦でGが出るのに必要なターン数（降参・退出でも、ここまで続いていれば出る）", min: 0, max: 99, group: "eco" },
  ONLINE_DAY_MAX: { label: "対人戦でGを受け取れる回数（1日）", min: 0, max: 999, group: "eco" },
  STREAK_STEP:   { label: "CPU戦の連勝ボーナス：1連勝ごとに増える割合（%）", min: 0, max: 100, group: "eco" },
  STREAK_MAX:    { label: "CPU戦の連勝ボーナス：上限（%）", min: 0, max: 500, group: "eco", step: 10 },
  BOSS_RATE:     { label: "隠しボス：上級に勝ったとき次に出る確率（%）", min: 0, max: 100, group: "eco" },
  BOSS_PITY:     { label: "隠しボス：天井（上級でこの回数勝つと必ず出る）", min: 1, max: 999, group: "eco" },
  BOSS_HP:       { label: "隠しボス：ボスの体力", min: 1, max: 99, group: "eco" },
  MAINT:         { label: "メンテナンス中にする（1＝プレイヤーは入れない・0＝ふつう）。遊んでいる人は、対戦が終わってホームに戻ったときに止まる", min: 0, max: 1, group: "eco" },
  BOSS_EX_ON:    { label: "超級の隠しボス（黄泉丸）を出す（1＝出す・0＝隠す。できあがるまで0）", min: 0, max: 1, group: "eco" },
  BOSS_EX_RATE:  { label: "超級の隠しボス（黄泉丸）：超級に勝ったとき次に出る確率（%）", min: 0, max: 100, group: "eco" },
  BOSS_EX_PITY:  { label: "超級の隠しボス：天井（超級でこの回数勝つと必ず出る）", min: 1, max: 999, group: "eco" },
  BOSS_EX_HP:    { label: "超級の隠しボス：ボスの体力", min: 1, max: 99, group: "eco" },
  SAMPLE_ONLINE_DAY: { label: "サンプルデッキ：友達との対戦で1日に使える回数", min: 0, max: 99, group: "eco" },
  SAMPLE_CPU:    { label: "サンプルデッキ：CPU戦でも使える（1＝使える・0＝使えない。正式リリースで0に）", min: 0, max: 1, group: "eco" },
  STONE_GET_COMMON:  { label: "分解でもらえる魔石：コモン", min: 0, max: 100000, group: "eco" },
  STONE_GET_RARE:    { label: "分解でもらえる魔石：レア", min: 0, max: 100000, group: "eco" },
  STONE_GET_SR:      { label: "分解でもらえる魔石：SR", min: 0, max: 100000, group: "eco", step: 10 },
  STONE_GET_UR:      { label: "分解でもらえる魔石：UR", min: 0, max: 100000, group: "eco", step: 10 },
  STONE_GET_LEGEND:  { label: "分解でもらえる魔石：レジェンド", min: 0, max: 100000, group: "eco", step: 10 },
  STONE_COST_COMMON: { label: "交換に必要な魔石：コモン", min: 0, max: 100000, group: "eco", step: 10 },
  STONE_COST_RARE:   { label: "交換に必要な魔石：レア", min: 0, max: 100000, group: "eco", step: 10 },
  STONE_COST_SR:     { label: "交換に必要な魔石：SR", min: 0, max: 100000, group: "eco", step: 10 },
  STONE_COST_UR:     { label: "交換に必要な魔石：UR", min: 0, max: 100000, group: "eco", step: 10 },
  STONE_COST_LEGEND: { label: "交換に必要な魔石：レジェンド", min: 0, max: 100000, group: "eco", step: 10 },
  STONE_TICKET:      { label: "パック券1枚に必要な魔石", min: 0, max: 100000, group: "eco", step: 10 },
  SHOP_FEATURE_OFF:  { label: "ショップの今日のおすすめの割引（%）", min: 0, max: 90, group: "eco" },
  STONE_PER_GOLD:    { label: "両替：1Gにするのに必要な魔石（2以下にすると、パック→分解→両替でGが増え続けるので注意）", min: 1, max: 1000, group: "eco" },
  LIMITED_ON:        { label: "ショップの限定カードの売り場を開く（1＝開く、0＝準備中。運営用アカウントはいつでも入れる）", min: 0, max: 1, group: "eco" },
  SKIN_ON:           { label: "スキンの売り場を開く（1＝開く、0＝準備中。運営用アカウントはいつでも入れる）", min: 0, max: 1, group: "eco" },
  SEN_ON:            { label: "選定戦を開く（1＝開く、0＝準備中。運営用アカウントは入れる）", min: 0, max: 1, group: "eco" },
  SEN_BETA:          { label: "選定戦をβ版にする（1＝入場料・報酬なし、0＝正式）", min: 0, max: 1, group: "eco" },
  SEN_FEE:           { label: "選定戦の入場料（G）", min: 0, max: 1000000, group: "eco", step: 50 },
  MAKO_U:            { label: "魔光加工：UR風（1種類）の魔石", min: 0, max: 10000000, group: "eco", step: 100 },
  MAKO_L:            { label: "魔光加工：レジェンド風（1種類）の魔石", min: 0, max: 10000000, group: "eco", step: 100 },
  INFO_HOURS:        { label: "情報屋：攻略の情報を買ってから読める時間（時間）", min: 1, max: 720, group: "eco" },
  CHARM_HARD:        { label: "情報屋：弱体の御札（上級）のG", min: 0, max: 1000000, group: "eco", step: 100 },
  CHARM_EX:          { label: "情報屋：弱体の御札（超級）のG", min: 0, max: 1000000, group: "eco", step: 100 },
  CHARM_HP:          { label: "情報屋：弱体の御札を使ったときのボスの体力", min: 1, max: 99, group: "eco" },
  BCHAL_HARD:        { label: "情報屋：挑戦状（上級）のG", min: 0, max: 1000000, group: "eco", step: 100 },
  BCHAL_EX:          { label: "情報屋：挑戦状（超級）のG", min: 0, max: 1000000, group: "eco", step: 100 },
  BCHAL_WEEK:        { label: "情報屋：挑戦状を1週間に買える枚数（上級・超級それぞれ）", min: 0, max: 99, group: "eco" }
};

/* パックの標準の排出率（%）。最後の1枚はレア以上確定 */
const DEFAULT_ODDS = {
  normal: { common: 70, rare: 22, sr: 6, ur: 1.5, legend: 0.5 },
  last:   { common: 0, rare: 70, sr: 20, ur: 7, legend: 3 }
};

const DRAFT_KEY = "kyokai-draft-v1";

/* ---------- シリアルコード ---------- */
/* 端末の日付（YYYY-MM-DD）。有効期限は日本時間などその人の日付で判定する */
const localDate = (d = new Date()) => { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
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
function effRole(e) { return e && e.kind === "unit" && UTOS[e.to] ? UTOS[e.to].role || null : null; }
function cardTarget(card) {
  for (const e of playEffects(card)) { const r = effRole(e); if (r) return r === "enemy" || r === "enemyF" ? "enemyUnit" : r === "own" ? "ownUnit" : "anyUnit"; }
  return null;
}
/* カードを使うときに選ぶ対象の並び：代償で破壊する自分のキャラ → 相手キャラ → 自分のキャラ */
function cardTargetRoles(card) {
  const roles = [];
  const sac = card.pay && card.pay.kind === "sacrifice";
  if (sac) roles.push("sacrifice");
  const rs = playEffects(card).map(effRole).filter(Boolean);
  if (rs.includes("enemyF")) roles.push("enemyF");
  else if (rs.includes("enemy")) roles.push("enemy");
  if (rs.includes("enemy2")) roles.push("enemy2");
  if (rs.includes("own") && !sac) roles.push("own");
  if (rs.includes("any")) roles.push("any");
  return roles;
}

/* 後攻の人だけが最初に持つ、使い切りのカード（パックやデッキには入らない） */
const COIN_CARD = {
  id: "coin", name: "境界の欠片", world: "none", type: "spell", cost: 0, glyph: "欠", limit: 0, rarity: "common", art: "art/coin-e8ebaefc8f.webp",
  keywords: [], effects: [{ kind: "energyNow", n: 1 }], note: "後攻の人だけが最初に持っている。好きなときに1回だけ使える。"
};

/* 効果テキストを自動で作る（list：同じタイミングの効果の並び。auto：対象をランダムに選ぶタイミング） */
function effectsText(card, list, auto) {
  // 同じ効果が続くときは「〜を4回」にまとめる（天罰の光など）
  list = (list || card.effects || []).filter(e => EFFECTS[e.kind]);
  const out = [];
  const seen = {};   // 同じカードで2つ目以降の「選んだ対象」は、最初に選んだのと同じ → 「そのキャラ」と書く
  const isChar = card.type === "char";
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    let k = 1;
    while (i + k < list.length && JSON.stringify(list[i + k]) === JSON.stringify(e)) k++;
    let t;
    const nx = list[i + 1];
    if (e.kind === "unit" && e.to === "enemy1" && nx && nx.kind === "unit" && nx.to === "enemy2" && nx.act === e.act) {   // 2体まで選ぶ（分解砲）
      t = unitText(e, `選んだ相手の${filtNo(e)}キャラ2体まで`.replace("相手のキャラ", "相手キャラ"));
      out.push(t); i += 1; seen.enemy = true; continue;
    }
    if (e.kind === "unit") {
      const role = UTOS[e.to] && UTOS[e.to].role;
      let T = toPhrase(e, isChar, auto);
      if (!auto && role && seen[role]) T = role === "enemyF" ? "その相手" : "そのキャラ";
      if (role) seen[role] = true;
      t = unitText(e.amt ? { ...e, n: "回復した分の" } : e, T);
    } else t = EFFECTS[e.kind].text(e.n, e);
    if (e.per === "gear") t = `使った歯車1枚につき、${t}`;
    if (e.per === "milledGhost") t = `その中の【亡霊】のキャラ1体につき、${t}`;
    if (e.plus) t = t.replace(/。$/, `。自分の場の【${TRIBES[e.plus] || ""}】のキャラ1体につき、さらに1ダメージ（最大+${e.plusMax || 2}）。`);
    if (e.cap) t = t.replace(/。$/, `（1ターンに${e.cap}回まで）。`);
    if (e.per === "played") t = e.split ? `このターン、このカードより先に使ったカードの枚数だけ、${t.replace(/。$/, "")}（1回ずつ対象を選び直す）。` : `このターン、このカードより先に使ったカード1枚につき、${t}`;
    // 前の効果と同じ条件なら、条件は2回書かずに「さらに」でつなぐ
    const pe = i > 0 ? list[i - 1] : null, sameCond = pe && e.cond && pe.cond === e.cond && pe.cn === e.cn && pe.cworld === e.cworld;
    if (e.cond && CONDS[e.cond]) t = sameCond ? `さらに、${t}` : `${condText(e, isChar)}、${t}`;
    if (k > 1) t = e.kind === "unit" && e.act === "dmg" && e.to === "enemyRand" ? `ランダムな相手キャラに${e.n}ダメージを${k}回与える（1回ごとに選び直す。倒れたキャラは選ばれない）。` : `${t.replace(/。$/, "")}（${k}回${e.kind === "unit" && e.act !== "dmg" && e.to === "enemyRand" ? "。同じキャラは2回選ばれない" : ""}）。`;
    out.push(t);
    i += k - 1;
  }
  return out.join("");
}
/* 「自分がカードを使ったとき」の見出し（世界・種類で絞っていればそれも書く） */
function cardPlayHead(e) { if (e && e.ptr === "jelly" && e.pt === "spell") return "自分がクラゲ魔法を使ったとき"; return `自分が${worldNo(e && { world: e.pw })}${e && e.ptr && TRIBES[e.ptr] ? `【${TRIBES[e.ptr]}】の` : ""}${e && e.pt === "char" ? "キャラ" : e && e.pt === "spell" ? "魔法" : "カード"}を使ったとき`; }
/* 「ほかの味方が倒されたとき」の見出し（e.af：亡霊・種族で絞る） */
function allyDeathHead(e) { const f = e && e.af; return f === "ghost" ? "自分の【亡霊】のキャラが倒されたとき" : f && TRIBES[f] ? `ほかの自分の【${TRIBES[f]}】のキャラが倒されたとき` : WHENS.allyDeath.head; }
function cardTextLines(card, o = {}) {
  const lines = [];
  if (card.type === "char" && card.tribe && TRIBES[card.tribe]) lines.push(`種族：${TRIBES[card.tribe]}`);
  if (card.type === "char" && o.noKw) (card.keywords || []).forEach(k => kwPlain(k) && lines.push(KEYWORDS[k].plain));
  if (card.type === "char" && !o.noKw) {
    (card.keywords || []).forEach(k => KEYWORDS[k] && lines.push(kwPlain(k) ? KEYWORDS[k].plain : `${KEYWORDS[k].label}：${KEYWORDS[k].text}`));
    if (card.armor) lines.push(ARMOR_TEXT(card.armor));
  }
  if (card.pay && PAYS[card.pay.kind]) lines.push(PAYS[card.pay.kind].text(card.pay.n));
  const useWhat = k => `${k.world ? WORLDS[k.world] + "の" : ""}${k.ctype === "spell" ? "魔法" : k.ctype === "char" ? "キャラ" : "カード"}`;
  if (card.req) lines.unshift(reqText(card.req) + "。");
  if (card.sway) lines.push(`使ったとき、次のどれかになる（ランダム）：${card.sway.map(id => { const c = cardRef(id); return c ? `「${c.name}」${effectsText(c, null, true)}` : "？"; }).join("／")}`);
  if (card.aura) lines.push(auraText(card.aura));
  if (card.shrink && !o.noKw) lines.push(`化かし：手札にある間、自分が${useWhat(card.shrink)}を使うたびに、このカードのコストが1下がる。`);
  if (card.grow && !o.noKw) { const g = card.grow, w = [];
    if (g.stat && card.type === "char") w.push("攻撃力と体力");
    if (g.dmg) w.push("効果で与えるダメージ");
    if (g.num) w.push("効果の数（引く枚数・回復量など）");
    lines.push(`妖気：手札にある間、このターン自分が${useWhat(g)}を使うたびに、このカードの${w.join("・")}が1上がる。手札に残ったままなら、ターンの終わりに元に戻る（場に出したり使ったりした分は、そのまま残る）。`); }
  if (card.gear) lines.push(card.gear === "all" ? "歯車すべて：出すときに、手札の歯車をすべて使う。" : `歯車${card.gear}：出すときに、手札の歯車を${card.gear}枚使ってもよい。`);
  if (card.type === "char") {
    // タイミングごとに1行（登場時 → ほかのタイミングの順）
    Object.keys(WHENS).forEach(w => {
      const all = (card.effects || []).filter(e => whenOf(e) === w);
      if (w === "cardPlay") {
        const keys = [...new Set(all.map(e => `${e.pw || ""}|${e.pt || ""}|${e.ptr || ""}`))];
        keys.forEach(key => { const g = all.filter(e => `${e.pw || ""}|${e.pt || ""}|${e.ptr || ""}` === key); const t = effectsText(card, g, true); if (t) lines.push(`${cardPlayHead(g[0])}：${t}`); });
        return;
      }
      if (w === "allyDeath") {
        const keys = [...new Set(all.map(e => e.af || ""))];
        keys.forEach(key => { const g = all.filter(e => (e.af || "") === key); const t = effectsText(card, g, true); if (t) lines.push(`${allyDeathHead(g[0])}：${t}`); });
        return;
      }
      const t = effectsText(card, all, w !== "play");
      if (t) lines.push(`${WHENS[w].head}：${t}`);
    });
  } else {
    const eff = effectsText(card);
    if (eff) lines.push(eff);
  }
  if (card.note) lines.push(card.note);
  else if (card.id === "tk-gear") lines.push("手札にためておける。「歯車」を持つカードを出すときに使う（これだけでは使えない）。");
  return lines;
}
function cardText(card) {
  const l = cardTextLines(card);
  return l.length ? l.join("\n") : "特殊能力なし。";
}
/* 画面に出す説明文（HTML）。出てくるトークンの名前は青い文字にして、タップでトークンの絵と効果を見られる */
/* 能力（キーワード）の一覧：{ label：札に出す短い名前, text：くわしい説明 } */
const useWhatOf = k => `${k.world ? WORLDS[k.world] + "の" : ""}${k.ctype === "spell" ? "魔法" : k.ctype === "char" ? "キャラ" : "カード"}`;
function kwItems(card) {
  const out = [];
  if (card.type === "char") {
    (card.keywords || []).forEach(k => KEYWORDS[k] && !kwPlain(k) && out.push({ label: KEYWORDS[k].label, text: KEYWORDS[k].text }));
    if (card.armor) out.push({ label: `装甲${card.armor}`, text: ARMOR_TEXT(card.armor).replace(/^[^：]*：/, "") });
  }
  const full = cardTextLines({ ...card, keywords: [], armor: 0, effects: [], note: "", req: null, pay: null, gear: 0 });   // 化かし・妖気の文だけを作る
  if (card.shrink) { const t = full.find(l => l.startsWith("化かし：")); out.push({ label: `化かし（${useWhatOf(card.shrink)}）`, text: t ? t.replace(/^化かし：/, "") : "" }); }
  if (card.grow) { const t = full.find(l => l.startsWith("妖気：")); out.push({ label: `妖気（${useWhatOf(card.grow)}）`, text: t ? t.replace(/^妖気：/, "") : "" }); }
  return out;
}
/* 能力の札（押すと説明が開く）。full＝説明も最初から全部出す（PCでカードに重ねたときの表示など） */
function kwChipsHTML(items, full) {
  if (!items.length) return "";
  // full のときは札を出さず、説明だけを並べる（押せない表示で、名前が二重にならないように）
  if (full) return `<span class="kwfull">${items.map(k => `<span><b>${esc(k.label)}</b>：${esc(k.text)}</span>`).join("")}</span>`;
  const chips = items.map(k => `<button type="button" class="kwlink" data-kwl="${esc(k.label)}" data-kwt="${esc(k.text)}">${esc(k.label)}</button>`).join("");
  return `<span class="kwrow">${chips}<span class="kwhint">押すと説明</span></span><span class="kwdesc" hidden></span>`;
}
function cardTextHTML(card, o = {}) {
  const items = kwItems(card);
  const rest = cardTextLines(card, { noKw: true });
  let h = esc(rest.length ? rest.join("\n") : items.length ? "" : "特殊能力なし。");
  if (items.length) h = kwChipsHTML(items, o.full) + (h ? "\n" + h : "");
  const ids = new Set();
  (card.effects || []).forEach(e => { const t = e && e.card && cardRef(e.card); if (t && t.token && t.id !== card.id) ids.add(t.id); });
  (card.sway || []).forEach(id => { const t = cardRef(id); if (t && t.token) ids.add(t.id); });
  ids.forEach(id => { const n = esc(cardRef(id).name); h = h.split(`「${n}」`).join(`「<button type="button" class="tklink" data-tk="${esc(id)}">${n}</button>」`); });
  return h;
}
/* トークンの絵と効果を、いま開いている画面の上に重ねて出す */
const TokenPop = {
  show(id) {
    const c = cardRef(id);
    if (!c) return;
    this.close();
    const el = document.createElement("div");
    el.id = "tkpop"; el.className = "dmodal tkpop";
    el.innerHTML = `<div class="dmodal-in" role="dialog" aria-label="${esc(c.name)}">
        <div class="dmodal-card">${cardHTML(c, { static: true })}</div>
        <div class="dmodal-body">
          ${c.token ? `<span class="tk-tag">トークン</span>` : ""}
          <b class="dm-name">${esc(c.name)}</b>
          <span class="pmeta">${WORLDS[c.world] || ""} ・ ${TYPES[c.type] || ""} ・ コスト${c.cost}${c.type === "char" ? ` ・ ${c.atk}/${c.hp}` : ""}</span>
          <p class="dm-text">${cardTextHTML(c)}</p>
          ${c.token ? `<span class="pmeta">カードの効果で出てきます。デッキには入れられません。</span>` : `<span class="pmeta">${RARITY[c.rarity] || ""}</span>`}
          <button type="button" class="btn" data-tkclose>閉じる</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    if (typeof Sound !== "undefined") Sound.play("click");
  },
  close() { const o = document.getElementById("tkpop"); if (o) o.remove(); }
};
if (typeof document !== "undefined") document.addEventListener("click", e => {
  const kw = e.target.closest && e.target.closest(".kwlink");
  if (kw) {
    e.stopPropagation(); e.preventDefault();
    const row = kw.parentElement, d = row && row.nextElementSibling;
    if (!d || !d.classList.contains("kwdesc")) return;
    const same = !d.hidden && d.dataset.kwl === kw.dataset.kwl;
    row.querySelectorAll(".kwlink.on").forEach(b => b.classList.remove("on"));
    if (same) { d.hidden = true; return; }
    kw.classList.add("on"); d.dataset.kwl = kw.dataset.kwl;
    d.innerHTML = `<b>${esc(kw.dataset.kwl)}</b>：${esc(kw.dataset.kwt)}`; d.hidden = false;
    if (typeof Sound !== "undefined") Sound.play("click");
    return;
  }
  const t = e.target.closest && e.target.closest(".tklink, .cdlink");
  if (t) { e.stopPropagation(); e.preventDefault(); TokenPop.show(t.dataset.tk); return; }
  const pop = e.target.closest && e.target.closest("#tkpop");
  if (pop) { e.stopPropagation(); e.preventDefault(); if (e.target === pop || e.target.closest("[data-tkclose]")) TokenPop.close(); }
}, true);

/* カードの見た目。unit を渡すと場のキャラの現在値を表示する */
/* プレイヤーアイコン：キャラカードの絵を丸く切り抜く。顔が上の方にない絵だけ、切り抜く位置を個別に決める */
const ICON_POS = { "x-rush": "50% 40%", garm: "50% 55%", "k-ruu": "55% 37%" };
/* アイコンを選んでいないとき（おまかせ）に出す、フードの召喚士の絵 */
const DEFAULT_AVATAR_HTML = `<span class="iimg" style="background-image:url('ui/avatar-default.webp');background-size:cover;background-position:50% 30%"></span>`;
function iconImgHTML(id) {
  const c = typeof DEF !== "undefined" && DEF[id];
  if (!c || !c.art) return `<span class="glyph">召</span>`;
  // img＋拡大（transform）だと iPhone の Safari で絵の上がずれて帯が出たので、背景画像として敷く
  const pos = ICON_POS[id] || "50% 18%";
  return `<span class="iimg" style="background-image:url('${esc(c.art)}');background-position:${pos}"></span>`;
}

/* 名前の長さ（UR・レジェンドは枠が太く名前の帯が狭いので、1文字多いものとして小さくする） */
const nmLen = card => card.name.length + (["ur", "legend"].includes(card.rarity) ? 1 : 0);
/* カードの見た目（魔光加工・別イラスト）。CARD_LOOK は自分の分（js/skins.js が入れる）。
   { m: "u"（UR風の光）/"l"（レジェンド風の光）, a: 別イラストの絵 }。対戦では相手の分を S.players[pi].look から見る */
let CARD_LOOK = {};
/* お気に入りの★（カードの詳細の名前の横。持っているカードだけ） */
function favBtnHTML(c) {
  if (typeof Account === "undefined" || !Account.data || Account.status === "free" || !(Account.owned(c.id) > 0)) return "";
  const on = Account.isFav(c.id);
  return `<button type="button" class="favbtn ${on ? "on" : ""}" data-act="cardFav" data-id="${esc(c.id)}" aria-pressed="${on}" aria-label="${on ? "お気に入りから外す" : "お気に入りにする"}" title="${on ? "お気に入りから外す" : "お気に入りにする"}">${on ? "★" : "☆"}</button>`;
}
function lookFor(id, pi) {
  if (pi == null || typeof S === "undefined" || !S || !S.players || (typeof ME !== "undefined" && pi === ME)) return CARD_LOOK[id] || null;
  const L = S.players[pi] && S.players[pi].look;
  return (L && L[id]) || null;
}
function cardHTML(card, o = {}) {
  const u = o.unit;
  const lk = o.hidden ? null : (o.look !== undefined ? o.look : o.pi != null ? lookFor(card.id, o.pi) : CARD_LOOK[card.id]) || null;
  if (lk && lk.a) card = { ...card, art: lk.a };   // 別イラスト
  const mk = lk && (lk.m === "u" || lk.m === "l") ? lk.m : "";
  // o.hidden：まだ持っていないカード。イラストを隠して「？」を出す（名前・数値・効果は見せる）
  const art = o.hidden ? `<span class="glyph">？</span>`
    : card.art ? `<img src="${esc(card.art)}" alt="" draggable="false" ${typeof CARD_EAGER !== "undefined" && CARD_EAGER ? 'decoding="async"' : 'loading="lazy" decoding="async"'}>`
    : `<span class="glyph">${esc(card.glyph || "？")}</span>`;
  let stats;
  if (card.type === "char") {
    const g = card.grow && card.grow.stat ? o.grow || 0 : 0;   // 妖気で手札のうちに強くなった分
    const atk = u ? u.atk : card.atk + g, hp = u ? u.hp : card.hp + g;
    stats = `<span class="stats"><span class="atk ${(u && u.atk > card.atk) || g ? "up" : ""}">${atk}</span>`
      + `<span class="hp ${u && u.hp < u.maxHp ? "hurt" : (u && u.maxHp > card.hp) || g ? "up" : ""}">${hp}</span></span>`
      + (o.grow ? `<b class="growb ch">妖気+${o.grow}</b>` : "");
  } else {
    stats = `<span class="stats spelltag">魔法${o.grow ? `<b class="growb">妖気+${o.grow}</b>` : ""}</span>`;
  }
  const tag = o.static ? "div" : "button";
  // 場のキャラは、与えられた能力も見せる。沈黙したキャラは能力なし
  const kwl = (u && u.silenced ? [] : [...new Set([...(card.keywords || []), ...((u && u.kws) || [])])])
    .filter(k => !(u && ((k === "stealth" && u.revealed) || (k === "shield" && u.shieldUsed))));   // 解けた隠密・使った聖盾は消す
  const arm = u ? (u.silenced ? 0 : (card.armor || 0) + (u.armorPlus || 0)) : card.armor;
  const marks = card.type === "char"
    ? kwl.filter(k => KEYWORDS[k] && !kwPlain(k)).map(k => `<i class="mk mk-${k}">${KEYWORDS[k].short}</i>`).join("")
      + (arm ? `<i class="mk mk-armor">甲${arm}</i>` : "")
      + ((card.effects || []).some(e => whenOf(e) !== "play") && !(u && u.silenced) ? `<i class="mk mk-trig" title="登場時以外にも働く効果があります">効</i>` : "")
    : "";
  const cost = o.cost != null ? o.cost : card.cost;
  const guard = card.type === "char" && kwl.includes("guard");
  return `<${tag} ${o.static ? "" : 'type="button"'} class="card w-${esc(card.world)} rar-${esc(card.rarity || "common")} ${mk ? "mako mk-" + mk : ""} ${card.type} ${card.art && !o.hidden ? "has-art" : ""} ${o.hidden ? "unknown" : ""} ${card.id === "coin" ? "coin" : ""} ${guard ? "guard" : ""} ${u && u.frozen ? "frozen" : ""} ${u && kwl.includes("stealth") ? "stealthy" : ""} ${u && kwl.includes("shield") ? "shieldy" : ""} ${u && u.silenced ? "silenced" : ""} ${o.cls || ""}" ${o.attrs || ""} ${o.hidden || !card.id ? "" : `data-cid="${esc(card.id)}"`} aria-label="${esc(card.name)}">
    <span class="art">${art}</span>
    <span class="frame" aria-hidden="true"></span><span class="crest" aria-hidden="true"></span><span class="gem" aria-hidden="true"></span>
    ${["ur", "legend"].includes(card.rarity) || mk ? `<span class="shine" aria-hidden="true"></span>` : ""}
    ${o.showCost === false ? "" : `<span class="cost ${cost < card.cost ? "down" : ""}"><i>${cost}</i></span>`}
    ${marks ? `<span class="marks">${marks}</span>` : ""}
    ${o.count ? `<span class="gearcnt" aria-label="${o.count}枚">×${o.count}</span>` : ""}
    ${o.perN ? `<span class="perb" aria-label="このターン先に使ったカード${o.perN}枚">先に${o.perN}枚</span>` : ""}
    ${u && u.frozen ? `<span class="frz">凍結</span>` : ""}${u && u.silenced ? `<span class="chainfx" aria-hidden="true"></span><span class="silseal" title="沈黙：効果と能力をすべて失っている"><svg viewBox="0 0 20 24" aria-hidden="true"><defs><linearGradient id="lkb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6d9ff"/><stop offset=".45" stop-color="#9b84d6"/><stop offset="1" stop-color="#3d2c6e"/></linearGradient></defs><path d="M5 11V7.5a5 5 0 0 1 10 0V11" fill="none" stroke="#d7d0e8" stroke-width="2.6"/><rect x="2" y="10" width="16" height="13" rx="3" fill="url(#lkb)" stroke="#1b1230" stroke-width="1.2"/><circle cx="10" cy="15.2" r="2" fill="#1b1230"/><rect x="9.1" y="16" width="1.8" height="4" rx=".9" fill="#1b1230"/></svg><b>沈黙</b></span>` : ""}${u && u.winIn != null && !u.silenced ? `<span class="wintag" title="勝利まであと${u.winIn}回">勝利まで${u.winIn}</span>` : ""}${u && u.wakeIn != null && !u.silenced ? `<span class="wakeb" title="目覚めまであと${u.wakeIn}回"><svg viewBox="0 0 20 20" aria-hidden="true"><defs><linearGradient id="wkm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".55" stop-color="#f1c35a"/><stop offset="1" stop-color="#b07a1e"/></linearGradient></defs><path d="M13.5 2.2A8 8 0 1 0 17.8 14 6.4 6.4 0 0 1 13.5 2.2z" fill="url(#wkm)" stroke="#5a3b08" stroke-width=".8"/><circle cx="16.2" cy="4.2" r="1" fill="#fff6d8"/></svg>目覚め<b>${u.wakeIn}</b></span>` : ""}
    <span class="foot"><span class="nm ${nmLen(card) >= 11 ? "xlong x3" : nmLen(card) >= 10 ? "xlong x2" : nmLen(card) >= 9 ? "xlong" : nmLen(card) >= 7 ? "long" : ""}">${esc(card.name)}</span>${stats}</span></${tag}>`;
}

/* 超級 CPU：第2弾（2-1・2-2・2-3）をすべて開放した人だけが戦える */
const EX_SETS = ["2-1", "2-2", "2-3"];
const exOpen = () => /[?&]gatetest\b/.test(location.search) || EX_SETS.every(s => setOpen(s));   // ?gatetest（オーナーの試し用）でも出る
/* ふだんの CPU戦・練習・CPU用一覧に出さないデッキ（検証用・開放戦用・まだ開いていない超級） */
const hiddenDeck = d => ["test", "gate", "gift", "boss"].includes(d.level) || (d.level === "ex" && !exOpen());   // gift＝初心者クエストで選んでもらえるデッキ
/* ---------- クエスト ----------
   type＝何をするか。lv はCPUの強さ（winLv のとき）。数はクエストごとに決める */
const CPU_LV_NAMES = { easy: "初級", normal: "中級", hard: "上級", ex: "超級" };
/* ショップの店員：場面ごとのセリフ（工房で直せる）。{card}＝今日のおすすめのカード名、{off}＝割引の％ */
const KEEPER_SCENES = {
  enter:   { label: "来店（ふだん）" },
  first:   { label: "はじめての来店", hint: "店員の自己紹介と、店の使い方" },
  morning: { label: "朝の来店（5〜10時）" },
  night:   { label: "夜の来店（22〜4時）" },
  feature: { label: "今日のおすすめ", hint: "{card}＝おすすめのカード名、{off}＝割引の％" },
  buy:     { label: "買い物をした" },
  poor:    { label: "魔石が足りない" },
  dis:     { label: "分解した" },
  tap:     { label: "店員を押した" },
  rich:    { label: "魔石をたくさん持っている" },
  complete:{ label: "交換できるカードを全部集め終えた", hint: "今日のおすすめの代わりにも話します" },
  shy:     { label: "続けて押された（恥ずかしがる）", hint: "ルゥだけ。3秒以内に4〜7回続けて押すと、3割の確率で照れる。空なら「店員を押した」のセリフ" },
  angry:   { label: "しつこく押された（ちょっと怒る）", hint: "ルゥだけ。3秒以内に8回以上続けて押されたとき。空なら「店員を押した」のセリフ" },
  pet:     { label: "なでられた", hint: "ルゥだけ。顔のあたりを指で左右になでたとき" },
  wake:    { label: "眠っていて起こされた", hint: "ルゥだけ。20秒放っておくと眠るので、そのとき押されたら" },
  alert1:  { label: "続けて押された：気づく", hint: "マモルだけ。3秒以内に4〜6回続けて押されたとき" },
  alert2:  { label: "続けて押された：警戒", hint: "マモルだけ。7〜9回" },
  alert3:  { label: "続けて押された：本気の警戒", hint: "マモルだけ。10〜12回" },
  glitch:  { label: "続けて押された：故障", hint: "マモルだけ。13〜15回。画面がバグって揺れる" },
  short:   { label: "ショートした", hint: "マモルだけ。16回以上。このあと20秒放っておくか、何か買うまで動かない" },
  reboot:  { label: "再起動した", hint: "マモルだけ。ショートから戻ったとき" },
  like:    { label: "おしゃべり：好きなこと", hint: "押したとき、ときどき話す（喜ぶ顔）。行の頭に [happy] [trouble] [offer] [shy] [dere] [angry] [yawn] を付けると、その顔になる" },
  dislike: { label: "おしゃべり：嫌いなこと", hint: "押したとき、ときどき話す（困った顔）。行の頭の [顔] で変えられる" },
  hobby:   { label: "おしゃべり：趣味・休みの日", hint: "押したとき、ときどき話す。行の頭の [顔] で変えられる" },
  staff:   { label: "おしゃべり：ほかの店員のこと", hint: "押したとき、ときどき話す。行の頭の [顔] で変えられる" },
  cheer:   { label: "おしゃべり：お客さんへのひとこと", hint: "押したとき、ときどき話す（対戦の応援など）。行の頭の [顔] で変えられる" },
  sing:    { label: "ひとりで歌っている", hint: "ルゥだけ。しばらく放っておくと、ときどき小さく歌いだす（眠る前）" },
  singCaught:{ label: "歌っているところを見られた", hint: "ルゥだけ。歌っている最中に押されたとき（照れる）" }
};
/* アリーナの曜日ごとのルール（日〜土）。std＝通常戦、sen＝選定戦、set1＝第1弾限定 */
const ARENA_REWARDS_DEF = { since: "2026-11-20", part: { gold: 0, stones: 0, tickets: 1 }, rank: [{ gold: 1000, stones: 0, tickets: 3 }, { gold: 500, stones: 0, tickets: 2 }, { gold: 0, stones: 0, tickets: 1 }] };
function arenaRewards(r) {
  const one = x => ({ gold: Math.max(0, Math.floor(+(x && x.gold) || 0)), stones: Math.max(0, Math.floor(+(x && x.stones) || 0)), tickets: Math.max(0, Math.floor(+(x && x.tickets) || 0)) });
  if (!r || typeof r !== "object") return JSON.parse(JSON.stringify(ARENA_REWARDS_DEF));
  return { since: /^\d{4}-\d{2}-\d{2}$/.test(r.since || "") ? r.since : ARENA_REWARDS_DEF.since, part: one(r.part), rank: (Array.isArray(r.rank) ? r.rank : []).slice(0, 10).map(one) };
}
const ARENA_DAYS_DEF = ["std", "std", "sen", "set1", "std", "sen", "set1"];
/* 情報屋で売る情報の種類。peek＝買ったその時だけ見られる「今の状態」、ほかは買ってから INFO_HOURS 時間読める */
const INFO_CATS = { peek: "今の状態（買ったその時だけ）", boss: "ボスの秘密", legend: "限定レジェンドの解説と考察", cpu: "CPUのデッキ帳", card: "噂の強カード", gate: "パック開放戦の攻略" };
const INFO_PEEKS = { pityHard: "上級のボスが必ず現れるまでの勝ち数", pityEx: "超級のボスが必ず現れるまでの勝ち数", tomorrow: "明日のおすすめ（交換所）" };
/* 称号の手に入れ方。n＝回数、lv＝強さ（winLv・bossWin のとき）。通算の数は、記録を始めた日（2026-11-16）からの分 */
const TITLE_CONDS = {
  winAny:     { label: "対戦に勝つ（通算）", n: true, text: n => `対戦に通算${n}回勝つ` },
  winLv:      { label: "CPUに勝つ（強さを選ぶ）", n: true, lv: true, text: (n, t) => `CPU（${CPU_LV_NAMES[t.lv] || "中級"}）に通算${n}回勝つ` },
  streak:     { label: "CPU戦（上級以上）で連勝する", n: true, text: n => `上級以上のCPU戦で${n}連勝する` },
  bossWin:    { label: "隠しボスに勝つ（上級か超級）", n: true, lv: true, text: (n, t) => `${t.lv === "ex" ? "超級" : "上級"}の隠しボスに通算${n}回勝つ` },
  onlineWin:  { label: "友達との対戦に勝つ", n: true, text: n => `友達との対戦に通算${n}回勝つ` },
  onlineGame: { label: "友達と対戦する", n: true, text: n => `友達と通算${n}回対戦する` },
  packs:      { label: "パックを開ける", n: true, text: n => `パックを通算${n}回開ける` },
  kinds:      { label: "カードの種類を集める", n: true, text: n => `カードを${n}種類持つ` },
  complete:   { label: "1つのパックのカードを全部3枚ずつ集める", set: true, text: (n, t) => `${((typeof PACKS !== "undefined" && PACKS.length ? PACKS : typeof DATA !== "undefined" && DATA && DATA.packs || []).find(p => p.id === t.set) || {}).name || "そのパック"}のカードを、全部3枚ずつ集める` },
  games:      { label: "対戦する（CPU・友達どちらも）", n: true, text: n => `通算${n}回対戦する` },
  losses:     { label: "対戦に負ける", n: true, text: n => `対戦に通算${n}回負ける` },
  play:       { label: "カードを使う", n: true, text: n => `カードを通算${n}枚使う` },
  spell:      { label: "魔法を使う", n: true, text: n => `魔法を通算${n}枚使う` },
  char:       { label: "キャラを出す", n: true, text: n => `キャラを通算${n}体出す` },
  kill:       { label: "相手のキャラを倒す", n: true, text: n => `相手のキャラを通算${n}体倒す` },
  lost:       { label: "自分のキャラが倒される", n: true, text: n => `自分のキャラが通算${n}体倒される` },
  face:       { label: "相手プレイヤーにダメージを与える", n: true, text: n => `相手プレイヤーに通算${n}ダメージを与える` },
  maxHit:     { label: "一度に大きなダメージを与える", n: true, text: n => `一度に${n}以上のダメージを与える` },
  freeze:     { label: "凍結させる", n: true, text: n => `相手のキャラを通算${n}回凍結させる` },
  stoneUse:   { label: "魔石を使う", n: true, text: n => `魔石を通算${n}使う` },
  trade:      { label: "カードを魔石と交換する", n: true, text: n => `カードを通算${n}回交換する` },
  dis:        { label: "カードを分解する", n: true, text: n => `カードを通算${n}枚分解する` },
  info:       { label: "情報屋で買う", n: true, text: n => `情報屋で通算${n}回買う` },
  quest:      { label: "クエストを達成して受け取る", n: true, text: n => `クエストの報酬を通算${n}回受け取る` },
  login:      { label: "ログインボーナスを受け取る", n: true, text: n => `ログインボーナスを通算${n}日受け取る` },
  gift:       { label: "配布だけ（メール・シリアル・イベント）", text: () => "特別な配布で手に入る" }
};
const QUEST_TYPES = {
  winLv:  { label: "CPUに勝つ（強さを選ぶ）", lv: true, text: (n, q) => `CPU（${CPU_LV_NAMES[q.lv] || "中級"}）に${n}回勝つ` },
  boss:   { label: "隠しボスに勝つ（上級か超級を選ぶ）", lv: true, text: (n, q) => `${q.lv === "ex" ? "超級" : "上級"}の隠しボスに${n}回勝つ` },
  win:    { label: "対戦に勝つ", text: n => `対戦に${n}回勝つ` },
  battle: { label: "対戦する（勝ち負けは問わない）", text: n => `対戦を${n}回する` },
  online: { label: "友達と対戦する", text: n => `友達と${n}回対戦する` },
  pack:   { label: "パックを開ける", text: n => `パックを${n}パック開ける` },
  trade:  { label: "カードを交換する（ショップ）", text: n => `ショップでカードを${n}枚交換する` },
  dis:    { label: "カードを分解する", text: n => `カードを${n}枚分解する` },
  deck:   { label: "デッキを作る（30枚で保存）", text: n => `30枚のデッキを${n}つ保存する` },
  spell:  { label: "対戦で魔法を使う", text: n => `対戦で魔法を${n}回使う` },
  char:   { label: "対戦でキャラを出す", text: n => `対戦でキャラを${n}体出す` },
  kill:   { label: "対戦で相手のキャラを倒す", text: n => `対戦で相手のキャラを${n}体倒す` },
  face:   { label: "相手プレイヤーにダメージ", text: n => `相手プレイヤーに合計${n}ダメージを与える` },
  poison: { label: "毒で倒す", text: n => `「毒」で相手のキャラを${n}体倒す` },
  freeze: { label: "凍結させる", text: n => `相手のキャラを${n}回凍結させる` },
  gear:   { label: "歯車を使う", text: n => `歯車を${n}枚使う` }
};
const questText = q => (QUEST_TYPES[q.type] ? QUEST_TYPES[q.type].text(q.n, q) : "？");
const questReward = q => [q.gold ? `${q.gold}G` : "", q.stones ? `魔石${q.stones}` : "", q.tickets ? `パック券${q.tickets}枚` : ""].filter(Boolean).join("・");
/* デイリーの候補。毎日、この中から3つを抽選（人ごと・日ごとに決まる） */
const DAILY_POOL = [
  { id: "d-hard",   type: "winLv", lv: "hard", n: 1, gold: 500 },
  { id: "d-normal", type: "winLv", lv: "normal", n: 1, gold: 300 },
  { id: "d-win2",   type: "win", n: 2, gold: 400 },
  { id: "d-bat3",   type: "battle", n: 3, gold: 300 },
  { id: "d-poison", type: "poison", n: 1, gold: 500 },
  { id: "d-pack",   type: "pack", n: 1, stones: 300 },
  { id: "d-spell",  type: "spell", n: 5, gold: 300 },
  { id: "d-char",   type: "char", n: 8, gold: 300 },
  { id: "d-kill",   type: "kill", n: 6, gold: 400 },
  { id: "d-face",   type: "face", n: 20, gold: 400 },
  { id: "d-freeze", type: "freeze", n: 2, gold: 400 },
  { id: "d-trade",  type: "trade", n: 1, stones: 200 }
];
/* 初心者歓迎クエスト（恒常）。上から順に表示。全部終わると、贈り物のデッキ（level "gift"）から1つ選べる */
const BEGINNER = [
  { id: "b-deck",   type: "deck", n: 1, gold: 200 },
  { id: "b-easy",   type: "winLv", lv: "easy", n: 1, gold: 300 },
  { id: "b-pack",   type: "pack", n: 1, stones: 300 },
  { id: "b-trade",  type: "trade", n: 1, gold: 200 },
  { id: "b-spell",  type: "spell", n: 5, gold: 300 },
  { id: "b-normal", type: "winLv", lv: "normal", n: 1, gold: 500 },
  { id: "b-bat5",   type: "battle", n: 5, tickets: 1 }
];

const MAIL_TO = { all: "全員（これから始める人にも届く）", before: "送った日までに始めた人だけ", new: "送った日から後に始めた人（ずっと届く）" };
/* 選択券で選べるカード */
function pickPool(pk, defs) {
  return defs.filter(c => c && !c.token && !c.boss && !c.shop && c.limit > 0 && pk.rarity.includes(c.rarity) && (!pk.sets.length || pk.sets.includes(c.set || "1")));
}
const DEFAULT_LOGIN = [{ gold: 50 }, { gold: 50 }, { stones: 20 }, { gold: 100 }, { gold: 50 }, { stones: 30 }, { tickets: 1 }];
/* 効果1つの欠けを補う（追加の設定：card＝トークン、kw＝与える能力、world＝世界の絞り込み、ctype＝カードの種類） */
function normEffect(e, type) {
  e = migrateEffect(e);
  const def = EFFECTS[e.kind], o = def.opts || [];
  const out = { kind: e.kind, n: Math.max(def.min ?? 1, Math.min(99, Math.round(+e.n || 0))) };
  if (type !== "spell" && WHENS[e.when] && e.when !== "play") out.when = e.when;
  if (out.when === "cardPlay") { if (WORLDS[e.pw]) out.pw = e.pw; if (TYPES[e.pt]) out.pt = e.pt; }
  if (e.kind === "unit") {
    out.act = UACTS[e.act] ? e.act : "dmg";
    let to = UTOS[e.to] ? e.to : "enemy1";
    if (UTOS[to].charOnly && type === "spell") to = "own1";
    if (UTOS[to].faceOnly && !UACTS[out.act].faceOK) to = "enemy1";
    if (UACTS[out.act].enemyOnly && sideOfTo(to) !== "enemy") to = "enemy1";
    out.to = to;
    const ua = UACTS[out.act];
    if (!ua.n) out.n = 1;
    else if (!ua.signed) out.n = Math.max(ua.zero ? 0 : 1, out.n);
    else if (!out.n) out.n = 1;
    if (ua.kw && (KEYWORDS[e.kw] || e.kw === "armor")) out.kw = e.kw;
    if (out.kw === "armor") out.n = Math.max(1, Math.min(9, Math.round(+e.n || 1)));   // 装甲は数値つき（装甲2など）
    if (ua.kw && e.turn) out.turn = true;
    if (ua.token && e.card) out.card = String(e.card);
    if ((UTOS[to].world || ["enemy1", "own1", "any1"].includes(to)) && WORLDS[e.world]) out.world = e.world;   // 選ぶ対象も世界で絞れる（強い付与は「自分の神話のキャラ1体」など）
  } else if (e.kind === "player") {
    out.act = PACTS[e.act] ? e.act : "dmg";
    out.who = PWHO[e.who] ? e.who : "opp";
    out.n = Math.max(1, out.n);
  }
  if (e.kind === "merge" && e.into) out.into = String(e.into);
  if (e.kind === "costDown") out.dur = e.dur === "game" ? "game" : "turn";
  if (o.includes("token") && e.card) out.card = String(e.card);
  if (o.includes("kw") && (KEYWORDS[e.kw] || e.kw === "armor")) out.kw = e.kw;
  if (o.includes("world") && WORLDS[e.world]) out.world = e.world;
  if (o.includes("ctype") && TYPES[e.ctype]) out.ctype = e.ctype;
  if (o.includes("cmin") && +e.cmin > 0) out.cmin = Math.max(1, Math.min(10, Math.round(+e.cmin)));
  if (e.per === "gear" || e.per === "played") out.per = e.per;
  if (e.per === "played" && e.split) out.split = true;   // 倍にせず、その回数だけくり返す（ランダムな対象を毎回選び直す）   // 使った歯車／先に使ったカード 1枚ごとに n 倍
  if (e.turn && e.act === "atk") out.turn = true;   // 攻撃力アップ（このターンだけ）
  if (CONDS[e.cond]) {
    out.cond = e.cond;
    if (!CONDS[e.cond].noN) out.cn = Math.max(0, Math.min(30, Math.round(+e.cn || 0)));
    if (CONDS[e.cond].world && WORLDS[e.cworld]) out.cworld = e.cworld;
    if (e.cond === "tribeGE" && TRIBES[e.ctribe]) out.ctribe = e.ctribe;
  }
  // 第3弾の設定（工房ではまだ変えられないが、消さずに残す）
  if (out.when === "cardPlay" && TRIBES[e.ptr]) out.ptr = e.ptr;
  if (out.when === "allyDeath" && (e.af === "ghost" || TRIBES[e.af])) out.af = e.af;
  if (TRIBES[e.tribe]) out.tribe = e.tribe;
  if (e.cmax != null && e.cmax !== "" && +e.cmax >= 0) out.cmax = Math.min(20, Math.round(+e.cmax));
  if (KEYWORDS[e.kwf]) out.kwf = e.kwf;
  if (e.kind === "unit" && out.kw && e.mine) out.mine = true;
  if (+e.cap > 0) out.cap = Math.min(9, Math.round(+e.cap));
  if (e.amt) out.amt = true;
  if (TRIBES[e.plus]) { out.plus = e.plus; out.plusMax = Math.max(1, Math.min(9, Math.round(+e.plusMax || 2))); }
  if (e.per === "milledGhost") out.per = e.per;
  if (e.kind === "reviveSel") { out.cnt = Math.max(1, Math.min(4, Math.round(+e.cnt || 1))); if (+e.total > 0) out.total = Math.min(40, Math.round(+e.total)); if (e.mod === "rusty" || e.mod === "rush") out.mod = e.mod; }
  if (e.kind === "dig" && e.rest === "grave") out.rest = "grave";
  if (e.kind === "cutOne" && TYPES[e.ctype]) out.ctype = e.ctype;
  return out;
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
    hp: c.type === "spell" ? undefined : Math.max(c.gear ? 0 : 1, c.gear ? (+c.hp || 0) : (+c.hp || 1)),   // 歯車で強くなるカードは0/0もあり
    glyph: String(c.glyph || "？"),
    // 1デッキに入れられる上限（0なら使えない）。古い形式の copies（共通山札の枚数）からも読める
    boss: !!c.boss && !c.token,   // ボス限定：パックや交換では手に入らず、隠しボスを倒すと手に入る
    ...(c.shop && !c.token && !c.boss ? { shop: true, ...(+c.shopPrice > 0 ? { shopPrice: Math.floor(+c.shopPrice) } : {}) } : {}),   // ショップ限定：ショップの「限定カード」で魔石と交換する
    token: !!c.token,   // トークン：効果で出すだけのカード（デッキに入らない・パックから出ない）
    limit: c.token ? 0 : Math.max(0, c.limit != null ? +c.limit || 0 : c.copies != null ? Math.min(3, +c.copies || 0) : 3),
    rarity: RARITY[c.rarity] ? c.rarity : (+c.cost >= 7 ? "legend" : +c.cost >= 5 ? "rare" : "common"),
    keywords: Array.isArray(c.keywords) ? c.keywords.filter(k => KEYWORDS[k]) : [],
    armor: c.type === "spell" ? 0 : Math.max(0, Math.min(9, +c.armor || 0)),
    pay: c.pay && PAYS[c.pay.kind] ? { kind: c.pay.kind, n: Math.max(1, +c.pay.n || 1) } : null,
    ...(normSet(c.set) ? { set: normSet(c.set) } : {}),   // 弾（なし＝第1弾）
    // 手札で小さくなる：手札にある間、自分が（世界・種類の）カードを使うたびにコストが n 下がる
    // 妖気：このターン、（世界・種類の）カードを使うたびに、手札のこのカードが1ずつ強くなる。stat＝攻撃力と体力、dmg＝効果のダメージ、num＝そのほかの効果の数
    ...(c.req && +c.req.n > 0 ? { req: { n: Math.min(5, Math.round(+c.req.n)), ...(WORLDS[c.req.world] ? { world: c.req.world } : {}), ...(TRIBES[c.req.tribe] ? { tribe: c.req.tribe } : {}), ...(c.req.orEmpty ? { orEmpty: true } : {}) } } : {}),
    // 第3弾：種族・場にいる間の力・揺らぎ（中身のトークン）
    ...(TRIBES[c.tribe] ? { tribe: c.tribe } : {}),
    ...(c.aura && ["stat", "self", "cost"].includes(c.aura.kind) ? { aura: { kind: c.aura.kind, ...(WORLDS[c.aura.world] ? { world: c.aura.world } : {}), ...(TRIBES[c.aura.tribe] ? { tribe: c.aura.tribe } : {}),
      ...["atk", "hp", "n", "max"].reduce((o, k) => (+c.aura[k] > 0 ? { ...o, [k]: Math.min(9, Math.round(+c.aura[k])) } : o), {}) } } : {}),
    ...(Array.isArray(c.sway) && c.sway.length ? { sway: c.sway.filter(x => typeof x === "string" && x).slice(0, 5) } : {}),
    ...(c.grow ? { grow: { n: 1, ...(WORLDS[c.grow.world] ? { world: c.grow.world } : {}), ...(["char", "spell"].includes(c.grow.ctype) ? { ctype: c.grow.ctype } : {}),
      ...(c.grow.stat || c.grow.dmg || c.grow.num ? { stat: !!c.grow.stat, dmg: !!c.grow.dmg, num: !!c.grow.num } : c.type === "spell" ? { stat: false, dmg: true, num: false } : { stat: true, dmg: false, num: false }) } } : {}),
    ...(c.shrink ? { shrink: { n: 1, ...(WORLDS[c.shrink.world] ? { world: c.shrink.world } : {}), ...(["char", "spell"].includes(c.shrink.ctype) ? { ctype: c.shrink.ctype } : {}) } } : {}),
    // 歯車を使う：数（使ってもよい枚数）か "all"（すべて使う）
    ...(c.gear === "all" ? { gear: "all" } : +c.gear > 0 ? { gear: Math.min(20, Math.round(+c.gear)) } : {}),
    effects: Array.isArray(c.effects) ? c.effects.filter(e => EFFECTS[e.kind]).map(e => normEffect(e, c.type)) : [],
    note: c.note ? String(c.note) : "",
    artNote: c.artNote ? String(c.artNote) : "",   // イラストの指定（Gemini への依頼文に使う）
    art: c.art ? String(c.art) : ""
  })).filter(c => c.id);
  const decks = (Array.isArray(d.decks) ? d.decks : []).filter(x => x && x.id && x.cards).map(x => ({
    id: String(x.id), name: String(x.name || "デッキ"), cards: cleanDeckCards(x.cards),
    ...(x.level === "test" && x.pub ? { pub: true } : {}),   // 検証用でも、プレイヤーが「用意されたデッキから作る」でコピーできる（CPU戦では使わない）
    ...(typeof x.key === "string" && x.key ? { key: x.key } : {}),   // 代表カード（対戦の始まりの演出・相手の顔に使う）
    level: ["easy", "normal", "hard", "ex", "boss", "test", "gate", "gift"].includes(x.level) ? x.level : "normal"   // ex = 超級（第2弾をすべて開放すると出る）、test = 検証用（CPUもプレイヤーも使わない）、boss = 隠しボス用、gate = パック開放戦の相手（ふだんのCPU戦では使わない）
  }));
  const packs = (Array.isArray(d.packs) ? d.packs : []).filter(x => x && x.id).map(x => ({
    id: String(x.id), name: String(x.name || "パック"), price: Math.max(0, +x.price || 0), size: Math.max(1, Math.min(10, +x.size || 5)),
    cards: Array.isArray(x.cards) ? x.cards.map(String) : [],
    odds: {
      normal: Object.assign({}, DEFAULT_ODDS.normal, (x.odds && x.odds.normal) || {}),
      last: Object.assign({}, DEFAULT_ODDS.last, (x.odds && x.odds.last) || {})
    },
    open: x.open !== false,
    ...(normSet(x.set) ? { set: normSet(x.set) } : {}),
    // 第1弾以外：パック開放戦のルール（gateRule・gateWorld）と相手（CPU デッキの id・強さ）
    ...(normSet(x.set) ? { gateRule: GATE_RULES[x.gateRule] ? x.gateRule : "world" } : {}),
    ...(WORLDS[x.gateWorld] ? { gateWorld: x.gateWorld } : {}),
    ...(x.gateDeck ? { gateDeck: String(x.gateDeck) } : {}),
    ...(["easy", "normal", "hard"].includes(x.gateLevel) ? { gateLevel: x.gateLevel } : {}),
    ...(typeof x.art === "string" && x.art ? { art: x.art } : {})   // パックの表の絵（ui/…）
  }));
  config.SAMPLE_DECKS = config.SAMPLE_DECKS !== false;
  config.SEASON = String(config.SEASON || "beta").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "beta";
  config.MAINT_NOTE = String(config.MAINT_NOTE || "").slice(0, 80);   // メンテナンスの終わる予定など（画面に出す）
  config.ADMINS = (Array.isArray(config.ADMINS) ? config.ADMINS : []).filter(h => /^[0-9a-f]{64}$/.test(h));   // 運営用アカウント（コードのハッシュ）
  // シリアルコード。コードそのものは入れず、ハッシュ（h）だけを公開データに置く
  const serials = (Array.isArray(d.serials) ? d.serials : []).filter(x => x && /^[0-9a-f]{64}$/.test(x.h)).map(x => ({
    h: x.h, label: String(x.label || "シリアルコード").slice(0, 30),
    gold: Math.max(0, Math.floor(+x.gold || 0)), cards: cleanDeckCards(x.cards),
    until: /^\d{4}-\d{2}-\d{2}$/.test(x.until || "") ? x.until : "", created: x.created || "",
    // boss：受け取ると次の上級戦で隠しボスが出る（テスト用）。repeat：同じアカウントで何度でも使える
    ...(x.boss ? { boss: true } : {}), ...(x.repeat ? { repeat: true } : {}),
    // bossTest：受け取ると、その場で隠しボス（"ex"＝冥府の剣鬼）と検証の対戦ができる。報酬なし・非公開のボスでも戦える
    ...(x.bossTest === "ex" || x.bossTest === "hard" ? { bossTest: x.bossTest } : {})
  }));
  // お知らせ（アップデート内容など）と、メール（全員に届く。Gや魔石、パック券、カードを付けられる）
  const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
  const news = (Array.isArray(d.news) ? d.news : []).filter(x => x && x.id).map(x => ({ id: String(x.id), date: date(x.date), title: String(x.title || "お知らせ").slice(0, 40), body: String(x.body || "").slice(0, 4000) }));
  // 選択券：受け取ると、決められたレア度・弾のカードから好きな1枚を選べる。特別なものなので、作るたびに名前を変える（例：リリース記念レジェンド選択券）
  const picks = (Array.isArray(d.picks) ? d.picks : []).filter(x => x && /^[\w-]{1,40}$/.test(x.id)).map(x => ({ id: String(x.id), name: String(x.name || "カード選択券").slice(0, 30),
    rarity: (Array.isArray(x.rarity) ? x.rarity : [x.rarity]).filter(r => RARITY[r]), sets: (Array.isArray(x.sets) ? x.sets : []).map(s => String(s) === "1" ? "1" : normSet(s)).filter(Boolean) }));
  const pickIds = new Set(picks.map(p => p.id));
  const cleanPicks = o => Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => pickIds.has(k) && +v > 0).map(([k, v]) => [k, Math.min(9, Math.floor(+v))]));
  // メールの宛先 to：all＝全員（これから始める人にも届く）／before＝送った日までに始めた人だけ（お詫び・告知）／new＝送った日から後に始めた人（歓迎メール。期限なしで、ずっと届く）
  const mail = (Array.isArray(d.mail) ? d.mail : []).filter(x => x && x.id).map(x => ({ id: String(x.id), date: date(x.date), until: date(x.until), title: String(x.title || "運営からのメール").slice(0, 40), body: String(x.body || "").slice(0, 4000),
    to: ["all", "before", "new"].includes(x.to) ? x.to : "all",
    gold: Math.max(0, Math.floor(+x.gold || 0)), stones: Math.max(0, Math.floor(+x.stones || 0)), tickets: Math.max(0, Math.floor(+x.tickets || 0)), senTickets: Math.max(0, Math.min(99, Math.floor(+x.senTickets || 0))), cards: cleanDeckCards(x.cards), picks: cleanPicks(x.picks) }));
  // ログインボーナス（7日で1周。休んでも進んだ分は消えない）
  const login = (Array.isArray(d.login) && d.login.length ? d.login : DEFAULT_LOGIN).slice(0, 14).map(x => ({ gold: Math.max(0, Math.floor(+(x && x.gold) || 0)), stones: Math.max(0, Math.floor(+(x && x.stones) || 0)), tickets: Math.max(0, Math.floor(+(x && x.tickets) || 0)) }));
  // クエスト（工房の「クエスト」タブ）。1つのクエストは1つの目標と報酬
  const qItem = x => ({ id: String(x.id), ...(x.title ? { title: String(x.title).slice(0, 30) } : {}),
    type: x.type, ...(QUEST_TYPES[x.type] && QUEST_TYPES[x.type].lv ? { lv: CPU_LV_NAMES[x.lv] ? x.lv : x.type === "boss" ? "hard" : "normal" } : {}), n: Math.max(1, Math.min(999, Math.floor(+x.n || 1))),
    gold: Math.max(0, Math.floor(+x.gold || 0)), stones: Math.max(0, Math.floor(+x.stones || 0)), tickets: Math.max(0, Math.floor(+x.tickets || 0)) });
  const qList = (a, def) => (Array.isArray(a) && a.length ? a : def).filter(x => x && x.id && QUEST_TYPES[x.type]).slice(0, 60).map(qItem);
  const daily = qList(d.daily, DAILY_POOL);        // デイリーの候補（毎日この中から DAILY_N 個）
  const beginner = qList(d.beginner, BEGINNER);    // 初心者歓迎（上から順）
  const quests = (Array.isArray(d.quests) ? d.quests : []).filter(x => x && x.id && QUEST_TYPES[x.type]).map(x => ({ ...qItem(x), from: date(x.from), until: date(x.until) }));   // 期間限定
  // ショップの店員（1人目が最初からいる店員。ほかはスキンとして魔石で買える）
  const keepers = (Array.isArray(d.keepers) ? d.keepers : []).filter(x => x && /^[\w-]{1,30}$/.test(x.id)).slice(0, 30).map(x => ({
    id: x.id, name: String(x.name || "店員").slice(0, 20), title: String(x.title || "").slice(0, 30), price: Math.max(0, Math.floor(+x.price || 0)),
    ...(x.art && typeof x.art === "object" ? { art: Object.fromEntries(Object.entries(x.art).filter(([k, v]) => /^\w{1,20}$/.test(k) && typeof v === "string").map(([k, v]) => [k, v.slice(0, 300)])) } : {}),
    lines: Object.fromEntries(Object.keys(KEEPER_SCENES).map(k => [k, (Array.isArray(x.lines && x.lines[k]) ? x.lines[k] : []).map(t => String(t).trim().slice(0, 120)).filter(Boolean).slice(0, 20)]))
  }));
  // 情報屋の情報（文は工房で直せる。{BOSS_RATE} のように書くと、その設定の数字が入る）
  const info = (Array.isArray(d.info) ? d.info : []).filter(x => x && /^[\w-]{1,40}$/.test(x.id) && INFO_CATS[x.cat]).slice(0, 200).map(x => ({
    id: x.id, cat: x.cat, title: String(x.title || "情報").slice(0, 40), sub: String(x.sub || "").slice(0, 60), price: Math.max(0, Math.floor(+x.price || 0)),
    ...(x.ex ? { ex: true } : {}), ...(x.cat === "peek" ? { peek: INFO_PEEKS[x.peek] ? x.peek : "pityHard" } : { body: String(x.body || "").slice(0, 4000) }) }));
  // 称号（名前・説明・手に入れ方）。hidden＝手に入れるまで条件を「？？？」にする
  const titles = (Array.isArray(d.titles) ? d.titles : []).filter(x => x && /^[\w-]{1,40}$/.test(x.id)).slice(0, 300).map(x => {
    const c = x.cond && TITLE_CONDS[x.cond.type] ? x.cond : { type: "gift" }, T = TITLE_CONDS[c.type];
    return { id: x.id, name: String(x.name || "称号").slice(0, 12), desc: String(x.desc || "").slice(0, 60),
      cond: { type: c.type, ...(T.n ? { n: Math.max(1, Math.floor(+c.n || 1)) } : {}), ...(T.lv ? { lv: CPU_LV_NAMES[c.lv] ? c.lv : c.type === "bossWin" ? "hard" : "normal" } : {}), ...(T.set ? { set: /^[\w-]{1,40}$/.test(c.set || "") ? c.set : "pack1" } : {}) },
      ...(x.hidden ? { hidden: true } : {}) };
  });
  // スタンプ（文字だけ、または絵。free＝最初から持っている）
  const stamps = (Array.isArray(d.stamps) ? d.stamps : []).filter(x => x && /^[\w-]{1,40}$/.test(x.id)).slice(0, 200).map(x => ({
    id: x.id, text: String(x.text || "").slice(0, 12), ...(typeof x.art === "string" && x.art ? { art: x.art.slice(0, 300) } : {}), ...(x.free ? { free: true } : {}), price: Math.max(0, Math.floor(+x.price || 0)) }));
  // スキン（見た目の品）
  const skins = (Array.isArray(d.skins) ? d.skins : []).filter(x => x && /^[\w-]{1,40}$/.test(x.id) && ["sleeve", "frame", "icon", "bg", "home", "keeper", "bgm", "art"].includes(x.kind)).slice(0, 300).map(x => ({
    id: x.id, kind: x.kind, name: String(x.name || "スキン").slice(0, 30), desc: String(x.desc || "").slice(0, 80), price: Math.max(0, Math.floor(+x.price || 0)),
    ...(typeof x.art === "string" && x.art ? { art: x.art.slice(0, 300) } : {}), ...(x.default ? { default: true } : {}),
    ...(typeof x.ref === "string" && x.ref ? { ref: x.ref.slice(0, 40) } : {}), ...(typeof x.card === "string" && x.card ? { card: x.card.slice(0, 40) } : {}) }));
  // 選定戦：勝った数（0〜7）ごとの報酬と、候補に出さないカード
  const SEN_DEF = [[100, 0, 0, 0], [200, 0, 0, 0], [400, 0, 0, 0], [500, 0, 1, 0], [700, 100, 1, 0], [900, 200, 2, 0], [1200, 300, 2, 0], [1500, 500, 2, 1]];
  const sr = d.sen && Array.isArray(d.sen.rewards) && d.sen.rewards.length ? d.sen.rewards : SEN_DEF.map(([gold, stones, tickets, srTickets]) => ({ gold, stones, tickets, srTickets }));
  const sen = { rewards: Array.from({ length: 8 }, (_, i) => { const x = sr[i] || sr[sr.length - 1] || {}; const n = k => Math.max(0, Math.floor(+x[k] || 0)); return { gold: n("gold"), stones: n("stones"), tickets: n("tickets"), srTickets: n("srTickets") }; }),
    ban: d.sen && Array.isArray(d.sen.ban) ? [...new Set(d.sen.ban.filter(x => typeof x === "string" && /^[\w-]{1,40}$/.test(x)))].slice(0, 400) : [],
    checked: d.sen && Array.isArray(d.sen.checked) ? d.sen.checked.filter(x => typeof x === "string" && x.length <= 20).slice(0, 100) : [] };   // 出禁を確認したパック（工房の注意書き用）
  // アリーナ（決まった時間だけのランダム対戦）：曜日ごとのルール（"" は開かない）・開く時刻・特別に開く日時
  const A0 = d.arena || {}, AR = ["std", "sen", "set1"], hm = v => /^\d{2}:\d{2}$/.test(v || "") ? v : null;
  const arena = { on: A0.on === 0 ? 0 : 1, start: hm(A0.start) || "21:00", end: hm(A0.end) || "21:30",
    days: Array.from({ length: 7 }, (_, i) => { const v = Array.isArray(A0.days) ? A0.days[i] : ARENA_DAYS_DEF[i]; return v === "" ? "" : AR.includes(v) ? v : ARENA_DAYS_DEF[i]; }),
    extra: (Array.isArray(A0.extra) ? A0.extra : []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && hm(x.start) && hm(x.end) && AR.includes(x.rule)).map(x => ({ date: x.date, start: x.start, end: x.end, rule: x.rule })).slice(0, 60),
    // 報酬：part＝参加賞（点が入った対戦が1戦以上）、rank＝1位から順。since の日より後の回から配る
    rewards: arenaRewards(A0.rewards) };
  return { version: +d.version || 1, updated: d.updated || "", config, cards, decks, packs, serials, news, mail, login, picks, quests, daily, beginner, keepers, info, titles, stamps, skins, sen, arena };
}

function cleanDeckCards(cards) {
  const o = {};
  Object.entries(cards || {}).forEach(([k, v]) => { v = Math.floor(+v || 0); if (v > 0) o[String(k)] = v; });
  return o;
}

/* デッキの枚数とルール違反を調べる。cardsById は id→カード */
const MISSING_PREFIX = "持っていないカードが";
/* デッキに入っている、まだ持っていないカードの枚数 */
function deckMissing(deck, owned) { return owned ? Object.entries(deck.cards || {}).reduce((a, [id, n]) => a + Math.max(0, n - owned(id)), 0) : 0; }
/* デッキの30枚がすべて同じ世界なら、その世界（myth / fan / mech）。混ざっていれば null（世界限定のルール用） */
function deckWorld(deck, cardsById) {
  const defs = cardsById || (typeof DEF !== "undefined" ? DEF : {});
  const ws = new Set(Object.entries(deck.cards || {}).filter(([, n]) => n > 0).map(([id]) => defs[id] ? defs[id].world : "?"));
  return ws.size === 1 && !ws.has("?") ? [...ws][0] : null;
}
/* 第1弾のカードだけのデッキか（アリーナの「第1弾限定」） */
function deckSet1(deck, cardsById) {
  const defs = cardsById || (typeof DEF !== "undefined" ? DEF : {});
  return Object.entries(deck.cards || {}).filter(([, n]) => n > 0).every(([id]) => defs[id] && String(defs[id].set || "1") === "1" && !defs[id].shop);
}
function deckCount(deck) { return Object.values(deck.cards || {}).reduce((s, n) => s + n, 0); }
function deckProblems(deck, cardsById, config, owned) {
  const probs = [];
  if (deck.free) {
    if (!config.SAMPLE_DECKS) probs.push("サンプルデッキは今は使えません");
    owned = null; // サンプルデッキは所持数を問わない
  }
  const total = deckCount(deck);
  if (total !== config.DECK_SIZE) probs.push(`${config.DECK_SIZE}枚ちょうどにしてください（今 ${total}枚）`);
  let miss = 0;
  Object.entries(deck.cards || {}).forEach(([id, n]) => {
    const c = cardsById[id];
    if (!c || c.limit <= 0) probs.push("今は使えないカードが入っています");
    else if (n > cardLimit(c, config, deck)) probs.push(`${c.name}は${cardLimit(c, config, deck)}枚までです`);
    else if (owned && n > owned(id)) miss += n - owned(id);
  });
  // 持っていないカードも入れて保存はできる（目指すデッキ）。対戦には、全部そろってから使える
  if (miss) probs.push(`${MISSING_PREFIX}${miss}枚入っています（パックやショップで手に入れると使えます）`);
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
  // まだ持っていないカード（want）も含めた「目指すデッキ」をコードにする
  const all = { ...(deck.cards || {}) };
  Object.entries(deck.want || {}).forEach(([id, n]) => { all[id] = (all[id] || 0) + n; });
  const body = String(deck.name || "デッキ").replace(/[|]/g, "") + "|" + Object.entries(all).filter(([, n]) => n > 0).map(([id, n]) => n > 1 ? `${id}*${n}` : id).join(",");
  return "KYK2:" + b64urlEnc(body);
}
/* 貼り付けた文字を、コードとして読める形に戻す。
   iPhone でメモや LINE を通すと、英数字が全角になったり「-」が別の横線に変わったりすることがあるため */
function normCodeText(code) {
  let t = String(code || "");
  try { t = t.normalize("NFKC"); } catch {}
  return t.replace(/[\s\u200b-\u200d\u2060\ufeff]+/g, "")
    .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d\u30fc\u2500]/g, "-")
    .replace(/[：]/g, ":");
}
function codeToDeck(code) {
  // 貼り付けたときに入りがちな改行・空白・全角のコロンを取り除き、文章の中からコードの部分だけを探す
  const t = normCodeText(code);
  let m = t.match(/KYK2:([A-Za-z0-9_-]+)/i);
  if (m) {
    try {
      const body = b64urlDec(m[1]);
      const i = body.indexOf("|"); if (i < 0) return null;
      const cards = {};
      body.slice(i + 1).split(",").filter(Boolean).forEach(x => { const [id, n] = x.split("*"); cards[id] = (cards[id] || 0) + Math.max(1, Math.min(99, +n || 1)); });
      return { name: body.slice(0, i).slice(0, 16) || "デッキ", cards: cleanDeckCards(cards) };
    } catch { return null; }
  }
  m = t.match(/KYK1:([A-Za-z0-9+/=]+)/i);
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

/* G・魔石・パック券の絵（ホームの所持数やログインボーナスで使う）。グラデーションの id は呼ぶたびに変える */
let _curN = 0;
function curIcon(kind, cls) {
  const g = "cu" + (++_curN), c = cls || "cur-ic";
  if (kind === "ticket") return `<svg class="${c}" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#b8862e"/></linearGradient></defs><rect x="5" y="9" width="30" height="22" rx="3" fill="url(#${g})" stroke="#5a3d0c" stroke-width="1.5"/><path d="M26 9v22" stroke="#5a3d0c" stroke-width="1.2" stroke-dasharray="2 2"/><path d="M12 15h10M12 20h8M12 25h10" stroke="#5a3d0c" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  // G と魔石は、ゲーム全体で同じ絵（ui/cur-gold.webp・ui/cur-stone.webp）
  if (kind === "stone") return `<img class="${c} cur-img" src="ui/cur-stone.webp" alt="" aria-hidden="true" draggable="false">`;
  return `<img class="${c} cur-img" src="ui/cur-gold.webp" alt="" aria-hidden="true" draggable="false">`;
}
/* 説明は画面に長く書かず、見出しの横の「？」から小窓で出す（2026-11-20 オーナー：説明文が商業ゲームっぽくない） */
function helpBtn(title, html) { return `<button type="button" class="helpbtn" data-act="help" data-t="${esc(title)}" data-h="${esc(html)}" aria-label="${esc(title)}の説明">?</button>`; }
/* 大事な決まりだけ、短い札で並べる */
function ruleChips(list) { const L = list.filter(Boolean); return L.length ? `<div class="rchips">${L.map(x => `<span class="rchip">${x}</span>`).join("")}</div>` : ""; }
/* 所持数の札（絵＋数）。読み上げ用に「1200G」「魔石 30」の名前を付ける */
function goldTag(n) { return `<span class="goldtag" aria-label="所持 ${n}G">${curIcon("gold")}<span>${n.toLocaleString()}</span></span>`; }
function stoneTag(n) { return `<span class="stonetag" aria-label="魔石 ${n}個">${curIcon("stone")}<span>${n.toLocaleString()}</span></span>`; }
function ticketTag(n) { return `<span class="tickettag" aria-label="パック券 ${n}枚">${curIcon("ticket")}<span>${n.toLocaleString()}</span></span>`; }

/* PC（マウス）：カードにマウスを重ねると、名前と効果を横に出す（デッキ編成・カード一覧・パック・工房など。対戦中の手札と場は game.js が出す） */
const CardTip = {
  el: null, cur: null,
  show(card, id) {
    const c = cardRef(id); if (!c) return;
    if (!this.el) { this.el = document.createElement("div"); this.el.id = "cardtip"; this.el.setAttribute("role", "tooltip"); document.body.appendChild(this.el); }
    const el = this.el;
    el.innerHTML = `<b class="ct-name">${esc(c.name)}</b><span class="ct-meta">${WORLDS[c.world] || ""} ・ ${TYPES[c.type] || ""} ・ コスト${c.cost}${c.type === "char" ? ` ・ ${c.atk}/${c.hp}` : ""}</span><p class="ct-text">${cardTextHTML(c, { full: true })}</p>`;
    el.hidden = false; el.style.display = "block";
    const r = card.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let x = r.right + 10; if (x + w > innerWidth - 8) x = r.left - w - 10; if (x < 8) x = Math.max(8, Math.min(innerWidth - w - 8, r.left));
    let y = r.top; if (y + h > innerHeight - 8) y = innerHeight - h - 8;
    el.style.left = x + "px"; el.style.top = Math.max(8, y) + "px";
    this.cur = card;
  },
  hide() { if (this.el) this.el.style.display = "none"; this.cur = null; }
};
if (typeof document !== "undefined" && typeof matchMedia !== "undefined" && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const skip = ".dmodal-card, .sheet-card, #preview, #cardtip, .tutbox";
  document.addEventListener("pointerover", e => {
    if (e.pointerType !== "mouse") return;
    const card = e.target.closest && e.target.closest(".card[data-cid]");
    if (!card || card === CardTip.cur) return;
    if (card.dataset.hand != null || card.dataset.uid != null || card.closest(skip)) return;
    CardTip.show(card, card.dataset.cid);
  });
  document.addEventListener("pointerout", e => { if (CardTip.cur && !CardTip.cur.contains(e.relatedTarget)) CardTip.hide(); });
  ["pointerdown", "scroll", "wheel"].forEach(ev => document.addEventListener(ev, () => CardTip.hide(), true));
}
