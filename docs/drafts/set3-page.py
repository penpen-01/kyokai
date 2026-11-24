import json, html
D=json.load(open('/tmp/claude-0/-home-claude/588c81f0-9786-5c71-81af-976b59eb0ac3/scratchpad/s3/list4.json'))
RO=["C","R","SR","UR","L"]
PFX={"神話":"神","幻想":"幻","機械":"機"}
cards=[]
for w,L in D["worlds"].items():
  for i,x in enumerate(sorted(L,key=lambda x:(x[1],RO.index(x[0]),x[3])),1):
    r,cost,typ,nm,a,h,kw,cat,ab,note,art,tags=x
    cards.append(dict(no=f"{PFX[w]}{i:02d}",world=w,rar=r,cost=cost,type=typ,name=nm,atk=a,hp=h,kw=kw,tags=tags,cat={"昼":"昼の海","夜":"夜の海","亡霊":"亡霊船","通常":"通常"}.get(cat,cat),ab=ab,note=note,art=art))
toks=[dict(no=f"T{i}",kind=t[0],world=t[1],name=t[2],type=t[3],atk=t[4],hp=t[5],tags=t[6],ab=t[7],art=t[8]) for i,t in enumerate(D["tokens"],1)]
json.dump({"cards":cards,"tokens":toks},open('/home/claude/kyokai/docs/set3-list.json','w'),ensure_ascii=False,indent=1)
data=json.dumps({"cards":cards,"tokens":toks},ensure_ascii=False)
page = r'''<title>碧海と深淵の唄 カードリスト</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@600;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
<style>
/* 深い海の紺に、真鍮の金。カードは「番号・コスト・名前」を左に揃え、指定しやすい縦の一覧にする */
:root{
  --bg:#0b1220; --panel:#121b2e; --line:#24324d; --fg:#e8ecf3; --muted:#9aa8c2;
  --gold:#d9b45e; --gold-soft:#3a3020; --sea:#5fb3c9; --ghost:#8fa3ff; --warn:#e7a14a;
  --c:#9aa3b2; --r:#6fb1e8; --sr:#c58bf0; --ur:#f0b54a; --l:#ff8f6b;
  --f-display:"Shippori Mincho B1","Hiragino Mincho ProN","Yu Mincho",serif;
  --f-body:"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif;
  color-scheme:dark;
}
@media (prefers-color-scheme: light){ :root:not([data-theme="dark"]){
  --bg:#f3f1ea; --panel:#ffffff; --line:#d9d3c3; --fg:#1b2333; --muted:#5c6577;
  --gold:#8a6a1f; --gold-soft:#f1e6c8; --sea:#1f7f99; --ghost:#4b5bd6; --warn:#a85d06;
  --c:#6b7280; --r:#2b78c2; --sr:#8b45c9; --ur:#b7791f; --l:#c2410c; color-scheme:light } }
:root[data-theme="light"]{
  --bg:#f3f1ea; --panel:#ffffff; --line:#d9d3c3; --fg:#1b2333; --muted:#5c6577;
  --gold:#8a6a1f; --gold-soft:#f1e6c8; --sea:#1f7f99; --ghost:#4b5bd6; --warn:#a85d06;
  --c:#6b7280; --r:#2b78c2; --sr:#8b45c9; --ur:#b7791f; --l:#c2410c; color-scheme:light }
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font-family:var(--f-body);font-size:15px;line-height:1.6;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:20px 60px}
.wrap{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
header h1{font-family:var(--f-display);font-weight:800;font-size:clamp(24px,6vw,34px);margin:0;letter-spacing:.04em;text-wrap:balance}
header p{margin:4px 0 0;color:var(--muted);font-size:13px}
.ver{display:inline-block;font-size:12px;padding:2px 10px;border:1px solid var(--gold);color:var(--gold);border-radius:999px;margin-right:6px}
nav.tabs{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);display:flex;gap:6px;overflow-x:auto;padding:8px 0;border-bottom:1px solid var(--line)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);background:var(--bg);z-index:10}
.tabs button,.chips button{font:inherit;font-size:14px;color:var(--fg);background:transparent;border:1px solid var(--line);border-radius:999px;padding:6px 14px;white-space:nowrap;cursor:pointer}
.tabs button[aria-pressed="true"]{background:var(--gold);border-color:var(--gold);color:var(--bg);font-weight:700}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chips button{font-size:12.5px;padding:4px 12px}
.chips button[aria-pressed="true"]{border-color:var(--sea);color:var(--sea);font-weight:700}
button:focus-visible{outline:2px solid var(--sea);outline-offset:2px}
.sum{color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
.list{display:flex;flex-direction:column;gap:8px}
.card{display:grid;grid-template-columns:52px 1fr;gap:4px 12px;padding:12px 14px;background:var(--panel);border:1px solid var(--line);border-radius:10px;border-left:4px solid var(--rc)}
.card[data-r="C"]{--rc:var(--c)}.card[data-r="R"]{--rc:var(--r)}.card[data-r="SR"]{--rc:var(--sr)}.card[data-r="UR"]{--rc:var(--ur)}.card[data-r="L"]{--rc:var(--l)}
.side{grid-row:span 3;display:flex;flex-direction:column;align-items:center;gap:6px}
.no{font-weight:700;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.cost{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-family:var(--f-display);font-weight:800;font-size:20px;color:var(--bg);background:var(--sea)}
.rar{font-size:11px;font-weight:700;color:var(--rc);letter-spacing:.06em}
.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;min-width:0}
.name{font-family:var(--f-display);font-weight:800;font-size:17px;letter-spacing:.02em}
.stat{font-variant-numeric:tabular-nums;font-weight:700;color:var(--gold)}
.meta{font-size:12px;color:var(--muted)}
.tag{font-size:11.5px;padding:1px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.tag.cat-亡霊船{border-color:var(--ghost);color:var(--ghost)}
.tag.tribe{border-color:var(--sea);color:var(--sea)}
.kw{font-size:12px;padding:1px 8px;border-radius:4px;background:var(--gold-soft);color:var(--gold);font-weight:700}
.kw.new{background:transparent;border:1px dashed var(--gold)}
.ab{min-width:0}
.ab .hold{color:var(--warn);font-weight:700}
.ab b.k{color:var(--gold)}
.more{font-size:12.5px;color:var(--muted);display:flex;flex-direction:column;gap:2px;min-width:0}
.more .note::before{content:"メモ：";color:var(--sea)}
.more .art::before{content:"絵：";color:var(--sea)}
section.doc{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
section.doc h2{font-family:var(--f-display);font-size:18px;margin:0 0 8px}
section.doc ul{margin:0;padding-left:1.2em;display:flex;flex-direction:column;gap:4px}
section.doc dt{font-weight:700;color:var(--gold);margin-top:8px}
section.doc dd{margin:2px 0 0 0}
@media (max-width:420px){.card{grid-template-columns:44px 1fr;padding:10px 12px}.cost{width:34px;height:34px;font-size:18px}}
@media (prefers-reduced-motion: reduce){*{scroll-behavior:auto}}
</style>
<div class="wrap">
  <header>
    <h1>碧海と深淵の唄</h1>
    <p><span class="ver">第6版</span>第3弾カードリスト（仮）。各世界33枚・コスト順。直してほしいカードは番号（例：神07）で指定してください。</p>
  </header>
  <nav class="tabs" id="tabs" aria-label="表示するもの"></nav>
  <div class="chips" id="chips" aria-label="枠で絞り込み"></div>
  <p class="sum" id="sum"></p>
  <div class="list" id="list"></div>
</div>
<script>
const DATA = __DATA__;
const NEWKW = new Set(["亡霊","不屈","不壊"]);
const TABS = [["神話","神話"],["幻想","幻想"],["機械","機械"],["tokens","トークン"],["rules","新しい能力"],["changes","この版で直したこと"]];
const CATS = ["すべて","亡霊船","クラゲ","海獣","昼の海","夜の海","通常"];
let tab = "神話", cat = "すべて";
try { const h = location.hash.slice(1); if (["shinwa","gensou","kikai","tokens","rules","changes"].includes(h)) tab = {shinwa:"神話",gensou:"幻想",kikai:"機械"}[h] || h; } catch(e){}
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const abHTML = s => esc(s).replace(/【(偽装・保留|保留)】/g,'<span class="hold">【$1】</span>').replace(/【([^】]+)】/g,(m,k)=>k.includes("保留")?m:`<b class="k">【${k}】</b>`);
const RULES = `
<section class="doc"><h2>新しい能力（仮の名前）</h2><dl>
<dt>【亡霊】</dt><dd>攻撃したあと破壊される。蘇生のカードは【亡霊】のキャラだけを戻せる（試作兵器ゼロのような死の宣告のキャラは戻らない）。守護を持つ亡霊は作らない。</dd>
<dt>【不屈】</dt><dd>攻撃・体力を下げる効果と、凍結（攻撃できなくする効果）を受けない。沈黙は受ける。</dd>
<dt>【不壊】</dt><dd>効果で破壊されない（ダメージでは倒れる）。</dd>
<dt>【結界】</dt><dd>自分（プレイヤー）に付く。次に受けるダメージを1回だけ0にする。灯台守の娘ミナトと、トークン「泡の妖精」だけ。</dd>
<dt>【凪】</dt><dd>場にいる間、相手のキャラは出たターンに攻撃できない。凪の巫女ナギサ（R）の1枚だけ。</dd>
<dt>【霧】</dt><dd>相手の次のターン、自分の場のキャラの攻撃・体力と自分の体力が「？」に見える。霧の亡霊の1枚だけ。</dd>
<dt>【揺らぎ】</dt><dd>手札にある間は3つの候補のどれか。出したときに決まる。海賊の宝箱・引き上げた積み荷の2枚。</dd>
<dt>【偽装】（保留）</dt><dd>手札のキャラに付き、場に出たとき相手には「1/1」に見える。案：偽装している間は守護と隠密が働かない。ホログラム迷彩・擬態機ミミックの2枚だけ。</dd>
<dt>種族：クラゲ（幻想と機械）</dt><dd>「クラゲ魔法」は、自分の場にクラゲがいるときだけ使えるトークンの呪文。ランダムで手に入るのは痺れ針・泡の揺りかご・青い閃光の3種類。必殺「満ち潮の夜」もクラゲ魔法の1つで、深海の灯姫ノクトが出たときに持ってくる。</dd>
<dt>種族：海獣（神話）</dt><dd>伝説の海の生き物（リヴァイアサン・クラーケン・カリブディス・スキュラ・セイレーン・ヒッポカムポス・アスピドケロン）。神話は1体ずつが強いので、つなぎは少しだけ（銛打ち・呼び笛・ヒッポカムポス・深淵の召喚歌・海神の怒り）。</dd>
<dt>2回攻撃</dt><dd>2回攻撃を新しく付ける効果は作らない。</dd>
</dl></section>`;
const CHANGES = `
<section class="doc"><h2>第5版から直したこと（オーナー 11-24 18:02）</h2><ul><li>神・海の女王カリュプソ → 真紅の女王スカーレット（名前を戻し、見た目は真紅が基調）</li><li>満ち潮の夜をクラゲ魔法の1つにした（場にクラゲがいるときだけ使える・オクタのコスト-2も効く）。「クラゲ魔法1枚を手札に」は、痺れ針・泡の揺りかご・青い閃光の3種類からランダム</li></ul><h2 style="margin-top:14px">第4版から直したこと（11-24 17:43）</h2><ul>
<li>機・緊急再起動：機械に限らず、【亡霊】のキャラを2体まで（合計コスト5以下）。幻想の魂替えの儀と別の形にした</li>
<li>機・廃艦提督ラスティ：機械に限らず、【亡霊】1体（コスト5以下）を出し、そのキャラは【亡霊】を失って装甲1を得る（壊れずに残る）。幽霊の花嫁ヴェールと別の形にした</li>
<li>機・深潜艦ノーチラスを強くした：全体3ダメージ＋【潜航】（自分のターンの終わりに亜空間へ潜り、次の自分のターンに戻る）</li>
<li>機械のレジェンドからでかい要塞（海上要塞バスティオン）を外し、中コストのメカ動物「蒼鋼の鯱オルカ」（4コスト）にした</li>
</ul>
<h2 style="margin-top:14px">第3版から直したこと（11-24 17:38）</h2><ul>
<li>オクタ：クラゲ魔法と満ち潮の夜だけコスト-2。スカーレット → 神話の海の女王カリュプソ（奪ってコスト-5）。幻想に髑髏旗の船長バルバ</li>
<li>ノクト：出たとき満ち潮の夜を手札に。ハヤテ：倒すたび攻撃+1。剣聖の型は削除。深淵の召喚歌（海獣の踏み倒し）</li>
<li>アズーリア：回復をダメージに変える。海神の怒り：全体5＋海獣でプレイヤーにも3。深海大放電：全体3＋クラゲで+1</li>
<li>おまけの1枚引くを外した。波乗りロボ → 救難ロボ。港湾クレーン：4コストで歯車3枚</li>
</ul></section>`;
function render(){
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = TABS.map(([k,l]) => `<button type="button" data-t="${k}" aria-pressed="${k===tab}">${l}</button>`).join("");
  const chips = document.getElementById("chips"), list = document.getElementById("list"), sum = document.getElementById("sum");
  const isWorld = ["神話","幻想","機械"].includes(tab);
  chips.hidden = !isWorld;
  if (isWorld) chips.innerHTML = CATS.map(c => `<button type="button" data-c="${c}" aria-pressed="${c===cat}">${c}</button>`).join("");
  if (tab === "rules") { list.innerHTML = RULES; sum.textContent = ""; return; }
  if (tab === "changes") { list.innerHTML = CHANGES; sum.textContent = ""; return; }
  if (tab === "tokens") {
    sum.textContent = `${DATA.tokens.length}種類（今回からのトークン・クラゲ魔法・必殺）`;
    list.innerHTML = DATA.tokens.map(t => `<article class="card" data-r="${t.kind.includes("必殺")?"L":t.kind==="クラゲ魔法"?"R":"C"}"><div class="side"><span class="no">${t.no}</span><span class="cost">–</span><span class="rar">${esc(t.kind)}</span></div>
      <div class="head"><span class="name">${esc(t.name)}</span>${t.atk!=null?`<span class="stat">${t.atk}/${t.hp}</span>`:""}<span class="meta">${esc(t.type)}</span><span class="tag">${esc(t.world)}</span>${(t.tags||[]).map(x=>`<span class="tag tribe">${esc(x)}</span>`).join("")}</div>
      <div class="ab">${abHTML(t.ab)}</div><div class="more"><span class="art">${esc(t.art)}</span></div></article>`).join("");
    return;
  }
  const hit = c => cat === "すべて" || c.cat === cat || (c.tags||[]).includes(cat) || (cat === "クラゲ" && /クラゲ/.test(c.ab)) || (cat === "海獣" && /海獣/.test(c.ab));
  const L = DATA.cards.filter(c => c.world === tab && hit(c));
  const all = DATA.cards.filter(c => c.world === tab);
  const cnt = k => all.filter(c => c.rar === k).length;
  sum.textContent = `${L.length}枚表示（${tab}：コモン${cnt("C")}・レア${cnt("R")}・SR${cnt("SR")}・UR${cnt("UR")}・レジェンド${cnt("L")}）`;
  list.innerHTML = L.map(c => `<article class="card" data-r="${c.rar}" id="${c.no}">
    <div class="side"><span class="no">${c.no}</span><span class="cost">${c.cost}</span><span class="rar">${c.rar}</span></div>
    <div class="head"><span class="name">${esc(c.name)}</span>${c.atk!=null?`<span class="stat">${c.atk}/${c.hp}</span>`:""}<span class="meta">${c.type}</span><span class="tag cat-${c.cat}">${c.cat}</span>${(c.tags||[]).map(t=>`<span class="tag tribe">${esc(t)}</span>`).join("")}${c.kw.map(k=>`<span class="kw ${NEWKW.has(k)?"new":""}">${esc(k)}</span>`).join("")}</div>
    <div class="ab">${abHTML(c.ab)}</div>
    <div class="more">${c.note?`<span class="note">${esc(c.note)}</span>`:""}<span class="art">${esc(c.art)}</span></div>
  </article>`).join("");
}
document.addEventListener("click", e => {
  const t = e.target.closest("[data-t]"); if (t) { tab = t.dataset.t; cat = "すべて"; try { history.replaceState(null,"","#"+({神話:"shinwa",幻想:"gensou",機械:"kikai"}[tab]||tab)); } catch(x){} render(); window.scrollTo(0,0); return; }
  const c = e.target.closest("[data-c]"); if (c) { cat = c.dataset.c; render(); }
});
render();
</script>
'''
open('/tmp/claude-0/-home-claude/588c81f0-9786-5c71-81af-976b59eb0ac3/scratchpad/set3page/set3-list.html','w').write(page.replace("__DATA__",data))
print(len(cards),len(toks))
