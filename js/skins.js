/* スキン（見た目）：魔石で買って付け替える（2026-11-16）
   品物は工房の「スキン」（SKINS）。kind で種類を分ける。default の品は最初から持っている
   ・sleeve：カードの裏面　・bg：対戦の背景　・home：ホームの背景　・frame：アイコンの枠（art が空なら今の枠）
   ・icon：限定アイコン（card にカードのIDを書くと、その絵をアイコンにできる）　・keeper：店員（ref に店員のID）
   ・bgm：BGM（準備中）　・art：別イラスト（card にカードのID、art に絵。買うと、カードの詳細で元の絵と切り替えられる）
   スタンプは、ここの売り場でまとめて売る。
   魔光加工（カード1種ごとに UR風・レジェンド風の光を付ける権利）は、カード一覧・デッキ編成のカードの詳細で売る（2026-11-17） */

let SKINS = [];
const SKIN_KINDS = { sleeve: "スリーブ", frame: "アイコンの枠", icon: "限定アイコン", bg: "対戦の背景", home: "ホームの背景", keeper: "店員", art: "別イラスト", stamp: "スタンプ", bgm: "BGM" };
const SKIN_TAB = { sleeve: "スリーブ", frame: "枠", icon: "アイコン", bg: "対戦背景", home: "ホーム背景", keeper: "店員", art: "イラスト", stamp: "スタンプ", bgm: "BGM" };   // タブは短い名前（3列×3段にそろえる）
const EQUIP_KINDS = ["sleeve", "bg", "home", "frame"];   // 1つを選んで付ける種類
const MAKO = { u: "UR風", l: "レジェンド風" };
/* 魔光加工を付けられる光：SR以下は UR風・レジェンド風、URはレジェンド風だけ。レジェンドは付けられない */
const makoKinds = c => !c || c.token || c.boss || !(c.limit > 0) ? [] : ["common", "rare", "sr"].includes(c.rarity) ? ["u", "l"] : c.rarity === "ur" ? ["l"] : [];

const Skins = {
  kind: "sleeve", ask: null,
  list(k) { return SKINS.filter(s => s.kind === k); },
  get(id) { return SKINS.find(s => s.id === id) || null; },
  /* 絵がまだない品は「準備中」（今の枠など、絵がなくても成り立つ最初の品は除く） */
  ready(s) {
    if (s.kind === "keeper") return typeof KEEPER_ART !== "undefined" && KEEPER_ART.includes(s.ref);
    if (s.kind === "icon") return !!(s.card && DEF[s.card] && DEF[s.card].art);
    if (s.kind === "art") return !!(s.art && s.card && DEF[s.card]);
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
    const root = document.documentElement, set = (v, s) => { if (s && s.art && !s.default) root.style.setProperty(v, `url("${new URL(s.art, location.href).href}")`)   /* 変数の url は使う側の CSS（css/）基準になるので、絶対パスにする */; else root.style.removeProperty(v); };
    set("--sleeve", this.equipped("sleeve")); set("--battlebg", this.equipped("bg")); set("--homebg", this.equipped("home"));
    CARD_LOOK = this.looks();
  },
  /* 自分のカードの見た目（魔光加工・別イラスト）を {カードのID: {m, a}} にまとめる */
  looks(ids) {
    const d = Account.data || {}, out = {}, mk = d.mako || {}, alt = d.alt || {};
    const want = ids ? new Set(ids) : null;
    Object.keys(mk).forEach(id => { const x = mk[id]; if (DEF[id] && x.on && makoKinds(DEF[id]).includes(x.on) && (!want || want.has(id))) out[id] = { m: x.on }; });
    Object.keys(alt).forEach(id => { const s = this.get(alt[id]); if (s && s.kind === "art" && s.card === id && this.owned(s) && s.art && (!want || want.has(id))) out[id] = { ...(out[id] || {}), a: s.art }; });
    return out;
  },
  /* 対戦の相手にも見せる見た目（デッキに付けて送る） */
  deckLook(cards) {
    const out = {}, sl = this.equipped("sleeve"), fr = this.equipped("frame");
    if (sl && sl.art && !sl.default) out.sleeve = sl.art;
    if (fr && fr.art && !fr.default) out.frame = fr.art;
    if (cards) { const lk = this.looks(Object.keys(cards)); if (Object.keys(lk).length) out.look = lk; }   // デッキに入っているカードの光・別イラスト
    return out;
  },
  /* 相手から届いた見た目を確かめる（付けられない光や、売り場にない絵は捨てる） */
  cleanLook(x) {
    const out = {};
    if (!x || typeof x !== "object") return out;
    Object.entries(x).slice(0, 60).forEach(([id, v]) => {
      const c = DEF[id]; if (!c || !v || typeof v !== "object") return;
      const o = {};
      if ((v.m === "u" || v.m === "l") && makoKinds(c).includes(v.m)) o.m = v.m;
      if (typeof v.a === "string" && SKINS.some(s => s.kind === "art" && s.card === id && s.art === v.a)) o.a = v.a;
      if (o.m || o.a) out[id] = o;
    });
    return out;
  },
  frameArt() { const f = this.equipped("frame"); return f && f.art && !f.default ? f.art : ""; },
  makoPrice(k) { return Math.max(0, k === "u" ? CONFIG.MAKO_U ?? 3000 : CONFIG.MAKO_L ?? 5000); },
  on() { return !!(CONFIG.SKIN_ON || adminOn()); },

  /* ---------- カードの詳細（カード一覧・デッキ編成）：魔光加工と別イラスト ---------- */
  dAsk: null,
  detailHTML(c) {
    if (!c || !this.on() || typeof Shop === "undefined" || !Shop.usable() || !(Account.owned(c.id) > 0)) return "";
    const ks = makoKinds(c), arts = this.list("art").filter(s => s.card === c.id && this.ready(s));
    if (!ks.length && !arts.length) return "";
    const st = Account.stones || 0, mk = (Account.data.mako || {})[c.id] || {}, altId = (Account.data.alt || {})[c.id] || "";
    const a = this.dAsk && this.dAsk.card === c.id ? this.dAsk : null;
    if (a) {
      const name = a.kind === "art" ? `別イラスト「${(this.get(a.id) || {}).name || ""}」` : `魔光加工（${MAKO[a.kind]}）`;
      const price = a.kind === "art" ? (this.get(a.id) || {}).price || 0 : this.makoPrice(a.kind);
      return `<div class="trade ask mako-ask">
        <p><span>魔石 <b>${price.toLocaleString()}</b> を使って、${esc(c.name)}に${esc(name)}を付けられるようにします。</span><small>所持 ${curIcon("stone")}${st.toLocaleString()} → ${(st - price).toLocaleString()}</small></p>
        <div class="pre-btns"><button type="button" class="btn" data-act="mkNo">やめる</button><button type="button" class="btn primary" data-act="mkYes" ${st >= price ? "" : "disabled"}>${st >= price ? "買う" : `魔石が足りません（あと${(price - st).toLocaleString()}）`}</button></div>
      </div>`;
    }
    const opt = (on, act, attrs, label, sub) => `<button type="button" class="mk-opt ${on ? "on" : ""}" data-act="${act}" ${attrs} aria-pressed="${on}"><b>${label}</b>${sub ? `<small>${sub}</small>` : ""}</button>`;
    const buy = p => `${curIcon("stone")}${p.toLocaleString()}`;
    const mako = ks.length ? `<div class="mk-row"><span class="mk-h">魔光加工</span><div class="mk-opts">
        ${opt(!mk.on, "mkSet", `data-id="${esc(c.id)}" data-v=""`, "なし", "")}
        ${ks.map(k => mk[k] ? opt(mk.on === k, "mkSet", `data-id="${esc(c.id)}" data-v="${k}"`, MAKO[k], mk.on === k ? "付けている" : "持っている")
          : opt(false, "mkAsk", `data-id="${esc(c.id)}" data-v="${k}"`, MAKO[k], buy(this.makoPrice(k)))).join("")}
      </div></div>` : "";
    const art = arts.length ? `<div class="mk-row"><span class="mk-h">イラスト</span><div class="mk-opts">
        ${opt(!altId || !arts.some(s => s.id === altId && this.owned(s)), "altSet", `data-id="${esc(c.id)}" data-v=""`, "元の絵", "")}
        ${arts.map(s => this.owned(s) ? opt(altId === s.id, "altSet", `data-id="${esc(c.id)}" data-v="${esc(s.id)}"`, esc(s.name), altId === s.id ? "使っている" : "持っている")
          : opt(false, "altAsk", `data-id="${esc(c.id)}" data-v="${esc(s.id)}"`, esc(s.name), buy(s.price))).join("")}
      </div></div>` : "";
    return `<div class="mako-box">${mako}${art}<small class="hint">付けた光とイラストは、対戦相手の画面にも出ます。</small></div>`;
  },
  redraw() { if (typeof Shop !== "undefined") Shop.tradeRedraw(); },
  dBuy() {
    const a = this.dAsk; this.dAsk = null;
    const c = a && DEF[a.card];
    if (!c || !Shop.usable() || !(Account.owned(c.id) > 0)) return this.redraw();
    let price, done;
    if (a.kind === "art") {
      const s = this.get(a.id); if (!s || s.kind !== "art" || s.card !== c.id || this.owned(s) || !this.ready(s)) return this.redraw();
      price = s.price; done = () => { Account.data.skins = [...(Account.data.skins || []), s.id]; Account.data.alt = { ...(Account.data.alt || {}), [c.id]: s.id }; };
    } else {
      if (!makoKinds(c).includes(a.kind) || ((Account.data.mako || {})[c.id] || {})[a.kind]) return this.redraw();
      price = this.makoPrice(a.kind); done = () => { const m = { ...(Account.data.mako || {}) }; m[c.id] = { ...(m[c.id] || {}), [a.kind]: 1, on: a.kind }; Account.data.mako = m; };
    }
    if (Account.stones < price) { toast(`魔石が足りません（あと${price - Account.stones}個）`); return this.redraw(); }
    Account.data.stones -= price; done();
    if (typeof Titles !== "undefined") Titles.bump("stoneUse", price);
    Account.saveNow(); this.apply(); Sound.play("rare", 2);
    toast(a.kind === "art" ? `${c.name}の別イラストを手に入れました` : `${c.name}に魔光加工（${MAKO[a.kind]}）を付けました`);
    this.redraw();
  },

  /* ---------- 売り場 ---------- */
  show(msg) {
    if (msg !== undefined) Shop.msg = msg;
    const st = Account.stones || 0, use = Shop.usable();
    const tabs = Object.keys(SKIN_KINDS).map(k => `<button type="button" role="tab" data-act="skTab" data-v="${k}" aria-pressed="${this.kind === k}" aria-label="${SKIN_KINDS[k]}">${SKIN_TAB[k]}</button>`).join("");
    const k = this.kind;
    let body = "";
    if (k === "stamp") body = this.stampHTML(st, use);
    else {
      // 絵がそろっていない店員と、まだ開放していない弾のカードの別イラストは並べない（ネタばれ防止）
      const L = this.list(k).filter(s => !(s.kind === "keeper" && !this.ready(s)) && !(s.kind === "art" && !cardShown(DEF[s.card])));
      body = L.length ? `<div class="sk-grid">${L.map(s => this.itemHTML(s, st, use)).join("")}</div>` : `<p class="sk-empty">準備中です。もうしばらくお待ちください。</p>`;
    }
    const a = this.ask, ax = a && (a.kind === "stamp" ? (() => { const s = STAMPS.find(x => x.id === a.id); return s && { name: `スタンプ「${s.text}」`, price: s.price }; })() : this.get(a.id));
    openOverlay(`<div class="panel wide shop">
      <div class="topbar"><button type="button" class="btn sm" data-act="shopMain">← ショップ</button><b>スキン</b>${stoneTag(st)}</div>
      ${Shop.noteHTML()}
      ${Keeper.miniHTML()}
      ${Shop.msg ? `<p class="shopmsg" role="status">${esc(Shop.msg)}</p>` : ""}
      <div class="sk-tabs" role="tablist">${tabs}</div>
      <p class="sk-kind">${esc(SKIN_KINDS[k])}</p>
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
      : s.kind === "art" ? `<span class="sk-pic art">${DEF[s.card] ? cardHTML(DEF[s.card], { static: true, look: { a: s.art } }) : ""}</span>`
      : s.kind === "keeper" ? `<span class="sk-pic keeper" style="background-image:url('ui/keeper/${esc(s.ref)}-idle.webp')"></span>`
      : s.kind === "frame" ? `<span class="sk-pic frame">${s.art ? `<img src="${esc(s.art)}" alt="">` : `<span class="halo"></span>`}<span class="sk-face">${DEFAULT_AVATAR_HTML}</span></span>`
      : s.art ? `<span class="sk-pic ${s.kind}" style="background-image:url('${esc(s.art)}')"></span>` : `<span class="sk-pic none"></span>`;
    let btn;
    if (!ready) btn = `<i class="sh-soon">準備中</i>`;
    else if (!own) btn = `<button type="button" class="btn sm ${st >= s.price ? "primary" : ""}" data-act="skAsk" data-kind="skin" data-id="${esc(s.id)}" ${use && st >= s.price ? "" : "disabled"}>${curIcon("stone")}${s.price.toLocaleString()}</button>`;
    else if (s.kind === "icon") btn = `<span class="sk-own">持っている（プロフィールで選べます）</span>`;
    else if (s.kind === "art") { const use = (Account.data.alt || {})[s.card] === s.id;
      btn = use ? `<button type="button" class="btn sm" data-act="skArt" data-id="${esc(s.id)}" data-v="">元の絵に戻す</button>` : `<button type="button" class="btn sm" data-act="skArt" data-id="${esc(s.id)}" data-v="1">使う</button>`; }
    else btn = on ? `<span class="sk-on">使用中</span>` : `<button type="button" class="btn sm" data-act="skEquip" data-id="${esc(s.id)}">使う</button>`;
    const note = s.kind === "art" && !(Account.owned(s.card) > 0) ? `<small class="sk-warn">まだ持っていないカードです。手に入れると、この絵で出ます。</small>` : "";
    return `<div class="sk-item ${on ? "on" : ""} ${ready ? "" : "soon"}">${pic}<b>${esc(s.name)}</b>${s.desc ? `<small>${esc(s.desc)}</small>` : ""}${note}<span class="sk-act">${btn}</span></div>`;
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
    if (a.kind === "stamp") {
      const s = STAMPS.find(x => x.id === a.id); if (!s || Stamps.owned(s.id)) return this.show();
      price = s.price; done = () => { Account.data.stampOwn = [...(Account.data.stampOwn || []), s.id]; };
    } else {
      const s = this.get(a.id); if (!s || this.owned(s) || !this.ready(s)) return this.show();
      price = s.price; done = () => { Account.data.skins = [...(Account.data.skins || []), s.id]; if (s.kind === "art") Account.data.alt = { ...(Account.data.alt || {}), [s.card]: s.id }; };
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
      case "skArt": { const s = this.get(el.dataset.id); if (!s || !this.owned(s)) return true; const m = { ...(Account.data.alt || {}) }; if (el.dataset.v) m[s.card] = s.id; else delete m[s.card]; Account.data.alt = m; Account.save(); this.apply(); Sound.play("click"); this.show(); return true; }
      // カードの詳細
      case "mkAsk": this.dAsk = { card: el.dataset.id, kind: el.dataset.v }; this.redraw(); return true;
      case "altAsk": this.dAsk = { card: el.dataset.id, kind: "art", id: el.dataset.v }; this.redraw(); return true;
      case "mkNo": this.dAsk = null; this.redraw(); return true;
      case "mkYes": this.dBuy(); return true;
      case "mkSet": { const id = el.dataset.id, v = el.dataset.v, m = { ...(Account.data.mako || {}) }, x = m[id]; if (v && !(x && x[v])) return true; if (x) m[id] = { ...x, on: v }; Account.data.mako = m; Account.save(); this.apply(); Sound.play("click"); this.redraw(); return true; }
      case "altSet": { const id = el.dataset.id, v = el.dataset.v, s = v && this.get(v); if (v && !(s && s.card === id && this.owned(s))) return true; const m = { ...(Account.data.alt || {}) }; if (v) m[id] = v; else delete m[id]; Account.data.alt = m; Account.save(); this.apply(); Sound.play("click"); this.redraw(); return true; }
    }
    return false;
  }
};
