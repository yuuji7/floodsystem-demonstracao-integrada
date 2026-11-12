import { advance, createState, DEFAULTS, SAMPLE_SECONDS } from './physics.mjs';
import { replayStation } from './risk.mjs';

const blockMs = SAMPLE_SECONDS * 1000;
const known = value => Number.isFinite(value) && value >= 0;
const settings = rain => ({...DEFAULTS, rain, speed:600});
const copyState = state => ({...state, history:[]});

export function rainStatistics(series) {
  const rain = series.points.filter(point => known(point.rain));
  if (!rain.length) return null;
  const total = rain.reduce((sum, point) => sum + point.rain, 0);
  const hours = rain.length * SAMPLE_SECONDS / 3600;
  const peak = Math.max(...rain.map(point => point.rain * 3600 / SAMPLE_SECONDS));
  return {total, average:total / hours, peak, hours};
}

export function createRainReplay(series) {
  const byTime = new Map(series.points.map(point => [point.at, point]));
  const points = [];
  for (let at = series.start; at + blockMs <= series.end; at += blockMs) {
    const point = byTime.get(at);
    points.push(point
      ? {...point, rainRate:known(point.rain) ? point.rain * 3600 / SAMPLE_SECONDS : null}
      : {at,rain:null,rainRate:null,level:null});
  }
  const blocks = replayStation(points);
  let state = createState();
  let gap = false;
  const frames = blocks.map(block => {
    const missing = !known(block.rain);
    const input = settings(missing ? 0 : block.rain * 3600 / SAMPLE_SECONDS);
    if (missing) {
      gap = true;
      return {input, missing, before:{...copyState(state), lastTip:null, safetyFlow:0}};
    }
    if (gap) state = createState(input);
    gap = false;
    const before = copyState(state);
    advance(state, input, SAMPLE_SECONDS);
    return {input, missing, before};
  });
  const playback = {series, blocks, frames, final:copyState(state), playing:false};
  seekRainReplay(playback, 0);
  return playback;
}

export function seekRainReplay(playback, index) {
  playback.index = Math.max(0, Math.min(index, playback.frames.length));
  playback.elapsed = 0;
  const frame = playback.frames[playback.index];
  playback.state = copyState(frame?.before ?? playback.final);
  playback.settings = frame?.input ?? settings(0);
  if (!frame) playback.playing = false;
}

export function advanceRainReplay(playback, wallSeconds) {
  if (!playback.playing) return;
  let time = wallSeconds * 600;
  while (time > 1e-9 && playback.playing) {
    const frame = playback.frames[playback.index];
    const dt = Math.min(time, SAMPLE_SECONDS - playback.elapsed);
    if (!frame.missing) advance(playback.state, playback.settings, dt);
    playback.elapsed += dt;
    time -= dt;
    if (playback.elapsed >= SAMPLE_SECONDS - 1e-9) seekRainReplay(playback, playback.index + 1);
  }
}
