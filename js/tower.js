/* =========================================================
   境界の塔（β・2026-11-24）：1人で遊ぶ。30階を1階ずつ CPU と戦って登る
   ・毎週月曜 0時（日本時間）に1階からやり直し。各階の相手と「試練」（不利な条件）は、週の番号から自動で決まる
     → 毎週の作業はいらない。調整したくなったら TOWER_MODS（試練の一覧）と TOWER_TIERS（階ごとの強さ）を変えるだけ
   ・使うのは自分のデッキ（階ごとに替えてよい）。負けても同じ階に何度でも挑める
   ・その週に何階まで登ったかを tower/<週>/<uid> に置き、友達の順位を出す
   ・β版のあいだは報酬なし（報酬の案は docs/tower-ghost.md）
   ========================================================= */
const TOWER_FLOORS = 30;
/* 試練：相手が有利になる条件。min＝この階から出る。setup は対戦を作った直後に呼ぶ（S.players[1] が相手） */
const TOWER_MODS = [
  { id: "hp5", name: "堅牢", desc: "相手の体力+5", min: 3, setup: S => { const b = S.players[1]; b.hp += 5; b.maxHp = b.hp; } },
  { id: "hp10", name: "鉄壁", desc: "相手の体力+10", min: 16, no: ["hp5"], setup: S => { const b = S.players[1]; b.hp += 10; b.maxHp = b.hp; } },
  { id: "mana", name: "先手の魔力", desc: "相手は最初のターンからエナジー+1", min: 6, setup: S => { S.players[1].maxE = 1; } },
  { id: "wound", name: "手負い", desc: "あなたの体力-5", min: 8, setup: S => { const p = S.players[0]; p.hp = Math.max(1, p.hp - 5); } },
  { id: "gate", name: "天門の番兵", desc: "相手の場に最初から「天門の番兵」（攻撃5・体力3）", min: 5, unit: ["tk-gate"] },
  { id: "spirit", name: "精霊の群れ", desc: "相手の場に最初から「小さな精霊」2体", min: 3, unit: ["tk-spirit", "tk-spirit"] },
  { id: "drone", name: "量産ライン", desc: "相手の場に最初から「量産型ドローン」2体", min: 4, unit: ["tk-drone", "tk-drone"] },
  { id: "wyrm", name: "竜の巣", desc: "相手の場に最初から「子竜」", min: 7, unit: ["tk-wyrmling"] },
  { id: "angel", name: "天使の守り", desc: "相手の場に最初から「天使の羽兵」2体（守護）", min: 10, unit: ["tk-angel", "tk-angel"] }
];
/* 階ごとの相手の強さ（CPU の考え方・使うデッキの種類）と試練の数 */
const TOWER_TIERS = [
  { to: 4, level: "normal", pool: "normal", mods: 0 },
  { to: 9, level: "normal", pool: "normal", mods: 1 },
  { to: 10, level: "hard", pool: "gate", mods: 1, guard: true },
  { to: 16, level: "hard", pool: "hard", mods: 1 },
  { to: 19, level: "hard", pool: "hard", mods: 2 },
  { to: 20, level: "hard", pool: "boss-nezal", mods: 1, guard: true, hp: 25 },
  { to: 26, level: "ex", pool: "ex", mods: 2 },
  { to: 29, level: "ex", pool: "ex", mods: 3 },
  { to: 30, level: "ex", pool: "boss-yomi", mods: 2, guard: true, hp: 30 }
];

const Tower = {
  rankOff: null, rank: null,
  beta() { return true; },
  /* 週：月曜 0時（日本時間）からの1週間。キーは月曜の日付 YYYYMMDD */
  week(now = Date.now()) {
    const JST = 9 * 3600e3, t = new Date(now + JST), dow = (t.getUTCDay() + 6) % 7;   // 月=0
    const mon = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - dow));
    return `${mon.getUTCFullYear()}${String(mon.getUTCMonth() + 1).padStart(2, "0")}${String(mon.getUTCDate()).padStart(2, "0")}`;
  },
  weekEnd(now = Date.now()) { const w = this.week(now); return Date.UTC(+w.slice(0, 4), +w.slice(4, 6) - 1, +w.slice(6, 8) + 7) - 9 * 3600e3; },
  /* 週と階から決まる乱数（同じ週なら誰がいつ見ても同じ塔） */
  rng(seed) { let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
  tier(f) { return TOWER_TIERS.find(t => f <= t.to) || TOWER_TIERS[TOWER_TIERS.length - 1]; },
  /* その週の f 階：{ f, level, deck, mods, guard, hp } */
  floor(f, wk = this.week()) {
    const T = this.tier(f), r = this.rng(`${wk}-${f}`);
    let pool = PRESETS.filter(p => p.level === T.pool || p.id === T.pool);
    if (!pool.length) pool = PRESETS.filter(p => p.level === T.level);
    const deck = pool.length ? pool[Math.floor(r() * pool.length)] : null;
    const cand = TOWER_MODS.filter(m => f >= m.min).filter(m => !(m.unit && m.unit.some(id => !DEF[id])));
    const mods = [];
    for (let k = 0; k < T.mods && cand.length; k++) {
      const ok = cand.filter(m => !mods.includes(m) && !mods.some(x => (x.no || []).includes(m.id) || (m.no || []).includes(x.id)) && !(m.unit && mods.some(x => x.unit)));   // 場に出す試練は1つまで
      if (!ok.length) break;
      mods.push(ok[Math.floor(r() * ok.length)]);
    }
    return { f, level: T.level, deck, mods, guard: !!T.guard, hp: T.hp || 0 };
  },
  /* このアカウントの今週の記録 { wk, f：登りきった階, tries } */
  me() {
    const d = Account.data || {}, wk = this.week(), x = d.tower && d.tower.wk === wk ? d.tower : { wk, f: 0, tries: 0 };
    return x;
  },
  save(x) { Account.data.tower = { ...x, best: Math.max((Account.data.tower && Account.data.tower.best) || 0, x.f) }; },
  next() { return Math.min(TOWER_FLOORS, this.me().f + 1); },
  done() { return this.me().f >= TOWER_FLOORS; },

  /* ---------- 画面 ---------- */
  show(msg) {
    const x = this.me(), nf = this.next(), F = this.floor(nf), done = this.done();
    const left = Math.max(0, this.weekEnd() - Date.now()), dd = Math.floor(left / 86400e3), hh = Math.floor(left / 3600e3) % 24;
    const lvName = { normal: "中級", hard: "上級", ex: "超級" };
    const pips = Array.from({ length: TOWER_FLOORS }, (_, i) => { const f = TOWER_FLOORS - i, T = this.tier(f);
      return `<i class="tw-pip ${f <= x.f ? "clear" : f === nf && !done ? "now" : ""} ${T.guard && f === T.to ? "guard" : ""}" title="${f}階"></i>`; }).join("");
    openOverlay(`<div class="panel tw nv-on nv-fab nv-t-play nv-ret-solo">
      ${Decks.topbar(`境界の塔 <i class="beta-tag">β</i>`, "solo", helpBtn("境界の塔", `全${TOWER_FLOORS}階。1階ずつ CPU と戦って登ります。<br>上の階ほど相手が強くなり、「試練」（相手が有利になる条件）が付きます。10・20・30階は門番です。<br>負けても同じ階に何度でも挑めます。デッキは階ごとに替えられます。<br><b>毎週月曜0時に1階からやり直し</b>。相手と試練は毎週変わります。<br>β版のあいだは、報酬はありません。`))}
      ${msg ? `<p class="callout" role="status">${esc(msg)}</p>` : ""}
      <div class="tw-main">
        <div class="tw-tower" aria-label="今週の到達：${x.f}階">${pips}</div>
        <div class="tw-side">
          <p class="tw-week">今週の塔<small>やり直しまで あと${dd ? `${dd}日` : ""}${hh}時間</small></p>
          <p class="tw-reach"><b>${x.f}</b><small>/${TOWER_FLOORS}階</small></p>
          ${done ? `<div class="tw-card done"><b>今週の塔を登りきりました！</b><small>来週の月曜に、新しい塔が現れます。</small></div>`
            : `<div class="tw-card ${F.guard ? "guard" : ""}">
              <span class="tw-fl">${nf}階${F.guard ? `<em>門番</em>` : ""}</span>
              <b class="tw-opp">${esc(F.deck ? F.deck.name : "？")}</b>
              <small>相手：${lvName[F.level] || ""}の考え方${F.hp ? `・体力${F.hp}` : ""}</small>
              ${F.mods.length ? `<ul class="tw-mods">${F.mods.map(m => `<li><b>${esc(m.name)}</b>${esc(m.desc)}</li>`).join("")}</ul>` : `<p class="tw-nomod">試練なし</p>`}
            </div>
            <button type="button" class="btn primary tw-go" data-act="towerGo">${nf}階に挑む</button>`}
        </div>
      </div>
      <h3 class="sec">今週の順位</h3>
      <div id="tw-rank" class="tw-rank"><p class="hint">読み込み中…</p></div>
      <p class="hint">β版：報酬はありません。遊んでみた感想を「ご意見」から送ってください。</p>
    </div>`, "start", true);
    this.loadRank();
  },
  loadRank() {
    if (this.rankOff) { try { this.rankOff(); } catch (e) {} this.rankOff = null; }
    const wk = this.week();
    Net.init().then(uid => { this.uid = uid; this.rankOff = Net.on(`tower/${wk}`, v => { if (!document.getElementById("tw-rank")) { if (this.rankOff) { this.rankOff(); this.rankOff = null; } return; } this.rank = v || {}; this.paintRank(); }); })
      .catch(() => { const el = document.getElementById("tw-rank"); if (el) el.innerHTML = `<p class="hint">サーバーに接続できないので、順位は出せません。</p>`; });
  },
  paintRank() {
    const el = document.getElementById("tw-rank"); if (!el) return;
    const L = Object.entries(this.rank || {}).map(([u, x]) => ({ u, ...x })).filter(x => x && x.f > 0).sort((a, b) => b.f - a.f || (a.at || 0) - (b.at || 0)).slice(0, 20);
    el.innerHTML = L.length ? `<ol class="tw-rl">${L.map((x, i) => `<li class="${x.u === this.uid ? "me" : ""}"><span>${i + 1}</span><b>${esc(x.n || "？")}</b><em>${x.f}階</em></li>`).join("")}</ol>` : `<p class="hint">今週はまだ誰も登っていません。</p>`;
  },

  /* ---------- 対戦 ---------- */
  start() {
    if (this.done()) return this.show();
    const mine = Decks.readyDeck(m => Decks.showList(m)); if (!mine) return;
    if (mine.sample) { toast("サンプルデッキでは塔に挑めません"); return this.show(); }
    const F = this.floor(this.next());
    if (!F.deck) { toast("相手のデッキが見つかりません"); return this.show(); }
    const x = this.me(); x.tries = (x.tries || 0) + 1; this.save(x); Account.saveNow();
    const face = F.guard && F.f === 20 ? "b-nezal" : F.guard && F.f === 30 ? "b-yomimaru" : null;
    startBattle({ kind: "tower", level: F.level, mine, opp: { ...F.deck, ...(face && DEF[face] ? { icon: face } : {}) }, oppName: `${F.f}階　${F.deck.name}`, reward: 0, streak: false, extra: { floor: F.f, wk: this.week() },
      setup: S => {
        const b = S.players[1];
        if (F.hp) { b.hp = F.hp; b.maxHp = F.hp; }
        F.mods.forEach(m => { if (m.setup) m.setup(S); (m.unit || []).forEach(id => { if (DEF[id]) { const u = addUnit(1, id); u.ready = false; } }); });
        if (F.mods.length) log(`試練：${F.mods.map(m => m.name).join("・")}`);
      } });
  },
  /* 対戦が終わった（結果画面を出すときに1回） */
  onGame(res) {
    const B = S && S.battle; if (!B || B.kind !== "tower") return null;
    if (B.wk !== this.week()) return { old: true };   // 週をまたいだ対戦は数えない
    const x = this.me();
    if (res !== "win" || B.floor !== x.f + 1) return { floor: B.floor, lost: res !== "win" };
    x.f = B.floor; this.save(x);
    const name = playerName("召喚士").slice(0, 10), wk = x.wk, f = x.f;
    Net.init().then(uid => Net.set(`tower/${wk}/${uid}`, { n: name, f, at: Date.now() })).catch(() => {});
    return { floor: B.floor, clear: true, top: f >= TOWER_FLOORS };
  },
  handleAct(act) {
    switch (act) {
      case "tower": this.show(); return true;
      case "towerGo": this.start(); return true;
    }
    return false;
  }
};
