/* =========================================================
   メールとお知らせ（ホームの右上）
   ・お知らせ：アップデート内容など。読んだかどうかはこの端末に覚える
   ・メール：全員に届く。G・魔石・パック券・カードを付けられ、1アカウント1回だけ受け取れる（Account.data.mailGot）
   どちらもカード工房の「経済・配布」タブで作って、公開すると届く（game-data.json の news / mail）
   ========================================================= */
const Inbox = {
  SEEN_KEY: "kyokai-news-seen",
  seen() { try { return JSON.parse(localStorage.getItem(this.SEEN_KEY)) || {}; } catch { return {}; } },
  markSeen(ids) { const m = this.seen(); ids.forEach(id => { m[id] = 1; }); try { localStorage.setItem(this.SEEN_KEY, JSON.stringify(m)); } catch {} },
  newsList() { return NEWS.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")); },
  mailList() {
    const today = localDate();
    return MAIL.filter(m => !m.until || m.until >= today || this.got(m.id)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  },
  got(id) { return !!(Account.data && Account.data.mailGot && Account.data.mailGot[id]); },
  hasGift(m) { return m.gold || m.stones || m.tickets || Object.keys(m.cards || {}).length; },
  unreadNews() { const s = this.seen(); return NEWS.filter(n => !s[n.id]).length; },
  unclaimed() { return this.mailList().filter(m => this.hasGift(m) && !this.got(m.id)).length; },
  badge(n) { return n ? `<span class="navbadge">${n > 9 ? "9+" : n}</span>` : ""; },
  newsBadge() { return this.badge(this.unreadNews()); },
  mailBadge() { return Account.data ? this.badge(this.unclaimed()) : ""; },
  giftText(m) {
    return [m.gold ? `${m.gold}G` : "", m.stones ? `魔石${m.stones}` : "", m.tickets ? `パック券${m.tickets}枚` : "",
      ...Object.entries(m.cards || {}).map(([id, n]) => `${DEF[id] ? DEF[id].name : "？"}×${n}`)].filter(Boolean).join("・");
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
    const ok = ids.map(id => MAIL.find(m => m.id === id)).filter(m => m && this.hasGift(m) && !d.mailGot[m.id] && (!m.until || m.until >= today));
    if (!ok.length) return this.showMail();
    const cards = [];
    ok.forEach(m => {
      d.gold = (d.gold || 0) + m.gold; d.stones = (d.stones || 0) + m.stones; d.tickets = (d.tickets || 0) + m.tickets;
      Object.entries(m.cards).forEach(([id, n]) => { for (let i = 0; i < n; i++) cards.push(id); });
      d.mailGot[m.id] = Date.now();
    });
    if (cards.length) Account.addCards(cards); else Account.saveNow();
    Sound.play("rare", 2);
    this.showMail(`${ok.length}通のメールから受け取りました：${ok.map(m => this.giftText(m)).join("、")}`);
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
  /* ごほうびの絵（G＝金貨、魔石＝紫の宝石、パック券＝券） */
  rewardIcon(x) {
    if (x.tickets) return `<svg class="lb-ic" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="lbt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#b8862e"/></linearGradient></defs><rect x="5" y="9" width="30" height="22" rx="3" fill="url(#lbt)" stroke="#5a3d0c" stroke-width="1.5"/><path d="M26 9v22" stroke="#5a3d0c" stroke-width="1.2" stroke-dasharray="2 2"/><path d="M12 15h10M12 20h8M12 25h10" stroke="#5a3d0c" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    if (x.stones) return `<svg class="lb-ic" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="lbs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6dcff"/><stop offset=".5" stop-color="#9b7cf0"/><stop offset="1" stop-color="#4a2f9a"/></linearGradient></defs><path d="M20 4 33 15 20 36 7 15z" fill="url(#lbs)" stroke="#2a1a5a" stroke-width="1.5"/><path d="M7 15h26M20 4l-5 11 5 21 5-21z" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/></svg>`;
    return `<svg class="lb-ic" viewBox="0 0 40 40" aria-hidden="true"><defs><radialGradient id="lbg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff6d6"/><stop offset=".55" stop-color="#e2b54e"/><stop offset="1" stop-color="#8a6418"/></radialGradient></defs><circle cx="20" cy="20" r="15" fill="url(#lbg)" stroke="#5a3d0c" stroke-width="1.5"/><circle cx="20" cy="20" r="11" fill="none" stroke="rgba(90,61,12,.5)" stroke-width="1"/><text x="20" y="25.5" text-anchor="middle" font-size="15" font-weight="800" fill="#5a3d0c" font-family="serif">G</text></svg>`;
  },
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
    }
    return false;
  }
};
