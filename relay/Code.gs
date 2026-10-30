// Wraith relay. Twitch only lets its own sites read stream playlists from a browser, so the
// Wraith page (ironat7.github.io/wraith-link) asks this script to fetch them. Video segments
// don't go through here; the phone pulls those straight from Twitch's CDN.
// Lives in Apps Script as "Wraith relay" (wjerry0349), deployed as a web app run as the owner,
// open to anyone. After editing: Deploy > Manage deployments > edit > New version, so the URL stays.
// Twitch's playlist hosts, plus VOD playlists on Twitch's CloudFront CDN (<20 hex>_<name>/<rendition>/index-dvr.m3u8).
var ALLOW = /^https:\/\/(([a-z0-9-]+\.)*ttvnw\.net\/|[a-z0-9]+\.cloudfront\.net\/[0-9a-f]{20}_[\w-]+\/[\w-]+\/index-dvr\.m3u8$)/i;

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.ping) return reply_(200, 'pong');
  if (!p.u || !ALLOW.test(p.u)) return reply_(400, 'only Twitch playlist URLs');
  try {
    var r = UrlFetchApp.fetch(p.u, { muteHttpExceptions: true, followRedirects: true });
    var code = r.getResponseCode(), body = r.getContentText();
    // With &first=<rendition> ("top" = source), a master playlist comes back with that rendition's
    // media playlist appended, which saves the page a round trip before the first frame.
    if (code === 200 && p.first) body += first_(body, p.first);
    return reply_(code, body);
  } catch (err) {
    return reply_(599, String(err));
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
