"use strict";
/* =====================================================================
   LEADER — precision web camera
   Photo + video, digital & pro-film filters, manual controls,
   histogram, level, timer, torch, gallery, PWA.

   Security posture:
   - Zero third-party code or requests; strict CSP (header + meta)
   - No dynamic HTML from any external or user-controlled string;
     all DOM built via createElement / textContent
   - Media stays in-memory (blob:), never persisted or transmitted
   ===================================================================== */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------------- Filters ---------------- */
/* css: live/capture filter string · vig: vignette 0-1 · grain: 0-1
   temp/tint: baked color cast (-1..1) applied via soft-light overlay */
const FILTERS = {
digital:[
  {id:"orig",  name:"ORIGINAL", css:"", vig:0, grain:0},
  {id:"vivid", name:"VIVID",    css:"contrast(1.12) saturate(1.35)", vig:0, grain:0},
  {id:"vwarm", name:"VIVID W",  css:"contrast(1.1) saturate(1.3)", temp:.35, vig:0, grain:0},
  {id:"vcool", name:"VIVID C",  css:"contrast(1.1) saturate(1.28)", temp:-.35, vig:0, grain:0},
  {id:"drama", name:"DRAMATIC", css:"contrast(1.28) saturate(.92) brightness(.96)", vig:.35, grain:0},
  {id:"dwarm", name:"DRAMA W",  css:"contrast(1.25) saturate(.95)", temp:.4, vig:.35, grain:0},
  {id:"mono",  name:"MONO",     css:"grayscale(1) contrast(1.05)", vig:0, grain:0},
  {id:"silver",name:"SILVER",   css:"grayscale(1) contrast(.95) brightness(1.1)", vig:0, grain:0},
  {id:"noir",  name:"NOIR",     css:"grayscale(1) contrast(1.45) brightness(.9)", vig:.55, grain:.1},
  {id:"sepia", name:"SEPIA",    css:"sepia(.85) contrast(1.02)", vig:.15, grain:0},
  {id:"fade",  name:"FADE",     css:"contrast(.82) brightness(1.08) saturate(.78)", vig:0, grain:0},
  {id:"chrome",name:"CHROME",   css:"contrast(1.06) saturate(1.15) brightness(1.04)", vig:0, grain:0},
],
pro:[
  {id:"p400",  name:"P·400",    css:"contrast(.96) saturate(1.08) brightness(1.05)", temp:.22, tint:.08, vig:.1, grain:.16},
  {id:"v50",   name:"V·50",     css:"contrast(1.2) saturate(1.5)", temp:.08, vig:.14, grain:.05},
  {id:"tx400", name:"TX·400",   css:"grayscale(1) contrast(1.3) brightness(1.02)", vig:.3, grain:.42},
  {id:"c800t", name:"C·800T",   css:"contrast(1.05) saturate(1.12) brightness(1.02)", temp:-.3, tint:-.12, vig:.22, grain:.2},
  {id:"k64",   name:"K·64",     css:"contrast(1.18) saturate(1.25) brightness(.98)", temp:.28, vig:.2, grain:.12},
  {id:"fpro",  name:"F·PRO",    css:"contrast(1.04) saturate(1.05) brightness(1.03)", temp:-.1, tint:-.18, vig:.08, grain:.1},
  {id:"bleach",name:"BLEACH",   css:"contrast(1.45) saturate(.45) brightness(1.02)", vig:.25, grain:.18},
  {id:"xpro",  name:"X·PRO",    css:"contrast(1.3) saturate(1.35) hue-rotate(-8deg)", temp:.15, tint:-.3, vig:.4, grain:.15},
  {id:"lomo",  name:"LOMO",     css:"contrast(1.35) saturate(1.4)", temp:.1, vig:.7, grain:.22},
  {id:"cine",  name:"CINE T&O", css:"contrast(1.15) saturate(1.1)", temp:.3, tint:-.35, vig:.2, grain:.08},
  {id:"golden",name:"GOLDEN",   css:"contrast(1.05) saturate(1.2) brightness(1.06)", temp:.55, vig:.18, grain:.06},
  {id:"irmono",name:"IR·MONO",  css:"grayscale(1) contrast(1.2) brightness(1.25) invert(.08)", vig:.3, grain:.25},
]};

/* Manual adjustment definitions (drum-controlled) */
const ADJUSTS = [
  {id:"ev",   name:"EXPOSURE", min:-100,max:100,def:0, fmt:v=>((v/50>=0?"+":"")+(v/50).toFixed(1)+" EV")},
  {id:"con",  name:"CONTRAST", min:-100,max:100,def:0, fmt:v=>(v>0?"+":"")+v},
  {id:"sat",  name:"SATURATION",min:-100,max:100,def:0, fmt:v=>(v>0?"+":"")+v},
  {id:"temp", name:"TEMP",     min:-100,max:100,def:0, fmt:v=>(v>0?"+":"")+v+"K'"},
  {id:"tint", name:"TINT",     min:-100,max:100,def:0, fmt:v=>(v>0?"+":"")+v},
  {id:"vig",  name:"VIGNETTE", min:0,   max:100,def:0, fmt:v=>v+""},
  {id:"grain",name:"GRAIN",    min:0,   max:100,def:0, fmt:v=>v+""},
  {id:"zoom", name:"ZOOM",     min:100, max:500,def:100, fmt:v=>(v/100).toFixed(1)+"×"},
];

/* ---------------- State ---------------- */
const S = {
  facing:"environment", stream:null, track:null, audioStream:null,
  mode:"photo", filterSet:"digital", filter:FILTERS.digital[0],
  adj:Object.fromEntries(ADJUSTS.map(a=>[a.id,a.def])),
  focusEv:0,
  torch:false, torchCap:false, screenFlash:false,
  timer:0, aspect:"4:3", grid:false, level:false, histo:false,
  mirrorSave:true, sound:true, quality:.92, reqW:1920,
  zoomNative:false, zoomRange:null,
  recording:false, recorder:null, recChunks:[], recStart:0, recTimerId:0, recPipeline:null,
  gallery:[], viewIndex:-1,
  ctxFilterOK:false, activeAdj:ADJUSTS[0],
  running:false,           // main loop enabled (camera started, tab visible)
  railVisible:true,        // filter rail on screen (not in MANUAL tab)
};

/* ---------------- Elements (cached once) ---------------- */
const cam=$("#cam"), vfScale=$("#vfScale"), vfClip=$("#vfClip");
const tempLayer=$("#tempLayer"), tintLayer=$("#tintLayer"), vigLayer=$("#vigLayer"), grainLayer=$("#grainLayer");
const toastEl=$("#toast"), readoutEl=$("#readout"), zoomValEl=$("#zoomVal");

/* ---------------- Utilities ---------------- */
let toastT;
function toast(msg){ toastEl.textContent=msg; toastEl.classList.add("on");
  clearTimeout(toastT); toastT=setTimeout(()=>toastEl.classList.remove("on"),2200); }

function tick(){ if(!S.sound) return;
  try{ const ac=tick.ac||(tick.ac=new (window.AudioContext||window.webkitAudioContext)());
    if(ac.state==="suspended") ac.resume();
    const o=ac.createOscillator(), g=ac.createGain();
    o.type="square"; o.frequency.value=1400; g.gain.setValueAtTime(.06,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.07);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime+.08);
  }catch(e){} }

function vibrate(ms){ if(navigator.vibrate) navigator.vibrate(ms); }

function detectCtxFilter(){
  try{ const c=document.createElement("canvas").getContext("2d");
    c.filter="blur(1px)"; return c.filter==="blur(1px)"; }catch(e){ return false; }
}
S.ctxFilterOK = detectCtxFilter();

/* ---------------- Filter math (fallback pixel pipeline) ----------------
   Applies the filter string manually when ctx.filter is unavailable
   (older iOS Safari). Photo-capture only — a single frame. */
function parseFilterString(str){
  const out=[]; const re=/([a-z-]+)\(([^)]+)\)/g; let m;
  while((m=re.exec(str))) out.push({fn:m[1], v:parseFloat(m[2])});
  return out;
}
function applyPixelFilters(imgData, str){
  const fns=parseFilterString(str); const d=imgData.data;
  for(const {fn,v} of fns){
    if(fn==="brightness"){ for(let i=0;i<d.length;i+=4){ d[i]*=v; d[i+1]*=v; d[i+2]*=v; } }
    else if(fn==="contrast"){ for(let i=0;i<d.length;i+=4){
        d[i]=(d[i]-128)*v+128; d[i+1]=(d[i+1]-128)*v+128; d[i+2]=(d[i+2]-128)*v+128; } }
    else if(fn==="saturate"){ for(let i=0;i<d.length;i+=4){
        const l=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
        d[i]=l+(d[i]-l)*v; d[i+1]=l+(d[i+1]-l)*v; d[i+2]=l+(d[i+2]-l)*v; } }
    else if(fn==="grayscale"){ for(let i=0;i<d.length;i+=4){
        const l=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
        d[i]=d[i]+(l-d[i])*v; d[i+1]=d[i+1]+(l-d[i+1])*v; d[i+2]=d[i+2]+(l-d[i+2])*v; } }
    else if(fn==="sepia"){ for(let i=0;i<d.length;i+=4){
        const r=d[i],g=d[i+1],b=d[i+2];
        const sr=.393*r+.769*g+.189*b, sg=.349*r+.686*g+.168*b, sb=.272*r+.534*g+.131*b;
        d[i]=r+(sr-r)*v; d[i+1]=g+(sg-g)*v; d[i+2]=b+(sb-b)*v; } }
    else if(fn==="invert"){ for(let i=0;i<d.length;i+=4){
        d[i]=d[i]+(255-2*d[i])*v; d[i+1]=d[i+1]+(255-2*d[i+1])*v; d[i+2]=d[i+2]+(255-2*d[i+2])*v; } }
    else if(fn==="hue-rotate"){ const a=v*Math.PI/180, cs=Math.cos(a), sn=Math.sin(a);
      const M=[ .213+cs*.787-sn*.213, .715-cs*.715-sn*.715, .072-cs*.072+sn*.928,
                .213-cs*.213+sn*.143, .715+cs*.285+sn*.140, .072-cs*.072-sn*.283,
                .213-cs*.213-sn*.787, .715-cs*.715+sn*.715, .072+cs*.928+sn*.072];
      for(let i=0;i<d.length;i+=4){ const r=d[i],g=d[i+1],b=d[i+2];
        d[i]=M[0]*r+M[1]*g+M[2]*b; d[i+1]=M[3]*r+M[4]*g+M[5]*b; d[i+2]=M[6]*r+M[7]*g+M[8]*b; } }
  }
  return imgData;
}

/* ---------------- Compose current look ---------------- */
function currentCSS(){
  const f=S.filter, a=S.adj;
  const ev = 1 + a.ev/250 + S.focusEv*.35;
  const con = 1 + a.con/220;
  const sat = 1 + a.sat/150;
  let s=f.css||"";
  if(Math.abs(ev-1)>.001)  s+=` brightness(${ev.toFixed(3)})`;
  if(Math.abs(con-1)>.001) s+=` contrast(${con.toFixed(3)})`;
  if(Math.abs(sat-1)>.001) s+=` saturate(${sat.toFixed(3)})`;
  return s.trim();
}
const currentTemp = () => (S.filter.temp||0) + S.adj.temp/100;
const currentTint = () => (S.filter.tint||0) + S.adj.tint/100;
const currentVig  = () => Math.min(1,(S.filter.vig||0) + S.adj.vig/100);
const currentGrain= () => Math.min(1,(S.filter.grain||0) + S.adj.grain/100);

function applyLook(){
  cam.style.filter = currentCSS();
  const t=currentTemp(), n=currentTint();
  tempLayer.style.background = t>=0 ? "#FF9A3C" : "#3C8CFF";
  tempLayer.style.opacity = Math.min(1,Math.abs(t))*.75;
  tintLayer.style.background = n>=0 ? "#FF3CE1" : "#3CFF7A";
  tintLayer.style.opacity = Math.min(1,Math.abs(n))*.55;
  vigLayer.style.opacity = currentVig();
  grainLayer.style.opacity = currentGrain()*.5;
  updateReadout();
}

/* ---------------- Camera ---------------- */
async function startCamera(){
  if(S.stream) S.stream.getTracks().forEach(t=>t.stop());
  const stream = await navigator.mediaDevices.getUserMedia({ video:{
      facingMode:S.facing,
      width:{ideal:S.reqW}, height:{ideal:Math.round(S.reqW*9/16)},
      frameRate:{ideal:30},
  }, audio:false });
  S.stream=stream; S.track=stream.getVideoTracks()[0];
  cam.srcObject=stream;
  cam.classList.toggle("mirror", S.facing==="user");
  try{ await cam.play(); }catch(e){}
  S.torchCap=false; S.zoomNative=false; S.zoomRange=null;
  try{
    const caps=S.track.getCapabilities ? S.track.getCapabilities() : {};
    if(caps.torch) S.torchCap=true;
    if(caps.zoom){ S.zoomNative=true; S.zoomRange=caps.zoom; }
  }catch(e){}
  if(S.torch && S.torchCap) setTorch(true);
  applyZoom(); applyLook(); updateReadout();
}

async function setTorch(on){
  S.torch=on;
  if(S.torchCap){ try{ await S.track.applyConstraints({advanced:[{torch:on}]}); }catch(e){ S.torchCap=false; } }
  renderFlashBtn();
}
function renderFlashBtn(){
  $("#flashBtn").classList.toggle("on", S.torchCap ? S.torch : S.screenFlash);
}

function applyZoom(){
  const z=S.adj.zoom/100;
  zoomValEl.textContent=z.toFixed(1)+"×";
  if(S.zoomNative && S.zoomRange){
    const zr=S.zoomRange;
    const nat=Math.min(zr.max, Math.max(zr.min, zr.min + (z-1)*(zr.max-zr.min)/4));
    S.track.applyConstraints({advanced:[{zoom:nat}]}).catch(()=>{});
    vfScale.style.transform="none";
  } else {
    vfScale.style.transform=`scale(${z})`;
  }
}

/* Pinch to zoom */
(function(){
  let startDist=0, startZoom=100;
  const stage=$("#stage");
  stage.addEventListener("touchstart",e=>{
    if(e.touches.length===2){
      startDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      startZoom=S.adj.zoom;
    }
  },{passive:true});
  stage.addEventListener("touchmove",e=>{
    if(e.touches.length===2 && startDist){
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      S.adj.zoom=Math.max(100,Math.min(500, startZoom*(d/startDist)));
      applyZoom(); if(S.activeAdj.id==="zoom") drawDrum();
    }
  },{passive:true});
})();

/* Tap to focus / exposure drag */
(function(){
  const ring=$("#focusRing"), rail=$("#evRail"), sun=rail.querySelector(".sun");
  let hideT, dragging=false, dragStartY=0, dragStartEv=0;
  vfClip.addEventListener("pointerdown",e=>{
    if(e.pointerType==="touch" && e.isPrimary===false) return;
    const r=vfClip.getBoundingClientRect();
    ring.style.left=(e.clientX-r.left-37)+"px"; ring.style.top=(e.clientY-r.top-37)+"px";
    ring.style.opacity=1; rail.style.opacity=1;
    ring.animate([{transform:"scale(1.25)"},{transform:"scale(1)"}],{duration:200,easing:"ease-out"});
    dragging=true; dragStartY=e.clientY; dragStartEv=S.focusEv;
    clearTimeout(hideT);
  });
  window.addEventListener("pointermove",e=>{
    if(!dragging) return;
    S.focusEv=Math.max(-1,Math.min(1,dragStartEv+(dragStartY-e.clientY)/140));
    sun.style.transform=`translateY(${-S.focusEv*34}px)`;
    applyLook();
  });
  window.addEventListener("pointerup",()=>{
    if(!dragging) return; dragging=false;
    hideT=setTimeout(()=>{ ring.style.opacity=0; rail.style.opacity=0; },900);
  });
})();

/* ---------------- HUD readout (DOM-built, no innerHTML) ---------------- */
function updateReadout(){
  const st=S.track && S.track.getSettings ? S.track.getSettings() : {};
  const res=st.width?`${st.width}×${st.height}`:"—";
  const evTotal=S.adj.ev/50+S.focusEv*.7;
  readoutEl.replaceChildren();
  const b=document.createElement("b"); b.textContent=S.filter.name;
  readoutEl.append(b, document.createElement("br"),
    `${res} · ${S.aspect}`, document.createElement("br"),
    `EV ${evTotal>=0?"+":""}${evTotal.toFixed(1)} · Z ${(S.adj.zoom/100).toFixed(1)}×`);
  if(S.timer){ readoutEl.append(document.createElement("br"), `TIMER ${S.timer}s`); }
}

/* ---------------- Filter rail (lazy thumbnails) ---------------- */
const railEl=$("#filterRail");
let thumbEntries=[];
const chipObserver = new IntersectionObserver(list=>{
  for(const e of list){
    const t=thumbEntries.find(t=>t.canvas===e.target);
    if(t) t.visible=e.isIntersecting;
  }
},{root:railEl, threshold:.05});

function buildRail(){
  chipObserver.disconnect();
  railEl.replaceChildren(); thumbEntries=[];
  if(S.filterSet==="manual"){
    railEl.style.display="none"; $("#proPanel").classList.add("on");
    S.railVisible=false; resizeDrum(); drawDrum(); return;
  }
  S.railVisible=true;
  railEl.style.display="flex"; $("#proPanel").classList.remove("on");
  for(const f of FILTERS[S.filterSet]){
    const chip=document.createElement("button"); chip.className="fchip"+(f.id===S.filter.id?" on":"");
    const th=document.createElement("div"); th.className="thumb";
    const c=document.createElement("canvas"); c.width=62; c.height=62;
    th.appendChild(c);
    const nm=document.createElement("div"); nm.className="fname"; nm.textContent=f.name;
    chip.append(th,nm);
    chip.addEventListener("click",()=>{
      S.filter=f; $$(".fchip").forEach(x=>x.classList.remove("on")); chip.classList.add("on");
      applyLook(); tick(); vibrate(8);
    });
    railEl.appendChild(chip);
    thumbEntries.push({ctx:c.getContext("2d"), canvas:c, f, visible:false});
    chipObserver.observe(c);
  }
}
let thumbClock=0;
function paintThumbs(now){
  if(!S.railVisible || now-thumbClock<600 || !cam.videoWidth) return; thumbClock=now;
  const vw=cam.videoWidth, vh=cam.videoHeight, s=Math.min(vw,vh);
  const sx=(vw-s)/2, sy=(vh-s)/2;
  for(const t of thumbEntries){
    if(!t.visible) continue;                       // only on-screen chips
    const {ctx,f}=t;
    if(S.ctxFilterOK) ctx.filter=f.css||"none";
    ctx.drawImage(cam,sx,sy,s,s,0,0,62,62);
    if(S.ctxFilterOK) ctx.filter="none";
    const tp=f.temp||0, tn=f.tint||0;
    if(tp){ ctx.globalCompositeOperation="soft-light"; ctx.globalAlpha=Math.abs(tp)*.75;
      ctx.fillStyle=tp>0?"#FF9A3C":"#3C8CFF"; ctx.fillRect(0,0,62,62); }
    if(tn){ ctx.globalCompositeOperation="soft-light"; ctx.globalAlpha=Math.abs(tn)*.55;
      ctx.fillStyle=tn>0?"#FF3CE1":"#3CFF7A"; ctx.fillRect(0,0,62,62); }
    ctx.globalAlpha=1; ctx.globalCompositeOperation="source-over";
  }
}

/* ---------------- Drum (manual controls) ---------------- */
const drumCanvas=$("#drumCanvas"), drumCtx=drumCanvas.getContext("2d");
const drumValueEl=$("#drumValue");
function buildProTabs(){
  const wrap=$("#proTabs"); wrap.replaceChildren();
  for(const a of ADJUSTS){
    const b=document.createElement("button"); b.className="ptab"+(a.id===S.activeAdj.id?" on":"");
    b.append(a.name);
    const pv=document.createElement("span"); pv.className="pv"; pv.textContent=a.fmt(Math.round(S.adj[a.id]));
    b.appendChild(pv);
    b.addEventListener("click",()=>{ S.activeAdj=a; buildProTabs(); drawDrum(); });
    wrap.appendChild(b);
  }
}
function resizeDrum(){
  const w=$("#drumWrap").clientWidth||window.innerWidth;
  drumCanvas.width=w*devicePixelRatio; drumCanvas.height=64*devicePixelRatio;
  drumCtx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
function drawDrum(){
  const a=S.activeAdj, v=S.adj[a.id];
  const w=drumCanvas.width/devicePixelRatio, h=64, cx=w/2;
  const pxPerUnit = w/(a.max-a.min)*1.6;
  drumCtx.clearRect(0,0,w,h);
  for(let u=a.min; u<=a.max; u+=(a.max-a.min)/40){
    const x=cx+(u-v)*pxPerUnit;
    if(x<-10||x>w+10) continue;
    const major = Math.abs(u % ((a.max-a.min)/8)) < .01;
    drumCtx.strokeStyle= major ? "rgba(236,234,228,.75)" : "rgba(139,143,152,.4)";
    drumCtx.lineWidth=1;
    drumCtx.beginPath(); drumCtx.moveTo(x,major?14:22); drumCtx.lineTo(x,major?44:38); drumCtx.stroke();
  }
  const zx=cx+((a.id==="zoom"?100:0)-v)*pxPerUnit;
  drumCtx.fillStyle="rgba(255,176,0,.5)";
  drumCtx.beginPath(); drumCtx.arc(zx,50,2,0,7); drumCtx.fill();
  drumValueEl.textContent=a.fmt(Math.round(v));
  const tabs=$$(".ptab");
  ADJUSTS.forEach((ad,i)=>{ const pv=tabs[i] && tabs[i].querySelector(".pv"); if(pv) pv.textContent=ad.fmt(Math.round(S.adj[ad.id])); });
}
(function(){
  let dragging=false,lastX=0;
  const el=$("#drum");
  el.addEventListener("pointerdown",e=>{dragging=true;lastX=e.clientX;el.setPointerCapture(e.pointerId);});
  el.addEventListener("pointermove",e=>{
    if(!dragging) return;
    const a=S.activeAdj;
    const w=drumCanvas.width/devicePixelRatio;
    const pxPerUnit=w/(a.max-a.min)*1.6;
    S.adj[a.id]=Math.max(a.min,Math.min(a.max, S.adj[a.id]-(e.clientX-lastX)/pxPerUnit));
    lastX=e.clientX;
    if(a.id==="zoom") applyZoom(); else applyLook();
    drawDrum();
  });
  el.addEventListener("pointerup",()=>dragging=false);
  el.addEventListener("pointercancel",()=>dragging=false);
  $("#drumReset").addEventListener("click",()=>{
    const a=S.activeAdj; S.adj[a.id]=a.def;
    if(a.id==="zoom") applyZoom(); else applyLook();
    drawDrum(); vibrate(6);
  });
})();

/* ---------------- Histogram ---------------- */
const histoCtx=$("#histo").getContext("2d");
const sampleCanvas=document.createElement("canvas"); sampleCanvas.width=80; sampleCanvas.height=60;
const sampleCtx=sampleCanvas.getContext("2d",{willReadFrequently:true});
const histoBins=new Uint32Array(64);
let histoClock=0;
function paintHisto(now){
  if(!S.histo || now-histoClock<250 || !cam.videoWidth) return; histoClock=now;
  sampleCtx.drawImage(cam,0,0,80,60);
  const d=sampleCtx.getImageData(0,0,80,60).data;
  histoBins.fill(0);
  for(let i=0;i<d.length;i+=4){
    const l=(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])|0;
    histoBins[Math.min(63,l>>2)]++;
  }
  let max=1; for(let i=0;i<64;i++) if(histoBins[i]>max) max=histoBins[i];
  histoCtx.clearRect(0,0,100,44);
  histoCtx.fillStyle="rgba(255,176,0,.85)";
  for(let i=0;i<64;i++){
    const h=histoBins[i]/max*42;
    histoCtx.fillRect(i*(100/64),44-h,100/64-.4,h);
  }
}

/* ---------------- Level ---------------- */
function enableLevel(){
  const go=()=>{ window.addEventListener("deviceorientation",onOrient); S.level=true;
    $("#levelLayer").style.opacity=1; $("#levelToggle").classList.add("on"); };
  if(typeof DeviceOrientationEvent!=="undefined" && DeviceOrientationEvent.requestPermission){
    DeviceOrientationEvent.requestPermission().then(r=>{ if(r==="granted") go(); else toast("Motion access denied"); }).catch(()=>toast("Motion access unavailable"));
  } else go();
}
function disableLevel(){
  window.removeEventListener("deviceorientation",onOrient);
  S.level=false; $("#levelLayer").style.opacity=0; $("#levelToggle").classList.remove("on");
}
const levelLine=$("#levelLine");
function onOrient(e){
  const ang = (screen.orientation && Math.abs(screen.orientation.angle)===90) ? (e.beta||0) : (e.gamma||0);
  levelLine.style.transform=`rotate(${-ang}deg)`;
  levelLine.classList.toggle("flat", Math.abs(ang)<1.2);
}

/* ---------------- Aspect ---------------- */
const ASPECTS=["4:3","16:9","1:1","FULL"];
function applyAspect(){
  $("#aspectBtn").dataset.badge=S.aspect==="FULL"?"◻":S.aspect;
  const st=$("#stage").getBoundingClientRect();
  if(S.aspect==="FULL"){ vfClip.style.width="100%"; vfClip.style.height="100%"; updateReadout(); return; }
  const [aw,ah]=S.aspect.split(":").map(Number);
  const targetRatio=aw/ah;
  let w=st.width, h=w*targetRatio;
  if(h>st.height){ h=st.height; w=h/targetRatio; }
  vfClip.style.width=w+"px"; vfClip.style.height=h+"px";
  updateReadout();
}
let resizeT;
window.addEventListener("resize",()=>{
  clearTimeout(resizeT);
  resizeT=setTimeout(()=>{ applyAspect(); resizeDrum(); drawDrum(); },120);
});

/* ---------------- Grain tile (built once, reused) ---------------- */
let grainTile=null;
function getGrainTile(){
  if(grainTile) return grainTile;
  const c=document.createElement("canvas"); c.width=256; c.height=256;
  const x=c.getContext("2d"); const im=x.createImageData(256,256);
  for(let i=0;i<im.data.length;i+=4){ const v=128+(Math.random()*2-1)*110;
    im.data[i]=im.data[i+1]=im.data[i+2]=v; im.data[i+3]=255; }
  x.putImageData(im,0,0); grainTile=c; return c;
}

/* ---------------- Frame renderer (capture + recording) ---------------- */
function renderFrame(ctx, W, H, {forVideo=false}={}){
  const vw=cam.videoWidth, vh=cam.videoHeight;
  const outAR=W/H;
  let sw=vw, sh=vh;
  if(vw/vh>outAR){ sw=vh*outAR; } else { sh=vw/outAR; }
  const z=(S.zoomNative?1:S.adj.zoom/100);
  sw/=z; sh/=z;
  const sx=(vw-sw)/2, sy=(vh-sh)/2;

  ctx.save();
  if(S.facing==="user" && S.mirrorSave){ ctx.translate(W,0); ctx.scale(-1,1); }
  const fstr=currentCSS();
  if(S.ctxFilterOK && fstr) ctx.filter=fstr;
  ctx.drawImage(cam,sx,sy,sw,sh,0,0,W,H);
  ctx.filter="none";
  ctx.restore();

  if(!S.ctxFilterOK && fstr && !forVideo){
    const im=ctx.getImageData(0,0,W,H);
    applyPixelFilters(im,fstr);
    ctx.putImageData(im,0,0);
  }
  const t=currentTemp(), n=currentTint();
  if(Math.abs(t)>.005){ ctx.globalCompositeOperation="soft-light"; ctx.globalAlpha=Math.min(1,Math.abs(t))*.75;
    ctx.fillStyle=t>0?"#FF9A3C":"#3C8CFF"; ctx.fillRect(0,0,W,H); }
  if(Math.abs(n)>.005){ ctx.globalCompositeOperation="soft-light"; ctx.globalAlpha=Math.min(1,Math.abs(n))*.55;
    ctx.fillStyle=n>0?"#FF3CE1":"#3CFF7A"; ctx.fillRect(0,0,W,H); }
  ctx.globalAlpha=1; ctx.globalCompositeOperation="source-over";
  const vg=currentVig();
  if(vg>.005){
    const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.35, W/2,H/2, Math.hypot(W,H)*.62);
    g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,`rgba(0,0,0,${(vg*.85).toFixed(3)})`);
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
  const gr=currentGrain();
  if(gr>.005){
    const tile=getGrainTile();
    ctx.globalCompositeOperation="overlay"; ctx.globalAlpha=gr*.5;
    const ox=forVideo?(Math.random()*256|0):0, oy=forVideo?(Math.random()*256|0):0;
    for(let y=-oy;y<H;y+=256) for(let x=-ox;x<W;x+=256) ctx.drawImage(tile,x,y);
    ctx.globalAlpha=1; ctx.globalCompositeOperation="source-over";
  }
}

function captureDims(){
  const vw=cam.videoWidth, vh=cam.videoHeight;
  let W,H;
  if(S.aspect==="FULL"){
    const r=vfClip.getBoundingClientRect(); const ar=r.width/r.height;
    if(vw/vh>ar){ H=vh; W=Math.round(vh*ar); } else { W=vw; H=Math.round(vw/ar); }
  } else {
    const [aw,ah]=S.aspect.split(":").map(Number);
    const ar=ah/aw;
    if(vw/vh>ar){ H=vh; W=Math.round(vh*ar); } else { W=vw; H=Math.round(vw/ar); }
  }
  return {W,H};
}

/* ---------------- Photo capture ---------------- */
async function capturePhoto(){
  if(!cam.videoWidth){ toast("Camera warming up…"); return; }
  if(S.facing==="user" && S.screenFlash){
    $("#flashLayer").style.opacity=1;
    await new Promise(r=>setTimeout(r,180));
  }
  const {W,H}=captureDims();
  const c=document.createElement("canvas"); c.width=W; c.height=H;
  const ctx=c.getContext("2d",{willReadFrequently:!S.ctxFilterOK});
  renderFrame(ctx,W,H);
  $("#flashLayer").style.opacity=0;
  $("#shutterAnim").animate([{opacity:.9},{opacity:0}],{duration:180,easing:"ease-out"});
  tick(); vibrate(15);
  const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",S.quality));
  if(!blob){ toast("Capture failed — try a smaller size"); return; }
  addToGallery({blob,type:"photo",filter:S.filter.name,w:W,h:H});
  toast(`Captured · ${S.filter.name} · ${W}×${H}`);
}

function shootWithTimer(fn){
  if(!S.timer){ fn(); return; }
  let n=S.timer; const cd=$("#countdown");
  cd.textContent=n; cd.classList.add("on"); tick();
  const iv=setInterval(()=>{
    n--; if(n<=0){ clearInterval(iv); cd.classList.remove("on"); fn(); }
    else { cd.textContent=n; tick(); }
  },1000);
}

/* ---------------- Video recording ---------------- */
function pickMime(){
  const cands=["video/mp4;codecs=avc1","video/mp4","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];
  for(const m of cands){ try{ if(MediaRecorder.isTypeSupported(m)) return m; }catch(e){} }
  return "";
}
async function startRecording(){
  if(typeof MediaRecorder==="undefined"){ toast("Video recording not supported in this browser"); return; }
  try{ if(!S.audioStream) S.audioStream=await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch(e){ toast("Recording without mic (denied)"); }

  let stream, pipeline=null;
  if(S.ctxFilterOK){
    const {W,H}=captureDims();
    const scale=Math.min(1, 1280/Math.max(W,H));
    const cw=Math.round(W*scale/2)*2, ch=Math.round(H*scale/2)*2;
    const rc=document.createElement("canvas"); rc.width=cw; rc.height=ch;
    const rctx=rc.getContext("2d",{desynchronized:true});
    stream=rc.captureStream(30);
    pipeline={raf:0};
    const loop=()=>{ renderFrame(rctx,cw,ch,{forVideo:true}); pipeline.raf=requestAnimationFrame(loop); };
    loop();
  } else {
    stream=new MediaStream(S.stream.getVideoTracks());
    toast("Live filters bake into video on newer browsers; recording clean feed");
  }
  if(S.audioStream) S.audioStream.getAudioTracks().forEach(t=>stream.addTrack(t));

  const mime=pickMime();
  const rec=new MediaRecorder(stream, mime?{mimeType:mime,videoBitsPerSecond:8_000_000}:undefined);
  S.recChunks=[];
  rec.ondataavailable=e=>{ if(e.data.size) S.recChunks.push(e.data); };
  rec.onstop=()=>{
    if(pipeline) cancelAnimationFrame(pipeline.raf);
    const type=rec.mimeType||mime||"video/mp4";
    const blob=new Blob(S.recChunks,{type});
    S.recChunks=[];                                  // release memory
    addToGallery({blob,type:"video",filter:S.filter.name,mime:type});
    toast("Clip saved to session roll");
  };
  rec.start(400);
  S.recorder=rec; S.recPipeline=pipeline; S.recording=true; S.recStart=Date.now();
  document.body.classList.add("recording");
  $("#recPill").classList.add("on");
  const recTimeEl=$("#recTime");
  S.recTimerId=setInterval(()=>{
    const s=Math.floor((Date.now()-S.recStart)/1000);
    recTimeEl.textContent=String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
  },500);
  tick(); vibrate(20);
}
function stopRecording(){
  if(!S.recording) return;
  S.recording=false;
  clearInterval(S.recTimerId);
  document.body.classList.remove("recording");
  $("#recPill").classList.remove("on"); $("#recTime").textContent="00:00";
  try{ S.recorder.stop(); }catch(e){}
  vibrate(20);
}

/* ---------------- Gallery (all DOM-built) ---------------- */
function addToGallery(item){
  item.url=URL.createObjectURL(item.blob);
  item.ts=Date.now();
  S.gallery.unshift(item);
  renderGalleryButton();
}
function renderGalleryButton(){
  const b=$("#galleryBtn");
  const first=S.gallery[0];
  b.replaceChildren();
  if(first && first.type==="photo"){
    const im=new Image(); im.src=first.url; im.alt=""; im.decoding="async";
    b.appendChild(im);
  } else if(first){
    const v=document.createElement("video"); v.src=first.url; v.muted=true; v.playsInline=true; v.preload="metadata";
    b.appendChild(v);
  } else {
    b.append(galleryIcon());
  }
}
function galleryIcon(){
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg"); svg.setAttribute("viewBox","0 0 24 24");
  const r=document.createElementNS(ns,"rect");
  r.setAttribute("x","3");r.setAttribute("y","3");r.setAttribute("width","18");r.setAttribute("height","18");r.setAttribute("rx","3");
  const c=document.createElementNS(ns,"circle");
  c.setAttribute("cx","9");c.setAttribute("cy","9");c.setAttribute("r","2");
  const p=document.createElementNS(ns,"path"); p.setAttribute("d","M21 15l-5-5L5 21");
  svg.append(r,c,p); return svg;
}
function ext(item){
  if(item.type==="photo") return "jpg";
  return (item.mime||"").includes("mp4")?"mp4":"webm";
}
function fname(item){
  const d=new Date(item.ts), p=n=>String(n).padStart(2,"0");
  return `LEADER_${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext(item)}`;
}
function openGallery(){
  const grid=$("#gGrid"); grid.replaceChildren();
  if(!S.gallery.length){
    const empty=document.createElement("div"); empty.id="gEmpty";
    empty.append("EMPTY ROLL",document.createElement("br"),
      "Shots you take live here for this session.",document.createElement("br"),
      "Save or share to keep them.");
    grid.appendChild(empty);
  }
  S.gallery.forEach((g,i)=>{
    const cell=document.createElement("button"); cell.className="gcell";
    if(g.type==="photo"){
      const im=new Image(); im.src=g.url; im.alt=""; im.loading="lazy"; im.decoding="async";
      cell.appendChild(im);
    } else {
      const v=document.createElement("video"); v.src=g.url; v.muted=true; v.playsInline=true; v.preload="metadata";
      const tag=document.createElement("span"); tag.className="vtag"; tag.textContent="VID";
      cell.append(v,tag);
    }
    cell.addEventListener("click",()=>openViewer(i));
    grid.appendChild(cell);
  });
  $("#galleryModal").classList.add("on");
}
function openViewer(i){
  S.viewIndex=i; const g=S.gallery[i]; const st=$("#vStage"); st.replaceChildren();
  if(g.type==="photo"){ const im=new Image(); im.src=g.url; im.alt="Captured photo"; st.appendChild(im); }
  else { const v=document.createElement("video"); v.src=g.url; v.controls=true; v.playsInline=true; v.autoplay=true; st.appendChild(v); }
  const d=new Date(g.ts), meta=$("#vMeta");
  meta.replaceChildren();
  meta.append(g.filter||"", document.createElement("br"), d.toLocaleTimeString());
  if(g.w) meta.append(document.createElement("br"), `${g.w}×${g.h}`);
  $("#viewer").classList.add("on");
}
function saveItem(g){
  const a=document.createElement("a"); a.href=g.url; a.download=fname(g);
  document.body.appendChild(a); a.click(); a.remove();
  toast("Saving… check Downloads / Files");
}
async function shareItem(g){
  const file=new File([g.blob], fname(g), {type:g.blob.type});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file]}); }catch(e){}
  } else saveItem(g);
}

/* ---------------- Wiring ---------------- */
$("#startBtn").addEventListener("click", async ()=>{
  try{
    await startCamera();
    $("#gate").style.display="none";
    $("#app").hidden=false;
    applyAspect(); buildRail(); buildProTabs(); resizeDrum(); drawDrum();
    S.running=true;
    requestAnimationFrame(mainLoop);
  }catch(err){
    const e=$("#gateErr"); e.style.display="block";
    e.textContent = location.protocol!=="https:" && location.hostname!=="localhost"
      ? "Camera requires HTTPS. Deploy to Netlify (or open via https) and try again."
      : "Camera access failed: "+(err.name||err.message)+". Check Settings → Safari → Camera.";
  }
});

$("#flipBtn").addEventListener("click", async ()=>{
  $("#flipBtn").classList.toggle("spin");
  S.facing = S.facing==="environment" ? "user" : "environment";
  try{ await startCamera(); }catch(e){ toast("Couldn't switch camera"); S.facing=S.facing==="environment"?"user":"environment"; }
});

$("#flashBtn").addEventListener("click",()=>{
  if(S.facing==="environment" && S.torchCap){ setTorch(!S.torch); toast(S.torch?"Torch on":"Torch off"); }
  else { S.screenFlash=!S.screenFlash; renderFlashBtn();
    toast(S.screenFlash ? (S.facing==="user"?"Screen flash on":"Flash on (screen flash for front camera)") : "Flash off"); }
});

$("#timerBtn").addEventListener("click",()=>{
  S.timer = S.timer===0?3 : S.timer===3?10 : 0;
  const b=$("#timerBtn");
  b.classList.toggle("on",S.timer>0);
  if(S.timer) b.dataset.badge=S.timer+"s"; else delete b.dataset.badge;
  updateReadout();
});

const ASPECT_BTN=$("#aspectBtn");
ASPECT_BTN.addEventListener("click",()=>{
  S.aspect=ASPECTS[(ASPECTS.indexOf(S.aspect)+1)%ASPECTS.length];
  applyAspect(); toast("Frame "+S.aspect);
});

$("#gridBtn").addEventListener("click",()=>{
  S.grid=!S.grid; $("#gridBtn").classList.toggle("on",S.grid);
  $("#gridLayer").style.opacity=S.grid?1:0;
});

$("#histoBtn").addEventListener("click",()=>{
  S.histo=!S.histo; $("#histoBtn").classList.toggle("on",S.histo);
  $("#histoBox").classList.toggle("on",S.histo);
});

$("#settingsBtn").addEventListener("click",()=>$("#settingsSheet").classList.add("on"));
$("#settingsClose").addEventListener("click",()=>$("#settingsSheet").classList.remove("on"));
$("#settingsSheet").addEventListener("click",e=>{ if(e.target.id==="settingsSheet") e.target.classList.remove("on"); });

$("#mirrorToggle").addEventListener("click",e=>{ S.mirrorSave=!S.mirrorSave; e.currentTarget.classList.toggle("on",S.mirrorSave); });
$("#levelToggle").addEventListener("click",()=>{ S.level?disableLevel():enableLevel(); });
$("#soundToggle").addEventListener("click",e=>{ S.sound=!S.sound; e.currentTarget.classList.toggle("on",S.sound); });
$("#qualitySeg").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b)return;
  S.quality=parseFloat(b.dataset.q); $$("#qualitySeg button").forEach(x=>x.classList.toggle("on",x===b)); });
$("#resSeg").addEventListener("click",async e=>{ const b=e.target.closest("button"); if(!b)return;
  S.reqW=parseInt(b.dataset.r,10); $$("#resSeg button").forEach(x=>x.classList.toggle("on",x===b));
  try{ await startCamera(); }catch(err){} });

$$(".ftab").forEach(t=>t.addEventListener("click",()=>{
  $$(".ftab").forEach(x=>x.classList.remove("on")); t.classList.add("on");
  S.filterSet=t.dataset.set;
  if(S.filterSet!=="manual"){
    if(!FILTERS[S.filterSet].some(f=>f.id===S.filter.id)) S.filter=FILTERS[S.filterSet][0];
  }
  buildRail(); applyLook();
}));

$$(".mbtn").forEach(b=>b.addEventListener("click",()=>{
  if(S.recording){ toast("Stop recording first"); return; }
  $$(".mbtn").forEach(x=>x.classList.remove("on")); b.classList.add("on");
  S.mode=b.dataset.mode;
  document.body.classList.toggle("mode-video",S.mode==="video");
}));

$("#shutter").addEventListener("click",()=>{
  if(S.mode==="photo"){ shootWithTimer(capturePhoto); }
  else { S.recording ? stopRecording() : shootWithTimer(startRecording); }
});

$("#galleryBtn").addEventListener("click",openGallery);
$("#gClose").addEventListener("click",()=>$("#galleryModal").classList.remove("on"));
$("#gSaveAll").addEventListener("click",()=>{
  if(!S.gallery.length){ toast("Roll is empty"); return; }
  S.gallery.forEach((g,i)=>setTimeout(()=>saveItem(g), i*350));
});
$("#vClose").addEventListener("click",()=>{ $("#viewer").classList.remove("on"); openGallery(); });
$("#vSave").addEventListener("click",()=>saveItem(S.gallery[S.viewIndex]));
$("#vShare").addEventListener("click",()=>shareItem(S.gallery[S.viewIndex]));
$("#vDelete").addEventListener("click",()=>{
  const g=S.gallery[S.viewIndex]; if(!g) return;
  URL.revokeObjectURL(g.url);
  S.gallery.splice(S.viewIndex,1);
  $("#viewer").classList.remove("on"); renderGalleryButton(); openGallery();
});

/* Spacebar shutter on desktop */
window.addEventListener("keydown",e=>{
  if(e.code!=="Space") return;
  if($("#app").hidden || $("#galleryModal").classList.contains("on") || $("#viewer").classList.contains("on")) return;
  e.preventDefault(); $("#shutter").click();
});

/* Pause work in background; recover camera on return */
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){ S.running=false; return; }
  if(S.stream){
    S.running=true; requestAnimationFrame(mainLoop);
    if(S.track && S.track.readyState==="ended") startCamera().catch(()=>{});
  }
});

/* Grain shimmer for live preview (skipped when grain is zero) */
setInterval(()=>{
  if(S.running && currentGrain()>0)
    grainLayer.style.backgroundPosition=`${Math.random()*140|0}px ${Math.random()*140|0}px`;
},120);

/* ---------------- Main loop (fully gated) ---------------- */
function mainLoop(now){
  if(!S.running) return;                 // stops in background / before start
  paintThumbs(now);
  paintHisto(now);
  requestAnimationFrame(mainLoop);
}

/* About line */
$("#aboutLine").textContent=`Leader · ${S.ctxFilterOK?"GPU filter pipeline":"compat pixel pipeline"} · v1.1`;

/* Service worker (HTTPS only) */
if("serviceWorker" in navigator && location.protocol==="https:"){
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}
