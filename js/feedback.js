/* =========================================================
   ご意見・感想フォーム
   テストプレイしてくれた人の意見を Firebase の feedback/<シーズン>/ に送る。
   送った内容は本人も含めて誰も読めない（読めるのはFirebaseの管理画面だけ）。
   ========================================================= */

const Feedback = {
  KEY: "kyokai-feedback-draft",
  CATS: [
    { id: "idea", label: "改善案", hint: "こうしたらもっと面白い、など" },
    { id: "bug", label: "不具合・修正", hint: "おかしな動き、見づらい所、強すぎるカードなど" },
    { id: "good", label: "良かった所", hint: "気に入った所・続けてほしい所" },
    { id: "bad", label: "いまいちな所", hint: "つまらない・分かりにくい・面倒な所" },
    { id: "other", label: "その他", hint: "なんでも" }
  ],
  MAX: 1000,
  sending: false,
  lastSent: 0,

  draft() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch { return {}; }
  },
  saveDraft() {
    const d = this.read();
    try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch {}
  },
  clearDraft() { try { localStorage.removeItem(this.KEY); } catch {} },
  read() {
    const cat = ($("#fb-cats input:checked") || {}).value || "idea";
    return {
      cat,
      text: (($("#fb-text") || {}).value || "").slice(0, this.MAX),
      name: (($("#fb-name") || {}).value || "").trim().slice(0, 10)
    };
  },

  show(msg) {
    const d = this.draft();
    let name = d.name;
    if (name == null) { try { name = JSON.parse(localStorage.getItem("kyokai-name")) || ""; } catch { name = ""; } }
    const cat = d.cat || "idea";
    const text = d.text || "";
    openOverlay(`<div class="panel">
      <div class="topbar"><button type="button" class="btn sm" data-act="fbBack">← 戻る</button><b>ご意見・感想</b></div>
      <p class="lead">遊んでみて思ったことを、なんでも自由に書いてください。作った人に届きます。良い所も悪い所も、遠慮なくどうぞ。</p>
      <fieldset class="fbcats" id="fb-cats"><legend>どんな内容？</legend>
        ${this.CATS.map(c => `<label class="fbcat"><input type="radio" name="fbcat" value="${c.id}" ${c.id === cat ? "checked" : ""}><span>${c.label}</span></label>`).join("")}
      </fieldset>
      <p class="fbhint" id="fb-hint">${esc((this.CATS.find(c => c.id === cat) || this.CATS[0]).hint)}</p>
      <label class="fblabel" for="fb-text">内容</label>
      <textarea id="fb-text" class="fbtext" maxlength="${this.MAX}" rows="7" placeholder="例：〇〇のカードが強すぎる／デッキ編成の画面が分かりにくい／音が好き">${esc(text)}</textarea>
      <p class="fbcount" id="fb-count">${text.length} / ${this.MAX}</p>
      <label class="fblabel" for="fb-name">名前（なくてもOK）</label>
      <input class="otxt" id="fb-name" maxlength="10" placeholder="空欄なら名前なしで送ります" value="${esc(name)}" autocomplete="nickname">
      <p class="onl-msg" id="fb-msg" role="status">${msg ? esc(msg) : ""}</p>
      <button type="button" class="btn primary" data-act="fbSend" id="fb-send" ${text.trim() ? "" : "disabled"}>送る</button>
      <p class="datainfo">送った内容は作った人だけが読みます。いっしょに、アプリの版・使っている端末の種類・アカウント番号が送られます（不具合を調べるため）。</p>
    </div>`, null, true);
    const ta = $("#fb-text");
    ta.addEventListener("input", () => {
      $("#fb-count").textContent = `${ta.value.length} / ${this.MAX}`;
      $("#fb-send").disabled = !ta.value.trim() || this.sending;
      this.saveDraft();
    });
    $("#fb-name").addEventListener("input", () => this.saveDraft());
    $("#fb-cats").addEventListener("change", () => {
      const c = this.CATS.find(x => x.id === this.read().cat);
      $("#fb-hint").textContent = c ? c.hint : "";
      this.saveDraft();
    });
  },

  async send() {
    if (this.sending) return;
    const d = this.read();
    const msgEl = $("#fb-msg");
    if (!d.text.trim()) return;
    if (Date.now() - this.lastSent < 20000) { msgEl.textContent = "少し時間をおいてから、もう一度送ってください。"; return; }
    this.sending = true;
    $("#fb-send").disabled = true;
    msgEl.textContent = "送っています…";
    const entry = {
      cat: d.cat,
      text: d.text.trim(),
      name: d.name,
      ts: Date.now(),
      season: String(CONFIG.SEASON || ""),
      data: `v${DATA_INFO.version}${DATA_INFO.draft ? "（試遊）" : ""}`,
      acct: Account.code || "",
      ua: navigator.userAgent.slice(0, 200)
    };
    try {
      await Net.init();
      const season = String(CONFIG.SEASON || "beta").replace(/[.#$\[\]\/]/g, "_");
      const write = Net.pushWait ? Net.pushWait(`feedback/${season}`, entry) : Net.push(`feedback/${season}`, entry);
      await Promise.race([
        Promise.resolve(write),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 12000))
      ]);
      this.lastSent = Date.now();
      this.clearDraft();
      this.sending = false;
      this.showThanks();
    } catch (e) {
      this.sending = false;
      if (msgEl.isConnected) {
        msgEl.textContent = "送れませんでした。電波の良い所でもう一度試してください（書いた内容は残っています）。";
        $("#fb-send").disabled = false;
      }
    }
  },

  showThanks() {
    openOverlay(`<div class="panel">
      <h2 class="title sm">ありがとうございます！</h2>
      <p class="lead">ご意見を受け取りました。正式版に向けて参考にします。思いついたら何回でも送ってください。</p>
      <button type="button" class="btn" data-act="fbOpen">もう1件送る</button>
      <button type="button" class="btn primary" data-act="fbBack">タイトルに戻る</button>
    </div>`, null, true);
  },

  handleAct(act) {
    switch (act) {
      case "fbOpen": this.show(); return true;
      case "fbSend": this.send(); return true;
      case "fbBack": if (!this.sending && $("#fb-text")) this.saveDraft(); showStart(); return true;
    }
    return false;
  }
};
