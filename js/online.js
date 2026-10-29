/* =========================================================
   対人戦：部屋の作成・参加・同期
   ・部屋を作った人（ホスト）が対戦処理をすべて行い、盤面をサーバーに書き込む
   ・参加した人（ゲスト）は操作をサーバー経由でホストに送り、盤面を受け取って表示する
   ========================================================= */

const NAME_KEY = "kyokai-name";
const ROOM_KEY = "kyokai-room";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 見間違えやすい O/0, I/1 は使わない
const SEND_TIMEOUT = 10000;

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

const Online = {
  role: null,          // "host" | "guest"
  code: null,
  uid: null,
  room: null,          // 部屋の最新情報（state以外）
  pending: false,      // ゲストが操作を送って返事待ち
  pendingTimer: null,
  oppOnline: true,
  oppLeft: false,
  closed: false,
  fxq: [],
  pubQueued: false,
  unsubs: [],
  lastSeq: -1,

  blocked() { return MODE === "online" && (this.pending || this.oppLeft || this.closed); },
  oppUid() { return this.room ? (this.role === "host" ? this.room.guest : this.room.host) : null; },

  /* ---------- 画面 ---------- */
  showLobby(msg) {
    const name = store.get(NAME_KEY) || "";
    openOverlay(`<div class="panel">
      <h2 class="title sm">友達と対戦</h2>
      <p class="lead">片方が部屋を作り、表示された合言葉をもう片方が入力すると対戦が始まります。</p>
      <div class="ofield">
        <label for="onl-name">あなたの名前</label>
        <input class="otxt" id="onl-name" maxlength="10" placeholder="例：ペンペン" value="${esc(name)}" autocomplete="nickname">
      </div>
      <button type="button" class="btn primary" data-act="onlCreate">部屋を作る</button>
      <div class="or"><span>または</span></div>
      <div class="ofield">
        <label for="onl-code">合言葉（4文字）</label>
        <div class="joinrow">
          <input class="otxt code" id="onl-code" maxlength="4" placeholder="ABCD" autocomplete="off" autocapitalize="characters" spellcheck="false">
          <button type="button" class="btn primary" data-act="onlJoin">参加する</button>
        </div>
      </div>
      <p class="onl-msg" id="onl-msg" role="status">${msg ? esc(msg) : ""}</p>
      <button type="button" class="btn" data-act="onlBack">戻る</button>
      <p class="datainfo">2人とも、カードデータが同じ（最新）である必要があります。合わないときは両方ともページを開き直してください。</p>
    </div>`, "lobby", true);
  },

  lobbyMsg(text) { const m = $("#onl-msg"); if (m) m.textContent = text; else this.showLobby(text); },

  showWaiting() {
    openOverlay(`<div class="panel">
      <h2 class="title sm">相手を待っています</h2>
      <p class="lead">この合言葉を相手に伝えてください。相手が入力すると対戦が始まります。</p>
      <div class="roomcode" aria-label="合言葉">${esc(this.code)}</div>
      <button type="button" class="btn" data-act="onlCopy">合言葉をコピー</button>
      <p class="onl-msg" id="onl-msg" role="status"></p>
      <button type="button" class="btn" data-act="onlCancel">部屋を閉じる</button>
    </div>`, "lobby", true);
  },

  showConnecting(text) {
    openOverlay(`<div class="panel"><h2 class="title sm">${esc(text)}</h2><p class="lead">しばらくお待ちください。</p>
      <button type="button" class="btn" data-act="onlCancel">やめる</button></div>`, "lobby", true);
  },

  oppStatusHTML() {
    if (this.oppLeft || this.closed) return `<small class="ostat off">退出</small>`;
    if (!this.oppOnline) return `<small class="ostat off">接続待ち</small>`;
    return "";
  },

  bannerHTML() {
    let msg = "";
    if (this.closed && (!S || !S.over)) msg = "部屋が閉じられました。";
    else if (this.oppLeft && (!S || !S.over)) msg = "相手が退出しました。";
    else if (!this.oppOnline && S && !S.over) msg = this.role === "guest"
      ? "相手（部屋を作った人）の接続が切れています。戻ってくるのを待っています…"
      : "相手の接続が切れています。戻ってくるのを待っています…";
    if (!msg) return "";
    return `<div class="netbanner" role="status"><span>${msg}</span><button type="button" class="btn" data-act="toTitle">部屋を出る</button></div>`;
  },

  /* ---------- 操作 ---------- */
  handleAct(act) {
    switch (act) {
      case "onlCreate": this.create(); break;
      case "onlJoin": this.join(); break;
      case "onlBack": showStart(); break;
      case "onlCancel": this.leave(); MODE = "cpu"; S = null; app.innerHTML = ""; showStart(); break;
      case "onlCopy":
        navigator.clipboard?.writeText(this.code).then(() => this.lobbyMsg("コピーしました"), () => this.lobbyMsg("コピーできませんでした。合言葉を直接伝えてください"));
        break;
      case "rematch": this.rematch(); break;
      case "resume": this.resume(); break;
    }
  },

  readName() {
    const el = $("#onl-name");
    let n = (el ? el.value : store.get(NAME_KEY) || "").trim().slice(0, 10);
    if (!n) n = "プレイヤー";
    store.set(NAME_KEY, n);
    return n;
  },

  async connect() {
    try { this.uid = await Net.init(); return true; }
    catch (e) {
      console.error(e);
      this.showLobby("サーバーに接続できませんでした。通信状態を確認してください。");
      return false;
    }
  },

  reset() {
    this.unsubs.forEach(f => { try { f(); } catch {} });
    Object.assign(this, { role: null, code: null, room: null, pending: false, oppOnline: true, oppLeft: false, closed: false, fxq: [], unsubs: [], lastSeq: -1, lastBody: null, pubForce: false, netKey: null });
    clearTimeout(this.pendingTimer);
  },

  /* ---------- 部屋を作る（ホスト） ---------- */
  async create() {
    const name = this.readName();
    const deck = Decks.readyDeck(m => this.lobbyMsg(m));
    if (!deck) return;
    this.lobbyMsg("接続中…");
    if (!(await this.connect())) return;
    this.reset();
    let code = null;
    for (let i = 0; i < 6 && !code; i++) {
      const c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
      if (!(await Net.get(`rooms/${c}/host`))) code = c;
    }
    if (!code) return this.lobbyMsg("部屋を作れませんでした。もう一度お試しください。");
    try {
      await Net.set(`rooms/${code}`, { host: this.uid, hostName: name, status: "waiting", dataKey: dataKey(), created: Date.now() });
    } catch (e) {
      console.error(e);
      return this.lobbyMsg("部屋を作れませんでした（サーバーの設定を確認してください）。");
    }
    this.role = "host"; this.code = code; this.myDeck = deck; this.guestDeck = null;
    store.set(ROOM_KEY, { code, role: "host" });
    this.watchRoom();
    this.showWaiting();
  },

  /* ---------- 参加する（ゲスト） ---------- */
  async join(codeArg) {
    const name = this.readName();
    const code = (codeArg || ($("#onl-code") ? $("#onl-code").value : "")).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 4) return this.lobbyMsg("合言葉は4文字です。");
    const deck = Decks.readyDeck(m => this.lobbyMsg(m));
    if (!deck) return;
    this.lobbyMsg("接続中…");
    if (!(await this.connect())) return;
    this.reset();
    const room = await Net.get(`rooms/${code}`);
    if (!room || !room.host || room.status === "closed") return this.lobbyMsg("その合言葉の部屋は見つかりませんでした。");
    if (room.host === this.uid) return this.lobbyMsg("自分で作った部屋には参加できません。別の端末から参加してください。");
    if (room.guest && room.guest !== this.uid) return this.lobbyMsg("その部屋はすでに満員です。");
    if (room.dataKey !== dataKey()) return this.lobbyMsg("相手とカードデータが違います。2人ともページを開き直してから、もう一度試してください。");
    try {
      if (room.guest !== this.uid) await Net.update(`rooms/${code}`, { guest: this.uid, guestName: name });
    } catch (e) {
      console.error(e);
      return this.lobbyMsg("参加できませんでした。");
    }
    this.role = "guest"; this.code = code;
    store.set(ROOM_KEY, { code, role: "guest" });
    // 自分のデッキをホストに送る（対戦処理はホストが行うため）
    Net.push(`rooms/${code}/actions`, { t: "deck", name: deck.name, cards: deck.cards, by: this.uid, at: Date.now() });
    this.watchRoom();
    this.showConnecting("対戦を準備しています");
  },

  /* ---------- 部屋の監視（両者共通） ---------- */
  watchRoom() {
    const base = `rooms/${this.code}`;
    // 自分の接続状態を記録（切断したら自動で消える）
    this.unsubs.push(Net.onConnected(ok => {
      if (!ok) return;
      Net.onDisconnectRemove(`${base}/presence/${this.uid}`);
      Net.set(`${base}/presence/${this.uid}`, true);
    }));
    this.unsubs.push(Net.on(base, room => this.onRoom(room)));
    if (this.role === "host") {
      this.unsubs.push(Net.onChildAdded(`${base}/actions`, (key, a) => this.onAction(key, a)));
    }
  },

  onRoom(room) {
    if (!room || room.status === "closed") {
      if (this.role === "guest" && this.code) {
        this.closed = true;
        if (room && room.state) this.onState(room.state);
        else if (S) render();
        else this.showLobby("部屋が閉じられました。");
      }
      return;
    }
    const prevOppLeft = this.oppLeft;
    this.room = room;
    const ou = this.oppUid();
    this.oppOnline = !ou || !!(room.presence && room.presence[ou]);
    this.oppLeft = !!(ou && room.left && room.left[ou]);

    const netKey = `${this.oppOnline}|${this.oppLeft}`;
    const netChanged = netKey !== this.netKey;
    this.netKey = netKey;
    if (this.role === "host") {
      if (!S && room.guest && room.status === "waiting" && this.guestDeck) return this.startGame();
      if (S && this.oppLeft && !prevOppLeft && !S.over) { forfeit(1, "退出した"); return; }
      if (S && netChanged && MODE === "online") render();
    } else {
      if (room.state) this.onState(room.state);
      if (S && netChanged) render();
    }
  },

  startGame() {
    if (!this.guestDeck || this.guestDeck.by !== this.room.guest || !this.myDeck) return;
    MODE = "online"; setPerspective(0);
    $("#overlay").hidden = true;
    newGame([this.room.hostName || "部屋主", this.room.guestName || "参加者"], [this.myDeck, this.guestDeck]);
  },

  rematch() {
    if (this.role !== "host" || !this.room || !this.room.guest || !S) return;
    if (this.oppLeft) return toast("相手が退出しているため、もう一度対戦できません");
    $("#overlay").hidden = true;
    newGame([this.room.hostName || "部屋主", this.room.guestName || "参加者"], S.decks);
  },

  /* ---------- ホスト：盤面を書き込む ---------- */
  queueFx(sel, text, cls) { this.fxq.push([sel, text, cls]); },
  /* 盤面が変わったときだけ書き込む（force は、変化がなくてもゲストの待ちを解くため） */
  publish(force) {
    if (this.role !== "host" || !S) return;
    if (force) this.pubForce = true;
    if (this.pubQueued) return;
    this.pubQueued = true;
    queueMicrotask(() => {
      this.pubQueued = false;
      if (!S || this.role !== "host") return;
      const { seq, ...rest } = S;
      const body = JSON.stringify(rest);
      if (body === this.lastBody && !this.fxq.length && !this.pubForce) return;
      this.lastBody = body;
      this.pubForce = false;
      S.seq = (S.seq || 0) + 1;
      // じゃんけんでは、ゲストが選ぶまでホストの手を伏せる
      let out = S;
      if (S.phase === "rps" && S.rps.picks[0] && !S.rps.picks[1]) out = { ...S, rps: { ...S.rps, picks: ["?", null] } };
      const payload = JSON.stringify({ S: out, fx: this.fxq });
      this.fxq = [];
      Net.update(`rooms/${this.code}`, { state: payload, status: S.over ? "over" : "playing" }).catch(e => console.error(e));
    });
  },

  /* ---------- ホスト：ゲストの操作を処理 ---------- */
  onAction(key, a) {
    Net.remove(`rooms/${this.code}/actions/${key}`);
    if (!a) return;
    if (a.t === "deck") {
      // 参加者のデッキ。知らないカードは除いて受け取る
      const cards = {};
      Object.entries(cleanDeckCards(a.cards)).forEach(([id, n]) => { if (DEF[id]) cards[id] = n; });
      this.guestDeck = { name: String(a.name || "デッキ").slice(0, 16), cards, by: a.by };
      if (!S && this.room && this.room.guest && this.room.status === "waiting") this.startGame();
      return;
    }
    if (!S || !this.room || a.by !== this.room.guest) return;
    let done = false;
    if (S.phase === "rps" && a.t === "rps") done = rpsPick(1, a.v);
    else if (S.phase === "choose" && a.t === "choose") done = chooseOrder(1, !!a.first);
    else if (S.phase === "mulligan" && a.t === "mull") done = mulligan(1, !!a.redraw);
    else if (S.phase === "play" && S.turn === 1 && !S.over) {
      if (a.t === "play") {
        let idx = a.idx;
        const hand = S.players[1].hand;
        if (hand[idx] !== a.hand) idx = hand.indexOf(a.hand);
        if (idx >= 0) done = playCard(1, idx, a.targets && typeof a.targets === "object" ? a.targets : (a.target ?? {}));
      } else if (a.t === "attack") {
        done = attack(1, a.uid, a.target);
      } else if (a.t === "end") {
        endTurn(1); done = true;
      }
    }
    if (!done) this.publish(true); // 受け付けなかった場合も、ゲストの待ち状態を解くために盤面を送り直す
  },

  /* ---------- ゲスト：操作を送る・盤面を受け取る ---------- */
  send(a) {
    if (this.pending) return;
    this.pending = true;
    Net.push(`rooms/${this.code}/actions`, { ...a, by: this.uid, at: Date.now() });
    render();
    clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      if (!this.pending) return;
      this.pending = false;
      toast("相手から応答がありません。通信状態を確認してください");
      render();
    }, SEND_TIMEOUT);
  },

  onState(str) {
    let p;
    try { p = JSON.parse(str); } catch { return; }
    if (!p || !p.S) return;
    const isNewGame = !S || (S.over && !p.S.over) || p.S.seq < (S.seq || 0);
    if (S && p.S.seq === S.seq && !isNewGame) { if (this.pending) { this.pending = false; render(); } return; }
    // 演出は、古い盤面（倒れる前のキャラがまだいる状態）の上で再生する
    if (S && !isNewGame && Array.isArray(p.fx)) p.fx.forEach(f => playFx(f[0], f[1], f[2]));
    const wasOver = S && S.over;
    S = p.S;
    MODE = "online"; setPerspective(1);
    this.pending = false;
    clearTimeout(this.pendingTimer);
    if (isNewGame) { ui = { sel: null, mode: null }; resultShown = false; $("#overlay").hidden = true; }
    render();
    if (S.over && !wasOver) scheduleResult();
  },

  /* ---------- 退出・降参・復帰 ---------- */
  surrender() {
    if (this.role === "host") { if (S && !S.over) forfeit(0, "降参した"); }
    // ゲストは退出の記録で、ホスト側に降参として扱われる
    toTitle();
  },

  leave() {
    if (!this.code) { this.reset(); return; }
    const base = `rooms/${this.code}`;
    try {
      if (this.role === "host") {
        // 最後の盤面を書き込んでから閉じる
        const final = S ? { state: JSON.stringify({ S, fx: [] }) } : {};
        Net.update(base, { ...final, status: "closed" });
      } else if (this.uid) {
        Net.set(`${base}/left/${this.uid}`, true);
      }
      if (this.uid) Net.remove(`${base}/presence/${this.uid}`);
    } catch (e) { console.error(e); }
    store.del(ROOM_KEY);
    this.reset();
  },

  savedRoom() { return store.get(ROOM_KEY); },

  async resume() {
    const saved = this.savedRoom();
    if (!saved) return;
    this.showConnecting("対戦に戻っています");
    if (!(await this.connect())) return;
    this.reset();
    const room = await Net.get(`rooms/${saved.code}`);
    const mine = room && (saved.role === "host" ? room.host === this.uid : room.guest === this.uid);
    if (!room || room.status === "closed" || !mine) {
      store.del(ROOM_KEY);
      return this.showLobby("前回の部屋はもう閉じられています。");
    }
    this.role = saved.role; this.code = saved.code; this.room = room;
    if (this.role === "host") {
      if (room.state) {
        try { S = JSON.parse(room.state).S; } catch { S = null; }
      }
      if (S) {
        MODE = "online"; setPerspective(0);
        $("#overlay").hidden = true;
        busy = false; resultShown = false;
      }
      this.watchRoom();
      if (!S) this.showWaiting();
      else { render(); if (S.over) scheduleResult(); }
    } else {
      this.watchRoom();
    }
  }
};

/* タイトル画面に「前回の対戦に戻る」を出す */
const _showStart = showStart;
showStart = function () {
  _showStart();
  const saved = Online.savedRoom();
  if (saved && !DATA_INFO.draft) {
    const panel = $("#overlay .panel");
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn primary"; b.dataset.act = "resume";
    b.textContent = `前回の対戦に戻る（合言葉 ${saved.code}）`;
    panel.insertBefore(b, panel.querySelector('[data-act="start"]'));
  }
};

/* 合言葉の入力欄は大文字にそろえる */
document.addEventListener("input", e => {
  if (e.target.id === "onl-code") e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "onl-code") Online.join();
});

/* ---------- 起動 ---------- */
async function boot() {
  try {
    await loadCardData();
  } catch (e) {
    openOverlay(`<div class="panel"><h1 class="title sm">読み込みエラー</h1>
      <p class="lead">カードデータを読み込めませんでした。通信状態を確認して、ページを再読み込みしてください。</p>
      <p class="lead">${esc(e.message)}</p></div>`, "start", true);
    return;
  }
  showStart();
}
registerSW();
boot();
