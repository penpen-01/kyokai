/* =========================================================
   通信部分（Firebase Realtime Database）
   対人戦を選んだときだけ Firebase を読み込む。CPU戦は通信なしで遊べる。
   ========================================================= */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBLXjR5bhVEM4P-fhqA2yBPV3THRCgHY_g",
  authDomain: "kyokai-41803.firebaseapp.com",
  databaseURL: "https://kyokai-41803-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kyokai-41803",
  storageBucket: "kyokai-41803.firebasestorage.app",
  messagingSenderId: "657427754605",
  appId: "1:657427754605:web:9fd1cff0edb51bb1891964"
};

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("読み込み失敗：" + src));
    document.head.appendChild(s);
  });
}

/* 同じ形の窓口（init / get / set / update / remove / push / on / onChildAdded / onDisconnectRemove）を
   テスト用の疑似サーバーでも用意できるようにしてある */
const FirebaseNet = {
  uid: null,
  db: null,
  async init() {
    if (this.uid) return this.uid;
    if (!window.firebase) {
      await loadScript("vendor/firebase-app-compat.js");
      await loadScript("vendor/firebase-auth-compat.js");
      await loadScript("vendor/firebase-database-compat.js");
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    const auth = firebase.auth();
    if (!auth.currentUser) await auth.signInAnonymously();
    this.uid = auth.currentUser.uid;
    this.db = firebase.database();
    return this.uid;
  },
  ref(path) { return this.db.ref(path); },
  async get(path) { const s = await this.ref(path).get(); return s.exists() ? s.val() : null; },
  set(path, v) { return this.ref(path).set(v); },
  update(path, v) { return this.ref(path).update(v); },
  remove(path) { return this.ref(path).remove(); },
  push(path, v) { return this.ref(path).push(v).key; },
  // 書き込みがサーバーに届くまで待つ（ご意見フォーム用）
  async pushWait(path, v) { const r = this.ref(path).push(); await r.set(v); return r.key; },
  on(path, cb) {
    const r = this.ref(path), f = s => cb(s.exists() ? s.val() : null);
    r.on("value", f);
    return () => r.off("value", f);
  },
  onChildAdded(path, cb) {
    const r = this.ref(path), f = s => cb(s.key, s.val());
    r.on("child_added", f);
    return () => r.off("child_added", f);
  },
  onDisconnectRemove(path) { return this.ref(path).onDisconnect().remove(); },
  onConnected(cb) { return this.on(".info/connected", v => cb(!!v)); }
};

/* テストでは window.MockNet を差し込んで使う */
const Net = window.MockNet || FirebaseNet;
