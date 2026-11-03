// What the tests share: a local copy of the page, and Chrome with sound off and autoplay on.
// WRAITH_PAGE=<path to an index.html> runs them against another copy, like an older build, to watch a check fail.
import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';

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

export const launch = (...args) => chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', ...args] });

// Tallies checks. Every script ends with report(), which says how it went and sets the exit code.
export function checks() {
  let fails = 0;
  return {
    ok(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) fails++; },
    report() { console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exitCode = fails ? 1 : 0; },
  };
}
