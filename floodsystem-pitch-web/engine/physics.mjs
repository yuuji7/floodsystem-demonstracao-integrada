import { assessFlood, BLOCK_MINUTES } from './risk.mjs';

// Units: dimensions in mm, volumes in mL, elapsed simulation time in seconds.
export const GEOMETRY = Object.freeze({
  totalWidth: 300, totalHeight: 265.5, thickness: 5,
  left: {
    width: 130, depth: 96, height: 265.5, innerWidth: 120, innerDepth: 86,
    safetyOutlet: { width: 80, height: 5, centerY: 203 }
  },
  right: { width: 160, depth: 145, height: 168, lowerHeight: 97.5, innerWidth: 150, innerDepth: 135, maxWater: 45 },
  bucket: { length: 128, width: 82, height: 40 },
  hose: { innerDiameter: 4, inletOuterDiameter: 5.2, outletOuterDiameter: 6 }
});
export const areaCm2 = diameter => Math.PI * (diameter / 10) ** 2 / 4;
export const RAIN_PER_TIP_MM = 2.17;
export const tipVolumeForDiameter = diameter => areaCm2(diameter) * RAIN_PER_TIP_MM / 10;
const defaultDiameter = 95;
export const DEFAULTS = Object.freeze({
  rain:180, mode:'rain', directFlow:100, speed:30, diameter:defaultDiameter,
  tipVolume:tipVolumeForDiameter(defaultDiameter), leftValve:50, rightValve:100,
  leftReference:40, rightReference:160, initialLevel:40
});
export const leftMlPerMm = GEOMETRY.left.innerWidth * GEOMETRY.left.innerDepth / 1000;
export const rightMlPerMm = GEOMETRY.right.innerWidth * GEOMETRY.right.innerDepth / 1000;
const safetyOutlet = GEOMETRY.left.safetyOutlet;
export const leftSafetyLevel = safetyOutlet.centerY - safetyOutlet.height / 2 - GEOMETRY.thickness;
export const floodWatchLevel = leftSafetyLevel * 0.8;
export const RISK_BANDS = Object.freeze([
  { key: 'normal', label: 'Normal', fraction: 0 },
  { key: 'observe', label: 'Observação', fraction: 0.65 },
  { key: 'watch', label: 'Atenção', fraction: 0.8 },
  { key: 'warning', label: 'Alerta', fraction: 0.95 },
  { key: 'alert', label: 'Crítico', fraction: 1 }
]);
export const SAMPLE_SECONDS = 600;
export const MAX_HISTORY = 144;
export function inflow(p) { return p.mode === 'direct' ? Math.max(0, p.directFlow) : Math.max(0, p.rain) * areaCm2(p.diameter) / 600; }
export function outflow(heightMm, reference, referenceHeightMm, opening) { return heightMm <= 0 ? 0 : Math.max(0, reference) * Math.max(0, Math.min(100, opening)) / 100 * Math.sqrt(heightMm / referenceHeightMm); }
export function createState(p = DEFAULTS) {
  const initial = Math.min(leftSafetyLevel, Math.max(0, p.initialLevel)) * leftMlPerMm;
  return {
    time: 0, left: initial, initialLeft: initial, right: 0, cup: 0, tips: 0,
    side: -1, lastTip: null, interval: null, inputLeft: 0, inputRight: 0,
    outputLeft: 0, outputRight: 0, spillLeft: 0, spillRight: 0,
    safetyFlow: 0, riseRate: null, representedVolume: 0, rainTotal: 0,
    history: [], nextSample: SAMPLE_SECONDS
  };
}
export function step(s, p, dt, onTip) {
  if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(p.tipVolume) || p.tipVolume <= 0) throw new RangeError('Tempo e volume de basculada inválidos.');
  if (!dt) return s;
  const before = s.left;
  const incoming = inflow(p) * dt / 60;
  s.inputLeft += incoming; s.inputRight += incoming;
  s.left += incoming;
  const leftOut = Math.min(s.left, outflow(s.left / leftMlPerMm, p.leftReference, 100, p.leftValve) * dt / 60);
  s.left -= leftOut; s.outputLeft += leftOut;
  // Ideal overflow at the bottom of the opening. Keep this flow separate from the tap.
  const leftExcess = Math.max(0, s.left - leftSafetyLevel * leftMlPerMm);
  s.left -= leftExcess; s.spillLeft += leftExcess;
  s.safetyFlow = leftExcess * 60 / dt;
  s.riseRate = (s.left - before) / leftMlPerMm * 60 / dt;
  s.cup += incoming;
  const count = Math.floor((s.cup + 1e-10) / p.tipVolume);
  if (count > 0) {
    const tipped = count * p.tipVolume;
    s.cup = Math.max(0, s.cup - tipped);
    s.right += tipped; s.representedVolume += tipped;
    // Event times within the step are reconstructed assuming uniform inflow.
    const firstOffset = incoming > 0 ? Math.max(0, dt * (p.tipVolume - (s.cup + tipped - incoming)) / incoming) : dt;
    for (let i = 0; i < count; i++) {
      const eventTime = s.time + Math.min(dt, firstOffset + i * p.tipVolume * dt / incoming);
      s.interval = s.lastTip === null ? null : eventTime - s.lastTip;
      s.lastTip = eventTime;
      onTip?.(eventTime);
    }
    s.tips += count; if (count % 2) s.side *= -1;
  }
  const rightOut = Math.min(s.right, outflow(s.right / rightMlPerMm, p.rightReference, 20, p.rightValve) * dt / 60);
  s.right -= rightOut; s.outputRight += rightOut;
  const rightExcess = Math.max(0, s.right - GEOMETRY.right.maxWater * rightMlPerMm);
  s.right -= rightExcess; s.spillRight += rightExcess;
  s.rainTotal += (p.mode === 'rain' ? p.rain : inflow(p) * 600 / areaCm2(p.diameter)) * dt / 3600;
  s.time += dt;
  return s;
}
export function advance(s, p, seconds, onTip) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Duração inválida.');
  let remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(0.1, remaining, s.nextSample - s.time);
    step(s, p, dt, onTip);
    remaining -= dt;
    if (s.time >= s.nextSample - 1e-9) {
      s.time = s.nextSample;
      const r = readings(s, p);
      const previous = s.history.at(-1);
      s.history.push({
        time: s.time, level: r.level, basinLevel: r.basinLevel, status: r.floodStatus,
        early: simulationAlert(s, p).severity,
        rain: s.rainTotal - (previous?.rainTotal ?? 0), rainTotal: s.rainTotal,
        measured: r.rainMeasured - (previous?.measuredTotal ?? 0), measuredTotal: r.rainMeasured,
        tips: s.tips - (previous?.totalTips ?? 0), totalTips: s.tips,
        spill: s.spillLeft - (previous?.totalSpill ?? 0), totalSpill: s.spillLeft,
        basinSpill: s.spillRight - (previous?.totalBasinSpill ?? 0), totalBasinSpill: s.spillRight
      });
      if (s.history.length > MAX_HISTORY) s.history.shift();
      s.nextSample += SAMPLE_SECONDS;
    }
  }
  return s;
}
export function readings(s, p) {
  const area = areaCm2(p.diameter), level = s.left / leftMlPerMm, basinLevel = s.right / rightMlPerMm;
  const mmPerTip = p.tipVolume * 10 / area;
  const levelFraction = level / leftSafetyLevel;
  const floodStatus = RISK_BANDS.findLast(band => levelFraction + 1e-9 >= band.fraction).key;
  return {
    area, level, basinLevel, distance: 252.5 - level, input: inflow(p),
    leftOutput: outflow(level, p.leftReference, 100, p.leftValve),
    rightOutput: outflow(basinLevel, p.rightReference, 20, p.rightValve),
    safetyFlow: s.safetyFlow, floodStatus,
    mmPerTip, rainMeasured: s.representedVolume * 10 / area,
    pulseIntensity: s.interval > 0 ? mmPerTip * 3600 / s.interval : null,
    bucketFraction: Math.min(1, s.cup / p.tipVolume),
    levelFraction
  };
}

export function simulationAlert(s, p) {
  const rainRate = inflow(p) * 600 / areaCm2(p.diameter);
  return assessFlood({rainRate, riseRate:s.riseRate});
}

// Replay measured rain totals as uniform inflow within each known interval.
// A missing block breaks continuity rather than becoming a dry interval.
export function replayPrototype(blocks, settings = DEFAULTS) {
  const p = {...settings, mode:'rain'};
  let state = createState(p);
  let lastAt = null;
  return blocks.map(block => {
    if (lastAt !== null && block.at - lastAt !== BLOCK_MINUTES * 60_000) state = createState(p);
    lastAt = block.at;
    if (block.rain === null) {
      state = createState(p);
      return null;
    }
    p.rain = block.rain * 60 / BLOCK_MINUTES;
    advance(state, p, BLOCK_MINUTES * 60);
    return {level:readings(state,p).level, tips:state.tips, rainRate:p.rain, severity:simulationAlert(state,p).severity};
  });
}
