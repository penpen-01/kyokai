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

  handleAct(act, el) {
    switch (act) {
      case "inboxNews": this.showNews(); return true;
      case "inboxMail": this.showMail(); return true;
      case "inboxTake": this.take([el.dataset.id]); return true;
      case "inboxTakeAll": this.take(this.mailList().map(m => m.id)); return true;
    }
    return false;
  }
};
