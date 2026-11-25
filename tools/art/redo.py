#!/usr/bin/env python3
"""描き直し用の依頼文ページを作る（1枚＝1会話。今の絵や参考の絵も添付する）。
   python3 tools/art/redo.py tools/art/set3_redo.py docs/art3-redo.html
   出力：ページと、put.py --order 用の -order.json（会話の名前＝カード名）
   共通ルールは requests.py と同じ。ちがうのは「添付」の行だけ（2枚目以降は直す元の絵・参考の絵）"""
import sys, os, json, html, importlib.util
spec = importlib.util.spec_from_file_location("s", sys.argv[1]); S = importlib.util.module_from_spec(spec); spec.loader.exec_module(S)
OUT = sys.argv[2]
EN = {'common': '演出（コモン）：落ち着いた構図。光や効果は控えめ',
      'rare': '演出（レア）：動きのあるポーズ。背景もしっかり描き込む。光の効果を少し',
      'sr': '演出（スーパーレア）：大胆な構図とあおりの角度。光・炎・魔力のエフェクトをはっきり',
      'ur': '演出（ウルトラレア）：強いエフェクトと逆光、細部まで描き込んだ豪華な装飾。ただし主役は中央に大きく',
      'legend': '演出（レジェンド）：最高の迫力。神々しい光、ギラギラ輝くエフェクト、圧倒的な存在感。ただし主役は中央に大きく'}
RN = {'common': 'コモン', 'rare': 'レア', 'sr': 'スーパーレア', 'ur': 'ウルトラレア', 'legend': 'レジェンド'}
def rules(world): return '''【共通ルール】
・縦長、縦横比 5:7（3:4 ではなく 5:7）
・画面の下から約3割は、名前と数字を重ねるので、足元・地面・背景だけにする（顔・大事な物を置かない）
・左上と右上の角には、数字やマークを重ねるので、大事なものを置かない
・キャラクターのカード：そのキャラクターを画面の中央に大きく、主役とひと目でわかるように描く。大きな怪物・機械は全身でもよいが、顔（頭部）は画面の上半分に
・魔法のカードは人物の立ち絵ではなく、その魔法が発動している瞬間の場面を描く
・デジタルイラスト、輪郭線あり、セル塗りと厚塗りの中間。やや暗めの画面にドラマチックな光
・添付した画像は「添付」に書いた使い方だけに使う。「画風の見本」は線・塗り・色調だけを使い、人物や構図はまねしない。「今の絵」は説明の「残すもの」だけ残し、ほかは新しく描く。「参考」は説明に書いたところだけ参考にする
・文字、ロゴ、サイン、数字、枠、カードのデザインは一切入れない（イラストだけ）
・実在の作品やキャラクター、実在の宗教の神や人物に似せない
・世界の雰囲気：''' + world
B = {}; body = ""; order = {}; FILES = {}
REFS = {"参考：ゴッドギア": "godgear", "参考：痺れ針": "needle"}
for n, (i, name, typ, r, w, att, place, desc) in enumerate(S.REDO, 1):
    k = f"r{n}"; order[name] = [i]
    FN = lambda a: "style-ref.png" if a == "見本" else f"{i}-now.png" if a == "今の絵" else "ref-" + REFS[a] + ".png"
    LB = lambda a: "画風の見本" if a == "見本" else "今の絵" if a == "今の絵" else a
    att_txt = "、".join(f"{j+1}枚目：{LB(a)}" for j, a in enumerate(att))
    files = " ＋ ".join(FN(a) for a in att); FILES.update({FN(a): (i, a) for a in att})
    B[k] = ("カードゲーム用のイラストを1枚描いてください（今あるカードの描き直しです）。\n添付：" + att_txt + "\n\n" + rules(S.W[w]) +
            f"\n\n【カード】{name}（{typ}・{RN[r]}の演出で）\n場所：{place}\n内容：{desc}\n{EN[r]}")
    body += (f'<li><span class="n">{n}</span><span class="nm">{html.escape(name)}</span>'
             f'<span class="tag">新しい会話で・添付：{html.escape(files)}</span>'
             f'<button type="button" class="cp sm" data-b="{k}">コピー</button><p class="d">{html.escape(desc)}</p></li>')
src = open(os.path.join(os.path.dirname(__file__), "requests.py")).read()
STYLE = src.split("STYLE = '", 1)[1].split("'\nJS = ", 1)[0].encode().decode("unicode_escape").encode("latin-1").decode("utf-8")
JS = src.split("JS = '", 1)[1].split("'\nout = ", 1)[0].encode().decode("unicode_escape").encode("latin-1").decode("utf-8")
out = f'''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(S.TITLE)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap">
{STYLE}</head><body><div class="w"><h1>{html.escape(S.TITLE)}（{len(S.REDO)}枚）</h1>
<p class="muted">1枚ずつ新しい Gemini の会話で描く。書いてある画像だけを添付して（添付は少ないほど引っぱられない）、「コピー」した文を貼る。できた絵は今の絵と見比べて、使う方を決める（今の絵は消さずに残してある）。「新しい海の怪物」はまだカードではない試し描き。</p>
<ol>{body}</ol></div>
{JS.replace("__B__", json.dumps(B, ensure_ascii=False))}'''
open(OUT, "w").write(out)
json.dump({k: v for k, v in order.items() if not v[0].startswith("new-")}, open(os.path.splitext(OUT)[0] + "-order.json", "w"), ensure_ascii=False)
json.dump(FILES, open(os.path.splitext(OUT)[0] + "-files.json", "w"), ensure_ascii=False)
print(len(S.REDO), "枚 →", OUT)
