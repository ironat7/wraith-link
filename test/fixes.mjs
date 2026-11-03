// usage: node fixes.mjs [section|all] [channel] [other channel]. Sections: pause cover misc browse chat replay irc account keyboard emotes fullscreen scroll sound pages layout
// Checks for the bugs an independent code review found on 2026-11-02, on real streams with the failures staged.
// An iPhone user agent turns on the Safari paths (the CDN cover, background sound) in Chrome, whose native HLS can run them.
import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const file = fileURLToPath(new URL('../index.html', import.meta.url)), dir = path.dirname(file);
const srv = http.createServer((q, r) => { const u = new URL(q.url, 'http://x'); const p = u.pathname === '/' ? file : path.join(dir, u.pathname); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.svg') ? 'image/svg+xml' : p.endsWith('.png') ? 'image/png' : 'application/octet-stream', 'cache-control': 'no-store' }); r.end(d); }); });
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const which = process.argv[2] || 'all', want = s => which === 'all' || which === s;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const CID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const gqlNode = async q => (await (await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': CID, 'Content-Type': 'application/json', 'X-Device-Id': 'wraithtests0000000000000000000000' }, body: JSON.stringify({ query: q }) })).json()).data;
let A = process.argv[3], B = process.argv[4];
if (!A || !B) {
  const top = (await gqlNode('query { streams(first: 12) { edges { node { broadcaster { login } } } } }')).streams.edges.map(e => e.node.broadcaster.login);
  A ||= top[0]; B ||= top.find(x => x !== A);
}
console.log('channels', A, B);
let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) fails++; };
const ALL = new Set(['site', 'popout', 'embed', 'frontpage']), NONE = new Set();

async function open({ iphone = false, init, initArg, w = 900, h = 1000 } = {}) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, userAgent: iphone ? IPHONE : undefined });
  if (init) await c.addInitScript(init, initArg);
  const page = await c.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  // stages ad breaks by kind of session, and counts what goes through the relay
  const ads = { on: NONE, masters: [], relay: 0, slow: null, ms: 0 };
  const kindOf = new Map();
  await page.route(/script\.google/, async route => {
    const u = new URL(route.request().url()).searchParams.get('u');
    if (!u) return route.continue();
    ads.relay++;
    const res = await route.fetch().catch(() => null);
    if (!res) return route.abort().catch(() => {});
    let b = await res.text();
    if (u.includes('usher.ttvnw.net')) {
      const kind = JSON.parse(new URL(u).searchParams.get('token') || '{}').player_type || '?';
      if (!kindOf.has(u)) ads.masters.push(kind);   // a slow fetch's twin is the same session
      kindOf.set(u, kind);
      if (ads.slow === kind) await sleep(ads.ms);
      for (const l of b.split('\n')) if (l.startsWith('https://')) kindOf.set(l.trim(), kind);
      const cut = b.indexOf('\n#WRAITH-MEDIA:');   // the first media playlist comes along with the master
      if (cut >= 0) { const rest = b.slice(cut + 15), eol = rest.indexOf('\n'), url = rest.slice(0, eol).split(' ')[1]; kindOf.set(url, kind); if (ads.on.has(kind)) b = b.replace(/(#EXTINF:[\d.]+),live/g, '$1,Amazon|1'); }
    } else if (ads.on.has(kindOf.get(u)) && b.includes('#EXTINF')) b = b.replace(/(#EXTINF:[\d.]+),live/g, '$1,Amazon|1');
    await route.fulfill({ response: res, body: b }).catch(() => {});
  });
  return { c, page, ads, done: async () => { ok('no page errors', page.errors.length === 0, page.errors.join(' | ')); await page.unrouteAll({ behavior: 'ignoreErrors' }); await c.close(); } };
}
const playing = (page, ms = 25000) => page.waitForFunction(() => { const v = wraith.P.active(); return v && !v.paused && v.currentTime > 1 && v.readyState >= 3; }, null, { timeout: ms }).catch(() => {});
const st = page => page.evaluate(() => { const P = wraith.P, v = P.active(); return { feed: P.feed, ad: P.ad, cover: P.cover, type: P.playerType, paused: v?.paused, t: +(v?.currentTime || 0).toFixed(1), h: v?.videoHeight, lat: +(P.latency() || 0).toFixed(1), hls: !!P.hls, spin: !document.getElementById('spin').hidden, banner: !document.getElementById('banner').hidden, msg: !document.getElementById('msgbox').hidden, retries: P.retries, tried: [...P.dodged], errs: P.errs }; });
const vis = (page, hidden) => page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);

if (want('pause')) {
  // A pause you chose holds through ad breaks, restarts and a stream restarting.
  const { page, ads, done } = await open();
  await page.goto(base + `?c=${A}`); await playing(page);
  await page.evaluate(() => document.getElementById('bPlay').click());
  ok('pauses', (await st(page)).paused === true);
  ads.on = ALL; await sleep(5000);
  let s = await st(page); ok('an ad break leaves it paused', s.paused && s.ad, JSON.stringify(s));
  ads.on = NONE; await sleep(6000);
  s = await st(page); ok('the end of the break leaves it paused', s.paused && !s.ad, JSON.stringify(s));
  await page.evaluate(() => wraith.P.restart()); await sleep(4000);
  s = await st(page); ok('a restart leaves it paused, with no spinner', s.paused && !s.spin, JSON.stringify(s));
  await page.evaluate(() => { wraith.P.user.stream.id = 'old'; return wraith.P.refresh(); }); await sleep(6000);
  s = await st(page); ok('the stream restarting leaves it paused', s.paused && await page.evaluate(() => wraith.P.userPaused), JSON.stringify(s));
  await page.evaluate(() => document.getElementById('bPlay').click()); await playing(page);
  s = await st(page); ok('and it plays when you say', !s.paused && s.t > 1, JSON.stringify(s));
  await done();
}

if (want('cover')) {
  const { c, page, ads, done } = await open({ iphone: true, w: 390, h: 844 });
  await page.goto(base + `?c=${A}`); await playing(page);
  const native = await page.evaluate(() => !!document.getElementById('vCDN').canPlayType('application/vnd.apple.mpegurl'));
  ok('this Chrome can run the Safari paths', native);
  const covered = () => page.waitForFunction(() => wraith.P.cover, null, { timeout: 30000 }).catch(() => {});
  ads.on = ALL; await covered();
  let s = await st(page);
  ok('every kind has ads: the CDN covers the break', s.cover && s.feed === 'cdn' && s.banner, JSON.stringify(s));
  ok('after trying the others', s.tried.length >= 3, s.tried.join());
  const lower = await page.evaluate(() => wraith.P.qualities()[1]?.id);
  await page.evaluate(q => wraith.P.setQuality(q), lower); await sleep(500);
  ok('a quality pick reaches the player underneath', await page.evaluate(() => wraith.P.hls.loadLevel === wraith.P.levelIndex()), lower);
  await page.evaluate(() => wraith.P.setQuality('source'));
  await page.evaluate(() => { window.__old = wraith.P.hls; window.__old.trigger('hlsError', { type: 'networkError', details: 'levelLoadError', fatal: true }); });
  await sleep(6000);
  s = await st(page);
  ok('a fatal error under the cover brings the player back', await page.evaluate(() => !!wraith.P.hls && wraith.P.hls !== window.__old), JSON.stringify(s));
  await covered();
  ads.on = NONE;
  await page.waitForFunction(() => !wraith.P.ad && wraith.P.feed === 'live', null, { timeout: 20000 }).catch(() => {});
  await playing(page);
  s = await st(page); ok('the break over: back on low latency', !s.ad && !s.cover && s.feed === 'live' && !s.paused && !s.banner, JSON.stringify(s));

  // the search taking a while: the cover comes up meanwhile, and a clean session found later takes over from it
  ads.on = new Set(['site']); ads.slow = 'popout'; ads.ms = 7000;
  await page.evaluate(() => wraith.P.dodged.clear());
  await covered();
  s = await st(page);
  ok('a slow search gets the cover meanwhile', s.cover && s.ad && await page.evaluate(() => wraith.P.dodging), JSON.stringify(s));
  await page.waitForFunction(() => !wraith.P.cover && !wraith.P.ad && wraith.P.feed === 'live', null, { timeout: 25000 }).catch(() => {});
  await playing(page);
  s = await st(page);
  ok('and the clean session it finds takes over', s.type === 'popout' && s.feed === 'live' && !s.cover && !s.ad && !s.paused && await page.evaluate(() => !document.getElementById('vCDN').dataset.url), JSON.stringify(s));
  ads.slow = null;
  await page.evaluate(() => { wraith.P.playerType = 'site'; localStorage.removeItem('wraith.playerType'); wraith.P.playLive(); });
  ads.on = NONE; await playing(page);

  // picking the CDN during a cover sticks; picking low latency during one starts a fresh session with no orphan
  ads.on = ALL; await page.evaluate(() => wraith.P.dodged.clear()); await covered();
  await page.evaluate(() => wraith.P.setPref('cdn')); await sleep(800);
  await page.waitForFunction(() => document.getElementById('spin').hidden, null, { timeout: 10000 }).catch(() => {});
  s = await st(page); ok('picking the CDN during a cover sticks', s.feed === 'cdn' && !s.cover && !s.ad && !s.hls && !s.banner && !s.spin, JSON.stringify(s));
  ads.on = NONE;
  await page.evaluate(() => wraith.P.setPref('live'));
  await playing(page);
  s = await st(page); ok('and low latency comes back', s.feed === 'live' && !s.cover && s.hls, JSON.stringify(s));
  await page.evaluate(() => localStorage.removeItem('wraith.feed'));
  ads.on = ALL; await page.evaluate(() => wraith.P.dodged.clear()); await covered();
  const n = ads.masters.length;
  await page.evaluate(() => { window.__old = wraith.P.hls; wraith.P.setPref('live'); }); await sleep(500);
  ok('low latency during a cover destroys the player it replaces', await page.evaluate(() => window.__old.media === null && window.__old !== wraith.P.hls));
  ads.on = NONE; await playing(page);
  ok('one new session', ads.masters.length === n + 1, ads.masters.slice(n).join());

  // leaving the app during a cover
  ads.on = ALL; await page.evaluate(() => wraith.P.dodged.clear()); await covered();
  await vis(page, true); await sleep(1500);
  ok('background sound comes from the CDN copy', await page.evaluate(() => wraith.BG.on && !!wraith.BG.srcs));
  ads.on = NONE;
  await page.waitForFunction(() => !wraith.P.ad, null, { timeout: 25000 }).catch(() => {});
  s = await st(page);
  ok('the break ending while away stays quiet', !s.ad && s.feed === 'live' && await page.evaluate(() => { const v = document.getElementById('vLL'); return v.muted && v.paused; }), JSON.stringify(s));
  const r0 = ads.relay; await sleep(5000);
  ok('and stops polling the relay', ads.relay - r0 <= 1, `${ads.relay - r0} calls in 5 s`);
  await vis(page, false); await playing(page);
  s = await st(page); ok('coming back plays low latency', !s.paused && s.feed === 'live' && await page.evaluate(() => !wraith.BG.on), JSON.stringify(s));

  // a channel with no CDN copy: the second break isn't black with a spinner
  await page.route(/cloudfront\.net/, route => route.fulfill({ status: 403, body: '' }));
  for (const round of ['first', 'second']) {
    ads.on = ALL; await page.evaluate(() => wraith.P.dodged.clear());
    await page.waitForFunction(() => wraith.P.ad && !wraith.P.dodging && !wraith.P.cover && !document.getElementById('vCDN').dataset.url, null, { timeout: 30000 }).catch(() => {});
    await sleep(2500);
    s = await st(page);
    ok(`no CDN copy, ${round} break: holds without a spinner`, s.ad && !s.cover && s.feed === 'live' && !s.spin, JSON.stringify(s));
    ads.on = NONE;
    await page.waitForFunction(() => !wraith.P.ad, null, { timeout: 20000 }).catch(() => {});
    await playing(page);
  }
  await page.unroute(/cloudfront\.net/);

  // a restart that comes due just after leaving the app doesn't start a second player
  await page.evaluate(() => { window.__old = wraith.P.hls; wraith.P.retries = 0; wraith.P.restart(); });
  await vis(page, true); await sleep(3000);
  ok('a restart due while away leaves the picture alone', await page.evaluate(() => wraith.P.hls === window.__old && document.getElementById('vLL').muted && wraith.BG.on));
  await vis(page, false); await playing(page);
  s = await st(page); ok('and coming back plays', !s.paused && s.feed === 'live', JSON.stringify(s));
  await done();
}

if (want('misc')) {
  const stub = () => { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__locks = (window.__locks || 0) + 1; return { release: async () => { window.__released = (window.__released || 0) + 1; }, addEventListener() {} }; } } }); };
  const { page, ads, done } = await open({ init: stub });
  await page.goto(base + `?c=${A}`); await playing(page);

  await page.evaluate(() => wraith.P.hls.trigger('hlsError', { type: 'mediaError', details: 'bufferFullError', fatal: false, error: new Error('The quota has been exceeded.') }));
  await sleep(1000);
  let s = await st(page); ok('a full buffer isn’t mistaken for Google’s limit', s.feed === 'live' && s.hls && !s.msg, JSON.stringify(s));

  await page.evaluate(() => wraith.UI.msg(null, 'Something', 'Happened'));
  await page.evaluate(() => wraith.P.playLive()); await sleep(300);
  ok('starting the live player takes any message down', !(await st(page)).msg);
  await playing(page);

  // two starts at once make one player
  await page.route('https://gql.twitch.tv/gql', async route => { if ((route.request().postData() || '').includes('streamPlaybackAccessToken')) await sleep(1200); await route.fallback(); });
  let n = ads.masters.length;
  await page.evaluate(() => { wraith.P.playLive(); wraith.P.playLive(); });
  await sleep(4000); await playing(page);
  ok('two starts at once make one player', ads.masters.length === n + 1, ads.masters.slice(n).join());
  await page.unroute('https://gql.twitch.tv/gql');

  // giving up counts whether the picture came back
  await page.evaluate(() => { wraith.P.retries = 2; wraith.P.fixes = 1; wraith.P.began = Date.now(); });
  await sleep(3500);
  ok('segments arriving don’t count as recovered', await page.evaluate(() => wraith.P.retries === 2 && wraith.P.fixes === 1));
  await sleep(6500);
  ok('a picture that keeps moving does', await page.evaluate(() => wraith.P.retries === 0 && wraith.P.fixes === 0));

  // a media error that keeps coming back ends in a restart, not a loop of recoveries
  const mediaError = () => page.evaluate(() => wraith.P.hls.trigger('hlsError', { type: 'mediaError', details: 'bufferAppendError', fatal: true }));
  await page.evaluate(() => { wraith.P.fixes = 0; wraith.P.retries = 0; window.__old = wraith.P.hls; });
  await mediaError(); await playing(page, 8000);
  ok('one recovery plays on by itself', await page.evaluate(() => wraith.P.fixes === 1 && wraith.P.hls === window.__old && !wraith.P.active().paused), JSON.stringify(await st(page)));
  for (let i = 1; i < 3; i++) { await mediaError(); await sleep(i < 2 ? 2500 : 200); }
  ok('recoveries that don’t hold end in a restart', await page.evaluate(() => wraith.P.fixes === 3 && wraith.P.retries === 1), JSON.stringify(await page.evaluate(() => [wraith.P.fixes, wraith.P.retries])));
  await sleep(2500); await playing(page);
  ok('which plays', await page.evaluate(() => wraith.P.hls !== window.__old) && !(await st(page)).paused);
  await sleep(9500);
  ok('and once it’s held, the slate is clean', await page.evaluate(() => wraith.P.fixes === 0 && wraith.P.retries === 0));

  // a slow answer about the channel you just left
  let slow = true;
  await page.route('https://gql.twitch.tv/gql', async route => {
    const b = route.request().postData() || '';
    if (!slow || !b.includes('users(logins') || !b.includes(A)) return route.fallback();
    await sleep(2500);
    const res = await route.fetch().catch(() => null);
    if (!res) return;
    const j = await res.json();
    for (const u of j.data?.users || []) if (u) u.stream = null;
    await route.fulfill({ response: res, body: JSON.stringify(j) }).catch(() => {});
  });
  await page.evaluate(() => { wraith.P.checkEnded(); }); await sleep(100);
  await page.evaluate(b => wraith.P.open(b), B);
  await sleep(4500);
  s = await st(page); ok('a slow “stream ended” for the last channel leaves this one alone', s.feed === 'live' && !s.msg && await page.evaluate(b => wraith.P.login === b, B), JSON.stringify(s));
  slow = false; await page.unroute('https://gql.twitch.tv/gql');
  await playing(page);

  // the wake lock goes with the stream
  const before = await page.evaluate(() => [window.__locks || 0, window.__released || 0]);
  await page.evaluate(() => wraith.P.ended(wraith.P.user)); await sleep(300);
  ok('a stream ending lets the screen sleep', before[0] > 0 && await page.evaluate(n => (window.__released || 0) > n, before[1]), before.join());
  s = await st(page); ok('with the offline card up and no ad banner', s.msg && !s.banner);
  await page.evaluate(() => { wraith.P.close(); });

  // Google's limit itself still counts
  await page.goto(base + `?c=${A}`); await playing(page);
  await page.evaluate(() => wraith.P.hls.trigger('hlsError', { type: 'networkError', details: 'levelLoadError', fatal: false, response: { code: 599, text: 'Exception: Service invoked too many times for one day: urlfetch.' } }));
  await sleep(500);
  s = await st(page); ok('Google’s real limit still falls back', !s.hls, JSON.stringify(s));
  await done();
}

if (want('browse')) {
  const { page, done } = await open({ w: 390, h: 844, init: () => localStorage.setItem('wraith.homeView', '"browse"') });
  await page.goto(base); await page.waitForFunction(() => document.querySelectorAll('#brList .row').length >= 30, null, { timeout: 20000 }).catch(() => {});
  const rows = () => page.evaluate(() => document.querySelectorAll('#brList .row').length);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => document.querySelectorAll('#brList .row').length > 30, null, { timeout: 15000 }).catch(() => {});
  const deep = await rows();
  ok('scrolling loads a second page', deep > 30, String(deep));
  await page.evaluate(() => scrollBy(0, 400)); await sleep(1200);
  const n = await rows(), y = await page.evaluate(() => scrollY);
  await page.evaluate(() => { wraith.Browse.at = Date.now() - 120e3; wraith.Home.load(); }); await sleep(1500);
  ok('the minute timer leaves a long list alone', await rows() === n && await page.evaluate(() => scrollY) === y, `${n} rows at ${y}`);
  // into a stream and back
  await page.evaluate(() => document.querySelector('#brList a.row').click()); await sleep(2500);
  await page.evaluate(() => { wraith.Browse.at = Date.now() - 120e3; history.back(); }); await sleep(1500);
  ok('watching something and coming back keeps your place', await rows() >= n && Math.abs(await page.evaluate(() => scrollY) - y) < 5, `${await rows()} rows at ${await page.evaluate(() => scrollY)}`);
  // a page still on its way when the list reloads
  await page.route('https://gql.twitch.tv/gql', async route => { if ((route.request().postData() || '').includes('after:')) await sleep(2000); await route.fallback(); });
  await page.evaluate(() => { wraith.Browse.end = false; wraith.Browse.busy = false; wraith.Browse.page(); });
  await sleep(100);
  await page.evaluate(() => wraith.Browse.load(true));
  await sleep(2600);
  ok('a late page doesn’t land on a fresh list', await rows() <= 60 && await page.evaluate(() => scrollY) >= 0, String(await rows()));
  await page.unroute('https://gql.twitch.tv/gql');
  // gone stale: starts over at the top
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => document.querySelectorAll('#brList .row').length > 30, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(async () => { wraith.Browse.at = Date.now() - 16 * 60e3; await wraith.Browse.load(); });
  await sleep(300);
  ok('a list gone stale starts over at the top', await rows() <= 30 && await page.evaluate(() => scrollY) === 0, `${await rows()} rows at ${await page.evaluate(() => scrollY)}`);
  await done();
}

if (want('chat')) {
  const { page, done } = await open();
  const T = Date.now();
  let delay = 2500, k = 0;
  await page.route('https://recent-messages.robotty.de/**', async route => {
    await sleep(delay);
    const messages = [];
    for (let i = 0; i < 12; i++) { k++; messages.push(`@id=h${k};tmi-sent-ts=${T - 60000 + i * 1000};user-id=9${k};display-name=Old${i} :old${i}!old${i}@old${i}.tmi.twitch.tv PRIVMSG #${A} :old line ${i}`); }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ messages }) });
  });
  // the channel's emotes taking their time while the global ones finish
  await page.route('https://7tv.io/v3/users/twitch/**', async route => { await sleep(3000); await route.continue().catch(() => {}); });
  await page.goto(base + `?c=${A}`); await sleep(900);
  await page.evaluate(ch => wraith.Chat.line(`@id=n1;tmi-sent-ts=${Date.now()};user-id=77;display-name=New :newone!newone@newone.tmi.twitch.tv PRIVMSG #${ch} :new line`), A);
  await sleep(4000);
  const order = await page.evaluate(() => { const m = [...document.querySelectorAll('#chat .m[data-ts]')], l = m.map(x => x.dataset.l); return { lastOld: l.lastIndexOf('old11'), firstOld: l.indexOf('old0'), newLine: l.indexOf('newone'), n: m.length }; });
  ok('history landing late goes above newer lines', order.lastOld >= 0 && order.newLine >= 0 && order.lastOld < order.newLine, JSON.stringify(order));
  ok('in its own order', order.firstOld < order.lastOld);
  const em = await page.evaluate(() => { const g = [...wraith.Chat.global.keys()]; return { g: g.length, kept: g.filter(k => wraith.Chat.emotes.has(k)).length, chan: wraith.Chat.chanEmotes.length }; });
  ok('global emotes survive the channel’s finishing last', em.g > 0 && em.kept === em.g, JSON.stringify(em));

  // lines held back behind a slow picture: order, deletes, timeouts, blocks
  delay = 0;
  await page.evaluate(() => { window.__cd = wraith.P.chatDelay; wraith.P.chatDelay = () => 40000; });
  await page.evaluate(ch => { const now = Date.now(); wraith.Chat.queue = []; wraith.Chat.line(`@id=q1;tmi-sent-ts=${now - 2000};user-id=41;display-name=Vic :victim!victim@victim.tmi.twitch.tv PRIVMSG #${ch} :to be timed out`); wraith.Chat.line(`@id=q2;tmi-sent-ts=${now - 1000};user-id=42;display-name=Del :deleted!deleted@deleted.tmi.twitch.tv PRIVMSG #${ch} :to be deleted`); return wraith.Chat.history(12); }, A);
  ok('held-back lines stay in time order after a reconnect’s history', await page.evaluate(() => wraith.Chat.queue.every((q, i, a) => !i || a[i - 1].ts <= q.ts)));
  await page.evaluate(ch => { wraith.Chat.line(`:tmi.twitch.tv CLEARCHAT #${ch} :victim`); wraith.Chat.line(`@target-msg-id=q2 :tmi.twitch.tv CLEARMSG #${ch} :to be deleted`); wraith.P.chatDelay = window.__cd; }, A);
  await sleep(500);
  const gone = await page.evaluate(() => ['victim', 'deleted'].map(l => document.querySelector(`#chat [data-l="${l}"]`)?.classList.contains('gone')));
  ok('a timeout and a delete catch lines still waiting', gone[0] === true && gone[1] === true, gone.join());
  await done();
}

if (want('replay')) {
  const { page, done } = await open();
  await page.goto(base); await sleep(800);
  let calls = 0;
  await page.route('https://gql.twitch.tv/gql', async route => {
    if (!(route.request().postData() || '').includes('comments(')) return route.fallback();
    calls++;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ errors: [{ message: 'boom' }] }) });
  });
  await page.evaluate(() => { wraith.Replay.open('1234567'); window.__t = setInterval(() => wraith.Replay.tick(100), 50); });
  await sleep(3000);
  ok('a failing chat replay doesn’t hammer Twitch', calls === 1, `${calls} calls in 3 s`);
  await sleep(3000);
  ok('and tries again after a while', calls === 2, `${calls} calls in 6 s`);
  await page.evaluate(() => { clearInterval(window.__t); wraith.Replay.close(); });
  await page.unroute('https://gql.twitch.tv/gql');

  // backing out of a past broadcast before it has loaded doesn't seek the next thing
  const u = (await gqlNode(`query { user(login: ${JSON.stringify(process.argv[5] || 'zackrawrr')}) { videos(first: 5, type: ARCHIVE) { edges { node { id lengthSeconds status } } } } }`)).user;
  const vods = (u?.videos?.edges || []).map(e => e.node).filter(v => v.status !== 'RECORDING' && v.lengthSeconds > 3000);
  if (vods.length > 1) {
    await page.evaluate(({ id, next }) => { localStorage.setItem(`wraith.pos.${id}`, '2000'); localStorage.removeItem(`wraith.pos.${next}`); const v = document.getElementById('vCDN'); return (async () => { wraith.P.openVod(id); for (let i = 0; i < 2000 && !v.dataset.url; i++) await new Promise(r => setTimeout(r, 5)); await wraith.P.openVod(next); })(); }, { id: vods[0].id, next: vods[1].id });
    await sleep(3500);
    const c = await page.evaluate(() => { const v = document.getElementById('vCDN'); return { t: v.currentTime, ended: v.ended, id: wraith.P.vod?.id }; });
    ok('the video after it starts at the start', c.id === vods[1].id && c.t < 15 && !c.ended, JSON.stringify(c));
  } else console.log('skip: no two VODs to try', JSON.stringify(u)?.slice(0, 120));
  await done();
}

const ME = { token: 'TOK', refresh: 'REF', exp: Date.now() + 36e5, id: '212375133', login: 'ironat___', name: 'Ironat___' };

if (want('irc')) {
  const { page, done } = await open({ init: me => localStorage.setItem('wraith.me', JSON.stringify(me)), initArg: ME });
  await page.route('https://id.twitch.tv/oauth2/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ login: 'ironat___', user_id: '212375133', client_id: 'x' }) }));
  let helix = { status: 401, wait: 0 };
  await page.route('https://api.twitch.tv/helix/**', async route => { if (helix.wait) await sleep(helix.wait); await route.fulfill({ status: helix.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: helix.status, message: 'client not allowed' }) }); });
  const seen = [], irc = { mode: 'answer', opened: 0, closed: 0 };
  await page.routeWebSocket('wss://irc-ws.chat.twitch.tv:443', ws => {
    let authed = false;
    const server = ws.connectToServer();
    ws.onMessage(m => {
      m = String(m);
      if (m.startsWith('PASS oauth:')) { authed = true; irc.opened++; ws.onClose(() => { irc.closed++; }); return; }
      if (!authed) return server.send(m);
      seen.push(m);
      if (m.startsWith('NICK')) { if (irc.mode !== 'noauth') ws.send('@user-id=1 :tmi.twitch.tv GLOBALUSERSTATE\r\n'); }
      else if (m.includes('PRIVMSG')) {
        if (irc.mode === 'answer') ws.send('@id=abc :tmi.twitch.tv USERSTATE #x\r\n');
        else if (irc.mode === 'refuse') ws.send('@msg-id=no_permission :tmi.twitch.tv NOTICE #x :You don’t have permission to do that.\r\n');
      }
    });
    server.onMessage(m => ws.send(m));
  });
  await page.goto(base + `?c=${A}`); await sleep(3000);
  const box = () => page.$eval('#sayTx', x => x.value), said = s => seen.filter(x => x === `PRIVMSG #${A} :${s}`).length;
  const say = async s => { await page.fill('#sayTx', s); await page.press('#sayTx', 'Enter'); };
  const chat = () => page.$eval('#chat', x => x.textContent);
  const settled = () => page.waitForFunction(() => !wraith.Talk.busy, null, { timeout: 9000 }).catch(() => {});
  const sent = async s => { await say(s); await sleep(50); await settled(); };

  await sent('hello');
  ok('an answered line clears the box', await box() === '' && said('hello') === 1, seen.join(' | ').slice(0, 300));
  irc.mode = 'refuse'; await sent('/mods');
  ok('any refusal comes through, not only msg_ ones', (await chat()).includes('permission') && await box() === '/mods', await box());
  irc.mode = 'silent'; await say('quiet one'); await sleep(1000);
  ok('silence isn’t success: the box waits', await box() === 'quiet one' && await page.evaluate(() => wraith.Talk.busy));
  await settled();
  ok('and then says so, keeping the text', (await chat()).includes('Twitch didn’t answer') && await box() === 'quiet one');
  ok('the socket that went silent is dropped', await page.evaluate(() => !wraith.Talk.irc && !wraith.Talk.ircQ.length));
  irc.mode = 'answer'; await sent('after that');
  ok('the next line goes on a new socket', await box() === '' && said('after that') === 1 && said('quiet one') === 1, seen.slice(-4).join(' | '));
  // a socket that never finishes connecting
  await page.evaluate(() => wraith.Talk.ircDrop());
  irc.mode = 'noauth'; await sent('stuck');
  ok('no connection: an error, not a false success', (await chat()).split('Twitch didn’t answer').length === 3 && await box() === 'stuck', await box());
  irc.mode = 'answer'; await sent('free');
  ok('and the stuck line doesn’t post with your next one', said('stuck') === 0 && said('free') === 1, seen.slice(-3).join(' | '));
  // chat's own socket seeing the line is proof too
  irc.mode = 'silent'; await say('echoed'); await sleep(1500);
  const waiting = await page.evaluate(() => wraith.Talk.busy);
  await page.evaluate(ch => wraith.Chat.line(`@id=e${Date.now()};user-id=212375133;display-name=Ironat___;tmi-sent-ts=${Date.now()} :ironat___!ironat___@ironat___.tmi.twitch.tv PRIVMSG #${ch} :echoed`), A);
  await sleep(200);
  ok('seeing it in chat counts as sent', waiting && await box() === '', String(waiting));
  // a socket quiet for a while isn't trusted
  irc.mode = 'answer';
  const opened = irc.opened;
  await page.evaluate(() => { wraith.Talk.ircRx = Date.now() - 120e3; });
  await sent('after a long quiet');
  ok('a socket long quiet is replaced', irc.opened === opened + 1 && said('after a long quiet') === 1, `${irc.opened - opened} opened`);
  // the channel changing while the API is deciding
  helix = { status: 403, wait: 1500 };
  await page.evaluate(() => { wraith.Talk.useIrc = false; });
  await say('for the first channel'); await sleep(200);
  await page.evaluate(b => wraith.P.open(b), B);
  await settled();
  ok('a line goes to the channel it was typed in', said('for the first channel') === 1 && !seen.includes(`PRIVMSG #${B} :for the first channel`), seen.slice(-2).join(' | '));
  // signing out
  const closed = irc.closed;
  await page.evaluate(() => wraith.Me.signOut()); await sleep(500);
  ok('signing out closes the signed-in socket', await page.evaluate(() => !wraith.Talk.irc && !wraith.Talk.useIrc) && irc.closed === closed + 1, `${irc.closed - closed}`);
  await done();
}

if (want('account')) {
  const { page, done } = await open({ init: me => localStorage.setItem('wraith.me', JSON.stringify(me)), initArg: ME });
  const id = { token: 'ok', wait: 0, validate: 'ok' };
  await page.route('https://id.twitch.tv/oauth2/**', async route => {
    const u = route.request().url(), json = (status, o) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.endsWith('/validate')) return id.validate === 'ok' ? json(200, { login: 'ironat___', user_id: '212375133', client_id: 'x' }) : route.abort();
    if (u.endsWith('/revoke')) return json(200, {});
    if (id.wait) await sleep(id.wait);
    return id.token === 'ok' ? json(200, { access_token: 'TOK2', refresh_token: 'REF2', expires_in: 14000 }) : json(400, { status: 400, message: 'Invalid refresh token' });
  });
  let follows = { wait: 0 }, blocks = { gql: [{ id: '999' }], helix: 200 };
  await page.route('https://gql.twitch.tv/gql', async route => {
    const q = route.request();
    if (!(q.headers().authorization || '').startsWith('OAuth')) return route.fallback();
    const b = JSON.parse(q.postData()), json = o => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (b.operationName === 'ChannelFollows') { if (follows.wait) await sleep(follows.wait); return json({ data: { user: { follows: { edges: [{ cursor: 'c', node: { login: A } }], pageInfo: { hasNextPage: false } } } } }); }
    if (/currentUser \{ login/.test(b.query || '')) return json({ data: { currentUser: { login: 'ironat___', displayName: 'Ironat___', profileImageURL: '' } } });
    if (/blockedUsers/.test(b.query || '')) return json({ data: { currentUser: { blockedUsers: blocks.gql } } });
    if (/emoteSets/.test(b.query || '')) return json({ data: { currentUser: { emoteSets: [] } } });
    return json({ data: {} });
  });
  await page.route('https://api.twitch.tv/helix/**', route => {
    const q = route.request(), h = { 'access-control-allow-origin': '*' };
    if (q.method() === 'PUT') return route.fulfill({ status: 204, headers: h });
    return route.fulfill({ status: blocks.helix, contentType: 'application/json', headers: h, body: JSON.stringify({ data: [], pagination: {} }) });
  });
  await page.goto(base); await sleep(1500);
  const acct = () => page.evaluate(() => wraith.Me.acct), stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('wraith.me') || 'null'));

  // the refresh token is spent the moment Twitch answers
  id.validate = 'down';
  await page.evaluate(() => wraith.Me.renewNow());
  ok('a renewal is kept even if nothing else works right after', (await acct()).token === 'TOK2' && (await stored()).refresh === 'REF2', JSON.stringify(await stored()));
  id.validate = 'ok';
  ok('the rest of the account stays', (await acct()).login === 'ironat___' && (await acct()).id === ME.id);

  // another tab got there first
  id.token = 'bad';
  await page.evaluate(() => { localStorage.setItem('wraith.me', JSON.stringify({ ...wraith.Me.acct, token: 'TOK3', refresh: 'OTHER' })); return wraith.Me.renewNow(); });
  ok('a tab that lost the race takes the winner’s token', (await acct())?.token === 'TOK3');
  await page.evaluate(() => wraith.Me.renewNow());
  ok('a refresh token really gone signs you out', !(await acct()));

  // signing out while something is under way
  await page.evaluate(me => wraith.Me.save(me), ME);
  id.token = 'ok'; id.wait = 800;
  await page.evaluate(async () => { const p = wraith.Me.renewNow(); wraith.Me.signOut(); await p; });
  ok('a renewal finishing after sign-out doesn’t sign you back in', !(await acct()) && !(await stored()));
  id.wait = 0;
  await page.evaluate(me => wraith.Me.save(me), ME);
  follows.wait = 800;
  await page.evaluate(async () => { const p = wraith.Me.loadFollows(); wraith.Me.out(); await p; });
  ok('a list finishing after sign-out isn’t kept', await page.evaluate(() => wraith.Me.follows === null && JSON.parse(localStorage.getItem('wraith.follows')) === null));
  follows.wait = 0;

  // blocks
  await page.evaluate(me => { wraith.Me.save(me); wraith.Me.blocks = new Set(['1', '2']); }, ME);
  blocks = { gql: [], helix: 500 };
  await page.evaluate(() => wraith.Me.loadBlocks());
  ok('an empty answer with the API down keeps what you had', await page.evaluate(() => wraith.Me.blocks.size === 2));
  blocks = { gql: [], helix: 200 };
  await page.evaluate(() => wraith.Me.loadBlocks());
  ok('unblocking your last blocked user takes effect', await page.evaluate(() => wraith.Me.blocks.size === 0));
  await page.evaluate(() => { wraith.Chat.queue = [{ ts: 1, m: { tags: { 'user-id': '5' }, prefix: '' } }, { ts: 2, m: { tags: { 'user-id': '6' }, prefix: '' } }]; return wraith.Me.block('5'); });
  ok('blocking someone catches their lines still waiting', await page.evaluate(() => wraith.Chat.queue.length === 1 && wraith.Chat.queue[0].m.tags['user-id'] === '6'));
  await page.evaluate(() => { wraith.Chat.queue = []; });

  // mentions
  await page.goto(base + `?c=${A}`); await sleep(2500);
  await page.evaluate(ch => { wraith.Chat.line(`@id=j1;tmi-sent-ts=${Date.now()};user-id=88;display-name=名前 :namae!namae@namae.tmi.twitch.tv PRIVMSG #${ch} :こんにちは`); wraith.Chat.line(`@id=j2;tmi-sent-ts=${Date.now()};user-id=89;display-name=PlainName :plainname!plainname@plainname.tmi.twitch.tv PRIVMSG #${ch} :hi`); }, A);
  await sleep(500);
  await page.evaluate(() => { document.querySelector('#chat [data-l="namae"] .n').click(); }); await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('#sheetBody .opt')].find(b => b.textContent.startsWith('Mention')).click()); await sleep(200);
  ok('Mention on a non-English name uses their login', (await page.$eval('#sayTx', x => x.value)) === '@namae ', await page.$eval('#sayTx', x => x.value));
  await page.fill('#sayTx', ''); await page.evaluate(() => { document.querySelector('#chat [data-l="plainname"] .n').click(); }); await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('#sheetBody .opt')].find(b => b.textContent.startsWith('Mention')).click()); await sleep(200);
  ok('and on a plain one, their name', (await page.$eval('#sayTx', x => x.value)) === '@PlainName ', await page.$eval('#sayTx', x => x.value));
  await page.fill('#sayTx', '@nam'); await page.type('#sayTx', 'a'); await sleep(200);
  ok('completion does the same', await page.$$eval('#ac button', b => b.map(x => x.dataset.w).join()) === '@namae', await page.$$eval('#ac button', b => b.map(x => x.dataset.w).join()));
  await done();
}

if (want('keyboard')) {
  // iPhone's keyboard, staged: it covers the page and shrinks the visual viewport.
  const { page, done } = await open({ iphone: true, w: 390, h: 844, init: me => localStorage.setItem('wraith.me', JSON.stringify(me)), initArg: ME });
  await page.route('https://id.twitch.tv/oauth2/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ login: 'ironat___', user_id: '212375133', client_id: 'x' }) }));
  await page.goto(base + `?c=${A}`); await sleep(4000);
  const kb = up => page.evaluate(up => { const vv = window.visualViewport; if (up) Object.defineProperty(vv, 'height', { configurable: true, get: () => 480 }); else delete vv.height; vv.dispatchEvent(new Event('resize')); }, up);
  await page.evaluate(() => document.getElementById('bEmote').click()); await sleep(300);
  await page.focus('#epq'); await kb(true); await sleep(200);
  await page.fill('#epq', 'a'); await sleep(200);
  const box = await page.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); return { kb: document.getElementById('watch').classList.contains('kb'), open: !document.getElementById('ep').hidden, listBottom: r('epl').bottom, listH: r('epl').height, sayBottom: r('say').bottom, stageH: r('stage').height, log: getComputedStyle(document.querySelector('.log')).display }; });
  ok('finding an emote fits above the keyboard', box.kb && box.open && box.sayBottom <= 481 && box.listH > 80 && box.log === 'none', JSON.stringify(box));
  await page.screenshot({ path: 'fixes-emote-keyboard.png' });
  await page.focus('#sayTx'); await sleep(200);
  await page.evaluate(() => window.visualViewport.dispatchEvent(new Event('resize'))); await sleep(200);
  ok('typing a message closes the picker', await page.evaluate(() => document.getElementById('ep').hidden));
  await page.evaluate(() => document.getElementById('sayTx').blur()); await kb(false); await sleep(300);
  ok('the keyboard going down restores the page', await page.evaluate(() => !document.getElementById('watch').classList.contains('kb') && document.getElementById('watch').style.height === ''));
  await done();
}

if (want('emotes')) {
  // The picker: your subs and what people here use, never the pride and gay ones, with the chat they're judged on staged.
  const { page, done } = await open({ w: 390, h: 844, init: me => localStorage.setItem('wraith.me', JSON.stringify(me)), initArg: ME });
  const json = (route, o, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  const set = (owner, type, ...tokens) => ({ owner, emotes: tokens.map(token => ({ id: '25', token, type })) });
  const XQC = { login: 'xqc', displayName: 'xQc' }, MIM = { login: 'meltymim', displayName: 'meltymim' }, HERE = { login: A, displayName: A };
  const SETS = [
    set(XQC, 'SUBSCRIPTIONS', 'xqcL', 'xqcOmega'), set(XQC, 'FOLLOWER', 'xqcLL'), set(MIM, 'SUBSCRIPTIONS', 'mimyaCheer'), set(MIM, 'FOLLOWER', 'mimyaHi'),
    set(HERE, 'SUBSCRIPTIONS', 'aaSub'), set(HERE, 'FOLLOWER', 'aaFollow'),
    set(null, 'GLOBALS', 'LUL', 'Kappa', 'GayPride', 'KappaPride', 'TransgenderPride', 'BlackLivesMatter', 'TwitchUnity', 'VirtualHug'), set(null, 'SMILIES', ':)'),
    set({ login: 'streamwithpride', displayName: 'streamwithpride' }, 'MEGA_COMMERCE', 'PrideLion'), set(null, 'MEGA_COMMERCE', 'PrideTrans'), set(null, 'PRIME', 'PokPikachu'), set(null, 'TURBO', 'KappaHD'),
  ];
  let sets = { data: { currentUser: { emoteSets: SETS } } }, history = { hold: 0, lines: { 60: [], 800: [] } }, asked = [], helix = [];
  await page.route('https://id.twitch.tv/oauth2/**', route => json(route, { login: 'ironat___', user_id: '212375133', client_id: 'x' }));
  await page.route('https://gql.twitch.tv/gql', route => {
    const q = route.request();
    if (q.method() !== 'POST') return route.fallback();
    const b = JSON.parse(q.postData());
    if (/users\(ids/.test(b.query || '')) return json(route, { data: { users: [{ id: '71092938', login: 'xqc', displayName: 'xQc' }] } });
    if (!(q.headers().authorization || '').startsWith('OAuth')) return route.fallback();
    if (/emoteSets/.test(b.query || '')) return json(route, sets);
    return json(route, { data: {} });
  });
  await page.route('https://api.twitch.tv/helix/**', route => route.request().url().includes('/chat/emotes/user') ? json(route, { data: helix, pagination: {} }) : json(route, { data: [], pagination: {} }));
  const seven = (...names) => ({ emotes: names.map(name => ({ name, data: { host: { url: '//cdn.7tv.app/emote/01F6MZGCNG000255K4X1K0NEBV' } } })) });
  await page.route('https://7tv.io/v3/users/twitch/*', route => json(route, { emote_set: seven('KEKW', 'Sadge', 'Gayge', 'gaysex', 'peepoTrans', 'transplinK', 'KasugaYeah', 'bye', 'thing', 'neverUsed', 'oldFavorite', 'Transformer') }));
  await page.route('https://7tv.io/v3/emote-sets/global', route => json(route, seven('gachiBASS', 'billyReady', 'RainbowPls', 'GlobalThing')));
  await page.route(/api\.(frankerfacez\.com|betterttv\.net)/, route => route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' }));
  await page.route('https://recent-messages.robotty.de/**', async route => {
    const n = new URL(route.request().url()).searchParams.get('limit');
    asked.push(n);
    if (history.hold && n !== '800') await sleep(history.hold);
    await json(route, { messages: history.lines[n] || [] });
  });
  const line = (who, text, id = Math.random().toString(36).slice(2)) => `@id=${id};user-id=${who};tmi-sent-ts=${Date.now()};display-name=u${who} :u${who}!u${who}@u${who}.tmi.twitch.tv PRIVMSG #${A} :${text}`;
  const say = lines => page.evaluate(ls => { for (const l of ls) wraith.Chat.line(l); }, lines);
  const crowd = (people, text) => Array.from({ length: people }, (_, i) => line(100 + i, text));
  const sections = () => page.evaluate(() => { const out = {}; for (const h of document.querySelectorAll('#epl h4')) out[h.textContent] = [...h.nextElementSibling.querySelectorAll('button')].map(b => b.dataset.w); return out; });
  const offered = async () => Object.values(await sections()).flat();
  const emotesOpen = async () => { if (await page.$eval('#ep', x => x.hidden)) await page.click('#bEmote'); await sleep(150); };
  const close = () => page.evaluate(() => wraith.Picker.show(false));
  const search = async s => { await page.fill('#epq', s); await sleep(100); };
  const complete = async s => { await page.fill('#sayTx', ''); await page.type('#sayTx', s); await sleep(100); const w = await page.$$eval('#ac button', b => b.map(x => x.dataset.w)); await page.fill('#sayTx', ''); return w; };

  await page.goto(base + `?c=${A}`);
  await page.waitForFunction(() => wraith.Me.emotes.some(e => e.sub) && wraith.Chat.chanEmotes.length && wraith.Chat.global?.size, null, { timeout: 15000 }).catch(() => {});
  await emotesOpen();
  let s = await sections();
  ok('with no chat yet it’s your emotes from here, then your other subs', JSON.stringify(Object.keys(s)) === JSON.stringify([await page.evaluate(() => wraith.P.user?.displayName), 'meltymim', 'xQc']), JSON.stringify(s));
  ok('a follower emote only where it works', Object.values(s)[0].includes('aaFollow') && !s.xQc.includes('xqcLL') && !s.meltymim.includes('mimyaHi'), JSON.stringify(s));
  ok('nothing else you own is offered', (await offered()).sort().join() === 'aaFollow,aaSub,mimyaCheer,xqcL,xqcOmega', (await offered()).join());
  await close();

  await say([
    ...crowd(4, 'KEKW so funny'), ...crowd(3, 'LUL'), ...crowd(2, 'Sadge'), ...crowd(2, 'xqcL'), ...crowd(3, 'aaFollow'),
    ...crowd(6, 'GayPride'), ...crowd(5, 'Gayge lol'), ...crowd(5, 'gachiBASS'), ...crowd(4, 'KappaPride'), ...crowd(3, 'PrideLion'), ...crowd(3, 'gaysex'), ...crowd(3, 'BlackLivesMatter'), ...crowd(3, 'VirtualHug'), ...crowd(3, 'TwitchUnity'), ...crowd(3, 'billyReady'), ...crowd(3, 'transplinK'), ...crowd(3, 'peepoTrans'),
    ...crowd(3, 'someSubEmoteYouDontHave'),
    ...crowd(4, 'the thing is it went fine'), ...crowd(2, 'bye'), line(100, '\x01ACTION Sadge\x01'),
    ...Array.from({ length: 12 }, () => line(150, 'GlobalThing')),
    line(151, 'KasugaYeah'), line(152, 'KasugaYeah'), ...crowd(2, 'Transformer'), ...crowd(2, 'RainbowPls'),
  ]);
  await emotesOpen();
  s = await sections();
  const used = s['Used in this chat'] || [], here = s[await page.evaluate(() => wraith.P.user?.displayName)] || [], all = await offered();
  ok('what people use is in and comes first, most people first', Object.keys(s)[0] === 'Used in this chat' && used[0] === 'KEKW' && used[1] === 'LUL' && used.includes('Sadge') && used.includes('bye'), used.join());
  ok('your sub emote people use here moves up', used.includes('xqcL') && !s.xQc.includes('xqcL') && s.xQc.includes('xqcOmega'), JSON.stringify(s));
  ok('from this channel too, with the rest of them under it', used.includes('aaFollow') && here.join() === 'aaSub', here.join());
  ok('Pride and gay emotes are gone, however much they’re used', !all.some(n => n !== 'KasugaYeah' && /pride|gay|gachi|billy|trans(?!former)|blacklives|unity|virtualhug/i.test(n)) && all.includes('KasugaYeah'), all.join());
  ok('names that only look like it stay', all.includes('Transformer') && all.includes('RainbowPls'), all.join());
  ok('someone else’s sub emote isn’t offered', !all.includes('someSubEmoteYouDontHave'));
  ok('a word that happens to be an emote doesn’t count in a sentence', !all.includes('thing'), all.join());
  ok('one person spamming isn’t many people', used.indexOf('GlobalThing') > used.indexOf('Sadge'), used.join());
  ok('emotes nobody used stay out', !all.includes('neverUsed') && !all.includes('Kappa') && !all.includes('PokPikachu') && !all.includes('KappaHD'), all.join());
  await page.screenshot({ path: 'fixes-picker.png' });

  // a search reaches anything you could send, and still not those
  await search('kappa');
  ok('search finds what isn’t shown', (await offered()).sort().join() === 'Kappa,KappaHD', (await offered()).join());
  await search('never');
  ok('this channel’s emotes too', (await offered()).join() === 'neverUsed', (await offered()).join());
  await search('pride');
  ok('searching for them finds nothing', (await offered()).length === 0 && (await page.$eval('#epl', x => x.textContent)).includes('No emotes match'), (await offered()).join());
  await search('gay');
  ok('nor the gay ones', (await offered()).join() === 'KasugaYeah', (await offered()).join());
  await search('');
  await page.click('#epl .epg button'); await sleep(100);
  ok('picking one still fills the box', /^\w+ $/.test(await page.$eval('#sayTx', x => x.value)), await page.$eval('#sayTx', x => x.value));
  await page.fill('#sayTx', ''); await close();

  // completion
  ok('completing leaves them out', (await complete('Kap')).join() === 'Kappa,KappaHD', (await complete('Kap')).join());
  ok('completing “gay” offers nothing', (await complete('gay')).length === 0, (await complete('gay')).join());
  ok('what people use comes first', (await complete('xq'))[0] === 'xqcL' && (await complete('Sa'))[0] === 'Sadge', (await complete('xq')).join());
  ok('and each only once', new Set(await complete('KE')).size === (await complete('KE')).length, (await complete('KE')).join());

  // chat itself is left alone
  await page.waitForFunction(() => [...document.querySelectorAll('#chat .em')].some(i => i.alt === 'Gayge'), null, { timeout: 8000 }).catch(() => {});
  ok('chat still draws what people post', await page.evaluate(() => [...document.querySelectorAll('#chat .em')].some(i => i.alt === 'Gayge')));

  // the long look back only counts: 800 lines, none drawn, and it can't get in the way of the history that is
  const old = (who, text) => line(who, text, `old${who}${text.replace(/ /g, '')}`);
  history = { hold: 1200, lines: { 60: [old(1, 'first line drawn')], 800: [old(1, 'first line drawn'), ...Array.from({ length: 5 }, (_, i) => old(200 + i, 'oldFavorite')), old(300, 'an old line nobody should see')] } };
  asked = [];
  await page.evaluate(b => wraith.P.open(b), B);
  await sleep(300);
  await page.waitForFunction(() => wraith.Chat.chanEmotes.length, null, { timeout: 8000 }).catch(() => {});
  await emotesOpen();
  ok('the picker asks at once', asked.includes('800'), asked.join());
  ok('another channel starts from nothing', !((await sections())['Used in this chat'] || []).includes('KEKW'), JSON.stringify(await sections()));
  await page.waitForSelector('#epl button[data-w="oldFavorite"]', { timeout: 5000 }).catch(() => {});
  s = await sections();
  ok('what it finds comes in while the picker’s open', (s['Used in this chat'] || []).includes('oldFavorite'), JSON.stringify(s));
  await close();
  await page.waitForFunction(() => [...document.querySelectorAll('#chat .m')].some(m => m.textContent.includes('first line drawn')), null, { timeout: 5000 }).catch(() => {});
  const chat = await page.$eval('#chat', x => x.textContent);
  ok('the look back isn’t drawn, and the slower first history still is', chat.includes('first line drawn') && !chat.includes('an old line nobody should see'), chat.slice(0, 200));
  await emotesOpen(); await close(); await sleep(4500);
  ok('it’s asked for once a channel', asked.filter(x => x === '800').length === 1 && asked.length === 2, asked.join());

  // nor the lines a reconnect fills in, though the look back has already been past them
  history.lines[300] = [old(300, 'an old line nobody should see')];
  await page.evaluate(() => wraith.Chat.history(300));
  await page.waitForFunction(() => [...document.querySelectorAll('#chat .m')].some(m => m.textContent.includes('an old line')), null, { timeout: 4000 }).catch(() => {});
  ok('a reconnect still fills in what the look back saw', (await page.$eval('#chat', x => x.textContent)).includes('an old line nobody should see'));

  // Twitch's GQL turning away the emote list: the API has it too
  await page.evaluate(() => { wraith.Me.emotes = []; });
  sets = { errors: [{ message: 'service error' }] };
  helix = [{ id: '25', name: 'xqcL', emote_type: 'subscriptions', owner_id: '71092938' }, { id: '25', name: 'xqcLL', emote_type: 'follower', owner_id: '71092938' }, { id: '25', name: 'LUL', emote_type: 'globals', owner_id: '0' }];
  await page.evaluate(() => wraith.Me.loadEmotes());
  const via = await page.evaluate(() => wraith.Me.emotes);
  ok('the API stands in for GQL', via.find(e => e.name === 'xqcL')?.sub === true && via.find(e => e.name === 'xqcL')?.by === 'xQc' && via.find(e => e.name === 'LUL')?.sub === false && via.find(e => e.name === 'xqcLL')?.owner === 'xqc', JSON.stringify(via));
  await page.evaluate(() => wraith.UI.owner?.());
  await done();
}

if (want('fullscreen')) {
  // An iPhone, staged: no element fullscreen, only the video's own player, which pauses the video some time around closing.
  const { page, done } = await open({ iphone: true, w: 951, h: 669, init: () => {
    delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;
    HTMLVideoElement.prototype.webkitEnterFullscreen = function () { if (window.__refuse) throw new DOMException('not ready', 'InvalidStateError'); window.__full = this.id; };
  } });
  await page.goto(base + `?c=${A}`); await playing(page);
  const paused = () => page.evaluate(() => wraith.P.active().paused);
  const fill = () => page.evaluate(() => document.getElementById('watch').classList.contains('full'));
  const closes = script => page.evaluate(script);
  const closed = "wraith.P.active().dispatchEvent(new Event('webkitendfullscreen'))";

  await page.evaluate(() => document.getElementById('bFull').click());
  ok('the button hands the video to iOS’s player', await page.evaluate(() => window.__full === wraith.P.active().id) && !(await fill()), await page.evaluate(() => String(window.__full)));

  await closes(`${closed}; setTimeout(() => wraith.P.active().pause(), 300);`); await sleep(1000);
  ok('closing it plays on when the pause comes after', !(await paused()));
  await closes(`wraith.P.active().pause(); ${closed};`); await sleep(700);
  ok('and when it comes first', !(await paused()));
  await closes(`${closed}; setTimeout(() => wraith.P.active().pause(), 100); setTimeout(() => wraith.P.active().pause(), 700);`); await sleep(1400);
  ok('and when it comes again after the first play', !(await paused()));
  await sleep(2500);

  await page.evaluate(() => wraith.P.active().pause()); await sleep(1800);
  await closes(closed); await sleep(800);
  ok('a pause from well before closing holds', await paused());
  await page.evaluate(() => wraith.P.active().play()); await playing(page);

  await closes(closed); await sleep(100);
  await page.evaluate(() => document.getElementById('bPlay').click()); await sleep(1000);
  ok('pausing just after closing holds', await paused() && await page.evaluate(() => wraith.P.userPaused));
  await page.evaluate(() => document.getElementById('bPlay').click()); await playing(page);
  await sleep(2600);

  // going to the Home Screen hands sound to the background player, and the picture stays out of it
  await page.evaluate(() => { const P = wraith.P, real = P.play; window.__plays = 0; P.play = function (v) { window.__plays++; return real.call(this, v); }; });
  await closes(closed); await vis(page, true); await sleep(800);
  ok('leaving the app as it closes doesn’t start the picture', await page.evaluate(() => window.__plays === 0), await page.evaluate(() => String(window.__plays)));
  await vis(page, false); await playing(page);

  // nothing to hand over yet: it fills the screen instead, and the button undoes that
  await page.evaluate(() => { window.__refuse = true; window.__full = null; document.getElementById('bFull').click(); });
  ok('with the player refusing, the picture fills the screen', await fill());
  await page.evaluate(() => document.getElementById('bFull').click());
  ok('and the button undoes it', !(await fill()));
  await done();
}

if (want('scroll')) {
  // Chat follows until you scroll up, whatever the lines do meanwhile.
  const { page, done } = await open({ w: 390, h: 844 });
  await page.goto(base + `?c=${A}`); await playing(page);
  await page.evaluate(ch => { for (let i = 0; i < 80; i++) wraith.Chat.line(`@id=s${i};user-id=${i};tmi-sent-ts=${Date.now() - 60e3};display-name=u${i} :u${i}!u${i}@u${i}.tmi.twitch.tv PRIVMSG #${ch} :line ${i}`); }, A);
  await sleep(600);
  const state = () => page.evaluate(() => ({ stick: wraith.Chat.stick, pill: !document.getElementById('more').hidden }));
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const grow = px => page.evaluate(px => { const b = wraith.Chat.box, d = document.createElement('div'); b.scrollTop = b.scrollHeight; d.style.height = px + 'px'; b.append(d); }, px);
  await page.evaluate(() => { const b = wraith.Chat.box; b.scrollTop = b.scrollHeight - 200; }); await frame();
  await page.evaluate(() => { document.getElementById('more').click(); }); await frame();
  await grow(90); await frame(); await sleep(50);
  let s = await state();
  ok('lines growing after a scroll to the end don’t stop it following', s.stick && !s.pill, JSON.stringify(s));
  await page.evaluate(() => { const b = wraith.Chat.box; b.scrollTop = b.scrollHeight; }); await frame();
  await page.evaluate(() => { const b = wraith.Chat.box; b.scrollTop -= 300; }); await frame(); await sleep(50);
  s = await state();
  ok('scrolling up does', !s.stick, JSON.stringify(s));
  await page.evaluate(ch => wraith.Chat.line(`@id=after;user-id=7;tmi-sent-ts=${Date.now() - 60e3};display-name=u7 :u7!u7@u7.tmi.twitch.tv PRIVMSG #${ch} :one more`), A);
  await page.waitForFunction(() => !document.getElementById('more').hidden, null, { timeout: 8000 }).catch(() => {});
  s = await state();
  ok('and new lines then wait behind the pill', !s.stick && s.pill, JSON.stringify(s));
  await page.evaluate(() => { const b = wraith.Chat.box; b.scrollTop = b.scrollHeight; }); await frame(); await sleep(50);
  s = await state();
  ok('scrolling back down follows again', s.stick && !s.pill, JSON.stringify(s));
  await done();
}

// The background sound, as far as Chrome can stage iOS: what iOS would do to the audio player is done to it directly.
const snd = page => page.evaluate(() => { const a = document.getElementById('aBG'), B = wraith.BG, P = wraith.P; return { on: B.on, wanted: B.wanted, held: B.held, paused: a.paused, src: !!a.getAttribute('src'), feed: P.feed, vPaused: P.active()?.paused, vMuted: document.getElementById('vLL').muted, userPaused: P.userPaused, msg: document.getElementById('msgbox').hidden ? '' : document.getElementById('msgbox').textContent }; });
const sounding = page => page.waitForFunction(() => { const a = document.getElementById('aBG'); return wraith.BG.on && !a.paused && a.currentTime > 0 && a.readyState >= 3; }, null, { timeout: 25000 }).catch(() => {});
const cc = (page, what) => page.evaluate(w => window.__ms[w](), what);
const captureButtons = () => { window.__ms = {}; const ms = navigator.mediaSession, real = ms.setActionHandler.bind(ms); ms.setActionHandler = (a, f) => { window.__ms[a] = f; real(a, f); }; };

if (want('sound')) {
  const { page, ads, done } = await open({ iphone: true, init: captureButtons });
  await page.goto(base + `?c=${A}`); await playing(page);
  await vis(page, true); await sounding(page);
  let s = await snd(page);
  ok('leaving the app hands over the sound', s.on && s.wanted && !s.paused && s.vPaused && s.vMuted, JSON.stringify(s));
  await page.evaluate(() => wraith.BG.hls.trigger(Hls.Events.ERROR, { type: Hls.ErrorTypes.MEDIA_ERROR, details: 'bufferAppendError', fatal: true }));
  await sounding(page);
  s = await snd(page);
  ok('a media error while away: the sound carries on', s.on && s.wanted && !s.paused, JSON.stringify(s));

  // another app takes the sound
  await page.evaluate(() => document.getElementById('aBG').pause()); await sleep(300);
  s = await snd(page);
  ok('another app taking the sound stops it', s.on && !s.wanted && s.paused && !s.held, JSON.stringify(s));
  let r0 = ads.relay; await sleep(5000);
  ok('and stops polling the relay', ads.relay - r0 <= 1, `${ads.relay - r0} calls in 5 s`);
  await page.evaluate(() => document.getElementById('aBG').play()); await sleep(800);
  ok('iOS starting it again when that app stops doesn’t take', (await snd(page)).paused);
  await page.evaluate(() => { wraith.P.user.stream.id = 'older'; wraith.P.refresh(); });
  await page.waitForFunction(() => wraith.P.hls?.levels?.length, null, { timeout: 15000 }).catch(() => {}); await sleep(2500);
  s = await snd(page);
  ok('nor does the stream restarting', !s.on && s.paused, JSON.stringify(s));
  await vis(page, false); await sleep(500);
  await page.evaluate(() => { wraith.P.userPaused = false; wraith.P.play(wraith.P.active()); }); await playing(page);

  await vis(page, true); await sounding(page);
  await page.evaluate(() => document.getElementById('aBG').pause()); await sleep(300);
  await cc(page, 'play'); await sounding(page);
  s = await snd(page);
  ok('Control Center brings it back', s.wanted && !s.paused && !s.held, JSON.stringify(s));
  await page.evaluate(() => document.getElementById('aBG').pause()); await sleep(300);
  await vis(page, false); await playing(page);
  s = await snd(page);
  ok('so does coming back, since you didn’t pause it', !s.on && !s.vPaused && !s.userPaused && !s.vMuted && s.paused && !s.src, JSON.stringify(s));

  // every button stops what you hear, whatever iOS thinks is playing
  await vis(page, true); await sounding(page);
  await cc(page, 'play'); await sleep(300);
  s = await snd(page);
  ok('with sound playing, the play button stops it', s.paused && s.held && !s.wanted, JSON.stringify(s));
  r0 = ads.relay; await sleep(4000);
  ok('and stops polling the relay', ads.relay - r0 <= 1, `${ads.relay - r0} calls in 4 s`);
  await page.evaluate(() => wraith.BG.hls.trigger(Hls.Events.ERROR, { type: Hls.ErrorTypes.NETWORK_ERROR, details: 'levelLoadError', fatal: true })); await sleep(3000);
  ok('a load failing just then doesn’t start it polling again', ads.relay - r0 <= 1, `${ads.relay - r0} calls`);
  await cc(page, 'play'); await sounding(page);
  ok('pressed again it starts', !(await snd(page)).paused);
  await cc(page, 'stop'); await sleep(300);
  ok('stop stops it', (await snd(page)).paused);
  await cc(page, 'play'); await sounding(page);
  await cc(page, 'pause'); await sleep(300);
  ok('pause stops it', (await snd(page)).paused);
  await vis(page, false); await sleep(1500);
  s = await snd(page);
  ok('and your pause holds on coming back', s.vPaused && s.userPaused && !s.on, JSON.stringify(s));

  await vis(page, true); await sleep(600);
  ok('leaving while paused stays quiet', !(await snd(page)).on);
  await cc(page, 'play'); await sounding(page);
  s = await snd(page);
  ok('and Control Center’s play starts the sound', s.on && !s.paused && !s.userPaused, JSON.stringify(s));
  await page.evaluate(() => wraith.P.play(document.getElementById('vLL'))); await sleep(800);
  s = await snd(page);
  ok('the picture can’t start over the sound', s.vPaused && s.vMuted, JSON.stringify(s));
  // the stream restarting while you listen carries on
  await page.evaluate(() => { wraith.P.user.stream.id = 'older'; wraith.P.refresh(); }); await sleep(800); await sounding(page);
  s = await snd(page);
  ok('a stream restarting while you listen carries on', s.on && !s.paused && !s.userPaused, JSON.stringify(s));
  // iOS not saying the app came back
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }));
  await playing(page);
  s = await snd(page);
  ok('a lost “you’re back” still hands the sound back', !s.on && s.paused && !s.vPaused, JSON.stringify(s));
  await vis(page, false);

  // what was playing as you left decides
  await page.evaluate(() => wraith.P.active().pause()); await sleep(2500);
  await vis(page, true); await sleep(600);
  ok('a picture iOS paused well before you left has no sound to carry on', !(await snd(page)).on);
  await vis(page, false); await page.evaluate(() => wraith.P.active().play()); await playing(page);
  await page.evaluate(() => { wraith.P.active().pause(); }); await vis(page, true); await sounding(page);
  ok('one iOS paused as you left does', (await snd(page)).on);
  await vis(page, false); await playing(page);
  await page.evaluate(() => { wraith.P.active().muted = true; }); await vis(page, true); await sleep(600);
  ok('one still muted from starting by itself doesn’t', !(await snd(page)).on);
  await vis(page, false); await page.evaluate(() => { wraith.P.active().muted = false; });
  await page.evaluate(() => document.getElementById('bSet').click()); await sleep(1500);
  const sheet = await page.$eval('#sheetBody', x => x.textContent);
  ok('the settings sheet shows the record', /Away: .*\b(left|back|sound on)\b/.test(sheet), sheet.slice(-160));
  await page.evaluate(() => document.getElementById('scrim').click());
  await done();
}

if (want('sound')) {
  // Leaving from iOS's fullscreen player: it comes out of it, or Control Center stays with the paused picture.
  const { page, done } = await open({ iphone: true, w: 951, h: 669, init: () => {
    delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;
    Object.defineProperty(HTMLVideoElement.prototype, 'webkitDisplayingFullscreen', { configurable: true, get() { return window.__fs === this; } });
    HTMLVideoElement.prototype.webkitEnterFullscreen = function () { window.__fs = this; };
    HTMLVideoElement.prototype.webkitExitFullscreen = function () { window.__fs = null; window.__exits = (window.__exits || 0) + 1; this.dispatchEvent(new Event('webkitendfullscreen')); };
  } });
  await page.goto(base + `?c=${A}`); await playing(page);
  await page.evaluate(() => document.getElementById('bFull').click());
  ok('fullscreen hands the video to iOS’s player', await page.evaluate(() => window.__fs === wraith.P.active()));
  await vis(page, true); await sounding(page);
  let s = await snd(page);
  ok('leaving brings it out of that player', await page.evaluate(() => window.__fs === null && window.__exits === 1) && s.on && !s.paused && s.vPaused, JSON.stringify(s));
  await vis(page, false); await playing(page);
  s = await snd(page);
  ok('and coming back plays', !s.on && !s.vPaused && !s.vMuted, JSON.stringify(s));
  await done();
}

if (want('pages')) {
  // iOS leaving a page running behind a new one.
  const { c, page, ads, done } = await open({ iphone: true });
  await page.goto(base + `?c=${A}`); await playing(page);
  await vis(page, true); await sounding(page);
  const second = await c.newPage();
  await second.goto(base); await sleep(1000);
  let s = await snd(page);
  ok('a page coming up stops the one out of sight', !s.on && s.paused && !s.src && !s.feed, JSON.stringify(s));
  ok('which says so if you get back to it', /another window/.test(s.msg), s.msg);
  const r0 = ads.relay; await sleep(4000);
  ok('and stops polling the relay', ads.relay === r0, `${ads.relay - r0} calls in 4 s`);
  await vis(page, false);
  await page.evaluate(() => document.querySelector('#msgbox button').click()); await playing(page);
  s = await snd(page);
  ok('its button plays it there', s.feed === 'live' && !s.vPaused && !s.msg, JSON.stringify(s));

  await second.reload(); await sleep(1000);
  ok('a page coming up leaves one in view alone', !(await snd(page)).vPaused);
  // the new page came up first, then this one went out of sight
  await vis(page, true); await sleep(1000);
  s = await snd(page);
  ok('going out of sight with another page on screen makes no sound', !s.on && s.paused && /another window/.test(s.msg), JSON.stringify(s));
  await vis(page, false);
  await page.evaluate(() => document.querySelector('#msgbox button').click()); await playing(page);
  await second.goto(base + `?c=${B}`); await playing(second);
  s = await snd(page);
  ok('a page starting a stream stops the other', !s.feed && /another window/.test(s.msg), JSON.stringify(s));
  ok('and plays', !(await snd(second)).vPaused);

  // out of sight from the start: it doesn't play, and doesn't stop the one you're watching
  const third = await c.newPage();
  await third.addInitScript(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); });
  await third.goto(base + `?c=${A}`);
  await third.waitForFunction(() => wraith.P.hls?.levels?.length, null, { timeout: 15000 }).catch(() => {}); await sleep(2500);
  ok('a page never on screen makes no sound', !(await snd(third)).on);
  ok('and leaves the one playing alone', !(await snd(second)).vPaused);
  await third.close(); await second.close();
  await done();
}

if (want('layout')) {
  // Every shape of screen, with Apple's safe areas: what takes up the room, and what stays clear of the status pill.
  const { c, page, done } = await open({ iphone: true, w: 951, h: 669, init: me => localStorage.setItem('wraith.me', JSON.stringify(me)), initArg: ME });
  await page.route('https://id.twitch.tv/oauth2/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ login: 'ironat___', user_id: '212375133', client_id: 'x' }) }));
  const cdp = await c.newCDPSession(page);
  const shape = async (width, height, insets) => { await page.setViewportSize({ width, height }); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 0, left: 0, ...insets } }); await sleep(400); };
  const box = () => page.evaluate(() => { const r = s => { const n = document.querySelector(s); if (!n || (!n.offsetParent && getComputedStyle(n).position !== 'fixed')) return null; const b = n.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; }; return { stage: r('#stage'), log: r('.log'), info: r('.info'), say: r('#say'), tabs: r('.tabs'), x: r('#bChanX'), follow: r('#bFollow'), side: r('.side'), vods: r('#paneVods') }; });
  const near = (a, b, by = 2) => Math.abs(a - b) <= by;
  await shape(951, 669, { right: 84, bottom: 34 });
  await page.goto(base + `?c=${A}`); await playing(page);
  await page.evaluate(() => { document.getElementById('watch').classList.add('nochat'); });   // however side chat was left
  let b = await box();
  ok('Duo open, on its side: picture top left, as wide as the status strip allows', b.stage.x === 0 && b.stage.y === 0 && near(b.stage.w, 867) && near(b.stage.h, 488), JSON.stringify(b.stage));
  ok('chat under it, messages using the whole height', b.log && near(b.log.y, b.stage.b, 2) && near(b.log.b, 669) && b.log.x === 0 && b.log.w >= 600, JSON.stringify(b.log));
  ok('the box to their right, on screen', b.say && b.say.x >= b.log.r - 1 && b.say.y >= b.stage.b && b.say.b <= 669 && b.say.r <= 951, JSON.stringify(b.say));
  ok('the channel row above the box', b.info && b.info.y >= b.stage.b && b.info.b <= b.say.y + 1 && b.info.x >= b.log.r - 1, JSON.stringify(b.info));
  ok('no tabs, follow button', !b.tabs && !b.follow, JSON.stringify([b.tabs, b.follow]));
  await page.screenshot({ path: 'fixes-duo-inner.png', timeout: 8000 }).catch(() => {});
  await page.click('#bChan'); await sleep(400);
  b = await box();
  ok('tapping the channel leaves the picture where it is', near(b.stage.w, 867) && b.stage.y === 0, JSON.stringify(b.stage));
  ok('it opens in chat’s place', b.vods && b.vods.x === 0 && b.vods.y >= 488 && b.vods.b <= 669 && !b.log, JSON.stringify(b.vods));
  await page.waitForFunction(() => document.querySelectorAll('#vods a.vod').length > 4, null, { timeout: 8000 }).catch(() => {});
  ok('its videos scroll sideways in the strip, nothing cut off', await page.evaluate(() => { const v = document.getElementById('vods'), a = v.querySelector('a.vod').getBoundingClientRect(), last = [...v.querySelectorAll('a.vod')].slice(0, 2).pop().getBoundingClientRect(); return v.scrollWidth > v.clientWidth && a.height < 80 && last.bottom <= 669 && v.scrollHeight <= v.clientHeight + 1; }));
  ok('the tabs and follow button beside them, above the home bar', b.tabs.x >= b.vods.r - 1 && b.tabs.b <= 669 && b.x.r <= 951 && b.follow && b.follow.y >= 488 && b.follow.r <= 951, JSON.stringify([b.tabs, b.x, b.follow]));
  await page.click('.tabs [data-pane=about]'); await sleep(1500);
  ok('about opens there too', await page.evaluate(() => { const a = document.getElementById('paneAbout').getBoundingClientRect(); return a.y >= 488 && a.x === 0 && document.getElementById('about').textContent.length > 10; }));
  await page.click('.tabs [data-pane=vods]'); await sleep(200);
  await page.screenshot({ path: 'fixes-duo-channel.png', timeout: 8000 }).catch(() => {});
  await page.click('#bChanX'); await sleep(300);
  b = await box();
  ok('the x brings it all back', near(b.stage.w, 867) && !b.tabs, JSON.stringify(b.stage));
  // the keyboard
  await page.evaluate(() => { const vv = window.visualViewport; Object.defineProperty(vv, 'height', { configurable: true, get: () => 370 }); });
  await page.focus('#sayTx'); await page.evaluate(() => window.visualViewport.dispatchEvent(new Event('resize'))); await sleep(300);
  b = await box();
  ok('with the keyboard up, picture and chat fit above it', b.stage.b <= 371 && b.say.b <= 371 && b.log.h > 100 && b.stage.h > 200, JSON.stringify([b.stage, b.log, b.say]));
  await page.evaluate(() => { document.getElementById('sayTx').blur(); delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); }); await sleep(300);
  // the other way up: the strip on the left
  await shape(951, 669, { left: 84, bottom: 34 });
  b = await box();
  ok('turned around, clear of the strip on the left', b.stage.x === 84 && b.stage.r === 951 && near(b.stage.h, 488), JSON.stringify(b.stage));
  await shape(678, 466, { right: 84, bottom: 21 });
  b = await box();
  ok('Duo closed, on its side: clear of the strip, and chat has room', b.stage.r <= 594 && b.log.h >= 140 && b.say.b <= 466 && b.info.y >= b.stage.b, JSON.stringify([b.stage, b.log, b.say, b.info]));
  await page.screenshot({ path: 'fixes-duo-closed.png', timeout: 8000 }).catch(() => {});
  await shape(669, 951, { top: 59, bottom: 34 });
  b = await box();
  ok('Duo open, upright: picture, one thin row, chat', b.stage.w === 669 && b.info.h <= 46 && near(b.info.y, b.stage.b) && near(b.side.y, b.info.b) && !b.tabs, JSON.stringify([b.stage, b.info, b.side]));
  await page.screenshot({ path: 'fixes-duo-upright.png', timeout: 8000 }).catch(() => {});
  await shape(390, 844, { top: 59, bottom: 34 });
  b = await box();
  ok('a phone upright: the same', b.stage.w === 390 && b.info.h <= 46 && !b.tabs, JSON.stringify([b.stage, b.info]));
  await page.screenshot({ path: 'fixes-phone.png', timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.getElementById('watch').classList.remove('nochat'));
  await shape(844, 390, { left: 59, right: 59, bottom: 21 });
  b = await box();
  ok('a phone on its side: picture and chat side by side, no row', b.side && b.side.x >= b.stage.r - 1 && !b.info && b.stage.h >= 200, JSON.stringify([b.stage, b.side]));
  await page.evaluate(() => { document.getElementById('stage').classList.add('ui'); document.getElementById('hudName').click(); }); await sleep(300);
  b = await box();
  ok('there the name in the controls opens the channel', !!b.tabs && !!b.info, JSON.stringify(b.tabs));
  await page.click('#bChanX'); await sleep(200);
  await shape(1440, 900, {});
  b = await box();
  ok('a desktop window: side by side', b.side && b.side.x >= b.stage.r - 1 && b.stage.w > 900, JSON.stringify([b.stage, b.side]));
  await page.evaluate(() => document.getElementById('watch').classList.add('nochat')); await sleep(200);
  b = await box();
  ok('and chat can still be hidden there', !b.side, JSON.stringify(b.side));
  await done();
}

await browser.close(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
