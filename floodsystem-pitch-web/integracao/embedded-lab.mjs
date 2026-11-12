import { advance, readings } from './physics.mjs';
import { connectLabTelemetry, createTelemetryClock } from './lab-telemetry.mjs';

const status = document.getElementById('integration-status');
let active = false;
let session;
let timeline;
let scenario;
let version = 0;
let connecting = false;
let problem = '';
let wasPaused = true;

function report(message) {
  if (status.textContent !== message) status.textContent = message;
}

function disconnect() {
  version++;
  connecting = false;
  problem = '';
  session?.close();
  session = undefined;
  timeline = undefined;
}

function announceDevice() {
  if (session) parent.postMessage({ type: 'floodsystem:device', device: session.profile.device_id }, location.origin);
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'floodsystem:active') return;
  active = event.data.active === true;
  if (!active) timeline?.pause();
  else announceDevice();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) timeline?.pause(); });

export function labVisible() {
  return active && !document.hidden;
}

export function regionalMode() {
  timeline?.pause();
  report('Cenário regional · consulte a origem das leituras nesta tela.');
}

export function advanceLab(state, settings, paused, now, wallDt) {
  if (scenario !== state) {
    scenario = state;
    disconnect();
  }
  if (!paused && wasPaused && !session) problem = '';
  wasPaused = paused;
  if (settings.speed !== 1) {
    if (session || connecting || problem) disconnect();
    report('Ensaio acelerado · o painel mantém o último ensaio conectado.');
    if (!paused) advance(state, settings, wallDt * settings.speed);
    return;
  }
  if (paused) {
    timeline?.pause();
  }
  if (problem) return;
  if (timeline) {
    if (paused) report('Painel conectado · ensaio pausado.');
    else timeline.tick(state, settings, now);
    return;
  }
  if (connecting) return;

  connecting = true;
  report('Preparando o dispositivo simulado…');
  const current = version;
  const k = readings(state, settings).mmPerTip;
  void connectLabTelemetry((message, status) => {
    if (current !== version) return;
    if (status === 'error') problem = message;
    report(message);
  }, { k_mm_per_tip: k }).then(connection => {
    if (current !== version) { connection.close(); return; }
    session = connection;
    timeline = createTelemetryClock(session, advance, readings);
    announceDevice();
    report('Ensaio conectado · enviando ao painel em 1×.');
  }).catch(() => {
    if (current !== version) return;
    problem = 'Falha na conexão. Pause e continue para tentar novamente.';
    report(problem);
  }).finally(() => {
    if (current === version) connecting = false;
  });
}
