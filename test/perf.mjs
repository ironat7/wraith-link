// usage: node perf.mjs [channel] [seconds] [cpu slowdown]
// What the page costs: main-thread time, layout and style work, memory growth, dropped frames and tap response, on the busiest stream by default.
// It's Chrome, not iOS, so the numbers compare builds and scenes with each other rather than predicting the phone.
import { serve, launch, sleep, IPHONE } from './lib.mjs';

const [chanArg, secsArg = '20', slowArg = '4'] = process.argv.slice(2);
const secs = +secsArg, slow = +slowArg;
const top = async () => (await (await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query { streams(first: 1) { edges { node { broadcaster { login } viewersCount } } } }' }) })).json()).data.streams.edges[0].node;
const busy = chanArg ? { broadcaster: { login: chanArg } } : await top();
const ch = busy.broadcaster.login;
console.log(`channel ${ch}${busy.viewersCount ? ` (${busy.viewersCount} viewers)` : ''}, ${secs} s a scene, CPU ÷${slow}`);

const srv = await serve(), browser = await launch();
const scene = async (name, path, { hidden = false, blockImages = false, video = true, prepare, after } = {}) => {
  const c = await browser.newContext({ viewport: { width: 951, height: 669 }, userAgent: IPHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await c.newPage();
  if (blockImages) await page.route(/\.(webp|gif|png)|\/emote\/|emoticons\/v2|cdn\.frankerfacez|static-cdn\.jtvnw\.net\/(badges|emoticons)/, r => r.abort());
  if (!video) await page.route(/script\.google/, r => r.abort());
  const cdp = await c.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
  await page.addInitScript(() => {
    window.__long = []; window.__gaps = 0; window.__frames = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
    let last = performance.now();
    const f = t => { if (t - last > 34) window.__gaps++; window.__frames++; last = t; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await page.goto(srv.base + path, { waitUntil: 'domcontentloaded' });
  if (prepare) await prepare(page);
  await sleep(6000);   // past its start
  if (hidden) await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(hidden ? 1000 : 0);
  const read = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  await page.evaluate(() => { window.__long.length = 0; window.__gaps = 0; window.__frames = 0; });
  const a = await read();
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 2000 }); await cdp.send('Profiler.start');
  await sleep(secs * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  const b = await read(), d = k => b[k] - a[k];
  const s = await page.evaluate(() => ({ long: window.__long, gaps: window.__gaps, frames: window.__frames, q: window.wraith?.Chat.queue.length, lines: document.querySelectorAll('#chat .m').length, imgs: document.querySelectorAll('#chat img').length, feed: window.wraith?.P.feed }));
  // self time by function
  const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
  profile.samples.forEach((id, i) => {
    const n = byId.get(id), name = `${n.callFrame.functionName || '(anon)'}${n.callFrame.url.includes('hls') ? ' [hls]' : ''}`;
    self.set(name, (self.get(name) || 0) + (profile.timeDeltas[i] || 0));
  });
  const tops = [...self].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((x, y) => y[1] - x[1]).slice(0, 9).map(([k, v]) => `${k} ${(v / 1000 / secs).toFixed(1)}`).join(', ');
  console.log(`\n${name}`);
  console.log(`  main thread ${(d('TaskDuration') / secs * 100).toFixed(1)}% busy · script ${(d('ScriptDuration') / secs * 100).toFixed(1)}% · style ${(d('RecalcStyleDuration') / secs * 100).toFixed(1)}% (${(d('RecalcStyleCount') / secs).toFixed(1)}/s) · layout ${(d('LayoutDuration') / secs * 100).toFixed(1)}% (${(d('LayoutCount') / secs).toFixed(1)}/s)`);
  console.log(`  heap ${(b.JSHeapUsedSize / 1e6).toFixed(0)} MB, ${((b.JSHeapUsedSize - a.JSHeapUsedSize) / 1e6 / secs * 60).toFixed(1)} MB/min · nodes ${b.Nodes} (${((b.Nodes - a.Nodes) / secs * 60).toFixed(0)}/min) · listeners ${b.JSEventListeners}`);
  console.log(`  ${s.long.length} long tasks${s.long.length ? ` (worst ${Math.max(...s.long)} ms)` : ''} · ${(s.frames / secs).toFixed(0)} fps, ${s.gaps} frames over 34 ms · chat ${s.lines} lines, ${s.imgs} images, ${s.q} queued · feed ${s.feed}`);
  console.log(`  ms per second by function: ${tops}`);
  if (after) await after(page);
  await c.close();
};

const taps = async page => {
  const tap = async (label, act) => {
    const ms = await page.evaluate(async a => {
      const t = performance.now();
      new Function(a)();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return Math.round(performance.now() - t);
    }, act);
    return `${label} ${ms}`;
  };
  const out = [];
  out.push(await tap('controls', "document.getElementById('stage').click()"));
  out.push(await tap('settings', "document.getElementById('bSet').click()"));
  await sleep(300);
  out.push(await tap('close', "document.getElementById('scrim').click()"));
  await sleep(300);
  out.push(await tap('emotes', "document.getElementById('bEmote').click()"));
  await sleep(300);
  out.push(await tap('emotes off', "document.getElementById('bEmote').click()"));
  await sleep(300);
  out.push(await tap('videos', "[...document.querySelectorAll('.tabs button')].find(b => /video/i.test(b.textContent))?.click()"));
  await sleep(300);
  out.push(await tap('chat', "[...document.querySelectorAll('.tabs button')].find(b => /chat/i.test(b.textContent))?.click()"));
  console.log(`  tap to painted, ms: ${out.join(', ')}`);
};

await scene('Home screen, sitting', '');
await scene('Watching, chat with images', `?c=${ch}`, { after: taps });
await scene('Watching, chat without its images', `?c=${ch}`, { blockImages: true });
await scene('Chat only (no video)', `?c=${ch}`, { video: false });
await scene('App in the background', `?c=${ch}`, { hidden: true });
await browser.close();
srv.close?.();
process.exit(0);
