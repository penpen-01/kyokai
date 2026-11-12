/* =========================================================
   クエスト（ホームの掲示板から見る）
   ・デイリー：毎日、DAILY_POOL から3つ（人ごと・日ごとに決まる。日付が変わると入れ替わる）
   ・期間限定：工房で作る（DATA.quests）。期間中だけ出る
   ・初心者歓迎：this.begin() を順に。全部終わると、贈り物のデッキ（level "gift"）から1つ選んで受け取れる
   進み具合は Account.data.q に保存：{ d:{date, ids, p, got}, b:{p, got, gift}, l:{p, got} }
   対戦中のことは S.stats（game.js の stat()）に数えておき、決着したときにまとめて足す
   ========================================================= */
const Quest = {
  tab: "daily",
  pool() { return (typeof QUEST_DAILY !== "undefined" && QUEST_DAILY && QUEST_DAILY.length) ? QUEST_DAILY : DAILY_POOL; },
  begin() { return (typeof QUEST_BEGIN !== "undefined" && QUEST_BEGIN && QUEST_BEGIN.length) ? QUEST_BEGIN : BEGINNER; },

  ok() { return Account.status === "ready" || Account.status === "offline"; },
  st() {
    const d = Account.data; if (!d) return null;
    // サーバー（Realtime Database）は空の {} や [] を保存しないので、読み込んだあとは欠けていることがある。毎回そろえる
    const q = (d.q && typeof d.q === "object") ? d.q : (d.q = {});
    const arr = v => Array.isArray(v) ? v : (v && typeof v === "object" ? Object.values(v) : []);
    const obj = v => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
    q.d = obj(q.d); q.b = obj(q.b); q.l = obj(q.l);
    [q.d, q.b, q.l].forEach(x => { x.p = obj(x.p); x.got = arr(x.got); });
    q.d.ids = arr(q.d.ids);
    // 日付が変わったら、デイリーを引き直す
    const today = localDate(new Date());
    if (q.d.date !== today || !q.d.ids.length) q.d = { date: today, ids: this.draw(today), p: {}, got: [] };
    return q;
  },
  /* その日の3つ：アカウントのコードと日付から決める（同じ日なら何度開いても同じ） */
  draw(day) {
    let h = 2166136261; for (const ch of (Account.code || "") + day) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const pool = this.pool().slice(), out = [], want = CONFIG.DAILY_N || 3;
    while (out.length < want && pool.length) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; out.push(pool.splice(h % pool.length, 1)[0].id); }
    return out;
  },
  daily() { const q = this.st(); return q ? q.d.ids.map(id => this.pool().find(x => x.id === id)).filter(Boolean) : []; },
  limited() { const t = localDate(new Date()); return (typeof QUESTS !== "undefined" ? QUESTS : []).filter(x => (!x.from || x.from <= t) && (!x.until || t <= x.until)); },
  beginnerDone() { const q = this.st(); return !!q && this.begin().every(x => q.b.got.includes(x.id)); },
  showBeginner() { const q = this.st(); return !!q && !q.b.gift; },

  /* どの入れ物の進み具合か */
  box(kind) { const q = this.st(); return kind === "d" ? q.d : kind === "b" ? q.b : q.l; },
  lists() { return [["d", this.daily()], ["l", this.limited()], ...(this.showBeginner() ? [["b", this.begin()]] : [])]; },
  prog(kind, x) { return Math.min(x.n, this.box(kind).p[x.id] || 0); },
  done(kind, x) { return this.prog(kind, x) >= x.n; },
  got(kind, x) { return this.box(kind).got.includes(x.id); },
  claimable() {
    if (!this.ok() || !Account.data) return 0;
    let n = 0; this.lists().forEach(([k, L]) => L.forEach(x => { if (this.done(k, x) && !this.got(k, x)) n++; }));
    if (this.showBeginner() && this.beginnerDone()) n++;
    return n;
  },

  /* 何かをしたら呼ぶ。type は QUEST_TYPES のキー。info.lv は CPU の強さ */
  add(type, n = 1, info = {}) {
    try { this.addIn(type, n, info); } catch (e) { console.error(e); }   // クエストで失敗しても、元の操作は止めない
  },
  addIn(type, n, info) {
    if (!this.ok() || !Account.data || !(n > 0)) return;
    let changed = false;
    this.lists().forEach(([k, L]) => L.forEach(x => {
      if (x.type !== type || (x.lv && x.lv !== info.lv) || this.got(k, x)) return;
      const box = this.box(k), before = box.p[x.id] || 0;
      if (before >= x.n) return;
      box.p[x.id] = Math.min(x.n, before + n); changed = true;
      if (box.p[x.id] >= x.n && typeof toast === "function") toast(`クエスト達成！「${questText(x)}」— 掲示板で受け取れます`);
    }));
    if (changed) Account.save();
  },
  /* 決着したとき（結果の画面を出すときに1回）。サンプルデッキの試合は数えない */
  onGame(res, sample) {
    if (!S || sample || this.doneGid === S.gid) return;
    if (S.battle && S.battle.kind === "tutorial") return;   // チュートリアルはクエストに数えない（くり返して稼げないように）
    this.doneGid = S.gid;
    const me = MODE === "online" && typeof Online !== "undefined" ? Online.me : ME;
    const st = (S.stats || [])[me] || {};
    const cpu = MODE === "cpu", B = S.battle;
    this.add("battle", 1);
    if (MODE === "online") this.add("online", 1);
    if (res === "win") { this.add("win", 1); if (cpu && (!B || B.kind === "cpu")) this.add("winLv", 1, { lv: CPU_LEVEL }); }
    ["spell", "char", "kill", "face", "poison", "freeze", "gear"].forEach(k => { if (st[k]) this.add(k, st[k]); });
  },

  claim(kind, id) {
    const L = kind === "d" ? this.daily() : kind === "b" ? this.begin() : this.limited();
    const x = L.find(q => q.id === id);
    if (!x || !this.done(kind, x) || this.got(kind, x)) return;
    this.box(kind).got.push(x.id);
    if (x.gold) Account.data.gold += x.gold;
    if (x.stones) Account.data.stones = (Account.data.stones || 0) + x.stones;
    if (x.tickets) Account.data.tickets = (Account.data.tickets || 0) + x.tickets;
    Account.saveNow();
    Sound.play("win");
    toast(`${questReward(x)} を受け取りました`);
    this.show();
  },
  /* 初心者クエストを全部終えた：贈り物のデッキを1つ選ぶ（カードをもらい、デッキも作られる） */
  gifts() { return PRESETS.filter(d => d.level === "gift"); },
  takeGift(id) {
    const q = this.st(), d = this.gifts().find(x => x.id === id);
    if (!q || !d || q.b.gift || !this.beginnerDone()) return;
    q.b.gift = d.id;
    Object.entries(d.cards).forEach(([cid, n]) => { Account.data.cards[cid] = (Account.data.cards[cid] || 0) + n; });
    if (typeof Decks !== "undefined" && Decks.addGiftDeck) Decks.addGiftDeck(d);
    Account.saveNow();
    Sound.play("win");
    this.giftPick = null;
    openOverlay(`<div class="panel qpanel">
      <div class="topbar"><button type="button" class="btn sm" data-act="quests">← 掲示板</button><b>贈り物</b></div>
      <div class="q-giftdone">${d.key && DEF[d.key] ? cardHTML(DEF[d.key], { static: true }) : ""}
        <h2>「${esc(d.name)}」を受け取りました！</h2>
        <p>30枚のカードを手に入れ、デッキ編成に「${esc(d.name)}」ができました。デッキを選んで、さっそく対戦してみましょう。</p>
        <div class="pre-btns"><button type="button" class="btn primary" data-act="decks">デッキ編成へ</button><button type="button" class="btn" data-act="back">ホームへ</button></div></div>
    </div>`, "start");
  },

  /* ---------- 画面 ---------- */
  boardHTML() {
    if (!this.ok() || !Account.data) return "";
    const d = this.daily(), q = this.st(), n = this.claimable();
    const dn = d.filter(x => q.d.got.includes(x.id)).length;
    return `<button type="button" class="qboard" data-act="quests" aria-label="クエスト掲示板${n ? `（受け取れる報酬 ${n}）` : ""}">
      <span class="qb-pin" aria-hidden="true"></span>
      <b>クエスト</b>
      <small>${this.guideSeen() ? `デイリー ${dn}/${d.length}` : "まずは進め方"}</small>
      ${n ? `<span class="navbadge">${n}</span>` : !this.guideSeen() ? `<span class="navbadge">!</span>` : ""}
    </button>`;
  },
  rowHTML(kind, x) {
    const p = this.prog(kind, x), done = p >= x.n, got = this.got(kind, x);
    return `<li class="qrow ${got ? "got" : done ? "done" : ""}">
      <div class="q-main"><b>${esc(x.title || questText(x))}</b>${x.title ? `<small>${esc(questText(x))}</small>` : ""}
        <div class="q-bar" aria-hidden="true"><i style="width:${Math.round(p / x.n * 100)}%"></i></div>
        <small class="q-meta">${p}/${x.n} ・ 報酬 ${esc(questReward(x))}${kind === "l" && x.until ? ` ・ ${esc(x.until.slice(5).replace("-", "/"))}まで` : ""}</small></div>
      ${got ? `<span class="q-state">受け取り済み</span>` : done ? `<button type="button" class="btn sm primary" data-act="questClaim" data-k="${kind}" data-id="${esc(x.id)}">受け取る</button>` : `<span class="q-state">${x.n - p > 0 ? "あと" + (x.n - p) : ""}</span>`}
    </li>`;
  },
  /* ---------- 進め方（はじめた人に、このゲームの遊び進め方を一本の道で見せる） ---------- */
  guideSeen() { try { return localStorage.getItem("kyokai-guide") === "1"; } catch (e) { return true; } },
  guideSteps() {
    const own = id => Account.owned(id) > 0;
    const bossCards = CARDS.filter(c => c.boss && !c.token);
    const gAll = typeof gatePacks === "function" ? gatePacks(true) : [], gLeft = typeof gatePacks === "function" ? gatePacks() : [];
    const ex = typeof exOpen === "function" && exOpen();
    const hasDeck = Decks.mine().some(d => !Decks.isLtd(d) && !Decks.problems(d).length);
    return [
      { t: "カードを集める", done: this.beginnerDone() || this.begin().every(x => this.got("b", x)),
        b: `まずは CPU戦の<b>初級・中級</b>で勝って G をためて、<b>パック</b>を開けましょう。<b>初心者歓迎クエスト</b>を全部クリアすると、レジェンド入りのデッキが1つもらえます。毎日の<b>デイリークエスト</b>も報酬がおいしいです。ダブったカードは<b>ショップで分解</b>して魔石にし、欲しいカードと<b>交換</b>できます。`,
        go: [["cpu", "CPU戦へ"], ["packs", "パックへ"], ["shop", "ショップへ"]] },
      { t: "自分のデッキを作る", done: hasDeck,
        b: `集めたカードで、<b>デッキ編成</b>から30枚のデッキを組みます。最初は1つの世界にしぼると、カードどうしがかみ合いやすくなります。強いカードが手に入ったら、少しずつ入れ替えて強くしていきましょう。`,
        go: [["decks", "デッキ編成へ"]] },
      { t: "上級に勝って、隠しボスを倒す", done: bossCards.some(c => own(c.id)),
        b: `デッキが育ったら<b>上級</b>に挑戦。上級に勝つと、<b>まれに隠しボスが現れます</b>（上級に何度も勝てば、いつか必ず現れます）。ボスを倒すと、<b>ボスが使う限定レジェンド</b>が手に入ります。限定レジェンドはパックや交換では手に入りません。あわせて第1弾のカードもそろえていきましょう。`,
        go: [["cpu", "CPU戦へ"]] },
      ...(gAll.length ? [{ t: "パック開放戦で、新しいパックを開く", done: !gLeft.length,
        b: `第2弾のパックは、<b>パック開放戦</b>に勝つとショップに並びます。開放戦はパックごとにルール（世界限定など）が決まっていて、ルールに合ったデッキで挑みます。一気に全部開ける人も、1つ開けてカードを集めてから次に挑む人も。自分のペースでどうぞ。`,
        go: [["gate", "パック開放戦へ"]] }] : []),
      { t: "超級に挑む", done: false,
        b: ex ? `第2弾を全部開放したので、CPU戦に<b>超級</b>が出ています。第2弾のカードを使いこなす強敵です。勝てるように、デッキをさらに鍛えましょう。超級に勝つと、まれに<b>冥府の剣鬼 黄泉丸</b>が現れます。倒すと冥府の<b>限定レジェンド</b>が手に入ります。`
          : `第2弾のパックを<b>すべて開放すると</b>、CPU戦に<b>超級</b>が現れます。第2弾のカードを使いこなす強敵です。超級に勝つと、まれに<b>冥府の剣鬼 黄泉丸</b>が現れます。倒すと冥府の<b>限定レジェンド</b>が手に入ります。`,
        go: ex ? [["cpu", "CPU戦へ"]] : [] }
    ];
  },
  guideHTML() {
    const st = this.guideSteps(), cur = st.findIndex(x => !x.done);
    return `<p class="hint">このゲームの進め方の一例です。自分のペースで遊んでください。</p>
      <ol class="guide">${st.map((x, i) => `<li class="g-step ${x.done ? "done" : i === cur ? "now" : ""}">
        <span class="g-no" aria-hidden="true">${x.done ? "✓" : i + 1}</span>
        <div class="g-body"><b>${esc(x.t)}${x.done ? `<small>クリア</small>` : i === cur ? `<small>いまここ</small>` : ""}</b>
          <p>${x.b}</p>
          ${x.go.length ? `<div class="g-go">${x.go.map(([a, l]) => `<button type="button" class="btn sm" data-act="${a}">${l}</button>`).join("")}</div>` : ""}</div>
      </li>`).join("")}</ol>`;
  },

  show(tab) {
    if (!this.ok() || !Account.data) { toast("アカウントを読み込めていないため、クエストは使えません"); return; }
    if (tab) this.tab = tab;
    else if (!this.guideSeen()) this.tab = "guide";   // はじめて開いた人には、まず進め方
    if (this.tab === "guide") { try { localStorage.setItem("kyokai-guide", "1"); } catch (e) {} }
    const q = this.st(), L = this.limited(), B = this.showBeginner();
    if (this.tab === "limited" && !L.length) this.tab = "daily";
    if (this.tab === "beginner" && !B) this.tab = "daily";
    const tabs = [["guide", "進め方"], ["daily", "デイリー"], ...(L.length ? [["limited", "期間限定"]] : []), ...(B ? [["beginner", "初心者歓迎"]] : [])];
    const badge = k => { if (k === "guide") return ""; const list = k === "daily" ? [["d", this.daily()]] : k === "limited" ? [["l", L]] : [["b", this.begin()]];
      let n = 0; list.forEach(([kk, LL]) => LL.forEach(x => { if (this.done(kk, x) && !this.got(kk, x)) n++; })); if (k === "beginner" && this.beginnerDone()) n++; return n ? `<span class="navbadge">${n}</span>` : ""; };
    let body = "";
    if (this.tab === "guide") body = this.guideHTML();
    else if (this.tab === "daily") body = `<p class="hint">毎日3つ、新しいクエストが届きます（日付が変わると入れ替わります。受け取っていない報酬も消えます）。</p><ul class="qlist">${this.daily().map(x => this.rowHTML("d", x)).join("")}</ul>`;
    else if (this.tab === "limited") body = `<p class="hint">期間中だけのクエストです。</p><ul class="qlist">${L.map(x => this.rowHTML("l", x)).join("")}</ul>`;
    else {
      const all = this.beginnerDone(), gifts = this.gifts();
      body = `<p class="hint">はじめての人へ。全部クリアすると、3つの世界のデッキから好きな1つ（レジェンド入り・30枚）がもらえます。</p>
        <ul class="qlist">${this.begin().map(x => this.rowHTML("b", x)).join("")}</ul>
        <div class="q-gift ${all ? "ready" : ""}">
          <h3>全部クリアの贈り物：デッキを1つ選ぶ</h3>
          <div class="q-gifts">${gifts.map(d => `<button type="button" class="q-gd ${this.giftPick === d.id ? "sel" : ""}" data-act="questGiftPick" data-id="${esc(d.id)}" ${all ? "" : "disabled"} aria-pressed="${this.giftPick === d.id}">
            ${d.key && DEF[d.key] ? cardHTML(DEF[d.key], { static: true }) : ""}<b>${esc(d.name)}</b><small>${WORLDS[deckWorld(d)] || ""}・${deckCount(d)}枚</small></button>`).join("")}</div>
          ${all ? (this.giftPick ? `<div class="q-giftlist">${Decks.sorted(gifts.find(d => d.id === this.giftPick).cards).map(({ c, n }) => c ? `<span class="r-${c.rarity}">${c.cost} ${esc(c.name)}×${n}</span>` : "").join("")}</div>
            <button type="button" class="btn primary" data-act="questGift" data-id="${esc(this.giftPick)}">「${esc(gifts.find(d => d.id === this.giftPick).name)}」に決める</button>` : `<p class="hint">押すと中身が見られます。決めたら変えられません。</p>`)
            : `<p class="hint">あと${this.begin().filter(x => !this.got("b", x)).length}つ（報酬を受け取るとクリア）</p>`}
        </div>`;
    }
    openOverlay(`<div class="panel qpanel">
      <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>クエスト掲示板</b>${goldTag(Account.gold)}</div>
      <div class="qtabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-act="questTab" data-v="${k}" aria-selected="${this.tab === k}">${l}${badge(k)}</button>`).join("")}</div>
      ${body}
    </div>`, "start", true);
  },

  handleAct(act, el) {
    switch (act) {
      case "quests": this.show(); return true;
      case "questTab": this.show(el.dataset.v); return true;
      case "questClaim": this.claim(el.dataset.k, el.dataset.id); return true;
      case "questGiftPick": this.giftPick = el.dataset.id; this.show(); return true;
      case "questGift": this.takeGift(el.dataset.id); return true;
    }
    return false;
  }
};
