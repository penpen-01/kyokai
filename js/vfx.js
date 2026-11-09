/* =========================================================
   効果の演出（対戦中）
   fx(sel, text, cls) の cls で呼び分ける。どれも短く、重い演出は Motion.hold で
   順番待ちにする（同時に起きた演出は、順番に1つずつ見せる）。
   ・bolt:世界[:m]   … 効果のダメージ。出した場所から相手へ光の弾が飛ぶ（m＝続きがあるので待たない）
   ・freeze / silence / poof（変身）/ tohand / todeck / void（亜空間へ）/ voidback
   ・pierce（貫通）/ poison（毒）/ guard（守護）/ gear（歯車を使う・増える）
   ・reveal:pi:ラベル … 捨てられた・燃えたカードを、両方の画面の真ん中に見せる
   ・peek:pi         … 相手の手札を見た（見た人の画面だけ）
   ========================================================= */
const WORLD_COLOR = { myth: "#ffd86b", fan: "#7fe3c0", mech: "#6fc6ff" };
const Vfx = {
  layer() { return document.getElementById("fx"); },
  el(sel) { return sel ? document.querySelector("#app " + sel) || document.querySelector(sel) : null; },
  center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  add(cls, x, y, html = "") {
    const d = document.createElement("div");
    d.className = "vfx " + cls;
    Object.assign(d.style, { left: x + "px", top: y + "px" });
    d.innerHTML = html;
    this.layer().appendChild(d);
    return d;
  },
  later(el, ms) { setTimeout(() => el.remove(), ms); },
  float(r, text, cls) {
    const t = document.createElement("span");
    t.className = "float " + cls; t.textContent = text;
    Object.assign(t.style, { left: r.left + r.width / 2 + "px", top: r.top + r.height / 2 + "px" });
    this.layer().appendChild(t);
    setTimeout(() => t.remove(), 1000);
  },
  /* 出どころ：キャラ（data-uid）・プレイヤー・"cast:pi"（魔法：相手は真ん中、自分は手札のあたり） */
  origin(src) {
    const m = /^cast:(\d)$/.exec(src || "");
    if (m) {
      const vw = innerWidth, vh = innerHeight;
      return +m[1] === ME ? { x: vw / 2, y: vh * 0.8 } : { x: vw / 2, y: vh * 0.42 };
    }
    const e = this.el(src);
    return e ? this.center(e.getBoundingClientRect()) : null;
  },

  run(sel, text, cls, retry) {
    const [kind, a, b] = cls.split(":");
    const R = Motion.reduced;
    switch (kind) {
      case "bolt": return this.bolt(sel, text, a, b === "m", R);
      case "reveal": return this.reveal(text, +a, b || "捨てられた", R);
      case "peek": return this.peek(text, +a, R);
    }
    const e = this.el(sel);
    if (!e) { if (!retry) setTimeout(() => this.run(sel, text, cls, true), 90); return; }   // 戻ってきたキャラなど、まだ描かれていないとき
    const r = e.getBoundingClientRect(), c = this.center(r);
    if (!r.width) return;
    switch (kind) {
      case "freeze": {
        const d = this.add("v-ice", c.x, c.y, Array.from({ length: 8 }, (_, i) => `<i style="--a:${i * 45}deg"></i>`).join(""));
        d.style.width = r.width + "px"; d.style.height = r.height + "px";
        this.later(d, 900); this.float(r, text || "凍結", "ice");
        Sound.play("buff"); if (!R) Motion.hold(300); return;
      }
      case "silence": {
        const d = this.add("v-chain", c.x, c.y, `<i></i><i></i>`);
        d.style.width = r.width * 1.1 + "px"; d.style.height = r.height + "px";
        this.later(d, 950); this.float(r, text || "沈黙", "mute");
        Sound.play("hit"); if (!R) Motion.hold(300); return;
      }
      case "poof": {
        const d = this.add("v-poof", c.x, c.y, Array.from({ length: 9 }, (_, i) => `<i style="--a:${i * 40}deg;--d:${(i % 3) * 40}ms"></i>`).join(""));
        this.later(d, 900); this.float(r, text || "変身", "trans");
        Sound.play("flip"); if (!R) Motion.hold(380); return;
      }
      case "tohand": case "todeck": {
        const pi = +a;
        const to = kind === "todeck" ? document.querySelector(".pile") : pi === ME ? document.querySelector(".hand") : this.el(playerSel(pi));
        const g = e.cloneNode(true); g.removeAttribute("data-uid"); g.classList.add("ghostcard");
        Object.assign(g.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px" });
        this.layer().appendChild(g);
        if (to && !R) {
          const t = this.center(to.getBoundingClientRect());
          g.animate([{ transform: "none", opacity: 1, filter: "brightness(1.6)" },
            { transform: `translate(${(t.x - c.x) * .2}px,${(t.y - c.y) * .2 - 20}px) scale(1.05) rotate(-6deg)`, opacity: 1, offset: .3 },
            { transform: `translate(${t.x - c.x}px,${t.y - c.y}px) scale(.35) rotate(8deg)`, opacity: 0 }], { duration: 560, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" });
        }
        this.later(g, 600); this.float(r, text, "heal");
        Sound.play("flip"); if (!R) Motion.hold(380); return;
      }
      case "void": case "voidback": {
        const d = this.add("v-void " + (kind === "voidback" ? "back" : ""), c.x, c.y, "<i></i>");
        d.style.width = d.style.height = Math.max(r.width, r.height) * 1.1 + "px";
        this.later(d, 900);
        if (kind === "void") { const g = e.cloneNode(true); g.removeAttribute("data-uid"); g.classList.add("ghostcard");
          Object.assign(g.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px" }); this.layer().appendChild(g);
          if (!R) g.animate([{ transform: "none", opacity: 1 }, { transform: "scale(.1) rotate(220deg)", opacity: 0, filter: "hue-rotate(90deg) brightness(2)" }], { duration: 600, easing: "ease-in", fill: "forwards" });
          this.later(g, 650); }
        this.float(r, text || (kind === "void" ? "亜空間へ" : "帰還"), "void");
        Sound.play(kind === "void" ? "flip" : "buff"); if (!R) Motion.hold(kind === "void" ? 420 : 300); return;
      }
      case "pierce": {
        const d = this.add("v-pierce", c.x, c.y, "<i></i>"); this.later(d, 700);
        this.float(r, text || "貫通", "dmg"); return;
      }
      case "poison": {
        const d = this.add("v-poison", c.x, c.y, Array.from({ length: 7 }, (_, i) => `<i style="--x:${(i - 3) * 9}px;--d:${i * 50}ms"></i>`).join(""));
        d.style.width = r.width + "px"; d.style.height = r.height + "px";
        this.later(d, 900); this.float(r, text || "毒", "poison");
        Sound.play("hit"); if (!R) Motion.hold(300); return;
      }
      case "guard": {
        const d = this.add("v-guard", c.x, c.y, `<svg viewBox="0 0 40 46"><path d="M20 2 37 8v14c0 11-8 18-17 22C11 40 3 33 3 22V8z" fill="rgba(140,190,255,.25)" stroke="#bcd8ff" stroke-width="2.4"/></svg>`);
        this.later(d, 900); this.float(r, text || "守護", "guard"); return;
      }
      case "gear": {
        const up = /^\+/.test(text || "");
        const d = this.add("v-gear " + (up ? "up" : "down"), c.x, c.y, Array.from({ length: 4 }, (_, i) => `<i style="--i:${i}">${GEAR_SVG}</i>`).join(""));
        this.later(d, 1000); this.float(r, text, up ? "heal" : "gearf");
        Sound.play(up ? "buff" : "flip"); return;
      }
    }
  },

  /* 回復：緑の光の粒が上がる */
  heal(r) {
    if (Motion.reduced) return;
    const c = this.center(r);
    const d = this.add("v-heal", c.x, c.y, Array.from({ length: 8 }, (_, i) => `<i style="--x:${(i - 3.5) * (r.width / 9)}px;--d:${(i % 4) * 70}ms"></i>`).join(""));
    this.later(d, 1000);
  },

  bolt(src, dst, world, multi, R) {
    const o = this.origin(src), t = this.el(dst);
    if (!o || !t) return;
    const tr = t.getBoundingClientRect(), tc = this.center(tr);
    const color = WORLD_COLOR[world] || "#ffd86b";
    const d = this.add("v-bolt", o.x, o.y, "<i></i>");
    d.style.setProperty("--c", color);
    const ang = Math.atan2(tc.y - o.y, tc.x - o.x) * 180 / Math.PI;
    const ms = R ? 1 : 300;
    d.animate([{ transform: `translate(-50%,-50%) rotate(${ang}deg) scale(.6)` },
      { transform: `translate(calc(-50% + ${tc.x - o.x}px), calc(-50% + ${tc.y - o.y}px)) rotate(${ang}deg) scale(1.1)` }], { duration: ms, easing: "cubic-bezier(.5,0,.8,.6)", fill: "forwards" });
    setTimeout(() => { d.remove(); const h = this.add("v-hit", tc.x, tc.y, "<i></i>"); h.style.setProperty("--c", color); this.later(h, 420); }, ms);
    Sound.play("flip");
    if (!multi && !R) Motion.hold(ms + 30);
  },

  /* 捨てられたカードを真ん中に見せる（両方の画面） */
  reveal(id, pi, label, R) {
    const d = DEF[id]; if (!d) return;
    const w = document.createElement("div");
    w.className = "castshow v-reveal";
    w.innerHTML = `<div class="castlabel">${esc(S && S.players[pi] ? S.players[pi].name : "")}の${esc(label)}</div><div class="castcard">${cardHTML(d)}</div>`;
    this.layer().appendChild(w);
    setTimeout(() => w.remove(), R ? 800 : 1300);
    Sound.play("destroy");
    Motion.hold(R ? 500 : 950);
  },
  /* 相手の手札を見た（見た人の画面だけに並べる） */
  peek(ids, pi, R) {
    if (pi !== ME) return;
    const list = String(ids || "").split(",").filter(id => DEF[id]);
    const w = document.createElement("div");
    w.className = "v-peek";
    w.innerHTML = `<div class="castlabel">相手の手札</div><div class="v-peek-row">${list.length ? list.map(id => `<div class="castcard">${cardHTML(DEF[id])}</div>`).join("") : "<p>0枚</p>"}</div>`;
    this.layer().appendChild(w);
    setTimeout(() => w.remove(), R ? 1200 : 2000);
    Motion.hold(R ? 800 : 1700);
  }
};
const GEAR_SVG = `<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.9 2.2-2-.4a7 7 0 0 0-.8-1.9l1.2-1.7-1.9-1.9-1.7 1.2a7 7 0 0 0-1.9-.8l-.4-2h-2.8l-.4 2a7 7 0 0 0-1.9.8L6.6 4.8 4.7 6.7l1.2 1.7a7 7 0 0 0-.8 1.9l-2 .4v2.8l2 .4c.2.7.4 1.3.8 1.9l-1.2 1.7 1.9 1.9 1.7-1.2c.6.4 1.2.6 1.9.8l.4 2h2.8l.4-2c.7-.2 1.3-.4 1.9-.8l1.7 1.2 1.9-1.9-1.2-1.7c.4-.6.6-1.2.8-1.9l2-.4z" fill="#d9b25c" stroke="#5a3d0c" stroke-width=".8"/></svg>`;
