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
/* 結界のドームの六角形の網目（100×100 の中の円に入る分だけ）。--d は下から組み上がる順の遅れ */
const WARD_HEX = (() => {
  const r = 7.2, w = Math.sqrt(3) * r, out = [];
  for (let row = -8; row <= 8; row++) for (let col = -8; col <= 8; col++) {
    const x = 50 + col * w + (row & 1 ? w / 2 : 0), y = 50 + row * r * 1.5;
    if (Math.hypot(x - 50, y - 50) > 49) continue;
    const pts = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${(x + r * 0.92 * Math.cos(a)).toFixed(1)},${(y + r * 0.92 * Math.sin(a)).toFixed(1)}`; }).join(" ");
    const d = ((100 - y) / 100 * 0.45 + Math.random() * 0.08).toFixed(2), tw = Math.random() < 0.22 ? " tw" : "";
    out.push(`<polygon class="wh${tw}" points="${pts}" style="--d:${d}s;--k:${(Math.random() * 4).toFixed(2)}s"/>`);
  }
  return `<svg class="ward-hex" viewBox="0 0 100 100">${out.join("")}</svg>`;
})();
const WARD_BADGE = `<svg viewBox="0 0 40 46"><defs><linearGradient id="wbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9fbff"/><stop offset=".5" stop-color="#6fd3ff"/><stop offset="1" stop-color="#1b6fa8"/></linearGradient></defs><path d="M20 2 37 8v14c0 11-8 18-17 22C11 40 3 33 3 22V8z" fill="url(#wbg)" stroke="#e9fbff" stroke-width="2"/><path d="M20 12l7 4v8l-7 4-7-4v-8z" fill="none" stroke="#0d3e66" stroke-width="2.2"/></svg>`;

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
    const multi = /:m$/.test(cls);   // 全体の効果：いっぺんに出して、最後にまとめて待つ（wait）
    const R = Motion.reduced;
    const hold = ms => { if (!R && !multi) Motion.hold(ms); };
    const snd = n => { if (!multi || !this.sndAt || Date.now() - this.sndAt > 120) { this.sndAt = Date.now(); Sound.play(n); } };
    switch (kind) {
      case "wait": if (!R) Motion.hold(+a || 300); return;
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
        const d = this.add("v-ice", c.x, c.y, `<b class="frost"></b><b class="flake">${SNOW_SVG}</b>` + Array.from({ length: 10 }, (_, i) => `<i style="--a:${i * 36 + (i % 2) * 14}deg;--l:${14 + (i % 3) * 8}px"></i>`).join(""));
        d.style.width = r.width + "px"; d.style.height = r.height + "px";
        this.later(d, 1000); 
        snd("buff"); hold(260); return;
      }
      case "silence": {
        const d = this.add("v-chain", c.x, c.y, `<i></i><i></i>`);
        d.style.width = r.width * 1.1 + "px"; d.style.height = r.height + "px";
        this.later(d, 950); 
        snd("hit"); hold(240); return;
      }
      case "poof": {
        const d = this.add("v-poof", c.x, c.y, Array.from({ length: 9 }, (_, i) => `<i style="--a:${i * 40}deg;--d:${(i % 3) * 40}ms"></i>`).join(""));
        this.later(d, 900); 
        snd("flip"); hold(170); return;
      }
      case "tohand": case "todeck": {
        const pi = +a;
        const to = kind === "todeck" ? document.querySelector(".pile") : pi === ME ? document.querySelector(".hand") : this.el(playerSel(pi));
        const g = e.cloneNode(true); g.removeAttribute("data-uid"); g.classList.add("ghostcard");
        Object.assign(g.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px" });
        this.layer().appendChild(g);
        e.style.visibility = "hidden";   // 場に残った影を見せない
        if (to && !R) {
          const t = this.center(to.getBoundingClientRect());
          g.animate([{ transform: "none", opacity: 1, filter: "brightness(1.6)" },
            { transform: `translate(${(t.x - c.x) * .2}px,${(t.y - c.y) * .2 - 20}px) scale(1.05) rotate(-6deg)`, opacity: 1, offset: .3 },
            { transform: `translate(${t.x - c.x}px,${t.y - c.y}px) scale(.35) rotate(8deg)`, opacity: 0 }], { duration: 560, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" });
        }
        this.later(g, 600); 
        snd("flip"); hold(260); return;
      }
      case "void": case "voidback": {
        const d = this.add("v-void " + (kind === "voidback" ? "back" : ""), c.x, c.y, "<i></i>");
        d.style.width = d.style.height = Math.max(r.width, r.height) * 1.1 + "px";
        this.later(d, 900);
        if (kind === "void") { const g = e.cloneNode(true); g.removeAttribute("data-uid"); g.classList.add("ghostcard");
          Object.assign(g.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px" }); this.layer().appendChild(g); e.style.visibility = "hidden";
          if (!R) g.animate([{ transform: "none", opacity: 1 }, { transform: "scale(.1) rotate(220deg)", opacity: 0, filter: "hue-rotate(90deg) brightness(2)" }], { duration: 600, easing: "ease-in", fill: "forwards" });
          this.later(g, 650); }
        
        snd(kind === "void" ? "flip" : "buff"); hold(kind === "void" ? 300 : 220); return;
      }
      case "pierce": {
        const d = this.add("v-pierce", c.x, c.y, "<i></i>"); this.later(d, 700);
        return;
      }
      case "poison": {
        const d = this.add("v-poison", c.x, c.y, `<b class="fume"></b><b class="skull">${SKULL_SVG}</b>` + Array.from({ length: 12 }, (_, i) => `<i style="--x:${(i - 4) * 9}px;--d:${(i * 53) % 260}ms;--s:${.6 + (i % 3) * .3}"></i>`).join(""));
        d.style.width = r.width + "px"; d.style.height = r.height + "px";
        this.later(d, 900); 
        snd("hit"); hold(260); return;
      }
      case "wardup": {   // 結界を張った：光の輪が広がり、粒が集まる（ドームそのものは盤面の描画が組み上げる）
        const W = r.width + 22;
        const d = this.add("v-wardup", c.x, c.y, `<i class="ring"></i><i class="ring b"></i>${Array.from({ length: 12 }, (_, i) => `<b style="--a:${i * 30 + Math.random() * 14}deg;--dl:${(Math.random() * 0.18).toFixed(2)}s"></b>`).join("")}`);
        d.style.width = d.style.height = W + "px";
        this.later(d, 1200); Sound.play("wardUp"); hold(500); return;
      }
      case "wardbreak": {   // 結界が防いだ：ひびが入って光り、ドームが破片になって飛び散る
        const W = r.width + 20;
        const shards = Array.from({ length: 16 }, (_, i) => {
          const a = i * 22.5 + Math.random() * 12, dist = (0.8 + Math.random() * 0.6) * W, sz = 14 + Math.random() * 14;
          return `<i style="--a:${a}deg;--r:${dist.toFixed(0)}px;--s:${sz.toFixed(0)}px;--rot:${(Math.random() * 540 - 270).toFixed(0)}deg;--p:${["polygon(50% 0,100% 38%,70% 100%,8% 80%)", "polygon(0 0,100% 20%,45% 100%)", "polygon(25% 0,100% 50%,25% 100%,0 50%)"][i % 3]}"></i>`;
        }).join("");
        const cracks = `<svg class="crk" viewBox="0 0 100 100"><path d="M50 50 L30 18 L22 6 M50 50 L78 26 L92 20 M50 50 L86 64 M50 50 L60 88 L64 97 M50 50 L18 70 L6 76 M30 18 L40 12 M78 26 L74 12 M18 70 L22 84"/></svg>`;
        const d = this.add("v-wardbreak", c.x, c.y, `<span class="dome">${WARD_HEX}</span>${cracks}<i class="flash"></i><i class="wave"></i>${shards}`);
        d.style.width = d.style.height = W + "px";
        this.later(d, 1300); Sound.play("wardBreak"); hold(700);
        e.querySelectorAll(".ward-dome,.ward-badge").forEach(x => x.classList.add("gone"));   // 盤面の描き直しを待たずに、元のドームはすぐ消す
        if (!R) { e.classList.remove("ward-hit"); void e.offsetWidth; e.classList.add("ward-hit"); setTimeout(() => e.classList.remove("ward-hit"), 500); }
        return;
      }
      case "guard": {
        const d = this.add("v-guard", c.x, c.y, `<svg viewBox="0 0 40 46"><path d="M20 2 37 8v14c0 11-8 18-17 22C11 40 3 33 3 22V8z" fill="rgba(140,190,255,.25)" stroke="#bcd8ff" stroke-width="2.4"/></svg>`);
        this.later(d, 900); return;
      }
      case "gear": {
        const up = /^\+/.test(text || "");
        const d = this.add("v-gear " + (up ? "up" : "down"), c.x, c.y, Array.from({ length: 4 }, (_, i) => `<i style="--i:${i}">${GEAR_SVG}</i>`).join(""));
        this.later(d, 1000); 
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

  /* 効果のダメージ：キャラが出した効果なら、そのキャラが相手へ少し動く。当たった側は揺れて白く光る（属性の色は付けない） */
  bolt(src, dst, world, multi, R) {
    const t = this.el(dst); if (!t) return;
    const tr = t.getBoundingClientRect(), tc = this.center(tr);
    const s = /^cast:/.test(src || "") ? null : this.el(src);
    const delay = s && !R ? 140 : 0;
    if (s && !R) {
      const sc = this.center(s.getBoundingClientRect()), dx = (tc.x - sc.x) * 0.12, dy = (tc.y - sc.y) * 0.12;
      s.animate([{ transform: "none" }, { transform: `translate(${dx}px,${dy}px) scale(1.06)`, offset: .45 }, { transform: "none" }], { duration: 300, easing: "ease-out" });
    }
    setTimeout(() => {
      if (!t.isConnected) return;
      if (!R) { t.classList.remove("v-shake"); void t.offsetWidth; t.classList.add("v-shake"); setTimeout(() => t.classList.remove("v-shake"), 340); }
      const h = this.add("v-impact", tc.x, tc.y, "<i></i>"); this.later(h, 420);
    }, delay);
    if (!multi && !R) Motion.hold(delay + 120);
  },

  /* 捨てられたカードを真ん中に見せる（両方の画面） */
  reveal(id, pi, label, R) {
    const d = DEF[id]; if (!d) return;
    const w = document.createElement("div");
    w.className = "castshow v-reveal";
    w.innerHTML = `<div class="castlabel">${esc(S && S.players[pi] ? S.players[pi].name : "")}の${esc(label)}</div><div class="castcard">${cardHTML(d, { pi })}</div>`;
    this.layer().appendChild(w);
    setTimeout(() => w.remove(), R ? 800 : 1300);
    Sound.play("destroy");
    Motion.hold(R ? 450 : 700);
  },
  /* 相手の手札を見た（見た人の画面だけに並べる） */
  peek(ids, pi, R) {
    if (pi !== ME) return;
    const list = String(ids || "").split(",").filter(id => DEF[id]);
    const w = document.createElement("div");
    w.className = "v-peek";
    w.innerHTML = `<div class="castlabel">相手の手札</div><div class="v-peek-row">${list.length ? list.map(id => `<div class="castcard">${cardHTML(DEF[id], { pi: OP })}</div>`).join("") : "<p>0枚</p>"}</div>`;
    this.layer().appendChild(w);
    setTimeout(() => w.remove(), R ? 1200 : 2000);
    Motion.hold(R ? 800 : 1700);
  }
};
const GEAR_SVG = `<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.9 2.2-2-.4a7 7 0 0 0-.8-1.9l1.2-1.7-1.9-1.9-1.7 1.2a7 7 0 0 0-1.9-.8l-.4-2h-2.8l-.4 2a7 7 0 0 0-1.9.8L6.6 4.8 4.7 6.7l1.2 1.7a7 7 0 0 0-.8 1.9l-2 .4v2.8l2 .4c.2.7.4 1.3.8 1.9l-1.2 1.7 1.9 1.9 1.7-1.2c.6.4 1.2.6 1.9.8l.4 2h2.8l.4-2c.7-.2 1.3-.4 1.9-.8l1.7 1.2 1.9-1.9-1.2-1.7c.4-.6.6-1.2.8-1.9l2-.4z" fill="#d9b25c" stroke="#5a3d0c" stroke-width=".8"/></svg>`;
const SNOW_SVG = `<svg viewBox="0 0 40 40"><g stroke="#f4fbff" stroke-width="2.2" stroke-linecap="round" fill="none"><path d="M20 3v34M5.3 11.5l29.4 17M5.3 28.5l29.4-17"/><path d="M20 9l-4-4M20 9l4-4M20 31l-4 4M20 31l4 4M10 14l-5 .5M10 14l-1.5-5M30 26l5-.5M30 26l1.5 5M10 26l-5-.5M10 26l-1.5 5M30 14l5 .5M30 14l1.5-5"/></g></svg>`;
const SKULL_SVG = `<svg viewBox="0 0 40 40"><path d="M20 4C11 4 5 10 5 18c0 5 2.5 8.5 6 10.5V34h18v-5.5c3.5-2 6-5.5 6-10.5C35 10 29 4 20 4z" fill="#d9a3f5" stroke="#3a0758" stroke-width="2"/><circle cx="14" cy="19" r="4.2" fill="#3a0758"/><circle cx="26" cy="19" r="4.2" fill="#3a0758"/><path d="M20 23l-2.5 4h5z" fill="#3a0758"/><path d="M15 34v-4M20 34v-4M25 34v-4" stroke="#3a0758" stroke-width="1.8"/></svg>`;
