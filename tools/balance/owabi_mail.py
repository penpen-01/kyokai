#!/usr/bin/env python3
"""第1回の強さの調整のおわびメール（10000G・2週間・送った日までに始めた人だけ）。第3弾の公開日に1回だけ流す（オーナー 11-27）。
   python3 tools/balance/owabi_mail.py --dry-run   … 中身を見るだけ
   python3 tools/balance/owabi_mail.py             … game-data.json の mail に足して version +1（もう入っていれば何もしない）
流す前に git fetch → rebase。流したあと sw.js の CACHE を上げて push し、オーナーに工房のリロードを頼む。"""
import json, sys, datetime
DRY = '--dry-run' in sys.argv
GD = 'game-data.json'
today = datetime.date.today(); until = today + datetime.timedelta(days=14)
md = f'{until.month}月{until.day}日'
mail = {
  'id': f'mm{today:%m%d}owabi', 'date': today.isoformat(), 'until': until.isoformat(),
  'title': 'カードの調整のおわびと、第3弾のお知らせ',
  'body': ('いつも「境界の召喚士」を遊んでくれて、ありがとうございます。\n\n'
           '一部のカードが強くなりすぎていたため、カードの強さを調整しました。\n'
           '強すぎるカードを出してしまったのは運営のミスです。デッキを組んでくれていたみなさん、申し訳ありませんでした。\n\n'
           '主な調整：白面九尾タマモ・狐火・化け狐・個人転送・非常電源・妖精の囁き・召喚の角笛・再起動プロトコル・自壊のコード・剣聖ヴァルトール\n'
           '\n'
           'あわせて、場がいっぱいのときに、自分のキャラ1体を墓地へ押し出して新しいキャラを出せる「押し出し」を始めました。\n\n'
           'おわびとして、10000G をお届けします。\n'
           '今日から第3弾「碧海と深淵の唄」も始まりました。ぜひパックを引いてみてください。\n\n'
           f'※このメールの受け取り期限は {md} までです。\n'
           '※届いていないときは、アプリを一度完全に閉じてから開き直してください。\n\n'
           'これからも「境界の召喚士」をよろしくお願いします！'),
  'to': 'before', 'gold': 10000, 'stones': 0, 'tickets': 0, 'senTickets': 0, 'cards': {}, 'picks': {}
}
d = json.loads(open(GD, encoding='utf-8').read())
if any(m.get('id') == mail['id'] for m in d.get('mail', [])): print('もう入っています'); sys.exit()
print(json.dumps(mail, ensure_ascii=False, indent=1))
if DRY: print('\n（--dry-run：ファイルは変えていません）'); sys.exit()
d.setdefault('mail', []).append(mail); d['version'] += 1; d['updated'] = today.isoformat()
open(GD, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
print(f'\nmail に足しました（version {d["version"]}）。sw.js の CACHE も上げること')
