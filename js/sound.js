/* =========================================================
   効果音（音声ファイルを使わず、その場で音を作る）
   スマホは画面に触れるまで音を出せないため、最初のタッチで準備する
   ========================================================= */

const SOUND_KEY = "kyokai-sound";

const Sound = {
  ctx: null,
  master: null,
  on: (() => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } })(),
  lastAt: {},

  unlock() {
    // iPhone：音をオンにしているときは、マナーモード（消音スイッチ）中でも鳴らす（対応している機種のみ）
    try { if (navigator.audioSession) navigator.audioSession.type = this.on ? "playback" : "ambient"; } catch {}
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== "running") {
      try { this.ctx.resume(); } catch {}
      // iPhone は、指を離したタイミングで無音を1回鳴らすと音が出せるようになる
      try {
        const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
        s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      } catch {}
    }
  },
  toggle() {
    this.on = !this.on;
    try { localStorage.setItem(SOUND_KEY, this.on ? "on" : "off"); } catch {}
    try { if (navigator.audioSession) navigator.audioSession.type = this.on ? "playback" : "ambient"; } catch {}
    if (this.on) { this.unlock(); setTimeout(() => this.play("click"), 50); }
  },

  tone(freq, start, dur, type = "sine", vol = 0.5, slideTo) {
    const c = this.ctx, t = c.currentTime + start;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(start, dur, vol = 0.4, freq = 1200) {
    const c = this.ctx, t = c.currentTime + start;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  play(name, level = 0) {
    if (!this.on || !this.ctx || this.ctx.state !== "running") return;
    // 同じ音が一度にたくさん重ならないように
    const now = performance.now();
    if (now - (this.lastAt[name] || 0) < 60) return;
    this.lastAt[name] = now;
    try {
      switch (name) {
        case "click": this.tone(880, 0, 0.05, "triangle", 0.15); break;
        case "play": this.noise(0, 0.18, 0.25, 900); this.tone(330, 0, 0.18, "triangle", 0.3, 660); break;
        case "hit": this.noise(0, 0.12, 0.5, 400); this.tone(140, 0, 0.14, "square", 0.18, 70); break;
        case "face": this.noise(0, 0.25, 0.6, 250); this.tone(110, 0, 0.3, "sawtooth", 0.22, 50); break;
        case "heal": [523, 659, 784].forEach((f, i) => this.tone(f, i * 0.06, 0.25, "sine", 0.25)); break;
        case "buff": this.tone(440, 0, 0.15, "triangle", 0.25, 880); break;
        case "destroy": this.noise(0, 0.35, 0.6, 180); this.tone(200, 0, 0.35, "sawtooth", 0.2, 40); break;
        case "turn": this.tone(587, 0, 0.18, "sine", 0.3); this.tone(880, 0.12, 0.25, "sine", 0.3); break;
        case "win": [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.12, 0.35, "triangle", 0.3)); break;
        case "lose": [392, 349, 311, 262].forEach((f, i) => this.tone(f, i * 0.16, 0.4, "sine", 0.25)); break;
        case "open": this.noise(0, 0.4, 0.3, 2400); this.tone(220, 0, 0.4, "triangle", 0.2, 440); break;
        case "flip": this.noise(0, 0.08, 0.3, 3000); this.tone(660, 0, 0.08, "triangle", 0.15); break;
        case "rare": {
          // レア度が高いほど高く、長く
          const base = 523 * Math.pow(1.12, level);
          [0, 4, 7, 12, 16].slice(0, 2 + level).forEach((st, i) => this.tone(base * Math.pow(2, st / 12), i * 0.08, 0.5, "sine", 0.28));
          this.noise(0, 0.5, 0.2, 5000);
          break;
        }
      }
    } catch (e) { /* 音が出せない環境では何もしない */ }
  }
};

// スマホでは「指を離したとき」でないと音の準備ができないため、複数の合図で準備する
["pointerdown", "pointerup", "touchend", "click", "keydown"].forEach(ev => document.addEventListener(ev, () => { if (Sound.on) Sound.unlock(); }, { passive: true, capture: true }));
