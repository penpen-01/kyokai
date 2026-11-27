#!/usr/bin/env python3
"""第1回の強さの調整（2026-11-27 オーナー決定）。お知らせのメールと同じ日に、1回だけ流す。
   python3 tools/balance/b1.py --dry-run   … 何が変わるかだけ見る（ファイルは変えない）
   python3 tools/balance/b1.py             … game-data.json と notice.json を書き換える（version +1）
流す前に git fetch → rebase で最新にし、オーナーが工房で編集中でないことを確かめる。流したあとオーナーに「工房をリロードして」と伝える。
"""
import json, sys, datetime

DRY = '--dry-run' in sys.argv
GD, NT = 'game-data.json', 'notice.json'
FOX = 'tk-foxfire'
SHRINK = ['f2-tamamo', 'f2-dancer', 'f2-kohaku', 'f2-susuki', 'f2-kamikakushi']   # 化かし：狐火を使ったときだけコストが下がる

def main():
    d = json.loads(open(GD, encoding='utf-8').read())
    C = {c['id']: c for c in d['cards']}
    log = []
    def setv(cid, key, val):
        c = C[cid]; old = c.get(key)
        if old != val: c[key] = val; log.append(f'{c["name"]}：{key} {old} → {val}')
    setv('m2-transfer', 'cost', 3)          # 個人転送
    setv('m2-reboot', 'cost', 4)            # 非常電源
    setv('m2-selfdestruct', 'cost', 5)      # 自壊のコード
    setv('y2-kensei', 'atk', 6); setv('y2-kensei', 'hp', 6)   # 剣聖ヴァルトール
    setv('f-horn', 'pay', {'kind': 'life', 'n': 2})            # 召喚の角笛：代償 体力2
    # 妖精の囁き：コスト低下はこのターンだけ
    for e in C['f-whisper']['effects']:
        if e.get('kind') == 'discount' and not e.get('turn'): e['turn'] = True; log.append('妖精の囁き：コスト低下をこのターンだけに')
    # 再起動プロトコル：+1 枚をなくす
    for e in C['x-reboot']['effects']:
        if e.get('kind') == 'refresh' and e.get('n'): log.append(f'再起動プロトコル：引く枚数 +{e["n"]} → +0'); e['n'] = 0
    # 白面九尾タマモ：登場時のダメージをなくす
    t = C['f2-tamamo']; before = len(t['effects'])
    t['effects'] = [e for e in t['effects'] if not (e.get('kind') == 'unit' and e.get('per') == 'played' and e.get('act') == 'dmg')]
    if len(t['effects']) != before: log.append('白面九尾タマモ：登場時のダメージをなくす')
    # 化かし：狐火だけ
    for cid in SHRINK:
        s = C[cid].get('shrink')
        if s and s.get('card') != FOX:
            C[cid]['shrink'] = {'n': 1, 'card': FOX}; log.append(f'{C[cid]["name"]}：化かしは「狐火」を使ったときだけ')
    # 押し出しを有効に
    if not d['config'].get('PUSH_OUT'): d['config']['PUSH_OUT'] = 1; log.append('押し出し（PUSH_OUT）を有効に')
    if not log: print('変更なし（もう流してある）'); return
    d['version'] += 1; log.append(f'version → {d["version"]}')
    today = datetime.date.today().isoformat(); d['updated'] = today
    n = json.loads(open(NT, encoding='utf-8').read())
    line = '場がいっぱいのとき、自分のキャラ1体を墓地へ押し出して、手札のキャラを出せるようになりました（効果でキャラを出すカードは、押し出すか選べます）。押し出したキャラは倒された扱いにならず、倒されたときの効果は発動しません'
    if not any(x.get('text') == line for x in n.get('notes', [])): n.setdefault('notes', []).append({'date': today, 'text': line}); log.append('notice.json に押し出しの告知を1行')
    print('\n'.join(log))
    if DRY: print('\n（--dry-run：ファイルは変えていません）'); return
    open(GD, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
    open(NT, 'w', encoding='utf-8').write(json.dumps(n, ensure_ascii=False, indent=1))   # notice.json は最後に改行なし
    print('\n書き換えました。sw.js の CACHE も上げること')

main()
