/* =========================================================
   分身戦（β・2026-11-24）：友達のデッキの「分身」（CPU が動かす）と、いつでも戦える
   ・自分のデッキを1つ「分身」として置く → ghost/<uid>（名前・デッキ・アイコン）
   ・友達の分身を選んで戦う（相手は上級の考え方）。結果は ghostLog/<分身の持ち主>/<自動> に残す
   ・今週（月曜0時から）の「倒した数」「守った数」を順位にする
   ・アリーナと違って、時間を合わせなくていい。人数が少なくても遊べる
   ・β版のあいだは報酬なし（報酬の案は docs/tower-ghost.md）
   ========================================================= */
const Ghost = {
  list: null, log: null, uid: null, off: [], pickDeck: null,
  myDecks() { return Decks.mine().filter(d => !Decks.problems(d).length); },

  show(msg) {
    const mine = this.list && this.uid ? this.list[this.uid] : null;
    const decks = this.myDecks(), sel = this.pickDeck || (mine && decks.find(d => d.name === mine.dk) ? decks.find(d => d.name === mine.dk).id : (Decks.selected() || decks[0] || {}).id);
    const others = Object.entries(this.list || {}).filter(([u, g]) => u !== this.uid && g && g.c).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    const since = Tower.weekEnd() - 7 * 86400e3;
    const st = this.stats(since);
    openOverlay(`<div class="panel gh nv-on nv-fab nv-t-play nv-ret-online">
      ${Decks.topbar(`分身戦 <i class="beta-tag">β</i>`, "online", helpBtn("分身戦", "友達が置いた「分身」（その人のデッキを CPU が動かす）と、いつでも戦えます。相手は上級の考え方で動きます。<br>自分のデッキも1つ「分身」として置いておくと、友達があなたの分身に挑めるようになります。<br>今週（月曜0時から）倒した数と、分身が守った数で順位を出します。<br>β版のあいだは、報酬はありません。"))}
      ${msg ? `<p class="callout" role="status">${esc(msg)}</p>` : ""}
      <div class="gh-mine">
        <span class="gl">あなたの分身</span>
        ${mine ? `<p class="gh-now"><b>${esc(mine.dk || "")}</b><small>今週 守った ${st.def[this.uid] || 0}・倒された ${st.lost[this.uid] || 0}</small></p>` : `<p class="hint">まだ置いていません。置くと、友達があなたのデッキと戦えるようになります。</p>`}
        ${decks.length ? `<div class="gh-set"><select class="txt" id="gh-deck" aria-label="分身にするデッキ">${decks.map(d => `<option value="${esc(d.id)}" ${d.id === sel ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select>
          <button type="button" class="btn sm primary" data-act="ghostSet">${mine ? "置き換える" : "分身として置く"}</button></div>` : `<p class="hint">置けるデッキがありません（デッキを完成させてください）。</p>`}
      </div>
      <span class="gl">友達の分身</span>
      <div class="gh-list">${this.list == null ? `<p class="hint">読み込み中…</p>` : others.length ? others.map(([u, g]) => {
        const icon = g.icon && DEF[g.icon] && DEF[g.icon].art ? g.icon : (g.key && DEF[g.key] && DEF[g.key].type === "char" && DEF[g.key].art ? g.key : null);
        const beat = (st.beatBy[this.uid] || {})[u] || 0;
        return `<div class="gh-row"><span class="gh-face">${icon ? iconImgHTML(icon) : `<span class="glyph">召</span>`}</span>
          <span class="gh-name"><b>${esc(g.n || "？")}</b>${g.title ? `<em>${esc(g.title)}</em>` : ""}<small>${esc(g.dk || "")}</small><small class="gh-rec">今週 守った ${st.def[u] || 0}${beat ? `・あなたが ${beat}勝` : ""}</small></span>
          <button type="button" class="btn sm primary" data-act="ghostGo" data-v="${esc(u)}">挑む</button></div>`; }).join("")
        : `<p class="hint">まだ誰も分身を置いていません。友達に「分身戦で分身を置いて」と伝えてみてください。</p>`}</div>
      <span class="gl">今週の順位</span>
      ${this.rankHTML(st)}
      <p class="hint">β版：報酬はありません。遊んでみた感想を「ご意見」から送ってください。</p>
    </div>`, "lobby", true);
    if (!this.off.length) this.watch();
  },
  /* 今週の記録：beatN[uid]＝倒した数（分身の持ち主ごとに1日1回まで数える）、def[uid]＝その人の分身が守った数 */
  stats(since) {
    const out = { beatN: {}, beatBy: {}, def: {}, lost: {} }, seen = new Set();
    Object.entries(this.log || {}).forEach(([owner, L]) => Object.values(L || {}).forEach(x => {
      if (!x || (x.at || 0) < since || !x.by || x.by === owner) return;
      if (x.res === "win") {
        out.lost[owner] = (out.lost[owner] || 0) + 1;
        (out.beatBy[x.by] || (out.beatBy[x.by] = {}))[owner] = ((out.beatBy[x.by] || {})[owner] || 0) + 1;
        const k = `${x.by}|${owner}|${new Date((x.at || 0) + 9 * 3600e3).toISOString().slice(0, 10)}`;   // 同じ相手は1日1回まで数える
        if (!seen.has(k)) { seen.add(k); out.beatN[x.by] = (out.beatN[x.by] || 0) + 1; }
      } else if (x.res === "lose") out.def[owner] = (out.def[owner] || 0) + 1;
      if (x.n) out.names = { ...(out.names || {}), [x.by]: x.n };
    }));
    return out;
  },
  rankHTML(st) {
    if (this.log == null) return `<p class="hint">読み込み中…</p>`;
    const name = u => (this.list && this.list[u] && this.list[u].n) || (st.names && st.names[u]) || "？";
    const col = (title, o) => { const L = Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10);
      return `<div class="gh-rk"><b>${title}</b>${L.length ? `<ol>${L.map(([u, n]) => `<li class="${u === this.uid ? "me" : ""}"><span>${esc(name(u))}</span><em>${n}</em></li>`).join("")}</ol>` : `<p class="hint">まだいません</p>`}</div>`; };
    return `<div class="gh-rks">${col("倒した数", st.beatN)}${col("守った数", st.def)}</div>`;
  },
  watch() {
    Net.init().then(uid => {
      this.uid = uid;
      const re = () => { if (document.querySelector("#overlay:not([hidden]) .panel.gh")) this.show(); else this.unwatch(); };
      this.off.push(Net.on("ghost", v => { this.list = v || {}; re(); }));
      this.off.push(Net.on("ghostLog", v => { this.log = v || {}; re(); }));
    }).catch(() => { this.list = this.list || {}; this.log = this.log || {}; const el = document.querySelector(".gh-list"); if (el) el.innerHTML = `<p class="hint">サーバーに接続できませんでした。</p>`; });
  },
  unwatch() { this.off.forEach(f => { try { f(); } catch (e) {} }); this.off = []; },

  async set() {
    const id = ($("#gh-deck") || {}).value, d = this.myDecks().find(x => x.id === id);
    if (!d) return this.show("デッキを選んでください。");
    this.pickDeck = id;
    const c = {}; Object.keys(d.cards || {}).filter(k => /^[\w-]{1,40}$/.test(k) && DEF[k] && +d.cards[k] > 0).slice(0, 60).forEach(k => { c[k] = Math.min(9, Math.floor(+d.cards[k])); });
    const icon = Account.icon(), key = Decks.keyCard ? Decks.keyCard(d) : null;
    const title = typeof Titles !== "undefined" && Titles.curName ? Titles.curName() : "";
    try {
      const uid = await Net.init(); this.uid = uid;
      await Net.set(`ghost/${uid}`, { n: playerName("召喚士").slice(0, 10), dk: String(d.name || "").slice(0, 20), c, at: Date.now(),
        ...(icon && /^[\w-]{1,40}$/.test(icon) ? { icon } : {}), ...(key && key.id ? { key: key.id } : typeof key === "string" ? { key } : {}), ...(title ? { title: String(title).slice(0, 12) } : {}) });
      Sound.play("buff");
      this.show(`「${d.name}」を分身として置きました。`);
    } catch (e) { console.error(e); this.show("置けませんでした（サーバーのルールの更新がまだかもしれません）。"); }
  },
  start(u) {
    const g = this.list && this.list[u]; if (!g || !g.c) return this.show("その分身は見つかりませんでした。");
    const mine = Decks.readyDeck(m => Decks.showList(m)); if (!mine) return;
    if (mine.sample) { toast("サンプルデッキでは分身戦に挑めません"); return this.show(); }
    this.unwatch();
    const icon = g.icon && DEF[g.icon] && DEF[g.icon].art ? g.icon : (g.key && DEF[g.key] && DEF[g.key].type === "char" ? g.key : null);
    startBattle({ kind: "ghost", level: "hard", mine, opp: { name: g.dk || "分身", cards: { ...g.c }, ...(icon ? { icon } : {}), ...(g.key && DEF[g.key] ? { key: g.key } : {}), ...(g.title ? { title: g.title } : {}) },
      oppName: `${g.n || "？"}の分身`, reward: 0, streak: false, extra: { gh: u } });
  },
  onGame(res) {
    const B = S && S.battle; if (!B || B.kind !== "ghost" || !B.gh) return null;
    if (!(S.turnNo >= 4)) return { short: true };   // すぐ降参した対戦は残さない
    const n = playerName("召喚士").slice(0, 10), owner = B.gh;
    Net.init().then(uid => { if (uid === owner) return; Net.push(`ghostLog/${owner}`, { by: uid, n, res, at: Date.now() }); }).catch(() => {});
    return { res };
  },
  handleAct(act, el) {
    switch (act) {
      case "ghost": this.show(); return true;
      case "ghostSet": this.set(); return true;
      case "ghostGo": this.start(el.dataset.v); return true;
    }
    return false;
  }
};
document.addEventListener("change", e => { if (e.target && e.target.id === "gh-deck") Ghost.pickDeck = e.target.value; });   // 届いた記録で描き直しても、選んだデッキを戻さない
