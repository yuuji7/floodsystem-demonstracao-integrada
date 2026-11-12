import { createModel } from './engine/model.js';
import { DEFAULTS, advance, createState, leftSafetyLevel, readings } from './engine/physics.mjs';
import { connectLabTelemetry, createTelemetryClock } from './lab-telemetry.mjs';
import { setupResidence } from './residence.mjs';

const byId = id => document.getElementById(id);
const deck = byId('deck');
const slides = Array.from(document.querySelectorAll('.slide'));
const jump = byId('jump');
const previous = byId('prev');
const next = byId('next');
const fullscreen = byId('fullscreen');
const run = document.querySelector('[data-run]');
const resets = Array.from(document.querySelectorAll('[data-reset]'));
const query = new URLSearchParams(location.search);
const integrated = location.protocol === 'http:' && location.hostname === '127.0.0.1' &&
  location.pathname === '/apresentacao/' && query.get('modo') !== 'livre';
const settings = { ...DEFAULTS, rain: integrated ? 240 : 90, speed: integrated ? 1 : 60, leftValve: 10, initialLevel: 30 };
const formatters = [0, 1, 2].map(digits => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: digits, maximumFractionDigits: digits
}));
const number = (value, digits = 0) => formatters[digits].format(value);
const clock = seconds => {
  const whole = Math.floor(seconds);
  return [Math.floor(whole / 60), whole % 60].map(n => String(n).padStart(2, '0')).join(':');
};
const write = (el, value) => { if (el.textContent !== value) el.textContent = value; };

let state = createState(settings);
let index = -1;
let model;
let modelAttempted = false;
let running = false;
let frameId = 0;
let lastFrame = null;
let lastReadout = 0;
let telemetry;
let connecting = false;
let timeline;
let features;
let completeLab = false;
let completeDevice;
let dashboardDevice;
let dashboardView = query.get('painel') === 'moradias' ? 'residences' : 'monitor';
let fullPanel = false;
const demo = () => slides[index]?.id === 'demonstracao';
const lab = () => demo() || slides[index]?.id === 'parametros';
const residenceContent = byId('residence-content');
const residence = setupResidence(residenceContent);

for (const [i, slide] of slides.entries()) {
  const title = slide.dataset.title || slide.querySelector('h1')?.textContent;
  slide.dataset.title = title;
  const opt = new Option(`${String(i + 1).padStart(2, '0')} · ${title}`, String(i));
  jump.add(opt);
}

function updateReadouts() {
  const r = readings(state, settings);
  write(byId('demo-level'), number(r.level, 1));
  write(byId('demo-rain'), number(r.rainMeasured, 2));
  write(byId('demo-tips'), number(state.tips));
  write(byId('last-tip'), `Última virada: ${state.lastTip === null ? '—' : clock(state.lastTip)}`);
  write(byId('params-time'), clock(state.time));
  write(byId('run-status'), `Ensaio simulado · ${running ? 'em andamento' : state.time ? 'pausado' : 'pronto'}`);
  byId('signal-dot').classList.toggle('running', running);
  write(run, running ? 'Pausar' : state.time ? 'Continuar' : 'Iniciar chuva');
  if (residence.followingLab) updateResidenceFromLab(r.level);
}

function updateResidenceFromLab(level = readings(state, settings).level) {
  residence.showLabReading(level, settings.rain, state.riseRate > 0);
}

function updateControls() {
  run.disabled = connecting || Boolean(telemetry?.failed);
  for (const button of resets) button.disabled = connecting;
}

function stopRun() {
  running = false;
  timeline?.pause();
  lastFrame = null;
  updateReadouts();
}

function setTelemetryStatus(message, status = 'ready') {
  const element = byId('telemetry-status');
  element.dataset.state = status;
  write(element, message);
  if (status === 'error' && telemetry?.failed) {
    stopRun();
    updateControls();
  }
}

async function connectPanel() {
  if (connecting || telemetry) return;
  const message = byId('dashboard-message');
  connecting = true;
  updateControls();
  setTelemetryStatus('Conectando ao painel…');
  updateDashboardVisibility();
  write(message, 'Preparando o painel local…');
  try {
    await loadFeatures();
    const connection = await connectLabTelemetry(setTelemetryStatus);
    const { device_id, h0_cm, k_mm_per_tip } = connection.profile;
    const sample = readings(state, settings);
    if (!device_id || !Number.isFinite(h0_cm) || !Number.isFinite(k_mm_per_tip) ||
        Math.abs(h0_cm - (sample.distance + sample.level) / 10) > 1e-6 ||
        Math.abs(k_mm_per_tip - sample.mmPerTip) > 1e-6) {
      connection.close();
      throw new Error('Calibração do laboratório incompatível com a API.');
    }
    telemetry = connection;
    timeline = createTelemetryClock(telemetry, advance, readings);
    if (!completeLab || !completeDevice) showDevice(device_id);
    setTelemetryStatus('Painel conectado');
  } catch (error) {
    setTelemetryStatus('Conexão indisponível', 'error');
    write(message, 'Não foi possível abrir o painel. Confira o servidor local e tente iniciar a chuva novamente.');
    console.warn('Conexão com o FloodSystem:', error);
  } finally {
    connecting = false;
    updateControls();
  }
}

async function loadFeatures() {
  if (features !== undefined) return;
  try {
    const response = await fetch('/demonstracao/recursos', { signal: AbortSignal.timeout(3000) });
    features = response.ok ? await response.json() : null;
  } catch { features = null; }
  byId('lab-modes').hidden = !features?.laboratorio_completo;
  byId('experiments-tab').hidden = !features?.ensaios_publicados;
  updateDashboardVisibility();
}

function showDevice(device, view) {
  if (!device) return;
  const panel = byId('dashboard-frame');
  if (device !== dashboardDevice || view) {
    dashboardDevice = device;
    const url = new URL('/painel/', location.origin);
    url.searchParams.set('device', device);
    if (view === 'history') url.searchParams.set('view', 'history');
    byId('dashboard-link').href = url.href;
    if (!fullPanel) url.searchParams.set('apresentacao', '1');
    if (features?.ensaios_publicados) url.searchParams.set('integrado', '1');
    panel.src = url.href;
  }
  updateDashboardVisibility();
}

function updateDashboardVisibility() {
  const monitor = dashboardView === 'monitor';
  const experiments = dashboardView === 'experiments';
  const residences = dashboardView === 'residences';
  byId('dashboard-frame').hidden = !monitor || !dashboardDevice;
  byId('experiments-frame').hidden = !experiments;
  byId('residence-preview').hidden = !residences;
  byId('dashboard-message').hidden = !monitor || Boolean(dashboardDevice);
  byId('dashboard-link').hidden = !monitor || !dashboardDevice;
  byId('panel-layout').hidden = !monitor || !dashboardDevice || !features?.ensaios_publicados;
  byId('monitor-tab').setAttribute('aria-pressed', String(monitor));
  byId('experiments-tab').setAttribute('aria-pressed', String(experiments));
  byId('residences-tab').setAttribute('aria-pressed', String(residences));
  placeResidence();
}

function placeResidence() {
  const embedded = integrated && demo() && dashboardView === 'residences';
  const host = byId(embedded ? 'residence-preview' : 'moradia');
  if (residenceContent.parentElement !== host) host.append(residenceContent);
  byId('residence-back').hidden = embedded;
  const labAvailable = embedded && !completeLab;
  byId('residence-follow-lab').hidden = !labAvailable;
  if (!labAvailable) residence.stopFollowingLab();
}

function selectDashboard(view) {
  dashboardView = view;
  const frame = byId('experiments-frame');
  if (view === 'experiments' && !frame.hasAttribute('src')) frame.src = '/painel/ensaios/';
  updateDashboardVisibility();
}

function syncCompleteLab() {
  byId('complete-lab-frame').contentWindow?.postMessage({
    type: 'floodsystem:active', active: demo() && completeLab && !document.hidden
  }, location.origin);
}

function selectLab(complete) {
  if (complete === completeLab) return;
  completeLab = complete;
  stopRun();
  byId('viewer').hidden = complete;
  byId('demo-details').hidden = complete;
  byId('telemetry-status').hidden = complete;
  const frame = byId('complete-lab-frame');
  frame.hidden = !complete;
  if (complete && !frame.hasAttribute('src')) frame.src = '/laboratorio/';
  byId('quick-lab').setAttribute('aria-pressed', String(!complete));
  byId('complete-lab').setAttribute('aria-pressed', String(complete));
  showDevice(complete ? completeDevice || telemetry?.profile.device_id : telemetry?.profile.device_id);
  placeResidence();
  syncCompleteLab();
}

function render(now) {
  frameId = 0;
  if (!lab() || document.hidden) { lastFrame = null; return; }
  const dt = lastFrame === null ? 0 : Math.min(.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (running) {
    if (integrated) timeline?.tick(state, settings, now);
    else if (dt > 0) advance(state, settings, dt * settings.speed);
  }
  if (now - lastReadout > 100) { updateReadouts(); lastReadout = now; }
  if (model && demo() && !completeLab) {
    const r = readings(state, settings);
    if (!running && state.time === 0) r.input = 0;
    model.update(state, settings, r, now / 1000, !running);
  }
  requestFrame();
}

function requestFrame() {
  if (!frameId && lab() && !document.hidden) frameId = requestAnimationFrame(render);
}

function ensureModel() {
  if (modelAttempted) return;
  modelAttempted = true;
  const canvas = byId('model');
  try {
    canvas.hidden = false;
    model = createModel(canvas, byId('viewer'), byId('model-labels'), settings);
    model.setLabels(false);
    model.setTechnicalLabels(true);
    byId('model-labels').hidden = false;
    byId('model-message').hidden = true;
    byId('camera-tools').hidden = false;
  } catch (error) {
    canvas.hidden = true;
    write(byId('model-message'), 'O 3D não abriu neste navegador. As leituras do ensaio continuam disponíveis.');
    console.warn('Visualização WebGL indisponível.', error);
  }
}

function show(i, syncHash = true) {
  if (!Number.isInteger(i) || i < 0 || i >= slides.length || i === index) return;
  if (index !== -1) slides[index].hidden = true;
  index = i;
  const slide = slides[i];
  slide.hidden = false;
  deck.classList.toggle('demo-split', integrated && demo());
  if (integrated) updateDashboardVisibility();
  if (syncHash && location.hash !== `#${slide.id}`) location.hash = slide.id;
  jump.value = String(i);
  previous.disabled = i === 0;
  next.disabled = i === slides.length - 1;
  write(byId('slide-announcement'), `Slide ${i + 1} de ${slides.length}: ${slide.dataset.title}`);
  lastFrame = null;
  if (!lab()) stopRun();
  if (demo()) {
    ensureModel();
    if (integrated) void connectPanel();
  }
  if (integrated) syncCompleteLab();
  updateReadouts();
  requestFrame();
}

function openFromHash() {
  const target = slides.findIndex(slide => `#${slide.id}` === location.hash);
  show(Math.max(0, target), false);
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    fullscreen.title = 'Use a opção Tela cheia do navegador (F11 no Windows)';
  }
}

previous.addEventListener('click', () => show(index - 1));
next.addEventListener('click', () => show(index + 1));
jump.addEventListener('change', () => show(Number(jump.value)));
fullscreen.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  const label = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia';
  fullscreen.setAttribute('aria-label', label);
  fullscreen.title = `${label} (F)`;
});
if (!document.fullscreenEnabled) fullscreen.hidden = true;
window.addEventListener('hashchange', openFromHash);
document.addEventListener('visibilitychange', () => {
  if (integrated && document.hidden && running) stopRun();
  if (integrated) syncCompleteLab();
  lastFrame = null;
  requestFrame();
});
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
  if (event.target.closest?.('input, select, textarea, [contenteditable]')) return;
  const key = event.key;
  if (key === 'ArrowLeft' || key === 'PageUp') show(index - 1);
  else if (key === 'ArrowRight' || key === 'PageDown') show(index + 1);
  else if (key === 'Home') show(0);
  else if (key === 'End') show(slides.length - 1);
  else if (key.toLowerCase() === 'f' && !fullscreen.hidden) toggleFullscreen();
  else return;
  event.preventDefault();
});

if (integrated) {
  byId('lab-heading').hidden = false;
  byId('dashboard-pane').hidden = false;
  byId('dashboard-modes').hidden = false;
  byId('free-demo-link').hidden = false;
  byId('free-params-link').hidden = false;
  byId('speed').value = '1';
  byId('speed').disabled = true;
  byId('speed').title = 'O ensaio conectado acompanha o relógio do painel.';
  const labFrame = byId('complete-lab-frame');
  const panelFrame = byId('dashboard-frame');
  const experimentsFrame = byId('experiments-frame');
  labFrame.addEventListener('load', syncCompleteLab);
  byId('quick-lab').addEventListener('click', () => selectLab(false));
  byId('complete-lab').addEventListener('click', () => selectLab(true));
  byId('monitor-tab').addEventListener('click', () => selectDashboard('monitor'));
  byId('experiments-tab').addEventListener('click', () => selectDashboard('experiments'));
  byId('residences-tab').addEventListener('click', () => selectDashboard('residences'));
  byId('residence-follow-lab').addEventListener('click', () => {
    if (residence.followingLab) residence.stopFollowingLab();
    else updateResidenceFromLab();
  });
  byId('panel-layout').addEventListener('click', event => {
    fullPanel = !fullPanel;
    event.currentTarget.setAttribute('aria-pressed', String(fullPanel));
    write(event.currentTarget, fullPanel ? 'Interface compacta' : 'Interface completa');
    panelFrame.contentWindow?.postMessage({ type: 'floodsystem:panel-layout', compact: !fullPanel }, location.origin);
  });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    const { type, device, view } = event.data ?? {};
    if (event.source === labFrame.contentWindow && type === 'floodsystem:device' && /^laboratorio-3d-[a-f0-9]{12}$/.test(device)) {
      completeDevice = device;
      if (completeLab) showDevice(device);
    } else if (features?.ensaios_publicados && event.source === panelFrame.contentWindow && type === 'floodsystem:show-experiments') {
      selectDashboard('experiments');
    } else if (event.source === experimentsFrame.contentWindow && type === 'floodsystem:show-monitor') {
      selectDashboard('monitor');
      if (view === 'live' || view === 'history') showDevice(dashboardDevice, view);
    }
  });
}
updateControls();
run.addEventListener('click', async () => {
  if (running) { stopRun(); return; }
  if (integrated) {
    if (!telemetry) await connectPanel();
    if (!demo() || document.hidden || !telemetry || telemetry.failed) return;
  }
  running = true;
  lastFrame = null;
  updateReadouts();
  requestFrame();
});
for (const button of resets) {
  button.addEventListener('click', () => {
    state = createState(settings);
    stopRun();
    if (integrated) {
      telemetry?.close();
      telemetry = undefined;
      timeline = undefined;
      void connectPanel();
    }
    requestFrame();
  });
}
byId('return-to-demo').addEventListener('click', () => show(slides.findIndex(slide => slide.id === 'demonstracao')));
byId('params').addEventListener('submit', event => event.preventDefault());

const rainInput = byId('rain');
const rainPresets = Array.from(document.querySelectorAll('[data-quick-rain]'));
function setRain(value) {
  settings.rain = value;
  const formatted = `${number(value)} mm/h`;
  rainInput.value = String(value);
  rainInput.setAttribute('aria-valuetext', formatted);
  write(byId('rain-value'), formatted);
  write(byId('applied-rain'), `Chuva aplicada · ${formatted}`);
  for (const preset of rainPresets) {
    preset.setAttribute('aria-pressed', String(Number(preset.dataset.quickRain) === value));
  }
}
rainInput.addEventListener('input', () => setRain(rainInput.valueAsNumber));
for (const preset of rainPresets) preset.addEventListener('click', () => setRain(Number(preset.dataset.quickRain)));
setRain(settings.rain);

for (const id of ['leftValve', 'rightValve']) {
  const input = byId(id);
  const result = byId(`${id}-value`);
  input.addEventListener('input', () => {
    settings[id] = input.valueAsNumber;
    const formatted = `${number(settings[id])}%`;
    input.setAttribute('aria-valuetext', formatted);
    write(result, formatted);
  });
  input.setAttribute('aria-valuetext', result.textContent);
}
const initialLevel = byId('initialLevel');
initialLevel.max = String(Math.floor(leftSafetyLevel));
initialLevel.addEventListener('change', () => {
  settings.initialLevel = Math.min(Number(initialLevel.max), Math.max(0, initialLevel.valueAsNumber || 0));
  initialLevel.value = String(settings.initialLevel);
});
byId('speed').addEventListener('change', event => { settings.speed = Number(event.target.value); });
const cameraButtons = Array.from(document.querySelectorAll('[data-view]'));
for (const button of cameraButtons) {
  button.addEventListener('click', () => {
    model?.setView(button.dataset.view);
    for (const item of cameraButtons) item.setAttribute('aria-pressed', String(item === button));
    byId('camera-options').open = false;
  });
}
for (const button of document.querySelectorAll('[data-overlay]')) {
  button.addEventListener('click', () => {
    const active = button.getAttribute('aria-pressed') !== 'true';
    model?.[button.dataset.overlay](active);
    button.setAttribute('aria-pressed', String(active));
  });
}

openFromHash();
