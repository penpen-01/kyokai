import json, html
D=json.load(open('/tmp/claude-0/-home-claude/588c81f0-9786-5c71-81af-976b59eb0ac3/scratchpad/s3/list2.json'))
RO=["C","R","SR","UR","L"]
PFX={"神話":"神","幻想":"幻","機械":"機"}
cards=[]
for w,L in D["worlds"].items():
  for i,x in enumerate(sorted(L,key=lambda x:(x[1],RO.index(x[0]),x[3])),1):
    r,cost,typ,nm,a,h,kw,cat,ab,note,art=x
    cards.append(dict(no=f"{PFX[w]}{i:02d}",world=w,rar=r,cost=cost,type=typ,name=nm,atk=a,hp=h,kw=kw,cat={"昼":"昼の海","夜":"夜の海","亡霊":"亡霊船","通常":"通常"}.get(cat,cat),ab=ab,note=note,art=art))
toks=[dict(no=f"T{i}",world=t[1],name=t[2],atk=t[3],hp=t[4],kw=t[5],ab=t[6],art=t[7]) for i,t in enumerate(D["tokens"],1)]
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
    <p><span class="ver">第2版</span>第3弾カードリスト（仮）。各世界33枚・コスト順。直してほしいカードは番号（例：神07）で指定してください。</p>
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
const CATS = ["すべて","昼の海","夜の海","亡霊船","通常"];
let tab = "神話", cat = "すべて";
try { const h = location.hash.slice(1); if (["shinwa","gensou","kikai","tokens","rules","changes"].includes(h)) tab = {shinwa:"神話",gensou:"幻想",kikai:"機械"}[h] || h; } catch(e){}
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const abHTML = s => esc(s).replace(/【(偽装・保留|保留)】/g,'<span class="hold">【$1】</span>').replace(/【([^】]+)】/g,(m,k)=>k.includes("保留")?m:`<b class="k">【${k}】</b>`);
const RULES = `
<section class="doc"><h2>新しい能力（仮の名前）</h2><dl>
<dt>【亡霊】</dt><dd>攻撃したあと破壊される。蘇生のカードは【亡霊】のキャラだけを戻せる（死の宣告の代わり。試作兵器ゼロが蘇生で強くなりすぎないように）。守護を持つ亡霊は作らない（攻撃しないと残り続けるため）。</dd>
<dt>【不屈】</dt><dd>攻撃・体力を下げる効果、凍結、沈黙、「攻撃できない」を受けない（EMPパルスなどで固めて効果ダメージで勝つ戦い方への対策）。</dd>
<dt>【不壊】</dt><dd>効果で破壊されない（ダメージでは倒れる）。</dd>
<dt>【結界】</dt><dd>自分（プレイヤー）に付く。次に受けるダメージを1回だけ0にする。</dd>
<dt>【凪】</dt><dd>場にいる間、相手のキャラは出たターンに攻撃できない（速攻・突進対策。倒されやすい体にする）。</dd>
<dt>【霧】</dt><dd>相手の次のターン、自分の場のキャラの攻撃・体力と自分の体力が「？」に見える。</dd>
<dt>【揺らぎ】</dt><dd>手札にある間は3つの候補のどれか。出したときに決まる。</dd>
<dt>【偽装】（保留）</dt><dd>手札のキャラに付き、場に出たとき相手には「1/1」に見える。守護などとのからみが未定。案：偽装中は守護・隠密が働かない。</dd>
</dl></section>`;
const CHANGES = `
<section class="doc"><h2>第1版から直したこと（オーナー 11-24 15:31）</h2><ul>
<li>死の宣告の代わりに新しい能力【亡霊】（攻撃したあと破壊される）。蘇生は【亡霊】のキャラだけ。試作兵器ゼロはそのまま</li>
<li>亡霊の数値は相場どおりか、相場より低め。そのぶん「墓地から出たとき強くなる」効果を付けた（骨の甲板員の形）</li>
<li>オーナーの案：出たとき山札から墓地へ送る低コスト（神02・幻04・機04）、自分のキャラを好きな数破壊して同じ数だけ相手をランダムに破壊（幻・道連れの宴）、1コストの亡霊（神01・幻01・機01）</li>
<li>亡霊船を一番大きいテーマに（各世界10〜11枚）</li>
<li>クラゲの魔女の呪文テーマ（幻想）：L 夜光クラゲの魔女 ノクト・SR 泡うみの見習い魔女 プカ・UR オクタ・新しいトークン「ちびクラゲ」・必殺の「千のクラゲの大潮」</li>
<li>テーマの強化：剣聖（神・波を斬る剣士 ハヤテ、秘剣・渦潮斬り）、歯車（機・錆びたネジ虫、スクラップ漁り、ガラクタ丸、港の自動クレーン、合体潜水機 ギアシャーク）</li>
<li>耐性：【不屈】【不壊】を少しだけ（アルバ・アズーリア・サンゴ礁の巨人・翡翠の若竜・ブルーバスティオン）</li>
<li>除去のダメージを既存に合わせた（大渦・魚雷 3コスト5ダメージ、分解光線 コスト4以下を破壊）</li>
<li>ソーラーセイル展開・落書きの設計図（次の機械のコスト-1）を外した</li>
<li>バニラの1コストをやめ、1コストを各世界1〜2枚に。既存と数値もキーワードも同じキャラはなし（照らし合わせ済み）</li>
<li>新しいトークン：ちびクラゲ・泡の妖精・プルルの分身</li>
<li>かわいい女の子・かっこいい男・かわいいキャラを各世界に入れた（絵の欄に書いてある）</li>
<li>保留のまま：偽装（機の4枚）・亜空間ブレイク</li>
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
    sum.textContent = `${DATA.tokens.length}種類（今回からのトークン）`;
    list.innerHTML = DATA.tokens.map(t => `<article class="card" data-r="C"><div class="side"><span class="no">${t.no}</span><span class="cost">–</span><span class="rar">トークン</span></div>
      <div class="head"><span class="name">${esc(t.name)}</span><span class="stat">${t.atk}/${t.hp}</span><span class="tag">${esc(t.world)}</span></div>
      <div class="ab">${abHTML(t.ab)}</div><div class="more"><span class="art">${esc(t.art)}</span></div></article>`).join("");
    return;
  }
  const L = DATA.cards.filter(c => c.world === tab && (cat === "すべて" || c.cat === cat));
  const all = DATA.cards.filter(c => c.world === tab);
  const cnt = k => all.filter(c => c.rar === k).length;
  sum.textContent = `${L.length}枚表示（${tab}：コモン${cnt("C")}・レア${cnt("R")}・SR${cnt("SR")}・UR${cnt("UR")}・レジェンド${cnt("L")}）`;
  list.innerHTML = L.map(c => `<article class="card" data-r="${c.rar}" id="${c.no}">
    <div class="side"><span class="no">${c.no}</span><span class="cost">${c.cost}</span><span class="rar">${c.rar}</span></div>
    <div class="head"><span class="name">${esc(c.name)}</span>${c.atk!=null?`<span class="stat">${c.atk}/${c.hp}</span>`:""}<span class="meta">${c.type}</span><span class="tag cat-${c.cat}">${c.cat}</span>${c.kw.map(k=>`<span class="kw ${NEWKW.has(k)?"new":""}">${esc(k)}</span>`).join("")}</div>
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
