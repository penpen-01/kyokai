/* =========================================================
   境界の召喚士 — ゲームと編集ページで共通の定義
   ========================================================= */

const WORLDS = { myth: "神話", fan: "幻想", mech: "機械" };
const TYPES = { char: "キャラクター", spell: "魔法" };
/* 弾（カードとパックの区分）。第2弾以降は、パック開放戦に勝つまでプレイヤーには見せない */
/* 弾は「1」「2-1」「2-2」「2-3」「3」のような文字。第2弾は世界ごとに3つ（2-1・2-2・2-3）に分かれて出る。
   第1弾以外は、その弾のパック開放戦に勝つまでプレイヤーに見せない（開放はパックの弾ごと） */
const SETS = { "1": "第1弾", "2-1": "第2弾-1", "2-2": "第2弾-2", "2-3": "第2弾-3", "3": "第3弾" };
const SET_KEYS = ["1", "2-1", "2-2", "2-3", "3"];   // 並び順（SETS を Object.entries で回すと "1","3" が先に来てしまうので、必ずこちらを使う）
const setName = s => SETS[s || "1"] || `第${String(s).replace("-", "弾-")}${String(s).includes("-") ? "" : "弾"}`;
const normSet = v => { const s = String(v ?? "").trim(); return /^\d{1,2}(-\d{1,2})?$/.test(s) && s !== "1" ? s : ""; };
function setOpen(s) {
  if (!s || s === "1") return true;
  if (typeof DATA_INFO !== "undefined" && DATA_INFO.draft) return true;   // 試遊中（?draft）はすべて見える
  return typeof Account !== "undefined" && !!(Account.data && (Account.data.opened || []).includes(s));
}
/* プレイヤーに見せてよいカード（開放していない弾のカードは、一覧・デッキ作り・交換に出さない。持っていれば見せる） */
const cardShown = c => !!c && (setOpen(c.set) || (typeof Account !== "undefined" && Account.data && Account.owned(c.id) > 0));
/* パック開放戦のルール（パックごとに決める）。今は「世界限定」と「制限なし」。あとでレア度の制限・相手の特殊ルールなどを足す */
const GATE_RULES = {
  world: { label: "世界限定", text: p => `使えるのは、30枚すべて${WORLDS[p.gateWorld] || "決めた世界"}のカードで組んだデッキだけ。`, deckOK: (p, d) => deckWorld(d) === p.gateWorld },
  free:  { label: "制限なし", text: () => "自分のデッキなら、どれでも使える。", deckOK: () => true }
};

/* キャラクターの能力（キーワード） */
const KEYWORDS = {
  haste:   { label: "速攻", short: "速", text: "場に出したターンから攻撃できる。" },
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
  doom:    { label: "死の宣告", short: "死", text: "場に出した次の自分のターンの終わりに破壊される。" }
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
  recycle:     { group: "ドロー", label: "倒された自分のキャラを山札に戻す（墓地からN枚）", text: (n, e) => `この対戦で倒された自分の${worldNo(e)}キャラを${n}枚まで、山札に混ぜる。`, opts: ["world"] },
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
  tutor:       { group: "ドロー", label: "山札から種類を指定して手札に加える", text: (n, e) => `山札から${costRange(n, e)}${worldNo(e)}${ctypeName(e)}をランダムに1枚手札に加える。`, opts: ["world", "ctype", "cmin"], min: 0 },
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
  revive:      { group: "召喚",   label: "破壊された自分のキャラを復活させる", text: (n, e) => `この対戦で破壊された自分の${costRange(n, e, true)}キャラをランダムに1体、場に出す（登場時効果は発動しない）。`, opts: ["cmin"] },
  banishOwn:   { group: "亜空間", label: "自分のキャラをすべて亜空間に送る", text: () => "自分のキャラをすべて亜空間に送る。次の自分のターンの開始時に、元の場所に戻る（受けたダメージや強化はそのまま。登場時効果は発動しない）。戻るまで、その場所にはキャラを出せない。", noN: true }
};

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
  copy:      { label: "複製を自分の場に出す（今の状態ごと）" },
  steal:     { label: "奪う（相手キャラだけ）", enemyOnly: true }
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
  self:      { label: "このキャラ", side: "own", charOnly: true }
};
/* 汎用「プレイヤーに効果」 */
const PACTS = { dmg: "ダメージを与える", heal: "体力を回復する", draw: "カードを引かせる", discard: "手札をランダムに捨てさせる" };
const PWHO = { opp: "相手", self: "自分", both: "おたがい" };
const intoDesc = e => { const c = e && e.into && cardRef(e.into); return c ? `「${c.name}」${c.type === "char" ? `（${c.atk}/${c.hp}）` : ""}` : "（合体先未設定）"; };
/* 対象の言い方。own は、キャラの効果ならそのキャラ自身は選べない */
function toPhrase(e, isChar, auto) {
  const w = worldNo(e), to = e.to;
  if (auto && to === "enemy1") return "ランダムな相手キャラ1体";
  if (auto && to === "own1") return isChar ? "このキャラ以外のランダムな自分のキャラ1体" : "ランダムな自分のキャラ1体";
  if (auto && to === "any1") return "ランダムなキャラ1体";
  if (auto && to === "enemyF") return "ランダムな相手キャラ1体か相手プレイヤー";
  return {
    enemy1: w ? `相手の${w}キャラ1体` : "相手キャラ1体", own1: isChar ? `このキャラ以外の自分の${w}キャラ1体` : `自分の${w}キャラ1体`, any1: isChar ? `このキャラ以外の${w}キャラ1体（自分か相手）` : `${w}キャラ1体（自分か相手）`,
    enemyF: "相手キャラ1体か相手プレイヤー", enemyRand: "ランダムな相手キャラ1体", enemyRandF: "ランダムな相手キャラ1体か相手プレイヤー", anyRand: isChar ? "このキャラ以外のランダムなキャラ1体（自分か相手）" : "ランダムなキャラ1体（自分か相手）", ownRand: isChar ? "このキャラ以外のランダムな自分のキャラ1体" : "ランダムな自分のキャラ1体",
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
    case "grant": return `${T}に「${kwName(e)}」を与える${e.turn ? "（このターンだけ）" : e.kw === "doom" ? "（持ち主の次のターンの終わりに破壊される）" : ""}。`;
    case "silence": return side === "own" ? `${T}を沈黙させる（効果と能力をすべて失う。不動や死の宣告も消える）。` : `${T}を沈黙させる（効果と能力をすべて失う）。`;
    case "bounce": return side === "own" ? `${T}を手札に戻す（トークンは消える）。` : `${T}を持ち主の手札に戻す（トークンは消える）。`;
    case "shuffle": return side === "enemy" ? `${T}を相手の山札に混ぜる（トークンは消える）。` : `${T}を持ち主の山札に混ぜる（トークンは消える）。`;
    case "transform": return e.card ? `${T}を${tokDesc(e)}に変身させる。` : `${T}を、効果も能力もない1/1に変身させる。`;
    case "swap": return `${T}の攻撃力と体力を入れ替える。`;
    case "banish": return side === "own" ? `${T}を亜空間に送る（次の自分のターンの始めに、同じ場所に戻る）。` : side === "enemy" ? `${T}を亜空間に送る（相手の次のターンの始めに戻る）。` : `${T}を亜空間に送る（持ち主の次のターンの始めに戻る）。`;
    case "copy": return `${T}の複製を、自分の場に1体出す（受けたダメージ・強化・与えられた能力もそのまま写す。登場時の効果は発動しない）。`;
    case "steal": return `${T}を奪う（自分の場に空きがあるときだけ。奪ったターンは攻撃できない）。`;
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
  back:      { label: "場から手札に戻ったとき",       head: "場から手札に戻ったとき" }
};
/* 効果ごとの条件（effect.cond）。満たしていないとその効果は発動しない。cn＝数値、cworld＝世界 */
const CONDS = {
  hpLE:    { label: "自分の体力がN以下",          text: e => `自分の体力が${e.cn}以下なら` },
  worldGE: { label: "自分の場に（世界の）キャラがN体以上", text: (e, isChar) => `自分の場に${WORLDS[e.cworld] ? WORLDS[e.cworld] + "の" : ""}キャラが${e.cn}体以上いれば${isChar ? "（このキャラも数える）" : ""}` , world: true },
  combo:   { label: "このターン、すでにほかのカードを使った（コンボ）", text: () => "このターン、すでにほかのカードを使っていれば", noN: true },
  playedGE:{ label: "詠唱N（このターン、先にカードをN枚以上使った）", text: e => `詠唱${e.cn}（このターン、先にカードを${e.cn}枚以上使っていれば）` },
  handZero:{ label: "手札が0枚",                  text: () => "自分の手札が0枚なら", noN: true },
  handGE:  { label: "手札がN枚以上",              text: e => `自分の手札が${e.cn}枚以上なら` },
  maxEGE:  { label: "最大エナジーがN以上",        text: e => `自分のエナジーの最大値が${e.cn}以上なら` },
  bounced: { label: "手札に戻せた", text: () => "手札に戻せたら", noN: true },
  recycled:{ label: "山札に戻せた", text: () => "1枚でも戻せたら", noN: true },
  gearPaid:{ label: "出すときに歯車を使った",     text: () => "歯車を使ったなら", noN: true },
  gearNone:{ label: "出すときに歯車を使わなかった", text: () => "歯車を使わなかったなら", noN: true }
};
/* 歯車：手札で重なるカード（何枚あっても手札1枠。枚数は p.gears）。これだけでは使えず、「歯車を使う」カードの材料になる */
const GEAR_ID = "tk-gear";
/* 使える条件の文 */
const reqText = r => `使える条件：自分の場に${r.world ? WORLDS[r.world] + "の" : ""}キャラが${r.n}体以上いる${r.orEmpty ? "か、自分の場にキャラが1体もいない" : ""}とき`;
const condText = (e, isChar = true) => (e && CONDS[e.cond] ? CONDS[e.cond].text(e, isChar) : "");
const whenOf = e => (e && WHENS[e.when] ? e.when : "play");
/* 使ったとき（登場時）の効果だけ */
const playEffects = card => (card.effects || []).filter(e => whenOf(e) === "play");

const DEFAULT_CONFIG = {
  PLAYER_HP: 20, START_HAND: 5, ENERGY_MAX: 10, FIELD_MAX: 4, HAND_MAX: 10, FATIGUE: 2, SECOND_BONUS: 0, SECOND_COIN: 1, DECK_SIZE: 30, COPY_MAX: 3, DECK_MAX: 10, DECK_SLOT_COST: 1500, DECK_SLOT_MAX: 10,
  // ここから下はゲームの裏側（報酬・配布）
  STARTING_GOLD: 100, REWARD_EASY: 30, REWARD_NORMAL: 60, REWARD_HARD: 120, REWARD_EX: 450, REWARD_ONLINE: 80,
  STREAK_STEP: 10, STREAK_MAX: 50,
  BOSS_RATE: 5, BOSS_PITY: 20, BOSS_HP: 25, SAMPLE_ONLINE_DAY: 3, SAMPLE_CPU: 1,
  // ショップ：上限を超えたカードを分解したときの魔石と、交換に必要な魔石（レア度ごと）・パック券
  STONE_GET_COMMON: 5, STONE_GET_RARE: 20, STONE_GET_SR: 50, STONE_GET_UR: 150, STONE_GET_LEGEND: 400,
  STONE_COST_COMMON: 40, STONE_COST_RARE: 100, STONE_COST_SR: 400, STONE_COST_UR: 1000, STONE_COST_LEGEND: 3000,
  STONE_TICKET: 150,   // CPU戦の連勝ボーナス（%）。2連勝目から1勝ごとに STEP% ずつ、最大 MAX%
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
  DECK_SLOT_COST: { label: "デッキ枠を1つ増やす魔石", min: 0, max: 100000, group: "eco" },
  DECK_SLOT_MAX:  { label: "ショップで増やせるデッキ枠の数", min: 0, max: 50, group: "eco" },
  STARTING_GOLD: { label: "始めたときに配るG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_EASY:   { label: "CPU初級に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_NORMAL: { label: "CPU中級に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_HARD:   { label: "CPU上級に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_EX:     { label: "CPU超級に勝ったときのG（第2弾をすべて開放すると出る）", min: 0, max: 100000, group: "eco", step: 10 },
  REWARD_ONLINE: { label: "対人戦に勝ったときのG", min: 0, max: 100000, group: "eco", step: 10 },
  STREAK_STEP:   { label: "CPU戦の連勝ボーナス：1連勝ごとに増える割合（%）", min: 0, max: 100, group: "eco" },
  STREAK_MAX:    { label: "CPU戦の連勝ボーナス：上限（%）", min: 0, max: 500, group: "eco", step: 10 },
  BOSS_RATE:     { label: "隠しボス：上級に勝ったとき次に出る確率（%）", min: 0, max: 100, group: "eco" },
  BOSS_PITY:     { label: "隠しボス：天井（上級でこの回数勝つと必ず出る）", min: 1, max: 999, group: "eco" },
  BOSS_HP:       { label: "隠しボス：ボスの体力", min: 1, max: 99, group: "eco" },
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
  STONE_TICKET:      { label: "パック券1枚に必要な魔石", min: 0, max: 100000, group: "eco", step: 10 }
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
  if (rs.includes("own") && !sac) roles.push("own");
  if (rs.includes("any")) roles.push("any");
  return roles;
}

/* 後攻の人だけが最初に持つ、使い切りのカード（パックやデッキには入らない） */
const COIN_CARD = {
  id: "coin", name: "境界の欠片", world: "fan", type: "spell", cost: 0, glyph: "欠", limit: 0, rarity: "common", art: "art/coin-e8ebaefc8f.webp",
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
    if (e.kind === "unit") {
      const role = UTOS[e.to] && UTOS[e.to].role;
      let T = toPhrase(e, isChar, auto);
      if (!auto && role && seen[role]) T = role === "enemyF" ? "その相手" : "そのキャラ";
      if (role) seen[role] = true;
      t = unitText(e, T);
    } else t = EFFECTS[e.kind].text(e.n, e);
    if (e.per === "gear") t = `使った歯車1枚につき、${t}`;
    if (e.per === "played") t = `このターン、このカードより先に使ったカード1枚につき、${t}`;
    if (e.cond && CONDS[e.cond]) t = `${condText(e, isChar)}、${t}`;
    if (k > 1) t = e.kind === "unit" && e.act === "dmg" && e.to === "enemyRand" ? `ランダムな相手キャラに${e.n}ダメージを${k}回与える（1回ごとに選び直す。倒れたキャラは選ばれない）。` : `${t.replace(/。$/, "")}（${k}回${e.kind === "unit" && e.act !== "dmg" && e.to === "enemyRand" ? "。同じキャラは2回選ばれない" : ""}）。`;
    out.push(t);
    i += k - 1;
  }
  return out.join("");
}
/* 「自分がカードを使ったとき」の見出し（世界・種類で絞っていればそれも書く） */
function cardPlayHead(e) { return `自分が${worldNo(e && { world: e.pw })}${e && e.pt === "char" ? "キャラ" : e && e.pt === "spell" ? "魔法" : "カード"}を使ったとき`; }
function cardTextLines(card) {
  const lines = [];
  if (card.type === "char") {
    (card.keywords || []).forEach(k => KEYWORDS[k] && lines.push(`${KEYWORDS[k].label}：${KEYWORDS[k].text}`));
    if (card.armor) lines.push(ARMOR_TEXT(card.armor));
  }
  if (card.pay && PAYS[card.pay.kind]) lines.push(PAYS[card.pay.kind].text(card.pay.n));
  const useWhat = k => `${k.world ? WORLDS[k.world] + "の" : ""}${k.ctype === "spell" ? "魔法" : k.ctype === "char" ? "キャラ" : "カード"}`;
  if (card.req) lines.unshift(reqText(card.req) + "。");
  if (card.shrink) lines.push(`化かし：手札にある間、自分が${useWhat(card.shrink)}を使うたびに、このカードのコストが1下がる。`);
  if (card.grow) { const g = card.grow, w = [];
    if (g.stat && card.type === "char") w.push("攻撃力と体力");
    if (g.dmg) w.push("効果で与えるダメージ");
    if (g.num) w.push("効果の数（引く枚数・回復量など）");
    lines.push(`妖気：このターン、自分が${useWhat(g)}を使うたびに、手札のこのカードの${w.join("・")}が1上がる（ターンの終わりに元に戻る）。`); }
  if (card.gear) lines.push(card.gear === "all" ? "歯車すべて：出すときに、手札の歯車をすべて使う。" : `歯車${card.gear}：出すときに、手札の歯車を${card.gear}枚使ってもよい。`);
  if (card.type === "char") {
    // タイミングごとに1行（登場時 → ほかのタイミングの順）
    Object.keys(WHENS).forEach(w => {
      const all = (card.effects || []).filter(e => whenOf(e) === w);
      if (w === "cardPlay") {
        const keys = [...new Set(all.map(e => `${e.pw || ""}|${e.pt || ""}`))];
        keys.forEach(key => { const g = all.filter(e => `${e.pw || ""}|${e.pt || ""}` === key); const t = effectsText(card, g, true); if (t) lines.push(`${cardPlayHead(g[0])}：${t}`); });
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
function cardTextHTML(card) {
  let h = esc(cardText(card));
  const ids = new Set();
  (card.effects || []).forEach(e => { const t = e && e.card && cardRef(e.card); if (t && t.token && t.id !== card.id) ids.add(t.id); });
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
  const t = e.target.closest && e.target.closest(".tklink, .cdlink");
  if (t) { e.stopPropagation(); e.preventDefault(); TokenPop.show(t.dataset.tk); return; }
  const pop = e.target.closest && e.target.closest("#tkpop");
  if (pop) { e.stopPropagation(); e.preventDefault(); if (e.target === pop || e.target.closest("[data-tkclose]")) TokenPop.close(); }
}, true);

/* カードの見た目。unit を渡すと場のキャラの現在値を表示する */
/* プレイヤーアイコン：キャラカードの絵を丸く切り抜く。顔が上の方にない絵だけ、切り抜く位置を個別に決める */
const ICON_POS = { "x-rush": "50% 40%", garm: "50% 55%" };
function iconImgHTML(id) {
  const c = typeof DEF !== "undefined" && DEF[id];
  if (!c || !c.art) return `<span class="glyph">召</span>`;
  // img＋拡大（transform）だと iPhone の Safari で絵の上がずれて帯が出たので、背景画像として敷く
  const pos = ICON_POS[id] || "50% 18%";
  return `<span class="iimg" style="background-image:url('${esc(c.art)}');background-position:${pos}"></span>`;
}

/* 名前の長さ（UR・レジェンドは枠が太く名前の帯が狭いので、1文字多いものとして小さくする） */
const nmLen = card => card.name.length + (["ur", "legend"].includes(card.rarity) ? 1 : 0);
function cardHTML(card, o = {}) {
  const u = o.unit;
  // o.hidden：まだ持っていないカード。イラストを隠して「？」を出す（名前・数値・効果は見せる）
  const art = o.hidden ? `<span class="glyph">？</span>`
    : card.art ? `<img src="${esc(card.art)}" alt="" draggable="false" ${typeof CARD_EAGER !== "undefined" && CARD_EAGER ? 'decoding="async"' : 'loading="lazy" decoding="async"'}>`
    : `<span class="glyph">${esc(card.glyph || "？")}</span>`;
  let stats;
  if (card.type === "char") {
    const g = card.grow && card.grow.stat ? o.grow || 0 : 0;   // 妖気で手札のうちに強くなった分
    const atk = u ? u.atk : card.atk + g, hp = u ? u.hp : card.hp + g;
    stats = `<span class="stats"><span class="atk ${(u && u.atk > card.atk) || g ? "up" : ""}">${atk}</span>`
      + `<span class="hp ${u && u.hp < u.maxHp ? "hurt" : (u && u.maxHp > card.hp) || g ? "up" : ""}">${hp}</span></span>`;
  } else {
    stats = `<span class="stats spelltag">魔法${o.grow ? `<b class="growb">妖気+${o.grow}</b>` : ""}</span>`;
  }
  const tag = o.static ? "div" : "button";
  // 場のキャラは、与えられた能力も見せる。沈黙したキャラは能力なし
  const kwl = (u && u.silenced ? [] : [...new Set([...(card.keywords || []), ...((u && u.kws) || [])])])
    .filter(k => !(u && ((k === "stealth" && u.revealed) || (k === "shield" && u.shieldUsed))));   // 解けた隠密・使った聖盾は消す
  const arm = u ? (u.silenced ? 0 : (card.armor || 0) + (u.armorPlus || 0)) : card.armor;
  const marks = card.type === "char"
    ? kwl.filter(k => KEYWORDS[k]).map(k => `<i class="mk mk-${k}">${KEYWORDS[k].short}</i>`).join("")
      + (arm ? `<i class="mk mk-armor">甲${arm}</i>` : "")
      + ((card.effects || []).some(e => whenOf(e) !== "play") && !(u && u.silenced) ? `<i class="mk mk-trig" title="登場時以外にも働く効果があります">効</i>` : "")
    : "";
  const cost = o.cost != null ? o.cost : card.cost;
  const guard = card.type === "char" && kwl.includes("guard");
  return `<${tag} ${o.static ? "" : 'type="button"'} class="card w-${esc(card.world)} rar-${esc(card.rarity || "common")} ${card.type} ${card.art && !o.hidden ? "has-art" : ""} ${o.hidden ? "unknown" : ""} ${card.id === "coin" ? "coin" : ""} ${guard ? "guard" : ""} ${u && u.frozen ? "frozen" : ""} ${u && kwl.includes("stealth") ? "stealthy" : ""} ${u && kwl.includes("shield") ? "shieldy" : ""} ${o.cls || ""}" ${o.attrs || ""} aria-label="${esc(card.name)}">
    <span class="art">${art}</span>
    <span class="frame" aria-hidden="true"></span><span class="crest" aria-hidden="true"></span><span class="gem" aria-hidden="true"></span>
    ${["ur", "legend"].includes(card.rarity) ? `<span class="shine" aria-hidden="true"></span>` : ""}
    ${o.showCost === false ? "" : `<span class="cost ${cost < card.cost ? "down" : ""}"><i>${cost}</i></span>`}
    ${marks ? `<span class="marks">${marks}</span>` : ""}
    ${o.count ? `<span class="gearcnt" aria-label="${o.count}枚">×${o.count}</span>` : ""}
    ${u && u.frozen ? `<span class="frz">凍結</span>` : ""}${u && u.silenced ? `<span class="frz sil">沈黙</span>` : ""}${u && u.winIn != null && !u.silenced ? `<span class="wintag" title="勝利まであと${u.winIn}回">勝利まで${u.winIn}</span>` : ""}${u && u.wakeIn != null && !u.silenced ? `<span class="wintag wake" title="目覚めまであと${u.wakeIn}回">目覚めまで${u.wakeIn}</span>` : ""}
    <span class="foot"><span class="nm ${nmLen(card) >= 11 ? "xlong x3" : nmLen(card) >= 10 ? "xlong x2" : nmLen(card) >= 9 ? "xlong" : nmLen(card) >= 7 ? "long" : ""}">${esc(card.name)}</span>${stats}</span></${tag}>`;
}

/* 超級 CPU：第2弾（2-1・2-2・2-3）をすべて開放した人だけが戦える */
const EX_SETS = ["2-1", "2-2", "2-3"];
const exOpen = () => /[?&]gatetest\b/.test(location.search) || EX_SETS.every(s => setOpen(s));   // ?gatetest（オーナーの試し用）でも出る
/* ふだんの CPU戦・練習・CPU用一覧に出さないデッキ（検証用・開放戦用・まだ開いていない超級） */
const hiddenDeck = d => ["test", "gate", "gift"].includes(d.level) || (d.level === "ex" && !exOpen());   // gift＝初心者クエストで選んでもらえるデッキ
/* ---------- クエスト ----------
   type＝何をするか。lv はCPUの強さ（winLv のとき）。数はクエストごとに決める */
const CPU_LV_NAMES = { easy: "初級", normal: "中級", hard: "上級", ex: "超級" };
const QUEST_TYPES = {
  winLv:  { label: "CPUに勝つ（強さを選ぶ）", text: (n, q) => `CPU（${CPU_LV_NAMES[q.lv] || "中級"}）に${n}回勝つ` },
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
  return defs.filter(c => c && !c.token && !c.boss && c.limit > 0 && pk.rarity.includes(c.rarity) && (!pk.sets.length || pk.sets.includes(c.set || "1")));
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
  if (e.per === "gear" || e.per === "played") out.per = e.per;   // 使った歯車／先に使ったカード 1枚ごとに n 倍
  if (e.turn && e.act === "atk") out.turn = true;   // 攻撃力アップ（このターンだけ）
  if (CONDS[e.cond]) {
    out.cond = e.cond;
    if (!CONDS[e.cond].noN) out.cn = Math.max(0, Math.min(30, Math.round(+e.cn || 0)));
    if (CONDS[e.cond].world && WORLDS[e.cworld]) out.cworld = e.cworld;
  }
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
    token: !!c.token,   // トークン：効果で出すだけのカード（デッキに入らない・パックから出ない）
    limit: c.token ? 0 : Math.max(0, c.limit != null ? +c.limit || 0 : c.copies != null ? Math.min(3, +c.copies || 0) : 3),
    rarity: RARITY[c.rarity] ? c.rarity : (+c.cost >= 7 ? "legend" : +c.cost >= 5 ? "rare" : "common"),
    keywords: Array.isArray(c.keywords) ? c.keywords.filter(k => KEYWORDS[k]) : [],
    armor: c.type === "spell" ? 0 : Math.max(0, Math.min(9, +c.armor || 0)),
    pay: c.pay && PAYS[c.pay.kind] ? { kind: c.pay.kind, n: Math.max(1, +c.pay.n || 1) } : null,
    ...(normSet(c.set) ? { set: normSet(c.set) } : {}),   // 弾（なし＝第1弾）
    // 手札で小さくなる：手札にある間、自分が（世界・種類の）カードを使うたびにコストが n 下がる
    // 妖気：このターン、（世界・種類の）カードを使うたびに、手札のこのカードが1ずつ強くなる。stat＝攻撃力と体力、dmg＝効果のダメージ、num＝そのほかの効果の数
    ...(c.req && +c.req.n > 0 ? { req: { n: Math.min(5, Math.round(+c.req.n)), ...(WORLDS[c.req.world] ? { world: c.req.world } : {}), ...(c.req.orEmpty ? { orEmpty: true } : {}) } } : {}),
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
  // シリアルコード。コードそのものは入れず、ハッシュ（h）だけを公開データに置く
  const serials = (Array.isArray(d.serials) ? d.serials : []).filter(x => x && /^[0-9a-f]{64}$/.test(x.h)).map(x => ({
    h: x.h, label: String(x.label || "シリアルコード").slice(0, 30),
    gold: Math.max(0, Math.floor(+x.gold || 0)), cards: cleanDeckCards(x.cards),
    until: /^\d{4}-\d{2}-\d{2}$/.test(x.until || "") ? x.until : "", created: x.created || "",
    // boss：受け取ると次の上級戦で隠しボスが出る（テスト用）。repeat：同じアカウントで何度でも使える
    ...(x.boss ? { boss: true } : {}), ...(x.repeat ? { repeat: true } : {})
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
    gold: Math.max(0, Math.floor(+x.gold || 0)), stones: Math.max(0, Math.floor(+x.stones || 0)), tickets: Math.max(0, Math.floor(+x.tickets || 0)), cards: cleanDeckCards(x.cards), picks: cleanPicks(x.picks) }));
  // ログインボーナス（7日で1周。休んでも進んだ分は消えない）
  const login = (Array.isArray(d.login) && d.login.length ? d.login : DEFAULT_LOGIN).slice(0, 14).map(x => ({ gold: Math.max(0, Math.floor(+(x && x.gold) || 0)), stones: Math.max(0, Math.floor(+(x && x.stones) || 0)), tickets: Math.max(0, Math.floor(+(x && x.tickets) || 0)) }));
  // 期間限定クエスト（工房で作る）。1つのクエストは1つの目標と報酬
  const quests = (Array.isArray(d.quests) ? d.quests : []).filter(x => x && x.id && QUEST_TYPES[x.type]).map(x => ({ id: String(x.id), title: String(x.title || "").slice(0, 30),
    type: x.type, ...(CPU_LV_NAMES[x.lv] ? { lv: x.lv } : {}), n: Math.max(1, Math.min(999, Math.floor(+x.n || 1))), from: date(x.from), until: date(x.until),
    gold: Math.max(0, Math.floor(+x.gold || 0)), stones: Math.max(0, Math.floor(+x.stones || 0)), tickets: Math.max(0, Math.floor(+x.tickets || 0)) }));
  return { version: +d.version || 1, updated: d.updated || "", config, cards, decks, packs, serials, news, mail, login, picks, quests };
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
function deckCount(deck) { return Object.values(deck.cards || {}).reduce((s, n) => s + n, 0); }
function deckProblems(deck, cardsById, config, owned) {
  const probs = [];
  if (deck.free) {
    if (!config.SAMPLE_DECKS) probs.push("サンプルデッキは今は使えません（ベータ期間が終わりました）");
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
  if (kind === "stone") return `<svg class="${c}" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6dcff"/><stop offset=".5" stop-color="#9b7cf0"/><stop offset="1" stop-color="#4a2f9a"/></linearGradient></defs><path d="M20 4 33 15 20 36 7 15z" fill="url(#${g})" stroke="#2a1a5a" stroke-width="1.5"/><path d="M7 15h26M20 4l-5 11 5 21 5-21z" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/></svg>`;
  return `<svg class="${c}" viewBox="0 0 40 40" aria-hidden="true"><defs><radialGradient id="${g}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff6d6"/><stop offset=".55" stop-color="#e2b54e"/><stop offset="1" stop-color="#8a6418"/></radialGradient></defs><circle cx="20" cy="20" r="15" fill="url(#${g})" stroke="#5a3d0c" stroke-width="1.5"/><circle cx="20" cy="20" r="11" fill="none" stroke="rgba(90,61,12,.5)" stroke-width="1"/><text x="20" y="25.5" text-anchor="middle" font-size="15" font-weight="800" fill="#5a3d0c" font-family="serif">G</text></svg>`;
}
/* 所持数の札（絵＋数）。読み上げ用に「1200G」「魔石 30」の名前を付ける */
function goldTag(n) { return `<span class="goldtag" aria-label="所持 ${n}G">${curIcon("gold")}<span>${n.toLocaleString()}</span></span>`; }
function stoneTag(n) { return `<span class="stonetag" aria-label="魔石 ${n}個">${curIcon("stone")}<span>${n.toLocaleString()}</span></span>`; }
function ticketTag(n) { return `<span class="tickettag" aria-label="パック券 ${n}枚">${curIcon("ticket")}<span>${n.toLocaleString()}</span></span>`; }
