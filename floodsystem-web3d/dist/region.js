import { assessFlood, assessStation, replayStation, SIGNAL_LIMITS } from './risk.mjs';
import { advance, createState, DEFAULTS, SAMPLE_SECONDS, simulationAlert } from './physics.mjs';
import { advanceRainReplay, createRainReplay, rainStatistics, seekRainReplay } from './rain-playback.mjs';

const $ = id => document.getElementById(id);
const fmt = (n, digits = 1) => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: digits, maximumFractionDigits: digits
}).format(n);
const dated = new Intl.DateTimeFormat('pt-BR', {
  timeZone:'America/Sao_Paulo', dateStyle:'short', timeStyle:'short'
});
const shortDate = new Intl.DateTimeFormat('pt-BR', {
  timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'
});
const sgb = 'https://geoportal.sgb.gov.br/server/rest/services/gestaoterritorial/inundacao/MapServer/0/query';
const civil = 'https://www.defesacivil.rs.gov.br/avisos-e-boletins';
const bulletin = 'https://www.sgb.gov.br/w/bacia-do-rio-taquari-niveis-dos-rios-apresentam-elevacao-apos-chuvas-recentes-conforme-boletim-divulgado-pelo-sgb';
const bulletinTime = Date.parse('2026-11-05T06:00:00-03:00');
const cases = [
  {name:'Muçum, RS', station:'DCRS-00091', series:'mucum-20261105', official:'Alerta'},
  {name:'Encantado, RS', station:'DCRS-00082', series:'encantado-20261105', official:'Atenção'}
];
const stationBands = ['Normalidade', 'Atenção', 'Alerta', 'Inundação'];
const statusLabels = {
  unknown:'Dados insuficientes', normal:'Acompanhamento', observe:'Observe', watch:'Atenção',
  warning:'Alerta', alert:'Inundação na estação'
};
const actions = {
  unknown:'Consulte os avisos da Defesa Civil para sua área.',
  normal:'Acompanhe as atualizações se a chuva aumentar ou a água começar a subir.',
  observe:'Acompanhe os avisos locais e evite pontos que costumam alagar se a chuva continuar.',
  watch:'Confira os avisos da Defesa Civil e fique longe de rios, córregos e ruas alagadas.',
  warning:'Consulte os avisos da Defesa Civil da sua área. Evite ruas alagadas e siga as orientações locais.',
  alert:'Siga as orientações da Defesa Civil. Em perigo imediato, ligue 193.'
};
const reading = (value, unit, digits) => Number.isFinite(value) ? fmt(value, digits) + ' ' + unit : '—';
const isSignal = state => ['observe', 'watch', 'warning'].includes(state.severity);
const isFresh = station => assessStation(station, []).fresh;
const modelFresh = city => city.at <= Date.now() + 120_000 && Date.now() - city.at <= 45 * 60_000;
const stillSettings = {...DEFAULTS,rain:0};
const idleModel = {state:createState(stillSettings),settings:stillSettings,paused:true};

let stations = [], estimates = [], selection = '', mode = 'live';
let refreshing = false, lastAttempt = 0, networkAvailable = null, estimateAvailable = null;
let liveHistory = null, historyData = null, historyError = false, activeHistory = null;
let liveRun = null, replay = null, selectedCase = null, replayUi = 0, liveUi = 0;
let libraryReady = false, customRequest = 0;
try {
  const saved = localStorage.getItem('floodsystem.station');
  if (/^(DCRS-\d{5}|meteo-\d+)$/.test(saved ?? '')) selection = saved;
} catch {}

function setText(id, value) {
  const el = $(id);
  if (el.textContent !== value) el.textContent = value;
}

async function json(url, signal = AbortSignal.timeout(13_000)) {
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error('Fonte indisponível');
  return response.json();
}

const chosenStation = () => stations.find(station => station.id === selection);
const chosenEstimate = () => estimates.find(city => city.id === selection);
const wetStations = () => stations.filter(station => isFresh(station) && station.rain5 > 0)
  .sort((a,b) => b.rain5 - a.rain5);
const wetEstimates = () => estimates.filter(city => modelFresh(city) && city.rain > 0)
  .sort((a,b) => (b.rain / b.interval) - (a.rain / a.interval));
const cityName = city => city.name + ', ' + city.state;

function setOptionGroup(select, label, entries, name) {
  if (!entries.length) return;
  const group = document.createElement('optgroup');
  group.label = label;
  for (const entry of entries) group.append(new Option(name(entry),entry.id));
  select.append(group);
}

function renderOptions() {
  const select = $('station-select');
  const wet = wetStations(), projected = wetEstimates();
  const available = stations.filter(s => s.rain5 !== null || s.level !== null)
    .sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
  const other = available.filter(station => !wet.includes(station));
  if (!selection) {
    selection = (wet[0] ?? projected[0] ?? available.find(isFresh) ?? available[0])?.id || '';
  }
  select.replaceChildren();
  setOptionGroup(select, 'Chuva medida agora · Defesa Civil RS', wet, s => s.name + ' · ' + reading(s.rain5 * 12,'mm/h'));
  setOptionGroup(select, 'Estimativa de chuva · Open-Meteo', projected, c => cityName(c) + ' · ' + reading(c.rain * 3600 / c.interval,'mm/h'));
  setOptionGroup(select, 'Demais estações do RS', other, s => s.name + (isFresh(s) ? '' : ' · leitura atrasada'));
  const dryEstimate = chosenEstimate();
  if (dryEstimate && !projected.includes(dryEstimate)) select.add(new Option(cityName(dryEstimate) + ' · estimativa', selection));
  if (![...select.options].some(option => option.value === selection)) {
    select.add(new Option(selection ? 'Local selecionado · leitura indisponível' : 'Nenhum local disponível', selection));
  }
  select.value = selection;
  select.disabled = !available.length && !projected.length;

  const search = $('history-station'), previous = search.value;
  search.replaceChildren(new Option('Escolha a estação',''));
  for (const station of available) search.add(new Option(station.name,station.id));
  search.value = available.some(s => s.id === previous) ? previous : chosenStation()?.id || '';
  const buttons = [];
  for (const item of [...wet.map(s => ({...s, label:s.name, rate:s.rain5 * 12, type:'Medida'})),
    ...projected.map(c => ({...c, label:cityName(c), rate:c.rain * 3600 / c.interval, type:'Estimada'}))].slice(0,6)) {
    const button = document.createElement('button');
    button.className = 'rain-choice';
    button.type = 'button';
    button.setAttribute('aria-pressed', String(selection === item.id));
    const name = document.createElement('strong');
    name.textContent = item.label;
    const info = document.createElement('small');
    info.textContent = item.type + ' · ' + reading(item.rate, 'mm/h');
    button.append(name,info);
    button.addEventListener('click', () => chooseLive(item.id));
    buttons.push(button);
  }
  $('rain-choice-list').replaceChildren(...buttons);
  const measured = wet.length ? wet.length + ' com chuva medida no RS' : networkAvailable === false
    ? 'Rede do RS indisponível' : 'Sem chuva medida na última consulta ao RS';
  setText('rain-choices-label', measured + (projected.length ? ' · ' + projected.length + ' com chuva estimada' :
    estimateAvailable === false ? ' · estimativas indisponíveis' : ''));
}

function liveData(station, city) {
  if (station) return assessStation(station, liveHistory?.id === station.id ? liveHistory.blocks : []);
  if (city && modelFresh(city)) {
    const rainRate = city.rain * 3600 / city.interval;
    return {rainRate, at:city.at, fresh:true, ...assessFlood({rainRate})};
  }
  return assessFlood({});
}

function syncLiveRun(data, city) {
  if (!Number.isFinite(data.rainRate)) {
    if (liveRun) liveRun.available = false;
    return;
  }
  const seconds = city?.interval ?? 300;
  if (liveRun?.id === selection && liveRun.at === data.at) {
    liveRun.available = true;
    return;
  }
  const contiguous = liveRun?.id === selection && liveRun.at + seconds * 1000 === data.at &&
    liveRun.remaining <= 1e-9;
  const settings = {...DEFAULTS,rain:data.rainRate,speed:60};
  liveRun = {
    id:selection, at:data.at, settings, remaining:seconds, seconds, available:true,
    state:contiguous ? liveRun.state : createState(settings)
  };
}

function officialCard(value, note, url, label = 'Alerta oficial') {
  setText('official-weather-label', label);
  setText('official-weather-level', value);
  setText('official-weather-note', note);
  const link = $('official-weather-link');
  link.hidden = !url;
  if (url) link.href = url;
}

function updateModelNote() {
  if (mode === 'live') {
    const modelNote = !liveRun?.available ? 'O modelo aguarda uma leitura recente de chuva.'
      : liveRun.remaining > 1e-9
        ? 'No 3D · aplicando ' + reading(liveRun.settings.rain,'mm/h') + ' da última leitura em tempo acelerado.'
        : 'No 3D · última leitura aplicada. Aguardando a próxima atualização da fonte.';
    setText('weather-model-note', modelNote);
  } else if (replay) {
    const frame = replay.frames[replay.index];
    setText('weather-model-note', !frame ? 'Reprodução concluída.'
      : frame.missing ? 'Sem leitura de chuva neste trecho. O modelo retoma no próximo intervalo medido.'
      : 'No 3D · ' + reading(replay.settings.rain, 'mm/h') + ' neste trecho · tempo acelerado.');
  }
  const active = mode === 'live' ? liveRun?.available && liveRun : replay && !replay.frames[replay.index]?.missing && replay;
  const result = active ? simulationAlert(active.state,active.settings) : null;
  const label = result?.severity ?? 'unknown';
  const descriptions = {
    unknown:'Aguardando leitura para simular.', normal:'Sem aviso neste trecho.', observe:'A chuva pede atenção.',
    watch:'Água subindo rápido.', warning:'Chuva intensa e água subindo rápido.'
  };
  $('regional-prototype-alert').dataset.severity = label;
  setText('regional-prototype-message', descriptions[label]);
}

function message(data, official) {
  if (official === 3) return ['alert', 'A estação registrou inundação', 'A Defesa Civil informa que a estação atingiu a faixa de inundação.'];
  if (official === 2) return ['warning', 'Possível enchente na região', 'A estação atingiu a faixa de alerta da Defesa Civil.'];
  const signals = [
    data.intense && 'A chuva está intensa.',
    data.accumulated && 'Já choveu bastante na última hora.',
    data.rising && 'A água está subindo rapidamente.'
  ].filter(Boolean).join(' ');
  if (data.severity === 'warning') return ['warning', 'Sinais de possível enchente', signals];
  if (official === 1) return ['watch', 'Atenção ao nível da água', 'A estação atingiu a faixa de atenção da Defesa Civil.' + (signals ? ' ' + signals : '')];
  if (data.severity === 'watch') return ['watch', 'A água está subindo rápido', signals];
  if (data.severity === 'observe') {
    const title = data.intense ? 'Chuva intensa' : data.accumulated ? 'Chuva acumulada alta' : 'Acompanhe a chuva e o nível da água';
    return ['observe', title, signals || 'Os sinais de chuva e de subida estão se aproximando das faixas de aviso.'];
  }
  if (data.severity === 'normal') return ['normal', 'Sem sinais de alerta nesta leitura', 'Acompanhe as condições da estação ao longo do dia.'];
  return ['unknown', 'Risco ainda indeterminado', 'Faltam leituras recentes de chuva ou de nível da água para avaliar o risco.'];
}

function renderResident() {
  const live = mode === 'live';
  const station = live ? chosenStation() : null;
  const city = live ? chosenEstimate() : null;
  const sample = live ? null : replay?.blocks[replay.index - 1];
  const data = live ? liveData(station, city) : sample ?? assessFlood({});
  const official = live && data.fresh ? station?.risk : null;
  if (live) syncLiveRun(data, city);
  const [severity, title, reason] = message(data, official);
  $('resident-alert').dataset.severity = severity;
  setText('resident-status', statusLabels[severity]);
  setText('resident-title', !live && !sample ? 'Histórico começando' : title);
  setText('resident-reason', !live && !sample ? 'Os avisos aparecem conforme os blocos registrados são reproduzidos.' : reason);
  setText('action-label', live ? 'O que fazer agora' : 'Orientação no trecho reproduzido');
  setText('resident-action', !live && !sample ? 'Acompanhe a evolução da chuva e da água.' : actions[severity]);
  $('bulletins').hidden = !live;

  const overridden = official >= 1;
  const showScore = Number.isFinite(data.score) && !overridden;
  setText('risk-score', showScore ? data.score + '%' : overridden ? stationBands[official] : '—');
  setText('risk-margin', showScore ? (100 - data.score) + '%' : '—');
  $('risk-meter').hidden = !showScore;
  if (showScore) $('risk-meter').value = data.score;
  setText('score-note', overridden ? 'A faixa oficial da estação tem prioridade.'
    : showScore ? 'Percentuais da escala experimental da região.'
    : 'A avaliação precisa de chuva e da tendência da água.');

  const location = station ?? city;
  if (live) {
    const source = station ? station.name + ' · Defesa Civil RS'
      : city ? cityName(city) + ' · Open-Meteo, estimativa'
      : 'Selecione uma cidade ou estação';
    setText('region-status', (refreshing ? 'Atualizando · ' : '') + source +
      (location ? ' · ' + dated.format(data.at || location.at) : '') +
      (location && !data.fresh ? ' · leitura atrasada ou indisponível' : ''));
    officialCard(stationBands[official] ?? 'Sem classificação disponível',
      stationBands[official] ? 'Faixa informada pela Defesa Civil RS na última consulta.'
        : city ? 'A estimativa meteorológica só informa chuva para este local.'
        : 'Aguardando classificação recente da estação.', station ? civil : null);
  } else if (selectedCase) {
    const {entry, series, stats} = selectedCase;
    setText('region-status', entry.name + ' · ' + period(series) + ' · média ' + reading(stats?.average,'mm/h',2) +
      ' · total ' + reading(stats?.total,'mm') + ' · reprodução histórica');
    officialCard(entry.official ?? 'Boletim não localizado',
      entry.official ? 'Rio Taquari em ' + entry.name.replace(', RS','') + ' · referência 05/11/2026 às 06h.'
        : 'A série da estação traz chuva e nível. O alerta oficial histórico depende do boletim correspondente.',
      entry.official ? bulletin : null, 'Alerta oficial no período');
  }
  $('station-map').hidden = !location;
  if (location) {
    $('station-map').href = 'https://www.openstreetmap.org/?mlat=' + location.lat + '&mlon=' + location.lon +
      '#map=13/' + location.lat + '/' + location.lon;
  }
  const rate = data.rainRate;
  setText('resident-rain', !Number.isFinite(rate) ? 'Sem leitura neste trecho'
    : data.intense ? 'Chuva intensa' : rate > 0 ? (city ? 'Chuva estimada' : 'Chovendo') : 'Sem chuva');
  setText('resident-rain-note', Number.isFinite(rate)
    ? reading(rate,'mm/h',2) + (city ? ' · estimativa' : live ? ' · média em 5 min' : ' · média em 10 min')
    : 'Intensidade indisponível');
  const lastHour = Number.isFinite(data.rainHour);
  const total = lastHour ? data.rainHour : live && data.fresh ? station?.rain24 : null;
  setText('resident-total', reading(total,'mm'));
  setText('resident-total-note', lastHour ? 'Na última hora' : Number.isFinite(total) ? 'Nas últimas 24 horas' : 'Sem acumulado disponível');
  const rise = data.riseRate;
  setText('resident-water', !Number.isFinite(rise) ? 'Sem tendência'
    : data.rising ? 'Subindo rápido' : rise > .2 ? 'Subindo' : rise < -.2 ? 'Baixando' : 'Estável');
  setText('resident-water-note', city ? 'Nível da estação indisponível' : 'Tendência na estação');
  const level = sample?.level ?? (live && data.fresh ? station?.level : null);
  setText('technical-reading', 'Cota da estação ' + reading(level,'m',2) + ' · Variação ' + reading(rise,'mm/min',2) +
    ' · Sinal do detector ' + statusLabels[data.severity]);
  const runningModel = live ? liveRun : replay;
  if (runningModel) {
    const lab = simulationAlert(runningModel.state,runningModel.settings);
    setText('technical-replay','Entrada no protótipo ' + reading(runningModel.settings.rain,'mm/h',2) +
      ' · pulsos ' + runningModel.state.tips + ' · aviso do protótipo ' + statusLabels[lab.severity]);
  } else setText('technical-replay','');
  updateModelNote();
}

function period(series) {
  return shortDate.format(series.start) + ' até ' + shortDate.format(series.end);
}

function warningIndex() {
  const combined = replay.blocks.findIndex(block => block.severity === 'warning');
  return combined >= 0 ? combined : replay.blocks.findIndex(isSignal);
}

function renderReplay() {
  const ready = mode === 'replay' && Boolean(replay);
  $('replay-panel').hidden = !ready;
  $('resident-message').setAttribute('aria-live', ready && replay.playing ? 'off' : 'polite');
  if (!ready) return;
  const finished = replay.index >= replay.blocks.length;
  const time = replay.series.start + (replay.index * SAMPLE_SECONDS + replay.elapsed) * 1000;
  const clock = dated.format(time);
  setText('replay-time', clock + ' · ' + replay.index + '/' + replay.blocks.length + ' blocos');
  const slider = $('replay-position');
  slider.max = replay.blocks.length;
  slider.value = replay.index;
  slider.disabled = !replay.blocks.length;
  slider.setAttribute('aria-valuetext', clock);
  $('replay-play').disabled = !replay.blocks.length;
  $('replay-next').disabled = finished;
  $('replay-wet').disabled = !replay.blocks.some(block => block.rain > 0);
  $('replay-warning').disabled = warningIndex() < 0;
  setText('replay-play', replay.playing ? 'Pausar' : finished ? 'Recomeçar' : 'Reproduzir');
  const first = replay.blocks.slice(0,replay.index).find(isSignal);
  setText('replay-first', first ? 'Primeiro aviso em ' + shortDate.format(first.at) : 'Sem aviso até este ponto');
}

function render() {
  const live = mode === 'live';
  $('weather-toolbar').dataset.mode = mode;
  $('live-location').hidden = $('refresh-region').hidden = $('rain-choices').hidden = !live;
  $('rain-library').hidden = live || Boolean(replay);
  $('weather-detail').hidden = !live && !replay;
  for (const button of document.querySelectorAll('[data-region-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.regionMode === mode));
  }
  renderReplay();
  if (!$('weather-detail').hidden) renderResident();
}

function useHistory(series) {
  historyData = series;
  historyError = false;
  renderHistory();
}

function chooseLive(id) {
  if (selection !== id) liveRun = null;
  selection = id;
  try { localStorage.setItem('floodsystem.station',id); } catch {}
  renderOptions();
  render();
  loadLiveHistory(chosenStation()?.id);
}

async function loadLiveHistory(id, force = false) {
  if (id && liveHistory?.id === id && !force) {
    if (liveHistory.series) useHistory(liveHistory.series);
    return;
  }
  liveHistory?.controller.abort();
  liveHistory = null;
  historyError = false;
  if (!id) {
    activeHistory = null;
    useHistory(null);
    return;
  }
  const job = {id,controller:new AbortController(),blocks:[]};
  liveHistory = activeHistory = job;
  if (historyData?.station === id && mode === 'live') job.blocks = replayStation(historyData.points);
  else useHistory(null);
  try {
    const signal = AbortSignal.any([job.controller.signal, AbortSignal.timeout(13_000)]);
    const series = await json('/api/hidro?station=' + encodeURIComponent(id),signal);
    if (liveHistory !== job) return;
    job.series = series;
    job.blocks = replayStation(series.points);
    if (mode === 'live') useHistory(series);
  } catch {
    if (liveHistory !== job) return;
    if (mode === 'live') {
      historyError = true;
      renderHistory();
    }
  }
  if (mode === 'live') render();
}

async function refresh() {
  if (refreshing) return;
  lastAttempt = Date.now();
  refreshing = true;
  $('refresh-region').disabled = true;
  render();
  const [measured, forecast] = await Promise.allSettled([json('/api/hidro'),json('/api/hidro?source=weather')]);
  networkAvailable = measured.status === 'fulfilled';
  estimateAvailable = forecast.status === 'fulfilled';
  if (networkAvailable) stations = measured.value.stations;
  if (estimateAvailable) estimates = forecast.value.observations ?? forecast.value.wet ?? [];
  refreshing = false;
  $('refresh-region').disabled = false;
  renderOptions();
  render();
  if (mode === 'live') loadLiveHistory(chosenStation()?.id,true);
}

function caseCard(entry, series) {
  const article = document.createElement('article');
  article.className = 'rain-case';
  const title = document.createElement('h3');
  title.textContent = entry.name;
  const dates = document.createElement('p');
  dates.textContent = series ? period(series) : 'Buscando série medida…';
  const stats = series ? rainStatistics(series) : null;
  const summary = document.createElement('p');
  summary.className = 'rain-case-statistics';
  summary.textContent = stats ? reading(stats.average,'mm/h',2) + ' em média · ' +
    reading(stats.total,'mm') + ' acumulados' : 'Média e acumulado indisponíveis';
  const detail = document.createElement('p');
  detail.textContent = stats ? 'Maior média em 10 min ' + reading(stats.peak,'mm/h') +
    ' · ' + reading(stats.hours,'h') + ' com leitura' : '';
  const official = document.createElement('strong');
  official.className = 'rain-case-official';
  official.textContent = entry.official ? entry.official + ' no boletim do SGB' : 'Alerta oficial não localizado';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button';
  button.textContent = 'Reproduzir';
  button.setAttribute('aria-label','Reproduzir chuva de ' + entry.name);
  button.disabled = !stats;
  button.addEventListener('click', () => startCase(entry,series,stats));
  article.append(title,dates,summary,detail,official,button);
  if (entry.official) {
    const source = document.createElement('a');
    source.href = bulletin;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'Boletim de 05/11/2026 ↗';
    article.append(source);
  }
  return article;
}

function showLibrary() {
  if (replay) replay.playing = false;
  replay = null;
  selectedCase = null;
  customRequest++;
  setText('history-search-status','');
  render();
  if (libraryReady) return;
  libraryReady = true;
  const list = $('rain-cases');
  for (const entry of cases) {
    const card = caseCard(entry,null);
    list.append(card);
    json('./series/' + entry.series + '.json').then(series => {
      card.replaceWith(caseCard(entry,series));
    }).catch(() => {
      card.querySelector('p').textContent = 'Série temporariamente indisponível.';
    });
  }
}

function startCase(entry, series, stats) {
  if (!series.points.length || !stats) return;
  customRequest++;
  selectedCase = {entry,series,stats};
  replay = createRainReplay(series);
  replay.playing = true;
  replayUi = 0;
  activeHistory = null;
  useHistory(series);
  render();
  $('replay-play').focus({preventScroll:true});
}

$('replay-play').addEventListener('click', () => {
  if (!replay) return;
  if (replay.index >= replay.blocks.length) seekRainReplay(replay,0);
  replay.playing = !replay.playing;
  render();
});
function seek(index) {
  if (!replay) return;
  replay.playing = false;
  seekRainReplay(replay,index);
  render();
}
$('replay-next').addEventListener('click', () => seek(replay.index + 1));
$('replay-wet').addEventListener('click', () => {
  if (!replay) return;
  const index = replay.blocks.findIndex(block => block.rain > 0);
  if (index < 0) return;
  seekRainReplay(replay,index);
  replay.playing = true;
  render();
});
$('replay-warning').addEventListener('click', () => seek(warningIndex() + 1));
$('replay-position').addEventListener('input', event => seek(Number(event.target.value)));
$('back-to-rain-cases').addEventListener('click', showLibrary);
$('station-select').addEventListener('change', event => chooseLive(event.target.value));
$('refresh-region').addEventListener('click', refresh);

for (const button of document.querySelectorAll('[data-region-mode]')) {
  button.addEventListener('click', () => {
    mode = button.dataset.regionMode;
    if (mode === 'replay') showLibrary();
    else {
      if (replay) replay.playing = false;
      customRequest++;
      render();
      openRegion();
      loadLiveHistory(chosenStation()?.id);
    }
  });
}
const day = 86_400_000;
const brazilDate = (time = Date.now()) => new Date(time - 3 * 3_600_000).toISOString().slice(0,10);
$('history-date').max = brazilDate();
$('history-date').min = brazilDate(Date.now() - 86 * day);
$('history-search').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('history-station').value;
  const station = stations.find(s => s.id === id);
  if (!station) return;
  const date = $('history-date').value;
  const past = date && date < brazilDate();
  const end = past ? Date.parse(date + 'T00:00:00-03:00') + day : null;
  const request = ++customRequest;
  setText('history-search-status','Buscando as 48 horas de chuva…');
  try {
    const series = await json('/api/hidro?station=' + encodeURIComponent(id) + (end ? '&end=' + end : ''));
    if (customRequest !== request || mode !== 'replay') return;
    const stats = rainStatistics(series);
    if (!stats) {
      setText('history-search-status','A estação não retornou leituras de chuva nesse período.');
      return;
    }
    const knownBulletin = series.start <= bulletinTime && series.end >= bulletinTime
      ? cases.find(entry => entry.station === id) : null;
    $('rain-cases').append(caseCard(knownBulletin ?? {name:station.name},series));
    setText('history-search-status','Período adicionado à lista.');
  } catch {
    if (customRequest === request) setText('history-search-status','Histórico indisponível para o período.');
  }
});

setText('technical-limits','Limiar experimental de chuva ' + SIGNAL_LIMITS.rainRate + ' mm/h ou ' +
  SIGNAL_LIMITS.rainHour + ' mm em uma hora, com subida rápida a partir de ' +
  SIGNAL_LIMITS.riseRate + ' mm/min. O boletim oficial é uma referência separada.');

export function openRegion() {
  if (!lastAttempt || (mode === 'live' && Date.now() - lastAttempt >= 300_000)) refresh();
  else if (!refreshing) render();
}

export function closeRegion() {
  if (replay) replay.playing = false;
}

export function regionalFrame(wallSeconds) {
  if (mode === 'live') {
    if (!liveRun) return idleModel;
    const active = liveRun.available && liveRun.remaining > 1e-9;
    if (active) {
      const seconds = Math.min(liveRun.remaining,wallSeconds * liveRun.settings.speed);
      advance(liveRun.state,liveRun.settings,seconds);
      liveRun.remaining -= seconds;
      liveUi += wallSeconds;
      if (liveRun.remaining <= 1e-9 || liveUi >= .25) {
        liveUi = 0;
        updateModelNote();
      }
    }
    return {state:liveRun.state, settings:active ? liveRun.settings : stillSettings, paused:!active};
  }
  if (!replay) return null;
  const previous = replay.index;
  advanceRainReplay(replay,wallSeconds);
  replayUi += wallSeconds;
  if (previous !== replay.index || (replay.playing && replayUi >= .25)) {
    replayUi = 0;
    render();
  }
  const missing = replay.frames[replay.index]?.missing;
  return {state:replay.state,settings:replay.settings,paused:!replay.playing || missing};
}

setInterval(() => {
  if (!document.hidden && !$('weather-detail').closest('[data-screen]').hidden && mode === 'live') openRegion();
}, 30_000);

function svg(tag, attributes, label) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key,value] of Object.entries(attributes)) el.setAttribute(key, value);
  if (label) el.textContent = label;
  return el;
}

function renderHistory() {
  const points = historyData?.points || [];
  const level = points.filter(p => p.level !== null);
  const rain = points.filter(p => p.rain !== null);
  const plot = $('river-plot'), summary = $('river-summary');
  plot.hidden = !level.length && !rain.length;
  if (plot.hidden) {
    summary.textContent = historyError ? 'A série está indisponível. Tente atualizar.'
      : historyData ? 'Nenhuma leitura disponível no período.'
      : activeHistory ? 'Carregando série observada…' : 'Selecione uma estação para consultar a série.';
    return;
  }
  const chart = $('river-chart');
  const x = at => 50 + 610 * (at - historyData.start) / (historyData.end - historyData.start);
  const maxRain = Math.max(1, ...rain.map(p => p.rain));
  const levels = level.map(p => p.level);
  const lo = Math.min(...levels), hi = Math.max(...levels);
  const y = v => 111 - (v - lo) / Math.max(.05, hi - lo) * 38;
  chart.replaceChildren(
    svg('line', {x1:50, y1:47, x2:660, y2:47, class:'chart-grid'}),
    svg('line', {x1:50, y1:111, x2:660, y2:111, class:'chart-grid'}),
    svg('text', {x:44, y:14, 'text-anchor':'end'}, rain.length ? fmt(maxRain) : '—'),
    svg('text', {x:44, y:50, 'text-anchor':'end'}, rain.length ? '0' : '—'),
    svg('text', {x:44, y:76, 'text-anchor':'end'}, level.length ? fmt(hi, 2) : '—'),
    svg('text', {x:44, y:114, 'text-anchor':'end'}, level.length ? fmt(lo, 2) : '—'),
    svg('text', {x:50, y:129}, shortDate.format(historyData.start)),
    svg('text', {x:660, y:129, 'text-anchor':'end'}, shortDate.format(historyData.end))
  );
  for (const point of rain) {
    const h = 35 * point.rain / maxRain;
    if (h > 0) chart.append(svg('rect', {x:x(point.at)-1, y:47-h, width:2, height:h, class:'rain-bar'}));
  }
  let path = '', last = null;
  for (const point of level) {
    const pen = last !== null && point.at - last <= 600_000 ? 'L' : 'M';
    path += pen + x(point.at).toFixed(1) + ' ' + y(point.level).toFixed(1);
    last = point.at;
  }
  if (path) chart.append(svg('path', {d:path, class:'river-line'}));
  if (level.length === 1) chart.append(svg('circle', {cx:x(level[0].at),cy:y(level[0].level),r:3,class:'river-point'}));
  const descriptions = [];
  if (rain.length) descriptions.push(fmt(rain.reduce((sum, p) => sum + p.rain, 0)) + ' mm nos blocos com leitura');
  if (level.length) {
    const peak = level.find(p => p.level === hi);
    descriptions.push('pico de ' + fmt(hi, 2) + ' m em ' + shortDate.format(peak.at));
    if (level.length > 1) {
      const change = level.at(-1).level - level[0].level;
      descriptions.push('variação de ' + (change > 0 ? '+' : '') + fmt(change, 2) + ' m entre primeira e última leitura');
    }
  }
  const expected = (historyData.end - historyData.start) / 600_000;
  if (rain.length < expected - 1 || level.length < expected - 1) descriptions.push('série com lacunas');
  summary.textContent = descriptions.join(' · ') + '.';
}

$('property-form').addEventListener('submit', async event => {
  event.preventDefault();
  const result = $('property-result'), button = $('check-property');
  const coordinates = ['latitude','longitude'].map(id => {
    const value = $(id).value.trim().replace('−', '-').replace(',', '.');
    return /^[-+]?\d{1,3}(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  });
  const [lat, lon] = coordinates;
  result.dataset.severity = 'unknown';
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -34 || lat > 6 || lon < -74 || lon > -28) {
    result.textContent = 'Use coordenadas decimais no Brasil, como −29,1885 e −51,9210.';
    return;
  }
  result.textContent = 'Consultando o ponto no mapa do SGB…';
  button.disabled = true;
  try {
    const url = new URL(sgb);
    url.search = new URLSearchParams({
      f:'json', where:'1=1', geometry:lon + ',' + lat, geometryType:'esriGeometryPoint',
      inSR:'4326', spatialRel:'esriSpatialRelIntersects', outFields:'classe,municipio,ano', returnGeometry:'false'
    });
    const data = await json(url);
    if (data.error || !Array.isArray(data.features)) throw new Error('Mapa indisponível');
    const classes = ['Baixa', 'Média', 'Alta'];
    const index = Math.max(-1, ...data.features.map(f => classes.indexOf(f.attributes?.classe)));
    if (index < 0) {
      result.textContent = 'Sem classe de inundação no ponto consultado. A cobertura pode ser parcial. Consulte o mapa municipal.';
    } else {
      result.dataset.severity = ['normal','watch','warning'][index];
      result.textContent = 'Suscetibilidade ' + classes[index].toLowerCase() + ' no mapa do SGB. A classe descreve o terreno, sem estimar a chance do próximo evento.';
    }
  } catch {
    result.textContent = 'Mapa do SGB indisponível. Tente consultar novamente.';
  } finally {
    button.disabled = false;
  }
});

