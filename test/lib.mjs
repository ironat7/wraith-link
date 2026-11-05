// What the tests share: a local copy of the page, Chrome with sound off and autoplay on, and a stream made here for them to watch.
// WRAITH_PAGE=<path to an index.html> runs them against another copy, like an older build, to watch a check fail.
import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const TYPES = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

export const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function serve(file = process.env.WRAITH_PAGE || fileURLToPath(new URL('../index.html', import.meta.url))) {
  const dir = path.dirname(file);
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x'), p = u.pathname === '/' ? file : path.join(dir, u.pathname);
    fs.readFile(p, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
      r.end(d);
    });
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${srv.address().port}/`, close: () => srv.close() };
}

// The relay has 20,000 fetches a day for everyone, the phone can use them all on a long day, and a day of test runs helped it to (2026-11-04).
// So nothing here reaches it by accident. WRAITH_REAL_RELAY=1 is for a script that's there to measure the real thing.
export const launch = async (...args) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', ...args] });
  if (process.env.WRAITH_REAL_RELAY) return browser;
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => { const c = await newContext(...a); await c.route(/script\.google/, route => route.abort().catch(() => {})); return c; };
  return browser;
};

// A live stream as the relay and Twitch would serve it, made here: 2 s clips from ffmpeg, the first time it's needed, under the same segment numbers on every
// rendition. A page has it from makeStream(page), and relayAnswer(url, first) is what the relay would say about one of its playlists.
const CLIPS = fileURLToPath(new URL('clips/', import.meta.url));
export function makeClips() {
  if (fs.existsSync(CLIPS + 'ready')) return;
  const tmp = `${CLIPS.slice(0, -1)}-${process.pid}/`;
  fs.mkdirSync(tmp, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30', '-f', 'lavfi', '-i', 'sine=f=220:r=44100', '-t', '300',
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-b:v', '120k', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-c:a', 'aac', '-b:a', '48k',
    '-f', 'segment', '-segment_time', '2', '-segment_format', 'mpegts', `${tmp}%d.ts`]);
  fs.writeFileSync(`${tmp}ready`, '');
  try { fs.renameSync(tmp, CLIPS); } catch { fs.rmSync(tmp, { recursive: true, force: true }); }   // another section got there first
}
export const SILENCE = Buffer.from(Array.from({ length: 87 }, () => [0xff, 0xf1, 0x50, 0x40, 0x01, 0xbf, 0xfc, 0x00, 0xc8, 0x00, 0x80, 0x23, 0x80]).flat());
const ON_AIR = Date.now(), BEHIND = 6;   // it has been on for these many segments when this run starts
const segmentAt = k => ON_AIR + (k - BEHIND) * 2000;
const segmentUrl = (rendition, k) => `https://edge.hls.ttvnw.net/${rendition}/${k}.${rendition === 'audio_only' ? 'aac' : 'ts'}`;
const RENDITIONS = [['chunked', '1920x1080', 6000000, 60], ['720p60', '1280x720', 3000000, 60], ['480p30', '852x480', 1400000, 30], ['160p30', '284x160', 230000, 30]];
const masterPlaylist = () => '#EXTM3U\n' + RENDITIONS.map(([id, size, bitrate, fps]) => `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate},RESOLUTION=${size},CODECS="avc1.4D401F,mp4a.40.2",VIDEO="${id}",FRAME-RATE=${fps}.000\nhttps://edge.playlist.ttvnw.net/${id}.m3u8\n`).join('')
  + '#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS="mp4a.40.2",VIDEO="audio_only"\nhttps://edge.playlist.ttvnw.net/audio_only.m3u8\n';
// Twitch's shape: the finished segments, then the one being made and the next as prefetch lines.
function mediaPlaylist(rendition) {
  const now = BEHIND + Math.floor((Date.now() - ON_AIR) / 2000), first = Math.max(0, now - 6);
  const out = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:6', `#EXT-X-MEDIA-SEQUENCE:${first}`];
  for (let k = first; k < now; k++) out.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(segmentAt(k)).toISOString()}`, '#EXTINF:2.000,live', segmentUrl(rendition, k));
  out.push(`#EXT-X-TWITCH-PREFETCH:${segmentUrl(rendition, now)}`, `#EXT-X-TWITCH-PREFETCH:${segmentUrl(rendition, now + 1)}`);
  return out.join('\n') + '\n';
}
// As relay/Code.gs answers, less the seat. The CDN's copies are public, so those are looked at for real.
export async function relayAnswer(url, first) {
  if (url.includes('usher.ttvnw.net')) {
    const top = first && (RENDITIONS.find(([id]) => id === first) || RENDITIONS[0])[0];
    return `200\n${masterPlaylist()}` + (top ? `\n#WRAITH-MEDIA:200 https://edge.playlist.ttvnw.net/${top}.m3u8\n${mediaPlaylist(top)}` : '');
  }
  const media = url.match(/edge\.playlist\.ttvnw\.net\/(\w+)\.m3u8/);
  if (media) return `200\n${mediaPlaylist(media[1])}`;
  try { const r = await fetch(url); return `${r.status}\n${await r.text()}`; } catch (e) { return `599\n${e}`; }
}
export async function makeStream(page, relay) {
  makeClips();
  const headers = { 'access-control-allow-origin': '*' };
  await page.route(/script\.google/, async route => {
    const q = new URL(route.request().url()).searchParams, u = q.get('u');
    const body = u ? await relayAnswer(u, q.get('first')) : '200\npong';
    if (relay) return relay(route, u, body);
    return route.fulfill({ status: 200, headers, body }).catch(() => {});
  });
  await page.route(/edge\.hls\.ttvnw\.net/, async route => {
    const [, k, kind] = route.request().url().match(/\/(\d+)\.(ts|aac)$/), wait = segmentAt(+k) + 500 - Date.now();   // no sooner than it's being made
    if (wait > 0) await sleep(wait);
    const body = kind === 'aac' ? SILENCE : fs.readFileSync(`${CLIPS}${k}.ts`);
    return route.fulfill({ status: 200, headers: { ...headers, 'content-type': kind === 'aac' ? 'audio/aac' : 'video/mp2t' }, body }).catch(() => {});
  });
}

// Tallies checks. Every script ends with report(), which says how it went and sets the exit code.
export function checks() {
  let fails = 0;
  return {
    ok(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) fails++; },
    report() { console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exitCode = fails ? 1 : 0; },
  };
}
