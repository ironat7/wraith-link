// Runs a copy of the Wraith page in headless Chrome against a real channel and samples the player.
// usage: node harness.mjs <index.html path> <channel> <seconds> [quality] [label]
import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const [file, channel='powdur', secs='120', quality='source', label='run'] = process.argv.slice(2); // usage: node harness.mjs <path to index.html> <channel> <seconds> [quality] [label]
const dir = path.dirname(file);
const srv = http.createServer((q,r)=>{ const u=new URL(q.url,'http://x'); const p=u.pathname==='/'?file:path.join(dir,u.pathname); fs.readFile(p,(e,d)=>{ if(e){r.writeHead(404);return r.end();} r.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.svg')?'image/svg+xml':'application/octet-stream','cache-control':'no-store'}); r.end(d);}); });
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok)); const port=srv.address().port;
const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--autoplay-policy=no-user-gesture-required','--mute-audio'] });
const ctx = await browser.newContext({ viewport:{width:1280,height:720} });
await ctx.addInitScript(q=>{ try{ localStorage.setItem('wraith.quality', JSON.stringify(q)); }catch{} }, quality);
const page = await ctx.newPage();
const logs=[]; page.on('pageerror',e=>logs.push('PAGEERROR '+e.message)); page.on('console',m=>{ if(m.type()==='error') logs.push('console.error '+m.text().slice(0,200)); });
await page.goto(`http://127.0.0.1:${port}/?c=${channel}`);
await page.evaluate(()=>{ // hook hls events once the player exists
  window.__ev={errors:[],levels:[],stalls:0,frags:0,reloads:0};
  const hook=setInterval(()=>{ const h=window.wraith?.P?.hls; if(!h||h.__hooked) return; h.__hooked=true; const H=window.Hls;
    h.on(H.Events.ERROR,(_,d)=>{ const reason=(d.reason||d.error?.message||'').split('\n')[0].slice(0,110); __ev.errors.push({t:Math.round(performance.now()/1000),d:d.details,f:!!d.fatal,r:reason}); });
    h.on(H.Events.LEVEL_SWITCHED,(_,d)=>__ev.levels.push({t:Math.round(performance.now()/1000),l:d.level}));
    h.on(H.Events.FRAG_BUFFERED,()=>__ev.frags++); h.on(H.Events.LEVEL_LOADED,()=>__ev.reloads++);
  },50);
  document.getElementById('vLL').addEventListener('waiting',()=>__ev.stalls++);
});
const t0=Date.now(); const samples=[];
while (Date.now()-t0 < +secs*1000) {
  await new Promise(r=>setTimeout(r,2000));
  const s=await page.evaluate(()=>{ const P=wraith.P,v=P.active(); const b=v?.buffered; let ahead=0; if(v&&b) for(let i=0;i<b.length;i++) if(b.start(i)<=v.currentTime+.25&&b.end(i)>v.currentTime) ahead=b.end(i)-v.currentTime;
    return {feed:P.feed,lat:P.latency?.(),ahead,rate:v?.playbackRate,rs:v?.readyState,h:v?.videoHeight,lvl:P.hls?.currentLevel,cur:v?.currentTime,paused:v?.paused,errs:P.errs,T:P.liveT,skipped:P.skipped}; });
  samples.push({t:Math.round((Date.now()-t0)/1000),...s});
  const last=samples[samples.length-1];
  if (last.t%20<2) console.log(`[${label}] t=${String(last.t).padStart(3)} feed=${last.feed} lat=${last.lat?.toFixed?.(2)} ahead=${last.ahead?.toFixed?.(2)} rate=${last.rate} rs=${last.rs} h=${last.h} lvl=${last.lvl} T=${last.T}`);
}
const ev=await page.evaluate(()=>__ev);
const lats=samples.map(s=>s.lat).filter(x=>typeof x==='number').slice(5); lats.sort((a,b)=>a-b);
const q=p=>lats[Math.floor((lats.length-1)*p)];
const summary={label,channel,quality,secs:+secs,latP50:q(.5)?.toFixed(2),latP90:q(.9)?.toFixed(2),latMax:lats.at(-1)?.toFixed(2),stalls:ev.stalls,frags:ev.frags,reloads:ev.reloads,levelSwitches:ev.levels.length,errs:samples.at(-1)?.errs,errorSamples:ev.errors.slice(0,6),logs:logs.slice(0,8)};
console.log(JSON.stringify(summary,null,1));
fs.writeFileSync(`out-${label}.json`,JSON.stringify({summary,samples,ev},null,1));
await browser.close(); srv.close();
