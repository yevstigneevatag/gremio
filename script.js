// script.js

// === Supabase setup ===
const { createClient } = supabase;
const _supabase = createClient(
  'https://sajqgagcsritkjifnicr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhanFnYWdjc3JpdGtqaWZuaWNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwNjA3MTQsImV4cCI6MjA2MDYzNjcxNH0.39Hz8Ql39niAlAvk4rTvMgcF0AfwGTdXM_erUU95NGg'
);
const baseUrl = 'https://sajqgagcsritkjifnicr.supabase.co/storage/v1/object/public/gremio/';

// === Web Audio API for realistic ticks ===
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let tickBuffer = null;
fetch(baseUrl + 'tick.mp3')
  .then(res => res.arrayBuffer())
  .then(buf => audioCtx.decodeAudioData(buf))
  .then(decoded => { tickBuffer = decoded; })
  .catch(err => console.warn('Не вдалося завантажити тик-звук:', err));
function playTick() {
  if (!tickBuffer) return;
  const src = audioCtx.createBufferSource();
  src.buffer = tickBuffer;
  src.connect(audioCtx.destination);
  src.start();
}

// inverse of easeOutExpo: t = -d/10 * log2(1 - p)
function easeOutExpoInverse(p, duration) {
  return -duration/10 * Math.log2(1 - p);
}

// State
let items = [];
let currentDeg = 0;

// === Data fetching ===
async function getSpinStats() {
  const { data, error } = await _supabase.from('spin_stats').select('*');
  if (error) { console.error(error); return {}; }
  return data.reduce((o, i) => (o[i.text] = i.won, o), {});
}

// Прелоадер
function hidePreloader() {
  const pre = document.getElementById('preloader');
  if (pre) pre.style.display = 'none';
}

// Unlock audio on first interaction
document.body.addEventListener('click', () => {
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
}, { once: true });

async function fetchGifts() {
  const stats = await getSpinStats();
  const { data, error } = await _supabase
    .from('gifts').select('*').order('sort_order');
  if (error) { console.error(error); return []; }
  return data.map(g => ({
    id:       g.id,
    text:     g.text,
    fulltext: g.fulltext,
    class:    g.class || '',
    chance:   g.count_static > 0 ? g.chance * (g.count / g.count_static) : 0,
    count:    g.count,
    icon:     g.icon
  }));
}

// === SVG Helpers ===
const SVG_NS   = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI/180;
  return { x: cx + r*Math.cos(rad), y: cy + r*Math.sin(rad) };
}
function describeArc(cx, cy, r, start, end) {
  const p1 = polarToCartesian(cx, cy, r, end);
  const p2 = polarToCartesian(cx, cy, r, start);
  const largeArcFlag = ((end - start)%360)<=180?'0':'1';
  return ['M',p2.x,p2.y,'A',r,r,0,largeArcFlag,0,p1.x,p1.y,'L',cx,cy,'Z'].join(' ');
}

// === Render SVG Wheel ===
function renderSvgWheel(items) {
  const svg = document.getElementById('rouletteSvg');
  if (!svg) return;
  svg.style.overflow = 'visible';
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const size  = 400, cx = size/2, cy = size/2, R = size/2;
  const count = items.length, delta = 360/count;

  // Gradient
  const defs = document.createElementNS(SVG_NS,'defs');
  const grad = document.createElementNS(SVG_NS,'radialGradient');
  grad.id = 'wheelGrad';
  const s1 = document.createElementNS(SVG_NS,'stop');
  s1.setAttribute('offset','0%'); s1.setAttribute('stop-color','#181717');
  const s2 = document.createElementNS(SVG_NS,'stop');
  s2.setAttribute('offset','100%'); s2.setAttribute('stop-color','#000');
  grad.append(s1,s2); defs.append(grad); svg.append(defs);

  const gWheel = document.createElementNS(SVG_NS,'g');
  gWheel.id = 'wheelGroup'; svg.append(gWheel);

  // Background
  const bg = document.createElementNS(SVG_NS,'circle');
  bg.setAttribute('cx',cx); bg.setAttribute('cy',cy);
  bg.setAttribute('r',R); bg.setAttribute('fill','url(#wheelGrad)');
  gWheel.append(bg);

  // Sectors
  const extra=10, outerR=R+extra;
  for(let i=0;i<count;i++){
    const p = document.createElementNS(SVG_NS,'path');
    p.setAttribute('d',describeArc(cx,cy,outerR,i*delta,(i+1)*delta));
    p.setAttribute('fill',i%2? '#202020':'#ff5408');
    gWheel.append(p);
  }

  // Icons
  const iconR = R*0.87, sz=45;
  items.forEach((it,i)=>{
    if(!it.icon) return;
    const ang=(i+0.5)*delta;
    const pos=polarToCartesian(cx,cy,iconR,ang);
    const ig=document.createElementNS(SVG_NS,'g');
    ig.setAttribute('transform',`translate(${pos.x},${pos.y}) rotate(${ang})`);
    const img=document.createElementNS(SVG_NS,'image');
    img.setAttributeNS(XLINK_NS,'href',baseUrl+it.icon);
    img.setAttribute('width',sz); img.setAttribute('height',sz);
    img.setAttribute('x',-sz/2); img.setAttribute('y',-sz/2);
    ig.append(img); gWheel.append(ig);
  });

  // Text
  const txtR = R*0.74, discR = R*0.95, maxC=15, lh=0.9;
  items.forEach((it,i)=>{
    const ang=(i+0.5)*delta;
    const rad = it.class==='discount'?discR:txtR;
    const pos = polarToCartesian(cx,cy,rad,ang);
    const dx=cx-pos.x, dy=cy-pos.y;
    const degAng = Math.atan2(dy,dx)*180/Math.PI;

    const words=it.text.split(' '), lines=[];
    let line='';
    words.forEach(w=>{
      const test=line? line+' '+w : w;
      if(test.length>maxC&&line){ lines.push(line); line=w; }
      else line=test;
    });
    if(line) lines.push(line);

    const totalEm=(lines.length-1)*lh, initEm=-totalEm/2;
    const tg=document.createElementNS(SVG_NS,'g');
    tg.setAttribute('transform',`translate(${pos.x},${pos.y}) rotate(${degAng})`);
    const txtEl=document.createElementNS(SVG_NS,'text');
    txtEl.setAttribute('class',(it.class||'')+' text');
    txtEl.setAttribute('fill','#fff');
    txtEl.setAttribute('font-size','14');
    txtEl.setAttribute('font-weight','bold');
    txtEl.setAttribute('text-anchor','start');
    txtEl.setAttribute('dominant-baseline','middle');

    lines.forEach((ln,j)=>{
      const tsp=document.createElementNS(SVG_NS,'tspan');
      tsp.setAttribute('x','0');
      tsp.setAttribute('dy', j===0? `${initEm}em`:`${lh}em`);
      tsp.textContent=ln;
      txtEl.append(tsp);
    });

    tg.append(txtEl);
    gWheel.append(tg);
  });
}

// === Logging spin ===
async function logSpin(id,text){
	//throw new Error('Simulated logging failure');
  const ipRes = await fetch(
    'https://sajqgagcsritkjifnicr.supabase.co/functions/v1/get-ip'
  ).then(r => r.json()).catch(() => ({ ip: 'unknown' }));

let ipToLog = ipRes.ip;

  const { data, error } = await _supabase
    .from('locations_ip')
    .select('address')
    .eq('ip', ipRes.ip)
    .single();

  if (data && data.address) {
    ipToLog = data.address;
  }


  await _supabase.from('log').insert([
    { id_gift: id, text: text, ip_user: ipToLog }
  ]);
}

// === Spin handler ===
async function spin(){
  const btn=document.querySelector('.roulette .button');
  const wheelEl=document.querySelector('.roulette');
  if(btn.disabled) return;

  wheelEl.classList.add('busy');
  btn.disabled=true;

  items = await fetchGifts();
  renderSvgWheel(items);

  if(items.every(it=>it.count===0)){
    document.getElementById('no-prizes').classList.remove('hidden');
    wheelEl.classList.remove('busy');
    btn.disabled=false;
    return;
  }

  // choose winner
  const total=items.reduce((s,it)=>it.count>0?s+it.chance:s,0);
  let r=Math.random()*total, winner=0;
  for(let i=0;i<items.length;i++){
    if(items[i].count>0){
      r-=items[i].chance;
      if(r<=0){winner=i;break;}
    }
  }

  // compute rotation
  const delta=360/items.length;
  const centerAng=(winner+0.5)*delta;
  const norm=((currentDeg%360)+360)%360;
  const arrowAng=270;
  let desired=arrowAng-(norm+centerAng);
  desired=((desired%360)+360)%360;
  const target=currentDeg+6*360+desired;

  // parallel log
    const logPromise = logSpin(items[winner].id, items[winner].text)
    .catch(err => {
      console.error('Ошибка при записи лога:', err);
	  document.getElementById('err').classList.remove('hidden');
    });

  // schedule dynamic ticks with min interval
  const totalAngle=target-currentDeg;
  const totalTicks=Math.round(totalAngle/delta);
  const duration=6000;
  const MIN_MS = 50;
  let times = [];
  for(let k=1;k<=totalTicks;k++){
    const p = k/totalTicks;
    times.push(easeOutExpoInverse(p,duration));
  }
  // filter out too-close times
  let filtered = [];
  times.forEach(t => {
    if(!filtered.length || t - filtered[filtered.length-1] >= MIN_MS) {
      filtered.push(t);
    }
  });
  let tickTimers = filtered.map(t => setTimeout(playTick, t));

  // animate
  const wheelGroup=document.getElementById('wheelGroup');
  wheelGroup.getAnimations().forEach(a=>a.cancel());
  const anim=wheelGroup.animate([
    {transform:`rotate(${currentDeg}deg)`},
    {transform:`rotate(${target}deg)`}
  ],{duration,easing:'cubic-bezier(0.33,1,0.68,1)',fill:'forwards'});

  anim.onfinish=()=>{
    tickTimers.forEach(id=>clearTimeout(id));
    playTick();
    currentDeg=target%360;

    const prize=items[winner];
    document.getElementById('popup-result').innerHTML=`
      <div class="congr">Вітаємо!</div>
      <div class="congr2">Ви виграли:</div>
      <div class="congr2d ${prize.class||''}">${prize.fulltext}</div>
      <div class="congr3 ${prize.class||''}">${prize.text}</div>
      ${prize.icon?`<img src="${baseUrl+prize.icon}" class="popup-icon">`:''}
    `;
    document.getElementById('popup').classList.remove('hidden');
    wheelEl.classList.remove('busy');
    btn.disabled=false;
  };
}

// scaling
function scaleRouletteToWrapper(){
  const baseSize=400;
  const wrapper=document.querySelector('.roulette-wrapper');
  const roulette=document.querySelector('.roulette');
  const scale=Math.min(wrapper.offsetWidth,wrapper.offsetHeight)/baseSize;
  roulette.style.transform=`scale(${scale})`;
}

// events
document.querySelector('.roulette .button').addEventListener('click',spin);
document.getElementById('popup-close').addEventListener('click',()=>{
  document.getElementById('popup').classList.add('hidden');
});

window.addEventListener('resize', scaleRouletteToWrapper);

// initial render
window.addEventListener('load',async ()=>{
  items=await fetchGifts();
  renderSvgWheel(items);
  scaleRouletteToWrapper();
  hidePreloader();
});