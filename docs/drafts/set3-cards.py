# 第3弾「碧海と深淵の唄」のカードを game-data.json に入れる（何度流しても同じ結果になる）
# 使い方：python3 docs/drafts/set3-cards.py
# カードの元の案は docs/set3-list.json（確定版）。ここでは、ゲームの効果の形に直したものを書く
import json, sys

def U(act, to, n=1, **k): return {"kind": "unit", "n": n, "act": act, "to": to, **k}
def P(act, who, n, **k): return {"kind": "player", "n": n, "act": act, "who": who, **k}
def K(kind, n=1, **k): return {"kind": kind, "n": n, **k}
def W(when, e): return {**e, "when": when}

KW = {"守護": "guard", "不動": "noattack", "2回攻撃": "twice", "突進": "rush", "亡霊": "ghost", "不屈": "steadfast", "不壊": "unbreakable", "岩殻": "reef", "凪": "calm", "潜航": "dive"}
RAR = {"C": "common", "R": "rare", "SR": "sr", "UR": "ur", "L": "legend"}
GLY = {"myth": "神", "fan": "幻", "mech": "機"}
CHIBI, AWA, EIREI, PURU, TIDE = "tk-chibi", "tk-awa", "tk-hero", "tk-pururu", "tk-j-tide"   # 英霊は既存のトークン（不死の英雄王と同じ。オーナー 11-24）
REQ_J = {"n": 1, "tribe": "jelly"}

def C(id, world, r, cost, name, atk, hp, kws=(), effects=(), **x):
    c = {"id": id, "name": name, "world": world, "type": "char", "cost": cost, "atk": atk, "hp": hp, "glyph": GLY[world], "limit": 3, "rarity": RAR[r],
         "keywords": [KW[k] for k in kws], "effects": list(effects), "set": "3"}
    c.update(x); return c
def S(id, world, r, cost, name, effects=(), **x):
    c = {"id": id, "name": name, "world": world, "type": "spell", "cost": cost, "glyph": GLY[world], "limit": 3, "rarity": RAR[r],
         "keywords": [], "effects": list(effects), "set": "3"}
    c.update(x); return c
def T(c): c = dict(c); c["limit"] = 0; c["token"] = True; c["rarity"] = "common"; return c

M = "myth"; F = "fan"; X = "mech"
REV = "revived"
CARDS = [
  # ===== 神話 =====
  C("m3-eirei", M, "C", 1, "英霊の残り火", 1, 1, ["亡霊"], [W(REV, U("both", "ownRand", 1))]),
  C("m3-hakamori", M, "C", 2, "墓守の翁", 1, 2, [], [K("mill", 3)]),
  S("m3-funauta", M, "C", 2, "黄泉の舟唄", [K("toss", 1, ctype="char"), P("draw", "self", 2)]),
  C("m3-suihei", M, "C", 3, "亡霊水兵", 2, 2, ["亡霊"], [W(REV, K("tokenField", 1, card=EIREI))]),
  C("m3-centurion", M, "C", 5, "冥海の百人隊長", 4, 4, ["亡霊"], [W(REV, K("tokenField", 2, card=EIREI))]),
  C("m3-hatamochi", M, "R", 3, "亡国の旗手", 2, 3, ["亡霊"], [W(REV, U("atk", "ownAll", 1))]),
  S("m3-touro", M, "R", 4, "還魂の灯籠", [K("reviveSel", 6, cnt=1)]),
  C("m3-eiji", M, "R", 5, "神殿の亡霊衛士", 4, 5, ["亡霊"], [W(REV, U("hp", "self", 3)), W(REV, U("dmg", "enemyRand", 2))]),
  C("m3-hotaru", M, "SR", 6, "送り火の巫女ホタル", 3, 5, [], [K("reviveSel", 3, cnt=2)]),
  C("m3-charon", M, "SR", 3, "渡し守カロン", 1, 4, [], [W("allyDeath", P("draw", "self", 1, af="ghost", cap=2))]),
  C("m3-harpoon", M, "C", 3, "海獣狩りの銛打ち", 2, 3, [], [K("cutOne", 1, tribe="beast", ctype="char")]),
  C("m3-aspido", M, "C", 5, "アスピドケロン", 3, 6, [], [U("hp", "ownAll", 1)], tribe="beast"),
  S("m3-fue", M, "R", 2, "深海の呼び笛", [K("tutor", 10, ctype="char", tribe="beast")]),
  C("m3-siren", M, "R", 3, "セイレーン", 2, 3, [], [U("atk", "enemy1", -2)], tribe="beast"),
  C("m3-hippo", M, "R", 6, "ヒッポカムポス", 5, 5, [], [U("atk", "self", 2, cond="tribeGE", ctribe="beast", cn=2)], tribe="beast"),
  C("m3-scylla", M, "SR", 5, "六首の魔スキュラ", 4, 5, [], [W("attack", U("dmg", "enemyRand", 2))], tribe="beast"),
  S("m3-shoukan", M, "R", 4, "深淵の召喚歌", [K("cheat", 1, tribe="beast")], pay={"kind": "life", "n": 5}),
  C("m3-scarlet", M, "UR", 7, "真紅の女王スカーレット", 6, 6, [], [K("handSteal", 5)]),
  C("m3-charybdis", M, "UR", 6, "大渦カリブディス", 0, 8, ["守護", "不動"], [W("turnEnd", U("destroy", "enemyLow"))], tribe="beast"),
  C("m3-kraken", M, "UR", 7, "大海魔クラーケン", 6, 7, [], [W("attack", U("bottom", "enemyRand"))], tribe="beast"),
  C("m3-leviathan", M, "L", 9, "海の覇王リヴァイアサン", 8, 8, ["守護"], [U("dmg", "enemyAll", 3)], tribe="beast"),
  C("m3-yadokari", M, "C", 2, "宿借りの闘士", 1, 4, ["守護"], [W("attacked", U("dmg", "foe", 1))]),
  S("m3-oikaze", M, "C", 4, "追い風の祝詞", [U("both", "own1", 2), U("grant", "own1", 1, kw="elusive", mine=True)]),
  C("m3-minato", M, "SR", 3, "灯台守の娘ミナト", 2, 3, [], [K("ward")]),
  C("m3-azuria", M, "L", 6, "碧海の女神アズーリア", 4, 7, ["不壊"], [P("heal", "self", 5), W("healed", U("dmg", "enemyRand", 1, amt=True, cap=3))]),
  C("m3-uni", M, "C", 2, "棘甲の海兵", 1, 3, [], [W("attacked", U("atk", "foe", -1))]),
  S("m3-trident", M, "C", 3, "海神の三叉槍", [U("dmg", "enemy1", 5)]),
  C("m3-nagisa", M, "R", 4, "凪の巫女ナギサ", 1, 3, ["凪"]),
  C("m3-gantetsu", M, "SR", 6, "巌蟹王ガンテツ", 4, 7, ["守護", "岩殻"]),
  S("m3-shioyomi", M, "C", 2, "潮読み", [P("draw", "self", 1), P("draw", "self", 1, cond="hpLE", cn=10)]),
  S("m3-tenbin", M, "R", 4, "天秤の裁き", [K("scales")]),
  C("m3-hayate", M, "R", 6, "波斬りのハヤテ", 4, 4, ["2回攻撃"], [W("kill", U("atk", "self", 1))]),
  S("m3-ikari", M, "SR", 7, "海神の怒り", [U("dmg", "enemyAll", 5), P("dmg", "opp", 3, cond="tribeGE", ctribe="beast", cn=1)]),
  # ===== 幻想 =====
  C("f3-nakimushi", F, "C", 1, "泣き虫ゴースト", 1, 1, ["亡霊"], [W(REV, P("draw", "self", 1))]),
  S("f3-temaneki", F, "C", 2, "亡者の手招き", [K("mill", 3), P("draw", "self", 1, cond="milledGhost")]),
  C("f3-utsubo", F, "C", 2, "沈船のウツボ", 1, 3, [], [K("mill", 2), U("atk", "self", 1, per="milledGhost")]),
  C("f3-gaikotsu", F, "C", 3, "骸骨甲板員", 2, 2, ["亡霊"], [W(REV, U("atk", "self", 2))]),
  C("f3-ikarihiki", F, "C", 4, "錨引きの亡者", 3, 3, ["亡霊"], [W(REV, U("atk", "self", 1)), W(REV, U("grant", "self", 1, kw="rush"))]),
  S("f3-tamagae", F, "R", 4, "魂替えの儀", [K("reviveSel", 6, cnt=1)], pay={"kind": "sacrifice"}),
  C("f3-suifucho", F, "R", 6, "亡者の水夫長", 4, 5, ["亡霊"], [], aura={"kind": "self", "max": 4}),
  S("f3-michizure", F, "SR", 4, "道連れの宴", [K("pact")]),
  S("f3-daikoushin", F, "UR", 6, "亡者の大行進", [U("grant", "ownAll", 1, kw="pierce", turn=True, cond="ghostArmy", cn=6), U("atk", "ownAll", 2, turn=True, cond="ghostArmy", cn=6)]),
  C("f3-veil", F, "UR", 5, "沈める花嫁ヴェール", 3, 4, [], [K("reviveSel", 10, cnt=2, total=5)]),
  C("f3-grave", F, "L", 8, "幽霊船長グレイヴ", 6, 7, [], [K("reviveSel", 10, cnt=3, total=8)]),
  S("f3-komoriuta", F, "C", 2, "月夜の子守唄", [K("tokenField", 1, card=CHIBI), K("jellyHand", 1)]),
  S("f3-tomoshibi", F, "R", 3, "クラゲの灯火", [K("jellyHand", 2)]),
  C("f3-yurameki", F, "R", 2, "ゆらめきクラゲ", 1, 3, [], [W("cardPlay", U("both", "self", 1, pt="spell", ptr="jelly"))], tribe="jelly"),
  C("f3-uzumaki", F, "C", 5, "渦巻きクラゲ", 3, 5, [], [W("spell", U("dmg", "enemyRand", 1))], tribe="jelly"),
  C("f3-puka", F, "SR", 2, "泡クラゲのプカ", 1, 2, [], [K("jellyHand", 1)], tribe="jelly"),
  C("f3-octa", F, "UR", 6, "八腕の錬金術師オクタ", 3, 5, [], [], aura={"kind": "cost", "n": 2}),
  C("f3-nocto", F, "L", 5, "深海の灯姫ノクト", 2, 5, [], [K("tokenHand", 1, card=TIDE)], tribe="jelly", aura={"kind": "stat", "tribe": "jelly", "atk": 1}),
  S("f3-sumi", F, "C", 3, "深海の墨", [U("dmg", "enemy1", 3), K("tokenField", 1, card=CHIBI, cond="killedNow")]),
  S("f3-takarabako", F, "R", 3, "海賊の宝箱", [], sway=["tk-s-gold", "tk-s-doll", "tk-s-map"]),
  C("f3-barba", F, "SR", 5, "髑髏旗の船長バルバ", 5, 4, [], [K("tokenHand", 1, card="f3-takarabako")]),
  C("f3-borg", F, "R", 4, "甲板長ボルグ", 3, 4, [], [K("handTax", 1)]),
  C("f3-kodako", F, "C", 2, "墨吐き小ダコ", 1, 2, [], [U("freeze", "enemy1")]),
  C("f3-tobiuo", F, "C", 3, "飛魚の行商人", 2, 2, [], [P("draw", "self", 1)]),
  S("f3-naminori", F, "R", 2, "波乗りの唄", [U("atk", "own1", 2, turn=True), U("grant", "own1", 1, kw="surf", turn=True)]),
  C("f3-tobinori", F, "R", 4, "飛魚騎りの少年", 3, 3, [], [K("tokenField", 1, card=AWA)]),
  C("f3-sango", F, "R", 5, "珊瑚の巨人", 2, 9, ["守護", "不屈"]),
  C("f3-shabon", F, "SR", 3, "泡沫の歌い手シャボン", 1, 4, [], [U("grant", "own1", 1, kw="shield")]),
  C("f3-marina", F, "SR", 6, "人魚の歌姫マリーナ", 4, 6, ["守護"], [W("turnEnd", U("hp", "ownAll", 1))]),
  S("f3-tayori", F, "C", 2, "妖精の便り", [K("dig", 3, rest="grave")]),
  C("f3-tsunousagi", F, "C", 4, "角兎の用心棒", 3, 4, [], [W("attacked", U("atk", "self", 1))]),
  C("f3-hugh", F, "R", 3, "つむじ風のヒュー", 2, 2, [], [U("bounce", "enemy1", 1, cmax=2)]),
  C("f3-suiryu", F, "SR", 7, "翠竜", 6, 7, ["不屈", "不壊"]),
  # ===== 機械 =====
  C("x3-sabineji", X, "C", 1, "錆びネジ", 1, 1, ["亡霊"], [W(REV, U("dmg", "enemyRand", 1))]),
  S("x3-haizai", X, "C", 2, "廃材あさり", [K("mill", 2), K("graveHand", 1)]),
  C("x3-saikidou", X, "C", 3, "再起動兵", 2, 2, ["亡霊"], [W(REV, U("grant", "self", 1, kw="armor")), W(REV, U("atk", "self", 1))]),
  C("x3-shinsui", X, "C", 5, "浸水警備機", 3, 5, ["亡霊"], [W(REV, U("dmg", "enemyAll", 1))]),
  C("x3-kirai", X, "R", 2, "浮遊機雷", 1, 2, ["亡霊"], [W("death", U("dmg", "enemyRand", 2))]),
  C("x3-garakuta", X, "R", 3, "解体屋ガラクタ", 2, 3, [], [W("allyDeath", U("atk", "self", 1, af="ghost"))]),
  S("x3-kinkyu", X, "R", 5, "緊急再起動", [K("reviveSel", 10, cnt=2, total=5)], pay={"kind": "sacrifice"}),
  C("x3-senkan", X, "SR", 7, "幽霊戦艦", 6, 7, ["亡霊"], [W(REV, U("dmg", "enemyAll", 2))]),
  C("x3-rusty", X, "UR", 6, "廃艦提督ラスティ", 4, 5, [], [K("reviveSel", 5, cnt=1, mod="rusty")]),
  S("x3-shingou", X, "R", 1, "発光信号", [K("tutor", 10, ctype="char", tribe="jelly")]),
  C("x3-chikuden", X, "R", 2, "蓄電クラゲ", 2, 2, [], [W("allyDeath", U("dmg", "enemyRand", 2, af="jelly"))], tribe="jelly"),
  C("x3-baiyou", X, "SR", 4, "クラゲ培養槽", 0, 5, ["不動"], [W("turnStart", K("tokenField", 1, card=CHIBI))], tribe="jelly"),
  C("x3-houden", X, "C", 2, "放電クラゲ", 2, 1, [], [W("death", K("jellyHand", 1))], tribe="jelly"),
  C("x3-buoy", X, "R", 4, "クラゲ観測ブイ", 2, 4, [], [W("cardPlay", K("tokenField", 1, card=CHIBI, pt="spell", ptr="jelly"))], tribe="jelly"),
  S("x3-daihouden", X, "SR", 5, "深海大放電", [U("dmg", "enemyAll", 3, plus="jelly", plusMax=2)]),
  C("x3-hikari", X, "UR", 4, "機巧クラゲのヒカリ", 2, 4, [], [W("cardPlay", P("draw", "self", 1, pt="spell", ptr="jelly", cap=1))], tribe="jelly"),
  C("x3-iruka", X, "C", 2, "郵便イルカ号", 1, 2, [], [K("tokenHand", 1, card="tk-part")]),
  C("x3-hamasouji", X, "C", 3, "浜掃除ロボ", 2, 3, [], [U("hp", "own1", 2, world="mech")]),
  C("x3-shouha", X, "C", 5, "消波防壁", 2, 7, ["守護"], [], armor=1),
  C("x3-kyunan", X, "R", 3, "救難ロボ", 1, 4, [], [W("allyDeath", P("heal", "self", 2, cap=1))]),
  C("x3-crane", X, "R", 4, "港湾クレーン", 2, 4, [], [K("tokenHand", 3, card="tk-gear")]),
  C("x3-lux", X, "SR", 3, "灯台ロボのルクス", 1, 4, [], [W("turnEnd", P("heal", "self", 1))], aura={"kind": "stat", "world": "mech", "hp": 1}),
  C("x3-orca", X, "L", 4, "蒼鋼の鯱オルカ", 3, 3, [], [U("destroy", "enemy1", 1, cmax=4)], aura={"kind": "stat", "world": "mech", "atk": 1}),
  C("x3-yoduri", X, "C", 2, "夜釣りロボ", 2, 2, [], [K("peekMill")]),
  S("x3-gyorai", X, "C", 3, "魚雷", [U("dmg", "enemy1", 3), P("dmg", "opp", 2)]),
  S("x3-tsumini", X, "R", 3, "引き上げた積み荷", [], sway=["tk-s-kit", "tk-s-parts", "tk-s-dud"]),
  C("x3-gearshark", X, "UR", 6, "合体潜水機ギアシャーク", 4, 4, [], [U("both", "self", 3, cond="gearPaid"), U("grant", "self", 1, kw="rush", cond="gearPaid")], gear=3),
  C("x3-nautilus", X, "L", 8, "深潜艦ノーチラス", 7, 7, ["潜航"], [U("dmg", "enemyAll", 3)]),
  C("x3-nikyaku", X, "C", 4, "試作二脚機", 4, 3, [], [W("attack", U("grant", "self", 1, kw="armor"))]),
  C("x3-bousou", X, "C", 7, "暴走重機", 7, 6, [], [U("dmg", "ownRand", 2)]),
  C("x3-kanshou", X, "R", 4, "次元干渉ブイ", 2, 4, [], [W("foeBack", U("dmg", "foe", 4))]),
  S("x3-bunkai", X, "SR", 4, "分解砲", [U("destroy", "enemy1", 1, cmax=3), U("destroy", "enemy2", 1, cmax=3)]),
  C("x3-pururu", X, "SR", 6, "スライム博士プルル", 4, 5, [], [W("death", K("tokenField", 2, card=PURU))]),
]
TOKENS = [
  T(C(CHIBI, F, "C", 1, "ちびクラゲ", 1, 1, [], tribe="jelly")),
  T(C(AWA, F, "C", 1, "泡の妖精", 1, 1, [], [W("death", K("ward"))])),
  T(C(PURU, X, "C", 2, "プルルの分身", 2, 2)),
  T(S("tk-j-needle", F, "C", 1, "痺れ針", [U("dmg", "enemy1", 2)], tribe="jelly", req=REQ_J)),
  T(S("tk-j-cradle", F, "C", 1, "泡の揺りかご", [K("tokenField", 2, card=CHIBI)], tribe="jelly", req=REQ_J)),
  T(S("tk-j-flash", F, "C", 2, "青い閃光", [U("dmg", "enemyAll", 1)], tribe="jelly", req=REQ_J)),
  T(S(TIDE, F, "C", 4, "満ち潮の夜", [K("tide", 2)], tribe="jelly", req=REQ_J)),
  # 揺らぎの中身（使ったときに、どれか1つになる）
  T(S("tk-s-gold", F, "C", 3, "金貨の山", [P("draw", "self", 2)])),
  T(S("tk-s-doll", F, "C", 3, "呪いの人形", [U("dmg", "enemyRandF", 4)])),
  T(S("tk-s-map", F, "C", 3, "宝の地図", [K("tutor", 10, ctype="char")])),
  T(S("tk-s-kit", X, "C", 3, "修理キット", [U("hp", "ownRand", 3)])),
  T(S("tk-s-parts", X, "C", 3, "謎の部品", [K("tokenHand", 2, card="tk-gear")])),
  T(S("tk-s-dud", X, "C", 3, "不発弾", [U("dmg", "anyRand", 5)])),
]

GATE_DECK = {"m3-yadokari": 2, "m3-uni": 1, "m3-siren": 2, "m3-harpoon": 2, "m3-fue": 2, "m3-trident": 3, "x3-gyorai": 2, "m3-minato": 2, "m3-aspido": 2,
  "m3-scylla": 2, "x3-orca": 1, "m3-shoukan": 2, "m3-hippo": 1, "m3-kraken": 1, "m3-charybdis": 1, "m3-leviathan": 1, "m3-ikari": 1, "x3-bunkai": 2}

def check():
  import collections
  for w in (M, F, X):
    L = [c for c in CARDS if c["world"] == w]
    r = collections.Counter(c["rarity"] for c in L)
    assert len(L) == 33 and r == {"common": 12, "rare": 10, "sr": 6, "ur": 3, "legend": 2}, (w, len(L), r)
  ids = [c["id"] for c in CARDS + TOKENS]; assert len(ids) == len(set(ids)), "id が重なっている"
  names = [c["name"] for c in CARDS]; assert len(names) == len(set(names)), "名前が重なっている"
  assert sum(GATE_DECK.values()) == 30 and all(k in ids for k in GATE_DECK), "開放戦のデッキ"

if __name__ == "__main__":
  check()
  path = sys.argv[1] if len(sys.argv) > 1 else "game-data.json"
  d = json.load(open(path))
  new = {c["id"] for c in CARDS + TOKENS} | {"tk-eirei"}   # tk-eirei は前に作って、既存の英霊に置き換えたもの
  old = {c["name"] for c in d["cards"] if c["id"] not in new and not c.get("token")}
  dup = [c["name"] for c in CARDS if c["name"] in old]
  assert not dup, ("既存のカードと同じ名前", dup)
  keep = [c for c in d["cards"] if c["id"] not in new]
  for c in TOKENS: c["set"] = "3"
  d["cards"] = keep + CARDS + TOKENS
  # パック（まだ閉じておく。開放戦・絵ができてから開く）
  pk = {"id": "pack3", "name": "第3弾 碧海と深淵の唄", "price": 150, "size": 5, "cards": [c["id"] for c in CARDS],
        "odds": {"normal": {"common": 60, "rare": 28, "sr": 9, "ur": 2.7, "legend": 0.3}, "last": {"common": 0, "rare": 55, "sr": 33, "ur": 10, "legend": 2}},
        "open": False, "set": "3", "gateRule": "set2cap", "gateDeck": "gate-sea", "gateLevel": "hard"}
  d["packs"] = [p for p in d["packs"] if p["id"] != "pack3"] + [pk]
  # 開放戦の相手（上級の考え方で動く）
  gd = {"id": "gate-sea", "name": "深淵の海獣団", "level": "gate", "key": "m3-leviathan", "cards": GATE_DECK}
  d["decks"] = [x for x in d["decks"] if x["id"] != "gate-sea"] + [gd]
  json.dump(d, open(path, "w"), ensure_ascii=False, indent=1)
  print("OK", len(CARDS), "cards +", len(TOKENS), "tokens")
