/* オフラインでも遊べるようにするためのサービスワーカー。
   通信できるときは常に最新を取りに行き（ネットワーク優先）、
   通信できないときだけ保存しておいた内容を使う。 */
const CACHE = "kyokai-v207";
const SHELL = [
  "./", "index.html", "game-data.json",
  "css/base.css", "css/game.css", "js/shared.js", "js/net.js", "js/sound.js", "js/bgm.js", "js/game.js", "js/motion.js", "js/finale.js", "js/vfx.js", "js/mull.js", "js/cinema.js", "js/account.js", "js/pack.js", "js/shop.js", "js/quest.js", "js/tutorial.js", "js/showcase.js", "js/deck.js", "js/feedback.js", "js/serial.js", "js/inbox.js", "js/splash.js", "js/online.js", "js/simlab.js",
  "vendor/firebase-app-compat.js", "vendor/firebase-auth-compat.js", "vendor/firebase-database-compat.js",
  "manifest.webmanifest", "icons/v2-icon-192.png", "icons/v2-apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !isFont) return;
  // イラストはファイル名が中身ごとに変わるので、一度取得したら保存したものを使う
  if (sameOrigin && url.pathname.includes("/art/")) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // 同じサイトのファイルは、端末に残っている分（GitHub Pages は10分残す）を使わず、毎回「変わったか」を確かめる。
  // 変わっていなければ 304 の小さな返事だけで済む
  e.respondWith(
    // ページを開くときの要求（navigate）は設定を足して作り直せないので、URL から取り直す
    (sameOrigin ? fetch(req.mode === "navigate" ? req.url : req, { cache: "no-cache" }) : fetch(req))
      .then(res => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: url.pathname.endsWith(".html") || url.pathname.endsWith("/") }))
  );
});
