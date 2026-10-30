/* =========================================================
   シリアルコードの入力（オプション → シリアルコード）
   カード工房で作ったコードを入力すると、G・カードを受け取れる。1アカウント1回まで。
   公開データ（game-data.json）にはコードのハッシュだけがあり、入力したコードのハッシュと照らし合わせる。
   ※ アカウントのデータは端末が書き込むので、詳しい人ならズルはできる（友達同士で遊ぶ前提）
   ========================================================= */

const Serial = {
  busy: false,
  result: null,   // { label, gold, cards: {id: n} }

  show(msg, ok) {
    const usable = Account.status === "ready";
    openOverlay(`<div class="panel">
      <div class="topbar"><button type="button" class="btn sm" data-act="back">← 戻る</button><b>シリアルコード</b></div>
      ${Account.status === "free" ? `<p class="onl-msg">試遊モードでは使えません。</p>`
        : !usable ? `<p class="onl-msg">サーバーに接続できていないため使えません。通信できる場所で開き直してください。</p>` : ""}
      <p class="lead">配られたシリアルコード（12文字）を入力すると、Gやカードを受け取れます。同じコードは1回だけ使えます。</p>
      <div class="joinrow">
        <input class="otxt code serialin" id="serial-in" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" ${usable ? "" : "disabled"}>
      </div>
      <button type="button" class="btn primary" data-act="serialGo" ${usable && !this.busy ? "" : "disabled"}>受け取る</button>
      <p class="onl-msg ${ok ? "okmsg" : ""}" id="serial-msg" role="status">${msg ? esc(msg) : ""}</p>
    </div>`, "options", true);
  },

  showResult() {
    const r = this.result; if (!r) return;
    const list = Object.entries(r.cards).filter(([id]) => DEF[id]);
    openOverlay(`<div class="panel">
      <h2 class="title sm">受け取りました</h2>
      <p class="lead">「${esc(r.label)}」</p>
      ${r.gold ? `<p class="serialgold">＋${r.gold}G</p>` : ""}
      ${list.length ? `<div class="serialcards">${list.map(([id, n]) => `<div class="serialcard">${cardHTML(DEF[id], { static: true })}<span>${esc(DEF[id].name)} ×${n}</span></div>`).join("")}</div>` : ""}
      <p class="datainfo">所持G：${Account.gold}G</p>
      <button type="button" class="btn primary" data-act="optBack">ホームに戻る</button>
    </div>`, "options", true);
  },

  async redeem() {
    if (this.busy || Account.status !== "ready") return;
    const code = serialNorm(($("#serial-in") || {}).value);
    const say = (m, ok) => { const el = $("#serial-msg"); if (el) { el.textContent = m; el.classList.toggle("okmsg", !!ok); } };
    if (code.length !== 12) { say("12文字のコードを入力してください（ハイフンはなくても大丈夫です）"); return; }
    this.busy = true;
    say("確認しています…");
    try {
      // 起動後に新しく作られたコードにも対応するため、最新の公開データを読み直す
      let list = SERIALS;
      try { list = normalizeData(await fetchPublished()).serials; SERIALS = list; } catch { /* 読めなければ手元のもので確認 */ }
      const h = await serialHash(code);
      const s = list.find(x => x.h === h);
      if (!s) { say("このコードは使えません。入力が正しいか確かめてください"); return; }
      const today = localDate();
      if (s.until && today > s.until) { say(`このコードの有効期限（${s.until}）は過ぎています`); return; }
      if (!Account.data.redeemed) Account.data.redeemed = {};
      if (Account.data.redeemed[h]) { say("このコードはもう受け取っています"); return; }
      // 受け取り
      Account.data.redeemed[h] = Date.now();
      Account.data.gold += s.gold;
      Object.entries(s.cards).forEach(([id, n]) => { if (DEF[id]) Account.data.cards[id] = (Account.data.cards[id] || 0) + n; });
      const saved = await Account.saveNow();
      if (!saved) {
        // 保存できなければ元に戻す
        delete Account.data.redeemed[h];
        Account.data.gold -= s.gold;
        Object.entries(s.cards).forEach(([id, n]) => { if (DEF[id]) Account.data.cards[id] -= n; if (Account.data.cards[id] <= 0) delete Account.data.cards[id]; });
        Account.writeCache();
        say("保存できませんでした。通信状態を確認して、もう一度試してください");
        return;
      }
      Sound.play("rare", 3);
      this.result = { label: s.label, gold: s.gold, cards: s.cards };
      this.showResult();
    } finally {
      this.busy = false;
    }
  },

  handleAct(act) {
    switch (act) {
      case "serial": this.show(); return true;
      case "serialGo": this.redeem(); return true;
    }
    return false;
  }
};

document.addEventListener("input", e => {
  if (e.target.id === "serial-in") e.target.value = serialFmt(e.target.value).slice(0, 14);
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "serial-in") Serial.redeem();
});
