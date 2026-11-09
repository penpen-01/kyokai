# Gemini に貼るイラスト依頼文のページを作る（2026-11-10 にうまくいったやり方）。
# 使い方: python3 tools/art/requests.py カード指定.py 出力.html
#   カード指定.py には C（カードごとの指定）・EN（レア度ごとの演出）・GROUPS（会話ごとの並び）を書く。見本は tools/art/example_cards.py
#   同じカードを2回描くときは ID に "#2" を付ける（例 'f2-moonwitch#2'）
#   並び.json も一緒に書き出すので、できた絵は put.py --order で入れられる
# やり方の要点は tools/art/README.md
import json, re, html, sys, os, importlib.util
spec = importlib.util.spec_from_file_location("cards", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
C, EN, GROUPS = m.C, m.EN, m.GROUPS
OUT = sys.argv[2]
TITLE = getattr(m, "TITLE", "イラスト依頼文")
WORLD = getattr(m, "WORLD", "おとぎ話と東洋の妖怪がまざった不思議な世界。色は深い緑・紫・銀・青白い狐火")
RULES='''【共通ルール】（この会話のあいだ、ずっと守ってください）
・縦長、縦横比 5:7
・添付画像は「画風（線・塗り・色調）」の見本としてだけ使う。添付画像の人物・構図・背景はまねしない
・この会話で前に描いた絵の背景・構図・人物・手前の草や木の根も使わない。毎回ゼロから描く
・キャラクターのカード：そのキャラクターを画面の中央に大きく、主役とひと目でわかるように描く。顔は画面の上半分。ほかの人物や相手は小さく脇に
・魔法のカード：その魔法が起きている瞬間の場面を描く
・画面の下2割と、左上・右上の角には、名前や数字を重ねるので大事なものを置かない（ただの地面や影でよい。毎回同じ草や根を描かない）
・文字・ロゴ・サイン・数字・枠は一切入れない（この依頼文の文字も絵に入れない）
・実在の作品やキャラクターに似せない
・世界の雰囲気：'''+WORLD+'''。場所と時間帯は各カードの指定に従う（同じ場所・時間帯ばかりにしない）'''
RN={'common':'コモン','rare':'レア','sr':'スーパーレア','ur':'ウルトラレア','legend':'レジェンド'}
def card(i):
    n,t,r,place,desc=C[i]
    return f"【カード】{n}（{t}・{RN[r]}）\n場所：{place}\n内容：{desc}\n{EN[r]}"
FIRST="カードゲーム用のイラストを1枚描いてください。添付した画像は画風の見本です。\n\n"+RULES+"\n\n"
NEXT="最初に添付した画像の画風で、次のカードのイラストを1枚描いてください。最初に送った共通ルールを守ってください。この会話で前に描いた絵の背景・構図・人物は使わないでください。\n\n"
B = {}; body = ""; n = 0; order = {}
for gname, ids in GROUPS:
    order[gname] = [x.split("#")[0] for x in ids]; items = ""
    for j, i in enumerate(ids):
        n += 1; k = f"c{n}"; B[k] = (FIRST if j == 0 else NEXT) + card(i)
        nm, t = C[i][0], C[i][1]
        how = "1枚目：画風の見本（art-style-ref.png）を添付して貼る" if j == 0 else "貼るだけ（画像の添付はいらない）"
        items += f'<li><span class="n">{n}</span><span class="nm">{html.escape(nm)}</span><span class="tag">{"キャラ" if t=="キャラクター" else "魔法"}・{how}</span><button type="button" class="cp sm" data-b="{k}">コピー</button><p class="d">{html.escape(C[i][4])}</p></li>'
    body += f'<section class="grp"><h2>{gname}（{len(ids)}枚）新しい会話で</h2><ol>{items}</ol></section>'
STYLE = '<style>\n:root{--bg:#0d1020;--panel:#151a30;--line:#2b3358;--fg:#ece6d6;--muted:#a29d8f;--gold:#e3c27a;color-scheme:dark}\n:root[data-theme="light"]{--bg:#f6f3ea;--panel:#fff;--line:#ddd5c2;--fg:#221d12;--muted:#6b6455;--gold:#8a6420;color-scheme:light}\n@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#f6f3ea;--panel:#fff;--line:#ddd5c2;--fg:#221d12;--muted:#6b6455;--gold:#8a6420;color-scheme:light}}\n*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:"Noto Sans JP","Hiragino Sans",sans-serif;line-height:1.7}\n.w{max-width:720px;margin:0 auto;padding:24px 16px 60px;display:flex;flex-direction:column;gap:16px}\nh1{margin:0;font-size:22px;color:var(--gold)}p{margin:0}.muted{color:var(--muted);font-size:13px}\n.cp{font:inherit;font-weight:700;cursor:pointer;border-radius:10px;border:1px solid var(--gold);background:var(--gold);color:#1a1408;padding:12px 16px;width:100%}\n.cp.sm{width:auto;padding:6px 12px;background:transparent;color:var(--gold);font-size:13px}.cp.done{background:#3a8a5a;border-color:#3a8a5a;color:#fff}\nol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}\nli{display:grid;grid-template-columns:auto 1fr auto;gap:4px 10px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px}\n.n{color:var(--muted)}.nm{font-weight:700}.tag{grid-column:2;font-size:12px;color:var(--muted)}.cp.sm{grid-row:1/3;grid-column:3}\n.d{grid-column:1/-1;font-size:13px;color:var(--muted)}\nh2{margin:14px 0 0;font-size:17px}.grp{display:flex;flex-direction:column;gap:8px}.refnote{border-left:3px solid #e8c36a;padding:8px 10px;background:rgba(232,195,106,.08);border-radius:6px;font-size:13.5px;line-height:1.7}\nh2{margin:14px 0 0;font-size:17px}.grp{display:flex;flex-direction:column;gap:8px}.why{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px;font-size:14px}.why li{display:list-item;background:none;border:0;padding:0;margin-left:1.2em}.why ul{margin:6px 0 0;padding:0}.step{font-size:13px;color:var(--muted)}\n</style>'
JS = '<script>const B=__B__;\nfunction fb(t){const a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();let ok=false;try{ok=document.execCommand("copy")}catch(e){}a.remove();return ok;}\ndocument.addEventListener("click",async e=>{const b=e.target.closest(".cp");if(!b)return;const t=B[b.dataset.b];let ok=false;try{await navigator.clipboard.writeText(t);ok=true}catch(err){ok=fb(t)}\nconst o=b.dataset.o||b.textContent;b.dataset.o=o;b.textContent=ok?"コピーしました":"コピーできませんでした";b.classList.toggle("done",ok);setTimeout(()=>{b.textContent=o;b.classList.remove("done")},1800);});</script></body></html>'
out = f'''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(TITLE)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap">
{STYLE}</head><body><div class="w"><h1>{html.escape(TITLE)}（{n}枚）</h1>
<p class="muted">会話ごとに新しい Gemini の会話で描く。各会話の1枚目だけ画風の見本（art-style-ref.png）を添付して貼り、2枚目からは「コピー」して貼るだけ。文字だけ返ってきたら「画像を生成して」とだけ返す。</p>
{body}</div>
{JS.replace("__B__", json.dumps(B, ensure_ascii=False))}'''
open(OUT, "w").write(out)
json.dump(order, open(os.path.splitext(OUT)[0] + "-order.json", "w"), ensure_ascii=False)
print(n, "枚 →", OUT)
