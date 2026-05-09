const $  = id => document.getElementById(id);
const startBtn  = $('startBtn'), pauseBtn = $('pauseBtn');
const resumeBtn = $('resumeBtn'), stopBtn = $('stopBtn'), ssBtn = $('ssBtn');
const statusEl  = $('status'), timerEl = $('timer');
const dot       = $('dot'), mwrap = $('mwrap'), mbar = $('mbar');
const cdEl      = $('cd'), instrEl = $('instr');
const view      = $('view'), mainV = $('mainV');
const canvas    = $('canvas'), ctx = canvas.getContext('2d');
const pm        = $('pm'), pvid = $('pvid');
const dlBtn     = $('dlBtn'), discBtn = $('discBtn');
const dbar      = $('dbar');

let recorder = null, chunks = [], savedBlob = null;
let screenStream = null, camStream = null, audioCtx = null;
let drawVid = null, vfcId = null;
let timerIntvl = null, elapsedSec = 0;
let meterRaf = null, analyser = null;
let drawMode = null, drawColor = '#ff6584', isDrawing = false, px = 0, py = 0;

// ── Mode UI ───────────────────────────────────────────────────────────
const INSTRS = {
  screen: `<b>How to use — Screen only:</b><br>
    1. Click <b>▶ Start</b> → Chrome share picker opens<br>
    2. Choose <b>"Chrome Tab"</b> → pick the tab you want to record<br>
    3. Allow mic → countdown → recording starts<br>
    4. Switch to that tab and work — this window keeps recording<br>
    5. Come back here → <b>⏹ Stop</b> → preview → download`,
  both: `<b>How to use — Screen + Camera:</b><br>
    1. Click <b>▶ Start</b> → share picker opens<br>
    2. Choose <b>"Chrome Tab"</b> → pick <b>a different tab</b><br>
    <span class="w">⚠ Don't pick this recorder window — mirror loop!</span><br>
    3. Allow camera & mic → countdown → recording starts<br>
    4. Switch to your tab and work<br>
    5. Return here → <b>⏹ Stop</b> → one combined video downloads`
};

function getMode(){ return document.querySelector('input[name="mode"]:checked').value }
function setStatus(s){ statusEl.textContent = s }

document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    const m = card.querySelector('input').value;
    instrEl.innerHTML = INSTRS[m] || '';
    instrEl.style.display = INSTRS[m] ? 'block' : 'none';
    $('opos').style.display = m === 'both' ? 'block' : 'none';
    $('oshp').style.display = m === 'both' ? 'block' : 'none';
    $('osz').style.display  = m === 'both' ? 'block' : 'none';
  });
});
instrEl.innerHTML = INSTRS.screen;
instrEl.style.display = 'block';

// ── Timer ─────────────────────────────────────────────────────────────
function fmt(s){ return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0') }
function startTimer(){
  elapsedSec = 0; timerEl.textContent = '00:00';
  timerEl.style.display = 'block'; dot.style.display = 'block';
  timerIntvl = setInterval(()=>{ elapsedSec++; timerEl.textContent = fmt(elapsedSec); }, 1000);
}
function stopTimer(){
  clearInterval(timerIntvl); timerIntvl = null;
  timerEl.style.display = 'none'; dot.style.display = 'none';
}

// ── Countdown ─────────────────────────────────────────────────────────
function countdown(n){
  return new Promise(res => {
    cdEl.style.display = 'flex'; cdEl.textContent = n;
    const t = setInterval(()=>{
      n--;
      if(n <= 0){ clearInterval(t); cdEl.style.display = 'none'; res(); }
      else cdEl.textContent = n;
    }, 1000);
  });
}

// ── Audio ─────────────────────────────────────────────────────────────
function mixAudio(...streams){
  audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  analyser  = audioCtx.createAnalyser(); analyser.fftSize = 256;
  streams.forEach(s => {
    if(s?.getAudioTracks().length){
      const src = audioCtx.createMediaStreamSource(s);
      src.connect(dest);
      src.connect(analyser); // meter only — NOT connected to speakers
    }
  });
  return dest.stream.getAudioTracks()[0] || null;
}
function startMeter(){
  const data = new Uint8Array(analyser.frequencyBinCount);
  mwrap.style.display = 'flex';
  const tick = () => {
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a,b)=>a+b,0)/data.length;
    mbar.style.width = Math.min(100, avg*2) + '%';
    meterRaf = requestAnimationFrame(tick);
  };
  meterRaf = requestAnimationFrame(tick);
}
function stopMeter(){
  if(meterRaf) cancelAnimationFrame(meterRaf);
  meterRaf = null; mwrap.style.display = 'none'; mbar.style.width = '0%';
}

// ── Video helpers ─────────────────────────────────────────────────────
function waitForVideo(v){
  return new Promise(res => {
    const c = () => (v.videoWidth > 0 && v.videoHeight > 0) ? res() : setTimeout(c, 50);
    c();
  });
}
async function makeVid(stream){
  const v = document.createElement('video');
  v.srcObject = stream; v.muted = true; v.playsInline = true;
  await v.play(); await waitForVideo(v); return v;
}

// ── Canvas draw (requestVideoFrameCallback — background-tab safe) ──────
function camRect(cw, ch){
  const pct = parseInt($('csz').value) / 100;
  const w   = Math.round(canvas.width * pct);
  const h   = Math.round(w * (ch / cw));
  const pos = $('pos').value, pad = 14;
  const x   = pos.includes('r') ? canvas.width  - w - pad : pad;
  const y   = pos.includes('b') ? canvas.height - h - pad : pad;
  return {x, y, w, h};
}
function drawCam(camVid){
  const {x,y,w,h} = camRect(camVid.videoWidth, camVid.videoHeight);
  const shape = $('shp').value;
  ctx.save();
  ctx.beginPath();
  if(shape === 'round'){ const r=Math.min(w,h)/2; ctx.arc(x+w/2,y+h/2,r,0,Math.PI*2); }
  else ctx.roundRect(x,y,w,h,8);
  ctx.clip();
  ctx.drawImage(camVid, x, y, w, h);
  ctx.restore();
  ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=3;
  ctx.beginPath();
  if(shape==='round'){ const r=Math.min(w,h)/2; ctx.arc(x+w/2,y+h/2,r,0,Math.PI*2); }
  else ctx.roundRect(x,y,w,h,8);
  ctx.stroke();
}
function startDraw(sv, cv){
  drawVid = sv;
  const frame = () => {
    ctx.drawImage(sv, 0, 0, canvas.width, canvas.height);
    drawCam(cv);
    vfcId = sv.requestVideoFrameCallback(frame);
  };
  ctx.drawImage(sv, 0, 0, canvas.width, canvas.height);
  vfcId = sv.requestVideoFrameCallback(frame);
}

// ── Screenshot ────────────────────────────────────────────────────────
function screenshot(){
  const c2 = document.createElement('canvas');
  if(canvas.style.display !== 'none'){
    c2.width=canvas.width; c2.height=canvas.height;
    c2.getContext('2d').drawImage(canvas,0,0);
  } else {
    c2.width=mainV.videoWidth; c2.height=mainV.videoHeight;
    c2.getContext('2d').drawImage(mainV,0,0);
  }
  c2.toBlob(blob=>{
    const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'screenshot-'+Date.now()+'.png'});
    a.click(); URL.revokeObjectURL(a.href);
  },'image/png');
}

// ── Drawing / annotation ──────────────────────────────────────────────
canvas.addEventListener('mousedown', e=>{
  if(!drawMode) return; isDrawing=true;
  const r=canvas.getBoundingClientRect(), sx=canvas.width/r.width, sy=canvas.height/r.height;
  px=(e.clientX-r.left)*sx; py=(e.clientY-r.top)*sy;
  if(drawMode==='laser'){
    ctx.save(); ctx.fillStyle=drawColor;
    ctx.beginPath(); ctx.arc(px,py,10,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
});
canvas.addEventListener('mousemove', e=>{
  if(!isDrawing||drawMode!=='pen') return;
  const r=canvas.getBoundingClientRect(), sx=canvas.width/r.width, sy=canvas.height/r.height;
  const nx=(e.clientX-r.left)*sx, ny=(e.clientY-r.top)*sy;
  ctx.save(); ctx.strokeStyle=drawColor; ctx.lineWidth=4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(nx,ny); ctx.stroke(); ctx.restore();
  px=nx; py=ny;
});
canvas.addEventListener('mouseup',   ()=>isDrawing=false);
canvas.addEventListener('mouseleave',()=>isDrawing=false);
$('laserBtn').addEventListener('click',()=>{
  drawMode=drawMode==='laser'?null:'laser';
  $('laserBtn').classList.toggle('on',drawMode==='laser');
  $('penBtn').classList.remove('on');
});
$('penBtn').addEventListener('click',()=>{
  drawMode=drawMode==='pen'?null:'pen';
  $('penBtn').classList.toggle('on',drawMode==='pen');
  $('laserBtn').classList.remove('on');
});
$('cpick').addEventListener('click',()=>$('ci').click());
$('ci').addEventListener('input',e=>{ drawColor=e.target.value; $('cpick').style.background=drawColor; });

// ── Main flow ─────────────────────────────────────────────────────────
async function start(){
  chunks=[]; savedBlob=null;
  screenStream=camStream=audioCtx=null; drawVid=null; vfcId=null;

  try{
    let vt, at;
    const m = getMode(), bitrate = parseInt($('q').value);

    if(m === 'screen'){
      setStatus('Waiting for screen share…');
      screenStream = await navigator.mediaDevices.getDisplayMedia({video:true, audio:false});
      let mic=null;
      try{ mic=await navigator.mediaDevices.getUserMedia({audio:true,video:false}); }catch(_){}
      vt = screenStream.getVideoTracks()[0];
      at = mic ? mixAudio(mic) : null;
      mainV.srcObject=screenStream; mainV.style.display='block';
      canvas.style.display='none'; view.style.display='block';
      dbar.style.display='none';

    } else if(m === 'camera'){
      setStatus('Waiting for camera…');
      camStream = await navigator.mediaDevices.getUserMedia({video:true,audio:true});
      vt = camStream.getVideoTracks()[0];
      at = mixAudio(camStream);
      mainV.srcObject=camStream; mainV.style.display='block';
      canvas.style.display='none'; view.style.display='block';
      dbar.style.display='none';

    } else {
      setStatus('Pick a Chrome Tab to record…');
      screenStream = await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      setStatus('Allow camera & mic…');
      camStream = await navigator.mediaDevices.getUserMedia({video:true,audio:true});
      setStatus('Building composite…');

      const [sv,cv] = await Promise.all([makeVid(screenStream),makeVid(camStream)]);
      canvas.width=sv.videoWidth; canvas.height=sv.videoHeight;
      startDraw(sv,cv);
      await new Promise(r=>setTimeout(r,300));

      canvas.style.display='block'; mainV.style.display='none';
      view.style.display='block'; dbar.style.display='flex';
      canvas.style.cursor='crosshair';

      vt = canvas.captureStream(30).getVideoTracks()[0];
      at = mixAudio(camStream);
    }

    const recStream = new MediaStream([vt,at].filter(Boolean));
    await countdown(3);

    recorder = new MediaRecorder(recStream,{mimeType:'video/webm;codecs=vp8,opus',videoBitsPerSecond:bitrate});
    recorder.ondataavailable = e=>{ if(e.data?.size>0) chunks.push(e.data); };
    recorder.onstop = onStop;
    recorder.start(100);

    startTimer(); startMeter();
    setStatus('Recording… switch to your tab freely');
    startBtn.disabled=true; pauseBtn.disabled=false; stopBtn.disabled=false; ssBtn.disabled=false;
    document.querySelectorAll('input[name="mode"]').forEach(r=>r.disabled=true);

  }catch(err){
    setStatus('Error: '+err.message);
    cleanup();
  }
}

function pause(){
  if(recorder?.state==='recording'){
    recorder.pause(); setStatus('Paused');
    clearInterval(timerIntvl);
    pauseBtn.disabled=true; resumeBtn.disabled=false;
    dot.style.animationPlayState='paused';
  }
}
function resume(){
  if(recorder?.state==='paused'){
    recorder.resume(); setStatus('Recording…');
    timerIntvl=setInterval(()=>{ elapsedSec++; timerEl.textContent=fmt(elapsedSec); },1000);
    resumeBtn.disabled=true; pauseBtn.disabled=false;
    dot.style.animationPlayState='running';
  }
}
function stop(){ recorder?.stop(); }

function onStop(){
  stopTimer(); stopMeter();
  savedBlob = new Blob(chunks,{type:'video/webm'});
  pvid.src = URL.createObjectURL(savedBlob);
  pm.style.display='flex';
  cleanup(false);
}

function cleanup(resetUI=true){
  if(vfcId!==null&&drawVid) drawVid.cancelVideoFrameCallback(vfcId);
  vfcId=null; drawVid=null;
  stopTimer(); stopMeter();
  if(audioCtx){ audioCtx.close(); audioCtx=null; }
  [screenStream,camStream].forEach(s=>s?.getTracks().forEach(t=>t.stop()));
  screenStream=camStream=null;
  mainV.srcObject=null;
  if(resetUI){ view.style.display='none'; dbar.style.display='none'; }
  startBtn.disabled=false; pauseBtn.disabled=true; resumeBtn.disabled=true;
  stopBtn.disabled=true; ssBtn.disabled=true;
  document.querySelectorAll('input[name="mode"]').forEach(r=>r.disabled=false);
  setStatus('Ready');
}

dlBtn.addEventListener('click',()=>{
  if(!savedBlob) return;
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(savedBlob),download:'recording-'+Date.now()+'.webm'});
  a.click(); URL.revokeObjectURL(a.href);
  closePreview();
});
discBtn.addEventListener('click',()=>{ savedBlob=null; closePreview(); });
function closePreview(){
  pm.style.display='none'; URL.revokeObjectURL(pvid.src); pvid.src='';
  view.style.display='none'; dbar.style.display='none';
}

startBtn.addEventListener('click', start);
pauseBtn.addEventListener('click', pause);
resumeBtn.addEventListener('click',resume);
stopBtn.addEventListener('click',  stop);
ssBtn.addEventListener('click',    screenshot);

document.addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT') return;
  if(e.code==='Space'&&!startBtn.disabled){ e.preventDefault(); recorder?.state==='paused'?resume():pause(); }
  if(e.code==='Escape'&&!stopBtn.disabled) stop();
  if(e.code==='KeyS'&&!ssBtn.disabled) screenshot();
});
