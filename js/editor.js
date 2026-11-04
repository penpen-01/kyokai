/* =========================================================
   境界の召喚士 — カード工房（オーナー用の編集ページ）
   編集内容はこのブラウザに自動保存し、「書き出す」で game-data.json を作る。
   公開中のゲームには、書き出したファイルをサイトに置くまで反映されない。
   ========================================================= */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let DATA = null;          // 編集中のデータ
let curId = null;         // 選択中のカード
let filter = "all";
let saveState = "ok";     // ok | err
let exportedSnap = "";    // 最後に書き出した（または公開版の）内容
let confirmDelete = false;
let saveTimer = null;
let notice = "";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const snap = () => JSON.stringify({ config: DATA.config, cards: DATA.cards, packs: DATA.packs, decks: DATA.decks, serials: DATA.serials, news: DATA.news, mail: DATA.mail, login: DATA.login });
const curCard = () => DATA.cards.find(c => c.id === curId) || null;
const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const fmtBytes = n => n > 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB";

/* ---------- 読み込み・保存 ---------- */
async function boot() {
  let published = null;
  try { published = normalizeData(await fetchPublished()); } catch { /* オフライン等 */ }
  let draft = readDraft();
  // サイトのデータのほうが新しい場合は、そちらを読み込む（古い編集内容は控えに残して「その他」から戻せる）
  if (draft && published && (+draft.version || 0) < published.version) {
    try { localStorage.setItem(DRAFT_KEY + "-backup", JSON.stringify(draft)); localStorage.removeItem(DRAFT_KEY); } catch {}
    draft = null;
    notice = "サイトのカードデータが新しくなっていたため、そちらを読み込みました。前の編集内容は「その他」→「以前の編集内容に戻す」で戻せます。";
  }
  if (draft) {
    DATA = normalizeData(draft);
    if (!DATA.decks.length && published) DATA.decks = published.decks;
    if (!DATA.packs.length && published) DATA.packs = published.packs;
    if (!DATA.serials.length && published) DATA.serials = published.serials;
    if (!DATA.news.length && published) DATA.news = published.news;
    if (!DATA.mail.length && published) DATA.mail = published.mail;
    exportedSnap = draft._exportedSnap || (published ? JSON.stringify({ config: published.config, cards: published.cards }) : "");
  } else if (published) {
    DATA = published;
    exportedSnap = snap();
  } else {
    DATA = normalizeData({ config: DEFAULT_CONFIG, cards: [] });
  }
  curId = DATA.cards[0] ? DATA.cards[0].id : null;
  renderAll();
}

function saveDraft() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...DATA, _exportedSnap: exportedSnap }));
      saveState = "ok";
    } catch {
      saveState = "err";
    }
    renderStatus();
  }, 250);
  renderStatus();
}

function changed() {
  saveDraft();
  renderSummary();
  renderList();
  renderPreview();
}

/* ---------- 描画 ---------- */
function renderAll() {
  renderStatus();
  renderSummary();
  renderList();
  renderEditor();
  renderRules();
  renderPacks();
  renderEco();
}

function renderStatus() {
  const size = new Blob([JSON.stringify(DATA)]).size;
  const dirty = snap() !== exportedSnap;
  $("#status").innerHTML = `
    ${saveState === "err"
      ? `<span class="dot err">ブラウザに自動保存できませんでした。早めに書き出してください</span>`
      : `<span class="dot ${dirty ? "dirty" : ""}">${dirty ? "未公開の変更あり（このブラウザには自動保存済み）" : "公開中の内容と同じです"}</span>`}
    ${Publish.ready() ? "" : `<button type="button" class="linkbtn" data-act="pubSettings">公開設定がまだです</button>`}
    <span>データ ${fmtBytes(size)}</span>
    ${notice ? `<span class="dot dirty">${esc(notice)}</span>` : ""}`;
}

function poolStats() {
  const usable = DATA.cards.filter(c => c.limit > 0);
  const kinds = f => usable.filter(f).length;
  const curve = Array(9).fill(0);
  usable.forEach(c => { curve[Math.min(8, Math.max(0, c.cost))]++; });
  return {
    kinds: usable.length, all: DATA.cards.filter(c => !c.token).length, tokens: DATA.cards.filter(c => c.token).length,
    chars: kinds(c => c.type === "char"), spells: kinds(c => c.type === "spell"),
    myth: kinds(c => c.world === "myth"), fan: kinds(c => c.world === "fan"), mech: kinds(c => c.world === "mech"),
    rar: Object.fromEntries(Object.keys(RARITY).map(r => [r, kinds(c => (c.rarity || "common") === r)])),
    curve
  };
}

function renderSummary() {
  const s = poolStats();
  const max = Math.max(1, ...s.curve);
  $("#summary").innerHTML = `
    <div class="sum-row">
      <span class="big">使えるカード <b>${s.kinds}</b>種</span>
      <span>キャラ <b>${s.chars}</b> ・ 魔法 <b>${s.spells}</b>${s.all > s.kinds ? ` ・ 使用不可 <b>${s.all - s.kinds}</b>` : ""}${s.tokens ? ` ・ トークン <b>${s.tokens}</b>` : ""}</span>
    </div>
    <div class="sum-row">
      <span style="color:var(--w-myth)">神話 <b>${s.myth}</b></span>
      <span style="color:var(--w-fan)">幻想 <b>${s.fan}</b></span>
      <span style="color:var(--w-mech)">機械 <b>${s.mech}</b></span>
      <span>${Object.keys(RARITY).map(r => `${RARITY_SHORT[r]} <b>${s.rar[r]}</b>`).join(" ・ ")}</span>
    </div>
    <div>
      <div class="curve" aria-label="コスト別の種類数">
        ${s.curve.map(n => `<div class="bar"><span class="n">${n || ""}</span><span class="fill" style="height:${(n / max) * 52}px"></span></div>`).join("")}
      </div>
      <div class="curve" style="height:auto">${s.curve.map((_, i) => `<div class="bar">${i === 8 ? "8+" : i}</div>`).join("")}</div>
      <div class="curve-cap"><span>コスト別の種類数</span><span>デッキ${DATA.config.DECK_SIZE}枚・同名${DATA.config.COPY_MAX}枚まで</span></div>
    </div>`;
}

function renderList() {
  const list = DATA.cards
    .filter(c => filter === "all" || (filter === "token" ? c.token : c.type === filter && !c.token))
    .slice().sort((a, b) => a.cost - b.cost || (a.type > b.type ? 1 : a.type < b.type ? -1 : 0) || a.name.localeCompare(b.name, "ja"));
  $("#list").innerHTML = list.length ? list.map(c => `
    <li class="row ${c.id === curId ? "cur" : ""} ${c.limit ? "" : "out"} w-${c.world}" data-pick="${esc(c.id)}">
      ${cardHTML(c, { static: true })}
      <div class="row-main">
        <span class="row-name">${esc(c.name)}</span>
        <span class="row-meta">コスト${c.cost} ・ <span class="w">${WORLDS[c.world]}</span> ・ ${c.type === "char" ? `${c.atk}/${c.hp}` : "魔法"}${c.token ? " ・ トークン" : c.limit ? "" : " ・ 使用不可"}</span>
      </div>
      <div class="stepper limit" aria-label="${esc(c.name)}の投入上限">
        <button type="button" data-limit="-1" data-id="${esc(c.id)}" aria-label="上限を1減らす">−</button>
        <input type="text" inputmode="numeric" value="${c.limit}" data-limit-in="${esc(c.id)}" id="cp-${esc(c.id)}" aria-label="投入上限">
        <button type="button" data-limit="1" data-id="${esc(c.id)}" aria-label="上限を1増やす">＋</button>
      </div>
    </li>`).join("") : `<li class="hint" style="padding:12px">カードがありません。「新しいカード」から作れます。</li>`;
}

function stepper(name, value, label) {
  return `<div class="stepper" aria-label="${label}">
    <button type="button" data-step="${name}" data-d="-1" aria-label="${label}を1減らす">−</button>
    <input type="text" inputmode="numeric" value="${value}" data-num="${name}" id="f-${name}" aria-label="${label}">
    <button type="button" data-step="${name}" data-d="1" aria-label="${label}を1増やす">＋</button>
  </div>`;
}

function renderPreview() {
  const c = curCard();
  const p = $("#edPreview");
  if (!c || !p) return;
  p.innerHTML = `
    ${cardHTML(c, { static: true })}
    <div class="ed-text"><span class="lbl">カードの説明（自動で作られます）</span>${esc(cardText(c))}</div>
    <div class="ed-id">ID：${esc(c.id)}</div>`;
  const h = $("#edName");
  if (h) h.textContent = c.name;
  const t = $("#artThumb");
  if (t) { t.style.backgroundImage = c.art ? `url("${c.art}")` : ""; t.textContent = c.art ? "" : "なし"; }
}

function renderEditor() {
  const c = curCard();
  const el = $("#editor");
  if (!c) { el.innerHTML = `<div class="empty-ed">左の一覧からカードを選ぶか、「新しいカード」を作ってください。</div>`; return; }
  const isChar = c.type === "char";
  el.innerHTML = `
    <div class="ed">
      <div class="ed-preview" id="edPreview"></div>
      <div class="ed-form">
        <div class="ed-head">
          <h2 id="edName">${esc(c.name)}</h2>
          <div class="acts">
            <button type="button" class="btn sm" data-act="dup">複製</button>
            <button type="button" class="btn sm danger" data-act="del">削除</button>
          </div>
        </div>
        ${confirmDelete ? `<div class="confirm"><span style="flex:1">「${esc(c.name)}」を削除します。元に戻せません。</span>
          <button type="button" class="btn sm danger" data-act="delYes">削除する</button>
          <button type="button" class="btn sm" data-act="delNo">やめる</button></div>` : ""}

        <div class="fgroup">
          <span class="gl">基本</span>
          <div class="field grow">
            <label for="f-name">名前</label>
            <input class="txt" id="f-name" data-text="name" value="${esc(c.name)}" maxlength="14" autocomplete="off">
          </div>
          <div class="frow">
            <div class="field grow">
              <span class="lab">種類</span>
              <div class="seg wide" role="group" aria-label="種類">
                ${Object.entries(TYPES).map(([k, v]) => `<button type="button" data-type="${k}" aria-pressed="${c.type === k}">${v}</button>`).join("")}
              </div>
            </div>
            <div class="field grow">
              <span class="lab">世界</span>
              <div class="seg wide" role="group" aria-label="世界">
                ${Object.entries(WORLDS).map(([k, v]) => `<button type="button" class="w-${k}" data-world="${k}" aria-pressed="${c.world === k}">${v}</button>`).join("")}
              </div>
            </div>
          </div>
          <div class="frow">
            <div class="field"><span class="lab">コスト</span>${stepper("cost", c.cost, "コスト")}</div>
            ${isChar ? `<div class="field"><span class="lab">攻撃力</span>${stepper("atk", c.atk, "攻撃力")}</div>
            <div class="field"><span class="lab">体力</span>${stepper("hp", c.hp, "体力")}</div>` : ""}
            <div class="field"><span class="lab">1デッキの投入上限</span><div class="limit">${stepper("limit", c.limit, "投入上限")}</div></div>
          </div>
          <label class="check"><input type="checkbox" data-token ${c.token ? "checked" : ""}><span><b>トークン</b><span>効果で出すだけのカード。デッキに入らず、パックからも出ません（投入上限は0になります）。</span></span></label>
          ${c.token ? "" : `<label class="check"><input type="checkbox" data-boss ${c.boss ? "checked" : ""}><span><b>ボス限定</b><span>パックやショップの交換では手に入らず、隠しボスを倒したときだけ手に入ります（パックの封入カードからは外してください）。</span></span></label>`}
          <p class="hint">投入上限は、1つのデッキに何枚まで入れられるか。ルール設定の「同じカードを入れられる上限」（今は${DATA.config.COPY_MAX}枚）より大きくしても、そちらが優先されます。0にすると、データには残りますがデッキに入れられなくなります。</p>
          <div class="field grow">
            <span class="lab">レア度</span>
            <div class="seg wide" role="group" aria-label="レア度">
              ${Object.entries(RARITY).map(([k, v]) => `<button type="button" data-rarity="${k}" aria-pressed="${c.rarity === k}">${v}</button>`).join("")}
            </div>
          </div>
        </div>

        ${isChar ? `<div class="fgroup">
          <span class="gl">能力</span>
          <div class="checks">
            ${Object.entries(KEYWORDS).map(([k, v]) => `<label class="check"><input type="checkbox" data-kw="${k}" ${c.keywords.includes(k) ? "checked" : ""}><span><b>${v.label}</b><span>${v.text}</span></span></label>`).join("")}
          </div>
          <div class="frow">
            <div class="field"><span class="lab">装甲（受けるダメージを減らす。0でなし）</span>${stepper("armor", c.armor || 0, "装甲")}</div>
          </div>
        </div>` : ""}

        <div class="fgroup">
          <span class="gl">代償</span>
          <p class="hint">カードを使うときに支払う追加のコストです。コストの割に強い効果をつけるときに使います。</p>
          <div class="frow">
            <div class="seg wide" role="group" aria-label="代償の種類" style="flex:1;min-width:240px">
              <button type="button" data-pay="" aria-pressed="${!c.pay}">なし</button>
              ${Object.entries(PAYS).map(([k, v]) => `<button type="button" data-pay="${k}" aria-pressed="${!!c.pay && c.pay.kind === k}">${v.label}</button>`).join("")}
            </div>
            ${c.pay && c.pay.kind === "life" ? `<div class="field"><span class="lab">払う体力</span>${stepper("pay", c.pay.n, "払う体力")}</div>` : ""}
          </div>
        </div>

        <div class="fgroup">
          <span class="gl">効果</span>
          <p class="hint">${isChar ? "キャラの効果は、効果ごとに発動するタイミングを選べます（ふつうは登場時）。登場時以外で対象を選ぶ効果は、対象がランダムになります。" : "魔法の効果は、使ったときに発動します。"}上から順に発動します。</p>
          <div class="effects">
            ${c.effects.map((e, i) => { const def = EFFECTS[e.kind]; return `<div class="eff">
              ${isChar ? `<select class="eff-when" data-eff-when="${i}" aria-label="効果${i + 1}のタイミング" id="ef-w-${i}">
                ${Object.entries(WHENS).map(([k, v]) => `<option value="${k}" ${whenOf(e) === k ? "selected" : ""}>${v.label}</option>`).join("")}
              </select>` : ""}
              <select data-eff-kind="${i}" aria-label="効果${i + 1}の種類" id="ef-k-${i}">
                ${[...new Set(Object.values(EFFECTS).filter(v => !v.legacy && (isChar || !v.self)).map(v => v.group))].map(g => `<optgroup label="${g}">${Object.entries(EFFECTS).filter(([, v]) => !v.legacy && v.group === g && (isChar || !v.self)).map(([k, v]) => `<option value="${k}" ${e.kind === k ? "selected" : ""}>${v.label}</option>`).join("")}</optgroup>`).join("")}
              </select>
              ${effNoN(def, e) ? "" : stepper("eff-" + i, e.n, `効果${i + 1}の数値`)}
              <button type="button" class="iconbtn" data-eff-del="${i}" aria-label="効果${i + 1}を削除">✕</button>
              ${effOptsHTML(e, i)}
              ${effCondHTML(e, i)}
            </div>`; }).join("")}
          </div>
          ${targetWarn(c)}
          <div><button type="button" class="btn sm" data-act="addEff">＋ 効果を追加</button></div>
          <div class="field">
            <label for="f-note">補足テキスト（任意・ゲームの処理には影響しません）</label>
            <textarea class="txt" id="f-note" data-text="note" maxlength="80" placeholder="例：フレーバーテキストなど">${esc(c.note)}</textarea>
          </div>
        </div>

        <div class="fgroup">
          <span class="gl">イラスト</span>
          <div class="artbox">
            <div class="artthumb" id="artThumb"></div>
            <div class="field" style="flex:1;min-width:200px">
              <p class="hint">縦横比 5:7 に切り抜いて、カード全面に表示します。下の約3分の1には名前と数値が重なります。</p>
              <div class="acts">
                <button type="button" class="btn sm primary" data-act="pickArt">${c.art ? "差し替える" : "画像を選ぶ"}</button>
                ${c.art ? `<button type="button" class="btn sm" data-act="clearArt">外す</button>` : ""}
              </div>
            </div>
            <div class="field" style="flex-basis:100%">
              <label for="f-artnote">絵の指定（Gemini への依頼文に入る）</label>
              <textarea class="txt" id="f-artnote" data-text="artNote" rows="3" placeholder="例：銀髪の青年の騎士。青い鎧に白いマント、雪の城壁の上で剣を構える">${esc(AiTools.artNote(c))}</textarea>
              <div class="acts"><button type="button" class="btn sm" data-act="aiArtOne">イラストの依頼文をコピー</button></div>
            </div>
            <div class="field">
              <label for="f-glyph">イラストがないときの文字</label>
              <input class="txt glyph-in" id="f-glyph" data-text="glyph" value="${esc(c.glyph)}" maxlength="2" autocomplete="off">
            </div>
          </div>
        </div>
      </div>
    </div>`;
  renderPreview();
}

function renderRules() {
  const cfg = DATA.config;
  $("#tab-rules").innerHTML = `
    <h2>ルール設定</h2>
    <p class="hint">対戦の基本となる数値です。変更は「この内容で試遊」ですぐ試せます。</p>
    <div class="cfg">
      ${Object.entries(CONFIG_INFO).filter(([, v]) => !v.group).map(([k, v]) => `<div class="item">
        <label for="f-cfg-${k}">${v.label}<small>初期値 ${DEFAULT_CONFIG[k]} ・ ${v.min}〜${v.max}</small></label>
        ${stepper("cfg-" + k, cfg[k], v.label)}
      </div>`).join("")}
    </div>
    <div><button type="button" class="btn sm" data-act="cfgReset">すべて初期値に戻す</button></div>`;
}

/* 効果の追加の設定（トークン・与える能力・世界・カードの種類） */
function effOptsHTML(e, i) {
  const def = EFFECTS[e.kind], o = def.opts || [];
  const isChar = curCard() && curCard().type === "char";
  const sel = (opt, label, items, val) => `<label class="eff-opt"><span>${label}</span><select data-eff-opt="${i}" data-opt="${opt}" id="ef-${opt}-${i}">${items.map(([k, v]) => `<option value="${esc(k)}" ${val === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
  const tokSel = (opt, label, type, optional) => {
    const toks = DATA.cards.filter(c => c.token && (!type || c.type === type));
    return toks.length || e[opt]
      ? sel(opt, label, [["", optional ? "（なし：1/1にする）" : "選んでください"], ...toks.map(c => [c.id, `${c.name}（${c.type === "char" ? `${c.atk}/${c.hp}` : "魔法"}）`])], e[opt] || "")
      : `<span class="hint small">トークンのカードがまだありません。新しいカードを作って「トークン」にチェックを入れてください${type === "char" ? "（キャラ）" : ""}。</span>`;
  };
  const out = [];
  // 「自分がカードを使ったとき」：どの世界・種類のカードで発動するか
  if (whenOf(e) === "cardPlay") {
    out.push(sel("pw", "使ったカードの世界", [["", "すべて"], ...Object.entries(WORLDS)], e.pw || ""));
    out.push(sel("pt", "使ったカードの種類", [["", "すべて"], ...Object.entries(TYPES)], e.pt || ""));
  }
  if (e.kind === "unit") {
    const ua = UACTS[e.act] || {};
    out.push(sel("act", "何をする", Object.entries(UACTS).map(([k, v]) => [k, v.label]), e.act || "dmg"));
    const tos = Object.entries(UTOS).filter(([k, v]) => (isChar || !v.charOnly) && (!v.faceOnly || ua.faceOK) && (!ua.enemyOnly || v.side === "enemy"));
    out.push(sel("to", "対象", tos.map(([k, v]) => [k, v.label + (v.role ? "（使うときに選ぶ）" : "")]), e.to || "enemy1"));
    if (ua.kw) {
      out.push(sel("kw", "能力", [["", "選んでください"], ...Object.entries(KEYWORDS).map(([k, v]) => [k, v.label]), ["armor", "装甲（数値）"]], e.kw || ""));
      out.push(`<label class="eff-opt chk"><input type="checkbox" data-eff-turn="${i}" ${e.turn ? "checked" : ""}><span>このターンだけ</span></label>`);
    }
    if (ua.token) out.push(tokSel("card", "変身先", "char", true));
    if (UTOS[e.to] && UTOS[e.to].world) out.push(sel("world", "世界で絞る", [["", "すべて"], ...Object.entries(WORLDS)], e.world || ""));
    if (ua.signed) out.push(`<span class="hint small">数値を−にすると下げます（例：−2で攻撃力-2）。</span>`);
  } else if (e.kind === "player") {
    out.push(sel("act", "何をする", Object.entries(PACTS), e.act || "draw"));
    out.push(sel("who", "だれに", Object.entries(PWHO), e.who || "opp"));
  } else {
    if (o.includes("token")) out.push(tokSel("card", e.kind === "merge" ? "部品（トークン）" : "トークン", def.tokenType, def.tokenOptional));
    if (o.includes("into")) out.push(sel("into", "合体してできるキャラ", [["", "選んでください"], ...DATA.cards.filter(c => c.type === "char").map(c => [c.id, `${c.name}（${c.atk}/${c.hp}）${c.token ? "・トークン" : ""}`])], e.into || ""));
    if (o.includes("kw")) out.push(sel("kw", "能力", [["", "選んでください"], ...Object.entries(KEYWORDS).map(([k, v]) => [k, v.label]), ["armor", "装甲（数値）"]], e.kw || ""));
    if (o.includes("world")) out.push(sel("world", "世界", [["", "すべて"], ...Object.entries(WORLDS)], e.world || ""));
    if (o.includes("ctype")) out.push(sel("ctype", "種類", [["", "すべて"], ...Object.entries(TYPES)], e.ctype || ""));
    if (o.includes("dur")) out.push(sel("dur", "期間", [["turn", "このターンだけ"], ["game", "この対戦中ずっと"]], e.dur || "turn"));
  }
  return out.length ? `<div class="eff-opts">${out.join("")}</div>` : "";
}
/* 効果の条件（なし／体力N以下 など） */
function effCondHTML(e, i) {
  const cd = CONDS[e.cond];
  return `<div class="eff-opts eff-cond">
    <label class="eff-opt"><span>条件</span><select data-eff-cond="${i}" id="ef-cond-${i}">
      <option value="">なし（いつも発動）</option>${Object.entries(CONDS).map(([k, v]) => `<option value="${k}" ${e.cond === k ? "selected" : ""}>${v.label}</option>`).join("")}
    </select></label>
    ${cd && !cd.noN ? `<label class="eff-opt"><span>N</span>${stepper("cnd-" + i, e.cn ?? 1, `効果${i + 1}の条件の数値`)}</label>` : ""}
    ${cd && cd.world ? `<label class="eff-opt"><span>世界</span><select data-eff-opt="${i}" data-opt="cworld" id="ef-cworld-${i}"><option value="">すべて</option>${Object.entries(WORLDS).map(([k, v]) => `<option value="${k}" ${e.cworld === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>` : ""}
  </div>`;
}
function targetWarn(c) {
  const sides = playEffects(c).map(effRole).filter(Boolean).map(r => r === "enemy" || r === "enemyF" ? "enemyUnit" : r === "own" ? "ownUnit" : "anyUnit");
  const msgs = [];
  if (sides.filter(x => x === "enemyUnit").length > 1) msgs.push("相手キャラを選ぶ効果が複数あります。対象は1回だけ選ぶので、同じキャラにすべてかかります。");
  if (sides.filter(x => x === "ownUnit").length > 1) msgs.push("自分のキャラを選ぶ効果が複数あります。対象は1回だけ選ぶので、同じキャラにすべてかかります。");
  c.effects.forEach((e, i) => {
    const o = EFFECTS[e.kind].opts || [];
    if (o.includes("token") && !e.card && !EFFECTS[e.kind].tokenOptional) msgs.push(`効果${i + 1}：出すトークンを選んでください。`);
    if ((o.includes("kw") || (e.kind === "unit" && e.act === "grant")) && !e.kw) msgs.push(`効果${i + 1}：与える能力を選んでください。`);
    if (e.kind === "merge" && (!e.card || !e.into)) msgs.push(`効果${i + 1}：合体の部品と、合体してできるキャラを選んでください。`);
    if (e.kind === "unit" && e.act === "copy" && whenOf(e) !== "play" && e.to === "self") msgs.push(`効果${i + 1}：「このキャラ」を複製すると、同じキャラが増え続けることがあります。`);
  });
  if (c.pay && c.pay.kind === "sacrifice" && sides.includes("ownUnit")) msgs.push("代償でキャラを破壊するカードでは、「自分のキャラを選ぶ効果」は発動しません。");
  return msgs.map(m => `<p class="warn">${m}</p>`).join("");
}

/* ---------- 値の変更 ---------- */
function clamp(v, lo, hi) { v = Math.round(+v); if (!isFinite(v)) v = lo; return Math.min(hi, Math.max(lo, v)); }

function setNum(name, value) {
  if (Admin.setNum(name, value)) return;
  if (name.startsWith("cfg-")) {
    const k = name.slice(4), info = CONFIG_INFO[k];
    DATA.config[k] = clamp(value, info.min, info.max);
    const inp = document.getElementById("f-" + name);
    if (inp) inp.value = DATA.config[k];
    saveDraft(); renderSummary(); renderStatus();
    return;
  }
  const c = curCard();
  if (!c) return;
  let v;
  if (name.startsWith("cnd-")) {
    v = c.effects[+name.slice(4)].cn = clamp(value, 0, 30);
  } else if (name.startsWith("eff-")) {
    const i = +name.slice(4);
    const ef = c.effects[i], signed = ef.kind === "unit" && UACTS[ef.act] && UACTS[ef.act].signed;
    v = clamp(value, signed ? -20 : Math.max(1, EFFECTS[ef.kind].min ?? 1), 20);
    if (signed && v === 0) v = (ef.n || 1) > 0 ? -1 : 1;   // 0は意味がないので飛ばす
    ef.n = v;
  } else if (name === "cost") v = c.cost = clamp(value, 0, 15);
  else if (name === "atk") v = c.atk = clamp(value, 0, 30);
  else if (name === "armor") v = c.armor = clamp(value, 0, 9);
  else if (name === "pay") v = c.pay.n = clamp(value, 1, 30);
  else if (name === "hp") v = c.hp = clamp(value, 1, 30);
  else if (name === "limit") {
    const was = c.limit;
    v = c.limit = clamp(value, 0, 10);
    if ((was === 0) !== (v === 0)) { changed(); renderEditor(); return; }
  }
  const inp = document.getElementById("f-" + name);
  if (inp && document.activeElement !== inp) inp.value = v;
  changed();
}

function setCopies(id, value) {
  const c = DATA.cards.find(x => x.id === id);
  if (!c) return;
  c.limit = clamp(value, 0, 10);
  changed();
  if (id === curId) renderEditor();
}

function select(id) {
  curId = id; confirmDelete = false;
  renderList(); renderEditor();
  if (matchMedia("(max-width:820px)").matches) $("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- イベント ---------- */
document.addEventListener("click", e => {
  const t = e.target;
  if (!t.closest("#more") && !t.closest("#moreBtn")) toggleMore(false);

  const tab = t.closest("[data-tab]");
  if (tab) { showTab(tab.dataset.tab); return; }
  const f = t.closest("[data-filter]");
  if (f) { filter = f.dataset.filter; $$("[data-filter]").forEach(b => b.setAttribute("aria-pressed", b === f)); renderList(); return; }

  const cp = t.closest("[data-limit]");
  if (cp) { const c = DATA.cards.find(x => x.id === cp.dataset.id); setCopies(cp.dataset.id, c.limit + +cp.dataset.limit); return; }
  if (t.closest("[data-limit-in]")) return;
  const pick = t.closest("[data-pick]");
  if (pick) { select(pick.dataset.pick); return; }

  const st = t.closest("[data-step]");
  if (st) {
    const name = st.dataset.step, inp = document.getElementById("f-" + name);
    const stepBy = name.startsWith("cfg-") && CONFIG_INFO[name.slice(4)] && CONFIG_INFO[name.slice(4)].step || 1;
    if (Admin.step(name, +st.dataset.d)) return;
    setNum(name, (+inp.value || 0) + +st.dataset.d * stepBy);
    if (inp) inp.value = name.startsWith("cfg-") ? DATA.config[name.slice(4)] : inp.value;
    const c = curCard();
    if (c && inp) {
      if (name === "cost") inp.value = c.cost;
      if (name === "atk") inp.value = c.atk;
      if (name === "hp") inp.value = c.hp;
      if (name === "limit") inp.value = c.limit;
      if (name.startsWith("eff-")) inp.value = c.effects[+name.slice(4)].n;
      if (name.startsWith("cnd-")) inp.value = c.effects[+name.slice(4)].cn;
    }
    return;
  }

  const ty = t.closest("[data-type]");
  if (ty) {
    const c = curCard(); const nt = ty.dataset.type;
    if (c.type !== nt) {
      c.type = nt;
      if (nt === "char") { c.atk = c.atk ?? 2; c.hp = c.hp ?? 2; }
      else { c.keywords = []; c.armor = 0; c.effects = c.effects.filter(e => !EFFECTS[e.kind].self).map(({ when, ...e }) => e); }
      changed(); renderEditor();
    }
    return;
  }
  const py = t.closest("[data-pay]");
  if (py) { const k = py.dataset.pay; const c = curCard(); c.pay = k ? { kind: k, n: c.pay && c.pay.n || 2 } : null; changed(); renderEditor(); return; }
  const rr = t.closest("[data-rarity]");
  if (rr) { curCard().rarity = rr.dataset.rarity; changed(); renderEditor(); return; }
  const w = t.closest("[data-world]");
  if (w) { curCard().world = w.dataset.world; changed(); renderEditor(); return; }

  const ed = t.closest("[data-eff-del]");
  if (ed) { curCard().effects.splice(+ed.dataset.effDel, 1); changed(); renderEditor(); return; }

  const a = t.closest("[data-act]");
  if (a) act(a.dataset.act, a);
});

document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.wd && WDecks.input(t)) return;
  if (t.dataset.ai && AiTools.input(t)) return;
  if (t.dataset.text) {
    const c = curCard(); if (!c) return;
    c[t.dataset.text] = t.value;
    changed();
  }
});

document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.ai && AiTools.input(t)) return;
  if (t.dataset.num) { setNum(t.dataset.num, t.value); return; }
  if (t.dataset.limitIn) { setCopies(t.dataset.limitIn, t.value); return; }
  if (t.dataset.boss != null && t.type === "checkbox") { const c = curCard(); c.boss = t.checked; changed(); renderEditor(); renderList(); return; }
  if (t.dataset.token != null && t.type === "checkbox") {
    const c = curCard(); c.token = t.checked; if (c.token) c.limit = 0; else if (!c.limit) c.limit = 3;
    changed(); renderEditor(); renderList(); return;
  }
  if (t.dataset.kw) {
    const c = curCard(), k = t.dataset.kw;
    c.keywords = t.checked ? [...new Set([...c.keywords, k])] : c.keywords.filter(x => x !== k);
    changed(); return;
  }
  if (t.dataset.effOpt != null) {
    const c = curCard(), e = c.effects[+t.dataset.effOpt];
    if (t.value) e[t.dataset.opt] = t.value; else delete e[t.dataset.opt];
    if (e.kind === "unit") {
      // 何をするか・対象を変えたら、組み合わせを整える（normEffect と同じきまり）
      const n = normEffect(e, c.type);
      ["act", "to", "n", "kw", "turn", "card", "world"].forEach(k => { if (n[k] === undefined) delete e[k]; else e[k] = n[k]; });
    }
    changed(); renderEditor(); return;
  }
  if (t.dataset.effTurn != null) { const e = curCard().effects[+t.dataset.effTurn]; if (t.checked) e.turn = true; else delete e.turn; changed(); renderEditor(); return; }
  if (t.dataset.effCond != null) { const e = curCard().effects[+t.dataset.effCond]; if (t.value) { e.cond = t.value; if (e.cn == null) e.cn = 1; } else { delete e.cond; delete e.cn; delete e.cworld; } changed(); renderEditor(); return; }
  if (t.dataset.effWhen != null) { const e = curCard().effects[+t.dataset.effWhen]; if (t.value === "play") delete e.when; else e.when = t.value; changed(); renderEditor(); return; }
  if (t.dataset.effKind != null) {
    const c = curCard(), i = +t.dataset.effKind, old = c.effects[i];
    const base = { kind: t.value, n: Math.max(1, Math.abs(old.n || 1)), ...(old.when ? { when: old.when } : {}), ...(old.pw ? { pw: old.pw } : {}), ...(old.pt ? { pt: old.pt } : {}), ...(old.cond ? { cond: old.cond, cn: old.cn, cworld: old.cworld } : {}) };
    if (t.value === "unit") Object.assign(base, { act: "dmg", to: "enemy1" });
    if (t.value === "player") Object.assign(base, { act: "draw", who: "self" });
    if (t.value === "merge") base.n = Math.max(2, base.n);
    if (t.value === "costDown") base.dur = "turn";
    c.effects[i] = base;
    changed(); renderEditor(); return;
  }
  if (t.dataset.text === "name" || t.dataset.text === "glyph") {
    const c = curCard();
    if (!c[t.dataset.text].trim()) { c[t.dataset.text] = t.dataset.text === "name" ? "名前なし" : "？"; t.value = c[t.dataset.text]; changed(); }
  }
  if (t.id === "importFile") { importFile(t.files[0]); t.value = ""; }
  if (t.id === "artFile") { openCrop(t.files[0]); t.value = ""; }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { toggleMore(false); if (!$("#modal").hidden && !cropState) closeModal(); else if (cropState) closeModal(); }
  if (e.key === "Enter" && e.target.matches("input[data-num],input[data-limit-in]")) e.target.blur();
});

/* タブを切り替える（ほかのタブから呼ぶこともある） */
function showTab(name) {
  $$("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name));
  ["cards", "decks", "packs", "eco", "rules", "sim"].forEach(k => { $("#tab-" + k).hidden = name !== k; });
  if (name === "sim") Lab.render();
  if (name === "decks") WDecks.render();
  window.scrollTo(0, 0);
}

function toggleMore(open) {
  $("#more").hidden = !open;
  $("#moreBtn").setAttribute("aria-expanded", String(open));
}

function act(name, el) {
  if (["pubSettings", "pubHistory", "export", "import", "revert", "restoreBackup"].includes(name)) toggleMore(false);
  if (Admin.act(name, el)) return;
  if (WDecks.handleAct(name, el)) return;
  if (typeof AiTools !== "undefined" && AiTools.act(name, el)) return;
  if (Lab.act(name, el)) return;
  if (Publish.act(name, el)) return;
  const c = curCard();
  switch (name) {
    case "more": toggleMore($("#more").hidden); break;
    case "new": {
      const card = normalizeData({ cards: [{ id: newId(), name: "新しいカード", world: "fan", type: "char", cost: 2, atk: 2, hp: 2, glyph: "新", limit: 3 }] }).cards[0];
      DATA.cards.push(card);
      if (filter === "spell") { filter = "all"; $$("[data-filter]").forEach(b => b.setAttribute("aria-pressed", b.dataset.filter === "all")); }
      changed(); select(card.id);
      setTimeout(() => { const n = $("#f-name"); if (n) { n.focus(); n.select(); } }, 50);
      break;
    }
    case "dup": {
      const copy = JSON.parse(JSON.stringify(c));
      copy.id = newId(); copy.name = (c.name + "（複製）").slice(0, 14);
      DATA.cards.push(copy); changed(); select(copy.id);
      break;
    }
    case "del": confirmDelete = true; renderEditor(); break;
    case "delNo": confirmDelete = false; renderEditor(); break;
    case "delYes": {
      DATA.cards = DATA.cards.filter(x => x.id !== curId);
      confirmDelete = false;
      curId = DATA.cards[0] ? DATA.cards[0].id : null;
      changed(); renderEditor();
      break;
    }
    case "addEff": c.effects.push({ kind: "player", act: "draw", who: "self", n: 1 }); changed(); renderEditor(); break;
    case "pickArt": $("#artFile").click(); break;
    case "clearArt": c.art = ""; changed(); renderEditor(); break;
    case "cfgReset": DATA.config = { ...DEFAULT_CONFIG }; saveDraft(); renderRules(); renderSummary(); break;
    case "playtest": flushSave(); window.open("index.html?draft", "_blank"); break;
    case "export": doExport(); break;
    case "import": toggleMore(false); $("#importFile").click(); break;
    case "revert": toggleMore(false); confirmRevert(); break;
    case "restoreBackup": {
      toggleMore(false);
      let b = null; try { b = JSON.parse(localStorage.getItem(DRAFT_KEY + "-backup")); } catch {}
      if (!b) { notice = "戻せる編集内容はありません。"; renderStatus(); break; }
      pendingImport = normalizeData(b);
      if (!pendingImport.decks.length) pendingImport.decks = DATA.decks;
      openModal(`<div class="dialog" role="dialog"><h3>以前の編集内容に戻しますか？</h3>
        <p>今の内容は、以前このブラウザで編集していた内容（${pendingImport.cards.length}種）で置き換わります。古い形式のデータは、新しい形式（投入上限・レア度）に変換されます。</p>
        <div class="acts"><button type="button" class="btn" data-act="closeModal">やめる</button><button type="button" class="btn primary" data-act="importYes">戻す</button></div></div>`);
      break;
    }
    case "closeModal": closeModal(); break;
    case "cropOk": finishCrop(); break;
    case "revertYes": revert(); break;
    case "importYes": applyImport(); break;
    case "copyJson": copyJson(); break;
  }
}

function flushSave() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...DATA, _exportedSnap: exportedSnap })); saveState = "ok"; }
  catch { saveState = "err"; }
  renderStatus();
}

/* ---------- 書き出し・読み込み ---------- */
function exportJSON() {
  const out = { version: (DATA.version || 0) + 1, updated: today(), config: DATA.config, packs: DATA.packs || [], decks: DATA.decks || [], serials: DATA.serials || [], news: DATA.news || [], mail: DATA.mail || [], login: DATA.login || [], cards: DATA.cards.map(c => {
    const o = { id: c.id, name: c.name, world: c.world, type: c.type, cost: c.cost };
    if (c.type === "char") { o.atk = c.atk; o.hp = c.hp; }
    Object.assign(o, { glyph: c.glyph, limit: c.limit, rarity: c.rarity, keywords: c.type === "char" ? c.keywords : [], effects: c.effects });
    if (c.type === "char" && c.armor) o.armor = c.armor;
    if (c.token) o.token = true;
    if (c.boss) o.boss = true;
    if (c.pay) o.pay = c.pay;
    if (c.note) o.note = c.note;
    if (c.art) o.art = c.art;
    return o;
  }) };
  return out;
}

function doExport() {
  const out = exportJSON();
  const text = JSON.stringify(out, null, 1);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = "game-data.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  DATA.version = out.version; DATA.updated = out.updated;
  exportedSnap = snap();
  flushSave();
  openModal(`<div class="dialog" role="dialog" aria-labelledby="exT">
    <h3 id="exT">game-data.json を書き出しました</h3>
    <p>この時点では、まだ遊ぶ人には反映されていません。次のどちらかで公開してください。</p>
    <ol>
      <li>GitHubのリポジトリを開き、「Add file」→「Upload files」で <code>game-data.json</code> を上書きアップロードして「Commit changes」を押す。1〜2分で反映されます。</li>
      <li>または、このファイルをClaudeとのチャットに添付して「反映して」と頼む。</li>
    </ol>
    <p class="hint">ダウンロードが始まらない場合は、内容をコピーして game-data.json として保存してください。</p>
    <div class="acts">
      <button type="button" class="btn" data-act="copyJson">内容をコピー</button>
      <button type="button" class="btn primary" data-act="closeModal">閉じる</button>
    </div>
  </div>`);
}

async function copyJson() {
  const text = JSON.stringify(exportJSON(), null, 1);
  try { await navigator.clipboard.writeText(text); toastIn("コピーしました"); }
  catch { toastIn("コピーできませんでした"); }
}
function toastIn(msg) {
  const d = $(".dialog .acts"); if (!d) return;
  let s = d.querySelector(".hint"); if (!s) { s = document.createElement("span"); s.className = "hint"; s.style.marginRight = "auto"; d.prepend(s); }
  s.textContent = msg;
}

let pendingImport = null;
function importFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = normalizeData(JSON.parse(r.result));
      if (!data.cards.length) throw new Error("カードが入っていません");
      pendingImport = data;
      openModal(`<div class="dialog" role="dialog" aria-labelledby="imT">
        <h3 id="imT">ファイルを読み込みますか？</h3>
        <p>「${esc(file.name)}」には ${data.cards.length}種のカードが入っています。今編集中の内容は、この読み込んだ内容で置き換わります。</p>
        <div class="acts">
          <button type="button" class="btn" data-act="closeModal">やめる</button>
          <button type="button" class="btn primary" data-act="importYes">読み込む</button>
        </div></div>`);
    } catch (err) {
      openModal(`<div class="dialog"><h3>読み込めませんでした</h3><p>カードデータのファイル（game-data.json）を選んでください。（${esc(err.message)}）</p>
        <div class="acts"><button type="button" class="btn primary" data-act="closeModal">閉じる</button></div></div>`);
    }
  };
  r.readAsText(file);
}
function applyImport() {
  if (!pendingImport) return;
  DATA = pendingImport; pendingImport = null;
  curId = DATA.cards[0] ? DATA.cards[0].id : null;
  closeModal(); saveDraft(); renderAll();
}

function confirmRevert() {
  openModal(`<div class="dialog" role="dialog" aria-labelledby="rvT">
    <h3 id="rvT">公開中のデータに戻しますか？</h3>
    <p>このブラウザで編集した内容をすべて捨てて、サイトに置いてある game-data.json の内容に戻します。元に戻せません。</p>
    <div class="acts">
      <button type="button" class="btn" data-act="closeModal">やめる</button>
      <button type="button" class="btn danger" data-act="revertYes">戻す</button>
    </div></div>`);
}
async function revert() {
  try {
    DATA = normalizeData(await fetchPublished());
    exportedSnap = snap();
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    curId = DATA.cards[0] ? DATA.cards[0].id : null;
    closeModal(); renderAll();
  } catch (e) {
    openModal(`<div class="dialog"><h3>戻せませんでした</h3><p>${esc(e.message)}</p>
      <div class="acts"><button type="button" class="btn primary" data-act="closeModal">閉じる</button></div></div>`);
  }
}

/* ---------- モーダル ---------- */
function openModal(html) { const m = $("#modal"); m.innerHTML = html; m.hidden = false; const b = m.querySelector(".btn.primary,.btn"); if (b) b.focus(); }
function closeModal() { $("#modal").hidden = true; $("#modal").innerHTML = ""; cropState = null; }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });

/* ---------- イラストの切り抜き ---------- */
const OUT_W = 400, OUT_H = 560;
let cropState = null;

function openCrop(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    cropState = { img, url, zoom: 1, x: 0, y: 0 };
    openModal(`<div class="dialog" role="dialog" aria-labelledby="crT">
      <h3 id="crT">イラストの位置を決める</h3>
      <p class="hint">ドラッグで位置を動かし、スライダーで拡大します。</p>
      <div class="crop-stage" id="cropStage"><canvas id="cropCv" width="${OUT_W}" height="${OUT_H}"></canvas><div class="crop-guide">ここに名前と数値が重なります</div></div>
      <div class="zoom"><span>拡大</span><input type="range" id="cropZoom" min="1" max="4" step="0.01" value="1" aria-label="拡大率"></div>
      <div class="acts">
        <button type="button" class="btn" data-act="closeModal">やめる</button>
        <button type="button" class="btn primary" data-act="cropOk">決定</button>
      </div></div>`);
    drawCrop();
    const stage = $("#cropStage");
    let start = null;
    stage.addEventListener("pointerdown", e => { start = { px: e.clientX, py: e.clientY, x: cropState.x, y: cropState.y }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener("pointermove", e => {
      if (!start || !cropState) return;
      const k = OUT_W / stage.clientWidth;
      cropState.x = start.x + (e.clientX - start.px) * k;
      cropState.y = start.y + (e.clientY - start.py) * k;
      drawCrop();
    });
    stage.addEventListener("pointerup", () => start = null);
    stage.addEventListener("wheel", e => {
      e.preventDefault();
      cropState.zoom = clampF(cropState.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 1, 4);
      $("#cropZoom").value = cropState.zoom; drawCrop();
    }, { passive: false });
    $("#cropZoom").addEventListener("input", e => { cropState.zoom = +e.target.value; drawCrop(); });
  };
  img.onerror = () => openModal(`<div class="dialog"><h3>画像を開けませんでした</h3><p>PNG・JPEG・WebP などの画像ファイルを選んでください。</p>
    <div class="acts"><button type="button" class="btn primary" data-act="closeModal">閉じる</button></div></div>`);
  img.src = url;
}
function clampF(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/* 画像をカードいっぱいに覆う大きさを基準に、拡大と位置ずれを反映して描く */
function cropGeom() {
  const { img, zoom } = cropState;
  const base = Math.max(OUT_W / img.width, OUT_H / img.height);
  const s = base * zoom, w = img.width * s, h = img.height * s;
  const maxX = (w - OUT_W) / 2, maxY = (h - OUT_H) / 2;
  cropState.x = clampF(cropState.x, -maxX, maxX);
  cropState.y = clampF(cropState.y, -maxY, maxY);
  return { w, h, dx: (OUT_W - w) / 2 + cropState.x, dy: (OUT_H - h) / 2 + cropState.y };
}
function drawCrop() {
  const cv = $("#cropCv"); if (!cv || !cropState) return;
  const ctx = cv.getContext("2d"), g = cropGeom();
  ctx.fillStyle = "#0d0f1c"; ctx.fillRect(0, 0, OUT_W, OUT_H);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cropState.img, g.dx, g.dy, g.w, g.h);
}
function finishCrop() {
  if (!cropState) return;
  const cv = document.createElement("canvas"); cv.width = OUT_W; cv.height = OUT_H;
  const ctx = cv.getContext("2d"), g = cropGeom();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cropState.img, g.dx, g.dy, g.w, g.h);
  let url = cv.toDataURL("image/webp", 0.82);
  if (!url.startsWith("data:image/webp")) url = cv.toDataURL("image/jpeg", 0.85); // WebPに対応していないブラウザ
  URL.revokeObjectURL(cropState.url);
  curCard().art = url;
  closeModal(); changed(); renderEditor();
}

window.addEventListener("beforeunload", flushSave);
boot();
