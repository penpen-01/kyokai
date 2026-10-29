/* =========================================================
   起動画面（タップしてスタート）
   3つの世界（神話・幻想・機械）の帯を斜めに並べ、その境目を金色に光らせる。
   帯の中には、その世界でいちばんレア度の高いカードのイラストを表示する。
   裏ではアカウントの読み込みを進めておき、タップされたらホーム画面へ進む。
   ========================================================= */

const Splash = {
  shown: false,
  ready: false,
  tapped: false,
  leaving: false,
  next: null,

  pick(world) {
    const rank = { legend: 5, ur: 4, sr: 3, rare: 2, common: 1 };
    const list = CARDS.filter(c => c.world === world && c.limit > 0);
    list.sort((a, b) => (b.art ? 1 : 0) - (a.art ? 1 : 0) || (rank[b.rarity] || 0) - (rank[a.rarity] || 0) || b.cost - a.cost);
    return list[0];
  },

  show() {
    this.shown = true;
    const bands = ["myth", "fan", "mech"].map((w, i) => {
      const c = this.pick(w);
      const inner = c && c.art
        ? `<img src="${esc(c.art)}" alt="" draggable="false">`
        : `<span class="sp-glyph">${esc(c ? c.glyph : WORLDS[w][0])}</span>`;
      return `<div class="sp-band sp-b${i} w-${w}"><div class="sp-art">${inner}</div><span class="sp-wname">${WORLDS[w]}</span></div>`;
    }).join("");
    let motes = "";
    for (let i = 0; i < 14; i++) {
      motes += `<i style="left:${(i * 37) % 100}%;animation-delay:${(i * 0.7) % 6}s;animation-duration:${6 + (i % 5)}s"></i>`;
    }
    const o = $("#overlay");
    o.className = "overlay solid splash";
    o.innerHTML = `<div class="sp-root" data-act="splashGo" role="button" aria-label="タップしてスタート">
      <div class="sp-bg">${bands}</div>
      <div class="sp-shade"></div>
      <div class="sp-motes" aria-hidden="true">${motes}</div>
      <div class="sp-center">
        <p class="sp-sub">神話 ・ 幻想 ・ 機械</p>
        <h1 class="sp-logo"><span>境界の</span><span>召喚士</span></h1>
        <p class="sp-tap" id="sp-tap">${this.ready ? "タップしてスタート" : "読み込み中…"}</p>
      </div>
      <p class="sp-foot">ベータ版${DATA_INFO.updated ? ` ・ カードデータ ${esc(DATA_INFO.updated)}` : ""}</p>
    </div>`;
    o.hidden = false;
    o.scrollTop = 0;
  },

  /* 読み込みが終わった。先にタップされていたらそのまま進む */
  setReady(next) {
    this.ready = true;
    this.next = next;
    const t = $("#sp-tap");
    if (t) t.textContent = "タップしてスタート";
    if (this.tapped) this.go();
  },

  go() {
    if (this.leaving) return;
    if (!this.ready) {
      this.tapped = true;
      const t = $("#sp-tap");
      if (t) t.textContent = "接続中…";
      return;
    }
    this.leaving = true;
    Sound.unlock();
    Sound.play("open");
    const root = $(".sp-root");
    if (root) root.classList.add("leave");
    setTimeout(() => {
      this.shown = false;
      if (this.next) this.next();
    }, Motion.reduced ? 50 : 520);
  },

  handleAct(act) {
    if (act !== "splashGo") return false;
    this.go();
    return true;
  }
};
