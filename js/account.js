/* =========================================================
   アカウント（引き継ぎコード方式）
   ・初めて起動したときに、その人専用のコードを作る
   ・所持カード・G・デッキは「シーズン名/accounts/コード」に保存する
   ・機種変更のときは、新しい端末でコードを入力すると元に戻る
   ・シーズン名を変えると、全員が新規スタートになる（前のデータはサーバーに残る）
   ========================================================= */

const ACCT_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const Account = {
  code: null,
  data: null,       // { gold, cards: {id: 枚数}, decks: [...], created }
  status: "none",   // none | loading | ready | offline | free（試遊：全カード使用可）
  isNew: false,
  saveTimer: null,

  key() { return `kyokai-acct-${CONFIG.SEASON}`; },
  cacheKey() { return `kyokai-acct-cache-${CONFIG.SEASON}`; },
  path(code) { return `seasons/${CONFIG.SEASON}/accounts/${code}`; },
  fmt(code) { return (code || "").replace(/(.{4})(?=.)/g, "$1-"); },
  normCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); },

  /* 所持数（試遊中はすべて上限まで持っている扱い） */
  owned(id) {
    if (this.status === "free") return 99;
    if (this.status === "none") { const st = PRESETS.find(p => p.id === CONFIG.STARTER_DECK); return st ? st.cards[id] || 0 : 0; }
    return (this.data && this.data.cards && this.data.cards[id]) || 0;
  },
  get gold() { return this.data ? this.data.gold || 0 : 0; },
  usable() { return this.status === "ready" || this.status === "offline" || this.status === "free"; },

  async init() {
    if (DATA_INFO.draft) { this.status = "free"; this.data = { gold: 0, cards: {}, decks: [] }; return; }
    this.status = "loading";
    let code = null, cache = null;
    try { code = localStorage.getItem(this.key()); cache = JSON.parse(localStorage.getItem(this.cacheKey()) || "null"); } catch {}
    try {
      await Promise.race([Net.init(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 12000))]);
    } catch (e) {
      console.error(e);
      if (code && cache) { this.code = code; this.data = this.fix(cache); this.status = "offline"; return; }
      this.status = "none";
      return;
    }
    if (code) {
      let d = null;
      try { d = await Net.get(this.path(code)); } catch (e) { console.error(e); }
      if (d) { this.code = code; this.data = this.fix(d); this.status = "ready"; this.writeCache(); return; }
      if (cache && cache.gold != null) { this.code = code; this.data = this.fix(cache); this.status = "ready"; this.save(); return; }
    }
    await this.create();
  },

  fix(d) {
    return {
      gold: Math.max(0, Math.floor(+d.gold || 0)),
      cards: cleanDeckCards(d.cards),
      decks: (Array.isArray(d.decks) ? d.decks : Object.values(d.decks || {})).filter(x => x && x.id).map(x => ({ id: String(x.id), name: String(x.name || "デッキ"), cards: cleanDeckCards(x.cards) })),
      created: d.created || Date.now()
    };
  },

  async create() {
    const code = Array.from({ length: 16 }, () => ACCT_CHARS[Math.floor(Math.random() * ACCT_CHARS.length)]).join("");
    const starter = PRESETS.find(p => p.id === CONFIG.STARTER_DECK) || PRESETS[0];
    const cards = starter ? { ...starter.cards } : {};
    const decks = starter ? [{ id: "d-starter", name: starter.name, cards: { ...starter.cards } }] : [];
    this.code = code;
    this.data = { gold: CONFIG.STARTING_GOLD, cards, decks, created: Date.now() };
    this.isNew = true;
    this.status = "ready";
    try { localStorage.setItem(this.key(), code); } catch {}
    try { localStorage.setItem(DECK_SEL_KEY, "d-starter"); } catch {}
    await this.saveNow();
  },

  writeCache() { try { localStorage.setItem(this.cacheKey(), JSON.stringify(this.data)); } catch {} },
  save() {
    if (this.status === "free" || !this.data) return;
    this.writeCache();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 300);
  },
  async saveNow() {
    if (this.status === "free" || !this.data || !this.code) return false;
    this.writeCache();
    try { await Net.set(this.path(this.code), this.data); return true; }
    catch (e) { console.error(e); return false; }
  },

  // Gとカードは大事なので、すぐに保存する
  addGold(n) { if (!this.data || this.status === "free") return; this.data.gold = Math.max(0, this.gold + n); this.saveNow(); },
  addCards(ids) { if (!this.data) return; ids.forEach(id => { this.data.cards[id] = (this.data.cards[id] || 0) + 1; }); this.saveNow(); },
  decks() {
    if (this.status === "none") { const st = PRESETS.find(p => p.id === CONFIG.STARTER_DECK); return st ? [{ id: "d-starter", name: st.name, cards: { ...st.cards } }] : []; }
    return this.data ? this.data.decks : [];
  },
  setDecks(list) { if (!this.data) return false; this.data.decks = list; this.save(); return true; },

  /* 別の端末のコードを読み込む */
  async loadCode(input) {
    const code = this.normCode(input);
    if (code.length !== 16) return { ok: false, msg: "コードは16文字です（ハイフンは入れなくても大丈夫です）。" };
    if (code === this.code) return { ok: false, msg: "今使っているコードと同じです。" };
    try { await Net.init(); } catch { return { ok: false, msg: "サーバーに接続できませんでした。" }; }
    let d = null;
    try { d = await Net.get(this.path(code)); } catch { return { ok: false, msg: "読み込みに失敗しました。" }; }
    if (!d) return { ok: false, msg: "そのコードのデータは見つかりませんでした。シーズンが変わったか、コードが違います。" };
    this.code = code; this.data = this.fix(d); this.status = "ready"; this.isNew = false;
    try { localStorage.setItem(this.key(), code); localStorage.removeItem(DECK_SEL_KEY); } catch {}
    this.writeCache();
    return { ok: true };
  },

  /* ---------- 画面 ---------- */
  showWelcome() {
    openOverlay(`<div class="panel">
      <h2 class="title sm">ようこそ、召喚士</h2>
      <p class="lead">スターターデッキ一式と、パック${Math.max(1, Math.floor(CONFIG.STARTING_GOLD / ((PACKS[0] && PACKS[0].price) || 100)))}個分のG（${CONFIG.STARTING_GOLD}G）を配りました。CPUや友達に勝つとGがもらえ、Gでパックを開けられます。</p>
      ${this.codeBoxHTML()}
      <p class="lead small">このコードは、機種変更やブラウザのデータが消えたときに、カードを取り戻すための鍵です。<b>スクリーンショットかメモで必ず控えてください。</b>他の人には教えないでください。</p>
      <p class="lead small">ベータ版のデータは、正式公開のときにリセットされます。</p>
      <button type="button" class="btn primary" data-act="welcomeOk">控えました</button>
    </div>`, "start", true);
  },

  codeBoxHTML() {
    return `<div class="codebox"><span class="codelabel">引き継ぎコード</span><b class="acode">${esc(this.fmt(this.code))}</b>
      <button type="button" class="btn sm" data-act="acctCopy">コピー</button></div>`;
  },

  showScreen(msg) {
    const st = { ready: "", offline: "（オフライン：通信できるようになったら保存されます）", none: "", free: "" }[this.status] || "";
    openOverlay(`<div class="panel">
      <h2 class="title sm">アカウント</h2>
      ${this.status === "free" ? `<p class="lead">試遊モードでは、すべてのカードを使えます。アカウントは使いません。</p>`
        : !this.code ? `<p class="lead">サーバーに接続できないため、アカウントを読み込めませんでした。通信状態を確認して、開き直してください。</p>`
        : `${this.codeBoxHTML()}
           <p class="lead small">所持G：<b>${this.gold}G</b> ・ 所持カード：<b>${Object.values(this.data.cards).reduce((a, b) => a + b, 0)}</b>枚${st}</p>
           <p class="lead small">機種変更のときは、新しい端末でこのコードを入力してください。他の人には教えないでください。</p>`}
      ${this.status === "free" ? "" : `
      <h3 class="sec">別の端末のデータを読み込む</h3>
      <p class="lead small">今のデータから、入力したコードのデータに切り替わります。今のコードを控えていないと、今のデータには戻れません。</p>
      <div class="joinrow"><input class="otxt" id="acct-in" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false">
        <button type="button" class="btn primary" data-act="acctLoad">読み込む</button></div>`}
      <p class="onl-msg" id="acct-msg" role="status">${msg ? esc(msg) : ""}</p>
      <p class="datainfo">シーズン：${esc(CONFIG.SEASON)}</p>
      <button type="button" class="btn" data-act="back">戻る</button>
    </div>`, "start", true);
  },

  handleAct(act) {
    switch (act) {
      case "welcomeOk": this.isNew = false; showStart(); return true;
      case "acctCopy":
        navigator.clipboard?.writeText(this.fmt(this.code)).then(() => toast("コピーしました"), () => toast("コピーできませんでした。手で控えてください"));
        return true;
      case "acctLoad": {
        const v = $("#acct-in") ? $("#acct-in").value : "";
        const m = $("#acct-msg"); if (m) m.textContent = "読み込み中…";
        this.loadCode(v).then(r => r.ok ? this.showScreen("読み込みました") : (m && (m.textContent = r.msg)));
        return true;
      }
    }
    return false;
  }
};

/* アプリを閉じる・裏に回すときは、保存待ちを先に書き込む */
document.addEventListener("visibilitychange", () => { if (document.hidden && Account.saveTimer) { clearTimeout(Account.saveTimer); Account.saveTimer = null; Account.saveNow(); } });
