// Long run on a real stream: latency, buffer, stalls, errors, memory, chat, from the deployed site.
import fs from 'fs';
import { launch } from './lib.mjs';
const [CH = 'powdur', mins = '15', tag = CH] = process.argv.slice(2);
const browser = await launch('--enable-precise-memory-info');
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`https://ironat7.github.io/wraith-link/?soak=${Date.now()}&c=${CH}`);
await page.evaluate(() => { window.__s = { stalls: 0, frags: 0, level: [] }; document.getElementById('vLL').addEventListener('waiting', () => __s.stalls++); const t = setInterval(() => { const h = wraith.P.hls; if (!h || h.__h) return; h.__h = 1; h.on(Hls.Events.FRAG_BUFFERED, () => __s.frags++); h.on(Hls.Events.LEVEL_SWITCHED, (_, d) => __s.level.push(d.level)); }, 200); });
const out = [], t0 = Date.now();
while (Date.now() - t0 < +mins * 60e3) {
  await new Promise(r => setTimeout(r, 5000));
  const s = await page.evaluate(() => { const P = wraith.P, v = P.active(); let a = 0; if (v) for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + .25 && v.buffered.end(i) > v.currentTime) a = v.buffered.end(i) - v.currentTime; return { feed: P.feed, lat: P.latency?.(), ahead: a, rate: v?.playbackRate, h: v?.videoHeight, T: P.liveT, cap: P.cap, errs: P.errs, stalls: __s.stalls, frags: __s.frags, heap: performance.memory?.usedJSHeapSize, chat: document.querySelectorAll('#chat .m').length, q: wraith.Chat.queue.length, quota: 0 }; }).catch(e => ({ err: e.message }));
  out.push({ t: Math.round((Date.now() - t0) / 1000), ...s });
  fs.writeFileSync(`soak-${tag}.json`, JSON.stringify(out));
}
const lats = out.map(x => x.lat).filter(x => typeof x === 'number').slice(6).sort((a, b) => a - b), q = p => lats[Math.floor((lats.length - 1) * p)]?.toFixed(2);
const last = out.at(-1), rates = out.map(x => x.rate); const off = rates.filter(r => r !== 1).length;
console.log(JSON.stringify({ ch: CH, mins: +mins, latency: { p10: q(.1), p50: q(.5), p90: q(.9), max: lats.at(-1)?.toFixed(2) }, minBuffer: Math.min(...out.slice(6).map(x => x.ahead)).toFixed(2), height: last.h, cap: last.cap, target: last.T, stalls: last.stalls, frags: last.frags, errs: last.errs, samplesNotAt1x: `${off}/${rates.length}`, heapMB: { start: (out[6].heap / 1e6).toFixed(1), end: (last.heap / 1e6).toFixed(1) }, chatNodes: last.chat, pageErrors: errs }));
await browser.close();
