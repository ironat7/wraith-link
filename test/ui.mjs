// usage: node ui.mjs home|watch|replay|signin|irc|offline [live channel]. Screenshots land in the current folder.
// UI scenarios in headless Chrome. Twitch's sign-in endpoints are mocked; everything else is real.
import { serve, launch, sleep, checks, IPHONE } from './lib.mjs';
const srv = await serve(), { base } = srv;
const browser = await launch();
const which = process.argv[2] || 'all', CH = process.argv[3] || await biggestLive();
const { ok, report } = checks();
console.log('channel', CH);
async function biggestLive() {
  const r = await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query { streams(first: 1) { edges { node { broadcaster { login } } } } }' }) });
  return (await r.json()).data.streams.edges[0].node.broadcaster.login;
}
async function ctx(w = 390, h = 844, touch = true, init) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5, hasTouch: touch, isMobile: touch, userAgent: touch ? IPHONE : undefined });
  if (init) await c.addInitScript(init);
  const page = await c.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  return { c, page };
}

if (which === 'all' || which === 'home') {
  const { c, page } = await ctx();
  await page.goto(base); await page.waitForSelector('#live a.row', { timeout: 15000 });
  const n = await page.$$eval('#live .row', x => x.length);
  ok('home lists live follows', n > 0, `${n} live`);
  ok('offline shows last-live times', (await page.$$eval('#off small', x => x.length)) > 0);
  await page.screenshot({ path: 'ui-home.png' });
  // search
  await page.fill('#q', 'powd'); await sleep(900);
  const sg = await page.$$eval('#sgl .sg .nm', x => x.map(n => n.textContent));
  ok('search suggests channels', sg.some(s => /powdur/i.test(s)), sg.slice(0, 5).join(', '));
  await page.screenshot({ path: 'ui-search.png' });
  await page.fill('#q', 'overwat'); await page.waitForSelector('#sgl .sg[href^="?g="]', { state: 'attached', timeout: 6000 }).catch(() => {});
  const sg2 = await page.$$eval('#sgl .sg', x => x.map(n => n.getAttribute('href')));
  ok('search suggests categories', sg2.some(s => s.startsWith('?g=')), sg2.join(' ').slice(0, 120));
  await page.fill('#q', ''); await sleep(100);
  ok('clearing hides suggestions', await page.$eval('#sgl', x => x.hidden));
  // browse
  await page.click('.seg [data-view=browse]'); await page.waitForSelector('#brList .row', { timeout: 15000 });
  await page.waitForSelector('#cats .cat', { timeout: 15000 });
  ok('browse shows categories', (await page.$$eval('#cats .cat', x => x.length)) > 5);
  const rows1 = await page.$$eval('#brList .row', x => x.length);
  ok('browse shows streams', rows1 >= 20, `${rows1}`);
  await page.screenshot({ path: 'ui-browse.png' });
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await sleep(1800);
  const rows2 = await page.$$eval('#brList .row', x => x.length);
  ok('browse loads more on scroll', rows2 > rows1, `${rows1} -> ${rows2}`);
  await page.evaluate(() => scrollTo(0, 0));
  await page.click('#cats .cat'); await sleep(1500);
  ok('category page', /[?&]g=/.test(page.url()) && (await page.$eval('#brTitle', x => x.textContent)).length > 0, await page.$eval('#brTitle', x => x.textContent));
  await page.screenshot({ path: 'ui-category.png' });
  await page.click('#brBack'); await sleep(600);
  ok('back from category', !/[?&]g=/.test(page.url()) && !(await page.$eval('#secCats', x => x.hidden)));
  // scroll position survives watching something and coming back
  await page.evaluate(() => scrollTo(0, 500)); await sleep(150);
  await page.click('#brList .row:nth-child(6)'); await sleep(1500);
  ok('opens a stream from browse', !(await page.$eval('#watch', x => x.hidden)));
  await page.click('#bBack2'); await sleep(500);
  ok('back keeps the scroll position', Math.abs(await page.evaluate(() => scrollY) - 500) < 60, `${await page.evaluate(() => scrollY)}`);
  ok('still on browse', !(await page.$eval('#vBrowse', x => x.hidden)));
  ok('no page errors', page.errors.length === 0, page.errors.join(' | '));
  await c.close();
}

if (which === 'all' || which === 'watch') {
  const { c, page } = await ctx();
  await page.goto(base + `?c=${CH}`); await sleep(7000);
  const s = await page.evaluate(() => ({ feed: wraith.P.feed, h: wraith.P.active()?.videoHeight, lines: document.querySelectorAll('#chat .m:not(.note)').length, old: document.querySelectorAll('#chat .m.old').length, name: document.getElementById('hudName').textContent, room: wraith.Chat.room['room-id'] }));
  ok('stream plays', s.feed === 'live' && s.h > 0, JSON.stringify(s));
  ok('chat opens with history', s.old > 0, `${s.old} old of ${s.lines}`);
  ok('joined the room', !!s.room);
  await page.screenshot({ path: 'ui-watch.png' });
  ok('under the picture: only the channel’s name and chat', await page.evaluate(() => { const gone = s => { const n = document.querySelector(s); return !n || !n.offsetParent; }; return gone('.tabs') && gone('#bFollow') && gone('#iTitle') && ![...document.querySelectorAll('a[href*="twitch.tv"]')].some(x => x.offsetParent && !x.closest('#chat')) && !document.querySelector('[data-pane=clips]'); }));
  await page.click('#bChan'); await sleep(300);
  for (const t of ['vods', 'about']) {
    await page.click(`.tabs [data-pane=${t}]`); await sleep(1800);
    const txt = await page.$eval(`#pane${t[0].toUpperCase() + t.slice(1)}`, x => x.textContent.slice(0, 90));
    ok(`${t} tab fills`, txt.length > 10 && !/Couldn/.test(txt), txt);
    await page.screenshot({ path: `ui-${t}.png` });
  }
  // a chatter's card
  await page.click('#bChanX'); await sleep(300);
  ok('the x goes back to chat', await page.evaluate(() => !document.getElementById('watch').classList.contains('chan') && !document.getElementById('paneChat').hidden));
  const hasName = await page.evaluate(() => { const n = [...document.querySelectorAll('#chat .m .n')].pop(); n?.click(); return !!n; });   // the newest: a busy chat drops the oldest while you reach for it
  if (hasName) { await sleep(900); ok('tapping a name opens the card', !(await page.$eval('#sheet', x => x.hidden))); await page.screenshot({ path: 'ui-card.png' }); await page.evaluate(() => document.getElementById('scrim').click()); }
  // settings sheet
  await page.evaluate(() => document.getElementById('bSet').click()); await sleep(1200);
  const stats = await page.$eval('#sheetBody .stats:last-child', x => x.textContent);
  ok('stats panel', /Behind live/.test(stats) && /Picture/.test(stats), stats.slice(0, 160));
  await page.screenshot({ path: 'ui-sheet.png' });
  await page.evaluate(() => document.getElementById('scrim').click());
  ok('no page errors', page.errors.length === 0, page.errors.join(' | '));
  await c.close();
}

if (which === 'all' || which === 'replay') {
  // Chrome can't play the CDN copy, so drive the replay with a fake clock against Twitch's real chat data.
  const { c, page } = await ctx(900, 1000, false);
  await page.goto(base + `?c=${CH}`); await sleep(1500);
  const r = await page.evaluate(async login => {
    const { P, Replay, Chat } = wraith;
    const res = await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query($l:String!){user(login:$l){id videos(first:5,type:ARCHIVE,sort:TIME){edges{node{id status}}}}}', variables: { l: login } }) });
    const j = await res.json(), vid = j.data.user.videos.edges.map(e => e.node).find(n => n.status !== 'RECORDING')?.id;
    P.close();
    document.getElementById('home').hidden = true; document.getElementById('watch').hidden = false;
    await Chat.loadGlobal(); await Chat.channel(j.data.user.id);
    Replay.open(vid);
    const log = [];
    const count = () => document.querySelectorAll('#chat .m:not(.note)').length;
    Replay.tick(600); await new Promise(r => setTimeout(r, 1500));
    for (let t = 600; t <= 640; t += 2) { Replay.tick(t); await new Promise(r => setTimeout(r, 60)); }
    await new Promise(r => setTimeout(r, 900)); Replay.tick(641);
    log.push(['after 40 s', count(), Replay.q.length]);
    const sample = [...document.querySelectorAll('#chat .m')].slice(-3).map(n => n.textContent.slice(0, 70));
    const emotes = document.querySelectorAll('#chat .m .em').length;
    Replay.tick(3000); await new Promise(r => setTimeout(r, 1500)); Replay.tick(3001);
    log.push(['after seek to 3000', count(), Replay.q.length]);
    for (let t = 3001; t <= 3020; t += 2) { Replay.tick(t); await new Promise(r => setTimeout(r, 40)); }
    log.push(['20 s later', count()]);
    return { vid, log, sample, emotes };
  }, CH);
  ok('chat replay draws lines', r.log[0][1] > 0, JSON.stringify(r));
  ok('chat replay survives a seek', r.log[2][1] > 0);
  await page.screenshot({ path: 'ui-replay.png' });
  ok('no page errors', page.errors.length === 0, page.errors.join(' | '));
  await c.close();
}

if (which === 'all' || which === 'signin') {
  // The whole sign-in flow against mocked Twitch endpoints: device code, polling, token, lists, follow, block, send.
  const { c, page } = await ctx();
  const calls = [];
  let approved = false, follows = ['forsen', CH];
  await page.route('https://id.twitch.tv/oauth2/**', route => {
    const u = route.request().url(), body = route.request().postData() || '';
    calls.push(u.split('/').pop());
    const json = (status, o) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.endsWith('/device')) return json(200, { device_code: 'DEV', expires_in: 1800, interval: 1, user_code: 'ABCD1234', verification_uri: 'https://www.twitch.tv/activate' });
    if (u.endsWith('/token')) return approved ? json(200, { access_token: 'TOK', refresh_token: 'REF', expires_in: 14000, scope: [], token_type: 'bearer' }) : json(400, { status: 400, message: 'authorization_pending' });
    if (u.endsWith('/validate')) return json(200, { client_id: 'x', login: 'ironat___', user_id: '212375133', scopes: [], expires_in: 14000 });
    if (u.endsWith('/revoke')) return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
    return route.continue();
  });
  // authenticated GQL only; anonymous GQL stays real
  await page.route('https://gql.twitch.tv/gql', route => {
    const q = route.request();
    if (q.method() !== 'POST' || !(q.headers().authorization || '').startsWith('OAuth')) return route.continue();
    const b = JSON.parse(q.postData());
    calls.push('gql:' + (b.operationName || b.query.slice(0, 40)));
    const json = o => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (b.operationName === 'ChannelFollows') return json({ data: { user: { follows: { edges: follows.map(l => ({ cursor: 'c', node: { login: l, displayName: l } })), pageInfo: { hasNextPage: false } } } } });
    if (/currentUser \{ login/.test(b.query || '')) return json({ data: { currentUser: { login: 'ironat___', displayName: 'Ironat___', profileImageURL: 'https://static-cdn.jtvnw.net/user-default-pictures-uv/294c98b5-e34d-42cd-a8f0-140b72fba9b0-profile_image-70x70.png' } } });
    if (/blockedUsers/.test(b.query || '')) return json({ data: { currentUser: { blockedUsers: [{ id: '999' }] } } });
    if (/emoteSets/.test(b.query || '')) return json({ data: { currentUser: { emoteSets: [{ owner: { login: 'powdur' }, emotes: [{ id: '25', token: 'Kappa', type: 'SUBSCRIPTIONS' }, { id: '1', token: ':)', type: 'SMILIES' }] }] } } });
    if (/unfollowUser/.test(b.query || '')) return json({ data: { unfollowUser: { follow: { user: { id: '1' } } } } });
    if (/followUser/.test(b.query || '')) return json({ data: { followUser: { follow: { user: { id: '1' } }, error: null } } });
    if (/blockUser/.test(b.query || '')) return json({ data: { blockUser: { targetUser: { login: 'x' } } } });
    return route.continue();
  });
  const sent = [];
  await page.route('https://api.twitch.tv/helix/**', route => {
    const q = route.request(), json = (s, o) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    calls.push('helix:' + new URL(q.url()).pathname.replace('/helix', ''));
    if (q.url().includes('/chat/messages')) { const b = JSON.parse(q.postData()); sent.push(b); if (b.message === 'refuse me') return json(200, { data: [{ message_id: '', is_sent: false, drop_reason: { code: 'x', message: 'Your message was blocked by AutoMod.' } }] }); return json(200, { data: [{ message_id: 'm1', is_sent: true }] }); }
    if (q.url().includes('/users/blocks') && q.method() === 'PUT') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    return json(401, { error: 'Unauthorized', status: 401, message: 'nope' });
  });
  await page.goto(base); await page.waitForSelector('#live .row', { timeout: 15000 }).catch(() => {});
  await page.click('#acct'); await sleep(200);
  await page.screenshot({ path: 'ui-account-out.png' });
  await page.click('#sheetBody .opt'); await sleep(600);
  ok('code screen shows the code', (await page.$eval('#sheetBody', x => x.textContent)).includes('ABCD1234'));
  ok('approve link carries the code', (await page.$eval('#sheetBody a.btn', x => x.href)).includes('device-code=ABCD1234'));
  await page.screenshot({ path: 'ui-signin.png' });
  await sleep(2200);
  ok('keeps polling while pending', calls.filter(x => x === 'token').length >= 1 && !(await page.$eval('#sheet', x => x.hidden)));
  approved = true;
  await sleep(2500);
  ok('moves on once approved', await page.$eval('#sheet', x => x.hidden));
  const a = await page.evaluate(() => ({ me: wraith.Me.acct?.login, name: wraith.Me.acct?.name, follows: wraith.Me.follows, blocks: wraith.Me.blocks.size, emotes: wraith.Me.emotes.map(e => e.name), mention: wraith.Me.mentions?.test('hey @ironat___ hi'), noMention: wraith.Me.mentions?.test('ironat___x') }));
  ok('account loaded', a.me === 'ironat___' && a.name === 'Ironat___', JSON.stringify(a));
  ok('follows come from Twitch', a.follows?.length === 2);
  ok('blocks loaded', a.blocks >= 1);
  ok('odd emote tokens filtered', a.emotes.join() === 'Kappa');
  ok('mention pattern', a.mention === true && a.noMention === false);
  await page.waitForFunction(() => wraith.Home.users.length === 2, null, { timeout: 8000 }).catch(() => {});
  ok('home list follows the account', await page.evaluate(() => wraith.Home.users.length === 2));
  ok('avatar on the account button', !!(await page.$('#acct img')));
  await page.screenshot({ path: 'ui-home-signedin.png' });
  // watch: box, send, refusal, follow, reply, block, picker, completion
  await page.evaluate(ch => document.querySelector(`a[href="?c=${ch}"]`)?.click() ?? history.pushState(null, '', `?c=${ch}`), CH);
  await page.goto(base + `?c=${CH}`); await sleep(5000);
  ok('send box shows', !(await page.$eval('#sayTx', x => x.hidden)) && (await page.$eval('#signin', x => x.hidden)));
  ok('no follow button until the channel is open', !(await page.isVisible('#bFollow')));
  await page.click('#bChan'); await sleep(300);
  ok('follow button says Following', (await page.$eval('#bFollow', x => x.textContent)) === 'Following' && await page.isVisible('#bFollow'));
  await page.click('#bFollow'); await sleep(300);
  const asked = await page.$eval('#sheetBody', x => x.textContent);
  ok('one tap only asks', /Unfollow .*\?/i.test(asked) && (await page.$eval('#bFollow', x => x.textContent)) === 'Following' && await page.evaluate(ch => wraith.Me.follows.includes(ch), CH), asked);
  await page.click('#sheetBody .opt:nth-child(2)'); await sleep(300);
  ok('keep following keeps it', (await page.$eval('#bFollow', x => x.textContent)) === 'Following' && await page.evaluate(ch => wraith.Me.follows.includes(ch), CH) && await page.$eval('#sheet', x => x.hidden));
  await page.click('#bFollow'); await sleep(300);
  await page.click('#sheetBody .opt:nth-child(1)'); await sleep(400);
  ok('unfollow works once confirmed', (await page.$eval('#bFollow', x => x.textContent)) === 'Follow' && await page.evaluate(ch => !wraith.Me.follows.includes(ch), CH));
  await page.click('#bFollow'); await sleep(400);
  ok('follow is one tap', (await page.$eval('#bFollow', x => x.textContent)) === 'Following' && await page.$eval('#sheet', x => x.hidden));
  await page.click('#bChanX'); await sleep(300);
  await page.fill('#sayTx', 'hello there'); await page.press('#sayTx', 'Enter'); await sleep(500);
  ok('message goes through the API', sent.some(s => s.message === 'hello there' && s.sender_id === '212375133'));
  ok('box clears after sending', (await page.$eval('#sayTx', x => x.value)) === '');
  await page.fill('#sayTx', 'refuse me'); await page.press('#sayTx', 'Enter'); await sleep(500);
  ok('refusal says why and keeps the text', (await page.$eval('#chat', x => x.textContent)).includes('AutoMod') && (await page.$eval('#sayTx', x => x.value)) === 'refuse me');
  await page.fill('#sayTx', '');
  // autocomplete
  await page.evaluate(() => { wraith.Chat.chanEmotes = [{ name: 'powHeart', url: 'https://cdn.betterttv.net/emote/5f1b0186cf6d2144653d2970/2x' }, { name: 'powWave', url: 'https://cdn.betterttv.net/emote/5f1b0186cf6d2144653d2970/2x' }]; });
  await page.type('#sayTx', 'pow'); await sleep(150);
  ok('typing suggests emotes', (await page.$$eval('#ac button', x => x.length)) >= 2);
  await page.screenshot({ path: 'ui-complete.png' });
  await page.click('#ac button'); await sleep(100);
  ok('tap completes the word', /^pow\w+ $/.test(await page.$eval('#sayTx', x => x.value)), await page.$eval('#sayTx', x => x.value));
  await page.fill('#sayTx', '');
  // picker
  await page.click('#bEmote'); await sleep(300);
  ok('picker opens with sections', (await page.$$eval('#epl h4', x => x.length)) >= 1);
  await page.screenshot({ path: 'ui-picker.png' });
  await page.click('#epl .epg button'); await sleep(100);
  ok('picking an emote fills the box', (await page.$eval('#sayTx', x => x.value)).trim().length > 0);
  await page.click('#bEmote'); await page.fill('#sayTx', '');
  // card: reply + block
  await page.waitForSelector('#chat .m .n', { timeout: 8000 }).catch(() => {});
  const line = await page.$('#chat .m[data-u] .n');
  if (line) {
    const uid = await line.evaluate(n => n.closest('.m').dataset.u);
    await line.click(); await sleep(700);
    await page.screenshot({ path: 'ui-card-signedin.png' });
    const labels = await page.$$eval('#sheetBody .opt .l', x => x.map(n => n.firstChild.textContent));
    ok('card offers reply, mention, block', labels.includes('Reply') && labels.includes('Mention') && labels.includes('Block'), labels.join(', '));
    await page.click('#sheetBody .opt'); await sleep(250);
    ok('reply bar shows', !(await page.$eval('#rpb', x => x.hidden)), await page.$eval('#rpbT', x => x.textContent));
    await page.fill('#sayTx', 'a reply'); await page.press('#sayTx', 'Enter'); await sleep(400);
    ok('reply carries the parent id', sent.some(s => s.message === 'a reply' && s.reply_parent_message_id));
    ok('reply bar clears', await page.$eval('#rpb', x => x.hidden));
    const again = await page.$(`#chat .m[data-u="${uid}"] .n`);
    if (again) {
      await again.click(); await sleep(500);
      await page.evaluate(() => [...document.querySelectorAll('#sheetBody .opt')].find(b => b.textContent.startsWith('Block')).click()); await sleep(500);
      ok('block hides their lines', (await page.$$(`#chat .m[data-u="${uid}"]`)).length === 0 && await page.evaluate(u => wraith.Me.blocks.has(u), uid));
      const added = await page.evaluate(u => { const before = wraith.Chat.queue.length; wraith.Chat.line(`@id=fake1;user-id=${u};tmi-sent-ts=${Date.now()};display-name=x :x!x@x.tmi.twitch.tv PRIVMSG #powdur :hello`); return wraith.Chat.queue.length - before; }, uid);
      ok('blocked chatter stays filtered', added === 0);
    }
  }
  // sign out
  await page.evaluate(() => document.getElementById('bSet').click()); await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('#sheetBody .opt')].find(b => b.textContent.startsWith('Sign out')).click()); await sleep(400);
  ok('sign out asks first', await page.evaluate(() => !!wraith.Me.acct && document.getElementById('sheetBody').textContent.includes('Stay signed in')));
  await page.evaluate(() => [...document.querySelectorAll('#sheetBody .opt')].find(b => b.textContent.startsWith('Sign out')).click()); await sleep(400);
  ok('sign out clears the account', await page.evaluate(() => !wraith.Me.acct && wraith.Me.blocks.size === 0 && !localStorage.getItem('wraith.me')?.includes('TOK')));
  ok('sign out revokes the token', calls.includes('revoke'));
  ok('box goes back to the sign-in button', !(await page.$eval('#signin', x => x.hidden)));
  ok('no page errors', page.errors.length === 0, page.errors.join(' | '));
  console.log('calls:', [...new Set(calls)].join(' '));
  await c.close();
}

if (which === 'all' || which === 'irc') {
  // API refuses this client: sending falls back to chat's own socket. Socket mocked.
  const { c, page } = await ctx(900, 1000, false, () => {
    localStorage.setItem('wraith.me', JSON.stringify({ token: 'TOK', id: '212375133', login: 'ironat___', name: 'Ironat___' }));
  });
  await page.route('https://id.twitch.tv/oauth2/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ login: 'ironat___', user_id: '212375133', client_id: 'x' }) }));
  await page.route('https://api.twitch.tv/helix/**', route => route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 401, message: 'client not allowed' }) }));
  const seen = [];
  await page.routeWebSocket('wss://irc-ws.chat.twitch.tv:443', ws => {
    let authed = false;
    const server = ws.connectToServer();
    ws.onMessage(m => {
      if (String(m).startsWith('PASS oauth:')) { authed = true; seen.push('PASS'); return; }
      if (authed) {
        seen.push(String(m));
        if (String(m).startsWith('NICK')) ws.send(':tmi.twitch.tv GLOBALUSERSTATE :x\r\n'.replace(':tmi.twitch.tv GLOBALUSERSTATE :x', '@user-id=1 :tmi.twitch.tv GLOBALUSERSTATE'));
        else if (String(m).includes('PRIVMSG')) { if (String(m).includes('slowme')) ws.send('@msg-id=msg_slowmode :tmi.twitch.tv NOTICE #x :This room is in slow mode.\r\n'); else ws.send('@id=abc :tmi.twitch.tv USERSTATE #x\r\n'); }
        return;
      }
      server.send(m);
    });
    server.onMessage(m => ws.send(m));
  });
  await page.goto(base + `?c=${CH}`); await sleep(3500);
  await page.fill('#sayTx', 'via the socket'); await page.press('#sayTx', 'Enter'); await sleep(1200);
  ok('falls back to the socket', seen.some(s => s === `PRIVMSG #${CH} :via the socket`), seen.join(' | ').slice(0, 200));
  ok('box clears', (await page.$eval('#sayTx', x => x.value)) === '');
  await page.fill('#sayTx', 'slowme'); await page.press('#sayTx', 'Enter'); await sleep(800);
  ok('refusal comes through from the socket', (await page.$eval('#chat', x => x.textContent)).includes('slow mode'));
  await page.fill('#sayTx', 'second'); await page.press('#sayTx', 'Enter'); await sleep(800);
  ok('reuses the connection', seen.filter(s => s === 'PASS').length === 1 && seen.some(s => s.endsWith(':second')));
  ok('no page errors', page.errors.length === 0, page.errors.join(' | '));
  await c.close();
}

if (which === 'all' || which === 'offline') {
  // A channel that's offline starts by itself; a stream that ends goes to the offline card, and only after being asked twice.
  const { c, page } = await ctx(900, 1000, false);
  let liveNow = false;
  await page.route('https://gql.twitch.tv/gql', async route => {
    const q = route.request();
    if (q.method() !== 'POST') return route.continue();
    const b = q.postData() || '';
    if (!b.includes('users(logins') || liveNow) return route.continue();
    const res = await route.fetch(), j = await res.json();
    for (const u of j.data?.users || []) if (u) u.stream = null;
    return route.fulfill({ response: res, body: JSON.stringify(j) });
  });
  await page.goto(base + `?c=${CH}`); await sleep(2500);
  const box = await page.$eval('#msgbox', x => ({ hidden: x.hidden, text: x.textContent }));
  ok('offline card', !box.hidden && /offline/i.test(box.text), box.text.slice(0, 120));
  await page.screenshot({ path: 'ui-offline.png' });
  liveNow = true;
  await page.waitForFunction(() => wraith.P.feed === 'live', null, { timeout: 40000 }).catch(() => {});
  ok('starts by itself when they go live', await page.evaluate(() => wraith.P.feed === 'live' && document.getElementById('msgbox').hidden));
  await sleep(4000);
  ok('and plays', await page.evaluate(() => wraith.P.active()?.videoHeight > 0));
  ok('no page errors', page.errors.length === 0, page.errors.join(' | '));
  await c.close();
}

await browser.close(); srv.close();
report();
