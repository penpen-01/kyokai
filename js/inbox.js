/* =========================================================
   メールとお知らせ（ホームの右上）
   ・お知らせ：アップデート内容など。読んだかどうかはこの端末に覚える
   ・メール：宛先（全員／送った日までに始めた人／送った日から後に始めた人）を選べる。G・魔石・パック券・カード・選択券を付けられ、1アカウント1回だけ受け取れる（Account.data.mailGot）
   ・選択券：受け取ると、決められたレア度・弾から好きなカード1枚と交換できる（Account.data.picks）
   どちらもカード工房の「経済・配布」タブで作って、公開すると届く（game-data.json の news / mail）
   ========================================================= */
const Inbox = {
  SEEN_KEY: "kyokai-news-seen",
  seen() { try { return JSON.parse(localStorage.getItem(this.SEEN_KEY)) || {}; } catch { return {}; } },
  markSeen(ids) { const m = this.seen(); ids.forEach(id => { m[id] = 1; }); try { localStorage.setItem(this.SEEN_KEY, JSON.stringify(m)); } catch {} },
  newsList() { return NEWS.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")); },
  /* そのアカウントに届くメールか（宛先と、アカウントを作った日で決める） */
  forMe(m) {
    if (this.got(m.id)) return true;
    const c = Account.data && Account.data.created; if (!c || !m.date) return m.to !== "new";
    const made = localDate(new Date(c));
    if (m.to === "before") return made <= m.date;
    if (m.to === "new") return made >= m.date;
    return true;
  },
  mailList() {
    const today = localDate();
    return MAIL.filter(m => this.forMe(m) && (m.to === "new" || !m.until || m.until >= today || this.got(m.id))).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  },
  got(id) { return !!(Account.data && Account.data.mailGot && Account.data.mailGot[id]); },
  hasGift(m) { return m.gold || m.stones || m.tickets || Object.keys(m.cards || {}).length || Object.keys(m.picks || {}).length; },
  pickDef(id) { return PICKS.find(p => p.id === id); },
  myPicks() { const o = (Account.data && Account.data.picks) || {}; return Object.entries(o).filter(([k, v]) => v > 0 && this.pickDef(k)); },
  unreadNews() { const s = this.seen(); return NEWS.filter(n => !s[n.id]).length; },
  unclaimed() { return this.mailList().filter(m => this.hasGift(m) && !this.got(m.id)).length + this.myPicks().length; },
  badge(n) { return n ? `<span class="navbadge">${n > 9 ? "9+" : n}</span>` : ""; },
  newsBadge() { return this.badge(this.unreadNews()); },
  mailBadge() { return Account.data ? this.badge(this.unclaimed()) : ""; },
  giftText(m) {
    return [m.gold ? `${m.gold}G` : "", m.stones ? `魔石${m.stones}` : "", m.tickets ? `パック券${m.tickets}枚` : "",
      ...Object.entries(m.cards || {}).map(([id, n]) => `${DEF[id] ? DEF[id].name : "？"}×${n}`),
      ...Object.entries(m.picks || {}).map(([id, n]) => `${this.pickDef(id) ? this.pickDef(id).name : "選択券"}${n > 1 ? `×${n}` : ""}`)].filter(Boolean).join("・");
  },
  body(t) { return esc(t).replace(/\n/g, "<br>"); },

  showNews(openId) {
    const list = this.newsList();
    this.markSeen(list.map(n => n.id));
    openOverlay(`<div class="panel wide">
      <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>お知らせ</b></div>
      ${list.length ? list.map((n, i) => `<details class="ib-item" ${openId === n.id || (!openId && i === 0) ? "open" : ""}>
          <summary><span class="ib-date">${esc(n.date)}</span><b>${esc(n.title)}</b></summary>
          <div class="ib-body">${this.body(n.body)}</div></details>`).join("")
        : `<p class="callout">お知らせはまだありません。</p>`}
    </div>`, "start", true);
  },

  showMail(msg) {
    const list = this.mailList(), all = list.filter(m => this.hasGift(m) && !this.got(m.id));
    openOverlay(`<div class="panel wide">
      <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>メール</b>${all.length > 1 ? `<button type="button" class="btn sm primary" data-act="inboxTakeAll">まとめて受け取る</button>` : ""}</div>
      ${msg ? `<p class="callout warn">${esc(msg)}</p>` : ""}
      ${this.myPicks().map(([id, n]) => `<div class="ib-gift pick-have"><span><b>${esc(this.pickDef(id).name)}</b>を${n}枚持っています</span><button type="button" class="btn sm primary" data-act="pickOpen" data-id="${esc(id)}">カードと交換する</button></div>`).join("")}
      ${list.length ? list.map(m => {
        const gift = this.hasGift(m), got = this.got(m.id);
        return `<section class="ib-item mail ${gift && !got ? "new" : ""}">
          <div class="ib-head"><span class="ib-date">${esc(m.date)}</span><b>${esc(m.title)}</b>${m.until && !got ? `<small>${esc(m.until)}まで</small>` : ""}</div>
          ${m.body ? `<div class="ib-body">${this.body(m.body)}</div>` : ""}
          ${gift ? `<div class="ib-gift"><span>${esc(this.giftText(m))}</span>${got ? `<em>受け取り済み</em>` : `<button type="button" class="btn sm primary" data-act="inboxTake" data-id="${esc(m.id)}">受け取る</button>`}</div>` : ""}
        </section>`;
      }).join("") : `<p class="callout">メールはまだありません。</p>`}
    </div>`, "start", true);
  },

  take(ids) {
    if (!Account.data || !["ready", "offline"].includes(Account.status)) return this.showMail("アカウントを読み込めていないため、受け取れません。");
    if (Account.status === "offline") return this.showMail("オフラインです。通信できるところで開き直してから受け取ってください。");
    const d = Account.data; d.mailGot = d.mailGot || {};
    const today = localDate();
    const ok = ids.map(id => MAIL.find(m => m.id === id)).filter(m => m && this.forMe(m) && this.hasGift(m) && !d.mailGot[m.id] && (m.to === "new" || !m.until || m.until >= today));
    if (!ok.length) return this.showMail();
    const cards = [];
    ok.forEach(m => {
      d.gold = (d.gold || 0) + m.gold; d.stones = (d.stones || 0) + m.stones; d.tickets = (d.tickets || 0) + m.tickets;
      Object.entries(m.cards).forEach(([id, n]) => { for (let i = 0; i < n; i++) cards.push(id); });
      Object.entries(m.picks || {}).forEach(([id, n]) => { if (!this.pickDef(id)) return; d.picks = d.picks || {}; d.picks[id] = (d.picks[id] || 0) + n; });
      d.mailGot[m.id] = Date.now();
    });
    if (cards.length) Account.addCards(cards); else Account.saveNow();
    Sound.play("rare", 2);
    const msg = `${ok.length}通のメールから受け取りました：${ok.map(m => this.giftText(m)).join("、")}`;
    if (ok.some(m => Object.keys(m.picks || {}).length) && this.myPicks().length) return this.showPick(this.myPicks()[0][0], msg);
    this.showMail(msg);
  },

  /* ---------- 選択券：好きなカード1枚と交換 ---------- */
  pickSel: null,
  showPick(pid, msg) {
    const pk = this.pickDef(pid), have = ((Account.data && Account.data.picks) || {})[pid] || 0;
    if (!pk || !have) return this.showMail();
    const pool = pickPool(pk, CARDS).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));
    if (!pool.some(c => c.id === this.pickSel)) this.pickSel = null;
    const sel = this.pickSel && DEF[this.pickSel];
    openOverlay(`<div class="panel wide pick">
      <div class="topbar"><button type="button" class="btn sm" data-act="inboxMail">← メール</button><b>${esc(pk.name)}</b><small class="pk-have">残り${have}枚</small></div>
      ${msg ? `<p class="callout">${esc(msg)}</p>` : ""}
      <p class="lead small">好きなカードを1枚選んで、交換してください。カードを押すと、下に効果が出ます。</p>
      <div class="pick-grid">${pool.map(c => `<div role="button" tabindex="0" class="pick-tile ${this.pickSel === c.id ? "on" : ""}" data-act="pickSel" data-id="${esc(c.id)}" data-p="${esc(pid)}" aria-pressed="${this.pickSel === c.id}">${cardHTML(c)}<small>持っている：${Account.owned(c.id)}枚</small></div>`).join("")}</div>
      <div class="pick-bar">${sel ? `<div class="pick-info"><b>${esc(sel.name)}</b><small>${esc(RARITY[sel.rarity])}・${sel.cost}コスト${sel.type === "char" ? `・${sel.atk}/${sel.hp}` : "・魔法"}・${WORLDS[sel.world] || ""}</small><p>${esc(cardText(sel)).replace(/\n/g, "<br>")}</p></div><button type="button" class="btn primary" data-act="pickGo" data-id="${esc(sel.id)}" data-p="${esc(pid)}">このカードと交換する</button>`
        : `<span class="hint">カードを選んでください（あとで交換することもできます。メールの画面から使えます）</span>`}</div>
    </div>`, "start", true);
  },
  pickGo(pid, cid) {
    const d = Account.data, pk = this.pickDef(pid);
    if (!d || !pk || !(d.picks || {})[pid] || !pickPool(pk, CARDS).some(c => c.id === cid)) return this.showMail();
    if (Account.status !== "ready") return this.showMail("通信できるところで開き直してから交換してください。");
    d.picks[pid] -= 1; if (!d.picks[pid]) delete d.picks[pid];
    this.pickSel = null;
    Account.addCards([cid]);
    Sound.play("rare", 2);
    const left = this.myPicks();
    if (left.length) return this.showPick(left[0][0], `${DEF[cid].name}を手に入れました。`);
    this.showMail(`${DEF[cid].name}を手に入れました。`);
  },

  /* ---------- ログインボーナス ---------- */
  loginReady() { return LOGIN.length && Account.data && Account.status === "ready" && Account.data.loginLast !== localDate(); },
  loginGift(x) { return [x.gold ? `${x.gold}G` : "", x.stones ? `魔石${x.stones}` : "", x.tickets ? `パック券${x.tickets}枚` : ""].filter(Boolean).join("・") || "—"; },
  /* ホームを開いたときに呼ぶ。今日まだなら受け取って、カレンダーを見せる */
  checkLogin() {
    if (!this.loginReady()) return false;
    const d = Account.data; d.loginN = d.loginN || 0;
    const i = d.loginN % LOGIN.length, x = LOGIN[i];
    d.gold = (d.gold || 0) + x.gold; d.stones = (d.stones || 0) + x.stones; d.tickets = (d.tickets || 0) + x.tickets;
    d.loginN += 1; d.loginLast = localDate();
    Account.saveNow();
    Sound.play("rare", 2);
    this.loginShown = { i, x };
    this.showLogin();
    return true;
  },
  /* ごほうびの絵（G＝金貨、魔石＝紫の宝石、パック券＝券）。絵は shared.js の curIcon */
  rewardIcon(x) { return curIcon(x.tickets ? "ticket" : x.stones ? "stone" : "gold", "lb-ic"); },
  rewardNum(x) { return x.tickets ? `×${x.tickets}` : x.stones ? `×${x.stones}` : `×${x.gold}`; },
  showLogin() {
    const L = this.loginShown; if (!L) return showStart();
    const n = LOGIN.length, week = Math.floor((Account.data.loginN - 1) / n) + 1;
    const next = LOGIN[(L.i + 1) % n];
    const guide = DEF["f-twins"] || DEF["n-flowergirl"];
    openOverlay(`<div class="lbx">
      <div class="lb-board">
        <div class="lb-ribbon"><small>LOGIN BONUS</small><b>ログインボーナス</b></div>
        <p class="lb-sub">${week > 1 ? `<span>${week}周目</span>` : ""}毎日ひらいて、ごほうびを受け取ろう</p>
        <div class="lb-grid">${LOGIN.map((x, k) => `<div class="lb-day ${k < L.i ? "done" : k === L.i ? "today" : ""} ${k === n - 1 ? "big" : ""}" style="--k:${k}">
            <span class="lb-dn">${k === L.i ? "TODAY" : `DAY ${k + 1}`}</span>
            ${this.rewardIcon(x)}<b>${this.rewardNum(x)}</b>
            ${k < L.i ? `<span class="lb-stamp">済</span>` : ""}
          </div>`).join("")}</div>
        <div class="lb-today">
          <div class="lb-big">${this.rewardIcon(L.x)}</div>
          <div class="lb-today-t"><small>${L.i + 1}日目のボーナス</small><b>${this.loginGift(L.x)}</b><span>を受け取りました</span></div>
        </div>
        <div class="lb-guide">
          ${guide && guide.art ? `<span class="lb-face" style="background-image:url('${esc(guide.art)}')"></span>` : ""}
          <p>明日は <b>${this.loginGift(next)}</b>。<br>休んでも、続きからもらえるよ！</p>
        </div>
        <button type="button" class="btn primary lb-ok" data-act="loginOk">OK</button>
      </div>
    </div>`, "start", true);
  },

  handleAct(act, el) {
    switch (act) {
      case "loginOk": this.loginShown = null; showStart(); return true;
      case "inboxNews": this.showNews(); return true;
      case "inboxMail": this.showMail(); return true;
      case "inboxTake": this.take([el.dataset.id]); return true;
      case "inboxTakeAll": this.take(this.mailList().map(m => m.id)); return true;
      case "pickOpen": this.pickSel = null; this.showPick(el.dataset.id); return true;
      case "pickSel": this.pickSel = el.dataset.id; this.showPick(el.dataset.p); return true;
      case "pickGo": this.pickGo(el.dataset.p, el.dataset.id); return true;
    }
    return false;
  }
};
