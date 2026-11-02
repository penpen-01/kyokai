/* =========================================================
   カード工房：AIに頼む道具
   ・カードの案：「こういうカード」と書くと、ゲームのルール・使える効果・今のカードを全部入れた依頼文を作る。
     それを Claude や Gemini に貼り、返ってきた答え（JSON）を貼ると、下書きのカードができる。
     工房から直接AIを呼ばないので、APIキーも料金もいらない
   ・イラストの依頼文：カードの「絵の指定」（artNote）から、Gemini に貼る依頼文を作る
     （画風のルールは docs/art-list.html と同じ）。絵のないカードはまとめてコピーできる
   editor.js の DATA / changed / select / openModal / closeModal / newId を使う
   ========================================================= */

const ART_RULES = `【共通ルール】
・縦長、縦横比 5:7（3:4 ではなく 5:7）
・画面の下から約3割は、名前と数字を重ねるので、足元・地面・背景だけにする（顔・大事な物を置かない）
・左上と右上の角には、数字やマークを重ねるので、大事なものを置かない
・人物はひざ上〜胸から上のアップ。大きな怪物・機械は全身でもよいが、顔（頭部）は画面の上半分に
・魔法カードは人物の立ち絵ではなく、その魔法が発動している瞬間の場面を描く
・デジタルイラスト、輪郭線あり、セル塗りと厚塗りの中間。やや暗めの画面にドラマチックな光
・レア度が高いカードほど、迫力・描き込み・エフェクトを強くする（各カードの「演出」の指定に従う）
　コモン＜レア＜SR＜UR＜レジェンド の順に豪華に
・添付した画像は「画風（線の太さ・塗り方・色調）」の見本としてだけ使う。添付画像の人物・顔・髪型・服装・ポーズ・構図・背景は絶対にまねしない。毎回まったく別のキャラクターとして描く
・前に描いたカードとも、顔立ち・髪型・体の向き・ポーズ・カメラの角度を必ず変える
・背景は毎回まったく別の場所にする（例：草原、湖、洞窟、山、夜の村、花畑、雪原、遺跡など）。前の絵と同じ背景や、上から枝がかぶさる同じ額縁の構図は使わない（カードの説明で場所が指定されているときはそれに従う）
・文字、ロゴ、サイン、数字、枠、カードのデザインは一切入れない（イラストだけ）
・実在の作品やキャラクターに似せない`;
const ART_WORLD = {
  myth: "古代ギリシャ・北欧風の神々と英雄。色は金色・琥珀・白い大理石。荘厳な光",
  fan: "剣と魔法の森の世界。色は深い緑・若葉色、差し色に金色の木漏れ日",
  mech: "SFの機械と兵器の世界。機体の色・形・発光の色はカードごとの指定に従う（全部を青とシアンにしない）。人型ロボットばかりにせず、シルエットをはっきり変える"
};
const ART_GRADE = {
  common: "落ち着いた構図。背景はシンプルでよい。光や効果は控えめ",
  rare: "動きのあるポーズ。背景もしっかり描き込む。光の効果を少し",
  sr: "大胆な構図とあおりの角度。光・炎・魔力などのエフェクトをはっきり。背景も壮大に",
  ur: "画面全体を使うドラマチックな構図。強いエフェクトと逆光、細部まで描き込んだ豪華な装飾",
  legend: "最高の迫力。画面からはみ出すほどのスケール感、神々しい光、圧倒的な存在感。一枚絵の大作として描き込む"
};

const AiTools = {
  idea: { text: "", world: "", type: "", rarity: "", cost: "", n: "1" },
  lastImport: null,

  /* ---------- イラストの依頼文 ---------- */
  artNote(c) { return (c.artNote || (typeof ART_NOTES !== "undefined" && ART_NOTES[c.id]) || "").trim(); },
  artLine(c, i) {
    const note = this.artNote(c) || `（絵の指定なし。名前と効果「${cardText(c) || "なし"}」から、このカードらしい絵を考えて描く）`;
    return `${i}. ${c.name}（${WORLDS[c.world]}・${c.type === "spell" ? "魔法" : "キャラクター"}・${RARITY[c.rarity]}）：${note}\n　演出（${RARITY[c.rarity]}）：${ART_GRADE[c.rarity]}`;
  },
  artPrompt(cards) {
    const worlds = [...new Set(cards.map(c => c.world))];
    const many = cards.length > 1;
    return `${many ? "以下のカードゲーム用イラストを、1枚ずつ順番に描いてください。1枚描いたらそこで止まり、私が「次」と言ったら次の1枚を描いてください。" : "カードゲーム用のイラストを1枚描いてください。"}

${ART_RULES}

【この世界の色と雰囲気】
${worlds.map(w => `${WORLDS[w]}：${ART_WORLD[w]}`).join("\n")}

【描いてほしいカード】
${cards.map((c, i) => this.artLine(c, i + 1)).join("\n")}`;
  },
  missingArt() { return DATA.cards.filter(c => c.limit > 0 && !c.art); },

  /* ---------- カードの案の依頼文 ---------- */
  ideaPrompt() {
    const o = this.idea, cfg = DATA.config;
    const want = [
      o.world ? `世界：${WORLDS[o.world]}` : "",
      o.type ? `種類：${TYPES[o.type]}` : "",
      o.rarity ? `レア度：${RARITY[o.rarity]}` : "",
      o.cost !== "" ? `コスト：${o.cost}` : ""
    ].filter(Boolean);
    const effList = Object.entries(EFFECTS).map(([k, e]) =>
      `- ${k}：${e.label}（例：${e.text(2)}）${e.noN === true ? "　※ n は使わない（1にしておく）" : ""}${e.opts ? `　※ 追加の設定：${e.opts.map(o => ({ token: "card（トークンのカードの id）", kw: "kw（与える能力。armor なら n が装甲の値）", world: "world（myth/fan/mech。なければすべて）", ctype: "ctype（char/spell。なければすべて）" }[o])).join("、")}` : ""}${e.min === 0 ? "　※ n は0も可" : ""}${e.target ? "　※ 使うときに対象を選ぶ" : ""}`).join("\n");
    const whenList = Object.entries(WHENS).map(([k, v]) => `- ${k}：${v.label}`).join("\n");
    const kwList = Object.entries(KEYWORDS).map(([k, v]) => `- ${k}：${v.label}。${v.text}`).join("\n");
    const payList = Object.entries(PAYS).map(([k, v]) => `- ${k}：${v.label}`).join("\n");
    const cardLine = c => `${c.name}｜${WORLDS[c.world]}｜${TYPES[c.type]}｜${RARITY[c.rarity]}｜コスト${c.cost}${c.type === "char" ? `｜${c.atk}/${c.hp}` : ""}｜${cardText(c) || "能力なし"}`;
    // キャラの「コストごとの攻撃力＋体力」の平均（強さの目安）
    const curve = {};
    DATA.cards.filter(c => c.type === "char" && c.limit > 0).forEach(c => { (curve[c.cost] = curve[c.cost] || []).push(c.atk + c.hp); });
    const curveText = Object.keys(curve).sort((a, b) => a - b).map(k => `コスト${k}：平均${(curve[k].reduce((a, b) => a + b, 0) / curve[k].length).toFixed(1)}`).join("、");
    return `あなたはカードゲーム「境界の召喚士」のカードデザイナーです。下のルールと今のカードを読んで、新しいカードの案を${o.n || 1}枚作ってください。

【作ってほしいカード】
${o.text.trim() || "（おまかせ）"}
${want.length ? want.join("／") : ""}

【ゲームのルール】
・1対1。デッキ${cfg.DECK_SIZE}枚（同じカードは${cfg.COPY_MAX}枚まで）。プレイヤーの体力${cfg.PLAYER_HP}。相手の体力を0にすれば勝ち
・毎ターン、エナジーの最大値が1増えて全回復する（上限${cfg.ENERGY_MAX}）。カードはコストぶんのエナジーを払って出す
・キャラは場に${cfg.FIELD_MAX}体まで。出したターンは攻撃できない（速攻を除く）。攻撃すると、お互いの攻撃力ぶんのダメージを与え合う
・相手の場に守護がいなければ、相手プレイヤーを直接攻撃できる
・キャラの効果は、効果ごとに発動するタイミング（when）を選べる。書かなければ「登場時（場に出たとき1回）」。魔法は使ったときに発動する（when は書かない）
・登場時以外のタイミングで「対象を選ぶ」効果は、対象がランダムになる
・世界は3つ：神話（金色・神々と英雄）、幻想（緑・剣と魔法の森）、機械（青・SFの機械と兵器）
・レア度は5つ：コモン、レア、SR、UR、レジェンド

【使える能力（キャラだけ）】
${kwList}
- armor：装甲N。受けるダメージをN減らす（0〜9）

【使える代償（コストのほかに払うもの。なくてよい）】
${payList}

【使える効果（この中からだけ選ぶ。1枚に1〜3個）】
${effList}

【キャラの効果のタイミング（when。キャラだけ）】
${whenList}

【効果の条件（なくてよい。効果ごとに "cond" と数値 "cn" を書く。worldGE は "cworld" も）】
${Object.entries(CONDS).map(([k, v]) => `- ${k}：${v.label}`).join("\n")}

【強さの目安】
・キャラの「攻撃力＋体力」の平均：${curveText}
・効果や能力があるカードは、そのぶん攻撃力＋体力を下げる。レア度が高いほど、少し強くてよい
・今のカードとそっくり同じ働きのカードは作らない

【今のカード（名前｜世界｜種類｜レア度｜コスト｜攻撃/体力｜効果）】
${DATA.cards.filter(c => c.limit > 0).map(cardLine).join("\n")}

【守ってほしいこと】
・名前は日本語で14文字以内。今のカードと同じ名前にしない。実在の作品やキャラクターの名前・設定に似せない
・上の一覧にない効果や能力は使わない。頼まれたカードが今ある効果だけで作れないときは、近いもので作り、"note" に「本当は〇〇という効果が欲しい」と書く
・"artNote" には、Gemini にイラストを頼むための絵の指定を書く。人物なら性別・年齢・髪型・髪の色・服装・ポーズ・場所まで具体的に。今のカードの人物と似ないように。魔法なら、その魔法が発動している瞬間の場面

【答え方】
説明は書かず、次の形の JSON だけを返してください。
{"cards":[{"name":"名前","world":"myth か fan か mech","type":"char か spell","rarity":"common か rare か sr か ur か legend","cost":3,"atk":2,"hp":3,"keywords":["guard"],"armor":0,"pay":null,"effects":[{"kind":"draw","n":1},{"kind":"dmgRandom","n":2,"when":"death"}],"artNote":"絵の指定","note":"このカードの狙い（短く）"}]}
・魔法（spell）のときは atk・hp・keywords・armor を書かない
・代償があるときは "pay":{"kind":"life","n":2} のように書く`;
  },

  /* AIの答え（JSON）からカードを作る */
  importIdeas(text) {
    const t = String(text || "");
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) return { ok: false, msg: "答えの中に JSON（{ から } まで）が見つかりませんでした。AIの答えを全部貼り付けてください。" };
    let obj;
    try { obj = JSON.parse(t.slice(a, b + 1)); }
    catch { return { ok: false, msg: "JSON として読めませんでした。AIに「JSONだけで答え直して」と頼んでください。" }; }
    const list = Array.isArray(obj) ? obj : Array.isArray(obj.cards) ? obj.cards : [obj];
    const made = [], warn = [];
    list.forEach(x => {
      if (!x || typeof x !== "object") return;
      const effs = Array.isArray(x.effects) ? x.effects : [];
      const badEff = effs.filter(e => !e || !EFFECTS[e.kind]).map(e => e && e.kind);
      const badKw = (Array.isArray(x.keywords) ? x.keywords : []).filter(k => !KEYWORDS[k]);
      let name = String(x.name || "新しいカード").slice(0, 14);
      if (DATA.cards.some(c => c.name === name)) { warn.push(`「${name}」は同じ名前があるので「（案）」を付けました`); name = (name + "（案）").slice(0, 14); }
      const card = normalizeData({ cards: [{
        id: newId(), name, world: x.world, type: x.type, rarity: x.rarity,
        cost: Math.max(0, Math.min(15, Math.round(+x.cost || 0))),
        atk: x.atk, hp: x.hp, keywords: x.keywords, armor: x.armor, pay: x.pay,
        effects: effs.filter(e => e && EFFECTS[e.kind]).slice(0, 4),
        glyph: name.replace(/[（(].*$/, "").slice(0, 1) || "新", limit: 3,
        artNote: x.artNote ? String(x.artNote) : ""
      }] }).cards[0];
      // AIが書いた「狙い」はカード（フレーバーテキスト）には入れず、取り込みの画面で見せるだけ
      card._aim = x.note ? String(x.note).slice(0, 80) : "";
      if (badEff.length) warn.push(`「${card.name}」：ゲームにない効果（${badEff.join("、")}）は外しました`);
      if (badKw.length) warn.push(`「${card.name}」：ゲームにない能力（${badKw.join("、")}）は外しました`);
      const aim = card._aim; delete card._aim;
      DATA.cards.push(card); made.push({ card, aim });
    });
    if (!made.length) return { ok: false, msg: "カードが1枚も見つかりませんでした。" };
    return { ok: true, made: made.map(m => m.card), aims: Object.fromEntries(made.map(m => [m.card.id, m.aim])), warn };
  },

  /* ---------- 画面 ---------- */
  showIdea(msg) {
    const o = this.idea;
    const opt = (k, map, label) => `<label class="small">${label}<select class="txt" data-ai="${k}" style="width:auto"><option value="">おまかせ</option>${Object.entries(map).map(([v, l]) => `<option value="${v}" ${o[k] === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
    openModal(`<div class="dialog wide ai-box" role="dialog" aria-label="AIでカードの案">
      <h3>AIでカードの案を作る</h3>
      <p class="hint">① どんなカードが欲しいか書く → ② 依頼文をコピーして Claude か Gemini に貼る → ③ 返ってきた答えを下に貼って「取り込む」。下書きのカードができます（公開するまでゲームには出ません）。</p>
      <label for="ai-text" class="small">どんなカード？</label>
      <textarea class="txt" id="ai-text" data-ai="text" rows="3" placeholder="例：機械の世界の、守護を持つ盾役。倒されにくいが攻撃は弱い">${esc(o.text)}</textarea>
      <div class="frow">
        ${opt("world", WORLDS, "世界")}
        ${opt("type", TYPES, "種類")}
        ${opt("rarity", RARITY, "レア度")}
        ${opt("cost", Object.fromEntries([...Array(11).keys()].map(i => [String(i), String(i)])), "コスト")}
        <label class="small">作る案の数<select class="txt" data-ai="n" style="width:auto">${[1, 2, 3, 5].map(n => `<option value="${n}" ${o.n === String(n) ? "selected" : ""}>${n}種類</option>`).join("")}</select></label>
      </div>
      <div class="frow"><button type="button" class="btn primary" data-act="aiCopyIdea">② 依頼文をコピー</button><span class="hint small">ルール・使える効果・今のカード${DATA.cards.filter(c => c.limit > 0).length}枚の一覧が入ります</span></div>
      <label for="ai-answer" class="small">③ AIの答えを貼る</label>
      <textarea class="txt" id="ai-answer" rows="5" placeholder='{"cards":[{"name":"...'></textarea>
      ${msg ? `<p class="warn">${esc(msg)}</p>` : ""}
      <div class="frow"><button type="button" class="btn primary" data-act="aiImport">取り込む</button><button type="button" class="btn" data-act="aiClose">閉じる</button></div>
    </div>`);
  },
  showImported(r) {
    openModal(`<div class="dialog wide ai-box" role="dialog" aria-label="取り込みました">
      <h3>${r.made.length}枚の下書きを作りました</h3>
      <div class="ai-made">${r.made.map(c => `<button type="button" class="ai-card" data-act="aiOpen" data-id="${esc(c.id)}">${cardHTML(c, { static: true })}<span><b>${esc(c.name)}</b><small>${esc(cardText(c) || "能力なし")}</small>${r.aims[c.id] ? `<small class="hint">狙い：${esc(r.aims[c.id])}</small>` : ""}</span></button>`).join("")}</div>
      ${r.warn.length ? `<ul class="warn small">${r.warn.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
      <p class="hint">カードを押すと開きます。数値は自由に直してください。イラストは、カードの「イラスト」欄の「イラストの依頼文をコピー」から Gemini に頼めます。</p>
      <div class="frow"><button type="button" class="btn primary" data-act="aiArtNew">この${r.made.length}枚のイラスト依頼文をコピー</button><button type="button" class="btn" data-act="aiClose">閉じる</button></div>
    </div>`);
  },

  copy(text, label) {
    copyText(text).then(ok => toastEd(ok ? `${label}をコピーしました` : "コピーできませんでした"));
  },

  act(name, el) {
    switch (name) {
      case "aiIdea": this.showIdea(); return true;
      case "aiClose": closeModal(); return true;
      case "aiCopyIdea": this.copy(this.ideaPrompt(), "依頼文"); return true;
      case "aiImport": {
        const r = this.importIdeas($("#ai-answer") ? $("#ai-answer").value : "");
        if (!r.ok) { this.showIdea(r.msg); return true; }
        this.lastImport = r.made.map(c => c.id);
        changed(); select(r.made[0].id);
        this.showImported(r);
        return true;
      }
      case "aiOpen": closeModal(); select(el.dataset.id); return true;
      case "aiArtNew": {
        const cards = (this.lastImport || []).map(id => DATA.cards.find(c => c.id === id)).filter(Boolean);
        if (cards.length) this.copy(this.artPrompt(cards), "イラストの依頼文");
        return true;
      }
      case "aiArtOne": { const c = curCard(); if (c) this.copy(this.artPrompt([c]), "イラストの依頼文"); return true; }
      case "aiArtMissing": {
        const list = this.missingArt();
        if (!list.length) { toastEd("イラストのないカードはありません"); return true; }
        this.copy(this.artPrompt(list), `イラストのない${list.length}枚の依頼文`);
        return true;
      }
    }
    return false;
  },
  input(t) {
    const k = t.dataset.ai; if (!k) return false;
    this.idea[k] = t.value;
    return true;
  }
};

/* 工房用の小さな通知 */
function toastEd(msg) {
  let t = document.getElementById("edToast");
  if (!t) { t = document.createElement("div"); t.id = "edToast"; t.className = "edtoast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastEd.tm); toastEd.tm = setTimeout(() => t.classList.remove("show"), 1800);
}
