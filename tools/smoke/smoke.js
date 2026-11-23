/* =========================================================
   朝の点検（スモークテスト）
   リポジトリの中身をその場で配って、iPhone の大きさのブラウザで主な画面を開き、CPU 戦を1試合最後まで回す。
   使い方：リポジトリのフォルダで `node tools/smoke/smoke.js`（Playwright と Chromium が入っている環境）
   結果は JSON で出す。止まる不具合（ページのエラー）があれば終了コード 1
   ========================================================= */
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium, devices } = require("playwright");
const ROOT = path.resolve(__dirname, "../..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
const NOISE = /ERR_TUNNEL|ERR_CONNECTION|ERR_NAME|network-request-failed|FirebaseError|googleapis|gstatic|Failed to load resource/;

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
      const f = path.join(ROOT, p); if (!f.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
      fs.readFile(f, (e, b) => { if (e) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); rsp.end(b); });
    }).listen(0, () => res(srv));
  });
}

(async () => {
  const out = { ok: true, checks: [], errors: [], game: null };
  const check = (name, ok, note = "") => { out.checks.push({ name, ok: !!ok, note }); if (!ok) out.ok = false; };
  // データ
  let data = null;
  try { data = JSON.parse(fs.readFileSync(path.join(ROOT, "game-data.json"), "utf8")); check("game-data.json を読める", true, `version ${data.version}`); }
  catch (e) { check("game-data.json を読める", false, e.message); }
  if (data) {
    check("メンテナンスが切れている", !+(data.config || {}).MAINT, +(data.config || {}).MAINT ? "MAINT=1（メンテ中）" : "");
    const ids = new Set(); let dup = 0; (data.cards || []).forEach(c => { if (ids.has(c.id)) dup++; ids.add(c.id); });
    check("カードIDの重複なし", !dup, dup ? `${dup}件` : `${ids.size}枚`);
  }
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8").match(/CACHE = "([^"]+)"/);
  out.cache = sw ? sw[1] : null;

  const srv = await serve(), url = `http://localhost:${srv.address().port}/index.html`;
  const b = await chromium.launch();
  const c = await b.newContext({ ...devices["iPhone 14"], deviceScaleFactor: 1 });
  const p = await c.newPage();
  p.on("pageerror", e => out.errors.push({ where: out.at || "", msg: String(e.message).slice(0, 300) }));
  p.on("console", m => { if (m.type() === "error" && !NOISE.test(m.text())) out.errors.push({ where: out.at || "", msg: "console: " + m.text().slice(0, 300) }); });
  try {
    out.at = "起動";
    await p.goto(url); await p.waitForFunction(() => typeof CARDS !== "undefined" && CARDS.length > 0, null, { timeout: 30000 });
    await p.waitForTimeout(1500);
    await p.evaluate(() => {
      try { Splash.shown = false; } catch (e) {}
      Account.status = "ready"; Account.data = Account.fix({ gold: 50000, stones: 5000, tickets: 3 }); Account.data.loginLast = localDate(); Account.data.tut = 1;
      Account.save = () => {}; Account.saveNow = () => {}; try { Arena.claim = () => {}; } catch (e) {}
      const P = PRESETS[0]; Account.data.cards = { ...P.cards }; Account.data.decks = [{ id: "d1", name: "点検", cards: { ...P.cards } }]; Decks.select("d1");
      Motion.reduced = true; document.documentElement.classList.add("nofx");
    });
    // 画面を順に開く
    const screens = [
      ["ホーム", "showStart()", ".panel.home"], ["一人で遊ぶ", "showSolo()", ".solo-main"], ["CPU戦", "showCpuSelect()", ".lvl"],
      ["選定戦", "typeof Sentei !== 'undefined' && Sentei.on() ? Sentei.show() : showSolo()", ".panel"], ["ショップ", "handleAct('shop')", ".panel"],
      ["パック", "handleAct('packs')", ".panel"], ["デッキ", "handleAct('decks')", ".panel"], ["カード一覧", "handleAct('cards')", ".panel"],
      ["オンライン", "handleAct('online')", ".panel"]
    ];
    for (const [name, js, sel] of screens) {
      out.at = name; const n0 = out.errors.length;
      try { await p.evaluate(js); await p.waitForTimeout(700); const ok = await p.evaluate(s => !!document.querySelector(`#overlay:not([hidden]) ${s}, #app ${s}`), sel); check(`画面：${name}`, ok && out.errors.length === n0, ok ? "" : "開けなかった"); }
      catch (e) { check(`画面：${name}`, false, String(e.message).slice(0, 200)); }
    }
    // CPU 戦を1試合（自分の側も CPU の考え方で動かす）
    out.at = "CPU戦の対戦";
    await p.evaluate(() => { document.getElementById("overlay").hidden = true; startCpuGame("normal"); });
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const st = await p.evaluate(async () => {
        if (!S) return { end: true, why: "S がない" };
        if (S.over) return { end: true, winner: S.winner, turns: S.turnNo };
        if (typeof Cinema !== "undefined" && Cinema.busy()) { Cinema.next(); return {}; }
        if (S.phase === "rps" && !S.rps.picks[ME]) { doRps(["g", "c", "p"][Math.floor(Math.random() * 3)]); return {}; }
        if (S.phase === "choose" && S.rpsWinner === ME) { handleAct("choose", { dataset: { v: "1" } }); return {}; }
        if (S.phase === "mulligan" && S.mull[ME] == null) { handleAct("mull", { dataset: { v: "0" } }); return {}; }
        if (S.phase === "play" && typeof canAct === "function" && canAct()) {
          for (let g = 0; g < 30 && !S.over; g++) { const a = cpuChoose(ME); if (!a || !applyAction(ME, a)) break; await new Promise(r => setTimeout(r, 30)); }
          if (!S.over && canAct()) endTurn(ME);
        }
        return { phase: S.phase, turn: S.turnNo };
      });
      if (st.end) { out.game = st; break; }
      await p.waitForTimeout(250);
    }
    check("CPU戦が最後まで終わる", out.game && !out.game.why, out.game ? (out.game.why || `${out.game.turns}ターン・勝者 ${out.game.winner}`) : "4分で終わらなかった");
    await p.waitForTimeout(2500);
    out.at = "結果の画面";
    check("結果の画面が出る", await p.evaluate(() => !!document.querySelector(".fin, #overlay:not([hidden]) .res-crest, #overlay:not([hidden]) .panel")), "");
  } catch (e) { check("点検の途中で止まった", false, `${out.at}：${String(e.message).slice(0, 300)}`); }
  check("ページのエラーなし", !out.errors.length, out.errors.length ? `${out.errors.length}件` : "");
  await b.close(); srv.close();
  delete out.at;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
})();
