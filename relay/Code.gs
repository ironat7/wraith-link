// Wraith relay. Twitch only lets its own sites read stream playlists from a browser, so the
// Wraith page (ironat7.github.io/wraith-link) asks this script to fetch them. Video segments
// don't go through here; the phone pulls those straight from Twitch's CDN.
// Lives in Apps Script as "Wraith relay", deployed as a web app run as the owner,
// open to anyone. After editing: Deploy > Manage deployments > edit > New version, so the URL stays.
// Twitch's playlist hosts, plus VOD playlists on Twitch's CloudFront CDN (<20 hex>_<name>/<rendition>/index-dvr.m3u8).
var ALLOW = /^https:\/\/(([a-z0-9-]+\.)*ttvnw\.net\/|[a-z0-9]+\.cloudfront\.net\/[0-9a-f]{20}_[\w-]+\/[\w-]+\/index-dvr\.m3u8$)/i;

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.stats) return reply_(200, stats_());
  var seated = !p.who || seat_(p.who, p.take);
  if (p.ping) return note_(p, reply_(seated ? 200 : 409, 'pong'));
  if (!seated) return note_(p, reply_(409, 'another page is playing'), 409);
  // Every page since 2026-11-05 names itself (who, or pg where it doesn't sit). One that doesn't is older than the seat, still running
  // somewhere iOS keeps it (2026-11-05: one polled all afternoon, out of anyone's sight, and nothing a page can send reached it).
  if (!p.who && !p.pg) return note_(p, reply_(410, 'this Wraith page is out of date: go to its home screen to update it'), 410);
  if (!p.u || !ALLOW.test(p.u)) return reply_(400, 'only Twitch playlist URLs');
  if (spent_()) return note_(p, reply_(599, 'Service invoked too many times for one day: urlfetch.'), 599);
  try {
    var r = UrlFetchApp.fetch(p.u, { muteHttpExceptions: true, followRedirects: true });
    var code = r.getResponseCode(), body = r.getContentText();
    // With &first=<rendition> ("top" = source), a master playlist comes back with that rendition's
    // media playlist appended, which saves the page a round trip before the first frame.
    if (code === 200 && p.first) body += first_(body, p.first);
    return note_(p, reply_(code, body), code, true);
  } catch (err) {
    if (/too many times/i.test(String(err))) spent_(true);
    return note_(p, reply_(599, String(err)), 599, true);
  }
}

// Who's been calling, by page: each page's calls this minute and last, what kinds, which build, how many 409s. ?stats=1 shows it,
// so two players on one phone can be told apart from one player reloading twice as often (2026-11-05: one call a second for an hour).
function note_(p, out, code, fetched) {
  try {
    var cache = CacheService.getScriptCache(), key = 'w:' + String(p.who || '-').slice(0, 12);
    var got = cache.getAll(['whos', key]), ids = JSON.parse(got.whos || '[]');
    var s = JSON.parse(got[key] || 'null') || { t0: Date.now(), n: 0, f: 0, kinds: {} };
    var now = Date.now(), min = Math.floor(now / 60000);
    if (s.min !== min) { s.prev = s.min === min - 1 ? s.cur : 0; s.cur = 0; s.min = min; }
    s.n++; s.cur++; s.t1 = now;
    if (fetched) s.f++;
    if (p.ping) s.pings = (s.pings || 0) + 1;
    if (p.take) s.takes = (s.takes || 0) + 1;
    if (code === 409) s.refused = (s.refused || 0) + 1;
    if (code && code !== 200 && code !== 409) s.last = code;
    var kind = p.k || (p.ping ? 'ping' : /usher\./.test(p.u || '') ? 'master' : /cloudfront/.test(p.u || '') ? 'cdn' : 'media');
    s.kinds[kind] = (s.kinds[kind] || 0) + 1;
    if (p.b) s.b = String(p.b).slice(0, 12);
    if (p.n) s.ns = (s.ns || []).concat(+p.n).slice(-6);   // each page numbers its calls: two pages under one name show as two runs
    if (p.u) {   // which playlists, by the end of their address: two players under one name poll two
      var tail = String(p.u).split('?')[0].slice(-10), us = s.us || {};
      us[tail] = (us[tail] || 0) + 1;
      var tails = Object.keys(us);
      if (tails.length > 6) delete us[tails[0]];
      s.us = us;
    }
    var put = {}; put[key] = JSON.stringify(s);
    if (ids.indexOf(key) < 0) { ids.push(key); put.whos = JSON.stringify(ids.slice(-40)); }
    cache.putAll(put, 21600);
  } catch (err) {}
  return out;
}
function stats_() {
  try {
    var cache = CacheService.getScriptCache(), ids = JSON.parse(cache.get('whos') || '[]'), all = cache.getAll(ids), now = Date.now(), min = Math.floor(now / 60000);
    return JSON.stringify(ids.map(function (k) {
      var s = JSON.parse(all[k] || 'null');
      if (!s) return null;
      return { who: k.slice(2), build: s.b || '', calls: s.n, fetches: s.f, thisMin: s.min === min ? s.cur : 0, lastMin: s.min === min ? s.prev : s.min === min - 1 ? s.cur : 0,
        kinds: s.kinds, pings: s.pings || 0, takes: s.takes || 0, refused: s.refused || 0, lastOdd: s.last || 0, calledAs: s.ns || [], playlists: s.us || {},
        first: new Date(s.t0).toISOString(), lastSeen: Math.round((now - s.t1) / 1000) + ' s ago' };
    }).filter(Boolean).sort(function (a, b) { return parseInt(a.lastSeen, 10) - parseInt(b.lastSeen, 10); }), null, 1);
  } catch (err) {
    return String(err);
  }
}

// Past Google's daily limit a fetch sits for 10 s before it fails, about as long as the page waits to hear why (2026-11-04).
// So the first to fail says so for the next 5 minutes, and only then does one try again.
function spent_(now) {
  try {
    var cache = CacheService.getScriptCache();
    if (now) cache.put('spent', '1', 300);
    return !!cache.get('spent');
  } catch (err) {
    return false;
  }
}

// One page plays at a time. iOS can keep a page running behind a new one where nothing on the phone reaches it (2026-11-04), but every
// player's playlists come through here. The page you start a stream on or come back to takes the seat, and any other hears on its next call.
function seat_(who, take) {
  try {
    var cache = CacheService.getScriptCache();
    if (take) { cache.putAll({ seat: who, seatT: String(Date.now()) }, 21600); return true; }   // 6 hours, the longest it keeps anything
    var got = cache.getAll(['seat', 'seatT']), holder = got.seat;
    // the page still playing keeps it, past those 6 hours, without any page that comes along then taking it as empty
    if (holder === who && Date.now() - (+got.seatT || 0) > 1800e3) cache.putAll({ seat: who, seatT: String(Date.now()) }, 21600);
    return !holder || holder === who;
  } catch (err) {
    return true;   // better two pages for a moment than none
  }
}

function first_(master, want) {
  var lines = master.split('\n');
  for (var i = 0; i < lines.length - 1; i++) {
    if (lines[i].indexOf('#EXT-X-STREAM-INF') !== 0) continue;
    if (want !== 'top' && lines[i].indexOf('VIDEO="' + want + '"') < 0) continue;
    var url = lines[i + 1].trim();
    if (!ALLOW.test(url)) return '';
    var m = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    return '\n#WRAITH-MEDIA:' + m.getResponseCode() + ' ' + url + '\n' + m.getContentText();
  }
  return '';
}

// Apps Script can't set an HTTP status, so it rides on the first line of the body.
function reply_(code, body) {
  return ContentService.createTextOutput(code + '\n' + body).setMimeType(ContentService.MimeType.TEXT);
}
