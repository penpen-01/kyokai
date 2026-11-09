/* =========================================================
   告知の下書き（カード工房「経済・配布」タブ）
   リリース後に変えたことをためておき、まとめてメール（またはお知らせ）にする。
   ・カードの変更：notice.json の base（前回告知した時点のカード）と今のカードを比べて自動で一覧にする
   ・ゲームの仕組みの変更：notice.json の notes に1行ずつ書き足す（Claude が main に入れるたびに書く。工房の修正は書かない）
   ・メールにすると、base が今のカードになり notes は空になる。notice.json は次の「公開する」で一緒に送る
   ========================================================= */
const NOTICE_PATH = "notice.json";
const NOTICE_LOCAL = "kyokai-notice-draft";
/* カード1枚を1行にする（変更前→変更後を見せるため） */
function noticeLine(c) {
  return `${RARITY[c.rarity] || ""}・${c.cost}コスト${c.type === "char" ? ` ${c.atk}/${c.hp}` : "・魔法"}${c.limit !== 3 ? `・上限${c.limit}枚` : ""}｜${cardText(c).replace(/\n/g, " ")}`;
}
function noticeSnap(cards) {
  return Object.fromEntries(cards.filter(c => c.limit > 0 || c.token).map(c => [c.id, { name: c.name, line: noticeLine(c) }]));
}

const Notice = {
  data: null, dirty: false, msg: "", loading: false,
  draft: { title: "", body: "", gold: 0, stones: 0, tickets: 0, picks: {} },

  async load() {
    if (this.data || this.loading) return;
    this.loading = true;
    try {
      const local = JSON.parse(localStorage.getItem(NOTICE_LOCAL) || "null");
      if (local && local.dirty) { this.data = local.data; this.dirty = true; }
    } catch {}
    if (!this.data) {
      try { const r = await fetch(`${NOTICE_PATH}?t=${Date.now()}`, { cache: "no-store" }); if (r.ok) this.data = await r.json(); } catch {}
    }
    if (!this.data) this.data = { base: { date: "", cards: {} }, notes: [] };
    this.loading = false;
    this.render();
  },
  save() {
    try { localStorage.setItem(NOTICE_LOCAL, JSON.stringify({ dirty: this.dirty, data: this.data })); } catch {}
  },

  /* 前回の告知から変わったカード */
  changes() {
    const B = (this.data && this.data.base.cards) || {}, N = noticeSnap(DATA.cards);
    const changed = [], added = [], removed = [];
    for (const [id, x] of Object.entries(N)) {
      if (!B[id]) added.push(x);
      else if (B[id].line !== x.line || B[id].name !== x.name) changed.push({ before: B[id], after: x });
    }
    for (const [id, x] of Object.entries(B)) if (!N[id]) removed.push(x);
    return { changed, added, removed };
  },
  /* メールの本文を作る */
  compose() {
    const { changed, added, removed } = this.changes(), notes = this.data.notes || [];
    const L = [];
    L.push("いつも「境界の召喚士」で遊んでいただき、ありがとうございます。", "以下の変更を行いました。");
    if (changed.length) { L.push("", "■ カードの変更"); changed.forEach(x => L.push(`・${x.before.name}${x.before.name !== x.after.name ? `（→ ${x.after.name}）` : ""}`, `　変更前：${x.before.line}`, `　変更後：${x.after.line}`)); }
    if (added.length) { L.push("", "■ 新しいカード"); added.forEach(x => L.push(`・${x.name}`)); }
    if (removed.length) { L.push("", "■ なくなったカード"); removed.forEach(x => L.push(`・${x.name}`)); }
    if (notes.length) { L.push("", "■ ゲームの変更"); notes.forEach(n => L.push(`・${n.text}`)); }
    L.push("", "ご迷惑をおかけして申し訳ありません。お詫びの品をお受け取りください。", "これからも「境界の召喚士」をよろしくお願いします。");
    return L.join("\n");
  },

  html() {
    if (!this.data) { this.load(); return `<span class="gl">告知の下書き</span><p class="hint">読み込み中…</p>`; }
    const { changed, added, removed } = this.changes(), notes = this.data.notes || [], d = this.draft;
    if (!d.body) d.body = this.compose();
    if (!d.title) d.title = `アップデートのお知らせ（${localDate()}）`;
    const n = changed.length + added.length + removed.length + notes.length;
    return `<span class="gl">告知の下書き</span>
      <p class="hint">前回告知した日（${esc(this.data.base.date || "まだ一度もない")}）から変わったことです。カードの変更は自動で、ゲームの仕組みの変更は Claude が書き足します（工房の修正は入りません）。「メールにする」と、送った日までに始めた人に届き、ここは空になります。${this.dirty ? "<b>次の「公開する」で控えも更新されます。</b>" : ""}</p>
      ${n ? `<div class="cpudeck">
        ${changed.length ? `<b class="small">カードの変更 ${changed.length}</b>${changed.map(x => `<div class="small"><b>${esc(x.before.name)}</b>${x.before.name !== x.after.name ? ` → ${esc(x.after.name)}` : ""}<br><span class="hint">前：${esc(x.before.line)}</span><br>後：${esc(x.after.line)}</div>`).join("")}` : ""}
        ${added.length ? `<b class="small">新しいカード ${added.length}</b><span class="small">${added.map(x => esc(x.name)).join("、")}</span>` : ""}
        ${removed.length ? `<b class="small">なくなったカード ${removed.length}</b><span class="small">${removed.map(x => esc(x.name)).join("、")}</span>` : ""}
        ${notes.length ? `<b class="small">ゲームの変更 ${notes.length}</b>${notes.map((x, i) => `<div class="frow small"><span style="flex:1">${esc(x.date)}　${esc(x.text)}</span><button type="button" class="btn sm" data-act="ntDel" data-i="${i}">外す</button></div>`).join("")}` : ""}
      </div>` : `<p class="hint">告知することはまだありません。</p>`}
      <div class="cpudeck">
        <div class="frow"><label class="small" for="nt-title" style="min-width:70px">題名</label><input class="txt" id="nt-title" maxlength="40" value="${esc(d.title)}" style="flex:1;min-width:160px"></div>
        <div class="frow"><label class="small" for="nt-body" style="min-width:70px">本文</label><textarea class="txt" id="nt-body" rows="8" maxlength="1000" style="flex:1;min-width:200px">${esc(d.body)}</textarea></div>
        <div class="frow"><button type="button" class="btn sm" data-act="ntCompose">本文を作り直す</button><span class="hint">メールの本文は1000文字まで（今 ${d.body.length}文字）</span></div>
        <div class="frow"><span class="small">お詫び</span>
          <label class="small" for="nt-gold">G</label><input class="txt" id="nt-gold" type="number" min="0" step="10" value="${d.gold}" style="max-width:100px">
          <label class="small" for="nt-stones">魔石</label><input class="txt" id="nt-stones" type="number" min="0" step="10" value="${d.stones}" style="max-width:100px">
          <label class="small" for="nt-tickets">パック券</label><input class="txt" id="nt-tickets" type="number" min="0" value="${d.tickets}" style="max-width:80px"></div>
        <div class="frow"><button type="button" class="btn sm primary" data-act="ntMail" ${n ? "" : "disabled"}>メールにする</button>
          <button type="button" class="btn sm" data-act="ntNews" ${n ? "" : "disabled"}>お知らせにする（お詫びなし）</button>
          <button type="button" class="btn sm" data-act="ntBase">告知せずに、今の状態を控えにする</button>
          <span class="warn">${esc(this.msg)}</span></div>
        <p class="hint">「告知せずに控えにする」は、正式リリースの日など、それまでの変更を告知しないときに使います。</p>
      </div>`;
  },
  render() { const el = $("#notice-box"); if (el) el.innerHTML = this.html(); },
  read() {
    const v = id => { const el = $("#" + id); return el ? el.value : ""; }, d = this.draft;
    d.title = v("nt-title").slice(0, 40); d.body = v("nt-body").slice(0, 1000);
    d.gold = Math.max(0, Math.floor(+v("nt-gold") || 0)); d.stones = Math.max(0, Math.floor(+v("nt-stones") || 0)); d.tickets = Math.max(0, Math.floor(+v("nt-tickets") || 0));
  },
  /* 告知したので、控えを今の状態にする */
  reset(msg) {
    this.data = { base: { date: localDate(), cards: noticeSnap(DATA.cards) }, notes: [] };
    this.dirty = true; this.save();
    this.draft = { title: "", body: "", gold: 0, stones: 0, tickets: 0, picks: {} };
    this.msg = msg;
    saveDraft(); renderStatus(); this.render();
  },

  /* 公開のときに一緒に送る */
  async publish(api, branch, b64) {
    if (!this.dirty || !this.data) return;
    const text = JSON.stringify(this.data, null, 1) + "\n";
    const g = await api(`/contents/${NOTICE_PATH}?ref=${encodeURIComponent(branch)}`);
    const sha = g.ok ? (await g.json()).sha : undefined;
    const p = await api(`/contents/${NOTICE_PATH}`, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "告知の控えを更新", content: b64(text), branch, ...(sha ? { sha } : {}) }) });
    if (!p.ok) throw { status: p.status };
    this.dirty = false; this.save();
  },

  act(name, el) {
    switch (name) {
      case "ntCompose": this.read(); this.draft.body = this.compose(); this.render(); return true;
      case "ntDel": this.read(); this.data.notes.splice(+el.dataset.i, 1); this.dirty = true; this.save(); this.draft.body = this.compose(); this.render(); return true;
      case "ntMail": case "ntNews": {
        this.read(); const d = this.draft;
        if (!d.title.trim()) { this.msg = "題名を入れてください"; this.render(); return true; }
        const base = { id: (name === "ntNews" ? "n" : "m") + Date.now().toString(36), date: localDate(), title: d.title.trim(), body: d.body };
        if (name === "ntNews") (DATA.news = DATA.news || []).push({ ...base, body: d.body.slice(0, 2000) });
        else (DATA.mail = DATA.mail || []).push({ ...base, to: "before", until: "", gold: d.gold, stones: d.stones, tickets: d.tickets, cards: {}, picks: {} });
        this.reset(`${name === "ntNews" ? "お知らせ" : "メール"}にしました。「公開する」でゲームに届きます`);
        if (typeof Admin !== "undefined") Admin.renderInbox();
        return true;
      }
      case "ntBase": this.reset("今の状態を控えにしました。次の「公開する」で保存されます"); return true;
    }
    return false;
  }
};
