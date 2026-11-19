/* ===== アリーナ（β）：決まった時間だけ開く、ランダム対戦 =====
   ・開く時間：工房の arena（曜日ごとのルール・開く時刻・特別に開く日時）。時刻は日本時間
   ・「相手を探す」で arena/q/<回のID>/<uid> に並ぶ。uid の小さい人が、大きい人を「部屋の合言葉」を書いて呼ぶ
     （同時に呼び合わないように、呼ぶ側は自分の欄に lock を立ててから呼ぶ）
   ・対戦は友達対戦の部屋（rooms）をそのまま使う。部屋に arena＝回のID を書いておき、終わったら点を記録
   ・点：勝ち3・負け1（引き分け1）。arena/r/<回のID>/<uid> = { name, pts, w, l, d }
   ・報酬：参加賞と1〜3位（ARENA.rewards。回が終わって1時間後に受け取れる）。運営アカウントは、いつでも「テスト」の回に入れる */
let ARENA = { on: 1, start: "21:00", end: "22:00", days: ARENA_DAYS_DEF.slice(), extra: [] };
const ARENA_RULES = {
  std:  { name: "通常戦",     desc: "いつものデッキで戦います。" },
  sen:  { name: "選定戦",     desc: "カードを取り合って、その場でデッキを作ります。" },
  set1: { name: "第1弾限定",  desc: "第1弾のカードだけで組んだデッキで戦います。" }
};
const ARENA_MIN_TURNS = 6;       // これより短く降参・接続切れで決着した対戦は点にしない（お互い3ターン）
const ARENA_VS_MAX = 2;          // 1回の開催で、同じ相手から点をもらえる対戦の数
const ARENA_REMATCH_WAIT = 20;   // 直前の相手と続けて組むまでに待つ秒数（ほかに誰もいないとき）
const ARENA_PTS = { win: 3, lose: 1, draw: 1 };
const ARENA_DOOR_ART = "ui/arena-door.webp";   // 扉の絵（左右に分けて開く。空なら CSS で描いた仮の扉）
const JST = 9 * 3600e3;
const Arena = {
  searching: false, unsubs: [], timer: null, sid: null, rule: null, deck: null,
  /* 日本時間の「日付」と「時刻」から、その時刻（ミリ秒） */
  at(date, hm) { const [y, m, d] = date.split("-").map(Number), [h, mi] = hm.split(":").map(Number); return Date.UTC(y, m - 1, d, h, mi) - JST; },
  ymd(ms) { const t = new Date(ms + JST); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`; },
  /* 今日の前後の回の一覧（開始の早い順） */
  sessions(now = Date.now(), days = 7, from = -1, all = false) {
    const A = ARENA, L = [];
    if (!A.on) return L;
    for (let i = from; i <= days; i++) {
      const ms = now + i * 86400e3, date = this.ymd(ms), dow = new Date(ms + JST).getUTCDay(), rule = A.days[dow];
      if (rule) { const s = this.at(date, A.start); let e = this.at(date, A.end); if (e <= s) e += 86400e3; L.push({ sid: `${date.replace(/-/g, "")}-${A.start.replace(":", "")}`, start: s, end: e, rule }); }
    }
    A.extra.forEach(x => { const s = this.at(x.date, x.start); let e = this.at(x.date, x.end); if (e <= s) e += 86400e3; L.push({ sid: `${x.date.replace(/-/g, "")}-${x.start.replace(":", "")}x`, start: s, end: e, rule: x.rule, extra: true }); });
    return all ? L.sort((a, b) => a.start - b.start) : L.filter(x => x.end > now - 3600e3).sort((a, b) => a.start - b.start);
  },
  current(now = Date.now()) {
    const c = this.sessions(now).find(x => x.start <= now && now < x.end);
    if (c) return c;
    if ((typeof adminOn === "function" && adminOn()) || (typeof Maint !== "undefined" && Maint.pass())) return { sid: "test-" + this.ymd(now).replace(/-/g, ""), start: now, end: now + 3600e3, rule: this.testRule || "std", test: true };   // 運営のテスト
    return null;
  },
  /* 終わった回（新しい順。過去14日・最大8回） */
  past(now = Date.now()) { return this.sessions(now, 0, -14, true).filter(x => x.end <= now && x.start >= this.at("2026-11-18", "00:00")).sort((a, b) => b.start - a.start).slice(0, 8); },
  /* 一般の回が開いているか（運営のテストは含まない）。開いている間、ホームの飾り棚が「アリーナの扉」になる */
  live(now = Date.now()) { return !!this.sessions(now).find(x => x.start <= now && now < x.end); },
  doorHTML() {
    const c = this.sessions().find(x => x.start <= Date.now() && Date.now() < x.end);
    const art = ARENA_DOOR_ART;
    return `<div class="ar-door${art ? " art" : ""}" id="ar-door">
      <button type="button" class="ar-gate" data-act="arenaDoor" aria-label="アリーナの扉を開く（${ARENA_RULES[c.rule].name}・${this.hm(c.end)}まで）">
        <span class="ar-glow" aria-hidden="true"></span>
        <span class="ar-leaf l" aria-hidden="true"${art ? ` style="background-image:url('${art}')"` : ""}><i class="ar-edge"></i></span>
        <span class="ar-leaf r" aria-hidden="true"${art ? ` style="background-image:url('${art}')"` : ""}><i class="ar-edge"></i></span>
        ${art ? `<span class="ar-frame" aria-hidden="true"></span>` : ""}
        <span class="ar-side l" aria-hidden="true"><i></i></span><span class="ar-side r" aria-hidden="true"><i></i></span>
      </button>
      <div class="ar-plate"><b>アリーナ開催中</b><span>${ARENA_RULES[c.rule].name} ・ ${this.hm(c.end)}まで</span><small>扉をタップ</small></div>
    </div>`;
  },
  /* 扉を開く：きしむ音とともに左右の扉がゆっくり開き、光の中へ入ってアリーナの画面へ */
  openDoor() {
    const d = document.getElementById("ar-door"); if (!d || d.classList.contains("opening")) return this.show();
    d.classList.add("opening");
    if (typeof Sound !== "undefined") Sound.play("creak");
    const slow = !(typeof Motion !== "undefined" && Motion.reduced);
    setTimeout(() => { const f = document.createElement("div"); f.className = "ar-flash"; document.body.appendChild(f); setTimeout(() => { this.show(); setTimeout(() => f.classList.add("out"), 30); setTimeout(() => f.remove(), 700); }, slow ? 420 : 0); }, slow ? 2000 : 0);
  },
  next(now = Date.now()) { return this.sessions(now).find(x => x.start > now) || null; },
  hm(ms) { const t = new Date(ms + JST); return `${t.getUTCHours()}:${String(t.getUTCMinutes()).padStart(2, "0")}`; },
  dayLabel(ms) { const t = new Date(ms + JST); const today = this.ymd(Date.now()) === this.ymd(ms), tmr = this.ymd(Date.now() + 86400e3) === this.ymd(ms); return today ? "今日" : tmr ? "明日" : `${t.getUTCMonth() + 1}/${t.getUTCDate()}（${"日月火水木金土"[t.getUTCDay()]}）`; },
  /* ロビー（友達と対戦）に出す案内 */
  lobbyHTML() {
    if (!ARENA.on) return "";
    const c = this.current(), n = this.next();
    const live = c && !c.test;
    const line = live ? `${ARENA_RULES[c.rule].name}・${this.hm(c.end)}まで` : n ? `次は ${this.dayLabel(n.start)} ${this.hm(n.start)}〜・${ARENA_RULES[n.rule].name}` : "開催の予定はありません";
    return `<button type="button" class="hub-hero ar-hero ${live ? "live" : ""}" data-act="arenaOpen">
      <span class="hub-hero-art" aria-hidden="true"></span>
      <span class="hub-hero-txt"><b>アリーナ <i class="beta-tag">β</i></b><small>決まった時間のランダム対戦</small><em>${live ? `<i class="ar-live">開催中</i>` : ""}${line}</em></span>
      <span class="lvl-go" aria-hidden="true">›</span></button>`;
  },
  show(msg) {
    const now = Date.now(), c = this.current(now), up = this.sessions(now).filter(x => x.end > now).slice(0, 8);
    const rule = c ? ARENA_RULES[c.rule] : null;
    openOverlay(`<div class="panel ar">
      <h2 class="title sm">アリーナ <i class="beta-tag">β版</i></h2>
      ${c ? `<div class="ar-now"><b>${c.test ? "テスト（運営・メンテ通過の端末のみ）" : "開催中"}</b><span>${rule.name}</span><small>${c.test ? "いつでも入れます" : `${this.hm(c.end)}まで`}</small></div>
        <p class="lead small">${rule.desc}勝ち${ARENA_PTS.win}点・負け${ARENA_PTS.lose}点（同じ相手は${ARENA_VS_MAX}戦まで・すぐ降参した対戦は0点）。</p>
        ${c.test ? `<div class="ar-test">テストのルール：${Object.entries(ARENA_RULES).map(([k, r]) => `<button type="button" class="btn sm ${c.rule === k ? "primary" : ""}" data-act="arenaTestRule" data-v="${k}">${r.name}</button>`).join("")}</div>` : ""}
        ${this.searching ? `<div class="ar-search"><b>相手を探しています<span class="pg-dots"><i></i><i></i><i></i></span></b><small id="ar-wait"></small><button type="button" class="btn" data-act="arenaStop">探すのをやめる</button></div>`
          : `<button type="button" class="btn primary ar-go" data-act="arenaSearch">相手を探す</button>`}
        ${this.rewardLine()}
        <span class="gl">ランキング（この回）</span><div id="ar-rank" class="ar-rank"><p class="hint">読み込み中…</p></div>`
        : `<p class="lead">いまは開いていません。</p>`}
      ${this.pastHTML()}
      <span class="gl">開催の予定（日本時間）</span>
      <ul class="ar-list">${up.map(x => `<li class="${c && c.sid === x.sid ? "on" : ""}"><span>${this.dayLabel(x.start)} ${this.hm(x.start)}〜${this.hm(x.end)}</span><b>${ARENA_RULES[x.rule].name}</b></li>`).join("") || `<li><span>予定はありません</span></li>`}</ul>
      <p class="onl-msg" role="status">${msg ? esc(msg) : ""}</p>
      <button type="button" class="btn" data-act="arenaClose">戻る</button>
    </div>`, "lobby", true);
    if (c) this.watchRank(c.sid);
    this.loadPast();
    if (this.searching) this.paintWait();
  },
  /* これまでの結果：回を選ぶと、その回のランキングを読み込む */
  pastHTML() {
    const P = this.past(); if (!P.length) return "";
    if (!this.pastSid || !P.find(x => x.sid === this.pastSid)) this.pastSid = P[0].sid;
    return `<span class="gl">これまでの結果</span>
      <div class="ar-past">${P.map(x => `<button type="button" class="btn sm ${x.sid === this.pastSid ? "primary" : ""}" data-act="arenaPast" data-v="${x.sid}">${this.dayLabel(x.start)} ${this.hm(x.start)}<small>${ARENA_RULES[x.rule].name}</small></button>`).join("")}</div>
      <div id="ar-past-rank" class="ar-rank"><p class="hint">読み込み中…</p></div>`;
  },
  async loadPast() {
    const sid = this.pastSid; if (!sid) return;
    let v = null;
    try { this.uid = await Net.init(); v = await Net.get(`arena/r/${sid}`); } catch (e) { return this.paintRank(null, true, "ar-past-rank"); }
    if (sid === this.pastSid) this.paintRank(v, false, "ar-past-rank", "誰も対戦しませんでした。");
  },
  watchRank(sid) {
    if (this.rankSid === sid && this.rankOff) { this.paintRank(this.rankV); return; }
    if (this.rankOff) { try { this.rankOff(); } catch (e) {} }
    this.rankSid = sid;
    Net.init().then(uid => { this.uid = uid; this.rankOff = Net.on(`arena/r/${sid}`, v => { this.rankV = v; this.paintRank(v); }); }).catch(() => this.paintRank(null, true));
  },
  paintRank(v, err, id = "ar-rank", none = "まだ誰も戦っていません。") {
    const el = document.getElementById(id); if (!el) return;
    if (err) { el.innerHTML = `<p class="hint">ランキングを読み込めませんでした。</p>`; return; }
    const L = Object.entries(v || {}).map(([u, x]) => ({ u, ...x })).sort((a, b) => (b.pts || 0) - (a.pts || 0) || (b.w || 0) - (a.w || 0)).slice(0, 20);
    el.innerHTML = L.length ? `<ol>${L.map((x, i) => `<li class="${x.u === this.uid ? "me" : ""}"><i>${i + 1}</i><b>${esc(x.name || "召喚士")}</b><span>${x.pts || 0}点</span><small>${x.w || 0}勝${x.l || 0}敗${x.d ? `${x.d}分` : ""}</small></li>`).join("")}</ol>` : `<p class="hint">${none}</p>`;
  },
  /* ルールに合うデッキ（選定戦はその場で作るので、メタ情報だけ） */
  deckFor(rule, fail) {
    if (rule === "sen") return Online.senMeta();
    const d = Decks.readyDeck(fail); if (!d) return null;
    if (rule === "set1" && !deckSet1(d)) { fail(`第1弾限定の回です。デッキ「${d.name}」に第1弾以外のカードが入っています。第1弾のカードだけのデッキを選んでください。`); return null; }
    return d;
  },
  async search() {
    const c = this.current(); if (!c) return this.show("いまは開いていません。");
    if (!Account.data || ["free", "none"].includes(Account.status)) return this.show("アカウントが必要です。");
    let why = ""; const deck = this.deckFor(c.rule, m => { why = m; }); if (!deck) return this.show(why);
    let uid; try { uid = await Net.init(); } catch (e) { return this.show("サーバーに接続できませんでした。"); }
    this.stop(true);
    Object.assign(this, { searching: true, sid: c.sid, rule: c.rule, deck, uid, since: Date.now() });
    const me = `arena/q/${c.sid}/${uid}`;
    try {
      await Net.set(me, { at: Date.now(), t0: Date.now(), name: playerName("召喚士"), ...(this.last && this.last.sid === c.sid ? { last: this.last.uid } : {}) });
      Net.onDisconnectRemove(me);
    } catch (e) { console.error(e); this.searching = false; return this.show("アリーナに入れませんでした（サーバーの設定がまだかもしれません）。"); }
    this.unsubs.push(Net.on(me, v => { if (v && v.room && this.searching) this.matched(v.room, false); }));
    this.unsubs.push(Net.on(`arena/q/${c.sid}`, v => { this.queue = v || {}; this.paintWait(); }));   // 並んでいる人（見張っておくと、手元の値がいつも新しい）
    this.timer = setInterval(() => this.tick(), 2500 + Math.random() * 800);
    this.show();
    this.tick();
  },
  paintWait() {
    const el = document.getElementById("ar-wait"); if (!el) return;
    const n = Object.entries(this.queue || {}).filter(([u, x]) => u !== this.uid && x && !x.room && Date.now() - (x.at || 0) < 60000).length;
    el.textContent = `${Math.floor((Date.now() - this.since) / 1000)}秒 ・ ほかに探している人：${n}人`;
  },
  async tick() {
    if (!this.searching || this.claiming) return;
    this.paintWait();
    const c = this.current();
    if (!c || c.sid !== this.sid) { this.stop(); return this.show("時間になったので、アリーナは閉じました。"); }
    const me = `arena/q/${this.sid}/${this.uid}`;
    if (Date.now() - (this.beat || 0) > 20000) { this.beat = Date.now(); Net.tx(me, cur => cur === null ? null : !cur.room ? { ...cur, at: Date.now() } : undefined).catch(() => {}); }   // まだ並んでいる印（消えた欄を作り直さない）
    const q = this.queue || {};
    if (!this.searching) return;
    const now = Date.now();
    // 直前に戦った相手とは、どちらかが REMATCH_WAIT 秒以上待つまで組まない（人が少ないので、完全には禁止しない）
    const lastMe = this.last && this.last.sid === this.sid ? this.last.uid : null;
    const fresh = (u, x) => !(u === lastMe || x.last === this.uid) || (now - this.since > ARENA_REMATCH_WAIT * 1000 && now - (x.t0 || x.at || now) > ARENA_REMATCH_WAIT * 1000);
    const cands = Object.entries(q || {}).filter(([u, x]) => u > this.uid && x && !x.room && !(x.lock && now - x.lock < 8000) && now - (x.at || 0) < 60000 && fresh(u, x)).sort((a, b) => a[1].at - b[1].at);
    if (!cands.length || !this.searching) return;
    this.claiming = true;
    try {
      const lk = await Net.tx(me, cur => cur === null ? null : !cur.room ? { ...cur, lock: Date.now() } : undefined);   // 自分が呼ばれている途中なら、呼びに行かない
      if (!lk.committed || !lk.val || !lk.val.lock || lk.val.room) return;
      let code = null;
      for (let i = 0; i < 6 && !code; i++) { const k = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(""); if (!(await Net.get(`rooms/${k}/host`))) code = k; }
      if (code) for (const [u] of cands) {
        let r = null;
        try { r = await Net.tx(`arena/q/${this.sid}/${u}`, cur => cur === null ? null : !cur.room && !(cur.lock && Date.now() - cur.lock < 8000) ? { ...cur, room: code, by: this.uid } : undefined); } catch (e) { continue; }
        if (r && r.committed && r.val && r.val.room === code) return this.matched(code, true);
      }
      await Net.tx(me, cur => cur === null ? null : !cur.room ? { ...cur, lock: null } : undefined);
    } catch (e) { console.error(e); }
    finally { this.claiming = false; }
  },
  matched(code, host) {
    const sid = this.sid, rule = this.rule, deck = this.deck, me = `arena/q/${sid}/${this.uid}`;
    this.stop();
    Net.remove(me).catch(() => {}); setTimeout(() => Net.remove(me).catch(() => {}), 3000);   // 並んでいた欄を消す（途中の書き込みと重なっても残らないように、少しあとにもう一度）
    MODE = "online";
    if (host) Online.create({ arena: sid, rule, deck, code });
    else Online.join(code, { arena: true, deck });
  },
  stop(quiet) {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.unsubs.forEach(f => { try { f(); } catch (e) {} }); this.unsubs = [];
    if (this.searching && this.uid && this.sid) Net.remove(`arena/q/${this.sid}/${this.uid}`).catch(() => {});
    this.searching = false; this.claiming = false;
  },
  /* 対戦が終わった：点を記録する（1つの対戦で1回だけ） */
  /* 終わった回の報酬を受け取る。回が終わってから1時間たってから（終わる前に始めた対戦の結果を待つ）。
     点が入った対戦が1戦以上で参加賞、さらに順位（点→勝ち数。同点は同じ順位）で rank の報酬 */
  async claim() {
    if (this.claimingR || !Account.data || ["free", "none"].includes(Account.status) || !ARENA.on) return;
    if (Date.now() - (this.claimAt || 0) < 5 * 60e3) return;
    this.claimAt = Date.now(); this.claimingR = true;
    try {
      const RW = ARENA.rewards, since = this.at(RW.since, "00:00"), got = Account.data.arenaGot || [];
      const todo = this.past().filter(x => x.start >= since && x.end + 3600e3 <= Date.now() && !got.includes(x.sid));
      if (!todo.length) return;
      const uid = await Net.init(), out = [];
      for (const x of todo) {
        const v = await Net.get(`arena/r/${x.sid}`), me = v && v[uid];
        const done = (Account.data.arenaGot || []).concat(x.sid).slice(-40);
        if (!me || !(me.pts > 0)) { Account.data.arenaGot = done; continue; }
        const L = Object.values(v).filter(y => y && y.pts > 0);
        const rank = 1 + L.filter(y => y.pts > me.pts || (y.pts === me.pts && (y.w || 0) > (me.w || 0))).length;
        const r = RW.rank[rank - 1], add = { gold: RW.part.gold + (r ? r.gold : 0), stones: RW.part.stones + (r ? r.stones : 0), tickets: RW.part.tickets + (r ? r.tickets : 0) };
        const d = Account.data; d.gold = (d.gold || 0) + add.gold; d.stones = (d.stones || 0) + add.stones; d.tickets = (d.tickets || 0) + add.tickets; d.arenaGot = done;
        out.push({ x, rank, n: L.length, add, top: !!r });
      }
      Account.saveNow();
      if (out.length) this.rewardPop(out);
    } catch (e) { console.error(e); this.claimAt = 0; }
    finally { this.claimingR = false; }
  },
  /* ホーム画面を見ているか（ホームも overlay の中に描かれるので、ホームのボタンがあるかで見る） */
  rewardLine() {
    const R = ARENA.rewards, it = a => [a.gold ? `${a.gold}G` : "", a.stones ? `魔石${a.stones}` : "", a.tickets ? `券${a.tickets}` : ""].filter(Boolean).join("＋");
    const parts = [it(R.part) ? `参加 ${it(R.part)}` : "", ...R.rank.map((r, i) => it(r) ? `${i + 1}位 ${it(r)}` : "")].filter(Boolean);
    return parts.length ? `<p class="ar-rwline"><b>報酬</b>${parts.join("　")}<small>回が終わった1時間後に、ホームで受け取れます</small></p>` : "";
  },
  onHome() { const ov = document.getElementById("overlay"); return !!(ov && !ov.hidden && ov.querySelector('[data-act="solo"]')); },
  rewardPop(out) {
    if (!Arena.onHome()) { setTimeout(() => this.rewardPop(out), 4000); return; }   // ホームにいるときに出す
    const items = a => [a.gold ? `${a.gold.toLocaleString()}G` : "", a.stones ? `魔石${a.stones}` : "", a.tickets ? `パック券${a.tickets}枚` : ""].filter(Boolean).join("・");
    openOverlay(`<div class="panel ar-rw">
      <h2 class="title sm">アリーナの報酬</h2>
      ${out.map(o => `<div class="ar-rw-row ${o.top && o.rank <= 3 ? `r${o.rank}` : ""}"><span>${this.dayLabel(o.x.start)} ${this.hm(o.x.start)}<small>${ARENA_RULES[o.x.rule].name}</small></span><b>${o.rank}位<small>/${o.n}人</small></b><em>${items(o.add)}</em></div>`).join("")}
      <button type="button" class="btn primary" data-act="back">受け取る</button>
    </div>`, "start");
    if (typeof Sound !== "undefined" && Sound.play) try { Sound.play("win"); } catch (e) {}
  },
  /* 対戦の結果を記録する。点にならない対戦（すぐ決着・同じ相手と3戦目以降）も、記録（g）には残す */
  record(res) {
    const R = Online.room; if (!R || !R.arena || !S || this.recorded === S.gid) return null;
    this.recorded = S.gid;
    const vs = Online.oppUid(), turns = S.turnNo || 0, name = playerName("召喚士");
    this.last = { sid: R.arena, uid: vs };
    const short = turns < ARENA_MIN_TURNS && !!S.endBy;   // お互い3ターンやる前に、降参・接続切れで決着
    const out = { add: 0, short, capped: false };
    const prevVs = this.rv && this.rv.sid === R.arena ? (this.rv.vs[vs] || 0) : 0;
    if (!short && prevVs >= ARENA_VS_MAX) out.capped = true;
    if (!short && !out.capped) out.add = ARENA_PTS[res] || 0;
    Net.init().then(uid => Net.tx(`arena/r/${R.arena}/${uid}`, cur => {
      const x = cur || {}, cnt = x.vs ? (x.vs[vs] || 0) : 0;
      const ok = !short && cnt < ARENA_VS_MAX, add = ok ? ARENA_PTS[res] || 0 : 0;
      const g = Array.isArray(x.g) ? x.g.slice(-40) : [];
      g.push({ vs: vs || "", at: Date.now(), t: turns, res, pts: add, ...(S.endBy ? { why: String(S.endBy).slice(0, 20) } : {}) });
      return { name, pts: (x.pts || 0) + add, w: (x.w || 0) + (ok && res === "win" ? 1 : 0), l: (x.l || 0) + (ok && res === "lose" ? 1 : 0), d: (x.d || 0) + (ok && res === "draw" ? 1 : 0),
        vs: { ...(x.vs || {}), ...(ok && vs ? { [vs]: cnt + 1 } : {}) }, g };
    }).then(r => { if (r && r.val) this.rv = { sid: R.arena, vs: r.val.vs || {} }; })).catch(e => console.error(e));
    if (!out.short && !out.capped) { this.rv = this.rv && this.rv.sid === R.arena ? this.rv : { sid: R.arena, vs: {} }; this.rv.vs[vs] = prevVs + 1; }
    return out;
  },
  handleAct(act, el) {
    switch (act) {
      case "arenaOpen": case "arenaBack": if (act === "arenaBack") { Online.leave(); MODE = "cpu"; S = null; app.innerHTML = ""; } this.show(); return true;
      case "arenaSearch": this.search(); return true;
      case "arenaDoor": this.openDoor(); return true;
      case "arenaStop": this.stop(); this.show(); return true;
      case "arenaClose": this.stop(); if (this.rankOff) { try { this.rankOff(); } catch (e) {} this.rankOff = null; this.rankSid = null; } Online.showLobby(); return true;
      case "arenaPast":
        this.pastSid = el.dataset.v;
        document.querySelectorAll('[data-act="arenaPast"]').forEach(b => b.classList.toggle("primary", b === el));
        { const r = document.getElementById("ar-past-rank"); if (r) r.innerHTML = `<p class="hint">読み込み中…</p>`; }
        this.loadPast(); return true;
      case "arenaTestRule": this.testRule = el.dataset.v; this.stop(); this.show(); return true;
      case "arenaNext": Online.leave(); MODE = "cpu"; S = null; app.innerHTML = ""; this.search(); return true;
    }
    return false;
  }
};

/* ホームを開いたままでも、開催の始まり・終わりで扉と飾り棚を入れ替える（30秒ごとに確かめる） */
setInterval(() => {
  try {
    if (typeof ARENA === "undefined" || !ARENA.on || S || (typeof DATA_INFO !== "undefined" && DATA_INFO.draft)) return;
    if (!Arena.onHome()) return;
    const door = document.getElementById("ar-door"), sc = document.getElementById("showcase");
    if (door && door.classList.contains("opening")) return;
    const live = Arena.live();
    if ((door && !live) || (sc && live)) showStart();
  } catch (e) { console.error(e); }
}, 30000);
