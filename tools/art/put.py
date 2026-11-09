# イラストをカードに入れる。
# 使い方（リポジトリのフォルダで）:
#   python3 tools/art/put.py f2-kit=画像1.png f2-moonwalk=画像2.png ...
#   python3 tools/art/put.py --order 並び.json グループ名 画像1 画像2 ...   （並び.json = {"グループ名": [カードID, ...]}）
# 400×560 の WebP にして art/<ID>-<ハッシュ>.webp に置き、game-data.json の art を書き換え、version を1つ上げる。
# 古い絵のファイルは消さない。入れたあとは sw.js の CACHE を上げてコミットする。
import sys, json, io, hashlib, os
from PIL import Image, ImageOps

args = sys.argv[1:]
if args and args[0] == "--order":
    order = json.load(open(args[1])); ids = order[args[2]]; files = args[3:]
    assert len(files) == len(ids), f"画像{len(files)}枚・カード{len(ids)}枚で数が合わない"
    pairs = list(zip(ids, files))
else:
    pairs = [a.split("=", 1) for a in args]
if not pairs: sys.exit(__doc__ or "使い方は先頭のコメントを見る")

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
files = [(i, os.path.abspath(f)) for i, f in pairs]
os.chdir(root)
d = json.load(open("game-data.json")); by = {c["id"]: c for c in d["cards"]}
for i, f in files:
    if i not in by: sys.exit(f"カードID {i} が見つからない")
    old = by[i].get("art")
    im = ImageOps.fit(Image.open(f).convert("RGB"), (400, 560), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, "WEBP", quality=82, method=6); data = b.getvalue()
    path = f"art/{i}-{hashlib.sha1(data).hexdigest()[:10]}.webp"
    open(path, "wb").write(data); by[i]["art"] = path
    # 古い絵は消さない（カード工房を開いたままの人が古い指定で公開しても、絵が消えないように）
    print(i, by[i]["name"], path)
d["version"] += 1
json.dump(d, open("game-data.json", "w"), ensure_ascii=False, indent=1)
print("version", d["version"])
