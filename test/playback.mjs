// usage: node playback.mjs start|quality|relaydown|segdown|bg [channel] [channel2]. Needs live channels.
// Scenario tests against real streams in headless Chrome.
import { serve, launch, sleep } from './lib.mjs';
const srv=await serve();
const browser=await launch();
const which=process.argv[2]||'all', chA=process.argv[3]||'powdur', chB=process.argv[4]||'smugalana';
async function open(ch,opts={}){const ctx=await browser.newContext({viewport:{width:1280,height:720},...opts});const page=await ctx.newPage();const logs=[];page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));await page.goto(`${srv.base}?c=${ch}`);return{ctx,page,logs};}
const state=p=>p.evaluate(()=>{const P=wraith.P,v=P.active();let ahead=0;if(v)for(let i=0;i<v.buffered.length;i++)if(v.buffered.start(i)<=v.currentTime+.25&&v.buffered.end(i)>v.currentTime)ahead=v.buffered.end(i)-v.currentTime;return{feed:P.feed,lat:+(P.latency()||0).toFixed(2),ahead:+ahead.toFixed(2),h:v?.videoHeight,lvl:P.hls?.currentLevel,cap:P.cap,T:P.liveT,paused:v?.paused,t:+(v?.currentTime||0).toFixed(1),errs:P.errs,rs:v?.readyState,q:P.q,retries:P.retries}});
const log=(n,s)=>console.log(n.padEnd(26),JSON.stringify(s));
async function waitPlaying(p,ms=15000){const t0=Date.now();for(;;){const s=await state(p).catch(()=>null);if(s&&s.h&&s.t>0&&!s.paused&&s.rs>=3)return Date.now()-t0;if(Date.now()-t0>ms)return -1;await sleep(100);}}
if(which==='all'||which==='start'){for(const ch of[chA,chB]){const a=await open(ch);const ms=await waitPlaying(a.page);await sleep(6000);log(`${ch} first frame ${ms}ms`,await state(a.page));console.log(a.logs);await a.ctx.close();}}
if(which==='all'||which==='quality'){const a=await open(chA);await waitPlaying(a.page);await sleep(4000);log('before switch',await state(a.page));
 await a.page.evaluate(()=>wraith.P.setQuality('480p30'));await sleep(6000);log('to 480p30',await state(a.page));
 await a.page.evaluate(()=>wraith.P.setQuality('source'));await sleep(8000);log('back to source',await state(a.page));
 await a.page.evaluate(()=>wraith.P.setQuality('auto'));await sleep(10000);log('auto',await state(a.page));
 await a.page.evaluate(()=>wraith.P.setQuality('source'));await sleep(5000);log('source again',await state(a.page));console.log(a.logs);await a.ctx.close();}
if(which==='all'||which==='relaydown'){const a=await open(chB);await waitPlaying(a.page);await sleep(3000);log('before relay outage',await state(a.page));
 await a.page.route(/script\.google/,r=>r.abort());console.log('relay blocked 15 s');for(let i=0;i<3;i++){await sleep(5000);log(' outage +'+(i+1)*5,await state(a.page));}
 await a.page.unroute(/script\.google/);console.log('relay restored');for(let i=0;i<4;i++){await sleep(5000);log(' restored +'+(i+1)*5,await state(a.page));}console.log(a.logs);await a.ctx.close();}
if(which==='all'||which==='segdown'){const a=await open(chB);await waitPlaying(a.page);await sleep(3000);log('before CDN outage',await state(a.page));
 await a.page.route(/hls\.ttvnw\.net/,r=>r.abort());console.log('segments blocked 18 s');for(let i=0;i<3;i++){await sleep(6000);log(' outage +'+(i+1)*6,await state(a.page));}
 await a.page.unroute(/hls\.ttvnw\.net/);console.log('segments restored');for(let i=0;i<4;i++){await sleep(5000);log(' restored +'+(i+1)*5,await state(a.page));}console.log(a.logs);await a.ctx.close();}
if(which==='all'||which==='bg'){for(const ch of[chA,chB]){const a=await open(ch);await waitPlaying(a.page);await sleep(3000);log(ch+' before bg',await state(a.page));
 // pretend to be iOS going to the background: BG takes over on the audio element
 await a.page.evaluate(()=>{wraith.BG.ios=true;window.__hidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hidden});document.dispatchEvent(new Event('visibilitychange'));});
 await sleep(14000);const bg=await a.page.evaluate(()=>{const A=document.getElementById('aBG');let ahead=0;for(let i=0;i<A.buffered.length;i++)if(A.buffered.start(i)<=A.currentTime+.25&&A.buffered.end(i)>A.currentTime)ahead=A.buffered.end(i)-A.currentTime;return{on:wraith.BG.on,paused:A.paused,t:+A.currentTime.toFixed(1),ahead:+ahead.toFixed(2),rs:A.readyState,errs:wraith.P.errs}});log(' in background',bg);
 await sleep(4000);const bg2=await a.page.evaluate(()=>+document.getElementById('aBG').currentTime.toFixed(1));console.log(' audio advanced to',bg2);
 await a.page.evaluate(()=>{window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'));});const ms=await waitPlaying(a.page);console.log(' picture back in',ms,'ms');await sleep(5000);log(' back in foreground',await state(a.page));console.log(a.logs);await a.ctx.close();}}
await browser.close();srv.close();
