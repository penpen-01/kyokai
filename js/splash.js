/* =========================================================
   起動画面（タップしてスタート）
   3つの世界（神話・幻想・機械）の光の中を、カードが回転しながら降ってくる。
   降らせるのは絵のあるすべてのカード。毎回ばらばらに選び、降りきるたびに画面に出ていないカードへ入れ替える。
   カードは奥・中・手前の3段（小さく暗い→大きく明るい）で、1枚降りきるたびに別のカードに入れ替わる。
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
    const list = CARDS.filter(c => c.world === world && c.limit > 0 && cardShown(c));
    list.sort((a, b) => (b.art ? 1 : 0) - (a.art ? 1 : 0) || (rank[b.rarity] || 0) - (rank[a.rarity] || 0) || b.cost - a.cost);
    return list[0];
  },

  /* 3つの世界の斜めの帯（ホーム画面の背景にも使う） */
  bandsHTML() {
    return ["myth", "fan", "mech"].map((w, i) => {
      const c = this.pick(w);
      const inner = c && c.art
        ? `<img src="${esc(c.art)}" alt="" draggable="false">`
        : `<span class="sp-glyph">${esc(c ? c.glyph : WORLDS[w][0])}</span>`;
      return `<div class="sp-band sp-b${i} w-${w}"><div class="sp-art">${inner}</div><span class="sp-wname">${WORLDS[w]}</span></div>`;
    }).join("");
  },

  /* 降らせるカード：絵のあるすべてのカード */
  pool() { return CARDS.filter(c => c.art && c.limit > 0 && cardShown(c)); },
  /* avoid（今出ているカードのID）以外から1枚 */
  randomCard(avoid) {
    const p = this.cardPool && this.cardPool.length ? this.cardPool : this.pool();
    const free = avoid ? p.filter(c => !avoid.has(c.id)) : p;
    const list = free.length ? free : p;
    return list[Math.floor(Math.random() * list.length)];
  },
  /* 1枚分の降るカード。奥（0）ほど小さく暗く遅い */
  fallHTML(i, layer, card) {
    const L = [{ s: .5, d: 15, o: .5, b: 1.6 }, { s: .78, d: 11, o: .78, b: .4 }, { s: 1.08, d: 8, o: .95, b: 0 }][layer];
    const dur = L.d + (i % 3) * 1.3, x = 8 + ((i * 37 + layer * 19) % 84);
    const delay = -((i * 2.9 + layer * 1.7) % dur);       // 最初から画面に散らばっているように、途中から始める
    // 回る速さ（秒）と向き。速さをマイナスにすると CSS では無効になって回らなくなるので、向きは別に指定する
    const rot = ((i * 47) % 50) - 25, spin = 5 + (i % 4) * 1.5, dir = i % 2 ? "normal" : "reverse";
    return `<div class="sp-fall l${layer}" style="--x:${x}%;--s:${L.s};--d:${dur}s;--dl:${delay.toFixed(2)}s;--r:${rot}deg;--o:${L.o};--b:${L.b}px;--spin:${spin}s;--dir:${dir}">
      <div class="sp-spin"><div class="sp-face" data-id="${esc(card.id)}">${cardHTML(card, { static: true })}</div><div class="sp-backface"></div></div></div>`;
  },

  show() {
    this.shown = true;
    this.cardPool = this.pool();
    let falls = "", used = new Set(), i = 0;
    [[0, 5], [1, 5], [2, 4]].forEach(([layer, n]) => {
      for (let k = 0; k < n; k++, i++) { const c = this.randomCard(used); used.add(c.id); falls += this.fallHTML(i, layer, c); }
    });
    let motes = "";
    for (let i = 0; i < 14; i++) {
      motes += `<i style="left:${(i * 37) % 100}%;animation-delay:${(i * 0.7) % 6}s;animation-duration:${6 + (i % 5)}s"></i>`;
    }
    const o = $("#overlay");
    o.className = "overlay solid splash";
    o.innerHTML = `<div class="sp-root" data-act="splashGo" role="button" aria-label="タップしてスタート">
      <div class="sp-sky" aria-hidden="true"><i class="w-myth"></i><i class="w-fan"></i><i class="w-mech"></i></div>
      <div class="sp-rain" aria-hidden="true">${falls}</div>
      <div class="sp-shade"></div>
      <div class="sp-motes" aria-hidden="true">${motes}</div>
      <div class="sp-center">
        <h1 class="sp-logo two" aria-label="境界の召喚士"><img class="sp-frame" src="ui/logo-frame.webp" alt="" draggable="false"><span class="l1a">境</span><span class="l1b">界<small>の</small></span><span class="l2">召喚士</span><span class="l0">境界の召喚士</span></h1>
        <p class="sp-sub">神話 ・ 幻想 ・ 機械</p>
        <p class="sp-tap" id="sp-tap">${this.ready ? "タップしてスタート" : "読み込み中…"}</p>
      </div>
      ${DATA_INFO.updated ? `<p class="sp-foot">カードデータ ${esc(DATA_INFO.updated)}</p>` : ""}
    </div>`;
    o.hidden = false;
    o.scrollTop = 0;
    // 1枚降りきるたびに、画面に出ていないカードに入れ替える
    const rain = o.querySelector(".sp-rain");
    rain.addEventListener("animationiteration", e => {
      const f = e.target;
      if (!f.classList || !f.classList.contains("sp-fall")) return;
      const now = new Set([...rain.querySelectorAll(".sp-face")].map(el => el.dataset.id));
      const c = this.randomCard(now), face = f.querySelector(".sp-face");
      face.dataset.id = c.id;
      face.innerHTML = cardHTML(c, { static: true });
    });
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
