/* スキン（見た目）：魔石で買って付け替える（2026-11-16）
   品物は工房の「スキン」（SKINS）。kind で種類を分ける。default の品は最初から持っている
   ・sleeve：カードの裏面　・bg：対戦の背景　・home：ホームの背景　・frame：アイコンの枠（art が空なら今の枠）
   ・icon：限定アイコン（card にカードのIDを書くと、その絵をアイコンにできる）　・keeper：店員（ref に店員のID）
   ・bgm：BGM（準備中）
   カードの光（SR以下のカード1種ごとの権利）とスタンプは、ここの売り場でまとめて売る */

let SKINS = [];
const SKIN_KINDS = { sleeve: "スリーブ", frame: "アイコンの枠", icon: "限定アイコン", bg: "対戦の背景", home: "ホームの背景", keeper: "店員", holo: "カードの光", stamp: "スタンプ", bgm: "BGM" };
const EQUIP_KINDS = ["sleeve", "bg", "home", "frame"];   // 1つを選んで付ける種類
let HOLO_SET = new Set();   // 光らせているカード（cardHTML が見る）

const Skins = {
  kind: "sleeve", ask: null, hq: "",
  list(k) { return SKINS.filter(s => s.kind === k); },
  get(id) { return SKINS.find(s => s.id === id) || null; },
  /* 絵がまだない品は「準備中」（今の枠など、絵がなくても成り立つ最初の品は除く） */
  ready(s) {
    if (s.kind === "keeper") return typeof KEEPER_ART !== "undefined" && KEEPER_ART.includes(s.ref);
    if (s.kind === "icon") return !!(s.card && DEF[s.card] && DEF[s.card].art);
    if (s.kind === "bgm") return false;
    return !!s.art || !!s.default;
  },
  owned(s) {
    if (!s) return false;
    if (s.default) return true;
    return !!(Account.data && (Account.data.skins || []).includes(s.id));
  },
  equipped(k) {
    const id = Account.data && Account.data.equip && Account.data.equip[k];
    const s = id && this.get(id);
    return s && s.kind === k && this.owned(s) ? s : this.list(k).find(x => x.default) || null;
  },
  /* 今の見た目を画面に反映（スリーブ・背景・光らせるカード） */
  apply() {
    const root = document.documentElement, set = (v, s) => { if (s && s.art && !s.default) root.style.setProperty(v, `url("${s.art}")`); else root.style.removeProperty(v); };
    set("--sleeve", this.equipped("sleeve")); set("--battlebg", this.equipped("bg")); set("--homebg", this.equipped("home"));
    const h = (Account.data && Account.data.holo) || {};
    HOLO_SET = new Set(Object.keys(h).filter(id => h[id] === 1 && DEF[id]));
  },
  /* 対戦の相手にも見せる見た目（デッキに付けて送る） */
  deckLook() {
    const out = {}, sl = this.equipped("sleeve"), fr = this.equipped("frame");
    if (sl && sl.art && !sl.default) out.sleeve = sl.art;
    if (fr && fr.art && !fr.default) out.frame = fr.art;
    return out;
  },
  frameArt() { const f = this.equipped("frame"); return f && f.art && !f.default ? f.art : ""; },
  holoPrice() { return Math.max(0, CONFIG.HOLO_PRICE ?? 3000); },
  holoCards() {
    const q = this.hq.trim();
    return CARDS.filter(c => !c.token && !c.boss && c.limit > 0 && ["common", "rare", "sr"].includes(c.rarity) && Account.owned(c.id) > 0 && (!q || c.name.includes(q)))
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.cost - b.cost);
  },

  /* ---------- 売り場 ---------- */
  show(msg) {
    if (msg !== undefined) Shop.msg = msg;
    const st = Account.stones || 0, use = Shop.usable();
    const tabs = Object.entries(SKIN_KINDS).map(([k, l]) => `<button type="button" role="tab" data-act="skTab" data-v="${k}" aria-pressed="${this.kind === k}">${l}</button>`).join("");
    const k = this.kind;
    let body = "";
    if (k === "holo") body = this.holoHTML(st, use);
    else if (k === "stamp") body = this.stampHTML(st, use);
    else {
      const L = this.list(k);
      body = L.length ? `<div class="sk-grid">${L.map(s => this.itemHTML(s, st, use)).join("")}</div>` : `<p class="sk-empty">準備中です。もうしばらくお待ちください。</p>`;
    }
    const a = this.ask, ax = a && (a.kind === "holo" ? { name: `${DEF[a.id] ? DEF[a.id].name : ""}の光`, price: this.holoPrice() } : a.kind === "stamp" ? (() => { const s = STAMPS.find(x => x.id === a.id); return s && { name: `スタンプ「${s.text}」`, price: s.price }; })() : this.get(a.id));
    openOverlay(`<div class="panel wide shop">
      <div class="topbar"><button type="button" class="btn sm" data-act="shopMain">← ショップ</button><b>スキン</b>${stoneTag(st)}</div>
      ${Shop.noteHTML()}
      ${Keeper.miniHTML()}
      ${Shop.msg ? `<p class="shopmsg" role="status">${esc(Shop.msg)}</p>` : ""}
      <div class="seg sk-tabs" role="tablist">${tabs}</div>
      ${body}
      ${ax ? `<div class="dmodal" data-act="skNo"><div class="dmodal-in confirmbox" role="alertdialog" aria-label="買う前の確認" data-act="noop">
          <b class="dm-name">「${esc(ax.name)}」を買いますか？</b>
          <p class="dm-text">魔石 ${ax.price.toLocaleString()} を使います（所持 ${st.toLocaleString()} → ${(st - ax.price).toLocaleString()}）。</p>
          <div class="pre-btns"><button type="button" class="btn primary" data-act="skYes">買う</button><button type="button" class="btn" data-act="skNo">やめる</button></div>
        </div></div>` : ""}
    </div>`, "start", true);
  },
  itemHTML(s, st, use) {
    const own = this.owned(s), ready = this.ready(s);
    const on = EQUIP_KINDS.includes(s.kind) ? this.equipped(s.kind) === s : s.kind === "keeper" ? (Keeper.cur() || {}).id === s.ref : false;
    const pic = s.kind === "icon" ? `<span class="sk-pic icon">${iconImgHTML(s.card)}</span>`
      : s.kind === "keeper" ? `<span class="sk-pic keeper" style="background-image:url('ui/keeper/${esc(s.ref)}-idle.webp')"></span>`
      : s.kind === "frame" ? `<span class="sk-pic frame">${s.art ? `<img src="${esc(s.art)}" alt="">` : `<span class="halo"></span>`}<span class="sk-face">${DEFAULT_AVATAR_HTML}</span></span>`
      : s.art ? `<span class="sk-pic ${s.kind}" style="background-image:url('${esc(s.art)}')"></span>` : `<span class="sk-pic none"></span>`;
    let btn;
    if (!ready) btn = `<i class="sh-soon">準備中</i>`;
    else if (!own) btn = `<button type="button" class="btn sm ${st >= s.price ? "primary" : ""}" data-act="skAsk" data-kind="skin" data-id="${esc(s.id)}" ${use && st >= s.price ? "" : "disabled"}>${curIcon("stone")}${s.price.toLocaleString()}</button>`;
    else if (s.kind === "icon") btn = `<span class="sk-own">持っている（プロフィールで選べます）</span>`;
    else btn = on ? `<span class="sk-on">使用中</span>` : `<button type="button" class="btn sm" data-act="skEquip" data-id="${esc(s.id)}">使う</button>`;
    return `<div class="sk-item ${on ? "on" : ""} ${ready ? "" : "soon"}">${pic}<b>${esc(s.name)}</b>${s.desc ? `<small>${esc(s.desc)}</small>` : ""}<span class="sk-act">${btn}</span></div>`;
  },
  holoHTML(st, use) {
    const h = (Account.data && Account.data.holo) || {}, price = this.holoPrice(), L = this.holoCards();
    return `<p class="hint sk-note">SR以下のカードに、UR・レジェンドのような流れる光を付けます（1種類ごとに魔石${price.toLocaleString()}）。買ったあとは、いつでも付けたり外したりできます。<br>光るカードが多いと、スマホが重くなったり電池の減りが早くなったりします。重いときは、設定の「カードの光の動き」をオフにしてください。</p>
      <input class="otxt" id="sk-hq" placeholder="カードの名前で探す" value="${esc(this.hq)}" autocomplete="off">
      <div class="sk-holo">${L.slice(0, 120).map(c => {
        const have = h[c.id] != null, on = h[c.id] === 1;
        const b = !have ? `<button type="button" class="btn sm" data-act="skAsk" data-kind="holo" data-id="${esc(c.id)}" ${use && st >= price ? "" : "disabled"}>${curIcon("stone")}${price.toLocaleString()}</button>`
          : `<button type="button" class="btn sm ${on ? "primary" : ""}" data-act="skHolo" data-id="${esc(c.id)}">${on ? "光らせている" : "光らせない"}</button>`;
        return `<div class="sk-hcard">${cardHTML(c, { static: true, cls: on ? "holo" : "" })}${b}</div>`;
      }).join("") || `<p class="hint">持っているSR以下のカードがありません</p>`}</div>`;
  },
  stampHTML(st, use) {
    const L = STAMPS.filter(s => !s.free);
    if (!L.length) return `<p class="sk-empty">新しいスタンプは準備中です。最初から持っている${STAMPS.filter(s => s.free).length}個は、プロフィールで選べます。</p>`;
    return `<div class="stamp-grid">${L.map(s => {
      const own = Stamps.owned(s.id);
      return `<div class="sk-stamp"><span class="stamp-item ${s.art ? "art" : ""}">${Stamps.html(s)}</span>${own ? `<span class="sk-own">持っている</span>` : `<button type="button" class="btn sm" data-act="skAsk" data-kind="stamp" data-id="${esc(s.id)}" ${use && st >= s.price ? "" : "disabled"}>${curIcon("stone")}${s.price.toLocaleString()}</button>`}</div>`;
    }).join("")}</div>`;
  },
  buy() {
    const a = this.ask; this.ask = null;
    if (!a || !Shop.usable()) return this.show();
    let price = 0, done;
    if (a.kind === "holo") {
      if (!DEF[a.id] || (Account.data.holo || {})[a.id] != null) return this.show();
      price = this.holoPrice(); done = () => { Account.data.holo = { ...(Account.data.holo || {}), [a.id]: 1 }; };
    } else if (a.kind === "stamp") {
      const s = STAMPS.find(x => x.id === a.id); if (!s || Stamps.owned(s.id)) return this.show();
      price = s.price; done = () => { Account.data.stampOwn = [...(Account.data.stampOwn || []), s.id]; };
    } else {
      const s = this.get(a.id); if (!s || this.owned(s) || !this.ready(s)) return this.show();
      price = s.price; done = () => { Account.data.skins = [...(Account.data.skins || []), s.id]; };
    }
    if (Account.stones < price) { Keeper.react("poor", "trouble"); return this.show(`魔石が足りません（あと${price - Account.stones}個）。`); }
    Account.data.stones -= price; done();
    if (typeof Titles !== "undefined") Titles.bump("stoneUse", price);
    Account.saveNow(); this.apply(); Sound.play("click"); Keeper.react("buy", "happy");
    this.show("買いました。");
  },
  equip(id) {
    const s = this.get(id); if (!s || !this.owned(s)) return;
    if (s.kind === "keeper") Account.data.keeper = s.ref;
    else Account.data.equip = { ...(Account.data.equip || {}), [s.kind]: s.id };
    Account.save(); this.apply(); Sound.play("click");
    this.show(`「${s.name}」にしました。`);
  },
  handleAct(act, el) {
    switch (act) {
      case "shopSkins": if (!CONFIG.SKIN_ON && !adminOn()) return true; Shop.msg = null; this.ask = null; this.show(); return true;
      case "skTab": this.kind = el.dataset.v; Shop.msg = null; this.show(); return true;
      case "skAsk": this.ask = { kind: el.dataset.kind, id: el.dataset.id }; this.show(); return true;
      case "skNo": this.ask = null; this.show(); return true;
      case "skYes": this.buy(); return true;
      case "skEquip": this.equip(el.dataset.id); return true;
      case "skHolo": { const h = { ...(Account.data.holo || {}) }; if (h[el.dataset.id] == null) return true; h[el.dataset.id] = h[el.dataset.id] === 1 ? 0 : 1; Account.data.holo = h; Account.save(); this.apply(); this.show(); return true; }
    }
    return false;
  }
};
document.addEventListener("input", e => {
  if (e.target && e.target.id === "sk-hq" && !(typeof IME !== "undefined" && IME.on)) {
    Skins.hq = e.target.value; const pos = e.target.selectionStart; Skins.show();
    const n = document.getElementById("sk-hq"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) {} }
  }
});
