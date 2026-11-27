/* =========================================================
   対人戦：部屋の作成・参加・同期
   ・部屋を作った人（ホスト）が対戦処理をすべて行い、盤面をサーバーに書き込む
   ・参加した人（ゲスト）は操作をサーバー経由でホストに送り、盤面を受け取って表示する
   ========================================================= */

const NAME_KEY = "kyokai-name";
const WORLD_RULE_KEY = "kyokai-world-rule";
const ROOM_KEY = "kyokai-room";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 見間違えやすい O/0, I/1 は使わない
const SEND_TIMEOUT = 10000;
const TURN_LIMIT_KEY = "kyokai-turn-limit";
/* オンラインの画面のアイコン（線画） */
const HUB_IC = {
  create: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/><path d="M12 7.5v3M10.5 9h3"/></svg>`,
  join: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21M18 12v3M15 12v2"/></svg>`
};
const TURN_LIMITS = [0, 60, 90, 120];   // 1ターンの持ち時間（秒）。0＝なし
const MULL_LIMIT = 30;                  // 最初の手札の引き直しを決める時間（秒）
const TURN_GRACE = 3;                  // 「あなたのターン」などの演出の分だけ、おまけで足す（表示は持ち時間を超えない）

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
  /* オンラインで遊ぶ：アリーナと、友達と対戦（部屋を作る／合言葉で入る）。説明は最小限（オーナー 11-20） */
  showLobby(msg) {
    const deck = Decks.selected(), key = deck ? Decks.keyCard(deck) : null;
    openOverlay(`<div class="panel hub nv-on nv-fab nv-t-play nv-ret-online">
      ${Decks.topbar("オンラインで遊ぶ", "onlBack")}
      <div class="hub-friends"><i class="hf-art" aria-hidden="true"></i><b class="hf-t">友達と対戦</b>
      <div class="hub-grid">
        <button type="button" class="hub-btn" data-act="onlCreateOpen"><span class="hub-ic" aria-hidden="true">${HUB_IC.create}</span><b>部屋を作る</b><small>合言葉を友達に伝える</small></button>
        <button type="button" class="hub-btn" data-act="onlJoinOpen"><span class="hub-ic" aria-hidden="true">${HUB_IC.join}</span><b>合言葉で入る</b><small>友達の部屋に参加</small></button>
      </div></div>
      ${typeof Ghost !== "undefined" ? `<button type="button" class="lvl lvl-mode m-ghost" data-act="ghost"><span class="lvl-art" style="background-image:url('${esc((DEF["y2-kensei"] && DEF["y2-kensei"].art) || "")}')"></span>
        <span class="lvl-body"><span class="lvl-head"><b>分身戦 <i class="beta-tag">β</i></b></span><span class="lvl-desc">友達のデッキの分身と、いつでも戦える</span></span><span class="lvl-go" aria-hidden="true">›</span></button>` : ""}
      ${typeof Arena !== "undefined" ? `<div class="hub-arena">${Arena.lobbyHTML()}</div>` : ""}
      <p class="onl-msg" id="onl-msg" role="status">${msg ? esc(msg) : ""}</p>
    </div>`, "lobby", true);
  },
  /* 部屋を作る：ルールと持ち時間を選ぶ */
  showCreate(msg) {
    const sen = typeof Sentei !== "undefined" && Sentei.on();
    const cur = this.ruleSel || (store.get(WORLD_RULE_KEY) === "1" ? "world" : "std");
    const R = [["std", "通常", "いつものデッキで戦う"], ["world", "世界限定", "2人とも、1つの世界だけのデッキで戦う"], ...(sen ? [["sen", `選定戦${Sentei.beta() ? "β" : ""}`, "デッキは持ち込まず、カードを取り合ってその場で作る"]] : [])];
    const sel = R.find(r => r[0] === cur) ? cur : "std", tl = this.prefLimit();
    openOverlay(`<div class="panel hub nv-on nv-fab nv-t-play nv-ret-onlCreateOpen">
      ${Decks.topbar("部屋を作る", "online")}
      <h3 class="sec">ルール</h3>
      <div class="hub-rules">${R.map(([k, n, d]) => `<button type="button" class="hub-rule ${k === sel ? "on" : ""}" data-act="onlRule" data-v="${k}" aria-pressed="${k === sel}"><b>${n}</b><small>${d}</small></button>`).join("")}</div>
      <input type="checkbox" id="onl-world" hidden ${sel === "world" ? "checked" : ""}><input type="checkbox" id="onl-sen" hidden ${sel === "sen" ? "checked" : ""}>
      <h3 class="sec">1ターンの持ち時間</h3>
      <div class="seg wide">${TURN_LIMITS.map(v => `<button type="button" data-act="onlTl" data-v="${v}" aria-pressed="${v === tl}">${v ? v + "秒" : "なし"}</button>`).join("")}</div>
      <input type="hidden" id="onl-tl" value="${tl}">
      <button type="button" class="btn primary hub-go" data-act="onlCreate">部屋を作る</button>
      <p class="onl-msg" id="onl-msg" role="status">${msg ? esc(msg) : ""}</p>
    </div>`, "lobby", true);
  },
  showJoin(msg) {
    openOverlay(`<div class="panel hub nv-on nv-t-play">
      ${Decks.topbar("合言葉で入る", "online")}
      <p class="lead small">友達から聞いた4文字を入れてください。</p>
      <input class="otxt code hub-code" id="onl-code" placeholder="ABCD" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" inputmode="text" enterkeyhint="go" maxlength="8">
      <button type="button" class="btn primary hub-go" data-act="onlJoin">参加する</button>
      <p class="onl-msg" id="onl-msg" role="status">${msg ? esc(msg) : ""}</p>
    </div>`, "lobby", true);
    setTimeout(() => { const el = $("#onl-code"); if (el) el.focus(); }, 50);
  },

  /* 合言葉の欄：全角・小文字・記号を取り除いて、半角の大文字4文字に */
  fixCode(el) {
    const v = normCodeText(el.value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (el.value !== v) el.value = v;
  },
  lobbyMsg(text) { if (this.arenaErr) return this.arenaErr(text); const m = $("#onl-msg"); if (m) m.textContent = text; else this.showLobby(text); },

  showWaiting() {
    openOverlay(`<div class="panel">
      <h2 class="title sm">相手を待っています</h2>
      <p class="lead">この合言葉を相手に伝えてください。</p>
      <div class="roomcode" aria-label="合言葉">${esc(this.code)}</div>
      ${this.senRule ? `<p class="callout"><b>選定戦ルール</b>相手が入ったら、カードを取り合ってデッキを作ります。</p>` : ""}
      ${!this.senRule && store.get(WORLD_RULE_KEY) === "1" ? `<p class="callout"><b>世界限定ルール</b>2人とも、1つの世界だけのデッキで戦います。</p>` : ""}
      <p class="lead small">1ターンの持ち時間：${this.prefLimit() ? `<b>${this.prefLimit()}秒</b>（過ぎたら自動でターン終了）` : "なし"}</p>
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
    else if (!this.oppOnline && S && !S.over) msg = `相手の接続が切れています。戻ってくるのを待っています…<small id="onl-off">${this.offLeft() != null ? `あと${this.offLeft()}秒戻らなければ、あなたの勝ちになります。` : ""}</small>`;
    if (!msg) return "";
    return `<div class="netbanner" role="status"><span>${msg}</span><button type="button" class="btn" data-act="toTitle">部屋を出る</button></div>`;
  },

  /* ---------- 操作 ---------- */
  handleAct(act, el) {
    switch (act) {
      case "onlDeck": this.showDeckPick(); break;
      case "onlDeckSet": this.setDeck(el && el.dataset.id); break;
      case "onlDeckBack": if (S && S.over) showResult(myResult()); else $("#overlay").hidden = true; break;
      case "onlCreateOpen": this.showCreate(); break;
      case "onlJoinOpen": this.showJoin(); break;
      case "onlRule": this.ruleSel = el.dataset.v; this.showCreate(); break;
      case "onlTl": { const v = +el.dataset.v; store.set(TURN_LIMIT_KEY, v); const i = $("#onl-tl"); if (i) i.value = v; document.querySelectorAll('[data-act="onlTl"]').forEach(b => b.setAttribute("aria-pressed", b === el)); break; }
      case "onlCreate": this.create(); break;
      case "onlJoin": this.join(); break;
      case "onlBack": showStart(); break;
      case "onlCancel": this.leave(); MODE = "cpu"; S = null; app.innerHTML = ""; showStart(); break;
      case "onlCopy":
        copyText(this.code).then(ok => this.lobbyMsg(ok ? "コピーしました" : "コピーできませんでした。合言葉を直接伝えてください"));
        break;
      case "rematch": this.askAgain(); break;
      case "resume": this.resume(); break;
    }
  },

  readName() {
    // 名前の欄があるとき（友達と対戦のロビー）だけ、入れた名前を保存する。
    // 欄がないとき（アリーナから入るとき）は、いまの名前をそのまま使う。
    // 前は欄がないと「見習いプレイヤー」で上書きして保存していた（アリーナで名前が消えた不具合。2026-11-19）
    const el = $("#onl-name");
    const typed = el ? String(el.value || "").trim().slice(0, 10) : "";
    if (typed) { setPlayerName(typed); return typed; }
    return playerName();
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
    Object.assign(this, { arenaErr: null, senRule: false, myAgain: null, seenAgain: null, role: null, code: null, room: null, pending: false, oppOnline: true, oppLeft: false, closed: false, fxq: [], unsubs: [], lastSeq: -1, lastBody: null, pubForce: false, netKey: null, skew: 0, seenTimeout: null, lastBeep: null, seenOppDchg: undefined, oppDeckChanged: false, seenStamp: undefined, myDeck: null, guestDeck: null, offSince: null });
    clearTimeout(this.pendingTimer);
  },

  /* ---------- 部屋を作る（ホスト） ---------- */
  /* 選定戦ルールのときに渡す「デッキ」：カードは空。名前・アイコン・称号・スリーブ・枠・開放している弾・魔光加工と別イラスト */
  senMeta() {
    const icon = Account.icon(), title = typeof Titles !== "undefined" ? Titles.curName() : "", lk = typeof Skins !== "undefined" ? Skins.deckLook() : {};
    return { name: "選定戦", cards: {}, sen: true, opened: SenDraft.openedSets(), ...(icon ? { icon } : {}), ...(title ? { title } : {}), ...lk, ...(typeof Skins !== "undefined" ? { look: Skins.looks() } : {}) };
  },
  /* opts（アリーナから）：{ arena: 回のID, rule, deck, code }。合言葉は決まっていて、ロビーの欄は読まない */
  async create(opts = {}) {
    const A = opts.arena || null;
    this.arenaErr = A ? (t => Arena.show(t)) : null;
    const name = this.readName();
    const senRule = A ? opts.rule === "sen" : !!($("#onl-sen") && $("#onl-sen").checked);
    const deck = opts.deck || (senRule ? this.senMeta() : Decks.readyDeck(m => this.lobbyMsg(m)));
    if (!deck) return;
    const worldRule = !A && !senRule && !!($("#onl-world") && $("#onl-world").checked);
    if (!A) {
      store.set(WORLD_RULE_KEY, worldRule ? "1" : "0");
      const tl = $("#onl-tl") ? +$("#onl-tl").value : this.prefLimit();
      store.set(TURN_LIMIT_KEY, TURN_LIMITS.includes(tl) ? tl : 90);
    }
    if (!A && deck.sample && Decks.sampleLeft() <= 0) return this.lobbyMsg(`サンプルデッキで友達と対戦できるのは、1日${CONFIG.SAMPLE_ONLINE_DAY ?? 3}回までです。今日はもう使えません（明日また使えます）。自分のカードで組んだデッキなら対戦できます。`);
    if (worldRule && !deckWorld(deck)) return this.lobbyMsg(`世界限定ルールでは、30枚すべて同じ世界のカードで組んだデッキが必要です。今のデッキ「${deck.name}」は世界が混ざっています。`);
    this.lobbyMsg("接続中…");
    if (!(await this.connect())) return;
    this.reset(); this.arenaErr = A ? (t => Arena.show(t)) : null;
    let code = opts.code || null;
    for (let i = 0; i < 6 && !code; i++) {
      const c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
      if (!(await Net.get(`rooms/${c}/host`))) code = c;
    }
    if (!code) return this.lobbyMsg("部屋を作れませんでした。もう一度お試しください。");
    try {
      await Net.set(`rooms/${code}`, { host: this.uid, hostName: name, status: "waiting", dataKey: dataKey(), created: Date.now(), tl: A ? 90 : this.prefLimit(), ...(A ? { arena: A } : {}), ...(A && opts.rule === "set1" ? { rule: "set1" } : senRule ? { rule: "sen" } : worldRule ? { rule: "world" } : {}) });
    } catch (e) {
      console.error(e);
      return this.lobbyMsg("部屋を作れませんでした（サーバーの設定を確認してください）。");
    }
    this.role = "host"; this.code = code; this.myDeck = deck; this.guestDeck = null; this.mySample = !!deck.sample; this.senRule = senRule;
    if (this.mySample && !A) Decks.useSample();
    store.set(ROOM_KEY, { code, role: "host", sample: this.mySample });
    this.watchRoom();
    if (A) this.showConnecting("対戦相手が見つかりました"); else this.showWaiting();
  },

  /* ---------- 参加する（ゲスト） ---------- */
  async join(codeArg, opts = {}) {
    const A = !!opts.arena;
    this.arenaErr = A ? (t => Arena.show(t)) : null;
    const name = this.readName();
    const code = normCodeText(codeArg || ($("#onl-code") ? $("#onl-code").value : "")).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (code.length !== 4) return this.lobbyMsg("合言葉は4文字です。");
    if (A) this.showConnecting("対戦相手が見つかりました"); else this.lobbyMsg("接続中…");
    if (!(await this.connect())) return;
    let room0 = await Net.get(`rooms/${code}`);
    for (let i = 0; A && i < 15 && !(room0 && room0.host); i++) { await new Promise(r => setTimeout(r, 600)); room0 = await Net.get(`rooms/${code}`); }   // アリーナ：相手が部屋を作り終えるのを待つ
    const senRule = !!(room0 && room0.rule === "sen");
    const deck = senRule ? this.senMeta() : opts.deck || Decks.readyDeck(m => this.lobbyMsg(m));
    if (!deck) return;
    if (room0 && room0.rule === "set1" && !deckSet1(deck)) return this.lobbyMsg("この部屋は第1弾限定です。第1弾のカードだけで組んだデッキを選んでください。");
    if (!A && deck.sample && Decks.sampleLeft() <= 0) return this.lobbyMsg(`サンプルデッキで友達と対戦できるのは、1日${CONFIG.SAMPLE_ONLINE_DAY ?? 3}回までです。今日はもう使えません（明日また使えます）。自分のカードで組んだデッキなら対戦できます。`);
    this.reset(); this.arenaErr = A ? (t => Arena.show(t)) : null;
    const room = await Net.get(`rooms/${code}`);
    if (!room || !room.host || room.status === "closed") return this.lobbyMsg("その合言葉の部屋は見つかりませんでした。");
    if (room.host === this.uid) return this.lobbyMsg("自分で作った部屋には参加できません。別の端末から参加してください。");
    if (room.guest && room.guest !== this.uid) return this.lobbyMsg("その部屋はすでに満員です。");
    if (room.dataKey !== dataKey()) return this.lobbyMsg("相手とカードデータが違います。2人ともページを開き直してから、もう一度試してください。");
    if (room.rule === "world" && !deckWorld(deck)) return this.lobbyMsg(`この部屋は世界限定ルールです。30枚すべて同じ世界のカードで組んだデッキを使ってください（今のデッキ「${deck.name}」は世界が混ざっています）。`);
    try {
      if (room.guest !== this.uid) await Net.update(`rooms/${code}`, { guest: this.uid, guestName: name });
    } catch (e) {
      console.error(e);
      return this.lobbyMsg("参加できませんでした。");
    }
    this.role = "guest"; this.code = code; this.myDeck = deck; this.mySample = !!deck.sample; this.senRule = senRule;
    if (this.mySample && !A) Decks.useSample();
    store.set(ROOM_KEY, { code, role: "guest", sample: this.mySample });
    // 自分のデッキをホストに送る（対戦処理はホストが行うため）
    Net.push(`rooms/${code}/actions`, { t: "deck", ...(deck.sen ? { sen: 1, opened: deck.opened } : {}), name: deck.name, cards: deck.cards, ...(deck.icon ? { icon: deck.icon } : {}), ...(deck.key ? { key: deck.key } : {}), ...(deck.title ? { title: deck.title } : {}), ...(deck.sleeve ? { sleeve: deck.sleeve } : {}), ...(deck.frame ? { frame: deck.frame } : {}), ...(deck.look ? { look: deck.look } : {}), by: this.uid, at: Date.now() });
    this.watchRoom();
    this.showConnecting("対戦を準備しています");
  },

  /* ---------- 部屋の監視（両者共通） ---------- */
  watchRoom() {
    const base = `rooms/${this.code}`;
    this.startTicker();
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
        if (S && !S.over && S.players && S.phase !== "draft") this.oppGone("退出した");   // 部屋を作った人が決着前に出ていった
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

    // 相手（部屋主）のスタンプ
    if (this.role === "guest" && room.stamp && room.stamp.at !== this.seenStamp) { const first = this.seenStamp === undefined; this.seenStamp = room.stamp.at; if (!first && typeof Stamps !== "undefined" && Date.now() - (room.stamp.at || 0) < 15000 + Math.abs(this.skew || 0)) Stamps.show(OP, room.stamp.id); }
    else if (this.seenStamp === undefined) this.seenStamp = room.stamp ? room.stamp.at : null;
    // 相手がデッキを変えたら知らせる（中身は見せない）
    const oc = room.dchg && room.dchg[this.role === "host" ? "guest" : "host"];
    if (oc && oc !== this.seenOppDchg) {
      if (this.seenOppDchg !== undefined) { toast("相手がデッキを変更しました"); this.oppDeckChanged = true; const rd = $(".res-deck"); if (rd && !rd.querySelector("small")) rd.insertAdjacentHTML("beforeend", "<small>相手はデッキを変更しました</small>"); }
      this.seenOppDchg = oc;
    } else if (!oc && this.seenOppDchg === undefined) this.seenOppDchg = null;
    // もう一度：相手が押したら知らせる
    const ag = this.againOf(), opr = this.role === "host" ? "guest" : "host", agk = ag[opr] ? ag.g : null;
    if (agk && agk !== this.seenAgain) { this.seenAgain = agk; toast("相手が「もう一度」を希望しています"); }
    this.paintAgain();
    const netKey = `${this.oppOnline}|${this.oppLeft}`;
    const netChanged = netKey !== this.netKey;
    this.netKey = netKey;
    if (this.role === "host") {
      if (!S && room.guest && room.status === "waiting" && this.guestDeck) return this.startGame();
      if (S && this.oppLeft && !prevOppLeft && !S.over) {
        if (S.phase === "draft") { S.draft.gone = true; render(); return; }
        // 参加者が「部屋を作った人の接続が切れたので勝ち」として出ていったときは、こちらの負け
        if (room.left[ou] === "win") forfeit(0, "接続切れのまま戻らなかった"); else forfeit(1, "退出した");
        this.publish(true); return;
      }
      if (S && netChanged && MODE === "online") render();
    } else {
      if (room.state) this.onState(room.state);
      if (S && netChanged) render();
    }
  },

  /* スタンプを送る（参加者は操作として、部屋主は部屋の stamp に書く） */
  sendStamp(id) {
    if (!this.code) return;
    if (this.role === "guest") Net.push(`rooms/${this.code}/actions`, { t: "stamp", id, by: this.uid, at: Date.now() });
    else Net.update(`rooms/${this.code}`, { stamp: { id, at: Date.now() } }).catch(e => console.error(e));
  },
  /* ---------- 対戦の合間にデッキを変える ---------- */
  deckOK(d) {
    if (!d) return "デッキが見つかりません";
    const pr = Decks.problems(d);
    if (pr.length) return pr[0];
    if (this.room && this.room.rule === "world" && !deckWorld(d)) return "世界限定ルールの部屋なので、30枚すべて同じ世界のカードのデッキが必要です";
    if (this.room && this.room.rule === "set1" && !deckSet1(d)) return "第1弾限定なので、第1弾のカードだけのデッキが必要です";
    if (d.free && Decks.sampleOK() && !this.mySample && Decks.sampleLeft() <= 0) return "サンプルデッキで友達と対戦できる回数（1日）を使い切っています";
    return "";
  },
  showDeckPick(msg) {
    const list = Decks.mine().filter(d => !Decks.isLtd(d));
    const cur = this.myDeck && this.myDeck.name;
    openOverlay(`<div class="panel">
      <h2 class="title sm">次の対戦のデッキ</h2>
      <p class="lead small">いま使うデッキ：<b>${esc(cur || "—")}</b>。選ぶと次の対戦（「同じ相手ともう一度」）から使います。相手には「デッキを変更した」ことだけが伝わり、中身は見えません。</p>
      ${this.room && this.room.rule === "world" ? `<p class="callout"><b>世界限定ルール</b>30枚すべて同じ世界のカードのデッキだけ選べます。</p>` : ""}
      <ul class="dlist">${list.map(d => { const why = this.deckOK(d);
        return `<li class="drow"><span class="drow-main"><b>${esc(d.name)}</b><span class="hint">${why ? esc(why) : `${deckCount(d)}枚${d.free ? " ・ サンプル（Gはもらえません）" : ""}`}</span></span>
          <div class="drow-acts"><button type="button" class="btn sm ${why ? "" : "primary"}" data-act="onlDeckSet" data-id="${esc(d.id)}" ${why ? "disabled" : ""}>これにする</button></div></li>`; }).join("") || `<li class="drow"><span class="hint">使えるデッキがありません。</span></li>`}</ul>
      <p class="onl-msg" id="onl-msg" role="status">${msg ? esc(msg) : ""}</p>
      <button type="button" class="btn" data-act="onlDeckBack">戻る</button>
    </div>`, "lobby", true);
  },
  setDeck(id) {
    const d = Decks.find(id), why = this.deckOK(d);
    if (why) return this.showDeckPick(why);
    const icon = Account.icon(), sample = !!(d.free && Decks.sampleOK());
    const title = typeof Titles !== "undefined" ? Titles.curName() : "";
    const deck = { name: d.name, cards: { ...d.cards }, ...(sample ? { sample: true } : {}), ...(icon ? { icon } : {}), ...(d.key ? { key: d.key } : {}), ...(title ? { title } : {}), ...(typeof Skins !== "undefined" ? Skins.deckLook(d.cards) : {}) };
    if (sample && !this.mySample) Decks.useSample();
    this.myDeck = deck; this.mySample = sample;
    Decks.select(d.id);
    store.set(ROOM_KEY, { code: this.code, role: this.role, sample });
    if (this.role === "guest") Net.push(`rooms/${this.code}/actions`, { t: "deck", name: deck.name, cards: deck.cards, ...(deck.icon ? { icon: deck.icon } : {}), ...(deck.key ? { key: deck.key } : {}), ...(deck.title ? { title: deck.title } : {}), ...(deck.sleeve ? { sleeve: deck.sleeve } : {}), ...(deck.frame ? { frame: deck.frame } : {}), ...(deck.look ? { look: deck.look } : {}), by: this.uid, at: Date.now() });
    Net.update(`rooms/${this.code}/dchg`, { [this.role]: Date.now() }).catch(e => console.error(e));
    toast(`次の対戦は「${deck.name}」で戦います`);
    if (S && S.over) showResult(myResult()); else $("#overlay").hidden = true;
  },

  startGame() {
    if (!this.guestDeck || this.guestDeck.by !== this.room.guest || !this.myDeck) return;
    if (this.room.rule === "sen" && typeof SenDraft !== "undefined") { this.logSent = null; return SenDraft.begin(); }   // 選定戦：取り合いから
    MODE = "online"; if (typeof Preview !== "undefined") Preview.revert(); setPerspective(0);
    $("#overlay").hidden = true;
    this.logSent = null;
    newGame([this.room.hostName || "部屋主", this.room.guestName || "参加者"], [this.myDeck, this.guestDeck]);
  },

  /* ---------- もう一度：2人とも押したら始まる（片方が押すと、もう片方に「受ける」が出る） ----------
     部屋の again = { g: 対戦のID, host: true/false, guest: true/false }。書くのは部屋を作った人だけ（参加者は操作として送る） */
  againOf() { const A = this.room && this.room.again; return A && S && A.g === S.gid ? A : {}; },
  askAgain() {
    if (!S || !S.over || this.oppLeft || this.closed) return;
    if (this.role === "host") this.setAgain("host");
    else { this.myAgain = S.gid; Net.push(`rooms/${this.code}/actions`, { t: "again", g: S.gid, by: this.uid, at: Date.now() }); this.paintAgain(); }
  },
  setAgain(who) {
    if (this.role !== "host" || !S || !S.over) return;
    const A = { ...this.againOf(), g: S.gid, [who]: true };
    if (A.host && A.guest) { Net.update(`rooms/${this.code}`, { again: null }).catch(e => console.error(e)); return this.rematch(); }
    if (this.room) this.room.again = A;
    Net.update(`rooms/${this.code}`, { again: A }).catch(e => console.error(e));
    this.paintAgain();
  },
  againHTML() {
    // アリーナ：同じ相手とは続けず、次の相手を探す
    if (this.room && this.room.arena) return `<button type="button" class="btn primary res-main" data-act="arenaNext">次の相手を探す</button><button type="button" class="btn" data-act="arenaBack">アリーナの画面へ</button>`;
    if (this.oppLeft || this.closed) return `<p class="datainfo">相手が退出したので、もう一度は対戦できません</p>`;
    const A = this.againOf(), me = this.role, op = me === "host" ? "guest" : "host";
    const mine = A[me] || (me === "guest" && this.myAgain && S && this.myAgain === S.gid);
    if (mine) return `<p class="res-ask">相手の返事を待っています<span class="pg-dots"><i></i><i></i><i></i></span></p>`;
    if (A[op]) return `<p class="res-ask on">相手が「もう一度」を希望しています</p><button type="button" class="btn primary res-main" data-act="rematch">受けて、もう一度対戦</button>`;
    return `<button type="button" class="btn primary res-main" data-act="rematch">同じ相手ともう一度</button><p class="datainfo">2人とも押すと始まります</p>`;
  },
  paintAgain() { const el = document.getElementById("res-again"); if (el) el.innerHTML = this.againHTML(); },
  rematch() {
    if (this.role !== "host" || !this.room || !this.room.guest || !S) return;
    if (this.oppLeft) return toast("相手が退出しているため、もう一度対戦できません");
    $("#overlay").hidden = true;
    this.logSent = null;
    this.oppDeckChanged = false;
    if (this.room.rule === "sen" && typeof SenDraft !== "undefined") return SenDraft.begin();   // 選定戦：毎回デッキを作り直す
    newGame([this.room.hostName || "部屋主", this.room.guestName || "参加者"], [this.myDeck || S.decks[0], this.guestDeck || S.decks[1]]);   // デッキを変えていれば、新しいデッキで
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
      if (S.phase === "draft" && S.draft && S.draft.st === "rps" && S.draft.hands[0] && !S.draft.hands[1]) out = { ...S, draft: { ...S.draft, hands: ["?", null] } };
      // ログは増え続けて毎回の送信が重くなるので、前回から増えた分だけ送る（15回に1回と決着時はまとめて送り直す）
      const L = S.log || [];
      this.pubN = (this.pubN || 0) + 1;
      if (this.logSent == null || this.logSent > L.length || this.pubN % 15 === 0 || S.over) this.logSent = 0;
      const lg = { base: this.logSent, add: L.slice(this.logSent) };
      this.logSent = L.length;
      const payload = JSON.stringify({ S: { ...out, log: [] }, lg, fx: this.fxq, now: Date.now() });
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
      const icon = typeof a.icon === "string" && DEF[a.icon] && DEF[a.icon].type === "char" ? a.icon : null;
      // 相手の見た目（スリーブ・枠）は、売り場にある絵だけ受け取る
      const skinLook = x => { const ok = (k, v) => typeof v === "string" && typeof SKINS !== "undefined" && SKINS.some(s => s.kind === k && s.art === v); const lk = typeof Skins !== "undefined" ? Skins.cleanLook(x.look) : {}; return { ...(ok("sleeve", x.sleeve) ? { sleeve: x.sleeve } : {}), ...(ok("frame", x.frame) ? { frame: x.frame } : {}), ...(Object.keys(lk).length ? { look: lk } : {}) }; };
      this.guestDeck = { name: String(a.name || "デッキ").slice(0, 16), cards, by: a.by, ...(a.sen ? { opened: (Array.isArray(a.opened) ? a.opened : Object.values(a.opened || {})).filter(x => typeof x === "string").slice(0, 30) } : {}), ...(icon ? { icon } : {}), ...(typeof a.key === "string" && DEF[a.key] ? { key: a.key } : {}), ...(typeof a.title === "string" && a.title ? { title: a.title.slice(0, 12) } : {}), ...skinLook(a) };
      if (S && S.over) { this.oppDeckChanged = true; toast("相手がデッキを変更しました"); const rd = $(".res-deck"); if (rd && !rd.querySelector("small")) rd.insertAdjacentHTML("beforeend", "<small>相手はデッキを変更しました</small>"); }   // 参加者の dchg は書き込めないので、デッキの操作で知る
      if (!S && this.room && this.room.guest && this.room.status === "waiting") this.startGame();
      return;
    }
    if (a.t === "again" && this.room && a.by === this.room.guest) { if (S && S.over && a.g === S.gid) this.setAgain("guest"); return; }
    if (a.t === "stamp" && this.room && a.by === this.room.guest) { if (typeof Stamps !== "undefined") Stamps.show(OP, a.id); return; }
    if (!S || !this.room || a.by !== this.room.guest) return;
    let done = false;
    if (S.phase === "draft" && (a.t === "drps" || a.t === "dpick" || a.t === "dready")) done = typeof SenDraft !== "undefined" && SenDraft.act(1, { t: a.t, v: a.v, i: +a.i });
    else if (S.phase === "rps" && a.t === "rps") done = rpsPick(1, a.v);
    else if (S.phase === "choose" && a.t === "choose") done = chooseOrder(1, !!a.first);
    else if (S.phase === "mulligan" && a.t === "mull") done = mulligan(1, !!a.redraw);
    else if (S.phase === "play" && S.turn === 1 && !S.over) {
      if (a.t === "play") {
        let idx = a.idx;
        const hand = S.players[1].hand;
        if (hand[idx] !== a.hand) idx = hand.indexOf(a.hand);
        if (idx >= 0) done = playCard(1, idx, a.targets && typeof a.targets === "object" ? a.targets : (a.target ?? {}), !!a.gear);
      } else if (a.t === "attack") {
        done = attack(1, a.uid, a.target);
      } else if (a.t === "dig") {
        done = resolveDig(1, +a.i);
      } else if (a.t === "pick") {
        done = resolvePick(1, Array.isArray(a.sel) ? a.sel.map(Number) : Object.values(a.sel || {}).map(Number));
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
    if (this.role === "guest" && this.closed && S && S.over) return;   // 自分の画面で決着したあとは受け取らない
    let p;
    try { p = JSON.parse(str); } catch { return; }
    if (!p || !p.S) return;
    const isNewGame = !S || (S.over && !p.S.over) || p.S.seq < (S.seq || 0);
    if (S && p.S.seq === S.seq && !isNewGame) { if (this.pending) { this.pending = false; render(); } return; }
    // 演出は、古い盤面（倒れる前のキャラがまだいる状態）の上で再生する
    if (S && !isNewGame && Array.isArray(p.fx)) p.fx.forEach(f => playFx(f[0], f[1], f[2]));
    const wasOver = S && S.over;
    const prevLog = (S && !isNewGame && S.log) || [];
    if (typeof p.now === "number") this.skew = Date.now() - p.now;   // ホストの時計とのずれ（持ち時間の表示に使う）
    S = p.S;
    if (p.lg) S.log = prevLog.slice(0, p.lg.base).concat(p.lg.add || []);   // ログは増えた分だけ届く
    MODE = "online"; if (typeof Preview !== "undefined") Preview.revert(); setPerspective(1);
    this.pending = false;
    clearTimeout(this.pendingTimer);
    if (isNewGame || (S && S.gid !== this.lastGid)) { this.oppDeckChanged = false; Motion.reset(); Finale.reset(); Mull.close(); ui = { sel: null, mode: null }; resultShown = false; $("#overlay").hidden = true; lastBoardHTML = ""; }   // 前の対戦の「負けで灰色」を残さない
    this.lastGid = S.gid;
    this.noticeTimeout();
    render();
    if (S.over && !wasOver) scheduleResult();
  },

  /* ---------- 退出・降参・復帰 ---------- */
  surrender() {
    if (this.role === "host") { if (S && !S.over && S.phase !== "draft") forfeit(0, "降参した"); }
    // ゲストは退出の記録で、ホスト側に降参として扱われる
    toTitle();
  },

  leave() {
    if (!this.code) { this.reset(); return; }
    const base = `rooms/${this.code}`;
    try {
      if (this.role === "host") {
        // 最後の盤面を書き込んでから閉じる
        // 番号（seq）を進めて書く。前は同じ番号のままだったので、参加者の画面が「もう受け取った盤面」と見なして、降参が伝わらなかった（2026-11-19）
        if (S) S.seq = (S.seq || 0) + 1;
        const final = S ? { state: JSON.stringify({ S, fx: [], now: Date.now() }) } : {};
        Net.update(base, { ...final, status: "closed" });
      } else if (this.uid) {
        Net.set(`${base}/left/${this.uid}`, true);
      }
      if (this.uid) Net.remove(`${base}/presence/${this.uid}`);
    } catch (e) { console.error(e); }
    store.del(ROOM_KEY);
    this.reset();
  },

  /* ---------- 1ターンの持ち時間（ホストが時間を決めて、切れたらターンを終わらせる） ---------- */
  skew: 0,
  ticker: null,
  prefLimit() { const v = store.get(TURN_LIMIT_KEY); return TURN_LIMITS.includes(v) ? v : 90; },
  turnLimit() { return this.room ? +this.room.tl || 0 : 0; },
  dlKey() { if (!S || S.over) return null; if (S.phase === "play") return "p" + S.turnNo; if (S.phase === "mulligan") return "m"; return null; },
  secLeft() {
    const k = this.dlKey();
    if (!k || !S.dl || S.dlKey !== k) return null;
    const sec = Math.max(0, Math.ceil((S.dl - (Date.now() - (this.role === "host" ? 0 : this.skew))) / 1000));
    return Math.min(sec, k === "m" ? MULL_LIMIT : this.turnLimit() || sec);
  },
  startTicker() { if (!this.ticker) this.ticker = setInterval(() => this.tick(), 250); },
  /* 相手の接続が切れたまま OFF_LIMIT 秒たったら、こちらの勝ちにする（ずっと待たされないように） */
  offLimit: 60,   // 相手の接続が切れてから、こちらの勝ちになるまでの秒数
  offLeft() { return this.offSince ? Math.max(0, Math.ceil((this.offSince + this.offLimit * 1000 - Date.now()) / 1000)) : null; },
  watchOff() {
    const live = MODE === "online" && this.code && S && !S.over && S.players && S.phase !== "draft" && !this.oppLeft && !this.closed;
    if (!live || this.oppOnline) { this.offSince = null; return; }
    if (!this.offSince) this.offSince = Date.now();
    const el = document.getElementById("onl-off"); if (el) el.textContent = `あと${this.offLeft()}秒戻らなければ、あなたの勝ちになります。`;
    if (Date.now() - this.offSince > this.offLimit * 1000) { this.offSince = null; this.oppGone("接続切れのまま戻らなかった"); }
  },
  /* 相手がいなくなった：こちらの勝ちで決着する */
  oppGone(reason) {
    if (!S || S.over) return;
    if (this.role === "host") { forfeit(1, reason); this.publish(true); return; }
    // 参加者：盤面を決めるのは部屋を作った人なので、自分の画面で決着させ、以後の盤面は受け取らない。
    // 部屋を作った人が後から戻っても、勝ちが二重にならないよう「勝ちとして出た」と書いておく
    this.closed = true;
    try { if (this.code && this.uid) Net.set(`rooms/${this.code}/left/${this.uid}`, "win"); } catch (e) { console.error(e); }
    forfeit(OP, reason);
  },
  tick() {
    this.watchOff();
    if (MODE !== "online" || !S || !this.code) { this.paint(null); return; }
    const tl = this.turnLimit();
    if (this.role === "host" && tl && !this.blocked()) {
      const k = this.dlKey();
      // 相手の接続が切れている間は、時間を止めておく（戻ってきたとき、すぐ時間切れにならないように）
      if (!this.oppOnline && S.dl && S.dlKey === k && S.dl - Date.now() < 15000) S.dl = Date.now() + 15000;
      if (k && S.dlKey !== k) { S.dlKey = k; S.dl = Date.now() + ((k === "m" ? MULL_LIMIT : tl) + TURN_GRACE) * 1000; render(); this.publish(true); }
      else if (k && S.dl && Date.now() > S.dl + 300) this.expire(k);
    }
    this.paint(tl ? this.secLeft() : null);
  },
  expire(k) {
    S.dl = 0;   // 同じ時間切れを2回処理しない
    if (k === "m") {
      const who = [0, 1].filter(pi => S.mull[pi] == null);
      S.timeout = { n: (S.timeout && S.timeout.n || 0) + 1, pis: who, m: true };
      who.forEach(pi => mulligan(pi, false));
    } else {
      const pi = S.turn;
      S.timeout = { n: (S.timeout && S.timeout.n || 0) + 1, pis: [pi] };
      if (pi === ME) { ui = { sel: null, mode: null }; try { cancelDrag(); } catch (e) {} if (typeof renderSheet === "function") renderSheet(); }
      log(`${pname(pi)}の持ち時間が切れたので、ターンを終了した。`);
      endTurn(pi);
    }
    this.noticeTimeout();
    render(); this.publish(true);
  },
  /* 自分の時間が切れたときだけ知らせる */
  noticeTimeout() {
    const t = S && S.timeout;
    if (!t || t.n === this.seenTimeout) return;
    const first = this.seenTimeout == null && this.role === "guest";
    this.seenTimeout = t.n;
    if (first || !(t.pis || []).includes(ME)) return;
    toast(t.m ? "時間切れ：最初の手札をそのまま使います" : "時間切れ：ターンを終了しました");
  },
  /* 残り時間の表示（行動中の人の名前の横。最初の手札を選ぶ間は画面の上） */
  paint(sec) {
    const on = sec != null && S && !S.over;
    const mine = on && (S.phase === "mulligan" ? S.mull[ME] == null : S.turn === ME);
    document.querySelectorAll("[data-tt]").forEach(el => {
      el.hidden = !on || S.phase !== "play";
      if (el.hidden) return;
      el.textContent = `残り${sec}秒`;
      el.classList.toggle("warn", sec <= 15);
    });
    let f = document.getElementById("mulltimer");
    const showM = on && S.phase === "mulligan";
    if (showM && !f) { f = document.createElement("div"); f.id = "mulltimer"; f.setAttribute("role", "timer"); document.body.appendChild(f); }
    if (f) { f.hidden = !showM; if (showM) { f.textContent = mine ? `決めるまで 残り${sec}秒` : `相手が選んでいます（残り${sec}秒）`; f.classList.toggle("warn", sec <= 10); } }
    // 自分の番の最後の10秒は、1秒ごとに小さく音を鳴らす
    if (mine && sec <= 10 && sec > 0 && sec !== this.lastBeep) { this.lastBeep = sec; if (typeof Sound !== "undefined") Sound.play("click"); }
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
    this.role = saved.role; this.code = saved.code; this.room = room; this.mySample = !!saved.sample;
    if (this.role === "host") {
      if (room.state) {
        try { S = JSON.parse(room.state).S; } catch { S = null; }
      }
      if (S) {
        MODE = "online"; if (typeof Preview !== "undefined") Preview.revert(); setPerspective(0);
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
    const host = panel.querySelector(".homemain") || panel;
    host.insertBefore(b, host.querySelector(".battles"));
  }
};

/* 合言葉の入力欄は大文字にそろえる */
document.addEventListener("input", e => {
  // 日本語のフリック入力は「変換中」の文字を途中で書き換えると入力が壊れるので、変換が終わってから整える
  if (e.target.id === "onl-code" && !e.isComposing) Online.fixCode(e.target);
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "onl-code") Online.join();
});

/* ---------- 起動 ---------- */
/* ---------- メンテナンス（2026-11-16） ----------
   工房の設定 MAINT を 1 にして公開すると、プレイヤーは入れなくなる。
   ・開いたとき：メンテナンスの画面だけを出す
   ・遊んでいる人：1分ごとに確かめ、対戦中は最後まで遊ばせて、ホームに戻ったところで止める
   ・運営（オーナー）は、メンテナンス画面の「メンテナンス中」の文字を7回続けて押すと、この端末だけ入れる */
const Maint = {
  pending: false, taps: 0,
  /* 連打で入れるのは、今回のメンテナンスの間だけ（12時間で切れる。メンテナンスが終わったら消す） */
  pass() { try { const t = +localStorage.getItem("kyokai-maint-pass") || 0; return t > 1 && Date.now() - t < 12 * 3600e3; } catch (e) { return false; } },
  on(cfg = CONFIG) {
    const m = !!(cfg && +cfg.MAINT);
    if (!m) { try { localStorage.removeItem("kyokai-maint-pass"); } catch (e) {} }
    return m && !this.pass() && !adminOn();
  },
  screen() {
    this.pending = true;
    openOverlay(`<div class="panel maint">
      <h1 class="title sm" data-act="maintTap">メンテナンス中</h1>
      <p class="lead">ただいま、ゲームの調整や修正を行っています。<br>終わるまで、しばらくお待ちください。</p>
      ${CONFIG.MAINT_NOTE ? `<p class="callout maint-note">${esc(CONFIG.MAINT_NOTE)}</p>` : ""}
      <p class="lead small">手に入れたカードやGは、そのまま残っています。終わったら、アプリを開き直してください。</p>
      <button type="button" class="btn primary" data-act="maintCheck">終わったか確かめる</button></div>`, "start", true);
  },
  async check(silent) {
    try {
      const d = normalizeData(await fetchPublished());
      CONFIG.MAINT_NOTE = d.config.MAINT_NOTE;
      if (!this.on(d.config)) { if (this.pending) { toast("メンテナンスが終わりました。読み込み直します"); setTimeout(() => location.reload(), 900); } return false; }
      if (!this.pending) { this.pending = true; if (!S) this.screen(); }   // 対戦中なら、終わってホームに戻ったときに止める
      else if (!silent) toast("まだメンテナンス中です");
      return true;
    } catch (e) { if (!silent) toast("確かめられませんでした（通信を確認してください）"); return null; }
  },
  watch() { setInterval(() => { if (!document.hidden) this.check(true); }, 60000); document.addEventListener("visibilitychange", () => { if (!document.hidden) this.check(true); }); },
  handleAct(act) {
    if (act === "maintCheck") { this.check(false); return true; }
    if (act === "maintTap") {
      // 3秒の間に7回続けて押したときだけ（ゆっくり押していると数え直す）
      const now = Date.now(); if (now - (this.tapAt || 0) > 3000) this.taps = 0; if (!this.taps) this.tapAt = now;
      if (++this.taps >= 7) { try { localStorage.setItem("kyokai-maint-pass", String(Date.now())); } catch (e) {} this.pending = false; toast("運営として入ります（この端末だけ）"); setTimeout(() => location.reload(), 700); }
      return true;
    }
    return false;
  }
};

/* ---------- いまアプリを開いている人（2026-11-24）----------
   開いている間 presence/<uid> に { n: 名前, w: どこにいるか, at: 時刻 } を置き、閉じたり通信が切れたりしたらサーバーが消す。
   運営アカウントの「運営」画面で、人数と一覧を見られる */
const Presence = {
  uid: null, w: "", started: false,
  where() {
    if (typeof S !== "undefined" && S) {
      if (MODE === "online") return Online.room && Online.room.arena ? "arena" : "online";
      return S.sen || (S.battle && S.battle.kind === "sen") ? "sen" : "cpu";
    }
    if (document.querySelector("#overlay:not([hidden]) .panel.ar")) return "arena";
    return "home";
  },
  async start() {
    if (this.started || (typeof DATA_INFO !== "undefined" && DATA_INFO.draft)) return;
    this.started = true;
    try { this.uid = await Net.init(); } catch (e) { this.started = false; return; }
    const put = () => { this.w = this.where(); try { Net.set(`presence/${this.uid}`, { n: playerName("召喚士").slice(0, 10), w: this.w, at: Date.now() }).catch(() => {}); } catch (e) {} };
    try {
      Net.onConnected(on => { if (!on) return; try { Net.onDisconnectRemove(`presence/${this.uid}`); } catch (e) {} put(); });
    } catch (e) { put(); }
    // 場所が変わったときと、5分ごと（時刻を新しくして、消し忘れを見分けられるように）
    let n = 0;
    setInterval(() => { n++; if (document.hidden) return; if (this.where() !== this.w || n % 15 === 0) put(); }, 20000);
  }
};

async function boot() {
  // カード工房の検証ラボから開かれたとき：画面は出さず、データだけ読んで知らせる
  if (new URLSearchParams(location.search).has("sim")) {
    try { await loadCardData(); parent.postMessage({ from: "simlab", type: "ready", version: DATA_INFO.version, draft: DATA_INFO.draft }, location.origin); }
    catch (e) { parent.postMessage({ from: "simlab", type: "error", message: "カードデータを読み込めませんでした" }, location.origin); }
    return;
  }
  try {
    await loadCardData();
  } catch (e) {
    openOverlay(`<div class="panel"><h1 class="title sm">読み込みエラー</h1>
      <p class="lead">カードデータを読み込めませんでした。通信状態を確認して、ページを再読み込みしてください。</p>
      <p class="lead">${esc(e.message)}</p></div>`, "start", true);
    return;
  }
  if (!DATA_INFO.draft) {
    // 運営用アカウントか（この端末に残っている引き継ぎコードで判定。メンテナンス中でも入れる）
    try { const code = localStorage.getItem(Account.key()); if (code && CONFIG.ADMINS.length) Ops.admin = CONFIG.ADMINS.includes(await adminHash(code)); } catch (e) {}
    if (Maint.on()) { Maint.screen(); Maint.watch(); return; }
    if (Maint.pass() && +CONFIG.MAINT) setTimeout(() => toast("メンテナンス中（運営として入っています）"), 1500);
    Maint.watch();
  }
  // 試遊（カード工房から）のときは起動画面を出さずにすぐ始める
  if (!DATA_INFO.draft) Splash.show();
  await Account.init();
  try { if (Account.code && CONFIG.ADMINS.length) Ops.admin = CONFIG.ADMINS.includes(await adminHash(Account.code)); } catch (e) {}
  if (Account.status === "ready") Account.watchNet();
  // いま開いている人に数える。起動したときに通信が不安定で、あとからつながった人・新しくアカウントを作った人も数えるように、10秒ごとに確かめる
  const pres = () => { if (Account.status === "ready") Presence.start(); };
  pres(); setInterval(pres, 10000);
  NetBanner.update();
  if (Account.recovered) setTimeout(() => toast("前回、通信が切れて保存できていなかった分を保存しました"), 2500);
  const next = () => (Account.isNew ? Account.showWelcome() : showStart());
  if (Splash.shown) Splash.setReady(next); else next();
}
registerSW();
boot();

document.addEventListener("compositionend", e => { if (e.target.id === "onl-code") Online.fixCode(e.target); });
document.addEventListener("change", e => { if (e.target.id === "onl-code") Online.fixCode(e.target); });
