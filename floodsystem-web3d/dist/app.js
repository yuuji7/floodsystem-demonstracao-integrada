import { DEFAULTS, createState, advance, readings, simulationAlert, leftSafetyLevel, RISK_BANDS, SAMPLE_SECONDS, tipVolumeForDiameter } from './physics.mjs';
import { openRegion, closeRegion, regionalFrame } from './region.js';
const $=id=>document.getElementById(id);
const p={...DEFAULTS};
const demo = {settings:{...DEFAULTS, rain:90}, paused:true};
demo.state = createState(demo.settings);
let state=createState(p),paused=false,model=null,previous=performance.now(),uiAt=0,lastTips=0,pulseUntil=0;
let audience = 'client';
let presenting = false;
let clientScreen = 'region';
let screen = 'region', page = 0, lastRenderedSample = null, modelRequested = false;
const pageSize = 8;
const screens = {overview:'#simular-chuva', region:'#chuva-e-rios', history:'#historico'};
const audienceButtons = document.querySelectorAll('[data-audience-target]');
const clientSections = document.querySelectorAll('[data-client-only]');
const adminSections = document.querySelectorAll('[data-admin-only]');
const earlyLabels = {
  unknown:'Aguardando tendência', normal:'Sem sinal de alerta',
  observe:'Chuva pede atenção', watch:'Subida rápida da água',
  warning:'Chuva intensa e subida rápida'
};
const demoMessages = {
  unknown:['Aguardando a leitura', 'Acompanhe a chuva e o nível da água no modelo.'],
  normal:['Sem sinais de alerta', 'O painel acompanha a chuva e a subida da água.'],
  observe:['Chuva pede atenção', 'O aviso apareceu pela intensidade da chuva. Continue observando a água.'],
  watch:['Água subindo rápido', 'O aviso apareceu pela velocidade de subida.'],
  warning:['Chuva intensa e subida rápida', 'O aviso apareceu porque chove forte e o nível da água sobe rapidamente.']
};
const textIfChanged = (id, value) => {
  const element = $(id);
  if (element.textContent !== value) element.textContent = value;
};
const fmt=(n,d=1)=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
function time(t){const seconds=Math.floor(t),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return (h?`${String(h).padStart(2,'0')}:`:'')+`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
const units=(n,unit,d=1)=>`${fmt(n,d)} <small>${unit}</small>`;
function setFill(input){input.style.setProperty('--fill',`${100*(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))}%`);}
function reset() {
  const initialLevel = $('initial-level');
  if (Number.isFinite(initialLevel.valueAsNumber)) {
    p.initialLevel = Math.max(0, Math.min(leftSafetyLevel, initialLevel.valueAsNumber));
  }
  initialLevel.value = p.initialLevel;
  state = createState(p);
  page = 0;
  lastRenderedSample = null;
  lastTips = 0;
  pulseUntil = 0;
  previous = performance.now();
  renderUI();
}
function recalibrateBucket() {
  p.tipVolume = tipVolumeForDiameter(p.diameter);
  $('tip-volume').value = p.tipVolume.toFixed(2);
  reset();
}
function renderLabAlert(r) {
  const {severity} = simulationAlert(state, p);
  const atOutlet = r.floodStatus === 'alert';
  const label = earlyLabels[severity];
  const title = $('lab-alert-title');
  $('lab-alert').dataset.severity = severity;
  if (title.textContent !== label) title.textContent = label;
  const context = $('lab-alert-context');
  const detail = (state.riseRate === null ? 'Aguardando nível' : `Variação ${fmt(state.riseRate,2)} mm/min`)
    + (atOutlet ? ' · nível na saída lateral' : ' · abaixo da saída lateral');
  if (context.textContent !== detail) context.textContent = detail;
}

function renderHistory(force = false) {
  const samples = state.history;
  const clock = time(state.time);
  $('history-clock').textContent = clock;
  $('history-progress').textContent = `Tempo simulado: ${clock}.`;
  const latest = samples.at(-1)?.time ?? 0;
  if (!force && latest === lastRenderedSample) return;
  lastRenderedSample = latest;
  $('history-empty').hidden = samples.length > 0;
  $('history-records').hidden = !samples.length;
  const offset = page * pageSize;
  const recent = samples.slice().reverse().slice(offset, offset + pageSize);
  const rows = recent.map(sample => {
    const row = document.createElement('tr');
    const band = RISK_BANDS.find(item => item.key === sample.status);
    for (const value of [
      `${time(sample.time - SAMPLE_SECONDS)} – ${time(sample.time)}`,
      fmt(sample.level), fmt(sample.rain, 2), fmt(sample.measured, 2), fmt(sample.tips, 0)
    ]) {
      const cell = row.insertCell();
      cell.textContent = value;
    }
    const chip = document.createElement('span');
    chip.className = 'risk-chip';
    chip.dataset.severity = band.key;
    chip.textContent = band.label;
    row.insertCell().append(chip);
    row.insertCell().textContent = earlyLabels[sample.early];
    for (const value of [fmt(sample.basinLevel), `${fmt(sample.spill)} / ${fmt(sample.basinSpill)}`]) {
      const cell = row.insertCell();
      cell.textContent = value;
      cell.hidden = audience !== 'admin';
    }
    return row;
  });
  $('history-rows').replaceChildren(...rows);
  $('history-count').textContent = `${offset + 1}–${offset + recent.length} de ${samples.length} registros`;
  $('history-newer').disabled = page === 0;
  $('history-older').disabled = offset + pageSize >= samples.length;
}

function selectScreen(next) {
  screen = audience === 'client' && next === 'history' ? 'region' : next;
  if (presenting && screen !== 'overview') exitPresentation();
  $('app').dataset.section = screen;
  if (audience === 'client') clientScreen = screen;
  $('simulation-badge').hidden = screen === 'region';
  for (const panel of document.querySelectorAll('[data-screen]')) panel.hidden = panel.dataset.screen !== screen;
  for (const button of document.querySelectorAll('.screen-nav [data-screen-target]')) {
    button.setAttribute('aria-pressed', String(button.dataset.screenTarget === screen));
  }
  if (location.hash !== screens[screen]) window.history.replaceState(null, '', location.pathname + location.search + screens[screen]);
  const destination = screen === 'region' ? $('regional-model') : $('manual-workspace');
  const prototype = $('prototype-panel');
  if (prototype.parentElement !== destination) destination.prepend(prototype);
  if (screen === 'region') {
    openRegion();
    initializeModel();
  } else closeRegion();
  if (screen === 'history') renderHistory(true);
  if (screen === 'overview') {
    if (audience === 'admin') renderUI();
    else renderClientSimulation();
    initializeModel();
  }
}

for (const button of document.querySelectorAll('[data-screen-target]')) {
  button.addEventListener('click', () => selectScreen(button.dataset.screenTarget));
}
const screenFromHash = () => Object.keys(screens).find(key => screens[key] === location.hash) || 'region';
window.addEventListener('hashchange', () => selectScreen(screenFromHash()));
$('history-older').addEventListener('click', () => { page++; renderHistory(true); });
$('history-newer').addEventListener('click', () => { page--; renderHistory(true); });

function syncModelDisplay() {
  if (!model) return;
  const admin = audience === 'admin';
  model.setTechnicalLabels(admin);
  model.setLabels(!admin || $('labels-toggle').getAttribute('aria-pressed') === 'true');
  model.setCutaway(admin && $('cutaway-toggle').getAttribute('aria-pressed') === 'true');
  model.setDimensions(admin && $('dimensions-toggle').getAttribute('aria-pressed') === 'true');
}

function selectAudience(nextAudience) {
  if (presenting && nextAudience !== 'admin') exitPresentation();
  audience = nextAudience;
  const admin = audience === 'admin';
  $('app').dataset.audience = audience;
  for (const section of clientSections) section.hidden = admin;
  for (const section of adminSections) section.hidden = !admin;
  for (const button of audienceButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.audienceTarget === audience));
  }
  syncModelDisplay();
  selectScreen(admin ? 'overview' : clientScreen);
}

function showPresentation(active) {
  presenting = active;
  document.body.toggleAttribute('data-presentation', active);
  $('presentation-button').setAttribute('aria-pressed', String(active));
  $('presentation-label').textContent = active ? 'Sair da apresentação' : 'Apresentação';
  $('presentation-note').hidden = true;
}

async function exitPresentation() {
  if (document.fullscreenElement === document.documentElement) {
    try {
      await document.exitFullscreen();
    } catch {
      showPresentation(false);
    }
  } else showPresentation(false);
}

$('presentation-button').addEventListener('click', async event => {
  if (audience !== 'admin') return;
  if (presenting) {
    await exitPresentation();
    return;
  }
  const button = event.currentTarget;
  selectScreen('overview');
  showPresentation(true);
  button.disabled = true;
  try {
    if (!document.fullscreenEnabled) throw new Error('Tela cheia indisponível');
    await document.documentElement.requestFullscreen();
  } catch {
    if (presenting) $('presentation-note').hidden = false;
  } finally {
    button.disabled = false;
  }
});
document.addEventListener('fullscreenchange', () => {
  if (presenting && !document.fullscreenElement) showPresentation(false);
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && presenting && !document.fullscreenElement) showPresentation(false);
});

function renderClientSimulation() {
  const started = demo.state.time > 0;
  const ready = !started && demo.paused;
  const {severity} = simulationAlert(demo.state, demo.settings);
  const [title, copy] = ready
    ? ['Simulação pronta', 'Inicie para ver quando o aviso aparece.']
    : demoMessages[severity];
  $('client-alert').dataset.severity = ready ? 'unknown' : severity;
  textIfChanged('client-alert-title', title);
  textIfChanged('client-alert-copy', copy);
  textIfChanged('client-run', !demo.paused ? 'Pausar' : started ? 'Continuar' : 'Iniciar chuva');
  textIfChanged('client-simulation-total', `${fmt(demo.state.rainTotal)} mm`);
  const rate = demo.state.riseRate;
  const trend = rate === null ? 'Aguardando início'
    : demo.state.safetyFlow > 0.01 ? 'Escoando pela saída lateral'
    : rate >= 5 ? 'Subindo rápido'
    : rate > .1 ? 'Subindo' : rate < -.1 ? 'Baixando' : 'Estável';
  textIfChanged('client-water-trend', trend);
  textIfChanged('simulation-status', demo.paused && started ? 'Simulação pausada' : 'Dados simulados');
}

for (const button of document.querySelectorAll('[data-client-rain]')) {
  button.addEventListener('click', () => {
    demo.settings.rain = Number(button.dataset.clientRain);
    for (const option of document.querySelectorAll('[data-client-rain]')) {
      option.setAttribute('aria-pressed', String(option === button));
    }
    renderClientSimulation();
  });
}
$('client-run').addEventListener('click', () => {
  demo.paused = !demo.paused;
  renderClientSimulation();
});
$('client-reset').addEventListener('click', () => {
  demo.state = createState(demo.settings);
  demo.paused = true;
  renderClientSimulation();
});

function renderUI(){
  const r=readings(state,p);
  const direct = p.mode === 'direct';
  $('simulation-status').textContent = paused ? 'Simulação pausada' : 'Dados simulados';
  $('level-headroom').textContent = `${fmt(Math.max(0, leftSafetyLevel - r.level))} mm até a saída de segurança`;
  $('weather-title').textContent = direct ? 'Vazão por funil' : 'Intensidade da chuva';
  $('weather-value').innerHTML = direct ? units(r.input, 'mL/min') : units(p.rain, 'mm/h', 0);
  $('level-value').innerHTML=units(r.level,'mm');$('distance-value').textContent=`Distância até a água: ${fmt(r.distance)} mm`;
  $('tips-value').innerHTML=units(state.tips,'pulsos',0);$('bucket-value').textContent=`${fmt(state.cup,2)} / ${fmt(p.tipVolume,2)} mL na báscula`;
  $('rain-value').innerHTML=units(r.rainMeasured,'mm',2);$('calibration-value').textContent=`${fmt(r.mmPerTip,2)} mm por basculada`;
  $('input-value').innerHTML=units(r.input,'mL/min');$('time-value').textContent=`Tempo simulado: ${time(state.time)}`;
  $('rain-output').innerHTML=units(p.rain,'mm/h',0);$('direct-output').innerHTML=units(p.directFlow,'mL/min',0);
  $('left-valve-output').innerHTML=units(p.leftValve,'%',0);$('right-valve-output').innerHTML=units(p.rightValve,'%',0);
  $('left-flow').textContent=`${fmt(r.leftOutput)} mL/min`;$('right-flow').textContent=`${fmt(r.rightOutput)} mL/min`;
  $('safety-flow').textContent = `${fmt(r.safetyFlow)} mL/min`;
  $('safety-volume').textContent = `${fmt(state.spillLeft)} mL`;
  $('basin-overflow').textContent = `${fmt(state.spillRight)} mL`;
  $('last-pulse').textContent=state.lastTip===null?'Aguardando basculada':`${time(state.lastTip)} · ${r.pulseIntensity===null?'primeira leitura':fmt(r.pulseIntensity,0)+' mm/h'}`;
  $('pause-text').textContent=paused?'Continuar':'Pausar';$('pause-icon').textContent=paused?'▶':'Ⅱ';$('pause-button').setAttribute('aria-label',paused?'Continuar a simulação':'Pausar a simulação');
  renderLabAlert(r);
  for(const el of document.querySelectorAll('.controls input[type=range]'))setFill(el);
  for(const b of document.querySelectorAll('[data-speed]')){b.classList.toggle('active',Number(b.dataset.speed)===p.speed);b.setAttribute('aria-pressed',String(Number(b.dataset.speed)===p.speed));}
  for(const b of document.querySelectorAll('[data-mode]')){b.classList.toggle('active',b.dataset.mode===p.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===p.mode));}
  $('rain-control').hidden=p.mode!=='rain';$('direct-control').hidden=p.mode!=='direct';
}
for (const button of audienceButtons) {
  button.addEventListener('click', () => selectAudience(button.dataset.audienceTarget));
}
$('initial-level').max = leftSafetyLevel;
for(const [id,key]of [['rain','rain'],['direct-flow','directFlow'],['left-valve','leftValve'],['right-valve','rightValve']])$(id).addEventListener('input',e=>{p[key]=Number(e.target.value);renderUI();});
for(const b of document.querySelectorAll('[data-rain]'))b.addEventListener('click',()=>{p.rain=Number(b.dataset.rain);$('rain').value=p.rain;renderUI();});
for(const b of document.querySelectorAll('[data-speed]'))b.addEventListener('click',()=>{p.speed=Number(b.dataset.speed);renderUI();});
for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{p.mode=b.dataset.mode;renderUI();});
for(const [id,key]of [['diameter','diameter'],['tip-volume','tipVolume'],['left-reference','leftReference'],['right-reference','rightReference'],['initial-level','initialLevel']])$(id).addEventListener('change',e=>{
  const input=e.target,n=Number(input.value),min=Number(input.min),max=Number(input.max);
  if(!Number.isFinite(n)||input.value===''){input.value=p[key];return;}
  p[key]=Math.max(min,Math.min(max,n));input.value=p[key];
  if (key === 'diameter') recalibrateBucket();
  else if (key === 'tipVolume') reset();
  else renderUI();
});
$('pause-button').addEventListener('click',()=>{paused=!paused;renderUI();});
$('reset-button').addEventListener('click',reset);
$('article-button').addEventListener('click',()=>{
  p.diameter = Math.sqrt(4 * 104.8 / Math.PI) * 10;
  $('diameter').value = p.diameter.toFixed(3);
  recalibrateBucket();
});
for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => {
    model?.setView(button.dataset.view);
    for (const view of document.querySelectorAll('[data-view]')) {
      view.classList.toggle('active', view === button);
      view.setAttribute('aria-pressed', String(view === button));
    }
  });
}
for (const id of ['labels-toggle', 'cutaway-toggle', 'dimensions-toggle']) {
  const button = $(id);
  button.addEventListener('click', () => {
    const pressed = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(pressed));
    button.classList.toggle('active', pressed);
    syncModelDisplay();
  });
}
$('about-button').addEventListener('click',()=>$('about-dialog').showModal());
$('about-dialog').addEventListener('click',e=>{if(e.target===$('about-dialog')){const b=$('about-dialog').getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)$('about-dialog').close();}});
window.addEventListener('keydown',e=>{if(audience==='admin'&&e.code==='Space'&&e.target===$('scene')){e.preventDefault();paused=!paused;renderUI();}});
selectScreen(screenFromHash());
async function initializeModel() {
  if (modelRequested) return;
  modelRequested = true;
  try {
    const {createModel}=await import('./model.js');
    model=createModel($('scene'),$('viewport'),$('labels'),p);
    $('loading').hidden=true;
    syncModelDisplay();
    const selected = document.querySelector('[data-view][aria-pressed="true"]')?.dataset.view;
    if (selected && selected !== 'perspective') model.setView(selected);
  } catch(error) {
    $('loading').hidden=true;
    $('scene-error').hidden=false;
    $('scene-error').textContent='Não foi possível iniciar o WebGL. Os controles e o cálculo continuam disponíveis.';
    console.error(error);
  }
}
function frame(now){
  const wallDt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now;
  if (screen === 'region') {
    const weather = regionalFrame(wallDt);
    if (weather) model?.update(weather.state, weather.settings, readings(weather.state,weather.settings), now / 1000, weather.paused);
    requestAnimationFrame(frame);
    return;
  }
  if (audience === 'client') {
    if (!demo.paused) advance(demo.state, demo.settings, wallDt * demo.settings.speed);
    if (now - uiAt > 110) {
      renderClientSimulation();
      uiAt = now;
    }
    model?.update(demo.state, demo.settings, readings(demo.state,demo.settings), now / 1000, demo.paused);
    requestAnimationFrame(frame);
    return;
  }
  if(!paused)advance(state,p,wallDt*p.speed);
  const r=readings(state,p);
  if(state.tips!==lastTips){lastTips=state.tips;pulseUntil=now+280;}
  $('pulse-dot').classList.toggle('flash',now<pulseUntil);
  if (now - uiAt > 110) {
    if (screen === 'overview') renderUI();
    if (screen === 'history') renderHistory();
    $('simulation-status').textContent = paused ? 'Simulação pausada' : 'Simulação ativa';
    uiAt = now;
  }
  if (screen === 'overview') model?.update(state,p,r,now/1000,paused);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Read-only inspection point for verifying conservation and browser initialization.
Object.defineProperty(window,'floodLab',{value:Object.freeze({snapshot:()=>({
  settings:{...p},state:{...state,history:state.history.map(sample => ({...sample}))},
  readings:readings(state,p),audience,screen,paused,webgl:!!model,model:model?.getInfo()??null
})})});
