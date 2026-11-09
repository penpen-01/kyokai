/* =========================================================
   決着の演出（約2秒・タップで先へ）
   1. 最後の一撃で一瞬止まって、画面が白く光る
   2. 負けた側の顔にひびが入り、砕ける
   3. 勝ち：光の筋の中に金色の「VICTORY / 勝利」。負け：盤面が灰色に沈み「DEFEAT / 敗北」
   4. 「タップして続ける」→ 結果の画面（報酬と次にすること）
   ========================================================= */
const Finale = {
  el: null, done: null, timers: [],

  play(res, done) {
    this.stop();
    this.done = done;
    const reduced = Motion.reduced;
    const loser = res === "win" ? OP : res === "lose" ? ME : null;
    const app = document.getElementById("app");
    const layer = document.createElement("div");
    layer.className = `fin fin-${res}`;
    layer.setAttribute("role", "button");
    layer.setAttribute("aria-label", "タップして結果へ");
    const en = { win: "VICTORY", lose: "DEFEAT", draw: "DRAW" }[res], ja = { win: "勝利", lose: "敗北", draw: "引き分け" }[res];
    layer.innerHTML = `<div class="fin-flash"></div>
      <div class="fin-bg"></div>
      ${res === "win" ? `<div class="fin-rays"></div>` : ""}
      <div class="fin-sparks">${Array.from({ length: 26 }, (_, i) => `<i style="--x:${Math.round(Math.random() * 100)}%;--d:${(Math.random() * 1.6).toFixed(2)}s;--s:${(0.6 + Math.random() * 1.2).toFixed(2)}"></i>`).join("")}</div>
      <div class="fin-title"><span class="fin-en" data-t="${en}">${en}</span><b class="fin-ja">${ja}</b></div>
      <p class="fin-tap">タップして続ける</p>`;
    document.body.appendChild(layer);
    this.el = layer;
    layer.addEventListener("click", () => this.finish(), { once: true });
    const at = (ms, fn) => this.timers.push(setTimeout(fn, reduced ? Math.min(ms, 100) : ms));
    // 1. 一瞬止まって白く光る
    Sound.play(res === "win" ? "face" : "destroy");
    // 2. 負けた側の顔にひび → 砕ける
    const face = loser != null ? document.querySelector(`#app ${playerSel(loser)}`) : null;
    if (face) {
      at(180, () => { face.classList.add("fin-crack"); });
      at(620, () => { Motion.shatter(face); face.classList.add("fin-gone"); Sound.play("destroy"); });
    }
    if (res !== "win" && app) at(500, () => app.classList.add("fin-gray"));
    // 3. 文字
    at(760, () => { layer.classList.add("show"); Sound.play(res === "win" ? "win" : res === "lose" ? "lose" : "click"); });
    // 4. タップの案内
    at(2000, () => layer.classList.add("ready"));
  },

  finish() {
    const done = this.done;
    this.stop();
    if (done) done();
  },
  stop() {
    this.timers.forEach(clearTimeout); this.timers = [];
    if (this.el) { this.el.remove(); this.el = null; }
    this.done = null;
  },
  /* 対局を離れるときは、灰色やひびを戻す */
  reset() {
    this.stop();
    const app = document.getElementById("app");
    if (app) app.classList.remove("fin-gray");
  }
};
