/* =========================================================
   カード工房：GitHubへ直接公開する
   ・管理者のブラウザにだけ保存した「アクセストークン」で、game-data.json を書き換える
   ・GitHub Pages が1〜2分で反映する。公開履歴から以前の内容を読み込むこともできる
   ========================================================= */

const PUB_KEY = "kyokai-publish-v1";
const PUB_PATH = "game-data.json";

const Publish = {
  cfg: (() => { try { return Object.assign({ owner: "penpen-01", repo: "kyokai", branch: "main", token: "" }, JSON.parse(localStorage.getItem(PUB_KEY) || "{}")); } catch { return { owner: "penpen-01", repo: "kyokai", branch: "main", token: "" }; } })(),
  busy: false,

  saveCfg() { try { localStorage.setItem(PUB_KEY, JSON.stringify(this.cfg)); } catch {} },
  ready() { return !!this.cfg.token; },
  api(path, opt = {}) {
    return fetch(`https://api.github.com/repos/${this.cfg.owner}/${this.cfg.repo}${path}`, {
      ...opt,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.cfg.token}`, "X-GitHub-Api-Version": "2022-11-28", ...(opt.headers || {}) }
    });
  },
  errText(status) {
    if (status === 401) return "鍵（アクセストークン）が正しくないか、期限が切れています。公開設定で入れ直してください。";
    if (status === 403) return "鍵にリポジトリへの書き込み権限がありません。「Contents：Read and write」を付けて作り直してください。";
    if (status === 404) return "リポジトリが見つかりません。公開設定のユーザー名・リポジトリ名と、鍵の対象リポジトリを確認してください。";
    if (status === 409 || status === 422) return "GitHub側のファイルが先に更新されていました。もう一度「公開する」を押してください。";
    return `GitHubとの通信に失敗しました（${status}）。`;
  },
  b64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  },
  unb64(b) { return new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, "")), c => c.charCodeAt(0))); },

  /* ---------- 設定 ---------- */
  showSettings(msg) {
    openModal(`<div class="dialog wide" role="dialog" aria-labelledby="psT">
      <h3 id="psT">公開設定</h3>
      <p>カード工房から直接サイトに公開するには、GitHubの「アクセストークン」（書き込み用の鍵）が必要です。<b>この鍵はこのブラウザにだけ保存され</b>、サイトや他の人には送られません。</p>
      <details ${this.ready() ? "" : "open"}><summary>鍵の作り方（初回だけ・5分）</summary>
        <ol>
          <li>GitHubにログインし、右上のアイコン →「Settings」→ 左メニュー一番下の「Developer settings」</li>
          <li>「Personal access tokens」→「Fine-grained tokens」→「Generate new token」</li>
          <li>Token name：<code>kyokai-publish</code>、Expiration：好きな期限（期限が来たら作り直します）</li>
          <li>Repository access：「Only select repositories」→ <code>kyokai</code> を選ぶ</li>
          <li>Permissions → Repository permissions →「Contents」を <b>Read and write</b> にする</li>
          <li>「Generate token」を押し、表示された <code>github_pat_</code> から始まる文字をコピーして、下に貼る</li>
        </ol>
        <p class="hint">鍵は他の人に教えないでください。漏れたら、同じ画面で削除して作り直せば無効になります。</p>
      </details>
      <div class="field"><label for="pub-token">アクセストークン</label>
        <input class="txt" id="pub-token" type="password" autocomplete="off" placeholder="github_pat_..." value="${esc(this.cfg.token)}"></div>
      <div class="frow">
        <div class="field grow"><label for="pub-owner">ユーザー名</label><input class="txt" id="pub-owner" value="${esc(this.cfg.owner)}"></div>
        <div class="field grow"><label for="pub-repo">リポジトリ</label><input class="txt" id="pub-repo" value="${esc(this.cfg.repo)}"></div>
        <div class="field"><label for="pub-branch">ブランチ</label><input class="txt" id="pub-branch" value="${esc(this.cfg.branch)}" style="width:90px"></div>
      </div>
      <p class="hint" id="pub-msg" role="status">${msg ? esc(msg) : ""}</p>
      <div class="acts">
        ${this.ready() ? `<button type="button" class="btn danger" data-act="pubForget">鍵を消す</button>` : ""}
        <button type="button" class="btn" data-act="closeModal">閉じる</button>
        <button type="button" class="btn primary" data-act="pubSaveCfg">保存して接続を確認</button>
      </div>
    </div>`);
  },

  async saveAndTest() {
    this.cfg.token = $("#pub-token").value.trim();
    this.cfg.owner = $("#pub-owner").value.trim() || "penpen-01";
    this.cfg.repo = $("#pub-repo").value.trim() || "kyokai";
    this.cfg.branch = $("#pub-branch").value.trim() || "main";
    this.saveCfg();
    const m = $("#pub-msg"); if (m) m.textContent = "確認中…";
    try {
      const r = await this.api("");
      if (!r.ok) { if (m) m.textContent = this.errText(r.status); return; }
      const j = await r.json();
      if (j.permissions && j.permissions.push === false) { if (m) m.textContent = this.errText(403); return; }
      const f = await this.api(`/contents/${PUB_PATH}?ref=${encodeURIComponent(this.cfg.branch)}`);
      if (!f.ok) { if (m) m.textContent = this.errText(f.status); return; }
      if (m) m.textContent = `接続できました（${j.full_name}）。「公開する」が使えます。`;
      renderStatus();
    } catch (e) { if (m) m.textContent = "GitHubに接続できませんでした。通信状態を確認してください。"; }
  },

  /* ---------- 公開 ---------- */
  diffSummary(pub, out) {
    const lines = [];
    if (!pub) return ["（公開中のデータを読めなかったため、差分は表示できません）"];
    const P = Object.fromEntries(pub.cards.map(c => [c.id, c])), N = Object.fromEntries(out.cards.map(c => [c.id, c]));
    const added = out.cards.filter(c => !P[c.id]), removed = pub.cards.filter(c => !N[c.id]);
    const strip = c => JSON.stringify({ ...c, art: c.art ? c.art.length : 0 });
    const changed = out.cards.filter(c => P[c.id] && strip(normalizeData({ cards: [c] }).cards[0]) !== strip(P[c.id]));
    if (added.length) lines.push(`新しいカード ${added.length}種：${added.slice(0, 8).map(c => c.name).join("、")}${added.length > 8 ? " ほか" : ""}`);
    if (changed.length) lines.push(`変更したカード ${changed.length}種：${changed.slice(0, 8).map(c => c.name).join("、")}${changed.length > 8 ? " ほか" : ""}`);
    if (removed.length) lines.push(`削除したカード ${removed.length}種：${removed.slice(0, 8).map(c => c.name).join("、")}（持っている人のデッキからは使えなくなります）`);
    const np = normalizeData(out);
    if (JSON.stringify(np.packs) !== JSON.stringify(pub.packs)) lines.push(`パックの設定を変更（${np.packs.map(p => p.name + (p.open ? "" : "・停止中")).join("、")}）`);
    if (JSON.stringify(np.decks) !== JSON.stringify(pub.decks)) lines.push("CPU・スターターのデッキを変更");
    const cfgDiff = Object.keys(np.config).filter(k => !["SEASON", "SAMPLE_DECKS"].includes(k) && np.config[k] !== pub.config[k]);
    if (cfgDiff.length) lines.push(`数値の設定を変更：${cfgDiff.map(k => `${(CONFIG_INFO[k] && CONFIG_INFO[k].label) || k} ${pub.config[k]}→${np.config[k]}`).join("、")}`);
    if (np.config.SAMPLE_DECKS !== pub.config.SAMPLE_DECKS) lines.push(np.config.SAMPLE_DECKS ? "サンプルデッキ（全カード）を使えるようにする" : "サンプルデッキ（全カード）を終了する");
    if (!lines.length) lines.push("公開中の内容と同じです（変更はありません）。");
    return lines;
  },

  async start() {
    if (!this.ready()) return this.showSettings("先に公開設定をしてください。");
    let pub = null;
    try { pub = normalizeData(await fetchPublished()); } catch {}
    const out = exportJSON();
    const seasonChange = pub && normalizeData(out).config.SEASON !== pub.config.SEASON;
    const size = new Blob([JSON.stringify(out)]).size;
    openModal(`<div class="dialog wide" role="dialog" aria-labelledby="pbT">
      <h3 id="pbT">サイトに公開しますか？</h3>
      ${seasonChange ? `<p class="warnbox"><b>シーズンが「${esc(pub.config.SEASON)}」から「${esc(normalizeData(out).config.SEASON)}」に変わります。</b>公開すると、全員の所持カード・G・デッキがリセットされ、新規スタートになります。</p>` : ""}
      <ul class="difflist">${this.diffSummary(pub, out).map(l => `<li>${esc(l)}</li>`).join("")}</ul>
      <div class="field"><label for="pub-note">変更のメモ（履歴に残ります・任意）</label>
        <input class="txt" id="pub-note" maxlength="80" placeholder="例：第2弾パックを追加、炎竜の攻撃力を下げた"></div>
      <p class="hint">データ ${fmtBytes(size)}。公開すると1〜2分でサイトに反映され、遊ぶ人はゲームを開き直すと新しい内容になります。</p>
      <div class="acts">
        <button type="button" class="btn" data-act="closeModal">やめる</button>
        <button type="button" class="btn ${seasonChange ? "danger" : "primary"}" data-act="pubGo">${seasonChange ? "リセットして公開する" : "公開する"}</button>
      </div>
    </div>`);
  },

  /* イラストは game-data.json に埋め込まず、art/ フォルダに別ファイルとして置く（データを軽く保つため） */
  async uploadArts(out) {
    let done = {};
    try { done = JSON.parse(localStorage.getItem(PUB_KEY + "-arts") || "{}"); } catch {}
    const list = out.cards.filter(c => c.art && c.art.startsWith("data:image/"));
    let n = 0;
    for (const c of list) {
      const m = c.art.match(/^data:image\/(webp|jpeg|png);base64,(.+)$/);
      if (!m) continue;
      const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(m[2]));
      const hash = [...new Uint8Array(buf)].slice(0, 5).map(b => b.toString(16).padStart(2, "0")).join("");
      const path = `art/${c.id}-${hash}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
      if (!done[path]) {
        n++;
        this.progress(`イラストを送っています…（${n}/${list.length}）`);
        const r = await this.api(`/contents/${path}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `イラスト：${c.name}`, content: m[2], branch: this.cfg.branch })
        });
        // 422 は「同じファイルがもうある」なので成功扱い
        if (!r.ok && r.status !== 422) throw { status: r.status };
        done[path] = 1;
        try { localStorage.setItem(PUB_KEY + "-arts", JSON.stringify(done)); } catch {}
      }
      c.art = path;
    }
  },

  async go() {
    if (this.busy) return;
    this.busy = true;
    const note = ($("#pub-note") && $("#pub-note").value.trim()) || "カード工房から更新";
    const out = exportJSON();
    this.progress("GitHubに送っています…");
    try {
      await this.uploadArts(out);
    } catch (e) {
      this.busy = false;
      return this.progress(e && e.status ? this.errText(e.status) : "イラストを送れませんでした。", true);
    }
    const text = JSON.stringify(out, null, 1) + "\n";
    try {
      let ok = false, status = 0;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        const g = await this.api(`/contents/${PUB_PATH}?ref=${encodeURIComponent(this.cfg.branch)}`);
        if (!g.ok) { status = g.status; break; }
        const sha = (await g.json()).sha;
        const p = await this.api(`/contents/${PUB_PATH}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `${note}（v${out.version}）`, content: this.b64(text), sha, branch: this.cfg.branch })
        });
        status = p.status; ok = p.ok;
        if (!ok && status !== 409) break;
      }
      if (!ok) { this.busy = false; return this.progress(this.errText(status), true); }
      DATA.version = out.version; DATA.updated = out.updated;
      exportedSnap = snap();
      flushSave();
      this.progress(`公開しました（v${out.version}）。サイトに反映されるのを待っています…`);
      this.waitLive(out.version);
    } catch (e) {
      console.error(e);
      this.busy = false;
      this.progress("GitHubに接続できませんでした。通信状態を確認してください。", true);
    }
  },

  /* GitHub Pages に反映されたかを確かめる（最大4分） */
  async waitLive(version) {
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      await new Promise(r => setTimeout(r, 8000));
      try {
        const r = await fetch(`${PUB_PATH}?t=${Date.now()}`, { cache: "no-store" });
        if (r.ok && (await r.json()).version >= version) {
          this.busy = false;
          return this.progress(`サイトに反映されました（v${version}）。遊ぶ人はゲームを開き直すと新しい内容になります。`, true, true);
        }
      } catch {}
      const sec = Math.round((Date.now() - t0) / 1000);
      this.progress(`公開しました（v${version}）。サイトに反映されるのを待っています…（${sec}秒）`);
    }
    this.busy = false;
    this.progress(`公開は完了しています（v${version}）。サイトへの反映に時間がかかっています。数分後にゲームを開き直して確認してください。`, true, true);
  },

  progress(text, done, good) {
    openModal(`<div class="dialog" role="dialog" aria-live="polite">
      <h3>${done ? (good ? "公開しました" : "公開できませんでした") : "公開中"}</h3>
      <p>${esc(text)}</p>
      ${done ? `<div class="acts">${good ? "" : `<button type="button" class="btn" data-act="pubSettings">公開設定を開く</button>`}<button type="button" class="btn primary" data-act="closeModal">閉じる</button></div>` : `<p class="hint">この画面を閉じても公開は続きます。</p><div class="acts"><button type="button" class="btn" data-act="closeModal">閉じる</button></div>`}
    </div>`);
    renderStatus();
  },

  /* ---------- 公開履歴 ---------- */
  async showHistory() {
    if (!this.ready()) return this.showSettings("履歴を見るには、公開設定が必要です。");
    openModal(`<div class="dialog wide"><h3>公開履歴</h3><p>読み込み中…</p></div>`);
    try {
      const r = await this.api(`/commits?path=${PUB_PATH}&sha=${encodeURIComponent(this.cfg.branch)}&per_page=15`);
      if (!r.ok) return this.progress(this.errText(r.status), true);
      const list = await r.json();
      openModal(`<div class="dialog wide" role="dialog" aria-labelledby="phT">
        <h3 id="phT">公開履歴</h3>
        <p class="hint">「読み込む」を押すと、その時点の内容がカード工房に読み込まれます（まだ公開はされません）。確認してから「公開する」を押すと、その内容に戻せます。</p>
        <ul class="histlist">${list.map(c => `<li>
          <div><b>${esc(c.commit.message.split("\n")[0])}</b><small>${new Date(c.commit.author.date).toLocaleString("ja-JP")}</small></div>
          <button type="button" class="btn sm" data-act="pubLoad" data-sha="${esc(c.sha)}">読み込む</button></li>`).join("")}</ul>
        <div class="acts"><button type="button" class="btn primary" data-act="closeModal">閉じる</button></div>
      </div>`);
    } catch { this.progress("GitHubに接続できませんでした。", true); }
  },

  async loadVersion(sha) {
    try {
      const r = await this.api(`/contents/${PUB_PATH}?ref=${encodeURIComponent(sha)}`, { headers: { Accept: "application/vnd.github.raw+json" } });
      if (!r.ok) return this.progress(this.errText(r.status), true);
      pendingImport = normalizeData(JSON.parse(await r.text()));
      pendingImport.version = DATA.version; // 次の公開で番号が戻らないように
      applyImport();
      notice = "以前の公開内容を読み込みました。確認して「公開する」を押すと、その内容に戻ります。";
      renderStatus();
    } catch (e) { this.progress("読み込めませんでした。", true); }
  },

  act(name, el) {
    switch (name) {
      case "publish": this.start(); return true;
      case "pubGo": this.go(); return true;
      case "pubSettings": this.showSettings(); return true;
      case "pubSaveCfg": this.saveAndTest(); return true;
      case "pubForget": this.cfg.token = ""; this.saveCfg(); this.showSettings("鍵を消しました。"); renderStatus(); return true;
      case "pubHistory": this.showHistory(); return true;
      case "pubLoad": this.loadVersion(el.dataset.sha); return true;
    }
    return false;
  }
};
