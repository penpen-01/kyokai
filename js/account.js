/* =========================================================
   アカウント（引き継ぎコード方式）
   ・初めて起動したときに、その人専用のコードを作る
   ・所持カード・G・デッキは「シーズン名/accounts/コード」に保存する
   ・機種変更のときは、新しい端末でコードを入力すると元に戻る
   ・シーズン名を変えると、全員が新規スタートになる（前のデータはサーバーに残る）
   ========================================================= */

const ACCT_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const STREAK_LEVELS = ["easy", "normal", "hard", "ex"];

const Account = {
  code: null,
  data: null,       // { gold, cards: {id: 枚数}, decks: [...], created }
  status: "none",   // none | loading | ready | offline | free（試遊：全カード使用可）
  isNew: false,
  saveTimer: null,
  /* 別の端末で遊んだデータを読み込み直したら、ホームを開いているときだけ描き直す */
  onReload() { if ((!S || S.over) && document.querySelector(".homebar") && typeof showStart === "function") showStart(); },

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
  get stones() { return this.data ? this.data.stones || 0 : 0; },
  get tickets() { return this.data ? this.data.tickets || 0 : 0; },
  get srTickets() { return this.data ? this.data.srTickets || 0 : 0; },
  get deckSlots() { return this.data ? this.data.deckSlots || 0 : 0; },
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
      if (code && cache) { this.code = code; this.data = this.fix(cache); this.status = "offline"; this.retryLater(); return; }
      this.status = "none";
      return;
    }
    if (code) {
      let d = null, failed = false;
      try { d = await Net.get(this.path(code)); } catch (e) { console.error(e); failed = true; }
      if (d) {
        this.code = code;
        // 前回、保存が届かないまま閉じた（通信が切れていた・オフラインで遊んだ）変更が端末に残っていれば、それを保存する
        const keep = this.unsaved(cache, d);
        this.data = this.fix(keep ? cache : d); this.status = "ready"; this.writeCache(); this.watch(); this.streakAbandon();
        if (keep) { this.saveNow(); this.recovered = true; }
        this.watchNet();
        return;
      }
      // 読み込みに失敗しただけのときは、端末に残っている古いデータでサーバーを上書きしない（オフライン扱い）
      if (failed && cache) { this.code = code; this.data = this.fix(cache); this.status = "offline"; this.retryLater(); return; }
      if (cache && cache.gold != null) { this.code = code; this.data = this.fix(cache); this.status = "ready"; this.watch(); this.streakAbandon(false); this.save(); return; }
    }
    await this.create();
  },

  fix(d) {
    return {
      gold: Math.max(0, Math.floor(+d.gold || 0)),
      rev: Math.max(0, Math.floor(+d.rev || 0)),   // 保存するたびに1増える（古いデータでの上書きを防ぐ）
      cards: cleanDeckCards(d.cards),
      decks: (Array.isArray(d.decks) ? d.decks : Object.values(d.decks || {})).filter(x => x && x.id).map(x => ({ id: String(x.id), name: String(x.name || "デッキ"), cards: cleanDeckCards(x.cards), ...(x.free ? { free: true } : {}), ...(x.fmt === "world" && WORLDS[x.world] ? { fmt: "world", world: String(x.world) } : x.fmt === "ltd" ? { fmt: "ltd" } : {}), ...(x.key ? { key: String(x.key) } : {}), ...(x.want && Object.keys(cleanDeckCards(x.want)).length ? { want: cleanDeckCards(x.want) } : {}) })),
      created: d.created || Date.now(),
      // プレイヤー名（対戦で表示する。10文字まで）
      ...(typeof d.name === "string" && d.name.trim() ? { name: d.name.trim().slice(0, 10) } : {}),
      // 受け取り済みのシリアルコード（ハッシュ → 受け取った日時）
      // 受け取ったメール（メールのID → 受け取った日時）
      // ログインボーナス：受け取った回数（何日目まで進んだか）と最後に受け取った日
      loginN: Math.max(0, Math.floor(+d.loginN || 0)),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(d.loginLast || "") ? { loginLast: d.loginLast } : {}),
      mailGot: Object.fromEntries(Object.entries(d.mailGot || {}).filter(([k]) => /^[\w-]{1,40}$/.test(k)).map(([k, v]) => [k, +v || 1])),
      redeemed: Object.fromEntries(Object.entries(d.redeemed || {}).filter(([k]) => /^[0-9a-f]{64}$/.test(k))),
      // プレイヤーアイコン（キャラカードのID。なければ「おまかせ」）
      ...(typeof d.icon === "string" && /^[\w-]{1,40}$/.test(d.icon) ? { icon: d.icon } : {}),
      // ショップ：魔石とパック券
      stones: Math.max(0, Math.floor(+d.stones || 0)),
      tickets: Math.max(0, Math.floor(+d.tickets || 0)),
      // SR以上確定パック券（隠しボスの報酬）
      srTickets: Math.max(0, Math.floor(+d.srTickets || 0)),
      // ショップで増やしたデッキ枠（マイデッキ・限定構築それぞれ +1）
      deckSlots: Math.max(0, Math.min(50, Math.floor(+d.deckSlots || 0))),
      ...(d.q && typeof d.q === "object" ? { q: d.q } : {}),
      ...(d.tut === "done" || d.tut === "skip" ? { tut: d.tut } : {}),   // チュートリアル：done＝クリアして報酬を受け取った・skip＝誘いをスキップ   // クエストの進み具合（js/quest.js）
      // 選択券（選択券のID → 枚数）。メールで受け取り、好きなカード1枚と交換する
      picks: Object.fromEntries(Object.entries(d.picks || {}).filter(([k, v]) => /^[\w-]{1,40}$/.test(k) && +v > 0).map(([k, v]) => [k, Math.floor(+v)])),
      opened: Array.isArray(d.opened) ? d.opened.filter(k => !!normSet(k)) : [],   // 開放した弾（「2-1」など。パック開放戦に勝つと増える）
      // サンプルデッキで友達と対戦した回数（その日の分。日本時間で日付が変わると0に戻る）
      ...(d.sampleDay && /^\d{4}-\d{2}-\d{2}$/.test(d.sampleDay.d) ? { sampleDay: { d: d.sampleDay.d, n: Math.max(0, Math.floor(+d.sampleDay.n || 0)) } } : {}),
      // 隠しボス：最後に会ってから上級で勝った回数（天井用）と、次の上級戦でボスが出るか
      bossPity: Math.max(0, Math.floor(+d.bossPity || 0)),
      ...(d.bossNext ? { bossNext: true } : {}),
      bossPityEx: Math.max(0, Math.floor(+d.bossPityEx || 0)),   // 超級の隠しボス（黄泉丸）
      ...(d.bossNextEx ? { bossNextEx: true } : {}),
      // パックの開封履歴（直近100パック）{ t: 時刻, p: パックID, c: [カードID] }
      packLog: (Array.isArray(d.packLog) ? d.packLog : Object.values(d.packLog || {})).filter(e => e && Array.isArray(e.c)).slice(-100).map(e => ({ t: +e.t || 0, p: String(e.p || ""), c: e.c.map(String).slice(0, 10) })),
      // CPU戦の連勝数（強さごと）と、終わっていないCPU戦の強さ（途中でやめたら連勝が途切れる）
      streak: Object.fromEntries(STREAK_LEVELS.map(k => [k, Math.max(0, Math.floor(+(d.streak || {})[k] || 0))])),
      ...(STREAK_LEVELS.includes(d.streakLive) ? { streakLive: d.streakLive } : {})
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
    this.watch();
  },

  writeCache() { try { localStorage.setItem(this.cacheKey(), JSON.stringify(this.data)); } catch {} },
  /* ---------- 通信が切れたとき・オフラインで始めたとき（2026-11-14） ----------
     ・サーバーへの保存は rev（何回目の保存か）で数えている。保存が届くたびに rev が1増える
     ・端末の控え（cache）の rev がサーバーと同じなのに中身が違う → 届かなかった変更が端末に残っている → それを保存する
     ・サーバーの rev の方が大きい → 別の端末で遊んだ → サーバーを使う（端末の変更は捨てる） */
  stable(v) { return JSON.stringify(v, (k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x); },
  unsaved(cache, server) {
    if (!cache || !server) return false;
    try {
      const c = this.fix(JSON.parse(JSON.stringify(cache))), s = this.fix(JSON.parse(JSON.stringify(server)));
      return (+c.rev || 0) === (+s.rev || 0) && this.stable(c) !== this.stable(s);
    } catch (e) { return false; }
  },
  /* オフラインで始めたら、通信が戻ったときにつなぎ直す（そのまま遊び続けていてよい） */
  retryLater() {
    if (this.retryOn) return; this.retryOn = true;
    const tryNow = async () => {
      if (this.status !== "offline" || this.retrying) return;
      this.retrying = true;
      try {
        await Promise.race([Net.init(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000))]);
        const d = await Promise.race([Net.get(this.path(this.code)), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000))]);
        if (this.status !== "offline") return;
        if (d && (+d.rev || 0) > (+this.data.rev || 0)) {
          this.data = this.fix(d); this.status = "ready"; this.writeCache();
          if (typeof toast === "function") toast("通信が戻りました。別の端末で遊んだ新しいデータを読み込みました（オフラインの間の変更は保存されていません）");
          if (typeof this.onReload === "function") this.onReload();
        } else {
          this.status = "ready";
          const ok = await this.saveNow();
          if (typeof toast === "function") toast(ok ? "通信が戻りました。オフラインの間に手に入れたものを保存しました" : "通信が戻りました");
        }
        this.watch(); this.watchNet(); NetBanner.update();
      } catch (e) { /* まだつながらない。次の機会に */ }
      finally { this.retrying = false; }
    };
    window.addEventListener("online", () => setTimeout(tryNow, 1500));
    setInterval(tryNow, 30000);
  },
  /* 遊んでいる途中で通信が切れたかを見張る（切れている間は画面の上に知らせる） */
  watchNet() {
    if (this.netOn || !Net.onConnected) return; this.netOn = true;
    try { Net.onConnected(v => { this.connected = v; NetBanner.update(); }); } catch (e) {}
  },
  save() {
    if (this.status === "free" || !this.data) return;
    this.writeCache();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveNow(); }, 300);
  },
  /* 保存は順番に1つずつ。サーバーのデータが、こちらが読み込んだときより新しければ（別の端末・別の画面で
     遊んだあと）上書きせずに、サーバーのデータを読み込み直す。オフラインの間はサーバーに書かない */
  saveNow() {
    if (this.status === "free" || !this.data || !this.code) return Promise.resolve(false);
    this.writeCache();
    if (this.status === "offline") return Promise.resolve(false);
    this.saving = (this.saving || Promise.resolve()).then(() => this.saveOnce()).catch(e => { console.error(e); return false; });
    return this.saving;
  },
  async saveOnce() {
    if (!this.data) return false;
    const base = this.data.rev || 0;
    const next = JSON.parse(JSON.stringify({ ...this.data, rev: base + 1 }));
    const r = await Net.tx(this.path(this.code), cur => (cur && (+cur.rev || 0) !== base ? undefined : next));
    if (r.committed) { this.data.rev = base + 1; this.writeCache(); return true; }
    if (r.val) {
      this.data = this.fix(r.val); this.writeCache();
      if (typeof toast === "function") toast("別の端末（または別の画面）で遊んだ新しいデータを読み込みました。直前の変更は保存されていません");
      if (typeof this.onReload === "function") this.onReload();
    }
    return false;
  },
  /* サーバーのデータが新しくなったら（別の端末で遊んだ）、こちらも読み込み直す */
  watch() {
    if (this.unwatch || !this.code) return;
    try {
      this.unwatch = Net.on(this.path(this.code), v => {
        if (!v || !this.data || this.saveTimer) return;
        if ((+v.rev || 0) > (this.data.rev || 0)) { this.data = this.fix(v); this.writeCache(); if (typeof this.onReload === "function") this.onReload(); }
      });
    } catch (e) { console.error(e); }
  },

  /* ---------- CPU戦の連勝 ---------- */
  streakOn() { return !!this.data && this.status !== "free" && this.status !== "none"; },
  streak(level) { return (this.streakOn() && this.data.streak && this.data.streak[level]) || 0; },
  // 次に勝ったときのボーナス（%）。1勝目は0%、2連勝目から STREAK_STEP% ずつ、最大 STREAK_MAX%
  streakBonus(wins) { return Math.max(0, Math.min(CONFIG.STREAK_MAX || 0, (CONFIG.STREAK_STEP || 0) * (wins - 1))); },
  // CPU戦を始めた。前の試合が終わらないまま（途中でやめた・閉じた）なら、その強さの連勝を0にする
  streakStart(level) {
    if (!this.streakOn()) return;
    this.streakAbandon(false);
    this.data.streakLive = level;
    this.save();
  },
  // 終わっていないCPU戦があれば、負けと同じ扱いで連勝を0にする
  streakAbandon(save = true) {
    if (!this.streakOn() || !this.data.streakLive) return;
    const lv = this.data.streakLive;
    delete this.data.streakLive;
    if (this.data.streak) this.data.streak[lv] = 0;
    if (save) this.save();
  },
  // 決着。勝てば連勝+1、負け・引き分けは0。戻り値は { wins: 今の連勝数, prev: 決着前の連勝数 }
  streakEnd(level, win) {
    if (!this.streakOn()) return { wins: 0, prev: 0 };
    delete this.data.streakLive;
    const st = this.data.streak || (this.data.streak = {});
    const prev = st[level] || 0;
    st[level] = win ? prev + 1 : 0;
    return { wins: st[level], prev };
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
    if (this.unwatch) { this.unwatch(); this.unwatch = null; }
    this.code = code; this.data = this.fix(d); this.status = "ready"; this.isNew = false;
    try { localStorage.setItem(this.key(), code); localStorage.removeItem(DECK_SEL_KEY); } catch {}
    this.writeCache();
    this.watch();
    return { ok: true };
  },

  /* ---------- 画面 ---------- */
  showWelcome() {
    openOverlay(`<div class="panel">
      <h2 class="title sm">ようこそ、召喚士</h2>
      <p class="lead">スターターデッキ一式と、パック${Math.max(1, Math.floor(CONFIG.STARTING_GOLD / ((PACKS[0] && PACKS[0].price) || 100)))}個分のG（${CONFIG.STARTING_GOLD}G）を配りました。CPUや友達に勝つとGがもらえ、Gでパックを開けられます。</p>
      ${this.codeBoxHTML()}
      <p class="lead small">このコードは、機種変更やブラウザのデータが消えたときに、カードを取り戻すための鍵です。<b>スクリーンショットかメモで必ず控えてください。</b>他の人には教えないでください。</p>
      <button type="button" class="btn primary" data-act="welcomeOk">控えました</button>
    </div>`, "start", true);
  },

  codeBoxHTML() {
    return `<div class="codebox"><span class="codelabel">引き継ぎコード</span><b class="acode">${esc(this.fmt(this.code))}</b>
      <button type="button" class="btn sm" data-act="acctCopy">コピー</button></div>`;
  },

  showScreen(msg) {
    const st = { ready: "", offline: "（オフライン：手に入れたものはこの端末に残り、通信が戻ると自動で保存されます）", none: "", free: "" }[this.status] || "";
    openOverlay(`<div class="panel">
      <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>アカウント</b></div>
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
    </div>`, null, true);
  },

  /* ---------- プレイヤーアイコン ---------- */
  // アイコンにできるカード：持っているキャラカードのうち、絵があるもの（試遊は全部・接続できないときはスターター）
  iconChoices() {
    const ok = c => c && c.type === "char" && c.art && c.limit > 0;
    return CARDS.filter(c => ok(c) && (this.status === "free" || this.owned(c.id) > 0))
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || b.cost - a.cost);
  },
  // 今のアイコン（選んでいない・もう持っていないときは null ＝ デッキでいちばんレアなキャラ）
  icon() {
    const id = this.data && this.data.icon;
    return id && this.iconChoices().some(c => c.id === id) ? id : null;
  },
  setIcon(id) {
    if (!this.data) return;
    if (id) this.data.icon = id; else delete this.data.icon;
    this.save();
  },
  showIcons(from) {
    if (from) this.iconFrom = from;
    const list = this.iconChoices(), cur = this.icon();
    const total = CARDS.filter(c => c.type === "char" && c.art && c.limit > 0 && cardShown(c)).length;
    const back = this.iconFrom === "options" ? "options" : "optBack";
    openOverlay(`<div class="panel wide">
      <div class="topbar"><button type="button" class="btn sm" data-act="${back}">← 戻る</button><b>アイコン</b></div>
      <p class="lead small">対戦で顔として表示されます。持っているキャラカードの絵から選べます（${list.length} / ${total}種）。カードを集めるほど増えます。</p>
      <div class="iconpick">
        <button type="button" class="iconopt auto ${cur ? "" : "on"}" data-act="iconSet" data-id="" aria-label="おまかせ"><span class="iface"><span class="glyph">任</span></span><small>おまかせ</small></button>
        ${list.map(c => `<button type="button" class="iconopt r-${c.rarity} ${cur === c.id ? "on" : ""}" data-act="iconSet" data-id="${esc(c.id)}" aria-label="${esc(c.name)}"><span class="iface">${iconImgHTML(c.id)}</span><small>${esc(c.name)}</small></button>`).join("")}
      </div>
      <p class="datainfo">「おまかせ」は、使うデッキでいちばんレアなキャラの絵になります。</p>
      <button type="button" class="btn" data-act="${back}">戻る</button>
    </div>`, this.iconFrom === "options" ? "options" : "start", true);
  },

  handleAct(act, el) {
    switch (act) {
      case "icons": this.showIcons(el && el.dataset.from); return true;
      case "iconSet": this.setIcon(el.dataset.id || null); Sound.play("click"); this.showIcons(); return true;
      case "welcomeOk": this.isNew = false; showStart(); return true;
      case "acctCopy":
        copyText(this.fmt(this.code)).then(ok => toast(ok ? "コピーしました" : "コピーできませんでした。手で控えてください"));
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

/* 通信の知らせ：オフラインで始めた・遊んでいる途中で通信が切れた、のどちらかの間だけ画面の上に出す */
const NetBanner = {
  timer: 0,
  update() {
    clearTimeout(this.timer);
    const off = Account.status === "offline", cut = Account.status === "ready" && Account.connected === false;
    // つながった直後や一瞬の切断で点滅しないよう、切れてから3秒たって出す
    if (off || cut) this.timer = setTimeout(() => this.show(off), off ? 0 : 3000);
    else this.hide();
  },
  show(off) {
    let b = document.getElementById("netbanner");
    if (!b) { b = document.createElement("div"); b.id = "netbanner"; b.setAttribute("role", "status"); document.body.appendChild(b); }
    b.innerHTML = off
      ? "<b>オフライン</b>手に入れたカードやGはこの端末に残り、通信が戻ると自動で保存されます。オンライン対戦・シリアルコードは使えません"
      : "<b>通信が切れています</b>つながると自動で保存されます。保存されるまで、できればアプリを閉じないでください";
    b.hidden = false;
  },
  hide() { const b = document.getElementById("netbanner"); if (b) b.hidden = true; }
};
