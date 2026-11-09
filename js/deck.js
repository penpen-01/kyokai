/* =========================================================
   デッキ編成
   ・デッキはアカウントに保存（試遊モードのときだけ、この端末に保存）
   ・入れられる枚数は「所持数」と「1デッキの投入上限」の少ないほう
   ・ベータ中（SAMPLE_DECKS）は、所持に関係なく全カードで組める「サンプルデッキ」も作れる
   ・操作：一覧のカードをタップで1枚追加、デッキの中のカードをタップで1枚減らす、長押しで詳細
   ・持っていないカードも入れて保存できる（目指すデッキ）。イラストは隠れたまま。全部そろうまで対戦には使えない
   ========================================================= */

const DECKS_KEY = "kyokai-decks-v1";
const DECK_SEL_KEY = "kyokai-deck-sel";
const COST_BANDS = { all: "全コスト", "0-2": "0〜2", "3-4": "3〜4", "5-6": "5〜6", "7+": "7以上" };

const Decks = {
  editing: null,     // 編集中のデッキ（コピー）
  viewing: null,     // 閲覧中のデッキid
  detail: null,      // 詳細を開いているカードid
  filter: { type: "all", world: "all", cost: "all", rarity: "all", owned: false, q: "" },

  free() { return Account.status === "free"; },
  sampleOK() { return !!CONFIG.SAMPLE_DECKS; },
  /* サンプルデッキが使えるのは、練習対戦と友達との対戦（1日 SAMPLE_ONLINE_DAY 回まで）だけ */
  today() { return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); },
  sampleLeft() {
    const lim = CONFIG.SAMPLE_ONLINE_DAY ?? 3, sd = Account.data && Account.data.sampleDay;
    return Math.max(0, lim - (sd && sd.d === this.today() ? sd.n : 0));
  },
  useSample() {
    if (!Account.data) return;
    const t = this.today(), sd = Account.data.sampleDay;
    Account.data.sampleDay = { d: t, n: (sd && sd.d === t ? sd.n : 0) + 1 };
    Account.saveNow();
  },
  /* このデッキは所持数を気にせず組めるか */
  unbound(deck) { return this.free() || !!(deck && deck.free && this.sampleOK()); },
  mine() {
    if (this.free()) {
      try { const v = JSON.parse(localStorage.getItem(DECKS_KEY)); return Array.isArray(v) ? v.map(d => ({ ...d, cards: cleanDeckCards(d.cards) })) : []; }
      catch { return []; }
    }
    return Account.decks().map(d => ({ ...d, cards: { ...d.cards } }));
  },
  saveMine(list) {
    if (this.free()) { try { localStorage.setItem(DECKS_KEY, JSON.stringify(list)); return true; } catch { return false; } }
    if (Account.status === "none") return false;
    return Account.setDecks(list);
  },
  /* 作れるデッキの数の上限。いっぱいなら知らせて true を返す（新しく作るときだけ使う） */
  full(kind) {
    kind = kind === true ? "sample" : kind || "mine";
    const n = this.mine().filter(d => this.kindOf(d) === kind).length;
    if (n < (CONFIG.DECK_MAX || 10)) return false;
    toast(`${{ sample: "サンプルデッキ", world: "限定構築のデッキ" }[kind] || "デッキ"}は${CONFIG.DECK_MAX}個までです。いらないデッキを消してから作ってください`);
    return true;
  },
  /* 保存できない理由。30枚に足りないのは「未完成」として保存できる（対戦には使えない） */
  saveProblems(deck) {
    const n = deckCount(deck), size = CONFIG.DECK_SIZE;
    return this.problems(deck).filter(p => !(n < size && p.startsWith(`${size}枚ちょうど`)) && !p.startsWith(MISSING_PREFIX));
  },
  /* デッキの状態の一文。30枚に足りないときは「未完成」と伝える */
  probText(deck, all) {
    const pr = this.problems(deck), n = deckCount(deck), size = CONFIG.DECK_SIZE;
    if (!pr.length) return "";
    if (n < size && pr.length === 1) return `未完成：あと${size - n}枚。${size}枚そろうと対戦に使えます`;
    if (n < size) return [`未完成：あと${size - n}枚`, ...pr.filter(p => !p.startsWith(`${size}枚ちょうど`))].map(esc).join(all ? "<br>" : "／");
    return all ? pr.map(esc).join("<br>") : esc(pr[0]);
  },
  wantCount(deck) { return Object.values((deck && deck.want) || {}).reduce((a, b) => a + b, 0); },
  /* まだ持っていないカードの一覧（タイル） */
  wantHTML(deck, editable) {
    const w = Object.entries((deck && deck.want) || {}).filter(([id, n]) => n > 0 && DEF[id]);
    if (!w.length) return "";
    return `<h3 class="sec">まだ持っていないカード <small class="hint">${editable ? "手に入れたら、タップでデッキに入れられます" : "手に入れると、このデッキに入れられます"}</small></h3>
      <div class="dstrips want">${w.map(([id, n]) => {
        const c = DEF[id], can = editable && this.maxFor(c, deck) > (deck.cards[id] || 0);
        return this.stripHTML(c, n, editable ? "deckWantAdd" : "deckDetail", false, can ? "can" : "notown");
      }).join("")}</div>`;
  },
  find(id) { return this.mine().find(d => d.id === id) || (this.free() ? PRESETS.find(d => d.id === id) : null) || null; },
  owned(id) { return Account.owned(id); },
  problems(deck) {
    const pr = deckProblems(deck, DEF, CONFIG, this.unbound(deck) ? null : id => this.owned(id));
    // 限定構築（世界限定）のデッキ：30枚すべて決めた世界のカード
    if (deck && deck.fmt === "world" && Object.keys(deck.cards || {}).some(id => DEF[id] && DEF[id].world !== deck.world))
      pr.push(`限定構築のデッキなので、${WORLDS[deck.world] || ""}のカードだけにしてください`);
    return pr;
  },
  isWorld(deck) { return !!(deck && deck.fmt === "world" && WORLDS[deck.world]); },
  kindOf(d) { return d.free ? "sample" : d.fmt === "world" ? "world" : "mine"; },
  isValid(deck) { return !!deck && this.problems(deck).length === 0; },
  // 入れられる枚数：持っていないカードも上限まで入れられる（保存はできる・対戦には使えない）
  maxFor(c, deck) { return cardLimit(c, CONFIG, deck); },
  missing(deck) { return this.unbound(deck) ? 0 : deckMissing(deck, id => this.owned(id)); },

  selectedId() { try { return localStorage.getItem(DECK_SEL_KEY); } catch { return null; } },
  select(id) { try { localStorage.setItem(DECK_SEL_KEY, id); } catch {} },
  selected() {
    const d = this.find(this.selectedId());
    if (d) return d;
    const mine = this.mine();
    return mine.find(x => this.isValid(x)) || mine[0] || (this.free() ? PRESETS.find(p => this.isValid(p)) : null) || null;
  },
  readyDeck(onFail) {
    const d = this.selected();
    if (!d) { onFail("デッキがありません。デッキ編成で作ってください。"); return null; }
    const pr = this.problems(d);
    if (pr.length) { onFail(`「${d.name}」はまだ使えません：${pr[0]}`); return null; }
    // sample：サンプルデッキ（所持に関係なく組んだデッキ）。勝ってもGはもらえない
    const icon = Account.icon();
    return { name: d.name, cards: { ...d.cards }, ...(d.free && this.sampleOK() ? { sample: true } : {}), ...(icon ? { icon } : {}), ...(d.key ? { key: d.key } : {}) };
  },
  randomPreset(level) {
    const ok0 = PRESETS.filter(p => !hiddenDeck(p) && deckProblems(p, DEF, CONFIG).length === 0);
    let ok = ok0.filter(p => !level || p.level === level);
    if (!ok.length) ok = ok0;
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  },

  /* 並べるときの順番（コスト→名前） */
  sorted(cards) {
    return Object.entries(cards).map(([id, n]) => ({ c: DEF[id], id, n }))
      .sort((a, b) => (a.c ? a.c.cost : 99) - (b.c ? b.c.cost : 99) || (a.c && b.c ? a.c.name.localeCompare(b.c.name, "ja") : 0));
  },
  curveHTML(cards) {
    const curve = Array(9).fill(0);
    let chars = 0, total = 0;
    this.sorted(cards).forEach(({ c, n }) => { if (c) { curve[Math.min(8, c.cost)] += n; if (c.type === "char") chars += n; } total += n; });
    const max = Math.max(1, ...curve);
    return `<div class="dsum">
      <div class="dcurve">${curve.map((k, i) => `<div><span class="n">${k || ""}</span><span class="fill" style="height:${(k / max) * 40}px"></span><span class="c">${i === 8 ? "8+" : i}</span></div>`).join("")}</div>
      <div class="dsplit">キャラ <b>${chars}</b> ・ 魔法 <b>${total - chars}</b></div>
    </div>`;
  },
  /* まだ持っていないカードはイラストを隠す（サンプルデッキ・試遊では隠さない） */
  hideArt(c, deck) {
    return ["ready", "offline"].includes(Account.status) && !this.unbound(deck) && Account.owned(c.id) <= 0;
  },
  /* カードのタイル。枚数などの札はカードに重ねず、下の1行に並べる */
  tileHTML(c, badge, cls = "", act = "deckDetail", hidden = false) {
    return `<button type="button" class="dtile ${cls}" data-act="${act}" data-id="${esc(c.id)}" aria-label="${esc(c.name)}">
      ${cardHTML(c, { static: true, hidden })}<span class="dmeta">${badge}</span></button>`;
  },
  /* デッキの中身の1行（コスト・名前・絵の帯・枚数）。重ならず、名前がはっきり読める */
  stripHTML(c, n, act, hidden = false, cls = "", miss = 0) {
    const art = c.art && !hidden ? `style="background-image:url('${esc(c.art)}')"` : "";
    return `<button type="button" class="dstrip w-${esc(c.world)} r-${esc(c.rarity || "common")} ${cls}" data-act="${act}" data-id="${esc(c.id)}" aria-label="${esc(c.name)} ${n}枚">
      <span class="ds-cost">${c.cost}</span><span class="ds-art" ${art}></span>
      <span class="ds-name">${esc(c.name)}${c.type === "spell" ? `<small>魔法</small>` : `<small>${c.atk}/${c.hp}</small>`}</span>
      <span class="ds-n">×${n}${miss ? `<small>未所持${miss}</small>` : ""}</span></button>`;
  },
  stripsHTML(cards, act, deck) {
    const list = this.sorted(cards), unb = this.unbound(deck);
    return list.length ? `<div class="dstrips">${list.map(({ c, n, id }) => c
      ? this.stripHTML(c, n, act, this.hideArt(c, deck), !unb && n > this.owned(id) ? "short" : "", !unb && n > this.owned(id) ? n - this.owned(id) : 0)
      : `<button type="button" class="dstrip missing" data-act="${act === "deckTapDec" ? "deckDec" : "noop"}" data-id="${esc(id)}"><span class="ds-cost">？</span><span class="ds-name">今は使えないカード</span><span class="ds-n">×${n}</span></button>`).join("")}</div>` : "";
  },
  /* デッキの代表カード：自分で選んだカード（deck.key）。選んでいなければレア度・コストの高い、絵のあるカード */
  keyCard(deck) {
    const R = RARITY_ORDER;
    const k = deck.key && DEF[deck.key];
    if (k && k.art && ((deck.cards[k.id] || 0) + ((deck.want || {})[k.id] || 0)) > 0 && !this.hideArt(k, deck)) return k;
    return this.sorted(deck.cards).map(x => x.c).filter(c => c && c.art && !this.hideArt(c, deck))
      .sort((a, b) => R.indexOf(b.rarity) - R.indexOf(a.rarity) || b.cost - a.cost)[0] || null;
  },
  worldBar(deck) {
    const n = { myth: 0, fan: 0, mech: 0 }; let t = 0;
    this.sorted(deck.cards).forEach(({ c, n: k }) => { if (c) { n[c.world] += k; t += k; } });
    return t ? `<span class="dworlds" aria-label="${Object.keys(n).map(w => `${WORLDS[w]}${n[w]}枚`).join("・")}">${Object.keys(n).filter(w => n[w]).map(w => `<i class="w-${w}" style="flex:${n[w]}"></i>`).join("")}</span>` : "";
  },
  topbar(title, backAct) {
    return `<div class="topbar"><button type="button" class="btn sm" data-act="${backAct}">← 戻る</button><b>${title}</b></div>`;
  },

  /* ---------- 一覧 ----------
     「マイデッキ」「サンプル」（「CPU用」）をタブで分ける。デッキは絵の大きい札で2列に並べる。
     札を長押しすると持ち上がり、指でずらして順番を入れ替えられる（離すと保存） */
  listTab: "mine",
  deckTileHTML(d, sel, movable) {
    const pr = this.problems(d), n = deckCount(d), size = CONFIG.DECK_SIZE;
    const using = sel && sel.id === d.id, key = this.keyCard(d);
    const miss = this.missing(d);
    const st = n < size ? `<span class="dbt-st wip">未完成 ${n}/${size}</span>`
      : miss && pr.length === 1 ? `<span class="dbt-st miss">未所持 ${miss}枚</span>`
      : pr.length ? `<span class="dbt-st bad" title="${esc(pr[0])}">⚠ 使えない</span>` : `<span class="dbt-st ok">${n}/${size}</span>`;
    return `<div class="dbt ${using ? "using" : ""}" ${movable ? `data-deck="${esc(d.id)}"` : ""}>
      <button type="button" class="dbt-open" data-act="deckView" data-id="${esc(d.id)}" aria-label="${esc(d.name)}${using ? "（使用中）" : ""}">
        <span class="dbt-art" ${key ? `style="background-image:url('${esc(key.art)}')"` : ""}></span>
        ${using ? `<span class="dbt-using">使用中</span>` : ""}
        ${st}
        <span class="dbt-foot">${this.isWorld(d) ? `<small class="wtag w-${d.world}">限定・${WORLDS[d.world]}</small>` : ""}<b class="dbt-name">${esc(d.name)}</b>${this.worldBar(d)}</span>
      </button>
    </div>`;
  },
  showList(msg) {
    this.editing = null; this.viewing = null; this.detail = null; this.codeFor = null;
    const sel = this.selected(), all = this.mine();
    const samp = this.sampleOK() && !this.free();
    if (this.listTab === "sample" && !samp) this.listTab = "mine";
    if (this.listTab === "cpu" && !this.free()) this.listTab = "mine";
    const tab = this.listTab;
    const list = tab === "cpu" ? PRESETS : all.filter(d => this.kindOf(d) === tab);
    const tabBtn = (v, label, n) => `<button type="button" role="tab" data-act="deckListTab" data-v="${v}" aria-pressed="${tab === v}">${label}${n != null ? ` <small>${n}</small>` : ""}</button>`;
    const newTile = tab === "cpu" ? "" : `<button type="button" class="dbt new" data-act="${{ sample: "deckNewSample", world: "deckNewWorld" }[tab] || "deckNew"}"><span class="dbt-plus" aria-hidden="true">＋</span><b>新しく作る</b></button>`;
    openOverlay(`<div class="panel wide">
      ${this.topbar("デッキ編成", "deckBack")}
      ${msg ? `<p class="onl-msg">${esc(msg)}</p>` : ""}
      ${true ? `<div class="seg wide dl-tabs" role="tablist">
        ${tabBtn("mine", this.free() ? "自分のデッキ" : "マイデッキ", `${all.filter(d => this.kindOf(d) === "mine").length}/${CONFIG.DECK_MAX}`)}
        ${tabBtn("world", "限定構築", `${all.filter(d => this.kindOf(d) === "world").length}/${CONFIG.DECK_MAX}`)}
        ${samp ? tabBtn("sample", "サンプル", `${all.filter(d => d.free).length}/${CONFIG.DECK_MAX}`) : ""}
        ${this.free() ? tabBtn("cpu", "CPU用") : ""}
      </div>` : ""}
      ${tab === "sample" ? `<p class="callout"><b>使える場所</b>練習対戦と、友達との対戦（1日${CONFIG.SAMPLE_ONLINE_DAY ?? 3}回まで・今日はあと${this.sampleLeft()}回）${CONFIG.SAMPLE_CPU ? "。ベータの間は CPU戦でも使えます（Gと連勝・隠しボスはなし）" : "だけです。CPU戦・世界限定戦では使えません"}。</p>` : ""}
      <p class="hint dl-hint">${tab === "world" ? "世界限定戦で使うデッキです。1つの世界を決めて、その世界のカードだけで30枚を組みます。"
        : tab === "sample" ? "持っていないカードも含めて、すべてのカードで組めるデッキです（ベータ限定）。勝ってもGはもらえません。"
        : tab === "cpu" ? "CPU が使っているデッキです。"
        : `${CONFIG.DECK_SIZE}枚・同じカードは${CONFIG.COPY_MAX}枚まで。${this.free() ? "試遊モードなので、すべてのカードを使えます。" : "持っていないカードも入れて保存できます（そろうまで対戦には使えません）。"}`}
        ${tab !== "cpu" && list.length > 1 ? "<br>デッキを長押しすると、順番を並び替えられます。" : ""}</p>
      <div class="dbgrid" id="dbgrid" data-tab="${tab}">${list.map(d => this.deckTileHTML(d, sel, tab !== "cpu")).join("")}${newTile}</div>
      ${tab === "cpu" ? "" : `<div class="pre-btns">
        <button type="button" class="btn" data-act="deckImport">デッキコードから作る</button>
        ${tab === "sample" ? `<button type="button" class="btn" data-act="deckPresets">用意されたデッキから作る</button>` : ""}
      </div>`}
    </div>`, "start", true);
  },
  /* 並び替えたあとの順番を保存する（同じタブのデッキだけを、画面の並びのとおりにする） */
  saveOrder(ids) {
    const list = this.mine(), sample = this.listTab === "sample";
    const moved = ids.map(id => list.find(d => d.id === id)).filter(Boolean);
    let k = 0;
    const next = list.map(d => (!!d.free === sample ? moved[k++] || d : d));
    if (!this.saveMine(next)) toast("保存できませんでした（サーバーに接続できていません）");
  },

  /* 限定構築：新しいデッキの世界を選ぶ */
  showWorldPick() {
    openOverlay(`<div class="panel">
      ${this.topbar("限定構築：世界を選ぶ", "decks")}
      <p class="lead small">このデッキで使う世界を選んでください。あとから変えることはできません（変えたいときは新しく作ります）。</p>
      <div class="lvls">${Object.entries(WORLDS).map(([k, v]) => `<button type="button" class="lvl lvl-mode wpick w-${k}" data-act="deckNewWorldGo" data-v="${k}">
        <span class="lvl-body"><span class="lvl-head"><b>${v}</b></span><span class="lvl-desc">${v}のカードだけで30枚を組む</span></span><span class="lvl-go" aria-hidden="true">›</span></button>`).join("")}</div>
    </div>`, "start", true);
  },

  showPresets() {
    openOverlay(`<div class="panel wide">
      ${this.topbar("用意されたデッキから作る", "decks")}
      <p class="lead small">CPUが使っているデッキをコピーして、サンプルデッキとして編集できます。</p>
      <ul class="dlist">${PRESETS.filter(d => !hiddenDeck(d)).map(d => `<li class="drow"><span class="drow-main"><b>${esc(d.name)}</b><span class="hint">${{ easy: "初級", normal: "中級", hard: "上級", ex: "超級" }[d.level] || ""}CPU用 ・ ${deckCount(d)}枚</span></span>
        <div class="drow-acts"><button type="button" class="btn sm" data-act="deckFromPreset" data-id="${esc(d.id)}">コピーして編集</button></div></li>`).join("")}</ul>
    </div>`, "start", true);
  },

  showImport(msg) {
    openOverlay(`<div class="panel">
      ${this.topbar("デッキコードから作る", "decks")}
      <p class="lead small">友達が「デッキコードをコピー」で送ってくれたコードを貼り付けてください。メッセージごと貼り付けても、コードの部分だけを読み取ります。</p>
      <textarea class="otxt" id="deck-code" rows="4" placeholder="KYK2:..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
      ${this.sampleOK() && !this.free() ? `<label class="ownchk"><input type="checkbox" id="deck-code-sample"> サンプルデッキとして作る（全カード使用可）</label>` : ""}
      ${msg ? `<p class="onl-msg">${esc(msg)}</p>` : ""}
      <div class="pre-btns"><button type="button" class="btn" data-act="decks">やめる</button><button type="button" class="btn primary" data-act="deckImportGo">作る</button></div>
    </div>`, "start", true);
  },

  /* ---------- 閲覧 ---------- */
  showView(id) {
    const d = this.find(id); if (!d) return this.showList();
    this.viewing = id;
    const pr = this.problems(d), n = deckCount(d);
    const isPreset = !this.mine().some(x => x.id === id);
    const sel = this.selected();
    openOverlay(`<div class="panel wide">
      ${this.topbar("デッキ", "decks")}
      <div class="dview-head"><h2 class="title sm">${esc(d.name)}${d.free ? `<small class="ptag">サンプル</small>` : ""}</h2><span class="dcount ${n === CONFIG.DECK_SIZE ? "ok" : "bad"}">${n}<small>/${CONFIG.DECK_SIZE}</small></span></div>
      <p class="dprob ${pr.length ? "bad" : "ok"}">${pr.length ? this.probText(d, true) : "このデッキで対戦できます"}</p>
      ${this.curveHTML(d.cards)}
      <div class="dview-acts">
        ${sel && sel.id === id ? `<span class="usingtag big">使用中</span>` : `<button type="button" class="btn primary" data-act="deckUse" data-id="${esc(id)}" ${pr.length ? "disabled" : ""}>このデッキを使う</button>`}
        ${isPreset ? `<button type="button" class="btn" data-act="deckCopy" data-id="${esc(id)}">コピーして編集</button>`
          : `<button type="button" class="btn" data-act="deckEdit" data-id="${esc(id)}">編集</button>
             <button type="button" class="btn" data-act="deckCopy" data-id="${esc(id)}">複製</button>`}
        <button type="button" class="btn" data-act="deckCode" data-id="${esc(id)}">デッキコードを送る</button>
      </div>
      <p class="hint">カードをタップすると、効果を見られます。${isPreset ? "" : "そこから「代表カード」（一覧に出る絵）も選べます。"}</p>
      ${this.stripsHTML(d.cards, "deckDetail", d)}
      ${this.wantHTML(d, false)}
      ${this.codeHTML(d)}
      ${this.detailHTML(false)}
    </div>`, "start", true);
  },

  /* デッキコードの窓：コードを見せて、コピーか共有（LINE など）で送る */
  codeHTML(d) {
    if (this.codeFor !== d.id) return "";
    const code = deckToCode(d), canShare = !!navigator.share;
    return `<div class="dmodal" data-act="deckCodeClose">
      <div class="dmodal-in codebox" role="dialog" aria-label="デッキコード" data-act="noop">
        <b class="dm-name">デッキコード</b>
        <p class="hint">このコードを友達に送ると、「デッキコードから作る」で同じデッキを作れます。${this.wantCount(d) ? "まだ持っていないカードも含めた、完成形のデッキのコードです。" : ""}</p>
        <textarea class="otxt codetxt" id="deck-code-out" rows="4" readonly>${esc(code)}</textarea>
        <div class="pre-btns">
          ${canShare ? `<button type="button" class="btn primary" data-act="deckCodeShare">LINE などで送る</button>` : ""}
          <button type="button" class="btn ${canShare ? "" : "primary"}" data-act="deckCodeCopy">コピー</button>
          <button type="button" class="btn" data-act="deckCodeClose">閉じる</button>
        </div>
      </div>
    </div>`;
  },

  /* ---------- 編集 ---------- */
  startEdit(deck, isNew) {
    // 前の「まだ持っていないカード（want）」は、デッキの中身にまとめる（今は持っていないカードもそのまま入れられるため）
    const cards = { ...deck.cards };
    Object.entries(deck.want || {}).forEach(([id, n]) => {
      const c = DEF[id]; if (!c || c.limit <= 0) return;
      const room = Math.min(cardLimit(c, CONFIG, deck) - (cards[id] || 0), CONFIG.DECK_SIZE - deckCount({ cards }));
      if (room > 0) cards[id] = (cards[id] || 0) + Math.min(n, room);
    });
    this.editing = { id: deck.id, name: deck.name, cards, want: {}, key: deck.key || null, isNew, free: !!deck.free, ...(this.isWorld(deck) ? { fmt: "world", world: deck.world } : {}), confirmDel: false };
    if (this.isWorld(deck)) this.filter.world = deck.world;   // 限定構築は、その世界のカードだけを出す
    else if (this.filter.world !== "all" && this.lastWorldEdit) this.filter.world = "all";
    this.lastWorldEdit = this.isWorld(deck);
    this.editTab = isNew && !deckCount(deck) ? "pool" : (deckCount(deck) ? "deck" : "pool");
    this.detail = null;
    this.renderEdit();
  },

  poolCards() {
    const f = this.filter, q = f.q.trim(), ed = this.editing;
    const unb = this.unbound(ed);
    return CARDS.filter(c => c.limit > 0 && cardShown(c))
      .filter(c => f.type === "all" || c.type === f.type)
      .filter(c => f.world === "all" || c.world === f.world)
      .filter(c => !this.isWorld(ed) || c.world === ed.world)
      .filter(c => f.rarity === "all" || c.rarity === f.rarity)
      .filter(c => f.cost === "all" || (f.cost === "7+" ? c.cost >= 7 : (([a, b]) => c.cost >= a && c.cost <= b)(f.cost.split("-").map(Number))))
      .filter(c => !f.owned || unb || this.owned(c.id) > 0)
      .filter(c => !q || c.name.includes(q) || cardText(c).includes(q))
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));
  },
  poolHTML() {
    const ed = this.editing, list = this.poolCards(), unb = this.unbound(ed);
    return list.length ? list.map(c => {
      const k = ed.cards[c.id] || 0, own = this.owned(c.id), max = this.maxFor(c, ed);
      const none = !unb && own <= 0;
      return this.tileHTML(c, `<span class="dbadge ${k ? "in" : ""}">${k ? `デッキ${k}` : "＋"}<small>/${max}</small></span>${unb ? "" : `<span class="obadge">所持${own}</span>`}`,
        `${none ? "unowned" : k ? "has" : ""} ${k >= max ? "maxed" : ""} ${!unb && k > own ? "short" : ""}`, "deckTapAdd", this.hideArt(c, ed));
    }).join("") : `<p class="hint">条件に合うカードがありません。</p>`;
  },

  renderEdit() {
    if (!this.editing) return;
    const o = $("#overlay");
    const keepScroll = o.scrollTop;
    openOverlay(this.editHTML(), "start", true);
    o.scrollTop = keepScroll;
  },
  /* カードを1枚足したり減らしたりしたときは、画面を作り直さずに変わったところだけ差し替える
     （一覧のカードの絵を作り直さないので、絵が消えたり重くなったりしない） */
  refreshEdit() {
    const o = $("#overlay"), cur = o.querySelector(".dedit");
    if (!cur || this.detail || cur.querySelector(".dmodal")) return this.renderEdit();
    const tmp = document.createElement("div"); tmp.innerHTML = this.editHTML();
    const nu = tmp.querySelector(".dedit");
    [".dedit-top .dcount", ".dprob", ".dsum", ".dtabs", ".deckpane", ".dedit-bar"].forEach(sel => {
      const a = cur.querySelector(sel), b = nu.querySelector(sel);
      if (a && b) a.replaceWith(b);
    });
    nu.querySelectorAll("#deck-pool .dtile[data-id]").forEach(nt => {
      const ot = cur.querySelector(`#deck-pool .dtile[data-id="${CSS.escape(nt.dataset.id)}"]`);
      if (!ot) return;
      ot.className = nt.className;
      const a = ot.querySelector(".dmeta"), b = nt.querySelector(".dmeta");
      if (a && b && a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML;
    });
  },
  editHTML() {
    const ed = this.editing;
    const n = deckCount(ed), pr = this.problems(ed);
    const f = this.filter, unb = this.unbound(ed);
    const seg = (key, val, label) => `<button type="button" data-act="deckFilter" data-k="${key}" data-v="${val}" aria-pressed="${f[key] === val}">${label}</button>`;
    return `<div class="panel wide dedit">
      <div class="dedit-top">
        <input class="otxt dname" id="deck-name" maxlength="16" value="${esc(ed.name)}" aria-label="デッキの名前">
        <span class="dcount ${n === CONFIG.DECK_SIZE ? "ok" : "bad"}">${n}<small>/${CONFIG.DECK_SIZE}</small></span>
      </div>
      ${ed.free ? `<p class="hint">サンプルデッキ：持っていないカードも入れられます（ベータ限定）。</p>` : ""}
      ${this.isWorld(ed) ? `<p class="hint">限定構築（${WORLDS[ed.world]}）：${WORLDS[ed.world]}のカードだけで組むデッキです。世界限定戦で使えます。</p>` : ""}
      <p class="dprob ${pr.length ? "bad" : "ok"}">${pr.length ? this.probText(ed) : "このデッキで対戦できます"}</p>
      ${this.curveHTML(ed.cards)}
      <div class="seg dtabs" role="tablist">
        <button type="button" role="tab" data-act="deckTab" data-v="pool" aria-pressed="${this.editTab !== "deck"}">カードを選ぶ</button>
        <button type="button" role="tab" data-act="deckTab" data-v="deck" aria-pressed="${this.editTab === "deck"}">デッキの中身 <b>${n}</b>${this.wantCount(ed) ? `<small>＋未所持${this.wantCount(ed)}</small>` : ""}</button>
      </div>
      <div class="dedit-cols tab-${this.editTab === "deck" ? "deck" : "pool"}">
      <section class="dpane deckpane">
        <h3 class="sec">デッキの中身 <small class="hint">タップで1枚減らす・長押しで詳細</small></h3>
        <div id="deck-in">${n ? this.stripsHTML(ed.cards, "deckTapDec", ed) : `<p class="hint">「カードを選ぶ」でカードをタップすると、ここに入ります。</p>`}</div>
        ${this.wantHTML(ed, true)}
      </section>
      <section class="dpane poolpane">
      <h3 class="sec">カードを選ぶ <small class="hint">タップで1枚入れる・長押しで詳細</small></h3>
      <div class="dfilters">
        <input class="otxt dsearch" id="deck-q" type="search" placeholder="名前や効果で検索（例：守護、ドロー）" value="${esc(f.q)}" autocomplete="off">
        <div class="seg">${seg("type", "all", "すべて")}${seg("type", "char", "キャラ")}${seg("type", "spell", "魔法")}</div>
        ${this.isWorld(ed) ? `<p class="hint">限定構築（${WORLDS[ed.world]}）：${WORLDS[ed.world]}のカードだけを出しています</p>` : `<div class="seg">${seg("world", "all", "全世界")}${Object.entries(WORLDS).map(([k, v]) => seg("world", k, v)).join("")}</div>`}
        <div class="seg">${Object.entries(COST_BANDS).map(([k, v]) => seg("cost", k, v)).join("")}</div>
        <div class="seg">${seg("rarity", "all", "全レア")}${Object.keys(RARITY).map(k => seg("rarity", k, RARITY_SHORT[k])).join("")}</div>
        ${unb ? "" : `<label class="ownchk"><input type="checkbox" id="deck-owned" ${f.owned ? "checked" : ""}> 持っているカードだけ</label>`}
      </div>
      <div class="dgrid pool" id="deck-pool">${this.poolHTML()}</div>
      </section>
      </div>

      ${this.detailHTML(true)}

      <div class="dedit-bar">
        ${ed.confirmDel
          ? `<span class="bad" style="flex:1">このデッキを削除します。元に戻せません。</span>
             <button type="button" class="btn danger" data-act="deckDelYes">削除する</button>
             <button type="button" class="btn" data-act="deckDelNo">やめる</button>`
          : `${ed.isNew ? "" : `<button type="button" class="btn danger" data-act="deckDel">削除</button>`}
             <button type="button" class="btn" data-act="deckCancel">保存せずに戻る</button>
             <button type="button" class="btn primary" data-act="deckSave" ${this.saveProblems(ed).length ? "disabled" : ""}>${n === CONFIG.DECK_SIZE ? (this.missing(ed) ? `保存（未所持${this.missing(ed)}枚）` : "保存") : n < CONFIG.DECK_SIZE ? `未完成のまま保存（あと${CONFIG.DECK_SIZE - n}枚）` : `保存（${CONFIG.DECK_SIZE}枚にすると押せます）`}</button>`}
      </div>
    </div>`;
  },

  /* 代表カード（デッキ一覧の絵）にするボタン：自分のデッキに入っている、絵のあるカードだけ */
  keyBtn(c) {
    const d = this.editing || (this.viewing && this.mine().find(x => x.id === this.viewing));
    if (!d || !c.art || !((d.cards[c.id] || 0) + ((d.want || {})[c.id] || 0)) || this.hideArt(c, d)) return "";
    return d.key === c.id ? `<span class="hint keyon">★ このデッキの代表カードです（一覧に絵が出ます）</span>`
      : `<button type="button" class="btn" data-act="deckKey" data-id="${esc(c.id)}">★ 代表カードにする</button>`;
  },
  /* カードの詳細（編集中は枚数を変えられる） */
  detailHTML(editable) {
    const c = this.detail && DEF[this.detail];
    if (!c) return "";
    const ed = this.editing, unb = this.unbound(ed || this.find(this.viewing));
    const k = ed ? ed.cards[c.id] || 0 : 0, max = this.maxFor(c, ed);
    return `<div class="dmodal" data-act="deckDetailClose">
      <div class="dmodal-in" role="dialog" aria-label="${esc(c.name)}" data-act="noop">
        ${detailNavHTML(this.detailIds || [], c.id, "deckStep")}
        <div class="dmodal-card">${cardHTML(c, { static: true, hidden: this.hideArt(c, ed || this.find(this.viewing)) })}</div>
        <div class="dmodal-body">
          <b class="dm-name">${esc(c.name)}</b>
          <span class="pmeta">${RARITY[c.rarity]} ・ ${WORLDS[c.world]} ・ ${TYPES[c.type]} ・ コスト${c.cost}${c.type === "char" ? ` ・ ${c.atk}/${c.hp}` : ""}</span>
          <p class="dm-text">${esc(cardText(c))}</p>
          <span class="pmeta">${unb ? "" : `所持 ${this.owned(c.id)}枚 ・ `}1デッキに${cardLimit(c, CONFIG, ed)}枚まで</span>
          ${editable ? `<div class="dm-step">
            <button type="button" class="btn" data-act="deckDec" data-id="${esc(c.id)}" ${k ? "" : "disabled"}>−</button>
            <span class="dm-k">デッキに <b>${k}</b> 枚</span>
            <button type="button" class="btn primary" data-act="deckInc" data-id="${esc(c.id)}" ${k >= max ? "disabled" : ""}>＋</button>
          </div>
          ${!unb && k > this.owned(c.id) ? `<span class="hint">持っていない分（${k - this.owned(c.id)}枚）が入っています。そろうまで、このデッキは対戦に使えません。</span>` : ""}` : ""}
          ${this.unbound(ed || this.find(this.viewing)) ? "" : Shop.tradeHTML(c)}
          ${this.keyBtn(c)}
          <button type="button" class="btn" data-act="deckDetailClose">閉じる</button>
        </div>
      </div>
    </div>`;
  },

  /* 詳細を開いたときに画面に並んでいたカードの順番（左右の矢印で使う） */
  snapIds(from) {
    const sel = from && from.closest(".dgrid") ? "#overlay #deck-pool [data-id]"
      : from && from.closest(".dstrips") ? "#overlay .dstrips [data-id]" : "#overlay .dstrips [data-id], #overlay #deck-pool [data-id]";
    this.detailIds = [...document.querySelectorAll(sel)].map(x => x.dataset.id).filter((v, k, a) => v && DEF[v] && a.indexOf(v) === k);
  },
  rerender() { if (this.editing) this.renderEdit(); else if (this.viewing) this.showView(this.viewing); },

  inc(id, quick) {
    const ed = this.editing, c = DEF[id]; if (!c || !ed) return;
    const k = ed.cards[id] || 0, max = this.maxFor(c, ed);
    if (k >= max) { if (quick) toast(`${c.name}は1デッキに${cardLimit(c, CONFIG, ed)}枚までです`); return; }
    if (quick && !this.unbound(ed) && this.owned(id) <= k) toast(`${c.name}はまだ${this.owned(id) ? `${this.owned(id)}枚しか` : ""}持っていません。保存はできますが、そろうまで対戦には使えません`);
    ed.cards[id] = k + 1;
    if (ed.want && ed.want[id] > 0 && --ed.want[id] <= 0) delete ed.want[id];   // 欲しかったカードを入れたら、その分を減らす
    Sound.play("click");
    if (quick) { this.refreshEdit(); this.pulse(id); } else this.renderEdit();
  },
  dec(id) {
    const ed = this.editing; if (!ed || !ed.cards[id]) return;
    ed.cards[id]--; if (ed.cards[id] <= 0) delete ed.cards[id];
    Sound.play("click");
    if (this.detail) this.renderEdit(); else this.refreshEdit();
  },
  /* 入れたカードがデッキのどこに入ったか分かるように光らせる */
  pulse(id) {
    [`#deck-in [data-id="${CSS.escape(id)}"]`, `#deck-pool [data-id="${CSS.escape(id)}"]`, `.dtabs [data-v="deck"]`].forEach(sel => {
      const el = document.querySelector(sel);
      if (el) { el.classList.add("pulse"); setTimeout(() => el.classList.remove("pulse"), 500); }
    });
  },

  handleAct(act, el) {
    const id = el && el.dataset.id;
    const ed = this.editing;
    switch (act) {
      case "decks": this.showList(); return true;
      case "deckListTab": this.listTab = el.dataset.v; this.showList(); return true;
      case "deckBack": this.editing = null; this.viewing = null; showStart(); return true;
      case "deckUse": this.select(id); if (this.viewing) this.showView(this.viewing); else this.showList(); return true;
      case "deckView": this.detail = null; this.codeFor = null; this.showView(id); return true;
      case "deckNew": if (this.full(false)) return true; this.startEdit({ id: "d" + Date.now().toString(36), name: "新しいデッキ", cards: {} }, true); return true;
      case "deckNewWorld": if (this.full("world")) return true; this.showWorldPick(); return true;
      case "deckNewWorldGo": {
        const w = el.dataset.v; if (!WORLDS[w] || this.full("world")) return true;
        this.startEdit({ id: "w" + Date.now().toString(36), name: `${WORLDS[w]}の限定デッキ`, cards: {}, fmt: "world", world: w }, true);
        return true;
      }
      case "deckNewSample": if (this.full(true)) return true; this.startEdit({ id: "s" + Date.now().toString(36), name: "サンプルデッキ", cards: {}, free: true }, true); return true;
      case "deckPresets": this.showPresets(); return true;
      case "deckFromPreset": {
        const p = PRESETS.find(x => x.id === id); if (!p || this.full(true)) return true;
        this.startEdit({ id: "s" + Date.now().toString(36), name: p.name.slice(0, 16), cards: p.cards, free: true }, true);
        return true;
      }
      case "deckImport": this.showImport(); return true;
      case "deckImportGo": {
        const raw = $("#deck-code") ? $("#deck-code").value : "";
        const d = codeToDeck(raw);
        if (!d) {
          // 何が貼り付けられたかを見せる（原因を伝えやすくするため）
          const t = normCodeText(raw), at = t.search(/KYK[12]:/i);
          const seen = !raw.trim() ? "何も貼り付けられていません。"
            : at < 0 ? `「KYK2:」が見つかりません。貼り付けた文字の始め：「${t.slice(0, 24)}」（全${t.length}文字）`
            : `「${t.slice(at, at + 24)}…」（コードの部分 ${t.length - at}文字）を読みましたが、途中で切れているか、文字が変わっています。`;
          this.showImport("デッキコードを読み取れませんでした。" + seen + " 送ってもらったコードを、もう一度すべてコピーして貼り付けてください。");
          return true;
        }
        const asSample = !!($("#deck-code-sample") && $("#deck-code-sample").checked);
        if (this.full(asSample)) return true;
        // 今は使えないカード・持っていないカードは外して、何を外したかを知らせる
        const draftDeck = { free: asSample };
        // 持っていないカードもそのまま入れる（保存はできる。そろうまで対戦には使えない）
        const cards = {}, want = {};
        let gone = 0, wantN = 0;
        Object.entries(d.cards).forEach(([cid, n]) => {
          const c = DEF[cid];
          if (!c || c.limit <= 0) { gone += n; return; }
          const cap = Math.min(n, cardLimit(c, CONFIG, draftDeck));
          if (cap > 0) cards[cid] = cap;
          if (!asSample && !this.free()) wantN += Math.max(0, cap - this.owned(cid));
        });
        this.startEdit({ id: (asSample ? "s" : "d") + Date.now().toString(36), name: d.name, cards, want, free: asSample }, true);
        if (wantN) toast(`持っていないカードが${wantN}枚入っています。保存はできます。そろうと対戦に使えます`);
        if (gone) setTimeout(() => toast(`今は使えないカード${gone}枚は外しました`), 1900);
        return true;
      }
      case "deckCode": { this.codeFor = id; this.showView(id); return true; }
      case "deckCodeClose": { const v = this.codeFor; this.codeFor = null; if (v) this.showView(v); return true; }
      case "deckCodeCopy": {
        const d = this.find(this.codeFor); if (!d) return true;
        copyText(deckToCode(d)).then(ok => toast(ok ? "デッキコードをコピーしました" : "コピーできませんでした。上の文字を長押しして選んでください"));
        return true;
      }
      case "deckCodeShare": {
        const d = this.find(this.codeFor); if (!d || !navigator.share) return true;
        navigator.share({ text: `境界の召喚士のデッキ「${d.name}」\n${deckToCode(d)}` }).catch(() => {});
        return true;
      }
      case "deckWantAdd": {
        const c = DEF[id]; if (!ed || !c) return true;
        if (this.maxFor(c, ed) <= (ed.cards[id] || 0)) { this.detail = id; this.renderEdit(); return true; }   // まだ持っていない：詳細を見せる
        ed.cards[id] = (ed.cards[id] || 0) + 1;
        if (--ed.want[id] <= 0) delete ed.want[id];
        this.renderEdit();
        return true;
      }
      case "deckCopy": {
        const p = this.find(id); if (!p || this.full(this.kindOf(p))) return true;
        this.startEdit({ id: (p.free ? "s" : this.isWorld(p) ? "w" : "d") + Date.now().toString(36), name: (p.name + "（複製）").slice(0, 16), cards: p.cards, want: p.want, free: !!p.free, ...(this.isWorld(p) ? { fmt: "world", world: p.world } : {}) }, true);
        return true;
      }
      case "deckEdit": { const d = this.find(id); if (d) { this.viewing = null; this.startEdit(d, false); } return true; }
      case "deckDetail": this.snapIds(el); this.detail = id; Shop.tradeAsk = null; this.rerender(); return true;
      case "deckStep": this.detail = stepId(this.detailIds || [], this.detail, +el.dataset.v); Shop.tradeAsk = null; this.rerender(); return true;
      case "deckKey": {
        if (this.editing) { this.editing.key = id; this.rerender(); toast("代表カードにしました（保存すると一覧に反映されます）"); return true; }
        const list = this.mine(), d = list.find(x => x.id === this.viewing);
        if (!d) return true;
        d.key = id;
        if (!this.saveMine(list)) { toast("保存できませんでした（サーバーに接続できていません）"); return true; }
        this.rerender(); toast("代表カードにしました"); return true;
      }
      case "deckDetailClose": this.detail = null; Shop.tradeAsk = null; this.rerender(); return true;
      case "deckFilter": this.filter[el.dataset.k] = el.dataset.v; this.renderEdit(); return true;
      case "deckTab": this.editTab = el.dataset.v; this.renderEdit(); return true;
      case "deckTapAdd": this.inc(id, true); return true;
      case "deckTapDec": this.dec(id); return true;
      case "deckInc": this.inc(id, false); return true;
      case "deckDec": this.dec(id); return true;
      case "deckSave": {
        const nameEl = $("#deck-name");
        ed.name = (nameEl ? nameEl.value : ed.name).trim().slice(0, 16) || "デッキ";
        const pr = this.saveProblems(ed);
        if (pr.length) { toast(pr[0]); return true; }
        const list = this.mine().filter(d => d.id !== ed.id);
        const want = cleanDeckCards(ed.want);
        list.push({ id: ed.id, name: ed.name, cards: ed.cards, ...(ed.free ? { free: true } : {}), ...(this.isWorld(ed) ? { fmt: "world", world: ed.world } : {}), ...(ed.key ? { key: ed.key } : {}), ...(Object.keys(want).length ? { want } : {}) });
        if (!this.saveMine(list)) { this.editing = null; this.showList("保存できませんでした（サーバーに接続できていません）"); return true; }
        // 対戦に使えるデッキになったときだけ「使用中」にする（未完成のデッキは選ばない）
        if (!this.isWorld(ed) && (ed.isNew || !this.isValid(this.selected())) && !this.problems(this.mine().find(d => d.id === ed.id) || ed).length) this.select(ed.id);
        const saved = ed;
        this.editing = null; this.detail = null;
        this.showView(saved.id);
        const ms = this.missing(saved);
        toast(deckCount(saved) < CONFIG.DECK_SIZE ? `未完成のまま保存しました（あと${CONFIG.DECK_SIZE - deckCount(saved)}枚）`
          : ms ? `保存しました。持っていないカード${ms}枚がそろうと対戦に使えます` : "保存しました");
        return true;
      }
      case "deckCancel": { const back = ed && !ed.isNew ? ed.id : null; this.editing = null; this.detail = null; back ? this.showView(back) : this.showList(); return true; }
      case "deckDel": ed.confirmDel = true; this.renderEdit(); return true;
      case "deckDelNo": ed.confirmDel = false; this.renderEdit(); return true;
      case "deckDelYes": {
        this.saveMine(this.mine().filter(d => d.id !== ed.id));
        if (this.selectedId() === ed.id) this.select("");
        this.editing = null; this.showList("削除しました"); return true;
      }
    }
    return false;
  }
};

/* 名前・検索・所持のみの切り替え */
document.addEventListener("input", e => {
  if (e.target.id === "deck-name" && Decks.editing) Decks.editing.name = e.target.value;
  if (e.target.id === "deck-q" && Decks.editing) {
    Decks.filter.q = e.target.value;
    const pool = $("#deck-pool"); if (pool) pool.innerHTML = Decks.poolHTML();
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "deck-owned" && Decks.editing) { Decks.filter.owned = e.target.checked; Decks.renderEdit(); }
});

/* カードの長押しで詳細を開く（デッキ編成・パック開封の画面） */
(() => {
  let t = null, sx = 0, sy = 0, fired = false;
  const clear = () => { if (t) { clearTimeout(t); t = null; } };
  // 長押しで詳細を開いたあと、指を離したときの「タップ」で閉じたり1枚追加されたりしないようにする
  document.addEventListener("pointerup", () => { if (fired) { fired = false; blockClick(); } }, true);
  document.addEventListener("pointerdown", e => {
    const tile = e.target.closest("#overlay .dtile[data-id], #overlay .dstrip[data-id], #overlay .oslot.up[data-id]");
    if (!tile) return;
    sx = e.clientX; sy = e.clientY;
    clear();
    t = setTimeout(() => {
      t = null;
      fired = true;
      blockClick();
      const id = tile.dataset.id;
      if (tile.classList.contains("oslot")) Packs.showDetail(id);
      else { Decks.snapIds(tile); Decks.detail = id; Decks.rerender(); }
    }, 420);
  });
  document.addEventListener("pointermove", e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear(); });
  ["pointerup", "pointercancel", "scroll"].forEach(ev => document.addEventListener(ev, clear, true));
  document.addEventListener("contextmenu", e => { if (e.target.closest("#overlay .dtile, #overlay .oslot")) e.preventDefault(); });
})();

/* デッキ一覧：長押しで持ち上げて、指でずらして並び替える（離すと保存） */
(() => {
  let t = null, drag = null, sx = 0, sy = 0;
  const clear = () => { if (t) { clearTimeout(t); t = null; } };
  const place = (x, y) => {
    const el = drag.el, r = el.getBoundingClientRect();
    drag.tx += x - drag.ox - r.left; drag.ty += y - drag.oy - r.top;
    el.style.transform = `translate(${drag.tx}px,${drag.ty}px) scale(1.04)`;
  };
  document.addEventListener("pointerdown", e => {
    const el = e.target.closest("#dbgrid .dbt[data-deck]");
    if (!el || drag) return;
    sx = e.clientX; sy = e.clientY; clear();
    t = setTimeout(() => {
      t = null;
      const r = el.getBoundingClientRect();
      drag = { el, ox: sx - r.left, oy: sy - r.top, tx: 0, ty: 0, x: sx, y: sy, moved: false };
      el.classList.add("lift"); document.getElementById("dbgrid").classList.add("sorting");
      if (navigator.vibrate) navigator.vibrate(15);
      blockClick();
    }, 450);
  });
  document.addEventListener("pointermove", e => {
    if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear();
    if (!drag) return;
    drag.x = e.clientX; drag.y = e.clientY;
    const grid = document.getElementById("dbgrid"); if (!grid) return;
    // 指の下の札と入れ替える
    const over = [...grid.querySelectorAll(".dbt[data-deck]")].find(o => {
      if (o === drag.el) return false;
      const r = o.getBoundingClientRect();
      return e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
    });
    if (over) {
      const items = [...grid.querySelectorAll(".dbt[data-deck]")];
      grid.insertBefore(drag.el, items.indexOf(over) > items.indexOf(drag.el) ? over.nextSibling : over);
      drag.moved = true;
    }
    place(e.clientX, e.clientY);
    // 画面の上下の端に近づいたら、少しずつスクロールする
    const o = document.getElementById("overlay");
    if (e.clientY < 90) o.scrollTop -= 12; else if (e.clientY > innerHeight - 70) o.scrollTop += 12;
  });
  const end = () => {
    clear(); if (!drag) return;
    const { el, moved } = drag; drag = null;
    el.classList.remove("lift"); el.style.transform = "";
    const grid = document.getElementById("dbgrid"); if (grid) grid.classList.remove("sorting");
    blockClick();
    if (moved && grid) { Decks.saveOrder([...grid.querySelectorAll(".dbt[data-deck]")].map(x => x.dataset.deck)); Sound.play("click"); }
  };
  document.addEventListener("pointerup", end, true);
  document.addEventListener("pointercancel", end, true);
  // 持ち上げている間は、画面がスクロールしないようにする（iPhone）
  document.addEventListener("touchmove", e => { if (drag) e.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", e => { if (e.target.closest("#dbgrid .dbt")) e.preventDefault(); });
})();
