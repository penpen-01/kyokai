/* =========================================================
   カード工房：検証タブ
   ・対戦シミュレーション：選んだデッキどうしをCPUで総当たりさせ、勝率・先攻の有利・カードごとの成績を出す
   ・パックの検証：パックを何千個も開けて、レア度ごとの実際の割合とカードの出やすさを確かめる
   計算はゲーム本体（index.html?draft&sim）を見えない枠で開いて行う。編集中の内容（下書き）で試せる。
   ========================================================= */

const Lab = {
  frame: null, ready: false, running: false, queue: null,
  sel: null,        // 選んだデッキのid
  extra: [],        // デッキコードで足したデッキ
  battleRes: null, packRes: null, packJob: null,
  msg: "",

  allDecks() {
    const test = [
      { id: "t-aggro", name: "試験：速攻" }, { id: "t-ramp", name: "試験：ランプ" },
      { id: "t-control", name: "試験：コントロール" }, { id: "t-mid", name: "試験：ミッドレンジ" }
    ];
    return [
      ...test.map(d => ({ ...d, kind: "test" })),
      ...(DATA.decks || []).map(d => ({ id: d.id, name: d.name, cards: d.cards, kind: "cpu" })),
      ...this.extra.map(d => ({ ...d, kind: "code" }))
    ];
  },

  render() {
    const el = $("#tab-sim"); if (!el) return;
    if (!this.sel) this.sel = new Set(["t-aggro", "t-ramp", "t-control", "t-mid"]);
    const decks = this.allDecks();
    const kindName = { test: "試験用", cpu: "CPU・スターター", code: "コードから追加" };
    el.innerHTML = `
      <h2>検証</h2>
      <p class="hint">編集中の内容（まだ公開していない変更も含む）で、CPUどうしを戦わせたり、パックをたくさん開けたりして、バランスを確かめます。結果は目安です（CPUは人より下手で、特に速攻デッキは人が使うともう少し強くなります）。</p>
      <div class="fgroup">
        <span class="gl">対戦シミュレーション</span>
        <p class="hint">選んだデッキどうしを総当たりで戦わせます（席を入れ替えて、組み合わせごとに指定の試合数）。4デッキ×20試合なら240試合です。</p>
        ${["test", "cpu", "code"].map(k => {
          const list = decks.filter(d => d.kind === k);
          if (!list.length) return "";
          return `<div class="labdecks"><b class="small">${kindName[k]}</b>${list.map(d => `<label class="labdeck ${this.sel.has(d.id) ? "on" : ""}"><input type="checkbox" data-lab-deck="${esc(d.id)}" ${this.sel.has(d.id) ? "checked" : ""}>${esc(d.name)}</label>`).join("")}</div>`;
        }).join("")}
        <div class="frow">
          <input class="txt" id="lab-code" placeholder="デッキコード（KYK2:...）を貼り付けて追加" style="flex:1;min-width:220px">
          <button type="button" class="btn sm" data-act="labAddCode">追加</button>
        </div>
        <div class="frow">
          <label class="small">組み合わせごとの試合数
            <select class="txt" id="lab-n" style="width:auto">${[10, 20, 50, 100].map(n => `<option ${n === 20 ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <label class="small">CPUの強さ
            <select class="txt" id="lab-level" style="width:auto"><option value="normal" selected>中級（速い）</option><option value="hard">上級（遅い・正確）</option></select></label>
          ${this.running ? `<button type="button" class="btn sm danger" data-act="labStop">止める</button>` : `<button type="button" class="btn sm primary" data-act="labRun" ${this.sel.size < 2 ? "disabled" : ""}>シミュレーション開始</button>`}
        </div>
        <div id="lab-progress">${this.progressHTML()}</div>
        <div id="lab-battle">${this.battleHTML()}</div>
      </div>
      <div class="fgroup">
        <span class="gl">パックの検証</span>
        <p class="hint">パックをたくさん開けて、レア度ごとの実際の割合を、設定した排出率と比べます。アカウントには何も保存されません。</p>
        <div class="frow">
          <select class="txt" id="lab-pack" style="width:auto">${(DATA.packs || []).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select>
          <select class="txt" id="lab-pn" style="width:auto">${[1000, 10000, 50000].map(n => `<option ${n === 10000 ? "selected" : ""} value="${n}">${n.toLocaleString()}パック</option>`).join("")}</select>
          <button type="button" class="btn sm primary" data-act="labPacks" ${this.running ? "disabled" : ""}>開ける</button>
        </div>
        <div id="lab-packs">${this.packHTML()}</div>
      </div>`;
  },

  progressHTML() {
    if (!this.running && !this.msg) return "";
    const p = this.prog || { done: 0, total: 1 };
    return `${this.running ? `<div class="labbar"><i style="width:${Math.round(p.done / Math.max(1, p.total) * 100)}%"></i></div><span class="hint">${p.done} / ${p.total}</span>` : ""}${this.msg ? `<p class="warn">${esc(this.msg)}</p>` : ""}`;
  },
  updateProgress() { const el = $("#lab-progress"); if (el) el.innerHTML = this.progressHTML(); },

  pct: (w, g) => g ? Math.round(w / g * 100) : 0,
  bar(p) {
    const tone = p >= 60 ? "hi" : p <= 40 ? "lo" : "ok";
    return `<span class="labpct ${tone}"><i style="width:${p}%"></i><b>${p}%</b></span>`;
  },

  battleHTML() {
    const r = this.battleRes; if (!r) return "";
    const decided = r.games - r.draws;
    const cards = Object.fromEntries(DATA.cards.map(c => [c.id, c]));
    const rows = Object.entries(r.card).filter(([, v]) => v.g >= Math.max(10, r.games * 0.03))
      .map(([id, v]) => ({ id, name: id === "coin" ? "境界の欠片" : cards[id] ? cards[id].name : id, p: this.pct(v.w, v.g), g: v.g }))
      .sort((a, b) => b.p - a.p);
    const n = r.deck.length;
    return `
      <p>${r.stopped ? "<b>途中で止めました。</b>" : ""}${r.games}試合 ・ 平均${(r.turns / Math.max(1, r.games)).toFixed(1)}ターン ・ 先攻の勝率 <b>${this.pct(r.firstWins, decided)}%</b>${r.draws ? ` ・ 引き分け${r.draws}` : ""}</p>
      <table class="labtbl"><thead><tr><th>デッキ</th><th>勝率</th><th>試合</th></tr></thead><tbody>
        ${r.deck.map(d => `<tr><td>${esc(d.name)}</td><td>${this.bar(this.pct(d.w, d.g))}</td><td>${d.g}</td></tr>`).join("")}
      </tbody></table>
      <details><summary>組み合わせごとの勝率（行のデッキから見た勝率）</summary>
        <div class="labscroll"><table class="labtbl"><thead><tr><th></th>${r.deck.map(d => `<th>${esc(d.name)}</th>`).join("")}</tr></thead><tbody>
        ${r.deck.map((d, i) => `<tr><th>${esc(d.name)}</th>${r.deck.map((e, j) => {
          if (i === j) return `<td>―</td>`;
          const games = r.games / (n * (n - 1));
          const w = (r.vs[`${i}-${j}`] || 0) + (games - (r.vs[`${j}-${i}`] || 0));
          return `<td>${this.pct(w, games * 2)}%</td>`;
        }).join("")}</tr>`).join("")}</tbody></table></div>
      </details>
      <details><summary>カードごとの成績（使った試合の勝率。高いほど勝ちに貢献している可能性）</summary>
        <p class="hint">強いデッキに入っているカードは、それだけで高く出ます。同じデッキの中で比べたり、カードを調整して前後で比べたりするのに使ってください。</p>
        <div class="labscroll"><table class="labtbl"><thead><tr><th>カード</th><th>使った試合の勝率</th><th>使った試合数</th></tr></thead><tbody>
        ${rows.map(x => `<tr><td>${esc(x.name)}</td><td>${this.bar(x.p)}</td><td>${x.g}</td></tr>`).join("")}</tbody></table></div>
      </details>`;
  },

  packHTML() {
    const r = this.packRes; if (!r) return "";
    if (r.error) return `<p class="warn">${esc(r.error)}</p>`;
    const p = (DATA.packs || []).find(x => x.id === this.packJob) || { odds: DEFAULT_ODDS, name: "" };
    const R = RARITY_KEYS;
    const sum = o => R.reduce((a, k) => a + o[k], 0);
    const sn = sum(r.normal), sl = sum(r.last);
    const setN = sum(p.odds.normal), setL = sum(p.odds.last);
    const cards = Object.fromEntries(DATA.cards.map(c => [c.id, c]));
    const per = r.firstLegend.length ? (r.firstLegend.reduce((a, b) => a + b, 0) / r.firstLegend.length).toFixed(1) : "―";
    const byR = k => Object.entries(r.card).filter(([id]) => cards[id] && cards[id].rarity === k).map(([id, c]) => ({ name: cards[id].name, c })).sort((a, b) => b.c - a.c);
    return `
      <p>${r.n.toLocaleString()}パック（${(r.n * r.size).toLocaleString()}枚）を開けました。レジェンドは平均 <b>${per}パック</b>に1回出ました。</p>
      <table class="labtbl"><thead><tr><th>レア度</th><th>1〜${r.size - 1}枚目：設定</th><th>実際</th><th>${r.size}枚目：設定</th><th>実際</th></tr></thead><tbody>
      ${R.map(k => `<tr><td>${RARITY[k]}</td><td>${(p.odds.normal[k] / setN * 100).toFixed(1)}%</td><td>${(r.normal[k] / Math.max(1, sn) * 100).toFixed(1)}%</td><td>${(p.odds.last[k] / setL * 100).toFixed(1)}%</td><td>${(r.last[k] / Math.max(1, sl) * 100).toFixed(1)}%</td></tr>`).join("")}
      </tbody></table>
      <p class="hint">設定と実際がずれているときは、そのレア度のカードがパックに入っていない可能性があります（入っていないレア度は、1つ下のレア度から出ます）。</p>
      <details><summary>カードごとの出た回数</summary>
        ${R.map(k => { const l = byR(k); return l.length ? `<p class="small"><b>${RARITY[k]}</b>：${l.map(x => `${esc(x.name)} ${x.c}`).join("、")}</p>` : ""; }).join("")}
      </details>`;
  },

  /* ---------- 計算用の枠 ---------- */
  ensureFrame() {
    if (this.frame) return;
    const f = document.createElement("iframe");
    f.src = "index.html?draft&sim";
    f.title = "検証用";
    f.style.cssText = "position:fixed;width:1px;height:1px;left:-10px;top:-10px;border:0;opacity:0";
    document.body.appendChild(f);
    this.frame = f;
  },
  start(job) {
    flushSave();
    // 編集中の内容を確実に使うため、毎回読み直す
    if (this.frame) { this.frame.remove(); this.frame = null; }
    this.ready = false;
    this.queue = job;
    this.running = true; this.msg = ""; this.prog = { done: 0, total: 1 };
    this.ensureFrame();
    this.render();
  },
  onMessage(d) {
    if (d.type === "ready") {
      this.ready = true;
      if (this.queue) { this.frame.contentWindow.postMessage({ to: "simlab", type: "run", job: this.queue }, location.origin); this.queue = null; }
      if (!d.draft) this.msg = "編集中の内容を読み込めなかったため、公開中の内容で計算しています。";
    } else if (d.type === "progress") {
      this.prog = { done: d.done, total: d.total }; this.updateProgress();
    } else if (d.type === "result") {
      this.running = false;
      if (d.kind === "packs") this.packRes = d.data; else this.battleRes = d.data;
      this.render();
    } else if (d.type === "error") {
      this.running = false; this.msg = "計算できませんでした：" + d.message; this.render();
    }
  },

  act(name, el) {
    switch (name) {
      case "labRun": {
        const ids = [...this.sel];
        const all = this.allDecks();
        const decks = ids.map(id => all.find(d => d.id === id)).filter(Boolean)
          .map(d => d.kind === "test" ? { testId: d.id, name: d.name } : { name: d.name, cards: d.cards });
        this.start({ kind: "battle", decks, n: +$("#lab-n").value, level: $("#lab-level").value });
        return true;
      }
      case "labStop": if (this.frame) this.frame.contentWindow.postMessage({ to: "simlab", type: "stop" }, location.origin); return true;
      case "labPacks": {
        this.packJob = $("#lab-pack").value;
        this.start({ kind: "packs", packId: this.packJob, n: +$("#lab-pn").value });
        return true;
      }
      case "labAddCode": {
        const d = codeToDeck($("#lab-code").value);
        if (!d) { this.msg = "デッキコードを読み取れませんでした"; this.render(); return true; }
        const id = "x" + Date.now().toString(36);
        this.extra.push({ id, name: d.name, cards: d.cards });
        this.sel.add(id); this.msg = ""; this.render();
        return true;
      }
    }
    return false;
  }
};

window.addEventListener("message", e => {
  if (e.origin !== location.origin || !e.data || e.data.from !== "simlab") return;
  Lab.onMessage(e.data);
});
document.addEventListener("change", e => {
  const id = e.target.dataset && e.target.dataset.labDeck;
  if (!id) return;
  if (e.target.checked) Lab.sel.add(id); else Lab.sel.delete(id);
  e.target.closest(".labdeck").classList.toggle("on", e.target.checked);
  const b = $('[data-act="labRun"]'); if (b) b.disabled = Lab.sel.size < 2;
});
