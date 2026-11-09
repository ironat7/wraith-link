// usage: node run.mjs [section ...]
// Sections side by side, with each one's time and whatever failed. Run the ones a change touches, then push: Chrome can't show what only
// iOS does, the phone is the real test, and a push is live in under a minute. With no sections, every one in fixes.mjs (about 2 minutes),
// which is for a change that reaches across the player. None of them touch the relay or a real stream: they watch one made here (see lib.mjs).
//   the look of a screen      layout duo pill
//   the player                pause cover misc recover relay screen player budget
//   the CDN feed, videos      cdn vod replay
//   leaving and coming back   sound away pages unseen return battery
//   chat                      chat irc scroll emotes keyboard chatq
//   lists and account         lists browse account lists2 update
//   buttons end to end        ui          (about 90 s)
//   time to first frame       start       (about 20 s, on real streams and the real relay)
// Staged through and through, with nothing reaching Twitch from here (Jerry doesn't want automated work on his home IP): relay vod cdn
// away screen lists duo unseen update chatq return player budget pill lists2 battery. The rest use Twitch's own lists, chat and CDN copies.
// More than 6 or so side by side on this PC and the timing checks trip on the load (the relay's are the first): run a half at a time.
// Only when that code changes, with WRAITH_REAL_RELAY=1 as they spend the phone's daily fetches: playback.mjs quality, vods.mjs, harness.mjs (a 6 minute soak of latency and stalls).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeClips } from './lib.mjs';

const ALL = 'pause cover misc browse chat replay irc account keyboard emotes fullscreen scroll sound pages layout recover relay vod cdn away screen lists duo unseen update chatq return player budget pill lists2 battery'.split(' ');
const queue = process.argv.slice(2).length ? process.argv.slice(2) : [...ALL];
const SIDE_BY_SIDE = 6;
const t0 = Date.now(), results = [];
makeClips();

let streams;
const channels = () => streams ??= fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query { streams(first: 2) { edges { node { broadcaster { login } } } } }' }) })
  .then(r => r.json()).then(d => d.data.streams.edges.map(e => e.node.broadcaster.login));
const command = async section => section === 'ui' ? ['ui.mjs', 'all', (await channels())[0]] : section === 'start' ? ['playback.mjs', 'start', ...await channels()] : ['fixes.mjs', section];

const one = async section => {
  const started = Date.now(), args = await command(section);
  await new Promise(done => {
    let out = '';
    const p = spawn(process.execPath, args, { cwd: fileURLToPath(new URL('.', import.meta.url)), env: section === 'start' ? { ...process.env, WRAITH_REAL_RELAY: '1' } : process.env });
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => {
      const lines = out.split('\n'), pass = lines.filter(l => l.startsWith('PASS')).length, fail = lines.filter(l => l.startsWith('FAIL'));
      const crashed = code && !fail.length ? lines.filter(l => /Error/.test(l)).slice(0, 2) : [];
      console.log(`${section.padEnd(10)} ${String(Math.round((Date.now() - started) / 1000)).padStart(4)} s  ${String(pass).padStart(3)} pass${fail.length ? `  ${fail.length} FAILED` : ''}`);
      for (const l of [...fail, ...crashed]) console.log('  ' + l.slice(0, 240));
      if (section === 'start') for (const l of lines.filter(l => /first frame/.test(l))) console.log('  ' + l.slice(0, 120));
      results.push({ pass, fail: fail.length + crashed.length });
      done();
    });
  });
};
await Promise.all(Array.from({ length: SIDE_BY_SIDE }, async () => { while (queue.length) await one(queue.shift()); }));
const fails = results.reduce((a, r) => a + r.fail, 0);
console.log(`${results.length} sections in ${Math.round((Date.now() - t0) / 1000)} s: ${results.reduce((a, r) => a + r.pass, 0)} pass, ${fails} failed`);
process.exit(fails ? 1 : 0);
