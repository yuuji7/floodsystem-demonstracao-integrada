import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFlood, assessStation, replayStation } from '../dist/risk.mjs';
import { advanceRainReplay, createRainReplay, rainStatistics, seekRainReplay } from '../dist/rain-playback.mjs';
import { advance, createState, DEFAULTS, leftSafetyLevel, readings, replayPrototype, simulationAlert } from '../dist/physics.mjs';

const minute = 60_000;

test('600 mm/h gera aviso de chuva e subida quando a saída ainda está seca', () => {
  const p = {...DEFAULTS, rain:600};
  const s = createState(p);
  assert.equal(simulationAlert(s, p).severity, 'observe');
  advance(s, p, 60);
  assert.equal(simulationAlert(s, p).severity, 'warning');
  assert.ok(readings(s, p).level < leftSafetyLevel * .65);
  assert.equal(s.spillLeft, 0);
});

test('chuva isolada e subida isolada têm avisos diferentes', () => {
  assert.equal(assessFlood({rainRate:80, riseRate:0}).severity, 'observe');
  assert.equal(assessFlood({rainRate:0, riseRate:7}).severity, 'watch');
  assert.equal(assessFlood({rainRate:0, riseRate:null}).score, null);
});

test('ao vivo usa somente leituras passadas recentes e trata dados vencidos como insuficientes', () => {
  const t = 100 * minute;
  const station = {at:t-5*minute, rain5:4, rainHour:8, level:41};
  const blocks = [{at:t-20*minute, level:40.84}, {at:t, level:42}, {at:t+10*minute, level:45}];
  const current = assessStation(station, blocks, t);
  assert.equal(current.rainRate, 48);
  assert.equal(current.severity, 'warning');
  assert.equal(assessStation(station, blocks, t+30*minute).severity, 'unknown');
  assert.equal(assessStation(station, blocks, t-10*minute).score, null);
});

test('a reprodução só usa informações que já existiam e reconhece lacunas de chuva', () => {
  const points = [0,10,20,30,40,50,70].map((m,i) => ({
    at:m*minute, level:40+i*.08, rain:6, rainRate:36
  }));
  const replay = replayStation(points);
  assert.equal(replay[0].riseRate, null);
  assert.equal(replay[0].severity, 'observe');
  assert.equal(replay[1].severity, 'warning');
  assert.equal(replay[5].rainHour, 36);
  assert.equal(replay[6].rainHour, null);
  assert.deepEqual(replay.slice(0,3), replayStation(points.slice(0,3)));
});

test('a chuva medida entra no protótipo preservando o total do bloco e interrompendo a série em lacunas', () => {
  const replay = replayPrototype([{at:10*minute,rain:10},{at:20*minute,rain:null},{at:30*minute,rain:10}]);
  assert.equal(replay[0].rainRate, 60);
  assert.equal(replay[1], null);
  assert.deepEqual(replay[2], replay[0]);
});

test('a chuva do histórico entra no modelo em ordem e o avanço para um ponto reproduz o mesmo estado', () => {
  const series = {start:0, end:20*minute, points:[
    {at:0, rain:2, level:40},
    {at:10*minute, rain:1, level:40.1}
  ]};
  const player = createRainReplay(series);
  player.playing = true;
  advanceRainReplay(player,.5);
  assert.ok(Math.abs(player.state.rainTotal-1) < 1e-8);
  advanceRainReplay(player,1.5);
  assert.equal(player.index,2);
  assert.ok(Math.abs(player.state.rainTotal-3) < 1e-8);
  seekRainReplay(player,1);
  assert.ok(Math.abs(player.state.rainTotal-2) < 1e-8);
});

test('lacuna não é chuva zero e não reduz a média das horas medidas', () => {
  const series = {start:0, end:30*minute, points:[{at:0,rain:2},{at:20*minute,rain:4}]};
  const stats = rainStatistics(series);
  assert.equal(stats.average,18);
  assert.equal(stats.total,6);
  const player = createRainReplay(series);
  player.playing = true;
  advanceRainReplay(player,1.5);
  assert.equal(player.frames[player.index].missing,true);
  assert.ok(Math.abs(player.state.rainTotal-2) < 1e-8);
  advanceRainReplay(player,1.5);
  assert.equal(player.index,3);
  assert.ok(Math.abs(player.state.rainTotal-4) < 1e-8);
});
