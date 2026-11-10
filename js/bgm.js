/* =========================================================
   BGM（音源ファイルなし。Web Audio で、その場で鳴らす）
   ・曲は「場面（sections）」を順に流してくり返す。場面ごとにコード進行・ベース・アルペジオ・メロディ・太鼓を文字で書く
   ・1小節は steps 歩（ふつう16＝16分音符。6/8 の曲は12）
   ・少し先まで予約して鳴らす（重くならないように）。曲を変えるときは前の曲をゆっくり小さくする
   ========================================================= */
const Bgm = (() => {
  const NOTE = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
  const hz = n => { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return m ? 440 * Math.pow(2, (NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12) : 0; };
  const mel = s => (s || "").trim().split(/\s+/).filter(Boolean).map(t => { const [n, at, len] = t.split(":"); return { f: hz(n), at: +at, len: +len }; });
  const C = s => s.split(" ").map(x => x.split(","));   // "A3,C4,E4 F3,A3,C4" → コードの並び

  /* ---------- 曲 ----------
     bass.pat：1小節の文字列（r=根音 o=1オクターブ上 5=5度 .=休み）
     arp：pat はコードの何番目の音か、step 歩ごと。lead.bars：小節ごとのメロディ「音名:位置:長さ」
     drums.bars：k=大太鼓 s=小太鼓 h=シンバル t=小さい太鼓 T=大きい和太鼓 c=長いシンバル */
  const PADS = { soft: { vol: .045, type: "triangle" }, str: { vol: .04, type: "sawtooth", cut: 1300, att: .5 }, dark: { vol: .055, type: "sawtooth", cut: 700, att: 1.2 } };
  const TRACKS = {
    title: { name: "起動画面「境界の召喚士」", bpm: 132, sections: [
      { name: "幻想の序", chords: C("E3,G3,B3 C3,E3,G3,B3 D3,F#3,A3 B2,D#3,F#3"), pad: PADS.dark, bass: { vol: .12, pat: "r...............", long: true },
        arp: { vol: .04, pat: [0, 2, 1, 3, 2, 1, 0, 2], step: 2, oct: 2, inst: "bell" }, lead: { vol: .05, inst: "bell", bars: ["B5:0:8 G5:8:8", "E6:0:16", "D6:0:8 A5:8:8", "B5:0:16"] } },
      { name: "神話の疾走", chords: C("E3,G3,B3 C3,E3,G3 G3,B3,D4 D3,F#3,A3 E3,G3,B3 C3,E3,G3 D3,F#3,A3 B2,D#3,F#3"), pad: PADS.str, bass: { vol: .15, pat: "r.r.o.r.r.r.o.r." },
        arp: { vol: .04, pat: [0, 1, 2, 3], step: 1, oct: 2, inst: "harp" }, lead: { vol: .06, inst: "brass", bars: [
          "B4:0:2 E5:2:2 G5:4:4 B5:8:6 A5:14:2", "G5:0:4 E5:4:4 C6:8:8", "D6:0:4 B5:4:4 G5:8:6 A5:14:2", "F#5:0:12 D5:12:4",
          "B5:0:4 E6:4:4 D6:8:4 B5:12:4", "C6:0:6 B5:6:2 A5:8:4 G5:12:4", "A5:0:4 D6:4:4 F#6:8:8", "D#6:0:8 B5:8:8"] },
        drums: { vol: .45, bars: ["k.k.s.k.k.k.s.k.", "k.k.s.k.k.k.s.kk"] } },
      { name: "機械の行進", chords: C("E2,B2,E3 E2,B2,E3 C2,G2,C3 D2,A2,D3 E2,B2,E3 C2,G2,C3 A2,E3,A3 B2,F#3,B3"), pad: PADS.dark, bass: { vol: .19, pat: "r...r...o...r.o.", type: "saw" },
        arp: { vol: .035, pat: [0, 1, 2, 1], step: 2, oct: 2, inst: "pluck" }, lead: { vol: .055, inst: "square", bars: [
          "E5:0:4 G5:4:4 F#5:8:4 E5:12:4", "B4:0:16", "C5:0:4 E5:4:4 G5:8:4 E5:12:4", "D5:0:8 F#5:8:8",
          "E5:0:4 B5:4:4 A5:8:4 G5:12:4", "G5:0:8 E5:8:8", "A5:0:4 C6:4:4 B5:8:4 A5:12:4", "B5:0:16"] },
        drums: { vol: .5, bars: ["k.......s.......", "k.....k.s...t.t."] } },
      { name: "幻想の森", chords: C("C3,E3,G3,B3 B2,D3,F#3,A3 A2,C3,E3,G3 B2,D#3,F#3 C3,E3,G3,B3 D3,F#3,A3 E3,G3,B3 E3,G3,B3"), pad: PADS.soft, bass: { vol: .12, pat: "r.......5.......", long: false },
        arp: { vol: .045, pat: [0, 2, 1, 3, 2, 1], step: 2, oct: 2, inst: "bell" }, lead: { vol: .06, inst: "flute", bars: [
          "G5:0:8 E5:8:8", "F#5:0:8 D5:8:8", "E5:0:4 A5:4:4 C6:8:8", "B5:0:16", "E6:0:8 D6:8:4 C6:12:4", "D6:0:8 A5:8:8", "B5:0:8 G5:8:8", "E5:0:16"] },
        drums: { vol: .35, bars: ["T...............", "T.......t.......", "T...............", "T.......t...t.t."] } },
      { name: "三つの世界", chords: C("E3,G3,B3 C3,E3,G3 G3,B3,D4 D3,F#3,A3 C3,E3,G3 D3,F#3,A3 E3,G3,B3 E3,G3,B3"), pad: PADS.str, bass: { vol: .18, pat: "r.r.o.r.r.r.o.r.", type: "saw" },
        arp: { vol: .04, pat: [0, 2, 1, 3, 2, 1, 0, 2], step: 2, oct: 2, inst: "bell" }, lead: { vol: .065, inst: "brass", bars: [
          "B4:0:2 E5:2:2 G5:4:4 B5:8:6 A5:14:2", "G5:0:4 E5:4:4 C6:8:8", "D6:0:4 B5:4:4 G5:8:6 A5:14:2", "F#5:0:12 D5:12:4",
          "E6:0:6 D6:6:2 C6:8:8", "D6:0:6 C6:6:2 A5:8:8", "B5:0:4 E6:4:4 G6:8:8", "E6:0:16"] },
        drums: { vol: .5, bars: ["T.k.s.k.T.k.s.k.", "T.k.s.k.T.k.s.k.", "T.k.s.k.T.k.s.k.", "T...T...TtTtTTTc"] } }
    ] },
    home: { name: "ホーム", bpm: 78, sections: [
      { name: "静かな広間", chords: C("A3,C4,E4 F3,A3,C4 C4,E4,G4 G3,B3,D4 A3,C4,E4 F3,A3,C4 G3,B3,D4 E3,G#3,B3"), pad: PADS.soft, bass: { vol: .16, pat: "r.......5......." },
        arp: { vol: .05, pat: [0, 1, 2, 1, 0, 1, 2, 3], step: 2, oct: 1, inst: "box" }, lead: { vol: .07, inst: "flute", bars: [
          "E5:0:6 D5:6:2 C5:8:4 B4:12:4", "A4:0:8 C5:8:4 F5:12:4", "E5:0:6 G5:6:2 E5:8:4 D5:12:4", "D5:0:12 B4:12:4",
          "E5:0:6 D5:6:2 C5:8:4 E5:12:4", "F5:0:6 E5:6:2 D5:8:4 C5:12:4", "B4:0:4 D5:4:4 G5:8:8", "B4:0:8 G#4:8:8"] } },
      { name: "光がさす", chords: C("C4,E4,G4 G3,B3,D4 A3,C4,E4 F3,A3,C4 C4,E4,G4 G3,B3,D4 F3,A3,C4 G3,B3,D4"), pad: PADS.str, bass: { vol: .16, pat: "r.....r.5.......", type: "sine" },
        arp: { vol: .045, pat: [0, 1, 2, 3], step: 2, oct: 1, inst: "harp" }, lead: { vol: .07, inst: "flute", bars: [
          "E5:0:4 G5:4:4 C6:8:6 B5:14:2", "B5:0:4 A5:4:4 G5:8:8", "A5:0:4 C6:4:4 E6:8:6 D6:14:2", "C6:0:8 A5:8:4 F5:12:4",
          "E5:0:4 G5:4:4 C6:8:4 E6:12:4", "D6:0:6 C6:6:2 B5:8:8", "A5:0:4 C6:4:4 F6:8:8", "G5:0:8 D5:8:4 B4:12:4"] },
        drums: { vol: .22, bars: ["k.......k...s..."] } },
      { name: "三つの世界の鼓動", chords: C("A3,C4,E4 F3,A3,C4 G3,B3,D4 E3,G#3,B3"), pad: PADS.str, bass: { vol: .2, pat: "r.....r.o.....r.", type: "saw" },
        arp: { vol: .045, pat: [0, 1, 2, 3, 2, 1], step: 1, oct: 2, inst: "harp" }, lead: { vol: .075, inst: "brass", bars: ["A5:0:12 E5:12:4", "F5:0:8 A5:8:8", "B5:0:8 D6:8:8", "E6:0:12 B5:12:4"] },
        drums: { vol: .45, bars: ["T.....T.s...T...", "T.....T.s...T.t.", "T.....T.s...T...", "T...T...TtTtTTTc"] } }
    ] },
    battle1: { name: "対戦1「境界の戦い」", bpm: 116, sections: [
      { name: "A", chords: C("D3,F3,A3 Bb2,D3,F3 C3,E3,G3 A2,C3,E3 D3,F3,A3 Bb2,D3,F3 G2,Bb2,D3 A2,C#3,E3"), pad: PADS.str, bass: { vol: .17, pat: "r..r..r.o..r..r." },
        arp: { vol: .04, pat: [0, 1, 2, 3, 2, 1], step: 1, oct: 2, inst: "harp" }, lead: { vol: .065, inst: "flute", bars: [
          "A4:0:4 D5:4:4 F5:8:6 E5:14:2", "D5:0:4 F5:4:4 Bb5:8:8", "G5:0:4 E5:4:4 C5:8:6 D5:14:2", "E5:0:12 C5:12:4",
          "A4:0:4 D5:4:4 F5:8:4 A5:12:4", "Bb5:0:6 A5:6:2 G5:8:4 F5:12:4", "G5:0:4 Bb5:4:4 D6:8:8", "C#6:0:8 A5:8:4 E5:12:4"] },
        drums: { vol: .45, bars: ["T.....t.T...t.t.", "T.....t.T.t.t..."] } },
      { name: "B", chords: C("F3,A3,C4 C3,E3,G3 D3,F3,A3 Bb2,D3,F3 F3,A3,C4 C3,E3,G3 Bb2,D3,F3 A2,C#3,E3"), pad: PADS.str, bass: { vol: .19, pat: "r.r.o.r.r.r.o.r.", type: "saw" },
        arp: { vol: .04, pat: [0, 1, 2, 3], step: 1, oct: 2, inst: "harp" }, lead: { vol: .065, inst: "brass", bars: [
          "C6:0:6 A5:6:2 F5:8:8", "G5:0:6 E5:6:2 C5:8:8", "D5:0:4 F5:4:4 A5:8:4 D6:12:4", "D6:0:12 Bb5:12:4",
          "C6:0:4 A5:4:2 C6:6:2 F6:8:8", "E6:0:6 D6:6:2 C6:8:8", "Bb5:0:4 D6:4:4 F6:8:8", "E6:0:8 C#6:8:4 A5:12:4"] },
        drums: { vol: .5, bars: ["T.k.s.k.T.k.s.k.", "T.k.s.k.T.k.s.t.", "T.k.s.k.T.k.s.k.", "T...T...TtTtTTTc"] } }
    ] },
    battle2: { name: "対戦2「月下の決闘」", bpm: 150, steps: 12, sections: [
      { name: "A", chords: C("E3,G3,B3 C3,E3,G3 D3,F#3,A3 B2,D#3,F#3 E3,G3,B3 C3,E3,G3 A2,C3,E3 B2,D#3,F#3"), pad: PADS.dark, bass: { vol: .17, pat: "r.....5.....", type: "sine" },
        arp: { vol: .045, pat: [0, 1, 2, 3, 2, 1], step: 2, oct: 2, inst: "harp" }, lead: { vol: .06, inst: "flute", bars: [
          "B4:0:2 E5:2:2 G5:4:2 B5:6:4 A5:10:2", "G5:0:6 E5:6:6", "F#5:0:2 A5:2:2 D6:4:2 C6:6:4 A5:10:2", "B5:0:12",
          "E6:0:4 D6:4:2 B5:6:4 G5:10:2", "A5:0:6 G5:6:4 E5:10:2", "C6:0:4 B5:4:2 A5:6:4 G5:10:2", "F#5:0:6 D#5:6:6"] },
        drums: { vol: .4, bars: ["T.....t.t.t.", "T.....t...t.", "T.....t.t.t.", "T...t.T.t.tc"] } },
      { name: "B", chords: C("A2,C3,E3 E3,G3,B3 C3,E3,G3 B2,D#3,F#3 A2,C3,E3 E3,G3,B3 C3,E3,G3 B2,D#3,F#3"), pad: PADS.str, bass: { vol: .18, pat: "r..o..r..5..", type: "saw" },
        arp: { vol: .04, pat: [0, 1, 2], step: 1, oct: 2, inst: "harp" }, lead: { vol: .06, inst: "brass", bars: [
          "E6:0:6 C6:6:6", "B5:0:6 G5:6:6", "C6:0:2 D6:2:2 E6:4:2 G6:6:6", "F#6:0:12", "A5:0:6 C6:6:6", "B5:0:4 E6:4:2 G6:6:6", "E6:0:4 D6:4:2 C6:6:6", "D#6:0:6 B5:6:6"] },
        drums: { vol: .45, bars: ["T..k..s..k..", "T..k..s..t.t", "T..k..s..k..", "T..T..TtTtTc"] } }
    ] },
    battle3: { name: "対戦3「天剣の誓い」", bpm: 124, sections: [
      { name: "A", chords: C("A2,C3,E3 F2,A2,C3 C3,E3,G3 G2,B2,D3 A2,C3,E3 F2,A2,C3 E2,G#2,B2 E2,G#2,B2"), pad: PADS.str, bass: { vol: .18, pat: "r...r.r.o...r.r.", type: "saw" },
        arp: { vol: .035, pat: [0, 1, 2, 1], step: 2, oct: 2, inst: "harp" }, lead: { vol: .065, inst: "brass", bars: [
          "E5:0:3 E5:3:1 A5:4:4 C6:8:4 B5:12:4", "A5:0:8 F5:8:4 A5:12:4", "G5:0:3 G5:3:1 C6:4:4 E6:8:4 D6:12:4", "D6:0:12 B5:12:4",
          "E6:0:4 D6:4:4 C6:8:4 B5:12:4", "C6:0:4 A5:4:4 F5:8:8", "G#5:0:4 B5:4:4 E6:8:8", "E6:0:16"] },
        drums: { vol: .5, bars: ["k...s...k.k.s...", "k...s...k.k.s.t.", "k...s...k.k.s...", "k...s...t.t.TTTc"] } },
      { name: "B", chords: C("F3,A3,C4 G3,B3,D4 E3,G#3,B3 A2,C3,E3 F3,A3,C4 G3,B3,D4 E3,G#3,B3 E3,G#3,B3"), pad: PADS.str, bass: { vol: .17, pat: "r.r.r.r.o.o.r.r.", type: "saw" },
        arp: { vol: .04, pat: [0, 1, 2, 3], step: 1, oct: 2, inst: "harp" }, lead: { vol: .06, inst: "flute", bars: [
          "C6:0:4 A5:4:4 F5:8:8", "D6:0:4 B5:4:4 G5:8:8", "B5:0:4 G#5:4:4 E5:8:8", "A5:0:12 C6:12:4",
          "F6:0:4 E6:4:4 C6:8:8", "D6:0:4 B5:4:4 G5:8:4 B5:12:4", "E6:0:8 D6:8:4 B5:12:4", "G#5:0:16"] },
        drums: { vol: .45, bars: ["T...k...T.k.s...", "T...k...T.k.s.t."] } }
    ] },
    shop: { name: "ショップ", bpm: 104, swing: .12, sections: [
      { name: "A", chords: C("F3,A3,C4 D3,F3,A3 Bb2,D3,F3 C3,E3,G3 F3,A3,C4 D3,F3,A3 G3,Bb3,D4 C3,E3,G3"), pad: { vol: .03, type: "triangle" }, bass: { vol: .15, pat: "r...5...o...5...", short: true },
        arp: { vol: .05, pat: [0, 2, 1, 2], step: 2, oct: 1, inst: "pizz" }, lead: { vol: .065, inst: "box", bars: [
          "C5:0:2 F5:2:2 A5:4:4 G5:8:2 F5:10:2 C5:12:4", "D5:0:4 F5:4:2 A5:6:2 G5:8:8", "F5:0:2 D5:2:2 Bb4:4:4 C5:8:2 D5:10:2 F5:12:4", "E5:0:4 G5:4:4 C6:8:4 Bb5:12:4",
          "C5:0:2 F5:2:2 A5:4:4 G5:8:2 F5:10:2 C5:12:4", "D5:0:2 E5:2:2 F5:4:4 A5:8:8", "G5:0:2 F5:2:2 D5:4:4 Bb4:8:4 D5:12:4", "C5:0:4 E5:4:4 F5:8:8"] },
        drums: { vol: .22, bars: ["k...h.h.k...h.hh"] } }
    ] },
    pack: { name: "パック", bpm: 72, sections: [
      { name: "A", chords: C("E3,G3,B3 C3,E3,G3,B3 A2,C3,E3 B2,D#3,F#3"), pad: PADS.dark, bass: { vol: .12, pat: "r...............", long: true },
        arp: { vol: .04, pat: [0, 2, 1, 3, 2, 1], step: 2, oct: 2, inst: "bell" }, lead: { vol: .05, inst: "bell", bars: ["B5:0:8 G5:8:8", "E5:0:12", "A5:0:4 C6:4:4 B5:8:8", "F#5:0:16"] } }
    ] },
    deck: { name: "デッキ編成", bpm: 66, sections: [
      { name: "A", chords: C("F3,A3,C4,E4 E3,G3,B3,D4 D3,F3,A3,C4 C3,E3,G3,B3 F3,A3,C4,E4 E3,G3,B3,D4 D3,F3,A3,C4 G3,B3,D4,F4"), pad: { vol: .045, type: "triangle", att: 1.5 }, bass: { vol: .11, pat: "r...............", long: true },
        arp: { vol: .03, pat: [0, 2, 1, 3], step: 4, oct: 1, inst: "box" }, lead: { vol: .045, inst: "box", bars: [
          "A5:0:8 G5:8:8", "", "F5:0:8 E5:8:8", "", "C6:0:8 B5:8:8", "", "A5:0:8 F5:8:4 D5:12:4", "G5:0:16"] } }
    ] }
  };

  let ctx = null, master = null, bus = null, cur = null, timer = null;
  let vol = (() => { try { const v = localStorage.getItem("kyokai-bgm"); return v == null ? .6 : +v; } catch { return .6; } })();
  let noiseBuf = null;

  function init() {
    if (ctx) return true;
    // ゲームの中では効果音と同じ AudioContext を使う（スマホで最初に触れたときに作られる）
    if (typeof Sound !== "undefined" && Sound.ctx !== undefined) { if (!Sound.ctx) return false; ctx = Sound.ctx; }
    else { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; ctx = new AC(); }
    master = ctx.createGain(); master.gain.value = vol * .9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    bus = ctx.createGain(); bus.connect(master);
    const d = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    d.delayTime.value = .27; fb.gain.value = .3; wet.gain.value = .24;
    bus.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    return true;
  }

  /* ---------- 楽器 ---------- */
  function env(g, t, a, peak, dec, sus, rel, end) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * sus, t + a, dec);
    g.gain.setTargetAtTime(0, Math.max(end, t + a), rel);
  }
  function osc(type, f, t, end, out, detune = 0) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(out); o.start(t); o.stop(end + 1.5); return o;
  }
  function sub(out, v) { const g = ctx.createGain(); g.gain.value = v; g.connect(out); return g; }
  function voice(inst, f, t, dur, v, out) {
    const g = ctx.createGain(); g.connect(out);
    const end = t + dur;
    switch (inst) {
      case "box": env(g, t, .005, v, .25, 0, .3, end); osc("sine", f, t, end, g); osc("sine", f * 4, t, end, sub(g, .3)); break;
      case "bell": env(g, t, .004, v, .8, 0, 1.2, end + .6); osc("sine", f, t, end + 1, g); osc("sine", f * 2.76, t, end, sub(g, .25)); break;
      case "harp": { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(900, t + .5); lp.connect(g);
        env(g, t, .003, v, .35, 0, .4, end + .3); osc("triangle", f, t, end + .5, lp); osc("sine", f * 2, t, end + .5, sub(lp, .35)); break; }
      case "pluck": { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(400, t + .18); lp.connect(g); env(g, t, .003, v, .12, 0, .1, end); osc("sawtooth", f, t, end, lp); break; }
      case "pizz": env(g, t, .003, v, .09, 0, .08, end); osc("triangle", f, t, end, g); break;
      case "square": { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400; lp.connect(g); env(g, t, .01, v, .2, .6, .06, end); osc("square", f, t, end, lp); break; }
      case "flute": { env(g, t, .06, v, .3, .75, .15, end); const o = osc("triangle", f, t, end, g); osc("sine", f * 2, t, end, sub(g, .12));
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5; lg.gain.value = f * .006; lfo.connect(lg).connect(o.frequency); lfo.start(t + .15); lfo.stop(end + 1); break; }
      case "brass": { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 2; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(2600, t + .08); lp.frequency.setTargetAtTime(1500, t + .08, .3); lp.connect(g);
        env(g, t, .04, v, .3, .8, .12, end); osc("sawtooth", f, t, end, lp, -5); osc("sawtooth", f, t, end, lp, 5); break; }
      case "keys": env(g, t, .005, v, .35, .2, .2, end); osc("triangle", f, t, end, g); osc("sine", f * 2, t, end, g); break;
    }
  }
  function pad(chord, t, dur, p) {
    if (!p || !p.vol) return;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = p.cut || 1400; lp.connect(g); g.connect(bus);
    const a = Math.min(p.att || .3, dur * .5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p.vol, t + a); g.gain.setValueAtTime(p.vol, t + dur - .15); g.gain.linearRampToValueAtTime(0, t + dur + .3);
    chord.forEach(n => { osc(p.type || "triangle", hz(n), t, t + dur + .35, lp, -7); osc(p.type || "triangle", hz(n), t, t + dur + .35, lp, 7); });
  }
  function bassNote(f, t, dur, b) {
    const g = ctx.createGain(); g.connect(master);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = b.type === "saw" ? 650 : 1200; lp.connect(g);
    env(g, t, .005, b.vol, b.long ? 1.4 : .15, b.short ? 0 : .5, .05, t + dur);
    osc(b.type === "saw" ? "sawtooth" : "sine", f, t, t + dur, lp);
    if (b.type !== "saw") osc("triangle", f, t, t + dur, lp);
  }
  function drum(k, t, v) {
    if (k === "k" || k === "T" || k === "t") {
      const [f0, f1, d, a] = k === "k" ? [130, 42, .3, 1] : k === "T" ? [95, 48, .55, 1.25] : [210, 110, .22, .55];
      const g = ctx.createGain(), o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d * .5);
      g.gain.setValueAtTime(v * a, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g).connect(master); o.start(t); o.stop(t + d + .02);
      if (k === "T") { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(), g2 = ctx.createGain(); f.type = "lowpass"; f.frequency.value = 900; g2.gain.setValueAtTime(v * .3, t); g2.gain.exponentialRampToValueAtTime(.001, t + .12); s.connect(f).connect(g2).connect(master); s.start(t); s.stop(t + .15); }
      return;
    }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    if (k === "h") { f.type = "highpass"; f.frequency.value = 7000; g.gain.setValueAtTime(v * .22, t); g.gain.exponentialRampToValueAtTime(.001, t + .05); }
    else if (k === "c") { f.type = "highpass"; f.frequency.value = 5000; g.gain.setValueAtTime(v * .25, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.4); }
    else { f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = .8; g.gain.setValueAtTime(v * .42, t); g.gain.exponentialRampToValueAtTime(.001, t + .16); }
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 1.5);
  }

  /* ---------- 進行 ---------- */
  function schedule() {
    if (!cur) return;
    const T = cur.tr, N = T.steps || 16, sp = 60 / T.bpm / 4;
    while (cur.next < ctx.currentTime + .2) {
      const S = T.sections[cur.sec], s = cur.step, bar = cur.bar;
      const t = cur.next + (s % 2 ? sp * (T.swing || 0) : 0);
      const ch = S.chords[bar % S.chords.length], root = hz(ch[0]);
      if (s === 0) pad(ch, t, sp * N, S.pad);
      const bc = S.bass && S.bass.pat[s];
      if (bc && bc !== ".") { const f = bc === "o" ? root : bc === "5" ? hz(ch[2] || ch[0]) / 2 : root / 2; bassNote(f, t, S.bass.long ? sp * N : sp * 1.8, S.bass); }
      const A = S.arp;
      if (A && A.vol && s % A.step === 0) { const i = A.pat[(s / A.step) % A.pat.length], n = ch[i % ch.length]; voice(A.inst, hz(n) * Math.pow(2, A.oct + Math.floor(i / ch.length)), t, sp * A.step * .9, A.vol, bus); }
      if (S.lead && cur.mel[cur.sec]) { const m = cur.mel[cur.sec][bar % cur.mel[cur.sec].length] || []; m.forEach(x => { if (x.at === s && x.f) voice(S.lead.inst, x.f, t, sp * x.len * .95, S.lead.vol, bus); }); }
      if (S.drums) { const pat = S.drums.bars[bar % S.drums.bars.length], k = pat[s]; if (k && k !== ".") drum(k, t, S.drums.vol); }
      cur.next += sp;
      if (++cur.step >= N) { cur.step = 0; if (++cur.bar >= S.chords.length) { cur.bar = 0; cur.sec = (cur.sec + 1) % T.sections.length; if (!cur.sec) cur.loops++; } }
    }
  }

  function start(id) {
    const tr = TRACKS[id]; if (!tr || !init()) return;
    if (ctx.state === "suspended") ctx.resume();
    if (cur && cur.id === id) return;
    stop(.6);
    cur = { id, tr, sec: 0, bar: 0, step: 0, loops: 0, next: ctx.currentTime + .05, mel: tr.sections.map(S => (S.lead && S.lead.bars || []).map(mel)) };
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime); master.gain.linearRampToValueAtTime(vol * .9, ctx.currentTime + .8);
    timer = setInterval(schedule, 40); schedule();
  }
  function stop(fade = .5) {
    if (!cur) return;
    clearInterval(timer); timer = null; cur = null;
    if (ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value, ctx.currentTime); master.gain.linearRampToValueAtTime(0, ctx.currentTime + fade); }
  }
  function setVolume(v) {
    vol = Math.max(0, Math.min(1, v));
    try { localStorage.setItem("kyokai-bgm", String(vol)); } catch {}
    if (ctx && cur) master.gain.setTargetAtTime(vol * .9, ctx.currentTime, .05);
  }
  return { TRACKS, start, stop, setVolume, get volume() { return vol; }, get current() { return cur && cur.id; }, get loops() { return cur ? cur.loops : 0; }, get section() { return cur ? cur.tr.sections[cur.sec].name : ""; } };
})();

/* =========================================================
   画面に合わせて曲を選ぶ（0.4秒ごとに今の画面を見て決める）
   起動画面 → 「起動画面」の曲（ブラウザの決まりで、画面に触れるまでは鳴らせない。聞きたい人は音の設定の「曲を聞く」で）
   ショップ・パック・デッキ編成（カード一覧も）→ それぞれの曲。対戦中 → 選んだ対戦の曲。それ以外 → ホーム
   ========================================================= */
const BgmSet = {
  KEY: "kyokai-bgm-on", BKEY: "kyokai-bgm-battle",
  BATTLES: ["battle1", "battle2", "battle3"],
  on: (() => { try { return localStorage.getItem("kyokai-bgm-on") !== "off"; } catch { return true; } })(),
  battle: (() => { try { return localStorage.getItem("kyokai-bgm-battle") || "battle1"; } catch { return "battle1"; } })(),
  pickedBattle: null,
  toggle() { this.on = !this.on; try { localStorage.setItem(this.KEY, this.on ? "on" : "off"); } catch {} if (!this.on) Bgm.stop(.4); },
  home: (() => { try { return localStorage.getItem("kyokai-bgm-home") || "home"; } catch { return "home"; } })(),
  preview: null,
  setHome(v) { this.home = v; try { localStorage.setItem("kyokai-bgm-home", v); } catch {} },
  setBattle(v) { this.battle = v; this.pickedBattle = null; try { localStorage.setItem(this.BKEY, v); } catch {} },
  battleTrack() {
    if (this.battle !== "random") return Bgm.TRACKS[this.battle] ? this.battle : "battle1";
    if (!this.pickedBattle) this.pickedBattle = this.BATTLES[Math.floor(Math.random() * this.BATTLES.length)];
    return this.pickedBattle;
  },
  want() {
    if (this.preview && document.querySelector("#overlay:not([hidden]) .snd-panel")) return this.preview;   // 音の設定で曲を聞いているとき
    this.preview = null;
    if (typeof Splash !== "undefined" && Splash.shown) return "title";
    const o = document.getElementById("overlay"), vis = o && !o.hidden;
    const has = sel => vis && !!o.querySelector(sel);
    if (has(".shop")) return "shop";
    if (has(".pkshop, .openstage, .rs, .ms-grid")) return "pack";
    if (has(".dedit, .cl-tools")) return "deck";
    const home = has(".panel.home");
    if (!home && typeof S !== "undefined" && S) return this.battleTrack();   // じゃんけんから結果の画面まで（タイトルに戻ると S は消える）
    return Bgm.TRACKS[this.home] ? this.home : "home";
  },
  tick() {
    if (!this.on || (typeof Sound !== "undefined" && !Sound.on) || document.hidden) { if (Bgm.current) Bgm.stop(.4); return; }
    if (typeof Sound !== "undefined" && (!Sound.ctx || Sound.ctx.state !== "running")) return;   // まだ画面に触れていない
    const w = this.want();
    if (!/^battle/.test(w)) this.pickedBattle = null;   // おまかせ：対戦ごとに選び直す
    if (w !== Bgm.current) Bgm.start(w);
  }
};
if (typeof document !== "undefined" && typeof Sound !== "undefined") setInterval(() => { try { BgmSet.tick(); } catch (e) {} }, 400);
