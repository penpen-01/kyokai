/* 称号・スタンプ・プロフィール（2026-11-16）
   ・称号：工房の「称号」（TITLES）。条件を満たすと手に入り、画面の上に帯が出る。通算の数は Account.data.st に記録する
   ・スタンプ：工房の「スタンプ」（STAMPS）。プロフィールで6個まで持っていき、対戦中に押すと自分のアイコンの横に出る（友達対戦では相手にも）
   ・プロフィール：名前・称号・アイコン・スタンプをまとめて変える画面 */

let TITLES = [], STAMPS = [];
const STAMP_MAX = 6;          // 対戦に持っていけるスタンプの数
const STAMP_GAP = 3000;       // 1回送ったら、次まで3秒
const STAMP_BURST = [5, 30000];   // 30秒に5回まで

/* ---------- 通算の記録と称号 ---------- */
const Titles = {
  queue: [], showing: false,
  st() { const d = Account.data; if (!d) return {}; d.st = d.st || {}; return d.st; },
  bump(k, n = 1) { if (!Account.data || !n) return; const st = this.st(); st[k] = (st[k] || 0) + n; },
  bumpIn(k, sub, n = 1) { if (!Account.data) return; const st = this.st(); st[k] = st[k] || {}; st[k][sub] = (st[k][sub] || 0) + n; },
  max(k, n) { if (!Account.data) return; const st = this.st(); if (n > (st[k] || 0)) st[k] = n; },
  owned(id) { return !!(Account.data && (Account.data.titles || []).includes(id)); },
  cur() { const id = Account.data && Account.data.title; return id && this.owned(id) ? TITLES.find(t => t.id === id) || null : null; },
  curName() { const t = this.cur(); return t ? t.name : ""; },
  /* その条件の今の値（進み具合の表示にも使う） */
  value(c) {
    const st = this.st(), cap = CONFIG.COPY_MAX || 3;
    switch (c.type) {
      case "winAny": return st.wins || 0;
      case "winLv": return (st.winLv || {})[c.lv] || 0;
      case "streak": return st.streakHiMax || 0;
      case "bossWin": {   // 記録を始める前にボスを倒した人：限定レジェンドを持っていれば1回とみなす
        const B = BOSSES[c.lv] || BOSSES.hard, had = B.legends.some(id => (Account.data.cards || {})[id] > 0) ? 1 : 0;
        return Math.max((st.bossWin || {})[c.lv] || 0, had);
      }
      case "onlineWin": return st.onlineWin || 0;
      case "onlineGame": return st.onlineGame || 0;
      case "packs": return st.packs || 0;
      case "kinds": return CARDS.filter(x => !x.token && !x.boss && (Account.data.cards || {})[x.id] > 0).length;
      case "complete": {
        const p = PACKS.find(x => x.id === c.set); if (!p) return 0;
        const pool = Packs.pool(p); return pool.length && pool.every(x => Account.owned(x.id) >= cap) ? 1 : 0;
      }
      case "login": return Account.data.loginN || 0;
      case "gift": return 0;
      default: return st[c.type] || 0;   // games・losses・play・spell・char・kill・lost・face・maxHit・freeze・stoneUse・trade・dis・info・quest
    }
  },
  need(c) { return c.type === "complete" ? 1 : c.type === "gift" ? Infinity : (c.n || 1); },
  /* 条件を満たした称号を手に入れる（手に入れた称号は帯で知らせる） */
  check(silent) {
    if (!Account.data || !["ready", "offline"].includes(Account.status)) return [];
    const d = Account.data; d.titles = d.titles || [];
    const got = TITLES.filter(t => !d.titles.includes(t.id) && t.cond.type !== "gift" && this.value(t.cond) >= this.need(t.cond));
    if (!got.length) return [];
    got.forEach(t => d.titles.push(t.id));
    Account.save();
    if (!silent) {
      if (got.length > 2) this.banner({ name: `${got.length}個の称号`, desc: "プロフィール（ホームの自分のアイコン）で付けられます" });
      else got.forEach(t => this.banner(t));
    }
    return got;
  },
  give(id) {   // 配布（メール・シリアル）
    if (!Account.data) return; const d = Account.data; d.titles = d.titles || [];
    const t = TITLES.find(x => x.id === id); if (!t || d.titles.includes(id)) return;
    d.titles.push(id); this.banner(t);
  },
  banner(t) { this.queue.push(t); if (!this.showing) this.nextBanner(); },
  nextBanner() {
    const t = this.queue.shift(); if (!t) { this.showing = false; return; }
    this.showing = true;
    const el = document.createElement("div");
    el.className = "ttl-banner"; el.setAttribute("role", "status");
    el.innerHTML = `<small>称号を手に入れた！</small><b>${esc(t.name)}</b>${t.desc ? `<span>${esc(t.desc)}</span>` : ""}`;
    el.addEventListener("click", () => { el.classList.add("out"); });
    document.body.appendChild(el);
    if (typeof Sound !== "undefined") Sound.play("rare", 2);
    setTimeout(() => el.classList.add("out"), 3200);
    setTimeout(() => { el.remove(); this.nextBanner(); }, 3700);
  },
  /* 対戦が終わったとき（結果を配るときに1回） */
  onGame(res, r, B) {
    if (!S || !Account.data) return;
    const me = ME;   // 友達対戦でも ME が自分（部屋主0・参加者1）
    const s = (S.stats || [])[me] || {};
    this.bump("games"); this.bump(res === "win" ? "wins" : res === "lose" ? "losses" : "draws");
    if (MODE === "cpu" && res === "win" && (!B || B.kind === "cpu")) this.bumpIn("winLv", CPU_LEVEL);
    // 上級以上の連勝（ボス戦も含む。初級・中級の対戦は数えも途切れもしない。負け・引き分けで0に戻る）
    if (MODE === "cpu" && (!B || B.kind === "cpu" || B.kind === "boss") && (CPU_LEVEL === "hard" || CPU_LEVEL === "ex")) {
      const st = this.st(); st.streakHi = res === "win" ? (st.streakHi || 0) + 1 : 0; this.max("streakHiMax", st.streakHi);
    }
    if (B && B.kind === "boss" && res === "win") this.bumpIn("bossWin", B.boss === "ex" ? "ex" : "hard");
    if (MODE === "online" && r && r.online && !r.online.short) { this.bump("onlineGame"); if (res === "win") this.bump("onlineWin"); }
    ["spell", "char", "kill", "lost", "face", "freeze"].forEach(k => this.bump(k, s[k] || 0));
    this.bump("play", (s.spell || 0) + (s.char || 0));
    this.max("maxHit", s.maxHit || 0);
  },

  /* プロフィールの称号の一覧 */
  listHTML() {
    const cur = this.cur();
    return `<div class="ttl-list">
      <button type="button" class="ttl-opt ${cur ? "" : "on"}" data-act="ttlSet" data-id=""><b>（称号なし）</b></button>
      ${TITLES.map(t => {
        const own = this.owned(t.id), T = TITLE_CONDS[t.cond.type] || TITLE_CONDS.gift;
        const need = this.need(t.cond), v = Math.min(need, this.value(t.cond));
        const cond = !own && t.hidden ? "？？？" : T.text(t.cond.n || 1, t.cond);
        const prog = !own && !t.hidden && Number.isFinite(need) && need > 1 ? ` （${v.toLocaleString()} / ${need.toLocaleString()}）` : "";
        return `<button type="button" class="ttl-opt ${own ? "" : "locked"} ${cur && cur.id === t.id ? "on" : ""}" data-act="ttlSet" data-id="${esc(t.id)}" ${own ? "" : "disabled"}>
          <b>${own ? esc(t.name) : "？？？"}</b><small>${esc(cond)}${prog}</small>${own && t.desc ? `<span>${esc(t.desc)}</span>` : ""}</button>`;
      }).join("")}
    </div>`;
  }
};

/* 持ち物を保存するたびに、少しあとで称号の条件を確かめる（対戦中は、終わってから） */
(() => {
  let t = null;
  const soon = () => { clearTimeout(t); t = setTimeout(() => { if (S && !S.over && MODE !== "sim") return soon(); Titles.check(); }, 600); };
  ["save", "saveNow"].forEach(k => { const f = Account[k]; if (typeof f !== "function") return; Account[k] = function (...a) { const r = f.apply(this, a); soon(); return r; }; });
})();

/* ---------- スタンプ ---------- */
const Stamps = {
  sent: [], muted: false,
  owned(id) { const s = STAMPS.find(x => x.id === id); return !!s && (s.free || (Account.data && (Account.data.stampOwn || []).includes(id))); },
  ownedList() { return STAMPS.filter(s => this.owned(s.id)); },
  /* 対戦に持っていく6個（選んでいなければ、持っている最初の6個） */
  set() {
    const pick = (Account.data && Account.data.stampSet || []).filter(id => this.owned(id));
    return (pick.length ? pick : this.ownedList().map(s => s.id)).slice(0, STAMP_MAX);
  },
  isMuted() { try { return localStorage.getItem("kyokai-stamp-mute") === "1"; } catch (e) { return false; } },
  setMuted(v) { try { localStorage.setItem("kyokai-stamp-mute", v ? "1" : "0"); } catch (e) {} },
  html(s) { return s.art ? `<img src="${esc(s.art)}" alt="${esc(s.text)}">` : `<span>${esc(s.text)}</span>`; },
  /* 対戦中のボタン（自分の情報欄の横） */
  btnHTML() {
    if (!S || S.over || (S.battle && S.battle.kind === "tutorial") || MODE === "sim") return "";
    return `<button type="button" class="stamp-btn" data-act="stampMenu" aria-label="スタンプ">${STAMP_IC}</button>`;
  },
  menu() {
    const old = document.querySelector(".stamp-menu"); if (old) { old.remove(); return; }
    const set = this.set().map(id => STAMPS.find(s => s.id === id)).filter(Boolean);
    const el = document.createElement("div");
    el.className = "stamp-menu"; el.setAttribute("role", "menu");
    el.innerHTML = set.length ? set.map(s => `<button type="button" class="stamp-item ${s.art ? "art" : ""}" data-act="stampSend" data-id="${esc(s.id)}" role="menuitem">${this.html(s)}</button>`).join("")
      + `<button type="button" class="stamp-mute" data-act="stampMute">${this.isMuted() ? "相手のスタンプ：表示しない" : "相手のスタンプ：表示する"}</button>`
      : `<p class="hint">スタンプを持っていません</p>`;
    document.body.appendChild(el);
  },
  closeMenu() { const m = document.querySelector(".stamp-menu"); if (m) m.remove(); },
  canSend() {
    const now = Date.now();
    this.sent = this.sent.filter(t => now - t < STAMP_BURST[1]);
    if (this.sent.length && now - this.sent[this.sent.length - 1] < STAMP_GAP) return "少し待ってから送れます";
    if (this.sent.length >= STAMP_BURST[0]) return "スタンプの送りすぎです。少し待ってください";
    return "";
  },
  send(id) {
    this.closeMenu();
    if (!this.owned(id) || !S || S.over) return;
    const why = this.canSend(); if (why) { toast(why); return; }
    this.sent.push(Date.now());
    this.show(ME, id);
    if (MODE === "online" && typeof Online !== "undefined") Online.sendStamp(id);
    else if (MODE === "cpu" && Math.random() < 0.35) setTimeout(() => this.cpuReply(), 1400 + Math.random() * 1200);
  },
  cpuReply() {
    if (!S || S.over || MODE !== "cpu") return;
    const L = STAMPS.filter(s => s.free); if (!L.length) return;
    this.show(OP, L[Math.floor(Math.random() * L.length)].id);
  },
  /* pi のアイコンの横に出す（2.6秒） */
  show(pi, id) {
    const s = STAMPS.find(x => x.id === id); if (!s) return;
    if (pi !== ME && this.isMuted()) return;
    const av = document.querySelector(`.avatar[data-player="${pi}"]`);
    const el = document.createElement("div");
    el.className = `stamp-pop ${pi === ME ? "me" : "op"} ${s.art ? "art" : ""}`; el.innerHTML = this.html(s);
    if (av) { const r = av.getBoundingClientRect(); el.style.left = Math.min(innerWidth - 150, r.right + 8) + "px"; el.style.top = (pi === ME ? r.top - 20 : r.top + 6) + "px"; }
    document.body.appendChild(el);
    if (typeof Sound !== "undefined") Sound.play("click");
    setTimeout(() => el.classList.add("out"), 2300);
    setTimeout(() => el.remove(), 2700);
  }
};
const STAMP_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="10.5" r="1.2" fill="currentColor"/><circle cx="15" cy="10.5" r="1.2" fill="currentColor"/></svg>';

/* ---------- プロフィール ---------- */
const Profile = {
  tab: "title", iq: "", iw: "all", ir: "all",
  show(from) {
    if (from) this.from = from;
    if (!Account.data) return;
    const icon = Account.icon(), t = Titles.cur();
    const tabs = [["title", "称号"], ["icon", "アイコン"], ["stamp", "スタンプ"]];
    const back = this.from === "options" ? "options" : "back";
    openOverlay(`<div class="panel wide profile">
      <div class="topbar"><button type="button" class="btn sm" data-act="${back}">← 戻る</button><b>プロフィール</b></div>
      <div class="pf-card">
        <span class="pf-face">${icon ? iconImgHTML(icon) : DEFAULT_AVATAR_HTML}</span>
        <span class="pf-who"><b>${esc(playerName())}</b><small>${t ? esc(t.name) : "称号なし"}</small></span>
        <button type="button" class="btn sm" data-act="nameEdit">名前を変える</button>
      </div>
      <p class="hint">対戦では、相手にこの名前と称号が見えます。</p>
      <div class="seg pf-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-act="pfTab" data-v="${k}" aria-pressed="${this.tab === k}">${l}</button>`).join("")}</div>
      ${this.tab === "title" ? `<p class="hint">手に入れた称号 ${(Account.data.titles || []).filter(id => TITLES.some(t => t.id === id)).length} / ${TITLES.length}</p>${Titles.listHTML()}`
        : this.tab === "icon" ? this.iconHTML() : this.stampHTML()}
    </div>`, this.from === "options" ? "options" : "start", true);
  },
  /* アイコン：お気に入り・最近使った・世界とレア度の絞り込み・名前で検索 */
  iconHTML() {
    const all = Account.iconChoices(), cur = Account.icon(), d = Account.data;
    const fav = (d.iconFav || []).filter(id => all.some(c => c.id === id)), rec = (d.iconRecent || []).filter(id => all.some(c => c.id === id));
    const q = this.iq.trim();
    const list = all.filter(c => (this.iw === "all" || (this.iw === "fav" ? fav.includes(c.id) : c.world === this.iw)) && (this.ir === "all" || c.rarity === this.ir) && (!q || c.name.includes(q)));
    const opt = c => `<button type="button" class="iconopt r-${c.rarity} ${cur === c.id ? "on" : ""}" data-act="iconPick" data-id="${esc(c.id)}" aria-label="${esc(c.name)}"><span class="iface">${iconImgHTML(c.id)}</span><small>${esc(c.name)}</small>${fav.includes(c.id) ? `<i class="ifav" aria-label="お気に入り">★</i>` : ""}</button>`;
    const row = (label, ids) => ids.length ? `<p class="pf-sub">${label}</p><div class="iconpick">${ids.map(id => all.find(c => c.id === id)).filter(Boolean).map(opt).join("")}</div>` : "";
    return `<p class="hint">押すとそのアイコンにします。<b>長押し（パソコンは右クリック）でお気に入り</b>に入れたり外したりできます。持っているキャラカードの絵から選べます（${all.length}種）。</p>
      ${row("お気に入り", fav)}${row("最近使った", rec.filter(id => !fav.includes(id)).slice(0, 8))}
      <p class="pf-sub">すべて</p>
      <div class="pf-filter">
        <input class="otxt" id="pf-iq" placeholder="名前で探す" value="${esc(this.iq)}" autocomplete="off">
        <div class="seg">${[["all", "すべて"], ["fav", "★"], ...Object.entries(WORLDS)].map(([k, l]) => `<button type="button" data-act="pfIw" data-v="${k}" aria-pressed="${this.iw === k}">${esc(l)}</button>`).join("")}</div>
        <div class="seg">${["all", ...RARITY_ORDER].map(r => `<button type="button" data-act="pfIr" data-v="${r}" aria-pressed="${this.ir === r}">${r === "all" ? "全レア" : RARITY_SHORT[r]}</button>`).join("")}</div>
      </div>
      <div class="iconpick">
        <button type="button" class="iconopt auto ${cur ? "" : "on"}" data-act="iconPick" data-id="" aria-label="おまかせ"><span class="iface">${DEFAULT_AVATAR_HTML}</span><small>おまかせ</small></button>
        ${list.map(opt).join("") || `<p class="hint">条件に合うアイコンはありません</p>`}
      </div>`;
  },
  stampHTML() {
    const set = Stamps.set(), own = Stamps.ownedList();
    return `<p class="hint">対戦に持っていくスタンプを、${STAMP_MAX}個まで選びます（押すと入れたり外したりできます）。対戦中は、自分の情報欄の吹き出しのボタンから送れます。</p>
      <p class="pf-sub">持っていく（${set.length} / ${STAMP_MAX}）</p>
      <div class="stamp-grid">${set.map(id => STAMPS.find(s => s.id === id)).filter(Boolean).map(s => `<button type="button" class="stamp-item on ${s.art ? "art" : ""}" data-act="stampPick" data-id="${esc(s.id)}">${Stamps.html(s)}</button>`).join("")}</div>
      <p class="pf-sub">持っているスタンプ（${own.length}）</p>
      <div class="stamp-grid">${own.map(s => `<button type="button" class="stamp-item ${set.includes(s.id) ? "on" : ""} ${s.art ? "art" : ""}" data-act="stampPick" data-id="${esc(s.id)}">${Stamps.html(s)}</button>`).join("")}</div>
      <label class="ownchk"><input type="checkbox" data-act="stampMuteChk" ${Stamps.isMuted() ? "checked" : ""}> 相手のスタンプを表示しない</label>`;
  },
  pickIcon(id) {
    Account.setIcon(id || null);
    if (id) { const d = Account.data; d.iconRecent = [id, ...(d.iconRecent || []).filter(x => x !== id)].slice(0, 12); Account.save(); }
    Sound.play("click"); this.show();
  },
  toggleFav(id) {
    if (!id) return; const d = Account.data; const f = d.iconFav || [];
    d.iconFav = f.includes(id) ? f.filter(x => x !== id) : [id, ...f].slice(0, 30);
    Account.save(); toast(d.iconFav.includes(id) ? "お気に入りに入れました" : "お気に入りから外しました"); this.show();
  },
  pickStamp(id) {
    const d = Account.data; let set = Stamps.set();
    if (!(d.stampSet || []).length) d.stampSet = set.slice();
    set = d.stampSet.filter(x => Stamps.owned(x));
    if (set.includes(id)) set = set.filter(x => x !== id);
    else if (set.length >= STAMP_MAX) { toast(`持っていけるのは${STAMP_MAX}個までです。先にどれかを外してください`); return; }
    else set.push(id);
    d.stampSet = set; Account.save(); Sound.play("click"); this.show();
  },
  handleAct(act, el) {
    switch (act) {
      case "profile": this.nameFrom = false; this.show(el && el.dataset.from); return true;
      case "nameEdit": if (document.querySelector(".panel.profile")) { this.nameFrom = true; showName(); return true; } this.nameFrom = false; return false;
      case "pfTab": this.tab = el.dataset.v; this.show(); return true;
      case "pfIw": this.iw = el.dataset.v; this.show(); return true;
      case "pfIr": this.ir = el.dataset.v; this.show(); return true;
      case "iconPick": this.pickIcon(el.dataset.id); return true;
      case "ttlSet": { const id = el.dataset.id; if (id && !Titles.owned(id)) return true; if (id) Account.data.title = id; else delete Account.data.title; Account.save(); Sound.play("click"); this.show(); return true; }
      case "stampPick": this.pickStamp(el.dataset.id); return true;
      case "stampMenu": Stamps.menu(); return true;
      case "stampSend": Stamps.send(el.dataset.id); return true;
      case "stampMute": Stamps.setMuted(!Stamps.isMuted()); Stamps.closeMenu(); toast(Stamps.isMuted() ? "相手のスタンプを表示しません" : "相手のスタンプを表示します"); return true;
    }
    return false;
  }
};
/* 長押し・右クリックでお気に入り（アイコン） */
(() => {
  let timer = null, fired = false;
  document.addEventListener("pointerdown", e => {
    const el = e.target.closest && e.target.closest('[data-act="iconPick"]'); if (!el || !el.dataset.id) return;
    fired = false; timer = setTimeout(() => { fired = true; Profile.toggleFav(el.dataset.id); }, 550);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev => document.addEventListener(ev, () => clearTimeout(timer), true));
  document.addEventListener("click", e => { if (fired && e.target.closest && e.target.closest('[data-act="iconPick"]')) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
  document.addEventListener("contextmenu", e => { const el = e.target.closest && e.target.closest('[data-act="iconPick"]'); if (el && el.dataset.id) { e.preventDefault(); Profile.toggleFav(el.dataset.id); } });
  document.addEventListener("input", e => { if (e.target && e.target.id === "pf-iq" && !(typeof IME !== "undefined" && IME.on)) { Profile.iq = e.target.value; const pos = e.target.selectionStart; Profile.show(); const n = document.getElementById("pf-iq"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) {} } } });
  document.addEventListener("change", e => { if (e.target && e.target.dataset && e.target.dataset.act === "stampMuteChk") Stamps.setMuted(e.target.checked); });
  document.addEventListener("pointerdown", e => { if (!(e.target.closest && e.target.closest(".stamp-menu, .stamp-btn"))) Stamps.closeMenu(); }, true);
})();
