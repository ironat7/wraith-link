// usage: node vods.mjs [channel ...]. End to end on real past broadcasts, through the real relay and CDN: each kind of copy has to play for 25 s
// across the part that's trouble (a stretch Twitch muted, in TS and fMP4, and a copy with no "chunked"), which it finds among those channels' recent videos.
// Chrome's own HLS with an iPhone user agent runs the path Safari does, except that it won't take a playlist from another origin than its segments, which
// rules out blobs and data URLs. So what Safari would play from a blob is served here from the CDN's own origin. The blob itself only a phone can check.
import { serve, launch, sleep, checks, IPHONE } from './lib.mjs';
const channels = process.argv.slice(2).length ? process.argv.slice(2) : ['forsen', 'powdur', 'saintsakura', 'fallenshadow', 'zackrawrr'];
const gql = async (query, variables) => (await (await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json()).data;
const cdnPath = url => url?.match(/^(https:\/\/[^/]+\/[^/]+)\/storyboards\//)?.[1];

// A video of each kind: where its trouble starts, and how long each of its segments is.
async function find() {
  const kinds = {};
  for (const login of channels) {
    const d = await gql('query($l: String!) { user(login: $l) { videos(first: 25, sort: TIME, type: ARCHIVE) { edges { node { id status seekPreviewsURL } } } } }', { l: login });
    for (const { node: v } of d?.user?.videos?.edges || []) {
      const base = cdnPath(v.seekPreviewsURL);
      if (v.status !== 'RECORDED' || !base) continue;
      const r = await fetch(`${base}/chunked/index-dvr.m3u8`);
      if (!r.ok) { kinds['no "chunked"'] ||= { login, id: v.id, base, at: 600 }; continue; }
      const segs = (await r.text()).split('\n').filter(l => l && !l.startsWith('#')), n = segs.findIndex(s => s.includes('-unmuted'));
      if (n >= 0) kinds[`muted ${segs[n].split('.').pop()}`] ||= { login, id: v.id, base, at: Math.max(0, n * 10 - 15), muted: segs[n] };
    }
    if (Object.keys(kinds).length === 3) break;
  }
  return kinds;
}

const { ok, report } = checks();
const srv = await serve(), browser = await launch(), kinds = await find();
for (const [kind, { login, id, base, at }] of Object.entries(kinds)) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE });
  const copies = new Map();
  await c.exposeFunction('__store', (k, text) => { copies.set(k, text); });
  await c.addInitScript(([id, at, base]) => {
    window.WebSocket = class { close() {} send() {} };
    if (at > 15) localStorage.setItem('wraith.pos.' + id, String(at));
    let n = 0;
    URL.createObjectURL = b => { const k = String(++n); b.text().then(t => window.__store(k, t)); return `${base}/wraith-c${k}.m3u8`; };
  }, [id, at, base]);
  await c.route(`${base}/wraith-c*.m3u8`, async route => {
    const k = route.request().url().match(/wraith-c(\d+)\.m3u8/)[1];
    for (let i = 0; i < 100 && !copies.has(k); i++) await sleep(20);
    await route.fulfill({ status: 200, contentType: 'application/vnd.apple.mpegurl', headers: { 'access-control-allow-origin': '*' }, body: copies.get(k) || '' });
  });
  const page = await c.newPage(), muted = [];
  page.on('requestfinished', async r => { if (/-(un)?muted\./.test(r.url())) muted.push(`${r.url().split('/').pop()} ${(await r.response().catch(() => null))?.status()}`); });
  await page.goto(`${srv.base}?v=${id}`, { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  let last = {}, first = null;
  while (Date.now() - t0 < 50e3 && !last.msg && !(first != null && last.t > first + 25)) {
    await sleep(500);
    last = await page.evaluate(() => { const v = document.getElementById('vCDN'); return { t: v.currentTime, h: v.videoHeight, msg: document.getElementById('msgbox').hidden ? '' : document.getElementById('msgbox').textContent }; });
    if (last.t > 0) first ??= last.t;
  }
  const moved = first == null ? 0 : last.t - first;
  ok(`${kind}: ${login} ${id} plays`, moved > 20 && !last.msg, `${moved.toFixed(1)} s from ${first}, ${last.h}p ${last.msg} ${muted.slice(0, 2).join(', ')}`);
  await c.close();
}
ok('found one of each kind', Object.keys(kinds).length === 3, Object.keys(kinds).join(', '));
await browser.close(); srv.close();
report();
