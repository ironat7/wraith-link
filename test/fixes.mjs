// usage: node fixes.mjs [section|all] [channel] [other channel]. Sections: pause cover misc browse chat replay irc account keyboard
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
      ads.masters.push(kind);
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
  for (let i = 0; i < 3; i++) { await mediaError(); await sleep(i < 2 ? 2500 : 200); }
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
  const u = (await gqlNode(`query { user(login: ${JSON.stringify(process.argv[5] || 'zackrawrr')}) { videos(first: 3, type: ARCHIVE) { edges { node { id lengthSeconds status } } } clips(first: 1, criteria: { period: LAST_MONTH }) { edges { node { slug } } } } }`)).user;
  const vod = u?.videos?.edges?.map(e => e.node).find(v => v.status !== 'RECORDING' && v.lengthSeconds > 3000), slug = u?.clips?.edges?.[0]?.node?.slug;
  if (vod && slug) {
    await page.evaluate(({ id, slug }) => { localStorage.setItem(`wraith.pos.${id}`, '2000'); const v = document.getElementById('vCDN'); return (async () => { wraith.P.openVod(id); for (let i = 0; i < 2000 && !v.dataset.url; i++) await new Promise(r => setTimeout(r, 5)); await wraith.P.openClip(slug); })(); }, { id: vod.id, slug });
    await sleep(3500);
    const c = await page.evaluate(() => { const v = document.getElementById('vCDN'); return { t: v.currentTime, d: v.duration, ended: v.ended, feed: wraith.P.feed }; });
    ok('the clip after it starts at the start', c.feed === 'clip' && c.t < 15 && !c.ended, JSON.stringify(c));
  } else console.log('skip: no VOD and clip to try', JSON.stringify(u)?.slice(0, 120));
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

await browser.close(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
