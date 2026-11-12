// Usually run through run.mjs, side by side. usage: node fixes.mjs [section|all] [channel] [other channel]. Sections on real channels, watching a stream made here but with Twitch's own lists, chat and CDN copies: pause cover misc browse chat replay irc account keyboard emotes fullscreen scroll sound pages layout recover. All staged, needing no channel: relay vod cdn away screen lists duo unseen update chatq return player budget pill lists2 battery.
// Checks for the bugs code reviews have found, with the failures staged.
// An iPhone user agent turns on the Safari paths (the CDN cover, background sound) in Chrome, whose native HLS can run them.
import { serve, launch, sleep, checks, IPHONE, makeStream, SILENCE } from './lib.mjs';
const srv = await serve(), { base } = srv;
const browser = await launch();
const which = process.argv[2] || 'all', want = s => which === 'all' || which === s;
const CID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const gqlNode = async q => (await (await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': CID, 'Content-Type': 'application/json', 'X-Device-Id': 'wraithtests0000000000000000000000' }, body: JSON.stringify({ query: q }) })).json()).data;
let A = process.argv[3], B = process.argv[4];
if (!['relay', 'vod', 'cdn', 'away', 'screen', 'lists', 'duo', 'unseen', 'update', 'chatq', 'return', 'player', 'budget', 'pill', 'lists2', 'battery'].includes(which) && (!A || !B)) {
  // one that keeps its past broadcasts, which the channel page's checks look through (the top channel on 2026-11-05 kept none)
  const top = (await gqlNode('query { streams(first: 12) { edges { node { broadcaster { login videos(first: 1, type: ARCHIVE) { edges { node { id } } } } } } } }')).streams.edges.map(e => e.node.broadcaster);
  A ||= (top.find(b => b.videos?.edges?.length) || top[0]).login; B ||= top.map(b => b.login).find(x => x !== A);
}
if (A) console.log('channels', A, B);
const { ok, report } = checks();
const ALL = new Set(['site', 'popout', 'embed', 'frontpage']), NONE = new Set();

async function open({ iphone = false, init, initArg, w = 900, h = 1000, touch = false } = {}) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, userAgent: iphone ? IPHONE : undefined, hasTouch: touch, isMobile: touch });
  if (init) await c.addInitScript(init, initArg);
  await c.addInitScript(() => { const t = setInterval(() => { if (window.wraith?.Sheet) { clearInterval(t); window.wraith.Sheet.details = true; } }, 20); });   // the sheet's details open: they're only filled in then
  const page = await c.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  // stages ad breaks by kind of session, and counts what goes through the relay
  const ads = { on: NONE, masters: [], relay: 0, slow: null, ms: 0 };
  const kindOf = new Map();
  await makeStream(page, async (route, u, body) => {
    if (u) ads.relay++;
    let b = body;
    if (u?.includes('usher.ttvnw.net')) {
      const kind = JSON.parse(new URL(u).searchParams.get('token') || '{}').player_type || '?';
      if (!kindOf.has(u)) ads.masters.push(kind);   // a slow fetch's twin is the same session
      kindOf.set(u, kind);
      if (ads.slow === kind) await sleep(ads.ms);
      for (const l of b.split('\n')) if (l.startsWith('https://')) kindOf.set(l.trim(), kind);
      const cut = b.indexOf('\n#WRAITH-MEDIA:');   // the first media playlist comes along with the master
      if (cut >= 0) { const rest = b.slice(cut + 15), eol = rest.indexOf('\n'), url = rest.slice(0, eol).split(' ')[1]; kindOf.set(url, kind); if (ads.on.has(kind)) b = b.replace(/(#EXTINF:[\d.]+),live/g, '$1,Amazon|1'); }
    } else if (ads.on.has(kindOf.get(u)) && b.includes('#EXTINF')) b = b.replace(/(#EXTINF:[\d.]+),live/g, '$1,Amazon|1');
    await route.fulfill({ status: 200, headers, body: b }).catch(() => {});
  });
  return { c, page, ads, done: async () => { ok('no page errors', page.errors.length === 0, page.errors.join(' | ')); await page.unrouteAll({ behavior: 'ignoreErrors' }); await c.close(); } };
}
const playing = (page, ms = 25000) => page.waitForFunction(() => { const v = wraith.P.active(); return v && !v.paused && v.currentTime > 1 && v.readyState >= 3; }, null, { timeout: ms }).catch(() => {});
const st = page => page.evaluate(() => { const P = wraith.P, v = P.active(); return { feed: P.feed, ad: P.ad, cover: P.cover, type: P.playerType, paused: v?.paused, t: +(v?.currentTime || 0).toFixed(1), h: v?.videoHeight, lat: +(P.latency() || 0).toFixed(1), hls: !!P.hls, spin: !document.getElementById('spin').hidden, banner: !document.getElementById('banner').hidden, msg: !document.getElementById('msgbox').hidden, retries: P.retries, tried: [...P.dodged], errs: P.errs }; });
const vis = (page, hidden) => page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);

// The background sound, as far as Chrome can stage iOS: what iOS would do to the audio player is done to it directly.
const snd = page => page.evaluate(() => { const a = document.getElementById('aBG'), B = wraith.BG, P = wraith.P; return { on: B.on, wanted: B.wanted, held: B.held, paused: a.paused, src: !!a.getAttribute('src'), feed: P.feed, vPaused: P.active()?.paused, vMuted: document.getElementById('vLL').muted, userPaused: P.userPaused, msg: document.getElementById('msgbox').hidden ? '' : document.getElementById('msgbox').textContent }; });
const sounding = page => page.waitForFunction(() => { const a = document.getElementById('aBG'); return wraith.BG.on && !a.paused && a.currentTime > 0 && a.readyState >= 3; }, null, { timeout: 25000 }).catch(() => {});
const cc = (page, what) => page.evaluate(w => window.__ms[w](), what);
const captureButtons = () => { window.__ms = {}; const ms = navigator.mediaSession, real = ms.setActionHandler.bind(ms); ms.setActionHandler = (a, f) => { window.__ms[a] = f; real(a, f); }; };

// Twitch and the relay staged, with no real stream anywhere. Normal is ~1 s a relay call with the odd 3 s stall, and Apps Script waking up takes several.
const MASTER = '200\n#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.64001f,mp4a.40.2",VIDEO="chunked"\nhttps://x.playlist.ttvnw.net/chunked.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS="mp4a.40.2",VIDEO="audio_only"\nhttps://x.playlist.ttvnw.net/audio.m3u8\n';
const MEDIA = '200\n#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:2.000,live\nhttps://x.hls.ttvnw.net/1.ts\n#EXTINF:2.000,live\nhttps://x.hls.ttvnw.net/2.ts\n';
// the audio_only feed: a live playlist of silence, two seconds a segment
const AUDIO = () => { const n = Math.floor(Date.now() / 2000); return `200\n#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:${n}\n` + [0, 1, 2, 3, 4, 5].map(i => `#EXTINF:2.000,live\nhttps://x.hls.ttvnw.net/${n + i}.aac\n`).join(''); };
// the CDN's copy of a stream, as a finished playlist: Chrome's native HLS stalls on a growing one, and a seek can break it
const DVR = '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-PLAYLIST-TYPE:VOD\n' + Array.from({ length: 300 }, (_, i) => `#EXTINF:2.000,\n${i}.aac\n`).join('') + '#EXT-X-ENDLIST\n';
const headers = { 'access-control-allow-origin': '*' }, never = () => {};
// iOS's fullscreen player as WebKit has it: asking to leave only queues the end-of-fullscreen event, reloading the video cancels what's
// queued, and the player's told to close when that event goes out, by whoever sends it, with the video no longer in fullscreen.
const iosFullscreen = () => {
  delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;
  window.__told = 0;
  Object.defineProperty(HTMLVideoElement.prototype, 'webkitDisplayingFullscreen', { configurable: true, get() { return window.__fs === this; } });
  HTMLVideoElement.prototype.webkitEnterFullscreen = function () { window.__fs = this; setTimeout(() => this.dispatchEvent(new Event('webkitbeginfullscreen'))); };
  HTMLVideoElement.prototype.webkitExitFullscreen = function () { window.__fs = null; this.__end = setTimeout(() => this.dispatchEvent(new Event('webkitendfullscreen'))); };
  const load = HTMLMediaElement.prototype.load;
  HTMLMediaElement.prototype.load = function () { clearTimeout(this.__end); return load.call(this); };
  const send = EventTarget.prototype.dispatchEvent;
  HTMLVideoElement.prototype.dispatchEvent = function (e) { const r = send.call(this, e); if (e.type === 'webkitendfullscreen' && window.__fs !== this) window.__told++; return r; };
};
const answer = route => { const u = route.request().url(); return route.fulfill({ status: 200, headers, body: u.includes('usher') ? MASTER : u.includes('audio') ? AUDIO() : MEDIA }).catch(never); };
const outOfFetches = route => route.fulfill({ status: 200, headers, body: '599\nService invoked too many times for one day: urlfetch.' }).catch(never);
const ago = s => new Date(Date.now() - s * 1000).toISOString();
const ME = { token: 'TOK', id: '212375133', login: 'ironat___', name: 'Ironat___' };
// `relay` answers relay calls; `gql(body, route)` can answer GQL itself by returning data, or true once it has fulfilled the route.
const stage = async (relay, { sub = false, pick = false, copy, since = ago(3600), offline = false, me = false, gql, init, noPlayer = false, path = '?c=staged', w = 390, h = 844, touch = false } = {}) => {
  const { c, page, done, ads } = await open({ iphone: true, w, h, touch, init: captureButtons });
  const user = { id: '1', login: 'staged', displayName: 'Staged', profileImageURL: null, broadcastSettings: { title: '' }, stream: offline ? null : { id: '1', createdAt: since, viewersCount: 1, type: 'live', game: null, previewImageURL: '' }, videos: { edges: [] }, lastBroadcast: null };
  await page.addInitScript(([p, m]) => { window.WebSocket = class { close() {} send() {} }; if (p) localStorage.setItem('wraith.feed', '"cdn"'); if (m) localStorage.setItem('wraith.me', JSON.stringify(m)); }, [pick, me ? ME : null]);
  if (init) await page.addInitScript(init);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, async route => {
    const u = route.request().url(), b = route.request().postData() || '';
    if (u.includes('cdn.jsdelivr.net')) return noPlayer ? undefined : route.continue().catch(never);   // noPlayer: the player script never answers
    if (u.includes('script.google')) return relay(route);
    if (u.includes('gql.twitch.tv')) {
      const mine = gql && await gql(b, route);
      if (mine === true) return;
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ data: mine || (b.includes('users(logins') ? { users: [user] } : b.includes('streamPlaybackAccessToken') ? { streamPlaybackAccessToken: { value: '{}', signature: 'x', authorization: { isForbidden: sub } } } : {}) }) }).catch(never);
    }
    if (copy && u.endsWith('index-dvr.m3u8')) return route.fulfill(copy(u) ? { status: 200, headers, body: DVR } : { status: 403, headers, body: '' }).catch(never);
    if (u.endsWith('.aac')) return route.fulfill({ status: 200, headers, body: SILENCE }).catch(never);
    if (!u.endsWith('.ts')) return route.abort().catch(never);   // video segments just never come: the picture stays still
  });
  const t = Date.now();
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  return { c, page, done, t, user, ads };
};
const toCdn = async (page, from) => { await page.waitForFunction(() => wraith.P.feed === 'cdn', null, { timeout: 60000 }).catch(never); return Date.now() - from; };
const levels = (page, ms) => page.waitForFunction(() => wraith.P.hls?.levels.length, null, { timeout: ms }).catch(never);
const backPlays = async (page, name) => {
  await vis(page, false);
  await page.waitForFunction(() => { const v = wraith.P.active(); return !v.paused && v.readyState >= 3; }, null, { timeout: 15000 }).catch(never);
  const s = await snd(page);
  ok(name, !s.on && s.paused && !s.src && !s.vPaused && !s.msg, JSON.stringify(s));
};

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
  // Chrome's native HLS can break on the seek into a real, growing copy (Safari is who that's for), and then the spinner is right
  const broke = await page.evaluate(() => document.getElementById('vCDN').error?.message ?? null);
  s = await st(page); ok('picking the CDN during a cover sticks', s.feed === 'cdn' && !s.cover && !s.ad && !s.hls && !s.banner && (!s.spin || broke !== null), `${broke} ${JSON.stringify(s)}`);
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
  ok('one new session', ads.masters.slice(n).filter(k => k === 'site').length === 1, ads.masters.slice(n).join());   // the search for a clean one can still have a look under way: that's no player

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

  await page.evaluate(() => wraith.P.hls?.trigger('hlsError', { type: 'mediaError', details: 'bufferFullError', fatal: false, error: new Error('The quota has been exceeded.') }));
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
  const mediaError = () => page.evaluate(() => wraith.P.hls?.trigger('hlsError', { type: 'mediaError', details: 'bufferAppendError', fatal: true }));
  await page.evaluate(() => { wraith.P.fixes = 0; wraith.P.retries = 0; window.__old = wraith.P.hls; });
  await mediaError(); await playing(page, 8000);
  ok('one recovery plays on by itself', await page.evaluate(() => wraith.P.fixes === 1 && wraith.P.hls === window.__old && !wraith.P.active().paused), JSON.stringify(await st(page)));
  for (let i = 1; i < 3; i++) { await mediaError(); await sleep(i < 2 ? 2500 : 200); }
  ok('recoveries that don’t hold end in a restart', await page.evaluate(() => wraith.P.fixes === 3 && wraith.P.retries === 1), JSON.stringify(await page.evaluate(() => [wraith.P.fixes, wraith.P.retries])));
  await sleep(2500); await playing(page);
  ok('which plays', await page.evaluate(() => wraith.P.hls !== window.__old) && !(await st(page)).paused);
  await page.waitForFunction(() => wraith.P.fixes === 0 && wraith.P.retries === 0, null, { timeout: 25000 }).catch(() => {});
  ok('and once it’s held, the slate is clean', await page.evaluate(() => wraith.P.fixes === 0 && wraith.P.retries === 0));

  // a slow answer from before you opened the channel again
  let slow = true;
  await page.route('https://gql.twitch.tv/gql', async route => {
    const b = route.request().postData() || '';
    if (!slow || !b.includes('users(logins') || !b.includes(A)) return route.fallback();
    slow = false;
    await sleep(2500);
    const res = await route.fetch().catch(() => null);
    if (!res) return;
    const j = await res.json();
    for (const u of j.data?.users || []) if (u) u.stream = null;
    await route.fulfill({ response: res, body: JSON.stringify(j) }).catch(() => {});
  });
  await page.evaluate(() => { wraith.P.checkEnded(); }); await sleep(100);
  await page.evaluate(a => wraith.P.open(a), A);
  await sleep(4500);
  s = await st(page); ok('a slow “stream ended” from before leaves the stream alone', s.feed === 'live' && !s.msg, JSON.stringify(s));
  await page.unroute('https://gql.twitch.tv/gql');
  await playing(page);

  // the wake lock goes with the stream
  const before = await page.evaluate(() => [window.__locks || 0, window.__released || 0]);
  await page.evaluate(() => wraith.P.ended(wraith.P.user)); await sleep(300);
  ok('a stream ending lets the screen sleep', before[0] > 0 && await page.evaluate(n => (window.__released || 0) > n, before[1]), before.join());
  s = await st(page); ok('with the offline card up and no ad banner', s.msg && !s.banner);
  await page.evaluate(() => { wraith.P.close(); });

  // Google's limit itself still counts
  await page.goto(base + `?c=${A}`); await playing(page);
  const up = await page.evaluate(() => { const h = wraith.P.hls; h?.trigger('hlsError', { type: 'networkError', details: 'levelLoadError', fatal: false, response: { code: 599, text: 'Exception: Service invoked too many times for one day: urlfetch.' } }); return !!h; });
  await sleep(500);
  s = await st(page); ok('Google’s real limit still falls back', up && !s.hls, JSON.stringify(s));
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
  await page.waitForFunction(() => ['victim', 'deleted'].every(l => document.querySelector(`#chat [data-l="${l}"]`)), null, { timeout: 8000 }).catch(never);
  const gone = await page.evaluate(() => ['victim', 'deleted'].map(l => document.querySelector(`#chat [data-l="${l}"]`)?.classList.contains('gone')));
  ok('a timeout and a delete catch lines still waiting', gone[0] === true && gone[1] === true, gone.join());
  await done();

  // real history, drawn before the emotes come in
  const fresh = await open();
  await fresh.page.goto(base + `?c=${A}`);
  await fresh.page.waitForFunction(() => wraith.Chat.chanEmotes.length && wraith.Chat.global?.size && document.querySelectorAll('#chat .m.old').length > 20, null, { timeout: 15000 }).catch(() => {});
  await sleep(500);
  const raw = await fresh.page.evaluate(() => [...document.querySelectorAll('#chat .m .tx')].flatMap(n => [...n.childNodes].filter(c => c.nodeType === 3).flatMap(c => c.data.trim().split(/\s+/))).filter(w => w && wraith.Chat.emotes.has(w)));
  ok('lines drawn before the emotes came in have them now', raw.length === 0, `${raw.length} left as words: ${raw.slice(0, 8).join(' ')}`);
  await fresh.done();
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
  const id = { validate: 'ok', wait: 0, left: 0, renewals: 0, revoked: 0 };
  await page.route('https://id.twitch.tv/oauth2/**', async route => {
    const u = route.request().url(), json = (status, o) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.endsWith('/validate')) {
      if (id.wait) await sleep(id.wait);
      return id.validate === 'ok' ? json(200, { login: 'ironat___', user_id: '212375133', client_id: 'x', scopes: [], expires_in: id.left }) : id.validate === 401 ? json(401, { status: 401, message: 'invalid access token' }) : route.abort();
    }
    if (u.endsWith('/revoke')) { id.revoked++; return json(200, {}); }
    id.renewals++;
    return json(400, { status: 400, message: 'missing client secret' });   // what Twitch really says for this client, whatever the token
  });
  let follows = { wait: 0 }, blocks = { gql: [{ id: '999' }], helix: 200 }, gqlStatus = 200;
  await page.route('https://gql.twitch.tv/gql', async route => {
    const q = route.request();
    if (!(q.headers().authorization || '').startsWith('OAuth')) return route.fallback();
    if (gqlStatus !== 200) return route.fulfill({ status: gqlStatus, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'Unauthorized', status: gqlStatus, message: 'The "Authorization" token is invalid.' }) });
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

  // A token from Twitch's TV client can't be renewed, so losing a good one means a trip back to Twitch.
  const signedIn = async () => { const a = await acct(); return !!a?.token && (await stored())?.token === a.token; };
  const sheet = async () => { await page.evaluate(() => document.getElementById('scrim').click()); await page.click('#acct'); await sleep(150); return page.$eval('#sheetBody', x => x.textContent); };
  const pickOpt = t => page.evaluate(t => [...document.querySelectorAll('#sheetBody .opt')].find(b => b.textContent.startsWith(t)).click(), t);
  gqlStatus = 401;
  await page.evaluate(() => wraith.Me.loadProfile()); await sleep(300);
  gqlStatus = 200;
  ok('a 401 from the API doesn’t sign you out when Twitch says the token is fine', await signedIn(), JSON.stringify(await stored()));
  id.validate = 401;
  await page.evaluate(() => wraith.Me.check());
  ok('nor does Twitch saying no once, which can be a hiccup', await signedIn());
  await page.evaluate(() => Promise.all([wraith.Me.check(), wraith.Me.check()]));
  ok('asking again straight away doesn’t make it twice', await signedIn());
  ok('the sheet notes that it happened', (await sheet()).includes('refused it'));
  id.validate = 'ok';
  await page.evaluate(() => wraith.Me.check());
  ok('a yes clears the doubt', await signedIn() && await page.evaluate(() => wraith.Me.doubt === 0));
  id.validate = 'down';
  await page.evaluate(() => wraith.Me.check());
  ok('no network changes nothing', await signedIn());

  // another page signed in meanwhile
  id.validate = 401;
  await page.evaluate(() => { localStorage.setItem('wraith.me', JSON.stringify({ ...wraith.Me.acct, token: 'TOK3' })); return wraith.Me.check(); });
  ok('a page holding an old token takes the newer one', (await acct())?.token === 'TOK3' && (await stored())?.token === 'TOK3');

  // the token really is dead
  await page.evaluate(() => { wraith.Me.follows = ['forsen', 'kaise']; wraith.Me.blocks = new Set(['9']); });
  await page.evaluate(() => wraith.Me.check());
  ok('the first no still changes nothing', await signedIn());
  const gone = await page.waitForFunction(() => !wraith.Me.acct, null, { timeout: 66000 }).then(() => true, () => false);
  ok('Twitch saying no again a minute later ends it', gone && !(await stored()));
  ok('and it says so', (await page.$eval('#gtoast', x => x.textContent)).includes('Twitch ended your sign-in'), await page.$eval('#gtoast', x => x.textContent));
  ok('your lists stay', await page.evaluate(() => wraith.Me.follows.join() === 'forsen,kaise' && wraith.Me.blocks.has('9')));
  const ended = await sheet();
  ok('the account sheet says what ended it', ended.includes('Sign in with Twitch') && ended.includes('Twitch stopped accepting it'), ended);
  ok('nothing ever tried to renew', id.renewals === 0, `${id.renewals} tries`);

  // how long Twitch gives a sign-in
  id.validate = 'ok'; id.left = 4 * 3600;
  await page.evaluate(() => wraith.Me.accept({ access_token: 'TOK4' }));
  const life = await sheet();
  ok('a sign-in says when it started and what Twitch gives it', life.includes('Signed in') && life.includes('another 4.0 hours') && !life.includes('ended'), life);
  id.left = 0;
  await page.evaluate(() => wraith.Me.check());
  ok('or that Twitch gives it no end date', (await sheet()).includes('no end date'));

  // signing out
  await pickOpt('Sign out'); await sleep(150);
  ok('signing out asks first', await signedIn() && (await page.$eval('#sheetBody', x => x.textContent)).includes('Stay signed in') && id.revoked === 0);
  await pickOpt('Stay signed in'); await sleep(150);
  ok('staying keeps it', await signedIn() && await page.$eval('#sheet', x => x.hidden));
  await sheet(); await pickOpt('Sign out'); await sleep(150); await pickOpt('Sign out'); await sleep(300);
  ok('signing out takes the token and the lists with it', !(await acct()) && !(await stored()) && id.revoked === 1 && await page.evaluate(() => wraith.Me.follows === null && wraith.Me.blocks.size === 0));
  ok('and the sheet says it was you', (await sheet()).includes('you signed out'));
  await page.evaluate(() => document.getElementById('scrim').click());

  // signing out while something is under way
  await page.evaluate(me => wraith.Me.save(me), ME);
  id.validate = 401; id.wait = 800;
  await page.evaluate(async () => { const p = wraith.Me.check(); wraith.Me.signOut(); await p; });
  ok('a check finishing after sign-out changes nothing', !(await acct()) && !(await stored()));
  id.validate = 'ok'; id.wait = 0;
  await page.evaluate(me => wraith.Me.save(me), ME);
  follows.wait = 800;
  await page.evaluate(async () => { const p = wraith.Me.loadFollows(); wraith.Me.signOut(); await p; });
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
  await page.waitForSelector('#chat [data-l="plainname"] .n', { timeout: 10000 });   // they wait for the picture, however far behind it is starting up
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
  ok('another channel starts from nothing', !((await sections())['Used in this chat'] || []).includes('KasugaYeah'), JSON.stringify(await sections()));
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

  // nothing to hand over yet: it fills the page instead, and the button undoes that
  await page.evaluate(() => { window.__refuse = true; window.__full = null; document.getElementById('bFull').click(); });
  ok('with the player refusing, the picture fills the page', await fill());
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
  ok('the settings sheet shows the record', /Away: .*(left|back|sound on)/.test(sheet), sheet.slice(-160));
  await page.evaluate(() => document.getElementById('scrim').click());
  await done();
}

if (want('sound')) {
  // Leaving from iOS's fullscreen player: it comes out of it, or Control Center stays with the paused picture.
  const { page, done } = await open({ iphone: true, w: 951, h: 669, init: iosFullscreen });
  await page.goto(base + `?c=${A}`); await playing(page);
  await page.evaluate(() => document.getElementById('bFull').click());
  ok('fullscreen hands the video to iOS’s player', await page.evaluate(() => window.__fs === wraith.P.active()));
  await vis(page, true); await sounding(page);
  let s = await snd(page);
  await page.waitForFunction(() => window.__told > 0, null, { timeout: 2000 }).catch(never);
  ok('leaving brings it out of that player, and iOS hears of it', await page.evaluate(() => window.__fs === null && window.__told === 1) && s.on && !s.paused && s.vPaused, JSON.stringify(s));
  ok('with the picture’s player paused, not taken apart', await page.evaluate(() => wraith.P.hls.media === document.getElementById('vLL') && !wraith.P.hls.loadingEnabled && !document.getElementById('vLL').buffered.length || !document.getElementById('vLL').buffered.end(0)));
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
  await makeStream(second);   // the stream made here, not Twitch's own copy, which Chrome can't hold to the end of
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
  await makeStream(third);
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
  // the strip beside the picture holds the controls, out all the time and off the picture, below iOS's island, clock and Wi-Fi (they run to 183, 2026-11-03)
  const rail = () => page.evaluate(() => {
    const seen = id => { const n = document.getElementById(id), b = n.getBoundingClientRect(); return !n.offsetParent || getComputedStyle(n.closest('.hud')).opacity !== '1' ? null : { x: Math.round(b.x), r: Math.round(b.right), y: Math.round(b.y), b: Math.round(b.bottom) }; };
    return { play: seen('bPlay'), mute: seen('bMute'), lat: seen('bLat'), set: seen('bSet'), full: seen('bFull'), back: seen('bBack') };
  });
  const railIn = async (name, left, right, bottom, top = 186) => {
    const r = await rail(), all = [r.play, r.mute, r.lat, r.set, r.full];
    const apart = all.every((c, i) => all.every((d, j) => j <= i || !c || !d || c.r <= d.x || d.r <= c.x || c.b <= d.y || d.b <= c.y));
    ok(name, all.every(c => c && c.x >= left && c.r <= right && c.y >= top && c.b <= bottom) && apart && !r.back, JSON.stringify(r));
    const hit = await page.evaluate(() => ['bPlay', 'bMute', 'bLat', 'bSet', 'bFull'].filter(id => { const n = document.getElementById(id), b = n.getBoundingClientRect(); return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('button') !== n; }));
    ok('and each one there to tap', !hit.length, hit.join());
  };
  await page.evaluate(() => document.getElementById('stage').classList.remove('ui')); await sleep(250);
  await railIn('the controls in the strip beside the picture, below iOS’s things, without a tap', 867, 951, 488);
  ok('in line with iOS’s things', await page.evaluate(() => { const b = document.getElementById('bPlay').getBoundingClientRect(); return Math.abs(b.x + b.width / 2 - 903) <= 2; }), String(await page.evaluate(() => { const b = document.getElementById('bPlay').getBoundingClientRect(); return b.x + b.width / 2; })));
  await page.screenshot({ path: 'fixes-duo-inner.png', timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.getElementById('bEmote').click()); await sleep(300);
  const pk = await page.evaluate(() => { const b = document.getElementById('ep').getBoundingClientRect(); return { y: Math.round(b.y), r: Math.round(b.right), h: Math.round(b.height) }; });
  ok('the emotes take chat’s place, leaving the picture clear', pk.y >= b.stage.b - 1 && pk.r <= b.log.r + 1 && pk.h > 120, JSON.stringify(pk));
  await page.screenshot({ path: 'fixes-duo-emotes.png', timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.getElementById('bEmote').click()); await sleep(200);
  await page.evaluate(() => document.getElementById('bSet').click()); await sleep(400);
  const sh = await page.evaluate(() => { const b = document.querySelector('.panel').getBoundingClientRect(); return { x: Math.round(b.x), r: Math.round(b.right), y: Math.round(b.y), b: Math.round(b.bottom) }; });
  ok('a sheet comes in from the edge, as tall as the screen, leaving most of the picture in view', sh.r === 951 && sh.x >= 480 && sh.y === 0 && sh.b === 669, JSON.stringify(sh));
  await page.screenshot({ path: 'fixes-duo-sheet.png', timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.getElementById('scrim').click()); await sleep(200);
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
  await page.evaluate(() => document.getElementById('stage').classList.remove('ui')); await sleep(250);
  await railIn('with the controls in the strip there', 0, 84, 488);
  ok('and chat, below all of iOS’s things, free to use its side', await page.evaluate(() => { const n = document.querySelector('#chat .m'); return n && parseFloat(getComputedStyle(n).paddingLeft) === 14; }));
  await shape(678, 466, { right: 84, bottom: 21 });
  b = await box();
  ok('Duo closed, on its side: as wide as the strip allows, and chat has room', near(b.stage.r, 594, 1) && b.log.h >= 125 && b.say.b <= 466 && b.info.y >= b.stage.b, JSON.stringify([b.stage, b.log, b.say, b.info]));
  await page.evaluate(() => document.getElementById('stage').classList.remove('ui')); await sleep(250);
  await railIn('with the controls in all of the strip, the island being at its foot', 594, 678, b.stage.b, 0);
  await page.screenshot({ path: 'fixes-duo-closed.png', timeout: 8000 }).catch(() => {});
  await shape(678, 466, { left: 84, bottom: 21 });
  b = await box();
  ok('turned around, the same on the left', near(b.stage.x, 84, 1) && near(b.stage.r, 678, 1) && b.say.b <= 466 && b.info.y >= b.stage.b, JSON.stringify([b.stage, b.say, b.info]));
  await page.evaluate(() => document.getElementById('stage').classList.remove('ui')); await sleep(250);
  await railIn('with the controls below the island at its top', 0, 84, b.stage.b, 90);
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

  // the home screen on each shape: as much of it on screen as there's room for
  await page.goto(base); await page.waitForSelector('#live a.row', { timeout: 15000 }).catch(() => {});
  const home = () => page.evaluate(() => {
    const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom) }; };
    return { brand: r('.brand'), q: r('#q'), acct: r('#acct'), live: r('#live'), cols: getComputedStyle(document.getElementById('live')).gridTemplateColumns.split(' ').length, wide: document.documentElement.scrollWidth <= innerWidth };
  });
  await shape(951, 669, { right: 84, bottom: 34 });
  let h = await home();
  ok('home, Duo open: three across', h.cols === 3 && h.wide, JSON.stringify(h));
  ok('its header on one line, and all of it out of the strip', h.q.y < h.brand.b && h.acct.r <= 867 && h.live.r <= 867, JSON.stringify(h));
  await page.screenshot({ path: 'fixes-duo-home.png', timeout: 8000 }).catch(() => {});
  await shape(951, 669, { left: 84, bottom: 34 });
  h = await home();
  ok('turned around: the same, the other way', h.cols === 3 && h.brand.x >= 84 && h.live.x >= 84, JSON.stringify(h));
  await shape(669, 951, { top: 59, bottom: 34 });
  h = await home();
  ok('upright: two across, header on one line', h.cols === 2 && h.q.y < h.brand.b && h.wide, JSON.stringify(h));
  await shape(678, 466, { right: 84, bottom: 21 });
  h = await home();
  ok('closed, on its side: two across, header on one line', h.cols === 2 && h.q.y < h.brand.b && h.acct.r <= 594 && h.wide, JSON.stringify(h));
  await page.screenshot({ path: 'fixes-duo-closed-home.png', timeout: 8000 }).catch(() => {});
  await shape(466, 678, { right: 84, bottom: 55 });
  h = await home();
  ok('closed, upright: one, with nothing cut off, and clear of iOS’s things', h.cols === 1 && h.wide && h.acct.r <= 382, JSON.stringify(h));
  await shape(390, 844, { top: 59, bottom: 34 });
  h = await home();
  ok('a phone: the same', h.cols === 1 && h.wide && h.acct.r <= 390 - 8 && h.q.y >= h.brand.b - 8, JSON.stringify(h));
  // a margin down both sides is a notch, not the Duo's strip
  await shape(844, 390, { left: 59, right: 59, bottom: 21 });
  ok('a phone on its side has no strip', await page.evaluate(() => !('strip' in document.documentElement.dataset)));
  await shape(1180, 820, {});
  ok('nor does an iPad', await page.evaluate(() => !('strip' in document.documentElement.dataset)));
  await shape(951, 669, { right: 84, bottom: 34 });
  ok('and the Duo’s comes back', await page.evaluate(() => document.documentElement.dataset.strip === 'right'));
  await done();
}

if (want('recover')) {
  // How the live player comes out of hls.js's own troubles. It stops loading on a fatal error before the page hears of it.
  const stream = async () => { const o = await open(); await o.page.goto(base + `?c=${A}`); await playing(o.page); return o; };
  const trouble = (page, details, fatal) => page.evaluate(([details, fatal]) => {
    const hls = wraith.P.hls, v = wraith.P.active();
    window.__was = { hls, t: v.currentTime }; window.__loads = 0;
    hls.on(Hls.Events.LEVEL_LOADED, () => window.__loads++);
    hls.trigger(Hls.Events.ERROR, { type: Hls.ErrorTypes.MEDIA_ERROR, details, fatal, error: new Error('staged') });
  }, [details, fatal]);
  const after = page => page.evaluate(() => { const v = wraith.P.active(); return { same: window.__was.hls === wraith.P.hls, loading: wraith.P.hls?.loadingEnabled, loads: window.__loads, paused: v.paused, moved: +(v.currentTime - window.__was.t).toFixed(1) }; });
  await Promise.all([
    (async () => {
      const { page, done } = await stream();
      await trouble(page, 'bufferStalledError', true);
      await sleep(9000);   // short of the 10 s after which a picture that hasn't moved starts over
      const s = await after(page);
      ok('a fatal media error comes back with the playlist still loading', s.same && s.loading && s.loads >= 3, JSON.stringify(s));
      ok('and the picture moving', !s.paused && s.moved > 4, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      const { page, done } = await stream();
      await trouble(page, 'mediaSourceRequiresReset', false);
      await sleep(5000);
      const s = await after(page);
      ok('hls.js resetting the player by itself doesn’t leave it paused', s.same && !s.paused && s.moved > 1, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // a pause long enough for loading to stop: playing goes straight past what it missed, with nothing old to play first
      const { page, done } = await stream();
      await page.evaluate(() => { wraith.P.restAfter = 500; document.getElementById('bPlay').click(); });
      await page.waitForFunction(() => !wraith.P.hls.loadingEnabled, null, { timeout: 5000 }).catch(never);
      await sleep(2000);
      const was = await page.evaluate(() => { const v = wraith.P.active(), at = v.currentTime; document.getElementById('bPlay').click(); return at; });
      await page.waitForFunction(() => wraith.P.hls.loadingEnabled, null, { timeout: 3000 }).catch(never);
      const now = await page.evaluate(() => wraith.P.active().currentTime);
      ok('played again after loading stopped, it goes past what it missed', now >= was + 2, `${was} then ${now}`);
      await sleep(3000);
      const s = await page.evaluate(() => { const v = wraith.P.active(); return { paused: v.paused, ready: v.readyState, lat: wraith.P.latency() }; });
      ok('and it’s moving at the live edge', !s.paused && s.ready >= 3 && s.lat < 6, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      const { page, done } = await stream();
      const s = await page.evaluate(() => {
        const P = wraith.P, list = P.qualities();
        if (list.length < 2) return { skip: true };
        P.setQuality(list[1].id); P.setQuality(list[0].id);   // changed your mind straight away
        return { want: P.levelIndex(), got: P.hls.loadLevel, list: list.map(x => x.id) };
      });
      ok('going back to a quality straight after leaving it takes', s.skip || s.want === s.got, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      const { page, done } = await stream();
      const was = await page.evaluate(() => wraith.P.liveT);
      await page.evaluate(() => document.getElementById('bPlay').click());
      await sleep(7000);
      await page.evaluate(() => document.getElementById('bPlay').click());
      await sleep(5000);
      const now = await page.evaluate(() => wraith.P.liveT);
      ok('resuming from a pause isn’t counted as buffering', now === was, `${was} then ${now}`);
      await done();
    })(),
  ]);
}

if (want('relay')) {
  // The relay going quiet.
  const waking = async (secs, tries, name) => {
    let at;   // from its first ask: a machine busy starting pages doesn't shorten the wait
    const { page, done } = await stage(async route => { at ||= Date.now() + secs * 1000; await sleep(Math.max(0, at - Date.now())); await answer(route); });
    await levels(page, (secs + 3) * 1000);
    const s = await st(page);
    ok(name, s.feed === 'live' && s.retries === tries && await page.evaluate(() => wraith.P.hls?.levels.length === 1), JSON.stringify(s));
    await done();
  };
  // Leaving the app with the relay hung: the sound starts by itself once there's an answer, unless you've stopped it.
  const leaving = async run => {
    const S = { hung: false, audio: 0 };
    const { page, done } = await stage(route => { if (route.request().url().includes('audio')) S.audio++; return S.hung ? null : answer(route); });
    await levels(page, 15000);
    S.hung = true; await vis(page, true); await sleep(1000);
    const t = Date.now(), live = async name => ok(name, !!(await sounding(page)), `${Date.now() - t} ms ${JSON.stringify(await snd(page))}`);
    const silent = async (name, ms = 3000) => { const n = S.audio; await sleep(ms); const s = await snd(page); ok(name, s.paused && S.audio === n, `${S.audio - n} calls ${JSON.stringify(s)}`); };
    await run(page, S, live, silent);
    await done();
  };
  const cutShort = async (stop, want, name) => {
    const S = { hung: false };
    const { page, done } = await stage(route => S.hung ? null : answer(route));
    await levels(page, 15000);
    S.hung = true; await page.evaluate(() => wraith.P.playLive());
    await vis(page, true); await sleep(1000);
    if (stop) await cc(page, 'pause');
    S.hung = false; await vis(page, false);
    await levels(page, 15000); await sleep(500);
    const s = await st(page);
    ok(name, await page.evaluate(() => wraith.P.hls?.levels.length === 1) && want(s), JSON.stringify(s));
    await done();
  };
  // A sub-only or CDN-picked stream restarting while you're away: no relay brings the sound back, so it comes from the CDN once that has a copy of the new stream.
  const restarting = async (how, run) => {
    const S = { up: true, audio: 0 };
    const { page, done, user } = await stage(never, { ...how, copy: u => { if (u.includes('audio_only')) S.audio++; return S.up || !u.includes('_2_'); } });
    await page.waitForFunction(() => wraith.P.feed === 'cdn' && wraith.P.active().readyState >= 3, null, { timeout: 15000 }).catch(never);
    await vis(page, true); await sounding(page);
    await run(page, S, () => { user.stream = { ...user.stream, id: '2' }; return page.evaluate(() => wraith.P.refresh()); });
    await done();
  };
  const stops = {
    'stopped from the buttons': page => cc(page, 'pause'),
    'another app having taken the sound': page => page.evaluate(() => document.getElementById('aBG').pause()),
  };
  // A stream the CDN has no copy of yet, in view: it's asked again before anything says there's none.
  const refused = async (how, run) => {
    const S = { up: false, asks: [] };
    const { page, done, user } = await stage(never, { since: ago(0), ...how, copy: u => { if (u.includes('chunked')) S.asks.push(Date.now()); return S.up; } });
    await page.waitForFunction(() => wraith.P.active()?.error, null, { timeout: 15000 }).catch(never);
    await run(page, S, user);
    await done();
  };
  const asked = async (S, n) => { for (let i = 0; i < 400 && S.asks.length < n; i++) await sleep(100); };
  const told = page => page.waitForFunction(() => !document.getElementById('msgbox').hidden, null, { timeout: 40000 }).catch(never);
  const feeds = [
    [{ sub: true }, 'a sub-only stream', 'The CDN feed isn’t availableThis channel’s stream isn’t being recorded, so there is no ad-free copy to play.'],
    [{ pick: true }, 'a stream you picked the CDN for', 'The CDN feed isn’t availableTry the low-latency feed instead.Try again'],
  ];
  await Promise.all([
    // Apps Script sitting on asks it never answers (2026-11-12: 3 in 10): a playlist's third ask gets it, well inside the 8 s timeout
    (async () => {
      const S = { sit: false, run: 0, got: 0, asks: 0 };
      const { page, done } = await stage(route => {
        if (!S.sit || !route.request().url().includes('chunked')) return answer(route);
        S.asks++;
        if (S.run < 2) { S.run++; return null; }
        S.run = 0; S.got++;
        return answer(route);
      });
      await levels(page, 15000); await sleep(1000);
      S.sit = true; await sleep(14000);
      const s = await st(page);
      ok('a relay sitting on two asks in a row: the third gets the playlist, with no timeout', S.got >= 2 && S.asks >= S.got * 3 && !s.errs.levelLoadTimeOut, `${S.got} of ${S.asks} asks ${JSON.stringify(s.errs)}`);
      await done();
    })(),
    ...feeds.flatMap(([how, name, words]) => [
      refused(how, async (page, S) => {
        await sleep(3000);
        const s = await st(page);
        ok(`${name} the CDN has no copy of yet, in view: it waits, with the spinner up`, !s.msg && s.spin, JSON.stringify(s));
        await asked(S, 2); S.up = true;
        await page.waitForFunction(() => { const v = wraith.P.active(); return !v.paused && v.readyState >= 3; }, null, { timeout: 20000 }).catch(never);
        const t = await snd(page);
        ok('and plays on the third ask, with nothing saying it isn’t available', S.asks.length === 3 && S.asks[1] - S.asks[0] > 11e3 && !t.vPaused && !t.msg, `${S.asks.map(a => a - S.asks[0])} ${JSON.stringify(t)}`);
      }),
      refused(how, async (page, S) => {
        await told(page);
        const ms = Date.now() - S.asks[0], { msg } = await snd(page), n = S.asks.length;
        ok(`${name} that really isn’t recorded: its message in about 30 s, word for word`, ms > 20e3 && ms < 30e3 && msg === words, `${ms} ms, ${n} asks: ${msg}`);
        await sleep(13000);
        ok('and it stops asking', n === 3 && S.asks.length === n, `${S.asks.length} asks`);
      }),
      refused({ ...how, since: ago(240) }, async (page, S) => {
        await told(page);
        const ms = Date.now() - S.asks[0], { msg } = await snd(page), { spin } = await st(page);
        await sleep(13000);
        ok(`${name} live for minutes that isn’t recorded: its message straight away, word for word, and no more asks`, ms < 5e3 && msg === words && !spin && S.asks.length === 1, `${ms} ms, ${S.asks.length} asks, spin ${spin}: ${msg}`);
      }),
    ]),
    ...[[ago(120), 'two minutes old'], [null, 'with no known start']].map(([since, name]) => refused({ sub: true, since }, async (page, S) => {
      await told(page);
      const ms = Date.now() - S.asks[0];
      ok(`a stream ${name} still gets its asks first`, ms > 20e3 && ms < 30e3 && S.asks.length === 3, `${ms} ms, ${S.asks.length} asks`);
    })),
    refused({ sub: true }, async (page, S, user) => {
      await sleep(3000);
      user.stream = { ...user.stream, id: '2', createdAt: ago(240) };
      await page.evaluate(() => wraith.P.open('staged'));
      await asked(S, 2); await told(page); await sleep(13000);
      ok('moving during the wait to a stream long live and not recorded: the old wait doesn’t ask as well', S.asks.length === 2, `${S.asks.map(a => a - S.asks[0])}`);
    }),
    refused({ sub: true }, async (page, S) => {
      await vis(page, true);
      const n = S.asks.length;   // from leaving: a machine busy starting pages can have it ask once before that
      await sleep(14000);
      const s = await snd(page);
      ok('leaving during the wait: the sound does the asking, not the picture', s.on && S.asks.length === n && !s.msg, `${S.asks.length - n} asks ${JSON.stringify(s)}`);
      S.up = true;
      ok('and the sound starts once there’s a copy', !!(await sounding(page)), JSON.stringify(await snd(page)));
      await backPlays(page, 'and coming back plays, with nothing saying it isn’t available');
    }),
    refused({ sub: true }, async (page, S) => {
      await sleep(4000); await vis(page, true); S.up = true;
      ok('leaving well into the wait: the sound still comes', !!(await sounding(page)), JSON.stringify(await snd(page)));
    }),
    refused({ sub: true }, async (page, S) => {
      await vis(page, true); await sleep(1000);
      const t = Date.now();
      await vis(page, false); await sleep(3000);
      const quiet = !(await snd(page)).msg;
      await told(page);
      const ms = Date.now() - t;
      ok('coming back with still no copy: it asks, then the message in under 30 s', quiet && ms < 30e3 && S.asks.length > 1, `${ms} ms, ${S.asks.length} asks`);
    }),
    refused({ pick: true }, async (page, S) => {
      await sleep(5000);
      await page.evaluate(() => wraith.P.open('staged'));
      await asked(S, 2); await sleep(10000);
      ok('a new start during the wait: the old wait doesn’t ask as well', S.asks.length === 2, `${S.asks.map(a => a - S.asks[0])}`);
      await told(page);
      const ms = Date.now() - S.asks[1];
      ok('and it gets a full wait of its own', ms > 20e3 && ms < 30e3, `${ms} ms`);
    }),
    refused({ pick: true }, async (page, S) => {
      await page.evaluate(() => wraith.P.setPref('live'));
      await sleep(13000);
      const s = await st(page);
      ok('switching to low latency during the wait: it stays there, and nothing asks for the copy', s.feed === 'live' && !s.msg && S.asks.length === 1, `${S.asks.length} asks ${JSON.stringify(s)}`);
    }),
    ...[[{ sub: true }, 'a sub-only stream restarting while you’re away: the sound comes back'], [{ pick: true }, 'a stream you picked the CDN for: the same']].map(([how, name]) => restarting(how, async (page, S, restart) => {
      await restart();
      ok(name, !!(await sounding(page)), JSON.stringify(await snd(page)));
      await backPlays(page, 'and coming back plays');
    })),
    restarting({ sub: true }, async (page, S, restart) => {
      S.up = false; S.audio = 0;
      await restart(); await sleep(14000);
      const s = await snd(page);
      ok('one the CDN has no copy of yet: it asks again', s.on && s.wanted && S.audio >= 2, `${S.audio} asks ${JSON.stringify(s)}`);
      S.up = true;
      ok('and the sound starts once it has one', !!(await sounding(page)), JSON.stringify(await snd(page)));
      await backPlays(page, 'and coming back plays, with nothing saying it isn’t available');
    }),
    ...Object.entries(stops).map(([how, stop]) => restarting({ sub: true }, async (page, S, restart) => {
      await stop(page); await sleep(300); S.audio = 0;
      await restart(); await sleep(3000);
      const s = await snd(page);
      ok(`${how}, the restart stays quiet`, !s.on && s.paused && s.userPaused && !S.audio, `${S.audio} asks ${JSON.stringify(s)}`);
      await cc(page, 'play');
      ok('until the button starts it', !!(await sounding(page)), JSON.stringify(await snd(page)));
    })),
    restarting({ pick: true }, async (page, S, restart) => {
      S.up = false;
      await restart();
      await page.waitForFunction(() => wraith.BG.on && document.getElementById('aBG').error, null, { timeout: 15000 }).catch(never);
      await cc(page, 'pause'); S.up = true; S.audio = 0; await sleep(13000);
      const s = await snd(page);
      ok('stopped while it waits for the copy, nothing asks for it', s.on && !s.wanted && s.paused && !S.audio, `${S.audio} asks ${JSON.stringify(s)}`);
      await cc(page, 'play');
      ok('and the button starts it', !!(await sounding(page)), JSON.stringify(await snd(page)));
    }),
    leaving(async (page, S, live) => {
      await sleep(3000); S.hung = false;
      await live('a relay hanging as you leave: the sound starts once it answers');
    }),
    leaving(async (page, S, live) => {
      await sleep(25000); S.hung = false;
      await live('and after a hang long enough to outlast the first try');
    }),
    leaving(async (page, S, live, silent) => {
      await cc(page, 'pause'); S.hung = false;
      await page.evaluate(() => wraith.BG.hls.trigger(Hls.Events.ERROR, { type: Hls.ErrorTypes.NETWORK_ERROR, details: 'manifestLoadTimeOut', fatal: true }));
      await silent('stopped during the hang, it stays stopped when the relay answers');
      await cc(page, 'play');
      await live('until the button starts it');
    }),
    leaving(async (page, S, live, silent) => {
      await page.evaluate(() => document.getElementById('aBG').pause()); S.hung = false;
      await silent('another app taking the sound during the hang: the same');
      await page.evaluate(() => { document.getElementById('aBG').play().catch(() => {}); });
      await silent('iOS starting it again when that app stops doesn’t take', 800);
      await cc(page, 'play');
      await live('and the button still starts it');
    }),
    (async () => {
      const S = { hung: false };
      const { page, done } = await stage(route => S.hung ? null : answer(route));
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      S.hung = true; await sleep(20000); S.hung = false;
      const at = await page.evaluate(() => document.getElementById('aBG').currentTime);
      await page.waitForFunction(t => document.getElementById('aBG').currentTime > t + 2, at, { timeout: 25000 }).catch(never);
      const s = await snd(page);
      ok('a hang once the sound is going: it carries on after', s.on && s.wanted && await page.evaluate(t => document.getElementById('aBG').currentTime > t + 2, at), JSON.stringify(s));
      await done();
    })(),
    (async () => {
      const S = { hung: false, picture: 0 };
      const { page, done } = await stage(route => { if (route.request().url().includes('chunked')) S.picture++; return S.hung ? null : answer(route); });
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      S.hung = true;
      await page.evaluate(() => { wraith.P.user.stream.id = 'older'; wraith.P.refresh(); });
      await toCdn(page, Date.now());
      S.hung = false;
      ok('a stream restarting during a long hang: the sound comes back with the relay', !!(await sounding(page)), JSON.stringify(await snd(page)));
      const n = S.picture; await sleep(5000);
      ok('and the picture’s player leaves the relay alone', S.picture === n, `${S.picture - n} calls in 5 s`);
      await done();
    })(),
    cutShort(false, s => !s.paused && s.spin, 'a start cut short by leaving goes again on coming back'),
    cutShort(true, s => s.paused && !s.spin, 'and stays paused, with no spinner, if you stopped the sound'),
    (async () => {
      const { page, done, t } = await stage(never), ms = await toCdn(page, t);
      ok('a relay that never answers: on the CDN in about the time a dead one takes', ms < 30e3, `${ms} ms`);
      await done();
    })(),
    (async () => {
      // Google's daily limit: the relay says so, and retrying can't help
      let calls = 0;
      const { page, done, t } = await stage(route => { calls++; return outOfFetches(route); }, { copy: () => true }), ms = await toCdn(page, t);
      const n = calls;
      ok('the relay out of fetches: straight to the CDN, with no tries first', ms < 8000 && n <= 2, `${ms} ms, ${n} calls`);
      await page.waitForFunction(() => wraith.P.active().readyState >= 3, null, { timeout: 15000 }).catch(never);
      ok('and it plays', await page.evaluate(() => { const v = wraith.P.active(); return !v.paused && !wraith.P.hls; }), JSON.stringify(await st(page)));
      await sleep(3000);
      ok('and leaves the relay alone from there', calls === n, `${calls - n} calls in 3 s`);
      await done();
    })(),
    (async () => {
      let out = false;
      const { page, done } = await stage(route => out ? outOfFetches(route) : answer(route), { copy: () => true });
      await levels(page, 15000);
      await page.waitForFunction(() => { const v = wraith.P.active(); return !v.paused; }, null, { timeout: 5000 }).catch(never);
      out = true;
      await page.waitForFunction(() => wraith.P.feed === 'cdn', null, { timeout: 15000 }).catch(never);
      ok('running out with a stream under way: on the CDN', await page.evaluate(() => wraith.P.feed === 'cdn' && !wraith.P.hls), JSON.stringify(await st(page)));
      await done();
    })(),
    (async () => {
      let out = false, calls = 0;
      const { page, done } = await stage(route => { if (out) calls++; return out ? outOfFetches(route) : answer(route); }, { copy: () => true });
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      out = true;
      await page.waitForFunction(() => wraith.BG.srcs && wraith.P.feed === 'cdn', null, { timeout: 15000 }).catch(never);
      await sounding(page);
      const s = await snd(page);
      ok('running out while away: the sound goes on from the CDN’s copy', s.on && s.wanted && !s.paused && s.feed === 'cdn' && await page.evaluate(() => !wraith.BG.hls && !wraith.P.hls && document.getElementById('aBG').currentTime > 0), JSON.stringify(s));
      ok('the picture staying out of it', await page.evaluate(() => { const v = document.getElementById('vCDN'); return v.paused && v.muted; }));
      const n = calls; await sleep(3000);
      ok('and leaving the relay alone', calls - n === 0, `${calls - n} calls in 3 s`);
      await backPlays(page, 'and coming back plays from the CDN');
      ok('with no message', await page.evaluate(() => wraith.P.feed === 'cdn' && document.getElementById('msgbox').hidden));
      await done();
    })(),
    (async () => {
      let out = false;
      const { page, done } = await stage(route => out ? outOfFetches(route) : answer(route), { copy: () => true });
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      await cc(page, 'pause'); await sleep(300);
      out = true;
      await page.evaluate(() => wraith.BG.hls.trigger('hlsError', { type: 'networkError', details: 'levelLoadError', fatal: false, response: { code: 599, text: 'Service invoked too many times for one day: urlfetch.' } }));
      await sleep(500);
      const s = await snd(page);
      ok('the sound you stopped stays stopped when it runs out', s.on && s.paused && !s.wanted && s.held, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      let hung = false;
      const { page, done } = await stage(route => hung ? null : answer(route));
      await levels(page, 15000); hung = true;
      const ms = await toCdn(page, Date.now());
      ok('one that stops answering with a stream under way: the same', ms < 30e3, `${ms} ms`);
      await done();
    })(),
    (async () => {
      const { page, done, t } = await stage(route => route.abort().catch(never)), ms = await toCdn(page, t);
      const tries = await page.evaluate(() => wraith.P.errs['manifestLoadError (fatal)']);
      ok('a dead relay still gets every try first', tries === 4, `${tries} tries, ${ms} ms`);
      await done();
    })(),
    waking(8, 0, 'a relay taking 8 s to wake up keeps the first try'),
    waking(15, 1, 'one taking 15 s is still answering the second'),
  ]);
}

// A past broadcast. Chrome won't play a blob or data playlist, so the corrected copies are read as they're made, and playing falls through to the plain one.
const VOD = { id: '123', title: 'Past', lengthSeconds: 600, createdAt: ago(86400), status: 'RECORDED', seekPreviewsURL: 'https://dvod.cloudfront.net/aaaaaaaaaaaaaaaaaaaa_staged_1_2/storyboards/1-info.json', resourceRestriction: null, game: null, owner: { id: '1', login: 'staged', displayName: 'Staged', profileImageURL: null } };
const COPY = 'https://dvod.cloudfront.net/aaaaaaaaaaaaaaaaaaaa_staged_1_2';
const blobs = () => { window.__blobs = []; const real = URL.createObjectURL.bind(URL); URL.createObjectURL = b => { b.text().then(t => window.__blobs.push(t)); return real(b); }; };
const relayOf = route => new URL(route.request().url()).searchParams.get('u') || '';
const said = (route, body) => route.fulfill({ status: 200, headers, body }).catch(never);
const withVod = b => b.includes('video(id') ? { video: VOD } : undefined;
const soon = () => { const real = window.setTimeout; window.setTimeout = (f, ms, ...a) => real(f, ms === 180e3 ? 1000 : ms, ...a); };   // the 3 minutes between looks for low latency, down to a second

if (want('vod')) {
  const FMP4 = '200\n#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-MAP:URI="init-0.mp4"\n#EXTINF:10.000,\n0.mp4\n#EXTINF:10.000,\n1-unmuted.mp4\n#EXTINF:10.000,\n2-muted.mp4\n#EXT-X-ENDLIST\n';
  const TS = '200\n#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.000,\n0-unmuted.ts\n#EXTINF:10.000,\n1.ts\n#EXT-X-ENDLIST\n';
  const PLAYS = '200\n' + DVR;   // silence, under names the stage answers
  const listing = body => route => relayOf(route).includes('index-dvr') ? said(route, body) : answer(route);
  const stageVod = (relay, how = {}) => stage(relay, { path: '?v=123', copy: () => true, init: blobs, gql: withVod, ...how });
  const corrected = async page => { await page.waitForFunction(() => window.__blobs?.length, null, { timeout: 15000 }).catch(never); return page.evaluate(() => window.__blobs); };
  const started = page => page.waitForFunction(() => { const v = document.getElementById('vCDN'); return !v.paused && v.readyState >= 3 && v.currentTime > 0; }, null, { timeout: 20000 }).catch(never);
  await (async () => {
    // Google's daily limit: no asking under every name, since nothing gets through
    const asked = [];
    const { page, done } = await stageVod(route => { asked.push(relayOf(route)); return outOfFetches(route); });
    await started(page);
    const chunked = asked.filter(u => u.includes('index-dvr') && !u.includes('audio_only')).length;
    ok('the relay out of fetches: a past broadcast plays Twitch’s own playlist, after one ask', chunked === 1 && await page.evaluate(() => wraith.P.feed === 'vod' && !document.getElementById('vCDN').paused), `${chunked} asks: ${JSON.stringify(await st(page))}`);
    await done();
  })();
  await Promise.all([
    (async () => {
      const { page, done } = await stageVod(listing(FMP4));
      const [text = ''] = await corrected(page);
      ok('every address in a corrected fMP4 copy is whole, the init segment’s too', text.includes(`#EXT-X-MAP:URI="${COPY}/chunked/init-0.mp4"`) && text.includes(`\n${COPY}/chunked/0.mp4\n`), text.slice(0, 300));
      ok('a muted fMP4 segment comes from the one file the CDN has', text.includes(`\n${COPY}/chunked/1-muted.mp4\n`) && text.includes(`\n${COPY}/chunked/2-muted.mp4\n`) && !text.includes('unmuted'), text);
      await done();
    })(),
    (async () => {
      const { page, done } = await stageVod(listing(TS));
      const [text = ''] = await corrected(page);
      ok('so does a muted TS one', text.includes(`\n${COPY}/chunked/0-muted.ts\n`) && text.includes(`\n${COPY}/chunked/1.ts\n`), text);
      await done();
    })(),
    (async () => {
      // Twitch keeps some copies' source only as 1080p60: "chunked" is refused, and the video still plays
      const { page, done } = await stageVod(route => { const u = relayOf(route); return u.includes('/chunked/') ? said(route, '403\n') : u.includes('index-dvr') ? said(route, PLAYS) : answer(route); }, { copy: u => !u.includes('/chunked/') });
      const list = await corrected(page);
      ok('a copy with no “chunked” corrects the next best', list.some(t => t.includes('/1080p60/')) && !list.some(t => t.includes('/chunked/')), list.join(' ').slice(0, 200));
      await started(page);
      const s = await page.evaluate(() => { const v = document.getElementById('vCDN'); return { t: v.currentTime, paused: v.paused, msg: !document.getElementById('msgbox').hidden }; });
      ok('and plays it', s.t > 0 && !s.paused && !s.msg, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // the relay down: no corrected copy, but the player can still look under every name
      const { page, done } = await stageVod(route => route.abort().catch(never), { copy: u => u.includes('/720p60/') || u.includes('/audio_only/') });
      await started(page);
      const s = await page.evaluate(() => ({ url: document.getElementById('vCDN').dataset.url, audio: wraith.P.vodAudio, msg: !document.getElementById('msgbox').hidden }));
      ok('with the relay down it finds whichever rendition there is', s.url?.includes('/720p60/') && !s.msg, JSON.stringify(s));
      ok('and has the sound ready', s.audio?.[0]?.includes('/audio_only/'), JSON.stringify(s.audio));
      await done();
    })(),
    ...[[false, 'a video that stops partway picks up where it was, once it can', '/chunked/'], [true, 'and one that won’t moves on to the next copy, from there', '/1080p60/']].map(([stays, name, on]) => (async () => {
      const S = { bad: true };
      const { page, done } = await stageVod(route => route.abort().catch(never), { init: () => localStorage.setItem('wraith.pos.123', '100'), copy: () => true });
      await page.route(/\/chunked\/60\.aac$/, route => S.bad ? route.fulfill({ status: 403, headers, body: '' }) : route.fallback());
      await page.waitForFunction(() => document.getElementById('vCDN').error, null, { timeout: 25000 }).catch(never);
      S.bad = stays;
      await page.waitForFunction(on => { const v = document.getElementById('vCDN'); return !v.error && !v.paused && v.readyState >= 3 && v.currentTime > 1 && v.dataset.url.includes(on); }, on, { timeout: 60000 }).catch(never);
      const s = await page.evaluate(() => { const v = document.getElementById('vCDN'); return { t: v.currentTime, url: v.dataset.url, msg: !document.getElementById('msgbox').hidden }; });
      ok(name, s.t >= 100 && s.url?.includes(on) && !s.msg, JSON.stringify(s));
      await done();
    })()),
    (async () => {
      // nothing left to try: it says so, and can start over
      const { page, done } = await stageVod(route => route.abort().catch(never), { copy: () => false });
      await page.waitForFunction(() => !document.getElementById('msgbox').hidden, null, { timeout: 20000 }).catch(never);
      ok('a video nothing can play says so, with a button', await page.evaluate(() => /wouldn’t play/.test(document.getElementById('msgbox').textContent) && !!document.querySelector('#msgbox button')));
      await done();
    })(),
    (async () => {
      // listening in the background moves your place in the video, in case iOS ends the page meanwhile
      const { page, done } = await stageVod(listing(PLAYS));
      await started(page);
      await page.waitForFunction(() => wraith.P.vodAudio?.length, null, { timeout: 10000 }).catch(never);
      await vis(page, true); await sounding(page);
      const t0 = await page.evaluate(() => document.getElementById('aBG').currentTime);
      await page.waitForFunction(t => document.getElementById('aBG').currentTime > t + 6, t0, { timeout: 15000 }).catch(never);
      const s = await page.evaluate(() => ({ pos: JSON.parse(localStorage.getItem('wraith.pos.123')), t: document.getElementById('aBG').currentTime }));
      ok('your place moves on while you listen', s.pos >= Math.floor(t0) + 2 && s.pos <= s.t, `${JSON.stringify(s)} from ${t0}`);
      await backPlays(page, 'and coming back plays the picture');
      await done();
    })(),
    (async () => {
      // a pause from the lock screen stays until something plays the video, and iOS's own controls can
      const { page, done } = await stageVod(listing(PLAYS));
      await started(page);
      await page.waitForFunction(() => wraith.P.vodAudio?.length, null, { timeout: 10000 }).catch(never);
      await vis(page, true); await sounding(page);
      await cc(page, 'pause'); await sleep(200);
      await vis(page, false); await sleep(300);
      ok('paused from the lock screen, it stays paused on coming back', await page.evaluate(() => wraith.P.userPaused && document.getElementById('vCDN').paused));
      await page.evaluate(() => { document.getElementById('vCDN').play(); }); await started(page);
      ok('the video’s own play button ends that pause', await page.evaluate(() => !wraith.P.userPaused));
      await vis(page, true); await sounding(page);
      ok('so leaving again brings the sound', (await snd(page)).on);
      await done();
    })(),
    (async () => {
      // chat left scrolled up on a stream doesn't carry over to a video's replay
      const { page, done } = await stage(answer, { copy: () => true, gql: withVod });
      await levels(page, 15000);
      await page.evaluate(() => { wraith.Chat.stick = false; document.getElementById('more').hidden = false; });
      await page.evaluate(() => wraith.P.openVod('123')); await sleep(200);
      const s = await page.evaluate(() => ({ stick: wraith.Chat.stick, pill: !document.getElementById('more').hidden }));
      ok('a video’s chat starts out following', s.stick && !s.pill, JSON.stringify(s));
      await done();
    })(),
  ]);
}

if (want('cdn')) {
  const onCdn = page => page.waitForFunction(() => { const v = wraith.P.active(); return wraith.P.feed === 'cdn' && !v.paused && v.readyState >= 3 && v.currentTime > 0; }, null, { timeout: 25000 }).catch(never);
  // what the copy has, staged on the real element: a playlist's end `by` seconds past the picture, and so much of it loaded
  const fake = (page, by, ahead) => page.evaluate(([by, ahead]) => { const v = wraith.P.active(); window.__ahead = ahead; Object.defineProperty(v, 'seekable', { configurable: true, get: () => ({ length: 1, start: () => 0, end: () => v.currentTime + by }) }); Object.defineProperty(v, 'buffered', { configurable: true, get: () => ({ length: 1, start: () => 0, end: () => v.currentTime + window.__ahead }) }); }, [by, ahead]);
  const behind = (page, s) => page.evaluate(s => { const P = wraith.P; P.start = Date.now() / 1000 - P.active().currentTime - s; }, s);
  await Promise.all([
    (async () => {
      // A stream with gaps in its copy reads as far behind the clock for good. Seeking to the copy's end every second made the same second play over.
      const { page, done } = await stage(never, { sub: true, copy: () => true, since: ago(300) });
      await onCdn(page);
      await fake(page, 3.5, 2);
      await behind(page, 60);
      await page.evaluate(() => { window.__seeks = 0; wraith.P.active().addEventListener('seeking', () => window.__seeks++); });
      const t0 = await page.evaluate(() => wraith.P.active().currentTime);
      await sleep(6000);
      const s = await page.evaluate(() => ({ seeks: window.__seeks, t: wraith.P.active().currentTime, rate: wraith.P.active().playbackRate }));
      ok('a copy that can’t catch the clock isn’t seeked over and over', s.seeks === 0 && s.t > t0 + 4, JSON.stringify(s));
      ok('nor sped up with nothing to spare', s.rate <= 1, JSON.stringify(s));
      await page.evaluate(() => { const v = wraith.P.active(); Object.defineProperty(v, 'seekable', { configurable: true, get: () => ({ length: 1, start: () => 0, end: () => v.currentTime + 30 }) }); window.__seeks = 0; });
      await sleep(1500);
      ok('it still jumps when there’s somewhere to go', await page.evaluate(() => window.__seeks >= 1));
      await done();
    })(),
    (async () => {
      // the CDN adds 10 s at a time, so a speed-up has to leave enough to last until the next ten
      const { page, done } = await stage(never, { sub: true, copy: () => true, since: ago(300) });
      await onCdn(page);
      await fake(page, 30, 5);
      await behind(page, 22);
      const rate = () => page.evaluate(() => wraith.P.active().playbackRate);
      await sleep(1500);
      ok('behind, with one segment’s worth loaded: normal speed', await rate() === 1, String(await rate()));
      await page.evaluate(() => { window.__ahead = 20; });
      await sleep(1500);
      ok('with more than that: it catches up', await rate() === 1.1, String(await rate()));
      await page.evaluate(() => { window.__ahead = 8; });
      await sleep(1500);
      ok('and stops before it eats into the next wait', await rate() === 1, String(await rate()));
      await page.evaluate(() => { window.__ahead = 0.5; });
      await sleep(1500);
      ok('almost out: it slows down', await rate() < 1, String(await rate()));
      await done();
    })(),
    (async () => {
      // Some streams' copies have no "chunked".
      const { page, done } = await stage(never, { sub: true, since: ago(240), copy: u => u.includes('/1080p60/') || u.includes('/audio_only/') });
      await onCdn(page);
      const s = await page.evaluate(() => ({ url: document.getElementById('vCDN').dataset.url, msg: !document.getElementById('msgbox').hidden }));
      ok('a sub-only stream whose copy has no “chunked” plays from the next name', s.url?.includes('/1080p60/') && !s.msg, JSON.stringify(s));
      await page.evaluate(() => wraith.P.setQuality('source'));
      await onCdn(page);
      ok('and keeps to it', (await page.evaluate(() => document.getElementById('vCDN').dataset.url)).includes('/1080p60/'));
      await done();
    })(),
    (async () => {
      // A copy that has been playing and then fails is a network or player hiccup: it comes back by itself.
      const S = { up: true, asks: 0 };
      const { page, done } = await stage(never, { sub: true, since: ago(300), copy: u => { if (u.includes('chunked')) S.asks++; return S.up; } });
      await onCdn(page);
      S.up = false; S.asks = 0;
      await page.evaluate(() => wraith.P.active().load());
      await page.waitForFunction(() => wraith.P.active().error, null, { timeout: 10000 }).catch(never);
      await sleep(1500);
      let s = await snd(page);
      ok('a copy that was playing and fails doesn’t say the stream isn’t recorded', !s.msg, s.msg);
      await page.waitForFunction(() => !document.getElementById('spin').hidden, null, { timeout: 2000 }).catch(never);
      ok('it waits with the spinner up', await page.evaluate(() => !document.getElementById('spin').hidden));
      S.up = true;
      await onCdn(page);
      s = await snd(page);
      ok('and plays again once it’s back', !s.msg && !s.vPaused && S.asks >= 2, `${S.asks} asks ${JSON.stringify(s)}`);
      await done();
    })(),
    (async () => {
      // The picture stuck for good, with no error: the same watch the low-latency feed has.
      const S = { asks: 0 };
      const { page, done } = await stage(never, { sub: true, since: ago(300), copy: u => { if (u.includes('chunked')) S.asks++; return true; } });
      await onCdn(page);
      const n = S.asks;
      await page.evaluate(() => { const v = wraith.P.active(); const at = v.currentTime; Object.defineProperty(v, 'currentTime', { configurable: true, get: () => at, set() {} }); });
      await sleep(45000);
      await page.evaluate(() => { delete wraith.P.active().currentTime; });
      ok('a CDN picture stuck for good starts over', S.asks > n, `${S.asks - n} new asks`);
      await done();
    })(),
    (async () => {
      // Tokens last 20 minutes, and a stale one looks to usher like a sub-only stream.
      const S = { tokens: 0, usher: 0 };
      const { page, done } = await stage(route => { if (relayOf(route).includes('usher')) S.usher++; return answer(route); }, { pick: true, since: ago(300), copy: () => true, gql: b => { if (b.includes('streamPlaybackAccessToken')) S.tokens++; } });
      await onCdn(page);
      const n = S.tokens;
      await page.evaluate(() => wraith.P.setPref('live'));
      await levels(page, 10000);
      ok('picking low latency, long after starting on the CDN, asks for a new token', S.tokens === n + 1 && S.usher >= 1, `${S.tokens - n} new, ${S.usher} to usher`);
      await done();
    })(),
    (async () => {
      // the player script hanging, not failing: the CDN doesn't wait for the browser to give up on it
      const { page, done, t } = await stage(answer, { noPlayer: true, since: ago(300), copy: () => true });
      const ms = await toCdn(page, t);
      ok('a player script that never loads: on the CDN in about 15 s', ms < 25e3, `${ms} ms`);
      await done();
    })(),
    (async () => {
      // looking for low latency again, on the CDN because the player script failed: there's nothing to go back to until it loads
      const S = { up: false, asks: 0 };
      const { page, done } = await stage(answer, { noPlayer: true, since: ago(300), copy: () => true, init: soon });
      await page.route(/cdn\.jsdelivr\.net/, route => { S.asks++; return S.up ? route.continue().catch(never) : route.abort().catch(never); });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await toCdn(page, Date.now());
      await page.evaluate(() => { window.__emptied = 0; document.getElementById('vCDN').addEventListener('emptied', () => window.__emptied++); });
      await sleep(2500);
      ok('with the player script out, the CDN’s picture isn’t torn down to look for low latency', await page.evaluate(() => window.__emptied === 0 && wraith.P.feed === 'cdn'), `${await page.evaluate(() => window.__emptied)} reloads, ${S.asks} asks for the script`);
      S.up = true;
      await page.waitForFunction(() => wraith.P.feed === 'live' && wraith.P.hls?.levels.length, null, { timeout: 8000 }).catch(never);
      ok('and it goes back once the script has loaded', await page.evaluate(() => wraith.P.feed === 'live' && !!wraith.P.hls), `${S.asks} asks`);
      await done();
    })(),
    (async () => {
      // a sub-only stream your account can see, knocked onto the CDN by the relay: an anonymous look says nothing about it
      const { page, done } = await stage(answer, { sub: true, me: true, since: ago(300), copy: () => true, init: soon, gql: (b, route) => {
        if ((route.request().headers().authorization || '').startsWith('OAuth') && b.includes('streamPlaybackAccessToken')) return { streamPlaybackAccessToken: { value: '{}', signature: 'x', authorization: { isForbidden: false } } };
      } });
      await levels(page, 15000);
      await page.evaluate(() => wraith.P.fallback('staged'));
      await sleep(300);
      ok('(on the CDN)', await page.evaluate(() => wraith.P.feed === 'cdn'));
      await page.waitForFunction(() => wraith.P.feed === 'live' && wraith.P.hls?.levels.length, null, { timeout: 6000 }).catch(never);
      ok('a sub-only stream you can see gets low latency back through your account', await page.evaluate(() => wraith.P.feed === 'live' && !!wraith.P.hls));
      await done();
    })(),
    (async () => {
      // iOS's own fullscreen player shows one video, and swapping feeds under it leaves a frozen frame with the sound going on behind
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      const n = await page.evaluate(() => { const v = document.getElementById('vLL'); let n = 0; Object.defineProperty(v, 'webkitDisplayingFullscreen', { configurable: true, get: () => true }); v.webkitExitFullscreen = () => { n++; }; wraith.P.show('cdn'); return n; });
      ok('a swap of feeds closes iOS’s fullscreen player', n === 1, String(n));
      await done();
    })(),
    (async () => {
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      const s = await page.evaluate(() => { const c = document.getElementById('vCDN'), b = document.getElementById('bMute'), real = c.play.bind(c), was = wraith.P.active().muted; let n = 0; c.play = () => { n++; return real(); }; if (was) b.click(); n = 0; b.click(); const muting = n; b.click(); return { muting, unmuting: n }; });
      ok('muting leaves the other players alone', s.muting === 0, JSON.stringify(s));
      ok('coming off mute still starts them up', s.unmuting === 1, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      const r = await page.evaluate(() => { const P = wraith.P; P.rate = 'normal'; return { far: P.liveRate(12, 2, 0.2), plenty: P.liveRate(12, 2, 3), thin: P.liveRate(3.1, 2, 0.8), close: P.liveRate(3, 2, 0.2) }; });
      ok('far behind with nothing buffered doesn’t speed up', r.far === 'normal' && r.thin === 'normal', JSON.stringify(r));
      ok('with something buffered it does, and on a thin buffer close by it slows', r.plenty === 'fast' && r.close === 'slow', JSON.stringify(r));
      await done();
    })(),
    (async () => {
      // a break that ends with a new session arriving clean, which is what picking low latency under the cover does
      const S = { ads: false, usher: 0 };
      const laced = b => S.ads ? b.replace(/(#EXTINF:[\d.]+),live/g, '$1,Amazon|1') : b;
      const { page, done } = await stage(route => {
        const u = relayOf(route);
        if (u.includes('usher')) { S.usher++; return answer(route); }
        return said(route, laced(u.includes('audio') ? AUDIO() : MEDIA));
      }, { since: ago(300), copy: () => true });
      await levels(page, 15000);
      S.ads = true;
      await page.waitForFunction(() => wraith.P.cover && !wraith.P.dodging, null, { timeout: 25000 }).catch(never);
      S.ads = false;
      await page.evaluate(() => wraith.P.playLive());
      await page.waitForFunction(() => wraith.P.feed === 'live' && wraith.P.hls?.levels.length, null, { timeout: 8000 }).catch(never); await sleep(500);
      const n = S.usher;
      S.ads = true;
      await page.waitForFunction(() => wraith.P.ad, null, { timeout: 10000 }).catch(never); await sleep(1500);
      ok('the next ad break looks for a clean session too', S.usher > n, `${S.usher - n} asks`);
      await done();
    })(),
  ]);
}

if (want('away')) {
  await Promise.all([
    (async () => {
      // Twitch ending the audio session after hours in the background: it needs a new one, not the old one asked for again forever.
      const S = { dead: false, second: 0 };
      const { page, done } = await stage(route => {
        const u = relayOf(route);
        if (u.includes('usher')) return said(route, S.dead ? MASTER.replace('/audio.m3u8', '/audio2.m3u8') : MASTER);
        if (u.includes('audio2')) { S.second++; return said(route, AUDIO()); }
        if (u.includes('audio') && S.dead) return said(route, '403\n');
        return answer(route);
      });
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      S.dead = true;
      await page.waitForFunction(() => wraith.P.errs['background levelLoadError (fatal)'] || wraith.P.errs['background levelLoadError'], null, { timeout: 30000 }).catch(never);
      for (let i = 0; i < 300 && !S.second; i++) await sleep(100);
      ok('a background session Twitch has ended gets a new one', S.second > 0, `${S.second} calls ${JSON.stringify(await page.evaluate(() => wraith.P.errs))}`);
      await sounding(page);
      const s = await snd(page);
      ok('and the sound carries on', s.on && s.wanted && !s.paused, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // stopped meanwhile: no new session
      const S = { dead: false, usher: 0 };
      const { page, done } = await stage(route => {
        const u = relayOf(route);
        if (u.includes('usher')) { S.usher++; return answer(route); }
        if (u.includes('audio') && S.dead) return said(route, '403\n');
        return answer(route);
      });
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      S.dead = true;
      await cc(page, 'pause');
      const n = S.usher;
      await page.evaluate(() => wraith.BG.hls.trigger(Hls.Events.ERROR, { type: Hls.ErrorTypes.NETWORK_ERROR, details: 'levelLoadError', fatal: true, response: { code: 403 } }));
      await sleep(3000);
      ok('with the sound stopped it doesn’t go looking for one', S.usher === n, `${S.usher - n} asks`);
      await done();
    })(),
    (async () => {
      // leaving while it looks for a clean session, and back with the ad break still on
      const S = { ads: false };
      const laced = b => S.ads ? b.replace(/(#EXTINF:[\d.]+),live/g, '$1,Amazon|1') : b;
      const { page, done } = await stage(route => {
        const u = relayOf(route);
        return u.includes('usher') ? answer(route) : said(route, laced(u.includes('audio') ? AUDIO() : MEDIA));
      }, { since: ago(300), copy: () => true });
      await levels(page, 15000);
      S.ads = true;
      await page.waitForFunction(() => wraith.P.ad, null, { timeout: 15000 }).catch(never);
      await vis(page, true); await sleep(1500);
      await vis(page, false);
      await page.waitForFunction(() => wraith.P.cover, null, { timeout: 15000 }).catch(never);
      const s = await st(page);
      ok('coming back during an ad break picks the search up again', s.ad && s.cover && s.feed === 'cdn', JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // vC failing behind the sound isn't news: coming back loads it again
      const S = { up: true };
      const { page, done } = await stage(never, { sub: true, since: ago(300), copy: u => u.includes('audio_only') || S.up });
      await page.waitForFunction(() => { const v = wraith.P.active(); return wraith.P.feed === 'cdn' && !v.paused && v.readyState >= 3; }, null, { timeout: 25000 }).catch(never);
      await vis(page, true); await sounding(page);
      S.up = false;
      await page.evaluate(() => wraith.P.active().load());
      await page.waitForFunction(() => wraith.P.active().error, null, { timeout: 10000 }).catch(never); await sleep(300);
      ok('the picture’s copy failing while you listen says nothing', !(await snd(page)).msg, (await snd(page)).msg);
      S.up = true;
      await backPlays(page, 'and coming back plays');
      await done();
    })(),
    (async () => {
      // leaving with the picture's copy still on its way: nothing yet says where it is, and the sound's copy starts at the stream's first second
      const { page, done } = await stage(never, { sub: true, since: ago(300), copy: u => u.includes('audio_only') });
      await page.route(/\/chunked\/index-dvr\.m3u8/, never);
      await page.waitForFunction(() => wraith.P.feed === 'cdn', null, { timeout: 25000 }).catch(never);
      await page.evaluate(() => wraith.P.playCdn({ reload: true }));
      await vis(page, true); await sounding(page);
      const at = await page.evaluate(() => document.getElementById('aBG').currentTime);
      ok('leaving before the picture has loaded, the sound starts where the picture would have', at > 200, `at ${at}`);
      await done();
    })(),
    (async () => {
      // leaving with the picture held through an ad break, every kind of session having ads and the CDN having no copy
      const S = { ads: false };
      const laced = b => S.ads ? b.replace(/(#EXTINF:[\d.]+),live/g, '$1,Amazon|1') : b;
      const { page, done } = await stage(route => {
        const u = relayOf(route);
        return u.includes('usher') ? answer(route) : said(route, laced(u.includes('audio') ? AUDIO() : MEDIA));
      }, { copy: () => false });
      await levels(page, 15000);
      S.ads = true;
      await page.waitForFunction(() => { const P = wraith.P; return P.ad && !P.cover && !P.dodging && P.feed === 'live' && P.active().paused; }, null, { timeout: 25000 }).catch(never);
      await sleep(2200);
      await vis(page, true);
      let s = await snd(page);
      ok('leaving a held ad break still hands over to the sound', s.on && s.wanted, JSON.stringify(s));
      S.ads = false;
      await sounding(page);
      s = await snd(page);
      ok('which comes on when the break ends', s.on && !s.paused, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // the player under a cover dying while away: nothing else can say the break has ended
      const S = { ads: false };
      const laced = b => S.ads ? b.replace(/(#EXTINF:[\d.]+),live/g, '$1,Amazon|1') : b;
      const { page, done } = await stage(route => {
        const u = relayOf(route);
        return u.includes('usher') ? answer(route) : said(route, laced(u.includes('audio') ? AUDIO() : MEDIA));
      }, { since: ago(300), copy: () => true });
      await levels(page, 15000);
      S.ads = true;
      await page.waitForFunction(() => wraith.P.cover, null, { timeout: 25000 }).catch(never);
      await vis(page, true); await sounding(page);
      await page.evaluate(() => wraith.P.hls.stopLoad());   // which is what hls.js has done by the time a fatal error reaches the page
      S.ads = false;
      await vis(page, false);
      await page.waitForFunction(() => wraith.P.feed === 'live' && wraith.P.hls?.levels.length, null, { timeout: 8000 }).catch(never);
      const s = await st(page);
      ok('a player that died under the cover while away starts over on return', s.feed === 'live' && !s.cover && !s.ad, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // the same troubles as the picture's, for the sound's own player
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      const hit = (details, fatal) => page.evaluate(([details, fatal]) => {
        const h = wraith.BG.hls;
        window.__loads = 0;
        h.on(Hls.Events.LEVEL_LOADED, () => window.__loads++);
        h.trigger(Hls.Events.ERROR, { type: Hls.ErrorTypes.MEDIA_ERROR, details, fatal, error: new Error('staged') });
      }, [details, fatal]);
      await hit('mediaSourceRequiresReset', false);
      await sleep(1500);
      let s = await snd(page);
      ok('hls.js resetting the sound’s player by itself doesn’t leave it silent', s.wanted && !s.paused, JSON.stringify(s));
      await hit('bufferStalledError', true);
      await sleep(7000);
      const loads = await page.evaluate(() => window.__loads);
      s = await snd(page);
      ok('a fatal media error on the sound comes back with the playlist still loading', loads >= 2 && !s.paused, `${loads} loads ${JSON.stringify(s)}`);
      await done();
    })(),
  ]);
}

if (want('screen')) {
  const ui = page => page.evaluate(() => document.getElementById('stage').classList.contains('ui'));
  await Promise.all([
    (async () => {
      // A tap arrives with a mouse move ahead of it: the move brought the controls up and the tap took them down again.
      const { page, done } = await stage(answer, { touch: true });
      await levels(page, 15000);
      await page.waitForFunction(() => !document.getElementById('stage').classList.contains('ui'), null, { timeout: 8000 }).catch(never);
      const landed = up => page.waitForFunction(up => document.getElementById('stage').classList.contains('ui') === up, up, { timeout: 4000 }).catch(never).then(() => sleep(200));
      await page.touchscreen.tap(195, 110); await landed(true);
      ok('a tap on the picture brings the controls up', await ui(page));
      await sleep(400);
      await page.touchscreen.tap(195, 110); await landed(false);
      ok('and another takes them down', !(await ui(page)));
      await done();
    })(),
    (async () => {
      // a real mouse still does
      const { page, done } = await stage(answer, { w: 900, h: 1000 });
      await levels(page, 15000);
      await page.waitForFunction(() => !document.getElementById('stage').classList.contains('ui'), null, { timeout: 8000 }).catch(never);
      await page.mouse.move(300, 200); await page.mouse.move(310, 210); await sleep(100);
      ok('moving the mouse over the picture brings the controls up', await ui(page));
      await page.click('#bFull'); await sleep(300);
      ok('in fullscreen the button says it leaves', await page.evaluate(() => !!document.fullscreenElement && document.getElementById('bFull').dataset.i === 'unfull'), await page.evaluate(() => document.getElementById('bFull').dataset.i));
      await page.evaluate(() => document.exitFullscreen()); await sleep(300);
      ok('and back out it says it enters', await page.evaluate(() => document.getElementById('bFull').dataset.i === 'full'));
      await done();
    })(),
    (async () => {
      const { page, done } = await stage(answer, { offline: true, me: true });
      await page.waitForFunction(() => !document.getElementById('msgbox').hidden, null, { timeout: 10000 }).catch(never);
      await page.evaluate(() => wraith.UI.toast('Following Someone')); await sleep(250);
      const on = await page.evaluate(() => { const t = document.getElementById('toast'), r = t.getBoundingClientRect(); t.style.pointerEvents = 'auto'; return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.id; });
      ok('a toast shows over a message card', on === 'toast', String(on));
      await done();
    })(),
    (async () => {
      const { page, done, user } = await stage(answer);
      await levels(page, 15000);
      await page.evaluate(() => wraith.UI.info(wraith.P.user));
      user.stream = null;
      await page.evaluate(() => wraith.P.checkEnded()); await sleep(300);
      const s = await page.evaluate(() => ({ sub: document.getElementById('iSub').textContent, stream: wraith.P.user?.stream }));
      ok('a stream found ended on a failed restart shows as offline, under its card', s.sub === 'Offline' && !s.stream, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await page.waitForFunction(() => !document.getElementById('spin').hidden, null, { timeout: 5000 }).catch(never);
      await page.evaluate(() => document.getElementById('bPlay').click()); await sleep(150);
      ok('pausing in the middle of a stall takes the spinner down', await page.evaluate(() => document.getElementById('spin').hidden && wraith.P.active().paused));
      await done();
    })(),
    (async () => {
      // started muted by the browser: the speaker button is about what you hear, so one tap brings it back
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await page.evaluate(() => { wraith.P.active().muted = true; document.getElementById('unmute').hidden = false; document.getElementById('bMute').click(); });
      const s = await page.evaluate(() => ({ muted: wraith.P.active().muted, saved: JSON.parse(localStorage.getItem('wraith.muted') ?? 'false'), pill: !document.getElementById('unmute').hidden }));
      ok('the speaker button unmutes a picture the browser muted', !s.muted && !s.saved && !s.pill, JSON.stringify(s));
      await page.evaluate(() => document.getElementById('bMute').click());
      ok('and mutes it after that', await page.evaluate(() => wraith.P.active().muted && JSON.parse(localStorage.getItem('wraith.muted'))));
      await done();
    })(),
    (async () => {
      const pick = (page, q, groups) => page.evaluate(([q, groups]) => { const P = wraith.P, was = [P.q, P.groups]; P.q = q; P.groups = groups; const i = P.levelIndex(); [P.q, P.groups] = was; return i; }, [q, groups]);
      const LADDER = [{ i: 0, id: 'chunked', h: 1080, fps: 60, br: 8e6 }, { i: 1, id: '720p30', h: 720, fps: 30, br: 3e6 }, { i: 2, id: '480p30', h: 480, fps: 30, br: 1.5e6 }];
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      ok('a pick this stream lacks means the next one down, not the source', await pick(page, '720p60', LADDER) === 1, String(await pick(page, '720p60', LADDER)));
      ok('with one it has, that one', await pick(page, '480p30', LADDER) === 2 && await pick(page, 'source', LADDER) === 0);
      ok('and below the whole ladder, the lowest', await pick(page, '160p30', LADDER) === 2);
      ok('above it, the highest', await pick(page, '1440p60', LADDER) === 0);
      await done();
    })(),
    (async () => {
      // the screen stays on with a picture playing, and stops as it stops, even with the lock still on its way
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await page.evaluate(() => { window.__rel = 0; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => new Promise(r => setTimeout(() => r({ release: async () => { window.__rel++; }, addEventListener() {} }), 300)) } }); });
      await page.evaluate(() => { const v = wraith.P.active(); v.dispatchEvent(new Event('playing')); v.pause(); });
      await sleep(800);
      ok('a wake lock arriving after the pause lets go', await page.evaluate(() => window.__rel === 1), await page.evaluate(() => String(window.__rel)));
      await done();
    })(),
    (async () => {
      // iOS reloading a page while the app's away: it starts nothing until it's looked at, however it finds out
      const { page, done, ads } = await stage(answer, { init: () => { window.__hidden = true; Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden }); } });
      await sleep(1500);
      ok('a page loaded out of sight starts no player', await page.evaluate(() => !wraith.P.hls && !wraith.P.feed && wraith.P.login === 'staged'));
      await page.evaluate(() => { window.__hidden = false; });
      await levels(page, 5000);
      ok('and starts once it’s on screen, with iOS not saying so', await page.evaluate(() => !!wraith.P.hls && JSON.parse(localStorage.getItem('wraith.away')).some(x => x.endsWith('iOS didn’t say'))));
      await done();
    })(),
    (async () => {
      // or iOS never calling it visible at all: a tap says it's on screen
      const { page, done } = await stage(answer, { init: () => Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }) });
      await sleep(800);
      await page.mouse.click(5, 600);
      await levels(page, 5000);
      ok('on a page always called hidden, a tap starts it', await page.evaluate(() => !!wraith.P.hls));
      await done();
    })(),
    (async () => {
      // what's spent on a picture nobody's watching: a paused live stream stops loading, and picks up again on play
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      const on = () => page.evaluate(() => wraith.P.hls.loadingEnabled);
      await page.evaluate(() => { const v = wraith.P.active(); v.pause(); wraith.P.pausedAt = performance.now(); wraith.P.tick(); });
      ok('just paused, it’s still loading', await on());
      await page.evaluate(() => { wraith.P.restAfter = -1; wraith.P.tick(); });
      ok('after a few seconds paused it isn’t', !(await on()));
      await page.evaluate(() => { document.getElementById('bPlay').click(); });
      await page.waitForFunction(() => wraith.P.hls.loadingEnabled, null, { timeout: 4000 }).catch(never);
      ok('and playing starts it again', await on());
      await done();
    })(),
    (async () => {
      // autoplay refused, as in Low Power Mode: nothing loads while it waits for the tap, and the tap starts it
      const { page, done } = await stage(answer, { init: () => {
        const real = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () { return window.__allow ? real.call(this) : Promise.reject(new DOMException('no', 'NotAllowedError')); };
      } });
      await levels(page, 15000);
      await page.waitForFunction(() => !document.getElementById('bigPlay').hidden, null, { timeout: 4000 }).catch(never);
      await page.evaluate(() => { wraith.P.restAfter = -1; wraith.P.tick(); });
      ok('autoplay refused: the big play button’s up and it isn’t loading', await page.evaluate(() => !document.getElementById('bigPlay').hidden && !wraith.P.hls.loadingEnabled));
      await page.evaluate(() => { window.__allow = true; document.getElementById('bigPlay').click(); });
      await page.waitForFunction(() => wraith.P.hls.loadingEnabled, null, { timeout: 4000 }).catch(never);
      ok('and a tap has it loading', await page.evaluate(() => wraith.P.hls.loadingEnabled && !wraith.P.active().paused));
      await done();
    })(),
    (async () => {
      // chat while the app's away: the socket closes after a while, and coming back opens it and asks for what was missed
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      const hide = h => page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }, h);
      await page.evaluate(() => {
        wraith.Chat.napAfter = 100; wraith.Chat.rx = Date.now(); window.__ws = wraith.Chat.ws;
        for (const h of [true, false]) { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }
      });
      await sleep(250);
      ok('away and back straight away: chat’s left as it was', await page.evaluate(() => wraith.Chat.ws === window.__ws));
      await hide(true);
      await page.waitForFunction(() => wraith.Chat.ws === null, null, { timeout: 4000 }).catch(never);
      ok('away for a while: the chat socket closes', await page.evaluate(() => wraith.Chat.ws === null && wraith.Chat.behind));
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      ok('a network change while away doesn’t open it', await page.evaluate(() => wraith.Chat.ws === null));
      await hide(false);
      ok('back: it opens again', await page.evaluate(() => !!wraith.Chat.ws && wraith.Chat.ws !== window.__ws && wraith.Chat.behind));
      // and one that drops while away stays down until then
      await page.evaluate(() => { wraith.Chat.napAfter = 1e6; wraith.Chat.retry = 0; });
      await hide(true);
      await page.evaluate(() => wraith.Chat.ws.onclose());   // the stage's socket is a stand-in that says nothing by itself
      await sleep(1300);
      ok('a socket that drops while away isn’t retried', await page.evaluate(() => wraith.Chat.ws === null));
      await hide(false);
      ok('coming back opens it', await page.evaluate(() => !!wraith.Chat.ws));
      await done();
    })(),
    (async () => {
      // an emote service that's down holds up nothing but its own
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await page.route(/7tv\.io/, () => {});   // never answers
      await page.route(/betterttv\.net/, r => r.fulfill({ status: 200, headers, contentType: 'application/json', body: r.request().url().includes('/users/') ? JSON.stringify({ channelEmotes: [{ code: 'Hers', id: '2' }] }) : JSON.stringify([{ code: 'Quick', id: '1' }]) }));
      await page.evaluate(() => {
        window.__draws = 0; const real = wraith.Chat.redraw;
        wraith.Chat.redraw = function () { window.__draws++; return real.call(this); };
        wraith.Chat.globalDone = false; wraith.Chat.loadGlobal(); wraith.Chat.channel('1');
      });
      await page.waitForFunction(() => wraith.Chat.emotes.has('Quick') && wraith.Chat.emotes.has('Hers'), null, { timeout: 4000 }).catch(never);
      ok('a service that never answers doesn’t hold up the others’ emotes', await page.evaluate(() => wraith.Chat.emotes.has('Quick') && wraith.Chat.emotes.has('Hers')));
      await page.waitForFunction(() => window.__draws > 0, null, { timeout: 4000 }).catch(never);
      ok('and chat’s drawn again with them', await page.evaluate(() => window.__draws > 0));
      await done();
    })(),
    (async () => {
      // a stream ending in iOS's fullscreen player: it closes, with iOS told
      const { page, done } = await stage(answer, { init: iosFullscreen });
      await levels(page, 15000);
      await page.evaluate(() => wraith.P.active().webkitEnterFullscreen()); await sleep(50);
      await page.evaluate(() => wraith.P.ended(wraith.P.user));
      await page.waitForFunction(() => window.__told > 0, null, { timeout: 2000 }).catch(never);
      ok('a stream ending closes iOS’s fullscreen player', await page.evaluate(() => window.__fs === null && window.__told === 1));
      await done();
    })(),
    (async () => {
      // however it comes about, the video out of fullscreen with iOS's player never told: that one's holding the picture
      const { page, done } = await stage(answer, { init: iosFullscreen });
      await levels(page, 15000);
      const told = () => page.evaluate(() => window.__told), look = () => page.evaluate(() => wraith.P.checkFull());
      const away = () => page.evaluate(() => JSON.parse(localStorage.getItem('wraith.away')).filter(x => x.endsWith('fullscreen left open: closing it')).length);
      await page.evaluate(() => wraith.P.active().webkitEnterFullscreen()); await sleep(50);
      await look(); await look();
      ok('a video in iOS’s fullscreen player is left alone', await told() === 0);
      await page.evaluate(() => wraith.P.active().webkitExitFullscreen());
      await page.waitForFunction(() => window.__told > 0, null, { timeout: 2000 }).catch(never);
      await look(); await look();
      ok('a usual close tells iOS once, by itself', await told() === 1 && await away() === 0);
      await page.evaluate(() => wraith.P.active().webkitEnterFullscreen()); await sleep(50);
      await page.evaluate(() => { const v = wraith.P.active(); v.webkitExitFullscreen(); v.load(); }); await sleep(50);
      await look();
      ok('a reload cancels that', await told() === 1);
      await look();
      ok('and the next look tells iOS anyway', await told() === 2 && await away() === 1);
      await look(); await look();
      ok('once', await told() === 2);
      await done();
    })(),
    (async () => {
      // the relay keeps the one seat, for a page nothing on the phone can reach
      let taken = false;
      const calls = [];
      const relay = route => {
        const q = new URL(route.request().url()).searchParams;
        if (q.get('who')) calls.push({ who: q.get('who'), take: q.get('take'), ping: q.get('ping') });
        return taken ? route.fulfill({ status: 200, headers, body: '409\nanother page is playing' }).catch(never) : answer(route);
      };
      const { page, done } = await stage(relay, { init: () => Object.defineProperty(navigator, 'webdriver', { get: () => false }) });
      await levels(page, 15000);
      await page.waitForFunction(() => !wraith.Pages.taking(), null, { timeout: 5000 }).catch(never);
      const id = await page.evaluate(() => wraith.Pages.id);
      ok('a stream takes the seat with its first calls', calls[0]?.who === id && calls[0]?.take === '1', JSON.stringify(calls[0]));
      await page.evaluate(() => wraith.Pages.ask());
      await sleep(200);
      ok('and after that only says who’s asking', calls.at(-1)?.who === id && !calls.at(-1)?.take, JSON.stringify(calls.at(-1)));
      taken = true;
      await page.evaluate(() => wraith.Pages.ask());
      await page.waitForFunction(() => !wraith.P.feed, null, { timeout: 5000 }).catch(never);
      ok('told another page has it, this one stops and says so', await page.evaluate(() => !wraith.P.feed && !wraith.P.hls && /another window/.test(document.getElementById('msgbox').textContent) && JSON.parse(localStorage.getItem('wraith.away')).some(x => x.endsWith('another page took over'))));
      taken = false;
      const n = calls.length;
      await page.evaluate(() => document.querySelector('#msgbox button').click());
      await levels(page, 5000);
      ok('and its button takes the seat back', calls.slice(n).some(c => c.who === id && c.take === '1') && await page.evaluate(() => wraith.P.feed === 'live'), JSON.stringify(calls.slice(n, n + 2)));
      await done();
    })(),
    (async () => {
      // a player on a playlist call told the same, and test runs staying out of the real seat
      let taken = false, seen = 0;
      const relay = route => {
        if (new URL(route.request().url()).searchParams.get('who')) seen++;
        return taken ? route.fulfill({ status: 200, headers, body: '409\nanother page is playing' }).catch(never) : answer(route);
      };
      const { page, done } = await stage(relay, { init: () => Object.defineProperty(navigator, 'webdriver', { get: () => false }) });
      await levels(page, 15000);
      taken = true;
      await page.waitForFunction(() => !wraith.P.feed, null, { timeout: 8000 }).catch(never);
      ok('a player polling for its playlist hears it the same way', await page.evaluate(() => !wraith.P.feed && !wraith.P.hls));
      await done();
      const quiet = await stage(route => { if (new URL(route.request().url()).searchParams.get('who')) seen = -1e6; return answer(route); });
      await levels(quiet.page, 15000);
      ok('a test run never touches the real seat', seen >= 0);
      await quiet.done();
    })(),
    (async () => {
      // the settings sheet says what the player says, and can start the picture over by hand
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await page.evaluate(() => document.getElementById('bSet').click());
      const sheet = await page.$eval('#sheetBody', x => x.textContent);
      ok('the sheet says what the player says', /Frames: [\d,]+ decoded, [\d,]+ dropped .*Player: \d+×\d+ at /.test(sheet), sheet.slice(-300));
      // out of the way until asked for (2026-11-09: "clean up the settings")
      const det = () => page.evaluate(() => { const s = document.querySelector('#sheetBody .stats:last-child'), b = document.querySelector('#sheetBody .det'); return { shown: !!s.getClientRects().length, last: document.getElementById('sheetBody').lastElementChild === s, button: b?.textContent, open: b?.getAttribute('aria-expanded'), log: [...s.querySelectorAll('.log div')].map(d => d.textContent) }; });
      await page.evaluate(() => { document.getElementById('scrim').click(); wraith.Sheet.details = false; document.getElementById('bSet').click(); }); await sleep(1200);   // (the stage opens them, for every check that reads them)
      let d = await det();
      ok('shut, nothing’s worked out for them', await page.evaluate(() => !document.querySelector('#sheetBody .stats:last-child').textContent));
      ok('its details are shut until asked for, under the settings', !d.shown && d.last && d.button === 'Details' && d.open === 'false', JSON.stringify(d));
      await page.evaluate(() => { localStorage.setItem('wraith.away', JSON.stringify(['10:00:00 abcd left', '10:00:05 abcd back'])); document.querySelector('#sheetBody .det').click(); }); await sleep(1200);
      d = await det();
      ok('a tap opens them, the record of leaving and coming back a line each', d.shown && d.open === 'true' && d.log.join('|') === 'Away: |10:00:00 abcd left|10:00:05 abcd back', JSON.stringify(d));
      await page.evaluate(() => { document.querySelector('.panel').scrollTop = 1e6; });
      await page.screenshot({ path: 'fixes-sheet-details.png', timeout: 8000 }).catch(() => {});
      await page.evaluate(() => { document.getElementById('scrim').click(); document.getElementById('bSet').click(); }); await sleep(200);
      ok('and they stay open the next time the sheet does', (await det()).shown);
      await page.evaluate(() => document.querySelector('#sheetBody .det').click()); await sleep(100);
      d = await det();
      ok('until they’re shut again', !d.shown && d.open === 'false', JSON.stringify(d));
      await page.evaluate(() => { document.querySelector('.panel').scrollTop = 1e6; });
      await page.screenshot({ path: 'fixes-sheet.png', timeout: 8000 }).catch(() => {});
      ok('with nothing in it about the pill or reloading the picture', await page.evaluate(() => { const t = document.getElementById('sheetBody').textContent; return !/pill|Reload/i.test(t) && /Quality/.test(t); }), await page.evaluate(() => [...document.querySelectorAll('#sheetBody .opt')].map(b => b.textContent).join(' | ')));
      await done();
    })(),
    // the lock as WebKit grants it: within 5 s of a tap, or to a page it has already granted it to that way. It keeps its own clock of
    // real taps, since whatever page.evaluate runs counts as one to navigator.userActivation
    ...[true, false].map(straight => (async () => {
      const webkit = () => {
        let tap = -1e9, granted = false;
        window.__held = window.__asks = 0;
        for (const ev of ['touchend', 'click']) document.addEventListener(ev, () => { tap = performance.now(); }, true);
        Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
          window.__asks++;
          if (performance.now() - tap > 5000 && !granted) throw new DOMException('Permission was denied', 'NotAllowedError');
          granted = true; window.__held++;
          const s = window.__lock = { release: async () => { if (s.gone) return; s.gone = true; window.__held--; s.heard?.(); }, addEventListener(t, f) { s.heard = f; } };
          return s;
        } } });
      };
      const { page, done } = await stage(answer, straight ? { init: webkit } : { init: webkit, path: '' });
      const held = () => page.evaluate(() => window.__held), asks = () => page.evaluate(() => window.__asks);
      const playing = () => page.evaluate(() => wraith.P.active().dispatchEvent(new Event('playing')));
      if (straight) {
        await levels(page, 15000);
        await playing(); await sleep(200);
        ok('a picture that started by itself, with no tap, is refused the lock', await held() === 0 && await asks() >= 1, `${await held()} ${await asks()}`);
        ok('the settings sheet says so', await page.evaluate(() => JSON.parse(localStorage.getItem('wraith.away')).some(x => x.includes('screen lock refused: Permission was denied'))));
        const tried = await asks();
        await sleep(2500);
        ok('refused, it doesn\u2019t keep asking', await asks() <= tried + 1, `${tried} ${await asks()}`);
        await page.mouse.click(5, 600); await sleep(200);
        ok('so the next tap anywhere gets it', await held() === 1, String(await held()));
        ok('the settings sheet says that too', await page.evaluate(() => JSON.parse(localStorage.getItem('wraith.away')).at(-1).endsWith('screen lock granted')));
        const had = await asks();
        await page.mouse.click(5, 600); await sleep(200);
        ok('and a tap with it held asks for nothing more', await asks() === had && await held() === 1, `${had} ${await asks()} ${await held()}`);
        await page.evaluate(() => window.__lock?.release()); await sleep(1300);
        ok('if iOS takes it back with the picture still going, it\u2019s asked for again', await held() === 1, String(await held()));
        await page.evaluate(() => wraith.P.active().pause()); await sleep(200);
        ok('and a pause lets it go', await held() === 0, String(await held()));
      } else {
        await page.mouse.click(5, 5); await sleep(200);
        ok('the first tap on the home screen gets the go-ahead for the lock, and lets go with nothing playing', await asks() === 1 && await held() === 0, `${await asks()} ${await held()}`);
        await sleep(5500);
        await page.evaluate(() => { wraith.P.open('staged'); });
        await levels(page, 15000);
        await playing(); await sleep(200);
        ok('so a picture slower to start than a tap lasts still gets it', await held() === 1, String(await held()));
      }
      await done();
    })()),
    (async () => {
      // an ask iOS never answers doesn't stop the asking, and the settings sheet says how the screen is being kept on (Jerry,
      // 2026-11-05: "It's not keeping the screen awake", with the page unable to say which of the two had let go)
      const { page, done } = await stage(answer, { init: () => {
        window.__asks = 0;
        Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => ++window.__asks === 1 ? new Promise(() => {}) : Promise.resolve({ release: async () => {}, addEventListener() {} }) } });
      } });
      await levels(page, 15000);
      await page.mouse.click(5, 600); await sleep(200);
      const playing = () => page.evaluate(() => wraith.P.active().dispatchEvent(new Event('playing')));
      await playing(); await sleep(200);
      ok('a first ask with no answer yet holds nothing', await page.evaluate(() => !wraith.Awake.lock && window.__asks === 1));
      ok('and the sheet says it’s waiting', /^Screen: lock asked for \d+ s ago, no answer/.test(await page.evaluate(() => wraith.Awake.say())), await page.evaluate(() => wraith.Awake.say()));
      await sleep(5200); await playing(); await sleep(200);
      ok('5 s on, it asks again and gets one', await page.evaluate(() => !!wraith.Awake.lock && window.__asks === 2), String(await page.evaluate(() => window.__asks)));
      ok('the Away log says the first never came', await page.evaluate(() => JSON.parse(localStorage.getItem('wraith.away')).some(x => x.endsWith('screen lock: no answer in 5 s'))));
      ok('and the sheet says what keeps the screen on', /^Screen: kept on by the lock since \d\d:\d\d/.test(await page.evaluate(() => wraith.Awake.say())), await page.evaluate(() => wraith.Awake.say()));
      await page.evaluate(() => document.getElementById('bSet').click()); await sleep(1300);
      ok('which the settings sheet shows', await page.evaluate(() => [...document.querySelectorAll('#sheetBody .stats div')].some(d => d.textContent.startsWith('Screen: '))));
      await done();
    })(),
    (async () => {
      // Jerry, 2026-11-07: "the screen keeps sleeping", "had this problem since forever". On a Home Screen app the lock is all that keeps
      // the screen on for a stream, sound or not, and a page iOS reloaded while you were away plays on with nobody touching it, which WebKit
      // gives no lock: it says to tap once, each time you're back. A tap asks at once, even with an ask that had none still on its way.
      // And the Away log's "left" says whether the lock was held, as the screen going to sleep is one way the app leaves.
      const webkit = () => {
        let tap = -1e9, granted = false;
        window.__held = window.__asks = 0;
        for (const ev of ['touchend', 'click']) document.addEventListener(ev, () => { tap = performance.now(); }, true);
        Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => {
          window.__asks++;
          const tapped = performance.now() - tap < 5000;
          return new Promise((yes, no) => setTimeout(() => {   // WebKit asks iOS before it answers, and an ask with no tap behind it waits longest
            if (!tapped && !granted) return no(new DOMException('Permission was denied', 'NotAllowedError'));
            granted = true; window.__held++;
            const s = { release: async () => { if (s.gone) return; s.gone = true; window.__held--; s.heard?.(); }, addEventListener(t, f) { s.heard = f; } };
            yes(s);
          }, tapped ? 50 : 1500));
        } } });
      };
      const { page, done } = await stage(answer, { init: webkit });
      const toast = () => page.evaluate(() => { const t = document.getElementById('toast'); return t.hidden ? '' : t.textContent; });
      const unToast = () => page.evaluate(() => { document.getElementById('toast').hidden = true; });
      const left = async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('wraith.away') || '[]'))).filter(x => / left/.test(x)).at(-1) || '';
      const going = () => page.evaluate(() => { const v = wraith.P.active(); v.play().catch(() => {}); v.dispatchEvent(new Event('playing')); });
      const HINT = 'Tap the screen once to keep it from sleeping';
      await levels(page, 15000);
      await going();
      await page.waitForFunction(() => wraith.Awake.refused, null, { timeout: 5000 }).catch(never);
      ok('a picture going on a page that’s had no tap says to tap once to keep the screen on', await toast() === HINT, await toast());
      await vis(page, true); await sleep(200);
      let l = await left();
      ok('leaving, the Away log says the picture was going with no lock, and why', /left with the picture going, no screen lock \(refused: Permission was denied\), not touched since the page loaded$/.test(l), l);
      await unToast();
      await vis(page, false); await going();
      await page.waitForFunction(h => !document.getElementById('toast').hidden && document.getElementById('toast').textContent === h, HINT, { timeout: 5000 }).catch(never);
      ok('back in the app with still no tap, it says so again', await toast() === HINT, await toast());
      await unToast(); await sleep(1600);   // that ask's answer is in
      await going(); await sleep(100);
      ok('a picture going asks for the lock', await page.evaluate(() => !!wraith.Awake.asking && !wraith.Awake.lock));
      await page.mouse.click(5, 600); await sleep(300);
      ok('a tap asks at once, without waiting on the ask that had none, and gets it', await page.evaluate(() => !!wraith.Awake.lock && window.__held === 1), await page.evaluate(() => `${window.__asks} asks, ${window.__held} held`));
      await sleep(1700);
      ok('the earlier ask’s answer is let go of, with nothing said about it', await page.evaluate(() => !!wraith.Awake.lock && window.__held === 1) && await toast() === '', await page.evaluate(() => `${window.__held} held`));
      const say = await page.evaluate(() => wraith.Awake.say());
      ok('the settings sheet says the lock is what keeps the screen on, not the sound', /^Screen: kept on by the lock since \d\d:\d\d$/.test(say), say);
      await page.evaluate(() => wraith.P.active().pause());   // as iOS does, just before it says the app has left
      await vis(page, true); await sleep(200);
      l = await left();
      ok('and leaving, the Away log says the lock was held, and when the screen was last touched', /left with the picture going, the screen lock held since \d\d:\d\d, last touched \d+ s before$/.test(l), l);
      await done();
    })(),
    (async () => {
      // a phone on its side gives the channel row to the picture, and a message card covers the controls in the picture
      const { page, done } = await stage(answer, { path: '?c=nosuchchannel', w: 844, h: 390, gql: b => b.includes('users(logins') ? { users: [null] } : undefined });
      await page.waitForFunction(() => !document.getElementById('msgbox').hidden, null, { timeout: 10000 }).catch(never);
      const r = await page.evaluate(() => { const b = document.getElementById('bBack2').getBoundingClientRect(); return { h: b.height, on: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('button')?.id }; });
      ok('an error card on a phone on its side leaves a way back', r.h > 0 && r.on === 'bBack2', JSON.stringify(r));
      await done();
    })(),
    (async () => {
      // nothing on: no picture to give the screen to, so the channel's page is its videos
      const videos = { user: { videos: { edges: Array.from({ length: 12 }, (_, i) => ({ node: { id: String(i), title: `video ${i}`, lengthSeconds: 100, createdAt: ago(60), status: 'RECORDED', previewThumbnailURL: null, resourceRestriction: null, game: null } })) } } };
      const look = page => page.evaluate(() => {
        const r = n => { const b = n.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom), h: Math.round(b.height) }; }, q = s => document.querySelector(s);
        return { row: r(q('.info')), stage: r(q('#stage')), msg: q('#msgbox').textContent, tabs: r(q('.tabs')), across: new Set([...document.querySelectorAll('#vods a.vod')].map(n => Math.round(n.getBoundingClientRect().x))).size, n: document.querySelectorAll('#vods a.vod').length };
      });
      for (const [w, h, across, name] of [[951, 669, 3, 'Duo open'], [669, 951, 2, 'Duo upright'], [466, 678, 1, 'Duo closed']]) {
        const { page, done } = await stage(answer, { offline: true, w, h, gql: b => { if (!b.includes('users(logins') && b.includes('videos(first')) return videos; } });
        await page.waitForSelector('#vods a.vod', { state: 'attached', timeout: 8000 }).catch(never);
        await sleep(200);
        const s = await look(page);
        ok(`an offline channel, ${name}: its row, then a line saying so, then its videos`, s.row.b <= s.stage.y + 1 && s.stage.h < 90 && s.tabs.y >= s.stage.b - 1 && /offline/i.test(s.msg) && s.across === across, JSON.stringify(s));
        await page.screenshot({ path: `fixes-offline-${w}.png`, timeout: 8000 }).catch(never);
        await done();
      }
    })(),
  ]);
}

if (want('lists')) {
  const line = (id, who, text) => `@id=${id};tmi-sent-ts=${Date.now()};user-id=${who};display-name=u${who} :u${who}!u${who}@u${who}.tmi.twitch.tv PRIVMSG #staged :${text}`;
  const drawn = (page, id, timeout = 1500) => page.waitForFunction(i => document.querySelector(`#chat [data-id="${i}"]`), id, { timeout }).then(() => true, () => false);
  const json = (route, o, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(o) }).catch(never);
  // each page different channels, as Twitch's are (a channel turning up twice is listed once)
  let rowN = 0;
  const rows = (n, more) => ({ streams: { edges: Array.from({ length: n }, () => { const i = rowN++; return { cursor: 'c' + i, node: { viewersCount: 1, type: 'live', createdAt: ago(60), title: 't', previewImageURL: null, game: null, broadcaster: { login: 'u' + i, displayName: 'U' + i, profileImageURL: null } } }; }), pageInfo: { hasNextPage: more } } });
  const onBrowse = async page => { await page.evaluate(() => { localStorage.setItem('wraith.homeView', '"browse"'); }); await page.reload({ waitUntil: 'domcontentloaded' }); };
  await Promise.all([
    (async () => {
      // chat keeps pace with the picture only while there's a picture to keep pace with
      const { page, done } = await stage(answer, { w: 390 });
      await levels(page, 15000);
      await page.evaluate(() => { wraith.P.latency = () => 60; });
      await page.evaluate(l => wraith.Chat.line(l), line('c1', 1, 'held back'));
      ok('a playing picture 60 s behind holds chat back', !(await drawn(page, 'c1')));
      await page.evaluate(() => { wraith.P.ad = true; });
      ok('an ad break doesn’t stop it', await drawn(page, 'c1'));
      await page.evaluate(() => { wraith.P.ad = false; });
      await page.evaluate(l => wraith.Chat.line(l), line('c2', 2, 'paused'));
      await page.evaluate(() => document.getElementById('bPlay').click());
      ok('nor does a pause', await drawn(page, 'c2'));
      await done();
    })(),
    (async () => {
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await page.evaluate(l => wraith.Chat.line(l), line('d1', 1, 'first'));
      await drawn(page, 'd1');
      await page.evaluate(() => { wraith.P.latency = () => 60; });
      await page.evaluate(l => wraith.Chat.line(l), line('d2', 2, 'still waiting'));
      await page.evaluate(() => wraith.Chat.line(':tmi.twitch.tv CLEARCHAT #staged'));
      await page.evaluate(() => { wraith.P.latency = () => 0; });
      await drawn(page, 'd2');
      const s = await page.evaluate(() => ['d1', 'd2'].map(i => document.querySelector(`#chat [data-id="${i}"]`)?.classList.contains('gone')));
      ok('a mod clearing all of chat clears it', s[0] === true && s[1] === true, s.join());
      await done();
    })(),
    (async () => {
      // the emote services unreachable as the app starts: the next channel looks again, not only the next launch
      const S = { up: false, asked: 0 };
      const { page, done } = await stage(answer);
      await page.route('https://7tv.io/v3/emote-sets/global', route => { S.asked++; return S.up ? json(route, { emotes: [{ name: 'GlobalThing', data: { host: { url: '//cdn.7tv.app/emote/x' } } }] }) : route.abort(); });
      await page.route('https://api.betterttv.net/3/cached/emotes/global', route => json(route, [{ id: 'b1', code: 'OtherThing' }]));
      await page.route('https://api.frankerfacez.com/v1/set/global', route => json(route, { default_sets: [], sets: {} }));
      await sleep(800);   // what the page asked as it opened, before any of those, has its answer
      await page.evaluate(() => wraith.P.open('staged'));
      await page.waitForFunction(() => wraith.Chat.global?.has('OtherThing'), null, { timeout: 5000 }).catch(never); await sleep(300);
      S.up = true;
      await page.evaluate(() => wraith.P.open('staged'));
      await page.waitForFunction(() => wraith.Chat.global?.has('GlobalThing'), null, { timeout: 3000 }).catch(never);
      ok('global emotes that failed are asked for again, even with others in', await page.evaluate(() => wraith.Chat.global?.has('GlobalThing') && wraith.Chat.emotes.has('GlobalThing') && wraith.Chat.global.has('OtherThing')), `${S.asked} asks`);
      await page.evaluate(() => wraith.P.open('staged')); await sleep(400);
      const n = S.asked; await page.evaluate(() => wraith.P.open('staged')); await sleep(400);
      ok('and once in, they stay', S.asked === n);
      await done();
    })(),
    (async () => {
      // the first lines go up before the channel's emotes have arrived, and get them when they do
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await page.route('https://7tv.io/v3/users/twitch/1', async route => { await sleep(1000); return json(route, { emote_set: { emotes: [{ name: 'ChanThing', data: { host: { url: '//cdn.7tv.app/emote/y' } } }] } }); });
      await page.evaluate(ls => { wraith.P.open('staged'); ls.forEach(l => wraith.Chat.line(l)); }, [line('e1', 1, 'ChanThing'), line('e2', 2, 'ChanThing')]);
      ok('a channel’s first lines don’t wait for its emotes', await drawn(page, 'e2', 800));
      await page.evaluate(() => wraith.Chat.line(':tmi.twitch.tv CLEARCHAT #staged :u2'));
      await page.waitForFunction(() => document.querySelector('#chat [data-id="e1"] .em'), null, { timeout: 4000 }).catch(never);
      const s = await page.evaluate(() => ['e1', 'e2'].map(i => { const n = document.querySelector(`#chat [data-id="${i}"]`); return { emote: n?.querySelector('.em')?.alt, gone: n?.classList.contains('gone'), text: n?.textContent }; }));
      ok('and those lines get them once they arrive', s[0].emote === 'ChanThing' && !s[0].gone, JSON.stringify(s));
      ok('with anything deleted meanwhile staying deleted', s[1].gone, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // a past broadcast's chat, scrolled up to read something, with a busy chat playing on below
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      const n = await page.evaluate(() => {
        const R = wraith.Replay, C = wraith.Chat, batch = () => Array.from({ length: 120 }, () => ({ contentOffsetSeconds: 50, commenter: { id: '1', login: 'a', displayName: 'A' }, message: { fragments: [{ text: 'hi' }] } }));
        C.stick = false;
        R.open('1'); R.last = 100; R.busy = true;
        for (let i = 0; i < 25; i++) { R.q = batch(); R.tick(100); }
        return C.box.children.length;
      });
      ok('a past broadcast’s chat stops growing while you’re scrolled up', n <= 1320, `${n} lines`);
      await done();
    })(),
    (async () => {
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      const ts = Date.now(), reply = (id, name, login, at) => `@id=${id};tmi-sent-ts=${ts};user-id=7;display-name=Someone;reply-parent-user-login=${login};reply-parent-display-name=${name};reply-parent-msg-body=hi :someone!someone@someone.tmi.twitch.tv PRIVMSG #staged :${at} thanks`;
      await page.evaluate(ls => ls.forEach(l => wraith.Chat.line(l)), [
        reply('r1', 'Hana', 'hana', '@Hana'), reply('r2', 'はな', 'hana_jp', '@はな'), reply('r3', '𝓗𝓪𝓷𝓪', 'hana_x', '@𝓗𝓪𝓷𝓪'),
        `@id=n1;tmi-sent-ts=${ts};user-id=9;login=subber;display-name=Subber;msg-id=sub;system-msg=Subber\\ssubscribed :tmi.twitch.tv USERNOTICE #staged :hello`,
      ]);
      await drawn(page, 'n1');
      const said = await page.evaluate(() => ['r1', 'r2', 'r3'].map(i => document.querySelector(`#chat [data-id="${i}"] .tx`)?.textContent));
      ok('a reply’s text leaves out the @name above it, in any alphabet', said.every(x => x === 'thanks'), JSON.stringify(said));
      await page.evaluate(() => wraith.Chat.line(':tmi.twitch.tv CLEARCHAT #staged :subber'));
      ok('a ban takes that person’s subscription message too', await page.evaluate(() => document.querySelector('#chat [data-id="n1"]')?.classList.contains('gone')));
      await done();
    })(),
    (async () => {
      // what you were typing belongs to the channel you were typing it in
      const { page, done } = await stage(answer, { me: true, gql: b => { if (b.includes('users(logins')) return { users: JSON.parse(b).variables.l.map(login => ({ id: '1', login, displayName: login, profileImageURL: null, broadcastSettings: { title: '' }, stream: { id: '1', createdAt: ago(3600), viewersCount: 1, type: 'live', game: null, previewImageURL: '' }, videos: { edges: [] }, lastBroadcast: null })) }; } });
      await levels(page, 15000);
      const box = () => page.evaluate(() => document.getElementById('sayTx').value);
      await page.fill('#sayTx', 'for staged');
      await page.evaluate(() => wraith.P.open('staged'));
      ok('a draft stays when the same channel starts again', await box() === 'for staged', await box());
      await page.evaluate(() => wraith.P.open('other'));
      ok('and doesn’t follow you to another', await box() === '', await box());
      await page.route('https://api.twitch.tv/helix/chat/messages', async route => { await sleep(400); return json(route, { message: 'nope' }, 400); });
      await page.waitForFunction(() => wraith.Chat.uid, null, { timeout: 5000 }).catch(never);
      await page.fill('#sayTx', 'going out');
      await page.evaluate(() => { wraith.Talk.send(); wraith.P.open('another'); });
      await sleep(700);
      const s = await page.evaluate(() => ({ toast: document.getElementById('toast').textContent, chat: document.getElementById('chat').textContent }));
      ok('a message refused after you’ve moved on says where it was going, not in the new chat', s.toast.includes('other') && !s.chat.includes('Not sent'), JSON.stringify(s));
      await done();
    })(),
    (async () => {
      const { page, done } = await stage(answer, { me: true });
      await levels(page, 15000);
      await page.evaluate(() => { wraith.Home.at = 123; wraith.Picker.show(true); wraith.Me.signOut(); });
      const s = await page.evaluate(() => ({ panel: !document.getElementById('ep').hidden, at: wraith.Home.at }));
      ok('signing out closes the emote panel, whose button goes with the account', !s.panel, JSON.stringify(s));
      ok('and the home screen asks again for who’s live', s.at === 0, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // two asks at once: the first gets the token, and Twitch has spent the code by the second
      const S = { asks: 0 };
      const { page, done } = await stage(answer);
      await page.route('https://id.twitch.tv/oauth2/**', async route => {
        const u = route.request().url();
        if (u.endsWith('/device')) return json(route, { device_code: 'DEV', expires_in: 1800, interval: 60, user_code: 'ABCD', verification_uri: 'x' });
        if (u.endsWith('/token')) { if (++S.asks > 1) return json(route, { message: 'invalid device code' }, 400); await sleep(500); return json(route, { access_token: 'TOK2' }); }
        return json(route, { login: 'ironat___', user_id: '212375133', client_id: 'x', scopes: [], expires_in: 0 });
      });
      await levels(page, 15000);
      await page.evaluate(() => wraith.SignIn.start());
      await page.waitForFunction(() => wraith.SignIn.flow?.device, null, { timeout: 5000 }).catch(never);
      await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForFunction(() => wraith.Me.acct, null, { timeout: 3000 }).catch(never);
      ok('coming back from approving a sign-in, with an ask already out, doesn’t lose it', await page.evaluate(() => wraith.Me.acct?.token === 'TOK2'), `${S.asks} asks`);
      await done();
    })(),
    (async () => {
      // the Videos and About tabs
      const S = { ended: false, hang: false };
      const video = l => ({ user: { videos: { edges: [{ node: { id: '9', title: `videos of ${l}`, lengthSeconds: 100, createdAt: ago(60), status: S.ended ? 'RECORDED' : 'RECORDING', previewThumbnailURL: null, resourceRestriction: null, game: null } }] } } });
      const { page, done, user } = await stage(answer, { gql: async b => {
        if (b.includes('users(logins')) { if (S.hang) await new Promise(never); }
        else if (b.includes('videos(first')) return video(JSON.parse(b).variables.l);
      } });
      await levels(page, 15000);
      const row = () => page.evaluate(() => ({ href: document.querySelector('#vods a.vod')?.getAttribute('href'), title: document.querySelector('#vods a.vod .tt')?.textContent }));
      const tab = () => page.evaluate(() => document.querySelector('.tabs [data-pane="vods"]').click());
      await tab();
      await page.waitForSelector('#vods a.vod', { state: 'attached', timeout: 5000 }).catch(never);
      const gen = await page.evaluate(() => wraith.P.gen);
      await page.evaluate(() => document.querySelector('#vods a.vod').click());
      ok('the LIVE row of the stream already playing goes to chat without restarting it', await page.evaluate(g => wraith.P.gen === g && !document.getElementById('paneChat').hidden, gen));
      S.ended = true; user.stream = null;
      await page.evaluate(() => wraith.P.checkEnded());
      await page.waitForFunction(() => document.querySelector('#vods a.vod')?.getAttribute('href') === '?v=9', null, { timeout: 2000 }).catch(never);
      ok('a stream that ends shows up as a past broadcast', (await row()).href === '?v=9', JSON.stringify(await row()));
      S.hang = true;
      await page.evaluate(() => { wraith.P.open('newchan'); });
      await tab(); await sleep(300);
      ok('a channel still being looked up doesn’t show the last one’s videos', (await row()).title?.includes('newchan'), JSON.stringify(await row()));
      await done();
    })(),
    (async () => {
      // a list you've scrolled down isn't reloaded behind your back, but is when you ask
      const { page, done } = await stage(answer, { path: '', gql: b => { if (b.includes('streams(first')) return rows(30, true); } });
      await onBrowse(page);
      const list = () => page.evaluate(() => document.querySelectorAll('#brList .row').length);
      await page.waitForFunction(() => document.querySelectorAll('#brList .row').length >= 30, null, { timeout: 10000 }).catch(never);
      await page.waitForFunction(() => { scrollTo(0, document.documentElement.scrollHeight); return document.querySelectorAll('#brList .row').length >= 60; }, null, { timeout: 15000, polling: 100 }).catch(never);
      const was = await list();
      await page.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(500);
      ok('the network coming back leaves a long Browse list alone', await list() >= was && was >= 60, `${was} then ${await list()}`);
      await page.evaluate(() => document.getElementById('refresh').click());
      await page.waitForFunction(() => document.querySelectorAll('#brList .row').length === 30, null, { timeout: 3000 }).catch(never);
      ok('the refresh button still reloads it', await list() === 30, String(await list()));
      await done();
    })(),
    (async () => {
      // opening a stream with Browse's next page on its way: with nothing on show to fill, it was paging the whole directory
      let calls = 0;
      const { page, done } = await stage(answer, { path: '', w: 1200, h: 3400, gql: async b => { if (b.includes('streams(first')) { calls++; await sleep(500); return rows(30, true); } } });
      await onBrowse(page);
      await page.waitForFunction(() => document.querySelectorAll('#brList .row').length >= 30, null, { timeout: 10000 }).catch(never);
      await page.evaluate(() => document.querySelector('#brList .row').click());
      await sleep(1000);   // what was on its way has landed
      const at = calls; await sleep(1500);
      ok('Browse stops loading pages once a stream is open', calls === at, `${at} then ${calls}`);
      await done();
    })(),
    (async () => {
      // a category is a visit: back goes to the view it was opened from, which is also the one the app opens on
      const { page, done } = await stage(answer, { path: '' });
      const state = () => page.evaluate(() => ({ view: wraith.Home.view, follow: !document.getElementById('vFollow').hidden, saved: JSON.parse(localStorage.getItem('wraith.homeView') ?? '"follow"'), url: location.search }));
      const link = href => page.evaluate(h => { const a = document.createElement('a'); a.href = h; document.getElementById('home').append(a); a.click(); a.remove(); }, href);
      await page.waitForFunction(() => window.wraith, null, { timeout: 5000 }).catch(never);
      await link('?g=Thing'); await sleep(150);
      let s = await state();
      ok('a category opens in Browse, and the app still opens on what you chose', s.view === 'browse' && s.url === '?g=Thing' && s.saved === 'follow', JSON.stringify(s));
      await page.evaluate(() => document.getElementById('brBack').click()); await sleep(150);
      s = await state();
      ok('back from it lands on the view it was opened from', s.view === 'follow' && s.follow && s.url === '', JSON.stringify(s));
      await link('?g=Thing'); await sleep(150);
      await link('?c=staged'); await sleep(150);
      await page.goBack(); await sleep(150);
      s = await state();
      ok('back from a channel opened there lands in the category', s.view === 'browse' && s.url === '?g=Thing', JSON.stringify(s));
      await page.goBack(); await sleep(150);
      s = await state();
      ok('and back again on the view before it', s.view === 'follow' && s.follow, JSON.stringify(s));
      await page.evaluate(() => document.querySelector('.seg [data-view="browse"]').click());
      s = await state();
      ok('choosing Browse is what the app opens on', s.view === 'browse' && s.saved === 'browse', JSON.stringify(s));
      await link('?g=Thing'); await sleep(150);
      await page.evaluate(() => document.getElementById('brBack').click()); await sleep(150);
      s = await state();
      ok('and a category opened from there goes back there', s.view === 'browse' && s.url === '', JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // what your account says Twitch couldn't be trusted to have answered in full
      const S = { status: 200 };
      const { page, done } = await stage(answer, { me: true, gql: (b, route) => {
        if (!(route.request().headers().authorization || '').startsWith('OAuth')) return undefined;
        if (S.status !== 200) return route.fulfill({ status: S.status, headers, body: JSON.stringify({ error: 'Unauthorized', status: S.status, message: 'The "Authorization" token is invalid.' }) }).then(() => true);
        if (b.includes('ChannelFollows')) return { user: { follows: { edges: S.follows ?? [], pageInfo: { hasNextPage: false } } } };
        if (b.includes('blockedUsers')) return { currentUser: { blockedUsers: S.blocks ?? [] } };
        return {};
      } });
      await levels(page, 15000);
      S.status = 401;
      const r = await page.evaluate(() => wraith.Me.setFollow({ id: '5', login: 'somebody', displayName: 'Somebody' }, true).then(() => 'took', e => e.message));
      ok('a follow Twitch refused isn’t reported as done', r !== 'took' && await page.evaluate(() => !wraith.Me.following('somebody')), r);
      S.status = 200;
      await page.evaluate(() => { wraith.Me.follows = ['forsen', 'kaise']; });
      await page.evaluate(() => wraith.Me.loadFollows());
      ok('an empty follow list, with the API down, isn’t believed', await page.evaluate(() => wraith.Me.follows?.join() === 'forsen,kaise'), await page.evaluate(() => JSON.stringify(wraith.Me.follows)));
      ok('and it says why', await page.evaluate(() => !!wraith.Me.notes.follows), await page.evaluate(() => String(wraith.Me.notes.follows)));
      S.blocks = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }));
      await page.evaluate(() => { wraith.Me.blocks = new Set(Array.from({ length: 1500 }, (_, i) => String(i))); });
      await page.evaluate(() => wraith.Me.loadBlocks());
      ok('Twitch’s capped block list, with the API down, doesn’t forget the rest', await page.evaluate(() => wraith.Me.blocks.size === 1500), await page.evaluate(() => String(wraith.Me.blocks.size)));
      ok('and it says why', await page.evaluate(() => !!wraith.Me.notes.blocks));
      await done();
    })(),
    (async () => {
      // signing in on a sub-only stream you subscribe to
      const S = { approved: false };
      const { page, done } = await stage(answer, { sub: true, since: ago(300), copy: () => true, gql: (b, route) => {
        if ((route.request().headers().authorization || '').startsWith('OAuth') && b.includes('streamPlaybackAccessToken')) return { streamPlaybackAccessToken: { value: '{}', signature: 'x', authorization: { isForbidden: false } } };
      } });
      await page.route('https://id.twitch.tv/oauth2/**', route => {
        const u = route.request().url(), json = (status, o) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(o) });
        if (u.endsWith('/device')) return json(200, { device_code: 'DEV', expires_in: 1800, interval: 1, user_code: 'ABCD', verification_uri: 'x' });
        if (u.endsWith('/token')) return S.approved ? json(200, { access_token: 'TOK2' }) : json(400, { message: 'authorization_pending' });
        return json(200, { login: 'ironat___', user_id: '212375133', client_id: 'x', scopes: [], expires_in: 0 });
      });
      await page.waitForFunction(() => wraith.P.feed === 'cdn' && wraith.P.subOnly, null, { timeout: 25000 }).catch(never);
      await page.evaluate(() => wraith.SignIn.start()); await sleep(300);
      S.approved = true;
      await page.waitForFunction(() => wraith.P.feed === 'live' && wraith.P.hls?.levels.length, null, { timeout: 15000 }).catch(never);
      const s = await st(page);
      ok('signing in on a sub-only stream tries low latency again', s.feed === 'live' && s.hls && await page.evaluate(() => !wraith.P.subOnly), JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // a window tall enough to show a whole page has nothing to scroll, so nothing else loads the next
      let calls = 0;
      const { page, done } = await stage(answer, { path: '', w: 1200, h: 3400, gql: async b => { if (b.includes('streams(first')) { calls++; const more = calls < 3; await sleep(300); return rows(30, more); } } });
      await onBrowse(page); calls = 0;
      await page.waitForFunction(() => document.querySelectorAll('#brList .row').length >= 30, null, { timeout: 10000 }).catch(never); await sleep(1500);
      const n = await page.evaluate(() => document.querySelectorAll('#brList .row').length);
      ok('Browse on a tall window keeps loading until the list passes the bottom', n > 30, `${n} rows, ${calls} pages`);
      await done();
    })(),
    (async () => {
      // the same for a page failing: no looping on a failure
      let calls = 0;
      const { page, done } = await stage(answer, { path: '', w: 1200, h: 3400, gql: (b, route) => { if (b.includes('streams(first')) { calls++; return route.fulfill({ status: 500, headers, body: '{}' }).then(() => true); } } });
      await onBrowse(page); calls = 0;
      await sleep(2500);
      ok('and doesn’t hammer Twitch when that fails', calls <= 3, `${calls} calls`);
      await done();
    })(),
  ]);
}

if (want('duo')) {
  // The Duo's shapes crossed with what can be on them, staged, with Apple's safe areas and touch.
  const OPEN = [951, 669, { right: 84, bottom: 34 }], FLIP = [951, 669, { left: 84, bottom: 34 }], UP = [669, 951, { top: 59, bottom: 34 }], CLOSED = [678, 466, { right: 84, bottom: 21 }], CLOSEDFLIP = [678, 466, { left: 84, bottom: 21 }], CLOSEDUP = [466, 678, { right: 84, bottom: 55 }];
  const VIDEOS = { user: { videos: { edges: Array.from({ length: 12 }, (_, i) => ({ node: { id: String(i), title: `video ${i}`, lengthSeconds: 100, createdAt: ago(60), status: 'RECORDED', previewThumbnailURL: null, resourceRestriction: null, game: null } })) } } };
  const withVideos = b => { if (!b.includes('users(logins') && b.includes('videos(first')) return VIDEOS; };
  const on = async ([w, h, insets], how = {}) => {
    const o = await stage(answer, { w, h, me: true, gql: withVideos, ...how });
    const cdp = await o.c.newCDPSession(o.page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 0, left: 0, ...insets } });
    return o;
  };
  const rect = (page, sel) => page.evaluate(q => { const n = document.querySelector(q); if (!n) return null; const b = n.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height), seen: !!n.offsetParent }; }, sel);
  const box = async (page, ...sels) => Object.fromEntries(await Promise.all(sels.map(async q => [q, await rect(page, q)])));
  const keyboard = async (page, left, input = '#sayTx') => {
    await page.evaluate(h => Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => h }), left);
    await page.focus(input);
    await page.evaluate(() => window.visualViewport.dispatchEvent(new Event('resize')));
    await sleep(200);
  };
  const hit = (page, id) => page.evaluate(i => { const n = document.getElementById(i), b = n.getBoundingClientRect(); return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('button') === n; }, id);
  const LINE = (id, who) => `@id=${id};tmi-sent-ts=${Date.now()};user-id=${who};display-name=u${who} :u${who}!u${who}@u${who}.tmi.twitch.tv PRIVMSG #staged :hello there`;
  await Promise.all([
    // iOS 27.2 keeps the strip to itself: a Home Screen app's page is laid out beside it, 867×669 open, 382×678 closed and upright, with no
    // safe area there (Jerry, 2026-11-09: "Does Apple no longer let us use the full width of the screen?"). Laying the page out at the
    // screen's size took the strip back in Chrome and on the simulator; on the phone iOS blacked it out again with the page still under
    // it, the controls with it ("when it reverts, I just lose all the control"), which nothing in the page can see. So the page is the one
    // iOS gives, in every hold: the picture its width, chat and the box, and the controls on the picture, a tap away.
    ...[[[867, 669, { bottom: 34 }], 'open', 300], [[594, 466, { bottom: 21 }], 'closed on its side', 215], [[382, 678, { bottom: 34 }], 'closed, upright', 342]].map(([shape, name, above]) => (async () => {
      const [W, H] = shape, wide = W > H, { page, done } = await on(shape, { touch: true });
      await levels(page, 15000);
      await page.evaluate(ls => { for (const l of ls) wraith.Chat.line(l); }, Array.from({ length: 6 }, (_, i) => LINE('n' + i, i))); await sleep(300);
      await page.evaluate(() => { document.getElementById('iName').textContent = 'JellyHoshiumi'; document.getElementById('iTitle').textContent = 'SUBATHON DAY 1 (OOT & WoW Forever)'; document.getElementById('iSub').textContent = 'The Legend of Zelda: Ocarina of Time · 2.1K · 3h 12m'; }); await sleep(150);
      const s = await page.evaluate(() => ({ strip: document.documentElement.dataset.strip ?? null, meta: document.querySelector('meta[name="viewport"]').content, w: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }));
      ok(`27.2, ${name}: the page as iOS lays it out, with no strip made of it`, s.strip === null && s.meta.startsWith('width=device-width') && s.w === W && s.sw === W, JSON.stringify(s));
      let b = await box(page, '#stage', '.log', '#say', '#sayGo', '#sayTx', '.info', '#iName');
      ok(`27.2, ${name}: the picture the width of the page, from its top`, b['#stage'].x === 0 && b['#stage'].y === 0 && b['#stage'].w === W, JSON.stringify(b['#stage']));
      if (wide) ok(`27.2, ${name}: chat under it with the channel and the box beside chat, all on the page`, b['.log'].y >= b['#stage'].b - 1 && b['.log'].h >= 100 && b['.log'].w >= 300 && b['#sayGo'].x >= b['.log'].r - 1 && b['#sayGo'].r <= W && b['#say'].b <= H && b['.info'].y >= b['#stage'].b && b['.info'].b <= b['#say'].y + 1 && b['#iName'].seen, JSON.stringify(b));
      else ok(`27.2, ${name}: the channel's row, chat with most of the rest, and the box above the home bar`, b['.info'].y >= b['#stage'].b - 1 && b['.info'].h <= 46 && b['.log'].y >= b['.info'].b - 1 && b['.log'].h >= 300 && b['#sayTx'].b <= H - 34 && b['#sayGo'].r <= W, JSON.stringify(b));
      const shown = () => page.evaluate(() => getComputedStyle(document.querySelector('#stage .hud')).opacity);
      await page.evaluate(() => document.getElementById('stage').classList.remove('ui')); await sleep(500);
      ok(`27.2, ${name}: the picture clear of its controls once they've gone`, +await shown() < .05, await shown());
      await page.screenshot({ path: `fixes-duo-272-${name.replace(/\W+/g, '-')}.png`, timeout: 8000 }).catch(() => {});
      await page.touchscreen.tap(W / 2, b['#stage'].h / 2);
      await page.waitForFunction(() => +getComputedStyle(document.querySelector('#stage .hud')).opacity > .95, null, { timeout: 3000 }).catch(never);
      const all = ['bBack', 'bPlay', 'bMute', 'bLat', 'bSet', 'bFull'], c = await box(page, ...all.map(id => '#' + id));
      const reach = await Promise.all(all.map(id => hit(page, id)));
      ok(`27.2, ${name}: a tap brings them up on the picture, each there to tap`, +await shown() > .95 && all.every((id, i) => { const r = c['#' + id]; return r.seen && r.x >= 0 && r.r <= W && r.y >= 0 && r.b <= b['#stage'].b && reach[i]; }), JSON.stringify({ shown: await shown(), ui: await page.evaluate(() => document.getElementById('stage').className), reach, c }));
      await page.screenshot({ path: `fixes-duo-272-${name.replace(/\W+/g, '-')}-controls.png`, timeout: 8000 }).catch(() => {});
      await page.evaluate(() => document.getElementById('bSet').click()); await sleep(400);
      const sheet = await rect(page, '.panel');
      ok(`27.2, ${name}: a sheet opens on the page`, sheet.x >= 0 && sheet.r <= W && sheet.y >= 0 && sheet.b <= H, JSON.stringify(sheet));
      await page.evaluate(() => document.getElementById('scrim').click()); await sleep(300);
      await keyboard(page, above);
      b = await box(page, '#stage', '.log', '#say');
      ok(`27.2, ${name}, keyboard up: the box above it, with chat and the picture`, b['#say'].b <= above && b['.log'].h >= 70 && b['#stage'].h >= 90 && b['#stage'].r <= W && b['#say'].r <= W, JSON.stringify(b));
      await done();
    })()),
    // home on the closed screen as iOS 27.2 lays it out: on its side it's 594 wide, short of the 600 the header's one line and the two
    // across used to wait for
    (async () => {
      const live = b => (JSON.parse(b).variables?.l || []).slice(0, 6).map((login, i) => ({ id: String(i + 1), login, displayName: login, profileImageURL: null, broadcastSettings: { title: 'a title for it' }, stream: { id: String(i + 1), createdAt: ago(3600), viewersCount: 100 - i, type: 'live', game: { displayName: 'A Game' }, previewImageURL: '' }, videos: { edges: [] }, lastBroadcast: null }));
      const { page, c, done } = await stage(answer, { path: '', w: 594, h: 466, gql: b => b.includes('users(logins') ? { users: live(b) } : undefined });
      const cdp = await c.newCDPSession(page);
      await page.waitForSelector('#live a.row', { timeout: 15000 }).catch(never);
      const home = () => page.evaluate(() => {
        const r = q => { const b = document.querySelector(q).getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom) }; };
        return { brand: r('.brand'), word: r('.brand span + span'), seg: r('.seg'), q: r('#q'), refresh: r('#refresh'), acct: r('#acct'), cols: getComputedStyle(document.getElementById('live')).gridTemplateColumns.split(' ').length, rows: document.querySelectorAll('#live a.row').length, wide: document.documentElement.scrollWidth <= innerWidth };
      });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 21, left: 0 } }); await sleep(200);
      let h = await home();
      ok('27.2, home closed on its side: two across, the header on one line, all of it on the page', h.rows === 6 && h.cols === 2 && h.q.y < h.brand.b && h.q.r - h.q.x >= 120 && h.acct.r <= 594 && h.wide, JSON.stringify(h));
      await page.screenshot({ path: 'fixes-duo-272-home-closed-on-its-side.png', timeout: 8000 }).catch(() => {});
      await page.setViewportSize({ width: 382, height: 678 });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 34, left: 0 } }); await sleep(200);
      h = await home();
      ok('27.2, home closed and upright: one across, and the header’s buttons clear of each other', h.cols === 1 && h.wide && h.seg.r <= h.refresh.x && h.acct.r <= 382 && h.q.y >= h.brand.b - 8, JSON.stringify(h));
      await page.screenshot({ path: 'fixes-duo-272-home-closed-upright.png', timeout: 8000 }).catch(() => {});
      await done();
    })(),
    // typing: the box and some chat stay above the keyboard, on a screen short enough that the picture has to give way
    ...[[CLOSEDUP, 342, 'closed, upright'], [UP, 615, 'open, upright'], [[390, 844, { top: 59, bottom: 34 }], 508, 'a phone']].map(([shape, left, name]) => (async () => {
      const { page, done } = await on(shape);
      await levels(page, 15000);
      await keyboard(page, left);
      const b = await box(page, '#say', '.log', '#stage');
      ok(`${name}, keyboard up: the box above it, with chat and the picture`, b['#say'].b <= left && b['.log'].h >= 100 && b['#stage'].h >= 90, JSON.stringify(b));
      if (shape[0] === 390) ok('and a phone’s picture stays the size it was', b['#stage'].h === 219, JSON.stringify(b['#stage']));
      if (shape === CLOSEDUP) ok('in the same order as without it, and the picture beside iOS’s things, not under them', b['#stage'].b <= b['.log'].y + 1 && b['.log'].b <= b['#say'].y + 1 && b['#stage'].r <= 382, JSON.stringify(b));
      await done();
    })()),
    (async () => {
      const { page, done } = await on(CLOSEDUP);
      await levels(page, 15000);
      await page.evaluate(() => document.getElementById('bEmote').click()); await sleep(200);
      await keyboard(page, 342, '#epq');
      const b = await box(page, '#say', '#ep', '#stage');
      const list = await page.evaluate(() => document.getElementById('epl').clientHeight);
      ok('closed, upright, finding an emote: two rows of them above the keyboard, and the box', b['#say'].b <= 342 && list >= 86 && b['#stage'].h >= 90, `${list} ${JSON.stringify(b)}`);
      await done();
    })(),
    (async () => {
      const { page, done } = await on(CLOSEDUP);
      await levels(page, 15000);
      await page.evaluate(() => document.getElementById('bEmote').click()); await sleep(200);
      const b = await box(page, '#say', '#ep');
      ok('closed, upright, the emotes open: they and the box both on screen', b['#say'].b <= 678 && b['#ep'].h >= 120, JSON.stringify(b));
      await done();
    })(),
    // turning or folding the phone while it plays: changing how the video's parents display makes iOS rebuild its layer
    (async () => {
      const { c, page, done } = await on(OPEN);
      await levels(page, 15000);
      const cdp = await c.newCDPSession(page);
      const shown = () => page.evaluate(() => { const out = []; for (let n = document.getElementById('vLL'); n && n !== document.documentElement; n = n.parentElement) out.push(`${n.id || n.className.split(' ')[0] || n.tagName}:${getComputedStyle(n).display}`); return out.join(); });
      const start = await shown(), seen = [];
      for (const [w, h, insets] of [CLOSEDUP, CLOSED, CLOSEDFLIP, UP, FLIP, [390, 844, { top: 59, bottom: 34 }], [844, 390, { left: 59, right: 59, bottom: 21 }], OPEN]) {
        await page.setViewportSize({ width: w, height: h });
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 0, left: 0, ...insets } });
        await sleep(150);
        seen.push(await shown());
      }
      ok('the video’s parents display the same way on every shape', seen.every(x => x === start), [start, ...seen.filter(x => x !== start)].join(' | '));
      await done();
    })(),
    // closed and upright: iOS's things run down the right to 161 (228 with Now Playing in there), the picture goes just below them,
    // the channel's row beside them, and chat under the picture down to its box
    (async () => {
      const { page, done } = await on(CLOSEDUP);
      await levels(page, 15000);
      await page.evaluate(l => wraith.Chat.line(l), LINE('c1', 1)); await sleep(300);
      await page.evaluate(() => { document.getElementById('iName').textContent = 'JellyHoshiumi'; document.getElementById('iTitle').textContent = 'A very long stream title that goes on and on '.repeat(8); document.getElementById('iSub').textContent = 'Sir, We Have an Orc Problem · 1.2K · 3h 12m'; }); await sleep(150);
      let b = await box(page, '.info', '#iName', '#iTitle', '#iSub', '#stage', '.log', '#say', '#sayGo', '#sayTx');
      const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#chat .m')).paddingRight));
      ok('closed, upright: the picture just below iOS’s things, the width of the screen', b['#stage'].y >= 165 && b['#stage'].y <= 176 && b['#stage'].w === 466, JSON.stringify(b['#stage']));
      ok('the channel’s row above it, beside them, with the name, the title and the game one over another', b['.info'].y === 0 && Math.abs(b['.info'].b - b['#stage'].y) <= 1 && [b['#iName'], b['#iTitle'], b['#iSub']].every(t => t.seen && t.r <= 382 && t.b <= b['#stage'].y) && b['#iName'].b <= b['#iTitle'].y + 1 && b['#iTitle'].b <= b['#iSub'].y + 1 && b['#iTitle'].h >= 50, JSON.stringify(b));
      ok('chat under the picture, the width of the screen, down to its box', b['.log'].y >= b['#stage'].b - 1 && b['.log'].h >= 120 && pad < 84 && b['#say'].y >= b['.log'].b - 1 && b['#sayTx'].b <= 678 - 55, `${pad} ${JSON.stringify(b)}`);
      ok('the box with the width to itself', b['#sayGo'].r >= 466 - 12, JSON.stringify(b['#sayGo']));
      await page.evaluate(() => document.getElementById('stage').classList.add('ui')); await sleep(200);
      const full = await rect(page, '#bFull');
      ok('the picture’s controls run to its edge', full.r >= 466 - 8, JSON.stringify(full));
      await page.evaluate(() => { document.getElementById('stage').classList.remove('ui'); document.getElementById('bChan').click(); }); await sleep(300);
      b = await box(page, '#paneVods', '#stage', '.tabs', '#bChanX', '#bFollow');
      const vodsPad = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('vods')).paddingBottom));
      ok('the channel’s videos take chat’s place under its tabs, and the picture stays put', b['.tabs'].y >= b['#stage'].b - 1 && b['#paneVods'].y >= b['.tabs'].b - 1 && b['#paneVods'].w === 466 && b['#paneVods'].b <= 678 && b['#stage'].w === 466 && b['#stage'].y >= 165 && b['#stage'].y <= 176, JSON.stringify(b));
      ok('with the list clear of the home bar, and the follow button beside iOS’s things', vodsPad >= 55 && (!b['#bFollow'].seen || b['#bFollow'].r <= 382), `${vodsPad} ${JSON.stringify(b['#bFollow'])}`);
      await page.evaluate(() => document.getElementById('bChanX').click()); await sleep(200);
      await page.evaluate(() => document.getElementById('bEmote').click()); await sleep(200);
      b = await box(page, '#ep', '#stage', '#say');
      ok('the emotes take chat’s place too', b['#ep'].x === 0 && b['#ep'].w === 466 && b['#ep'].y >= b['#stage'].b - 1 && b['#ep'].h >= 110 && b['#say'].y >= b['#ep'].b - 1 && b['#stage'].w === 466 && b['#say'].b <= 678, JSON.stringify(b));
      await page.evaluate(ls => { for (const l of ls) wraith.Chat.line(l); }, Array.from({ length: 12 }, (_, i) => LINE('e' + i, i))); await sleep(200);
      ok('on top of it', await page.evaluate(() => { const r = document.getElementById('ep').getBoundingClientRect(); return [[0.2, 0.15], [0.5, 0.5], [0.8, 0.9]].every(([x, y]) => document.elementFromPoint(r.x + r.width * x, r.y + r.height * y)?.closest('#ep')); }));
      await page.evaluate(() => document.getElementById('bEmote').click()); await sleep(200);
      await page.screenshot({ path: 'fixes-duo-closed-upright.png', timeout: 8000 }).catch(() => {});
      await page.evaluate(() => document.getElementById('bSet').click()); await sleep(400);
      const sheet = await rect(page, '.panel');
      ok('a sheet stops short of iOS’s things', sheet.y >= 165 && sheet.b === 678, JSON.stringify(sheet));
      await done();
    })(),
    // closed on its side: the camera, and so the island, stays where it is as you turn the phone
    (async () => {
      const { page, done } = await on(CLOSED);
      await levels(page, 15000);
      let b = await box(page, '.side', '#sayGo', '.info', '#stage');
      ok('closed, strip on the right: the strip along the bottom stops short of the island at the foot', b['.side'].r <= 594 && b['#sayGo'].r <= 594 && b['.info'].r <= 594, JSON.stringify(b));
      await page.evaluate(() => document.getElementById('bChan').click()); await sleep(300);
      b = await box(page, '.tabs', '#bChanX', '.info', '#bBack2');
      ok('the channel’s tabs too', b['#bChanX'].r <= 594 && b['.info'].r <= 594, JSON.stringify(b));
      await done();
    })(),
    (async () => {
      const { page, done } = await on(CLOSEDFLIP);
      await levels(page, 15000);
      let b = await box(page, '#sayGo', '.info', '#stage', '#bPlay', '#bMute', '#bLat', '#bSet', '#bFull');
      ok('closed, strip on the left: the strip along the bottom has the width, the island being at the top', b['#sayGo'].r >= 678 - 20 && b['.info'].r === 678, JSON.stringify(b));
      const column = ['#bPlay', '#bMute', '#bLat', '#bSet', '#bFull'].map(q => b[q]);
      ok('and the controls in a column below it, in line with it', column.every((c, i) => c.seen && c.r <= 84 && Math.abs(c.x + c.w / 2 - 48) <= 2 && c.y >= (i ? column[i - 1].b : 90)) && column[4].b <= b['#stage'].b, JSON.stringify(column));
      ok('each one there to tap', await page.evaluate(() => ['bPlay', 'bMute', 'bLat', 'bSet', 'bFull'].every(id => { const n = document.getElementById(id), r = n.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === n; })));
      await page.screenshot({ path: 'fixes-duo-closed-left.png', timeout: 8000 }).catch(() => {});
      await done();
    })(),
    // the channel row: its text gets the room there is, rather than being cut off under empty space
    ...[[OPEN, 'open', 4], [FLIP, 'turned around', 4], [CLOSED, 'closed', 1], [CLOSEDFLIP, 'closed, turned around', 1]].map(([shape, name, lines]) => (async () => {
      const { page, done } = await on(shape);
      await levels(page, 15000);
      await page.evaluate(() => { document.getElementById('iName').textContent = 'JellyHoshiumi'; document.getElementById('iTitle').textContent = 'A very long stream title that goes on and on '.repeat(8); document.getElementById('iSub').textContent = 'Sir, We Have an Orc Problem · 1.2K · 3h 12m'; }); await sleep(150);
      let b = await box(page, '.info', '#stage', '#iName', '#iTitle', '#iSub', '#say');
      ok(`${name}: the name, the title and what they’re playing, one over another`, b['#iName'].seen && b['#iTitle'].seen && b['#iSub'].seen && b['#iName'].b <= b['#iTitle'].y + 1 && b['#iTitle'].b <= b['#iSub'].y + 1, JSON.stringify(b));
      ok(`${name}: ${lines} line${lines > 1 ? 's' : ''} of a long title`, Math.round(b['#iTitle'].h / 17) === lines, JSON.stringify(b['#iTitle']));
      ok(`${name}: all between the picture and the box`, b['.info'].y >= b['#stage'].b && b['.info'].b <= b['#say'].y + 1, JSON.stringify(b));
      ok(`${name}: with little left over`, b['.info'].y - b['#stage'].b <= 24, JSON.stringify(b));
      await page.evaluate(() => wraith.Talk.setReply({ id: '1', name: 'someone' })); await sleep(150);
      b = await box(page, '.info', '#stage', '#rpb');
      ok(`${name}: a reply bar takes room from the title, not the picture`, b['.info'].y >= b['#stage'].b && b['.info'].b <= b['#rpb'].y + 1, JSON.stringify(b));
      await done();
    })()),
    // chat goes back to following by itself
    (async () => {
      const { page, done } = await on(OPEN);
      await levels(page, 15000);
      await page.evaluate(ls => { for (const l of ls) wraith.Chat.line(l); wraith.Chat.resumeAfter = 2500; }, Array.from({ length: 80 }, (_, i) => LINE('f' + i, i))); await sleep(300);
      const st = () => page.evaluate(() => { const b = wraith.Chat.box; return { stick: wraith.Chat.stick, more: !document.getElementById('more').hidden, end: b.scrollHeight - b.scrollTop - b.clientHeight < 40 }; });
      const up = (hand = true) => page.evaluate(h => { const b = wraith.Chat.box; if (h) b.dispatchEvent(new Event('wheel')); b.scrollTop = b.scrollTop > 200 ? 100 : 0; }, hand);
      // only a hand on it stops it: an iPhone turned on its side and back says where chat was a good while after, with nobody touching it
      await up(false); await sleep(300);
      let s = await st();
      ok('moved up with no hand on it (a turn of the phone), chat goes on following', s.stick && s.end && !s.more, JSON.stringify(s));
      await up(); await sleep(200);
      s = await st();
      if (s.stick) { await up(); await sleep(200); s = await st(); }   // a single scroll can land with a redraw, where a finger would carry on through it
      ok('scrolled up, chat stays there', !s.stick && !s.end, JSON.stringify(s));
      await page.evaluate(l => wraith.Chat.line(l), LINE('f100', 100));
      await page.waitForFunction(() => !document.getElementById('more').hidden, null, { timeout: 1500 }).catch(never);
      ok('saying there’s more', (await st()).more);
      await page.evaluate(() => { wraith.Chat.box.scrollTop += 30; }); await sleep(1800);
      ok('moving it starts the wait again', !(await st()).stick, JSON.stringify(await st()));
      await sleep(1300);
      s = await st();
      ok('left alone for a while, it goes back to following', s.stick && s.end && !s.more, JSON.stringify(s));
      await page.evaluate(() => wraith.Chat.box.dispatchEvent(new Event('touchstart'))); await up(); await sleep(3000);
      ok('not with a finger on it', !(await st()).stick);
      await page.evaluate(() => wraith.Chat.box.dispatchEvent(new Event('touchend'))); await sleep(2900);
      ok('and it does once the finger’s gone', (await st()).stick);
      await up(); await sleep(100);
      await page.evaluate(() => document.getElementById('bSet').click()); await sleep(3000);
      ok('not with a sheet open', !(await st()).stick);
      await page.evaluate(() => document.getElementById('scrim').click()); await sleep(3000);
      ok('and it does once that’s closed', (await st()).stick);
      await done();
    })(),
    // the longer things the strip's label can say
    ...[[OPEN, 867, 951, 'open'], [FLIP, 0, 84, 'turned around'], [CLOSED, 594, 678, 'closed']].map(([shape, l, r, name]) => (async () => {
      const { page, done } = await on(shape);
      await levels(page, 15000);
      const label = async () => { await page.evaluate(() => wraith.UI.lat()); return rect(page, '#bLat'); };
      await page.evaluate(() => { wraith.P.cover = true; wraith.P.latency = () => 16; });
      let b = await label();
      ok(`${name}, the ad-free feed’s label stays in the strip`, b.x >= l && b.r <= r, JSON.stringify(b));
      await page.evaluate(() => { wraith.P.cover = false; wraith.P.show('cdn'); });
      b = await label();
      ok(`${name}, the CDN’s too`, b.x >= l && b.r <= r, JSON.stringify(b));
      await done();
    })()),
    // typing with the strip on the left: it's the far side of the screen from the box
    (async () => {
      const { page, done } = await on(FLIP);
      await levels(page, 15000);
      await page.evaluate(l => wraith.Chat.line(l), LINE('a1', 1)); await sleep(300);
      await keyboard(page, 369);
      const b = await box(page, '#sayTx', '#bBack', '#stage', '#chat');
      const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#chat .m')).paddingLeft));
      ok('turned around, keyboard up: the box and chat use their side', b['#sayTx'].w >= 180 && pad === 14, `${pad} ${JSON.stringify(b)}`);
      ok('and the picture’s controls aren’t inset twice', b['#bBack'].x <= b['#stage'].x + 7, JSON.stringify(b));
      await done();
    })(),
    // an offline channel's chat, which starts level with iOS's things
    ...[[FLIP, 84, 951, 'turned around'], [OPEN, 0, 867, 'open']].map(([shape, l, r, name]) => (async () => {
      const { page, done } = await on(shape, { offline: true });
      await page.waitForFunction(() => !document.getElementById('msgbox').hidden, null, { timeout: 10000 }).catch(never);
      await page.evaluate(() => document.getElementById('bChanX').click());
      await page.evaluate(id => wraith.Chat.line(id), LINE('b1', 1)); await sleep(400);
      const b = await box(page, '.log', '#say', '#chat .m');
      ok(`${name}, an offline channel’s chat stays out of the strip, and uses the width`, b['.log'].x >= l && b['.log'].r <= r + 1 && b['.log'].w >= 800 && b['#say'].w >= 800 && b['#say'].b <= 669, JSON.stringify(b));
      const text = await page.evaluate(() => [document.querySelector('#chat .m'), document.getElementById('msgbox')].map(n => n.getBoundingClientRect().x + parseFloat(getComputedStyle(n).paddingLeft)));
      ok(`${name}, and its lines start under the line above them`, text[0] === text[1], String(text));
      await done();
    })()),
    // with the keyboard, the picture has the height of the row that's hidden
    ...[[OPEN, 300, 290, 'open'], [CLOSED, 216, 205, 'closed']].map(([shape, left, h, name]) => (async () => {
      const { page, done } = await on(shape);
      await levels(page, 15000);
      await keyboard(page, left);
      const b = await rect(page, '#stage'), full = await rect(page, '#bFull'), send = await rect(page, '#sayGo');
      ok(`${name}, keyboard up: the picture gets the room above it`, b.h >= h && b.b <= left, JSON.stringify(b));
      ok(`${name}, and its controls run to its edge`, full.r >= b.r - 7, JSON.stringify(full));
      if (shape === CLOSED) ok('closed, the send button stays out of the strip, where iOS’s things are level with it', send.r <= 594, JSON.stringify(send));
      await done();
    })()),
    // what's left up over the channel row when the keyboard goes
    (async () => {
      const { page, done } = await on(CLOSED);
      await levels(page, 15000);
      await page.evaluate(() => wraith.Chat.names.set('abcd', 'Abcd'));
      await page.fill('#sayTx', '@ab'); await sleep(100);
      ok('(completions up)', !(await page.$eval('#ac', n => n.hidden)));
      await page.evaluate(() => document.getElementById('sayTx').blur()); await sleep(250);
      ok('closed: completions go with the keyboard, leaving the way back', await page.$eval('#ac', n => n.hidden) && await hit(page, 'bBack2'));
      await page.focus('#sayTx'); await sleep(100);
      ok('and come back with it', !(await page.$eval('#ac', n => n.hidden)));
      await page.evaluate(() => wraith.Talk.insert('Kappa')); await sleep(100);
      ok('picking an emote leaves none behind', await page.$eval('#ac', n => n.hidden));
      await page.evaluate(() => { document.getElementById('sayTx').blur(); wraith.Talk.setReply({ id: '1', name: 'someone' }); }); await sleep(200);
      ok('a reply bar leaves it too', await hit(page, 'bBack2'));
      await done();
    })(),
    (async () => {
      const { page, done } = await on(OPEN);
      await levels(page, 15000);
      await page.evaluate(() => wraith.Talk.setReply({ id: '1', name: 'someone' })); await sleep(200);
      const x = await rect(page, '#rpbX');
      ok('open, a reply bar runs the width of its column', x.r >= 951 - 12, JSON.stringify(x));
      ok('and leaves the way back', await hit(page, 'bBack2'));
      await done();
    })(),
    // filling the screen is only for a picture
    (async () => {
      const { page, done } = await on(OPEN, { offline: true });
      await page.waitForFunction(() => !document.getElementById('msgbox').hidden, null, { timeout: 10000 }).catch(never);
      await page.evaluate(() => { delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; document.getElementById('bFull').click(); });
      ok('fullscreen with no picture yet does nothing', await page.evaluate(() => !document.getElementById('watch').classList.contains('full')));
      await page.evaluate(() => { wraith.UI.fill(true); wraith.UI.msg(null, 'No channel called “x”', 'Check the spelling.'); });
      ok('a message takes the screen back from a filled picture', await page.evaluate(() => !document.getElementById('watch').classList.contains('full')));
      await done();
    })(),
    (async () => {
      const { page, done } = await on(FLIP);
      await levels(page, 15000);
      await page.evaluate(() => { wraith.UI.fill(true); document.getElementById('stage').classList.add('ui'); }); await sleep(200);
      const b = await rect(page, '#bBack');
      ok('turned around, a filled picture’s way back is clear of the island', b.x >= 84, JSON.stringify(b));
      await done();
    })(),
    // An iPhone's fullscreen is iOS's own player, for a stream too (2026-11-09: on 27.2 the page stops short of the strip, so only that is the
    // whole screen). With that player refusing the video the page fills itself: edge to edge, the controls clear of iOS's strip, the picture
    // still too small a box to count for the pill, and the button back out.
    ...[['open', OPEN], ['turned', FLIP], ['closed', CLOSED], ['closed upright', CLOSEDUP], ['upright', UP]].map(([name, s]) => (async () => {
      const { page, done } = await on(s, { init: () => { delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; HTMLVideoElement.prototype.webkitEnterFullscreen = function () { if (window.__refuse) throw new DOMException('not ready', 'InvalidStateError'); window.__native = this.id; }; } });
      await levels(page, 15000);
      await page.evaluate(() => document.getElementById('bFull').click()); await sleep(300);
      const took = await page.evaluate(() => ({ native: window.__native || null, active: wraith.P.active()?.id, full: document.getElementById('watch').classList.contains('full') }));
      ok(`fullscreen ${name}: the stream goes to iOS's own player`, took.native && took.native === took.active && !took.full, JSON.stringify(took));
      await page.evaluate(() => { window.__refuse = true; window.__native = null; document.getElementById('bFull').click(); }); await sleep(300);
      await page.evaluate(() => document.getElementById('stage').classList.add('ui')); await sleep(250);
      const [w, h, ins] = s, sal = ins.left || 0, sar = ins.right || 0, sat = ins.top || 0, sab = ins.bottom || 0;
      const st = await rect(page, '#stage'), b = await box(page, '#bFull', '#bPlay', '#bBack');
      const v = await page.evaluate(() => { const v = document.getElementById('vLL'); return { laidOut: v.offsetWidth * v.offsetHeight, native: window.__native || null, full: document.getElementById('watch').classList.contains('full'), decoy: !!document.querySelector('video.decoy')?.isConnected }; });
      const clear = Object.values(b).every(r => r && r.seen && r.x >= sal - 1 && r.r <= w - sar + 1 && r.y >= sat - 1 && r.b <= h - sab + 1);
      ok(`fullscreen ${name}: refused, the page's own, edge to edge`, v.full && !v.native && st.x === 0 && st.y === 0 && st.w === w && st.h === h, JSON.stringify({ st, v }));
      ok(`fullscreen ${name}: the controls clear of iOS's strip`, clear, JSON.stringify(b));
      ok(`fullscreen ${name}: the pill stays hidden`, v.decoy && v.laidOut < 120000, JSON.stringify(v));
      await page.evaluate(() => document.getElementById('bFull').click()); await sleep(300);
      ok(`fullscreen ${name}: the button comes back out`, await page.evaluate(() => !document.getElementById('watch').classList.contains('full') && document.getElementById('bFull').dataset.i === 'full'));
      await done();
    })()),
    // a browser that does have element fullscreen: the controls can't stay out in a strip that's gone
    (async () => {
      const { page, done } = await on(OPEN);
      await levels(page, 15000);
      await page.evaluate(() => document.getElementById('stage').requestFullscreen()).catch(never); await sleep(400);
      const s = await page.evaluate(() => { const b = document.getElementById('bPlay').getBoundingClientRect(), f = !!document.fullscreenElement; document.exitFullscreen?.(); return { f, r: b.right, w: innerWidth, seen: getComputedStyle(document.querySelector('.hud .bar')).display !== 'none' }; });
      ok('in element fullscreen the controls are back on the picture', !s.f || (s.r <= s.w && s.seen), JSON.stringify(s));
      await done();
    })(),
    // a keyboard gone while out of sight, with no viewport event after
    (async () => {
      const { page, done } = await on(OPEN);
      await levels(page, 15000);
      await keyboard(page, 300);
      await page.evaluate(() => { delete window.visualViewport.height; document.dispatchEvent(new Event('visibilitychange')); }); await sleep(150);
      ok('coming back with the keyboard gone restores the layout', await page.evaluate(() => !document.getElementById('watch').classList.contains('kb')));
      await done();
    })(),
    // Open and on its side, a picture watched with nothing touched goes to iOS's player by itself (2 minutes, shortened here), and only there
    ...[[[867, 669, { bottom: 34 }], 'open on its side', true], [OPEN, 'open on its side, with the strip the page’s', true], [[669, 873, { top: 82, bottom: 34 }], 'open, upright', false],
      [[594, 466, { bottom: 21 }], 'closed on its side', false], [[382, 678, { bottom: 34 }], 'closed, upright', false]].map(([shape, name, goes]) => (async () => {
      const { page, done } = await on(shape, { touch: true, init: () => {
        delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; window.__auto = 0;
        HTMLVideoElement.prototype.webkitEnterFullscreen = function () { if (window.__refuse) throw new DOMException('no tap', 'InvalidStateError'); window.__auto++; window.__fs = this; this.dispatchEvent(new Event('webkitbeginfullscreen')); };
        HTMLVideoElement.prototype.webkitExitFullscreen = function () { window.__exits = (window.__exits || 0) + 1; window.__fs = null; this.dispatchEvent(new Event('webkitendfullscreen')); };
        Object.defineProperty(HTMLVideoElement.prototype, 'webkitDisplayingFullscreen', { configurable: true, get() { return window.__fs === this; } });
      } });
      await levels(page, 15000);
      // the staged picture never gets a frame: it's set going by hand
      await page.evaluate(() => { const v = wraith.P.active(); Object.defineProperty(v, 'paused', { configurable: true, get: () => !!window.__paused }); wraith.P.started = true; wraith.P.quietStart = false; wraith.UI.unmute(false); wraith.Auto.after = 2500;
        // the screen lock, held as it is for a picture a tap started
        window.__held = { release: () => Promise.resolve(), addEventListener() {} }; window.__lock = window.__held;
        Object.defineProperty(wraith.Awake, 'lock', { configurable: true, get: () => window.__lock, set() {} }); });
      const n = () => page.evaluate(() => window.__auto), log = () => page.evaluate(() => JSON.parse(localStorage.getItem('wraith.away') || '[]').join(' | '));
      const went = async (ms = 8000) => page.waitForFunction(k => window.__auto > k, await n(), { timeout: ms }).then(() => true, () => false);
      const close = () => page.evaluate(() => { window.__fs = null; wraith.P.active().dispatchEvent(new Event('webkitendfullscreen')); });
      if (!goes) {
        await sleep(6000);
        ok(`by itself, ${name}: stays as it is`, await n() === 0, `${await n()} ${JSON.stringify(await page.evaluate(() => ({ w: innerWidth, h: innerHeight, watching: wraith.Auto.watching() })))}`);
        return done();
      }
      const t0 = Date.now();
      ok(`by itself, ${name}: goes to iOS's player`, await went() && await n() === 1 && Date.now() - t0 > 2000 && /fullscreen by itself/.test(await log()) && !(await page.evaluate(() => document.getElementById('watch').classList.contains('full'))), `${await n()} after ${Date.now() - t0} ms: ${await log()}`);
      await sleep(5000);
      ok(`by itself, ${name}: asked once while it's there`, await n() === 1, String(await n()));
      const beat = await page.evaluate(() => [JSON.parse(localStorage.getItem('wraith.beat') || 'null'), wraith.Pages.id, wraith.Auto.on]);
      ok(`by itself, ${name}: how the picture stands is written down, and one that plays on leaves it on`, beat[0]?.[0] === beat[1] && /^live (going|not moving) in fullscreen by itself, /.test(beat[0][2]) && beat[2], JSON.stringify(beat));
      // closed again: touches keep it out, and with none it goes back
      await close();
      for (let i = 0; i < 8; i++) { await sleep(700); await page.evaluate(() => document.dispatchEvent(new Event('touchend', { bubbles: true }))); }
      ok(`by itself, ${name}: not while the screen's being touched`, await n() === 1, String(await n()));
      ok(`by itself, ${name}: again once it's left alone`, await went() && await n() === 2, String(await n()));
      // paused, a sheet up, typing, turned off: none of them is watching
      await close();
      for (const [what, set, unset] of [
        ['paused', () => { window.__paused = true; wraith.P.userPaused = true; }, () => { window.__paused = false; wraith.P.userPaused = false; }],
        ['with no screen lock held', () => { window.__lock = null; }, () => { window.__lock = window.__held; }],
        ['with the sheet up', () => wraith.Sheet.open(), () => wraith.Sheet.close()],
        ['in the say box', () => document.getElementById('sayTx').focus(), () => document.activeElement.blur()],
        ['turned off', () => wraith.Auto.set(false), () => wraith.Auto.set(true)],
      ]) {
        await page.evaluate(set); await sleep(5000);
        ok(`by itself, ${name}: not ${what}`, await n() === 2, `${await n()} ${await page.evaluate(() => wraith.Auto.watching())}`);
        await page.evaluate(unset);
      }
      // iOS saying no: nothing else happens, and it asks again later
      await page.evaluate(() => { window.__refuse = true; wraith.Auto.since = 0; });
      await page.waitForFunction(() => /refused fullscreen by itself/.test(localStorage.getItem('wraith.away') || ''), null, { timeout: 8000 }).catch(never);
      ok(`by itself, ${name}: refused, the page stays as it is and says so`, await n() === 2 && /refused fullscreen by itself/.test(await log()) && !(await page.evaluate(() => document.getElementById('watch').classList.contains('full'))), await log());
      await page.evaluate(() => { window.__refuse = false; });
      ok(`by itself, ${name}: and asks again later`, await went() && await n() === 3, String(await n()));
      // a picture no tap has played is played in the next one, once, which is what lets iOS take it later
      await close();
      const plays = await page.evaluate(() => { const v = wraith.P.active(); let k = 0; v.tapped = false; v.play = () => { k++; return Promise.resolve(); }; document.body.click(); document.body.click(); return k; });
      ok(`by itself, ${name}: a tap plays a picture no tap had`, plays === 1, String(plays));
      // what the page before this one left: ended in a fullscreen it went to by itself, it's off; closed first, or long ago, or its own, it isn't
      const learnt = await page.evaluate(() => {
        const A = wraith.Auto, now = Date.now(), was = 'live stopped from outside in fullscreen by itself, 951×669, touched 130 s before', out = [];
        const lines = ['18:49:55 zzzz fullscreen by itself', '18:49:55 zzzz fullscreen', '18:49:57 zzzz stopped from outside, in fullscreen'];
        A.set(true); out.push([A.learn(now, [...lines, '18:50:01 zzzz fullscreen closed'], ['zzzz', now - 20e3, was])?.ended, A.on]);
        out.push([A.learn(now, lines, ['zzzz', now - 600e3, was]), A.on]);
        out.push([A.learn(now, lines, [wraith.Pages.id, now - 20e3, was]), A.on]);
        out.push([A.learn(now, lines, ['zzzz', now - 20e3, 'live going, 951×669, touched 3 s before'])?.ended, A.on]);
        const r = A.learn(now, lines, ['zzzz', now - 20e3, was]);
        out.push([r?.ended, A.on, r?.was, localStorage.getItem('wraith.autoFullOff')]);
        A.set(true);
        return out;
      });
      ok(`by itself, ${name}: a page that ended in it turns it off, and no other does`, JSON.stringify(learnt.slice(0, 4)) === JSON.stringify([[false, true], [null, true], [null, true], [false, true]])
        && learnt[4][0] === true && learnt[4][1] === false && /^was live stopped from outside in fullscreen by itself.*20 s before \| .*stopped from outside, in fullscreen$/.test(learnt[4][2]) && /the app was quit from it at \d\d:\d\d/.test(learnt[4][3]), JSON.stringify(learnt));
      // going by itself and the picture stops: out it comes, playing, and it's off, with the sheet saying why
      await page.evaluate(() => { const v = wraith.P.active(); window.__plays = 0; v.play = () => { window.__plays++; window.__paused = false; return Promise.resolve(); }; wraith.Auto.since = 0; });
      const k = await n();
      await went();
      await page.evaluate(() => { window.__paused = true; });
      await page.waitForFunction(() => !wraith.Auto.on, null, { timeout: 6000 }).catch(never);
      await sleep(1500);
      const g = await page.evaluate(() => { wraith.Sheet.open(); const said = /Turned itself off: it stopped the picture/.test(document.getElementById('sheet').textContent); wraith.Sheet.close();
        return { on: wraith.Auto.on, kept: localStorage.getItem('wraith.autoFull'), exits: window.__exits, plays: window.__plays, paused: window.__paused, full: !!window.__fs, said, log: JSON.parse(localStorage.getItem('wraith.away') || '[]').slice(-3).join(' | ') }; });
      ok(`by itself, ${name}: a picture it stops is brought back out and played, and it turns itself off`, await n() === k + 1 && !g.on && g.kept === 'false' && g.exits === 1 && g.plays >= 1 && !g.paused && !g.full && g.said && /turned off: it stopped the picture/.test(g.log), JSON.stringify(g));
      await sleep(4500);
      ok(`by itself, ${name}: and doesn't go again`, await n() === k + 1, String(await n()));
      await done();
    })()),
    // a stream ending under iOS's own player
    (async () => {
      const { page, done } = await on(OPEN);
      await levels(page, 15000);
      const n = await page.evaluate(() => { const v = document.getElementById('vLL'); let n = 0; Object.defineProperty(v, 'webkitDisplayingFullscreen', { configurable: true, get: () => true }); v.webkitExitFullscreen = () => { n++; }; wraith.P.ended(wraith.P.user); return n; });
      ok('a stream ending closes iOS’s fullscreen player, which would sit on its last frame', n === 1, String(n));
      await done();
    })(),
    // Go in search
    (async () => {
      const user = (login, displayName = login) => ({ login, displayName, profileImageURL: null, stream: null });
      const S = { users: [] };
      const { page, done } = await on(OPEN, { path: '', gql: b => { if (b.includes('searchFor')) return { searchFor: { users: { edges: S.users.map(item => ({ item })) }, channels: { edges: [] }, games: { edges: [] } } }; } });
      const go = async term => {
        await page.fill('#q', term);
        await page.waitForSelector('#sgl .sg', { state: 'attached', timeout: 2000 }).catch(never); await sleep(100);
        await page.press('#q', 'Enter'); await sleep(200);
        const u = await page.evaluate(() => location.search);
        await page.goBack(); await sleep(150);
        return u;
      };
      S.users = [user('asmongold', 'Asmongold')];
      ok('Go on part of a name opens the match it’s showing', await go('asmon') === '?c=asmongold');
      S.users = [user('somebodyelse')];
      ok('Go on a name it found nothing like opens that name', await go('zzzqqq') === '?c=zzzqqq');
      S.users = [user('xqc'), user('xqcow')];
      ok('Go on a whole name opens that name', await go('xqc') === '?c=xqc');
      await done();
    })(),
    // the search list with the keyboard up, and on a narrow header
    (async () => {
      const { page, done } = await on(CLOSED, { path: '', gql: b => { if (b.includes('searchFor')) return { searchFor: { users: { edges: Array.from({ length: 8 }, (_, i) => ({ item: { login: 'user' + i, displayName: 'User ' + i, profileImageURL: null, stream: null } })) }, channels: { edges: [] }, games: { edges: [] } } }; } });
      await keyboard(page, 236, '#q');
      await page.fill('#q', 'user');
      await page.waitForSelector('#sgl .sg', { state: 'attached', timeout: 3000 }).catch(never); await sleep(150);
      const b = await rect(page, '#sgl');
      ok('closed, the search list ends above the keyboard', b.b <= 236, JSON.stringify(b));
      ok('and is wide enough for the names', b.w >= 300, JSON.stringify(b));
      ok('without running off the side', b.x >= 0 && b.r <= 678 - 84, JSON.stringify(b));
      await done();
    })(),
    // tapping the Home tab you're on
    (async () => {
      const rows = n => ({ streams: { edges: Array.from({ length: n }, (_, i) => ({ cursor: 'c' + i, node: { viewersCount: 1, type: 'live', createdAt: ago(60), title: 't', previewImageURL: null, game: null, broadcaster: { login: 'u' + i, displayName: 'U' + i, profileImageURL: null } } })), pageInfo: { hasNextPage: false } } });
      const { page, done } = await on(OPEN, { path: '', gql: b => { if (b.includes('game(name')) return { game: { displayName: 'Chess', viewersCount: 5, ...rows(30) } }; if (b.includes('streams(first')) return rows(30); } });
      await page.evaluate(() => { localStorage.setItem('wraith.homeView', '"browse"'); }); await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelectorAll('#brList .row').length >= 30, null, { timeout: 10000 }).catch(never);
      await page.evaluate(() => { wraith.Home.y.browse = 900; scrollTo(0, 300); document.querySelector('.seg [data-view="browse"]').click(); }); await sleep(100);
      ok('tapping the tab you’re on goes to its top, not somewhere you once were', await page.evaluate(() => scrollY === 0), String(await page.evaluate(() => scrollY)));
      await page.evaluate(() => { scrollTo(0, 400); const a = document.createElement('a'); a.href = '?g=Chess'; document.getElementById('home').append(a); a.click(); a.remove(); }); await sleep(300);
      await page.evaluate(() => scrollTo(0, 250));
      await page.evaluate(() => document.querySelector('.seg [data-view="follow"]').click()); await sleep(100);
      await page.evaluate(() => document.querySelector('.seg [data-view="browse"]').click()); await sleep(300);
      ok('a category’s place doesn’t become its list’s', await page.evaluate(() => scrollY === 400), String(await page.evaluate(() => scrollY)));
      await done();
    })(),
    // the hint in the box
    (async () => {
      const { page, done } = await on(CLOSED);
      await levels(page, 15000);
      const s = await page.evaluate(() => {
        wraith.Chat.room = { 'followers-only': '0', slow: '12' }; wraith.Talk.hint();
        const n = document.getElementById('sayTx'), c = getComputedStyle(n), p = getComputedStyle(n, '::placeholder'), x = document.createElement('canvas').getContext('2d');
        x.font = `${p.fontWeight} ${p.fontSize} ${c.fontFamily}`;
        return { text: x.measureText(n.placeholder).width, room: n.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight), hint: n.placeholder };
      });
      ok('closed, chat’s hint fits its box', s.text <= s.room, JSON.stringify(s));
      await done();
    })(),
    // the home bar
    (async () => {
      const { page, done } = await on(OPEN, { offline: true });
      await page.waitForSelector('#vods a.vod', { state: 'attached', timeout: 8000 }).catch(never);
      const pad = q => page.evaluate(q => parseFloat(getComputedStyle(document.querySelector(q)).paddingBottom), q);
      ok('an offline channel’s list ends above the home bar', await pad('#vods') >= 34, String(await pad('#vods')));
      await page.evaluate(() => document.querySelector('.tabs [data-pane="about"]').click()); await sleep(100);
      ok('its About too', await pad('#about') >= 34, String(await pad('#about')));
      await done();
    })(),
    (async () => {
      const { page, done } = await on(CLOSED);
      await levels(page, 15000);
      const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('chat')).paddingBottom));
      ok('closed, chat’s last line clears the home bar', pad >= 14, String(pad));
      // and the short strip, put to use
      await page.evaluate(() => document.getElementById('bEmote').click()); await sleep(200);
      const s = await page.evaluate(() => ({ list: document.getElementById('epl').clientHeight, q: document.getElementById('epq').offsetHeight }));
      ok('closed, the emotes get two rows or more', s.list >= 88, JSON.stringify(s));
      await page.evaluate(() => document.getElementById('bEmote').click());
      await page.evaluate(() => document.getElementById('bChan').click());
      await page.waitForSelector('#vods a.vod', { state: 'attached', timeout: 8000 }).catch(never); await sleep(100);
      const t = await rect(page, '#vods .thumb');
      ok('and a video’s picture uses the strip’s height', t.h >= 76 && t.b <= 466, JSON.stringify(t));
      await done();
    })(),
  ]);
}

if (want('unseen')) {
  // Nothing makes a sound out of sight that you didn't leave playing (2026-11-05: a page nobody could see started Asmongold the moment he went
  // live, took the seat on a tap of its own from long before, and its sound took over from the Twitch app).
  const goLive = user => { user.stream = { id: 'new' + Date.now(), createdAt: ago(20), viewersCount: 1, type: 'live', game: null, previewImageURL: '' }; };
  const seated = () => Object.defineProperty(navigator, 'webdriver', { get: () => false });
  const offlineCard = page => page.waitForFunction(() => !document.getElementById('msgbox').hidden && /offline/i.test(document.getElementById('msgbox').textContent), null, { timeout: 10000 }).catch(never);
  const log = page => page.evaluate(() => JSON.parse(localStorage.getItem('wraith.away') || '[]'));
  // what each call to the relay said about the seat, pings included
  const seatLog = (calls, answer409 = () => false) => route => {
    const q = new URL(route.request().url()).searchParams;
    if (q.get('who')) calls.push({ ping: !!q.get('ping'), take: !!q.get('take') });
    return answer409() ? said(route, '409\nanother page is playing') : answer(route);
  };
  // The staged picture never gets a frame (stage() sends no video), so a picture that has played is marked as one.
  const played = page => page.evaluate(() => wraith.P.active().dispatchEvent(new Event('playing')));
  // The sound not heard since minutes ago, which is what a page iOS froze, woken hours later, looks like: its clock of hearing it held there.
  const unheard = page => page.evaluate(() => { const at = Date.now() - 6 * 60e3; Object.defineProperty(wraith.BG, 'heard', { configurable: true, get: () => at, set() {} }); });
  const heardAgain = page => page.evaluate(() => Object.defineProperty(wraith.BG, 'heard', { configurable: true, writable: true, value: 0 }));
  await Promise.all([
    (async () => {
      // out of sight, a channel going live waits for you, and starts the moment you're back
      let fetched = 0;
      const { page, done, user } = await stage(route => { if (relayOf(route)) fetched++; return answer(route); }, { offline: true });
      await offlineCard(page);
      await vis(page, true);
      goLive(user);
      await page.evaluate(() => wraith.P.lookLive()); await sleep(1500);
      let s = await snd(page);
      ok('a channel going live while you’re away doesn’t start, or fetch anything', !s.feed && !s.on && fetched === 0, JSON.stringify({ ...s, fetched }));
      await vis(page, false);
      await levels(page, 8000);
      s = await snd(page);
      ok('coming back starts it at once', s.feed === 'live' && !s.msg, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // on screen to itself but not the page iOS sends your taps to: the same
      const { page, done, user } = await stage(answer, { offline: true });
      await offlineCard(page);
      await page.evaluate(() => { document.hasFocus = () => false; });
      goLive(user);
      await page.evaluate(() => wraith.P.lookLive()); await sleep(1500);
      ok('a page not in front doesn’t start either', !(await snd(page)).feed);
      await page.evaluate(() => { delete document.hasFocus; window.dispatchEvent(new Event('focus')); });
      await levels(page, 8000);
      ok('and starts once it is', (await snd(page)).feed === 'live');
      await done();
    })(),
    (async () => {
      // opening a channel that's offline takes the seat then; starting by itself later takes nothing, and plays while the seat's still its own
      const calls = [];
      const { page, done, user } = await stage(seatLog(calls), { offline: true, init: seated });
      await offlineCard(page); await sleep(500);
      ok('opening an offline channel takes the seat', calls.some(c => c.ping && c.take), JSON.stringify(calls));
      await page.evaluate(() => { wraith.Pages.takeAt = 0; });   // your last tap long ago
      const n = calls.length;
      goLive(user);
      await page.evaluate(() => wraith.P.lookLive());
      await levels(page, 8000);
      ok('starting by itself when they go live takes nothing, and plays', (await snd(page)).feed === 'live' && calls.length > n && calls.slice(n).every(c => !c.take), JSON.stringify(calls.slice(n, n + 3)));
      await done();
    })(),
    (async () => {
      // the same with another page in the seat since: it stops at its first call, making no sound (what would have saved the Twitch app)
      const calls = []; let taken = false;
      const { page, done, user } = await stage(seatLog(calls, () => taken), { offline: true, init: seated });
      await offlineCard(page); await sleep(500);
      await page.evaluate(() => { wraith.Pages.takeAt = 0; });
      taken = true;
      goLive(user);
      await page.evaluate(() => wraith.P.lookLive());
      await page.waitForFunction(() => /another window/.test(document.getElementById('msgbox').textContent), null, { timeout: 10000 }).catch(never);
      const s = await snd(page);
      ok('a page that starts by itself with another in the seat stops, quietly', !s.feed && !s.on && /another window/.test(s.msg) && calls.every(c => !c.take || c.ping), JSON.stringify({ s, calls }));
      await done();
    })(),
    (async () => {
      // a stream starting over by itself, long after your last tap, plays only while the seat's still its own
      const calls = []; let taken = false;
      const { page, done, user } = await stage(seatLog(calls, () => taken), { init: seated });
      await levels(page, 15000);
      ok('a stream you open takes the seat', calls.find(c => !c.ping)?.take === true, JSON.stringify(calls.slice(0, 3)));
      await page.evaluate(() => { wraith.Pages.takeAt = 0; });
      const n = calls.length;
      user.stream = { ...user.stream, id: 'restarted' };
      await page.evaluate(() => wraith.P.refresh());
      await page.waitForFunction(() => wraith.P.user?.stream?.id === 'restarted' && wraith.P.hls?.levels.length, null, { timeout: 15000 }).catch(never);
      ok('starting over by itself, it doesn’t take the seat', calls.length > n && calls.slice(n).every(c => !c.take), JSON.stringify(calls.slice(n, n + 4)));
      taken = true;
      await page.waitForFunction(() => !wraith.P.feed, null, { timeout: 8000 }).catch(never);
      const s = await snd(page);
      ok('so with another page in the seat it stops, making no sound', !s.feed && !s.on && /another window/.test(s.msg), JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // a tap long ago doesn't still count
      const calls = [];
      const { page, done } = await stage(seatLog(calls), { init: seated, path: '' });
      await sleep(500);
      await page.evaluate(() => { wraith.Pages.takeAt = Date.now() - 61e3; wraith.P.open('staged'); });
      await levels(page, 15000);
      ok('an old tap doesn’t take the seat', calls.some(c => !c.ping) && calls.every(c => !c.take), JSON.stringify(calls.slice(0, 4)));
      await done();
    })(),
    (async () => {
      // a sound gone quiet too long doesn't come back by itself
      let usher = 0;
      const { page, done } = await stage(route => { if (relayOf(route).includes('usher')) usher++; return answer(route); });
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      await unheard(page); await sleep(1500);
      let s = await snd(page);
      ok('a sound unheard for minutes gives up', s.on && !s.wanted && s.paused, JSON.stringify(s));
      ok('and the record says so', (await log(page)).some(x => x.endsWith('sound gave up')));
      const u0 = usher;
      await page.evaluate(() => wraith.BG.hls.trigger(Hls.Events.ERROR, { type: Hls.ErrorTypes.NETWORK_ERROR, details: 'levelLoadError', fatal: true, response: { code: 403 } }));
      await sleep(3000);
      ok('a load failing then doesn’t go looking for a new session', usher === u0, `${usher - u0} asks`);
      await page.evaluate(() => { wraith.P.user.stream.id = 'older'; return wraith.P.refresh(); });
      await levels(page, 15000); await sleep(2500);
      s = await snd(page);
      ok('nor does the stream restarting bring it back', !s.on && s.paused && s.vPaused, JSON.stringify(s));
      await heardAgain(page);
      await vis(page, false); await sleep(1000);
      s = await snd(page);
      ok('coming back plays it, unmuted', !s.on && !s.vPaused && !s.userPaused && !s.vMuted && await page.evaluate(() => document.getElementById('unmute').hidden), JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // the playlist the sound's player asks for after waking is where it notices, before anything plays
      let audio = 0;
      const { page, done } = await stage(route => { if (relayOf(route).includes('audio')) audio++; return answer(route); });
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      await page.evaluate(() => wraith.BG.hls.stopLoad());
      await unheard(page);
      const a0 = audio;
      await page.evaluate(() => wraith.BG.hls.startLoad(-1)); await sleep(1500);
      const s = await snd(page);
      ok('a sound woken after too long fetches nothing and stays quiet', audio === a0 && !s.wanted && s.paused, `${audio - a0} calls ${JSON.stringify(s)}`);
      await done();
    })(),
    (async () => {
      // a few minutes' quiet while the stream restarts still carries on
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      await page.evaluate(() => { wraith.BG.heard = Date.now() - 3 * 60e3; wraith.P.user.stream.id = 'older'; return wraith.P.refresh(); });
      await sounding(page);
      const s = await snd(page);
      ok('a stream back within a few minutes brings the sound back with it', s.on && s.wanted && !s.paused, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // left with nothing to hear: a player starting over while away makes no sound, and coming back plays it with its sound
      const { page, done } = await stage(answer);
      await levels(page, 15000); await played(page);
      await page.evaluate(() => wraith.P.active().pause()); await sleep(2500);   // iOS paused it well before you left
      await vis(page, true); await sleep(300);
      await page.evaluate(() => { window.__plays = 0; const real = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__plays++; return real.call(this); }; wraith.P.restart(); });
      await page.waitForFunction(() => wraith.P.hls?.levels.length, null, { timeout: 15000 }).catch(never); await sleep(2500);
      let s = await snd(page);
      ok('a player starting over while you’re away without sound stays quiet', !s.on && s.vPaused && await page.evaluate(() => window.__plays === 0), JSON.stringify(s));
      await vis(page, false); await sleep(1000);
      s = await snd(page);
      ok('and coming back plays it, unmuted', !s.vPaused && !s.vMuted && await page.evaluate(() => document.getElementById('unmute').hidden), JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // the stream restarting with nobody looking or listening waits, and plays once you're back, not paused as if you'd paused it
      const { page, done } = await stage(answer);
      await levels(page, 15000); await played(page);
      await page.evaluate(() => wraith.P.active().pause()); await sleep(2500);
      await vis(page, true); await sleep(300);
      await page.evaluate(() => { wraith.P.user.stream.id = 'older'; return wraith.P.refresh(); });
      await levels(page, 15000); await sleep(1500);
      let s = await snd(page);
      ok('a stream restarting with nobody watching waits', !s.on && s.vPaused, JSON.stringify(s));
      await vis(page, false); await sleep(1000);
      s = await snd(page);
      ok('and plays when you’re back', !s.vPaused && !s.userPaused, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // Control Center's play still brings back a sound that gave up
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      await unheard(page); await sleep(1500);
      await heardAgain(page);
      await cc(page, 'play'); await sounding(page);
      const s = await snd(page);
      ok('Control Center’s play brings a sound that gave up back', s.on && s.wanted && !s.paused, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // a picture paused as you left (iOS's own controls, say) isn't started by coming back: only one iOS wouldn't start out of sight is
      const { page, done } = await stage(answer);
      await levels(page, 15000); await played(page);
      await page.evaluate(() => wraith.P.active().pause()); await sleep(2500);
      await vis(page, true); await sleep(300);
      await vis(page, false); await sleep(1500);
      const s = await snd(page);
      ok('a picture paused before you left stays paused when you’re back', s.vPaused && !s.on, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // a copy on the CDN never goes near the relay: a start by itself asks for the seat before anything plays
      const calls = []; let copies = 0;
      const { page, done, user } = await stage(seatLog(calls, () => calls.length > 1), { offline: true, pick: true, init: seated, copy: () => { copies++; return true; } });
      await offlineCard(page); await sleep(500);
      await page.evaluate(() => { wraith.Pages.takeAt = 0; });
      goLive(user);
      await page.evaluate(() => wraith.P.lookLive());
      await page.waitForFunction(() => /another window/.test(document.getElementById('msgbox').textContent), null, { timeout: 10000 }).catch(never);
      await sleep(1000);
      const s = await snd(page);
      ok('a CDN feed starting by itself with another page in the seat never loads', !s.feed && copies === 0 && await page.evaluate(() => !document.getElementById('vCDN').getAttribute('src')), JSON.stringify({ copies, s }));
      await done();
    })(),
  ]);
}

if (want('player')) {
  // The live player's own failures, from the 2026-11-05 review: a stale token, a token that didn't come, a restart already on the new
  // broadcast, the CDN's names with no ladder, and what the stats count.
  await Promise.all([
    (async () => {
      // usher refusing the first session is a stale token as often as a sub-only stream: a fresh token gets asked first
      let refused = 0;
      const { page, done } = await stage(route => relayOf(route).includes('usher') && !refused++ ? said(route, '403\nForbidden') : answer(route));
      await levels(page, 15000);
      const s = await st(page);
      ok('a refused first session asks again with a fresh token before calling it sub-only', s.feed === 'live' && s.hls && !(await page.evaluate(() => wraith.P.subOnly)), JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // the token not coming once: another start, not the CDN
      let fails = 1;
      const { page, done } = await stage(answer, { gql: async (b, route) => { if (b.includes('streamPlaybackAccessToken') && fails-- > 0) { await route.fulfill({ status: 500, headers, body: 'down' }).catch(never); return true; } } });
      await levels(page, 15000);
      const s = await st(page);
      ok('a token that doesn’t come starts again rather than going to the CDN', s.feed === 'live' && s.hls, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // a restart that already picked up the new broadcast isn't torn down again when the minute's check sees it
      const { page, done, user } = await stage(answer);
      await levels(page, 15000);
      const gen = await page.evaluate(() => wraith.P.gen);
      user.stream = { ...user.stream, id: '2' };
      await page.evaluate(() => { wraith.P.liveId = '2'; return wraith.P.refresh(); });
      const s = await page.evaluate(() => ({ gen: wraith.P.gen, id: wraith.P.user?.stream?.id }));
      ok('a new broadcast the player is already on is taken in without starting over', s.gen === gen && s.id === '2', JSON.stringify({ gen, s }));
      await done();
    })(),
    (async () => {
      const { page, done } = await stage(answer, { offline: true });
      const s = await page.evaluate(() => { const P = wraith.P; P.groups = []; P.rend = null; P.q = '720p60'; const a = P.cdnRendition(); P.q = 'source'; return [a, P.cdnRendition()]; });
      ok('with no ladder the CDN copy follows the quality picked', s[0] === '720p60' && s[1] === 'chunked', JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // the stats count what the relay fetched: two for a start that brings its first playlist along, none for a refusal
      let reply = '200\n#EXTM3U\n#EXT-X-STREAM-INF:X\nhttps://x.playlist.ttvnw.net/a.m3u8\n#WRAITH-MEDIA:200 https://x.playlist.ttvnw.net/a.m3u8\n#EXTM3U';
      const { page, done } = await stage(route => said(route, reply), { offline: true });
      const n0 = await page.evaluate(() => wraith.Quota.n);
      await page.evaluate(() => wraith.relayGet('https://usher.ttvnw.net/api/channel/hls/x.m3u8'));
      const n1 = await page.evaluate(() => wraith.Quota.n);
      reply = '409\nanother page is playing';
      await page.evaluate(() => wraith.relayGet('https://x.playlist.ttvnw.net/a.m3u8'));
      const n2 = await page.evaluate(() => wraith.Quota.n);
      ok('the relay count is what it fetched', n1 - n0 === 2 && n2 === n1, JSON.stringify([n0, n1, n2]));
      await done();
    })(),
  ]);
}

if (want('lists2')) {
  // Lists and getting around, from the 2026-11-05 review.
  const row = (login, v) => ({ cursor: login, node: { viewersCount: v, type: 'live', createdAt: ago(60), title: login, previewImageURL: '', game: null, broadcaster: { login, displayName: login, profileImageURL: '' } } });
  await Promise.all([
    (async () => {
      // Browse pages by place in a list that re-sorts: a channel turning up again isn't listed twice
      let pageN = 0;
      const gql = async b => { if (!b.includes('streams(first: 30')) return; pageN++; return { streams: { edges: pageN === 1 ? ['a1', 'a2', 'a3'].map((l, i) => row(l, 100 - i)) : ['a3', 'a4'].map((l, i) => row(l, 50 - i)), pageInfo: { hasNextPage: pageN === 1 } } }; };
      const { page, done } = await stage(answer, { path: '', gql });
      await page.evaluate(() => { wraith.Home.setView('browse'); });
      await page.waitForFunction(() => document.querySelectorAll('#brList .row, #brList a').length >= 3, null, { timeout: 8000 }).catch(never);
      await page.evaluate(() => wraith.Browse.page()); await sleep(800);
      const names = await page.evaluate(() => [...document.querySelectorAll('#brList [href]')].map(a => new URL(a.href).searchParams.get('c')).filter(Boolean));
      ok('Browse never lists a channel twice', names.length === new Set(names).size && names.includes('a4'), JSON.stringify(names));
      await done();
    })(),
    (async () => {
      // your follows asked for again while a load is under way load once it's done
      let users = 0;
      const gql = async b => { if (b.includes('users(logins')) { users++; await sleep(1200); } };
      const { page, done } = await stage(answer, { path: '', gql });
      await sleep(300);
      await page.evaluate(() => { wraith.Home.at = 0; wraith.Home.load(true); wraith.Home.load(true); });
      await sleep(4000);
      ok('a reload asked for during one comes after it', users >= 2, `${users} loads`);
      await done();
    })(),
    (async () => {
      // how far in you are survives iOS reloading the page
      const { page, done } = await stage(answer, { path: '', offline: true });
      await sleep(300);
      await page.evaluate(() => { history.pushState({ depth: 1 }, '', '?c=staged'); });
      await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(800);
      await page.evaluate(() => document.getElementById('bBack').click()); await sleep(800);
      const s = await page.evaluate(() => ({ search: location.search, home: !document.getElementById('home').hidden, state: history.state }));
      ok('back after iOS reloads a channel goes back, not over it', s.search === '' && s.home && !s.state?.depth, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      const { page, done } = await stage(answer, { path: '' });
      await sleep(300);
      await page.evaluate(() => { wraith.UI.toast('one'); document.getElementById('home').hidden = true; document.getElementById('watch').hidden = false; wraith.UI.toast('two'); });
      await sleep(4600);
      ok('two toasts close by both go', await page.evaluate(() => document.getElementById('gtoast').hidden && document.getElementById('toast').hidden));
      await done();
    })(),
  ]);
}

if (want('pill')) {
  // The Now Playing pill hidden in front (2026-11-05), as far as Chrome can show it: what WebKit would see, not what iOS draws.
  const look = page => page.evaluate(() => {
    const v = document.getElementById('vLL'), r = v.getBoundingClientRect(), s = document.querySelector('.stage').getBoundingClientRect(), d = document.querySelector('video.decoy');
    return { free: document.querySelector('.stage').classList.contains('pillfree'), laidOut: v.offsetWidth * v.offsetHeight, fills: Math.abs(r.width - s.width) < 2 && Math.abs(r.height - s.height) < 2,
      decoy: !!d?.isConnected, stream: d?.srcObject instanceof MediaStream, decoyBox: d ? d.offsetWidth * d.offsetHeight : 0, meta: !!navigator.mediaSession.metadata, play: !!window.__ms.play, muted: v.muted };
  });
  await Promise.all([
    (async () => {
      const { page, done } = await stage(answer);
      await levels(page, 15000); await sleep(500);
      let s = await look(page);
      ok('in front with a picture: a large stand-in, the picture laid out small but filling the stage, no Now Playing details or buttons',
        s.free && s.decoy && s.stream && s.decoyBox >= 120000 && s.laidOut < 120000 && s.fills && !s.meta && !s.play, JSON.stringify(s));
      await vis(page, true); await sounding(page);
      s = await look(page);
      ok('leaving puts the details and buttons back and takes the stand-in away, and the sound plays', !s.free && !s.decoy && s.meta && s.play && (await snd(page)).on, JSON.stringify(s));
      await vis(page, false); await sleep(1500);
      s = await look(page);
      ok('and coming back hides them again', s.free && s.decoy && !s.meta && !s.play, JSON.stringify(s));
      await page.evaluate(() => document.getElementById('bPlay').click()); await sleep(300);
      ok('a paused picture is muted meanwhile, so WebKit has nothing to publish', (await look(page)).muted);
      await page.evaluate(() => document.getElementById('bPlay').click()); await sleep(500);
      ok('and playing again has its sound back', !(await look(page)).muted);
      await done();
    })(),
  ]);
}

if (want('budget')) {
  // What the relay's 20,000 fetches a day go on (2026-11-05 review).
  await Promise.all([
    (async () => {
      // away, the sound asks for its playlist only as what's listed runs low, not every 2 s, and goes on playing
      const calls = [];
      const { page, done } = await stage(route => { const q = new URL(route.request().url()).searchParams; calls.push({ k: q.get('k'), t: Date.now() }); return answer(route); });
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      const t0 = Date.now(), a0 = await page.evaluate(() => document.getElementById('aBG').currentTime);
      await sleep(20000);
      const sound = calls.filter(c => c.k === 'a' && c.t >= t0).length, picture = calls.filter(c => c.k === 'v' && c.t >= t0).length;
      const s = await snd(page), a1 = await page.evaluate(() => document.getElementById('aBG').currentTime);
      ok('away, the sound reloads its playlist about every 3.5 s, not every 2', sound >= 3 && sound <= 7, `${sound} in 20 s`);
      ok('and the picture’s player asks for nothing meanwhile', picture === 0, `${picture}`);
      ok('and the sound plays on through it', s.on && !s.paused && a1 - a0 > 17, `${(a1 - a0).toFixed(1)} s heard`);
      await done();
    })(),
    (async () => {
      // away with nothing to hear: the picture's player stops at once rather than polling on for 5 s
      const calls = [];
      const { page, done } = await stage(route => { calls.push(Date.now()); return answer(route); });
      await levels(page, 15000);
      await page.evaluate(() => document.getElementById('bMute').click());
      await vis(page, true);
      const t0 = Date.now(); await sleep(6000);
      ok('away with the sound off, nothing polls the relay', calls.filter(t => t > t0 + 500).length === 0, `${calls.filter(t => t > t0).length} calls`);
      await done();
    })(),
  ]);
}

if (want('return')) {
  // Leaving, coming back and the seat, from the 2026-11-05 review.
  const seated = () => Object.defineProperty(navigator, 'webdriver', { get: () => false });
  const goLive = user => { user.stream = { id: 'new' + Date.now(), createdAt: ago(20), viewersCount: 1, type: 'live', game: null, previewImageURL: '' }; };
  const offlineCard = page => page.waitForFunction(() => !document.getElementById('msgbox').hidden && /offline/i.test(document.getElementById('msgbox').textContent), null, { timeout: 10000 }).catch(never);
  // the relay's seat as Code.gs keeps it: a take sets it, any other named page is turned away
  const seatRelay = seat => route => {
    const q = new URL(route.request().url()).searchParams, who = q.get('who');
    if (who && q.get('take')) seat.holder = who;
    seat.calls.push({ who, pg: q.get('pg'), take: !!q.get('take'), ping: !!q.get('ping') });
    return who && seat.holder && seat.holder !== who ? said(route, '409\nanother page is playing') : answer(route);
  };
  await Promise.all([
    (async () => {
      // a channel you're waiting on whose seat went to a page iOS has since dropped: coming back claims it, so going live later plays
      const seat = { holder: null, calls: [] };
      const { page, done, user } = await stage(seatRelay(seat), { offline: true, init: seated });
      await offlineCard(page); await sleep(300);
      seat.holder = 'gone';
      await page.evaluate(() => { wraith.Pages.takeAt = 0; wraith.Pages.askedAt = 0; });
      await vis(page, true); await vis(page, false); await sleep(500);
      ok('coming back to a channel waiting to go live claims the seat', seat.holder === await page.evaluate(() => wraith.Pages.id), JSON.stringify(seat));
      await page.evaluate(() => { wraith.Pages.takeAt = Date.now() - 61e3; wraith.Pages.touchedAt = Date.now(); });
      goLive(user);
      await page.evaluate(() => wraith.P.lookLive());
      await levels(page, 8000);
      const s = await snd(page);
      ok('so going live a while later plays there', s.feed === 'live' && !/another window/.test(s.msg), JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // nobody touching the screen for a quarter of an hour: going live starts muted, with the button to unmute
      const { page, done, user } = await stage(answer, { offline: true });
      await offlineCard(page);
      await page.evaluate(() => { wraith.Pages.touchedAt = Date.now() - 16 * 60e3; });
      goLive(user);
      await page.evaluate(() => wraith.P.lookLive());
      await levels(page, 8000); await sleep(500);
      let s = await page.evaluate(() => ({ muted: document.getElementById('vLL').muted, button: !document.getElementById('unmute').hidden }));
      ok('going live long after the last touch starts muted, with the unmute button', s.muted && s.button, JSON.stringify(s));
      await page.evaluate(() => document.getElementById('unmute').click()); await sleep(300);
      s = await page.evaluate(() => ({ muted: document.getElementById('vLL').muted, button: !document.getElementById('unmute').hidden }));
      ok('and unmuting there is all it takes', !s.muted && !s.button, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // with a touch lately it plays with sound, as before
      const { page, done, user } = await stage(answer, { offline: true });
      await offlineCard(page);
      await page.evaluate(() => { wraith.Pages.touchedAt = Date.now(); });
      goLive(user);
      await page.evaluate(() => wraith.P.lookLive());
      await levels(page, 8000); await sleep(500);
      ok('going live just after a touch plays with sound', await page.evaluate(() => !document.getElementById('vLL').muted && document.getElementById('unmute').hidden));
      await done();
    })(),
    (async () => {
      // 3 minutes since the last touch is too long for a stream starting by itself to make a sound: iOS may be calling in front a page that isn't
      const { page, done, user } = await stage(answer, { offline: true });
      await offlineCard(page);
      await page.evaluate(() => { wraith.Pages.touchedAt = Date.now() - 3 * 60e3; });
      goLive(user);
      await page.evaluate(() => wraith.P.lookLive());
      await levels(page, 8000); await sleep(500);
      const s = await page.evaluate(() => ({ muted: document.getElementById('vLL').muted, button: !document.getElementById('unmute').hidden }));
      ok('going live 3 minutes after the last touch starts muted', s.muted && s.button, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // something outside the page stops the picture, likely another app taking the sound: only you or iOS start it again (2026-11-08, over YouTube)
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      const going = () => page.waitForFunction(() => { const v = wraith.P.active(); return v && !v.paused && v.readyState >= 2; }, null, { timeout: 8000 }).catch(never);
      const state = () => page.evaluate(() => { const v = wraith.P.active(); return { paused: v.paused, taken: wraith.P.taken, big: !document.getElementById('bigPlay').hidden, muted: v.muted }; });
      // the stream made here may have no frames to show, where a picture iOS stops has what it had loaded
      const fromOutside = () => page.evaluate(() => { const v = wraith.P.active(); Object.defineProperty(v, 'readyState', { configurable: true, get: () => 4 }); wraith.Pages.touchedAt = Date.now() - 10e3; v.pause(); });
      const tap = () => page.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await going();
      await fromOutside(); await sleep(200);
      ok('a pause from outside the page is told from one of yours', (await state()).taken);
      await page.evaluate(() => wraith.P.play(wraith.P.active())); await sleep(700);
      let s = await state();
      ok('and the page doesn’t start it again by itself: it waits, with the big button', s.paused && s.big, JSON.stringify(s));
      await tap(); await going();
      await page.waitForFunction(() => document.getElementById('bigPlay').hidden, null, { timeout: 3000 }).catch(never);
      s = await state();
      ok('a tap plays it', !s.paused && !s.taken && !s.big, JSON.stringify(s));
      await fromOutside(); await sleep(200);
      await page.evaluate(() => { const v = wraith.P.active(); v.play().catch(() => {}); v.dispatchEvent(new Event('playing')); }); await going();
      ok('iOS playing it again itself is iOS’s to do', !(await state()).taken);
      await page.evaluate(() => { wraith.Pages.touchedAt = Date.now(); wraith.P.active().pause(); }); await sleep(200);
      ok('a pause right after a touch isn’t from outside', !(await state()).taken);
      await page.evaluate(() => wraith.P.play(wraith.P.active())); await going();
      await page.evaluate(() => { wraith.Pages.touchedAt = Date.now(); wraith.P.active().pause(); }); await sleep(1300);
      await page.evaluate(() => { wraith.P.ranAt = Date.now() - 70e3; wraith.Pages.seenAt = Date.now() - 31 * 60e3; wraith.P.play(wraith.P.active()); }); await sleep(500);
      s = await state();
      ok('stopped over a minute with nobody about for half an hour, it waits too', s.paused && s.big, JSON.stringify(s));
      await tap(); await going();
      ok('and a tap plays that', !(await state()).paused);
      await page.evaluate(() => { const v = wraith.P.active(); wraith.Pages.seenAt = Date.now() - 3 * 3600e3; wraith.P.ranAt = Date.now(); v.pausing = true; v.pause(); wraith.P.play(v); }); await sleep(700);
      s = await state();
      ok('a stream you’re watching hiccuping starts again with its sound, however long since a touch', !s.paused && !s.big && !s.muted, JSON.stringify(s));
      await sleep(1500);
      ok('with sound and 3 hours untouched, it carries on', await page.evaluate(() => !wraith.P.active().paused && !document.getElementById('watch').hidden));
      await done();
    })(),
    (async () => {
      // a picture with sound, 4 hours untouched: a page iOS keeps where you can't see it isn't left going for good
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await page.waitForFunction(() => { const v = wraith.P.active(); return v && !v.paused && v.currentTime > 0; }, null, { timeout: 8000 }).catch(never);
      await page.evaluate(() => { wraith.P.ranAt = Date.now(); wraith.Pages.seenAt = Date.now() - 4 * 3600e3 - 1000; });   // going just now, as the stream made here may not have frames to show
      await page.waitForFunction(() => wraith.P.userPaused, null, { timeout: 5000 }).catch(never);
      await sleep(1300);
      const s = await page.evaluate(() => ({ paused: wraith.P.active()?.paused, big: !document.getElementById('bigPlay').hidden, watch: !document.getElementById('watch').hidden }));
      ok('a picture with sound untouched for 4 hours pauses, and stays on the channel', s.paused && s.big && s.watch, JSON.stringify(s));
      ok('the settings sheet says why', (await page.evaluate(() => JSON.parse(localStorage.getItem('wraith.away') || '[]'))).some(x => x.endsWith('paused: untouched for 4 hours')));
      await done();
    })(),
    (async () => {
      // a page on screen by iOS's word with nothing going and nobody here: it doesn't stay for days (2026-11-08)
      const { page, done } = await stage(answer, { offline: true });
      await offlineCard(page);
      const onChannel = () => page.evaluate(() => !document.getElementById('watch').hidden);
      await vis(page, true);
      await page.evaluate(() => { wraith.Pages.seenAt = Date.now() - 2 * 3600e3 - 1000; }); await sleep(1500);
      ok('out of sight, a page stays as it is', await onChannel());
      await vis(page, false);
      await page.evaluate(() => { wraith.Pages.seenAt = Date.now() - 2 * 3600e3 + 60e3; }); await sleep(1500);
      ok('a minute short of 2 hours untouched, it stays', await onChannel());
      await page.evaluate(() => { wraith.Pages.seenAt = Date.now() - 2 * 3600e3 - 1000; });
      await page.waitForFunction(() => !document.getElementById('home').hidden, null, { timeout: 5000 }).catch(never);
      const s = await page.evaluate(() => ({ search: location.search, login: wraith.P.login, feed: wraith.P.feed }));
      ok('at 2 hours it goes home and lets go of the channel', !(await onChannel()) && !s.search && !s.login && !s.feed, JSON.stringify(s));
      ok('the settings sheet says why', (await page.evaluate(() => JSON.parse(localStorage.getItem('wraith.away') || '[]'))).some(x => x.endsWith('closed: nothing going, and untouched for 2 hours')));
      await done();
    })(),
    (async () => {
      // a page reloaded out of sight that nobody has looked at yet stays out of the seat: its calls name it without sitting
      const { page, done } = await stage(answer, { init: seated, offline: true });
      await offlineCard(page);
      const s = await page.evaluate(() => { wraith.Pages.shown = false; const a = wraith.Pages.seat(); wraith.Pages.shown = true; return [a, wraith.Pages.seat()]; });
      ok('a page not looked at yet names itself without sitting', /&pg=/.test(s[0]) && /&who=/.test(s[1]), JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // the lock screen's play button counts as you; and leaving with a start still asking Twitch carries its sound
      const { page, done } = await stage(answer, { init: seated, offline: true });
      await offlineCard(page);
      await page.evaluate(() => { wraith.Pages.takeAt = 0; });
      await cc(page, 'play');
      ok('the lock screen’s play counts as you', await page.evaluate(() => Date.now() - wraith.Pages.takeAt < 2000));
      await done();
    })(),
    (async () => {
      let slow = true;
      const { page, done } = await stage(answer, { path: '', gql: async b => { if (b.includes('users(logins') && slow) await sleep(1500); } });
      await sleep(500);
      await page.evaluate(() => wraith.P.open('staged', true));
      await sleep(100);
      await vis(page, true);
      await sounding(page);
      const s = await snd(page);
      ok('leaving in the first second of a start brings its sound once it has started', s.on && !s.paused, JSON.stringify(s));
      slow = false;
      await done();
    })(),
    (async () => {
      // stopped from the lock screen, the stream starting over keeps it stopped for when you're back
      const { page, done, user } = await stage(answer);
      await levels(page, 15000);
      await vis(page, true); await sounding(page);
      await cc(page, 'pause'); await sleep(300);
      user.stream = { ...user.stream, id: 'again' };
      await page.evaluate(() => wraith.P.refresh());
      await page.waitForFunction(() => wraith.P.user?.stream?.id === 'again', null, { timeout: 15000 }).catch(never);
      await sleep(1500);
      await vis(page, false); await sleep(2000);
      const s = await snd(page);
      ok('stopped from the lock screen, a restart stays stopped on return', s.vPaused !== false && s.userPaused, JSON.stringify(s));
      await done();
    })(),
    (async () => {
      // coming back while a restart is still asking Twitch: it plays once it's there
      const { page, done } = await stage(answer, { offline: true });
      await offlineCard(page);
      const s = await page.evaluate(() => { const P = wraith.P; P.feed = null; P.pausedAway = P.userPaused = true; P.wake(); return { away: P.pausedAway, paused: P.userPaused }; });
      ok('coming back while a restart is still on its way clears the hold', !s.away && !s.paused, JSON.stringify(s));
      await done();
    })(),
  ]);
}

if (want('chatq')) {
  // What waits for the picture before it's drawn (2026-11-05 review): a busy chat 20 s behind on the CDN's feed, what you say, and what
  // came in while the app was away long enough for the socket to close.
  const irc = (i, ts, uid = String(1000 + i), text = 'line ' + i) => `@badges=;color=#FF0000;display-name=U${i};emotes=;id=id-${i}-${ts};tmi-sent-ts=${ts};user-id=${uid} :u${i}!u${i}@u${i}.tmi.twitch.tv PRIVMSG #staged :${text}`;
  const drawn = (page, re) => page.evaluate(r => [...document.querySelectorAll('#chat .m')].filter(n => new RegExp(r).test(n.textContent)).length, re);
  await Promise.all([
    (async () => {
      const { page, done } = await stage(answer, { offline: true });
      await page.waitForFunction(() => wraith.Chat.login === 'staged' && wraith.P.user); await page.evaluate(() => document.getElementById('bChanX').click());
      await page.waitForFunction(() => document.getElementById('chat').offsetParent);
      await page.evaluate(() => { wraith.P.chatDelay = () => 20000; });
      const now = Date.now();
      await page.evaluate(lines => { for (const l of lines) wraith.Chat.line(l); }, Array.from({ length: 3000 }, (_, i) => irc(i, now - 30000 + i * 10)));
      await sleep(800);
      ok('a busy chat 20 s behind still draws what is due', await drawn(page, '^U\\d+.*line \\d+') > 50, String(await drawn(page, 'line')));
      await page.evaluate(() => { wraith.Me.acct = { id: '777', login: 'me', name: 'Me', token: 'x' }; });
      await page.evaluate(lines => { for (const l of lines) wraith.Chat.line(l); }, Array.from({ length: 7000 }, (_, i) => irc(5000 + i, Date.now() + i)));
      await page.evaluate(l => wraith.Chat.line(l), irc(1, Date.now(), '777', 'what I said'));
      await sleep(800);
      ok('what you say shows at once, however much is waiting', await drawn(page, 'what I said') === 1);
      await done();
    })(),
    (async () => {
      const { page, done } = await stage(answer, { offline: true });
      await page.waitForFunction(() => wraith.Chat.login === 'staged' && wraith.P.user); await page.evaluate(() => document.getElementById('bChanX').click());
      await page.waitForFunction(() => document.getElementById('chat').offsetParent);
      await page.evaluate(() => { wraith.P.chatDelay = () => 0; wraith.Chat.napAfter = 300; });
      await vis(page, true);
      const t = Date.now(), lines = Array.from({ length: 40 }, (_, i) => irc(i, t - 20000 + i * 100, String(2000 + i), 'away line ' + i));
      await page.evaluate(ls => { for (const l of ls) wraith.Chat.line(l); wraith.Chat.nap(); }, lines);
      await sleep(800);
      await page.evaluate(ls => { wraith.Chat.recent = async () => ls.map(l => { const sp = l.indexOf(' '), tags = Object.fromEntries(l.slice(1, sp).split(';').map(kv => kv.split('='))); return { tags, prefix: 'x', cmd: 'PRIVMSG', params: ['#staged'], text: l.slice(l.lastIndexOf(' :') + 2) }; }); }, lines);
      await vis(page, false);
      await page.evaluate(() => wraith.Chat.history(300));
      await sleep(800);
      ok('what came in while the app was away is filled in on the way back', await drawn(page, 'away line') === 40, String(await drawn(page, 'away line')));
      await done();
    })(),
  ]);
}

if (want('update')) {
  // A newer page is one whose code differs from what's running, whatever the server's tags say (2026-11-05: the phone ran a build from
  // before the seat all afternoon). It loads on the home screen, never under a stream, and every relay call says which page and build it's from.
  const html = await (await fetch(base)).text();
  const newer = html.replace("'use strict';", "'use strict'; // a newer build");
  const page0 = async serveNew => {
    const c = await browser.newContext({ userAgent: IPHONE, viewport: { width: 951, height: 669 } });
    let fresh = false;
    await c.route(u => !u.href.startsWith(base), route => route.abort().catch(never));   // nothing here needs Twitch
    await c.route(u => u.href.startsWith(base), route => route.fulfill({ status: 200, headers: { 'content-type': 'text/html' }, body: fresh ? newer : html }));
    const page = await c.newPage();
    page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.wraith?.Update);
    await page.evaluate(() => { window.__same = 1; });
    return { c, page, serve: on => { fresh = on; }, check: () => page.evaluate(() => { wraith.Update.at = 0; return wraith.Update.check(); }) };
  };
  await Promise.all([
    (async () => {
      const { c, page, serve, check } = await page0();
      await check();
      ok('the same code on the server is no update', await page.evaluate(() => !wraith.Update.ready && window.__same === 1));
      serve(true);
      const reload = page.waitForEvent('load', { timeout: 10000 }).then(() => true, () => false);
      await check();
      ok('different code on the server loads it, on the home screen', await reload && await page.evaluate(() => !window.__same).catch(() => false));
      ok('and the page running it is the newer build', await page.evaluate(() => [...document.scripts].some(s => s.textContent.includes('a newer build'))).catch(() => false));
      ok('no page errors (update)', page.errors.length === 0, page.errors.join(' | '));
      await c.close();
    })(),
    (async () => {
      const { c, page, serve, check } = await page0();
      await page.evaluate(() => history.pushState(null, '', '?c=staged'));
      await page.evaluate(() => { document.getElementById('home').hidden = true; document.getElementById('watch').hidden = false; });
      serve(true);
      await check(); await sleep(1500);
      ok('an update waits while something is open', await page.evaluate(() => wraith.Update.ready && window.__same === 1));
      const reload = page.waitForEvent('load', { timeout: 10000 }).then(() => true, () => false);
      await page.evaluate(() => { document.getElementById('watch').hidden = true; history.replaceState(null, '', location.pathname); dispatchEvent(new PopStateEvent('popstate')); });
      ok('and loads on the way home', await reload);
      await c.close();
    })(),
    (async () => {
      const c = await browser.newContext({ userAgent: IPHONE });
      const calls = [];
      await c.route(u => !u.href.startsWith(base), route => route.abort().catch(never));
      await c.route(/script\.google/, route => { calls.push(new URL(route.request().url()).searchParams); return route.fulfill({ status: 200, headers, body: '200\n#EXTM3U\n' }); });
      const page = await c.newPage();
      await page.goto(base);
      await page.waitForFunction(() => window.wraith?.Update);
      const built = await page.evaluate(() => wraith.BUILD);
      await page.evaluate(() => wraith.Pages.ask());
      await page.evaluate(() => fetch('https://script.google.com/x').catch(() => {}));   // nothing
      await page.evaluate(() => wraith.relayGet('https://usher.ttvnw.net/api/channel/hls/x.m3u8'));
      await sleep(500);
      const named = calls.filter(q => q.get('u'));
      ok('every relay call names its page and build', named.length > 0 && named.every(q => (q.get('pg') || q.get('who')) && q.get('b') === built && q.get('k')), JSON.stringify(named.map(q => Object.fromEntries(q))));
      ok('pings name the page too', calls.some(q => q.get('ping') && (q.get('pg') || q.get('who'))));
      await c.close();
    })(),
  ]);
}

if (want('battery')) {
  // Nothing of Wraith's runs down the battery out of sight or with nobody there (Jerry, 2026-11-07: "wraith will never under any
  // circumstances stealth drain battery right? make sure of it").
  const lockStub = () => {
    window.__held = 0;
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      window.__held++;
      const s = { release: async () => { if (!s.gone) { s.gone = true; window.__held--; } }, addEventListener() {} };
      return s;
    } } });
  };
  const away = page => page.evaluate(() => JSON.parse(localStorage.getItem('wraith.away') || '[]'));
  // what the page's own code asks of the network: fetches and sockets, counted from the start
  const netWatch = () => {
    window.__net = [];
    const f = window.fetch.bind(window);
    window.fetch = (u, o) => { window.__net.push(String(u?.url || u).slice(0, 90)); return f(u, o); };
    const W = window.WebSocket;
    window.WebSocket = class extends W { constructor(u, p) { super(u, p); window.__net.push('socket ' + u); } };
  };
  const hiddenFromStart = () => {
    window.__hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__hidden ? 'hidden' : 'visible' });
  };
  await Promise.all([
    (async () => {
      // the pill's stand-in: its AudioContext, which on iOS put all of the app's sound into 128-sample chunks from the first tap on, is
      // closed as soon as its track is made, and the stand-in is muted except while it's hiding the pill
      const { page, done } = await stage(answer, { init: () => {
        window.__acs = [];
        const Real = window.AudioContext;
        window.AudioContext = class extends Real { constructor(...a) { super(...a); window.__acs.push(this); } };
      } });
      await levels(page, 15000); await sleep(800);
      const look = () => page.evaluate(() => { const d = document.querySelector('video.decoy') || wraith.Pill.decoy; return { made: !!d, on: !!d?.isConnected, muted: d?.muted, acs: window.__acs.map(c => c.state) }; });
      let s = await look();
      ok('the pill’s stand-in has its AudioContext closed straight away', s.made && s.acs.length >= 1 && s.acs.every(x => x === 'closed'), JSON.stringify(s));
      ok('and while it hides the pill it isn’t muted, as WebKit passes over a muted one', s.on && s.muted === false, JSON.stringify(s));
      await vis(page, true); await sounding(page);
      s = await look();
      ok('away, it’s muted, so it doesn’t count as a stream’s sound playing', !s.on && s.muted === true, JSON.stringify(s));
      await vis(page, false); await sleep(500);
      ok('back in front, it hides the pill again', (await look()).muted === false);
      await done();
    })(),
    (async () => {
      // the screen lock goes with a picture that's getting somewhere: one stuck a minute (no network, a copy that's stopped) lets go
      const { page, done } = await stage(answer, { init: lockStub });
      const held = () => page.evaluate(() => window.__held);
      await levels(page, 15000);
      await page.mouse.click(5, 600); await sleep(200);
      await page.evaluate(() => wraith.P.active().dispatchEvent(new Event('playing'))); await sleep(400);
      ok('a picture that’s just started holds the screen on', await held() === 1, String(await held()));
      await page.evaluate(() => { wraith.P.ranAt = Date.now() - 61e3; }); await sleep(1400);
      ok('one that hasn’t moved for a minute lets it go', await held() === 0, String(await held()));
      ok('and the settings sheet says why', /hasn’t moved for a minute/.test(await page.evaluate(() => wraith.Awake.say())), await page.evaluate(() => wraith.Awake.say()));
      await page.evaluate(() => wraith.P.active().dispatchEvent(new Event('playing'))); await sleep(400);
      ok('moving again, it holds it again', await held() === 1, String(await held()));
      await done();
    })(),
    (async () => {
      // a muted picture nobody has touched or come back to for half an hour pauses; one with sound plays on, as you'd hear it
      const { page, done } = await stage(answer, { init: lockStub });
      await levels(page, 15000);
      const state = () => page.evaluate(() => ({ paused: wraith.P.active().paused, user: wraith.P.userPaused, big: !document.getElementById('bigPlay').hidden }));
      await page.evaluate(() => { wraith.Pages.seenAt = Date.now() - 31 * 60e3; }); await sleep(2200);
      let s = await state();
      ok('with the sound on and nobody touching it, a picture plays on', !s.user && !s.big, JSON.stringify(s));
      await page.evaluate(() => { wraith.Chat.dozeAfter = 1; document.getElementById('bMute').click(); wraith.Pages.seenAt = Date.now() - 31 * 60e3; });   // the tap, then half an hour on
      await page.waitForFunction(() => wraith.P.userPaused, null, { timeout: 5000 }).catch(never);
      s = await state();
      ok('muted and untouched for half an hour, it pauses, with the big button to play it again', s.paused && s.user && s.big, JSON.stringify(s));
      ok('the settings sheet says why', (await away(page)).some(x => x.endsWith('paused: muted, and untouched for 30 min')));
      await sleep(1200);
      ok('and its chat stops too', await page.evaluate(() => !wraith.Chat.ws && !wraith.Chat.timer));
      await page.evaluate(() => document.getElementById('bigPlay').click()); await sleep(2200);
      s = await state();
      ok('and that tap plays it, and counts as someone there', !s.user && !s.big, JSON.stringify(s));
      ok('with chat back', await page.evaluate(() => !!wraith.Chat.ws && !!wraith.Chat.timer));
      await done();
    })(),
    (async () => {
      // a channel waiting to go live with nobody about for half an hour (or a page iOS keeps going where you can't see it, calling itself
      // visible): it asks Twitch nothing and draws no chat, and a tap brings both back
      const gqls = [];
      const { page, done } = await stage(answer, { offline: true, gql: () => { gqls.push(Date.now()); } });
      await page.waitForFunction(() => wraith.P.user && !wraith.P.user.stream && wraith.Chat.ws, null, { timeout: 10000 }).catch(never);
      await page.evaluate(() => { wraith.Chat.dozeAfter = 1; wraith.Pages.seenAt = Date.now() - 31 * 60e3; }); await sleep(1400);
      ok('with nobody about, its chat stops', await page.evaluate(() => !wraith.Chat.ws && !wraith.Chat.timer));
      const t0 = Date.now();
      await page.evaluate(() => wraith.P.lookLive()); await sleep(500);
      ok('and the look for it going live asks nothing', gqls.filter(t => t > t0).length === 0, String(gqls.filter(t => t > t0).length));
      const t1 = Date.now();
      await page.mouse.click(5, 600); await sleep(800);
      ok('a tap looks at once, and brings chat back', gqls.some(t => t > t1) && await page.evaluate(() => !!wraith.Chat.ws && !!wraith.Chat.timer), `${gqls.filter(t => t > t1).length}`);
      // Dozed over a moment that only looked like nobody about (a player starting over is paused for one), it stayed dozed until the app was
      // left and come back to: nothing else woke it.
      await page.evaluate(() => { wraith.Pages.seenAt = Date.now() - 31 * 60e3; }); await sleep(1400);
      const dozed = await page.evaluate(() => !wraith.Chat.ws && !wraith.Chat.timer);
      await page.evaluate(() => { wraith.Pages.seenAt = Date.now(); }); await sleep(1400);
      ok('chat that dozed comes back by itself once that’s over, with no tap', dozed && await page.evaluate(() => !!wraith.Chat.ws && !!wraith.Chat.timer), String(dozed));
      await page.evaluate(() => { wraith.Chat.dozeAfter = 15; wraith.Pages.seenAt = Date.now() - 31 * 60e3; }); await sleep(2300);
      ok('and a moment of it doesn’t doze chat at all', await page.evaluate(() => !!wraith.Chat.ws));
      await done();
    })(),
    (async () => {
      // out of sight with nothing to hear, the page asks nobody anything: not the relay about the seat, not Twitch about the channel
      const calls = [], gqls = [];
      const { page, done } = await stage(route => { calls.push(Date.now()); return answer(route); },
        { init: () => Object.defineProperty(navigator, 'webdriver', { get: () => false }), gql: () => { gqls.push(Date.now()); } });
      await levels(page, 15000);
      ok('(the page sits in the seat, as on the phone)', await page.evaluate(() => wraith.Pages.seated));
      await page.evaluate(() => document.getElementById('bMute').click());
      await vis(page, true);
      const t0 = Date.now();
      await page.evaluate(() => { wraith.Pages.ticks = 29; });   // the next second is the seat's ping's turn
      await sleep(1600);
      await page.evaluate(() => wraith.P.refresh());   // and what the once-a-minute look at the channel does
      await sleep(600);
      ok('out of sight with the sound off, nothing asks the relay', calls.filter(t => t > t0 + 300).length === 0, `${calls.filter(t => t > t0 + 300).length} calls`);
      ok('nor Twitch about the channel', gqls.filter(t => t > t0 + 300).length === 0, `${gqls.filter(t => t > t0 + 300).length} asks`);
      const t1 = Date.now();
      await vis(page, false); await sleep(1500);
      ok('coming back asks both at once', calls.some(t => t > t1) && gqls.some(t => t > t1), `${calls.filter(t => t > t1).length} ${gqls.filter(t => t > t1).length}`);
      await done();
    })(),
    ...['?c=staged', ''].map(path => (async () => {
      // a page iOS loads out of sight (it reloads ones it drops while the app's away) asks nothing of anyone till it's looked at
      const { page, done } = await stage(answer, { path, init: `(${hiddenFromStart})(); (${netWatch})();` });
      await sleep(2500);
      const early = await page.evaluate(() => window.__net);
      ok(`a ${path ? 'channel' : 'home screen'} loaded out of sight asks nothing of Twitch, chat, the relay or the server`, early.length === 0, early.join(' | '));
      await page.evaluate(() => { window.__hidden = false; });
      if (path) await levels(page, 6000); else await sleep(2500);
      const s = await page.evaluate(() => ({ net: window.__net.length, hls: !!wraith.P.hls }));
      ok(`and once it is, it starts${path ? '' : ' on its lists'}`, s.net > 0 && (path ? s.hls : true), JSON.stringify(s));
      await done();
    })()),
    (async () => {
      // out of sight, chat's timers stop with its socket, as the page keeps running for the sound
      const { page, done } = await stage(answer);
      await levels(page, 15000);
      await page.evaluate(() => { wraith.Chat.napAfter = 300; });
      await vis(page, true); await sleep(900);
      ok('away, chat’s timers stop along with its socket', await page.evaluate(() => !wraith.Chat.timer && !wraith.Chat.pinger && !wraith.Chat.ws));
      await vis(page, false); await sleep(300);
      ok('and start again coming back', await page.evaluate(() => !!wraith.Chat.timer && !!wraith.Chat.pinger));
      await done();
    })(),
    (async () => {
      // the settings sheet's look at a frame, which has iOS keep the picture's player going, isn't taken with the app away
      const { page, done } = await stage(answer, { init: () => {
        window.__draws = 0;
        const d = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (...a) { window.__draws++; return d.apply(this, a); };
      } });
      await levels(page, 15000);
      await page.evaluate(() => document.getElementById('bSet').click()); await sleep(1600);
      ok('(the settings sheet looks at a frame now and then)', await page.evaluate(() => window.__draws) >= 1, String(await page.evaluate(() => window.__draws)));
      await vis(page, true); await sleep(600);
      const at = await page.evaluate(() => window.__draws);
      await sleep(6000);
      ok('with the app away, it doesn’t, sheet open or not', await page.evaluate(() => window.__draws) === at, `${at} → ${await page.evaluate(() => window.__draws)}`);
      await done();
    })(),
    (async () => {
      // the sign-in code screen: no asking Twitch with the app away, and a code that runs out with nobody about isn't replaced
      const { page, done } = await stage(answer);
      let codes = 0;
      const polls = [];
      await page.route('https://id.twitch.tv/**', route => {
        const u = route.request().url();
        if (u.includes('/device')) { codes++; return route.fulfill({ status: 200, headers, body: JSON.stringify({ device_code: 'D' + codes, user_code: 'CODE' + codes, interval: 1, expires_in: 3 }) }).catch(never); }
        if (u.includes('/token')) { polls.push(Date.now()); return route.fulfill({ status: 400, headers, body: JSON.stringify({ status: 400, message: 'authorization_pending' }) }).catch(never); }
        return route.abort().catch(never);
      });
      await levels(page, 15000);
      await page.evaluate(() => wraith.SignIn.start()); await sleep(2300);
      ok('(the code screen asks Twitch every second or so whether it’s been approved)', polls.length >= 1, String(polls.length));
      await vis(page, true);
      const t0 = Date.now(); await sleep(2500);
      ok('but not with the app away', polls.filter(t => t > t0 + 300).length === 0, `${polls.filter(t => t > t0 + 300).length}`);
      await vis(page, false); await sleep(800);
      ok('back, with its code run out meanwhile, it gets a new one', codes === 2, String(codes));
      await page.evaluate(() => { wraith.Pages.seenAt = Date.now() - 31 * 60e3; }); await sleep(4500);
      const shown = await page.evaluate(() => document.getElementById('sheetBody').textContent);
      ok('one that runs out with nobody about for half an hour isn’t replaced, and says so', codes === 2 && /That code ran out/.test(shown), `${codes} ${shown.slice(0, 80)}`);
      await done();
    })(),
  ]);
}

await browser.close(); srv.close();
report();
