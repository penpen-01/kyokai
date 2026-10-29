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
const snap = () => JSON.stringify({ config: DATA.config, cards: DATA.cards });
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
}

function renderStatus() {
  const size = new Blob([JSON.stringify(DATA)]).size;
  const dirty = snap() !== exportedSnap;
  $("#status").innerHTML = `
    ${saveState === "err"
      ? `<span class="dot err">ブラウザに自動保存できませんでした。早めに書き出してください</span>`
      : `<span class="dot ${dirty ? "dirty" : ""}">${dirty ? "未書き出しの変更あり（このブラウザには自動保存済み）" : "書き出し済みの内容と同じです"}</span>`}
    <span>データ ${fmtBytes(size)}</span>
    ${notice ? `<span class="dot dirty">${esc(notice)}</span>` : ""}`;
}

function poolStats() {
  const usable = DATA.cards.filter(c => c.limit > 0);
  const kinds = f => usable.filter(f).length;
  const curve = Array(9).fill(0);
  usable.forEach(c => { curve[Math.min(8, Math.max(0, c.cost))]++; });
  return {
    kinds: usable.length, all: DATA.cards.length,
    chars: kinds(c => c.type === "char"), spells: kinds(c => c.type === "spell"),
    myth: kinds(c => c.world === "myth"), fan: kinds(c => c.world === "fan"), mech: kinds(c => c.world === "mech"),
    common: kinds(c => c.rarity === "common"), rare: kinds(c => c.rarity === "rare"), legend: kinds(c => c.rarity === "legend"),
    curve
  };
}

function renderSummary() {
  const s = poolStats();
  const max = Math.max(1, ...s.curve);
  $("#summary").innerHTML = `
    <div class="sum-row">
      <span class="big">使えるカード <b>${s.kinds}</b>種</span>
      <span>キャラ <b>${s.chars}</b> ・ 魔法 <b>${s.spells}</b>${s.all > s.kinds ? ` ・ 使用不可 <b>${s.all - s.kinds}</b>` : ""}</span>
    </div>
    <div class="sum-row">
      <span style="color:var(--w-myth)">神話 <b>${s.myth}</b></span>
      <span style="color:var(--w-fan)">幻想 <b>${s.fan}</b></span>
      <span style="color:var(--w-mech)">機械 <b>${s.mech}</b></span>
      <span>コモン <b>${s.common}</b> ・ レア <b>${s.rare}</b> ・ レジェンド <b>${s.legend}</b></span>
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
    .filter(c => filter === "all" || c.type === filter)
    .slice().sort((a, b) => a.cost - b.cost || (a.type > b.type ? 1 : a.type < b.type ? -1 : 0) || a.name.localeCompare(b.name, "ja"));
  $("#list").innerHTML = list.length ? list.map(c => `
    <li class="row ${c.id === curId ? "cur" : ""} ${c.limit ? "" : "out"} w-${c.world}" data-pick="${esc(c.id)}">
      ${cardHTML(c, { static: true })}
      <div class="row-main">
        <span class="row-name">${esc(c.name)}</span>
        <span class="row-meta">コスト${c.cost} ・ <span class="w">${WORLDS[c.world]}</span> ・ ${c.type === "char" ? `${c.atk}/${c.hp}` : "魔法"}${c.limit ? "" : " ・ 使用不可"}</span>
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
          <p class="hint">投入上限は、1つのデッキに何枚まで入れられるか。ルール設定の「同じカードを入れられる上限」（今は${DATA.config.COPY_MAX}枚）より大きくしても、そちらが優先されます。0にすると、データには残りますがデッキに入れられなくなります。</p>
          <div class="field grow">
            <span class="lab">レア度（パック開封で使う予定）</span>
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
          <p class="hint">${isChar ? "キャラの効果は、場に出たとき（登場時）に1回だけ発動します。" : "魔法の効果は、使ったときに発動します。"}上から順に発動します。</p>
          <div class="effects">
            ${c.effects.map((e, i) => { const def = EFFECTS[e.kind]; return `<div class="eff">
              <select data-eff-kind="${i}" aria-label="効果${i + 1}の種類" id="ef-k-${i}">
                ${[...new Set(Object.values(EFFECTS).map(v => v.group))].map(g => `<optgroup label="${g}">${Object.entries(EFFECTS).filter(([, v]) => v.group === g).map(([k, v]) => `<option value="${k}" ${e.kind === k ? "selected" : ""}>${v.label}${v.target ? "（対象を選ぶ）" : ""}</option>`).join("")}</optgroup>`).join("")}
              </select>
              ${def.noN ? "" : stepper("eff-" + i, e.n, `効果${i + 1}の数値`)}
              <button type="button" class="iconbtn" data-eff-del="${i}" aria-label="効果${i + 1}を削除">✕</button>
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
      ${Object.entries(CONFIG_INFO).map(([k, v]) => `<div class="item">
        <label for="f-cfg-${k}">${v.label}<small>初期値 ${DEFAULT_CONFIG[k]} ・ ${v.min}〜${v.max}</small></label>
        ${stepper("cfg-" + k, cfg[k], v.label)}
      </div>`).join("")}
    </div>
    <div><button type="button" class="btn sm" data-act="cfgReset">すべて初期値に戻す</button></div>`;
}

function targetWarn(c) {
  const sides = c.effects.map(e => EFFECTS[e.kind].target).filter(Boolean);
  const msgs = [];
  if (sides.filter(x => x === "enemyUnit").length > 1) msgs.push("相手キャラを選ぶ効果が複数あります。対象は1回だけ選ぶので、同じキャラにすべてかかります。");
  if (sides.filter(x => x === "ownUnit").length > 1) msgs.push("自分のキャラを選ぶ効果が複数あります。対象は1回だけ選ぶので、同じキャラにすべてかかります。");
  if (c.pay && c.pay.kind === "sacrifice" && sides.includes("ownUnit")) msgs.push("代償でキャラを破壊するカードでは、「自分のキャラを選ぶ効果」は発動しません。");
  return msgs.map(m => `<p class="warn">${m}</p>`).join("");
}

/* ---------- 値の変更 ---------- */
function clamp(v, lo, hi) { v = Math.round(+v); if (!isFinite(v)) v = lo; return Math.min(hi, Math.max(lo, v)); }

function setNum(name, value) {
  if (name.startsWith("cfg-")) {
    const k = name.slice(4), info = CONFIG_INFO[k];
    DATA.config[k] = clamp(value, info.min, info.max);
    const inp = document.getElementById("f-" + name);
    if (inp) inp.value = DATA.config[k];
    saveDraft(); renderSummary();
    return;
  }
  const c = curCard();
  if (!c) return;
  let v;
  if (name.startsWith("eff-")) {
    const i = +name.slice(4);
    v = c.effects[i].n = clamp(value, EFFECTS[c.effects[i].kind].min ?? 1, 20);
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
  if (tab) {
    $$("[data-tab]").forEach(b => b.setAttribute("aria-selected", b === tab));
    $("#tab-cards").hidden = tab.dataset.tab !== "cards";
    $("#tab-rules").hidden = tab.dataset.tab !== "rules";
    return;
  }
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
    setNum(name, (+inp.value || 0) + +st.dataset.d);
    if (inp) inp.value = name.startsWith("cfg-") ? DATA.config[name.slice(4)] : inp.value;
    const c = curCard();
    if (c && inp) {
      if (name === "cost") inp.value = c.cost;
      if (name === "atk") inp.value = c.atk;
      if (name === "hp") inp.value = c.hp;
      if (name === "limit") inp.value = c.limit;
      if (name.startsWith("eff-")) inp.value = c.effects[+name.slice(4)].n;
    }
    return;
  }

  const ty = t.closest("[data-type]");
  if (ty) {
    const c = curCard(); const nt = ty.dataset.type;
    if (c.type !== nt) {
      c.type = nt;
      if (nt === "char") { c.atk = c.atk ?? 2; c.hp = c.hp ?? 2; }
      else { c.keywords = []; c.armor = 0; }
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
  if (a) act(a.dataset.act);
});

document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.text) {
    const c = curCard(); if (!c) return;
    c[t.dataset.text] = t.value;
    changed();
  }
});

document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.num) { setNum(t.dataset.num, t.value); return; }
  if (t.dataset.limitIn) { setCopies(t.dataset.limitIn, t.value); return; }
  if (t.dataset.kw) {
    const c = curCard(), k = t.dataset.kw;
    c.keywords = t.checked ? [...new Set([...c.keywords, k])] : c.keywords.filter(x => x !== k);
    changed(); return;
  }
  if (t.dataset.effKind != null) { const e = curCard().effects[+t.dataset.effKind]; e.kind = t.value; e.n = Math.max(EFFECTS[e.kind].min ?? 1, e.n); changed(); renderEditor(); return; }
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

function toggleMore(open) {
  $("#more").hidden = !open;
  $("#moreBtn").setAttribute("aria-expanded", String(open));
}

function act(name) {
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
    case "addEff": c.effects.push({ kind: "draw", n: 1 }); changed(); renderEditor(); break;
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
  const out = { version: (DATA.version || 0) + 1, updated: today(), config: DATA.config, decks: DATA.decks || [], cards: DATA.cards.map(c => {
    const o = { id: c.id, name: c.name, world: c.world, type: c.type, cost: c.cost };
    if (c.type === "char") { o.atk = c.atk; o.hp = c.hp; }
    Object.assign(o, { glyph: c.glyph, limit: c.limit, rarity: c.rarity, keywords: c.type === "char" ? c.keywords : [], effects: c.effects });
    if (c.type === "char" && c.armor) o.armor = c.armor;
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
